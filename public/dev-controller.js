/* Opt-in, memory-only preview. No preview request reaches the backend. */
(()=>{
 if(new URLSearchParams(location.search).get('dev')!=='1')return;
 const uploads=new Map();let clock=Date.now(),anchor=performance.now(),id=0;
 const dev=window.DuetDev={person:'aryan',rate:0,speed:1,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,delay:0,fail:false,day:Math.floor((clock+19800000)/86400000),notes:[],counts:{aryan:3,chat:2},status:{aryan:'renew',chat:'complete'},now:()=>clock+(performance.now()-anchor)*dev.rate,
  setTime(value){clock=value;anchor=performance.now()},
  state(){const day=Math.floor((dev.now()+19800000)/86400000),elapsed=day-dev.day;if(elapsed>0){for(const p of ['aryan','chat'])dev.status[p]=dev.status[p]==='complete'&&elapsed===1?'renew':'broken'}dev.day=day;return {now:dev.now(),day,streaks:Object.fromEntries(['aryan','chat'].map(p=>[p,{count:dev.status[p]==='broken'?0:dev.counts[p],today:dev.status[p]==='complete'}])),lastDays:{aryan:day-1,chat:day-1}}},
  async request(path,data){if(dev.delay)await new Promise(r=>setTimeout(r,dev.delay));if(dev.fail)throw Error('Preview: simulated connection failure. Draft kept.');
   if(path==='session')return {person:dev.person};if(path==='time'||path==='state')return dev.state();if(path==='person'){dev.person=data.person;return {ok:true}}if(path==='unlock'||path==='logout')return {ok:true};
   if(path.startsWith('notes')&&!data){const q=new URLSearchParams(path.split('?')[1]),after=Number(q.get('after')||0);return {notes:dev.notes.filter(n=>n.id>after),more:false}}
   if(path==='uploads'){uploads.set(data.upload,{...data,chunks:[]});return {ok:true}}
   if(path==='uploads/chunk'){uploads.get(data.upload).chunks[data.part]=data.drawing;return {ok:true}}
   if(path==='uploads/commit'){const u=uploads.get(data.upload);data={...u,format:2,text:'',drawing:u.chunks.flat().map(DrawingStore.unpack)};path='notes'}
   if(path==='notes'&&data){dev.state();let n=dev.notes.find(n=>n.nonce===data.nonce);if(!n){n={...data,id:++id,created:dev.now()/1000,author:dev.person,recipient:dev.person==='aryan'?'chat':'aryan'};dev.notes.push(n);if(dev.status[dev.person]!=='complete')dev.counts[dev.person]=dev.status[dev.person]==='broken'?1:dev.counts[dev.person]+1;dev.status[dev.person]='complete'}return {note:n}}
   throw Error('Preview does not implement this request.');
  }
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const panel=document.createElement('details');panel.id='dev-controller';panel.innerHTML=`<summary>Dev preview</summary><p>Memory only · reload to reset · no server writes</p>
 <label>Screen<select id="dev-view"><option value="welcome">Onboarding</option><option value="choose">Choosing</option><option value="walls" selected>Walls</option></select></label>
 <label>Person<select id="dev-person"><option value="aryan">Aryan Chan</option><option value="chat">ChatChan</option></select></label>
 <label>Kolkata date & time<input id="dev-time" type="datetime-local"></label><label>Time speed<select id="dev-rate"><option value="0">Frozen</option><option value="1">Real time</option><option value="60">1 minute / second</option><option value="3600">1 hour / second</option></select></label>
 <div class="dev-actions"><button data-hours="-24">−1 day</button><button data-hours="24">+1 day</button><button id="dev-now">Now</button></div>
 <fieldset><legend>Streaks</legend>${['aryan','chat'].map(p=>`<label>${p==='aryan'?'Aryan':'ChatChan'} days<input id="dev-${p}-count" type="number" min="0" max="9999" value="${dev.counts[p]}"></label><label>State<select id="dev-${p}-state"><option value="renew">Due today</option><option value="complete" ${p==='chat'?'selected':''}>Completed today</option><option value="broken">Broken</option></select></label>`).join('')}</fieldset>
 <div class="dev-actions"><button data-scene="continued">Replay gain</button><button data-scene="broken">Replay break</button><button id="dev-renew">Renewal</button></div>
 <label>Reduced motion<input id="dev-motion" type="checkbox" ${dev.reduced?'checked':''}></label>
 <label>Track<select id="dev-track"><option value="0">Coffee</option><option value="1">tranquil</option><option value="2">Sky</option></select></label><div class="dev-actions"><button id="dev-sound">Sound controls</button><button id="dev-text">Write note</button><button id="dev-canvas">Draw canvas</button></div>
 <label>Request delay (ms)<input id="dev-delay" type="number" value="0" min="0" max="10000" step="250"></label><label>Fail requests<input id="dev-fail" type="checkbox"></label><div class="dev-actions"><button id="dev-seed">Sample walls</button><button id="dev-clear">Empty walls</button><button id="dev-exit">Exit preview</button></div>`;
  document.body.append(panel);const get=id=>panel.querySelector('#dev-'+id),refresh=()=>{window.DuetPreview.refresh();for(const p of ['aryan','chat'])get(p+'-state').value=dev.status[p]};
  function timeField(){get('time').value=new Date(dev.now()+19800000).toISOString().slice(0,16)}timeField();
  function screen(){person=dev.person;show(get('view').value);setWall(person);refresh()}
  get('view').onchange=screen;get('person').onchange=()=>{dev.person=get('person').value;screen()};get('time').onchange=()=>{const v=Date.parse(get('time').value+'+05:30');if(Number.isFinite(v)){dev.setTime(v);refresh()}};
  get('rate').onchange=()=>{dev.setTime(dev.now());dev.rate=Number(get('rate').value)};get('now').onclick=()=>{dev.setTime(Date.now());timeField();refresh()};
  panel.querySelectorAll('[data-hours]').forEach(b=>b.onclick=()=>{dev.setTime(dev.now()+Number(b.dataset.hours)*3600000);timeField();refresh()});
  for(const p of ['aryan','chat']){get(p+'-count').oninput=()=>{dev.counts[p]=Math.max(0,Math.min(9999,Number(get(p+'-count').value)||0));refresh()};get(p+'-state').onchange=()=>{dev.status[p]=get(p+'-state').value;refresh()}}
  panel.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{get('view').value='walls';screen();window.DuetPreview.scene(b.dataset.scene,dev.counts[dev.person])});
  get('renew').onclick=()=>{dev.status[dev.person]='renew';get(dev.person+'-state').value='renew';get('view').value='walls';screen();const c=document.querySelector('.day-clock');c.classList.remove('renewed');void c.offsetWidth;c.classList.add('renewed');window.DuetPreview.scene('renew',dev.counts[dev.person])};
  function motion(){dev.reduced=get('motion').checked;document.body.classList.toggle('dev-reduced',dev.reduced);document.querySelectorAll('img[src*="assets/cat"],img[src*="assets/deer"]').forEach(i=>i.src=i.src.replace(/(?:-still)?\.svg$/,dev.reduced?'-still.svg':'.svg'));document.querySelector('#streak img').src=dev.reduced?'assets/fire-still.svg':'assets/fire.svg'}get('motion').onchange=motion;motion();
  get('track').onchange=()=>window.DuetPreview.track(Number(get('track').value));get('sound').onclick=()=>document.querySelector('#settings-open').click();
  for(const mode of ['text','canvas'])get(mode).onclick=()=>{get('view').value='walls';screen();openEditor(mode==='text'?'note':'canvas')};
  get('delay').oninput=()=>dev.delay=Math.max(0,Math.min(10000,Number(get('delay').value)||0));get('fail').onchange=()=>dev.fail=get('fail').checked;
  function renderSamples(){notes=new Map(dev.notes.map(n=>[n.id,n]));hasMore=false;render()}
  get('seed').onclick=()=>{dev.notes=Array.from({length:8},(_,i)=>({id:++id,nonce:'preview-'+id,format:3,author:i%2?'aryan':'chat',recipient:i%2?'chat':'aryan',text:i%2?'A quiet afternoon.':'See you here tomorrow.',drawing:[],paper:['cream','rose','sage','blue'][i%4],text_size:[32,40,52][i%3],created:dev.now()/1000-i*86400}));renderSamples()};get('clear').onclick=()=>{dev.notes=[];renderSamples()};get('exit').onclick=()=>{const u=new URL(location.href);u.searchParams.delete('dev');location.href=u.href};
  setInterval(()=>{if(dev.rate){refresh();timeField()}},250);
 });
})();
