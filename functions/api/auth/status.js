/**
 * GET /api/auth/status
 *
 * Người dùng đang trong trạng thái pending polling endpoint này.
 * - Nếu session đã là full user → { ok: true }
 * - Nếu session pending + đã được duyệt → nâng cấp session → { ok: true }
 * - Nếu session pending + chưa duyệt → { status: "pending" }
 * - Nếu bị từ chối (không còn trong pending list và không trong whitelist) → { status: "denied" }
 */

import { getSession, saveSession, jsonResponse } from "../_shared.js";

const WHITELIST_KEY = "admin:whitelist";
const PENDING_KEY   = "admin:pending";

export async function onRequestGet({ request, env }) {
  const { sid, data } = await getSession(request, env.SESSIONS);
  if (!sid) return jsonResponse({ status: "unauthorized" }, 401);

  // Đã là session đầy đủ
  if (data.user && !data.pending) return jsonResponse({ ok: true });

  // Session pending → kiểm tra đã duyệt chưa
  if (data.pending && data.user) {
    const raw = await env.SESSIONS.get(WHITELIST_KEY);
    const whitelist = raw ? JSON.parse(raw) : [];

    if (whitelist.some(u => u.id === data.user.id)) {
      // Đã được duyệt → nâng cấp session
      await saveSession(sid, { user: data.user }, env.SESSIONS);
      return jsonResponse({ ok: true });
    }

    // Kiểm tra còn trong pending không
    const pendingRaw = await env.SESSIONS.get(PENDING_KEY);
    const pending    = pendingRaw ? JSON.parse(pendingRaw) : [];
    const stillPending = pending.some(p => p.userId === data.user.id);

    if (!stillPending) {
      // Bị từ chối → xoá session
      await env.SESSIONS.delete(sid);
      return jsonResponse({ status: "denied" });
    }

    return jsonResponse({ status: "pending" });
  }

  return jsonResponse({ status: "unauthorized" }, 401);
}
