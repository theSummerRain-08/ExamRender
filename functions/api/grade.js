/**
 * POST /api/grade
 * Nhận ảnh bài làm học sinh (base64), gọi Gemini Vision nhận diện đáp án,
 * trả về mảng đáp án [{A|B|C|D|null}, ...]
 *
 * Cần biến môi trường: GEMINI_API_KEY
 * Lấy miễn phí tại: https://aistudio.google.com/app/apikey
 */

import { getSession, jsonResponse } from "./_shared.js";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({
      error: "Chưa cấu hình GEMINI_API_KEY. Vào Cloudflare Dashboard → Settings → Environment variables → thêm GEMINI_API_KEY."
    }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const { imageBase64, numQuestions = 40 } = body;
  if (!imageBase64) return jsonResponse({ error: "Thiếu ảnh (imageBase64)" }, 400);

  // Tách mime type và dữ liệu base64 thuần
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

  try {
    const res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: b64data } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: `Gemini API ${res.status}: ${errText}` }, 500);
    }

    const result = await res.json();
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    // Trích JSON từ phản hồi (Gemini đôi khi bọc trong ```json ```)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match   = cleaned.match(/\{[\s\S]*?"answers"[\s\S]*?\}/);
    if (!match) {
      return jsonResponse({ error: "Gemini không trả về JSON hợp lệ", raw }, 500);
    }

    const parsed = JSON.parse(match[0]);
    const answers = Array.from({ length: numQuestions }, (_, i) => {
      const v = parsed.answers?.[i];
      return ["A", "B", "C", "D"].includes(v) ? v : null;
    });

    return jsonResponse({ answers });
  } catch (err) {
    console.error("Gemini grade error:", err);
    return jsonResponse({ error: "Lỗi Gemini: " + err.message }, 500);
  }
}
