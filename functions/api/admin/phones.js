import { getSession, jsonResponse } from "../_shared.js";

const WHITELIST_KEY = "admin:whitelist";

// Chuẩn hoá SĐT: bỏ ký tự không phải số, 84xxx → 0xxx
function normalizePhone(p) {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) return "0" + digits.slice(2);
  return digits;
}

async function getWhitelist(kv) {
  const raw = await kv.get(WHITELIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveWhitelist(kv, list) {
  // Lưu không TTL → tồn tại vĩnh viễn
  await kv.put(WHITELIST_KEY, JSON.stringify(list));
}

async function requireAdmin(request, kv) {
  const { sid, data } = await getSession(request, kv);
  return sid && data.admin ? sid : null;
}

// GET /api/admin/phones — trả về danh sách
export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const phones = await getWhitelist(env.SESSIONS);
  return jsonResponse({ phones });
}

// POST /api/admin/phones { phone } — thêm SĐT
export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const phone = normalizePhone(body.phone);
  if (phone.length < 9) return jsonResponse({ error: "Số điện thoại không hợp lệ" }, 400);

  const list = await getWhitelist(env.SESSIONS);
  if (!list.includes(phone)) {
    list.push(phone);
    await saveWhitelist(env.SESSIONS, list);
  }
  return jsonResponse({ phones: list });
}

// DELETE /api/admin/phones { phone } — xoá SĐT
export async function onRequestDelete({ request, env }) {
  if (!await requireAdmin(request, env.SESSIONS)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid body" }, 400); }

  const phone = normalizePhone(body.phone);
  const list = await getWhitelist(env.SESSIONS);
  const newList = list.filter(p => p !== phone);
  await saveWhitelist(env.SESSIONS, newList);
  return jsonResponse({ phones: newList });
}
