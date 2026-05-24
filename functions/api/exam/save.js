/**
 * POST /api/exam/save
 *
 * Lưu nội dung đề thi vào KV, trả về ID và link chia sẻ.
 * Link có hiệu lực 7 ngày.
 */

import { getSession, jsonResponse } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid || !data.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  const { html, title } = body;
  if (!html) return jsonResponse({ error: "Thiếu nội dung đề thi" }, 400);

  const id = crypto.randomUUID();

  await env.SESSIONS.put(
    `exam:${id}`,
    JSON.stringify({
      html,
      title: title || "Đề thi",
      author: data.user.name,
      createdAt: new Date().toISOString(),
    }),
    { expirationTtl: 60 * 60 * 24 * 7 } // 7 ngày
  );

  return jsonResponse({ id, path: `/exam-view.html?id=${id}` });
}
