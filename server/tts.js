// Giọng đọc tiếng Việt: Gemini TTS (Kore / Charon) nếu có khóa, không thì Piper chạy ngay trên máy (giọng vi_VN vais1000).
// Hai kiểu giọng học từ video mẫu:
//   "nu-nhanh": giọng nữ, nhịp nhanh ~4 từ/giây, cao độ ~230 Hz (video "bản đồ xanh navy")
//   "tram":     giọng đều, chậm hơn ~3,9 từ/giây, trầm hơn ~175 Hz (video "quy hoạch lô đất")
// Cần: python3 + `pip install piper-tts`, ffmpeg. Mẫu giọng tự tải từ huggingface.co lần đầu.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const VOICE = "vi_VN-vais1000-medium";
const VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/";
export const VOICE_DIR = process.env.PIPER_VOICE_DIR || path.join(os.homedir(), ".cache", "qbk-piper");
export const PRESETS = {
  "nu-nhanh": { length: 1.12, pitch: 0.94, tempo: 0.88, gemini: "Kore", say: "Đọc bằng giọng nữ thuyết minh bất động sản, nhanh, rõ ràng, hào hứng", label: "Nữ, nhanh, rõ (giống video bản đồ xanh navy)" },
  "tram": { length: 1.2, pitch: 0.82, tempo: 0.88, gemini: "Charon", say: "Đọc bằng giọng thuyết minh đều đặn, chậm rãi, trầm ấm, rõ từng chữ", label: "Đều, chậm, trầm (giống video quy hoạch lô đất)" },
};
// Gemini TTS: dùng trước nếu gọi được (khóa nằm ở biến GEMINI_API_KEY, hoặc proxy của môi trường đám mây tự gắn khóa).
// Gọi lỗi (không có khóa, hết hạn mức, mạng chặn) thì cả video dùng Piper, không bao giờ ra video câm.
const GEMINI_MODELS = (process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts,gemini-2.5-flash-tts").split(",");
let geminiOff = process.env.QBK_TTS === "piper";
async function geminiOne(text, pr, out) {
  const body = JSON.stringify({ contents: [{ parts: [{ text: `${pr.say}: ${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: pr.gemini } } } } });
  const bodyFile = out + ".json"; fs.writeFileSync(bodyFile, body);
  let lastErr;
  for (const model of GEMINI_MODELS) {
    const respFile = out + ".resp";
    const { stdout } = await run("curl", ["-sS", "-m", "90", "-o", respFile, "-w", "%{http_code}", "-H", "Content-Type: application/json",
      "-H", `x-goog-api-key: ${process.env.GEMINI_API_KEY || "proxy-injected"}`, "-d", "@" + bodyFile,
      `https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`]).catch((e) => ({ stdout: "000:" + e.message }));
    const code = String(stdout).slice(0, 3);
    if (code === "404") { lastErr = new Error(`model ${model} không có`); continue; } // thử model khác, không tốn hạn mức
    if (code !== "200") { let m = ""; try { m = JSON.parse(fs.readFileSync(respFile, "utf8")).error?.message || ""; } catch {} throw new Error(`Gemini HTTP ${code} ${m}`.slice(0, 200)); }
    const j = JSON.parse(fs.readFileSync(respFile, "utf8"));
    const data = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData)?.inlineData?.data;
    if (!data) throw new Error("Gemini không trả về âm thanh");
    fs.writeFileSync(out + ".pcm", Buffer.from(data, "base64"));
    await run("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", out + ".pcm", "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", out]);
    return;
  }
  throw lastErr || new Error("Gemini lỗi");
}

let ready = null;
export function ttsAvailable() {
  if (!ready) ready = (async () => {
    try { await run("python3", ["-c", "import piper"]); await run("ffmpeg", ["-version"]); return true; } catch { return false; }
  })();
  return ready;
}
async function modelPath() {
  const onnx = path.join(VOICE_DIR, VOICE + ".onnx");
  if (fs.existsSync(onnx) && fs.existsSync(onnx + ".json")) return onnx;
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  for (const f of [VOICE + ".onnx", VOICE + ".onnx.json"]) {
    const r = await fetch(VOICE_URL + f);
    if (!r.ok) throw new Error(`Không tải được mẫu giọng (${r.status}). Cần mạng tới huggingface.co.`);
    fs.writeFileSync(path.join(VOICE_DIR, f + ".part"), Buffer.from(await r.arrayBuffer()));
    fs.renameSync(path.join(VOICE_DIR, f + ".part"), path.join(VOICE_DIR, f));
  }
  return onnx;
}
function piper(model, text, out, length) {
  return new Promise((res, rej) => {
    const p = spawn("python3", ["-m", "piper", "-m", model, "-f", out, "--length-scale", String(length)], { stdio: ["pipe", "ignore", "pipe"] });
    let err = ""; p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 && fs.existsSync(out) ? res() : rej(new Error("Piper lỗi: " + err.slice(-300)))));
    p.stdin.end(text);
  });
}
async function duration(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return +stdout.trim() || 0;
}
// Đọc từng câu → [{file (wav 24 kHz mono), dur}]
export async function synthesize(texts, presetId = "nu-nhanh", dir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-"))) {
  const pr = PRESETS[presetId] || PRESETS["nu-nhanh"];
  if (!geminiOff) {
    try {
      const out = [];
      for (let i = 0; i < texts.length; i++) { const f = path.join(dir, `gem-${i}.wav`); await geminiOne(texts[i], pr, f); out.push({ file: f, dur: await duration(f) }); }
      out.engine = "gemini:" + pr.gemini; console.log(`Giọng đọc: Gemini ${pr.gemini}`);
      return out;
    } catch (e) { console.log(`Gemini chưa đọc được (${e.message}), dùng giọng Piper.`); if (/HTTP 000|HTTP 40[13]/.test(e.message)) geminiOff = true; }
  }
  const model = await modelPath();
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    const raw = path.join(dir, `raw-${i}.wav`), fin = path.join(dir, `say-${i}.wav`);
    await piper(model, texts[i], raw, pr.length);
    // hạ cao độ mà giữ tốc độ: đổi tần số mẫu rồi kéo lại nhịp
    const tp = (pr.tempo || 1) / pr.pitch; // atempo chỉ nhận 0.5–2
    const af = `asetrate=22050*${pr.pitch},aresample=24000,atempo=${tp.toFixed(4)},`;
    await run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af", af + "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "24000", fin]);
    out.push({ file: fin, dur: await duration(fin) });
  }
  out.engine = "piper";
  return out;
}
// Ghép các câu thành một rãnh tiếng theo mốc thời gian [{file, t}] → wav
export async function mixTrack(items, outFile) {
  if (!items.length) return null;
  const args = ["-y", "-v", "error"];
  items.forEach((it) => args.push("-i", it.file));
  const f = items.map((it, i) => `[${i}]adelay=${Math.round(it.t * 1000)}|${Math.round(it.t * 1000)}[a${i}]`).join(";");
  args.push("-filter_complex", `${f};${items.map((_, i) => `[a${i}]`).join("")}amix=inputs=${items.length}:normalize=0:dropout_transition=0[o]`, "-map", "[o]", "-ac", "1", "-ar", "24000", outFile);
  await run("ffmpeg", args);
  return outFile;
}
