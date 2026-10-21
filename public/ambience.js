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
 let sceneTimer,badgeTimer;
 function quietMotion(){return window.DuetDev?window.DuetDev.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}
 function streakScene(kind,count){if(currentView!=='walls')return;const scene=$('#streak-scene'),badge=$('#streak img');clearTimeout(sceneTimer);clearTimeout(badgeTimer);scene.getAnimations({subtree:true}).forEach(a=>a.cancel());scene.hidden=false;scene.className=kind;void scene.offsetWidth;const flame=scene.querySelector('img'),asset=kind==='broken'?'fire-broken':kind==='renew'?'fire-renew':'fire-formed';flame.src='assets/'+(quietMotion()?'fire-still':asset)+'.svg';scene.querySelector('span').textContent=kind==='broken'?'0':count;scene.style.setProperty('--scene-duration',quietMotion()?'750ms':'4800ms');scene.style.setProperty('--flame-hue',document.body.style.getPropertyValue('--flame-hue'));badge.classList.remove('earned');
  sceneTimer=setTimeout(()=>{scene.hidden=true;badge.src='assets/'+(quietMotion()?'fire-still':asset)+'.svg';badge.classList.add('afterglow');badgeTimer=setTimeout(()=>{badge.classList.remove('afterglow');const name=document.body.dataset.streak==='broken'?'fire-still':document.body.dataset.streak==='renew'?'fire-renew':'fire';badge.src='assets/'+(quietMotion()?'fire-still':name)+'.svg'},4200)},quietMotion()?750:4800);
 }
 function paintStreak(celebrate=false){const badge=$('#streak'),s=state?.streaks?.[person];badge.hidden=!person||!s||currentView!=='walls';if(!s)return;if(quietMotion())$('#streak img').src='assets/fire-still.svg';const kind=s.today?'complete':s.count?'renew':'broken';document.body.dataset.streak=kind;if(badge.dataset.state!==kind){badge.dataset.state=kind;$('#streak img').src='assets/'+(quietMotion()||kind==='broken'?'fire-still':kind==='renew'?'fire-renew':'fire')+'.svg'}$('#streak-count').textContent=s.count;badge.classList.toggle('lit',s.today);const progress=((now()+19800000)%86400000)/86400000;document.body.style.setProperty('--flame-hue',(-38*progress)+'deg');document.body.style.setProperty('--flame-glow','hsl('+(43-33*progress)+' 80% 58% / .28)');badge.title=s.count+' day streak · '+(s.today?'posted today':'post before midnight IST');badge.setAttribute('aria-label',badge.title);
  if(window.DuetDev){if(celebrate)streakScene('continued',s.count);return;}
  if(currentView!=='walls')return;const key='duet-streak-event-'+person,seen=store.get(key,''),event=state.day+':'+kind;
  if(celebrate&&s.today&&seen!==event){store.set(key,event);streakScene('continued',s.count)}
  else if(kind==='broken'&&state.lastDays?.[person]!=null){const broken='broken:'+state.lastDays[person];if(seen!==broken){store.set(key,broken);streakScene('broken',0)}}
  else if(kind==='renew'&&seen!==event){store.set(key,event);$('.day-clock').classList.remove('renewed');requestAnimationFrame(()=>$('.day-clock').classList.add('renewed'));streakScene('renew',s.count)}
 }
 async function refresh(posted=false){if(window.DuetDev){state=window.DuetDev.state();paint();if(posted)paintStreak(true);return;}if(inFlight){pending=true;pendingPost ||= posted;return;}inFlight=true;const owner=person,started=performance.now();try{const data=await rawApi(owner?'state':'time');adopt(data.now+(performance.now()-started)/2);if(owner===person&&data.streaks){const before=state?.streaks?.[owner];state=data;paintStreak(posted&&(!before?.today||before.count!==data.streaks[owner].count))}paint()}catch{/* Existing clock continues offline; no unconfirmed streak award. */}finally{inFlight=false;if(pending){const celebrate=pendingPost;pending=false;pendingPost=false;refresh(celebrate)}}}
 window.addEventListener('duet:view',()=>{paintStreak();refresh()});window.addEventListener('duet:posted',()=>refresh(true));window.addEventListener('online',()=>refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden){paint();refresh()}});setInterval(()=>{if(!document.hidden)paint()},15000);setInterval(()=>{if(!document.hidden)refresh()},60000);paint();refresh();
 // Playlist lives entirely inside Sound settings.
 const tracks=[['Coffee','assets/coffee.mp3'],['tranquil','assets/calm.mp3'],['Sky','assets/coffee-evening.mp3']];let track=Math.max(0,Math.min(2,Number(store.get('duet-track',0))||0));
 function choose(index,play){track=index%tracks.length;audio.src=tracks[track][1];$('#track-name').textContent=tracks[track][0];store.set('duet-track',track);if(play)startMusic();else audioUI()}
 window.DuetPreview={refresh:()=>refresh(),scene:streakScene,track:index=>choose(index,!audio.paused&&!audio.muted)};
 audio.loop=false;audio.addEventListener('ended',()=>choose(track+1,true));$('#next-track').onclick=()=>choose(track+1,!audio.paused&&!audio.muted);choose(track,false);
})();
