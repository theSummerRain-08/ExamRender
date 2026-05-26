import { jsonResponse } from "../../_shared.js";

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0") && digits.length >= 10) return "+84" + digits.slice(1);
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SID) {
    return jsonResponse({ error: "Chưa cấu hình dịch vụ OTP. Liên hệ quản trị viên." }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid request" }, 400); }

  const phone = normalizePhone(body.phone || "");
  if (!phone) {
    return jsonResponse({ error: "Số điện thoại không hợp lệ (ví dụ: 0912345678)" }, 400);
  }

  const authHeader = "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Channel: "sms" }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse(
      { error: "Không thể gửi OTP: " + (err?.message || res.status) },
      502
    );
  }

  return jsonResponse({ ok: true });
}
