/**
 * POST /api/grade
 * Nhận diện đáp án bài làm học sinh qua ảnh.
 * Dùng @cf/meta/llama-3.2-11b-vision-instruct (Cloudflare Workers AI).
 * Tự động chấp nhận license nếu chưa được accept.
 */

import { getSession, jsonResponse } from "./_shared.js";

const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!env.AI) {
    return jsonResponse({ error: "Chưa cấu hình Workers AI binding." }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const { imageBase64, numQuestions = 40 } = body;
  if (!imageBase64) return jsonResponse({ error: "Thiếu ảnh (imageBase64)" }, 400);

  // base64 → mảng số
  const b64 = imageBase64.replace(/^data:image\/[\w+]+;base64,/, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const prompt =
`Đây là phiếu trả lời trắc nghiệm có ${numQuestions} câu (câu 1 đến câu ${numQuestions}).
Nhận diện ô học sinh đã tô đậm/khoanh tròn cho từng câu.
Trả về JSON sau, KHÔNG có markdown:
{"answers":["A","B","C","D",...]}
- Mảng có đúng ${numQuestions} phần tử theo thứ tự câu 1..${numQuestions}
- Mỗi phần tử là "A","B","C","D" hoặc null
- Chỉ JSON, không giải thích`;

  const messages = [{
    role: "user",
    content: [
      { type: "image", image: Array.from(bytes) },
      { type: "text",  text: prompt }
    ]
  }];

  try {
    let raw = await runModel(env.AI, messages);
    return buildResponse(raw, numQuestions);
  } catch (err) {
    // Lỗi 5016: chưa chấp nhận license → tự động agree rồi thử lại
    if (err.message?.includes("5016")) {
      try {
        await env.AI.run(MODEL, {
          prompt: "agree",
          max_tokens: 10
        });
        const raw = await runModel(env.AI, messages);
        return buildResponse(raw, numQuestions);
      } catch (retryErr) {
        return jsonResponse({ error: "Lỗi sau khi chấp nhận license: " + retryErr.message }, 500);
      }
    }
    return jsonResponse({ error: "Workers AI lỗi: " + err.message }, 500);
  }
}

async function runModel(ai, messages) {
  const res = await ai.run(MODEL, { messages, max_tokens: 512 });
  return res?.response ?? "";
}

function buildResponse(raw, numQuestions) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const match   = cleaned.match(/\{[\s\S]*?"answers"[\s\S]*?\}/);
  if (!match) {
    return jsonResponse({ error: "AI không trả về JSON hợp lệ", raw }, 500);
  }
  const parsed  = JSON.parse(match[0]);
  const answers = Array.from({ length: numQuestions }, (_, i) => {
    const v = parsed.answers?.[i];
    return ["A","B","C","D"].includes(v) ? v : null;
  });
  return jsonResponse({ answers });
}
