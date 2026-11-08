'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const store={get(k,f=null){try{return JSON.parse(localStorage.getItem((window.DuetDev?'preview:':'')+k))??f}catch{return f}},set(k,v){try{localStorage.setItem((window.DuetDev?'preview:':'')+k,JSON.stringify(v));return true}catch{return false}},remove(k){try{localStorage.removeItem((window.DuetDev?'preview:':'')+k)}catch{}}};
const canvas=$('#drawing'), audio=$('#music');
let person=null, notes=new Map(), hasMore=false, syncing=false, currentView='welcome', syncCursor=0, initialized=false;
let strokes=[], redo=[], active=null, color='#594739', tool='pencil', paper='cream', nonce=null, posting=false, previewing=false, draftTimer=null;const toolSizes={pencil:4,ink:4,marker:30,erase:28};
let editorMode='canvas';
// Shared (server) draft being edited, or null for the private scratch page. base = revision it was loaded from or last saved as.
let draftId=null, draftBase=0, draftTitle='', editCount=0, savedCount=0;
const wordCount=text=>(text.trim().match(/\S+/gu)||[]).length;
const titleName=p=>(window.DUET_ROOM&&window.DUET_ROOM.names[p])||(p==='chat'?'ChatChan':'Aryan Chan');const animalOf=p=>(window.DUET_ROOM&&window.DUET_ROOM.animals[p])||(p==='chat'?'deer':'cat');
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
async function rawApi(path,data){
  if(window.DuetDev)return window.DuetDev.request(path,data);
  let r;const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);try{r=await fetch('/api/'+path,{signal:controller.signal,method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(window.DUET_ROOM?{'X-Duet-Room':window.DUET_ROOM.slug}:{})},body:data?JSON.stringify(data):undefined})}catch{throw Error('Connection lost. Your draft is still on this device.')}finally{clearTimeout(deadline)}
  const result=await r.json();if(!r.ok){if(r.status===401&&path!=='unlock'){flushDraft();person=null;$('#editor').close();show('welcome')}const error=Error(result.error||'Could not save. Please try again.');error.code=result.code;error.note=result.note;throw error}return result;
}
async function hydrateAll(list){const out=new Array(list.length);let next=0;const lane=async()=>{while(next<list.length){const k=next++;out[k]=await DrawingStore.hydrate(list[k],rawApi)}};await Promise.all(Array.from({length:Math.min(4,list.length)},lane));return out}
async function api(path,data){try{const result=await rawApi(path,data);if(result.notes)result.notes=await hydrateAll(result.notes);if(result.note)result.note=await DrawingStore.hydrate(result.note,rawApi);return result}catch(error){if(error.note)error.note=await DrawingStore.hydrate(error.note,rawApi);throw error}}
function show(view){currentView=view;window.dispatchEvent(new Event('duet:view'));requestAnimationFrame(placeMeadow);$('#identity-avatar').src='assets/portrait-'+animalOf(person)+'.webp';document.body.dataset.view=view;['welcome','choose','walls'].forEach(v=>$('#'+v).hidden=v!==view);$('#identity').hidden=!person;$('#identity-label').textContent=person?'Logged in as '+titleName(person):'';$('#switch').hidden=view!=='walls';$('#lock').hidden=view==='welcome';updateFavicon();}
function updateFavicon(){const href=person?'assets/favicon-'+animalOf(person)+'.png':'assets/favicon.svg';let link=document.querySelector('link[rel="icon"]');if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}link.type=href.endsWith('.png')?'image/png':'image/svg+xml';link.href=href;}
// One small paper slip for every passing message. `warn` is for things that went wrong or need a nudge; everything else is a quiet confirmation.
let toastTimer=0;
// It lives in the browser's top layer (popover), so it also shows above the editor and the drafts shelf, which a plain fixed element cannot.
function toast(text,warn){const t=$('#toast');clearTimeout(toastTimer);t.textContent=text;t.classList.toggle('warn',!!warn);t.classList.remove('show');
  try{if(t.showPopover&&!t.matches(':popover-open'))t.showPopover()}catch{}
  void t.offsetWidth;t.classList.add('show');
  toastTimer=setTimeout(()=>{t.classList.remove('show');toastTimer=setTimeout(()=>{try{if(t.hidePopover&&t.matches(':popover-open'))t.hidePopover()}catch{}},320)},warn?3600:2200)}
// All sound and motion controls live in the settings sheet.
const audioSettings=store.get('duet-audio',{volume:30,muted:false});
$('#volume').value=audioSettings.volume;audio.volume=Math.max(0,Math.min(1,audioSettings.volume/100));audio.muted=audioSettings.muted;
function audioUI(){const playing=!audio.paused&&!audio.muted&&audio.volume>0;$('#music-label').textContent=playing?'Mute':'Play';$('#music-icon use').setAttribute('href',playing?'#i-muted':'#i-play');$('#mute').setAttribute('aria-label',playing?'Mute music':'Play music');$('#mute').setAttribute('aria-pressed',String(playing));$('#volume-value').textContent=$('#volume').value+'%'}
function saveAudio(){store.set('duet-audio',{volume:Number($('#volume').value),muted:audio.muted})}
async function startMusic(){if(audio.muted)return;try{await audio.play()}catch{}audioUI()}
$('#settings-open').onclick=()=>$('#settings').showModal();$('#settings-close').onclick=()=>$('#settings').close();
$('#mute').onclick=async()=>{if(audio.paused||audio.muted||!audio.volume){audio.muted=false;if(!audio.volume){audio.volume=.3;$('#volume').value=30}try{await audio.play()}catch{toast('Tap play for music')}}else audio.muted=true;saveAudio();audioUI()};
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
$('#switch').onclick=()=>show('choose');$('#home').onclick=()=>{if(person)show('walls')};$('#lock').onclick=async()=>{try{await api('logout',{});person=null;notes.clear();hasMore=false;syncCursor=0;initialized=false;render();show('welcome');audio.pause();audioUI()}catch(e){toast(e.message,1)}};
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

// Graphite grain: a tile of speckled ink made from a fixed seed, so a pencil line looks the same on every device.
const grainTiles=new Map();
function grainTile(color,seed){
  const key=color+seed;let tile=grainTiles.get(key);if(tile)return tile;
  tile=document.createElement('canvas');tile.width=tile.height=128;
  const g=tile.getContext('2d'),img=g.createImageData(128,128),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  let state=(seed*2654435761)>>>0;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
  const cells=new Uint8Array(64*64);for(let i=0;i<cells.length;i++){const r=rnd();cells[i]=Math.round(255*(r<.14?.12+.3*rnd():.58+.42*rnd()))}
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const o=(y*128+x)*4;img.data[o]=rgb[0];img.data[o+1]=rgb[1];img.data[o+2]=rgb[2];img.data[o+3]=cells[(y>>1)*64+(x>>1)]}
  g.putImageData(img,0,0);grainTiles.set(key,tile);return tile}
// A line whose width follows pen pressure: .35 of the nib at the lightest touch, the full nib at the hardest.
function varWidth(c,pts,w){
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    c.lineWidth=w*(.35+.65*(((a[2]??1)+(b[2]??1))/2));
    c.beginPath();
    if(i===1)c.moveTo(a[0],a[1]);
    else{const p=pts[i-2];c.moveTo((p[0]+a[0])/2,(p[1]+a[1])/2)}
    if(i===pts.length-1)c.lineTo(b[0],b[1]);
    else c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
    c.stroke()}}
