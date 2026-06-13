/**
 * POST /api/grade
 * Nhận diện đáp án bài làm học sinh qua ảnh.
 * Thứ tự thử: Gemini (nếu có key + quota) → OpenRouter vision free → Workers AI LLaVA
 */

import { getSession, jsonResponse } from "./_shared.js";

const PROMPT = (n) =>
`Đây là phiếu trả lời trắc nghiệm của học sinh có ${n} câu (từ câu 1 đến câu ${n}).
Nhận diện ô mà học sinh đã tô đậm hoặc khoanh tròn cho từng câu.
Trả về ĐÚNG định dạng JSON sau, KHÔNG có markdown, KHÔNG có giải thích:
{"answers":["A","B","C","D",...]}
Quy tắc:
- Mảng có đúng ${n} phần tử theo thứ tự câu 1, 2, ..., ${n}
- Mỗi phần tử là "A", "B", "C", "D", hoặc null nếu không đọc được
- Chỉ trả về JSON thuần`;

function parseAnswers(raw, n) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const match   = cleaned.match(/\{[\s\S]*?"answers"[\s\S]*?\}/);
  if (!match) return null;
  const parsed  = JSON.parse(match[0]);
  return Array.from({ length: n }, (_, i) => {
    const v = parsed.answers?.[i];
    return ["A","B","C","D"].includes(v) ? v : null;
  });
}

// ── 1. Gemini ────────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  { model: "gemini-2.0-flash-lite",   version: "v1beta" },
  { model: "gemini-2.0-flash",        version: "v1beta" },
  { model: "gemini-1.5-flash-latest", version: "v1beta" },
  { model: "gemini-1.5-flash",        version: "v1"     },
  { model: "gemini-1.5-flash-001",    version: "v1"     },
  { model: "gemini-1.5-pro",          version: "v1"     },
];

async function tryGemini(apiKey, mimeType, b64data, numQuestions) {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64data } },
        { text: PROMPT(numQuestions) }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  });

  for (const { model, version } of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });

    if (res.status === 404) continue;
    if (res.status === 429) {
      // Nếu limit=0 thì model này không có quota → thử tiếp
      const txt = await res.text();
      if (txt.includes('"limit": 0') || txt.includes('"limit":0')) continue;
      return { error: `Gemini rate limit (${model}): vui lòng thử lại sau` };
    }
    if (!res.ok) continue;

    const data = await res.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const answers = parseAnswers(raw, numQuestions);
    if (!answers) continue;
    return { answers, model: `Gemini ${model}` };
  }
  return null; // tất cả đều thất bại → thử provider tiếp
}

// ── 2. OpenRouter vision (free models) ──────────────────────────────────────
const OR_MODELS = [
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "qwen/qwen2.5-vl-3b-instruct:free",
];

async function tryOpenRouter(apiKey, imageBase64, numQuestions) {
  for (const model of OR_MODELS) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageBase64 } },
            { type: "text", text: PROMPT(numQuestions) }
          ]
        }]
      })
    });

    if (res.status === 404 || res.status === 429) continue;
    if (!res.ok) continue;

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content?.trim() ?? "";
    const answers = parseAnswers(raw, numQuestions);
    if (!answers) continue;
    return { answers, model: `OpenRouter ${model.split("/")[1]}` };
  }
  return null;
}

// ── 3. Workers AI LLaVA (fallback cuối) ────────────────────────────────────
async function tryWorkersAI(ai, b64data, numQuestions) {
  const binaryStr = atob(b64data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const res = await ai.run("@cf/llava-hf/llava-1.5-7b-hf", {
    image:  Array.from(bytes),
    prompt: `USER: <image>\n${PROMPT(numQuestions)}\nASSISTANT:`,
    max_tokens: 512,
  });

  const raw     = (res?.description || "").trim();
  const answers = parseAnswers(raw, numQuestions);
  if (!answers) return null;
  return { answers, model: "Workers AI LLaVA" };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) return jsonResponse({ error: "Unauthorized" }, 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const { imageBase64, numQuestions = 40 } = body;
  if (!imageBase64) return jsonResponse({ error: "Thiếu ảnh (imageBase64)" }, 400);

  const mimeMatch = imageBase64.match(/^data:(image\/[\w+]+);base64,/);
  const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const b64data   = imageBase64.replace(/^data:image\/[\w+]+;base64,/, "");

  // 1. Thử Gemini
  if (env.GEMINI_API_KEY) {
    const result = await tryGemini(env.GEMINI_API_KEY, mimeType, b64data, numQuestions);
    if (result?.answers) return jsonResponse(result);
    if (result?.error)   return jsonResponse({ error: result.error }, 500);
  }

  // 2. Thử OpenRouter
  if (env.OPENROUTER_API_KEY) {
    const result = await tryOpenRouter(env.OPENROUTER_API_KEY, imageBase64, numQuestions);
    if (result?.answers) return jsonResponse(result);
  }

  // 3. Thử Workers AI LLaVA
  if (env.AI) {
    const result = await tryWorkersAI(env.AI, b64data, numQuestions);
    if (result?.answers) return jsonResponse(result);
  }

  return jsonResponse({
    error: "Không có AI provider nào nhận diện được. Kiểm tra API key tại aistudio.google.com hoặc openrouter.ai"
  }, 500);
}
