'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const store={get(k,f=null){try{return JSON.parse(localStorage.getItem((window.DuetDev?'preview:':'')+k))??f}catch{return f}},set(k,v){try{localStorage.setItem((window.DuetDev?'preview:':'')+k,JSON.stringify(v));return true}catch{return false}},remove(k){try{localStorage.removeItem((window.DuetDev?'preview:':'')+k)}catch{}}};
const canvas=$('#drawing'), audio=$('#music');
let person=null, notes=new Map(), hasMore=false, syncing=false, currentView='welcome', syncCursor=0, initialized=false;
let strokes=[], redo=[], active=null, color='#594739', tool='pencil', paper='cream', nonce=null, posting=false, previewing=false, draftTimer=null;const toolSizes={pencil:4,ink:4,marker:8,erase:28};
let editorMode='canvas';
const wordCount=text=>(text.trim().match(/\S+/gu)||[]).length;
const titleName=p=>(window.DUET_ROOM&&window.DUET_ROOM.names[p])||(p==='chat'?'ChatChan':'Aryan Chan');const animalOf=p=>(window.DUET_ROOM&&window.DUET_ROOM.animals[p])||(p==='chat'?'deer':'cat');
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
async function rawApi(path,data){
  if(window.DuetDev)return window.DuetDev.request(path,data);
  let r;const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);try{r=await fetch('/api/'+path,{signal:controller.signal,method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(window.DUET_ROOM?{'X-Duet-Room':window.DUET_ROOM.slug}:{})},body:data?JSON.stringify(data):undefined})}catch{throw Error('Connection lost. Your draft is still on this device.')}finally{clearTimeout(deadline)}
  const result=await r.json();if(!r.ok){if(r.status===401&&path!=='unlock'){flushDraft();person=null;$('#editor').close();show('welcome')}const error=Error(result.error||'Could not save. Please try again.');error.code=result.code;error.note=result.note;throw error}return result;
}
async function api(path,data){try{const result=await rawApi(path,data);if(result.notes){for(let i=0;i<result.notes.length;i++)result.notes[i]=await DrawingStore.hydrate(result.notes[i],rawApi)}if(result.note)result.note=await DrawingStore.hydrate(result.note,rawApi);return result}catch(error){if(error.note)error.note=await DrawingStore.hydrate(error.note,rawApi);throw error}}
function show(view){currentView=view;window.dispatchEvent(new Event('duet:view'));requestAnimationFrame(placeMeadow);$('#identity-avatar').src='assets/portrait-'+animalOf(person)+'.svg';document.body.dataset.view=view;['welcome','choose','walls'].forEach(v=>$('#'+v).hidden=v!==view);$('#identity').hidden=!person;$('#identity-label').textContent=person?'Logged in as '+titleName(person):'';$('#switch').hidden=view!=='walls';$('#lock').hidden=view==='welcome';updateFavicon();}
function updateFavicon(){const href=person?'assets/favicon-'+animalOf(person)+'.svg':'assets/favicon.svg';let link=document.querySelector('link[rel="icon"]');if(!link){link=document.createElement('link');link.rel='icon';link.type='image/svg+xml';document.head.appendChild(link)}link.href=href;}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2600)}
// All sound and motion controls live in the settings sheet.
const audioSettings=store.get('duet-audio',{volume:30,muted:false});
$('#volume').value=audioSettings.volume;audio.volume=Math.max(0,Math.min(1,audioSettings.volume/100));audio.muted=audioSettings.muted;
function audioUI(){const playing=!audio.paused&&!audio.muted&&audio.volume>0;$('#music-label').textContent=playing?'Mute':'Play';$('#music-icon use').setAttribute('href',playing?'#i-muted':'#i-play');$('#mute').setAttribute('aria-label',playing?'Mute music':'Play music');$('#mute').setAttribute('aria-pressed',String(playing));$('#volume-value').textContent=$('#volume').value+'%'}
function saveAudio(){store.set('duet-audio',{volume:Number($('#volume').value),muted:audio.muted})}
async function startMusic(){if(audio.muted)return;try{await audio.play()}catch{}audioUI()}
$('#settings-open').onclick=()=>$('#settings').showModal();$('#settings-close').onclick=()=>$('#settings').close();
$('#mute').onclick=async()=>{if(audio.paused||audio.muted||!audio.volume){audio.muted=false;if(!audio.volume){audio.volume=.3;$('#volume').value=30}try{await audio.play()}catch{toast('Tap Play to start the music.')}}else audio.muted=true;saveAudio();audioUI()};
$('#volume').oninput=()=>{audio.volume=Number($('#volume').value)/100;audio.muted=audio.volume===0;saveAudio();audioUI()};audio.onpause=audioUI;audio.onplay=audioUI;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function motionUI(){document.body.classList.toggle('no-motion',reducedMotion.matches);$$('img[src*="assets/cat"],img[src*="assets/deer"]').forEach(img=>{img.src=img.src.replace(/(?:-still|-interact)?\.svg$/,reducedMotion.matches?'-still.svg':'.svg')})}
motionUI();reducedMotion.addEventListener('change',motionUI);
// Keep the animal loops continuous; changing image URLs restarts their timelines.