function drawPencil(c,s){
  const pts=s.points,w=s.width;c.save();c.lineCap='round';c.lineJoin='round';c.globalCompositeOperation='source-over';
  const body=c.createPattern(grainTile(s.color,1),'repeat'),core=c.createPattern(grainTile(s.color,2),'repeat');
  if(pts.length===1){c.fillStyle=body;c.globalAlpha=.9;c.beginPath();c.arc(pts[0][0],pts[0][1],w/2,0,Math.PI*2);c.fill();c.restore();return}
  const pr=pts.some(p=>p.length===3);
  c.strokeStyle=body;c.globalAlpha=.9;
  if(pr){varWidth(c,pts,w)}else{c.lineWidth=w;path(c,pts);c.stroke()}
  if(w>=3){let f=1;if(pr){f=.35+.65*(pts.reduce((n,p)=>n+(p[2]??1),0)/pts.length)}
    c.strokeStyle=core;c.lineWidth=Math.max(1,w*.5*f);c.globalAlpha=.55;path(c,pts);c.stroke()}   // a denser centre, like a pencil pressed down
  c.restore()}
// Marker: a flat, chisel-ended nib with wet, translucent ink. One even ribbon with a barely-there soft edge; it deepens where strokes cross,
// the way real marker ink does. Pressure (stylus only) changes how saturated the ink is, never how wide. Drawn only from the stored points,
// so it looks the same on every device. Bevel joins keep sharp turns and hooks from throwing spikes that the sprite would clip.
function markerLevel(p){return Math.round((.3+.7*(p[2]??1))*14)/14}
function drawMarker(c,s){
  const pts=s.points,w=s.width;if(!pts.length)return;
  const m=c.getTransform?c.getTransform():null,k=m?Math.max(.5,Math.hypot(m.a,m.b)):1,pad=w*.8+4;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of pts){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}
  const ox=Math.floor(x0-pad),oy=Math.floor(y0-pad),bw=Math.ceil(x1+pad)-ox,bh=Math.ceil(y1+pad)-oy;
  const t=document.createElement('canvas');t.width=Math.max(1,Math.ceil(bw*k));t.height=Math.max(1,Math.ceil(bh*k));
  const g=t.getContext('2d');g.setTransform(k,0,0,k,-ox*k,-oy*k);g.lineCap='butt';g.lineJoin='bevel';g.strokeStyle=g.fillStyle=s.color;
  const band=(run,width,alpha)=>{g.globalAlpha=alpha;g.lineWidth=width;path(g,run);g.stroke()};
  if(pts.length===1){const a=markerLevel(pts[0]);g.globalAlpha=a;g.fillRect(pts[0][0]-w*.25,pts[0][1]-w/2,w*.5,w)}
  else{
    // Runs of equal saturation are stroked as one piece, so there are no seams inside a run.
    let start=0,lvl=(markerLevel(pts[0])+markerLevel(pts[1]))/2;
    const flush=end=>{const run=pts.slice(start,end+1);band(run,w*1.08,lvl*.12);band(run,w,lvl*.88)};
    for(let i=2;i<pts.length;i++){const l=(markerLevel(pts[i-1])+markerLevel(pts[i]))/2;if(Math.abs(l-lvl)>.01){flush(i-1);start=i-1;lvl=l}}
    flush(pts.length-1)}
  c.save();c.globalCompositeOperation='multiply';c.globalAlpha=.55;c.drawImage(t,ox,oy,bw,bh);c.restore()}
// A fill is stored as the outline of the area it covers and drawn behind everything already on the page, so it tucks
// under the lines. The 5.6-unit edge stroke covers the thin gap between a line and the colour.
function drawFill(c,s){
  c.save();c.globalCompositeOperation='destination-over';c.globalAlpha=1;c.fillStyle=s.color;c.strokeStyle=s.color;c.lineWidth=5.6;c.lineJoin='round';c.beginPath();
  let at=0;for(const n of s.loops){c.moveTo(s.points[at][0],s.points[at][1]);for(let k=1;k<n;k++)c.lineTo(s.points[at+k][0],s.points[at+k][1]);c.closePath();at+=n}
  c.fill('evenodd');c.stroke();c.restore()}
function drawStroke(c,s){
  if(s.tool==='text'){drawText(c,s);return}if(s.tool==='fill'){drawFill(c,s);return}if(!s.points.length)return;
  if(s.tool==='pencil'&&s.color!=='erase'){drawPencil(c,s);return}
  if(s.tool==='marker'&&s.color!=='erase'){drawMarker(c,s);return}c.lineCap='round';c.lineJoin='round';const kind=s.tool||'ink';c.save();c.globalCompositeOperation=s.color==='erase'||kind==='erase'?'destination-out':'source-over';c.strokeStyle=s.color==='erase'?'#000':s.color;c.fillStyle=c.strokeStyle;c.lineWidth=s.width;c.globalAlpha=kind==='marker'?.28:kind==='pencil'?.68:1;
    if(s.points.length===1){c.beginPath();c.arc(s.points[0][0],s.points[0][1],s.width/2,0,Math.PI*2);c.fill()}
    else if(kind==='ink'&&s.points.some(p=>p.length===3)){varWidth(c,s.points,s.width)}
    else{path(c,s.points);c.stroke();if(kind==='pencil'){c.globalAlpha=.22;c.lineWidth=Math.max(.6,s.width*.18);pathPerp(c,s.points,s.width*.22);c.stroke()}}c.restore();
}

