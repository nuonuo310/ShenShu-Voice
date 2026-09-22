import { voices, formatTime, getFavorites, toggleFavorite } from '../../packages/voice-data/index.js';
import './style.css';

const STORAGE_KEY = 'shenshu:sun-player';
const FAVORITES_INITIALIZED = 'shenshu:gallery-favorites-initialized';
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
      <div class="ambient-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
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
      <button class="favorite-control" id="favoriteButton" type="button" aria-label="收藏当前声音" aria-pressed="false"><svg class="favorite-star" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 5 C35 22 42 29 59 32 C42 35 35 42 32 59 C29 42 22 35 5 32 C22 29 29 22 32 5Z"/></svg></button>
      <p class="status" id="status" role="status"></p>
    </section>
    <section class="collection-drawer" id="collectionDrawer" aria-labelledby="collectionTitle" hidden>
      <button class="collection-backdrop" id="collectionBackdrop" type="button" aria-label="关闭收藏"></button>
      <div class="collection-panel">
        <div class="collection-topline"><div><p>VOICE KEEPSAKES</p><h1 id="collectionTitle">我们的收藏 <span id="collectionCount">01</span></h1></div><button class="collection-close" id="collectionClose" type="button" aria-label="关闭收藏">×</button></div>
        <div class="collection-track" id="collectionTrack"></div>
        <p class="collection-hint">点播放聆听 · 点星芒取消收藏</p>
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
// Preserve the original single keepsake on first upgrade; afterwards respect explicit removals.
try {
  if (!localStorage.getItem(FAVORITES_INITIALIZED)) {
    if (!getFavorites().length && available[0]) toggleFavorite(available[0].id);
    localStorage.setItem(FAVORITES_INITIALIZED, '1');
  }
} catch { /* Playback still works when storage is blocked. */ }
const favorites = () => { try { return new Set(getFavorites()); } catch { return new Set(); } };
let currentId = available[0]?.id ?? voices[0]?.id ?? null;
let dragging = false;
let audioContext = null;
let analyser = null;
let frequencyData = null;
let waveformData = null;
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
  const ids = favorites();
  const items = available.filter((voice) => ids.has(voice.id));
  $('availableCount').textContent = available.length;
  $('collectionCount').textContent = String(items.length).padStart(2, '0');
  $('collectionTrack').innerHTML = items.length ? items.map((voice) => `
    <div class="voice-row ${voice.id === currentId ? 'is-active' : ''}">
      <button class="voice-row-play" type="button" data-voice="${voice.id}" aria-label="播放${voice.title}">
        <span class="voice-play-icon${voice.id === currentId && !audio.paused ? ' is-playing' : ''}" aria-hidden="true"></span>
        <span class="voice-meta"><span class="voice-title"></span><span class="voice-date"></span></span>
        <span class="voice-duration">${formatTime(voice.duration, false)}</span>
      </button>
      <button class="voice-remove" type="button" data-remove="${voice.id}" aria-label="取消收藏${voice.title}" title="取消收藏"><svg class="favorite-star" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 5 C35 22 42 29 59 32 C42 35 35 42 32 59 C29 42 22 35 5 32 C22 29 29 22 32 5Z"/></svg></button>
    </div>`).join('') : '<p class="collection-empty">还没有收藏的声音。<br>播放一段声音，点下方星芒就能收进这里。</p>';
  items.forEach((voice, index) => {
    const row = $('collectionTrack').children[index];
    row.querySelector('.voice-title').textContent = voice.title;
    row.querySelector('.voice-date').textContent = voice.date || '';
  });
  $('favoriteButton').classList.toggle('is-saved', ids.has(currentId));
  $('favoriteButton').setAttribute('aria-label', ids.has(currentId) ? '取消收藏当前声音' : '收藏当前声音');
  $('favoriteButton').setAttribute('aria-pressed', String(ids.has(currentId)));
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

