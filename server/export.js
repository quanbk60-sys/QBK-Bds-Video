// Agent Dựng hình & xuất — phần máy chủ: chuyển WebM ghi trong trình duyệt sang MP4 H.264,
// phóng lên 1080×1920 và ghép nhạc nền (tùy chọn) bằng FFmpeg.
import { spawn } from "node:child_process";

export const RESOLUTIONS = { "1080": [1080, 1920], "720": [720, 1280], "576": [576, 1024] };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} thoát mã ${code}: ${err.slice(-800)}`))));
  });
}

export async function hasFfmpeg() {
  try { await run("ffmpeg", ["-version"]); return true; } catch { return false; }
}

export async function probeDuration(file) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const d = parseFloat(out);
  return Number.isFinite(d) ? d : 0;
}

// WebM từ MediaRecorder thường không ghi duration trong header → đo bằng cách đọc hết gói.
async function measureDuration(file) {
  let d = await probeDuration(file).catch(() => 0);
  if (d > 0) return d;
  const out = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", file]).catch(() => "");
  const ts = out.split("\n").map(parseFloat).filter(Number.isFinite);
  return ts.length ? Math.max(...ts) : 0;
}

export async function toMp4({ input, output, res = "1080", music = null, musicVolume = 0.8 }) {
  const size = RESOLUTIONS[res];
  if (!size) throw new Error("Độ phân giải không hỗ trợ: " + res);
  const [w, h] = size;
  const dur = await measureDuration(input);
  const args = ["-y", "-v", "error", "-fflags", "+genpts", "-i", input];
  if (music) args.push("-stream_loop", "-1", "-i", music);
  const vf = `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;
  args.push("-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-movflags", "+faststart");
  if (music) {
    const vol = Math.max(0, Math.min(1.5, Number(musicVolume) || 0.8));
    const fadeStart = Math.max(0, dur - 1.5);
    args.push("-map", "0:v:0", "-map", "1:a:0",
      "-af", `volume=${vol},afade=t=in:d=0.6${dur ? `,afade=t=out:st=${fadeStart.toFixed(2)}:d=1.5` : ""}`,
      "-c:a", "aac", "-b:a", "192k", "-shortest");
    if (dur) args.push("-t", dur.toFixed(2));
  } else {
    // giữ âm thanh có sẵn (nhạc nền đã trộn trong trình duyệt), nếu có
    args.push("-map", "0:v:0", "-map", "0:a?", "-c:a", "aac", "-b:a", "192k");
  }
  args.push(output);
  await run("ffmpeg", args);
  return { duration: dur, width: w, height: h };
}
