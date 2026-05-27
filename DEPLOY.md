# Hướng dẫn Deploy lên Cloudflare Pages

## Yêu cầu
- Node.js >= 18 đã cài trên máy
- Tài khoản Cloudflare (miễn phí tại https://dash.cloudflare.com/sign-up)

---

## Bước 1 — Cài Wrangler CLI

Mở terminal (Command Prompt hoặc PowerShell) và chạy:

```bash
npm install -g wrangler
```

Kiểm tra cài thành công:

```bash
wrangler --version
```

---

## Bước 2 — Đăng nhập Cloudflare

```bash
wrangler login
```

Trình duyệt sẽ mở ra, đăng nhập tài khoản Cloudflare rồi bấm **Allow**.

---

## Bước 3 — Tạo KV Namespace (lưu session)

```bash
wrangler kv namespace create SESSIONS
```

Lệnh này sẽ in ra kết quả dạng:

```
{ binding = "SESSIONS", id = "abc123def456..." }
```

**Copy ID đó**, mở file `wrangler.toml` và thay `REPLACE_WITH_YOUR_KV_ID` bằng ID vừa copy.

---

## Bước 4 — Tạo Pages project lần đầu

```bash
wrangler pages project create examrender
```

Chọn **Direct Upload** khi được hỏi về production branch.

---

## Bước 5 — Deploy

Chạy lệnh sau từ thư mục gốc của project (cùng cấp với `wrangler.toml`):

```bash
wrangler pages deploy . --project-name=examrender
```

Sau khi deploy xong, Cloudflare sẽ cấp cho bạn một URL dạng:

```
https://examrender.pages.dev
```

---

## Bước 6 — Thêm biến môi trường

Vào [Cloudflare Dashboard](https://dash.cloudflare.com) →
**Pages** → **examrender** → **Settings** → **Environment variables**

Thêm 3 biến sau cho môi trường **Production**:

| Key              | Value                              |
|------------------|------------------------------------|
| `ZALO_APP_ID`    | App ID từ Zalo Developers          |
| `ZALO_APP_SECRET`| App Secret từ Zalo Developers      |
| `BASE_URL`       | `https://examrender.pages.dev`     |

> Nếu bạn dùng custom domain, thay `BASE_URL` bằng domain thực tế của bạn.

---

## Bước 7 — Bind KV Namespace trong Dashboard

Vào **Settings** → **Functions** → **KV namespace bindings** → **Add binding**:

| Variable name | KV namespace  |
|---------------|---------------|
| `SESSIONS`    | `SESSIONS`    |

Bấm **Save**.

---

## Bước 8 — Cập nhật Redirect URI trên Zalo Developers

Vào [Zalo Developers](https://developers.zalo.me) → App của bạn →
**Login** → **Redirect URI**

Xóa URI cũ (`https://examrender-136u.onrender.com/...`), thêm URI mới:

```
https://examrender.pages.dev/api/auth/zalo/callback
```

---

## Bước 9 — Deploy lại (để biến môi trường có hiệu lực)

```bash
wrangler pages deploy . --project-name=examrender
```

---

## Kiểm tra

Mở trình duyệt vào `https://examrender.pages.dev/login.html` và thử đăng nhập Zalo.

---

## Các lần deploy tiếp theo

Mỗi khi sửa code, chỉ cần chạy lại:

```bash
wrangler pages deploy . --project-name=examrender
```

---

## Lưu ý bảo mật

- **KHÔNG** commit file `.env` lên git (đã có trong `.gitignore`)
- Biến môi trường nhạy cảm như `ZALO_APP_SECRET` chỉ đặt trong Cloudflare Dashboard
- Tạo file `.dev.vars` (Cloudflare sẽ tự tìm khi chạy local) để test cục bộ:

```env
ZALO_APP_ID=your_zalo_app_id
ZALO_APP_SECRET=your_zalo_app_secret
BASE_URL=http://localhost:8788
```
