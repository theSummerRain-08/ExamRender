import { randomToken, saveSession, jsonResponse } from "../_shared.js";

const ADMIN_USERNAME    = "ConMuaMuaHa";
const DEFAULT_PASSWORD  = "12345";
const PASSWORD_KEY      = "admin:password";
const ADMIN_SESSION_TTL = 3600 * 8; // 8 giờ

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const { username, password } = body;

  if (username !== ADMIN_USERNAME) {
    return jsonResponse({ error: "Sai tên đăng nhập hoặc mật khẩu" }, 401);
  }

  // Đọc mật khẩu từ KV, fallback về mặc định nếu chưa đổi
  const stored = (await env.SESSIONS.get(PASSWORD_KEY)) ?? DEFAULT_PASSWORD;
  if (password !== stored) {
    return jsonResponse({ error: "Sai tên đăng nhập hoặc mật khẩu" }, 401);
  }

  const sid = randomToken(32);
  await saveSession(sid, { admin: true }, env.SESSIONS, ADMIN_SESSION_TTL);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ADMIN_SESSION_TTL}`,
    },
  });
}
