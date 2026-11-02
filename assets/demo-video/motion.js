// Deterministic frames: the live preview and exported film share this timeline.
const canvas = document.querySelector('#film');
const ctx = canvas.getContext('2d');
const W = 1920, H = 1080;
const lime = '#caff79', violet = '#a594ff', white = '#f4f5f0';
const images = {};
const shots = ['opened', 'selected', 'type1', 'type2', 'type3', 'text-edited', 'font-edited', 'hex-before', 'hex-edited', 'colour-edited', 'gradient-edited', 'comment-target', 'comment-open', 'comment-typing', 'comment-written', 'comment-saved', 'comments-sidebar', 'comment-located', 'saved'];
const assetsReady = Promise.all([...shots.map(name => [name, `shots/${name}.png`]), ['logo', '../logo.svg']].map(([name, src]) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => { images[name] = img; resolve(); };
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
})));
const cap = x => Math.max(0, Math.min(1, x));
const ease = x => 1 - Math.pow(1 - cap(x), 3);
const smooth = x => { x = cap(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const sceneCanvas = document.createElement('canvas');
sceneCanvas.width = W; sceneCanvas.height = H;
const s = sceneCanvas.getContext('2d');

function text(value, x, y, size = 32, colour = white, weight = 600, align = 'left') {
  s.font = `${weight} ${size}px Arial, sans-serif`;
  s.fillStyle = colour; s.textAlign = align; s.fillText(value, x, y);
}
function backdrop(t) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#10121a'); g.addColorStop(1, '#080b10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(1350 + Math.sin(t * .3) * 150, 440, 0, 1350, 440, 1050);
  glow.addColorStop(0, '#28223a50'); glow.addColorStop(1, '#28223a00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // A few drifting arcs replace the previous grid, captions and square borders.
  ctx.save(); ctx.translate(960, 550); ctx.rotate(-.27 + t * .008);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.ellipse(0, 0, 800 + i * 110, 380 + i * 90, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(165,148,255,${.025 + i * .008})`; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}
function card(name, x, y, w, h, source, angle = 0, radius = 18) {
  s.save(); s.translate(x + w / 2, y + h / 2); s.rotate(angle);
  s.shadowColor = '#00000090'; s.shadowBlur = 50; s.shadowOffsetY = 23;
  s.beginPath(); s.roundRect(-w / 2, -h / 2, w, h, radius); s.fillStyle = '#191c25'; s.fill();
  s.shadowBlur = 0; s.shadowOffsetY = 0;
  s.beginPath(); s.roundRect(-w / 2, -h / 2, w, h, radius); s.clip();
  const density = images[name].width / 1440;
  s.drawImage(images[name], ...source.map(value => value * density), -w / 2, -h / 2, w, h);
  s.restore();
  s.save(); s.translate(x + w / 2, y + h / 2); s.rotate(angle);
  s.beginPath(); s.roundRect(-w / 2, -h / 2, w, h, radius); s.strokeStyle = '#8d88a735'; s.lineWidth = 1.5; s.stroke(); s.restore();
}
function brand() { s.drawImage(images.logo, 80, 58, 44, 44); text('tweakerr', 139, 91, 29, white, 700); }
function cursor(x, y, pulse = 0) {
  s.save(); s.translate(x, y);
  if (pulse > 0) { s.beginPath(); s.arc(2, 4, 15 + 40 * pulse, 0, Math.PI * 2); s.strokeStyle = `rgba(202,255,121,${1-pulse})`; s.lineWidth = 2; s.stroke(); }
  s.beginPath(); s.moveTo(0, 0); s.lineTo(0, 30); s.lineTo(8, 24); s.lineTo(15, 39); s.lineTo(23, 35); s.lineTo(15, 21); s.lineTo(28, 20); s.closePath();
  s.fillStyle = white; s.fill(); s.strokeStyle = '#11151b'; s.lineWidth = 2.5; s.stroke(); s.restore();
}
function caption(value, x = 96) { text(value, x, 995, 29, '#b5b9c5', 400); }
const pageCrop = [263, 70, 839, 536];
const closeCrop = [390, 132, 520, 346];

function intro(t) {
  const p = ease(t / .75);
  const k = ease((t - .9) / .7);
  const width = lerp(910, 1240, k), height = width * .638;
  card('opened', 960 - width/2, 345 - k * 110 + (1-p) * 160, width, height, pageCrop, -.045 * (1-k));
  s.save(); s.globalAlpha = p * (1-k);
  s.drawImage(images.logo, 800, 151, 62, 62); text('tweakerr', 881, 198, 56, white, 700); s.restore();
  s.save(); s.globalAlpha = k; brand(); s.restore();
}
function overview(t) {
  brand(); const p = ease((t - 1.8) / .65);
  card('opened', lerp(235, 130, p), lerp(190, 153, p), lerp(1450, 1660, p), lerp(686, 785, p), [0, 0, 1440, 681], -.014 * (1-p));
  const q = smooth((t - 2.45) / 1.15);
  cursor(lerp(1470, 648, q), lerp(780, 367, q), t > 3.45 ? cap((t-3.45)/.45) : 0);
}
function mainClose(name, t, start) {
  const p = ease((t - start) / .55);
  const drift = Math.sin((t-start) * .55) * 4;
  card(name, 96 - (1-p)*95, 181 + drift + (1-p)*40, 1130, 752, closeCrop, -.011 * (1-p));
}
function edit(t) {
  brand(); const name = t < 4.55 ? 'selected' : t < 4.95 ? 'type1' : t < 5.35 ? 'type2' : t < 5.95 ? 'type3' : 'text-edited';
  mainClose(name, t, 4);
  const p = ease((t-4.2)/.6);
  card(name, 1320 + (1-p)*100, 254 - p * 14, 450, 555, [1140,90,300,370], .008 * (1-p));
  caption('Edit.');
  if(t<4.6)cursor(331,289,cap((t-4.2)/.4));
}
function restyle(t) {
  brand(); const changed = t >= 8.35;
  const name = t < 7.35 ? 'text-edited' : changed ? 'colour-edited' : 'font-edited';
  mainClose(name,t,6.6);
  const p = ease((t-6.6)/.55);
  card(name,1320+(1-p)*80,198,450,450,[1140,130,300,300]);
  const q = ease((t-7.6)/.45);
  s.save(); s.globalAlpha=q;
  card(changed?'hex-edited':'hex-before',1360,688+(1-q)*65,370,304,[1030,376,244,200],-.025*(1-q));
  s.restore();
  if(t<7.65)cursor(lerp(1721,1540,smooth((t-6.9)/.5)),321, t>7.2?cap((t-7.2)/.35):0);
  if(t>8 && t<8.7)cursor(1510,759,cap((t-8.2)/.5));
  caption('Restyle.');
}
function refine(t) {
  brand();mainClose('gradient-edited',t,10.1);
  const p=ease((t-10.1)/.5);
  card('gradient-edited',1320+(1-p)*100,300,450,277.5,[1140,370,300,185], .01*(1-p));
  // Two swatches echo the edited button; no extra labels or hex captions.
  s.save();s.globalAlpha=p;for(const [x,colour]of[[1430,lime],[1560,'#83dccf']]){s.beginPath();s.arc(x,743,36,0,Math.PI*2);s.fillStyle=colour;s.shadowColor=colour+'35';s.shadowBlur=28;s.fill();}s.restore();
  caption('Refine.');
}
function comment(t) {
  brand();
  const name = t < 12.85 ? 'comment-target' : t < 13.4 ? 'comment-open' : t < 14.05 ? 'comment-typing' : t < 16.2 ? 'comment-written' : 'comment-saved';
  const p = ease((t-12.2)/.45);
  // One continuous crop keeps the real element, #1 marker and complete dialog together.
  card(name, 240, 140 + (1-p)*45, 1440, 815.3, [360,118,680,385], -.009*(1-p));
  if(t<13.05)cursor(888,202,t>12.75?cap((t-12.75)/.3):0);
  if(t>15.95&&t<16.5)cursor(1360,820,cap((t-16.1)/.35));
  caption('Comment.');
}
function sidebar(t) {
  brand();
  const name=t<18.3?'comments-sidebar':'comment-located';
  const p=ease((t-17)/.45);
  // Enlarge the actual left Comments view, including its header, active tab,
  // Pending (1), request and Locate target; keep its attached canvas alongside.
  card(name,96-(1-p)*45,250,600,540,[0,44,240,216],-.006*(1-p));
  card(name,785+(1-p)*45,181,1040,692,[390,132,520,346],.006*(1-p));
  if(t<18.9){
    const q=smooth((t-17.65)/.6);
    cursor(lerp(541,371,q),lerp(375,690,q),t>18.2?cap((t-18.2)/.4):0);
  }
  caption('Comments.');
}
function save(t) {
  brand();
  // Actual toolbar and saved page, without shrinking the preceding sidebar hold.
  card('saved',130,153,1660,74.7,[0,0,1000,45]);
  card('saved',415,241,1090,696.3,pageCrop);
  cursor(460,187,cap((t-20.75)/.5));
  caption('Save.');
}
function outro(t) {
  const p=ease((t-21.9)/.8);
  s.save();s.globalAlpha=(1-p)*.7;card('saved',300,160,1320,844,pageCrop,0);s.restore();
  const logoY=lerp(480,301,p);
  s.drawImage(images.logo,900,logoY,120,120);
  text('tweakerr',960,logoY+195,88,white,700,'center');
  s.save();s.globalAlpha=p;text('Make it yours.',960,624+(1-p)*22,48,lime,400,'center');text('amar2210.github.io/tweakerr',960,886,24,'#8d94a5',400,'center');s.restore();
}
const scenes=[intro,overview,edit,restyle,refine,comment,sidebar,save,outro];
const starts=[0,1.8,4,6.6,10.1,12.2,17,20.6,21.9];
window.assetsReady=assetsReady;
window.videoSpec={width:W,height:H,fps:30,duration:24.4,commentControlsStart:12.2,sidebarStart:17,sidebarEnd:20.6};
window.renderFrame=async t=>{
  await assetsReady;backdrop(t);
  const i=Math.max(0,starts.findLastIndex(start=>t>=start));
  const alpha=i?smooth((t-starts[i])/.28):ease(t/.28);
  const paint=(index,opacity)=>{s.clearRect(0,0,W,H);s.globalAlpha=1;scenes[index](t);ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(sceneCanvas,0,0);ctx.restore();};
  if(i&&alpha<1)paint(i-1,1-alpha);
  paint(i,alpha);
  // A restrained motion smear accompanies the existing soundtrack's whooshes.
  if(i&&t-starts[i]<.17){const k=cap((t-starts[i])/.17);ctx.fillStyle=`rgba(165,148,255,${.055*(1-k)})`;ctx.fillRect(W*k-240,0,240,H);}
};
assetsReady.then(()=>window.renderFrame(0));
let playing=false;
document.querySelector('#play').addEventListener('click',async()=>{
  if(playing)return;await assetsReady;playing=true;const button=document.querySelector('#play');button.hidden=true;
  const music=new Audio('soundtrack-film.wav');await music.play();const start=performance.now();
  const duration=window.videoSpec.duration;
  const animate=async now=>{const t=Math.min(duration,(now-start)/1000);await window.renderFrame(Math.min(t,duration-.001));if(t<duration)requestAnimationFrame(animate);else{playing=false;button.hidden=false;music.pause();}};
  requestAnimationFrame(animate);
});
