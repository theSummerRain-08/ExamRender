import { randomToken, saveSession, jsonResponse } from "../../_shared.js";

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0") && digits.length >= 10) return "+84" + digits.slice(1);
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SID) {
    return jsonResponse({ error: "Chưa cấu hình dịch vụ OTP" }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request" }, 400); }

  const phone = normalizePhone(body.phone || "");
  const code  = String(body.code || "").replace(/\D/g, "").slice(0, 6);

  if (!phone) return jsonResponse({ error: "Số điện thoại không hợp lệ" }, 400);
  if (code.length !== 6) return jsonResponse({ error: "Mã OTP phải có 6 chữ số" }, 400);

  const authHeader = "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.status !== "approved") {
    return jsonResponse({ error: "Mã OTP không đúng hoặc đã hết hạn" }, 400);
  }

  // Ẩn số điện thoại trong tên hiển thị
  const maskedName = phone.slice(0, 5) + "****" + phone.slice(-3);

  const sid = `sid-${randomToken()}`;
  await saveSession(sid, {
    user: { id: phone, name: maskedName, picture: null, type: "phone" },
  }, env.SESSIONS);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    },
  });
}
