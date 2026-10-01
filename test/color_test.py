#!/usr/bin/env python3
"""카드 색 판별 회귀 테스트: python3 test/color_test.py
- 실제 스캔 이미지(첨부 카드 fixture) → red, 해상도 무관(172/256/512)
- 합성: 일러스트가 노랗고 원만 빨강이어도 red / 원이 흰·검 / 금박 테두리가 있어도 원 색을 따른다
- DB: 교정된 id_1109(red)·id_0885(red)·id_0842(blue) 및 단일색 카드 일치율"""
import base64, io, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent; sys.path.insert(0, str(ROOT))
from PIL import Image, ImageDraw
import card_color as C
ok = 0; bad = []
def check(name, cond, extra=""):
    global ok
    if cond: ok += 1
    else: bad.append(f"{name} {extra}")

fx = Image.open(ROOT / "test/fixtures/color/jodie_red.png").convert("RGB")
for w in (172, 256, 512, fx.width):
    im = fx.resize((w, round(fx.height * w / fx.width))); r = C.detect(im, "char")
    check(f"fixture jodie@{w} → red", r["color"] == "red" and r["source"] == "badge", str(r))
check("fixture certain", C.detect(fx.resize((172, round(fx.height * 172 / fx.width))), "char")["certain"])

def synth(circle, bg, W=344, H=480):
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, H - 1], outline=(212, 175, 55), width=int(W * 0.03))   # 금박 테두리
    cx, cy, R = W * 0.085, H * 0.073, W * 0.058
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=circle, outline=(240, 240, 240), width=max(2, int(R * .18)))
    d.text((cx - 3, cy - 5), "8", fill=(255, 255, 255)); return im
for col, rgb in {"red": (214, 40, 40), "blue": (30, 90, 200), "green": (40, 160, 70)}.items():
    r = C.detect(synth(rgb, (235, 200, 60)), "char"); check(f"synth {col} circle on yellow art", r["color"] == col, str(r))
r = C.detect(synth((214, 40, 40), (235, 200, 60), 172, 240), "char"); check("synth red @172", r["color"] == "red", str(r))

db = json.load(open(ROOT / "data/cards.json", encoding="utf8"))["cards"]
def dbimg(cid): return Image.open(io.BytesIO(base64.b64decode(db[cid]["img"].split(",", 1)[1]))).convert("RGB")
for cid, col in (("id_1109", "red"), ("id_0885", "red"), ("id_0842", "blue")):
    check(f"DB {cid} stored", db[cid]["color"] == col, db[cid]["color"]); check(f"DB {cid} detect", C.detect(dbimg(cid), db[cid]["type"])["color"] == col)
tot = agree = 0
for cid, c in db.items():
    if c.get("type") in ("char", "event") and c.get("img", "").startswith("data:") and "/" not in c.get("color", "/"):
        r = C.detect(dbimg(cid), c["type"])
        if r["certain"]: tot += 1; agree += r["color"] == c["color"]
check(f"DB certain 판별 전부 일치 ({agree}/{tot})", tot > 500 and agree == tot)
print(f"color_test: {ok} passed, {len(bad)} failed")
for b in bad: print(" FAIL", b)
sys.exit(1 if bad else 0)
