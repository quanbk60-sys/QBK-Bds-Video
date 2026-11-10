// PHẦN B: dựng, kiểm tra tự động, ghi video. Chạy sau part-a-data.js, trong cùng tab.
// Kết quả: window.ST (trạng thái, đọc JSON.stringify(window.ST)), window.RENDER(t), window.CVS, window.REC, window.showVideo(), window.showSheet().
(()=>{
const CFG=window.CFG,{P,pois}=window.D,N=pois.length;
const W=576,H=1024,FPS=30,M=36,CARD_B=H-84,CARD_H=108,OUT_H=176;
const INTRO=3.5,SC=5.5,OUT0=INTRO+SC*N,T=OUT0+3.5;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=u=>{u=clamp(u);return u*u*(3-2*u);};
const lerp=(a,b,u)=>a+(b-a)*u;
const FONT=(w,s)=>`${w} ${s}px "Segoe UI","Helvetica Neue",Arial,sans-serif`;
document.documentElement.innerHTML='<head><meta charset="utf-8"><title>Map video</title></head><body style="margin:0;background:#0b0f1a;color:#cfd6e6;font-family:Segoe UI,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh"><div id="st" style="padding:6px;font-size:13px">...</div><div id="stage"></div></body>';
const st=document.getElementById('st');window.ST={phase:'init'};
const setSt=s=>{window.ST.phase=s;st.textContent=s;};
const cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.style.cssText='max-height:86vh;max-width:96vw;background:#000';
document.getElementById('stage').appendChild(cv);const ctx=cv.getContext('2d');
const STY={gold:{m:['#fff7c9','#ffd94f','#d9a31c','#85560a','#f6cf63'],flat:'#ffc247',txt:'#2a1a00'},
 blue:{m:['#eaf5ff','#8fc6ff','#3b7bdc','#16367a','#9bcaff'],flat:'#5fa8ff',txt:'#04122e'},
 ruby:{m:['#ffe6ea','#ff8d9f','#dc304a','#6f0f24','#ffb3bf'],flat:'#ff5d73',txt:'#2a0510'}};
pois.forEach(p=>{p.color=STY[p.sty].flat;});
const mg=(sty,y0,y1)=>{const g=ctx.createLinearGradient(0,y0,0,y1);[0,.3,.55,.8,1].forEach((o,i)=>g.addColorStop(o,STY[sty].m[i]));return g;};
let RECTS=[];const logR=(kind,x0,y0,x1,y1,id)=>RECTS.push({kind,x0,y0,x1,y1,id});
function fitFont(text,wt,start,min,maxW){let s=start;ctx.font=FONT(wt,s);while(ctx.measureText(text).width>maxW&&s>min){s-=1;ctx.font=FONT(wt,s);}return s;}
const mx=lon=>(lon+180)/360;const my=lat=>{const s=Math.sin(lat*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI);};
const proj=[mx(P.lon),my(P.lat)];
const routes=pois.map(p=>{const pts=p.coords.map(c=>[mx(c[0]),my(c[1])]);const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return {p,pts,cum,end:pts[pts.length-1]};});
// tilted camera, project always at screen centre
const D=1000,CY0=500,YMIN=130,FX0=700,FY0=1500,PHI=40*Math.PI/180;
const flat=document.createElement('canvas');flat.width=1400;flat.height=2100;const fx=flat.getContext('2d');
function geom(phi){const c=Math.cos(phi),s=Math.sin(phi),yq=YMIN-CY0,Qf=D*c+yq*s,sf=Qf/(D*c),yn=H-CY0,Qn=D*c+yn*s;return {c,s,FU:W/(2*sf)+10,VF:-(yq*D/Qf)+10,VB:yn*D/Qn+10};}
function mkProj(cam){const g=geom(cam.phi),k=256*2**cam.z;return (x,y)=>{const u=(x-proj[0])*k,v=(y-proj[1])*k,den=D-v*g.s;if(den<5)return [0,-9999,.1];const sc=D/den;return [W/2+u*sc,CY0+sc*v*g.c,sc];};}
const CARD_TOP=CARD_B-CARD_H,OUT_TOP=CARD_B-OUT_H;
function fitC(pts,top,bottom){for(let z=16.2;z>8;z-=0.02){const S=mkProj({z,phi:PHI});let ok=true;for(const p of pts){const q=S(p[0],p[1]);if(q[0]<80||q[0]>W-80||q[1]<top||q[1]>bottom){ok=false;break;}}if(ok)return {z,phi:PHI};}return {z:9,phi:PHI};}
const fits=routes.map(r=>fitC([proj,...r.pts],215,CARD_TOP-44));
const fitAll=fitC([proj,...routes.flatMap(r=>r.pts)],215,OUT_TOP-44);
window.FITS=fits.map(f=>+f.z.toFixed(2)).concat([+fitAll.z.toFixed(2)]);
const intro0={z:12.8,phi:15*Math.PI/180},intro1={z:15.0,phi:PHI};
const mixc=(a,b,u)=>({z:lerp(a.z,b.z,u),phi:lerp(a.phi,b.phi,u)});
function camAt(t){if(t<INTRO)return mixc(intro0,intro1,ease(t/INTRO));if(t>=OUT0)return mixc(fits[N-1],fitAll,ease((t-OUT0)/1.8));
  const i=Math.min(N-1,Math.floor((t-INTRO)/SC)),T0=INTRO+SC*i;return mixc(i===0?intro1:fits[i-1],fits[i],ease((t-T0)/1.4));}
const cache=new Map();
function tileList(cam){const zi=Math.min(17,Math.ceil(cam.z)),n=2**zi,ts=256*2**(cam.z-zi),g=geom(cam.phi),cxT=proj[0]*n,cyT=proj[1]*n;
  const x0=Math.floor(cxT-g.FU/ts),x1=Math.floor(cxT+g.FU/ts),y0=Math.floor(cyT-g.VF/ts),y1=Math.floor(cyT+g.VB/ts);const out=[];
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)out.push([zi,x,y,cxT,cyT,ts]);return out;}
async function prefetch(){const keys=new Set();for(let i=0;i<T*FPS;i++)for(const [z,x,y] of tileList(camAt(i/FPS)))keys.add(z+'/'+x+'/'+y);
  const arr=[...keys];let done=0,failed=0;
  async function one(k){const [z,x,y]=k.split('/');try{const r=await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`);if(!r.ok)throw 0;cache.set(k,await createImageBitmap(await r.blob()));}catch(e){failed++;}done++;if(done%40===0)setSt(`Đang tải tile ${done}/${arr.length}`);}
  let idx=0;await Promise.all(Array.from({length:12},async()=>{while(idx<arr.length)await one(arr[idx++]);}));return {total:arr.length,failed};}
let STEP=1;
function drawMap(cam){const g=geom(cam.phi);fx.fillStyle='#0a0f1c';fx.fillRect(FX0-g.FU,FY0-g.VF,2*g.FU,g.VF+g.VB);
  for(const [z,x,y,cxT,cyT,ts] of tileList(cam)){const b=cache.get(z+'/'+x+'/'+y);if(b)fx.drawImage(b,FX0+(x-cxT)*ts,FY0+(y-cyT)*ts,ts+0.7,ts+0.7);}
  for(let ys=YMIN;ys<H;ys+=STEP){const yp=ys-CY0,Q=D*g.c+yp*g.s,yp2=yp+STEP,Q2=D*g.c+yp2*g.s,v1=yp*D/Q,v2=yp2*D/Q2,s=Q/(D*g.c),sw=W/s;
    ctx.drawImage(flat,FX0-sw/2,FY0+v1,sw,Math.max(v2-v1,0.6),0,ys,W,STEP+0.4);}}
function pinBody(x,y,sty,sc){ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);
  ctx.beginPath();ctx.ellipse(0,2,10,3.5,0,0,7);ctx.fillStyle='rgba(0,0,0,.45)';ctx.fill();
  ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-4,-8,-14,-14,-14,-24);ctx.arc(0,-24,14,Math.PI,0);ctx.bezierCurveTo(14,-14,4,-8,0,0);ctx.closePath();
  ctx.fillStyle=mg(sty,-38,0);ctx.fill();ctx.lineWidth=1.6;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke();
  ctx.beginPath();ctx.arc(0,-24,5.5,0,7);ctx.fillStyle='rgba(255,255,255,.93)';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=STY[sty].m[3];ctx.stroke();
  ctx.beginPath();ctx.ellipse(-6,-32,3.2,6,-.5,0,7);ctx.fillStyle='rgba(255,255,255,.4)';ctx.fill();ctx.restore();}
const ovl=(a,b,pad=4)=>a.x0<b.x1+pad&&a.x1>b.x0-pad&&a.y0<b.y1+pad&&a.y1>b.y0-pad;
function placeLabel(x,y,sc,label,avoid,bottomLimit){ctx.font=FONT(700,13);const w=(ctx.measureText(label).width+22)*sc,h=24*sc,hb=14*sc,gS=12*sc,gC=14*sc;
  const C={center:{x0:x-w/2,y0:y-38*sc-gC-h,x1:x+w/2,y1:y-38*sc-gC},
    left:{x0:x-hb-gS-w,y0:y-24*sc-h/2,x1:x-hb-gS,y1:y-24*sc+h/2},
    right:{x0:x+hb+gS,y0:y-24*sc-h/2,x1:x+hb+gS+w,y1:y-24*sc+h/2}};
  const ok=c=>c.x0>=M&&c.x1<=W-M&&c.y0>=100&&c.y1<=bottomLimit&&!avoid.some(a=>ovl(c,a));
  const order=C.center.x1>W-M?['left','center','right']:C.center.x0<M?['right','center','left']:['center','left','right'];
  for(const m of order)if(ok(C[m]))return {mode:m,rect:C[m]};
  const c=C.center;let sh=0;if(c.x0<M)sh=M-c.x0;else if(c.x1>W-M)sh=W-M-c.x1;return {mode:'center*',rect:{x0:c.x0+sh,y0:c.y0,x1:c.x1+sh,y1:c.y1}};}
function drawLabel(rc,label,sty,sc,gold){const w=rc.x1-rc.x0,h=rc.y1-rc.y0;ctx.beginPath();ctx.roundRect(rc.x0,rc.y0,w,h,h/2);
  if(gold){ctx.fillStyle=mg('gold',rc.y0,rc.y1);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=STY.gold.txt;}
  else{ctx.fillStyle='rgba(8,14,30,.92)';ctx.fill();ctx.strokeStyle=mg(sty,rc.y0,rc.y1);ctx.lineWidth=1.8;ctx.stroke();ctx.fillStyle='#fff';}
  ctx.font=FONT(700,13*sc);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,(rc.x0+rc.x1)/2,(rc.y0+rc.y1)/2+0.5);}
function routePath(S,r,prog){const total=r.cum[r.cum.length-1],target=total*prog;ctx.beginPath();let hx=0,hy=0;
  for(let i=0;i<r.pts.length;i++){const q=S(r.pts[i][0],r.pts[i][1]);
    if(r.cum[i]<=target){i===0?ctx.moveTo(q[0],q[1]):ctx.lineTo(q[0],q[1]);hx=q[0];hy=q[1];}
    else{const a=S(r.pts[i-1][0],r.pts[i-1][1]);const u=(target-r.cum[i-1])/Math.max(r.cum[i]-r.cum[i-1],1e-12);hx=lerp(a[0],q[0],u);hy=lerp(a[1],q[1],u);ctx.lineTo(hx,hy);break;}}
  return [hx,hy];}
function drawRoute(S,r,prog,alpha){if(prog<=0)return null;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const col=r.p.color;let head=routePath(S,r,prog);ctx.strokeStyle=col;ctx.globalAlpha=alpha*.22;ctx.lineWidth=14;ctx.stroke();
  routePath(S,r,prog);ctx.globalAlpha=alpha*.55;ctx.lineWidth=7;ctx.stroke();
  routePath(S,r,prog);ctx.globalAlpha=alpha;ctx.strokeStyle='#fff';ctx.lineWidth=2.2;ctx.stroke();ctx.restore();return head;}
function glyph(kind,cx,cy,sty){ctx.save();ctx.translate(cx,cy);const g=mg(sty,-15,15);ctx.fillStyle=g;ctx.strokeStyle=g;
  if(kind==='Y TẾ'){ctx.fillRect(-4,-13,8,26);ctx.fillRect(-13,-4,26,8);}
  else if(kind==='MUA SẮM'){ctx.beginPath();ctx.moveTo(-13,-3);ctx.lineTo(13,-3);ctx.lineTo(9,12);ctx.lineTo(-9,12);ctx.closePath();ctx.fill();ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-3,8,Math.PI,0);ctx.stroke();}
  else{ctx.beginPath();ctx.moveTo(14,-14);ctx.lineTo(-14,-3);ctx.lineTo(-4,2);ctx.lineTo(-1,13);ctx.closePath();ctx.fill();}
  ctx.restore();}
function chip(x,y,text,sty){ctx.font=FONT(700,14);const w=ctx.measureText(text).width+24;ctx.beginPath();ctx.roundRect(x,y,w,28,14);ctx.fillStyle='rgba(255,255,255,.07)';ctx.fill();ctx.strokeStyle=mg(sty,y,y+28);ctx.lineWidth=1.8;ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,x+12,y+15);return w+8;}
function card(r,idx,u){const p=r.p,cw=W-2*M,ch=CARD_H,x=M,y=CARD_TOP+(1-ease(u))*50;
  ctx.save();ctx.globalAlpha=ease(u);
  ctx.beginPath();ctx.roundRect(x,y,cw,ch,18);ctx.fillStyle='rgba(9,16,38,.93)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;ctx.stroke();
  const icx=x+44,icy=y+ch/2;ctx.beginPath();ctx.arc(icx,icy,28,0,7);ctx.fillStyle='rgba(255,255,255,.05)';ctx.fill();ctx.save();ctx.translate(icx,icy);ctx.beginPath();ctx.arc(0,0,28,0,7);ctx.strokeStyle=mg(p.sty,-28,28);ctx.lineWidth=3;ctx.stroke();ctx.restore();glyph(p.cat,icx,icy,p.sty);
  const tx=x+88,maxW=cw-88-18;ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.font=FONT(700,12);ctx.fillStyle=p.color;ctx.fillText(`${p.cat} · 0${idx+1}/0${N}`,tx,y+26);
  const fs=fitFont(p.name,700,20,13,maxW);ctx.font=FONT(700,fs);ctx.fillStyle='#fff';ctx.fillText(p.name,tx,y+52);const nw=ctx.measureText(p.name).width;
  let cx=tx;cx+=chip(cx,y+66,p.km.toFixed(1).replace('.',',')+' km',p.sty);const e=cx+chip(cx,y+66,Math.max(1,Math.round(p.min))+' phút',p.sty)-8;
  ctx.restore();if(u>=1){logR('card',x,y,x+cw,y+ch);logR('cardtext',tx,y+40,tx+nw,y+64);logR('cardtext',tx,y+66,e,y+94);}}
function topbar(t){let g=ctx.createLinearGradient(0,0,0,170);g.addColorStop(0,'rgba(3,6,16,.8)');g.addColorStop(1,'rgba(3,6,16,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,170);
  ctx.textBaseline='middle';ctx.font=FONT(700,12);ctx.textAlign='left';ctx.fillStyle=STY.gold.flat;ctx.fillText('● '+CFG.name,M,64);
  ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(CFG.area,W-M,64);
  const gap=6,sw=(W-2*M-(N-1)*gap)/N;for(let i=0;i<N;i++){const x=M+i*(sw+gap);ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x,82,sw,4);
    const T0=INTRO+SC*i;const f=t>=OUT0?1:clamp((t-T0)/SC);if(f>0){ctx.fillStyle=pois[i].color;ctx.fillRect(x,82,sw*f,4);}}}
function introT(t){const a=ease((t-0.2)/0.7)*(1-ease((t-3.0)/0.5));if(a<=0)return;
  ctx.save();ctx.globalAlpha=a;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=14;const mw=W-2*M-20;
  const L=[[CFG.intro[0],800,52,26,'#fff',200],[CFG.intro[1],800,52,26,STY.gold.flat,262],[CFG.subtitle,600,22,14,'#fff',318]];
  for(const [txt,wt,sz,mn,col,yy] of L){const s=fitFont(txt,wt,sz,mn,mw);ctx.fillStyle=col;ctx.fillText(txt,W/2,yy);const hw=ctx.measureText(txt).width/2;logR('text',W/2-hw,yy-s/2,W/2+hw,yy+s/2);}ctx.restore();}
function outroC(t){const u=ease((t-OUT0-0.6)/0.8);if(u<=0)return;const ch=OUT_H,x=M,cw=W-2*M,y=OUT_TOP+(1-u)*60;
  ctx.save();ctx.globalAlpha=u;ctx.beginPath();ctx.roundRect(x,y,cw,ch,20);ctx.fillStyle='rgba(9,16,38,.94)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';const mw=cw-40;
  fitFont(CFG.name,800,26,16,mw);ctx.fillStyle='#fff';ctx.fillText(CFG.name,W/2,y+36);
  fitFont(CFG.tagline,500,13,10,mw);ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(CFG.tagline,W/2,y+66);
  ctx.beginPath();ctx.roundRect(x+28,y+90,cw-56,48,24);ctx.fillStyle=mg('gold',y+90,y+138);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.stroke();
  fitFont(CFG.cta,800,16,11,cw-56-24);ctx.fillStyle=STY.gold.txt;ctx.fillText(CFG.cta,W/2,y+115);
  fitFont(CFG.note,500,10,8,mw);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fillText(CFG.note,W/2,y+158);ctx.restore();
  if(u>=1)logR('card',x,y,x+cw,y+ch);}
function render(t){RECTS=[];window.RECTS=RECTS;const cam=camAt(t),S=mkProj(cam);
  ctx.fillStyle='#0a0f1c';ctx.fillRect(0,0,W,H);drawMap(cam);
  ctx.fillStyle='rgba(4,8,22,.32)';ctx.fillRect(0,0,W,H);
  let g=ctx.createLinearGradient(0,YMIN-10,0,CY0-40);g.addColorStop(0,'rgba(10,15,28,1)');g.addColorStop(.35,'rgba(10,15,28,.55)');g.addColorStop(1,'rgba(10,15,28,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,CY0-40);
  g=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  g=ctx.createLinearGradient(0,H-340,0,H);g.addColorStop(0,'rgba(3,6,16,0)');g.addColorStop(1,'rgba(3,6,16,.8)');ctx.fillStyle=g;ctx.fillRect(0,H-340,W,340);
  const pp=S(proj[0],proj[1]),psc=1.15*clamp(pp[2],.8,1.15);
  const si=Math.min(N-1,Math.floor((t-INTRO)/SC)),T0=INTRO+SC*si;
  const botLim=t>=OUT0?OUT_TOP-14:CARD_TOP-14;
  const pl=placeLabel(pp[0],pp[1],psc,CFG.name,[],botLim);const pbody={x0:pp[0]-14*psc,y0:pp[1]-38*psc,x1:pp[0]+14*psc,y1:pp[1]};
  if(t>=OUT0){routes.forEach(r=>{drawRoute(S,r,1,.6);const e=S(r.end[0],r.end[1]);pinBody(e[0],e[1],r.p.sty,.6*clamp(e[2],.75,1.15));});}
  else if(t>=INTRO){const r=routes[si];const prog=ease((t-T0-0.9)/2.6);const head=drawRoute(S,r,prog,1);
    if(prog>0.97){const e=S(r.end[0],r.end[1]);const pop=ease((t-T0-3.4)/0.35);const esc=(0.4+0.6*pop)*clamp(e[2],.8,1.15);pinBody(e[0],e[1],r.p.sty,esc);
      if(pop>=1){const lp=placeLabel(e[0],e[1],esc,r.p.name,[pl.rect,pbody],botLim);drawLabel(lp.rect,r.p.name,r.p.sty,esc,false);logR('label',lp.rect.x0,lp.rect.y0,lp.rect.x1,lp.rect.y1,'poi:'+lp.mode);logR('body',e[0]-14*esc,e[1]-38*esc,e[0]+14*esc,e[1]);}}
    else if(head&&prog>0){ctx.beginPath();ctx.arc(head[0],head[1],7,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=r.p.color;ctx.lineWidth=3;ctx.stroke();}
    card(r,si,(t-T0-1.0)/0.5);}
  pinBody(pp[0],pp[1],'gold',psc);drawLabel(pl.rect,CFG.name,'gold',psc,true);logR('label',pl.rect.x0,pl.rect.y0,pl.rect.x1,pl.rect.y1,'proj:'+pl.mode);logR('body',pbody.x0,pbody.y0,pbody.x1,pbody.y1);
  topbar(t);introT(t);if(t>=OUT0)outroC(t);
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=FONT(700,13);ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillText(CFG.footer,W/2,H-59);
  const ft='Ảnh vệ tinh: Esri, Maxar · Đường: © OpenStreetMap · Số liệu ước tính';fitFont(ft,500,9,7,W-2*M);ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillText(ft,W/2,H-41);ctx.restore();}
window.RENDER=render;window.CVS=cv;
function checkAll(){const bad=[];let n=0;const modes={};
  for(let t=0;t<T;t+=0.2){render(t);const R=RECTS;for(const r of R){n++;if(r.kind!=='body'&&(r.x0<M-0.6||r.x1>W-M+0.6))bad.push(`NGANG t=${t.toFixed(1)} ${r.kind} ${r.x0.toFixed(0)}..${r.x1.toFixed(0)}`);
      if(r.kind==='label'&&r.y0<100)bad.push(`TREN t=${t.toFixed(1)} label y0=${r.y0.toFixed(0)}`);if(r.id)modes[r.id]=(modes[r.id]||0)+1;}
    const hold=(t>=INTRO&&t<OUT0&&((t-INTRO)%SC)>=3.9)||t>=OUT0+1.6;
    if(hold){const top=t>=OUT0?OUT_TOP:CARD_TOP;const L=R.filter(r=>r.kind==='label'),B=R.filter(r=>r.kind==='body');
      for(const r of L)if(r.y1>top-14)bad.push(`GAP t=${t.toFixed(1)} label y1=${r.y1.toFixed(0)}`);
      for(let i=0;i<L.length;i++){for(let j=i+1;j<L.length;j++)if(ovl(L[i],L[j],0))bad.push(`CHONG label-label t=${t.toFixed(1)}`);for(const b of B)if(ovl(L[i],b,0))bad.push(`CHONG label-icon t=${t.toFixed(1)} ${L[i].id}`);}}}
  return {checkedRects:n,violations:bad.slice(0,20),violationCount:bad.length,modes};}
async function record(){const stream=cv.captureStream(FPS);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8e6});const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(r=>rec.onstop=r);
  rec.start(250);const NF=Math.round(T*FPS),t0=performance.now();let late=0;
  for(let i=0;i<NF;i++){render(i/FPS);if(i%30===0)setSt(`Đang ghi video ${Math.round(i/FPS)}/${Math.round(T)}s`);const wait=t0+(i+1)*1000/FPS-performance.now();if(wait>0)await sleep(wait);else{late++;await sleep(0);}}
  await sleep(400);rec.stop();await done;return {blob:new Blob(chunks,{type:'video/webm'}),elapsed:(performance.now()-t0)/1000,mime,lateFrames:late};}
window.JOB=(async()=>{try{
  setSt('Đang tải tile...');const pf=await prefetch();window.ST.prefetch=pf;if(pf.failed>pf.total*0.05)throw new Error('Quá nhiều tile lỗi '+pf.failed+'/'+pf.total);
  let t0=performance.now();for(let i=0;i<40;i++)render(10+i*0.1);let ms=(performance.now()-t0)/40;
  if(ms>24){STEP=2;t0=performance.now();for(let i=0;i<40;i++)render(10+i*0.1);ms=(performance.now()-t0)/40;}
  window.ST.msPerFrame=+ms.toFixed(1);window.ST.step=STEP;
  setSt('Đang kiểm tra bố cục...');window.ST.check=checkAll();
  const r=await record();window.REC=r;const url=URL.createObjectURL(r.blob);r.url=url;
  const times=[1.8,...pois.map((_,i)=>INTRO+SC*i+4.4),T-1.4];const cols=4,rows=Math.ceil(times.length/cols);
  const sheet=document.createElement('canvas');sheet.width=288*cols;sheet.height=512*rows;const sc=sheet.getContext('2d');
  for(let i=0;i<times.length;i++){render(times[i]);const b=await createImageBitmap(cv);const ox=(i%cols)*288,oy=Math.floor(i/cols)*512;sc.drawImage(b,ox,oy,288,512);
    sc.save();sc.strokeStyle='rgba(255,0,200,.85)';sc.setLineDash([4,3]);sc.lineWidth=1;sc.strokeRect(ox+M/2,oy+50,(W-2*M)/2,(CARD_B-100)/2);sc.restore();}
  window.SHEET=sheet;
  window.showVideo=()=>{const s=document.getElementById('stage');s.innerHTML=`<video src="${url}" controls autoplay loop muted style="max-height:84vh;max-width:96vw;background:#000"></video>`;
    const a=document.createElement('a');a.href=url;a.download='map_video.webm';a.textContent='⬇ Tải video (WebM, '+(r.blob.size/1e6).toFixed(1)+' MB)';a.style.cssText='margin:8px;padding:8px 14px;background:#ffd94f;color:#2a1a00;border-radius:18px;font-weight:700;text-decoration:none;font-size:14px';s.appendChild(a);};
  window.showSheet=()=>{sheet.style.cssText='max-height:88vh;max-width:96vw';const s=document.getElementById('stage');s.innerHTML='';s.appendChild(sheet);};
  window.showSheet();setSt(`Xong: ${(r.blob.size/1e6).toFixed(1)} MB, ${r.elapsed.toFixed(1)}s, trễ ${r.lateFrames} khung`);Object.assign(window.ST,{done:true,size:r.blob.size,elapsed:r.elapsed,late:r.lateFrames});
}catch(e){window.ST.err=String(e&&e.stack||e);setSt('Lỗi: '+e);}})();
return {started:true,fitZ:window.FITS,T};})()
