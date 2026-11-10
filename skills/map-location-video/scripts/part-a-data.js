// PHẦN A: dữ liệu. Điền CFG rồi chạy trong tab trình duyệt (javascript_tool, origin server.arcgisonline.com).
// project: tọa độ THẬT của dự án (mẫu dưới đây chỉ là điểm tạm trong phường Tam Bình).
// sty của từng địa điểm: 'gold' | 'blue' | 'ruby'. cat: 'Y TẾ' | 'MUA SẮM' | 'KẾT NỐI' (loại khác dùng icon mũi tên).
(async()=>{
const CFG={
 name:'HAPPY ONE ELITE',intro:['HAPPY ONE','ELITE'],subtitle:'Xung quanh có gì?',area:'TAM BÌNH · THỦ ĐỨC',
 tagline:'Kết nối y tế · mua sắm · giao thông',cta:'LIÊN HỆ NHẬN THÔNG TIN',note:'Số liệu và vị trí mang tính tham khảo',footer:'Video được làm bởi Claude Code',
 project:{lat:10.8705,lon:106.7380},
 pois:[
  {cat:'Y TẾ',name:'BV Hoàn Mỹ Thủ Đức',lat:10.887522,lon:106.7736156,sty:'ruby'},
  {cat:'MUA SẮM',name:'Chợ đầu mối Thủ Đức',lat:10.8699458,lon:106.7280509,sty:'gold'},
  {cat:'MUA SẮM',name:'Vincom Plaza Thủ Đức',lat:10.8498657,lon:106.7651765,sty:'gold'},
  {cat:'KẾT NỐI',name:'Sân bay Tân Sơn Nhất',lat:10.8179793,lon:106.6562645,sty:'blue'}]};
const pois=[];
for(const p of CFG.pois){
  const u=`https://router.project-osrm.org/route/v1/driving/${CFG.project.lon},${CFG.project.lat};${p.lon},${p.lat}?overview=full&geometries=geojson`;
  const j=await (await fetch(u)).json();const r=j.routes[0];
  pois.push({...p,coords:r.geometry.coordinates,km:r.distance/1000,min:r.duration/60});
}
window.CFG=CFG;window.D={P:CFG.project,pois};
return pois.map(p=>({n:p.name,km:+p.km.toFixed(1),min:Math.round(p.min),pts:p.coords.length}));
})()
