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
let repeatMode = 'all';
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
  $('loopButton').setAttribute('aria-label', isOne ? '单曲循环' : '列表循环');
  if (announce) {
    $('status').textContent = isOne ? '单曲循环' : '按收藏顺序播放';
    window.setTimeout(() => { if ($('status').textContent === (isOne ? '单曲循环' : '按收藏顺序播放')) $('status').textContent = ''; }, 1400);
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
  if (audio.paused) showControls(true);
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
  const nextVoice = available[(currentIndex + 1) % available.length];
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
  const scale = 1 + idleBreath + (playing ? smooth.bass * 0.16 : 0);
  document.documentElement.style.setProperty('--core-scale', scale.toFixed(4));
  document.documentElement.style.setProperty('--core-alpha', (0.54 + smooth.mid * 0.38).toFixed(3));

  if (!reducedMotion.matches) {
    const cx = width / 2, cy = height / 2;
    const fieldRadius = Math.min(width, height) * 0.43;
    const energy = smooth.bass * 0.65 + smooth.mid * 0.95;
    ctx.save();
    ctx.lineJoin = 'round';
    for (let ring = 0; ring < 3; ring += 1) {
      const speed = playing ? 2300 : 6200;
      const phase = ((now / speed) + ring / 3) % 1;
      const radius = fieldRadius * (0.28 + phase * 0.72);
      const fade = Math.sin(Math.PI * phase) * (playing ? 1 : 0.2);
      ctx.beginPath();
      for (let point = 0; point <= 150; point += 1) {
        const ratio = point / 150;
        const angle = ratio * Math.PI * 2;
        const organic = Math.sin(angle * 2 + now / 1750 + ring) * (0.42 + ring * 0.12);
        const response = playing ? (
          Math.sin(angle * 2 + now / 980) * smooth.bass * 2.8 +
          Math.sin(angle * 3 - now / 1280) * smooth.mid * 2.25 +
          Math.sin(angle * 5 + now / 1540) * smooth.high * 1.35
        ) * (0.72 + ring * 0.16) : 0;
        const r = radius + organic + response;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.965;
        if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(230, 196, 142, ${0.006 + fade * (0.025 + energy * 0.045)})`;
      ctx.lineWidth = 0.42 + energy * 0.38;
      ctx.shadowColor = `rgba(232, 195, 136, ${0.045 + energy * 0.08})`;
      ctx.shadowBlur = 9 + energy * 8;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const particleCount = playing ? 8 : 5;
    for (let i = 0; i < particleCount; i += 1) {
      const orbit = fieldRadius * (0.52 + ((i * 37) % 54) / 100);
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

$('playButton').addEventListener('click', async (event) => {
  await togglePlayback();
  if (event.detail) event.currentTarget.blur();
});
$('loopButton').addEventListener('click', (event) => {
  repeatMode = repeatMode === 'all' ? 'one' : 'all';
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
showControls(true);
requestAnimationFrame(drawAudioLight);