function drawStrokes(target,list,k=1){const c=target.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,target.width,target.height);c.setTransform(k,0,0,k,0,0);for(const s of list)drawStroke(c,s);c.setTransform(1,0,0,1,0,0)}
function textLines(c,text,maxWidth){const out=[];for(const paragraph of text.split('\n')){if(!paragraph){out.push('');continue}let line='';for(const word of paragraph.split(/(?<=\s)/)){if(c.measureText(line+word).width<=maxWidth){line+=word;continue}if(line){out.push(line.trimEnd());line=''}for(const char of word){if(c.measureText(line+char).width>maxWidth&&line){out.push(line);line=''}line+=char}}out.push(line.trimEnd())}return out}
function compose(target,n,includeText=true){drawStrokes(target,n.drawing);if(!n.text||!includeText)return false;const c=target.getContext('2d'), size=n.text_size||40;c.save();c.font=`${size}px "Duet Script"`;c.fillStyle='#594739';c.textBaseline='top';const lines=textLines(c,n.text,880);lines.forEach((line,i)=>c.fillText(line,60,60+i*size*1.4));c.restore();return 60+lines.length*size*1.4>680}
function composition(){return {author:person,text:'',drawing:drawingForSave(),paper,nonce,format:2,text_size:40}}
// Live canvas: finished strokes sit on a cached layer, so a pointer move redraws only the stroke in progress (once per frame).
let baseCanvas=null,baseDirty=true,frame=0,rect=null,scale=1,penLast=-1e9,activeType='',lastRaw=null,nib=null;
// A desynchronized surface comes up opaque black on some phones (iOS Safari, a few Android GPUs). Keep the buffer an ordinary transparent one.
const liveCtx=canvas.getContext('2d',{alpha:true,desynchronized:false});
const PAPER_HEX={cream:'#ffffff',rose:'#efd2bd',sage:'#dce1c6',blue:'#d9e3e2'};
// Four papers, each with its own character, grown from a fixed seed so they look the same on every device and are seamless when tiled:
// oat is cotton rag (fine fibres), peach is a watercolour wash (blooms and granulation), moss is recycled stock (flecks), blue is handmade washi (long pale fibres).
// One generator feeds the editor, the shelf thumbnails, exports and (through CSS variables) the notes on the wall, so a page looks identical everywhere.
const PAPER_SEED={cream:11,rose:23,sage:37,blue:51},paperTiles=new Map();
function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function makePaperTile(name,px){
  const key=name+'@'+px;let tile=paperTiles.get(key);if(tile)return tile;
  const T=400,k=px/T;tile=document.createElement('canvas');tile.width=tile.height=px;const c=tile.getContext('2d'),R=seeded(PAPER_SEED[name]||1),rnd=(a,b)=>a+(b-a)*R();
  c.fillStyle=PAPER_HEX[name]||PAPER_HEX.cream;c.fillRect(0,0,px,px);c.scale(k,k);
  const rgba=(col,a)=>'rgba('+col[0]+','+col[1]+','+col[2]+','+a+')';
  // Anything near an edge is drawn again on the far side, so the tile repeats without a seam.
  const wrap=(x,y,e,fn)=>{const xs=[0],ys=[0];if(x<e)xs.push(T);if(x>T-e)xs.push(-T);if(y<e)ys.push(T);if(y>T-e)ys.push(-T);for(const dx of xs)for(const dy of ys){c.save();c.translate(dx,dy);fn();c.restore()}};
  const cloud=(col,a,r0,r1)=>{const x=rnd(0,T),y=rnd(0,T),r=rnd(r0,r1);wrap(x,y,r,()=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(col,a));g.addColorStop(1,rgba(col,0));c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r)})};
  const fibre=(col,a,l0,l1,w)=>{const x=rnd(0,T),y=rnd(0,T),l=rnd(l0,l1),th=rnd(0,6.283),bend=rnd(-.5,.5)*l,ex=x+Math.cos(th)*l,ey=y+Math.sin(th)*l,mx=(x+ex)/2-Math.sin(th)*bend,my=(y+ey)/2+Math.cos(th)*bend,lw=w*rnd(.7,1.2);
    wrap(x,y,l,()=>{c.strokeStyle=rgba(col,a*rnd(.7,1));c.lineWidth=lw;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(mx,my,ex,ey);c.stroke()})};
  const fleck=(col,a,r0,r1,stretch=1)=>{const x=rnd(0,T),y=rnd(0,T),r=rnd(r0,r1),th=rnd(0,3.14),al=a*rnd(.7,1);wrap(x,y,r*stretch,()=>{c.fillStyle=rgba(col,al);c.beginPath();c.ellipse(x,y,r*stretch,r,th,0,6.283);c.fill()})};
  const bloom=(col,a,r0,r1)=>{const x=rnd(0,T),y=rnd(0,T),r=rnd(r0,r1),n=16,ph=[];for(let i=0;i<n;i++)ph.push(rnd(.78,1.14));
    const P=ph.map((m,i)=>{const t=i/n*6.283;return [x+Math.cos(t)*r*m,y+Math.sin(t)*r*m]});
    const trace=()=>{c.beginPath();const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];let m0=mid(P[n-1],P[0]);c.moveTo(m0[0],m0[1]);for(let i=0;i<n;i++){const q=mid(P[i],P[(i+1)%n]);c.quadraticCurveTo(P[i][0],P[i][1],q[0],q[1])}c.closePath()};
    wrap(x,y,r*1.2,()=>{trace();c.fillStyle=rgba(col,a);c.fill();c.lineWidth=1.4;c.strokeStyle=rgba(col,a*1.7);c.stroke()})};
  const many=(n,fn)=>{for(let i=0;i<n;i++)fn()};
  if(name==='rose'){
    many(9,()=>cloud([214,150,120],.06,110,220));many(8,()=>cloud([255,236,222],.14,110,210));
    many(8,()=>bloom([205,132,104],.03,50,130));
    many(2600,()=>fleck([168,96,74],.11,.4,.9));many(70,()=>fibre([190,120,96],.1,6,20,.5))}
  else if(name==='sage'){
    many(9,()=>cloud([186,198,146],.11,110,220));many(8,()=>cloud([243,247,228],.22,100,200));
    many(210,()=>fleck([82,96,58],.42,.5,1.7,1.9));many(80,()=>fleck([248,249,236],.65,.5,1.5,1.6));many(46,()=>fleck([142,112,70],.3,.5,1.2,1.5));
    many(170,()=>fibre([112,126,76],.17,9,30,.55))}
  else if(name==='blue'){
    many(10,()=>cloud([160,188,200],.1,120,230));many(9,()=>cloud([242,248,248],.4,110,220));
    many(170,()=>fibre([255,255,255],.62,28,92,.9));many(54,()=>fibre([104,138,160],.15,14,46,.5));many(26,()=>fleck([88,118,150],.26,.5,1.1))}
  else{   // plain white: nothing but a fine, even grain
    many(5200,()=>fleck([110,104,96],.075,.35,.7));many(900,()=>fleck([255,255,255],.9,.4,.8))}
  paperTiles.set(key,tile);return tile}
