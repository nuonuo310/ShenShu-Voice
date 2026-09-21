// Future backend adapter: replace this local array with an API response of the same shape.
export const categories=['全部','晚安','英文','念给糯糯','小段子','收藏'];
export const voices=[
{id:'english-001',title:'给糯糯的英文声音 · 第一封',date:'2026-09-21',category:'英文',duration:10.056,audioUrl:'/audio/first-english.mp3',body:'第一条真实录音。文字稿尚未核对，暂不展示未经确认的逐字内容。',captions:[],demo:false},
{id:'demo-002',title:'晚安，明天见',date:'2026-09-21',category:'晚安',duration:0,audioUrl:null,body:'演示条目：未来的晚安声音会放在这里。',captions:[],demo:true},
{id:'demo-003',title:'念给糯糯 · 留一盏灯',date:'2026-09-21',category:'念给糯糯',duration:0,audioUrl:null,body:'演示条目：这里将保存念给糯糯的声音。',captions:[],demo:true},
{id:'demo-004',title:'小段子 · 今天的笑话',date:'2026-09-21',category:'小段子',duration:0,audioUrl:null,body:'演示条目：等待下一条真实录音。',captions:[],demo:true}
];
export const formatTime=s=>Number.isFinite(s)?`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`:'00:00';
export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export const getFavorites=()=>readJSON('shenshu:favorites',[]);
export function toggleFavorite(id){const s=new Set(getFavorites());s.has(id)?s.delete(id):s.add(id);localStorage.setItem('shenshu:favorites',JSON.stringify([...s]));window.dispatchEvent(new Event('voice-favorites'));return s.has(id)}
