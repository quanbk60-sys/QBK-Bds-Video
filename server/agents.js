// Các agent dùng Claude: Phân tích media (đọc ảnh), Biên kịch, Kiểm duyệt (xem khung hình).
// Mỗi agent là MỘT lệnh gọi Claude có đầu ra JSON theo khuôn (structured outputs) — không cần vòng lặp tool.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = process.env.QBK_MODEL || "claude-opus-5-5";

export class AgentError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

const RULES = `Quy tắc chung:
- Viết tiếng Việt có dấu, tự nhiên, kiểu video ngắn TikTok/Reels cho bất động sản.
- KHÔNG bịa số liệu: giá, diện tích, khoảng cách, pháp lý, tên tiện ích chỉ dùng khi có trong dữ liệu được cung cấp.
- Không nhắc tên thương hiệu, kênh, watermark nhìn thấy trong ảnh mẫu của người khác.`;

const dataUrlToImage = (url) => {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url || "");
  if (!m) throw new AgentError("Ảnh thu nhỏ không hợp lệ (cần data URL JPEG/PNG/WebP).", 400);
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
};

// ---------- khuôn đầu ra ----------
const MediaOut = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["satellite_top", "drone", "render", "interior", "amenity", "street", "legal", "other"]),
      style: z.enum(["top", "drone"]),
      quality: z.number().int().min(1).max(10),
      summary: z.string(),
      caption_idea: z.string(),
    })
  ),
  order: z.array(z.string()),
  notes: z.string(),
});

const ScriptOut = z.object({
  hook: z.string(),
  lines: z.array(z.string()),
  tagline: z.string(),
  cta: z.string(),
});

const QaOut = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      time: z.number(),
      severity: z.enum(["high", "medium", "low"]),
      problem: z.string(),
      fix: z.string(),
    })
  ),
});

