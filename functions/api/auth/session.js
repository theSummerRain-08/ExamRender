/**
 * POST /api/auth/session
 *
 * Nhận { sid, user } từ auth-complete.html (browser đã xác thực với Zalo),
 * lưu user vào KV session và xác nhận bằng cookie.
 */

import { saveSession, jsonResponse } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { sid, user } = body;

  if (!sid || !user?.id || !user?.name) {
    return jsonResponse({ error: "Thiếu sid hoặc thông tin user" }, 400);
  }

  // Lưu user vào KV session (24 giờ)
  await saveSession(sid, { user }, env.SESSIONS);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Gia hạn cookie thêm 24 giờ
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    },
  });
}
