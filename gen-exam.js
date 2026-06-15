/**
 * gen-exam.js — Tạo đề thi HTML có hình SVG, hỗ trợ 3 nguồn AI:
 *   1. Cloudflare Workers AI (FREE — dùng account Cloudflare hiện tại)
 *   2. Anthropic Claude API
 *   3. OpenRouter
 *
 * Cách dùng (PowerShell):
 *   # Cloudflare (miễn phí):
 *   $env:CF_ACCOUNT_ID="abc123"; $env:CF_API_TOKEN="xyz..."; node gen-exam.js
 *
 *   # Anthropic:
 *   $env:ANTHROPIC_API_KEY="sk-ant-..."; node gen-exam.js "Đề thi hình học"
 *
 * Kết quả lưu vào output-<timestamp>.html
 */

const { writeFileSync } = require("fs");

// ─── Config ──────────────────────────────────────────────────────────────────

const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID   || "";
const CF_API_TOKEN   = process.env.CF_API_TOKEN     || "";
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

const userPrompt = process.argv[2]
  || "Tạo đề kiểm tra Toán 45 phút có 1 câu hình phẳng (tam giác với đường cao) và 1 câu hình không gian (hình chóp S.ABCD).";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `Bạn là giáo viên Toán THPT Việt Nam soạn đề thi.
Trả về HTML thuần (KHÔNG có markdown, KHÔNG có \`\`\`html).

=== CÔNG THỨC TOÁN ===
Dùng KaTeX: inline \\( ... \\) và block \\[ ... \\]

=== HÌNH VẼ ===
Khi cần hình, nhúng INLINE SVG trực tiếp vào HTML, bọc trong <div class="fig">...</div>.
Quy tắc SVG:
- viewBox="0 0 W H", không cần khai báo width/height (CSS tự scale)
- Nét liền: stroke="#000" stroke-width="1.2" fill="none"
- Nét khuất (cạnh ẩn): stroke-dasharray="5,4" stroke-width="0.8"
- Nhãn điểm: <text font-size="13" font-family="serif" font-style="italic">
- Góc vuông: ô vuông nhỏ 6×6 tại đỉnh góc
- Hình phẳng (tam giác, tứ giác, đường tròn): tọa độ 2D thẳng
- Hình không gian (chóp, hộp, lăng trụ): chiếu xiên góc oblique
    trục X→phải, Y→lên, Z chiếu vào: dx=cos(30°)*0.4≈0.35, dy=sin(30°)*0.4=0.2
    cạnh thấy: nét liền; cạnh khuất: nét đứt

=== CẤU TRÚC HTML ===
<h2>ĐỀ KIỂM TRA TOÁN</h2>
<p><em>Thời gian: 45 phút</em></p>
<h3>Phần I. ...</h3>
<ol>
  <li>Nội dung câu hỏi...
    <div class="fig">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160"><!-- hình --></svg>
    </div>
  </li>
</ol>
<h3>ĐÁP ÁN</h3>
<p>...</p>

CHỈ trả về phần body HTML, KHÔNG có thẻ <html>/<head>/<body>.`;

// ─── Hàm gọi từng API ────────────────────────────────────────────────────────

async function callCloudflare(prompt) {
  // Cloudflare Workers AI REST API — free 10k neurons/ngày
  const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user",   content: prompt },
      ],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare AI ${res.status}: ${err}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error("Cloudflare AI: " + JSON.stringify(data.errors));
  return data.result?.response || "";
}

async function callAnthropic(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenRouter(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user",   content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Template HTML output ────────────────────────────────────────────────────

function wrapHTML(bodyHtml, source) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ThayBot — Đề thi (${source})</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<style>
  body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111;line-height:1.7;}
  h2{border-bottom:2px solid #111;padding-bottom:6px;}
  h3{margin-top:1.4em;}
  ol li{margin-bottom:.8em;}
  div.fig{text-align:center;margin:16px 0;}
  div.fig svg{max-width:420px;height:auto;}
</style>
</head>
<body>
${bodyHtml}
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
  renderMathInElement(document.body, {
    delimiters: [
      {left: "\\\\(", right: "\\\\)", display: false},
      {left: "\\\\[", right: "\\\\]", display: true}
    ]
  });
});
</script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let source, raw;

  if (CF_ACCOUNT_ID && CF_API_TOKEN) {
    source = "Cloudflare Workers AI (free)";
    console.log(`Nguồn: ${source}`);
    raw = await callCloudflare(userPrompt);
  } else if (ANTHROPIC_KEY) {
    source = "Anthropic Claude";
    console.log(`Nguồn: ${source}`);
    raw = await callAnthropic(userPrompt);
  } else if (OPENROUTER_KEY) {
    source = "OpenRouter";
    console.log(`Nguồn: ${source}`);
    raw = await callOpenRouter(userPrompt);
  } else {
    console.error("Lỗi: Chưa có API key nào. Cần một trong:");
    console.error("  $env:CF_ACCOUNT_ID + $env:CF_API_TOKEN   (Cloudflare, miễn phí)");
    console.error("  $env:ANTHROPIC_API_KEY                   (Anthropic)");
    console.error("  $env:OPENROUTER_API_KEY                  (OpenRouter)");
    process.exit(1);
  }

  // Bỏ markdown wrapper nếu model vô tình bọc
  const body = raw
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const html = wrapHTML(body, source);
  const outFile = `output-${Date.now()}.html`;
  writeFileSync(outFile, html, "utf-8");
  console.log(`✓ Đã lưu: ${outFile}`);
  console.log(`  Mở file trong trình duyệt để xem đề hoàn chỉnh.`);
}

main().catch(err => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
