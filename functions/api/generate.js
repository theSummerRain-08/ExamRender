/**
 * POST /api/generate
 *
 * Nhận prompt từ frontend, gọi Cloudflare Workers AI tạo đề thi,
 * trả về nội dung HTML để hiển thị trong PDF preview.
 * Không cần API key ngoài — Workers AI là dịch vụ nội bộ Cloudflare.
 */

import { getSession, jsonResponse } from "./_shared.js";

const SYSTEM_PROMPT = `Bạn là một giáo viên Toán chuyên nghiệp tại Việt Nam với nhiều năm kinh nghiệm ra đề thi.
Khi nhận yêu cầu tạo đề thi, hãy tạo đề thi hoàn chỉnh và trả về dưới dạng HTML thuần túy (không dùng markdown, không có thẻ \`\`\`html).

Cấu trúc HTML bắt buộc:
<div class="exam-doc">
  <div class="exam-header">
    <p class="school">TRƯỜNG THPT ...</p>
    <h2 class="exam-title">ĐỀ KIỂM TRA ...</h2>
    <p class="exam-meta">Thời gian: ... phút &nbsp;|&nbsp; Họ tên: ........................... &nbsp;|&nbsp; Lớp: .........</p>
  </div>
  <div class="exam-body">
    <h3 class="section-title">PHẦN I. TRẮC NGHIỆM</h3>
    <div class="question">
      <p class="q-text"><strong>Câu 1.</strong> Nội dung câu hỏi...</p>
      <div class="choices">
        <span class="choice">A. ...</span>
        <span class="choice">B. ...</span>
        <span class="choice">C. ...</span>
        <span class="choice">D. ...</span>
      </div>
    </div>
  </div>
  <div class="answer-key">
    <h3 class="section-title">ĐÁP ÁN</h3>
    <p>Câu 1: A &nbsp; Câu 2: C &nbsp; ...</p>
  </div>
</div>

Lưu ý:
- Chỉ trả về HTML, KHÔNG có giải thích hay markdown
- Công thức toán viết dạng text thuần (x^2 + 2x + 1, sqrt(x), ...)
- Luôn có đáp án cuối đề trừ khi được yêu cầu bỏ
- Nội dung đúng chương trình Toán Việt Nam`;

export async function onRequestPost({ request, env }) {
  // Kiểm tra đăng nhập
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!env.AI) {
    return jsonResponse(
      { error: "Chưa cấu hình Workers AI binding. Vào Cloudflare Dashboard → Settings → Bindings → thêm Workers AI với tên biến 'AI'." },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const { prompt } = body;
  if (!prompt?.trim()) {
    return jsonResponse({ error: "Prompt không được để trống" }, 400);
  }

  try {
    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }
    );

    const html = aiResponse?.response;
    if (!html) {
      return jsonResponse({ error: "AI không trả về nội dung" }, 500);
    }

    // Xoá ```html nếu model vô tình trả về markdown
    const cleaned = html
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    return jsonResponse({ html: cleaned });
  } catch (err) {
    console.error("Workers AI failed:", err.message);
    return jsonResponse({ error: "Workers AI lỗi: " + err.message }, 500);
  }
}
