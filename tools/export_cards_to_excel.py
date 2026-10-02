#!/usr/bin/env python3
"""data/cards.json  →  data/cards.xlsx  (병합 방식: 내가 Excel 에서 고친 값은 지우지 않는다)

    python tools/export_cards_to_excel.py                       # xlsx 가 없으면 새로 만들고, 있으면 "새 카드 행만 추가"
    python tools/export_cards_to_excel.py --update-ids id_0123  # 해당 카드의 행은 JSON 값으로 덮어쓰기 (신탄 재처리 등)
    python tools/export_cards_to_excel.py --prefer-json         # 모든 카드를 JSON 값으로 덮어쓰기 (Excel 수정분은 사라짐!)
    python tools/export_cards_to_excel.py --rebuild             # 병합 없이 Excel 을 JSON 으로 새로 만들기

병합 규칙: ID 가 양쪽에 있으면 Excel 값 유지(= Excel 이 원본). JSON 에만 있는 카드는 Excel 에 추가. Excel 에만 있는 카드는 유지.
Excel 과 JSON 이 다른 카드가 있으면 목록으로 알려 줍니다 (어느 쪽이 맞는지 직접 정할 수 있게).
"""
import argparse, json, shutil, sys, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards_xlsx as X  # noqa: E402

ROOT = X.ROOT


def export(json_path, xlsx_path, update_ids=(), prefer_json=False, rebuild=False, quiet=False):
    log = (lambda *a: None) if quiet else print
    json_path, xlsx_path = Path(json_path), Path(xlsx_path)
    db = X.load_json(json_path)
    if rebuild or not xlsx_path.exists():
        info = X.write_workbook(db, xlsx_path); log(f"{xlsx_path} 생성: 카드 {info['cards']}장 / 능력 {info['abilities']}행 / 효과 {info['ops']}행"); return {"created": True, **info}
    xl_cards, xl_meta, probs = X.read_workbook(xlsx_path)
    errs = [p for p in probs if p.level == "ERROR"]
    if errs or xl_cards is None:
        log("기존 Excel 에 오류가 있어 병합하지 않았습니다 (Excel 은 그대로입니다). 먼저 고치거나 --rebuild 로 새로 만드세요.")
        for p in errs[:20]: log("ERROR\n" + str(p))
        raise SystemExit(1)
    merged, kept_diff, added, repl = dict(xl_cards), [], [], []
    ups = set(update_ids)
    for cid, jc in db["cards"].items():
        jx = {k: v for k, v in jc.items() if k != "img"}
        if cid not in xl_cards: merged[cid] = jx; added.append(cid)
        elif prefer_json or cid in ups: merged[cid] = jx; repl.append(cid)
        else:
            xc = xl_cards[cid]
            if {k: v for k, v in xc.items()} != {k: v for k, v in jx.items()}: kept_diff.append(cid)
    only_excel = sorted(set(xl_cards) - set(db["cards"]))
    # img_info 표시를 위해 이미지는 JSON 에서 가져온다
    out = {"cards": {cid: ({**c, "img": db["cards"][cid].get("img", "")} if cid in db["cards"] else c) for cid, c in merged.items()}}
    for k, v in db.items():
        if k != "cards": out[k] = xl_meta.get(k, v) if (xl_meta and not prefer_json) else v
    for k, v in (xl_meta or {}).items(): out.setdefault(k, v)
    bak = xlsx_path.with_name(xlsx_path.stem + ".backup.xlsx")
    shutil.copy2(xlsx_path, bak)
    info = X.write_workbook(out, xlsx_path)
    log(f"{xlsx_path} 갱신: 카드 {info['cards']}장 (새로 추가 {len(added)}장, JSON 값으로 교체 {len(repl)}장)  — 이전 파일은 {bak.name} 로 백업")
    if added: log("  추가된 카드: " + ", ".join(added[:20]) + (f" … 외 {len(added) - 20}장" if len(added) > 20 else ""))
    if kept_diff: log(f"  주의: Excel 과 cards.json 의 값이 다른 카드 {len(kept_diff)}장 — Excel 값을 유지했습니다(빌드하면 JSON 이 Excel 에 맞춰집니다): " + ", ".join(kept_diff[:15]) + (" …" if len(kept_diff) > 15 else ""))
    if only_excel: log(f"  참고: Excel 에만 있는 카드 {len(only_excel)}장 유지")
    return {"created": False, "added": added, "replaced": repl, "kept_diff": kept_diff, **info}


def main(argv=None):
    ap = argparse.ArgumentParser(description="data/cards.json → data/cards.xlsx (병합)")
    ap.add_argument("--json", default=str(ROOT / "data" / "cards.json")); ap.add_argument("--xlsx", default=str(ROOT / "data" / "cards.xlsx"))
    ap.add_argument("--update-ids", default="", help="JSON 값으로 덮어쓸 카드 ID (쉼표)"); ap.add_argument("--prefer-json", action="store_true"); ap.add_argument("--rebuild", action="store_true")
    a = ap.parse_args(argv)
    export(a.json, a.xlsx, [x.strip() for x in a.update_ids.split(",") if x.strip()], a.prefer_json, a.rebuild)
    return 0


if __name__ == "__main__":
    sys.exit(main())
