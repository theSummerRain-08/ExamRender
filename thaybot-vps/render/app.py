"""
Dich vu Render hinh — TikZ (hinh phang) & Asymptote (khoi khong gian)
POST /render  {"type": "tikz"|"asy", "code": "...", "format": "svg"|"png"}
Tra ve: image/svg+xml hoac image/png

- TikZ: boc vao template standalone, bien dich pdflatex (T5/vntex cho tieng Viet co dau)
- Asymptote: chay truc tiep bang `asy`
- Sandbox: -no-shell-escape, timeout moi job, thu muc tam rieng, xoa sau khi xong
"""
import os
import re
import shutil
import subprocess
import tempfile
import hashlib

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

JOB_TIMEOUT = int(os.environ.get("RENDER_TIMEOUT", "20"))  # giay
CACHE_DIR = os.environ.get("RENDER_CACHE", "/tmp/render-cache")
os.makedirs(CACHE_DIR, exist_ok=True)

TIKZ_TEMPLATE = r"""\documentclass[border=4pt]{standalone}
\usepackage[utf8]{inputenc}
\usepackage[T5]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{tikz}
\usetikzlibrary{calc,intersections,angles,quotes,arrows.meta}
\begin{document}
%s
\end{document}
"""

ASY_HEADER = """settings.outformat="%s";
settings.render=0;
import three;
"""

# Cac lenh nguy hiem khong cho phep trong code nguoi dung / AI sinh
FORBIDDEN = re.compile(
    r"\\(write18|input|include|openout|openin|catcode|immediate)\b"
    r"|\bshell\b|\bsystem\s*\(|\beval\s*\(|\bimport\s+settings",
    re.IGNORECASE,
)


def _cache_path(kind: str, code: str, fmt: str) -> str:
    h = hashlib.sha256(f"{kind}|{fmt}|{code}".encode()).hexdigest()[:32]
    return os.path.join(CACHE_DIR, f"{h}.{fmt}")


def _run(cmd, cwd):
    return subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, timeout=JOB_TIMEOUT
    )


@app.get("/health")
def health():
    return jsonify(ok=True)


@app.post("/render")
def render():
    data = request.get_json(force=True, silent=True) or {}
    kind = (data.get("type") or "").strip().lower()
    code = data.get("code") or ""
    fmt = (data.get("format") or "svg").strip().lower()

    if kind not in ("tikz", "asy"):
        return jsonify(error="type phai la 'tikz' hoac 'asy'"), 400
    if fmt not in ("svg", "png"):
        return jsonify(error="format phai la 'svg' hoac 'png'"), 400
    if not code.strip():
        return jsonify(error="thieu code"), 400
    if len(code) > 60_000:
        return jsonify(error="code qua dai"), 400
    if FORBIDDEN.search(code):
        return jsonify(error="code chua lenh khong duoc phep"), 400

    # Cache: cung code -> cung anh
    cached = _cache_path(kind, code, fmt)
    if os.path.exists(cached):
        return send_file(cached, mimetype=("image/svg+xml" if fmt == "svg" else "image/png"))

    workdir = tempfile.mkdtemp(prefix="render-")
    try:
        if kind == "tikz":
            out = _render_tikz(code, fmt, workdir)
        else:
            out = _render_asy(code, fmt, workdir)
        if out is None:
            return jsonify(error="bien dich that bai", log=_tail_log(workdir)), 422
        shutil.copyfile(out, cached)
        return send_file(cached, mimetype=("image/svg+xml" if fmt == "svg" else "image/png"))
    except subprocess.TimeoutExpired:
        return jsonify(error=f"qua thoi gian bien dich ({JOB_TIMEOUT}s)"), 422
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _render_tikz(code: str, fmt: str, workdir: str):
    # Neu AI gui ca document thi dung nguyen; khong thi boc template
    tex = code if r"\documentclass" in code else TIKZ_TEMPLATE % code
    tex_path = os.path.join(workdir, "fig.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex)

    r = _run(
        ["pdflatex", "-interaction=nonstopmode", "-halt-on-error",
         "-no-shell-escape", "fig.tex"],
        workdir,
    )
    pdf = os.path.join(workdir, "fig.pdf")
    if r.returncode != 0 or not os.path.exists(pdf):
        return None

    if fmt == "svg":
        out = os.path.join(workdir, "fig.svg")
        r2 = _run(["pdftocairo", "-svg", "fig.pdf", "fig.svg"], workdir)
        return out if r2.returncode == 0 and os.path.exists(out) else None
    else:
        r2 = _run(["pdftoppm", "-png", "-r", "300", "-singlefile", "fig.pdf", "fig"], workdir)
        out = os.path.join(workdir, "fig.png")
        return out if r2.returncode == 0 and os.path.exists(out) else None


def _render_asy(code: str, fmt: str, workdir: str):
    # Them header neu code chua co settings/import three
    body = code
    if "settings.outformat" not in body:
        body = (ASY_HEADER % fmt) + body
    else:
        body = re.sub(r'settings\.outformat\s*=\s*"[a-z]+"',
                      f'settings.outformat="{fmt}"', body)

    asy_path = os.path.join(workdir, "fig.asy")
    with open(asy_path, "w", encoding="utf-8") as f:
        f.write(body)

    r = _run(["asy", "-noV", "-f", fmt, "-o", "fig", "fig.asy"], workdir)
    out = os.path.join(workdir, f"fig.{fmt}")
    return out if r.returncode == 0 and os.path.exists(out) else None


def _tail_log(workdir: str) -> str:
    log = os.path.join(workdir, "fig.log")
    if not os.path.exists(log):
        return ""
    with open(log, errors="ignore") as f:
        return f.read()[-1500:]


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8001")))