function paperPattern(ctx,name,k){const px=Math.max(64,Math.round(400*k)),key='p'+name+'@'+px;let pat=paperTiles.get(key);if(pat)return pat;pat=ctx.createPattern(makePaperTile(name,px),'repeat');paperTiles.set(key,pat);return pat}
function paintPaper(c,w,h,name){c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=paperPattern(c,name,w/1000);c.fillRect(0,0,w,h);c.restore()}
// The same tiles, handed to the stylesheet, so notes on the wall wear the paper they were written on.
function installPaperTextures(){try{for(const name of Object.keys(PAPER_HEX))document.documentElement.style.setProperty('--tex-'+name,'url('+makePaperTile(name,300).toDataURL('image/jpeg',.9)+')')}catch{/* the plain colour stays */}}
installPaperTextures();
function measure(){rect=canvas.getBoundingClientRect()}
// The page is 1000x720 units. The canvas behind it gets as many pixels as the screen can show (up to twice the units), so lines stay sharp on
// sharp screens; every stroke is still stored, and replayed elsewhere, in page units.
function sizeCanvas(){const w=canvas.clientWidth;if(!w)return;const s=Math.min(2,Math.max(1,Math.round(w*(window.devicePixelRatio||1)/1000*4)/4));if(s===scale&&canvas.width===Math.round(1000*s))return;scale=s;canvas.width=Math.round(1000*s);canvas.height=Math.round(720*s);baseCanvas=null;baseDirty=true;paintLive()}
function rebuildBase(){if(!baseCanvas||baseCanvas.width!==canvas.width){baseCanvas=document.createElement('canvas');baseCanvas.width=canvas.width;baseCanvas.height=canvas.height}drawStrokes(baseCanvas,hiddenIndex>=0?strokes.filter((_,i)=>i!==hiddenIndex):strokes,scale);baseDirty=false}
function commitStroke(s){if(!baseDirty){const g=baseCanvas.getContext('2d');g.save();g.setTransform(scale,0,0,scale,0,0);drawStroke(g,s);g.restore()}}
function paintLive(){cancelAnimationFrame(frame);frame=0;liveCtx.clearRect(0,0,canvas.width,canvas.height);if(baseDirty)rebuildBase();liveCtx.drawImage(baseCanvas,0,0);if(active){liveCtx.save();liveCtx.setTransform(scale,0,0,scale,0,0);drawStroke(liveCtx,active);liveCtx.restore()}
  // The paper goes in last and behind everything, so the page is never left to show through to whatever sits under the canvas, and erasing still works.
  liveCtx.save();liveCtx.globalCompositeOperation='destination-over';liveCtx.setTransform(1,0,0,1,0,0);liveCtx.fillStyle=paperPattern(liveCtx,paper,scale);liveCtx.fillRect(0,0,canvas.width,canvas.height);liveCtx.restore()}
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
  for(const s of list){if(s.color==='erase'||s.tool==='erase')return null;if(s.tool==='fill'){for(const p of s.points){if(p[0]-2<l)l=p[0]-2;if(p[0]+2>r)r=p[0]+2;if(p[1]-2<t)t=p[1]-2;if(p[1]+2>b)b=p[1]+2}continue}if(s.tool==='text'){const x=s.points[0][0],y=s.points[0][1];if(x<l)l=x;if(x+s.w>r)r=x+s.w;if(y<t)t=y;if(y+s.h>b)b=y+s.h;continue}const kind=s.tool||'ink',pressure=(kind==='ink'||kind==='pencil')&&s.points.some(p=>p.length===3);
    for(const p of s.points){const h=(pressure&&s.points.length>1?s.width*(.35+.65*(p[2]??1)):s.width)/2*(kind==='marker'?1.1:1);
      if(p[0]-h<l)l=p[0]-h;if(p[0]+h>r)r=p[0]+h;if(p[1]-h<t)t=p[1]-h;
      let down=h;if(kind==='pencil'&&s.points.length>1)down=Math.max(h,s.width*.25+Math.max(.6,s.width*.18)/2);
      if(p[1]+down>b)b=p[1]+down}}
  if(r<l)return null;
  const even=(v,up)=>up?2*Math.ceil(v/2):2*Math.floor(v/2);
  return{left:Math.max(0,even(Math.floor(l),true)),top:Math.max(0,even(Math.floor(t),true)),right:Math.min(998,even(Math.ceil(r)-1,false)),bottom:Math.min(718,even(Math.ceil(b)-1,false))}}
const lazyPaint='IntersectionObserver'in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){lazyPaint.unobserve(e.target);e.target.__paint?.()}},{rootMargin:'700px'}):null;
function croppedStrokes(list,H,lazy){const bb=strokeBounds(list);if(!bb)return null;const W=1000,width=Math.min(W,Math.max(720,bb.right-bb.left+100)),x=Math.max(0,Math.min(W-width,(bb.left+bb.right-width)/2)),y=Math.max(0,bb.top-28),height=Math.min(H-y,Math.max(100,bb.bottom-bb.top+58));const out=document.createElement('canvas');out.width=width;out.height=height;const hasText=list.some(s=>s.tool==='text');let fontTried=false;const paint=()=>{const c=out.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,out.width,out.height);c.translate(-x,-y);for(const s of list)drawStroke(c,s);out.__paint=null;if(hasText&&!fontTried&&!document.fonts.check('40px "Duet Script"')){fontTried=true;document.fonts.load('40px "Duet Script"').then(paint)}};if(lazy&&lazyPaint){out.__paint=paint;lazyPaint.observe(out)}else paint();return out}
// A drawing is fetched when its card nears the screen (four at a time), so the wall appears at once however many notes there are.
const hq=[];let hn=0;
function pumpHydrate(){while(hn<4&&hq.length){hn++;hq.shift()()}}
function queueHydrate(job){hq.push(()=>job().finally(()=>{hn--;pumpHydrate()}));pumpHydrate()}
let heights=store.get('duet-heights',{})||{};
function rememberHeight(key,h){if(!h)return;heights[key]=Math.round(h);const keys=Object.keys(heights);for(const k of keys.slice(0,Math.max(0,keys.length-300)))delete heights[k];store.set('duet-heights',heights)}
function swapCard(card,fresh,key){const before=card.getBoundingClientRect(),above=before.bottom<=0;card.replaceWith(fresh);if(above)window.scrollBy(0,fresh.getBoundingClientRect().height-before.height);rememberHeight(key,fresh.getBoundingClientRect().height)}
function pendingCard(card,n){
  const key=n.drawing.upload,holder=document.createElement('div');holder.className='art-holder';holder.style.height=(heights[key]?Math.max(60,heights[key]-40):220)+'px';card.append(holder);
  const date=document.createElement('time');date.dateTime=new Date(n.created*1000).toISOString();date.textContent=new Date(n.created*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:(window.DUET_ROOM&&window.DUET_ROOM.timezone)||'Asia/Kolkata'});card.append(date);
  const load=()=>queueHydrate(async()=>{try{const full=await DrawingStore.hydrate(n,rawApi);if(!card.isConnected)return;notes.set(n.id,full);swapCard(card,makeCard(full,false,false),key)}catch{holder.__paint=load;setTimeout(()=>lazyPaint?lazyPaint.observe(holder):load(),6000)}});
  holder.__paint=load;if(lazyPaint)lazyPaint.observe(holder);else load();return card}
