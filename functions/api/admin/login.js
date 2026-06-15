import { randomToken, saveSession, jsonResponse } from "../_shared.js";

const ADMIN_USERNAME = "ConMuaMuaHa";
const ADMIN_PASSWORD = "12345";
const ADMIN_SESSION_TTL = 3600 * 8; // 8 giờ

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const { username, password } = body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
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
