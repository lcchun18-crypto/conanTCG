#!/usr/bin/env python3
"""data/cards.xlsx  →  검증  →  data/cards.json  (게임이 읽는 런타임 DB)

    python tools/build_cards_from_excel.py                 # 기본: data/cards.xlsx → data/cards.json
    python tools/build_cards_from_excel.py --dry-run       # 검증 + 변경 내역만 (파일 변경 없음)
    python tools/build_cards_from_excel.py --check         # Excel 과 cards.json 이 같은지만 확인 (다르면 종료코드 2)
    python tools/build_cards_from_excel.py --allow-delete id_0001,id_0002   # Excel 에서 지운 카드를 정말 삭제할 때

오류가 하나라도 있으면 cards.json 을 건드리지 않고(= 배포 중단) 어느 카드의 어느 셀이 문제인지 출력합니다.
이미지(img)와 Excel 에 없는 데이터는 기존 cards.json 에서 카드 ID 로 그대로 가져옵니다(손실 없음).
필요: pip install openpyxl   (효과 검증에는 node 가 필요 — 프로젝트 서버와 같은 엔진을 사용)
"""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards_xlsx as X  # noqa: E402

ROOT = X.ROOT


def show_warns(warns, log, limit=20):
    """own 미지정 경고는 수백 건일 수 있어 한 줄로 요약하고, 나머지 경고가 가려지지 않게 한다."""
    own = [p for p in warns if "own 이 비어 있습니다" in p.msg]
    rest = [p for p in warns if p not in own]
    for p in rest[:limit]: log("WARN\n" + str(p))
    if len(rest) > limit: log(f"… 외 경고 {len(rest) - limit}건")
    for p in own[:limit]: log("WARN\n" + str(p))
    if len(own) > limit: log(f"… 외 own 미지정 경고 {len(own) - limit}건 (전체: node tools/ownership_audit.js, data/ownership_review.csv)")