// Tape: every note gets one roll and one layout, both picked from the note's nonce so both people see the same tape.
// Which layouts a roll may use: yellow stays horizontal; red is horizontal plus the top-right/top-left slants;
// green and blue may use any of the five. Layouts: top strip, opposite corners, both top corners, long top-corner diagonal (right or left), two upright pieces.
const TAPE_ROLLS=['red','yellow','blue','green'];
const TAPE_H=['top'];
const TAPE_LAYOUTS={yellow:TAPE_H,red:[...TAPE_H,'tr','tl'],blue:[...TAPE_H,'corners-a','tin','tr','tl','up'],green:[...TAPE_H,'corners-a','tin','tr','tl','up']};
const TAPE_PIECES={top:1,tr:1,tl:1};
function tapeMix(h){h=Math.imul(h^(h>>>16),2246822507)>>>0;h=Math.imul(h^(h>>>13),3266489909)>>>0;return (h^(h>>>16))>>>0}
// Variety: tape follows the note's id, not luck. Rolls come round in shuffled sets of four (any three notes in a row use three different rolls),
// and a note never reuses the layout of the two notes before it. Notes without a usable id fall back to a pick from their nonce.
const TAPE_SEQ={rolls:[],layouts:[]};
function tapeShuffle(list,seed){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=tapeMix(seed*7919+i*104729)%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function tapeRolls(n){const r=TAPE_SEQ.rolls;while(r.length<=n){const prev=r.slice(-2),block=r.length/4;r.push(...tapeShuffle(TAPE_ROLLS.filter(x=>!prev.includes(x)),block+1),...tapeShuffle(prev,block+500))}}
function tapeLayouts(n){tapeRolls(n+2);const r=TAPE_SEQ.rolls,l=TAPE_SEQ.layouts;while(l.length<=n){const k=l.length,allowed=TAPE_LAYOUTS[r[k]],avoid=[l[k-1],l[k-2]],yellowNear=r[k]!=='yellow'&&r.slice(Math.max(0,k-2),k+3).includes('yellow');let pick=allowed.filter(x=>!avoid.includes(x)&&!(yellowNear&&x==='top'));if(!pick.length)pick=allowed.filter(x=>x!==l[k-1]);if(!pick.length)pick=allowed;l.push(pick[tapeMix(k*2654435761+17)%pick.length])}}
function addTapes(card,hash,idx){let roll,layout;if(Number.isInteger(idx)&&idx>=0&&idx<=100000){tapeLayouts(idx);roll=TAPE_SEQ.rolls[idx];layout=TAPE_SEQ.layouts[idx]}else{const h=tapeMix(hash>>>0),list=TAPE_LAYOUTS[TAPE_ROLLS[h%4]];roll=TAPE_ROLLS[h%4];layout=list[tapeMix(h+1)%list.length]}card.dataset.tape=layout;for(let i=0;i<(TAPE_PIECES[layout]||2);i++){const tape=document.createElement('img');tape.src='assets/tape-'+roll+'.webp';tape.alt='';tape.className='tape '+roll+' t'+(i+1);card.append(tape)}}
function makeCard(n,preview=false,lazy=false){const card=document.createElement('article');card.className='note '+n.paper;card.dataset.id=n.id||'';const hash=[...(n.nonce||String(n.id))].reduce((value,ch)=>Math.imul(value^ch.charCodeAt(0),16777619)>>>0,2166136261);addTapes(card,hash,/^\d+$/.test(String(n.id))?Number(n.id):null);
  if(n.format===3){const text=document.createElement('p');text.className='written-note';text.dataset.size=n.text_size||40;text.textContent=n.text;card.append(text)}
  if(n.format===4&&n.drawing&&n.drawing.upload&&!preview)return pendingCard(card,n);
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
    if(!initialized||older){const cursor=older&&notes.size?Math.min(...notes.keys()):null;const result=await rawApi('notes'+(cursor?'?before='+cursor:''));if(owner!==person)return;for(const n of result.notes)notes.set(n.id,n);hasMore=result.more;if(!initialized){syncCursor=Math.max(0,...result.notes.map(n=>n.id));initialized=true}render()}
    else {let more=true;while(more){const result=await rawApi('notes?after='+syncCursor);if(owner!==person)return;if(result.drafts)Shelf.stamp(result.drafts);if(result.notes.length){for(const n of result.notes)notes.set(n.id,n);syncCursor=result.notes[result.notes.length-1].id;render();window.dispatchEvent(new Event('duet:updated'))}more=result.more}}
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
function textPointer(e){measure();const p=logical(e),had=!!textSel;if(had)commitText();const i=hitText(p.x,p.y);if(i>=0){openText(i);return}if(had)return;if(strokes.length>=500){toast('Page is full, start a new one',1);return}openText(-1,p)}
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

function draftKey(){return 'duet-draft-'+(window.DUET_ROOM&&!window.DUET_ROOM.legacy?window.DUET_ROOM.slug+'-':'')+person+(draftId?'-d-'+draftId:'-canvas')}
function noteDraftKey(){return draftKey().replace(/-canvas$/,'-note')}
async function flushDraft(){clearTimeout(draftTimer);if(!person||!$('#editor').open||posting)return;const key=draftKey(),savedNonce=nonce,comp=composition(),value={...comp,strokes:comp.drawing,mode:'canvas',tool,color,size:Number($('#pen-size').value),tsize:textSize,draftId,base:draftBase,title:draftTitle,dirty:editCount!==savedCount};try{await Drafts.set(key,value);if(nonce===savedNonce&&!posting&&!draftId)$('#draft-status').textContent='Auto-saved'}catch{if(nonce===savedNonce)$('#draft-status').textContent='Keep this tab open'}}
function saveDraft(){if(posting)return;editCount++;clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,450);typeof Shelf!=='undefined'&&Shelf.queue()}
window.addEventListener('pagehide',flushDraft);window.addEventListener('beforeunload',flushDraft);
function selectPaper(value){paper=value;paintLive();$('#editor-paper').className='editor-paper '+paper;$$('[data-paper]').forEach(b=>{b.classList.toggle('selected',b.dataset.paper===paper);b.setAttribute('aria-pressed',String(b.dataset.paper===paper))})}
// ---- Colour menu: one extra circle beside the inks opens a small menu with more colours, your own colours and a picker ----
const HEXRE=/^#[0-9a-f]{6}$/;
const RAIL_COLORS=$$('.ed-swatches [data-color]').map(b=>b.dataset.color);
const MORE_COLORS=[['Poppy','#c0443a'],['Persimmon','#d9682b'],['Butter','#e2b84b'],['Blush','#dc8f9c'],['Pine','#2f6b3a'],['Lagoon','#2a7a7c'],['Denim','#4a6fa5'],['Navy','#33466b'],['Plum','#7b4e7e'],['Lavender','#9b87bb'],['Charcoal','#36322f'],['Stone','#8e8a80'],['Chalk','#fbf6ea']];
let myColors=(store.get('duet-colors',[])||[]).filter(c=>HEXRE.test(c)).slice(0,12);
const inkMenu=$('#ink-menu'),moreBtn=$('#more-ink'),pickState={h:30,s:.5,v:.6};
function hexToHsv(hex){const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360}return{h,s:mx?d/mx:0,v:mx}}
function hsvToHex(h,s,v){const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1))};return '#'+[f(5),f(3),f(1)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')}
function inkCircle(hex,name){const b=document.createElement('button');b.type='button';b.className='ed-swatch';b.dataset.color=hex;b.style.setProperty('--swatch',hex);b.setAttribute('aria-label',name||hex);const on=hex===color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));b.onclick=()=>useColor(hex);return b}
function useColor(hex){selectColor(hex);if(tool==='erase')setTool('pencil');saveDraft();closeInkMenu()}
function paintPad(){
  const cv=$('#pick-pad'),g=cv.getContext('2d'),w=cv.width,h=cv.height;
  let gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#fff');gr.addColorStop(1,hsvToHex(pickState.h,1,1));g.fillStyle=gr;g.fillRect(0,0,w,h);
  gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,w,h);
  const x=pickState.s*w,y=(1-pickState.v)*h;g.lineWidth=2.5;g.strokeStyle='#fff';g.beginPath();g.arc(x,y,7,0,Math.PI*2);g.stroke();g.lineWidth=1;g.strokeStyle='#594739';g.beginPath();g.arc(x,y,8.5,0,Math.PI*2);g.stroke();
  const hex=hsvToHex(pickState.h,pickState.s,pickState.v);$('#pick-now').style.setProperty('--swatch',hex);$('#pick-now').dataset.color=hex;$('#pick-del').hidden=!myColors.includes(color)}
