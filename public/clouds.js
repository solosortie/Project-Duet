/* Clouds: three layers of hand-drawn sprites (far, middle, near) placed by code.
   Each cloud drifts across the sky in the same wind, but the layers differ in size, speed and softness; scrolling and the pointer move the layers by
   different amounts, so the sky has depth. Everything is transform-only. Reduced motion keeps the clouds still and in place. */
(()=>{
 const SPRITES=6,LAYERS=[
  {name:'far', count:4,width:[80,120], alpha:.2, dur:[360,520],top:[2,24], scroll:.03, drift:4},
  {name:'mid', count:3,width:[120,175],alpha:.3, dur:[220,320],top:[6,32], scroll:.07, drift:9},
  {name:'near',count:1,width:[190,250],alpha:.4, dur:[140,200],top:[10,34],scroll:.12, drift:16}];
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fields=[];
 let seed=7;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},between=(r)=>r[0]+(r[1]-r[0])*rnd();
 function build(field){
  field.textContent='';const layers=[];
  LAYERS.forEach((spec,li)=>{
   const layer=document.createElement('div');layer.className='cloud-layer '+spec.name;layer.style.setProperty('--layer-alpha',spec.alpha);
   // each sprite is used once per layer before any repeats, and neighbours are spread along the sky so clouds never bunch
   const order=[...Array(SPRITES).keys()].sort(()=>rnd()-.5);
   for(let i=0;i<spec.count;i++){
    const c=document.createElement('div'),img=document.createElement('img'),dur=between(spec.dur);
    c.className='cloud';c.style.top=(spec.top[0]+(spec.top[1]-spec.top[0])*((i+rnd()*.8)/spec.count)).toFixed(1)+'%';c.style.width=Math.round(between(spec.width)*(innerWidth<620?.7:1))+'px';c.style.setProperty('--rest',(6+rnd()*68).toFixed(0)+'%');
    c.style.setProperty('--dur',dur.toFixed(0)+'s');c.style.setProperty('--delay','-'+(dur*((i+rnd()*.7)/spec.count)).toFixed(1)+'s');
    img.src='assets/cloud-'+(order[i%SPRITES]+1)+'.svg';img.alt='';img.draggable=false;img.style.setProperty('--bob',(6+rnd()*6).toFixed(1)+'s');if(rnd()<.5)img.style.scale='-1 1';
    c.append(img);layer.append(c);
   }
   field.append(layer);layers.push({el:layer,spec});
  });
  return layers;
 }
 let px=0,py=0,tx=0,ty=0,raf=0,depths=[];
 function frame(){raf=0;const quiet=reduced();px+=(tx-px)*.08;py+=(ty-py)*.08;const sy=Math.min(scrollY,900);
  for(const d of depths)d.el.style.transform=quiet?'none':'translate3d('+(px*d.depth).toFixed(1)+'px,0,0)';
  for(const f of fields)for(const l of f.layers)l.el.style.transform=quiet?'none':'translate3d('+(px*l.spec.drift).toFixed(1)+'px,'+(py*l.spec.drift*.5-sy*l.spec.scroll).toFixed(1)+'px,0)';
  if(!quiet&&(Math.abs(tx-px)>.002||Math.abs(ty-py)>.002))raf=requestAnimationFrame(frame)}
 const kick=()=>{if(!raf)raf=requestAnimationFrame(frame)};
 addEventListener('scroll',kick,{passive:true});
 addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;tx=e.clientX/innerWidth-.5;ty=e.clientY/innerHeight-.5;kick()},{passive:true});
 // a phone tilts instead of pointing: lean the sky a little with the device, where the browser allows it
 addEventListener('deviceorientation',e=>{if(e.gamma==null)return;tx=Math.max(-.5,Math.min(.5,e.gamma/60));ty=Math.max(-.5,Math.min(.5,((e.beta||0)-45)/90));kick()},{passive:true});
 function start(){depths=[...document.querySelectorAll('[data-depth]')].map(el=>({el,depth:Number(el.dataset.depth)||0}));document.querySelectorAll('[data-cloud-field]').forEach(el=>fields.push({el,layers:build(el)}));kick()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
