# ExamRender

Web app tao de thi va dang nhap bang Zalo OAuth.

## Chay local

Tao file `.env` tu `.env.example`, dien Zalo app info, roi chay:

```powershell
npm start
```

URL local:

```text
http://localhost:3000/login.html
```

## Deploy Render

Render service URL:

```text
https://examrender-136u.onrender.com
```

Render environment variables can be:

```env
ZALO_APP_ID=your_zalo_app_id
ZALO_APP_SECRET=your_new_zalo_app_secret
```

`BASE_URL` is optional on Render because the server also reads Render's `RENDER_EXTERNAL_URL`.
If you set it manually, use:

```env
BASE_URL=https://examrender-136u.onrender.com
```

## Zalo Developers

Set app domain:

```text
examrender-136u.onrender.com
```

Set callback / redirect URI:

```text
https://examrender-136u.onrender.com/api/auth/zalo/callback
```

Do not commit `.env`; it contains secrets.
