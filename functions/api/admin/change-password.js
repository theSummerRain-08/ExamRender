/**
 * POST /api/admin/change-password
 * { currentPassword, newPassword }
 * Đổi mật khẩu admin — yêu cầu session admin hợp lệ.
 */

import { getSession, jsonResponse } from "../_shared.js";

const DEFAULT_PASSWORD = "12345";
const PASSWORD_KEY     = "admin:password";

async function requireAdmin(request, kv) {
  const { sid, data } = await getSession(request, kv);
  return sid && data.admin ? sid : null;
}

export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return jsonResponse({ error: "Vui lòng nhập đầy đủ thông tin" }, 400);
  }
  if (newPassword.length < 6) {
    return jsonResponse({ error: "Mật khẩu mới phải có ít nhất 6 ký tự" }, 400);
  }
  if (newPassword === currentPassword) {
    return jsonResponse({ error: "Mật khẩu mới phải khác mật khẩu hiện tại" }, 400);
  }

  const stored = (await env.SESSIONS.get(PASSWORD_KEY)) ?? DEFAULT_PASSWORD;
  if (currentPassword !== stored) {
    return jsonResponse({ error: "Mật khẩu hiện tại không đúng" }, 401);
  }

  await env.SESSIONS.put(PASSWORD_KEY, newPassword);
  return jsonResponse({ ok: true });
}
