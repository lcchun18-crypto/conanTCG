#!/usr/bin/env python3
"""카드 이미지 전체 점검 — CardImage 폴더 ↔ 카드 DB(cards.json) ↔ cards.xlsx 의 image_file 을 비교해 보고서를 만든다 (파일은 바꾸지 않음).

    python tools/audit_images.py                      # 점검 결과를 화면에 출력 + data/image_audit.csv (문제 있는 항목만)
    python tools/audit_images.py --src <폴더>         # 원본 이미지가 다른 폴더에 있을 때 (이전 단계 점검용)

보고 항목: DB 카드 수 / 이미지 파일 수 / 정상 매칭 / 이미지 없는 카드 / DB 에 없는 파일 / 중복(같은 ID·같은 파일을 쓰는 카드·내용이 같은 파일) /
          파일명 불일치(DB 의 file 값 ≠ ID.확장자) / 해상도(평균·최소) / (옛 base64 가 남아 있으면) 원본 교체 가능·base64 만 있는 카드 수.
매칭이 애매한 파일은 자동으로 추측하지 않고 '애매함' 목록으로만 남긴다.
"""
import argparse, base64, csv, hashlib, io, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import card_images as CI  # noqa: E402

ROOT = CI.ROOT


def similar_orphans(cards, orphan_files, src, thr=0.995):
    """DB 에 아직 옛 base64 썸네일이 있을 때만: 파일명이 ID 와 안 맞는 이미지를 '내용'으로 비교한다. 유일하고 확실한(≥thr, 2위와 큰 차이) 것만 확정, 나머지는 애매함."""
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        return {}, list(orphan_files)
    def vec(im):
        if im.size[0] > im.size[1]: im = im.rotate(90, expand=True)
        v = np.asarray(im.convert("L").resize((32, 44), Image.LANCZOS), dtype=float).ravel(); v = v - v.mean(); return v / (np.linalg.norm(v) + 1e-9)
    bv = {}
    for cid, c in cards.items():
        im = c.get("img") or ""
        if im.startswith("data:image"):
            try: bv[cid] = vec(Image.open(io.BytesIO(base64.b64decode(im.split(",", 1)[1]))))
            except Exception: pass
    ok, amb = {}, []
    for f in orphan_files:
        try: v = vec(Image.open(Path(src) / f))
        except Exception: amb.append(f); continue
        sc = sorted(((float(v @ bv[c]), c) for c in bv), reverse=True)[:2]
        if sc and sc[0][0] >= thr and (len(sc) < 2 or sc[0][0] - sc[1][0] > 0.01): ok[f] = (sc[0][1], sc[0][0])
        else: amb.append(f)
    return ok, amb


