# ThayBot / ExamRender — Tài liệu kiến trúc kỹ thuật (All-in-One trên VPS)

> **Phạm vi:** Thuần kỹ thuật (không gồm chi phí/định giá).
> **Repo:** `github.com/theSummerRain-08/ExamRender`
> **Mục đích:** Tái cấu trúc từ mô hình lai Cloudflare hiện tại sang **một VPS duy nhất chạy Docker**, bổ sung dựng hình TikZ/Asymptote, chấm trắc nghiệm OpenCV và định tuyến mô hình AI theo từng việc.
>
> **Đã có bản thử nghiệm chạy được** (`thaybot-vps.zip`): đường ống tạo đề → tách thẻ hình → biên dịch TikZ + Asymptote → SVG đã kiểm chứng end-to-end (2 hình render, 0 lỗi, nhãn tiếng Việt chuẩn). Các lệnh/gói trong mục 7 là cấu hình **đã chạy thật**, không phải lý thuyết.

---

## Mục lục

1. [Hiện trạng repo](#1-hiện-trạng-repo)
2. [Mục tiêu tái cấu trúc](#2-mục-tiêu-tái-cấu-trúc)
3. [Hạ tầng VPS](#3-hạ-tầng-vps)
4. [Kiến trúc All-in-One](#4-kiến-trúc-all-in-one)
5. [Luồng vận hành theo từng việc](#5-luồng-vận-hành-theo-từng-việc)
6. [Thành phần hệ thống](#6-thành-phần-hệ-thống)
7. [Dịch vụ Render hình — TikZ & Asymptote](#7-dịch-vụ-render-hình--tikz--asymptote)
8. [Phân vai mô hình AI](#8-phân-vai-mô-hình-ai)
9. [Lộ trình chuyển từ hiện trạng](#9-lộ-trình-chuyển-từ-hiện-trạng)
10. [Docker Compose đề xuất](#10-docker-compose-đề-xuất)
11. [Vá bảo mật bắt buộc](#11-vá-bảo-mật-bắt-buộc)
12. [Vận hành & mở rộng](#12-vận-hành--mở-rộng)
13. [Checklist triển khai theo giai đoạn](#13-checklist-triển-khai-theo-giai-đoạn)

---

## 1. Hiện trạng repo

Repo hiện có hai phần mã backend:

- **`server.js`** — máy chủ Node.js thuần (module `http`): phục vụ file tĩnh, đăng nhập Zalo (PKCE), lưu session trong RAM.
- **`functions/api/*`** — Cloudflare Pages Functions (Workers runtime): `generate.js`, `chat.js`, `homework.js`, nhóm `auth/*`, `exam/*` — phần đang vận hành.

Hướng tái cấu trúc dưới đây **tận dụng cả hai**: lấy lại `server.js` làm app chính và mang logic `functions/api/*` về cùng một nơi (mục 9). Hai phần không xung đột; chỉ dọn lại nếu thấy cần cho gọn, không thì để nguyên.

**Phụ thuộc bên ngoài hiện tại:**

| Hạng mục | Hiện tại | Vị trí |
|---|---|---|
| Tạo đề / chat | Cloudflare Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `functions/api/generate.js`, `chat.js` |
| Đọc ảnh (bài tập SGK) | Workers AI vision — `@cf/llava-hf/llava-1.5-7b-hf` | `functions/api/homework.js` |
| Session | Cloudflare KV (`env.SESSIONS`) | `functions/api/_shared.js` |
| Vẽ hình | GeoGebra + 6 khuôn mẫu `data-shape` | `index.html`, `exam-view.html` |
| OTP SMS | Twilio Verify | `functions/api/auth/otp/*` |
| Đăng nhập | Zalo OAuth, Google OAuth | `functions/api/auth/zalo/*`, `google/*` |

> **Nhận định kỹ thuật:** Hệ "vẽ hình bằng khuôn mẫu GeoGebra" (chỉ 6 loại hình cứng) là nguyên nhân chính khiến hình hình học sai; `llama-3.3-70b` yếu suy luận Toán. Đây là hai trọng tâm nâng cấp.

---

## 2. Mục tiêu tái cấu trúc

1. **Gom về một VPS duy nhất** chạy Docker — một nơi triển khai, một nơi quản lý, đặt tại Việt Nam (mục 3).
2. **Thay GeoGebra bằng TikZ (hình phẳng) + Asymptote (hình không gian)** — chuẩn của cộng đồng giáo viên Toán Việt Nam — hai dây chuyền biên dịch riêng trong Docker (mục 7).
3. **Thay AI yếu Toán** bằng mô hình mạnh qua API, định tuyến nhiều mô hình theo từng việc (mục 8).
4. **Bổ sung chấm trắc nghiệm bằng OpenCV (OMR)** — chạy nội bộ trên VPS, chính xác, không tốn API.
5. **Bổ sung đọc ảnh đề/SGK/bài làm** bằng mô hình đa phương thức để trộn đề mới và chấm tự luận.
6. **Vá các lỗ hổng bảo mật** hiện có (mục 11).

**Giữ nguyên (không đập đi):** ý tưởng sản phẩm, giao diện HTML + Tailwind, KaTeX, khuôn định dạng đề thi Việt Nam, đăng nhập Zalo/Google.

---

## 3. Hạ tầng VPS

Đặt máy chủ **tại Việt Nam** là bắt buộc: vừa để tải nhanh, vừa cần **IP Việt Nam để xác minh đăng nhập Zalo phía máy chủ** (Zalo chặn IP nước ngoài — gắn với việc vá lỗ hổng ở mục 11.1).

**Lựa chọn dự kiến:**

| Hạng mục | Thông số |
|---|---|
| Nhà cung cấp | AZDIGI — AMD Cloud Server (`azdigi.com/amd-cloud-server`) |
| Gói | AMD CS 3 |
| CPU | 2 vCPU (AMD EPYC) |
| RAM | 4 GB |
| Lưu trữ | 30 GB NVMe |
| Mạng | 1 Gbps |
| IP | 1 IPv4 |

- **Đủ cho thử nghiệm:** suy luận AI + đọc ảnh chạy ở dịch vụ ngoài (không ngốn VPS); OMR nhẹ. Tải nặng nhất là biên dịch hình TikZ/Asymptote — 4 GB RAM + 2 vCPU đủ cho vài chục giáo viên không dùng đồng thời.
- **Dung lượng ổ:** `texlive-full` nặng vài GB; 30 GB NVMe vẫn vừa, nhưng nên đẩy ảnh hình/ảnh bài chấm ra kho object riêng (mục 6.4).
- **Khi nào nâng cấp:** theo dõi RAM lúc render hình và độ trễ; thường xuyên cao thì nâng gói lớn hơn (vd AMD CS 5). Dấu hiệu ở mục 12.
- **Yêu cầu:** toàn quyền root, cài được Docker (VPS Linux thường đều đáp ứng — xác nhận khi đăng ký).

---

## 4. Kiến trúc All-in-One

Toàn bộ phần "chạy" nằm trong một VPS (Docker Compose). Chỉ **hai** thứ gọi ra ngoài: **API mô hình AI** (qua OpenRouter) và **SMS OTP** (Twilio — tùy chọn, mục 6.6).

```
                        ┌───────────────── VPS (Việt Nam) · Docker Compose ──────────────────┐
                        │                                                                    │
 ┌────────────┐         │   ┌──────────────────┐        ┌───────────────────────────┐        │      ┌──────────────────┐
 │ Trình duyệt│────────────▶│  Web / API server│───────▶│ Render hình               │        │      │  Dịch vụ ngoài   │
 │ (giáo viên)│         │   │  Node (server.js)│        │  TikZ(pdflatex)·Asy(asy)  │        │      │                  │
 └────────────┘         │   │  điều phối       │        └───────────────────────────┘        │      │  OpenRouter      │
                        │   │  Zalo/Google     │───────▶│ OMR / OpenCV (chấm TN)    │        │─────▶│  DeepSeek·Gemini │
                        │   │                  │        └───────────────────────────┘        │      └──────────────────┘
                        │   │                  │───────▶│ File tĩnh (HTML·Tailwind·KaTeX)│   │      ┌──────────────────┐
                        │   └────────┬─────────┘        └───────────────────────────┘        │─────▶│  Twilio          │
                        │            │                                                       │      │  SMS OTP (tùy chọn)│
                        │            ▼                                                       │      └──────────────────┘
                        │   ┌──────────────────┐                                            │
                        │   │ Lưu trữ          │  Redis/SQLite · session, đề                │
                        │   └──────────────────┘                                            │
                        └────────────────────────────────────────────────────────────────────┘
```

Web/API server là **"nhạc trưởng"**: nhận yêu cầu → gọi dịch vụ phù hợp (render hình / OMR / API AI) → ghép kết quả trả về. Các dịch vụ con giao tiếp nội bộ qua HTTP trong mạng Docker; `render` và `omr` **không** mở cổng ra Internet.

---

## 5. Luồng vận hành theo từng việc

**Nguyên tắc:** mỗi yêu cầu chỉ đi qua **một luồng**, dùng đúng tài nguyên cần — không phải một lệnh kích hoạt mọi dịch vụ.

| Việc | Đầu vào | Xử lý | Đầu ra |
|---|---|---|---|
| **Soạn đề** | gõ chữ / chụp ảnh đề | Gemini (chỉ khi có ảnh) → DeepSeek → TikZ/Asymptote | Đề mới có hình + đáp án + PDF |
| **Chấm trắc nghiệm** | ảnh phiếu tô tròn | OpenCV (OMR) trên VPS — không gọi AI | Bảng điểm tự động, tức thì |
| **Chấm tự luận** | ảnh bài viết tay | Gemini đọc → DeepSeek chấm nháp | Điểm + nhận xét → **giáo viên duyệt** |

### 5.1. Chi tiết luồng "chụp đề cũ → trộn đề mới có hình"

1. Giáo viên tải ảnh đề/SGK → web server gọi **mô hình vision (Gemini)** bóc nội dung thành văn bản có cấu trúc.
2. Web server gửi văn bản + yêu cầu trộn cho **DeepSeek**; mô hình trả về HTML đề + **các đoạn code TikZ/Asymptote** cho hình (thay thế thẻ `data-shape` cũ).
3. Web server tách code hình, gọi **dịch vụ Render hình** biên dịch ra SVG/PNG.
4. Web server ghép HTML + ảnh hình + KaTeX → đề hoàn chỉnh, cho xuất PDF.

> Mô hình AI **viết** code hình; bộ biên dịch trong Docker **dựng** ra hình. TikZ/Asymptote **không phải AI** — là công cụ LaTeX chạy trên VPS.

---

## 6. Thành phần hệ thống

### 6.1. Web / API server (Node.js)
- Điều phối + phục vụ API + phục vụ file tĩnh. Phát triển trực tiếp từ `server.js` (có thể chuyển Express cho route gọn hơn).
- Đưa logic `functions/api/*` về thành route: `/api/generate`, `/api/chat`, `/api/homework`, `/api/grade` (mới), `/api/auth/*`, `/api/exam/*`.

### 6.2. Dịch vụ Render hình
TikZ + Asymptote trong Docker — chi tiết ở **mục 7**.

### 6.3. Dịch vụ OMR / OpenCV (chấm trắc nghiệm)
- Python + OpenCV (khởi đầu từ dự án mã nguồn mở `OMRChecker`).
- Quy trình: căn phiếu theo dấu định vị (fiducial) → xác định lưới ô → phát hiện ô tô → so đáp án → trả điểm + thống kê.
- Cần **một mẫu phiếu trả lời chuẩn** để giáo viên in.
- Xử lý hình học xác định (không phải AI) → chính xác cao, không tốn API, chạy nhẹ trên VPS.

### 6.4. Lưu trữ
- Thay Cloudflare KV bằng **Redis** (session, TTL tự hết hạn — sát cách KV đang dùng) hoặc **SQLite/Postgres** nếu cần truy vấn lịch sử đề.
- Ảnh dung lượng lớn (bài chấm, hình) để ra **kho object** (S3-compatible) để không đầy ổ VPS.

### 6.5. Đa phương thức & AI
- Gọi mô hình qua **OpenRouter** (một tài khoản, một API key cho nhiều model). Đổi model = đổi chuỗi tên trong code.
- API key đặt trong biến môi trường, không commit git.

### 6.6. Đăng nhập & SMS OTP (cân nhắc lược bỏ)
- Giữ **Zalo + Google** — không tốn phí, phủ phần lớn giáo viên.
- **SMS OTP (Twilio) có thể bỏ qua** giai đoạn này: tốn phí mỗi tin, cấu hình rườm rà. Có Zalo/Google thì OTP gần như thừa.
- Code `auth/otp/*` đã có sẵn — cần thì bật lại bằng cách nạp khóa Twilio.

---

## 7. Dịch vụ Render hình — TikZ & Asymptote

**Điểm cốt lõi:** TikZ và Asymptote là **hai công cụ khác nhau, hai dây chuyền biên dịch khác nhau** — ở chung container nhưng xử lý không giống nhau. Chia đúng vai mới cho ra hình đẹp.

- **TikZ** — *gói của LaTeX* (nền PGF). Lo **hình phẳng**: tam giác, đường tròn, hình học phẳng dựng hình (`tkz-euclide`), đồ thị hàm số, bảng biến thiên (`tkz-tab`).
- **Asymptote** — *chương trình độc lập* (cú pháp giống C++), **không** biên dịch bằng LaTeX. Lo **khối không gian**: chóp, lăng trụ, nón, trụ, cầu, thiết diện — chiếu 3D thật và tự xử lý nét khuất (nét đứt cho cạnh bị che).

> Đây đúng là chuẩn của giáo viên Toán Việt Nam: TikZ cho hình phẳng, Asymptote cho hình không gian. Hệ `data-shape`/GeoGebra cũ bị bỏ vì chỉ có 6 khuôn cứng.

### 7.1. Cài trong container
- **TeX Live** — kèm: `pgf/tikz`, `tkz-euclide`, `tkz-tab`, `amsmath`, `standalone`, **`texlive-lang-other` (gói vntex — tiếng Việt cho pdflatex)**. Dùng `texlive-full` (vài GB, đơn giản) hoặc cài chọn lọc để tiết kiệm ổ.
- **Asymptote (`asy`)** — thường có sẵn trong TeX Live.
- **poppler-utils (`pdftocairo`, `pdftoppm`)** — chuyển PDF → SVG/PNG. **KHÔNG dùng `dvisvgm`**: dvisvgm xung đột với Ghostscript ≥ 10.01 trên Ubuntu 24 (đã vấp khi dựng bản thử nghiệm — lỗi "Ghostscript version isn't supported").
- **Engine LaTeX:** đường đã kiểm chứng là **`pdflatex` + `[utf8]{inputenc}` + `[T5]{fontenc}`** (vntex) — tiếng Việt có dấu hiển thị chuẩn, cài nhẹ. Phương án thay thế: `lualatex`/`xelatex` + `fontspec` nếu cần font Unicode tùy chọn (mục 7.6).

### 7.2. Đường A — biên dịch TikZ (hình phẳng)

1. Bọc code vào template `standalone` (tự cắt sát mép hình) — template đã kiểm chứng:

   ```latex
   \documentclass[border=4pt]{standalone}
   \usepackage[utf8]{inputenc}
   \usepackage[T5]{fontenc}      % tiếng Việt (vntex)
   \usepackage{amsmath,amssymb}
   \usepackage{tikz}
   \usetikzlibrary{calc,intersections,angles,quotes,arrows.meta}
   \begin{document}
     <CODE TikZ của AI>
   \end{document}
   ```

2. Biên dịch:

   ```bash
   pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape fig.tex
   ```

3. Xuất ảnh:

   ```bash
   pdftocairo -svg fig.pdf fig.svg         # SVG vector — ưu tiên web
   pdftoppm -png -r 300 -singlefile fig.pdf fig   # PNG 300 DPI khi cần in
   ```

### 7.3. Đường B — biên dịch Asymptote (khối không gian)

1. Ghi code vào `.asy`. Phần đầu đặt: kích thước (`size(...)`), phép chiếu (`currentprojection=orthographic(...)`) và `texpreamble` cho nhãn tiếng Việt (vì `asy` gọi LaTeX dựng chữ).
2. Biên dịch **trực tiếp bằng `asy`** (không qua pdflatex):

   ```bash
   asy -f svg -render=0 -o hinh file.asy   # hình khối dạng nét (cạnh + nét khuất đứt) -> vector
   asy -f pdf -o hinh file.asy             # hoặc PDF
   asy -f png -render=4 -o hinh file.asy   # PNG khi có mặt tô bóng
   ```

3. `asy` tự gọi LaTeX dựng nhãn → cần TeX Live trong cùng container (đã có sẵn).

### 7.4. So sánh hai đường

|  | TikZ (hình phẳng) | Asymptote (khối không gian) |
|---|---|---|
| Bản chất | Gói của LaTeX | Chương trình `asy` riêng |
| Biên dịch | `pdflatex` (T5/vntex) → PDF | `asy` trực tiếp |
| Xuất ảnh | `pdftocairo` / `pdftoppm` | `asy -f svg\|pdf\|png` |
| Hợp với | tam giác, đường tròn, đồ thị, hình học phẳng | chóp, lăng trụ, nón, cầu, thiết diện |

### 7.5. AI nối với render

Prompt yêu cầu mô hình bọc mỗi hình trong thẻ **ghi rõ loại**:

```html
<figure type="tikz"> ...code TikZ... </figure>
<figure type="asy">  ...code Asymptote... </figure>
```

Web server quét thẻ: `type="tikz"` → **Đường A**, `type="asy"` → **Đường B**; nhận ảnh rồi thay vào đúng vị trí trong HTML đề. Cơ chế thẻ-có-loại này thay thế hệ `data-shape` cũ.

### 7.6. Tiếng Việt trong nhãn hình (quan trọng)

Nhãn như "Hình chóp S.ABCD", "đường trung tuyến" có dấu tiếng Việt. **Đường đã kiểm chứng:** `pdflatex` + `\usepackage[utf8]{inputenc}` + `\usepackage[T5]{fontenc}` (gói vntex trong `texlive-lang-other`) — hiển thị dấu chuẩn, không cần cấu hình thêm. Phương án thay thế khi cần font Unicode tùy chọn: `lualatex`/`xelatex` + `fontspec`; với Asymptote thì đặt `texengine`/`texpreamble` tương ứng. Lưu ý: `pdflatex` **không kèm T5** thì nhãn tiếng Việt sẽ hỏng — phải có đủ hai dòng usepackage trên.

### 7.7. Ổn định & an toàn
- **Timeout mỗi job** (10–20 giây) + **hàng đợi** — biên dịch nặng CPU theo đợt.
- **Sandbox:** code AI sinh phải biên dịch cô lập — tắt shell-escape (`-no-shell-escape`), giới hạn RAM/CPU/dung lượng ghi, **không cho container render ra mạng**.
- **Cache theo hash:** cùng code → cùng ảnh, lưu lại để khỏi biên dịch lại.

### 7.8. Ghép vào đề & xuất PDF
Ảnh SVG nhúng thẳng vào HTML đề (cùng KaTeX). Xuất PDF cuối bằng headless browser (Puppeteer/Playwright) — SVG sắc nét cả màn hình lẫn bản in.

> TikZ/Asymptote cần chạy chương trình thật (`pdflatex`, `asy`, `pdftocairo`) → **không chạy được trên Cloudflare**. Đây là lý do kỹ thuật cốt lõi để chuyển sang VPS.

---

## 8. Phân vai mô hình AI

Không dùng một mô hình cho mọi việc. Định tuyến qua **OpenRouter**, chọn model theo loại tác vụ:

### 8.1. Đọc ảnh / file (vision)

- **Mặc định: `google/gemini-3.1-flash-lite`** cho **mọi** việc đọc ảnh/file — đọc đề chụp, SGK, bài làm. Đa phương thức (text/image/video/PDF), nhanh, rẻ.
- **Nâng cấp có điều kiện: `google/gemini-2.5-flash`** — **chỉ** dùng cho **riêng ca** mà Flash Lite đọc **chữ viết tay không đạt**. Không bật mặc định; backend chỉ chuyển sang model này cho đúng yêu cầu khó đó.

> DeepSeek **không** đọc được ảnh (chỉ text→text) — nên mọi việc liên quan ảnh đều phải qua Gemini.

### 8.2. Suy luận / tạo đề (text → text)

- **`deepseek/deepseek-v4-flash`** — việc thường: tạo đề cơ bản, trộn đề đơn giản, câu hỏi ngắn. Rẻ, nhanh; mạnh nội dung học thuật (xếp hạng cao mục Academia).
- **`deepseek/deepseek-v4-pro`** — **việc khó**: đề nâng cao, bài cần **suy luận nhiều bước**, **viết code hình phức tạp** (TikZ/Asymptote nhiều chi tiết). Suy luận mạnh hơn, đổi lại đắt hơn.

### 8.3. Chấm trắc nghiệm
- **Không dùng AI** → **OpenCV (OMR)** trên VPS. Xác định, chính xác, không tốn API.

### 8.4. Bảng tổng hợp định tuyến

| Việc | Model | Khi nào dùng |
|---|---|---|
| Đọc ảnh đề/SGK/bài làm | `gemini-3.1-flash-lite` | **Mặc định** cho mọi việc đọc ảnh/file |
| Đọc chữ viết tay khó | `gemini-2.5-flash` | Chỉ ca riêng khi Flash Lite không đạt |
| Tạo/trộn đề thường | `deepseek-v4-flash` | Đề cơ bản, câu hỏi ngắn |
| Đề khó / suy luận nhiều bước / code hình phức tạp | `deepseek-v4-pro` | Việc khó |
| Chấm trắc nghiệm | OpenCV (OMR) | Phiếu tô tròn — không dùng AI |

> **Lưu ý dữ liệu:** DeepSeek đặt hạ tầng tại Trung Quốc (qua OpenRouter). Với đề thi thông thường thì chấp nhận được; cân nhắc nếu nội dung nhạy cảm. Không dùng model "miễn phí/alpha" cho sản phẩm thật (dễ thay đổi, thường ghi log dữ liệu).
>
> Tên model trên là tại thời điểm soạn thảo — xác nhận lại chuỗi model hiện hành trên OpenRouter trước khi triển khai.

---

## 9. Lộ trình chuyển từ hiện trạng

Hướng này lấy lại `server.js` làm app chính và gom logic `functions/api/*` về cùng một nơi — về cơ bản là đưa code Cloudflare quay lại chạy như một app Node bình thường, đặt trên VPS + Docker, rồi thêm hai dịch vụ mới (render hình, OMR). Việc IT đã quen, không phải học kiến trúc lạ.

### Bước 1 — Lấy `server.js` làm app chính
Giữ phần đã có sẵn (file tĩnh, Zalo PKCE, session); tùy chọn chuyển Express cho dễ mở rộng route.

### Bước 2 — Đưa logic `functions/api/*` về route Node

Mỗi Cloudflare Function ánh xạ gần 1–1 thành một route:

| Cloudflare Function | Route Node | Việc cần đổi |
|---|---|---|
| `functions/api/generate.js` | `POST /api/generate` | `env.AI.run()` → OpenRouter; thêm tách & render code hình |
| `functions/api/chat.js` | `POST /api/chat` | `env.AI.run()` → OpenRouter |
| `functions/api/homework.js` | `POST /api/homework` | `llava` → Gemini 3.1 Flash Lite (vision) |
| `functions/api/auth/*` | `/api/auth/*` | Zalo verify chuyển về **server-side** (mục 11.1) |
| `functions/api/exam/*` | `/api/exam/*` | `env.SESSIONS` (KV) → Redis/SQLite |
| `functions/api/_shared.js` | module helper Node | Web Crypto/KV → API Node + Redis |

### Bước 3 — Thay phụ thuộc gắn-Cloudflare
- `env.AI.run("@cf/…")` → `fetch` tới OpenRouter (chọn model theo mục 8).
- `env.SESSIONS` (KV) → Redis (`get/set/expire`) — sát hàm `getSession/saveSession` trong `_shared.js`.
- GeoGebra + `data-shape` → prompt yêu cầu model xuất code TikZ/Asymptote + thêm bước gọi dịch vụ Render hình.

### Bước 4 — Thêm hai dịch vụ con
- Render hình (TeX Live + Asymptote) — container riêng.
- OMR (OpenCV) — container riêng.
- Web server gọi qua HTTP nội bộ.

### Bước 5 — Đóng gói Docker Compose & HTTPS
Gói tất cả thành service trong `docker-compose.yml`, đặt sau reverse proxy (Nginx/Caddy) để có HTTPS.

---

## 10. Docker Compose đề xuất

```yaml
services:
  web:                  # Node app (từ server.js) — điều phối + API + tĩnh
    build: ./web
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - ZALO_APP_ID=${ZALO_APP_ID}
      - ZALO_APP_SECRET=${ZALO_APP_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - REDIS_URL=redis://store:6379
      - RENDER_URL=http://render:8001
      - OMR_URL=http://omr:8002
    depends_on: [store, render, omr]

  render:               # TeX Live + Asymptote -> SVG/PNG (sandbox)
    build: ./render
    # KHÔNG mở cổng ra ngoài; chỉ web gọi nội bộ

  omr:                  # Python + OpenCV (chấm trắc nghiệm)
    build: ./omr

  store:                # Redis (session, đề; TTL)
    image: redis:7-alpine

  proxy:                # Nginx/Caddy -> HTTPS, route về web
    image: caddy:2
    ports: ["80:80", "443:443"]
    depends_on: [web]
```

> `render` và `omr` không mở cổng ra Internet — chỉ `web` gọi trong mạng nội bộ Compose. Bí mật nạp từ `.env` (không commit).

---

## 11. Vá bảo mật bắt buộc

> **Ghi chú đặc biệt:** Phần ưu tiên cao nhất — làm **trước** khi mở cho giáo viên dùng thật. Đây là "bắt buộc", không phải "nên có"; riêng 11.1 có thể khiến bất kỳ ai mạo danh người khác nếu không vá.

### 11.1. Sửa luồng xác thực Zalo *(NGHIÊM TRỌNG)*
Hiện trong `functions/api/auth/session.js`, máy chủ nhận thẳng `{ sid, user }` do trình duyệt gửi và lưu thành phiên hợp lệ, **không kiểm chứng với Zalo** → bất kỳ ai cũng giả mạo đăng nhập được.

Mánh "để trình duyệt tự đổi token" tồn tại vì Cloudflare ngoài VN bị Zalo chặn. Khi sang **VPS đặt tại Việt Nam**, máy chủ tự gọi Zalo được → bỏ hẳn cơ chế client gửi `{sid, user}`. Server tự đổi `code → token`, tự lấy hồ sơ, rồi mới tạo phiên. Vừa vá lỗ hổng, vừa là lý do kỹ thuật để đặt máy ở VN.

### 11.2. Chống chèn mã (XSS)
Nội dung đề (AI sinh / đề lưu chia sẻ) đang nhét vào trang bằng `innerHTML` (`exam-view.html`, `index.html`) + link chia sẻ công khai. Cần **làm sạch HTML bằng DOMPurify** trước khi hiển thị.

### 11.3. Giới hạn tần suất (rate limit)
Thêm cho `/api/generate`, `/api/auth/otp/send`, `/api/grade` — tránh spam tốn API/SMS và quá tải render.

### 11.4. Cô lập biên dịch hình
Code TikZ/Asymptote do AI sinh phải biên dịch trong sandbox: tắt shell-escape, giới hạn RAM/CPU/thời gian, không cho container render ra mạng.

### 11.5. Quản lý bí mật
Mọi khóa (OpenRouter, Zalo, Google, Twilio nếu dùng) chỉ trong `.env` trên VPS, không commit. Giữ `.gitignore`. Cân nhắc đưa KV ID đang lộ trong `wrangler.toml` ra ngoài (rủi ro thấp nhưng nên dọn).

---

## 12. Vận hành & mở rộng

- **Điểm nghẽn chính:** biên dịch hình TikZ/Asymptote (CPU theo đợt). OMR và đọc ảnh nhẹ; suy luận AI ở dịch vụ ngoài, không ngốn VPS.
- **Dấu hiệu cần nâng cấp VPS:** thời gian render tăng / hàng đợi dài, hoặc RAM thường xuyên cao → tăng vCPU/RAM (nâng gói), không cần đổi kiến trúc.
- **Sao lưu:** bật sao lưu tự động của nhà cung cấp; định kỳ dump Redis/SQLite.
- **Giám sát:** log tập trung, cảnh báo khi tỷ lệ lỗi render/AI tăng; theo dõi thời gian phản hồi dịch vụ render.
- **Ảnh lớn:** đẩy ảnh bài chấm/hình ra kho object để VPS không đầy ổ.

---

## 13. Checklist triển khai theo giai đoạn

### Giai đoạn 1 — An toàn & nền tảng
- [ ] Dựng VPS (VN) + Docker + reverse proxy HTTPS.
- [ ] Lấy `server.js` làm app chính; đưa các route từ `functions/api/*` về.
- [ ] Chuyển session KV → Redis.
- [ ] **Vá lỗ hổng xác thực Zalo (server-side) + DOMPurify + rate limit.**

### Giai đoạn 2 — Chất lượng đề & hình *(trọng tâm)*
- [ ] Dựng dịch vụ Render hình (TeX Live + Asymptote) + sandbox.
- [ ] Đổi prompt: AI xuất code TikZ/Asymptote (thẻ `type="tikz"|"asy"`) thay `data-shape`.
- [ ] Chuyển AI sang OpenRouter; định tuyến model theo mục 8.
- [ ] Nâng đọc ảnh: `llava` → Gemini 3.1 Flash Lite (cho `homework` & trộn đề từ ảnh).

### Giai đoạn 3 — Chấm bài
- [ ] Dựng dịch vụ OMR (OpenCV) + mẫu phiếu trắc nghiệm chuẩn.
- [ ] Chấm tự luận: Gemini đọc → DeepSeek chấm nháp → **giáo viên duyệt**.
- [ ] Hoàn thiện giám sát, sao lưu, kho object cho ảnh.

---

*Bản kỹ thuật để rà soát nội bộ với IT. Tên model AI và công cụ là gợi ý tại thời điểm soạn thảo; xác nhận lại phiên bản hiện hành trước khi triển khai.*
