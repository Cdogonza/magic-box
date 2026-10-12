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
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.join(__dirname, '..', 'auth_info_baileys');
const receivedDir = path.join(__dirname, '..', 'data', 'received');

if (!fs.existsSync(receivedDir)) {
  fs.mkdirSync(receivedDir, { recursive: true });
}

function getFfmpegBinary() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return 'ffmpeg';
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

            // Convertir a MP3 para garantizar reproducción completa sin cortes en cualquier reproductor
            try {
              const ffmpegBin = getFfmpegBinary();
              await execFileAsync(ffmpegBin, ['-y', '-i', oggPath, mp3Path]);
              console.log(`[WhatsApp] Audio guardado y convertido a MP3: ${mp3Path}`);
            } catch (convErr) {
              console.warn('[WhatsApp] Nota: No se pudo convertir a MP3 (usará OGG directo):', convErr.message);
            }

            this.emit('voice-message', {
              sender: senderName,
              timestamp,
              filePath: fs.existsSync(mp3Path) ? mp3Path : oggPath,
              filename: path.basename(fs.existsSync(mp3Path) ? mp3Path : oggPath),
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

    // Convertir el audio de entrada a Opus OGG para WhatsApp
    const opusOutputPath = path.join(__dirname, '..', 'data', `voice_${Date.now()}.ogg`);
    let finalBuffer;

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
      finalBuffer = fs.readFileSync(opusOutputPath);
    } catch (convErr) {
      console.warn('[WhatsApp] Conversión ffmpeg falló, enviando buffer directo:', convErr.message);
      finalBuffer = fs.readFileSync(inputPath);
    } finally {
      if (tempFileCreated && fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch (e) {}
      }
      if (fs.existsSync(opusOutputPath)) {
        try { fs.unlinkSync(opusOutputPath); } catch (e) {}
      }
    }

    console.log(`[WhatsApp] Enviando nota de voz (${finalBuffer.length} bytes) al grupo: ${jid}`);

    // ptt: true indica que es nota de voz nativa (micrófono verde de WhatsApp)
    const result = await this.sock.sendMessage(jid, {
      audio: finalBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    });

    console.log('[WhatsApp] ¡Nota de voz enviada con éxito al grupo familiar!');
    return result;
  }
}

export default WhatsAppClient;
