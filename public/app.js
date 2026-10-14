let state = {
  connected: false,
  isRecording: false,
  isPlaying: false,
  buttonMode: 'toggle', // 'hold' o 'toggle'
  config: {}
};

// ==========================================
// MÁQUINA DE ESTADOS Y RESILIENCIA (Anti-Saturación / Niños)
// ==========================================
const UIState = {
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  SENDING: 'SENDING',
  PLAYING: 'PLAYING'
};
let currentUIState = UIState.IDLE;
let lastActionTimestamp = 0;
let recordingWatchdogTimer = null;
let sendingWatchdogTimer = null;
let noseEmergencyTaps = [];

function isActionDebounced(cooldownMs = 280) {
  const now = Date.now();
  if (now - lastActionTimestamp < cooldownMs) return true;
  lastActionTimestamp = now;
  return false;
}

// Gesto de emergencia físico: 5 toques rápidos en la Nariz en < 2 segundos
function checkNoseEmergency() {
  const now = Date.now();
  noseEmergencyTaps = noseEmergencyTaps.filter(t => now - t < 2000);
  noseEmergencyTaps.push(now);
  if (noseEmergencyTaps.length >= 5) {
    noseEmergencyTaps = [];
    console.warn('[Watchdog] 🚨 Gesto de emergencia detectado en la Nariz. Reiniciando pantalla...');
    playPopSound();
    setTimeout(() => {
      window.location.reload(true);
    }, 350);
    return true;
  }
  return false;
}

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

// Elementos de la Cara (Nariz y Boca)
const btnNose = document.getElementById('btnNose');
const mouthCards = [
  document.getElementById('channelCard0'),
  document.getElementById('channelCard1'),
  document.getElementById('channelCard2')
];
const mouthAvatars = [
  document.getElementById('channelAvatar0'),
  document.getElementById('channelAvatar1'),
  document.getElementById('channelAvatar2')
];
const mouthNames = [
  document.getElementById('channelName0'),
  document.getElementById('channelName1'),
  document.getElementById('channelName2')
];
const mouthBadges = [
  document.getElementById('channelBadge0'),
  document.getElementById('channelBadge1'),
  document.getElementById('channelBadge2')
];

// Elementos de ranuras en Ajustes
const slotNames = [
  document.getElementById('slotName0'),
  document.getElementById('slotName1'),
  document.getElementById('slotName2')
];
const slotGroups = [
  document.getElementById('slotGroup0'),
  document.getElementById('slotGroup1'),
  document.getElementById('slotGroup2')
];
const slotPhotoInputs = [
  document.getElementById('slotPhotoInput0'),
  document.getElementById('slotPhotoInput1'),
  document.getElementById('slotPhotoInput2')
];
const slotPreviews = [
  document.getElementById('slotPreview0'),
  document.getElementById('slotPreview1'),
  document.getElementById('slotPreview2')
];

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
    case 'channel-switched':
      if (state.activeChannelIndex !== msg.activeChannelIndex) {
        state.activeChannelIndex = msg.activeChannelIndex;
        playPopSound();
        updateChannelsUI();
        updateBadgesAndGreenLightFromCache();
      }
      break;
    case 'new-message':
      showStatus(`🔔 ¡Nuevo mensaje de ${msg.sender}!`, '🎉');
      webSounds.ding.play().catch(() => {});
      if (typeof msg.channelIndex === 'number') {
        if (mouthBadges[msg.channelIndex]) mouthBadges[msg.channelIndex].classList.remove('hidden');
        if (mouthCards[msg.channelIndex]) mouthCards[msg.channelIndex].classList.add('has-unread');
        // Solo encender luz verde si el mensaje recibido pertenece al grupo activo actualmente
        if (msg.channelIndex === (state.activeChannelIndex || 0)) {
          updateGreenLight(1);
        }
      }
      loadAudios();
      break;
    case 'unread-update':
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
  if (statusMessage) statusMessage.textContent = text;
  if (statusIcon) statusIcon.textContent = icon;
}

