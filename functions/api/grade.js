/**
 * POST /api/grade
 * Nhận ảnh bài làm (base64), gọi Gemini Vision nhận diện đáp án.
 * Tự động thử nhiều model theo thứ tự ưu tiên, dùng model nào hoạt động trước.
 */

import { getSession, jsonResponse } from "./_shared.js";

// Thứ tự ưu tiên: thử từ trên xuống, dùng model đầu tiên không bị 404
const GEMINI_MODELS = [
  { model: "gemini-2.0-flash-lite",        version: "v1beta" },
  { model: "gemini-2.0-flash",             version: "v1beta" },
  { model: "gemini-1.5-flash",             version: "v1beta" },
  { model: "gemini-1.5-flash-latest",      version: "v1beta" },
  { model: "gemini-1.5-flash",             version: "v1"     },
  { model: "gemini-1.5-flash-001",         version: "v1"     },
  { model: "gemini-1.5-pro",               version: "v1"     },
  { model: "gemini-1.0-pro-vision-latest", version: "v1beta" },
];

export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({
      error: "Chưa cấu hình GEMINI_API_KEY trong Cloudflare Environment Variables."
    }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const { imageBase64, numQuestions = 40 } = body;
  if (!imageBase64) return jsonResponse({ error: "Thiếu ảnh (imageBase64)" }, 400);

  const mimeMatch = imageBase64.match(/^data:(image\/[\w+]+);base64,/);
  const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const b64data   = imageBase64.replace(/^data:image\/[\w+]+;base64,/, "");

  const prompt =
`Đây là phiếu trả lời trắc nghiệm của học sinh có ${numQuestions} câu (từ câu 1 đến câu ${numQuestions}).
Nhận diện ô mà học sinh đã tô đậm hoặc khoanh tròn cho từng câu.
Trả về ĐÚNG định dạng JSON sau, KHÔNG có markdown, KHÔNG có giải thích:
{"answers":["A","B","C","D",...]}
Quy tắc bắt buộc:
- Mảng có đúng ${numQuestions} phần tử, theo thứ tự câu 1, 2, ..., ${numQuestions}
- Mỗi phần tử là "A", "B", "C", "D", hoặc null nếu không đọc được
- Chỉ trả về JSON thuần, không thêm gì khác`;

  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64data } },
        { text: prompt }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  });

  let lastError = "";
  for (const { model, version } of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
    } catch (fetchErr) {
      lastError = fetchErr.message;
      continue;
    }

    if (res.status === 404) continue; // model không tồn tại → thử model tiếp

    if (!res.ok) {
      const errText = await res.text();
      // 429 quota hoặc lỗi khác → dừng, không thử tiếp
      return jsonResponse({ error: `Gemini API ${res.status} (${model}): ${errText}` }, 500);
    }

    // Thành công
    const result = await res.json();
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match   = cleaned.match(/\{[\s\S]*?"answers"[\s\S]*?\}/);
    if (!match) {
      return jsonResponse({ error: "AI không trả về JSON hợp lệ", raw, model }, 500);
    }

    const parsed = JSON.parse(match[0]);
    const answers = Array.from({ length: numQuestions }, (_, i) => {
      const v = parsed.answers?.[i];
      return ["A", "B", "C", "D"].includes(v) ? v : null;
    });

    return jsonResponse({ answers, model }); // trả thêm model đã dùng để debug
  }

  return jsonResponse({
    error: `Không tìm thấy Gemini model khả dụng. Lỗi cuối: ${lastError}. Kiểm tra API key tại aistudio.google.com`
  }, 500);
}
