import { getSession, jsonResponse } from "./_shared.js";

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return [...bytes];
}

async function describeImage(ai, base64) {
  const result = await ai.run("@cf/llava-hf/llava-1.5-7b-hf", {
    image: base64ToBytes(base64),
    prompt: "This is a Vietnamese math textbook page. Describe in detail all mathematical content: topics, formulas, theorems, definitions, example problems, and exercises shown. Be thorough.",
    max_tokens: 600,
  });
  return result?.description || result?.response || "";
}

const HOMEWORK_SYSTEM_PROMPT = `Bạn là giáo viên Toán chuyên nghiệp Việt Nam. Dựa vào mô tả nội dung trang sách giáo khoa toán được cung cấp, hãy tạo bài tập về nhà phù hợp cho học sinh.

NHIỆM VỤ:
1. Xác định chủ đề/kiến thức toán học từ mô tả
2. Tạo 5-8 bài tập về nhà đa dạng (cơ bản → nâng cao) phù hợp với kiến thức đó
3. Thêm đáp án / hướng dẫn ngắn gọn ở cuối
4. Trả về HTML thuần túy — KHÔNG có markdown, KHÔNG có giải thích ngoài HTML

=== CẤU TRÚC HTML BẮT BUỘC ===
<div class="exam-doc">
  <div class="exam-header">
    <h2 class="exam-title">BÀI TẬP VỀ NHÀ</h2>
    <p class="exam-meta">Chủ đề: [tên chủ đề] &nbsp;|&nbsp; Số bài: [n] bài</p>
  </div>
  <div class="exam-body">
    <h3 class="section-title">BÀI TẬP</h3>
    <div class="question">
      <p class="q-text"><strong>Bài 1.</strong> Nội dung bài tập...</p>
    </div>
  </div>
  <div class="answer-key">
    <h3 class="section-title">ĐÁP ÁN / HƯỚNG DẪN</h3>
    <p>Bài 1: ...</p>
  </div>
</div>

=== CÔNG THỨC TOÁN — DÙNG KATEX (BẮT BUỘC) ===
- Inline: $x^2 + 2x + 1$, $\\frac{1}{2}$, $\\sqrt{x}$, $\\sqrt[3]{x}$
- Block: $$\\int_a^b f(x)\\,dx$$
- Vector: $\\vec{AB}$ | Góc: $\\widehat{ABC}$ | Phân số to: $\\dfrac{a}{b}$
- KHÔNG dùng text thuần như "sqrt(x)" hay "1/2"

Chỉ trả về HTML, KHÔNG có giải thích hay markdown bên ngoài.`;

export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user || data.pending) {
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

  const { images } = body;
  if (!Array.isArray(images) || images.length === 0 || images.length > 4) {
    return jsonResponse({ error: "Cần 1-4 ảnh trang sách" }, 400);
  }

  try {
    // Bước 1: Phân tích từng ảnh bằng LLaVA
    const descriptions = await Promise.all(
      images.map((img, i) =>
        describeImage(env.AI, img).then(desc => `Trang ${i + 1}:\n${desc}`)
      )
    );
    const context = descriptions.join("\n\n");

    // Bước 2: Tạo bài tập về nhà bằng Llama 3.3 70B
    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: HOMEWORK_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Nội dung sách giáo khoa toán (${images.length} trang):\n\n${context}\n\nHãy tạo bài tập về nhà phù hợp với kiến thức trên.`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }
    );

    const html = aiResponse?.response;
    if (!html) {
      return jsonResponse({ error: "AI không trả về nội dung" }, 500);
    }

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
