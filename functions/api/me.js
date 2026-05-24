/**
 * GET /api/me
 *
 * Trả về thông tin user hiện tại từ session.
 * 401 nếu chưa đăng nhập.
 */

import { getSession, jsonResponse } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);

  if (!sid || !data.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return jsonResponse({ user: data.user });
}
