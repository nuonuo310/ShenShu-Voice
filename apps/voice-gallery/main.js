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
    <button class="collection-charm" id="collectionCharm" type="button" aria-label="打开我们的收藏" aria-controls="collectionDrawer" aria-expanded="false">
      <span class="charm-thread" aria-hidden="true"></span>
      <svg class="charm-bell" aria-hidden="true" viewBox="0 0 24 28" fill="none">
        <path d="M6.4 18.2c1-1.15 1.45-2.65 1.45-4.48v-2.55c0-2.52 1.72-4.54 4.15-4.54s4.15 2.02 4.15 4.54v2.55c0 1.83.45 3.33 1.45 4.48"/>
        <path d="M5.2 19.5h13.6M10.2 22.15c.35.72.95 1.08 1.8 1.08s1.45-.36 1.8-1.08"/>
      </svg>
    </button>
    <section class="sun-stage" aria-label="声音播放器">
      <div class="ambient-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <canvas id="audioCanvas" aria-hidden="true"></canvas>
      <div class="sound-core" id="soundCore" aria-hidden="true"></div>
    </section>
    <section class="spoken-copy" aria-live="polite">
      <p class="spoken-en" id="spokenEn">Touch the light to begin.</p>
      <p class="spoken-zh" id="spokenZh">触碰这束光，听见哥哥的声音。</p>
    </section>
    <section class="timeline" aria-label="播放进度">
      <button class="play-control" id="playButton" type="button" aria-label="播放"><span aria-hidden="true"></span></button>
      <div class="timeline-main">
        <input id="seek" class="seek" type="range" min="0" max="1000" value="0" aria-label="播放进度">
        <div class="time-row"><span id="current">0:00</span><span id="total">0:00</span></div>
      </div>
      <button class="loop-control" id="loopButton" type="button" aria-label="列表循环">
        <span class="loop-glyph" aria-hidden="true">↻</span><span class="loop-one" aria-hidden="true">1</span>
      </button>
      <p class="status" id="status" role="status"></p>
    </section>
    <section class="collection-drawer" id="collectionDrawer" aria-labelledby="collectionTitle" hidden>
      <button class="collection-backdrop" id="collectionBackdrop" type="button" aria-label="关闭收藏"></button>
      <div class="collection-panel">
        <div class="collection-topline"><div><p>VOICE KEEPSAKES</p><h1 id="collectionTitle">我们的收藏 <span id="collectionCount">01</span></h1></div><button class="collection-close" id="collectionClose" type="button" aria-label="关闭收藏">×</button></div>
        <div class="collection-track" id="collectionTrack"></div>
      </div>
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
let shownCaption = '';
let repeatMode = 'sequence';
let controlsTimer = null;

function readSavedState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
const saved = readSavedState();
if (voices.some((voice) => voice.id === saved.id)) currentId = saved.id;
if (saved.repeatMode === 'one') repeatMode = 'one';
const currentVoice = () => voices.find((voice) => voice.id === currentId) || voices[0];

function persist() {
  if (!currentId) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: currentId, time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0, repeatMode }));
}

function renderCollection() {
  $('availableCount').textContent = available.length;
  $('collectionCount').textContent = String(available.length).padStart(2, '0');
  $('collectionTrack').innerHTML = available.map((voice, index) => `
    <button class="voice-row ${voice.id === currentId ? 'is-active' : ''}" type="button" data-voice="${voice.id}" aria-label="播放${voice.title}">
      <span class="voice-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="voice-meta"><span class="voice-title">${voice.title}</span><span class="voice-date">${voice.date}</span></span>
      <span class="voice-duration">${formatTime(voice.duration, false)}</span>
    </button>`).join('');
}

const activeCaption = (voice, time) => voice.captions?.find((caption) => time >= Math.max(0, caption.start - 0.08) && time < caption.end) || null;

function updateRepeatControl(announce = false) {
  const isOne = repeatMode === 'one';
  $('loopButton').classList.toggle('is-one', isOne);
  $('loopButton').setAttribute('aria-label', isOne ? '关闭单曲循环' : '开启单曲循环');
  if (announce) {
    const message = isOne ? '单曲循环' : '播完后继续下一条';
    $('status').textContent = message;
    window.setTimeout(() => { if ($('status').textContent === message) $('status').textContent = ''; }, 1400);
  }
}

function showControls(hold = false) {
  const timeline = document.querySelector('.timeline');
  timeline.classList.add('is-visible');
  window.clearTimeout(controlsTimer);
  if (!hold && !audio.paused && !dragging) {
    controlsTimer = window.setTimeout(() => timeline.classList.remove('is-visible'), 4000);
  }
}

