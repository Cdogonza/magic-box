import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const soundsDir = path.join(__dirname, 'sounds');

if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

function createWavBuffer(sampleRate, samples) {
  const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), offset);
    offset += 2;
  }

  return buffer;
}

const SAMPLE_RATE = 44100;

// 1. Ding Dong (Mensaje nuevo recibido) - Campana suave
function generateDingDong() {
  const duration = 1.2;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    // Primera nota: Mi (659.25 Hz)
    if (t < 0.8) {
      const env1 = Math.exp(-t * 5);
      s += Math.sin(2 * Math.PI * 659.25 * t) * env1 * 0.5;
      s += Math.sin(2 * Math.PI * 1318.5 * t) * env1 * 0.2; // Armónico
    }
    // Segunda nota: Do (523.25 Hz) entrando a los 0.35s
    if (t >= 0.35) {
      const t2 = t - 0.35;
      const env2 = Math.exp(-t2 * 4);
      s += Math.sin(2 * Math.PI * 523.25 * t2) * env2 * 0.6;
      s += Math.sin(2 * Math.PI * 1046.5 * t2) * env2 * 0.25;
    }
    samples[i] = s;
  }
  return createWavBuffer(SAMPLE_RATE, samples);
}

// 2. Beep (Inicio de grabación) - Tono claro y amigable
function generateBeep() {
  const duration = 0.2;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Fade in/out rápido para evitar clicks
    const attack = Math.min(1, t / 0.02);
    const release = Math.min(1, (duration - t) / 0.02);
    const env = attack * release;
    samples[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.4;
  }
  return createWavBuffer(SAMPLE_RATE, samples);
}

// 3. Sent (Audio enviado exitosamente) - Arpegio alegre ascendente
function generateSent() {
  const duration = 0.6;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(totalSamples);
  const notes = [523.25, 659.25, 783.99, 1046.5]; // Do, Mi, Sol, Do alto
  const step = 0.12;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    notes.forEach((freq, idx) => {
      const noteStart = idx * step;
      if (t >= noteStart) {
        const dt = t - noteStart;
        const env = Math.exp(-dt * 9);
        s += Math.sin(2 * Math.PI * freq * dt) * env * 0.35;
      }
    });
    samples[i] = s;
  }
  return createWavBuffer(SAMPLE_RATE, samples);
}

// 4. Empty (No hay mensajes nuevos) - Sonido suave descendente
function generateEmpty() {
  const duration = 0.5;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    // Nota 1: 440 Hz
    if (t < 0.25) {
      const env = Math.exp(-t * 6);
      s += Math.sin(2 * Math.PI * 440 * t) * env * 0.35;
    }
    // Nota 2: 349.23 Hz (Fa)
    if (t >= 0.2) {
      const dt = t - 0.2;
      const env = Math.exp(-dt * 6);
      s += Math.sin(2 * Math.PI * 349.23 * dt) * env * 0.35;
    }
    samples[i] = s;
  }
  return createWavBuffer(SAMPLE_RATE, samples);
}

fs.writeFileSync(path.join(soundsDir, 'ding.wav'), generateDingDong());
fs.writeFileSync(path.join(soundsDir, 'beep.wav'), generateBeep());
fs.writeFileSync(path.join(soundsDir, 'sent.wav'), generateSent());
fs.writeFileSync(path.join(soundsDir, 'empty.wav'), generateEmpty());

console.log('✓ Archivos de sonido WAV generados exitosamente en ./sounds/');