// Control del estado de la LUZ VERDE (Botón Escuchar)
function updateGreenLight(unreadCount) {
  state.unreadCount = unreadCount !== undefined ? unreadCount : (state.unreadCount || 0);
  const isLit = state.unreadCount > 0 || state.isPlaying;
  if (isLit) {
    btnListen.classList.add('is-lit');
    if (listenEmoji) listenEmoji.textContent = state.isPlaying ? '🔊' : '👂';
    if (unreadBadgeText) {
      unreadBadgeText.textContent = state.isPlaying
        ? 'Reproduciendo audio...'
        : `${state.unreadCount} nuevo(s) por escuchar`;
    }
  } else {
    btnListen.classList.remove('is-lit');
    if (listenEmoji) listenEmoji.textContent = '👂';
    if (unreadBadgeText) unreadBadgeText.textContent = 'Buzón al día • Sin audios';
  }
}

// Control del estado de la LUZ ROJA (Botón Hablar)
function setRecordingUI(isRecording) {
  state.isRecording = isRecording;
  if (isRecording) {
    btnRecord.classList.add('is-lit', 'recording');
    if (recordTitle) recordTitle.textContent = 'GRABANDO...';
    if (recordSub) recordSub.textContent = state.buttonMode === 'hold' ? 'Suelta para enviar' : 'Toca para enviar';
    if (recordEmoji) recordEmoji.textContent = '🎙️';
    if (soundWaves) soundWaves.classList.remove('hidden');
    showStatus('¡Luz roja encendida! Grabando tu voz...', '🎙️');
  } else {
    btnRecord.classList.remove('is-lit', 'recording');
    if (recordTitle) recordTitle.textContent = 'HABLAR';
    if (recordSub) recordSub.textContent = state.buttonMode === 'hold' ? 'Mantén para hablar' : 'Toca para hablar';
    if (recordEmoji) recordEmoji.textContent = '🎙️';
    if (soundWaves) soundWaves.classList.add('hidden');
  }
}

function setPlayingUI(isPlaying) {
  state.isPlaying = isPlaying;
  if (isPlaying) {
    btnListen.classList.add('pressed', 'is-lit');
    showStatus('Reproduciendo mensaje de la familia...', '🔊');
    if (listenEmoji) listenEmoji.textContent = '🔊';
    if (unreadBadgeText) unreadBadgeText.textContent = 'Reproduciendo audio...';
  } else {
    btnListen.classList.remove('pressed');
    updateGreenLight(state.unreadCount || 0);
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
    setRecordingUI(data.isRecording || false);
    if (data.ffmpegAvailable === false) {
      showStatus('⚠️ FFmpeg requiere actualización en Termux: corre pkg upgrade', '⚙️');
    }
    loadAudios();
    loadGroups();
  } catch (err) {
    console.error('Error cargando estado:', err);
  }
}