function updateCopy() {
  const voice = currentVoice();
  const caption = activeCaption(voice, audio.currentTime || 0);
  const nextKey = caption ? `${caption.start}:${caption.text}` : '';
  if (nextKey === shownCaption) return;
  shownCaption = nextKey;
  const copy = document.querySelector('.spoken-copy');
  if (caption) {
    $('spokenEn').textContent = caption.text;
    $('spokenZh').textContent = caption.translation || '';
  } else if (!voice.audioUrl) {
    $('spokenEn').textContent = 'A voice is waiting here.';
    $('spokenZh').textContent = '这颗太阳还在等下一段声音。';
  } else {
    $('spokenEn').textContent = '';
    $('spokenZh').textContent = '';
  }
  copy.classList.remove('is-entering');
  void copy.offsetWidth;
  copy.classList.add('is-entering');
}

function updatePlayer() {
  const voice = currentVoice();
  const duration = Number.isFinite(audio.duration) ? audio.duration : (voice?.duration || 0);
  const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  if (!dragging) $('seek').value = duration ? Math.round((time / duration) * 1000) : 0;
  $('current').textContent = formatTime(time, false);
  $('total').textContent = formatTime(duration, false);
  const isPlaying = !audio.paused;
  $('playButton').classList.toggle('is-playing', isPlaying);
  document.querySelector('.sun-stage').classList.toggle('is-playing', isPlaying);
  $('playButton').setAttribute('aria-label', audio.paused ? '播放' : '暂停');
  updateCopy();
}

function loadVoice(voice, restore = false) {
  if (!voice) return;
  audio.pause();
  shownCaption = null;
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
  } catch { $('status').textContent = '没有成功播放，再轻轻点一次播放键。'; }
  updatePlayer();
  showControls(audio.paused);
}

