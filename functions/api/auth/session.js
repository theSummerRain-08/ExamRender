/**
 * POST /api/auth/session
 *
 * Nhận { sid, user } từ auth-complete.html sau khi xác thực Zalo.
 * - Whitelist rỗng → cho phép tất cả
 * - User đã trong whitelist → tạo full session
 * - User chưa trong whitelist → thêm vào pending, tạo pending session, trả 202
 */

import { saveSession, jsonResponse } from "../_shared.js";

const WHITELIST_KEY = "admin:whitelist";
const PENDING_KEY   = "admin:pending";

async function getWhitelist(kv) {
  const raw = await kv.get(WHITELIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function addToPending(kv, user) {
  const raw     = await kv.get(PENDING_KEY);
  const pending = raw ? JSON.parse(raw) : [];
  if (!pending.find(p => p.userId === user.id)) {
    pending.push({
      userId:      user.id,
      name:        user.name,
      picture:     user.picture || "",
      requestedAt: new Date().toISOString(),
    });
    await kv.put(PENDING_KEY, JSON.stringify(pending));
  }
}

function fullSessionResponse(sid, ttl = 86400) {
  return {
    status: 200,
    body:   JSON.stringify({ ok: true }),
    cookie: `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl}`,
  };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  const { sid, user } = body;
  if (!sid || !user?.id || !user?.name) {
    return jsonResponse({ error: "Thiếu sid hoặc thông tin user" }, 400);
  }

  const kv        = env.SESSIONS;
  const whitelist = await getWhitelist(kv);

  if (whitelist.some(u => u.id === user.id)) {
    await saveSession(sid, { user }, kv);
    // Lưu reverse mapping để admin có thể thu hồi session ngay lập tức
    await kv.put(`user_session:${user.id}`, sid, { expirationTtl: 86400 });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      },
    });
  }

  // Chưa được duyệt → pending
  await addToPending(kv, user);
  await saveSession(sid, { pending: true, user }, kv, 3600); // 1 giờ

  return new Response(JSON.stringify({ status: "pending" }), {
    status: 202,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
    },
  });
}