let soundContext, lastClick=0;
async function prepareSound(){soundContext??=new (window.AudioContext||window.webkitAudioContext)();if(soundContext.state!=='running')await soundContext.resume();return soundContext}
document.addEventListener('pointerdown',()=>{prepareSound().catch(()=>{})},{once:true,passive:true});
async function squish(){try{const now=performance.now();if(now-lastClick<45)return;lastClick=now;const context=await prepareSound();if(context.state!=='running')return;const t=context.currentTime+.008,osc=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();osc.type='triangle';osc.frequency.setValueAtTime(580,t);osc.frequency.exponentialRampToValueAtTime(190,t+.105);filter.type='lowpass';filter.frequency.value=1200;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.055,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+.14);osc.connect(filter).connect(gain).connect(context.destination);osc.start(t);osc.stop(t+.15);osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect()}}catch{}}
document.addEventListener('click',e=>{if(e.target.closest('button:not(:disabled)'))squish()},true);
$('#unlock').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#unlock-error').textContent='';startMusic();try{await api('unlock',{passphrase:$('#passphrase').value});$('#passphrase').value='';show('choose')}catch(e){$('#unlock-error').textContent=e.message}finally{b.disabled=false}};
$$('[data-person]').forEach(b=>b.onclick=async()=>{$$('[data-person]').forEach(choice=>choice.disabled=true);$('#choose-error').textContent='';try{b.classList.add('picked');await Promise.all([api('person',{person:b.dataset.person}),new Promise(resolve=>setTimeout(resolve,reducedMotion.matches?0:280))]);person=b.dataset.person;notes.clear();hasMore=false;syncCursor=0;initialized=false;render();show('walls');setWall(person);await sync();startMusic()}catch(e){$('#choose-error').textContent=e.message}finally{$$('[data-person]').forEach(choice=>choice.disabled=false);b.classList.remove('picked')}});
$('#switch').onclick=()=>show('choose');$('#home').onclick=()=>{if(person)show('walls')};$('#lock').onclick=async()=>{try{await api('logout',{});person=null;notes.clear();hasMore=false;syncCursor=0;initialized=false;render();show('welcome');audio.pause();audioUI()}catch(e){toast(e.message)}};
function setWall(owner){$$('.wall').forEach(w=>w.classList.toggle('active',w.dataset.owner===owner));$$('[data-wall]').forEach(b=>{b.classList.toggle('active',b.dataset.wall===owner);b.setAttribute('aria-pressed',String(b.dataset.wall===owner))})}
$$('[data-wall]').forEach(b=>b.onclick=()=>setWall(b.dataset.wall));
// Strokes remain editable vectors in SQLite; canvases are just their presentation.
function path(c,points,offset=0){c.beginPath();c.moveTo(points[0][0],points[0][1]+offset);for(let i=1;i<points.length-1;i++){const a=points[i],b=points[i+1];c.quadraticCurveTo(a[0],a[1]+offset,(a[0]+b[0])/2,(a[1]+b[1])/2+offset)}const end=points[points.length-1];c.lineTo(end[0],end[1]+offset)}
function pathPerp(c,points,dist){
  if(points.length<2){path(c,points,dist);return}
  const off=[];
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    let dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
    off.push([points[i][0]-dy/len*dist,points[i][1]+dx/len*dist]);
  }
  path(c,off,0);
}

function drawStroke(c,s){
  if(s.tool==='text'){drawText(c,s);return}if(!s.points.length)return;c.lineCap='round';c.lineJoin='round';const kind=s.tool||'ink';c.save();c.globalCompositeOperation=s.color==='erase'||kind==='erase'?'destination-out':'source-over';c.strokeStyle=s.color==='erase'?'#000':s.color;c.fillStyle=c.strokeStyle;c.lineWidth=s.width;c.globalAlpha=kind==='marker'?.28:kind==='pencil'?.68:1;
    if(s.points.length===1){c.beginPath();c.arc(s.points[0][0],s.points[0][1],s.width/2,0,Math.PI*2);c.fill()}
    else if(kind==='ink'&&s.points.some(p=>p.length===3)){
      for(let i=1;i<s.points.length;i++){
        const a=s.points[i-1],b=s.points[i];
        const pa=a[2]??1,pb=b[2]??1;
        c.lineWidth=s.width*(.35+.65*((pa+pb)/2));
        c.beginPath();
        if(i===1)c.moveTo(a[0],a[1]);
        else{const p=s.points[i-2];c.moveTo((p[0]+a[0])/2,(p[1]+a[1])/2)}
        if(i===s.points.length-1)c.lineTo(b[0],b[1]);
        else c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
        c.stroke();
      }
    }
    else{path(c,s.points);c.stroke();if(kind==='pencil'){c.globalAlpha=.22;c.lineWidth=Math.max(.6,s.width*.18);pathPerp(c,s.points,s.width*.22);c.stroke()}}c.restore();
}

