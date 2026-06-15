"""
Dich vu OMR — cham trac nghiem bang OpenCV (khung suon)
POST /grade  (multipart: file=anh phieu, answers=JSON dap an)
Hien tai: phat hien o tron to dam tren anh nhi phan — demo co ban.
San xuat that: dung mau phieu chuan co dau dinh vi (fiducial) + can chinh
perspective; tham khao du an ma nguon mo OMRChecker de hoan thien.
"""
import json
import cv2
import numpy as np
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify(ok=True)

@app.post("/grade")
def grade():
    if "file" not in request.files:
        return jsonify(error="thieu file anh"), 400
    buf = np.frombuffer(request.files["file"].read(), np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return jsonify(error="khong doc duoc anh"), 400

    # Demo: dem cac o tron to dam (vung toi co dien tich phu hop)
    _, th = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bubbles = []
    for c in contours:
        area = cv2.contourArea(c)
        if 80 < area < 5000:
            (x, y), r = cv2.minEnclosingCircle(c)
            circularity = area / (np.pi * r * r + 1e-6)
            if circularity > 0.6:
                bubbles.append({"x": int(x), "y": int(y), "r": int(r)})

    answers = request.form.get("answers")
    return jsonify(
        detected_bubbles=len(bubbles),
        bubbles=bubbles[:200],
        note="Khung suon demo. Trien khai that: mau phieu chuan + can chinh fiducial (xem OMRChecker).",
        answers_received=json.loads(answers) if answers else None,
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8002)
