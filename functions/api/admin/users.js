/**
 * GET  /api/admin/users        — danh sách người dùng đã được duyệt
 * DELETE /api/admin/users { userId } — xoá người dùng khỏi whitelist
 */

import { getSession, jsonResponse } from "../_shared.js";

const WHITELIST_KEY = "admin:whitelist";

async function requireAdmin(request, kv) {
  const { sid, data } = await getSession(request, kv);
  return sid && data.admin ? sid : null;
}

async function getWhitelist(kv) {
  const raw = await kv.get(WHITELIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return jsonResponse({ users: await getWhitelist(env.SESSIONS) });
}

export async function onRequestDelete({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const { userId } = body;
  if (!userId) return jsonResponse({ error: "Thiếu userId" }, 400);

  const kv      = env.SESSIONS;
  const list    = await getWhitelist(kv);
  const newList = list.filter(u => u.id !== userId);
  await kv.put(WHITELIST_KEY, JSON.stringify(newList));

  // Thu hồi session đang hoạt động của người dùng này ngay lập tức
  const activeSid = await kv.get(`user_session:${userId}`);
  if (activeSid) {
    await kv.delete(activeSid);
    await kv.delete(`user_session:${userId}`);
  }

  return jsonResponse({ users: newList });
}