function drawStrokes(target,list){const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);for(const s of list)drawStroke(c,s)}
function textLines(c,text,maxWidth){const out=[];for(const paragraph of text.split('\n')){if(!paragraph){out.push('');continue}let line='';for(const word of paragraph.split(/(?<=\s)/)){if(c.measureText(line+word).width<=maxWidth){line+=word;continue}if(line){out.push(line.trimEnd());line=''}for(const char of word){if(c.measureText(line+char).width>maxWidth&&line){out.push(line);line=''}line+=char}}out.push(line.trimEnd())}return out}
function compose(target,n,includeText=true){drawStrokes(target,n.drawing);if(!n.text||!includeText)return false;const c=target.getContext('2d'), size=n.text_size||40;c.save();c.font=`${size}px "Duet Script"`;c.fillStyle='#594739';c.textBaseline='top';const lines=textLines(c,n.text,880);lines.forEach((line,i)=>c.fillText(line,60,60+i*size*1.4));c.restore();return 60+lines.length*size*1.4>680}
function composition(){return {author:person,text:'',drawing:drawingForSave(),paper,nonce,format:2,text_size:40}}
// Live canvas: finished strokes sit on a cached layer, so a pointer move redraws only the stroke in progress (once per frame).
let baseCanvas=null,baseDirty=true,frame=0,rect=null;
const liveCtx=canvas.getContext('2d',{desynchronized:true});
function measure(){rect=canvas.getBoundingClientRect()}
function rebuildBase(){if(!baseCanvas){baseCanvas=document.createElement('canvas');baseCanvas.width=canvas.width;baseCanvas.height=canvas.height}drawStrokes(baseCanvas,hiddenIndex>=0?strokes.filter((_,i)=>i!==hiddenIndex):strokes);baseDirty=false}
function commitStroke(s){if(!baseDirty)drawStroke(baseCanvas.getContext('2d'),s)}
function paintLive(){cancelAnimationFrame(frame);frame=0;liveCtx.clearRect(0,0,canvas.width,canvas.height);if(baseDirty)rebuildBase();liveCtx.drawImage(baseCanvas,0,0);if(active)drawStroke(liveCtx,active)}
function schedulePaint(){if(!frame)frame=requestAnimationFrame(paintLive)}
function history(){$('#undo').disabled=posting||!undoStack.length;$('#redo').disabled=posting||!redoStack.length}
function repaint(){baseDirty=true;paintLive();history()}
function cropped(source){const c=source.getContext('2d'),d=c.getImageData(0,0,source.width,source.height).data;let left=source.width,top=source.height,right=0,bottom=0;for(let y=0;y<source.height;y+=2){for(let x=0;x<source.width;x+=2){if(d[(y*source.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}}if(right<left)return null;
  // Maintain breathing room without carrying an empty rectangular canvas onto the wall.
  const width=Math.min(source.width,Math.max(720,right-left+100));const x=Math.max(0,Math.min(source.width-width,(left+right-width)/2));const y=Math.max(0,top-28),height=Math.min(source.height-y,Math.max(100,bottom-top+58));const out=document.createElement('canvas');out.width=width;out.height=height;out.getContext('2d').drawImage(source,x,y,width,height,0,0,width,height);return out;
}
function strokeBounds(list){
  // Mirrors what cropped() finds on the rendered pixels (it samples every second pixel), without rendering anything.
  let l=1e9,t=1e9,r=-1e9,b=-1e9;
  for(const s of list){if(s.color==='erase'||s.tool==='erase')return null;if(s.tool==='text'){const x=s.points[0][0],y=s.points[0][1];if(x<l)l=x;if(x+s.w>r)r=x+s.w;if(y<t)t=y;if(y+s.h>b)b=y+s.h;continue}const kind=s.tool||'ink',pressure=kind==='ink'&&s.points.some(p=>p.length===3);
    for(const p of s.points){const h=(pressure&&s.points.length>1?s.width*(.35+.65*(p[2]??1)):s.width)/2;
      if(p[0]-h<l)l=p[0]-h;if(p[0]+h>r)r=p[0]+h;if(p[1]-h<t)t=p[1]-h;
      let down=h;if(kind==='pencil'&&s.points.length>1)down=Math.max(h,s.width*.25+Math.max(.6,s.width*.18)/2);
      if(p[1]+down>b)b=p[1]+down}}
  if(r<l)return null;
  const even=(v,up)=>up?2*Math.ceil(v/2):2*Math.floor(v/2);
  return{left:Math.max(0,even(Math.floor(l),true)),top:Math.max(0,even(Math.floor(t),true)),right:Math.min(998,even(Math.ceil(r)-1,false)),bottom:Math.min(718,even(Math.ceil(b)-1,false))}}
const lazyPaint='IntersectionObserver'in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){lazyPaint.unobserve(e.target);e.target.__paint?.()}},{rootMargin:'700px'}):null;
function croppedStrokes(list,H,lazy){const bb=strokeBounds(list);if(!bb)return null;const W=1000,width=Math.min(W,Math.max(720,bb.right-bb.left+100)),x=Math.max(0,Math.min(W-width,(bb.left+bb.right-width)/2)),y=Math.max(0,bb.top-28),height=Math.min(H-y,Math.max(100,bb.bottom-bb.top+58));const out=document.createElement('canvas');out.width=width;out.height=height;const hasText=list.some(s=>s.tool==='text');let fontTried=false;const paint=()=>{const c=out.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,out.width,out.height);c.translate(-x,-y);for(const s of list)drawStroke(c,s);out.__paint=null;if(hasText&&!fontTried&&!document.fonts.check('40px "Duet Script"')){fontTried=true;document.fonts.load('40px "Duet Script"').then(paint)}};if(lazy&&lazyPaint){out.__paint=paint;lazyPaint.observe(out)}else paint();return out}
function makeCard(n,preview=false,lazy=false){const card=document.createElement('article');card.className='note '+n.paper;card.dataset.id=n.id||'';const hash=[...(n.nonce||String(n.id))].reduce((value,ch)=>Math.imul(value^ch.charCodeAt(0),16777619)>>>0,2166136261);const arrangement=hash%6;card.dataset.tape=arrangement;
  for(let i=0;i<(arrangement===1||arrangement===3?2:1);i++){const tape=document.createElement('img');tape.src=['assets/tape.svg','assets/tape-washi.svg','assets/tape-torn.svg'][(Math.floor(hash/7)+i)%3];tape.alt='';tape.className='tape';tape.style.opacity=String(.79+(hash%14)/100);card.append(tape)}
  if(n.format===3){const text=document.createElement('p');text.className='written-note';text.dataset.size=n.text_size||40;text.textContent=n.text;card.append(text)}
  let drawing=n.format!==3&&!n.text?croppedStrokes(n.drawing,n.format===2?720:650,lazy):null;
  if(!drawing&&n.format!==3){const source=document.createElement('canvas');source.width=1000;source.height=n.format===2?720:650;
  if(n.format===2)compose(source,n);else{if(n.text){const p=document.createElement('p');p.textContent=n.text;card.append(p)}drawStrokes(source,n.drawing)}
  drawing=cropped(source)}if(drawing){drawing.setAttribute('role','img');{const said=(n.drawing||[]).filter(s=>s.tool==='text').map(s=>s.text).join(' · ');drawing.setAttribute('aria-label',n.text?'Note: '+n.text:said?'Note from '+titleName(n.author||person)+': '+said:'Drawing from '+titleName(n.author||person))};card.append(drawing)}
  if(!preview){const date=document.createElement('time');date.dateTime=new Date(n.created*1000).toISOString();date.textContent=new Date(n.created*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:(window.DUET_ROOM&&window.DUET_ROOM.timezone)||'Asia/Kolkata'});card.append(date)}return card;
}
function render(){
  const anchor=$$('.wall .note').find(el=>el.getClientRects().length&&el.getBoundingClientRect().bottom>0&&el.getBoundingClientRect().top<innerHeight),anchorTop=anchor?.getBoundingClientRect().top;
  for(const owner of ['chat','aryan']){
    const target=$('#'+owner+'-notes'),list=[...notes.values()].filter(n=>n.recipient===owner).sort((a,b)=>b.id-a.id),old=new Map([...target.children].map(el=>[Number(el.dataset.id),el]));
    for(const [id,el] of old)if(!notes.has(id))el.remove();
    let cursor=target.firstElementChild;
    for(const n of list){if(cursor&&Number(cursor.dataset.id)===n.id){cursor=cursor.nextElementSibling;continue}target.insertBefore(old.get(n.id)||makeCard(n,false,true),cursor)}
  }
  $('#older').hidden=!hasMore;
  if(anchor?.isConnected&&scrollY>100)scrollBy(0,anchor.getBoundingClientRect().top-anchorTop);
}
async function sync(older=false){
  if(syncing||!person)return;syncing=true;const owner=person;
  try{
    if(!initialized||older){const cursor=older&&notes.size?Math.min(...notes.keys()):null;const result=await api('notes'+(cursor?'?before='+cursor:''));if(owner!==person)return;for(const n of result.notes)notes.set(n.id,n);hasMore=result.more;if(!initialized){syncCursor=Math.max(0,...result.notes.map(n=>n.id));initialized=true}render()}
    else {let more=true;while(more){const result=await api('notes?after='+syncCursor);if(owner!==person)return;if(result.notes.length){for(const n of result.notes)notes.set(n.id,n);syncCursor=result.notes[result.notes.length-1].id;render();window.dispatchEvent(new Event('duet:updated'))}more=result.more}}
    $('#connection').textContent='';
  }catch(e){$('#connection').textContent=e.message}finally{syncing=false}
}
$('#older').onclick=()=>sync(true);if('IntersectionObserver' in window)new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&hasMore&&currentView==='walls')sync(true)},{rootMargin:'120px'}).observe($('#older'));
setInterval(()=>{if(currentView==='walls'&&!document.hidden)sync()},5000);window.addEventListener('online',()=>{if(currentView==='walls')sync()});document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft();else if(currentView==='walls')sync()});
// ===== Editor: one canvas for drawing and writing =====
const TEXT_SIZES=[28,40,56,80],LH=1.4,TEXT_FONT=size=>`${size}px "Duet Script", "Comic Sans MS", cursive`;
let undoStack=[],redoStack=[],textSel=null,textSize=40,hiddenIndex=-1,textDrag=null;
const textBox=$('#text-box'),textArea=$('#text-edit'),measureCtx=document.createElement('canvas').getContext('2d');
const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
function textMetrics(c,size){c.font=TEXT_FONT(size);const m=c.measureText('Hg'),asc=m.fontBoundingBoxAscent??size*.8,desc=m.fontBoundingBoxDescent??size*.2,lh=size*LH;return{lh,off:(lh-(asc+desc))/2+asc}}
function drawText(c,s){c.save();c.font=TEXT_FONT(s.size);c.fillStyle=s.color;c.textBaseline='alphabetic';c.globalAlpha=1;c.globalCompositeOperation='source-over';const m=textMetrics(c,s.size),lines=textLines(c,s.text,s.w);for(let i=0;i<lines.length;i++)c.fillText(lines[i],s.points[0][0],s.points[0][1]+i*m.lh+m.off);c.restore()}
function finalizeText(it){const text=it.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g,'').replace(/\s+$/,''),w=Math.round(clampN(it.w,100,1000));measureCtx.font=TEXT_FONT(it.size);const lines=text?textLines(measureCtx,text,w).length:1,h=Math.round(clampN(Math.ceil(lines*it.size*LH),1,720));return{tool:'text',color:it.color,width:1,size:it.size,w,h,text,points:[[Math.round(clampN(it.points[0][0],0,1000-w)),Math.round(clampN(it.points[0][1],0,720-h))]]}}
function drawingForSave(){if(!textSel)return strokes;const f=finalizeText(textSel.item),list=strokes.slice();if(!f.text.trim()){if(textSel.index>=0)list.splice(textSel.index,1)}else if(textSel.index>=0)list[textSel.index]=f;else list.push(f);return list}
function pushOp(op){undoStack.push(op);redoStack=[]}
function logical(e){const r=rect||(measure(),rect);return{x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*720/r.height}}
function textScale(){return (rect||(measure(),rect)).width/1000}
function placeTextBox(){if(!textSel){textBox.hidden=true;return}const it=textSel.item,k=textScale();textBox.hidden=false;textBox.style.left=it.points[0][0]*k+'px';textBox.style.top=it.points[0][1]*k+'px';textBox.style.width=it.w*k+'px';textArea.style.fontSize=it.size*k+'px';textArea.style.color=it.color;textArea.style.height='auto';textArea.style.height=Math.max(textArea.scrollHeight,it.size*k*LH)+'px';textBox.classList.toggle('below',it.points[0][1]*k<56)}
function hitText(x,y){for(let i=strokes.length-1;i>=0;i--){const s=strokes[i];if(s.tool==='text'&&x>=s.points[0][0]&&x<=s.points[0][0]+s.w&&y>=s.points[0][1]&&y<=s.points[0][1]+s.h)return i}return -1}
function openText(index,at){commitText();let item,before=null;if(index>=0){before=strokes[index];item={...before,points:[[...before.points[0]]]}}else{const x=clampN(at.x,20,1000-180),w=Math.max(160,Math.min(560,980-x));item={tool:'text',color,width:1,size:textSize,w,h:Math.ceil(textSize*LH),text:'',points:[[Math.round(x),Math.round(clampN(at.y,20,720-textSize*LH-20))]]}}
  textSel={index,item,before};hiddenIndex=index;baseDirty=true;paintLive();textArea.value=item.text;setTextSize(item.size,true);placeTextBox();textArea.focus();if(item.color!==color)selectColor(item.color,true)}