def audit(db_path, img_dir, xlsx_cards=None, out_csv=None, quiet=False):
    log = (lambda *a: None) if quiet else print
    db = json.loads(Path(db_path).read_text("utf-8")); cards = db["cards"]; d = Path(img_dir)
    files = sorted(p.name for p in d.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")) if d.is_dir() else []
    fset = {f.lower(): f for f in files}
    R = {"db_cards": len(cards), "files": len(files)}
    rows = []           # (구분, ID/파일, 내용)
    matched, noimg, mism, bad_ref = 0, [], [], []; matched_ids = []
    ref = {}            # 파일(소문자) → 사용하는 카드
    res = []
    for cid in sorted(cards):
        c = cards[cid]; f = c.get("file") or ""
        if xlsx_cards is not None and cid in xlsx_cards and "file" in xlsx_cards[cid]: f = xlsx_cards[cid]["file"]
        guess = next((fset[(cid + e).lower()] for e in (".jpg", ".png", ".webp") if (cid + e).lower() in fset), None)
        use = fset.get(f.lower()) if f else None
        use = use or guess      # 파일명이 ID 와 같은 이미지(id_0001.jpg)는 안전하게 매칭된 것으로 본다
        if use: ref.setdefault(use.lower(), []).append(cid); matched += 1; matched_ids.append(cid)
        else:
            noimg.append(cid); rows.append(("이미지 없음", cid, f"file={f!r}" + (f" (ID 이름의 파일 {guess} 은 있음)" if guess else "")))
        if f and guess and f.lower() != guess.lower(): mism.append(cid); rows.append(("파일명 불일치", cid, f"file={f!r} ≠ {guess}"))
        elif f and not guess and f.lower() != (cid + ".jpg"): mism.append(cid); rows.append(("파일명 불일치", cid, f"file={f!r} (ID 와 다른 이름)"))
        if use:
            i = CI.info(d / use)
            if i: res.append((cid, i["w"], i["h"], i["bytes"]))
    used = {k for k in ref}
    orphan = [f for f in files if f.lower() not in used]
    dup_use = {k: v for k, v in ref.items() if len(v) > 1}
    h = {}
    for f in files: h.setdefault(hashlib.md5((d / f).read_bytes()).hexdigest(), []).append(f)
    dup_content = [v for v in h.values() if len(v) > 1]
    for k, v in dup_use.items(): rows.append(("같은 파일을 여러 카드가 사용", k, ", ".join(v)))
    for v in dup_content: rows.append(("내용이 같은 파일", v[0], ", ".join(v)))
    ok_o, amb = similar_orphans(cards, orphan, d)
    bysum = {}
    for v in h.values():
        for f in v: bysum[f] = v
    for f in orphan:
        twin = [x for x in bysum.get(f, []) if x != f and x.lower() in used]
        if twin: rows.append(("DB 에 없는 파일(사용 중인 파일과 내용이 같음 — 지워도 됨)", f, f"= {twin[0]}")); continue
        if f in ok_o: rows.append(("DB 에 없는 파일(내용으로 확정 가능)", f, f"→ {ok_o[f][0]} (옛 썸네일과 유사도 {ok_o[f][1]:.4f})"))
        else: rows.append(("DB 에 없는 파일(애매함, 자동 매칭 안 함)", f, ""))
    amb = [f for f in amb if not any(x != f and x.lower() in used for x in bysum.get(f, []))]
    R.update(matched=matched, noimg=len(noimg), orphan=len(orphan), orphan_confirmable=len(ok_o), orphan_ambiguous=len(amb), dup_use=len(dup_use), dup_content=len(dup_content), mismatch=len(mism))
    if res:
        W = [min(r[1], r[2]) for r in res]; H = [max(r[1], r[2]) for r in res]; B = [r[3] for r in res]
        R.update(res_avg=(sum(r[1] for r in res) // len(res), sum(r[2] for r in res) // len(res)), res_min=min(res, key=lambda r: r[1] * r[2])[1:3], short_avg=sum(W) // len(W), short_min=min(W), long_avg=sum(H) // len(H), bytes_avg=sum(B) // len(B), bytes_min=min(B), bytes_max=max(B), bytes_total=sum(B))
    b64 = {cid: c["img"] for cid, c in cards.items() if (c.get("img") or "").startswith("data:image")}
    wd = CI.web_dir_for(db_path) if not os.environ.get("CARD_IMAGE_WEB_DIR") else CI.web_dir()   # v1.16.0: 게임용 최적화본(CardImageWeb) 현황
    wmiss = [cid for cid in matched_ids if not (wd / CI.web_name(cards[cid].get("file") or cid)).is_file()] if wd.is_dir() else list(matched_ids)
    R["web_dir"] = str(wd); R["web_missing"] = len(wmiss)
    R["b64_cards"] = len(b64)
    if b64:
        up = only = 0; ob = []
        for cid, im in b64.items():
            raw = base64.b64decode(im.split(",", 1)[1]); ob.append(len(raw))
            i = CI.info(d / (cid + ".jpg")) if (d / (cid + ".jpg")).exists() else None
            if i is None:
                key = next((k for k, v in ok_o.items() if v[0] == cid), None)
                i = CI.info(d / key) if key else None
            if i and i["bytes"] > len(raw): up += 1
            else: only += 1
        R.update(upgradable=up, b64_only=only, b64_avg_bytes=sum(ob) // len(ob))
    if out_csv:
        with open(out_csv, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh); w.writerow(["구분", "대상", "내용"]); w.writerows(rows)
    log("카드 이미지 점검")
    log(f"  DB 카드 수                         : {R['db_cards']}")
    log(f"  이미지 폴더의 파일 수               : {R['files']}  ({d})")
    log(f"  정상 매칭된 이미지(카드)            : {R['matched']}")
    log(f"  이미지 없는 카드                    : {R['noimg']}" + (f"  → {', '.join(noimg[:8])}{' …' if len(noimg) > 8 else ''}" if noimg else ""))
    log(f"  DB 에 없는 이미지 파일              : {R['orphan']}  (내용으로 확정 가능 {R['orphan_confirmable']} / 애매함 {R['orphan_ambiguous']})" + (f"  → {', '.join(orphan[:8])}" if orphan else ""))
    log(f"  중복: 같은 파일을 쓰는 카드 {R['dup_use']}건 / 내용이 같은 파일 {R['dup_content']}건")
    log(f"  파일명 불일치(DB file ≠ ID 이름)    : {R['mismatch']}")
    if "res_avg" in R:
        log(f"  해상도 평균 {R['res_avg'][0]}x{R['res_avg'][1]}px / 최소 {R['res_min'][0]}x{R['res_min'][1]}px (짧은 변 평균 {R['short_avg']}, 최소 {R['short_min']})")
        log(f"  파일 크기 평균 {R['bytes_avg'] // 1024}KB (최소 {R['bytes_min'] // 1024}KB ~ 최대 {R['bytes_max'] // 1024}KB, 합계 {R['bytes_total'] / 1e6:.0f}MB)")
    log(f"  게임용 최적화본(CardImageWeb)이 없는 카드     : {R['web_missing']}" + ("  → python tools/make_web_images.py 로 만들 수 있습니다 (그동안은 서버가 원본으로 대신 보여 줍니다)" if R["web_missing"] else ""))
    if R["b64_cards"]:
        log(f"  옛 base64 가 남은 카드              : {R['b64_cards']} (평균 {R['b64_avg_bytes'] / 1024:.1f}KB)")
        log(f"    → 원본 파일로 교체 가능 {R['upgradable']} / base64 밖에 없어 교체 불가 {R['b64_only']}")
    else:
        log("  옛 base64 가 남은 카드              : 0 (모든 카드가 파일 경로 방식)")
    if out_csv: log(f"  상세 목록: {out_csv}")
    return R, rows


def main():
    ap = argparse.ArgumentParser(description="카드 이미지 전체 점검")
    ap.add_argument("--db", default=str(ROOT / "data" / "cards.json")); ap.add_argument("--src", default=None, help="이미지 폴더 (기본: CardImage)")
    ap.add_argument("--csv", default=str(ROOT / "data" / "image_audit.csv")); ap.add_argument("--xlsx", default=None, help="cards.xlsx 의 image_file 값을 기준으로 점검")
    a = ap.parse_args()
    xc = None
    if a.xlsx:
        import cards_xlsx as X
        xc, _m, probs = X.read_workbook(a.xlsx)
        if xc is None: print("Excel 을 읽을 수 없습니다:", probs[0] if probs else ""); return 2
    R, rows = audit(a.db, a.src or CI.img_dir_for(a.db), xc, a.csv)
    return 0


if __name__ == "__main__":
    sys.exit(main())
