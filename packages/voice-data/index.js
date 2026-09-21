// Future backend adapter: replace this local array with an API response of the same shape.
export const categories=['全部','晚安','英文','念给糯糯','小段子','收藏'];
export const voices=[
{id:'english-001',title:'给糯糯的英文声音 · 第一封',shortTitle:'此刻',date:'2026-09-21',category:'英文',duration:10.056,audioUrl:'/audio/first-english.mp3',body:'My legs, my nose, my back, my toes. My arms, my eyes, my chest, my thighs.',intro:'Touch the light to begin.',introZh:'触碰这束光，听见哥哥的声音。',outro:'Stay a little longer.',outroZh:'再陪哥哥听一会儿。',captions:[{start:0,end:5.05,text:'My legs, my nose, my back, my toes.',translation:'我的双腿、鼻尖、后背与脚尖。'},{start:5.05,end:10.2,text:'My arms, my eyes, my chest, my thighs.',translation:'我的手臂、眼睛、胸口与大腿。'}],tone:1,demo:false},
{id:'demo-002',title:'晚安，明天见',shortTitle:'温柔',date:'2026-09-21',category:'晚安',duration:0,audioUrl:null,body:'演示条目：未来的晚安声音会放在这里。',captions:[],tone:2,demo:true},
{id:'demo-003',title:'念给糯糯 · 留一盏灯',shortTitle:'安静',date:'2026-09-21',category:'念给糯糯',duration:0,audioUrl:null,body:'演示条目：这里将保存念给糯糯的声音。',captions:[],tone:3,demo:true},
{id:'demo-004',title:'小段子 · 今天的笑话',shortTitle:'向光',date:'2026-09-21',category:'小段子',duration:0,audioUrl:null,body:'演示条目：等待下一条真实录音。',captions:[],tone:4,demo:true}
];
export const formatTime=(s,padMinutes=true)=>Number.isFinite(s)?`${padMinutes?Math.floor(s/60).toString().padStart(2,'0'):Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`:(padMinutes?'00:00':'0:00');
export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export const getFavorites=()=>readJSON('shenshu:favorites',[]);
export function toggleFavorite(id){const s=new Set(getFavorites());s.has(id)?s.delete(id):s.add(id);localStorage.setItem('shenshu:favorites',JSON.stringify([...s]));window.dispatchEvent(new Event('voice-favorites'));return s.has(id)}