function commitText(){if(!textSel)return;const{index,item,before}=textSel,final=finalizeText(item);textSel=null;hiddenIndex=-1;textBox.hidden=true;textDrag=null;
  if(!final.text.trim()){if(index>=0){pushOp({k:'del',i:index,item:strokes.splice(index,1)[0]})}}else if(index<0)  {strokes.push(final);pushOp({k:'add'})}else if(JSON.stringify(final)!==JSON.stringify(before)){strokes[index]=final;pushOp({k:'set',i:index,before,after:final})}
  baseDirty=true;paintLive();history();saveDraft()}
function deleteText(){if(!textSel)return;const{index}=textSel;textSel=null;hiddenIndex=-1;textBox.hidden=true;if(index>=0)pushOp({k:'del',i:index,item:strokes.splice(index,1)[0]});baseDirty=true;paintLive();history();saveDraft()}
function textPointer(e){measure();const p=logical(e),had=!!textSel;if(had)commitText();const i=hitText(p.x,p.y);if(i>=0){openText(i);return}if(had)return;if(strokes.length>=500){toast('This page is full. Stick it, then start another.');return}openText(-1,p)}
textArea.oninput=()=>{if(!textSel)return;textSel.item.text=textArea.value;placeTextBox();saveDraft();$('#post-error').textContent=''};
textArea.onblur=()=>{setTimeout(()=>{if(textSel&&!textDrag&&!textBox.contains(document.activeElement)&&$('#editor').open&&!posting)commitText()},120)};
$('#text-del').onclick=deleteText;
$('#text-grip').onpointerdown=e=>{if(!textSel)return;e.preventDefault();const k=textScale();textDrag={kind:'move',sx:e.clientX,sy:e.clientY,ox:textSel.item.points[0][0],oy:textSel.item.points[0][1],k};e.currentTarget.setPointerCapture(e.pointerId)};
$('#text-resize').onpointerdown=e=>{if(!textSel)return;e.preventDefault();const k=textScale();textDrag={kind:'size',sx:e.clientX,ow:textSel.item.w,k};e.currentTarget.setPointerCapture(e.pointerId)};
for(const id of ['#text-grip','#text-resize']){$(id).onpointermove=e=>{if(!textSel||!textDrag)return;const it=textSel.item;if(textDrag.kind==='move'){const h=finalizeText(it).h;it.points[0]=[clampN(textDrag.ox+(e.clientX-textDrag.sx)/textDrag.k,0,1000-it.w),clampN(textDrag.oy+(e.clientY-textDrag.sy)/textDrag.k,0,720-h)]}else it.w=clampN(textDrag.ow+(e.clientX-textDrag.sx)/textDrag.k,100,1000-it.points[0][0]);placeTextBox()};$(id).onpointerup=$(id).onpointercancel=()=>{if(textDrag){textDrag=null;saveDraft();textArea.focus()}}}
function applyUndo(op){if(op.k==='add')op.item=strokes.pop();else if(op.k==='set')strokes[op.i]=op.before;else strokes.splice(op.i,0,op.item)}
function applyRedo(op){if(op.k==='add')strokes.push(op.item);else if(op.k==='set')strokes[op.i]=op.after;else strokes.splice(op.i,1)}
function undoStroke(){if(posting||previewing)return;commitText();const op=undoStack.pop();if(!op)return;applyUndo(op);redoStack.push(op);repaint();saveDraft()}
function redoStroke(){if(posting||previewing)return;commitText();const op=redoStack.pop();if(!op)return;applyRedo(op);undoStack.push(op);repaint();saveDraft()}
$('#undo').onclick=undoStroke;$('#redo').onclick=redoStroke;

