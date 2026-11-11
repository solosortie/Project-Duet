/* The four papers, shared by the editor, the shelf, exports, the wall, the dash and the review site. Loaded before app.js. */
const PAPER_HEX={cream:'#ffffff',rose:'#fca7a7',sage:'#dce1c6',blue:'#d9e3e2'};
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
// Rose is a painted watercolour wash. It is not a repeating tile: one image is stretched over the whole page.
// Until the image has loaded, the generated tile stands in, and the page is repainted when it arrives (event: paper-ready).
const ROSE=new Image();let roseReady=false;
ROSE.onload=()=>{roseReady=true;for(const k of [...paperTiles.keys()])if(k.startsWith('prose@'))paperTiles.delete(k);dispatchEvent(new Event('paper-ready'))};
ROSE.src='/assets/paper-rose.jpg';
function paperPattern(ctx,name,k){
  if(name==='rose'&&roseReady){const w=Math.max(64,Math.round(1000*k)),h=Math.max(46,Math.round(720*k)),key='prose@'+w;let pat=paperTiles.get(key);if(pat)return pat;
    const t=document.createElement('canvas');t.width=w;t.height=h;t.getContext('2d').drawImage(ROSE,0,0,w,h);pat=ctx.createPattern(t,'repeat');paperTiles.set(key,pat);return pat}
  const px=Math.max(64,Math.round(400*k)),key='p'+name+'@'+px;let pat=paperTiles.get(key);if(pat)return pat;pat=ctx.createPattern(makePaperTile(name,px),'repeat');paperTiles.set(key,pat);return pat}
function paintPaper(c,w,h,name){c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=paperPattern(c,name,w/1000);c.fillRect(0,0,w,h);c.restore()}
// The same tiles, handed to the stylesheet, so notes on the wall wear the paper they were written on.
function installPaperTextures(){try{for(const name of Object.keys(PAPER_HEX))if(name!=='rose')document.documentElement.style.setProperty('--tex-'+name,'url('+makePaperTile(name,300).toDataURL('image/jpeg',.9)+')')}catch{/* the plain colour stays */}}
installPaperTextures();
