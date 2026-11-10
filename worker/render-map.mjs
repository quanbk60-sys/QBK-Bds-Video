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
async function resolvePlace(job) {
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
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&bbox=102.1,8.2,109.6,23.4`;
  const f = JSON.parse(curl([u])).features?.[0];
  if (!f) throw new Error(`Không tìm thấy "${query}" trên bản đồ. Hãy dán tọa độ hoặc link Google Maps.`);
  const p = f.properties || {};
  const label = [p.name, p.street, p.district || p.city, p.state].filter(Boolean).join(", ");
  return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], how: "tìm theo tên", label };
}
const [jobFile, outFile, metaFile] = process.argv.slice(2);
if (!jobFile || !outFile || !metaFile) { console.error("Dùng: node worker/render-map.mjs job.json out.mp4 meta.json"); process.exit(2); }
const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
const place = await resolvePlace(job);
job.lat = place.lat; job.lon = place.lon;
console.log(`Vị trí: ${place.lat}, ${place.lon} (${place.how}${place.label ? ": " + place.label : ""})`);

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  ...(proxy ? { proxy: { server: proxy } } : {}),
  args: ["--ignore-certificate-errors", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({ viewport: { width: 576, height: 1024 } });
  page.on("console", (m) => { if (m.text().startsWith("[map]")) console.log(m.text()); });
  // Photon/OSRM đi qua curl (trình duyệt sau proxy đôi khi rớt kết nối tới hai máy chủ này); ảnh vệ tinh tải thẳng trong trang.
  await page.route(/photon\.komoot\.io|router\.project-osrm\.org/, async (route) => {
    const u = route.request().url();
    for (let i = 0; i < 3; i++) {
      try {
        const body = execFileSync("curl", ["-sS", "-m", "40", "--fail", u]).toString();
        return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body });
      } catch { await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
    }
    return route.abort();
  });
  await page.goto("file://" + path.join(here, "render.html"));
  const res = await page.evaluate((j) => window.runJob(j), job);
  const tmp = path.join(os.tmpdir(), `map-${Date.now()}.webm`);
  fs.writeFileSync(tmp, Buffer.from(res.webm, "base64"));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-fflags", "+genpts", "-i", tmp, "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", "-an", outFile]);
  fs.rmSync(tmp, { force: true });
  delete res.webm;
  res.place = place;
  fs.writeFileSync(metaFile, JSON.stringify(res, null, 1));
  console.log(`Xong: ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB), ${res.themes.length} cảnh, trễ ${res.late} khung`);
} finally {
  await browser.close();
}
