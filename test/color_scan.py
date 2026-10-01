#!/usr/bin/env python3
"""DB 전수 색 점검 도구.
  python3 test/color_scan.py                # color_suspects.csv 만 생성(DB 변경 없음)
  python3 test/color_scan.py --fix          # '확실(certain)'하게 틀린 카드의 color 한 필드만 교정(백업 data/cards.json.bak-color)
교정 조건: 단일색 DB 값 ↔ FILE 원 판별이 신뢰도≥0.90·유효샘플≥40·유채색, 프레임과 모순 없음. 불확실한 것은 CSV 에만 남긴다.
이미지·효과·ID·AP/LP/코스트 등 다른 필드는 건드리지 않는다."""
import base64, csv, io, json, shutil, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent; sys.path.insert(0, str(ROOT))
from PIL import Image
import card_color as C

def main():
    fix = "--fix" in sys.argv; dbp = ROOT / "data" / "cards.json"; db = json.load(open(dbp, encoding="utf8")); rows = []; fixed = []; n = 0
    for cid, c in db["cards"].items():
        img = c.get("img", "")
        if c.get("type") not in ("char", "event", "case") or not img.startswith("data:image"): continue
        n += 1; im = Image.open(io.BytesIO(base64.b64decode(img.split(",", 1)[1]))).convert("RGB"); r = C.detect(im, c["type"]); dbc = c.get("color", ""); pc = r["color"]
        same = set(pc.split("/")) == set(dbc.split("/")) if pc else False
        auto = bool(r["certain"] and not same and "/" not in dbc and "/" not in pc and dbc != "")
        if same and r["conf"] >= 0.6: continue
        if not pc: reason = "판별 불가"
        elif same: reason = "일치하나 신뢰도 낮음"
        elif auto: reason = "확실히 다름(자동 교정)"
        elif any(x not in C.COLORS_OK for x in dbc.split("/")): reason = "DB 색이 6색 체계 밖"
        else: reason = "다름·불확실(수동 확인)"
        rows.append([cid, c.get("n", ""), c.get("type"), dbc, pc, f"{r['conf']:.2f}", r["source"], f"원={r['badge']}({r['badge_conf']:.2f}) 프레임={r['band']}({r['band_conf']:.2f})", reason, "자동교정" if auto and fix else ("교정대상" if auto else "보류")])
        if auto and fix: c["color"] = pc; fixed.append((cid, dbc, pc))
    out = ROOT / "color_suspects.csv"
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(["ID", "이름", "종류", "현재 DB 색", "재판별 색", "신뢰도", "근거", "상세", "사유", "조치"]); w.writerows(rows)
    if fix and fixed:
        shutil.copy(dbp, str(dbp) + ".bak-color"); json.dump(db, open(dbp, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"검사 {n}장 · 의심/보류 {len(rows)}장 · 자동 교정 {len(fixed) if fix else sum(1 for r in rows if r[-1]=='교정대상')}장 → {out.name}")
    for x in fixed: print("  교정", *x)
if __name__ == "__main__": main()
