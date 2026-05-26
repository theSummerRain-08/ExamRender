import { getSession, saveSession, deleteSession, randomToken, redirectResponse } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirectResponse("/login.html?error=missing_params");
  }

  // Kiểm tra state chống CSRF
  const { sid, data: sessionData } = await getSession(request, env.SESSIONS);
  if (!sid || sessionData.oauthState !== state) {
    return redirectResponse("/login.html?error=google_state");
  }

  // Xóa session tạm OAuth
  await deleteSession(sid, env.SESSIONS);

  const baseUrl     = env.BASE_URL || new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // Đổi code lấy access_token (server-side — Google không chặn IP)
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirectResponse("/login.html?error=google_token");
  }

  const { access_token } = await tokenRes.json();

  // Lấy thông tin người dùng
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    return redirectResponse("/login.html?error=google_user");
  }

  const profile = await userRes.json();

  // Tạo session mới (24 giờ)
  const newSid = `sid-${randomToken()}`;
  await saveSession(newSid, {
    user: {
      id:      profile.sub,
      name:    profile.name,
      picture: profile.picture,
      email:   profile.email,
      type:    "google",
    },
  }, env.SESSIONS);

  return new Response(null, {
    status: 302,
    headers: {
      Location:     `${baseUrl}/index.html`,
      "Set-Cookie": `sid=${encodeURIComponent(newSid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    },
  });
}
