/**
 * GET /api/auth/zalo/callback
 *
 * Zalo redirect về đây sau khi user đồng ý đăng nhập.
 * Thay vì server gọi Zalo API (bị chặn DNS ngoài VN),
 * ta chuyển code + code_verifier sang browser để browser
 * tự gọi Zalo từ IP Việt Nam.
 */

import {
  getSession,
  redirectResponse,
} from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirectResponse("/login.html?error=missing_params");
  }

  // Lấy session + kiểm tra state chống CSRF
  const { sid, data: sessionData } = await getSession(request, env.SESSIONS);

  if (!sid || !sessionData.oauth || sessionData.oauth.state !== state) {
    return redirectResponse("/login.html?error=zalo_state");
  }

  const { codeVerifier } = sessionData.oauth;

  // Chuyển sang trang client-side để browser tự đổi code → token
  // (browser có IP Việt Nam, tránh bị Zalo chặn DNS)
  const params = new URLSearchParams({ code, verifier: codeVerifier, sid });
  return redirectResponse(`/auth-complete.html?${params}`);
}
