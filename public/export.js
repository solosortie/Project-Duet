/* Settings > Export. Builds both downloads in the browser, so the Worker does no extra work. */
(()=>{
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const NAMES={chat:'ChatChan',aryan:'Aryan Chan'};
const PAPER={cream:'#fff6e5',rose:'#efd2bd',sage:'#dce1c6',blue:'#d9e3e2'};
let wallChoice='both',busy=false;

const tabs=qa('.settings-tabs [data-tab]');
tabs.forEach(b=>b.onclick=()=>{tabs.forEach(t=>t.setAttribute('aria-selected',String(t===b)));for(const n of ['sound','export'])q('#tab-'+n).hidden=n!==b.dataset.tab});
qa('[data-export-wall]').forEach(b=>b.onclick=()=>{wallChoice=b.dataset.exportWall;qa('[data-export-wall]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));say('')});

const say=t=>{q('#export-status').textContent=t};
const pick=n=>wallChoice==='both'||n.recipient===wallChoice;
const walls=()=>wallChoice==='both'?['chat','aryan']:[wallChoice];
const day=()=>new Date().toISOString().slice(0,10);
const tag=()=>wallChoice==='both'?'both-walls':wallChoice==='chat'?'chatchan':'aryan-chan';
function work(button,label,fn){
  if(busy)return;
  if(!person||currentView!=='walls'){say('Open a wall first, then export.');return}
  busy=true;const text=button.querySelector('span'),old=text.textContent;qa('#tab-export button').forEach(b=>b.disabled=true);text.textContent=label;
  fn().catch(e=>say(e&&e.message?e.message:'Export failed.')).finally(()=>{busy=false;text.textContent=old;qa('#tab-export button').forEach(b=>b.disabled=false)});
}
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}

async function fetchAll(){
  const all=new Map();let cursor=null;
  for(;;){const r=await api('notes'+(cursor?'?before='+cursor:''));for(const n of r.notes)all.set(n.id,n);say('Collecting notes… '+all.size);if(!r.more||!r.notes.length)break;cursor=Math.min(...r.notes.map(n=>n.id))}
  return [...all.values()].filter(pick).sort((a,b)=>a.id-b.id);
}

/* ---- zip (stored, no compression) ---- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function makeZip(files){
  const enc=new TextEncoder(),parts=[],central=[],d=new Date();let offset=0;
  const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){
    const name=enc.encode(f.name),crc=crc32(f.data),size=f.data.length;
    const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(10,time,true);lh.setUint16(12,date,true);lh.setUint32(14,crc,true);lh.setUint32(18,size,true);lh.setUint32(22,size,true);lh.setUint16(26,name.length,true);
    parts.push(new Uint8Array(lh.buffer),name,f.data);
    const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);ch.setUint32(16,crc,true);ch.setUint32(20,size,true);ch.setUint32(24,size,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),name);offset+=30+name.length+size;
  }
  const cd=central.reduce((a,c)=>a+c.length,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cd,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:'application/zip'});
}

/* ---- notes export ---- */
const kindOf=n=>n.format===3?'written':n.format===2?'canvas':'drawing';
const csvCell=v=>{v=v==null?'':String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
function notePng(n){
  return new Promise(resolve=>{
    const src=document.createElement('canvas');src.width=1000;src.height=n.format===2?720:650;
    if(n.format===2)compose(src,n);else drawStrokes(src,n.drawing);
    const c=cropped(src);if(!c)return resolve(null);
    const out=document.createElement('canvas');out.width=c.width;out.height=c.height;const g=out.getContext('2d');
    g.fillStyle=PAPER[n.paper]||PAPER.cream;g.fillRect(0,0,out.width,out.height);g.drawImage(c,0,0);
    out.toBlob(async b=>resolve(b?new Uint8Array(await b.arrayBuffer()):null),'image/png');
  });
}
async function exportNotes(){
  say('Collecting notes…');
  const list=await fetchAll();
  if(!list.length){say('There are no notes on that wall yet.');return}
  const enc=new TextEncoder(),files=[],records=[];
  for(let i=0;i<list.length;i++){
    const n=list[i];let image=null;
    if(n.format!==3){say('Rendering drawings… '+(i+1)+' of '+list.length);const png=await notePng(n);if(png){image='images/note-'+String(n.id).padStart(5,'0')+'.png';files.push({name:image,data:png})}}
    records.push({id:n.id,author:n.author,recipient:n.recipient,created:n.created,created_iso:new Date(n.created*1000).toISOString(),kind:kindOf(n),format:n.format,paper:n.paper,text_size:n.text_size,text:n.text||'',nonce:n.nonce,image,strokes:n.drawing||[]});
  }
  const exportedAt=new Date().toISOString();
  const json={app:'Project Duet',exported_at:exportedAt,exported_by:person,walls:walls(),note_count:records.length,notes:records};
  const head=['id','created','wall','author','kind','paper','text_size','stroke_count','image','text'];
  const csv='\ufeff'+[head.join(',')].concat(records.map(r=>[r.id,r.created_iso,NAMES[r.wall]||r.wall,NAMES[r.author]||r.author,r.kind,r.paper,r.text_size,r.strokes.length,r.image||'',r.text].map(csvCell).join(','))).join('\r\n')+'\r\n';
  const readme=['Project Duet export','Exported: '+exportedAt,'Walls: '+walls().map(w=>NAMES[w]).join(', '),'Notes: '+records.length,'',
    'notes.json  every note with its details: id, author, wall, created time (unix seconds and ISO), paper, kind, text size, text, the original id used for retries, and the drawing strokes exactly as stored.',
    'notes.csv   the same details without the strokes, for a spreadsheet.',
    'images/     each canvas or drawing as a PNG on its paper color, matching how it looks on the wall.','',
    'Strokes: each stroke has tool, color, width and points. A point is [x, y] or [x, y, pressure] on a canvas 1000 units wide. Eraser strokes remove ink drawn before them.'].join('\r\n');
  files.unshift({name:'readme.txt',data:enc.encode(readme)},{name:'notes.json',data:enc.encode(JSON.stringify(json,null,2))},{name:'notes.csv',data:enc.encode(csv)});
  save(makeZip(files),'project-duet-notes-'+tag()+'-'+day()+'.zip');
  say('Saved '+records.length+(records.length===1?' note.':' notes.'));
}

/* ---- page export ---- */
const memo=new Map();
function dataUri(url){
  if(!memo.has(url))memo.set(url,fetch(url).then(r=>{if(!r.ok)throw 0;return r.blob()}).then(b=>new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>ok(f.result);f.onerror=no;f.readAsDataURL(b)})).catch(()=>null));
  return memo.get(url);
}
async function inlineCss(css){
  const base=new URL('style.css',location.href),re=/url\(\s*(['"]?)(?!data:|#|%23)([^)'"]+)\1\s*\)/g;
  const map=new Map();
  for(const m of css.matchAll(re))if(!map.has(m[2]))map.set(m[2],await dataUri(new URL(m[2],base).href));
  return css.replace(re,(m,qt,u)=>map.get(u)?'url("'+map.get(u)+'")':m);
}
async function inlineImages(html){
  const re=/src="([^"]+)"/g,map=new Map();
  for(const m of html.matchAll(re)){const u=m[1];if(u.startsWith('data:')||map.has(u))continue;const abs=new URL(u,location.href);if(abs.origin===location.origin)map.set(u,await dataUri(abs.href))}
  return html.replace(re,(m,u)=>map.get(u)?'src="'+map.get(u)+'"':m);
}
function cardHtml(n){
  const card=makeCard(n);
  card.querySelectorAll('canvas').forEach(c=>{const i=document.createElement('img');i.src=c.toDataURL('image/png');i.alt=c.getAttribute('aria-label')||'';i.className='drawn';c.replaceWith(i)});
  return card.outerHTML;
}
const EXTRA='.mobile-tabs{display:none!important}.note img.drawn{display:block;width:100%;height:auto}.wall-grid.single{display:grid;grid-template-columns:minmax(0,560px);justify-content:center}@media(max-width:900px){.wall-grid:not(.single) .wall+.wall{margin-top:44px}}';
async function exportPage(){
  say('Collecting notes…');
  const list=(await fetchAll()).sort((a,b)=>b.id-a.id);
  say('Building page…');
  const time=document.body.dataset.time||'day';
  const css=await inlineCss(await (await fetch('style.css')).text());
  const sections=walls().map(w=>{
    const heading=q('.wall[data-owner='+w+'] .wall-heading').outerHTML;
    return '<section class="wall active" data-owner="'+w+'">'+heading+'<div class="notes">'+list.filter(n=>n.recipient===w).map(cardHtml).join('')+'</div></section>';
  }).join('');
  const body='<body data-view="walls" data-time="'+time+'">'+q('.walls-bg').outerHTML+
    '<header class="site-header"><div class="brand-scene"><div class="wordmark"><span class="project-word">PROJECT</span> <span>DUET</span></div></div></header>'+
    '<main><section id="walls"><div class="wall-grid'+(wallChoice==='both'?'':' single')+'">'+sections+'</div></section></main></body>';
  const html='<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project Duet</title><style>'+css+EXTRA+'</style></head>\n<!-- Saved from Project Duet on '+new Date().toISOString()+' ('+time+') -->\n'+await inlineImages(body)+'</html>';
  save(new Blob([html],{type:'text/html'}),'project-duet-page-'+tag()+'-'+day()+'.html');
  say('Saved the page at '+time+' time.');
}

q('#export-notes').onclick=e=>work(e.currentTarget,'Saving…',exportNotes);
q('#export-page').onclick=e=>work(e.currentTarget,'Saving…',exportPage);
})();
