'use strict';
/* Private drafts: your own Drafts shelf, saving a page to it, and picking a draft up again.
   Drafts belong to whoever saved them, on any of their devices. A draft is saved to the server (small JPEG for the shelf plus the strokes in chunks);
   the copy on this device is only a crash buffer for edits that have not reached the server yet. */
const Shelf=(()=>{
 const AUTOSAVE_MS=6000;
 let list=[],bin=[],loaded=false,stampT=null,count=0,saving=null,again=false,timer=null,binOpen=false;
  const hex=()=>uid();
 const dlg=$('#drafts'),grid=$('#drafts-grid'),empty=$('#drafts-empty'),err=$('#drafts-error');

 function ago(t){const s=Math.max(0,Date.now()/1000-t);if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';
  return new Date(t*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:(window.DUET_ROOM&&window.DUET_ROOM.timezone)||'Asia/Kolkata'})}
 const status=text=>{$('#draft-status').textContent=text};

 // ---- badge ----
 function badge(n){count=n;const b=$('#drafts-count');b.hidden=!n;b.textContent=n>9?'9+':String(n);$('#drafts-open').setAttribute('aria-label','Drafts'+(n?', '+n+' saved':''))}
 // Called with every note poll: {n, t} for the live drafts. A changed stamp means the shelf is out of date.
 function stamp(s){if(!s)return;badge(s.n);if(dlg.open&&stampT!==null&&s.t!==stampT)refresh()}

 async function refresh(){
  try{const r=await rawApi('drafts');list=r.drafts;stampT=r.stamp.t;loaded=true;badge(r.stamp.n);err.textContent='';if(dlg.open)draw()}
  catch(e){if(dlg.open)err.textContent=e.message}
 }

 // ---- saving ----
 function thumbnail(drawing,paper){
  const src=document.createElement('canvas');src.width=1000;src.height=720;drawStrokes(src,drawing);
  const out=document.createElement('canvas');out.width=320;out.height=230;const c=out.getContext('2d');
  c.fillStyle=PAPER_HEX[paper]||PAPER_HEX.cream;c.fillRect(0,0,out.width,out.height);c.drawImage(src,0,0,out.width,out.height);
  let q=.72,url=out.toDataURL('image/jpeg',q);while(url.length>23000&&q>.3){q-=.12;url=out.toDataURL('image/jpeg',q)}
  return url.startsWith('data:image/jpeg')&&url.length<=23000?url:undefined;
 }
 // Uploads one snapshot as the next revision of draft `id`. Returns the draft's new metadata.
 async function push({id,base,title,paper,nonce,drawing}){
  if(!drawing.length)throw Object.assign(Error('Draw or write something first.'),{code:'empty'});
  const chunks=[];let group=[],size=2;for(const s of drawing){const packed=DrawingStore.pack(s),bytes=JSON.stringify(packed).length;if(group.length&&(size+bytes>80000||group.length>=40)){chunks.push(group);group=[];size=2}group.push(packed);size+=bytes+1}if(group.length)chunks.push(group);
  const save=hex(),thumb=thumbnail(drawing,paper);let last;
  for(let i=0;i<chunks.length;i++){
   last=await rawApi('drafts',{id,save,part:i,total:chunks.length,base,nonce,paper,title,drawing:chunks[i],...(i===chunks.length-1&&thumb?{thumb}:{})});
  }
  return last.draft;
 }
 // Saves the open page. Quiet saves (autosave, closing) never show errors in the footer.
 async function saveNow(quiet=false){
  clearTimeout(timer);
  if(saving){again=true;return saving}
  if(!$('#editor').open&&!quiet)return;
  commitText();
  const comp=composition(),marker=editCount;
  if(!comp.drawing.length){if(!quiet)$('#post-error').textContent='Draw or write something first.';return}
  const fresh=!draftId,oldKey=draftKey(),id=draftId||hex(),base=draftId?draftBase:0;
  status('Saving…');
  saving=(async()=>{
   try{
    let meta;
    try{meta=await push({id,base,title:draftTitle,paper:comp.paper,nonce:comp.nonce,drawing:comp.drawing})}
    catch(e){
     if(!['draft_conflict','draft_deleted','draft_gone'].includes(e.code))throw e;
     // The draft was changed or removed from another device since this page was loaded. Nothing is overwritten: this version becomes its own draft.
     const copyId=hex();
     meta=await push({id:copyId,base:0,title:((draftTitle||'Untitled')+' (mine)').slice(0,60),paper:comp.paper,nonce:hex(),drawing:comp.drawing});
     await Drafts.remove(draftKey()).catch(()=>{});draftId=meta.id;toast(e.code==='draft_conflict'?'A newer version was saved elsewhere, so this one was kept as a copy.':'That draft was removed, so this one was kept as a new one.');
    }
    if(fresh){await Drafts.remove(oldKey).catch(()=>{})}
    draftId=meta.id;draftBase=meta.rev;nonce=comp.nonce;
    if(editCount===marker)savedCount=marker;
    $('#post-error').textContent='';status('Saved to drafts · '+ago(meta.updated));refresh();
    if(!quiet&&fresh)toast('Saved to drafts');
    flushDraft();
   }catch(e){
    status(e.code==='shelf_full'?'Not saved · shelf is full':'Not saved yet · kept on this device');
    if(!quiet)$('#post-error').textContent=e.message;
    throw e;
   }finally{saving=null;if(again){again=false;queue()}}
  })();
  return saving;
 }
 function queue(){if(!draftId||!$('#editor').open)return;status('Unsaved changes');clearTimeout(timer);timer=setTimeout(()=>saveNow(true).catch(()=>{}),AUTOSAVE_MS)}
 // Leaving the editor: send anything unsent. A failure is fine; the edits stay on this device and come back when the draft is reopened.
 async function leave(){
  clearTimeout(timer);
  if(draftId&&editCount!==savedCount){try{await saveNow(true)}catch{toast('Could not reach the shelf. Your changes are kept on this device.')}}
  if(saving)try{await saving}catch{/* handled above */}
 }
 function stuck(id){clearTimeout(timer);rawApi('drafts/delete',{id,stuck:true}).then(refresh).catch(()=>{});Drafts.remove(draftKey()).catch(()=>{})}
 // Edits found on this device that no longer fit the server's version: keep them as a draft of their own, then load the server's.
 async function forkLocal(local,sd){
  try{await push({id:hex(),base:0,title:((local.title||sd.title||'Untitled')+' (mine)').slice(0,60),paper:local.paper||sd.paper,nonce:hex(),drawing:local.strokes||local.drawing||[]});await Drafts.remove(draftKey()).catch(()=>{});toast('Your unsaved edits were kept as a separate draft.');refresh()}
  catch{toast('Opened the saved version. Your unsaved edits are still on this device.')}
 }

 const began=()=>{clearTimeout(timer);if(draftId){status('Saved to drafts');if(editCount!==savedCount)queue()}else status('Draft saved on this device')};
 const ended=()=>clearTimeout(timer);

 // ---- opening ----
 async function open(id){
  err.textContent='';
  try{
   const r=await rawApi('drafts/'+id),d=r.draft;
   if(dlg.open)dlg.close();
   await openEditor({id:d.id,rev:d.rev,title:d.title,paper:d.paper,nonce:d.nonce,drawing:d.drawing.map(DrawingStore.unpack)});
  }catch(e){err.textContent=e.message;if(/gone/.test(e.message))refresh()}
 }

 // ---- the shelf ----
 function card(d,i){
  const a=document.createElement('article');a.className='note draft-card '+d.paper;addTapes(a,parseInt(d.id.slice(0,8),16));
  const b=document.createElement('button');b.type='button';b.className='draft-open';b.setAttribute('aria-label','Open draft '+(d.title||'without a name'));
  const img=document.createElement('img');img.className='draft-thumb';img.alt='';if(d.thumb)img.src=d.thumb;else img.hidden=true;
  const name=document.createElement('strong');name.className='draft-name';name.textContent=d.title||'Untitled';
  const meta=document.createElement('span');meta.className='draft-meta';meta.textContent='Saved '+ago(d.updated);
  b.append(img,name,meta);b.onclick=()=>open(d.id);a.append(b);
  const row=document.createElement('div');row.className='draft-actions';
  row.append(tool('i-copy','Make a copy',()=>copyDraft(d.id)),tool('i-trash','Delete draft',()=>remove(d.id)));a.append(row);return a;
 }
 function tool(icon,label,fn){const b=document.createElement('button');b.type='button';b.className='icon-button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<svg><use href="#'+icon+'"/></svg>';b.onclick=e=>{e.stopPropagation();fn(b)};return b}
 function draw(){
  grid.replaceChildren(...list.map(card));empty.hidden=list.length>0;
  const t=$('#bin-toggle');t.hidden=false;
 }
 async function copyDraft(id){try{await rawApi('drafts/copy',{id});toast('Copy added to the shelf');refresh()}catch(e){err.textContent=e.message}}
 async function remove(id){try{await rawApi('drafts/delete',{id});list=list.filter(d=>d.id!==id);badge(list.length);draw();toast('Moved to recently deleted');if(binOpen)loadBin()}catch(e){err.textContent=e.message}}
 async function loadBin(){
  try{const r=await rawApi('drafts?deleted=1');bin=r.drafts}catch{bin=[]}
  const box=$('#bin-list');box.replaceChildren(...bin.map(d=>{const row=document.createElement('div');row.className='bin-row';const n=document.createElement('span');n.textContent=(d.title||'Untitled')+' · '+ago(d.deleted);
   const b=tool('i-undo','Restore',async()=>{try{await rawApi('drafts/restore',{id:d.id});refresh();loadBin()}catch(e){err.textContent=e.message}});row.append(n,b);return row}));
  if(!bin.length){const p=document.createElement('p');p.className='bin-empty';p.textContent='Nothing deleted lately.';box.append(p)}
 }
 $('#bin-toggle').onclick=()=>{binOpen=!binOpen;$('#bin-toggle').setAttribute('aria-expanded',String(binOpen));$('#bin-list').hidden=!binOpen;if(binOpen)loadBin()};
 $('#drafts-open').onclick=()=>{err.textContent='';draw();dlg.showModal();refresh()};
 $('#drafts-close').onclick=()=>dlg.close();
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
 $('#save-draft').onclick=()=>saveNow(false).catch(()=>{});
 window.addEventListener('duet:view',()=>{if(currentView==='walls'&&!loaded)refresh()});
if(typeof currentView!=='undefined'&&currentView==='walls')setTimeout(refresh,0);
 return {stamp,queue,began,ended,leave,stuck,forkLocal,refresh};
})();
