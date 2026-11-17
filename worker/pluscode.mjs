// Giải mã Plus Code (Open Location Code) của Google: mã đầy đủ "7P28XQVM+WCM" hoặc mã rút gọn "XQVM+WCM" kèm địa danh.
const A = "23456789CFGHJMPQRVWX";
const RES = [20, 1, 0.05, 0.0025, 0.000125];
// Tìm mã Plus Code trong chuỗi; trả về {code, rest} (rest = phần địa danh còn lại) hoặc null.
export function findPlusCode(text) {
  const m = /(?:^|[\s,;(])([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})(?=$|[\s,;)])/i.exec(String(text || ""));
  if (!m) return null;
  const code = m[1].toUpperCase();
  const plus = code.indexOf("+");
  if (plus % 2 !== 0 || plus > 8 || code.length - plus - 1 === 1) return null;
  const rest = String(text).replace(m[1], " ").replace(/^[\s,;]+|[\s,;]+$/g, "").replace(/\s{2,}/g, " ");
  return { code, rest, full: plus === 8 };
}
// Giải mã mã đầy đủ (8 ký tự trước dấu +), trả về tâm ô.
export function decodeFull(code) {
  const c = code.replace("+", "").replace(/0+$/, "");
  let lat = -90, lon = -180, h = 0, w = 0;
  for (let i = 0; i < Math.min(c.length, 10); i += 2) {
    const r = RES[i / 2];
    lat += A.indexOf(c[i]) * r; h = r;
    if (i + 1 < c.length) { lon += A.indexOf(c[i + 1]) * r; w = r; } else w = r;
  }
  for (let i = 10; i < c.length; i++) {
    h /= 5; w /= 4;
    const d = A.indexOf(c[i]);
    lat += Math.floor(d / 4) * h; lon += (d % 4) * w;
  }
  return { lat: lat + h / 2, lon: lon + w / 2 };
}
function encodePrefix(lat, lon, n) {
  let la = Math.min(Math.max(lat, -90), 89.9999999) + 90, lo = ((lon + 180) % 360 + 360) % 360;
  let s = "";
  for (let i = 0; s.length < n; i++) {
    const r = RES[i];
    const dl = Math.floor(la / r), dn = Math.floor(lo / r);
    la -= dl * r; lo -= dn * r;
    s += A[dl] + A[dn];
  }
  return s.slice(0, n);
}
// Khôi phục mã rút gọn từ điểm tham chiếu gần đó (theo thuật toán recoverNearest của Google).
export function recoverNearest(short, refLat, refLon) {
  const pad = 8 - short.indexOf("+");
  if (pad <= 0) return decodeFull(short);
  const res = Math.pow(20, 2 - pad / 2), half = res / 2;
  const p = decodeFull(encodePrefix(refLat, refLon, pad) + short);
  if (refLat + half < p.lat && p.lat - res >= -90) p.lat -= res;
  else if (refLat - half > p.lat && p.lat + res <= 90) p.lat += res;
  if (refLon + half < p.lon) p.lon -= res;
  else if (refLon - half > p.lon) p.lon += res;
  return p;
}
