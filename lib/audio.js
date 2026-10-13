import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const soundsDir = path.join(rootDir, 'sounds');
const receivedDir = path.join(rootDir, 'data', 'received');
const recordingsDir = path.join(rootDir, 'data', 'recordings');

// Asegurar directorios
[receivedDir, recordingsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

class AudioManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.isPlaying = false;
    this.isRecording = false;
    this.currentPlayProcess = null;
    this.currentRecordProcess = null;
    this.recordingStartTime = null;
    this.currentRecordingFile = null;

    // Detectar comandos disponibles en el sistema (Termux, Linux, macOS)
    this.playerCmd = this.detectAudioPlayer();
    this.recorderCmd = this.detectAudioRecorder();

    console.log(`[Audio] Reproductor detectado: ${this.playerCmd?.name || 'Ninguno (usará Web Companion)'}`);
    console.log(`[Audio] Grabador detectado: ${this.recorderCmd?.name || 'Ninguno (usará Web Companion)'}`);
  }

  detectAudioPlayer() {
    const candidates = [
      { name: 'afplay', check: 'command -v afplay', play: (f) => ['afplay', [f]] },
      { name: 'mpv', check: 'command -v mpv', play: (f) => ['mpv', ['--no-video', '--really-quiet', f]] },
      { name: 'termux-media-player', check: 'command -v termux-media-player', play: (f) => ['termux-media-player', ['play', f]] },
      { name: 'ffplay', check: 'command -v ffplay', play: (f) => ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', f]] },
      { name: 'play (sox)', check: 'command -v play', play: (f) => ['play', ['-q', f]] },
      { name: 'aplay', check: 'command -v aplay', play: (f) => ['aplay', ['-q', f]] }
    ];

    for (const c of candidates) {
      try {
        execSync(c.check, { stdio: 'ignore' });
        return c;
      } catch (e) {}
    }
    return null;
  }

  detectAudioRecorder() {
    const candidates = [
      {
        name: 'termux-microphone-record',
        check: 'command -v termux-microphone-record',
        start: (outFile) => ['termux-microphone-record', ['-f', outFile, '-l', '0']],
        stop: () => ['termux-microphone-record', ['-q']]
      },
      {
        name: 'rec (sox)',
        check: 'command -v rec',
        start: (outFile) => ['rec', ['-q', '-c', '1', '-r', '16000', outFile]],
        stop: null
      },
      {
        name: 'arecord',
        check: 'command -v arecord',
        start: (outFile) => ['arecord', ['-q', '-f', 'cd', '-t', 'wav', outFile]],
        stop: null
      }
    ];

    for (const c of candidates) {
      try {
        execSync(c.check, { stdio: 'ignore' });
        return c;
      } catch (e) {}
    }
    return null;
  }

  /**
   * Reproduce un archivo de sonido local (WAV, MP3 u OGG)
   */
  async playFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.warn(`[Audio] Archivo no existe: ${filePath}`);
      return;
    }

    // Detener reproducción anterior si existe
    this.stopPlayback();

    this.isPlaying = true;
    this.emit('status', { isPlaying: true });

    return new Promise((resolve) => {
      if (this.playerCmd) {
        const [bin, args] = this.playerCmd.play(filePath);
        this.currentPlayProcess = spawn(bin, args);

        this.currentPlayProcess.on('close', () => {
          this.isPlaying = false;
          this.currentPlayProcess = null;
          this.emit('status', { isPlaying: false });
          resolve();
        });

        this.currentPlayProcess.on('error', (err) => {
          console.error(`[Audio] Error reproduciendo con ${bin}:`, err.message);
          this.isPlaying = false;
          this.currentPlayProcess = null;
          this.emit('status', { isPlaying: false });
          resolve();
        });
      } else {
        this.emit('play-web', { filePath });
        resolve();
      }
    });
  }

  stopPlayback() {
    if (this.currentPlayProcess) {
      try {
        this.currentPlayProcess.kill('SIGINT');
      } catch (e) {}
      this.currentPlayProcess = null;
    }
    if (this.playerCmd?.name === 'termux-media-player') {
      try {
        execSync('termux-media-player stop', { stdio: 'ignore' });
      } catch (e) {}
    }
    this.isPlaying = false;
    this.emit('status', { isPlaying: false });
  }

  // Reproducir efectos de sonido pregrabados
  async playSoundEffect(name) {
    const p = path.join(soundsDir, `${name}.wav`);
    await this.playFile(p);
  }

  /**
   * Convierte automáticamente cualquier archivo .ogg pendiente a .mp3
   */
  async ensureMp3Conversion(ffmpegBin = 'ffmpeg') {
    if (!fs.existsSync(receivedDir)) return;
    const allFiles = fs.readdirSync(receivedDir);
    const oggFiles = allFiles.filter(f => f.endsWith('.ogg'));

    for (const oggFile of oggFiles) {
      const oggPath = path.join(receivedDir, oggFile);
      const mp3File = oggFile.replace(/\.ogg$/, '.mp3');
      const mp3Path = path.join(receivedDir, mp3File);
      if (!fs.existsSync(mp3Path)) {
        try {
          const { promisify } = await import('node:util');
          const { execFile } = await import('node:child_process');
          const execFileAsync = promisify(execFile);
          await execFileAsync(ffmpegBin, ['-y', '-i', oggPath, mp3Path]);
          if (fs.existsSync(mp3Path)) {
            console.log(`[Audio] 🔄 Audio convertido a MP3: ${mp3File}`);
          }
        } catch (e) {
          // Si ffmpeg falla, se mantiene el .ogg original
        }
      }
    }
  }

  /**
   * Obtiene la lista de audios recibidos.
   * Si existe versión .mp3 y .ogg para el mismo audio, prioriza .mp3 para evitar problemas de códec en navegadores.
   */
  getReceivedAudios() {
    if (!fs.existsSync(receivedDir)) return [];
    const allFiles = fs.readdirSync(receivedDir);
    const audioFiles = allFiles.filter(f => f.endsWith('.ogg') || f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a'));

    // Agrupar por id/timestamp base para evitar duplicados si hay .mp3 y .ogg
    const groupMap = new Map();

    for (const file of audioFiles) {
      const fullPath = path.join(receivedDir, file);
      const stats = fs.statSync(fullPath);
      const isRead = file.includes('_read.');
      // Eliminar sufijo _read y la extensión para identificar el mensaje único
      const baseKey = file.replace(/_read\.[^.]+$/, '').replace(/\.[^.]+$/, '');

      const item = {
        filename: file,
        path: fullPath,
        url: `/audio-received/${file}`,
        timestamp: stats.mtimeMs,
        isRead,
        size: stats.size,
        ext: path.extname(file)
      };

      if (!groupMap.has(baseKey)) {
        groupMap.set(baseKey, item);
      } else {
        const existing = groupMap.get(baseKey);
        // Priorizar .mp3 sobre .ogg
        if (item.ext === '.mp3') {
          item.isRead = item.isRead || existing.isRead;
          groupMap.set(baseKey, item);
        } else if (existing.ext === '.mp3') {
          existing.isRead = existing.isRead || item.isRead;
        }
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Acción del botón "ESCUCHAR":
   * Reproduce el audio no leído más antiguo; si todos fueron leídos, repite el último.
   */
  async playNextOrLast(skipLocalSpeaker = false) {
    const audios = this.getReceivedAudios();
    if (audios.length === 0) {
      console.log('[Audio] No hay audios en el buzón.');
      if (!skipLocalSpeaker) await this.playSoundEffect('empty');
      return null;
    }

    const unread = audios.find(a => !a.isRead);
    const audioToPlay = unread || audios[audios.length - 1];

    console.log(`[Audio] Seleccionado para reproducir: ${audioToPlay.filename} (No leído: ${!audioToPlay.isRead})`);

    // Si el cliente web lo va a reproducir a través del navegador, evitamos reproducir doble en parlante local
    if (!skipLocalSpeaker) {
      await this.playFile(audioToPlay.path);
    }

    // Marcar como leído renombrando el archivo si no lo estaba
    if (!audioToPlay.isRead) {
      const ext = path.extname(audioToPlay.filename);
      const base = path.basename(audioToPlay.filename, ext);
      const newName = `${base}_read${ext}`;
      const newPath = path.join(receivedDir, newName);
      try {
        fs.renameSync(audioToPlay.path, newPath);
        audioToPlay.filename = newName;
        audioToPlay.path = newPath;
        audioToPlay.url = `/audio-received/${newName}`;
        audioToPlay.isRead = true;

        // Renombrar también el archivo gemelo (.ogg o .mp3) si existe
        const twinExt = ext === '.ogg' ? '.mp3' : (ext === '.mp3' ? '.ogg' : null);
        if (twinExt) {
          const twinPath = path.join(receivedDir, `${base}${twinExt}`);
          if (fs.existsSync(twinPath)) {
            try {
              fs.renameSync(twinPath, path.join(receivedDir, `${base}_read${twinExt}`));
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('[Audio] Error al marcar como leído:', e.message);
      }
    }

    return audioToPlay;
  }

  /**
   * Acción del botón físico "GRABAR": Iniciar grabación local si hay grabador
   */
  async startRecording() {
    if (this.isRecording) return;
    this.stopPlayback();

    await this.playSoundEffect('beep');

    const timestamp = Date.now();
    this.currentRecordingFile = path.join(recordingsDir, `kid_voice_${timestamp}.wav`);
    this.recordingStartTime = Date.now();
    this.isRecording = true;
    this.emit('status', { isRecording: true });

    if (this.recorderCmd) {
      const [bin, args] = this.recorderCmd.start(this.currentRecordingFile);
      this.currentRecordProcess = spawn(bin, args);
      this.currentRecordProcess.on('error', (err) => {
        console.error(`[Audio] Error iniciando grabador ${bin}:`, err.message);
        this.isRecording = false;
        this.emit('status', { isRecording: false });
      });
    } else {
      console.log('[Audio] Esperando audio del cliente Web Companion...');
    }
  }

  /**
   * Acción de soltar el botón "GRABAR": Detener grabación física
   */
  async stopRecording() {
    if (!this.isRecording) return null;

    const duration = (Date.now() - (this.recordingStartTime || Date.now())) / 1000;
    this.isRecording = false;
    this.emit('status', { isRecording: false });

    if (this.currentRecordProcess) {
      try {
        this.currentRecordProcess.kill('SIGINT');
      } catch (e) {}
      this.currentRecordProcess = null;
    }

    if (this.recorderCmd?.name === 'termux-microphone-record') {
      try {
        execSync('termux-microphone-record -q', { stdio: 'ignore' });
      } catch (e) {}
    }

    const recordedFile = this.currentRecordingFile;
    this.currentRecordingFile = null;

    const minSec = this.config.minRecordDurationSeconds || 1.2;
    if (duration < minSec || !recordedFile || !fs.existsSync(recordedFile)) {
      console.log(`[Audio] Grabación muy corta o vacía. Descartada.`);
      if (recordedFile && fs.existsSync(recordedFile)) {
        try { fs.unlinkSync(recordedFile); } catch (e) {}
      }
      return null;
    }

    console.log(`[Audio] Grabación física completada (${duration.toFixed(1)}s): ${recordedFile}`);
    await this.playSoundEffect('sent');
    return recordedFile;
  }

  /**
   * Vacía el buzón de audios recibidos
   */
  clearAudios() {
    this.stopPlayback();
    if (!fs.existsSync(receivedDir)) return 0;
    const files = fs.readdirSync(receivedDir);
    let count = 0;
    for (const f of files) {
      if (f === '.gitkeep') continue;
      try {
        fs.unlinkSync(path.join(receivedDir, f));
        count++;
      } catch (e) {}
    }
    console.log(`[Audio] 🧹 Buzón de audios vaciado (${count} archivos eliminados).`);
    return count;
  }
}

export default AudioManager;
