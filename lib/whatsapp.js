import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.join(__dirname, '..', 'auth_info_baileys');
const receivedDir = path.join(__dirname, '..', 'data', 'received');

// Asegurar directorios
[authDir, receivedDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

let ffmpegStaticPath = null;
try {
  const mod = await import('ffmpeg-static');
  ffmpegStaticPath = mod.default || mod;
} catch (e) {
  // En Android Termux se usa el ffmpeg nativo de pkg install ffmpeg
}

function getFfmpegBinary() {
  if (ffmpegStaticPath && typeof ffmpegStaticPath === 'string' && fs.existsSync(ffmpegStaticPath)) {
    return ffmpegStaticPath;
  }
  return 'ffmpeg';
}

let ffmpegWorks = null;
let lastFfmpegCheck = 0;
async function isFfmpegAvailable(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && ffmpegWorks === true && (now - lastFfmpegCheck < 15000)) {
    return true;
  }
  if (!forceRefresh && ffmpegWorks === false && (now - lastFfmpegCheck < 4000)) {
    return false;
  }

  lastFfmpegCheck = now;
  try {
    const bin = getFfmpegBinary();
    await execFileAsync(bin, ['-version']);
    ffmpegWorks = true;
  } catch (e) {
    ffmpegWorks = false;
  }
  return ffmpegWorks;
}

function isOggBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  return buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x73;
}

class WhatsAppClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.sock = null;
    this.qrCode = null;
    this.isConnected = false;
    this.userJid = null;
    this.groupsCache = new Map();
  }

  async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.isConnected = false;
        console.log('\n======================================================');
        console.log('⚡ ESCANEA ESTE CÓDIGO QR CON WHATSAPP EN TU CELULAR:');
        console.log('======================================================\n');
        qrcode.generate(qr, { small: true });
        console.log('\n(También puedes verlo en la pantalla web en http://localhost:3000)\n');
        this.emit('qr', qr);
      }

      if (connection === 'close') {
        this.isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Conexión cerrada (${statusCode || 'desconocido'}). Reconectando: ${shouldReconnect}`);
        this.emit('status', { isConnected: false });

        if (shouldReconnect) {
          setTimeout(() => this.initialize(), 4000);
        } else {
          console.log('[WhatsApp] Sesión cerrada. Limpiando credenciales...');
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
          fs.mkdirSync(authDir, { recursive: true });
          setTimeout(() => this.initialize(), 2000);
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        this.userJid = this.sock.user?.id;
        console.log(`\n🎉 [WhatsApp] ¡CONECTADO CON ÉXITO COMO ${this.sock.user?.name || this.userJid}!`);
        this.emit('ready', { user: this.sock.user });
        this.emit('status', { isConnected: true, user: this.sock.user });

        // Cargar lista de grupos
        await this.refreshGroups();
      }
    });

    // Escuchar mensajes entrantes
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');

        const targetId = this.config.targetGroupId;
        const targetName = this.config.targetGroupName?.toLowerCase();

        let matchesGroup = false;
        if (targetId && jid === targetId) {
          matchesGroup = true;
        } else if (targetName && isGroup) {
          const groupMeta = this.groupsCache.get(jid);
          if (groupMeta?.subject?.toLowerCase().includes(targetName)) {
            matchesGroup = true;
          }
        } else if (!targetId && !targetName) {
          matchesGroup = isGroup;
        }

        if (!matchesGroup) continue;

        // Comprobar si el mensaje es de voz / audio
        const audioMsg = msg.message.audioMessage;
        if (audioMsg) {
          const senderName = msg.pushName || msg.key.participant?.split('@')[0] || 'Familiar';
          console.log(`\n📥 [WhatsApp] ¡Nuevo audio recibido de: ${senderName} en el grupo!`);

          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }) }
            );

            const timestamp = Date.now();
            const safeSender = senderName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const oggPath = path.join(receivedDir, `${timestamp}_${safeSender}.ogg`);
            const mp3Path = path.join(receivedDir, `${timestamp}_${safeSender}.mp3`);

            fs.writeFileSync(oggPath, buffer);

            // Intentar convertir a MP3 si ffmpeg está instalado y funciona
            let finalAudioPath = oggPath;
            const hasFfmpeg = await isFfmpegAvailable();

            if (hasFfmpeg) {
              try {
                const ffmpegBin = getFfmpegBinary();
                await execFileAsync(ffmpegBin, ['-y', '-i', oggPath, mp3Path]);
                if (fs.existsSync(mp3Path)) {
                  finalAudioPath = mp3Path;
                  console.log(`[WhatsApp] Audio guardado y convertido a MP3: ${mp3Path}`);
                }
              } catch (convErr) {
                finalAudioPath = oggPath;
              }
            } else {
              console.log(`[WhatsApp] Audio guardado en OGG nativo: ${oggPath}`);
            }

            this.emit('voice-message', {
              sender: senderName,
              timestamp,
              filePath: finalAudioPath,
              filename: path.basename(finalAudioPath),
              jid
            });
          } catch (err) {
            console.error('[WhatsApp] Error descargando audio:', err.message);
          }
        }
      }
    });
  }

  async refreshGroups() {
    if (!this.sock) return [];
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      this.groupsCache.clear();
      const list = [];
      for (const [id, meta] of Object.entries(groups)) {
        this.groupsCache.set(id, meta);
        list.push({ id, subject: meta.subject, size: meta.participants?.length });
      }
      return list;
    } catch (err) {
      console.warn('[WhatsApp] Error actualizando grupos:', err.message);
      return [];
    }
  }

  async logout() {
    console.log('[WhatsApp] Cerrando sesión y limpiando credenciales...');
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
      }
    } catch (e) {}
    this.isConnected = false;
    this.userJid = null;
    this.qrCode = null;
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    fs.mkdirSync(authDir, { recursive: true });
    this.emit('status', { isConnected: false });
    setTimeout(() => this.initialize(), 1500);
  }

  async getGroupsList() {
    if (this.groupsCache.size === 0) {
      return await this.refreshGroups();
    }
    return Array.from(this.groupsCache.values()).map(m => ({
      id: m.id,
      subject: m.subject,
      size: m.participants?.length
    }));
  }

  /**
   * Envía una nota de voz nativa al grupo
   */
  async sendVoiceNote(audioPathOrBuffer, customJid = null) {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp no está conectado');
    }

    const jid = customJid || this.config.targetGroupId;
    if (!jid) {
      throw new Error('No hay grupo de destino configurado (targetGroupId)');
    }

    let inputPath = null;
    let tempFileCreated = false;

    if (typeof audioPathOrBuffer === 'string') {
      inputPath = audioPathOrBuffer;
    } else {
      inputPath = path.join(__dirname, '..', 'data', `temp_raw_${Date.now()}.bin`);
      fs.writeFileSync(inputPath, audioPathOrBuffer);
      tempFileCreated = true;
    }

    let finalBuffer = null;
    const hasFfmpeg = await isFfmpegAvailable();

    if (hasFfmpeg) {
      const opusOutputPath = path.join(__dirname, '..', 'data', `voice_${Date.now()}.ogg`);
      try {
        const ffmpegBin = getFfmpegBinary();
        await execFileAsync(ffmpegBin, [
          '-y',
          '-i', inputPath,
          '-c:a', 'libopus',
          '-b:a', '32k',
          '-vbr', 'on',
          opusOutputPath
        ]);
        if (fs.existsSync(opusOutputPath)) {
          finalBuffer = fs.readFileSync(opusOutputPath);
        }
      } catch (convErr) {
        console.error('[WhatsApp] ❌ Error en conversión FFmpeg:', convErr.message);
      } finally {
        if (fs.existsSync(opusOutputPath)) {
          try { fs.unlinkSync(opusOutputPath); } catch (e) {}
        }
      }
    }

    if (!finalBuffer && fs.existsSync(inputPath)) {
      finalBuffer = fs.readFileSync(inputPath);
    }

    if (tempFileCreated && fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch (e) {}
    }

    if (!finalBuffer) {
      throw new Error('No se pudo generar el búfer de audio para enviar');
    }

    const isOgg = isOggBuffer(finalBuffer);
    if (!isOgg && !hasFfmpeg) {
      console.warn('[WhatsApp] ⚠️ FFmpeg no disponible en Termux para convertir a nota de voz Ogg PTT');
      throw new Error('FFmpeg no está disponible en Termux. Para enviar audios por WhatsApp ejecuta: pkg upgrade -y && pkg install -y ffmpeg');
    }

    console.log(`[WhatsApp] Enviando nota de voz (${finalBuffer.length} bytes, Ogg válido: ${isOgg}) al grupo: ${jid}`);

    // ptt: true indica que es nota de voz nativa (micrófono verde de WhatsApp)
    const result = await this.sock.sendMessage(jid, {
      audio: finalBuffer,
      mimetype: isOgg ? 'audio/ogg; codecs=opus' : 'audio/mp4',
      ptt: isOgg
    });

    console.log('[WhatsApp] ¡Nota de voz enviada con éxito al grupo familiar!');
    return result;
  }

  async isFfmpegAvailable(forceRefresh = false) {
    return await isFfmpegAvailable(forceRefresh);
  }

  getFfmpegBinary() {
    return getFfmpegBinary();
  }
}

export { isFfmpegAvailable, getFfmpegBinary, isOggBuffer };
export default WhatsAppClient;
