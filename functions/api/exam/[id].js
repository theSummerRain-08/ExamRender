/**
 * GET /api/exam/:id
 *
 * Trả về nội dung đề thi từ KV theo ID.
 * Không yêu cầu đăng nhập — link chia sẻ công khai.
 */

import { jsonResponse } from "../_shared.js";

export async function onRequestGet({ params, env }) {
  const { id } = params;
  if (!id) return jsonResponse({ error: "Thiếu ID đề thi" }, 400);

  const raw = await env.SESSIONS.get(`exam:${id}`);
  if (!raw) {
    return jsonResponse({ error: "Không tìm thấy đề thi hoặc đã hết hạn" }, 404);
  }

  let exam;
  try {
    exam = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "Dữ liệu đề thi bị lỗi" }, 500);
  }

  return jsonResponse(exam);
}