async function playFollowingVoice() {
  if (!available.length) return;
  if (repeatMode === 'one') {
    audio.currentTime = 0;
    await audio.play();
    return;
  }
  const currentIndex = Math.max(0, available.findIndex((voice) => voice.id === currentId));
  const nextVoice = available[currentIndex + 1];
  if (!nextVoice) {
    updatePlayer();
    persist();
    return;
  }
  loadVoice(nextVoice);
  await new Promise((resolve) => {
    if (audio.readyState >= 1) resolve();
    else audio.addEventListener('loadedmetadata', resolve, { once: true });
  });
  await audio.play();
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

// Soft daylight-readable sun: the audio envelope drives light and outward travelling ripples.
let lightLevel = 0;
let previousEnergy = 0;
let lastFrame = 0;
let lastRipple = -1000;
const ripples = [];
function drawAudioLight(now) {
  resizeCanvas();
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  const dt = Math.min(0.05, Math.max(0.001, (now - (lastFrame || now - 16)) / 1000));
  lastFrame = now;
  const active = !audio.paused && !audio.ended && !reducedMotion.matches;
  let target = { bass: 0, mid: 0, high: 0 };
  if (active && analyser && frequencyData) {
    analyser.getByteFrequencyData(frequencyData);
    target = { bass: average(1, 8), mid: average(8, 32), high: average(32, 96) };
  }
  const follow = (previous, next, attack, release) =>
    previous + (next - previous) * (1 - Math.exp(-dt / (next > previous ? attack : release)));
  smooth.bass = follow(smooth.bass, target.bass, 0.045, 0.23);
  smooth.mid = follow(smooth.mid, target.mid, 0.045, 0.20);
  smooth.high = follow(smooth.high, target.high, 0.035, 0.15);
  const energy = Math.min(1, smooth.bass * 0.45 + smooth.mid * 0.85 + smooth.high * 0.2);
  lightLevel = follow(lightLevel, energy, 0.065, 0.29);
  const cx = width / 2, cy = height / 2;
  const size = Math.min(width, height);
  // Every color stop shares the same breathing radius: the peach-pink edge moves too.
  const breath = 1 + lightLevel * 0.27;
  const outerRadius = size * 0.34 * breath;
  const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius * 1.32);
  ambient.addColorStop(0, 'rgba(255,237,208,0.075)');
  ambient.addColorStop(0.45, `rgba(255,211,183,${0.055 + lightLevel * 0.035})`);
  ambient.addColorStop(0.76, 'rgba(249,206,196,0.016)');
  ambient.addColorStop(1, 'rgba(249,206,196,0)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
  glow.addColorStop(0, 'rgba(255,250,230,0.94)');
  glow.addColorStop(0.12, 'rgba(255,245,220,0.93)');
  glow.addColorStop(0.27, `rgba(255,228,192,${0.79 + lightLevel * 0.08})`);
  glow.addColorStop(0.48, `rgba(255,211,177,${0.42 + lightLevel * 0.12})`);
  glow.addColorStop(0.68, `rgba(252,207,187,${0.18 + lightLevel * 0.07})`);
  glow.addColorStop(0.86, `rgba(249,211,203,${0.065 + lightLevel * 0.03})`);
  glow.addColorStop(1, 'rgba(249,211,203,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  if (!reducedMotion.matches) {
    // Ripples originate OUTSIDE the colored glow, never inside or enclosing its pink layer.
    const onset = energy - previousEnergy;
    if (active && energy > 0.105 && onset > 0.018 && now - lastRipple > 260) {
      ripples.push({ radius: outerRadius * 1.02, opacity: Math.min(1, 0.48 + energy * 0.6) });
      lastRipple = now;
    }
    previousEnergy = energy;
    const maxRadius = Math.min(width * 0.49, height * 0.49);
    for (let n = ripples.length - 1; n >= 0; n--) {
      const ripple = ripples[n];
      ripple.radius += dt * size * 0.21;
      ripple.opacity *= Math.exp(-dt * 0.72);
      if (ripple.radius >= maxRadius || ripple.opacity < 0.018) {
        ripples.splice(n, 1);
        continue;
      }
      const fade = Math.max(0, (maxRadius - ripple.radius) / (maxRadius - outerRadius * 0.95));
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) {
        const angle = i / 128 * Math.PI * 2;
        const r = ripple.radius + Math.sin(angle * 3 + ripple.radius * 0.014) * 0.85
          + Math.sin(angle * 7 - ripple.radius * 0.011) * 0.35;
        const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,227,207,${ripple.opacity * fade * 0.14})`;
      ctx.lineWidth = 0.7;
      ctx.shadowColor = 'rgba(255,226,205,0.22)';
      ctx.shadowBlur = 5;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else {
    ripples.length = 0;
    previousEnergy = 0;
  }
  requestAnimationFrame(drawAudioLight);
}

$('playButton').addEventListener('click', async (event) => {
  await togglePlayback();
  if (event.detail) event.currentTarget.blur();
});
$('loopButton').addEventListener('click', (event) => {
  repeatMode = repeatMode === 'one' ? 'sequence' : 'one';
  updateRepeatControl(true);
  persist();
  showControls();
  if (event.detail) event.currentTarget.blur();
});
document.querySelector('.voice-archive').addEventListener('pointerdown', (event) => {
  if (event.target.closest('.collection-drawer')) return;
  showControls(event.target.closest('.timeline') !== null);
});
$('collectionCharm').addEventListener('click', () => {
  $('collectionDrawer').hidden = false;
  $('collectionCharm').setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
});
function closeCollection() {
  $('collectionDrawer').hidden = true;
  $('collectionCharm').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');
}
$('collectionClose').addEventListener('click', closeCollection);
$('collectionBackdrop').addEventListener('click', closeCollection);
$('collectionTrack').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-voice]');
  if (!button) return;
  const voice = voices.find((candidate) => candidate.id === button.dataset.voice);
  if (!voice?.audioUrl) { $('status').textContent = '这颗太阳还在等下一段声音。'; return; }
  const wasCurrent = voice.id === currentId;
  loadVoice(voice);
  if (wasCurrent) await togglePlayback();
});
$('seek').addEventListener('pointerdown', () => { dragging = true; showControls(true); });
$('seek').addEventListener('input', (event) => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : (currentVoice()?.duration || 0);
  $('current').textContent = formatTime(duration * Number(event.target.value) / 1000, false);
});
$('seek').addEventListener('change', (event) => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : (currentVoice()?.duration || 0);
  if (duration && currentVoice()?.audioUrl) audio.currentTime = duration * Number(event.target.value) / 1000;
  dragging = false; updatePlayer(); persist(); showControls(); event.currentTarget.blur();
});
audio.addEventListener('timeupdate', () => { updatePlayer(); persist(); });
audio.addEventListener('play', updatePlayer);
audio.addEventListener('pause', updatePlayer);
audio.addEventListener('ended', async () => {
  try { await playFollowingVoice(); } catch { updatePlayer(); }
});
audio.addEventListener('error', () => { $('status').textContent = '音频没有成功加载，请稍后再试。'; });
window.addEventListener('pagehide', persist);
window.addEventListener('resize', resizeCanvas);

loadVoice(currentVoice(), true);
updateRepeatControl();
requestAnimationFrame(drawAudioLight);
