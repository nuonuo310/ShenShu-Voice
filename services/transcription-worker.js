// Deploy separately from GitHub Pages. Set OPENAI_API_KEY and ALLOWED_ORIGIN as Worker secrets/config.
// Audio is sent to the transcription provider only after the user requests transcription.
// No API key is ever exposed to the browser.
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  const allowed=env.ALLOWED_ORIGIN;
  const cors={'Access-Control-Allow-Origin':allowed||'null','Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(!allowed||origin!==allowed)return new Response('Forbidden',{status:403});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:cors});
  if(!env.OPENAI_API_KEY)return new Response(JSON.stringify({error:'Transcription service is not configured'}),{status:503,headers:{...cors,'Content-Type':'application/json'}});
  const type=request.headers.get('Content-Type')||'';
  if(!type.startsWith('multipart/form-data'))return new Response('Expected multipart form',{status:415,headers:cors});
  try{
   const form=await request.formData();
   const file=form.get('file');
   if(!(file instanceof File)||file.size===0||file.size>25*1024*1024)return new Response(JSON.stringify({error:'Audio must be 25 MB or smaller'}),{status:413,headers:{...cors,'Content-Type':'application/json'}});
   const upstream=new FormData();
   upstream.set('file',file,file.name||'recording.mp3');
   upstream.set('model','whisper-1');
   upstream.set('response_format','verbose_json');
   upstream.append('timestamp_granularities[]','segment');
   const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},body:upstream});
   if(!response.ok)return new Response(JSON.stringify({error:'Transcription failed ('+response.status+')'}),{status:502,headers:{...cors,'Content-Type':'application/json'}});
   const data=await response.json();
   const captions=(data.segments||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&typeof s.text==='string'&&s.text.trim()).map(s=>({start:s.start,end:s.end,text:s.text.trim()}));
   if(!captions.length)return new Response(JSON.stringify({error:'No speech detected'}),{status:422,headers:{...cors,'Content-Type':'application/json'}});
   return new Response(JSON.stringify({captions}),{headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return new Response(JSON.stringify({error:'Could not process audio'}),{status:500,headers:{...cors,'Content-Type':'application/json'}});}
 }
};