function renderInkMenu(){$('#ink-more').replaceChildren(...MORE_COLORS.map(([n,h])=>inkCircle(h,n+' ink')));const mine=$('#ink-mine');mine.hidden=!myColors.length;mine.replaceChildren(...myColors.map(h=>inkCircle(h)));paintPad()}
// The menu floats beside the ink row (over the page on wide screens, above the row on phones) so it is never cut off by the tool column.
function placeInkMenu(){
  const r=moreBtn.getBoundingClientRect(),w=Math.min(272,innerWidth-16);inkMenu.style.width=w+'px';
  const h=inkMenu.offsetHeight,stacked=innerWidth<=760||(innerWidth<=1000&&matchMedia('(orientation:portrait)').matches);
  const left=stacked?Math.max(8,Math.min(r.left,innerWidth-w-8)):Math.min(r.right+14,innerWidth-w-8);
  const top=stacked?Math.max(8,r.top-h-10):Math.max(8,Math.min(r.top-h/2,innerHeight-h-8));
  inkMenu.style.left=left+'px';inkMenu.style.top=top+'px'}
function openInkMenu(){Object.assign(pickState,hexToHsv(color));$('#pick-hue').value=Math.round(pickState.h);renderInkMenu();inkMenu.hidden=false;placeInkMenu();moreBtn.setAttribute('aria-expanded','true')}
function closeInkMenu(){if(!inkMenu)return;inkMenu.hidden=true;moreBtn.setAttribute('aria-expanded','false')}
moreBtn.onclick=()=>inkMenu.hidden?openInkMenu():closeInkMenu();
document.addEventListener('pointerdown',e=>{if(!inkMenu.hidden&&!inkMenu.contains(e.target)&&!moreBtn.contains(e.target))closeInkMenu()},true);
{const pad=$('#pick-pad');let down=false;const set=e=>{const r=pad.getBoundingClientRect();pickState.s=clampN((e.clientX-r.left)/r.width,0,1);pickState.v=1-clampN((e.clientY-r.top)/r.height,0,1);paintPad()};
 pad.onpointerdown=e=>{down=true;pad.setPointerCapture(e.pointerId);set(e)};pad.onpointermove=e=>{if(down)set(e)};pad.onpointerup=pad.onpointercancel=()=>{down=false};
 $('#pick-hue').oninput=e=>{pickState.h=Number(e.target.value);paintPad()};
 $('#pick-now').onclick=()=>useColor(hsvToHex(pickState.h,pickState.s,pickState.v));
 $('#pick-add').onclick=()=>{const hex=hsvToHex(pickState.h,pickState.s,pickState.v);if(!RAIL_COLORS.includes(hex)&&!MORE_COLORS.some(c=>c[1]===hex)&&!myColors.includes(hex)){myColors.unshift(hex);myColors=myColors.slice(0,12);store.set('duet-colors',myColors)}useColor(hex)};
 $('#pick-del').onclick=()=>{myColors=myColors.filter(c=>c!==color);store.set('duet-colors',myColors);renderInkMenu()}}
function selectColor(value,quiet){color=value;$('#editor').style.setProperty('--active-ink',color);$$('[data-color]').forEach(b=>{b.classList.toggle('selected',b.dataset.color===color);b.setAttribute('aria-pressed',String(b.dataset.color===color))});
  const away=!RAIL_COLORS.includes(color);moreBtn.classList.toggle('has-color',away);moreBtn.classList.toggle('selected',away);moreBtn.setAttribute('aria-pressed',String(away));moreBtn.style.setProperty('--swatch',away?color:'#fbf4e6');strokeSample();if(textSel&&!quiet){textSel.item.color=value;placeTextBox()}}
function strokeSample(){
  const v=currentWidth();
  $('#size-value').textContent=String(v);
  const cv=$('#stroke-sample');
  if(!cv||!cv.getContext||tool==='fill')return;
  const cssW=cv.clientWidth||220,cssH=56,dpr=window.devicePixelRatio||1;
  if(cv.width!==Math.round(cssW*dpr)||cv.height!==Math.round(cssH*dpr)){cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr)}
  const g=cv.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv.width,cv.height);
  let k=canvas&&rect?Math.max(.2,rect.width/1000):.55;                 // screen pixels per page unit, so the preview is the true size
  if(v*k>cssH-6)k=(cssH-6)/v;                                          // very large sizes are shown scaled down to fit
  g.setTransform(dpr*k,0,0,dpr*k,0,0);
  const mid=cssH/2/k,x0=14/k,x1=(cssW-14)/k;
  if(tool==='erase'){g.strokeStyle='#594739';g.globalAlpha=.55;g.lineWidth=1.5/k;g.setLineDash([6/k,5/k]);g.beginPath();g.arc(cssW/2/k,mid,v/2,0,Math.PI*2);g.stroke();return}
  const pts=[],amp=Math.min(8/k,mid*.3);for(let n=0;n<=28;n++)pts.push([Math.round(x0+(x1-x0)*n/28),Math.round(mid+Math.sin(n/28*Math.PI*2)*amp)]);
  drawStroke(g,{tool,color,width:v,points:pts})}

