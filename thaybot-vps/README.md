# ThayBot — Bản thử nghiệm chạy được (VPS All-in-One)

Bộ khung triển khai theo tài liệu kiến trúc `ExamRender-KienTruc.md`. Đã kiểm chứng end-to-end: tạo đề → tách thẻ hình → biên dịch TikZ/Asymptote → SVG nhúng vào đề.

## Chạy nhanh (5 phút)

```bash
cp .env.example .env        # de trong OPENROUTER_API_KEY = che do MOCK
docker compose up --build
# mo http://localhost:3000 -> bam "Tao de"
```

**Chế độ MOCK:** khi chưa có API key, server dùng một đề mẫu có sẵn chứa 1 hình phẳng (TikZ) + 1 hình chóp (Asymptote) — đủ để demo toàn bộ đường ống render **mà không tốn một đồng API nào**. Điền `OPENROUTER_API_KEY` vào `.env` là chuyển sang AI thật, không cần sửa code.

## Cấu trúc

```
thaybot-vps/
├── docker-compose.yml      # web + render + omr (store/proxy them sau theo tai lieu)
├── .env.example
├── web/                    # Node/Express — dieu phoi, mock mode, goi render
│   ├── server.js           # POST /api/generate; tach <figure type="tikz|asy">
│   └── public/index.html   # giao dien demo (DOMPurify + KaTeX)
├── render/                 # Flask — POST /render {type, code, format}
│   └── app.py              # pdflatex (T5/vntex tieng Viet) | asy; sandbox + cache + timeout
└── omr/                    # Flask + OpenCV — khung suon cham trac nghiem
    └── app.py              # POST /grade (demo phat hien o to; hoan thien theo OMRChecker)
```

## Ánh xạ với tài liệu kiến trúc

| Tài liệu | Trong repo này |
|---|---|
| Mục 6.1 Web/API server | `web/server.js` |
| Mục 7 Render hình (2 đường TikZ/Asy) | `render/app.py` |
| Mục 6.3 OMR/OpenCV | `omr/app.py` (khung sườn) |
| Mục 8 Định tuyến model | biến `MODEL_*` trong `.env` |
| Mục 11.2 DOMPurify | `web/public/index.html` |
| Mục 11.4 Sandbox biên dịch | `render/app.py` (`-no-shell-escape`, timeout, lọc lệnh cấm) |

## Đã kiểm chứng

- TikZ hình phẳng (tam giác + đường cao) → SVG ✔
- Asymptote hình chóp S.ABCD, nét khuất đứt đúng chuẩn SGK → SVG/PNG ✔
- Nhãn tiếng Việt có dấu (T5/vntex) ✔
- End-to-end `/api/generate` (mock) → 2 hình render, 0 lỗi ✔

## Ghi chú kỹ thuật

- **PDF→SVG dùng `pdftocairo`** (poppler-utils), KHÔNG dùng `dvisvgm` — dvisvgm xung đột với Ghostscript ≥ 10.01 trên Ubuntu 24. Đã vấp và sửa sẵn.
- Asymptote chạy `settings.render=0` (vector) — nét khuất do code chỉ định bằng pen đứt, đúng phong cách giáo viên VN.
- Còn thiếu so với bản sản xuất (làm theo checklist tài liệu): auth Zalo server-side, Redis session, rate limit, route `/api/homework` (Gemini vision), proxy HTTPS.
