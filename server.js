import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';

let QRCode = null;
try {
  QRCode = (await import('qrcode')).default;
} catch (e) {}

import AudioManager from './lib/audio.js';
import WhatsAppClient from './lib/whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.join(__dirname, 'config.json');

// Cargar configuración
let config = {
  targetGroupName: '',
  targetGroupId: '',
  buttonMode: 'hold',
  minRecordDurationSeconds: 1.2,
  autoPlayNewMessages: false,
  port: 3000
};

if (fs.existsSync(configFile)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configFile, 'utf-8')) };
  } catch (e) {
    console.error('Error leyendo config.json:', e);
  }
}

function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

// Inicializar Administrador de Audio y WhatsApp
const audio = new AudioManager(config);
const whatsapp = new WhatsAppClient(config);

// Servidor Express y WebSockets
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.use('/audio-received', express.static(path.join(__dirname, 'data', 'received')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, ...payload });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// Eventos de WhatsApp
whatsapp.on('qr', async (qr) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
    broadcast('qr', { qr, qrDataUrl });
  } catch (e) {
    broadcast('qr', { qr });
  }
});

whatsapp.on('status', (status) => {
  broadcast('status', status);
});

whatsapp.on('ready', async (data) => {
  broadcast('ready', data);
  const groups = await whatsapp.getGroupsList();
  broadcast('groups', { groups });

  // Convertir audios pendientes a MP3 para óptima reproducción en navegadores
  try {
    if (await whatsapp.isFfmpegAvailable()) {
      await audio.ensureMp3Conversion(whatsapp.getFfmpegBinary());
    }
  } catch (e) {}
});

whatsapp.on('voice-message', async (data) => {
  console.log(`[Caja] 🔔 ¡Nuevo mensaje de ${data.sender}! Haciendo sonar campana...`);
  const audios = audio.getReceivedAudios();
  const unreadCount = audios.filter(a => !a.isRead).length;
  broadcast('new-message', { ...data, unreadCount });
  broadcast('unread-update', { unreadCount });

  // Reproducir campana mágica de nuevo mensaje
  await audio.playSoundEffect('ding');

  // Si está configurado para auto-reproducir inmediatamente
  if (config.autoPlayNewMessages) {
    setTimeout(async () => {
      await audio.playNextOrLast(false);
      const afterAudios = audio.getReceivedAudios();
      broadcast('unread-update', { unreadCount: afterAudios.filter(a => !a.isRead).length });
    }, 1200);
  }
});

// Eventos de Audio
audio.on('status', (status) => {
  broadcast('audio-status', status);
});

// Rutas de API REST
app.get('/api/status', async (req, res) => {
  const audios = audio.getReceivedAudios();
  let qrDataUrl = null;
  if (whatsapp.qrCode) {
    try {
      qrDataUrl = await QRCode.toDataURL(whatsapp.qrCode, { margin: 1, width: 300 });
    } catch (e) {}
  }
  const ffmpegAvailable = await whatsapp.isFfmpegAvailable();
  res.json({
    connected: whatsapp.isConnected,
    user: whatsapp.sock?.user || null,
    qr: whatsapp.qrCode,
    qrDataUrl,
    isRecording: audio.isRecording,
    isPlaying: audio.isPlaying,
    receivedCount: audios.length,
    unreadCount: audios.filter(a => !a.isRead).length,
    ffmpegAvailable,
    config
  });
});

