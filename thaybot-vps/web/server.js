/**
 * ThayBot — Web/API server (ban thu nghiem chay duoc)
 *
 * - Phuc vu giao dien o ./public
 * - POST /api/generate  { prompt, difficulty: "normal"|"hard" }
 *     -> Goi AI (OpenRouter) sinh de co the <figure type="tikz|asy">...code...</figure>
 *     -> Tach cac the figure, goi dich vu render -> thay bang anh SVG
 *     -> Tra ve HTML de hoan chinh
 * - CHE DO MOCK: neu khong co OPENROUTER_API_KEY, dung de mau co san
 *   => chay duoc NGAY de demo toan bo duong ong ma khong can API key.
 *
 * Dinh tuyen model (xem tai lieu muc 8):
 *   - viec thuong  -> deepseek/deepseek-v4-flash  (MODEL_TEXT_NORMAL)
 *   - viec kho     -> deepseek/deepseek-v4-pro    (MODEL_TEXT_HARD)
 *   - doc anh/file -> google/gemini-3.1-flash-lite (MODEL_VISION) — mac dinh moi viec doc anh
 *   - chu viet tay kho -> google/gemini-2.5-flash (MODEL_VISION_HARD) — chi ca rieng
 */
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_URL || "http://localhost:8001";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

const MODEL_TEXT_NORMAL = process.env.MODEL_TEXT_NORMAL || "deepseek/deepseek-v4-flash";
const MODEL_TEXT_HARD = process.env.MODEL_TEXT_HARD || "deepseek/deepseek-v4-pro";
const MODEL_VISION = process.env.MODEL_VISION || "google/gemini-3.1-flash-lite";
const MODEL_VISION_HARD = process.env.MODEL_VISION_HARD || "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Ban la tro ly soan de thi Toan THPT Viet Nam.
Tra ve de thi o dang HTML don gian (h2, h3, p, ol, li). Cong thuc dung KaTeX: \\( ... \\).
QUAN TRONG - khi can hinh ve:
- Hinh PHANG (tam giac, duong tron, do thi): xuat code TikZ trong the
  <figure type="tikz"> ...code tikzpicture... </figure>
- Hinh KHONG GIAN (chop, lang tru, non, tru, cau): xuat code Asymptote (import three) trong the
  <figure type="asy"> ...code asy... </figure>
- KHONG dung GeoGebra, KHONG dung data-shape.
- Voi Asymptote: canh thay dung but lien, canh khuat dung nét đứt (linetype "5 5").
Cuoi de co phan DAP AN.`;

// ---------- MOCK: de mau de demo khong can API key ----------
const MOCK_EXAM = `
<h2>ĐỀ KIỂM TRA TOÁN — BẢN DEMO (chế độ mock, chưa gắn API)</h2>
<p><em>Thời gian: 45 phút</em></p>
<h3>Phần I. Hình phẳng</h3>
<ol>
<li>Cho tam giác \\(ABC\\) có đường cao \\(CH\\). Biết \\(AB = 6\\), \\(CH = 4\\). Tính diện tích tam giác.
<figure type="tikz">
\\begin{tikzpicture}[scale=1.1, line cap=round, line join=round]
  \\coordinate (A) at (0,0);
  \\coordinate (B) at (5,0);
  \\coordinate (C) at (1.6,3.2);
  \\coordinate (H) at ($(A)!(C)!(B)$);
  \\draw[thick] (A) -- (B) -- (C) -- cycle;
  \\draw[thick] (C) -- (H);
  \\draw (H) ++(-0.25,0) -- ++(0,0.25) -- ++(0.25,0);
  \\node[below left] at (A) {$A$};
  \\node[below right] at (B) {$B$};
  \\node[above] at (C) {$C$};
  \\node[below] at (H) {$H$};
\\end{tikzpicture}
</figure>
</li>
</ol>
<h3>Phần II. Hình không gian</h3>
<ol start="2">
<li>Cho hình chóp \\(S.ABCD\\) có đáy là hình bình hành. Gọi \\(O\\) là giao điểm hai đường chéo. Chứng minh \\(SO\\) là trung tuyến của tam giác \\(SAC\\).
<figure type="asy">
size(9cm);
currentprojection = orthographic(2.5,-6,2.2);
triple A=(0,0,0), B=(4,0,0), C=(5.4,2.6,0), D=(1.4,2.6,0), S=(2.2,1.1,4);
pen solidp = black+1bp;
pen dashp  = black+0.8bp+linetype(new real[]{5,5});
draw(A--B, solidp); draw(B--C, solidp);
draw(S--A, solidp); draw(S--B, solidp); draw(S--C, solidp);
draw(C--D, dashp); draw(D--A, dashp); draw(S--D, dashp);
label("$S$", S, N); label("$A$", A, SW); label("$B$", B, S);
label("$C$", C, E); label("$D$", D, NW);
</figure>
</li>
</ol>
<h3>ĐÁP ÁN</h3>
<p>Câu 1: \\(S = \\tfrac{1}{2} \\cdot 6 \\cdot 4 = 12\\). Câu 2: \\(O\\) là trung điểm \\(AC\\) nên \\(SO\\) là trung tuyến.</p>
`;

// ---------- Goi OpenRouter ----------
async function callOpenRouter(model, messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ---------- Tach figure & goi render ----------
const FIGURE_RE = /<figure\s+type="(tikz|asy)"\s*>([\s\S]*?)<\/figure>/g;

async function renderFigures(html) {
  const jobs = [];
  html.replace(FIGURE_RE, (m, kind, code) => {
    jobs.push({ kind, code: code.trim() });
    return m;
  });

  const rendered = await Promise.all(
    jobs.map(async ({ kind, code }) => {
      try {
        const res = await fetch(`${RENDER_URL}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: kind, code, format: "svg" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return `<div class="fig-error">[Loi render ${kind}: ${err.error || res.status}]</div>`;
        }
        const svg = await res.text();
        return `<div class="fig">${svg}</div>`;
      } catch (e) {
        return `<div class="fig-error">[Khong goi duoc dich vu render: ${e.message}]</div>`;
      }
    })
  );

  let i = 0;
  return html.replace(FIGURE_RE, () => rendered[i++]);
}

// ---------- API ----------
app.post("/api/generate", async (req, res) => {
  const { prompt = "", difficulty = "normal" } = req.body || {};
  try {
    let raw;
    if (!OPENROUTER_API_KEY) {
      raw = MOCK_EXAM; // che do mock
    } else {
      const model = difficulty === "hard" ? MODEL_TEXT_HARD : MODEL_TEXT_NORMAL;
      raw = await callOpenRouter(model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt || "Tao de kiem tra 45 phut co 1 cau hinh phang va 1 cau hinh khong gian." },
      ]);
    }
    const html = await renderFigures(raw);
    res.json({ html, mock: !OPENROUTER_API_KEY });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true, mock: !OPENROUTER_API_KEY }));

app.listen(PORT, () => {
  console.log(`ThayBot web chay tai http://localhost:${PORT}`);
  console.log(OPENROUTER_API_KEY ? "Che do: AI that (OpenRouter)" : "Che do: MOCK (chua co API key)");
});
