// Agent Bản đồ hạ tầng — chạy trong trình duyệt.
// Kết hợp skill map-location-video (nền vệ tinh Esri nghiêng 40°, dự án luôn giữa khung, tuyến OSRM, label tự né)
// với skill map-infrastructure-video học từ video mẫu 1 (tự nhận ra hạ tầng, mỗi cảnh một chủ đề, vòng km, chú thích).
// API: MapEngine.discover(cfg, log) -> pois · MapEngine.route(cfg, pois, log) -> pois có tuyến
//      MapEngine.build(cfg, pois) -> engine {T, themes, prefetch(TI,onProg), calibrate(), renderIntro(X,t,TI,rects), render(X,t,rects)}
(function(){
const W=576,H=1024,M=36,CARD_B=H-84;
const D=1000,CY0=520,YMIN=130,FX0=700,FY0=1500,PHI=40*Math.PI/180;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=u=>{u=clamp(u);return u*u*(3-2*u);};
const lerp=(a,b,u)=>a+(b-a)*u;
const FONT=(w,s)=>`${w} ${s}px "Segoe UI","Helvetica Neue",Arial,sans-serif`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mx=lon=>(lon+180)/360;
const my=lat=>{const s=Math.sin(lat*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI);};
function km(a,b){const R=6371,r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
 const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
const fmtKm=v=>v.toFixed(1).replace('.',',')+' km';

// Chủ đề cảnh, theo thứ tự xuất hiện (giống video mẫu 1: gần → xa).
const THEMES=[
 {id:'near', title:'Ngay cửa nhà', color:'#ffc247', r:3.5, max:2, byQuery:true,
  q:[['sân vận động','leisure:stadium'],['bệnh viện','amenity:hospital'],['công viên','leisure:park'],['đại học','amenity:university'],['chợ','amenity:marketplace']]},
 {id:'metro',title:'Metro & nhà ga', color:'#b77bff', r:7, max:2,
  q:[['ga','railway:station'],['ga','railway:stop'],['ga','railway:halt'],['ga','public_transport:station']]},
 {id:'mall', title:'Trung tâm thương mại', color:'#3ddc97', r:9, max:2,
  q:[['mall','shop:mall'],['trung tâm thương mại','shop:mall'],['plaza','shop:mall'],['Vincom',null],['AEON Mall',null]],
  nameRe:/\bmall\b|plaza|vincom|aeon|lotte (mall|center|centre|department|mart)|trung tâm thương mại|shopping|giga ?mall|crescent mall|megamall|\bbig ?c\b|\bgo!/i},
 {id:'bus',  title:'Bến xe liên tỉnh', color:'#ff8a3d', r:12, max:1, q:[['bến xe','amenity:bus_station'],['bến xe',null]], nameRe:/bến xe/i},
 {id:'air',  title:'Cầu & sân bay', color:'#7cc4ff', r:45, max:2,
  q:[['sân bay quốc tế','aeroway:aerodrome'],['sân bay','aeroway:aerodrome'],['airport','aeroway:aerodrome'],['cầu',null]]}
];
const CAT2THEME={'Y TẾ':'near','GIÁO DỤC':'near','CÔNG VIÊN':'near','TIỆN ÍCH':'near','METRO':'metro','GA':'metro',
 'MUA SẮM':'mall','TTTM':'mall','BẾN XE':'bus','GIAO THÔNG':'bus','KẾT NỐI':'air','SÂN BAY':'air','CẦU':'air'};

// máy chủ công cộng hay giới hạn tốc độ: thử lại có giãn cách
async function getJSON(u,tries=3){let err;for(let i=0;i<tries;i++){try{const r=await fetch(u);if(r.ok)return await r.json();err=new Error('HTTP '+r.status);}catch(e){err=e;}await sleep(600*2**i);}throw err;}
// bbox quanh dự án: Photon thiên vị vị trí rất yếu với từ khóa chung, phải giới hạn khung
async function photon(q,lat,lon,tag,rKm=60){
 const dLat=rKm/111,dLon=rKm/(111*Math.cos(lat*Math.PI/180));
 let u=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lon}&limit=15&bbox=${(lon-dLon).toFixed(4)},${(lat-dLat).toFixed(4)},${(lon+dLon).toFixed(4)},${(lat+dLat).toFixed(4)}`;
 if(tag)u+=`&osm_tag=${encodeURIComponent(tag)}`;
 return (await getJSON(u)).features||[];}
const norm=t=>(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim();
const fpos=f=>({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]});

async function discover(cfg,log){
 const P={lat:cfg.lat,lon:cfg.lon};const found=[];const seen=new Set();
 const add=(theme,f,src,d)=>{const n=(f.properties.name||'').trim();const k=n.toLowerCase();if(!n||seen.has(k))return false;
  seen.add(k);found.push({theme,name:n,...fpos(f),dist:d,src});return true;};
 // 1) tiện ích người dùng nhập: tìm đúng tên quanh dự án, không thấy thì bỏ (không bịa)
 for(const [cat,name] of cfg.pois||[]){
  try{const fs=await photon(name,P.lat,P.lon);
   const nq=norm(name);
   // ưu tiên tên khớp (bắt đầu bằng / chứa đúng tên), loại biển chỉ hướng, rồi mới tới khoảng cách
   const score=f=>{const n=norm(f.properties.name);if(!n||/^(huong|loi|ngo|bien)\b/.test(n))return 9;return n===nq?0:n.startsWith(nq)?1:n.includes(nq)?2:5;};
   const near=fs.map(f=>({f,d:km(P,fpos(f)),s:score(f)})).filter(x=>x.d<60&&x.s<9).sort((a,b)=>a.s-b.s||a.d-b.d)[0];
   if(near){add(CAT2THEME[(cat||'').toUpperCase()]||'near',near.f,'user',near.d);log(`Tìm thấy "${name}" → ${near.f.properties.name} (${fmtKm(near.d)})`);}
   else log(`Không tìm thấy "${name}" trong 60 km quanh dự án, bỏ qua.`);
  }catch(e){log(`Lỗi tìm "${name}": ${e.message}`);}
  await sleep(120);}
 // 2) tự nhận ra hạ tầng theo từng chủ đề
 for(const th of THEMES){
  let have=found.filter(p=>p.theme===th.id).length;if(have>=th.max)continue;
  let c=[];
  for(const [qi,[q,tag]] of th.q.entries()){
   try{for(const f of await photon(q,P.lat,P.lon,tag,th.r)){const n=f.properties.name||'';const d=km(P,fpos(f));
     if(!n||d>th.r)continue;if(th.nameRe&&!th.nameRe.test(n))continue;c.push({f,d,qi,v:f.properties.osm_value});}}
   catch(e){log(`Photon lỗi (${q}): ${e.message}`);}
   await sleep(120);}
  c.sort((a,b)=>a.d-b.d);
  if(th.byQuery){const best=[];th.q.forEach((_,qi)=>{const x=c.find(y=>y.qi===qi);if(x)best.push(x);});c=best;} // mỗi loại 1 điểm, theo thứ tự ưu tiên
  if(th.id==='air'){ // ưu tiên sân bay quốc tế, cộng 1 cây cầu lớn gần
   const aps=c.filter(x=>x.v==='aerodrome'&&/sân bay|airport|cảng hàng không/i.test(x.f.properties.name));
   const ap=aps.find(x=>/quốc tế|international/i.test(x.f.properties.name))||aps[0];
   const br=c.find(x=>/^(cầu|bridge)\s/i.test(x.f.properties.name)&&!/cầu vượt|cầu đi bộ|cầu thang|cầu giấy$|overpass|flyover/i.test(x.f.properties.name)&&x.d<20&&x.d>0.8);
   c=[ap,br].filter(Boolean);}
  for(const x of c){if(have>=th.max)break;if(add(th.id,x.f,'auto',x.d))have++;}
  const got=found.filter(p=>p.theme===th.id);
  log(got.length?`${th.title}: ${got.map(p=>p.name+' ('+fmtKm(p.dist)+')').join(', ')}`:`${th.title}: không tìm thấy, bỏ cảnh này.`);
 }
 return found;
}

async function route(cfg,pois,log){
 const out=[];
 for(const p of pois){
  try{const u=`https://router.project-osrm.org/route/v1/driving/${cfg.lon},${cfg.lat};${p.lon},${p.lat}?overview=full&geometries=geojson`;
   const j=await getJSON(u);const r=j.routes&&j.routes[0];if(!r)throw new Error(j.code||'không có tuyến');
   out.push({...p,coords:r.geometry.coordinates,km:r.distance/1000,min:r.duration/60});}
  catch(e){log(`Không lấy được tuyến tới ${p.name} (${e.message}), bỏ qua.`);}
  await sleep(100);}
 return out;
}

