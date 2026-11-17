/* Lossless vector chunks. Packed points keep their original precision. */
const DrawingStore=(()=>{
 const pack=stroke=>{if(stroke.tool==='fill')return {tool:'fill',color:stroke.color,width:1,stride:2,points:stroke.points.flat(),loops:stroke.loops};if(stroke.tool==='text')return {tool:'text',color:stroke.color,width:stroke.width||1,size:stroke.size,w:stroke.w,h:stroke.h,text:stroke.text,stride:2,points:[stroke.points[0][0],stroke.points[0][1]]};const pressure=stroke.points.some(p=>p.length===3);return {tool:stroke.tool||'ink',color:stroke.color,width:stroke.width,stride:pressure?3:2,points:stroke.points.flatMap(p=>pressure?[p[0],p[1],p.length===3?p[2]:null]:p)}};
 function unpack(s){const points=[];for(let i=0;i<s.points.length;i+=s.stride){const p=[s.points[i],s.points[i+1]];if(s.stride===3&&s.points[i+2]!==null)p.push(s.points[i+2]);points.push(p)}return s.tool==='text'?{tool:'text',color:s.color,width:s.width,size:s.size,w:s.w,h:s.h,text:s.text,points}:s.tool==='fill'?{tool:'fill',color:s.color,width:s.width,points,loops:s.loops}:{tool:s.tool,color:s.color,width:s.width,points}}
 const ctxOf=a=>a==='chat'?'chat':'aryan';
 const hex=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
 // On a locked wall everything is sealed in the browser first; the server only ever receives ciphertext.
 async function saveSealed(payload,request,onProgress,replace,fmt){
  const sealed=await Vault.seal(Vault.keys(),{fmt:fmt||2,text:payload.text||'',drawing:(payload.drawing||[]).map(pack)},ctxOf(payload.author));
  const parts=Vault.pieces(sealed);
  if(parts.length===1)return request('notes',{author:payload.author,nonce:payload.nonce,paper:payload.paper,text_size:payload.text_size,format:5,sealed,replace:!!replace});
  const upload=await hex(sealed);
  await request('uploads',{upload,author:payload.author,nonce:payload.nonce,paper:payload.paper,text_size:payload.text_size,total:parts.length,sealed:true,replace:!!replace});
  for(let i=0;i<parts.length;i++){if(onProgress)onProgress(i+1,parts.length);await request('uploads/chunk',{upload,author:payload.author,part:i,sealed:parts[i]})}
  return request('uploads/commit',{upload,author:payload.author});
 }
 // Lock an older readable note in place (used once per wall, right after it is first opened).
 async function reseal(note,format,request){return saveSealed({author:note.author,nonce:note.nonce,paper:note.paper,text_size:note.text_size,text:note.text,drawing:note.drawing},request,null,true,format===4?2:format)}
 async function openSealed(n,request){
  const locked={...n,format:2,text:'',drawing:[],locked:true};if(!window.Vault||!Vault.keys())return locked;
  try{let sealed=n.text;
   if(n.format===6){let whole;try{whole=(await request('drawing/'+n.drawing.upload)).drawing}catch{whole=[];for(let i=0;i<n.drawing.chunks;i++)whole.push(...(await request('drawing/'+n.drawing.upload+'/'+i)).drawing)}sealed=whole.join('')}
   const o=await Vault.open(Vault.keys(),sealed,ctxOf(n.author));
   return {...n,format:o.fmt||2,text:o.text||'',drawing:(o.drawing||[]).map(unpack)};
  }catch{return locked}
 }
 async function save(payload,request,onProgress){
  if(window.Vault&&Vault.keys()&&payload.format===2)return saveSealed(payload,request,onProgress,false,2);
  if(payload.format!==2||!payload.drawing.length)return request('notes',payload);
  const chunks=[];let group=[],size=2;for(const s of payload.drawing){const packed=pack(s),bytes=JSON.stringify(packed).length;if(group.length&&(size+bytes>80000||group.length>=40)){chunks.push(group);group=[];size=2}group.push(packed);size+=bytes+1}if(group.length)chunks.push(group);
  const signature=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));const upload=Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join('');
  await request('uploads',{upload,author:payload.author,nonce:payload.nonce,paper:payload.paper,text_size:payload.text_size,total:chunks.length});
  for(let i=0;i<chunks.length;i++){onProgress(i+1,chunks.length);await request('uploads/chunk',{upload,author:payload.author,part:i,drawing:chunks[i]})}
  return request('uploads/commit',{upload,author:payload.author});
 }
 async function hydrate(n,request){if(n.format===5||n.format===6)return openSealed(n,request);if(n.format!==4)return n;
  // One request returns the whole drawing (and the browser keeps it); older servers answer chunk by chunk.
  try{const whole=await request('drawing/'+n.drawing.upload);return {...n,format:2,drawing:whole.drawing.map(unpack)}}catch{/* fall back to chunks */}
  const drawing=[];for(let start=0;start<n.drawing.chunks;start+=3){const results=await Promise.all(Array.from({length:Math.min(3,n.drawing.chunks-start)},(_,i)=>request('drawing/'+n.drawing.upload+'/'+(start+i))));for(const result of results)drawing.push(...result.drawing.map(unpack))}return {...n,format:2,drawing}}
 return {pack,unpack,save,hydrate,reseal};
})();
const Drafts=(()=>{
 const open=new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('Draft storage unavailable'));const req=indexedDB.open('project-duet',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});open.catch(()=>{});
 const previewDrafts=new Map();
 async function run(mode,key,value){if(window.DuetDev){if(mode==='get')return previewDrafts.get(key);if(mode==='put')previewDrafts.set(key,structuredClone(value));else previewDrafts.delete(key);return;}const db=await open;return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const req=mode==='get'?store.get(key):mode==='put'?store.put(value,key):store.delete(key);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 return {get:async(key,fallback)=>{try{return await run('get',key)??fallback}catch{return fallback}},set:(key,value)=>run('put',key,value),remove:key=>run('delete',key)};
})();
