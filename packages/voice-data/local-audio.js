// Browser-only draft import storage. Never describe this as cloud backup.
const DB='shenshu:local-audio', STORE='recordings';
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function operation(mode,fn){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);const req=fn(tx.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export const listLocalAudio=()=>operation('readonly',store=>store.getAll());
export const getLocalAudio=id=>operation('readonly',store=>store.get(id));
export const saveLocalAudio=record=>operation('readwrite',store=>store.put(record));
export const removeLocalAudio=id=>operation('readwrite',store=>store.delete(id));
export async function importLocalAudio(file,title,notes=''){
  if(!file||!(file.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name)))throw Error('请选择音频文件');
  if(file.size>40*1024*1024)throw Error('当前单个音频最多 40 MB');
  const id='local-'+crypto.randomUUID();
  const record={id,title:title.trim()||file.name.replace(/\.[^.]+$/,''),notes:notes.trim(),date:new Date().toISOString().slice(0,10),duration:0,mime:file.type,blob:file,createdAt:Date.now()};
  await saveLocalAudio(record);return record;
}
