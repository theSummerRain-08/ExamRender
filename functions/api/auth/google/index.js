import { randomToken, saveSession, jsonResponse } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse({ error: "GOOGLE_CLIENT_ID chưa được cấu hình" }, 500);
  }

  const baseUrl = env.BASE_URL || new URL(request.url).origin;
  const state   = randomToken(16);
  const sid     = `sid-${randomToken()}`;

  await saveSession(sid, { oauthState: state }, env.SESSIONS, 600);

  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${baseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location:     `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}
