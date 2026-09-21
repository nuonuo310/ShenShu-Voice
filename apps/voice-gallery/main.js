import { voices, formatTime } from '../../packages/voice-data/index.js';
import './style.css';

const STORAGE_KEY = 'shenshu:sun-player';
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="voice-archive">
    <header class="archive-header">
      <p class="archive-kicker">SHENSHU · VOICE ARCHIVE</p>
      <p class="archive-count"><span id="availableCount">0</span> SAVED VOICE</p>
    </header>
    <section class="sun-stage" aria-label="声音播放器">
      <div class="ambient-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <canvas id="audioCanvas" aria-hidden="true"></canvas>
      <button class="sun" id="sunButton" type="button" aria-label="播放">
        <span class="sun-surface" aria-hidden="true"></span><span class="play-mark" aria-hidden="true"></span>
      </button>
    </section>
    <section class="spoken-copy" aria-live="polite">
      <p class="spoken-en" id="spokenEn">Touch the light to begin.</p>
      <p class="spoken-zh" id="spokenZh">触碰这束光，听见哥哥的声音。</p>
    </section>
    <section class="timeline" aria-label="播放进度">
      <input id="seek" class="seek" type="range" min="0" max="1000" value="0" aria-label="播放进度">
      <div class="time-row"><span id="current">0:00</span><span id="total">0:00</span></div>
      <p class="status" id="status" role="status"></p>
    </section>
    <section class="collection" aria-labelledby="collectionTitle">
      <div class="collection-heading"><span></span><h1 id="collectionTitle">我们的收藏</h1><span></span></div>
      <div class="collection-track" id="collectionTrack"></div>
    </section>
  </main>
  <audio id="voiceAudio" preload="metadata" playsinline></audio>