function applyConfigUI(cfg) {
  state.config = cfg || {};
  state.activeChannelIndex = typeof cfg.activeChannelIndex === 'number' ? cfg.activeChannelIndex : 0;
  if (cfg.buttonMode) {
    state.buttonMode = cfg.buttonMode;
    buttonModeSelect.value = cfg.buttonMode;
    if (recordSub) recordSub.textContent = cfg.buttonMode === 'hold' ? 'Mantén para hablar' : 'Toca para hablar';
  }
  if (cfg.autoPlayNewMessages !== undefined) {
    autoPlayCheckbox.checked = cfg.autoPlayNewMessages;
  }
  if (Array.isArray(cfg.channels)) {
    cfg.channels.forEach((ch, idx) => {
      if (slotNames[idx] && ch.name) slotNames[idx].value = ch.name;
      if (slotGroups[idx] && ch.id) slotGroups[idx].value = ch.id;
      if (slotPreviews[idx] && ch.avatar) slotPreviews[idx].src = ch.avatar;
    });
  }
  updateChannelsUI();
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
  state.cachedGroups = groups;
  slotGroups.forEach((select, idx) => {
    if (!select) return;
    const currentVal = state.config.channels?.[idx]?.id || '';
    select.innerHTML = `<option value="">-- Elige grupo WhatsApp para Ranura ${idx + 1} --</option>`;
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.subject} (${g.size || 0} participantes)`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  });
}

async function loadAudios() {
  try {
    const res = await fetch('/api/audios');
    const audios = await res.json();
    state.cachedAudios = audios;
    audioCountBadge.textContent = `${audios.length} audios`;

    updateBadgesAndGreenLightFromCache();

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
      const sender = parts.length >= 2 ? parts[1].replace(/_read/, '').replace(/\.[^/.]+$/, '').replace(/_ch[0-2]/, '') : 'Familiar';
      const channelTag = state.config.channels?.[a.channelIndex]?.name || `Ranura ${(a.channelIndex || 0) + 1}`;

      item.innerHTML = `
        <div class="audio-info">
          <div class="audio-sender">🗣️ ${sender} <span style="font-size:0.75rem; color:#38bdf8; font-weight:normal;">(${channelTag})</span></div>
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

// AudioContext para desbloqueo móvil y fallback de decodificación
let audioCtx = null;
let currentWebAudioSource = null;
let playbackWatchdog = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function stopCurrentPlayback() {
  if (playbackWatchdog) {
    clearTimeout(playbackWatchdog);
    playbackWatchdog = null;
  }
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer.removeAttribute('src');
      currentAudioPlayer.load();
    } catch (e) {}
    currentAudioPlayer = null;
  }
  if (currentWebAudioSource) {
    try {
      currentWebAudioSource.stop();
    } catch (e) {}
    currentWebAudioSource = null;
  }
}

// Reproducción alternativa mediante Web Audio API si HTML5 Audio se cuelga con Opus/Ogg
async function playWithWebAudio(audioUrl, onEnded) {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') await ctx.resume();
    showStatus('Decodificando audio...', '🔊');

    const res = await fetch(audioUrl);
    if (!res.ok) return false;
    const arrayBuf = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);

    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(ctx.destination);
    currentWebAudioSource = source;

    source.onended = () => {
      currentWebAudioSource = null;
      if (onEnded) onEnded();
    };

    source.start(0);
    return true;
  } catch (err) {
    console.error('[WebAudio] Fallback falló:', err);
    return false;
  }
}

// Reproducir audio completo sin cortes en el navegador
async function playAudioFile(audioUrl) {
  stopCurrentPlayback();
  setPlayingUI(true);

  // Watchdog de seguridad absoluto: Si en 25s no terminó, liberar la interfaz
  playbackWatchdog = setTimeout(() => {
    console.warn('[Audio] Watchdog: Tiempo límite alcanzado, restaurando UI.');
    stopCurrentPlayback();
    setPlayingUI(false);
  }, 25000);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stopCurrentPlayback();
    setPlayingUI(false);
    loadAudios();
  };

  const audio = new Audio();
  currentAudioPlayer = audio;
  audio.preload = 'auto';

  audio.onended = () => {
    finish();
  };

  audio.onloadedmetadata = () => {
    if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
      clearTimeout(playbackWatchdog);
      const safeTime = Math.max(5000, (audio.duration + 4) * 1000);
      playbackWatchdog = setTimeout(() => {
        console.warn('[Audio] Watchdog: Duración superada.');
        finish();
      }, safeTime);
    }
  };

  audio.onerror = async (err) => {
    console.warn('[Audio] HTML5 Audio falló, probando fallback Web Audio:', err);
    const ok = await playWithWebAudio(audioUrl, finish);
    if (!ok) {
      showStatus('No se pudo reproducir este audio', '⚠️');
      finish();
    }
  };

  audio.src = audioUrl;

  try {
    await audio.play();
  } catch (playErr) {
    console.warn('[Audio] .play() bloqueado o falló, probando fallback Web Audio:', playErr);
    const ok = await playWithWebAudio(audioUrl, finish);
    if (!ok) {
      showStatus('Error de reproducción en el navegador', '⚠️');
      finish();
    }
  }
}

