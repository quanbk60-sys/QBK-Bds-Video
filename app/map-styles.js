// Bản đồ theo phong cách — học từ 3 video mẫu (camera nhìn thẳng từ trên xuống, không nghiêng):
//  gmap     · "Vệ tinh Google": ảnh vệ tinh, tia sáng xanh dọc trục đường + nhãn tên đường, ghim vàng tiện ích,
//             vòng tròn vàng, cận lô đất xanh có m², bong bóng ảnh tròn + đường đứt vàng.
//  navy     · "Bản đồ xanh navy": nền bản đồ xanh navy, thẻ dự án, mũi tên xanh lá + khoảng cách, thẻ ảnh,
//             tên đường chữ trắng in hoa chạy dọc đường, nhãn viền xanh ngọc, máy bay ở sân bay. Có giọng đọc nữ nhanh.
//  quyhoach · "Quy hoạch lô đất": vệ tinh, từ toàn quốc bay vào tỉnh → xã (viền phát sáng), chấm đỏ "Vị trí lô đất",
//             quạt vàng "Bán kính N phút", nhãn đỏ tiện ích, mũi tên đứt trắng + km, trục đường xanh ngọc nhãn vàng. Giọng đọc đều.
// API: MapStyles.gather(cfg, log) -> data · MapStyles.narration(cfg, data) -> [{shot, text}]
//      MapStyles.build(cfg, data, durs) -> engine {T, themes, N, PS, shots, prefetch(onProg), calibrate(), render(X,t,rects), renderIntro}
(function(){
const W=576,H=1024,M=36;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=u=>{u=clamp(u);return u*u*(3-2*u);};
const easeIO=u=>{u=clamp(u);return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;};
const back=u=>{u=clamp(u)-1;return 1+2.70158*u*u*u+1.70158*u*u;};
const lerp=(a,b,u)=>a+(b-a)*u;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const FAM='"Montserrat","Be Vietnam Pro","Inter","Segoe UI","Helvetica Neue",Arial,sans-serif';
const FONT=(w,s,it)=>`${it?'italic ':''}${w} ${s}px ${FAM}`;
const mx=lon=>(lon+180)/360;
const my=lat=>{const s=Math.sin(clamp(lat,-85,85)*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI);};
function km(a,b){const R=6371,r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
 const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
const fmtKm=v=>v<1?Math.round(v*1000/10)*10+'m':(v<10?v.toFixed(1).replace('.',',').replace(',0',''):Math.round(v))+'km';
const fmtKmSay=v=>v<1?Math.round(v*1000/10)*10+' m':(v<10?v.toFixed(1).replace('.',',').replace(/,0$/,''):Math.round(v))+' km';
const norm=t=>(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim();
const UA_HDR={'Accept-Language':'vi'};

async function getJSON(u,tries=3,opt){let err;for(let i=0;i<tries;i++){try{const r=await fetch(u,opt);if(r.ok)return await r.json();err=new Error('HTTP '+r.status);}catch(e){err=e;}await sleep(700*2**i);}throw err;}
async function photon(q,P,tag,rKm){const dLat=rKm/111,dLon=rKm/(111*Math.cos(P.lat*Math.PI/180));
 let u=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${P.lat}&lon=${P.lon}&limit=15&bbox=${(P.lon-dLon).toFixed(4)},${(P.lat-dLat).toFixed(4)},${(P.lon+dLon).toFixed(4)},${(P.lat+dLat).toFixed(4)}`;
 if(tag)u+=`&osm_tag=${encodeURIComponent(tag)}`;return (await getJSON(u)).features||[];}
const fpos=f=>({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]});
const BAD=/^(đối diện|gần|cạnh|trạm xe|điểm dừng|bãi xe|lối vào|cổng|hướng|biển|ngõ|hẻm)\b|bus stop|trạm xe buýt/i;
// Nominatim: tối đa 1 yêu cầu/giây
let lastNomi=0;
async function nomi(path){const w=lastNomi+1150-Date.now();if(w>0)await sleep(w);lastNomi=Date.now();
 return getJSON('https://nominatim.openstreetmap.org/'+path+(path.includes('?')?'&':'?')+'format=json&accept-language=vi',2,{headers:UA_HDR});}

// Tiện ích gần (nhãn kiểu video: tên loại in hoa) và điểm mốc xa
const NEAR=[['trường','amenity:school','TRƯỜNG HỌC','school'],['mầm non','amenity:kindergarten','TRƯỜNG MẦM NON','school'],['chợ','amenity:marketplace','CHỢ','market'],
 ['siêu thị','shop:supermarket','SIÊU THỊ','cart'],['nhà hàng','amenity:restaurant','NHÀ HÀNG','food'],['bệnh viện','amenity:hospital','BỆNH VIỆN','hospital'],
 ['trạm y tế','amenity:clinic','TRẠM Y TẾ','hospital'],['công viên','leisure:park','CÔNG VIÊN','park'],['cà phê','amenity:cafe','CÀ PHÊ','food'],['ngân hàng','amenity:bank','NGÂN HÀNG','dot']];
const FAR=[['sân bay','aeroway:aerodrome','air',/sân bay|airport|cảng hàng không/i],['cầu',null,'bridge',/^cầu\s/i],['biển','natural:beach','beach',/biển|bãi/i],
 ['trung tâm thương mại','shop:mall','mall',null],['ga','railway:station','rail',null],['bến xe','amenity:bus_station','bus',/^bến xe(?! buýt)/i],
 ['sân vận động','leisure:stadium','stadium',null],['bệnh viện','amenity:hospital','hospital',/bệnh viện/i],['đại học','amenity:university','uni',null]];
const CENTER_Q=[['ủy ban nhân dân','amenity:townhall','UBND'],['chợ','amenity:marketplace','CHỢ'],['trạm y tế','amenity:clinic','TRẠM Y TẾ'],['trường','amenity:school','TRƯỜNG HỌC'],['mầm non','amenity:kindergarten','TRƯỜNG MẦM NON']];

async function gather(cfg,log){
 const P={lat:+cfg.lat,lon:+cfg.lon},style=cfg.style;const d={near:[],far:[],roads:[],front:'',water:null,admin:null,center:null,town:null,mainRoad:null};
 const nearR=style==='quyhoach'?(+cfg.radiusKm||2.5):1.3;
 const seen=new Set();const take=n=>{const k=norm(n);if(!k||seen.has(k))return false;seen.add(k);return true;};
 // 1) tiện ích gần
 for(const [q,tag,label,icon] of NEAR){try{const fs=(await photon(q,P,tag,nearR+0.5)).map(f=>({f,d:km(P,fpos(f))})).filter(x=>x.f.properties.name&&x.d<=nearR&&x.d>0.05&&!BAD.test(x.f.properties.name)).sort((a,b)=>a.d-b.d);
   const x=fs.find(x=>take(x.f.properties.name));if(x)d.near.push({name:x.f.properties.name,label,icon,...fpos(x.f),km:x.d});}catch(e){log(`Photon lỗi (${q}): ${e.message}`);}await sleep(110);}
 d.near.sort((a,b)=>a.km-b.km);d.near=d.near.slice(0,style==='quyhoach'?5:6);
 log(d.near.length?`Tiện ích gần: ${d.near.map(p=>p.name+' ('+fmtKm(p.km)+')').join(', ')}`:'Không thấy tiện ích gần.');
 // người dùng nhập thêm tiện ích (loại | tên): tìm đúng tên, không thấy thì bỏ
 for(const [cat,name] of cfg.pois||[]){try{const nq=norm(name);const fs=(await photon(name,P,null,40)).map(f=>({f,d:km(P,fpos(f)),s:norm(f.properties.name)===nq?0:norm(f.properties.name).includes(nq)?1:5})).filter(x=>x.s<5).sort((a,b)=>a.s-b.s||a.d-b.d);
   if(fs[0]&&take(fs[0].f.properties.name)){d.far.push({name:fs[0].f.properties.name,kind:/sân bay/i.test(name)?'air':'user',...fpos(fs[0].f),km:fs[0].d,user:true});log(`Tìm thấy "${name}" (${fmtKm(fs[0].d)})`);}else log(`Không tìm thấy "${name}", bỏ qua.`);}catch(e){}await sleep(110);}
 // 2) điểm mốc xa
 for(const [q,tag,kind,re] of FAR){if(d.far.length>=5)break;try{const fs=(await photon(q,P,tag,28)).map(f=>({f,d:km(P,fpos(f))})).filter(x=>{const n=x.f.properties.name||'';return n&&x.d>0.6&&x.d<28&&!BAD.test(n)&&(!re||re.test(n))&&!/cầu (vượt|thang|đi bộ|số)|buýt|bus/i.test(n);}).sort((a,b)=>a.d-b.d);
   const x=fs.find(x=>take(x.f.properties.name));if(x)d.far.push({name:x.f.properties.name,kind,...fpos(x.f),km:x.d});}catch(e){log(`Photon lỗi (${q}): ${e.message}`);}await sleep(110);}
 d.far.sort((a,b)=>a.km-b.km);
 log(d.far.length?`Điểm mốc: ${d.far.map(p=>p.name+' ('+fmtKm(p.km)+')').join(', ')}`:'Không thấy điểm mốc xa.');
 // 3) đường: tên đường mặt tiền (OSRM nearest) + các tuyến từ dự án tới điểm mốc (tên từng đoạn)
 try{const j=await getJSON(`https://router.project-osrm.org/nearest/v1/driving/${P.lon},${P.lat}?number=3`);const w=(j.waypoints||[]).find(x=>x.name&&x.distance<120&&!/^cầu\s/i.test(x.name));if(w)d.front=w.name.replace(/^đường\s+/i,'');}catch(e){}
 const roadMap=new Map();
 const targets=[...d.far.slice(0,4),...d.near.slice(0,2)];
 for(const p of targets){try{const j=await getJSON(`https://router.project-osrm.org/route/v1/driving/${P.lon},${P.lat};${p.lon},${p.lat}?overview=full&geometries=geojson&steps=true`);
   const r=j.routes&&j.routes[0];if(!r)continue;p.route=r.geometry.coordinates;p.rkm=r.distance/1000;p.min=r.duration/60;let acc=0;
   for(const lg of r.legs)for(const st of lg.steps){const n=(st.name||'').trim().replace(/^đường\s+/i,'');const g=st.geometry.coordinates;
    if(n&&st.distance>120&&acc<4500){const o=roadMap.get(n)||{name:n,len:0,pts:[],first:acc};o.len+=st.distance;if(o.pts.length<400)o.pts.push(...g);o.first=Math.min(o.first,acc);roadMap.set(n,o);}acc+=st.distance;}
  }catch(e){log(`Không lấy được tuyến tới ${p.name}: ${e.message}`);}await sleep(100);}
 d.roads=[...roadMap.values()].sort((a,b)=>a.first-b.first||b.len-a.len).slice(0,6);
 if(!d.front){const r=d.roads.find(r=>!/^cầu\s/i.test(r.name));if(r)d.front=r.name;}
 d.mainRoad=d.roads.find(r=>/quốc lộ|ql|tỉnh lộ|đt\s?\d|đại lộ|xa lộ/i.test(r.name))||d.roads.slice().sort((a,b)=>b.len-a.len)[0]||null;
 log(d.roads.length?`Đường quanh dự án: ${d.roads.map(r=>r.name).join(', ')}${d.front?' · mặt tiền: '+d.front:''}`:'Không lấy được tên đường.');
 // 4) sông/hồ gần (chữ lớn kiểu "SÔNG HÀN")
 try{const fs=[];for(const tg of ['waterway:river','natural:water','water:river']){(await photon('sông',P,tg,4).catch(()=>[])).forEach(f=>fs.push(f));await sleep(110);}
  const w=fs.filter(f=>/^(sông|hồ|kênh|vịnh)\s/i.test(f.properties.name||'')).map(f=>({f,d:km(P,fpos(f))})).filter(x=>x.d<3).sort((a,b)=>a.d-b.d)[0];if(w)d.water={name:w.f.properties.name,...fpos(w.f)};}catch(e){}
 // 5) hành chính (quy hoạch): xã + tỉnh + xã lân cận, trung tâm xã, trung tâm đô thị gần nhất
 if(style==='quyhoach'||style==='navy'){
  try{const a=await nomi(`reverse?lat=${P.lat}&lon=${P.lon}&zoom=18&addressdetails=1`);const ad=a.address||{};
   d.admin={commune:ad.suburb||ad.quarter||ad.village||ad.town||'',city:ad.city||ad.town||ad.county||'',province:ad.state||ad.city||'',polys:[]};
   if(style==='quyhoach'){
    const c=await nomi(`reverse?lat=${P.lat}&lon=${P.lon}&zoom=14&polygon_geojson=1&polygon_threshold=0.0004`);
    if(c&&c.geojson){d.admin.commune=c.name||d.admin.commune;d.admin.polys.push({lvl:'commune',name:c.name,id:c.osm_id,g:c.geojson});d.center={name:c.name,lat:+c.lat,lon:+c.lon,km:km(P,{lat:+c.lat,lon:+c.lon})};}
    if(d.admin.province){const s=await nomi(`search?q=${encodeURIComponent(d.admin.province)}&countrycodes=vn&polygon_geojson=1&polygon_threshold=0.004&limit=1`);
     if(s&&s[0]&&s[0].geojson)d.admin.polys.push({lvl:'province',name:s[0].name,id:s[0].osm_id,g:s[0].geojson});}
    // xã lân cận: hỏi 6 điểm quanh ranh giới xã
    const cp=d.admin.polys.find(p=>p.lvl==='commune');let rad=3;if(cp){const b=bboxOf(cp.g);rad=Math.max(1.5,Math.min(8,km({lat:b[1],lon:b[0]},{lat:b[3],lon:b[2]})*0.75));}
    const ids=new Set(d.admin.polys.map(p=>p.id));
    for(let i=0;i<6;i++){const th=i/6*Math.PI*2+0.3;const q={lat:P.lat+rad/111*Math.sin(th),lon:P.lon+rad/(111*Math.cos(P.lat*Math.PI/180))*Math.cos(th)};
     try{const n=await nomi(`reverse?lat=${q.lat}&lon=${q.lon}&zoom=14&polygon_geojson=1&polygon_threshold=0.0006`);if(n&&n.geojson&&!ids.has(n.osm_id)&&/xã|phường|thị trấn/i.test(n.name||'')){ids.add(n.osm_id);d.admin.polys.push({lvl:'near',name:n.name,id:n.osm_id,g:n.geojson});}}catch(e){}}
    // tiện ích ở trung tâm xã
    if(d.center&&d.center.km>0.4){d.center.items=[];for(const [q,tag,label] of CENTER_Q){try{const f=(await photon(q,d.center,tag,1.2)).map(f=>({f,d:km(d.center,fpos(f))})).filter(x=>x.f.properties.name&&x.d<1.2).sort((a,b)=>a.d-b.d)[0];
       if(f)d.center.items.push({name:f.f.properties.name,label,...fpos(f.f)});}catch(e){}await sleep(110);}}
    // trung tâm thị xã/thành phố gần nhất
    try{const fs=[];for(const [q,t] of [['thị xã','place:town'],['thành phố','place:city'],['thị trấn','place:town'],['phường','place:suburb']]){(await photon(q,P,t,40).catch(()=>[])).forEach(f=>fs.push(f));await sleep(110);}
     const best=fs.filter(f=>f.properties.name).map(f=>({f,d:km(P,fpos(f))})).filter(x=>x.d>1.5&&x.d<40).sort((a,b)=>a.d-b.d)[0];
     if(best)d.town={name:best.f.properties.name,...fpos(best.f),km:best.d};}catch(e){}
   }
   log(`Hành chính: ${[d.admin.commune,d.admin.province].filter(Boolean).join(', ')}${d.admin.polys.length?` · ${d.admin.polys.length} ranh giới`:''}${d.center?` · trung tâm xã ${fmtKm(d.center.km)}`:''}${d.town?` · ${d.town.name} ${fmtKm(d.town.km)}`:''}`);
  }catch(e){log('Không lấy được ranh giới hành chính: '+e.message);}
 }
 return d;
}
function bboxOf(g){let b=[180,90,-180,-90];const add=c=>{b[0]=Math.min(b[0],c[0]);b[1]=Math.min(b[1],c[1]);b[2]=Math.max(b[2],c[0]);b[3]=Math.max(b[3],c[1]);};
 (g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]).forEach(p=>p.forEach(r=>r.forEach(add)));return b;}
const ringsOf=g=>(g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[]).map(r=>{const k=Math.max(1,Math.floor(r.length/320));return r.filter((_,i)=>i%k===0).map(c=>[mx(c[0]),my(c[1])]);});
const shortAdmin=n=>(n||'').replace(/^(Thành phố|Tỉnh)\s+/i,'');

// ---------- Lời đọc (chỉ dùng dữ liệu bản đồ + thông tin người dùng nhập, không bịa số) ----------
function narration(cfg,d){
 const name=cfg.name||'Dự án',F=cfg.facts||{},out=[];
 if(cfg.style==='navy'){
  const f0=d.far[0],f1=d.far[1];
  out.push({shot:0,text:`${name} sở hữu vị trí tâm điểm${d.front?`, ngay mặt tiền ${d.front}`:''}${f0?`, cách ${f0.name} chỉ ${fmtKmSay(f0.km)}`:''}${f1?` và ${f1.name} ${fmtKmSay(f1.km)}`:''}.`});
  const rs=d.roads.map(r=>r.name).filter(n=>n!==d.front).slice(0,5);
  if(rs.length)out.push({shot:1,text:`Ngoài ra, dự án nằm gần các cung đường quan trọng như ${rs.join(', ')}.`});
  const rest=d.far.slice(2,6).map(p=>p.name);
  out.push({shot:2,text:rest.length?`Đây là các tuyến đường huyết mạch, kết nối nhanh tới ${rest.join(', ')}${d.admin&&d.admin.city?` và trung tâm ${shortAdmin(d.admin.city)}`:''}, mở ra tiềm năng đầu tư trong tương lai gần.`
   :`Đây là các tuyến đường huyết mạch kết nối dự án với trung tâm${d.admin&&d.admin.city?' '+shortAdmin(d.admin.city):' thành phố'}.`});
  out.push({shot:3,text:`Hãy liên hệ với mình để nhận thông tin dự án này.`});
 }else if(cfg.style==='quyhoach'){
  const A=d.admin||{};const where=[A.commune,shortAdmin(A.province)].filter(Boolean).join(', ');
  out.push({shot:0,text:`${/^lô|^đất/i.test(name)?name:'Lô đất '+name} tọa lạc tại ${where||'vị trí đẹp'}.`});
  if(d.near.length)out.push({shot:1,text:`Trong bán kính ${cfg.radiusMin||8} phút di chuyển sẽ tiếp cận được các tiện ích như ${d.near.slice(0,4).map(p=>p.name).join(', ')}.`});
  if(d.center&&d.center.km>0.4)out.push({shot:2,text:`Cách trung tâm ${d.center.name} ${fmtKmSay(d.center.km)}${d.center.items&&d.center.items.length?`, nơi có đầy đủ tiện ích như ${d.center.items.slice(0,4).map(p=>p.name).join(', ')}`:''}.`});
  if(d.town)out.push({shot:3,text:`Cách trung tâm ${d.town.name} ${fmtKmSay(d.town.km)}.`});
  // phần nói trong cảnh ảnh/flycam sau bản đồ
  const facts=[F.area&&`tổng diện tích ${F.area} mét vuông`,F.res&&`trong đó có ${F.res} mét vuông thổ cư`,F.front&&`${F.front} mét mặt tiền`,F.road&&`đường ${F.road}`].filter(Boolean);
  if(facts.length)out.push({shot:-1,text:`Lô đất có ${facts.join(', ')}.`});
  if(F.legal)out.push({shot:-1,text:F.legal.replace(/\.$/,'')+'.'});
  out.push({shot:-1,text:'Hãy liên hệ với chúng tôi để biết thêm thông tin về lô đất.'});
 }
 return out;
}
// chữ cho máy đọc: số, km, m² đọc ra tiếng
function ttsText(t){return t.replace(/(\d+),(\d+)\s?km\b/g,'$1 phẩy $2 ki lô mét').replace(/(\d+)\s?km\b/g,'$1 ki lô mét').replace(/(\d+),(\d+)\s?m\b/g,'$1 phẩy $2 mét').replace(/(\d+)\s?m²/g,'$1 mét vuông').replace(/(\d+)\s?m\b/g,'$1 mét')
 .replace(/\bQL\s?(\d+)/gi,'quốc lộ $1').replace(/\bĐT\s?(\d+)/g,'đường tỉnh $1').replace(/\bUBND\b/g,'ủy ban nhân dân').replace(/\bTP\.?\s/g,'thành phố ').replace(/\bTX\.?\s/g,'thị xã ');}

// ---------- Engine ----------
const SVC={sat:'World_Imagery',dark:'Canvas/World_Dark_Gray_Base'},MAXZ={sat:18,dark:16};
// nền tối của Esri (xám) → bảng màu xanh navy của video mẫu: đất navy đậm, nước xanh sáng hơn, đường xanh nhạt
function navyLUT(){const lut=new Uint8ClampedArray(256*3);for(let L=0;L<256;L++){let c;
  if(L<=52)c=[30,92,152];else if(L<=60){const u=(L-52)/8;c=[lerp(30,16,u),lerp(92,57,u),lerp(152,104,u)];}
  else if(L<=78)c=[16,57,104];else{const u=clamp((L-78)/80);c=[lerp(22,150,u),lerp(66,185,u),lerp(118,225,u)];}
  lut.set(c.map(Math.round),L*3);}return lut;}
let LUT=null;

function build(cfg,d,durs){
 const style=cfg.style,P={lat:+cfg.lat,lon:+cfg.lon},PX=[mx(P.lon),my(P.lat)];
 const kmPerMx=40075.017*Math.cos(P.lat*Math.PI/180);
 const toM=p=>[mx(p.lon),my(p.lat)];
 const cache=new Map();let X=null,RECTS=[],STEP_Q=1;
 const lineM=c=>c.map(v=>[mx(v[0]),my(v[1])]);
 // khung camera chứa các điểm (camera nhìn thẳng, có thể xoay r)
 function fitZ(pts,box,r=0,zmax=17.5){const [x0,y0,x1,y1]=box;let cx=0,cy=0;pts.forEach(p=>{cx+=p[0];cy+=p[1];});cx/=pts.length;cy/=pts.length;
  for(let z=zmax;z>3;z-=0.05){const S=projOf({x:cx,y:cy,z,r});if(pts.every(p=>{const q=S(p[0],p[1]);return q[0]>=x0&&q[0]<=x1&&q[1]>=y0&&q[1]<=y1;}))return {x:cx,y:cy,z,r};}return {x:cx,y:cy,z:4,r};}
 function projOf(cam){const k=256*2**cam.z,c=Math.cos(cam.r||0),s=Math.sin(cam.r||0);return (x,y)=>{const u=(x-cam.x)*k,v=(y-cam.y)*k;return [W/2+u*c-v*s,H/2+u*s+v*c];};}
 const at=(z,r=0,p=PX)=>({x:p[0],y:p[1],z,r});

 // ---- dựng kịch bản cảnh ----
 const keys=[];const layers=[];const shots=[];let T=0;const base=style==='quyhoach'?'sat':style==='navy'?'dark':'sat';
 const shot=(i,min,fn)=>{const dur=Math.max(min,(durs&&durs[i]||0)+0.5);const t0=T;shots.push({t0,dur});fn(t0,dur);T+=dur;};
 const key=(t,cam,e)=>keys.push({t,cam,e:e||'io'});
 const layer=(t0,t1,fn,fin=0.5,fout=0.4)=>layers.push({t0,t1,fn,fin,fout});
 const far=d.far||[],near=d.near||[];
 const crops=[]; // ảnh vệ tinh cắt quanh điểm (cho thẻ ảnh, bong bóng)
 const cropOf=p=>{const c={p,z:16,img:null};crops.push(c);return c;};

 if(style==='gmap'||style==='neon'){
  const c0=at(12.6),c1=at(16.2);
  shot(0,2.4,(t0,dt)=>{key(t0,c0);key(t0+dt,c1);});
  const road=d.roads.find(r=>r.pts.length>1&&r.first<600)||d.roads[0];
  shot(1,2.8,(t0,dt)=>{key(t0+dt,at(16.25));
   layer(t0+0.2,1e9,(S,a,τ)=>{if(road)beam(S,lineM(road.pts),a,road.name);},1.4);
   layer(t0+0.9,1e9,(S,a)=>pinY(S(PX[0],PX[1]),a,'VỊ TRÍ ĐẤT',true,'home'));});
  if(near.length)shot(2,5,(t0,dt)=>{key(t0+dt,at(15.9));
   layer(t0,1e9,(S,a)=>ringY(S,PX,(near[near.length-1].km*1.08)/kmPerMx,a),1.2);
   near.forEach((p,i)=>layer(t0+0.6+i*0.55,1e9,(S,a)=>pinY(S(...toM(p)),a,p.label,false,p.icon),0.45));});
  const F=cfg.facts||{};const lw=+String(F.width||'').replace(',','.'),ll=+String(F.length||'').replace(',','.');
  if(lw>0&&ll>0){const zp=clamp(Math.log2(300/(Math.max(lw,ll)/1000/kmPerMx*256)),17,20.5);shot(-1,4.5,(t0,dt)=>{key(t0+1.2,at(zp));key(t0+dt-0.3,at(zp+0.05));
   layer(t0+1.3,t0+dt,(S,a)=>plotBlue(S,lw,ll,a,F.area),1.6,0.3);});}
  const fx=far.slice(0,2);
  if(fx.length)shot(3,6,(t0,dt)=>{const cam=fitZ([PX,...fx.map(toM)],[90,300,W-90,H-200],0,15.5);key(t0+1.4,cam);key(t0+dt,{...cam,z:cam.z-0.15});
   const cs=fx.map(cropOf);
   layer(t0+1.2,1e9,(S,a)=>{dashedY(S,[...fx.map(toM)].length>1?[toM(fx[0]),PX,toM(fx[1])]:[PX,toM(fx[0])],a);},1.4);
   fx.forEach((p,i)=>layer(t0+1.6+i*0.5,1e9,(S,a,τ)=>bubble(S(...toM(p)),cs[i],a,τ),0.6));});
  shot(4,2.6,(t0,dt)=>{key(t0+dt,at(12.4));});
 }
 else if(style==='navy'){
  const f01=far.slice(0,2);
  const pc=cropOf({lat:P.lat,lon:P.lon,name:cfg.name});
  shot(0,7,(t0,dt)=>{key(t0,at(10.6,0));key(t0+dt*0.32,at(15.4,-0.08));
   if(f01.length){const cam=fitZ([PX,...f01.map(toM)],[80,260,W-80,H-160],-0.05,15);key(t0+dt*0.55,cam);key(t0+dt,{...cam,z:cam.z-0.1});}
   layer(t0+dt*0.18,1e9,(S,a,τ)=>projCard(S(PX[0],PX[1]),a,τ,pc),0.5);
   if(d.water)layer(t0+dt*0.12,t0+dt*0.75,(S,a)=>bigText(S(...toM(d.water)),d.water.name.toUpperCase(),a),0.7,0.6);
   const tEnd=t0+dt+(durs&&durs[1]?Math.max(4.5,durs[1]+0.5):4.5);
   f01.forEach((p,i)=>{const c=cropOf(p);layer(t0+dt*0.5+i*0.6,1e9,(S,a)=>arrowG(S,PX,toM(p),a,fmtKm(p.km).toUpperCase()),1.0);
    layer(t0+dt*0.5+i*0.6+0.8,tEnd,(S,a)=>billboard(S(...toM(p)),c,p.name,a),0.5,0.5);});});
  shot(1,4.5,(t0,dt)=>{key(t0+1.2,at(15.9,0.12));key(t0+dt,at(16.0,0.14));
   d.roads.slice(0,5).forEach((r,i)=>layer(t0+0.6+i*0.45,t0+dt+0.3,(S,a)=>streetName(S,lineM(r.pts),r.name.toUpperCase(),a),0.5,0.4));});
  const rest=far.slice(2,6).filter(p=>p.km<12);
  shot(2,6,(t0,dt)=>{const cam=fitZ([PX,...far.slice(0,6).filter(p=>p.km<12).map(toM)],[70,260,W-70,H-160],0,14.5);key(t0+1.4,cam);key(t0+dt,{...cam,z:cam.z+0.05});
   rest.forEach((p,i)=>layer(t0+1.2+i*0.6,1e9,(S,a,τ)=>p.kind==='air'?plane(S(...toM(p)),p.name,a):labelBox(S(...toM(p)),p.name.toUpperCase(),a,τ),0.5));});
  shot(3,2.8,(t0,dt)=>{const k=keys[keys.length-1].cam;key(t0+dt,{...k,z:k.z+0.15});});
 }
 else if(style==='quyhoach'){
  const A=d.admin||{polys:[]};const prov=A.polys.find(p=>p.lvl==='province'),com=A.polys.find(p=>p.lvl==='commune'),nb=A.polys.filter(p=>p.lvl==='near');
  const R=(g)=>ringsOf(g.g);const provR=prov?R(prov):[],comR=com?R(com):[],nbR=nb.map(p=>({p,r:R(p)}));
  const allPts=r=>r.flat();
  shot(0,6.5,(t0,dt)=>{key(t0,at(5.6));
   const main=provR.length?provR.reduce((m,r)=>r.length>m.length?r:m,provR[0]):null;if(main){const c=fitZ(main,[50,200,W-50,H-160],0,10);key(t0+dt*0.38,c);}
   const cc=comR.length?fitZ([...allPts(comR),...nbR.flatMap(n=>allPts(n.r))].slice(0,4000),[40,220,W-40,H-170],0,14):at(12.5);key(t0+dt*0.85,cc);key(t0+dt,{...cc,z:cc.z+0.08});
   if(prov)layer(t0+0.3,t0+dt+0.6,(S,a,τ,cam)=>{glowPoly(S,provR,'#33ffb0',a,cam.z<9.5?'rgba(51,255,176,.10)':null);if(cam.z<10.5)polyName(S,provR,shortAdmin(prov.name).toUpperCase(),a*clamp((10.5-cam.z)/1.2),22);},0.8,0.6);
   nbR.forEach((n,i)=>layer(t0+dt*0.6+i*0.1,t0+dt+0.3,(S,a,τ,cam)=>{glowPoly(S,n.r,'#4dff3a',a,null);polyName(S,n.r,n.p.name.replace(/^(Xã|Phường|Thị trấn)\s+/i,'').toUpperCase(),a*clamp((cam.z-10.5)/1),12);},0.6,0.5));
   if(com)layer(t0+dt*0.45,t0+dt+0.4,(S,a,τ,cam)=>{glowPoly(S,comR,'#fff23a',a,'rgba(255,236,60,.28)');polyName(S,comR,com.name.toUpperCase(),a*clamp((cam.z-10)/1.2),16);},0.8);
   layer(t0+dt*0.7,1e9,(S,a,τ)=>redDot(S(PX[0],PX[1]),a,τ,'Vị trí lô đất'),0.5);});
  const rKm=+cfg.radiusKm||2.5;
  if(near.length)shot(1,6,(t0,dt)=>{const c=fitZ([PX,[PX[0]+rKm/kmPerMx,PX[1]],[PX[0]-rKm/kmPerMx,PX[1]],[PX[0],PX[1]-rKm/kmPerMx*1.0],[PX[0],PX[1]+rKm/kmPerMx]],[30,200,W-30,H-150],0,15);key(t0+1.2,c);key(t0+dt,{...c,z:c.z+0.06});
   layer(t0+0.9,t0+dt+0.4,(S,a)=>sector(S,PX,rKm/kmPerMx,a,`Bán kính ${cfg.radiusMin||8} phút`),1.6,0.5);
   near.forEach((p,i)=>layer(t0+1.8+i*0.5,t0+dt+0.4,(S,a)=>redLabel(S(...toM(p)),p.name.toUpperCase(),a),0.45,0.4));});
  const cen=d.center&&d.center.km>0.4?d.center:null;
  if(cen)shot(2,6,(t0,dt)=>{const cp=toM(cen);const c=fitZ([PX,cp,...(cen.items||[]).map(toM)],[60,230,W-60,H-180],0,15.5);key(t0+1.2,c);key(t0+dt,{...c,z:c.z+0.05});
   if(d.mainRoad&&d.mainRoad.pts.length>1)layer(t0+1.0,t0+dt+0.4,(S,a)=>cyanRoad(S,lineM(d.mainRoad.pts),d.mainRoad.name.toUpperCase(),a),1.4,0.4);
   layer(t0+0.8,t0+dt+0.4,(S,a)=>dashArrow(S,PX,cp,a,fmtKm(cen.km)),1.6,0.4);
   (cen.items||[]).forEach((p,i)=>layer(t0+2.4+i*0.4,t0+dt+0.4,(S,a)=>redLabel(S(...toM(p)),p.name.toUpperCase(),a),0.4,0.4));});
  if(d.town)shot(3,4.2,(t0,dt)=>{const tp=toM(d.town);const c=fitZ([PX,tp],[70,240,W-70,H-200],0,15);key(t0+1.2,c);key(t0+dt,{...c,z:c.z+0.05});
   layer(t0+0.8,1e9,(S,a)=>{dashArrow(S,PX,tp,a,fmtKm(d.town.km));if(a>0.9)townMark(S(...tp),'Trung tâm '+d.town.name,clamp((a-0.9)/0.1));},1.6);});
  // dự án luôn hiện chấm đỏ sau cảnh mở đầu
  const t1=shots[0].t0+shots[0].dur;layer(t1,1e9,(S,a,τ)=>redDot(S(PX[0],PX[1]),1,τ,'Vị trí lô đất'),0.01);
 }
 if(!keys.length)key(0,at(15));
 T=Math.max(T,keys[keys.length-1].t+0.1);
 // camera tại thời điểm t
 function camAt(t){let i=0;while(i<keys.length-1&&keys[i+1].t<=t)i++;const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];if(a===b||t<=a.t)return a.cam;
  const u=easeIO((t-a.t)/(b.t-a.t||1));
  // bay theo zoom: vị trí nội suy theo tỉ lệ 2^z để không trôi khi zoom mạnh
  const z=lerp(a.cam.z,b.cam.z,u);const ka=2**a.cam.z,kb=2**b.cam.z,kz=2**z;const w=Math.abs(kb-ka)<1e-9?u:(1/ka-1/kz)/(1/ka-1/kb);const uw=clamp(isFinite(w)?w:u);
  return {x:lerp(a.cam.x,b.cam.x,uw),y:lerp(a.cam.y,b.cam.y,uw),z,r:lerp(a.cam.r||0,b.cam.r||0,u)};}
 const baseAt=t=>style==='navy'?(t<shots[0].t0+shots[0].dur*0.2?'sat':'dark'):base;

 // ---- ô ảnh nền ----
 function tilesFor(cam,svc){const zi=Math.max(2,Math.min(MAXZ[svc],Math.round(cam.z+0.15))),n=2**zi,ts=256*2**(cam.z-zi),cx=cam.x*n,cy=cam.y*n,R=Math.hypot(W,H)/2/ts+1;const out=[];
  for(let x=Math.floor(cx-R);x<=Math.floor(cx+R);x++)for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(n-1,Math.floor(cy+R));y++)out.push([zi,x,y,cx,cy,ts,n]);return out;}
 const tkey=(svc,z,x,y,n)=>svc+'/'+z+'/'+(((x%n)+n)%n)+'/'+y;
 async function loadTile(k){const [svc,z,x,y]=k.split('/');const r=await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/${SVC[svc]}/MapServer/tile/${z}/${y}/${x}`);if(!r.ok)throw new Error('HTTP '+r.status);
  let bmp=await createImageBitmap(await r.blob());
  if(svc==='dark'){if(!LUT)LUT=navyLUT();const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.drawImage(bmp,0,0);const im=g.getImageData(0,0,256,256),p=im.data;
   for(let i=0;i<p.length;i+=4){const L=(p[i]*0.3+p[i+1]*0.59+p[i+2]*0.11)|0;p[i]=LUT[L*3];p[i+1]=LUT[L*3+1];p[i+2]=LUT[L*3+2];}g.putImageData(im,0,0);bmp=await createImageBitmap(c);}
  return bmp;}
 async function prefetch(onProg){const need=new Set();
  for(let t=0;t<T;t+=1/12){const cam=camAt(t);const svcs=style==='navy'&&t<shots[0].t0+shots[0].dur*0.32?['sat','dark']:[baseAt(t)];
   for(const svc of svcs)for(const [z,x,y,,,,n] of tilesFor(cam,svc))need.add(tkey(svc,z,x,y,n));}
  for(const c of crops){const n=2**c.z,cx=mx(c.p.lon)*n,cy=my(c.p.lat)*n;for(let x=Math.floor(cx-1);x<=Math.floor(cx+1);x++)for(let y=Math.floor(cy-1);y<=Math.floor(cy+1);y++)need.add(tkey('sat',c.z,x,y,n));}
  const arr=[...need].filter(k=>!cache.has(k));let done=0,failed=0,idx=0;
  await Promise.all(Array.from({length:12},async()=>{while(idx<arr.length){const k=arr[idx++];try{cache.set(k,await loadTile(k));}catch(e){failed++;}done++;if(onProg&&done%25===0)onProg(done,arr.length);}}));
  // cắt ảnh vệ tinh quanh điểm cho thẻ ảnh
  for(const c of crops){const cv=document.createElement('canvas');cv.width=cv.height=240;const g=cv.getContext('2d');const n=2**c.z,cx=mx(c.p.lon)*n*256,cy=my(c.p.lat)*n*256;
   for(let x=Math.floor(cx/256-1);x<=Math.floor(cx/256+1);x++)for(let y=Math.floor(cy/256-1);y<=Math.floor(cy/256+1);y++){const b=cache.get(tkey('sat',c.z,x,y,n));if(b)g.drawImage(b,x*256-cx+120,y*256-cy+120);}
   c.img=cv;}
  return {total:arr.length,failed};}
 function drawBase(cam,svc,alpha){X.save();X.globalAlpha=alpha;X.translate(W/2,H/2);X.rotate(cam.r||0);
  for(const [z,x,y,cx,cy,ts,n] of tilesFor(cam,svc)){const b=cache.get(tkey(svc,z,x,y,n));if(b)X.drawImage(b,(x-cx)*ts,(y-cy)*ts,ts+0.8,ts+0.8);}
  X.restore();}

 // ---- đồ họa theo phong cách ----
 function fitFont(text,wt,start,min,maxW,it){let s=start;X.font=FONT(wt,s,it);while(X.measureText(text).width>maxW&&s>min){s--;X.font=FONT(wt,s,it);}return s;}
 const keepIn=(x,w)=>clamp(x,M+w/2,W-M-w/2);
 function pathOf(S,pts,p=1){const out=[];let L=0;const q=pts.map(v=>S(v[0],v[1]));for(let i=1;i<q.length;i++)L+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);
  let left=L*clamp(p);out.push(q[0]);for(let i=1;i<q.length;i++){const s=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);if(left>=s){out.push(q[i]);left-=s;}else{const u=left/(s||1);out.push([lerp(q[i-1][0],q[i][0],u),lerp(q[i-1][1],q[i][1],u)]);break;}}return {pts:out,L};}
 const stroke=(pts)=>{X.beginPath();pts.forEach((v,i)=>i?X.lineTo(v[0],v[1]):X.moveTo(v[0],v[1]));};
 // gmap: tia xanh dọc trục đường + nhãn trắng viền xanh
 function beam(S,pts,a,name){const {pts:q}=pathOf(S,pts,ease(a/0.8));if(q.length<2)return;X.save();X.lineCap='round';X.lineJoin='round';
  X.shadowColor='#2f8bff';X.shadowBlur=26;X.strokeStyle='rgba(40,130,255,.75)';X.lineWidth=12;stroke(q);X.stroke();
  X.shadowBlur=10;X.strokeStyle='rgba(150,205,255,.95)';X.lineWidth=5;X.stroke();X.shadowBlur=0;X.strokeStyle='#ffffff';X.lineWidth=1.8;X.stroke();X.restore();
  if(!name||a<0.75)return;const k=ease((a-0.75)/0.25);const {pts:all}=pathOf(S,pts,1);const mid=all[Math.floor(all.length/2)];let tx=keepIn(mid[0],10),ty=mid[1]-90;
  X.save();X.globalAlpha=k;X.strokeStyle='#fff';X.lineWidth=2;X.beginPath();X.moveTo(tx,ty+20);X.lineTo(mid[0],mid[1]);X.stroke();X.fillStyle='#fff';X.beginPath();X.arc(mid[0],mid[1],3.5,0,7);X.fill();
  const s=fitFont(name,800,19,11,W-2*M-30);const w=X.measureText(name).width+22;tx=keepIn(tx,w);X.fillStyle='#fff';X.fillRect(tx-w/2,ty-15,w*k,32);X.fillStyle='#1d4fd8';X.fillRect(tx-w/2,ty-15,4,32);X.fillRect(tx+w/2-4,ty-15,4,32);
  X.fillStyle='#173b9c';X.textAlign='center';X.textBaseline='middle';X.fillText(name,tx,ty+1.5);RECTS.push([tx-w/2,ty-15,tx+w/2,ty+17]);X.restore();}
 function pinShape(x,y,sc,top,bot){X.save();X.translate(x,y);X.scale(sc,sc);X.beginPath();X.ellipse(0,1,9,3.2,0,0,7);X.fillStyle='rgba(0,0,0,.4)';X.fill();
  X.beginPath();X.moveTo(0,0);X.bezierCurveTo(-4,-8,-14,-14,-14,-24);X.arc(0,-24,14,Math.PI,0);X.bezierCurveTo(14,-14,4,-8,0,0);X.closePath();
  const g=X.createLinearGradient(0,-38,0,0);g.addColorStop(0,top);g.addColorStop(1,bot);X.fillStyle=g;X.fill();X.lineWidth=1.4;X.strokeStyle='rgba(255,255,255,.85)';X.stroke();
  X.beginPath();X.arc(0,-24,8.5,0,7);X.fillStyle='#fff';X.fill();X.restore();}
 function glyph(type,x,y,s,col){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle=X.strokeStyle=col||'#3a2a00';X.lineWidth=1.8;X.lineCap='round';X.lineJoin='round';
  switch(type){case 'home':X.beginPath();X.moveTo(-6,0);X.lineTo(0,-6);X.lineTo(6,0);X.stroke();X.fillRect(-4,0,8,6);break;
   case 'school':X.fillRect(-6,-4,5.4,9);X.fillRect(0.6,-4,5.4,9);break;case 'cart':X.beginPath();X.moveTo(-7,-5);X.lineTo(-4,-5);X.lineTo(-2,3);X.lineTo(5,3);X.lineTo(6.5,-2.5);X.lineTo(-3,-2.5);X.stroke();X.beginPath();X.arc(-1,5.6,1.4,0,7);X.arc(4,5.6,1.4,0,7);X.fill();break;
   case 'market':X.fillRect(-6.5,-5,13,3.5);X.fillRect(-5,-1,1.8,6.5);X.fillRect(3.2,-1,1.8,6.5);break;case 'hospital':X.fillRect(-1.8,-6,3.6,12);X.fillRect(-6,-1.8,12,3.6);break;
   case 'food':X.beginPath();X.moveTo(-5,-5);X.lineTo(5,5);X.moveTo(5,-5);X.lineTo(-5,5);X.lineWidth=2.4;X.stroke();break;case 'park':X.beginPath();X.arc(0,-2,5,0,7);X.fill();X.fillRect(-1,2,2,5);break;
   default:X.beginPath();X.arc(0,0,3.2,0,7);X.fill();}X.restore();}
 function pinY(p,a,label,main,icon){if(a<=0)return;const sc=(main?1.35:1.05)*back(a);X.save();X.globalAlpha=clamp(a*3);
  pinShape(p[0],p[1]-(main?(1-ease(a))*60:0),sc,'#ffe46b','#e0a400');glyph(icon||'dot',p[0],p[1]-24*sc,0.9*sc);
  if(a>0.5&&label){const s=fitFont(label,800,main?15:12.5,9,200);const w=X.measureText(label).width;const x=keepIn(p[0],w),y=p[1]-44*sc;if(!main&&RECTS.some(r=>r[0]<x+w/2&&r[2]>x-w/2&&r[1]<y+3&&r[3]>y-s)){X.restore();return;}X.textAlign='center';X.textBaseline='alphabetic';
   X.lineWidth=3.5;X.strokeStyle='rgba(0,0,0,.7)';X.lineJoin='round';X.strokeText(label,x,y);X.fillStyle='#ffe14d';X.fillText(label,x,y);RECTS.push([x-w/2,y-s,x+w/2,y+3]);}
  X.restore();}
 function ringY(S,c,rM,a){const p=S(c[0],c[1]),q=S(c[0]+rM,c[1]);const r=Math.hypot(q[0]-p[0],q[1]-p[1])*ease(a);X.save();X.strokeStyle='rgba(255,226,70,.9)';X.lineWidth=1.8;X.beginPath();X.arc(p[0],p[1],r,0,7);X.stroke();X.restore();}
 function plotBlue(S,wid,len,a,area){const p=S(PX[0],PX[1]),q=S(PX[0]+1/1000/kmPerMx,PX[1]);const mpp=Math.hypot(q[0]-p[0],q[1]-p[1]);const w=wid*mpp,h=len*mpp;const e=ease(a/0.6);
  X.save();X.shadowColor='#4fc3ff';X.shadowBlur=24;X.fillStyle=`rgba(40,160,255,${0.45*e})`;X.fillRect(p[0]-w/2,p[1]-h/2+h*(1-e),w,h*e);X.strokeStyle=`rgba(170,230,255,${e})`;X.lineWidth=3;X.strokeRect(p[0]-w/2,p[1]-h/2+h*(1-e),w,h*e);X.shadowBlur=0;
  const k=clamp((a-0.55)/0.3);if(k>0){X.globalAlpha=k;const t=(area||Math.round(wid*len))+'m²';const s=fitFont(t,900,Math.min(40,w*0.32),14,w*0.9);X.textAlign='center';X.textBaseline='middle';X.lineWidth=4;X.strokeStyle='rgba(0,0,0,.5)';X.strokeText(t,p[0],p[1]);X.fillStyle='#ffe100';X.fillText(t,p[0],p[1]);
   X.strokeStyle='#fff';X.lineWidth=2;X.beginPath();X.moveTo(p[0]-w/2,p[1]+h/2+14);X.lineTo(p[0]+w/2,p[1]+h/2+14);X.moveTo(p[0]+w/2+14,p[1]-h/2);X.lineTo(p[0]+w/2+14,p[1]+h/2);X.stroke();
   X.font=FONT(800,20);X.fillStyle='#fff';X.fillText(String(wid).replace('.',',')+'m',p[0],p[1]+h/2+36);X.save();X.translate(p[0]+w/2+34,p[1]);X.rotate(Math.PI/2);X.fillText(String(len).replace('.',',')+'m',0,0);X.restore();}
  X.restore();}
 function dashedY(S,pts,a){const {pts:q}=pathOf(S,pts,ease(a));X.save();X.setLineDash([10,8]);X.strokeStyle='#ffe100';X.lineWidth=3;stroke(q);X.stroke();X.restore();}
 function bubble(p,c,a,τ){if(a<=0)return;const r=58*back(a);const cx=keepIn(p[0],2*r+8),cy=Math.max(260,p[1]-r-46);X.save();X.globalAlpha=clamp(a*2);
  X.fillStyle='rgba(255,255,255,.55)';X.beginPath();X.moveTo(cx-r*0.55,cy+r*0.6);X.lineTo(p[0],p[1]);X.lineTo(cx+r*0.55,cy+r*0.6);X.closePath();X.fill();
  X.beginPath();X.arc(cx,cy,r,0,7);X.save();X.clip();if(c.img){const s=1.25+0.05*Math.sin(τ);X.drawImage(c.img,cx-r*s,cy-r*s,2*r*s,2*r*s);}else{X.fillStyle='#334';X.fill();}X.restore();
  X.lineWidth=3;X.strokeStyle='#fff';X.stroke();X.restore();RECTS.push([cx-r,cy-r,cx+r,cy+r]);}
 // navy
 function projCard(p,a,τ,c){if(a<=0)return;const e=back(a);const cw=128,chh=74,x=keepIn(p[0],cw),y=p[1]-118;X.save();X.globalAlpha=clamp(a*2);
  for(let k=0;k<2;k++){const ph=((τ*0.8)+k*0.5)%1;X.strokeStyle=`rgba(255,255,255,${0.7*(1-ph)})`;X.lineWidth=1.5;X.beginPath();X.ellipse(p[0],p[1],6+20*ph,2.5+8*ph,0,0,7);X.stroke();}
  X.fillStyle='#fff';X.beginPath();X.arc(p[0],p[1],4,0,7);X.fill();X.strokeStyle='rgba(255,255,255,.9)';X.lineWidth=1.5;X.beginPath();X.moveTo(p[0],p[1]);X.lineTo(x,y+chh*e);X.stroke();
  X.translate(x,y+chh/2);X.scale(e,e);X.translate(-x,-(y+chh/2));
  X.fillStyle='rgba(32,92,58,.95)';X.strokeStyle='#d9ffe6';X.lineWidth=1.6;X.beginPath();X.roundRect(x-cw/2,y,cw,chh,6);X.fill();X.stroke();
  if(c.img){X.save();X.beginPath();X.roundRect(x-cw/2+5,y+5,cw-10,chh-28,4);X.clip();X.drawImage(c.img,60,60,120,120,x-cw/2+5,y+5-20,cw-10,cw-10);X.restore();}
  const n=cfg.name||'';fitFont(n,800,13,8,cw-12);X.fillStyle='#fff8c8';X.textAlign='center';X.textBaseline='middle';X.fillText(n,x,y+chh-11);X.restore();RECTS.push([x-cw/2,y,x+cw/2,y+chh]);}
 function bigText(p,t,a){X.save();X.globalAlpha=0.85*ease(a);const s=fitFont(t,900,50,24,W*0.7);const tw=X.measureText(t).width*0.6;X.translate(clamp(p[0],tw/2+20,W-tw/2-20),clamp(p[1],300,H-260));X.rotate(-0.95);X.textAlign='center';X.textBaseline='middle';X.fillStyle='rgba(255,255,255,.92)';X.fillText(t,0,0);X.restore();}
 function arrowG(S,a0,b0,a,txt){const p=S(a0[0],a0[1]),q0=S(b0[0],b0[1]);const e=ease(a);const q=[lerp(p[0],q0[0],e),lerp(p[1],q0[1],e)];const ang=Math.atan2(q[1]-p[1],q[0]-p[0]);
  X.save();const g=X.createLinearGradient(p[0],p[1],q[0],q[1]);g.addColorStop(0,'rgba(120,255,80,.15)');g.addColorStop(1,'#5dff2e');X.strokeStyle=g;X.lineWidth=6;X.lineCap='round';X.shadowColor='#5dff2e';X.shadowBlur=12;
  X.beginPath();X.moveTo(p[0],p[1]);X.lineTo(q[0]-Math.cos(ang)*10,q[1]-Math.sin(ang)*10);X.stroke();X.fillStyle='#5dff2e';X.beginPath();X.moveTo(q[0],q[1]);X.lineTo(q[0]-Math.cos(ang-0.45)*20,q[1]-Math.sin(ang-0.45)*20);X.lineTo(q[0]-Math.cos(ang+0.45)*20,q[1]-Math.sin(ang+0.45)*20);X.closePath();X.fill();X.shadowBlur=0;
  if(e>0.6){X.globalAlpha=clamp((e-0.6)/0.3);let r=ang;if(r>Math.PI/2)r-=Math.PI;if(r<-Math.PI/2)r+=Math.PI;const mx2=(p[0]+q0[0])/2,my2=(p[1]+q0[1])/2;X.translate(mx2,my2);X.rotate(r);X.font=FONT(900,19);X.textAlign='center';X.textBaseline='bottom';X.lineWidth=4;X.strokeStyle='rgba(10,30,60,.8)';X.strokeText(txt,0,-6);X.fillStyle='#fff';X.fillText(txt,0,-6);}
  X.restore();}
 function billboard(p,c,name,a){if(a<=0)return;const e=back(a);const cw=104,ch=64,x=keepIn(p[0],cw),y=Math.max(230,p[1]-ch-50);X.save();X.globalAlpha=clamp(a*2);
  X.strokeStyle='#fff';X.lineWidth=1.4;X.beginPath();X.moveTo(p[0],p[1]);X.lineTo(x,y+ch+18);X.stroke();X.fillStyle='#fff';X.shadowColor='#bff';X.shadowBlur=10;X.beginPath();X.arc(p[0],p[1],3.5,0,7);X.fill();X.shadowBlur=0;
  X.translate(x,y+ch);X.scale(e,e);X.translate(-x,-(y+ch));
  X.fillStyle='#0d2747';X.fillRect(x-cw/2,y,cw,ch+18);if(c.img)X.drawImage(c.img,40,60,160,100,x-cw/2+3,y+3,cw-6,ch-6);X.strokeStyle='#9fe8ff';X.lineWidth=1.6;X.strokeRect(x-cw/2,y,cw,ch+18);
  fitFont(name.toUpperCase(),800,10,7,cw-8);X.fillStyle='#ffe14d';X.textAlign='center';X.textBaseline='middle';X.fillText(name.toUpperCase(),x,y+ch+9);X.restore();RECTS.push([x-cw/2,y,x+cw/2,y+ch+18]);}
 function streetName(S,pts,name,a){const {pts:q}=pathOf(S,pts,1);if(q.length<2)return;X.save();X.globalAlpha=0.55*a;X.strokeStyle='#cfe4ff';X.lineWidth=3;X.lineCap='round';stroke(q);X.stroke();
  // đặt chữ ở đoạn dài nhất nằm trong khung
  let bi=-1,bl=0;for(let i=1;i<q.length;i++){const l=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);const m=[(q[i][0]+q[i-1][0])/2,(q[i][1]+q[i-1][1])/2];if(l>bl&&m[0]>60&&m[0]<W-60&&m[1]>220&&m[1]<H-150){bl=l;bi=i;}}
  if(bi<0){X.restore();return;}const A=q[bi-1],B=q[bi];let r=Math.atan2(B[1]-A[1],B[0]-A[0]);if(r>Math.PI/2)r-=Math.PI;if(r<-Math.PI/2)r+=Math.PI;
  X.globalAlpha=a;X.translate((A[0]+B[0])/2,(A[1]+B[1])/2);X.rotate(r);fitFont(name,900,16,9,Math.max(90,bl*1.4));X.textAlign='center';X.textBaseline='middle';X.lineWidth=3.5;X.strokeStyle='rgba(8,30,60,.85)';X.strokeText(name,0,-11);X.fillStyle='#fff';X.fillText(name,0,-11);X.restore();}
 function labelBox(p,t,a,τ){if(a<=0)return;const s=fitFont(t,800,11,8,190);const w=X.measureText(t).width+18,h=22;const x=keepIn(p[0],w),y=Math.max(230,p[1]-58);X.save();X.globalAlpha=clamp(a*2);
  X.strokeStyle='rgba(255,255,255,.85)';X.lineWidth=1.2;X.beginPath();X.moveTo(p[0],p[1]);X.lineTo(p[0],y+h);X.stroke();const ph=(τ*0.9)%1;X.strokeStyle=`rgba(160,240,255,${1-ph})`;X.beginPath();X.ellipse(p[0],p[1],3+10*ph,1.5+4*ph,0,0,7);X.stroke();X.fillStyle='#fff';X.beginPath();X.arc(p[0],p[1],2.6,0,7);X.fill();
  X.fillStyle='rgba(8,52,78,.92)';X.shadowColor='#43e4ff';X.shadowBlur=12;X.strokeStyle='#5ee9ff';X.lineWidth=1.5;X.beginPath();X.roundRect(x-w/2,y,w*ease(a),h,3);X.fill();X.stroke();X.shadowBlur=0;
  X.fillStyle='#fff';X.textAlign='center';X.textBaseline='middle';X.fillText(t,x,y+h/2+0.5);X.restore();RECTS.push([x-w/2,y,x+w/2,y+h]);}
 function plane(p,name,a){if(a<=0)return;X.save();X.globalAlpha=clamp(a*2);const s=1.6*back(a);X.translate(p[0],p[1]);X.rotate(-0.35);X.scale(s,s);X.fillStyle='#e9ff3b';X.strokeStyle='#4a5a00';X.lineWidth=0.8;
  X.beginPath();X.ellipse(0,0,22,3.6,0,0,7);X.fill();X.stroke();X.beginPath();X.moveTo(-3,0);X.lineTo(-9,-18);X.lineTo(-4,-18);X.lineTo(6,0);X.lineTo(-4,18);X.lineTo(-9,18);X.closePath();X.fill();X.stroke();
  X.beginPath();X.moveTo(-17,0);X.lineTo(-22,-7);X.lineTo(-19,-7);X.lineTo(-13,0);X.lineTo(-19,7);X.lineTo(-22,7);X.closePath();X.fill();X.restore();labelBox([p[0],p[1]-18],name.toUpperCase(),a,0);}
 // quy hoạch
 function glowPoly(S,rings,col,a,fill){if(a<=0)return;X.save();X.globalAlpha=ease(a);X.lineJoin='round';
  for(const r of rings){const q=r.map(v=>S(v[0],v[1]));stroke(q);X.closePath();if(fill){X.fillStyle=fill;X.fill();}X.shadowColor=col;X.shadowBlur=14;X.strokeStyle=col;X.lineWidth=3.2;X.stroke();X.shadowBlur=0;X.strokeStyle='rgba(255,255,255,.75)';X.lineWidth=1;X.stroke();}
  X.restore();}
 function polyName(S,rings,t,a,size){if(a<=0||!rings.length)return;const r=rings.reduce((m,x)=>x.length>m.length?x:m,rings[0]);let cx=0,cy=0;r.forEach(v=>{cx+=v[0];cy+=v[1];});const p=S(cx/r.length,cy/r.length);
  if(p[0]<0||p[0]>W||p[1]<0||p[1]>H)return;X.save();X.globalAlpha=a;const s=fitFont(t,800,size,8,W*0.6);X.textAlign='center';X.textBaseline='middle';X.lineWidth=3.5;X.strokeStyle='rgba(0,0,0,.55)';X.strokeText(t,p[0],p[1]);X.fillStyle='#fff';X.fillText(t,p[0],p[1]);X.restore();}
 function redDot(p,a,τ,label){if(a<=0)return;const e=back(a);X.save();X.globalAlpha=clamp(a*2);const ph=(τ*0.8)%1;X.strokeStyle=`rgba(255,255,255,${0.8*(1-ph)})`;X.lineWidth=2;X.beginPath();X.arc(p[0],p[1],12+16*ph,0,7);X.stroke();
  X.fillStyle='#fff';X.beginPath();X.arc(p[0],p[1],12*e,0,7);X.fill();X.fillStyle='#e8141b';X.beginPath();X.arc(p[0],p[1],7*e,0,7);X.fill();
  if(label&&a>0.5){const s=fitFont(label,700,17,10,220);const w=X.measureText(label).width;const x=keepIn(p[0],w),y=p[1]-24;X.textAlign='center';X.textBaseline='alphabetic';X.lineWidth=4;X.strokeStyle='rgba(150,0,0,.85)';X.lineJoin='round';X.strokeText(label,x,y);X.fillStyle='#fff';X.fillText(label,x,y);RECTS.push([x-w/2,y-s,x+w/2,y+3]);}
  X.restore();}
 function sector(S,c,rM,a,label){const p=S(c[0],c[1]),q=S(c[0]+rM,c[1]);const r=Math.hypot(q[0]-p[0],q[1]-p[1]);const a0=-2.3,sweep=Math.PI*1.75*ease(a);X.save();
  X.fillStyle='rgba(255,226,40,.30)';X.beginPath();X.moveTo(p[0],p[1]);X.arc(p[0],p[1],r,a0,a0+sweep);X.closePath();X.fill();X.strokeStyle='rgba(255,236,80,.95)';X.lineWidth=2.4;X.beginPath();X.arc(p[0],p[1],r,a0,a0+sweep);X.stroke();
  if(a>0.6&&label){X.globalAlpha=clamp((a-0.6)/0.3);const ang=a0+sweep*0.35;X.translate(p[0]+Math.cos(ang)*(r-16),p[1]+Math.sin(ang)*(r-16));X.rotate(ang+Math.PI/2);X.font=FONT(700,17);X.textAlign='center';X.textBaseline='middle';X.lineWidth=3.5;X.strokeStyle='rgba(0,0,0,.6)';X.strokeText(label,0,0);X.fillStyle='#fff';X.fillText(label,0,0);}
  X.restore();}
 function redLabel(p,t,a){if(a<=0)return;X.save();X.globalAlpha=clamp(a*2);const sc=back(a);pinShape(p[0],p[1],0.78*sc,'#ff4a4a','#b80000');
  const s=fitFont(t,800,11,8,200);const w=X.measureText(t).width+14,h=20;const x=keepIn(p[0],w);let y=p[1]-36*sc-h;for(let k=0;k<6&&RECTS.some(r=>r[0]<x+w/2&&r[2]>x-w/2&&r[1]<y+h&&r[3]>y);k++)y-=h+4;if(y<p[1]-36*sc-h){X.strokeStyle='rgba(255,255,255,.8)';X.beginPath();X.moveTo(p[0],p[1]-30*sc);X.lineTo(x,y+h);X.stroke();}X.fillStyle='#c4121a';X.strokeStyle='rgba(255,255,255,.85)';X.lineWidth=1;X.fillRect(x-w/2,y,w,h);X.strokeRect(x-w/2,y,w,h);
  X.fillStyle='#fff';X.textAlign='center';X.textBaseline='middle';X.fillText(t,x,y+h/2+0.5);X.restore();RECTS.push([x-w/2,y,x+w/2,y+h]);}
 function dashArrow(S,a0,b0,a,txt){const p=S(a0[0],a0[1]),q0=S(b0[0],b0[1]);const e=ease(a);const q=[lerp(p[0],q0[0],e),lerp(p[1],q0[1],e)];const ang=Math.atan2(q[1]-p[1],q[0]-p[0]);
  X.save();X.setLineDash([9,7]);X.strokeStyle='#fff';X.lineWidth=7;X.shadowColor='rgba(0,0,0,.6)';X.shadowBlur=6;X.beginPath();X.moveTo(p[0],p[1]);X.lineTo(q[0]-Math.cos(ang)*14,q[1]-Math.sin(ang)*14);X.stroke();X.setLineDash([]);
  X.fillStyle='#fff';X.beginPath();X.moveTo(q[0],q[1]);X.lineTo(q[0]-Math.cos(ang-0.5)*24,q[1]-Math.sin(ang-0.5)*24);X.lineTo(q[0]-Math.cos(ang+0.5)*24,q[1]-Math.sin(ang+0.5)*24);X.closePath();X.fill();X.shadowBlur=0;
  if(e>0.5){X.globalAlpha=clamp((e-0.5)/0.3);let r=ang;if(r>Math.PI/2)r-=Math.PI;if(r<-Math.PI/2)r+=Math.PI;X.translate((p[0]+q0[0])/2,(p[1]+q0[1])/2);X.rotate(r);X.font=FONT(800,22);X.textAlign='center';X.textBaseline='bottom';X.lineWidth=4;X.strokeStyle='rgba(0,0,0,.65)';X.strokeText(txt,0,-10);X.fillStyle='#ffe100';X.fillText(txt,0,-10);}
  X.restore();}
 function cyanRoad(S,pts,name,a){const {pts:q}=pathOf(S,pts,ease(a/0.8));if(q.length<2)return;X.save();X.lineCap='round';X.lineJoin='round';X.shadowColor='#3dfcff';X.shadowBlur=16;X.strokeStyle='rgba(80,250,255,.9)';X.lineWidth=6;stroke(q);X.stroke();X.shadowBlur=0;X.strokeStyle='#e6ffff';X.lineWidth=1.6;X.stroke();
  if(a>0.8&&name){const k=clamp((a-0.8)/0.2);const {pts:all}=pathOf(S,pts,1);let best=null;for(const v of all)if(v[0]>M+60&&v[0]<W-M-60&&v[1]>260&&v[1]<H-170){best=v;}
   if(best){X.globalAlpha=k;const s=fitFont(name,900,13,8,200);const w=X.measureText(name).width+16;const x=keepIn(best[0],w);X.fillStyle='#ffe100';X.fillRect(x-w/2,best[1]-26,w,20);X.fillStyle='#111';X.textAlign='center';X.textBaseline='middle';X.fillText(name,x,best[1]-15.5);RECTS.push([x-w/2,best[1]-26,x+w/2,best[1]-6]);}}
  X.restore();}
 function townMark(p,t,a){X.save();X.globalAlpha=a;X.fillStyle='#ffe100';X.strokeStyle='#5a4a00';X.beginPath();for(let i=0;i<10;i++){const r=i%2?5:12,an=-Math.PI/2+i*Math.PI/5;X.lineTo(p[0]+Math.cos(an)*r,p[1]+Math.sin(an)*r);}X.closePath();X.fill();X.stroke();
  const s=fitFont(t,800,17,10,260);const w=X.measureText(t).width;const x=keepIn(p[0]+w/2+16,w);X.textAlign='center';X.textBaseline='middle';X.lineWidth=4;X.strokeStyle='rgba(0,0,0,.6)';X.strokeText(t,x,p[1]+24);X.fillStyle='#ffe100';X.fillText(t,x,p[1]+24);X.restore();RECTS.push([x-w/2,p[1]+12,x+w/2,p[1]+36]);}

 function footer(){X.save();X.textAlign='center';X.textBaseline='middle';const ft=(style==='navy'?'Bản đồ: Esri':'Ảnh vệ tinh: Esri, Maxar')+' · © OpenStreetMap';fitFont(ft,500,9,7,W-2*M);X.fillStyle='rgba(255,255,255,.5)';X.fillText(ft,W/2,H-42);X.restore();}
 function render(ctx,t,rects){X=ctx;RECTS=rects||[];t=clamp(t,0,T-1e-3);const cam=camAt(t);const S=projOf(cam);
  X.fillStyle=style==='navy'?'#0f3764':'#0a0f1c';X.fillRect(0,0,W,H);
  if(style==='navy'){const tx=shots[0].t0+shots[0].dur*0.32,k=ease((t-(tx-1.2))/1.2);if(k<1)drawBase(cam,'sat',1);if(k>0)drawBase(cam,'dark',k);}
  else drawBase(cam,base,1);
  if(style==='navy'){X.fillStyle='rgba(5,20,45,.12)';X.fillRect(0,0,W,H);}
  for(const L of layers){if(t<L.t0)continue;const a=clamp((t-L.t0)/L.fin)*(L.t1<1e8?1-clamp((t-L.t1)/L.fout):1);if(a<=0)continue;L.fn(S,a,t-L.t0,cam);}
  footer();}
 function calibrate(){const c=document.createElement('canvas');c.width=W;c.height=H;const cx=c.getContext('2d');const t0=performance.now();for(let i=0;i<20;i++)render(cx,(i/20)*T);return {ms:+((performance.now()-t0)/20).toFixed(1),step:1};}
 const themes=[];if(near.length)themes.push({title:'Tiện ích gần',items:near.map(p=>({name:p.name,km:+p.km.toFixed(1)}))});if(far.length)themes.push({title:'Điểm kết nối',items:far.map(p=>({name:p.name,km:+p.km.toFixed(1)}))});
 return {T,themes,N:themes.length,PS:0,shots,styled:true,prefetch,calibrate,render,renderIntro:(c,t)=>render(c,t,[])};
}
window.MapStyles={gather,narration,ttsText,build};
})();
