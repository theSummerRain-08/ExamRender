// ─── Crypto helpers (dùng Web Crypto API, tương thích Cloudflare Workers) ───

/**
 * Tạo chuỗi ngẫu nhiên base64url
 * @param {number} byteSize - số byte ngẫu nhiên
 */
export function randomToken(byteSize = 32) {
  const bytes = new Uint8Array(byteSize);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * SHA-256 hash, trả về base64url
 * @param {string} value
 */
export async function sha256Base64Url(value) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64Url(new Uint8Array(hashBuffer));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

/**
 * Parse cookie header thành object key→value
 * @param {Request} request
 */
export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const result = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

// ─── Session helpers (dùng Cloudflare KV) ───────────────────────────────────

const SESSION_TTL = 86400; // 24 giờ (giây)

/**
 * Đọc session từ KV theo cookie sid
 * @param {Request} request
 * @param {KVNamespace} kv
 * @returns {{ sid: string|null, data: object }}
 */
export async function getSession(request, kv) {
  const cookies = parseCookies(request);
  const sid = cookies.sid || null;
  if (!sid) return { sid: null, data: {} };
  const raw = await kv.get(sid);
  return { sid, data: raw ? JSON.parse(raw) : {} };
}

/**
 * Lưu session vào KV
 * @param {string} sid
 * @param {object} data
 * @param {KVNamespace} kv
 * @param {number} [ttl]
 */
export async function saveSession(sid, data, kv, ttl = SESSION_TTL) {
  await kv.put(sid, JSON.stringify(data), { expirationTtl: ttl });
}

/**
 * Xóa session khỏi KV
 * @param {string} sid
 * @param {KVNamespace} kv
 */
export async function deleteSession(sid, kv) {
  await kv.delete(sid);
}

// ─── Response helpers ────────────────────────────────────────────────────────

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function redirectResponse(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...extraHeaders },
  });
}