// ==========================================
// ACCIÓN BOTÓN VERDE: ESCUCHAR
// ==========================================
async function handleListenAction() {
  if (currentUIState === UIState.RECORDING || currentUIState === UIState.SENDING) return;
  if (isActionDebounced()) return;
  currentUIState = UIState.PLAYING;

  unlockAudio();
  btnListen.classList.add('pressed');

  try {
    showStatus('Buscando mensajes nuevos...', '⏳');
    const res = await fetch('/api/btn/listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'web', channelIndex: state.activeChannelIndex })
    });
    const data = await res.json();

    if (data.played && data.played.url) {
      if (data.unreadCount !== undefined) {
        state.unreadCount = data.unreadCount;
      }
      await playAudioFile(data.played.url);
    } else {
      btnListen.classList.remove('pressed');
      webSounds.empty.play().catch(() => {});
      showStatus('No hay mensajes nuevos en la caja', '📭');
    }
  } catch (e) {
    console.error('Error al escuchar:', e);
    btnListen.classList.remove('pressed');
    setPlayingUI(false);
    showStatus('Error de conexión', '❌');
  } finally {
    if (currentUIState === UIState.PLAYING) {
      currentUIState = UIState.IDLE;
    }
  }
}

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
  if (currentUIState === UIState.RECORDING || currentUIState === UIState.SENDING) return;
  if (isActionDebounced()) return;
  currentUIState = UIState.RECORDING;

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
      clearTimeout(recordingWatchdogTimer);
      const duration = (Date.now() - recordStartTime) / 1000;
      setRecordingUI(false);

      if (duration < 1.0) {
        currentUIState = UIState.IDLE;
        showStatus('Audio muy cortito, descartado', '⚠️');
        return;
      }

      currentUIState = UIState.SENDING;
      showStatus('Enviando audio al grupo...', '🚀');

      // Watchdog de envío (8s): libera la interfaz si el envío por red se traba
      clearTimeout(sendingWatchdogTimer);
      sendingWatchdogTimer = setTimeout(() => {
        if (currentUIState === UIState.SENDING) {
          console.warn('[Watchdog] Envío tardó más de 8s, liberando UI.');
          currentUIState = UIState.IDLE;
          setRecordingUI(false);
        }
      }, 8000);

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
          showStatus(uploadData.error || 'No se pudo enviar. Revisa la conexión de WhatsApp o FFmpeg.', '❌');
        }
      } catch (err) {
        console.error('Error subiendo audio:', err);
        showStatus('Error al enviar audio: ' + (err.message || 'conexión'), '❌');
      } finally {
        clearTimeout(sendingWatchdogTimer);
        currentUIState = UIState.IDLE;
      }
    };

    // Tono de inicio
    webSounds.beep.play().catch(() => {});
    recordStartTime = Date.now();
    mediaRecorder.start(200);
    setRecordingUI(true);

    // Watchdog de grabación (máximo 30 segundos)
    clearTimeout(recordingWatchdogTimer);
    recordingWatchdogTimer = setTimeout(() => {
      if (currentUIState === UIState.RECORDING) {
        console.warn('[Watchdog] Grabación superó 30 segundos, cortando.');
        stopRecording();
      }
    }, 30000);

  } catch (err) {
    console.error('Permiso de micrófono denegado:', err);
    currentUIState = UIState.IDLE;
    setRecordingUI(false);
    alert('Por favor permite el acceso al micrófono en el navegador para poder grabar.');
  }
}

