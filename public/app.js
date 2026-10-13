// Estado local
let state = {
  connected: false,
  isRecording: false,
  isPlaying: false,
  buttonMode: 'toggle', // 'hold' o 'toggle'
  config: {}
};

// Elementos DOM
const connectionBadge = document.getElementById('connectionBadge');
const connectionText = document.getElementById('connectionText');
const qrSection = document.getElementById('qrSection');
const qrImage = document.getElementById('qrImage');
const qrLoading = document.getElementById('qrLoading');
const statusBanner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusMessage = document.getElementById('statusMessage');

const btnListen = document.getElementById('btnListen');
const unreadBadgeText = document.getElementById('unreadBadgeText');
const listenEmoji = document.getElementById('listenEmoji');

const btnRecord = document.getElementById('btnRecord');
const recordEmoji = document.getElementById('recordEmoji');
const recordTitle = document.getElementById('recordTitle');
const recordSub = document.getElementById('recordSub');
const soundWaves = document.getElementById('soundWaves');

const audioList = document.getElementById('audioList');
const audioCountBadge = document.getElementById('audioCountBadge');

const btnSettings = document.getElementById('btnSettings');
const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const selectGroup = document.getElementById('selectGroup');
const buttonModeSelect = document.getElementById('buttonMode');
const autoPlayCheckbox = document.getElementById('autoPlayCheckbox');
const btnSaveConfig = document.getElementById('btnSaveConfig');

// Sonidos locales en el navegador
const webSounds = {
  ding: new Audio('/sounds/ding.wav'),
  beep: new Audio('/sounds/beep.wav'),
  sent: new Audio('/sounds/sent.wav'),
  empty: new Audio('/sounds/empty.wav')
};

// Reproductor HTML5 activo para audios de WhatsApp
let currentAudioPlayer = null;

// Grabación con micrófono del navegador
let mediaRecorder = null;
let audioChunks = [];
let recordStartTime = 0;
let micStream = null;

// WebSocket para actualización en tiempo real
let socket;
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}`);

  socket.onopen = () => {
    console.log('WebSocket conectado');
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSocketMessage(data);
    } catch (e) {
      console.error('Error parseando mensaje WS:', e);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket cerrado, reconectando en 3s...');
    setTimeout(connectWebSocket, 3000);
  };
}

function handleSocketMessage(msg) {
  switch (msg.type) {
    case 'qr':
      renderQR(msg.qr, msg.qrDataUrl);
      break;
    case 'ready':
      setConnected(true, msg.user);
      break;
    case 'status':
      if (msg.isConnected) {
        setConnected(true, msg.user);
      } else {
        setConnected(false);
      }
      break;
    case 'audio-status':
      if (msg.isRecording !== undefined && !mediaRecorder) setRecordingUI(msg.isRecording);
      if (msg.isPlaying !== undefined && !currentAudioPlayer) setPlayingUI(msg.isPlaying);
      break;
    case 'new-message':
      showStatus(`🔔 ¡Nuevo mensaje de ${msg.sender}!`, '🎉');
      webSounds.ding.play().catch(() => {});
      if (msg.unreadCount !== undefined) {
        updateGreenLight(msg.unreadCount);
      }
      loadAudios();
      break;
    case 'unread-update':
      if (msg.unreadCount !== undefined) {
        updateGreenLight(msg.unreadCount);
      }
      loadAudios();
      break;
    case 'groups':
      populateGroups(msg.groups);
      break;
    case 'config-updated':
      state.config = msg.config;
      applyConfigUI(msg.config);
      break;
  }
}

function renderQR(qrText, qrDataUrl = null) {
  qrSection.classList.remove('hidden');
  qrLoading.classList.add('hidden');
  if (qrImage) {
    qrImage.classList.remove('hidden');
    if (qrDataUrl) {
      qrImage.src = qrDataUrl;
    } else if (qrText && qrText.startsWith('data:image')) {
      qrImage.src = qrText;
    } else {
      qrImage.src = `/api/qr-image?t=${Date.now()}`;
    }
  }
}

function setConnected(connected, user = null) {
  state.connected = connected;
  if (connected) {
    connectionBadge.className = 'status-badge online';
    connectionText.textContent = user?.name ? `Conectado (${user.name})` : 'Conectado a WhatsApp';
    qrSection.classList.add('hidden');
    showStatus('Caja lista para escuchar y hablar', '✨');
  } else {
    connectionBadge.className = 'status-badge offline';
    connectionText.textContent = 'WhatsApp desconectado';
  }
}

function showStatus(text, icon = 'ℹ️') {
  statusMessage.textContent = text;
  statusIcon.textContent = icon;
}

// Control del estado de la LUZ VERDE (Botón Escuchar)
function updateGreenLight(unreadCount) {
  state.unreadCount = unreadCount;
  if (unreadCount > 0) {
    btnListen.classList.add('is-lit');
    if (listenEmoji) listenEmoji.textContent = '🔔';
    unreadBadgeText.textContent = `${unreadCount} nuevo(s) por escuchar`;
  } else {
    btnListen.classList.remove('is-lit');
    if (listenEmoji) listenEmoji.textContent = '👂';
    unreadBadgeText.textContent = 'Buzón al día • Sin audios';
  }
}

// Control del estado de la LUZ ROJA (Botón Hablar)
function setRecordingUI(isRecording) {
  state.isRecording = isRecording;
  if (isRecording) {
    btnRecord.classList.add('is-lit', 'recording');
    recordTitle.textContent = 'GRABANDO...';
    recordSub.textContent = state.buttonMode === 'hold' ? 'Suelta para enviar' : 'Toca para enviar';
    recordEmoji.textContent = '🔴';
    soundWaves.classList.remove('hidden');
    showStatus('¡Luz roja encendida! Grabando tu voz...', '🎙️');
  } else {
    btnRecord.classList.remove('is-lit', 'recording');
    recordTitle.textContent = 'HABLAR';
    recordSub.textContent = state.buttonMode === 'hold' ? 'Mantén para hablar' : 'Toca para hablar';
    recordEmoji.textContent = '🎙️';
    soundWaves.classList.add('hidden');
  }
}

function setPlayingUI(isPlaying) {
  state.isPlaying = isPlaying;
  if (isPlaying) {
    btnListen.classList.add('pressed');
    showStatus('Reproduciendo mensaje de la familia...', '🔊');
  } else {
    btnListen.classList.remove('pressed');
    showStatus('Caja lista para jugar', '✨');
  }
}

// Cargar estado inicial desde API
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    setConnected(data.connected, data.user);
    if (!data.connected && (data.qr || data.qrDataUrl)) {
      renderQR(data.qr, data.qrDataUrl);
    }
    state.config = data.config || {};
    applyConfigUI(state.config);
    updateGreenLight(data.unreadCount || 0);
    setRecordingUI(data.isRecording || false);
    loadAudios();
    loadGroups();
  } catch (err) {
    console.error('Error cargando estado:', err);
  }
}

function applyConfigUI(cfg) {
  if (cfg.buttonMode) {
    state.buttonMode = cfg.buttonMode;
    buttonModeSelect.value = cfg.buttonMode;
    recordSub.textContent = cfg.buttonMode === 'hold' ? 'Mantén para hablar' : 'Toca para hablar';
  }
  if (cfg.targetGroupId) {
    selectGroup.value = cfg.targetGroupId;
  }
  if (cfg.autoPlayNewMessages !== undefined) {
    autoPlayCheckbox.checked = cfg.autoPlayNewMessages;
  }
}

async function loadGroups() {
  try {
    const res = await fetch('/api/groups');
    const groups = await res.json();
    populateGroups(groups);
  } catch (e) {}
}

function populateGroups(groups) {
  if (!Array.isArray(groups)) return;
  selectGroup.innerHTML = '<option value="">-- Selecciona el grupo familiar --</option>';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.subject} (${g.size || 0} participantes)`;
    selectGroup.appendChild(opt);
  });
  if (state.config.targetGroupId) {
    selectGroup.value = state.config.targetGroupId;
  }
}

