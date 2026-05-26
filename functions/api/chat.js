/**
 * POST /api/chat
 *
 * Endpoint hỏi đáp toán học trực tiếp.
 * Nhận lịch sử hội thoại [{role, content}], gọi Workers AI,
 * trả về { html, text } — html để render KaTeX/GeoGebra, text để lưu lịch sử.
 */

import { getSession, jsonResponse } from "./_shared.js";

const CHAT_SYSTEM_PROMPT = `Bạn là một gia sư Toán chuyên nghiệp tại Việt Nam, giải thích rõ ràng, ngắn gọn, từng bước.
Trả lời bằng HTML thuần túy (KHÔNG dùng markdown, KHÔNG có thẻ \`\`\`html).

=== QUY TẮC ĐỊNH DẠNG ===
- Dùng thẻ HTML thông thường: <p>, <strong>, <ul>, <ol>, <li>
- LUÔN dùng LaTeX cho mọi ký hiệu toán: $x^2$, $\\frac{a}{b}$, $\\sqrt{x}$
- Phương trình dài dùng block: $$...$$
- Đánh số các bước rõ ràng khi giải toán
- Kết luận in đậm: <strong>Vậy ...</strong>

=== VÍ DỤ ĐỊNH DẠNG ===
<p>Ta giải phương trình $x^2 - 5x + 6 = 0$:</p>
<ol>
  <li>Tính delta: $\\Delta = b^2 - 4ac = 25 - 24 = 1$</li>
  <li>Nghiệm: $x_1 = \\frac{5+1}{2} = 3$, $x_2 = \\frac{5-1}{2} = 2$</li>
</ol>
<p><strong>Vậy phương trình có hai nghiệm $x = 2$ và $x = 3$.</strong></p>

=== VẼ HÌNH (CHỈ KHI THỰC SỰ CẦN) ===
Khi câu hỏi liên quan đến hình không gian và cần minh họa, dùng template:
<div class="ggb-figure" data-shape='{"type":"TÊN","tham_số":giá_trị,"cap":"Chú thích"}'></div>

Các loại hình: sphere (r), box (a,b,c), pyramid (a,h), prism (a,h), cylinder (r,h), cone (r,h)
Ví dụ: <div class="ggb-figure" data-shape='{"type":"pyramid","a":4,"h":5,"cap":"Hinh chop S.ABCD"}'></div>
"cap" TUYỆT ĐỐI không chứa dấu nháy đơn (').

=== LƯU Ý ===
- KHÔNG vẽ hình cho bài đại số, xác suất, tổ hợp
- Giải thích ngắn gọn, tập trung vào phương pháp
- Nếu câu hỏi không liên quan toán, lịch sự từ chối và hướng dẫn lại`;

export async function onRequestPost(context) {
  const { request, env } = context;

  // Kiểm tra đăng nhập
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Kiểm tra AI binding
  if (!env.AI) {
    return jsonResponse(
      { error: "Chưa cấu hình Workers AI binding." },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const { history } = body;
  if (!Array.isArray(history) || history.length === 0) {
    return jsonResponse({ error: "Lịch sử hội thoại không hợp lệ" }, 400);
  }

  // Giới hạn lịch sử tối đa 20 tin nhắn gần nhất (tránh vượt token limit)
  const trimmedHistory = history.slice(-20);

  // Xác nhận tin nhắn cuối là của user
  const lastMsg = trimmedHistory[trimmedHistory.length - 1];
  if (!lastMsg?.content?.trim() || lastMsg.role !== "user") {
    return jsonResponse({ error: "Tin nhắn không hợp lệ" }, 400);
  }

  try {
    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...trimmedHistory,
        ],
        max_tokens: 2048,
        temperature: 0.5,
      }
    );

    let html = aiResponse?.response;
    if (!html) {
      return jsonResponse({ error: "AI không trả về nội dung" }, 500);
    }

    // Xoá markdown nếu model vô tình trả về
    html = html
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // Trả về cả html (để render) và text thuần (để lưu lịch sử)
    const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    return jsonResponse({ html, text: textOnly });
  } catch (err) {
    console.error("Workers AI chat failed:", err.message);
    return jsonResponse({ error: "Workers AI lỗi: " + err.message }, 500);
  }
}