function stopRecording() {
  clearTimeout(recordingWatchdogTimer);
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function handleRecordTrigger() {
  if (currentUIState === UIState.SENDING) return;
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
  unlockAudio();
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
  const updatedChannels = (state.config.channels || []).slice(0, 3);
  for (let i = 0; i < 3; i++) {
    const name = slotNames[i]?.value.trim() || `Ranura ${i + 1}`;
    const id = slotGroups[i]?.value || '';
    const currentAvatar = state.config.channels?.[i]?.avatar;
    const avatar = currentAvatar || updatedChannels[i]?.avatar || `/avatars/family${i + 1}.svg`;
    updatedChannels[i] = { id, name, avatar };
  }

  const newConfig = {
    ...state.config,
    channels: updatedChannels,
    targetGroupId: updatedChannels[0]?.id || '',
    targetGroupName: updatedChannels[0]?.name || '',
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
      state.config = newConfig;
      state.buttonMode = buttonModeSelect.value;
      updateChannelsUI();
    }
  } catch (e) {
    alert('Error guardando configuración');
  }
});

const btnClearAudios = document.getElementById('btnClearAudios');
if (btnClearAudios) {
  btnClearAudios.addEventListener('click', async () => {
    if (confirm('¿Vaciar todos los audios recibidos del buzón? Esto borrará los audios antiguos y apagará la luz verde.')) {
      try {
        const res = await fetch('/api/audios/clear', { method: 'POST' });
        if (res.ok) {
          settingsModal.classList.add('hidden');
          showStatus('Buzón de audios vaciado', '🧹');
          updateGreenLight(0);
          loadAudios();
        }
      } catch (e) {
        alert('Error al vaciar buzón');
      }
    }
  });
}

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

// ==========================================
// INTERACCIÓN DE LA CARA: NARIZ Y BOCA
// ==========================================
function playPopSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.16);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  } catch (e) {}
}

// ==========================================
// INTERACCIÓN DE LA CARA: NARIZ Y BOCA (CERO LAG)
// ==========================================

function updateBadgesAndGreenLightFromCache() {
  const audios = state.cachedAudios || [];
  const unreadPerChannel = [0, 0, 0];
  audios.forEach(a => {
    if (!a.isRead) {
      const ch = typeof a.channelIndex === 'number' ? a.channelIndex : 0;
      if (ch >= 0 && ch < 3) unreadPerChannel[ch]++;
    }
  });

  mouthBadges.forEach((badge, idx) => {
    if (!badge) return;
    const count = unreadPerChannel[idx];
    if (count > 0) {
      badge.classList.remove('hidden');
      badge.textContent = '🔔';
      if (mouthCards[idx]) mouthCards[idx].classList.add('has-unread');
    } else {
      badge.classList.add('hidden');
      if (mouthCards[idx]) mouthCards[idx].classList.remove('has-unread');
    }
  });

  const activeUnread = unreadPerChannel[state.activeChannelIndex || 0] || 0;
  updateGreenLight(activeUnread);
}

function playPopSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.16);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  } catch (e) {}
}

// Cambio de canal instantáneo (0 ms de latencia en la pantalla)
function switchChannel(targetIndex = null) {
  if (currentUIState === UIState.RECORDING || currentUIState === UIState.SENDING) return;
  unlockAudio();

  const numChannels = state.config.channels?.length || 3;
  const nextIndex = (targetIndex !== null && targetIndex !== undefined)
    ? targetIndex
    : ((state.activeChannelIndex || 0) + 1) % numChannels;

  // Si se seleccionó la que ya está activa, no hacer nada
  if (nextIndex === state.activeChannelIndex && targetIndex !== null) return;

  // 1. RESPUESTA VISUAL Y DE SONIDO INSTANTÁNEA (0 ms de lag)
  state.activeChannelIndex = nextIndex;
  playPopSound();
  updateChannelsUI();
  updateBadgesAndGreenLightFromCache();

  if (btnNose) {
    btnNose.classList.add('pressed');
    setTimeout(() => btnNose.classList.remove('pressed'), 180);
  }

  // 2. Notificación en segundo plano al servidor (sin bloquear la interfaz del niño)
  fetch('/api/channels/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: nextIndex })
  }).catch(() => {});
}