async function loadAudios() {
  try {
    const res = await fetch('/api/audios');
    const audios = await res.json();
    audioCountBadge.textContent = `${audios.length} audios`;
    const unread = audios.filter(a => !a.isRead).length;
    updateGreenLight(unread);

    if (audios.length === 0) {
      audioList.innerHTML = '<div class="empty-inbox">No han llegado audios todavía. Los audios de la familia aparecerán aquí.</div>';
      return;
    }

    audioList.innerHTML = '';
    audios.slice().reverse().forEach(a => {
      const item = document.createElement('div');
      item.className = `audio-item ${a.isRead ? '' : 'unread'}`;
      const timeStr = new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const parts = a.filename.split('_');
      const sender = parts.length >= 2 ? parts[1].replace(/_read/, '').replace(/\.[^/.]+$/, '') : 'Familiar';

      item.innerHTML = `
        <div class="audio-info">
          <div class="audio-sender">🗣️ ${sender}</div>
          <div class="audio-time">${timeStr} • ${a.isRead ? 'Escuchado' : 'Nuevo'}</div>
        </div>
        <button class="btn-play-item" data-url="${a.url}">▶ Escuchar</button>
      `;

      item.querySelector('.btn-play-item').addEventListener('click', () => {
        playAudioFile(a.url);
      });

      audioList.appendChild(item);
    });
  } catch (e) {
    console.error('Error cargando audios:', e);
  }
}

// Reproducir audio completo sin cortes en el navegador
function playAudioFile(audioUrl) {
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer = null;
  }

  setPlayingUI(true);
  const audio = new Audio(audioUrl);
  currentAudioPlayer = audio;

  audio.onended = () => {
    setPlayingUI(false);
    currentAudioPlayer = null;
    loadAudios();
  };

  audio.onerror = (err) => {
    console.error('Error reproduciendo audio:', err);
    setPlayingUI(false);
    currentAudioPlayer = null;
  };

  audio.play().catch(e => {
    console.error('No se pudo reproducir:', e);
    setPlayingUI(false);
  });
}

