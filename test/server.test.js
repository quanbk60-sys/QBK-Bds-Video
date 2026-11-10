import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createAgents } from "../server/agents.js";

// Client giả thay cho Claude: ghi lại tham số gửi đi và trả JSON đúng khuôn.
const calls = [];
const fakeClient = {
  beta: { messages: { parse: async (params) => {
    calls.push(params);
    const text = params.messages[0].content.map((c) => c.text || "").join("\n");
    if (/agent Phân tích media/.test(params.system)) {
      const ids = [...text.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      return { stop_reason: "end_turn", parsed_output: {
        items: ids.map((id, i) => ({ id, kind: i ? "interior" : "drone", style: i ? "top" : "drone", quality: 8, summary: "Ảnh " + id, caption_idea: "Cảnh *đẹp*" })),
        order: [...ids].reverse().concat(["khong-ton-tai"]), notes: "" } };
    }
    if (/agent Biên kịch/.test(params.system)) {
      return { stop_reason: "end_turn", parsed_output: { hook: "Căn này có gì *hot*?", lines: ["Dòng *một*"], tagline: "Sở hữu *ngay*", cta: "liên hệ ngay" } };
    }
    if (/Kiểm duyệt/.test(params.system)) return { stop_reason: "end_turn", parsed_output: { ok: true, issues: [] } };
    return { stop_reason: "refusal", parsed_output: null };
  } } },
};

let server, base, tmp;
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qbk-test-"));
  const app = createApp({ agents: createAgents({ client: fakeClient }), claudeAvailable: true });
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("health báo Claude và FFmpeg", async () => {
  const j = await (await fetch(base + "/api/health")).json();
  assert.equal(j.claude, true);
  assert.equal(j.ffmpeg, true);
  assert.equal(j.model, "claude-opus-5-5");
});

test("phục vụ giao diện app", async () => {
  const html = await (await fetch(base + "/")).text();
  assert.match(html, /QBK <b>BĐS<\/b> Video/);
  assert.equal((await fetch(base + "/map-engine.js")).status, 200);
});

test("agent Phân tích media: gửi ảnh, đủ id, thứ tự hợp lệ", async () => {
  calls.length = 0;
  const r = await post("/api/agents/media", { project: { name: "X" }, items: [{ id: "1", type: "image", w: 10, h: 10, thumb: png }, { id: "2", type: "video", w: 10, h: 10, dur: 3, thumb: png }] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.order, ["2", "1"]);
  assert.equal(j.items[0].style, "drone");
  const p = calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.output_config.effort, "medium");
  assert.ok(p.output_config.format, "có structured output");
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.messages[0].content.filter((c) => c.type === "image").length, 2);
});

test("agent Phân tích media: từ chối ảnh không hợp lệ", async () => {
  const r = await post("/api/agents/media", { items: [{ id: "1", type: "image", w: 1, h: 1, thumb: "http://x/y.png" }] });
  assert.equal(r.status, 400);
});

test("agent Biên kịch: đủ số dòng, CTA in hoa", async () => {
  const r = await post("/api/agents/script", { project: { name: "X" }, tone: "tt", scenes: [{ kind: "drone" }, { kind: "interior" }, {}] });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.lines.length, 3);
  assert.equal(j.cta, "LIÊN HỆ NGAY");
  assert.equal(j.tagline, "Sở hữu ngay");
});

test("agent Kiểm duyệt", async () => {
  const r = await post("/api/agents/qa", { frames: [{ t: 1, image: png }], duration: 10 });
  assert.deepEqual(await r.json(), { ok: true, issues: [] });
});

test("xuất MP4 1080×1920 có nhạc nền", async () => {
  const webm = path.join(tmp, "in.webm"), mp3 = path.join(tmp, "m.mp3");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=576x1024:r=30:d=3", "-c:v", "libvpx", "-b:v", "1M", webm]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=1", mp3]);
  const fd = new FormData();
  fd.append("video", new Blob([fs.readFileSync(webm)], { type: "video/webm" }), "in.webm");
  fd.append("music", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), "m.mp3");
  fd.append("res", "1080"); fd.append("name", "Dự án Thử");
  const r = await fetch(base + "/api/export", { method: "POST", body: fd });
  assert.equal(r.status, 200, await r.clone().text().catch(() => ""));
  assert.match(r.headers.get("content-disposition"), /du%CC%9B%CC%A3|d%E1%BB%B1/i);
  const out = path.join(tmp, "out.mp4");
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", out]).toString());
  const v = info.streams.find((s) => s.codec_type === "video"), a = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(v.codec_name, "h264"); assert.equal(v.width, 1080); assert.equal(v.height, 1920);
  assert.equal(a.codec_name, "aac");
  assert.ok(Math.abs(parseFloat(info.format.duration) - 3) < 0.4, "nhạc lặp và cắt theo độ dài video");
});

test("xuất MP4: thiếu video thì báo lỗi 400", async () => {
  const r = await fetch(base + "/api/export", { method: "POST", body: new FormData() });
  assert.equal(r.status, 400);
});
