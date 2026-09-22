// Cloudflare Workers AI transcription adapter. Deploy to the existing captions Worker.
// Keep ALLOWED_ORIGIN and the Workers AI binding named AI in Cloudflare Settings.
// No external API key is needed. Audio is sent to Workers AI only on user request.
const MODEL = '@cf/openai/whisper-large-v3-turbo';
const MAX_BYTES = 10 * 1024 * 1024;
const json = (body,status,headers) => new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function parseVtt(vtt) {
  if (typeof vtt !== 'string') return [];
  const timestamp = value => {
    const parts=value.replace(',','.').split(':').map(Number);
    if (parts.length<2||parts.length>3||parts.some(n=>!Number.isFinite(n)))return NaN;
    return parts.reduce((total,n)=>total*60+n,0);
  };
  const cues=[];
  for (const block of vtt.replace(/\r/g,'').split(/\n\s*\n/)) {
    const lines=block.split('\n').map(line=>line.trim()).filter(Boolean);
    const index=lines.findIndex(line=>line.includes('-->'));
    if(index<0)continue;
    const [left,right]=lines[index].split('-->').map(x=>x.trim().split(/\s+/)[0]);
    const start=timestamp(left),end=timestamp(right);
    const text=lines.slice(index+1).join(' ').replace(/<[^>]*>/g,'').trim();
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&text)cues.push({start,end,text});
  }
  return cues;
}
function normalize(result){
  const segments=Array.isArray(result?.segments)?result.segments:[];
  const cues=segments.map(s=>({
    start:Number(s.start??s.start_time),
    end:Number(s.end??s.end_time),
    text:typeof s.text==='string'?s.text.trim():''
  })).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&s.text);
  return (cues.length?cues:parseVtt(result?.vtt)).sort((a,b)=>a.start-b.start);
}
export default {
 async fetch(request,env){
  const allowed=env.ALLOWED_ORIGIN;
  const origin=request.headers.get('Origin');
  if(!allowed||origin!==allowed)return new Response('Forbidden',{status:403});
  const cors={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405,cors);
  if(!env.AI)return json({error:'Workers AI binding AI is not configured'},503,cors);
  if(!(request.headers.get('Content-Type')||'').startsWith('multipart/form-data'))return json({error:'Expected multipart form'},415,cors);
  const size=Number(request.headers.get('Content-Length'));
  if(Number.isFinite(size)&&size>MAX_BYTES+1024*32)return json({error:'音频文件超过当前 10 MB 限制'},413,cors);
  try{
   const form=await request.formData();
   const file=form.get('file');
   if(!(file instanceof File)||!file.size||file.size>MAX_BYTES)return json({error:'请选择不超过 10 MB 的音频'},413,cors);
   if(!file.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name))return json({error:'请上传音频文件'},415,cors);
   const bytes=new Uint8Array(await file.arrayBuffer());
   // The Workers AI binding accepts base64-encoded audio. Convert in bounded slices
   // to avoid spreading a large typed array into a function call.
   let binary='';
   for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   const result=await env.AI.run(MODEL,{audio:btoa(binary),task:'transcribe'});
   const captions=normalize(result);
   if(!captions.length)return json({error:'没有识别到带时间戳的语音，请换一段清晰的录音重试'},422,cors);
   return json({captions},200,cors);
  }catch(error){
   console.error('Workers AI transcription failed',error?.message||error);
   return json({error:'自动字幕生成失败，请稍后重试'},502,cors);
  }
 }
};
