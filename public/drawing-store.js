/* Lossless vector chunks. Packed points keep their original precision. */
const DrawingStore=(()=>{
 const pack=stroke=>{const pressure=stroke.points.some(p=>p.length===3);return {tool:stroke.tool||'ink',color:stroke.color,width:stroke.width,stride:pressure?3:2,points:stroke.points.flatMap(p=>pressure?[p[0],p[1],p.length===3?p[2]:null]:p)}};
 function unpack(s){const points=[];for(let i=0;i<s.points.length;i+=s.stride){const p=[s.points[i],s.points[i+1]];if(s.stride===3&&s.points[i+2]!==null)p.push(s.points[i+2]);points.push(p)}return {tool:s.tool,color:s.color,width:s.width,points}}
 async function save(payload,request,onProgress){
  if(payload.format!==2||!payload.drawing.length)return request('notes',payload);
  const chunks=[];let group=[],size=2;for(const s of payload.drawing){const packed=pack(s),bytes=JSON.stringify(packed).length;if(group.length&&(size+bytes>80000||group.length>=40)){chunks.push(group);group=[];size=2}group.push(packed);size+=bytes+1}if(group.length)chunks.push(group);
  const signature=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));const upload=Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join('');
  await request('uploads',{upload,author:payload.author,nonce:payload.nonce,paper:payload.paper,text_size:payload.text_size,total:chunks.length});
  for(let i=0;i<chunks.length;i++){onProgress(i+1,chunks.length);await request('uploads/chunk',{upload,author:payload.author,part:i,drawing:chunks[i]})}
  return request('uploads/commit',{upload,author:payload.author});
 }
 async function hydrate(n,request){if(n.format!==4)return n;const drawing=[];for(let start=0;start<n.drawing.chunks;start+=3){const results=await Promise.all(Array.from({length:Math.min(3,n.drawing.chunks-start)},(_,i)=>request('drawing/'+n.drawing.upload+'/'+(start+i))));for(const result of results)drawing.push(...result.drawing.map(unpack))}return {...n,format:2,drawing}}
 return {pack,unpack,save,hydrate};
})();
const Drafts=(()=>{
 const open=new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('Draft storage unavailable'));const req=indexedDB.open('project-duet',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});open.catch(()=>{});
 const previewDrafts=new Map();
 async function run(mode,key,value){if(window.DuetDev){if(mode==='get')return previewDrafts.get(key);if(mode==='put')previewDrafts.set(key,structuredClone(value));else previewDrafts.delete(key);return;}const db=await open;return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const req=mode==='get'?store.get(key):mode==='put'?store.put(value,key):store.delete(key);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 return {get:async(key,fallback)=>{try{return await run('get',key)??fallback}catch{return fallback}},set:(key,value)=>run('put',key,value),remove:key=>run('delete',key)};
})();