function updateChannelsUI() {
  const activeIdx = state.activeChannelIndex || 0;
  const channels = state.config.channels || [
    { name: 'Papá y Mamá', avatar: '/avatars/family1.svg' },
    { name: 'Abuelos Paternos', avatar: '/avatars/family2.svg' },
    { name: 'Abuelos Maternos', avatar: '/avatars/family3.svg' }
  ];

  mouthCards.forEach((card, idx) => {
    if (!card) return;
    const ch = channels[idx] || {};
    if (mouthAvatars[idx] && ch.avatar) {
      mouthAvatars[idx].src = ch.avatar;
    }
    if (mouthNames[idx] && ch.name) {
      mouthNames[idx].textContent = ch.name;
    }
    if (idx === activeIdx) {
      card.classList.add('is-active');
    } else {
      card.classList.remove('is-active');
    }
  });

  const activeChannel = channels[activeIdx] || {};
  showStatus(`Hablando con: ${activeChannel.name || 'Familia'} ✨`, '🗣️');
}

// Compresor de imagen ultraligero en el navegador (reduce fotos de 8MB a ~30KB en 20ms)
function compressImage(file, maxSize = 360, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function setupSlotPhotoUploads() {
  slotPhotoInputs.forEach((input, idx) => {
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const slotTitle = slotNames[idx]?.value || `Ranura ${idx + 1}`;
        showStatus(`Optimizando y subiendo foto de ${slotTitle}...`, '⏳');

        // Comprimir en el navegador antes de enviar
        const compressedDataUrl = await compressImage(file, 360, 0.85);

        // Previsualizar de inmediato en el modal y en la boca
        if (mouthAvatars[idx]) mouthAvatars[idx].src = compressedDataUrl;
        if (slotPreviews[idx]) slotPreviews[idx].src = compressedDataUrl;

        const res = await fetch(`/api/channels/${idx}/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: compressedDataUrl })
        });
        const data = await res.json();
        if (data.success && data.avatarUrl) {
          const finalUrl = `${data.avatarUrl}?t=${Date.now()}`;
          if (mouthAvatars[idx]) mouthAvatars[idx].src = finalUrl;
          if (slotPreviews[idx]) slotPreviews[idx].src = finalUrl;
          if (state.config.channels && state.config.channels[idx]) {
            state.config.channels[idx].avatar = data.avatarUrl;
          }
          showStatus('¡Foto guardada con éxito! 📸', '✅');
        } else {
          alert('Error al guardar foto: ' + (data.error || 'Desconocido'));
        }
      } catch (err) {
        console.error('Error procesando foto:', err);
        alert('No se pudo procesar la foto: ' + err.message);
      }
    });
  });
}

// Asignador de toques instantáneos para pantallas táctiles (evita el retardo de 300ms de click)
function bindFastTap(elem, callback) {
  if (!elem) return;
  let lastTouchTime = 0;
  elem.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lastTouchTime = Date.now();
    callback();
  }, { passive: false });
  elem.addEventListener('click', (e) => {
    if (Date.now() - lastTouchTime < 500) return;
    callback();
  });
}

// Escuchadores de eventos rápidos
if (btnListen) {
  bindFastTap(btnListen, () => handleListenAction());
}

if (btnNose) {
  bindFastTap(btnNose, () => {
    if (checkNoseEmergency()) return;
    if (currentUIState === UIState.RECORDING || currentUIState === UIState.SENDING) return;
    if (isActionDebounced()) return;
    switchChannel();
  });
}

mouthCards.forEach((card, idx) => {
  if (card) {
    bindFastTap(card, () => {
      if (currentUIState === UIState.RECORDING || currentUIState === UIState.SENDING) return;
      if (isActionDebounced()) return;
      switchChannel(idx);
    });
  }
});

setupSlotPhotoUploads();

// Latido periódico de salud (Heartbeat a /api/health)
let healthFailures = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      if (healthFailures > 0) {
        healthFailures = 0;
        setConnected(true);
      }
    } else {
      healthFailures++;
    }
  } catch (e) {
    healthFailures++;
    if (healthFailures >= 4) {
      setConnected(false);
    }
  }
}, 15000);

// Inicialización
connectWebSocket();
loadStatus();
