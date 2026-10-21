/* One shared clock for the room, the date, and server-awarded daily streaks. */
(()=>{
 const zone='Asia/Kolkata';let epoch=Date.now(),tick=performance.now(),lastDay=null,state=null,inFlight=false,pending=false,pendingPost=false;
 const now=()=>window.DuetDev?window.DuetDev.now():epoch+performance.now()-tick;
 function adopt(value){epoch=value;tick=performance.now()}
 const blend=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
 const stops=[[0,'#293548','#394348'],[5,'#41495a','#777367'],[7,'#f1d8ba','#e6ddbd'],[10,'#c8deea','#e6ecda'],[16,'#cededc','#e8dfc4'],[18,'#c99279','#b0a08a'],[20,'#293548','#394348'],[24,'#293548','#394348']];
 function paint(){const time=now(),date=new Date(time+19800000),h=date.getUTCHours()+date.getUTCMinutes()/60;const phase=h>=5&&h<9?'morning':h>=9&&h<17?'day':h>=17&&h<20?'evening':'night';document.body.dataset.time=phase;
  const i=stops.findIndex((s,index)=>index<stops.length-1&&h>=s[0]&&h<stops[index+1][0]),a=stops[Math.max(i,0)],b=stops[Math.max(i,0)+1],t=(h-a[0])/(b[0]-a[0]);document.body.style.setProperty('--sky1',blend(a[1],b[1],t));document.body.style.setProperty('--sky2',blend(a[2],b[2],t));
  $('#hour-hand').setAttribute('transform','rotate('+((h%12)*30)+' 40 40)');$('#minute-hand').setAttribute('transform','rotate('+(date.getUTCMinutes()*6)+' 40 40)');
  $('#clock-date').textContent=new Intl.DateTimeFormat('en',{timeZone:zone,day:'numeric',month:'short'}).format(time);$('#clock-date').dateTime=new Date(time).toISOString();$('#clock-face').setAttribute('aria-label',new Intl.DateTimeFormat('en',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(time)+' · Kolkata');
  const day=Math.floor((time+19800000)/86400000);if(lastDay!==null&&day!==lastDay&&!window.DuetDev){lastDay=day;state=null;refresh()}lastDay=day;paintStreak();
 }
 let sceneTimer,badgeTimer,sceneVersion=0;
 function quietMotion(){return window.DuetDev?window.DuetDev.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}
 function idleFlame(){return 'assets/'+(quietMotion()||document.body.dataset.streak==='broken'?'fire-still':document.body.dataset.streak==='renew'?'fire-renew':'fire')+'.svg'}
 function cancelScene(){sceneVersion++;clearTimeout(sceneTimer);clearTimeout(badgeTimer);$('#streak-scene').getAnimations({subtree:true}).forEach(a=>a.cancel());$('#streak-scene').hidden=true;$('#streak').classList.remove('flame-travelling');$('#streak img').classList.remove('afterglow')}
 function numberTo(count){const node=$('#streak-count'),old=node.dataset.count;node.dataset.count=String(count);if(node.textContent===String(count))return;node.textContent=count;if(old===undefined||quietMotion())return;node.getAnimations().forEach(a=>a.cancel());node.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:350,easing:'ease-out'});}
 function streakScene(kind,count){if(currentView!=='walls')return;cancelScene();const badge=$('#streak img');
  if(kind==='renew'){badge.src=quietMotion()?'assets/fire-still.svg':'assets/fire-renew.svg';$('.day-clock').classList.remove('renewed');void $('.day-clock').offsetWidth;$('.day-clock').classList.add('renewed');badge.classList.add('afterglow');badgeTimer=setTimeout(()=>badge.classList.remove('afterglow'),800);return;}
  const scene=$('#streak-scene'),version=sceneVersion,duration=quietMotion()?450:kind==='broken'?1700:2400;scene.hidden=false;scene.className=kind;scene.style.setProperty('--scene-duration',duration+'ms');scene.querySelector('span').textContent=count;const flame=scene.querySelector('img');flame.src='assets/'+(quietMotion()?'fire-still':kind==='broken'?'fire-broken':'fire-formed')+'.svg';
  if(!quietMotion()){
   const start=flame.getBoundingClientRect(),end=badge.getBoundingClientRect(),dx=end.left+end.width/2-start.left-start.width/2,dy=end.top+end.height/2-start.top-start.height/2,scale=end.width/start.width;
   $('#streak').classList.add('flame-travelling');
   const frames=[{offset:0,transform:'translate(0,0) scale(1)',opacity:0},{offset:.12,transform:'translate(0,0) scale(1)',opacity:1},{offset:.58,transform:'translate(0,0) scale(1)',opacity:1}];
   for(let i=1;i<=30;i++){const t=i/30,u=t*t*(3-2*t),v=1-u,x=3*v*u*u*dx*.7+u*u*u*dx,y=3*v*v*u*(-35)+3*v*u*u*(dy-35)+u*u*u*dy;frames.push({offset:.58+.42*t,transform:`translate(${x}px,${y}px) scale(${1+(scale-1)*u})`,opacity:1})}
   flame.animate(frames,{duration,fill:'forwards',easing:'linear'});
  }
  sceneTimer=setTimeout(()=>{if(version!==sceneVersion)return;scene.hidden=true;$('#streak').classList.remove('flame-travelling');badge.src=idleFlame();badge.classList.add('afterglow');badgeTimer=setTimeout(()=>badge.classList.remove('afterglow'),1000)},duration);
 }
 function paintStreak(celebrate=false){const badge=$('#streak'),s=state?.shared;badge.hidden=!person||!s||currentView!=='walls';if(!s)return;const kind=s.today?'complete':s.count?'renew':'broken';document.body.dataset.streak=kind;if(badge.dataset.state!==kind){badge.dataset.state=kind;$('#streak img').src=idleFlame()}numberTo(s.count);badge.classList.toggle('lit',s.today);
  const progress=((now()+19800000)%86400000)/86400000;document.body.style.setProperty('--flame-hue',(-38*progress)+'deg');document.body.style.setProperty('--flame-glow','hsl('+(43-33*progress)+' 80% 58% / .28)');
  for(const who of ['aryan','chat'])$('[data-contributor="'+who+'"]').classList.toggle('posted',s.contributions[who]);
  badge.title=s.count+' day shared streak · '+(s.today?'both posted today':Object.values(s.contributions).filter(Boolean).length+'/2 posted today · midnight IST');badge.setAttribute('aria-label',badge.title);
  if(currentView!=='walls')return;
  if(window.DuetDev){if(celebrate&&s.today)streakScene('continued',s.count);return;}
  const event=kind==='broken'?'broken:'+s.lastCompletedDay:state.day+':'+kind,key='duet-shared-event';if(store.get(key)===event)return;store.set(key,event);
  if(kind==='complete')streakScene('continued',s.count);else if(kind==='renew')streakScene('renew',s.count);else if(s.lastCompletedDay!==null)streakScene('broken',0);
 }
 async function refresh(posted=false){if(window.DuetDev){state=window.DuetDev.state();paint();if(posted)paintStreak(true);return;}if(inFlight){pending=true;pendingPost ||= posted;return;}inFlight=true;const owner=person,started=performance.now();try{const data=await rawApi(owner?'state':'time');adopt(data.now+(performance.now()-started)/2);if(owner===person&&data.streaks){const before=state?.shared;state=data;paintStreak(posted&&(!before?.today||before.count!==data.shared.count))}paint()}catch{/* Existing clock continues offline; no unconfirmed streak award. */}finally{inFlight=false;if(pending){const celebrate=pendingPost;pending=false;pendingPost=false;refresh(celebrate)}}}
 window.addEventListener('duet:view',()=>{if(currentView!=='walls')cancelScene();paintStreak();refresh()});window.addEventListener('duet:updated',()=>refresh());window.addEventListener('resize',()=>{if(!$('#streak-scene').hidden)cancelScene()});window.addEventListener('duet:posted',()=>refresh(true));window.addEventListener('online',()=>refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden){paint();refresh()}});setInterval(()=>{if(!document.hidden)paint()},15000);setInterval(()=>{if(!document.hidden)refresh()},60000);paint();refresh();
 // Playlist lives entirely inside Sound settings.
 const tracks=[['Coffee','assets/coffee.mp3'],['tranquil','assets/calm.mp3'],['Sky','assets/coffee-evening.mp3']];let track=Math.max(0,Math.min(2,Number(store.get('duet-track',0))||0));
 function choose(index,play){track=index%tracks.length;audio.src=tracks[track][1];$('#track-name').textContent=tracks[track][0];store.set('duet-track',track);if(play)startMusic();else audioUI()}
 window.DuetPreview={refresh:()=>refresh(),scene:streakScene,track:index=>choose(index,!audio.paused&&!audio.muted)};
 audio.loop=false;audio.addEventListener('ended',()=>choose(track+1,true));$('#next-track').onclick=()=>choose(track+1,!audio.paused&&!audio.muted);choose(track,false);
})();
