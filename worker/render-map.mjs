// Agent Bản đồ hạ tầng — bản chạy trên máy chủ (phiên đám mây có mạng tới Esri, OSRM, Photon).
// Dùng:  node worker/render-map.mjs job.json out.mp4 meta.json
//   job.json  = {lat, lon, name, pois: [[loại, tên], ...]}
//   out.mp4   = đoạn video bản đồ 576×1024 30fps (mở đầu 2,6s + các cảnh chủ đề + toàn vùng)
//   meta.json = {themes, TI, T, N, SC, late, logs}
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesize, mixTrack, ttsAvailable } from "../server/tts.js";
import { findPlusCode, decodeFull, recoverNearest } from "./pluscode.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Playwright + Chromium cài sẵn trong máy chủ đám mây (nạp qua require để dùng bản toàn cục).
const { chromium } = createRequire(import.meta.url)("playwright");

// ---- Xác định vị trí: tọa độ có sẵn → link Google Maps (kể cả link rút gọn) → địa chỉ/tên (Photon, giới hạn Việt Nam) ----
export function coordsFrom(text) {
  const t = decodeURIComponent(String(text || ""));
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/];
  for (const re of pats) { const m = re.exec(t); if (m) { const lat = +m[1], lon = +m[2]; if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) return { lat, lon }; } }
  return null;
}
const curl = (args) => execFileSync("curl", ["-sS", "-m", "30", ...args]).toString();
// Ranh giới khu dự án (để khoanh vùng): extent của đối tượng OSM chứa điểm dự án, cỡ 60 m – 3 km.
const extentOk = (e, lat, lon) => {
  if (!Array.isArray(e) || e.length !== 4) return null;
  const [minLon, maxLat, maxLon, minLat] = e;
  if (!(lon >= minLon - 1e-4 && lon <= maxLon + 1e-4 && lat >= minLat - 1e-4 && lat <= maxLat + 1e-4)) return null;
  const w = (maxLon - minLon) * 111 * Math.cos(lat * Math.PI / 180), h = (maxLat - minLat) * 111, d = Math.hypot(w, h);
  return d >= 0.06 && d <= 3 ? [minLon, minLat, maxLon, maxLat] : null;
};
function findArea(lat, lon, feature) {
  const own = feature && extentOk(feature.properties?.extent, lat, lon);
  if (own) return own;
  try {
    const fs = JSON.parse(curl([`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=10&radius=0.3`])).features || [];
    const prefer = (f) => (/^(landuse|place|building|leisure|amenity|tourism)$/.test(f.properties?.osm_key) ? 0 : 1);
    for (const f of fs.sort((a, b) => prefer(a) - prefer(b))) { const b = extentOk(f.properties?.extent, lat, lon); if (b) return b; }
  } catch (e) { console.error("Không lấy được ranh giới:", e.message); }
  return null;
}
async function resolvePlace(job) {
  const p0 = await resolvePoint(job);
  p0.area = findArea(p0.lat, p0.lon, p0.feature);
  delete p0.feature;
  return p0;
}
async function resolvePoint(job) {
  if (Number.isFinite(+job.lat) && Number.isFinite(+job.lon) && job.lat !== null && job.lon !== null) return { lat: +job.lat, lon: +job.lon, how: "tọa độ" };
  let query = (job.query || "").trim();
  if (job.url) {
    let finalUrl = job.url;
    try { finalUrl = curl(["-L", "-o", "/dev/null", "-w", "%{url_effective}", "-A", "Mozilla/5.0", job.url]); } catch (e) { console.error("Không mở được link:", e.message); }
    const c = coordsFrom(finalUrl);
    if (c) return { ...c, how: "link Google Maps" };
    const m = /\/place\/([^/@?]+)/.exec(decodeURIComponent(finalUrl));
    if (m) query = m[1].replace(/\+/g, " ");
    if (!query) throw new Error("Link Google Maps không chứa vị trí. Hãy dán tọa độ hoặc địa chỉ.");
  }
  if (!query) throw new Error("Chưa có vị trí dự án.");
  const photon = (q) => JSON.parse(curl([`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&bbox=102.1,8.2,109.6,23.4`])).features?.[0];
  // Mã Plus Code của Google ("XQVM+WCM Cái Răng, Cần Thơ" hoặc "7P28XQVM+WCM"): giải mã ra tọa độ.
  const pc = findPlusCode(query);
  if (pc) {
    if (pc.full) return { ...decodeFull(pc.code), how: "Plus Code", label: query };
    const ref = pc.rest && photon(pc.rest);
    if (!ref) throw new Error(`Mã Plus Code "${pc.code}" cần kèm tên quận/tỉnh (ví dụ "${pc.code} Cái Răng, Cần Thơ"), hoặc dán tọa độ.`);
    const [rlon, rlat] = ref.geometry.coordinates;
    return { ...recoverNearest(pc.code, rlat, rlon), how: "Plus Code", label: pc.rest };
  }
  // Tìm theo tên/địa chỉ: chỉ nhận kết quả chứa đủ các từ đã nhập (tránh dựng nhầm chỗ, vd "Nam Long 2" ra cầu ở Thủ Đức).
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
  const words = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w && !/^(tp|thanh|pho|quan|huyen|phuong|xa|tinh|vn|du|an|khu|dan|cu|hcm|tphcm|hn|tp\.hcm)$/.test(w) || /^\d+$/.test(w));
  const hayOf = (f) => { const p = f.properties || {}; return " " + norm([p.name, p.street, p.district, p.city, p.county, p.state].join(" ")).replace(/[^a-z0-9]+/g, " ") + " "; };
  const has = (hay, ws) => ws.every((w) => hay.includes(" " + w + " "));
  const parts = query.split(",").map((x) => x.trim()).filter(Boolean);
  const headW = words(parts[0]).length ? words(parts[0]) : norm(parts[0]).split(/[^a-z0-9]+/).filter(Boolean);
  let f = null, first = null;
  // 1) Nominatim (OpenStreetMap): hiểu địa chỉ Việt Nam tốt hơn. Nhận kết quả có đủ từ của tên và địa chỉ đã nhập.
  const nomi = (q) => { try { return JSON.parse(curl(["-A", "bds-map-worker/1.0", `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&limit=5&q=${encodeURIComponent(q)}`])); } catch (e) { return []; } };
  for (const n of [...new Set([parts.length, 1])]) {
    const need = [...headW, ...words(parts.slice(1, n).join(" "))];
    const rs = nomi(parts.slice(0, n).join(", "));
    const nameOk = (x) => has(" " + norm(x.name || x.display_name.split(",")[0]).replace(/[^a-z0-9]+/g, " ") + " ", headW);
    const hit = rs.find((x) => nameOk(x) && has(" " + norm(x.display_name).replace(/[^a-z0-9]+/g, " ") + " ", need)) || (n > 1 ? rs.find(nameOk) : null);
    if (hit) { f = { geometry: { coordinates: [+hit.lon, +hit.lat] }, properties: { name: hit.name || hit.display_name.split(",")[0], street: hit.display_name.split(",").slice(1, 3).join(",").trim(), extent: hit.boundingbox ? [+hit.boundingbox[2], +hit.boundingbox[1], +hit.boundingbox[3], +hit.boundingbox[0]] : null } }; break; }
    execFileSync("sleep", ["1.1"]);
  }
  // 2) Photon dự phòng: thử đủ địa chỉ rồi bỏ dần phần cuối.
  for (let n = parts.length; n >= 1 && !f; n--) {
    const q = parts.slice(0, n).join(", ");
    const all = JSON.parse(curl([`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&bbox=102.1,8.2,109.6,23.4`])).features || [];
    first = first || all[0];
    const need = [...headW, ...words(parts.slice(1, n).join(" "))];
    const ok = all.filter((x) => has(hayOf(x), need));
    const byName = (x) => has(" " + norm(x.properties?.name).replace(/[^a-z0-9]+/g, " ") + " ", headW);
    f = ok.find(byName) || (n > 1 ? ok[0] : null);
  }
  if (!f) throw new Error(`Không tìm thấy chính xác "${query}" trên bản đồ${first ? ` (chỉ thấy chỗ gần giống: ${first.properties?.name || ""})` : ""}. Hãy nhập thêm địa chỉ (phường, quận, tỉnh), mã Plus Code, link Google Maps hoặc tọa độ.`);
  const p = f.properties || {};
  const label = [p.name, p.street, p.district || p.city, p.state].filter(Boolean).join(", ");
  return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], how: "tìm theo tên", label, feature: f };
}
const [jobFile, outFile, metaFile] = process.argv.slice(2);
if (!jobFile || !outFile || !metaFile) { console.error("Dùng: node worker/render-map.mjs job.json out.mp4 meta.json"); process.exit(2); }
const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
const place = await resolvePlace(job);
job.lat = place.lat; job.lon = place.lon; job.area = place.area ? { bbox: place.area } : null; job.label = place.label || "";
console.log(`Vị trí: ${place.lat}, ${place.lon} (${place.how}${place.label ? ": " + place.label : ""}) · khoanh vùng: ${place.area ? "theo ranh giới " + place.area.map((v) => v.toFixed(4)).join(",") : "vòng tròn 200 m"}`);

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  ...(proxy ? { proxy: { server: proxy } } : {}),
  args: ["--ignore-certificate-errors", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({ viewport: { width: 576, height: 1024 } });
  page.on("console", (m) => { if (m.text().startsWith("[map]")) console.log(m.text()); });
  // Photon/OSRM đi qua curl (trình duyệt sau proxy đôi khi rớt kết nối tới hai máy chủ này); ảnh vệ tinh tải thẳng trong trang.
  await page.route(/photon\.komoot\.io|router\.project-osrm\.org|nominatim\.openstreetmap\.org/, async (route) => {
    const u = route.request().url();
    for (let i = 0; i < 3; i++) {
      try {
        const body = execFileSync("curl", ["-sS", "-m", "40", "--fail", "-A", "QBK-BDS-Video/1.0 (map video renderer)", u]).toString();
        return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body });
      } catch { await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
    }
    return route.abort();
  });
  await page.goto("file://" + path.join(here, "render.html"));
  // Phong cách có lời đọc: lấy dữ liệu + câu đọc → đọc thành tiếng → cảnh dài theo lời
  let say = [], voice = null, durs = [];
  if (["navy", "quyhoach"].includes(job.style) && job.voice !== false) {
    const prep = await page.evaluate((j) => window.prepareJob(j), job);
    say = prep.say || [];
    if (say.length && (await ttsAvailable())) {
      const preset = job.style === "navy" ? "nu-nhanh" : "tram";
      voice = await synthesize(say.map((x) => x.tts || x.text), preset);
      say.forEach((x, i) => { if (x.shot >= 0) durs[x.shot] = (durs[x.shot] || 0) + voice[i].dur + 0.15; });
      console.log(`Lời đọc: ${say.length} câu, giọng ${preset}, ${voice.reduce((a, v) => a + v.dur, 0).toFixed(1)}s`);
    } else if (say.length) console.log("Không có Piper: dựng không lời (cài: pip install piper-tts).");
  }
  const res = await page.evaluate(([j, d]) => window.runJob(j, d), [job, durs]);
  const tmp = path.join(os.tmpdir(), `map-${Date.now()}.webm`);
  fs.writeFileSync(tmp, Buffer.from(res.webm, "base64"));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-fflags", "+genpts", "-i", tmp, "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", "-an", outFile]);
  fs.rmSync(tmp, { force: true });
  delete res.webm;
  if (voice) { // ghép lời đọc vào rãnh tiếng của video bản đồ; câu shot=-1 nói tiếp sau bản đồ (lúc app chiếu ảnh/flycam)
    const items = [], tail = []; const used = {};
    say.forEach((x, i) => {
      if (x.shot >= 0 && res.shots[x.shot]) { const t = res.shots[x.shot].t0 + 0.3 + (used[x.shot] || 0); used[x.shot] = (used[x.shot] || 0) + voice[i].dur + 0.15; items.push({ file: voice[i].file, t: (res.TI || 0) + t }); }
    });
    let tt = (res.TI || 0) + res.T + 0.4;
    say.forEach((x, i) => { if (x.shot < 0) { items.push({ file: voice[i].file, t: tt }); tail.push({ t: tt, dur: voice[i].dur, text: x.text }); tt += voice[i].dur + 0.35; } });
    const wav = outFile.replace(/\.mp4$/, "") + "-voice.wav", muxed = outFile + ".tmp.mp4";
    await mixTrack(items, wav);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", outFile, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", muxed]);
    fs.renameSync(muxed, outFile); fs.rmSync(wav, { force: true });
    res.voice = { say: say.map((x) => ({ shot: x.shot, text: x.text })), tail, end: tt, engine: voice.engine || "" };
  }
  res.place = place;
  fs.writeFileSync(metaFile, JSON.stringify(res, null, 1));
  console.log(`Xong: ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB), ${res.themes.length} cảnh, trễ ${res.late} khung`);
} finally {
  await browser.close();
}
