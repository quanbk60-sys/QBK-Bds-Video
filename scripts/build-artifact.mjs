// Tạo bản đăng lên claude.ai (Artifact): bỏ khung <html>/<head>/<body> (nền tảng tự bọc),
// giữ <title>, <style> ở đầu, thêm thẻ meta của claude.ai. Kết quả: dist/artifact/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
const head = src.slice(src.indexOf("<head>") + 6, src.indexOf("</head>"));
const body = src.slice(src.indexOf("<body>") + 6, src.lastIndexOf("</body>"));
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const styles = [...(head.match(/<link rel="stylesheet"[^>]*>/g) || []), ...head.match(/<style>[\s\S]*?<\/style>/g)].join("\n");
const out = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${styles}\n${body.trim()}\n`;
const dir = path.join(root, "dist/artifact");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "index.html"), out);
fs.copyFileSync(path.join(root, "app/map-engine.js"), path.join(dir, "map-engine.js"));
fs.copyFileSync(path.join(root, "app/map-styles.js"), path.join(dir, "map-styles.js"));
fs.mkdirSync(path.join(dir, "previews"), { recursive: true });
for (const f of fs.readdirSync(path.join(root, "app/previews"))) fs.copyFileSync(path.join(root, "app/previews", f), path.join(dir, "previews", f));
console.log("dist/artifact/index.html", out.length, "bytes");
