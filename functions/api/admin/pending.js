/**
 * GET  /api/admin/pending                         — danh sách yêu cầu chờ duyệt
 * POST /api/admin/pending { action, userId }       — approve / deny
 *   action = "approve" → thêm vào whitelist, xoá khỏi pending
 *   action = "deny"    → xoá khỏi pending
 */

import { getSession, jsonResponse } from "../_shared.js";

const PENDING_KEY   = "admin:pending";
const WHITELIST_KEY = "admin:whitelist";

async function requireAdmin(request, kv) {
  const { sid, data } = await getSession(request, kv);
  return sid && data.admin ? sid : null;
}

async function getPending(kv) {
  const raw = await kv.get(PENDING_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function getWhitelist(kv) {
  const raw = await kv.get(WHITELIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return jsonResponse({ pending: await getPending(env.SESSIONS) });
}

export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const { action, userId } = body;
  if (!action || !userId) return jsonResponse({ error: "Thiếu action hoặc userId" }, 400);

  const kv = env.SESSIONS;
  const pending = await getPending(kv);
  const entry   = pending.find(p => p.userId === userId);

  if (action === "approve") {
    if (!entry) return jsonResponse({ error: "Không tìm thấy yêu cầu" }, 404);

    // Thêm vào whitelist (nếu chưa có)
    const whitelist = await getWhitelist(kv);
    if (!whitelist.some(u => u.id === userId)) {
      whitelist.push({
        id:         entry.userId,
        name:       entry.name,
        picture:    entry.picture,
        approvedAt: new Date().toISOString(),
      });
      await kv.put(WHITELIST_KEY, JSON.stringify(whitelist));
    }

    // Xoá khỏi pending
    await kv.put(PENDING_KEY, JSON.stringify(pending.filter(p => p.userId !== userId)));
    return jsonResponse({ ok: true });
  }

  if (action === "deny") {
    await kv.put(PENDING_KEY, JSON.stringify(pending.filter(p => p.userId !== userId)));
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "action không hợp lệ" }, 400);
}