// ==========================================
// ACCIÓN BOTÓN VERDE: ESCUCHAR
// ==========================================
btnListen.addEventListener('click', async () => {
  btnListen.classList.add('pressed');
  setTimeout(() => btnListen.classList.remove('pressed'), 200);

  try {
    const res = await fetch('/api/btn/listen?source=web', { method: 'POST' });
    const data = await res.json();

    if (data.played && data.played.url) {
      if (data.unreadCount !== undefined) {
        updateGreenLight(data.unreadCount);
      } else {
        loadAudios();
      }
      // Reproducir en el navegador de principio a fin sin cortes
      playAudioFile(data.played.url);
    } else {
      // Buzón vacío
      webSounds.empty.play().catch(() => {});
      showStatus('No hay mensajes nuevos en la caja', '📭');
    }
  } catch (e) {
    console.error('Error al escuchar:', e);
  }
});

// ==========================================
// ACCIÓN BOTÓN ROJO: GRABAR Y ENVIAR
// ==========================================
async function initMicrophone() {
  if (!micStream) {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  }
  return micStream;
}

async function startRecording() {
  if (state.isRecording) return;

  try {
    const stream = await initMicrophone();
    audioChunks = [];

    // Opciones de formato compatibles con el navegador
    let mimeType = 'audio/webm; codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else if (MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) mimeType = 'audio/ogg; codecs=opus';
      else mimeType = '';
    }

    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const duration = (Date.now() - recordStartTime) / 1000;
      setRecordingUI(false);

      if (duration < 1.0) {
        showStatus('Audio muy cortito, descartado', '⚠️');
        return;
      }

      showStatus('Enviando audio al grupo...', '🚀');
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

      try {
        const uploadRes = await fetch('/api/upload-voice', {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob
        });
        const uploadData = await uploadRes.json();

        if (uploadData.sent) {
          webSounds.sent.play().catch(() => {});
          showStatus('¡Audio enviado a la familia con éxito! 🎉', '✅');
        } else {
          showStatus('No se pudo enviar. Revisa la conexión de WhatsApp.', '❌');
        }
      } catch (err) {
        console.error('Error subiendo audio:', err);
        showStatus('Error de conexión al enviar audio', '❌');
      }
    };

    // Tono de inicio
    webSounds.beep.play().catch(() => {});
    recordStartTime = Date.now();
    mediaRecorder.start(200);
    setRecordingUI(true);

  } catch (err) {
    console.error('Permiso de micrófono denegado:', err);
    alert('Por favor permite el acceso al micrófono en el navegador para poder grabar.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function handleRecordTrigger() {
  if (state.buttonMode === 'toggle') {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  } else {
    startRecording();
  }
}

// Eventos de ratón / táctiles para el botón de hablar
btnRecord.addEventListener('mousedown', (e) => {
  if (e.button === 0) handleRecordTrigger();
});

btnRecord.addEventListener('mouseup', () => {
  if (state.buttonMode === 'hold') stopRecording();
});

btnRecord.addEventListener('mouseleave', () => {
  if (state.buttonMode === 'hold') stopRecording();
});

btnRecord.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleRecordTrigger();
});

btnRecord.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (state.buttonMode === 'hold') stopRecording();
});

// Atajos de teclado en el navegador
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.key.toLowerCase() === 'e' || e.key === 'Enter') {
    btnListen.click();
  } else if ((e.key.toLowerCase() === 'g' || e.code === 'Space') && !e.repeat) {
    handleRecordTrigger();
  }
});

window.addEventListener('keyup', (e) => {
  if (state.buttonMode === 'hold' && (e.key.toLowerCase() === 'g' || e.code === 'Space')) {
    stopRecording();
  }
});

// Clic derecho en cualquier parte = Escuchar
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  btnListen.click();
});

// Modal de Configuración
btnSettings.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

btnSaveConfig.addEventListener('click', async () => {
  const selectedGroupId = selectGroup.value;
  const selectedOpt = selectGroup.options[selectGroup.selectedIndex];
  const groupName = selectedOpt ? selectedOpt.textContent.split(' (')[0] : '';

  const newConfig = {
    targetGroupId: selectedGroupId,
    targetGroupName: groupName,
    buttonMode: buttonModeSelect.value,
    autoPlayNewMessages: autoPlayCheckbox.checked
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });
    if (res.ok) {
      settingsModal.classList.add('hidden');
      showStatus('Configuración guardada', '✅');
      state.buttonMode = buttonModeSelect.value;
    }
  } catch (e) {
    alert('Error guardando configuración');
  }
});

const btnRelink = document.getElementById('btnRelink');
if (btnRelink) {
  btnRelink.addEventListener('click', async () => {
    if (confirm('¿Quieres desvincular la sesión actual para escanear con un número nuevo?')) {
      settingsModal.classList.add('hidden');
      showStatus('Generando nuevo código QR...', '⏳');
      qrSection.classList.remove('hidden');
      qrLoading.classList.remove('hidden');
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (e) {
        console.error('Error al desvincular:', e);
      }
    }
  });
}

// Inicialización
connectWebSocket();
loadStatus();