function shade(hex,f){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;
 const t=f<0?0:255,a=Math.abs(f);r=Math.round(r+(t-r)*a);g=Math.round(g+(t-g)*a);b=Math.round(b+(t-b)*a);return `rgb(${r},${g},${b})`;}

function build(cfg,pois){
 const proj=[mx(cfg.lon),my(cfg.lat)];
 const themes=THEMES.map(th=>({...th,items:pois.filter(p=>p.theme===th.id)})).filter(th=>th.items.length);
 const routes=[];
 themes.forEach(th=>th.items.forEach(p=>{const pts=p.coords.map(c=>[mx(c[0]),my(c[1])]);const cum=[0];
  for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const r={p,th,pts,cum,end:pts[pts.length-1]};routes.push(r);}));
 const N=themes.length,SC=4.6,OV=4.8,PS=3.8,T=PS+N*SC+OV; // PS: cảnh cận dự án + khoanh vùng
 const ROW=30,chkTop=n=>CARD_B-(46+ROW*n),LEG_TOP=CARD_B-(46+26*N);
 const kmPerMx=40075.017*Math.cos(cfg.lat*Math.PI/180);
 const flat=document.createElement('canvas');flat.width=1400;flat.height=2100;const fx=flat.getContext('2d');
 const cache=new Map();let STEP=1;let X=null,RECTS=null;

 function geom(phi){const c=Math.cos(phi),s=Math.sin(phi),yq=YMIN-CY0,Qf=D*c+yq*s,sf=Qf/(D*c),yn=H-CY0,Qn=D*c+yn*s;
  return {c,s,FU:W/(2*sf)+10,VF:-(yq*D/Qf)+10,VB:yn*D/Qn+10};}
 function mkProj(cam){const g=geom(cam.phi),k=256*2**cam.z;
  return (x,y)=>{const u=(x-proj[0])*k,v=(y-proj[1])*k,den=D-v*g.s;if(den<5)return [0,-9999,.1];const sc=D/den;return [W/2+u*sc,CY0+sc*v*g.c,sc];};}
 const sub=pts=>{const k=Math.max(1,Math.floor(pts.length/150));return pts.filter((_,i)=>i%k===0||i===pts.length-1);};
 function fitC(pts,top,bottom){pts=sub(pts);for(let z=16.2;z>7;z-=0.02){const S=mkProj({z,phi:PHI});let ok=true;
  for(const p of pts){const q=S(p[0],p[1]);if(q[0]<70||q[0]>W-70||q[1]<top||q[1]>bottom){ok=false;break;}}if(ok)return {z,phi:PHI};}return {z:8,phi:PHI};}
 const fits=themes.map(th=>fitC([proj,...routes.filter(r=>r.th===th).flatMap(r=>r.pts)],250,chkTop(th.items.length)-56));
 const fitAll=fitC([proj,...routes.flatMap(r=>r.pts)],250,LEG_TOP-50);
 // Vùng dự án: khung ranh giới (bbox từ dữ liệu bản đồ) nếu có, không thì vòng tròn ~200 m quanh điểm dự án
 const bb=cfg.area&&Array.isArray(cfg.area.bbox)&&cfg.area.bbox.length===4?cfg.area.bbox:null;
 const AREA=bb?[[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]].map(([lo,la])=>[mx(lo),my(la)])
  :Array.from({length:56},(_,i)=>{const a=i/56*Math.PI*2,d=0.2/kmPerMx;return [proj[0]+d*Math.cos(a),proj[1]+d*Math.sin(a)];});
 function fitBox(pts,xm,top,bottom,zmax){for(let z=zmax;z>9;z-=0.02){const S=mkProj({z,phi:PHI});
  if(pts.every(p=>{const q=S(p[0],p[1]);return q[0]>=xm&&q[0]<=W-xm&&q[1]>=top&&q[1]<=bottom;}))return z;}return 14;}
 const zClose=fitBox([proj,...AREA],120,330,700,17.3);
 const intro0={z:zClose-3.4,phi:15*Math.PI/180},intro1={z:zClose,phi:PHI},close1={z:zClose+0.25,phi:PHI};
 const mixc=(a,b,u)=>({z:lerp(a.z,b.z,u),phi:lerp(a.phi,b.phi,u)});
 const introCam=(t,TI)=>mixc(intro0,intro1,ease(t/TI));
 function camAt(t){if(t<PS)return mixc(intro1,close1,ease(t/PS));t-=PS;
  if(t>=N*SC)return mixc(N?fits[N-1]:close1,fitAll,ease((t-N*SC)/1.8));
  const i=Math.min(N-1,Math.floor(t/SC));return mixc(i===0?close1:fits[i-1],fits[i],ease((t-i*SC)/1.3));}

 function tileList(cam){const zi=Math.min(17,Math.ceil(cam.z)),n=2**zi,ts=256*2**(cam.z-zi),g=geom(cam.phi),cxT=proj[0]*n,cyT=proj[1]*n;
  const x0=Math.floor(cxT-g.FU/ts),x1=Math.floor(cxT+g.FU/ts),y0=Math.floor(cyT-g.VF/ts),y1=Math.floor(cyT+g.VB/ts);const out=[];
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)out.push([zi,x,y,cxT,cyT,ts]);return out;}
 async function prefetch(TI,onProg){const keys=new Set();
  for(let i=0;i<TI*30;i++)for(const [z,x,y] of tileList(introCam(i/30,TI)))keys.add(z+'/'+x+'/'+y);
  for(let i=0;i<T*30;i++)for(const [z,x,y] of tileList(camAt(i/30)))keys.add(z+'/'+x+'/'+y);
  const arr=[...keys].filter(k=>!cache.has(k));let done=0,failed=0,idx=0;
  async function one(k){const [z,x,y]=k.split('/');
   try{const r=await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`);if(!r.ok)throw 0;
    cache.set(k,await createImageBitmap(await r.blob()));}catch(e){failed++;}
   done++;if(onProg&&done%25===0)onProg(done,arr.length);}
  await Promise.all(Array.from({length:12},async()=>{while(idx<arr.length)await one(arr[idx++]);}));
  return {total:arr.length,failed};}

 function drawMap(cam){const g=geom(cam.phi);fx.fillStyle='#0a0f1c';fx.fillRect(FX0-g.FU,FY0-g.VF,2*g.FU,g.VF+g.VB);
  for(const [z,x,y,cxT,cyT,ts] of tileList(cam)){const b=cache.get(z+'/'+x+'/'+y);if(b)fx.drawImage(b,FX0+(x-cxT)*ts,FY0+(y-cyT)*ts,ts+0.7,ts+0.7);}
  X.fillStyle='#0a0f1c';X.fillRect(0,0,W,H);
  for(let ys=YMIN;ys<H;ys+=STEP){const yp=ys-CY0,Q=D*g.c+yp*g.s,yp2=yp+STEP,Q2=D*g.c+yp2*g.s,v1=yp*D/Q,v2=yp2*D/Q2,s=Q/(D*g.c),sw=W/s;
   X.drawImage(flat,FX0-sw/2,FY0+v1,sw,Math.max(v2-v1,0.6),0,ys,W,STEP+0.4);}
  // sky fade + vignette + darken (như skill)
  X.fillStyle='rgba(4,8,22,.28)';X.fillRect(0,0,W,H);
  let gr=X.createLinearGradient(0,YMIN-10,0,CY0-60);gr.addColorStop(0,'rgba(10,15,28,1)');gr.addColorStop(.4,'rgba(10,15,28,.5)');gr.addColorStop(1,'rgba(10,15,28,0)');X.fillStyle=gr;X.fillRect(0,0,W,CY0-60);
  gr=X.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.75);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.5)');X.fillStyle=gr;X.fillRect(0,0,W,H);
  gr=X.createLinearGradient(0,H-360,0,H);gr.addColorStop(0,'rgba(3,6,16,0)');gr.addColorStop(1,'rgba(3,6,16,.85)');X.fillStyle=gr;X.fillRect(0,H-360,W,360);}

 function fitFont(text,wt,start,min,maxW){let s=start;X.font=FONT(wt,s);while(X.measureText(text).width>maxW&&s>min){s--;X.font=FONT(wt,s);}return s;}
 const goldG=(y0,y1)=>{const g=X.createLinearGradient(0,y0,0,y1);['#fff7c9','#ffd94f','#d9a31c','#85560a'].forEach((c,i)=>g.addColorStop(i/3,c));return g;};
 const colG=(col,y0,y1)=>{const g=X.createLinearGradient(0,y0,0,y1);g.addColorStop(0,shade(col,.75));g.addColorStop(.4,col);g.addColorStop(1,shade(col,-.55));return g;};
 function pinBody(x,y,col,sc,gold){X.save();X.translate(x,y);X.scale(sc,sc);
  X.beginPath();X.ellipse(0,2,10,3.5,0,0,7);X.fillStyle='rgba(0,0,0,.45)';X.fill();
  X.beginPath();X.moveTo(0,0);X.bezierCurveTo(-4,-8,-14,-14,-14,-24);X.arc(0,-24,14,Math.PI,0);X.bezierCurveTo(14,-14,4,-8,0,0);X.closePath();
  X.fillStyle=gold?goldG(-38,0):colG(col,-38,0);X.fill();X.lineWidth=1.6;X.strokeStyle='rgba(255,255,255,.88)';X.stroke();
  X.beginPath();X.arc(0,-24,5.5,0,7);X.fillStyle='rgba(255,255,255,.95)';X.fill();
  X.beginPath();X.ellipse(-6,-32,3.2,6,-.5,0,7);X.fillStyle='rgba(255,255,255,.4)';X.fill();X.restore();}
 const ovl=(a,b,pad=4)=>a.x0<b.x1+pad&&a.x1>b.x0-pad&&a.y0<b.y1+pad&&a.y1>b.y0-pad;
 function placeLabel(x,y,sc,w,h,avoid,bottom){const hb=14*sc,gS=12*sc,gC=14*sc;
  const C={center:{x0:x-w/2,y0:y-38*sc-gC-h,x1:x+w/2,y1:y-38*sc-gC},
   left:{x0:x-hb-gS-w,y0:y-24*sc-h/2,x1:x-hb-gS,y1:y-24*sc+h/2},
   right:{x0:x+hb+gS,y0:y-24*sc-h/2,x1:x+hb+gS+w,y1:y-24*sc+h/2}};
  const ok=c=>c.x0>=M&&c.x1<=W-M&&c.y0>=110&&c.y1<=bottom&&!avoid.some(a=>ovl(c,a));
  const order=C.center.x1>W-M?['left','center','right']:C.center.x0<M?['right','center','left']:['center','left','right'];
  for(const m of order)if(ok(C[m]))return C[m];
  for(const m of order){const c=C[m];const cand={x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1};let sh=0;if(cand.x0<M)sh=M-cand.x0;else if(cand.x1>W-M)sh=W-M-cand.x1;
   cand.x0+=sh;cand.x1+=sh;if(cand.y1>bottom){const d=cand.y1-bottom;cand.y0-=d;cand.y1-=d;}if(!avoid.some(a=>ovl(cand,a)))return cand;}
  return null;} // không còn chỗ: bỏ label thay vì đè
 function projLabel(pp,psc,bottom){X.font=FONT(800,14);const name=cfg.name;const w=Math.min(W-2*M,X.measureText(name).width+26)*psc,h=26*psc;
  const rc=placeLabel(pp[0],pp[1],psc,w,h,[],bottom)||{x0:clamp(pp[0]-w/2,M,W-M-w),y0:pp[1]-60*psc,x1:clamp(pp[0]-w/2,M,W-M-w)+w,y1:pp[1]-60*psc+h};
  return rc;}
 function drawProjLabel(rc,psc){const w=rc.x1-rc.x0,h=rc.y1-rc.y0;X.beginPath();X.roundRect(rc.x0,rc.y0,w,h,h/2);X.fillStyle=goldG(rc.y0,rc.y1);X.fill();
  X.strokeStyle='rgba(255,255,255,.75)';X.lineWidth=1;X.stroke();fitFont(cfg.name,800,14*psc,9,w-16);X.fillStyle='#2a1a00';X.textAlign='center';X.textBaseline='middle';
  X.fillText(cfg.name,(rc.x0+rc.x1)/2,(rc.y0+rc.y1)/2+0.5);RECTS.push([rc.x0,rc.y0,rc.x1,rc.y1]);}
 function poiLabelSize(r,sc){X.font=FONT(800,13);const a=X.measureText(r.p.name).width;X.font=FONT(600,10);const sub=`cách dự án ${fmtKm(r.p.km)}`;const b=X.measureText(sub).width;
  return {w:Math.min(W-2*M,Math.max(a,b)+24)*sc,h:38*sc,sub};}
 function drawPoiLabel(rc,r,sub,a){const w=rc.x1-rc.x0,h=rc.y1-rc.y0;X.save();X.globalAlpha=a;X.beginPath();X.roundRect(rc.x0,rc.y0,w,h,12);X.fillStyle='rgba(8,14,30,.9)';X.fill();
  X.strokeStyle=colG(r.th.color,rc.y0,rc.y1);X.lineWidth=1.8;X.stroke();X.textAlign='center';X.textBaseline='middle';const cx=(rc.x0+rc.x1)/2;
  fitFont(r.p.name,800,13,9,w-14);X.fillStyle='#fff';X.fillText(r.p.name,cx,rc.y0+h*0.36);fitFont(sub,600,10,8,w-14);X.fillStyle=shade(r.th.color,.35);X.fillText(sub,cx,rc.y0+h*0.73);X.restore();
  RECTS.push([rc.x0,rc.y0,rc.x1,rc.y1]);}
 function routePath(S,r,prog){const total=r.cum[r.cum.length-1],target=total*prog;X.beginPath();let hx=0,hy=0;
  for(let i=0;i<r.pts.length;i++){const q=S(r.pts[i][0],r.pts[i][1]);
   if(r.cum[i]<=target){i===0?X.moveTo(q[0],q[1]):X.lineTo(q[0],q[1]);hx=q[0];hy=q[1];}
   else{const a=S(r.pts[i-1][0],r.pts[i-1][1]);const u=(target-r.cum[i-1])/Math.max(r.cum[i]-r.cum[i-1],1e-12);hx=lerp(a[0],q[0],u);hy=lerp(a[1],q[1],u);X.lineTo(hx,hy);break;}}
  return [hx,hy];}
 function drawRoute(S,r,prog,alpha){if(prog<=0)return null;X.save();X.lineCap='round';X.lineJoin='round';const col=r.th.color;
  let head=routePath(S,r,prog);X.strokeStyle=col;X.globalAlpha=alpha*.25;X.lineWidth=14;X.stroke();
  routePath(S,r,prog);X.globalAlpha=alpha*.85;X.lineWidth=6;X.stroke();
  routePath(S,r,prog);X.globalAlpha=alpha;X.strokeStyle='rgba(255,255,255,.9)';X.lineWidth=1.8;X.stroke();X.restore();return head;}
 function title(text,a){if(a<=0)return;X.save();X.globalAlpha=a;X.textAlign='center';X.textBaseline='middle';const s=fitFont(text,900,38,20,W-2*M);
  X.lineJoin='round';X.lineWidth=6;X.strokeStyle='rgba(0,0,0,.75)';X.strokeText(text,W/2,150);X.fillStyle=goldG(150-s/2,150+s/2);X.fillText(text,W/2,150);
  const w=X.measureText(text).width;RECTS.push([W/2-w/2,150-s/2,W/2+w/2,150+s/2]);X.restore();}
 function checklist(th,u){if(u<=0)return;const n=th.items.length,top=chkTop(n),y=top+(1-ease(u))*40;X.save();X.globalAlpha=ease(u);
  X.beginPath();X.roundRect(M,y,W-2*M,CARD_B-top,18);X.fillStyle='rgba(9,16,38,.92)';X.fill();X.strokeStyle='rgba(255,255,255,.14)';X.lineWidth=1;X.stroke();
  X.font=FONT(800,12);X.fillStyle=th.color;X.textAlign='left';X.textBaseline='middle';X.fillText(th.title.toUpperCase(),M+18,y+22);
  th.items.forEach((p,i)=>{const r=routes.find(q=>q.p===p);const yy=y+46+i*ROW;const k=ease(u*1.6-i*0.25);if(k<=0)return;X.globalAlpha=ease(u)*k;
   X.beginPath();X.roundRect(M+18,yy-9,18,18,5);X.fillStyle=th.color;X.fill();X.strokeStyle='#0b1022';X.lineWidth=2.4;X.beginPath();X.moveTo(M+22,yy);X.lineTo(M+26,yy+4);X.lineTo(M+32,yy-4);X.stroke();
   const right=`${fmtKm(p.km)} · ${Math.max(1,Math.round(p.min))} phút`;X.font=FONT(700,13);const rw=X.measureText(right).width;X.fillStyle=shade(th.color,.3);X.textAlign='right';X.fillText(right,W-M-18,yy+1);
   X.textAlign='left';fitFont(p.name,700,16,11,W-2*M-36-rw-30);X.fillStyle='#fff';X.fillText(p.name,M+46,yy+1);});
  X.restore();if(u>=1)RECTS.push([M,top,W-M,CARD_B]);}
 function legend(u){if(u<=0)return;const y=LEG_TOP+(1-ease(u))*40;X.save();X.globalAlpha=ease(u);
  X.beginPath();X.roundRect(M,y,W-2*M,CARD_B-LEG_TOP,18);X.fillStyle='rgba(9,16,38,.92)';X.fill();X.strokeStyle='rgba(255,255,255,.14)';X.stroke();
  X.font=FONT(800,12);X.fillStyle='#ffd94f';X.textAlign='left';X.textBaseline='middle';X.fillText('KẾT NỐI QUANH '+cfg.name.toUpperCase(),M+18,y+22);
  themes.forEach((th,i)=>{const yy=y+46+i*26;X.strokeStyle=th.color;X.lineWidth=5;X.lineCap='round';X.beginPath();X.moveTo(M+18,yy);X.lineTo(M+44,yy);X.stroke();
   const t=`${th.title}: ${th.items.map(p=>p.name).join(', ')}`;fitFont(t,600,13,9,W-2*M-74);X.fillStyle='#e6ebf5';X.fillText(t,M+54,yy+1);});
  X.restore();if(u>=1)RECTS.push([M,LEG_TOP,W-M,CARD_B]);}
 function rings(S,u){if(u<=0)return;X.save();
  [5,10,20].forEach((R,k)=>{const a=ease(u*1.5-k*0.2);if(a<=0)return;const d=R/kmPerMx;X.beginPath();let topPt=null;
   for(let i=0;i<=72;i++){const th=i/72*Math.PI*2;const q=S(proj[0]+d*Math.cos(th),proj[1]+d*Math.sin(th));i?X.lineTo(q[0],q[1]):X.moveTo(q[0],q[1]);if(!topPt||q[1]<topPt[1])topPt=q;}
   X.globalAlpha=0.75*a;X.strokeStyle='rgba(255,255,255,.85)';X.lineWidth=1.4;X.setLineDash([6,5]);X.stroke();X.setLineDash([]);
   if(topPt&&topPt[1]>200&&topPt[1]<LEG_TOP-20&&topPt[0]>M+30&&topPt[0]<W-M-30){X.font=FONT(800,12);const t=R+' km',w=X.measureText(t).width+14;
    X.fillStyle='rgba(8,14,30,.85)';X.beginPath();X.roundRect(topPt[0]-w/2,topPt[1]-10,w,20,10);X.fill();X.fillStyle='#fff';X.textAlign='center';X.textBaseline='middle';X.fillText(t,topPt[0],topPt[1]+0.5);}});
  X.restore();}
 function drawArea(S,prog,alpha,tt){if(prog<=0)return;const q=AREA.map(p=>S(p[0],p[1]));X.save();X.globalAlpha=alpha;
  X.beginPath();q.forEach((v,i)=>i?X.lineTo(v[0],v[1]):X.moveTo(v[0],v[1]));X.closePath();X.fillStyle=`rgba(255,200,60,${0.2*ease(prog)})`;X.fill();
  // viền vẽ dần theo chu vi
  const segs=q.map((v,i)=>[v,q[(i+1)%q.length]]);const L=segs.reduce((a,[u,v])=>a+Math.hypot(v[0]-u[0],v[1]-u[1]),0);let left=L*ease(prog);
  X.beginPath();X.moveTo(q[0][0],q[0][1]);for(const [u,v] of segs){const d=Math.hypot(v[0]-u[0],v[1]-u[1]);if(left>=d){X.lineTo(v[0],v[1]);left-=d;}else{const k=left/(d||1);X.lineTo(u[0]+(v[0]-u[0])*k,u[1]+(v[1]-u[1])*k);break;}}
  X.lineJoin='round';X.shadowColor='#ffd94f';X.shadowBlur=18;X.strokeStyle='#ffd94f';X.lineWidth=3.2;X.stroke();X.shadowBlur=0;X.strokeStyle='#fff7c9';X.lineWidth=1.2;X.stroke();
  if(prog>=1){const ph=(tt*0.6)%1;const c=q.reduce((a,v)=>[a[0]+v[0]/q.length,a[1]+v[1]/q.length],[0,0]);const k=1+0.35*ph;
   X.beginPath();q.forEach((v,i)=>{const x=c[0]+(v[0]-c[0])*k,y=c[1]+(v[1]-c[1])*k;i?X.lineTo(x,y):X.moveTo(x,y);});X.closePath();X.strokeStyle=`rgba(255,217,79,${0.6*(1-ph)})`;X.lineWidth=2;X.stroke();}
  X.restore();}
 function placeCard(u){if(u<=0)return;const top=CARD_B-108,y=top+(1-ease(u))*40;X.save();X.globalAlpha=ease(u);
  X.beginPath();X.roundRect(M,y,W-2*M,CARD_B-top,18);X.fillStyle='rgba(9,16,38,.92)';X.fill();X.strokeStyle='rgba(255,217,79,.55)';X.lineWidth=1.4;X.stroke();
  X.textAlign='left';X.textBaseline='middle';X.font=FONT(800,12);X.fillStyle='#ffd94f';X.fillText('VỊ TRÍ DỰ ÁN',M+18,y+24);
  fitFont(cfg.name,800,22,13,W-2*M-36);X.fillStyle='#fff';X.fillText(cfg.name,M+18,y+54);
  const sub=cfg.label||'Khu vực khoanh vàng trên bản đồ';fitFont(sub,500,13,9,W-2*M-36);X.fillStyle='rgba(230,235,245,.75)';X.fillText(sub,M+18,y+82);
  X.restore();if(u>=1)RECTS.push([M,top,W-M,CARD_B]);}
 function footer(){X.save();X.textAlign='center';X.textBaseline='middle';const ft='Ảnh vệ tinh: Esri, Maxar · Đường: © OpenStreetMap · Số liệu ước tính';
  fitFont(ft,500,10,7,W-2*M);X.fillStyle='rgba(255,255,255,.55)';X.fillText(ft,W/2,H-46);X.restore();}

 function frame(cam,draw){const S=mkProj(cam);drawMap(cam);const pp=S(proj[0],proj[1]),psc=1.15*clamp(pp[2],.8,1.15);draw(S,pp,psc);footer();}
 function renderIntro(ctx,t,TI,rects){X=ctx;RECTS=rects||[];frame(introCam(t,TI),(S,pp,psc)=>{drawArea(S,ease((t-TI+0.9)/0.9)*0.6,1,t);pinBody(pp[0],pp[1],'',psc*1.1,true);});}
 function render(ctx,t,rects){X=ctx;RECTS=rects||[];t=clamp(t,0,T-1e-3);
  const t0=t;frame(camAt(t),(S,pp,psc)=>{
   const pbody={x0:pp[0]-14*psc,y0:pp[1]-38*psc,x1:pp[0]+14*psc,y1:pp[1]};
   if(t<PS){drawArea(S,0.6+0.4*ease(t/1.2),1,t);pinBody(pp[0],pp[1],'',psc*1.1,true);drawProjLabel(projLabel(pp,psc,CARD_B-122),psc);
    title('Vị trí dự án',ease((t-0.1)/0.4)*(1-ease((t-(PS-0.35))/0.35)));placeCard((t-0.5)/0.5);return;}
   t-=PS;drawArea(S,1,t>=N*SC?0.9:0.7,t0);
   if(t>=N*SC){const u=(t-N*SC);const bottom=LEG_TOP-14;rings(S,(u-0.6)/1.4);
    routes.forEach(r=>{drawRoute(S,r,1,.95);const e=S(r.end[0],r.end[1]);pinBody(e[0],e[1],r.th.color,.7*clamp(e[2],.75,1.15));});
    pinBody(pp[0],pp[1],'',psc,true);drawProjLabel(projLabel(pp,psc,bottom),psc);title('Kết nối toàn vùng',ease((u-0.3)/0.5));legend((u-1.0)/0.6);return;}
   const i=Math.min(N-1,Math.floor(t/SC)),th=themes[i],τ=t-i*SC,bottom=chkTop(th.items.length)-14;
   routes.filter(r=>themes.indexOf(r.th)<i).forEach(r=>drawRoute(S,r,1,.35));
   const cur=routes.filter(r=>r.th===th);const prog=ease((τ-0.9)/1.7);
   const pl=projLabel(pp,psc,bottom);const avoid=[pl,pbody];const late=[];
   cur.forEach(r=>{const head=drawRoute(S,r,prog,1);
    if(prog>0.97){const e=S(r.end[0],r.end[1]);const pop=ease((τ-2.65)/0.35);const esc=(0.4+0.6*pop)*clamp(e[2],.8,1.15);late.push([e,esc,r,pop]);}
    else if(head&&prog>0){X.beginPath();X.arc(head[0],head[1],7,0,7);X.fillStyle='#fff';X.fill();X.strokeStyle=r.th.color;X.lineWidth=3;X.stroke();}});
   late.forEach(([e,esc,r])=>{pinBody(e[0],e[1],r.th.color,esc);avoid.push({x0:e[0]-14*esc,y0:e[1]-38*esc,x1:e[0]+14*esc,y1:e[1]});});
   late.forEach(([e,esc,r,pop])=>{if(pop<1)return;const sz=poiLabelSize(r,esc);const rc=placeLabel(e[0],e[1],esc,sz.w,sz.h,avoid,bottom);if(rc){avoid.push(rc);drawPoiLabel(rc,r,sz.sub,1);}});
   pinBody(pp[0],pp[1],'',psc,true);drawProjLabel(pl,psc);
   title(th.title,ease((τ-0.15)/0.45)*(i===N-1&&τ>SC-0.4?1:1-ease((τ-(SC-0.35))/0.35)));
   checklist(th,(τ-1.0)/0.6);});}
 function calibrate(){const c=document.createElement('canvas');c.width=W;c.height=H;const cx=c.getContext('2d');
  let t0=performance.now();for(let i=0;i<20;i++)render(cx,(i/20)*T);let ms=(performance.now()-t0)/20;
  if(ms>22){STEP=2;t0=performance.now();for(let i=0;i<20;i++)render(cx,(i/20)*T);ms=(performance.now()-t0)/20;}return {ms:+ms.toFixed(1),step:STEP};}
 return {T,themes,routes,N,PS,prefetch,calibrate,renderIntro,render};
}
window.MapEngine={discover,route,build,THEMES};
})();
