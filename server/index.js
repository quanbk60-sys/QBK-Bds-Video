// Máy chủ QBK BĐS Video: phục vụ giao diện (app/) + API cho các agent và xuất MP4.
import express from "express";
import multer from "multer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgents, AgentError, MODEL, hasClaudeCredentials } from "./agents.js";
import { hasFfmpeg, toMp4, RESOLUTIONS } from "./export.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(here, "..", "app");

export function createApp({ agents = createAgents(), claudeAvailable } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "40mb" }));
  app.use(express.static(APP_DIR, { extensions: ["html"] }));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qbk-"));
  const upload = multer({
    dest: tmpRoot,
    limits: { fileSize: 600 * 1024 * 1024, files: 2 },
    fileFilter: (req, file, cb) => {
      const ok = file.fieldname === "video" ? /^video\//.test(file.mimetype) : file.fieldname === "music" ? /^audio\/|^video\//.test(file.mimetype) : false;
      cb(ok ? null : new AgentError(`File "${file.originalname}" không đúng loại.`, 400), ok);
    },
  });

  let ffmpegOk = null;
  const claudeOk = () => (claudeAvailable ?? (hasClaudeCredentials() || fs.existsSync(path.join(os.homedir(), ".config", "anthropic"))));

  app.get("/api/health", async (req, res) => {
    if (ffmpegOk === null) ffmpegOk = await hasFfmpeg();
    res.json({ ok: true, claude: claudeOk(), model: MODEL, ffmpeg: ffmpegOk, resolutions: Object.keys(RESOLUTIONS) });
  });

  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req.body || {})); }
    catch (e) {
      const status = e instanceof AgentError ? e.status : 500;
      if (status >= 500 && status !== 503) console.error("[agent]", e);
      res.status(status).json({ error: e.message || String(e) });
    }
  };
  app.post("/api/agents/media", wrap((b) => agents.analyzeMedia(b)));
  app.post("/api/agents/script", wrap((b) => agents.writeScript(b)));
  app.post("/api/agents/qa", wrap((b) => agents.reviewFrames(b)));

  app.post("/api/export", upload.fields([{ name: "video", maxCount: 1 }, { name: "music", maxCount: 1 }]), async (req, res) => {
    const video = req.files?.video?.[0], music = req.files?.music?.[0];
    const cleanup = () => [video, music].forEach((f) => f && fs.rm(f.path, { force: true }, () => {}));
    const out = path.join(tmpRoot, `out-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    try {
      if (!video) throw new AgentError("Thiếu file video.", 400);
      const resKey = String(req.body.res || "1080");
      if (!RESOLUTIONS[resKey]) throw new AgentError("Độ phân giải không hỗ trợ.", 400);
      const info = await toMp4({ input: video.path, output: out, res: resKey, music: music?.path, musicVolume: req.body.volume });
      const name = (String(req.body.name || "video-bds").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "video-bds") + ".mp4";
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.setHeader("X-Video-Info", JSON.stringify(info));
      const stream = fs.createReadStream(out);
      stream.pipe(res);
      stream.on("close", () => { fs.rm(out, { force: true }, () => {}); cleanup(); });
    } catch (e) {
      cleanup(); fs.rm(out, { force: true }, () => {});
      const status = e instanceof AgentError ? e.status : 500;
      if (status >= 500) console.error("[export]", e);
      res.status(status).json({ error: e.message || String(e) });
    }
  });

  app.use((err, req, res, next) => {
    const status = err instanceof AgentError ? err.status : err?.code === "LIMIT_FILE_SIZE" ? 413 : 500;
    res.status(status).json({ error: err.message || String(err) });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () => {
    console.log(`QBK BĐS Video đang chạy: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    if (!hasClaudeCredentials()) console.log("Lưu ý: chưa có ANTHROPIC_API_KEY — các agent AI sẽ dùng mẫu có sẵn.");
  });
}