`;

const $ = (id) => document.getElementById(id);
const audio = $('voiceAudio');
const canvas = $('audioCanvas');
const ctx = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const available = voices.filter((voice) => voice.audioUrl);
let currentId = available[0]?.id ?? voices[0]?.id ?? null;
let dragging = false;
let audioContext = null;
let analyser = null;
let frequencyData = null;
let smooth = { bass: 0, mid: 0, high: 0 };

function readSavedState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
const saved = readSavedState();
if (voices.some((voice) => voice.id === saved.id)) currentId = saved.id;
const currentVoice = () => voices.find((voice) => voice.id === currentId) || voices[0];

function persist() {
  if (!currentId) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: currentId, time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 }));
}

function renderCollection() {
  $('availableCount').textContent = available.length;
  $('collectionTrack').innerHTML = voices.map((voice, index) => `
    <button class="voice-token tone-${voice.tone || index + 1} ${voice.id === currentId ? 'is-active' : ''} ${voice.audioUrl ? '' : 'is-locked'}" type="button" data-voice="${voice.id}" aria-label="${voice.audioUrl ? `播放${voice.shortTitle || voice.title}` : `${voice.shortTitle || voice.title}，尚未开放`}" ${voice.audioUrl ? '' : 'aria-disabled="true"'}>
      <span class="mini-sun" aria-hidden="true"></span>
      <span class="token-title">${voice.shortTitle || voice.title}</span>
      <span class="token-state">${voice.audioUrl ? 'VOICE 01' : 'SOON'}</span>
    </button>`).join('');
}

const activeCaption = (voice, time) => voice.captions?.find((caption) => time >= caption.start && time < caption.end) || null;

function updateCopy() {
  const voice = currentVoice();
  const caption = activeCaption(voice, audio.currentTime || 0);
  if (caption) {
    $('spokenEn').textContent = caption.text;
    $('spokenZh').textContent = caption.translation || '';
  } else if (!voice.audioUrl) {
    $('spokenEn').textContent = 'A voice is waiting here.';
    $('spokenZh').textContent = '这颗太阳还在等下一段声音。';
  } else if ((audio.currentTime || 0) > 0) {
    $('spokenEn').textContent = voice.outro || 'Stay a little longer.';
    $('spokenZh').textContent = voice.outroZh || '再陪哥哥听一会儿。';
  } else {
    $('spokenEn').textContent = voice.intro || 'Touch the light to begin.';
    $('spokenZh').textContent = voice.introZh || '触碰这束光，听见哥哥的声音。';
  }
}

function updatePlayer() {
  const voice = currentVoice();
  const duration = Number.isFinite(audio.duration) ? audio.duration : (voice?.duration || 0);
  const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  if (!dragging) $('seek').value = duration ? Math.round((time / duration) * 1000) : 0;
  $('current').textContent = formatTime(time, false);
  $('total').textContent = formatTime(duration, false);
  $('sunButton').classList.toggle('is-playing', !audio.paused);
  $('sunButton').setAttribute('aria-label', audio.paused ? '播放' : '暂停');
  updateCopy();
}

function loadVoice(voice, restore = false) {
  if (!voice) return;
  audio.pause();
  currentId = voice.id;
  $('status').textContent = voice.audioUrl ? '' : '这段声音还没有被放进来。';
  if (voice.audioUrl) {
    if (audio.getAttribute('src') !== voice.audioUrl) { audio.src = voice.audioUrl; audio.load(); }
    audio.onloadedmetadata = () => {
      if (restore && saved.id === voice.id && saved.time) audio.currentTime = Math.min(saved.time, Math.max(0, audio.duration - 0.1));
      updatePlayer();
    };
  } else {
    audio.removeAttribute('src');
    audio.load();
  }
  renderCollection();
  updatePlayer();
  persist();
}

async function ensureAudioGraph() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const mediaSource = audioContext.createMediaElementSource(audio);
    mediaSource.connect(analyser);
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
}

async function togglePlayback() {
  const voice = currentVoice();
  if (!voice?.audioUrl) { $('status').textContent = '这段声音还没有被放进来。'; return; }
  try {
    await ensureAudioGraph();
    if (audio.paused) await audio.play(); else audio.pause();
    $('status').textContent = '';
  } catch { $('status').textContent = '没有成功播放，再轻轻点一次太阳。'; }
  updatePlayer();
}

function average(start, end) {
  if (!frequencyData) return 0;
  const to = Math.min(end, frequencyData.length);
  let sum = 0;
  for (let i = start; i < to; i += 1) sum += frequencyData[i];
  return to > start ? sum / (to - start) / 255 : 0;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function drawAudioLight(now) {
  resizeCanvas();
  const rect = canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  ctx.clearRect(0, 0, width, height);
  let target = { bass: 0.025, mid: 0.02, high: 0.012 };
  if (analyser && !audio.paused && !reducedMotion.matches) {
    analyser.getByteFrequencyData(frequencyData);
    target = { bass: average(1, 8), mid: average(8, 32), high: average(32, 96) };
  }
  smooth.bass += (target.bass - smooth.bass) * 0.09;
  smooth.mid += (target.mid - smooth.mid) * 0.08;
  smooth.high += (target.high - smooth.high) * 0.06;
  const playing = !audio.paused;
  const idleBreath = reducedMotion.matches ? 0 : Math.sin(now / 1450) * 0.006;
  const scale = 1 + idleBreath + (playing ? smooth.bass * 0.035 : 0);
  document.documentElement.style.setProperty('--sun-scale', scale.toFixed(4));
  document.documentElement.style.setProperty('--sun-halo-alpha', (0.13 + smooth.mid * 0.09).toFixed(3));
  document.documentElement.style.setProperty('--sun-shadow-alpha', (0.21 + smooth.mid * 0.09).toFixed(3));

  if (!reducedMotion.matches) {
    const cx = width / 2, cy = height / 2, radius = $('sunButton').getBoundingClientRect().width * 0.48;
    const rayCount = 46;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < rayCount; i += 1) {
      const angle = (i / rayCount) * Math.PI * 2;
      const variation = 0.45 + 0.55 * Math.sin(i * 2.173 + now / 1100) ** 2;
      const energy = playing ? smooth.mid : 0.035;
      const length = 3 + variation * (7 + energy * 17), inner = radius + 7 + variation * 2;
      ctx.strokeStyle = `rgba(244, 218, 168, ${0.055 + energy * 0.16})`;
      ctx.lineWidth = 0.65 + variation * 0.6;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * (inner + length), cy + Math.sin(angle) * (inner + length)); ctx.stroke();
    }
    const particleCount = playing ? 15 : 8;
    for (let i = 0; i < particleCount; i += 1) {
      const orbit = radius * (1.1 + ((i * 37) % 70) / 100);
      const angle = i * 2.399 + now * (0.000025 + (i % 3) * 0.000008);
      const pulse = 0.5 + 0.5 * Math.sin(now / 900 + i * 1.7);
      const size = 0.45 + pulse * (0.7 + smooth.high * 0.7);
      ctx.fillStyle = `rgba(247, 224, 184, ${0.08 + pulse * 0.18 + smooth.high * 0.08})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * orbit, cy + Math.sin(angle) * orbit * 0.72, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  requestAnimationFrame(drawAudioLight);
}

$('sunButton').addEventListener('click', togglePlayback);
$('collectionTrack').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-voice]');
  if (!button) return;
  const voice = voices.find((candidate) => candidate.id === button.dataset.voice);
  if (!voice?.audioUrl) { $('status').textContent = '这颗太阳还在等下一段声音。'; return; }
  const wasCurrent = voice.id === currentId;
  loadVoice(voice);
  if (wasCurrent) await togglePlayback();
});
$('seek').addEventListener('pointerdown', () => { dragging = true; });
$('seek').addEventListener('input', (event) => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : (currentVoice()?.duration || 0);
  $('current').textContent = formatTime(duration * Number(event.target.value) / 1000, false);
});
$('seek').addEventListener('change', (event) => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : (currentVoice()?.duration || 0);
  if (duration && currentVoice()?.audioUrl) audio.currentTime = duration * Number(event.target.value) / 1000;
  dragging = false; updatePlayer(); persist();
});
audio.addEventListener('timeupdate', () => { updatePlayer(); persist(); });
audio.addEventListener('play', updatePlayer);
audio.addEventListener('pause', updatePlayer);
audio.addEventListener('ended', updatePlayer);
audio.addEventListener('error', () => { $('status').textContent = '音频没有成功加载，请稍后再试。'; });
window.addEventListener('pagehide', persist);
window.addEventListener('resize', resizeCanvas);

loadVoice(currentVoice(), true);
requestAnimationFrame(drawAudioLight);