function draftKey(){return 'duet-draft-'+(window.DUET_ROOM&&!window.DUET_ROOM.legacy?window.DUET_ROOM.slug+'-':'')+person+'-canvas'}
function noteDraftKey(){return draftKey().replace(/-canvas$/,'-note')}
async function flushDraft(){clearTimeout(draftTimer);if(!person||!$('#editor').open||posting)return;const key=draftKey(),savedNonce=nonce,comp=composition(),value={...comp,strokes:comp.drawing,mode:'canvas',tool,color,size:Number($('#pen-size').value),tsize:textSize};try{await Drafts.set(key,value);if(nonce===savedNonce&&!posting)$('#draft-status').textContent='Draft saved on this device'}catch{if(nonce===savedNonce)$('#draft-status').textContent='Draft storage unavailable — keep this tab open'}}
function saveDraft(){if(posting)return;clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,450)}
window.addEventListener('pagehide',flushDraft);window.addEventListener('beforeunload',flushDraft);
function selectPaper(value){paper=value;$('#editor-paper').className='editor-paper '+paper;$$('[data-paper]').forEach(b=>{b.classList.toggle('selected',b.dataset.paper===paper);b.setAttribute('aria-pressed',String(b.dataset.paper===paper))})}
function selectColor(value,quiet){color=value;$('#editor').style.setProperty('--active-ink',color);$$('[data-color]').forEach(b=>{b.classList.toggle('selected',b.dataset.color===color);b.setAttribute('aria-pressed',String(b.dataset.color===color))});strokeSample();if(textSel&&!quiet){textSel.item.color=value;placeTextBox()}}
function strokeSample(){
  const v=currentWidth();
  $('#size-value').textContent=String(v);
  const sample=$('#stroke-sample');
  if(!sample)return;
  const scale=canvas&&rect?Math.max(0.35,Math.min(1.2,rect.width/1000)):0.55;
  const sw=Math.max(1.5,v*scale);
  sample.style.stroke=tool==='erase'?'#594739':color;
  sample.style.strokeWidth=String(sw);
  sample.style.opacity=tool==='erase'?'0.35':tool==='marker'?'.35':tool==='pencil'?'.65':'1';
  sample.style.strokeDasharray=tool==='erase'?'6 5':'none';
}