function setTextSize(value,quiet){textSize=Number(value);$$('[data-tsize]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.tsize)===textSize)));if(textSel&&!quiet){textSel.item.size=textSize;placeTextBox();saveDraft()}}
new ResizeObserver(()=>{sizeCanvas();measure();placeTextBox();strokeSample();if(!inkMenu.hidden)placeInkMenu()}).observe(canvas);$('#editor').addEventListener('scroll',measure,{passive:true});addEventListener('resize',()=>{sizeCanvas();measure();placeTextBox()});canvas.addEventListener('pointerenter',measure);
const TOOL_HINT={pencil:'Pencil',ink:'Ink',marker:'Marker',erase:'Eraser',text:'Text',fill:'Fill'};
function setTool(value){
  if(value!=='text')commitText();
  if(tool&&tool!=='text'&&tool!=='fill')toolSizes[tool]=Number($('#pen-size').value)||toolSizes[tool];
  tool=value;
  canvas.classList.toggle('erasing',value==='erase');canvas.classList.toggle('nibbed',['pencil','ink','marker'].includes(value));if(nib)nib.hidden=true;
  canvas.classList.toggle('texting',value==='text');
  canvas.classList.toggle('filling',value==='fill');
  $$('[data-tool]').forEach(b=>{b.classList.toggle('selected',b.dataset.tool===value);b.setAttribute('aria-pressed',String(b.dataset.tool===value))});
  $('#opts-draw').hidden=value==='text'||value==='fill';
  $('#opts-text').hidden=value!=='text';
  $('#tool-hint').textContent=TOOL_HINT[value]||'Pencil';
  const range=$('#pen-size');
  if(range&&value!=='text'&&value!=='fill'){
    if(value==='erase'){range.min=8;range.max=100;range.value=toolSizes.erase||28}
    else if(value==='marker'){range.min=6;range.max=60;range.value=toolSizes.marker||30}
    else{range.min=1;range.max=28;range.value=toolSizes[value]||4}
  }
  strokeSample();repaint();saveDraft();
}

function preview(value){if(value)commitText();previewing=value;$('#editor').classList.toggle('previewing',value);$('#preview-wrap').hidden=!value;$('#preview span').textContent=value?'Keep editing':'Preview';if(value){const card=makeCard(composition(),true);card.id='note-preview';$('#note-preview').replaceWith(card)}else repaint()}
async function openEditor(sd){await document.fonts.load('40px "Duet Script"');if(sd&&sd.id===undefined)sd=null;
  draftId=sd?sd.id:null;draftBase=sd?sd.rev:0;draftTitle=sd?sd.title||'':'';editCount=0;savedCount=0;
  let draft,restored=0;
  if(sd){
    draft={strokes:sd.drawing,paper:sd.paper,nonce:sd.nonce,title:sd.title};
    // Unsynced edits kept on this device win only if they were made on top of the version that is on the server now.
    const local=await Drafts.get(draftKey(),null);
    if(local&&local.dirty){if(local.base===sd.rev){draft=local;draftTitle=local.title||'';restored=1}else await Shelf.forkLocal(local,sd)}
  }else{
    const legacy=window.DuetDev||(window.DUET_ROOM&&!window.DUET_ROOM.legacy)?{}:store.get('duet-draft-'+person,{});draft=await Drafts.get(draftKey(),store.get(draftKey(),{...legacy,nonce:uid()}));draftTitle=draft.title||'';
  }
  strokes=(draft.strokes||draft.drawing||[]).slice();textSel=null;hiddenIndex=-1;active=null;nonce=draft.nonce||uid();let paperPick=draft.paper||'cream';
  // an unsent written note from before text lived on the canvas becomes a text item on the page
  const old=sd?null:await Drafts.get(noteDraftKey(),store.get(noteDraftKey(),null)).catch(()=>null);
  if(old&&(old.text||'').trim()&&strokes.length<500){const size={32:28,40:40,52:56}[old.text_size]||40;strokes.push(finalizeText({tool:'text',color:'#594739',size,w:880,text:old.text,points:[[60,60]]}));if(!draft.paper&&old.paper)paperPick=old.paper;await Drafts.remove(noteDraftKey()).catch(()=>{});store.remove(noteDraftKey())}
  undoStack=strokes.map(()=>({k:'add'}));redoStack=[];textSize=draft.tsize||40;setTextSize(textSize,true);$('#pen-size').value=draft.size||4;if(draft.tool&&draft.tool!=='text')toolSizes[draft.tool]=Number(draft.size)||toolSizes[draft.tool]||4;selectPaper(paperPick);selectColor(HEXRE.test(draft.color)?draft.color:'#594739',true);
  $('#editor-title').textContent='On '+titleName(person==='aryan'?'chat':'aryan')+'’s wall';$('#post-error').textContent='';$('#editor').showModal();preview(false);tool='';setTool(['pencil','ink','marker','text','erase','fill'].includes(draft.tool)?draft.tool:'pencil');editCount=restored;savedCount=0;Shelf.began();flushDraft()}
$('#compose').onclick=()=>openEditor();

$('#close-editor').onclick=async()=>{await flushDraft();await Shelf.leave();$('#editor').close()};
$('#editor').addEventListener('close',()=>Shelf.ended());
$('#editor').addEventListener('cancel',e=>{if(!inkMenu.hidden){e.preventDefault();closeInkMenu();return}if(posting)e.preventDefault();else if(textSel){e.preventDefault();commitText()}else{flushDraft();Shelf.leave()}});
$$('[data-tsize]').forEach(b=>b.onclick=()=>setTextSize(b.dataset.tsize));
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$$('[data-color]').forEach(b=>b.onclick=()=>{selectColor(b.dataset.color);if(tool==='erase')setTool('pencil');saveDraft()});
$$('[data-paper]').forEach(b=>b.onclick=()=>{selectPaper(b.dataset.paper);saveDraft()});
$('#pen-size').oninput=()=>{if(tool!=='text'&&tool!=='fill')toolSizes[tool]=Number($('#pen-size').value);strokeSample();saveDraft()};
$('#preview').onclick=()=>preview(!previewing);
function currentWidth(){const v=Number($('#pen-size').value);if(tool==='erase')return Math.max(8,Math.min(100,v||28));if(tool==='marker')return Math.max(6,Math.min(60,v||30));return Math.max(1,Math.min(28,v||4))}
const r1=v=>Math.round(v*10)/10;
function point(e){const r=rect||(measure(),rect);const erase=tool==='erase'||(active&&active.tool==='erase');const inset=erase?0:((active?.width||currentWidth())/2+2);const p=[r1(Math.max(inset,Math.min(1000-inset,(e.clientX-r.left)*1000/r.width))),r1(Math.max(inset,Math.min(720-inset,(e.clientY-r.top)*720/r.height)))];if(e.pointerType==='pen')p.push(Math.round(Math.max(.1,e.pressure)*100)/100);return p}
canvas.onpointerdown=e=>{if(e.pointerType==='pen')penLast=performance.now();if(active&&e.pointerType==='touch'&&activeType==='touch'&&e.pointerId!==active.pointer){active=null;lastRaw=null;paintLive();history();return}if(posting||previewing||active||e.button!==0)return;if(e.pointerType==='touch'&&performance.now()-penLast<1500&&tool!=='text'&&tool!=='fill')return;if(tool==='text'){e.preventDefault();textPointer(e);return}if(tool==='fill'){e.preventDefault();fillPointer(e);return}if(strokes.length>=500){toast('Page is full, start a new one',1);return}measure();canvas.setPointerCapture(e.pointerId);active={tool,color:tool==='erase'?'erase':color,width:currentWidth(),points:[point(e)],pointer:e.pointerId};activeType=e.pointerType;lastRaw=null;redoStack=[];paintLive();history()};
// A finger or mouse hand-shakes a little: each new point moves most of the way toward the pointer, and points that barely moved are dropped.
// A pen is already smooth and an eraser needs to be exact, so those go in as they come.
function addSample(sample){const p=point(sample),pts=active.points,last=pts[pts.length-1];lastRaw=p.slice();
  if(last){if(sample.pointerType!=='pen'&&active.tool!=='erase'){p[0]=r1(last[0]+(p[0]-last[0])*.65);p[1]=r1(last[1]+(p[1]-last[1])*.65)}if(p.length===3&&last.length===3)p[2]=Math.round((last[2]*.6+p[2]*.4)*100)/100;if(Math.hypot(p[0]-last[0],p[1]-last[1])<.6)return}
  pts.push(p)}
// Drops points that lie within `tol` page units of a straight run between their neighbours, so a long line is stored with far fewer points.
function simplifyPoints(pts,tol){const n=pts.length,keep=new Uint8Array(n),stack=[[0,n-1]];keep[0]=keep[n-1]=1;
  while(stack.length){const[lo,hi]=stack.pop();let far=-1,best=tol;const ax=pts[lo][0],ay=pts[lo][1],dx=pts[hi][0]-ax,dy=pts[hi][1]-ay,len=Math.hypot(dx,dy);
    for(let i=lo+1;i<hi;i++){const d=len?Math.abs((pts[i][0]-ax)*dy-(pts[i][1]-ay)*dx)/len:Math.hypot(pts[i][0]-ax,pts[i][1]-ay);if(d>best){best=d;far=i}}
    if(far>=0){keep[far]=1;stack.push([lo,far],[far,hi])}}
  return pts.filter((_,i)=>keep[i])}
canvas.onpointermove=e=>{if(!active||e.pointerId!==active.pointer)return;for(const sample of (e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e])){if(active.points.length>=4000){if(strokes.length>=499){toast('Page is full, start a new one',1);break}const last=active.points[active.points.length-1],pointer=active.pointer;const completed={...active};delete completed.pointer;strokes.push(completed);pushOp({k:'add'});commitStroke(completed);active={...active,points:[last],pointer}}addSample(sample)}schedulePaint()};
// Fill: find the area under the tap on the page as drawn so far, store its outline as an item, and paint it behind the lines.
function fillPointer(e){
  commitText();measure();
  if(strokes.length>=500){toast('Page is full, start a new one',1);return}
  const p=point(e);if(baseDirty)rebuildBase();
  let flat=baseCanvas;if(scale!==1){flat=document.createElement('canvas');flat.width=1000;flat.height=720;drawStrokes(flat,strokes)}
  const got=Fill.compute(flat.getContext('2d').getImageData(0,0,1000,720).data,1000,720,p[0],p[1]);
  if(got.error){canvas.classList.remove('nope');void canvas.offsetWidth;canvas.classList.add('nope');if(got.error==='leak')toast('That shape has a gap',1);return}
  const item=Fill.item(color,got.loops);strokes.push(item);pushOp({k:'add'});commitStroke(item);paintLive();history();saveDraft()}
function endStroke(e){if(!active||e.pointerId!==active.pointer)return;delete active.pointer;if(lastRaw){const l=active.points[active.points.length-1];if(Math.hypot(lastRaw[0]-l[0],lastRaw[1]-l[1])>.3)active.points.push(lastRaw)}lastRaw=null;if(active.points.length>14&&!active.points.some(q=>q.length===3))active.points=simplifyPoints(active.points,.28);strokes.push(active);pushOp({k:'add'});commitStroke(active);active=null;paintLive();history();saveDraft()}canvas.addEventListener('pointermove',e=>{if(e.pointerType==='pen')penLast=performance.now()},{passive:true});canvas.onpointerup=endStroke;canvas.onpointercancel=endStroke;
document.addEventListener('keydown',e=>{if(!$('#editor').open)return;const typing=e.target.matches('textarea,select,input:not([type=range])');
  if((e.ctrlKey||e.metaKey)&&!e.altKey){const k=e.key.toLowerCase();if(k==='enter'&&e.target===textArea){e.preventDefault();commitText()}else if(!typing&&k==='z'){e.preventDefault();e.shiftKey?redoStroke():undoStroke()}else if(!typing&&k==='y'){e.preventDefault();redoStroke()}return}
  if(e.key==='Escape'&&!inkMenu.hidden){e.preventDefault();e.stopPropagation();closeInkMenu();return}
  if(e.key==='Escape'&&textSel){e.preventDefault();e.stopPropagation();commitText();return}
  if(typing||e.altKey||e.shiftKey)return;const pick={p:'pencil',i:'ink',m:'marker',t:'text',e:'erase',f:'fill'}[e.key.toLowerCase()];if(pick){e.preventDefault();setTool(pick)}});
function busy(value){posting=value;$$('#editor button,#editor input,#editor textarea,#editor select').forEach(b=>b.disabled=value);$('#post span').textContent=value?'Saving…':'Stick to the wall';if(!value)repaint()}
$('#post').onclick=async()=>{if(posting)return;commitText();const payload=composition(),check=document.createElement('canvas');check.width=1000;check.height=720;compose(check,payload);if(!cropped(check)){$('#post-error').textContent='Write or draw something first.';return}const pendingDraft=flushDraft();busy(true);await pendingDraft;$('#draft-status').textContent='Sticking…';$('#post-error').textContent='';try{const result=await DrawingStore.save(payload,api,(done,total)=>{$('#draft-status').textContent='Sending '+done+'/'+total});notes.set(result.note.id,result.note);await Drafts.remove(draftKey()).catch(()=>{});store.remove(draftKey());if(draftId){Shelf.stuck(draftId);draftId=null;draftBase=0;draftTitle=''}$('#editor').close();window.dispatchEvent(new Event('duet:posted'));setWall(person==='aryan'?'chat':'aryan');render();}catch(e){if(e.code==='draft_changed'){notes.set(e.note.id,e.note);nonce=uid();render()}$('#post-error').textContent=e.message;$('#draft-status').textContent='Not posted · kept';}finally{busy(false);if($('#editor').open)flushDraft()}};
document.fonts.addEventListener?.('loadingdone',()=>{if($('#editor').open){baseDirty=true;paintLive();placeTextBox()}});

(async()=>{await document.fonts.load('40px "Duet Script"');try{const s=await api('session');person=s.person;if(person){show('walls');setWall(person);await sync()}else show('choose')}catch{show('welcome')}audioUI()})();

// The nib: what the pointer will leave behind, drawn at its true size so it grows and shrinks with the size slider.
// Pencil and ink are round, the marker is its slanted chisel, the eraser is its round footprint. A finger covers the nib, so touch only shows the eraser while pressed.
nib=document.createElement('span');nib.hidden=true;nib.setAttribute('aria-hidden','true');$('#editor').append(nib);let lastNib=null;
const NIB_TOOLS=['pencil','ink','marker'];
function nibPosition(e){lastNib=e;const draws=NIB_TOOLS.includes(tool);if(previewing||(!draws&&tool!=='erase')||(e.pointerType==='touch'&&(draws||!e.buttons))){nib.hidden=true;return}
  const r=rect||(measure(),rect),p=point(e),k=r.width/1000,w=currentWidth();
  nib.hidden=false;nib.style.left=(r.left+p[0]*r.width/1000)+'px';nib.style.top=(r.top+p[1]*r.height/720)+'px';
  if(tool==='erase'){nib.className='eraser-footprint';nib.style.width=nib.style.height=w*k+'px';return}
  nib.className='nib nib-'+tool;nib.style.setProperty('--nib',color);
  if(tool==='marker'){nib.style.width=Math.max(4,w*.5*k)+'px';nib.style.height=Math.max(6,w*k)+'px'}else nib.style.width=nib.style.height=Math.max(5,w*k)+'px'}
function nibHide(e){if(!e||e.type==='pointerleave'||e.pointerType==='touch')nib.hidden=true}
canvas.addEventListener('pointermove',nibPosition);canvas.addEventListener('pointerdown',nibPosition);for(const event of ['pointerleave','pointerup','pointercancel'])canvas.addEventListener(event,nibHide);
$('#pen-size').addEventListener('input',()=>{if(lastNib&&!nib.hidden)nibPosition(lastNib)});

function placeMeadow(){const entry=currentView==='welcome'||currentView==='choose';if(!entry){document.body.style.minHeight='';return}const target=currentView==='welcome'?$('#unlock'):$('.choices');const bottom=target.getBoundingClientRect().bottom+scrollY;const y=Math.max(innerHeight*.74,bottom+86);document.body.style.setProperty('--meadow-y',y+'px');document.body.style.minHeight=Math.max(innerHeight,y+70)+'px'}
new ResizeObserver(placeMeadow).observe($('.brand-scene'));new ResizeObserver(placeMeadow).observe($('.choices'));new ResizeObserver(placeMeadow).observe($('#unlock'));window.addEventListener('resize',placeMeadow);document.fonts.ready.then(placeMeadow);