function hideControls() {
  window.clearTimeout(controlsTimer);
  document.querySelector('.timeline').classList.remove('is-visible');
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
  if (!$('collectionDrawer').hidden) renderCollection();
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
    analyser.smoothingTimeConstant = 0.48;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    waveformData = new Uint8Array(analyser.fftSize);
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
// One reusable audio envelope for every recording; no clip-specific timestamps or gains.
let lightLevel = 0;
let vocalLevel = 0;
let recentPeak = 0.018;
let noiseFloor = 0.002;
let previousVocalLevel = 0;
let lastFrame = 0;
let lastRipple = -1000;
let wasSpeaking = false;
const ripples = [];
function drawAudioLight(now) {
  resizeCanvas();
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const dt = Math.min(0.05, Math.max(0.001, (now - (lastFrame || now - 16)) / 1000));
  lastFrame = now;
  const active = !audio.paused && !audio.ended && !reducedMotion.matches;
  const follow = (previous, next, attack, release) =>
    previous + (next - previous) * (1 - Math.exp(-dt / (next > previous ? attack : release)));
  let rms = 0;
  if (active && analyser && waveformData && audioContext?.state === 'running') {
    analyser.getByteTimeDomainData(waveformData);
    let power = 0;
    for (let i = 0; i < waveformData.length; i++) {
      const sample = (waveformData[i] - 128) / 128;
      power += sample * sample;
    }
    rms = Math.sqrt(power / waveformData.length);
  }
  // Fast onset / slower decay preserves syllables, while the peak adapts to quiet and loud clips.
  noiseFloor = follow(noiseFloor, rms, 4, 1.1);
  const signal = active ? Math.max(0, rms - Math.max(0.002, noiseFloor * 1.45)) : 0;
  recentPeak = follow(recentPeak, Math.max(0.012, signal), 0.07, 2.8);
  const normalized = Math.min(1, signal / Math.max(0.012, recentPeak * 0.88));
  vocalLevel = follow(vocalLevel, normalized, 0.035, 0.105);
  const speaking = active && signal > Math.max(0.003, recentPeak * 0.12);
  const breathTarget = speaking ? Math.min(1, vocalLevel) : 0;
  lightLevel = follow(lightLevel, breathTarget, 0.075, 0.16);
  const cx = width / 2, cy = height / 2;
  const size = Math.min(width, height);
  // The entire approved ivory / champagne / peach gradient changes radius together.
  const outerRadius = size * 0.275 * (1 + lightLevel * 0.57);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius * 1.19);
  glow.addColorStop(0, 'rgba(255,248,224,0.95)');
  glow.addColorStop(0.10, 'rgba(255,244,215,0.94)');
  glow.addColorStop(0.24, 'rgba(255,225,182,0.88)');
  glow.addColorStop(0.40, 'rgba(255,194,147,0.72)');
  glow.addColorStop(0.55, 'rgba(255,181,146,0.48)');
  glow.addColorStop(0.70, 'rgba(249,189,170,0.29)');
  glow.addColorStop(0.86, 'rgba(247,201,188,0.105)');
  glow.addColorStop(1, 'rgba(247,201,188,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  if (!reducedMotion.matches) {
    const onset = vocalLevel - previousVocalLevel;
    // A fresh syllable after a valley OR a meaningful rise can launch a new wave.
    if (speaking && now - lastRipple > 230 &&
        ((!wasSpeaking && vocalLevel > 0.14) ||
         (onset > 0.055 && vocalLevel > 0.23))) {
      ripples.push({ radius: outerRadius * 1.19, opacity: 0.55 + vocalLevel * 0.35, age: 0 });
      if (ripples.length > 4) ripples.shift();
      lastRipple = now;
    }
    previousVocalLevel = vocalLevel;
    wasSpeaking = speaking;
    const maxRadius = size * 0.53;
    for (let n = ripples.length - 1; n >= 0; n--) {
      const ripple = ripples[n];
      ripple.age += dt;
      ripple.radius += dt * size * 0.16;
      const life = Math.max(0, 1 - ripple.age / 1.35);
      const edgeFade = Math.max(0, Math.min(1, (maxRadius - ripple.radius) / (size * 0.08)));
      if (life <= 0 || edgeFade <= 0) {
        ripples.splice(n, 1);
        continue;
      }
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) {
        const angle = i / 128 * Math.PI * 2;
        const r = ripple.radius + Math.sin(angle * 3 + ripple.radius * 0.014) * 0.85
          + Math.sin(angle * 7 - ripple.radius * 0.011) * 0.35;
        const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,231,192,${ripple.opacity * life * edgeFade * 0.31})`;
      ctx.lineWidth = 0.85;
      ctx.shadowColor = 'rgba(255,234,205,0.42)';
      ctx.shadowBlur = 6;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else {
    ripples.length = 0;
    previousVocalLevel = 0;
    wasSpeaking = false;
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
  if (event.target.closest('.collection-drawer, .collection-charm, .timeline')) return;
  if (document.querySelector('.timeline').classList.contains('is-visible')) hideControls();
  else showControls();
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
$('favoriteButton').addEventListener('click', () => {
  if (!currentVoice()?.audioUrl) return;
  try { toggleFavorite(currentId); renderCollection(); }
  catch { $('status').textContent = '收藏保存失败，请检查浏览器存储设置。'; }
});
$('collectionTrack').addEventListener('click', async (event) => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    try { toggleFavorite(remove.dataset.remove); renderCollection(); }
    catch { $('status').textContent = '取消收藏失败，请稍后再试。'; }
    return;
  }
  const button = event.target.closest('[data-voice]');
  if (!button) return;
  const voice = voices.find((candidate) => candidate.id === button.dataset.voice);
  if (!voice?.audioUrl) return;
  closeCollection();
  if (voice.id !== currentId) loadVoice(voice);
  try {
    await ensureAudioGraph();
    if (audio.paused) await audio.play();
    updatePlayer();
    showControls();
  } catch { $('status').textContent = '播放失败，请再点一次播放键。'; }
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