def build(xlsx, base_path, out_path, allow_delete=(), dry_run=False, check=False, use_node=True, report=None, quiet=False, img_dir=None):
    """반환: (종료코드, 정보 dict)"""
    log = (lambda *a: None) if quiet else print
    xlsx, base_path, out_path = Path(xlsx), Path(base_path), Path(out_path)
    img_dir = Path(img_dir) if img_dir else X.CI.img_dir_for(base_path)
    if not xlsx.exists():
        log(f"ERROR\n{xlsx}\n  Excel 파일이 없습니다. 먼저 `python tools/export_cards_to_excel.py` 로 만드세요."); return 1, {}
    base, base_text = None, None
    if base_path.exists():
        base_text = base_path.read_text("utf-8")
        try: base = json.loads(base_text)
        except Exception as e: log(f"ERROR\n{base_path}\n  기존 cards.json 을 읽을 수 없습니다: {e}"); return 1, {}
    xl_cards, xl_meta, probs = X.read_workbook(xlsx)
    errs = [p for p in probs if p.level == "ERROR"]; warns = [p for p in probs if p.level != "ERROR"]
    if xl_cards is not None:   # 읽기 오류가 있어도 가능한 검증은 계속해서 한 번에 모두 알려 준다
        vp = X.validate_cards(xl_cards, base, allow_delete=allow_delete, use_node=use_node, partial=bool(errs), img_dir=img_dir)
        errs += [p for p in vp if p.level == "ERROR"]; warns += [p for p in vp if p.level != "ERROR"]
    if not errs:
        new = X.merge_with_base(xl_cards, xl_meta, base)
        for cid, c in new["cards"].items():     # v1.14.0: 이미지는 파일(CardImage) — img 는 image_file 에서 만든 경로여야 한다
            im = c.get("img", "")
            if im.startswith("data:"): errs.append(X.Problem("ERROR", cid, "이미지", "img 에 base64 가 들어 있습니다 (이미지는 CardImage 폴더의 파일로 관리합니다)"))
    if not errs:   # 서버는 data/color_overrides.json 을 cards.json 위에 덮어써서 읽는다 → Excel 색과 다르면 알려 준다
        ovp = base_path.parent / "color_overrides.json"
        try: ov = json.loads(ovp.read_text("utf-8")) if ovp.exists() else {}
        except Exception: ov = {}
        for cid, col in ov.items():
            if cid in new["cards"] and new["cards"][cid].get("color") != col: warns.append(X.Problem("WARN", cid, "Cards 시트 color", f"data/color_overrides.json 이 이 카드의 색을 '{col}' 로 덮어씁니다 — Excel 의 color 를 고쳐도 게임에는 '{col}' 이 적용됩니다 (그 파일의 해당 줄을 지우세요)"))
    if errs:
        log(f"\n배포 중단: 오류 {len(errs)}건 — cards.json 은 변경되지 않았습니다.\n")
        for p in errs[:200]: log("ERROR\n" + str(p) + "\n")
        if len(errs) > 200: log(f"… 외 {len(errs) - 200}건")
        show_warns(warns, log)
        return 1, {"errors": errs}
    added, removed, ch, other = X.changes(base, new)
    text = X.report_text(added, removed, ch, other)
    rp = Path(report) if report else out_path.parent / "card_changes_report.txt"
    if not (dry_run or check):
        try: rp.write_text(text, "utf-8")
        except Exception: pass
    new_text = X.dumps(new)
    same = base_text is not None and new_text == base_text
    log(f"카드 {len(new['cards'])}장 검증 통과" + (f" (경고 {len(warns)}건)" if warns else ""))
    show_warns(warns, log)
    if same: log("변경 없음 — cards.xlsx 와 cards.json 이 같습니다."); return 0, {"changed": 0, "same": True, "cards": len(new["cards"]), "warns": warns}
    lines = text.splitlines()
    log("\n".join(lines[:150]) + (f"\n… (전체 {len(lines)}줄은 {rp} 참고)" if len(lines) > 150 else ""))
    if check: log("\ncards.json 이 cards.xlsx 와 다릅니다 (빌드가 필요합니다)."); return 2, {"same": False, "changed": len(ch)}
    if dry_run: log("\n[dry-run] 파일을 쓰지 않았습니다."); return 0, {"same": False, "changed": len(ch), "dry": True}
    tmp = out_path.with_name(out_path.name + ".tmp")
    try:
        tmp.write_text(new_text, "utf-8")
        if json.loads(tmp.read_text("utf-8")) != new: raise ValueError("임시 파일 재검증 실패")
        os.replace(tmp, out_path)
    finally:
        try: tmp.unlink()
        except FileNotFoundError: pass
    log(f"\n{out_path} 생성 완료 (카드 {len(new['cards'])}장, 변경 {len(ch)}장, 추가 {len(added)}장, 삭제 {len(removed)}장)")
    return 0, {"same": False, "changed": len(ch), "added": added, "removed": removed, "cards": len(new["cards"]), "warns": warns}


def main(argv=None):
    ap = argparse.ArgumentParser(description="data/cards.xlsx → data/cards.json (검증 후 생성)")
    ap.add_argument("--xlsx", default=str(ROOT / "data" / "cards.xlsx")); ap.add_argument("--base", default=str(ROOT / "data" / "cards.json"), help="기존 cards.json (이미지/Excel 에 없는 데이터를 가져올 곳)")
    ap.add_argument("--out", default=None, help="출력 경로 (기본: --base 와 같음)"); ap.add_argument("--allow-delete", default=os.environ.get("CARDS_ALLOW_DELETE", ""), help="Excel 에서 지운 것을 삭제로 인정할 카드 ID (쉼표)")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--check", action="store_true"); ap.add_argument("--no-node", action="store_true", help="효과 엔진 검증 생략")
    ap.add_argument("--report", default=None)
    a = ap.parse_args(argv)
    code, _ = build(a.xlsx, a.base, a.out or a.base, [x.strip() for x in a.allow_delete.split(",") if x.strip()], a.dry_run, a.check, not a.no_node, a.report)
    return code


if __name__ == "__main__":
    sys.exit(main())
