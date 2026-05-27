# ThayBot

Web app tạo đề thi tự động bằng AI, dành cho giáo viên Toán Việt Nam.

## Tính năng

- Tạo đề thi hoàn chỉnh (trắc nghiệm + tự luận) qua AI
- Vẽ hình hình học 3D tự động (hình cầu, hộp, chóp, lăng trụ, trụ, nón)
- Công thức toán học bằng KaTeX
- Xuất PDF chuẩn định dạng đề thi Việt Nam
- Đăng nhập bằng Zalo OAuth, Google OAuth, hoặc OTP qua SMS

## Stack

- **Frontend**: HTML + Tailwind CSS + KaTeX
- **Backend**: Cloudflare Pages Functions (Workers runtime)
- **AI**: Cloudflare Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- **Session**: Cloudflare KV

## Chạy local

Tạo file `.dev.vars` (Cloudflare sẽ tự đọc khi chạy local):

```env
ZALO_APP_ID=your_zalo_app_id
ZALO_APP_SECRET=your_zalo_app_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
BASE_URL=http://localhost:8788
```

Cài dependencies và chạy:

```bash
npm install -g wrangler
wrangler pages dev .
```

Mở trình duyệt tại `http://localhost:8788/login.html`.

## Deploy

Xem hướng dẫn chi tiết trong [DEPLOY.md](DEPLOY.md).

Tóm tắt nhanh:

```bash
wrangler pages deploy . --project-name=examrender
```

## Biến môi trường (Cloudflare Dashboard)

Đặt trong **Pages → Settings → Environment variables**:

| Key                   | Mô tả                             |
|-----------------------|-----------------------------------|
| `ZALO_APP_ID`         | App ID từ Zalo Developers         |
| `ZALO_APP_SECRET`     | App Secret từ Zalo Developers     |
| `GOOGLE_CLIENT_ID`    | Client ID từ Google Cloud Console |
| `GOOGLE_CLIENT_SECRET`| Client Secret từ Google Cloud     |
| `BASE_URL`            | URL production của Pages project  |

## Bảo mật

- **Không** commit `.env` hay `.dev.vars` lên git (đã có trong `.gitignore`)
- Mọi secret chỉ đặt trong Cloudflare Dashboard hoặc file `.dev.vars` local