function setTextSize(value,quiet){textSize=Number(value);$$('[data-tsize]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.tsize)===textSize)));if(textSel&&!quiet){textSel.item.size=textSize;placeTextBox();saveDraft()}}
new ResizeObserver(()=>{measure();placeTextBox()}).observe(canvas);$('#editor').addEventListener('scroll',measure,{passive:true});addEventListener('resize',()=>{measure();placeTextBox()});canvas.addEventListener('pointerenter',measure);
const TOOL_HINT={pencil:'Pencil',ink:'Ink',marker:'Marker',erase:'Eraser',text:'Text'};
function setTool(value){
  if(value!=='text')commitText();
  if(tool&&tool!=='text')toolSizes[tool]=Number($('#pen-size').value)||toolSizes[tool];
  tool=value;
  canvas.classList.toggle('erasing',value==='erase');
  canvas.classList.toggle('texting',value==='text');
  $$('[data-tool]').forEach(b=>{b.classList.toggle('selected',b.dataset.tool===value);b.setAttribute('aria-pressed',String(b.dataset.tool===value))});
  $('#opts-draw').hidden=value==='text';
  $('#opts-text').hidden=value!=='text';
  $('#tool-hint').textContent=TOOL_HINT[value]||'Pencil';
  const range=$('#pen-size');
  if(range&&value!=='text'){
    if(value==='erase'){range.min=8;range.max=100;range.value=toolSizes.erase||28}
    else{range.min=1;range.max=28;range.value=toolSizes[value]||4}
  }
  strokeSample();repaint();saveDraft();
}

function preview(value){if(value)commitText();previewing=value;$('#editor').classList.toggle('previewing',value);$('#preview-wrap').hidden=!value;$('#preview span').textContent=value?'Keep editing':'Preview';if(value){const card=makeCard(composition(),true);card.id='note-preview';$('#note-preview').replaceWith(card)}else repaint()}
async function openEditor(){await document.fonts.load('40px "Duet Script"');const legacy=window.DuetDev||(window.DUET_ROOM&&!window.DUET_ROOM.legacy)?{}:store.get('duet-draft-'+person,{});const draft=await Drafts.get(draftKey(),store.get(draftKey(),{...legacy,nonce:uid()}));
  strokes=(draft.strokes||draft.drawing||[]).slice();textSel=null;hiddenIndex=-1;active=null;nonce=draft.nonce||uid();let paperPick=draft.paper||'cream';
  // an unsent written note from before text lived on the canvas becomes a text item on the page
  const old=await Drafts.get(noteDraftKey(),store.get(noteDraftKey(),null)).catch(()=>null);
  if(old&&(old.text||'').trim()&&strokes.length<500){const size={32:28,40:40,52:56}[old.text_size]||40;strokes.push(finalizeText({tool:'text',color:'#594739',size,w:880,text:old.text,points:[[60,60]]}));if(!draft.paper&&old.paper)paperPick=old.paper;await Drafts.remove(noteDraftKey()).catch(()=>{});store.remove(noteDraftKey())}
  undoStack=strokes.map(()=>({k:'add'}));redoStack=[];textSize=draft.tsize||40;setTextSize(textSize,true);$('#pen-size').value=draft.size||4;if(draft.tool&&draft.tool!=='text')toolSizes[draft.tool]=Number(draft.size)||toolSizes[draft.tool]||4;selectPaper(paperPick);selectColor(draft.color||'#594739',true);
  $('#editor-title').textContent='On '+titleName(person==='aryan'?'chat':'aryan')+'’s wall';$('#post-error').textContent='';$('#editor').showModal();preview(false);setTool(['pencil','ink','marker','text','erase'].includes(draft.tool)?draft.tool:'pencil');flushDraft()}
$('#compose').onclick=()=>openEditor();
$('#close-editor').onclick=()=>{flushDraft();$('#editor').close()};
$('#editor').addEventListener('cancel',e=>{if(posting)e.preventDefault();else if(textSel){e.preventDefault();commitText()}else flushDraft()});
$$('[data-tsize]').forEach(b=>b.onclick=()=>setTextSize(b.dataset.tsize));
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$$('[data-color]').forEach(b=>b.onclick=()=>{selectColor(b.dataset.color);if(tool==='erase')setTool('pencil');saveDraft()});
$$('[data-paper]').forEach(b=>b.onclick=()=>{selectPaper(b.dataset.paper);saveDraft()});
$('#pen-size').oninput=()=>{if(tool!=='text')toolSizes[tool]=Number($('#pen-size').value);strokeSample();saveDraft()};
$('#preview').onclick=()=>preview(!previewing);
function currentWidth(){const v=Number($('#pen-size').value);if(tool==='erase')return Math.max(8,Math.min(100,v||28));return Math.max(1,Math.min(28,v||4))}
function point(e){const r=rect||(measure(),rect);const erase=tool==='erase'||(active&&active.tool==='erase');const inset=erase?0:((active?.width||currentWidth())/2+2);const p=[Math.round(Math.max(inset,Math.min(1000-inset,(e.clientX-r.left)*1000/r.width))),Math.round(Math.max(inset,Math.min(720-inset,(e.clientY-r.top)*720/r.height)))];if(e.pointerType==='pen')p.push(Math.round(Math.max(.1,e.pressure)*100)/100);return p}
canvas.onpointerdown=e=>{if(posting||previewing||active||e.button!==0)return;if(tool==='text'){e.preventDefault();textPointer(e);return}if(strokes.length>=500){toast('This page is full. Stick it, then start another.');return}measure();canvas.setPointerCapture(e.pointerId);active={tool,color:tool==='erase'?'erase':color,width:currentWidth(),points:[point(e)],pointer:e.pointerId};redoStack=[];paintLive();history()};
canvas.onpointermove=e=>{if(!active||e.pointerId!==active.pointer)return;for(const sample of (e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e])){if(active.points.length>=4000){if(strokes.length>=499){toast('This page is full. Stick it, then start another.');break}const last=active.points[active.points.length-1],pointer=active.pointer;const completed={...active};delete completed.pointer;strokes.push(completed);pushOp({k:'add'});commitStroke(completed);active={...active,points:[last],pointer}}active.points.push(point(sample))}schedulePaint()};
function endStroke(e){if(!active||e.pointerId!==active.pointer)return;delete active.pointer;strokes.push(active);pushOp({k:'add'});commitStroke(active);active=null;paintLive();history();saveDraft()}canvas.onpointerup=endStroke;canvas.onpointercancel=endStroke;
document.addEventListener('keydown',e=>{if(!$('#editor').open)return;const typing=e.target.matches('textarea,select,input:not([type=range])');
  if((e.ctrlKey||e.metaKey)&&!e.altKey){const k=e.key.toLowerCase();if(k==='enter'&&e.target===textArea){e.preventDefault();commitText()}else if(!typing&&k==='z'){e.preventDefault();e.shiftKey?redoStroke():undoStroke()}else if(!typing&&k==='y'){e.preventDefault();redoStroke()}return}
  if(e.key==='Escape'&&textSel){e.preventDefault();e.stopPropagation();commitText();return}
  if(typing||e.altKey||e.shiftKey)return;const pick={p:'pencil',i:'ink',m:'marker',t:'text',e:'erase'}[e.key.toLowerCase()];if(pick){e.preventDefault();setTool(pick)}});
function busy(value){posting=value;$$('#editor button,#editor input,#editor textarea,#editor select').forEach(b=>b.disabled=value);$('#post span').textContent=value?'Saving…':'Stick to the wall';if(!value)repaint()}
$('#post').onclick=async()=>{if(posting)return;commitText();const payload=composition(),check=document.createElement('canvas');check.width=1000;check.height=720;compose(check,payload);if(!cropped(check)){$('#post-error').textContent='Write or draw something first.';return}const pendingDraft=flushDraft();busy(true);await pendingDraft;$('#draft-status').textContent='Saving to the wall…';$('#post-error').textContent='';try{const result=await DrawingStore.save(payload,api,(done,total)=>{$('#draft-status').textContent='Saving '+done+' / '+total});notes.set(result.note.id,result.note);await Drafts.remove(draftKey()).catch(()=>{});store.remove(draftKey());$('#editor').close();window.dispatchEvent(new Event('duet:posted'));setWall(person==='aryan'?'chat':'aryan');render();}catch(e){if(e.code==='draft_changed'){notes.set(e.note.id,e.note);nonce=uid();render()}$('#post-error').textContent=e.message;$('#draft-status').textContent='Not posted · draft kept';}finally{busy(false);if($('#editor').open)flushDraft()}};
document.fonts.addEventListener?.('loadingdone',()=>{if($('#editor').open){baseDirty=true;paintLive();placeTextBox()}});

(async()=>{await document.fonts.load('40px "Duet Script"');try{const s=await api('session');person=s.person;if(person){show('walls');setWall(person);await sync()}else show('choose')}catch{show('welcome')}audioUI()})();

const eraserFootprint=document.createElement('span');eraserFootprint.className='eraser-footprint';eraserFootprint.hidden=true;eraserFootprint.setAttribute('aria-hidden','true');$('#editor').append(eraserFootprint);
function eraserPosition(e){if(tool!=='erase'||previewing||(e.pointerType==='touch'&&!e.buttons)){eraserFootprint.hidden=true;return}const r=rect||(measure(),rect),p=point(e);eraserFootprint.hidden=false;eraserFootprint.style.left=(r.left+p[0]*r.width/1000)+'px';eraserFootprint.style.top=(r.top+p[1]*r.height/720)+'px';const size=currentWidth()*r.width/1000;eraserFootprint.style.width=size+'px';eraserFootprint.style.height=size+'px'}
canvas.addEventListener('pointermove',eraserPosition);canvas.addEventListener('pointerdown',eraserPosition);for(const event of ['pointerleave','pointerup','pointercancel'])canvas.addEventListener(event,()=>eraserFootprint.hidden=true);

function placeMeadow(){const entry=currentView==='welcome'||currentView==='choose';if(!entry){document.body.style.minHeight='';return}const target=currentView==='welcome'?$('#unlock'):$('.choices');const bottom=target.getBoundingClientRect().bottom+scrollY;const y=Math.max(innerHeight*.74,bottom+86);document.body.style.setProperty('--meadow-y',y+'px');document.body.style.minHeight=Math.max(innerHeight,y+70)+'px'}
new ResizeObserver(placeMeadow).observe($('.brand-scene'));new ResizeObserver(placeMeadow).observe($('.choices'));new ResizeObserver(placeMeadow).observe($('#unlock'));window.addEventListener('resize',placeMeadow);document.fonts.ready.then(placeMeadow);

