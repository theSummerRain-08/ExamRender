/**
 * GET /api/auth/zalo
 *
 * Bắt đầu luồng Zalo OAuth (PKCE):
 *  1. Tạo session mới với state + codeVerifier
 *  2. Lưu vào KV (TTL 10 phút)
 *  3. Redirect trình duyệt sang trang đăng nhập Zalo
 */

import {
  randomToken,
  sha256Base64Url,
  saveSession,
  redirectResponse,
  jsonResponse,
} from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const { ZALO_APP_ID, ZALO_APP_SECRET, BASE_URL, SESSIONS } = env;

  if (!ZALO_APP_ID || !ZALO_APP_SECRET) {
    return jsonResponse(
      { error: "Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trong biến môi trường" },
      500
    );
  }

  // Tạo session mới
  const sid = randomToken(32);
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  // Lưu OAuth state vào KV (10 phút)
  await saveSession(sid, { oauth: { state, codeVerifier } }, SESSIONS, 600);

  const redirectUri = `${BASE_URL}/api/auth/zalo/callback`;

  const params = new URLSearchParams({
    app_id: ZALO_APP_ID,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    state,
  });

  return redirectResponse(`https://oauth.zaloapp.com/v4/permission?${params}`, {
    "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
  });
}