export function createAgents({ client } = {}) {
  let anthropic = client || null;
  const getClient = () => {
    if (!anthropic) anthropic = new Anthropic();
    return anthropic;
  };

  async function ask({ system, content, schema, effort, maxTokens = 16000 }) {
    let res;
    try {
      res = await getClient().beta.messages.parse({
        model: MODEL,
        max_tokens: maxTokens,
        // Claude Opus 5.5 luôn bật thinking; effort mặc định là medium nên đặt rõ.
        output_config: { effort, format: betaZodOutputFormat(schema) },
        // Nếu bị bộ lọc an toàn từ chối, máy chủ tự chạy lại bằng model dự phòng.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AgentError("Chưa cấu hình khóa Claude API hợp lệ (ANTHROPIC_API_KEY).", 503);
      if (e instanceof Anthropic.RateLimitError) throw new AgentError("Claude đang giới hạn tốc độ, thử lại sau ít phút.", 429);
      if (e instanceof Anthropic.BadRequestError) throw new AgentError("Yêu cầu gửi Claude không hợp lệ: " + e.message, 400);
      if (e instanceof Anthropic.APIError) throw new AgentError(`Claude API lỗi ${e.status ?? ""}: ${e.message}`, 502);
      if (e instanceof Error && /credential|api key|apiKey|authToken/i.test(e.message)) throw new AgentError("Chưa cấu hình khóa Claude API (ANTHROPIC_API_KEY).", 503);
      throw e;
    }
    if (res.stop_reason === "refusal") throw new AgentError("Claude từ chối yêu cầu này.", 422);
    if (res.stop_reason === "max_tokens") throw new AgentError("Câu trả lời của Claude bị cắt ngắn.", 502);
    const out = res.parsed_output;
    if (!out) throw new AgentError("Không đọc được JSON trả về từ Claude.", 502);
    return out;
  }

  // Agent 2 — Phân tích media
  async function analyzeMedia({ project = {}, items = [] }) {
    if (!Array.isArray(items) || !items.length) throw new AgentError("Không có ảnh nào để phân tích.", 400);
    if (items.length > 20) throw new AgentError("Tối đa 20 ảnh mỗi lần phân tích.", 400);
    const content = [];
    items.forEach((it, i) => {
      content.push({ type: "text", text: `Media #${i + 1} — id="${String(it.id)}", loại file: ${it.type === "video" ? "video (khung hình đại diện)" : "ảnh"}, ${it.w}×${it.h}${it.dur ? `, dài ${Number(it.dur).toFixed(1)}s` : ""}` });
      content.push(dataUrlToImage(it.thumb));
    });
    content.push({
      type: "text",
      text: `Dự án: ${project.name || "(chưa đặt tên)"}${project.area ? " · " + project.area : ""}.
Phân loại từng media và đề xuất thứ tự dựng video dọc 9:16.
- kind: satellite_top (ảnh vệ tinh/bản đồ nhìn thẳng), drone (ảnh/clip flycam nhìn nghiêng), render (phối cảnh 3D), interior (nội thất), amenity (tiện ích: hồ bơi, công viên...), street (đường phố, mặt tiền), legal (giấy tờ), other.
- style: "top" nếu ảnh nhìn thẳng từ trên xuống, "drone" nếu nhìn nghiêng có phối cảnh/đường chân trời. Ảnh khác chọn theo góc nhìn gần nhất.
- quality 1–10: độ nét, bố cục, phù hợp làm cảnh video.
- summary: 1 câu mô tả ngắn thứ nhìn thấy. caption_idea: 1 câu chữ trên cảnh, tối đa 40 ký tự, đặt từ khóa trong *dấu sao*.
- order: toàn bộ id theo thứ tự nên dựng (thường: toàn cảnh/flycam → phối cảnh → tiện ích → nội thất → pháp lý; ảnh mờ xuống cuối).
- notes: lưu ý cho người dùng (ảnh mờ, ảnh trùng, ảnh có watermark của người khác...). Để trống nếu không có.
Giữ nguyên id đúng như đã cho.`,
    });
    const out = await ask({
      system: "Bạn là agent Phân tích media trong đội làm video bất động sản.\n" + RULES,
      content,
      schema: MediaOut,
      effort: "medium",
    });
    // chỉ giữ id hợp lệ, đủ mọi id
    const ids = items.map((it) => String(it.id));
    out.items = out.items.filter((x) => ids.includes(x.id));
    const order = out.order.filter((id, i, a) => ids.includes(id) && a.indexOf(id) === i);
    ids.forEach((id) => { if (!order.includes(id)) order.push(id); });
    out.order = order;
    return out;
  }

  // Agent 3 — Biên kịch
  async function writeScript({ project = {}, tone = "sang", userScript = "", scenes = [], mapThemes = [] }) {
    const n = Math.max(0, Math.min(30, scenes.length));
    const TONE = { sang: "sang trọng, tinh tế", dt: "đầu tư, nhấn tiềm năng và hạ tầng", gd: "ấm áp cho gia đình", tt: "TikTok bắt trend, câu hỏi gây tò mò" };
    const facts = [
      `Tên dự án: ${project.name || "(chưa có)"}`,
      project.area && `Khu vực: ${project.area}`,
      project.cta && `Câu kêu gọi người dùng muốn: ${project.cta}`,
      project.note && `Ghi chú/hotline: ${project.note}`,
      mapThemes.length && `Video có cảnh bản đồ hạ tầng: ${mapThemes.map((t) => `${t.title} (${(t.items || []).map((p) => `${p.name} ${p.km ? Number(p.km).toFixed(1) + " km" : ""}`).join(", ")})`).join("; ")}`,
    ].filter(Boolean).join("\n");
    const sceneList = scenes.slice(0, n).map((s, i) => `Cảnh ${i + 1}: ${s.summary || s.kind || "ảnh"}${s.caption_idea ? ` (gợi ý: ${s.caption_idea})` : ""}`).join("\n");
    const task = userScript.trim()
      ? `Người dùng đã có kịch bản dưới đây. CHỈ chuẩn hóa: sửa chính tả, rút gọn nếu quá dài, đặt 1–3 từ khóa trong *dấu sao*. Giữ nguyên ý và thứ tự, không thêm thông tin mới. Trả lines đúng ${n} dòng (nếu kịch bản ít dòng hơn thì lặp lại hợp lý; nhiều hơn thì gộp).
KỊCH BẢN:
${userScript.trim()}`
      : `Viết kịch bản mới giọng ${TONE[tone] || TONE.sang}. lines đúng ${n} dòng, mỗi dòng khớp nội dung cảnh tương ứng.`;
    const out = await ask({
      system: "Bạn là agent Biên kịch trong đội làm video bất động sản dọc 9:16 dài 20–60 giây.\n" + RULES,
      content: [{
        type: "text",
        text: `${facts}

Danh sách cảnh ảnh/video:
${sceneList || "(không có cảnh ảnh, chỉ có cảnh bản đồ)"}

${task}

Yêu cầu định dạng:
- hook: câu mở đầu 3 giây, tối đa 45 ký tự, gây tò mò, có *từ khóa*.
- lines: mỗi dòng tối đa 48 ký tự, có 1–2 *từ khóa* tô vàng.
- tagline: câu chốt ở cảnh cuối, tối đa 40 ký tự, không có dấu sao.
- cta: nút kêu gọi IN HOA, tối đa 28 ký tự (dùng câu người dùng muốn nếu có).`,
      }],
      schema: ScriptOut,
      effort: "medium",
    });
    const clip = (s, k) => (s.length > k ? s.slice(0, k - 1).trimEnd() + "…" : s);
    out.lines = out.lines.slice(0, n).map((l) => clip(l.trim(), 60));
    while (out.lines.length < n) out.lines.push(out.lines[out.lines.length % Math.max(1, out.lines.length)] || out.hook);
    out.hook = clip(out.hook.trim(), 60);
    out.tagline = clip(out.tagline.replace(/\*/g, "").trim(), 50);
    out.cta = clip(out.cta.replace(/\*/g, "").trim().toUpperCase(), 32);
    return out;
  }

  // Agent 7 — Kiểm duyệt bằng mắt (bổ sung cho kiểm tra vùng an toàn tự động phía trình duyệt)
  async function reviewFrames({ frames = [], duration = 0 }) {
    if (!Array.isArray(frames) || !frames.length) throw new AgentError("Không có khung hình để kiểm duyệt.", 400);
    if (frames.length > 12) throw new AgentError("Tối đa 12 khung hình.", 400);
    const content = [];
    frames.forEach((f) => {
      content.push({ type: "text", text: `Khung tại ${Number(f.t).toFixed(1)}s:` });
      content.push(dataUrlToImage(f.image));
    });
    content.push({
      type: "text",
      text: `Đây là các khung hình của video dọc 9:16 dài ${Number(duration).toFixed(1)}s (đã thu nhỏ). Kiểm tra lỗi trình bày nhìn thấy được:
chữ đè lên nhau, chữ bị cắt mép, chữ khó đọc trên nền, nhãn/ghim che chữ, khung trống/đen bất thường, lỗi chính tả tiếng Việt.
Không bắt lỗi thẩm mỹ chủ quan. Chữ nhỏ ghi nguồn ở đáy là cố ý, không tính lỗi.
ok=true nếu không có lỗi mức high/medium. time là thời điểm khung có lỗi. fix: cách sửa cụ thể, ngắn.`,
    });
    return ask({
      system: "Bạn là agent Kiểm duyệt chất lượng video bất động sản.",
      content,
      schema: QaOut,
      effort: "low",
      maxTokens: 8000,
    });
  }

  return { analyzeMedia, writeScript, reviewFrames };
}

export const hasClaudeCredentials = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || process.env.QBK_ASSUME_CLAUDE);
