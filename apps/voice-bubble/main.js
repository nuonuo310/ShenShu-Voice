import { voices, formatTime, getFavorites, toggleFavorite } from '../../packages/voice-data/index.js';
import './style.css';
const app=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const voice=voices.find(v=>v.id===params.get('voice')&&v.audioUrl)||voices.find(v=>v.audioUrl);
const audio=new Audio();audio.preload='metadata';audio.playsInline=true;
const heights=[9,17,26,14,22,33,18,12,29,36,19,13,23,31,16,10,22,35,25,13,19,30,17,11,24,34,20,12,26,16,9,23];
const wave=heights.map((h,i)=>'<i style="--h:'+h+'px;--i:'+i+'"></i>').join('');
app.innerHTML='<div class="chat-preview"><p class="preview-label">聊天中的语音 · 独立预览</p><div class="message"><span class="sender">SHEN</span><div class="bubble" role="group" aria-label="沈述的语音"><button id="play" type="button" aria-label="播放语音"><span class="glyph"></span></button><div class="wave" id="wave" aria-hidden="true">'+wave+'</div><span class="duration" id="duration">'+formatTime(voice?.duration||0,false)+'</span><button id="favorite" class="favorite" type="button" aria-label="收藏到声音馆" aria-pressed="false"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 C35 22 42 29 59 32 C42 35 35 42 32 59 C29 42 22 35 5 32 C22 29 29 22 32 5Z"/></svg></button></div><p class="error" id="error" role="status"></p></div><p class="preview-foot">文字保留在聊天正文中，气泡只负责播放。</p></div>';
const $=id=>document.getElementById(id);
if(voice){audio.src=voice.audioUrl;}else{$('play').disabled=true;$('error').textContent='暂无可播放的声音。';}
const favorite=$('favorite');
function syncFavorite(){
  let saved=false;
  try { saved=Boolean(voice && getFavorites().includes(voice.id)); } catch {}
  favorite.classList.toggle('is-saved',saved);
  favorite.setAttribute('aria-pressed',String(saved));
  favorite.setAttribute('aria-label',saved?'取消收藏':'收藏到声音馆');
  favorite.title=saved?'取消收藏':'收藏到声音馆';
}
favorite.disabled=!voice?.audioUrl;
favorite.addEventListener('click',()=>{
  if(!voice?.audioUrl)return;
  try { toggleFavorite(voice.id); syncFavorite(); $('error').textContent=''; }
  catch { $('error').textContent='收藏保存失败，请检查浏览器存储设置。'; }
});
window.addEventListener('storage',event=>{if(event.key==='shenshu:favorites')syncFavorite();});
window.addEventListener('voice-favorites',syncFavorite);
syncFavorite();
let frame=0;
function paint(){const d=Number.isFinite(audio.duration)?audio.duration:voice?.duration||0;const progress=d?Math.min(1,audio.currentTime/d):0;$('duration').textContent=formatTime(d,false);$('wave').style.setProperty('--progress',progress*100+'%');$('wave').querySelectorAll('i').forEach((bar,i)=>bar.classList.toggle('heard',(i+.5)/heights.length<=progress));$('play').classList.toggle('playing',!audio.paused);$('play').setAttribute('aria-label',audio.paused?'播放语音':'暂停语音');if(!audio.paused)frame=requestAnimationFrame(paint);}
$('play').addEventListener('click',async()=>{try{if(audio.paused)await audio.play();else audio.pause();$('error').textContent='';}catch{$('error').textContent='音频播放失败，请稍后重试。';}paint();});
audio.addEventListener('play',()=>{cancelAnimationFrame(frame);paint()});audio.addEventListener('pause',()=>{cancelAnimationFrame(frame);paint()});audio.addEventListener('ended',()=>{cancelAnimationFrame(frame);paint()});audio.addEventListener('loadedmetadata',paint);audio.addEventListener('error',()=>{$('error').textContent='音频加载失败。';});paint();
