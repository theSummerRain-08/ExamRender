/**
 * GET /api/logout  (cũng chấp nhận POST)
 *
 * Xóa session khỏi KV và xóa cookie sid.
 */

import { parseCookies, deleteSession } from "./_shared.js";

async function handleLogout({ request, env }) {
  const cookies = parseCookies(request);
  const sid = cookies.sid;

  if (sid) {
    await deleteSession(sid, env.SESSIONS);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    },
  });
}

export const onRequestGet = handleLogout;
export const onRequestPost = handleLogout;
