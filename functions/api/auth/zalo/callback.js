/**
 * GET /api/auth/zalo/callback
 *
 * Zalo redirect về đây sau khi user đồng ý đăng nhập.
 *  1. Kiểm tra state chống CSRF
 *  2. Đổi authorization code → access token (gọi từ server, IP Việt Nam nhờ Cloudflare PoP)
 *  3. Lấy thông tin profile
 *  4. Lưu user vào session, redirect về trang chính
 */

import {
  parseCookies,
  getSession,
  saveSession,
  redirectResponse,
  jsonResponse,
} from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const { ZALO_APP_ID, ZALO_APP_SECRET, BASE_URL, SESSIONS } = env;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // ── Kiểm tra tham số đầu vào ──────────────────────────────────────────────
  if (!code || !state) {
    return redirectResponse("/login.html?error=missing_params");
  }

  // ── Lấy session từ cookie ─────────────────────────────────────────────────
  const { sid, data: sessionData } = await getSession(request, SESSIONS);

  if (!sid || !sessionData.oauth || sessionData.oauth.state !== state) {
    return redirectResponse("/login.html?error=zalo_state");
  }

  // ── Đổi code → access token ───────────────────────────────────────────────
  let tokenData;
  try {
    const tokenRes = await fetch("https://oauth.zaloapp.com/v4/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: ZALO_APP_SECRET,
      },
      body: new URLSearchParams({
        app_id: ZALO_APP_ID,
        code,
        code_verifier: sessionData.oauth.codeVerifier,
        grant_type: "authorization_code",
      }),
    });

    tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("Zalo token error:", tokenData);
      return redirectResponse("/login.html?error=token_exchange");
    }
  } catch (err) {
    console.error("Token exchange failed:", err);
    return redirectResponse("/login.html?error=token_exchange");
  }

  // ── Lấy thông tin profile ─────────────────────────────────────────────────
  let user;
  try {
    const profileRes = await fetch(
      "https://graph.zalo.me/v2.0/me?fields=id,name,picture",
      {
        headers: { access_token: tokenData.access_token },
      }
    );

    const profileData = await profileRes.json();

    if (!profileRes.ok || profileData.error) {
      console.error("Zalo profile error:", profileData);
      return redirectResponse("/login.html?error=profile");
    }

    user = {
      id: profileData.id,
      name: profileData.name || "Người dùng Zalo",
      picture: profileData.picture?.data?.url || profileData.picture || "",
    };
  } catch (err) {
    console.error("Profile fetch failed:", err);
    return redirectResponse("/login.html?error=profile");
  }

  // ── Lưu user vào session (24h), xóa oauth state ───────────────────────────
  await saveSession(sid, { user }, SESSIONS);

  return redirectResponse("/index.html");
}