app.get('/api/qr-image', async (req, res) => {
  if (!whatsapp.qrCode) {
    return res.status(404).send('No hay código QR disponible');
  }
  if (!QRCode) {
    return res.status(503).send('QRCode no instalado. Ejecuta npm install');
  }
  try {
    const buffer = await QRCode.toBuffer(whatsapp.qrCode, { margin: 1, width: 300 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.get('/api/groups', async (req, res) => {
  const groups = await whatsapp.getGroupsList();
  res.json(groups);
});

app.post('/api/config', (req, res) => {
  saveConfig(req.body);
  whatsapp.config = config;
  audio.config = config;
  broadcast('config-updated', { config });
  res.json({ success: true, config });
});

app.get('/api/audios', (req, res) => {
  res.json(audio.getReceivedAudios());
});

app.post('/api/audios/clear', (req, res) => {
  try {
    const deletedCount = audio.clearAudios();
    broadcast('unread-update', { unreadCount: 0 });
    res.json({ success: true, deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    console.log('[WhatsApp] Cierre de sesión solicitado desde la interfaz web');
    await whatsapp.logout();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BOTÓN 1: ESCUCHAR
app.post('/api/btn/listen', async (req, res) => {
  try {
    const isWeb = req.query.source === 'web' || req.body?.source === 'web';
    console.log(`[Botón] 🟢 Presionado: ESCUCHAR (Origen: ${isWeb ? 'Navegador Web' : 'Físico / Terminal'})`);
    // Si la llamada viene del navegador, el navegador se encargará de reproducir el audio con HTML5 Audio
    const played = await audio.playNextOrLast(isWeb);
    const audios = audio.getReceivedAudios();
    const unreadCount = audios.filter(a => !a.isRead).length;
    broadcast('unread-update', { unreadCount });
    res.json({ success: true, played, unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BOTÓN 2: GRABAR (Iniciar físico)
app.post('/api/btn/record/start', async (req, res) => {
  try {
    console.log('[Botón] 🔴 Presionado: INICIAR GRABACIÓN');
    await audio.startRecording();
    res.json({ success: true, recording: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BOTÓN 2: GRABAR (Detener y enviar físico)
app.post('/api/btn/record/stop', async (req, res) => {
  try {
    console.log('[Botón] ⚪ Soltado: DETENER Y ENVIAR');
    const recordedFile = await audio.stopRecording();

    if (recordedFile) {
      if (whatsapp.isConnected) {
        await whatsapp.sendVoiceNote(recordedFile);
        res.json({ success: true, sent: true });
      } else {
        console.warn('[Caja] WhatsApp no está conectado; audio guardado localmente.');
        res.json({ success: true, sent: false, reason: 'whatsapp-offline' });
      }
    } else {
      res.json({ success: true, sent: false, reason: 'too-short' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BOTÓN 2: MODO TOGGLE FÍSICO
app.post('/api/btn/record/toggle', async (req, res) => {
  try {
    if (audio.isRecording) {
      const recordedFile = await audio.stopRecording();
      if (recordedFile && whatsapp.isConnected) {
        await whatsapp.sendVoiceNote(recordedFile);
      }
      res.json({ success: true, recording: false, sent: !!recordedFile });
    } else {
      await audio.startRecording();
      res.json({ success: true, recording: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subir audio desde navegador web companion (Micrófono WebRTC)
app.post('/api/upload-voice', express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'Audio vacío' });
    }

    console.log(`[Caja] 🎙️ Recibido audio desde navegador (${req.body.length} bytes)`);
    const contentType = req.headers['content-type'] || '';
    let ext = '.webm';
    if (contentType.includes('ogg')) ext = '.ogg';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = '.mp4';
    else if (contentType.includes('wav')) ext = '.wav';

    const tempPath = path.join(__dirname, 'data', 'recordings', `web_${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, req.body);

    if (whatsapp.isConnected) {
      await whatsapp.sendVoiceNote(tempPath);
      // Suena el efecto de envío tras confirmación
      await audio.playSoundEffect('sent');
      console.log('✓ Audio enviado exitosamente a WhatsApp desde el navegador!');
      res.json({ success: true, sent: true });
    } else {
      console.warn('[Caja] WhatsApp no está conectado actualmente');
      res.status(503).json({ success: false, sent: false, error: 'WhatsApp no está conectado actualmente' });
    }
  } catch (err) {
    console.error('Error enviando audio desde web:', err.message);
    res.status(500).json({ success: false, sent: false, error: err.message });
  }
});

// Soporte de Teclado Interactivo en la Terminal (para pruebas en PC o Termux)
if (process.stdin.isTTY) {
  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    console.log('\n🎮 ATAJOS DE TECLADO EN TERMINAL ACTIVADOS:');
    console.log('  [E] -> Botón Verde: Escuchar último audio');
    console.log('  [G] / [Espacio] -> Botón Rojo: Grabar');
    console.log('  [Ctrl+C] -> Salir\n');

    process.stdin.on('keypress', async (str, key) => {
      if (key && key.ctrl && key.name === 'c') process.exit();

      if (key && key.name === 'e') {
        await audio.playNextOrLast(false);
      } else if (key && (key.name === 'g' || key.name === 'space')) {
        if (audio.isRecording) {
          const file = await audio.stopRecording();
          if (file && whatsapp.isConnected) {
            await whatsapp.sendVoiceNote(file);
          }
        } else {
          await audio.startRecording();
        }
      }
    });
  } catch (e) {
    console.warn('Modo TTY no disponible para atajos de terminal');
  }
}

// Iniciar servidor
const PORT = config.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`✨ CAJA MÁGICA DE VOCES INICIADA`);
  console.log(`📡 Panel de control y Companion: http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  // Conectar a WhatsApp
  whatsapp.initialize().catch(err => {
    console.error('[WhatsApp] Error al inicializar:', err);
  });
});
