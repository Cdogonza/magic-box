import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateMessageID
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

function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return jid.replace(/:[0-9]+(?=@|$)/, '').trim().toLowerCase();
}

function getJidUser(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return jid.split('@')[0].replace(/:[0-9]+$/, '').trim().toLowerCase();
}

function isSameSender(senderJid, user) {
  if (!senderJid || !user) return false;

  const senderClean = cleanJid(senderJid);
  const senderUser = getJidUser(senderJid);

  const userTargets = [user.id, user.lid, user.jid].filter(Boolean);

  for (const target of userTargets) {
    const targetClean = cleanJid(target);
    const targetUser = getJidUser(target);

    if (senderClean && targetClean && senderClean === targetClean) return true;
    if (senderUser && targetUser && senderUser === targetUser) return true;

    const senderDigits = senderUser.replace(/\D/g, '');
    const targetDigits = targetUser.replace(/\D/g, '');
    if (senderDigits && targetDigits && senderDigits === targetDigits) return true;
  }

  return false;
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
    this.sentMessageIds = new Set();
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
        if (!msg.message) continue;

        // 1. Ignorar si Baileys lo marca como enviado por mí
        if (msg.key.fromMe) continue;

        // 2. Ignorar si el ID coincide con un mensaje enviado recientemente por la Caja
        if (this.sentMessageIds.has(msg.key.id)) {
          console.log(`[WhatsApp] 🛑 Ignorando eco de audio enviado por la propia Caja (ID: ${msg.key.id})`);
          continue;
        }

        // 3. Ignorar si el remitente coincide con el bot de la Caja (por LID o número de teléfono)
        const myUser = this.sock.user;
        const senderJid = msg.key.participant || msg.participant || msg.key.remoteJid;
        if (isSameSender(senderJid, myUser)) {
          console.log(`[WhatsApp] 🛑 Ignorando mensaje de voz propio de la Caja (Remitente: ${senderJid})`);
          continue;
        }

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');

        let matchesGroup = false;
        let matchedChannelIndex = 0;
        let matchedChannelName = 'Familia';

        if (Array.isArray(this.config.channels) && this.config.channels.length > 0) {
          const chIdx = this.config.channels.findIndex(ch => ch.id && ch.id === jid);
          if (chIdx !== -1) {
            matchesGroup = true;
            matchedChannelIndex = chIdx;
            matchedChannelName = this.config.channels[chIdx].name || 'Familia';
          }
        }

        if (!matchesGroup) {
          const targetId = this.config.targetGroupId;
          const targetName = this.config.targetGroupName?.toLowerCase();
          if (targetId && jid === targetId) {
            matchesGroup = true;
            matchedChannelIndex = 0;
          } else if (targetName && isGroup) {
            const groupMeta = this.groupsCache.get(jid);
            if (groupMeta?.subject?.toLowerCase().includes(targetName)) {
              matchesGroup = true;
              matchedChannelIndex = 0;
            }
          } else if (!targetId && !targetName && (!this.config.channels || this.config.channels.every(c => !c.id))) {
            matchesGroup = isGroup;
            matchedChannelIndex = this.config.activeChannelIndex || 0;
          }
        }

        if (!matchesGroup) continue;

        // Comprobar si el mensaje es de voz / audio
        const audioMsg = msg.message.audioMessage;
        if (audioMsg) {
          const senderName = msg.pushName || msg.key.participant?.split('@')[0] || 'Familiar';
          console.log(`\n📥 [WhatsApp] ¡Nuevo audio recibido de: ${senderName} (Canal ${matchedChannelIndex}: ${matchedChannelName})!`);

          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }) }
            );

            const timestamp = Date.now();
            const safeSender = senderName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const oggPath = path.join(receivedDir, `${timestamp}_${safeSender}_ch${matchedChannelIndex}.ogg`);
            const mp3Path = path.join(receivedDir, `${timestamp}_${safeSender}_ch${matchedChannelIndex}.mp3`);

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
              jid,
              channelIndex: matchedChannelIndex,
              channelName: matchedChannelName
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
   * Prepara y transcodifica el audio a un formato compatible con WhatsApp (OGG Opus o MP4 AAC)
   */
  async prepareAudioForSending(inputPath) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`El archivo de audio no existe: ${inputPath}`);
    }

    const rawBuffer = fs.readFileSync(inputPath);
    // Si ya es un Ogg Opus válido con encabezado OggS
    if (isOggBuffer(rawBuffer)) {
      return {
        buffer: rawBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      };
    }

    const hasFfmpeg = await isFfmpegAvailable();
    if (!hasFfmpeg) {
      throw new Error('FFmpeg no está funcionando en Termux. En Termux ejecuta: pkg update -y && pkg upgrade -y && pkg install -y ffmpeg');
    }

    const ffmpegBin = getFfmpegBinary();
    const timestamp = Date.now();
    const opusPath = path.join(__dirname, '..', 'data', `voice_${timestamp}.ogg`);
    const aacPath = path.join(__dirname, '..', 'data', `voice_${timestamp}.m4a`);

    let lastError = null;

    // Intento 1: Ogg Opus con encoder libopus (estándar para notas de voz WhatsApp con mic verde)
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-ar', '48000',
        '-ac', '1',
        '-avoid_negative_ts', 'make_zero',
        opusPath
      ]);
      if (fs.existsSync(opusPath)) {
        const buf = fs.readFileSync(opusPath);
        if (buf.length > 300 && isOggBuffer(buf)) {
          return { buffer: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true };
        }
      }
    } catch (err1) {
      lastError = err1;
      console.warn('[WhatsApp] FFmpeg libopus falló, probando encoder opus nativo...', err1.message);
    } finally {
      if (fs.existsSync(opusPath)) { try { fs.unlinkSync(opusPath); } catch (e) {} }
    }

    // Intento 2: Ogg Opus con encoder opus nativo de FFmpeg
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'opus',
        '-b:a', '32k',
        '-ar', '48000',
        '-ac', '1',
        '-avoid_negative_ts', 'make_zero',
        opusPath
      ]);
      if (fs.existsSync(opusPath)) {
        const buf = fs.readFileSync(opusPath);
        if (buf.length > 300 && isOggBuffer(buf)) {
          return { buffer: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true };
        }
      }
    } catch (err2) {
      lastError = err2;
      console.warn('[WhatsApp] FFmpeg opus nativo falló, probando conversión a AAC/MP4...', err2.message);
    } finally {
      if (fs.existsSync(opusPath)) { try { fs.unlinkSync(opusPath); } catch (e) {} }
    }

    // Intento 3: Conversión a AAC MP4 (.m4a) compatible con WhatsApp
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ar', '44100',
        '-ac', '1',
        '-movflags', '+faststart',
        aacPath
      ]);
      if (fs.existsSync(aacPath)) {
        const buf = fs.readFileSync(aacPath);
        if (buf.length > 300) {
          return { buffer: buf, mimetype: 'audio/mp4', ptt: false };
        }
      }
    } catch (err3) {
      lastError = err3;
      console.error('[WhatsApp] FFmpeg AAC también falló:', err3.message);
    } finally {
      if (fs.existsSync(aacPath)) { try { fs.unlinkSync(aacPath); } catch (e) {} }
    }

    // NUNCA enviar WebM en crudo como MP4 porque WhatsApp mostrará "Este audio no está disponible"
    const details = lastError?.stderr ? ` (${lastError.stderr.slice(-200).trim()})` : ` (${lastError?.message || 'Error desconocido'})`;
    throw new Error(`Error en conversión de audio FFmpeg${details}. En Termux ejecuta: pkg update -y && pkg upgrade -y`);
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

    try {
      const prepared = await this.prepareAudioForSending(inputPath);

      // Generar y registrar el ID del mensaje ANTES de enviarlo para evitar cualquier eco en messages.upsert
      const messageId = generateMessageID();
      this.sentMessageIds.add(messageId);

      console.log(`[WhatsApp] 📤 Enviando nota de voz (${prepared.buffer.length} bytes, Mimetype: ${prepared.mimetype}, PTT: ${prepared.ptt}, ID: ${messageId}) al grupo: ${jid}`);

      // ptt: true indica que es nota de voz nativa (micrófono verde de WhatsApp)
      const result = await this.sock.sendMessage(jid, {
        audio: prepared.buffer,
        mimetype: prepared.mimetype,
        ptt: prepared.ptt
      }, { messageId });

      if (result?.key?.id) {
        this.sentMessageIds.add(result.key.id);
        if (this.sentMessageIds.size > 200) {
          const oldest = this.sentMessageIds.values().next().value;
          this.sentMessageIds.delete(oldest);
        }
      }

      console.log('[WhatsApp] ¡Nota de voz enviada con éxito al grupo familiar!');
      return result;
    } finally {
      if (tempFileCreated && fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch (e) {}
      }
    }
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
