#!/usr/bin/env python3
"""새 카드 세트만 기존 카드 DB(data/cards.json)에 추가한다 (증분 추가).

    python add_new_cards.py "E:\\conanTCG\\newset"
    python add_new_cards.py ./newset --replace-existing      # 같은 ID 가 이미 있어도 새 결과로 교체
    python add_new_cards.py ./newset --dry-run               # API 호출/파일 변경 없이 계획만 출력

동작
  · 기존 카드(이미 data/cards.json 에 있는 ID)는 이미지 인식(OCR/API)을 다시 호출하지 않는다. 새 ID 의 이미지만 처리한다.
  · 같은 ID 는 중복으로 건너뛴다(기본). --replace-existing 을 줬을 때만 해당 ID 를 새 결과로 교체한다.
  · 쓰기 전에 기존 cards.json 을 data/backup/cards-<시각>.json 으로 백업한다.
  · 임시 파일에 먼저 쓰고 → JSON 을 다시 읽어 검증한 뒤 → 성공했을 때만 원본을 교체한다(실패하면 원본 그대로).
  · 확인 필요/manual 목록은 이번에 추가한 새 카드만 data/reports/ 에 만든다.
  · 카드 읽기/효과 구조화 로직은 import_cards.py 와 완전히 같다(같은 폴더의 모듈을 그대로 사용).
필요: pip install anthropic pillow, 환경변수 ANTHROPIC_API_KEY (새 카드가 있을 때만 사용됨)
"""
import argparse, csv, datetime, json, os, re, shutil, sys, traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import import_cards as ic  # noqa: E402  (같은 폴더)

IMG_EXT = (".png", ".jpg", ".jpeg", ".webp")
REQUIRED = ("id", "n", "type")


def validate_db(j, where):
    """cards.json 구조 검증. 문제가 있으면 ValueError."""
    if not isinstance(j, dict) or not isinstance(j.get("cards"), dict):
        raise ValueError(f"{where}: 최상위에 'cards' 객체가 없습니다")
    for cid, c in j["cards"].items():
        if not isinstance(c, dict) or any(k not in c for k in REQUIRED) or not isinstance(c["n"], str) or not c["type"]:
            raise ValueError(f"{where}: 카드 형식 오류 ({cid})")
    return len(j["cards"])


def load_existing(path, init):
    if not path.exists():
        if init: return {"cards": {}}
        raise FileNotFoundError(f"기존 카드 DB가 없습니다: {path}\n(처음부터 새로 만들려면 --init 을 붙이세요)")
    try: j = json.loads(path.read_text("utf-8"))
    except Exception as e: raise ValueError(f"기존 카드 DB를 읽을 수 없습니다(JSON 오류): {path}\n{e}\n→ 아무것도 변경하지 않았습니다.")
    validate_db(j, str(path)); return j


def atomic_write(path, data, expect_ids, keep):
    """임시 파일에 쓰고 → 다시 읽어 검증 → 성공해야만 원본 교체. keep: 바뀌면 안 되는 {id: 카드}"""
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
        back = json.loads(tmp.read_text("utf-8"))
        n = validate_db(back, "임시 파일")
        if set(back["cards"]) != set(expect_ids): raise ValueError("임시 파일의 카드 ID 목록이 예상과 다릅니다")
        for cid, c in keep.items():
            if back["cards"].get(cid) != c: raise ValueError(f"기존 카드가 변경되었습니다: {cid}")
        os.replace(tmp, path); return n
    finally:
        try: tmp.unlink()
        except FileNotFoundError: pass


def sync_excel_after_import(db_path, added, replaced):
    """v1.10.0: 신탄 추가 후 data/cards.xlsx 에 새 카드 행을 추가한다(내가 Excel 에서 고친 값은 보존).
    그다음 Excel → cards.json 빌드를 한 번 더 실행해 두 파일이 같은 내용이 되도록 맞춘다. 실패해도 신탄 추가 결과(cards.json)는 그대로 유지된다."""
    xlsx = db_path.parent / "cards.xlsx"
    try:
        sys.path.insert(0, str(HERE / "tools"))
        import export_cards_to_excel as ex, build_cards_from_excel as bd
    except Exception as e:
        print(f"[Excel] 도구를 불러올 수 없어 cards.xlsx 갱신을 건너뜁니다: {e}"); return
    try:
        ex.export(db_path, xlsx, update_ids=replaced)
    except SystemExit:
        print("[Excel] 기존 cards.xlsx 에 오류가 있어 갱신하지 못했습니다. 오류를 고친 뒤 `python tools/export_cards_to_excel.py` 를 실행하세요."); return
    except Exception as e:
        print(f"[Excel] cards.xlsx 갱신 실패(신탄 추가 결과는 안전합니다): {e}\n   → pip install openpyxl 후 `python tools/export_cards_to_excel.py` 를 실행하세요."); return
    code, _ = bd.build(xlsx, db_path, db_path)
    if code != 0: print("[Excel] cards.xlsx 에 검증 오류가 있어 cards.json 을 다시 만들지 않았습니다 (위 ERROR 를 고친 뒤 `python tools/build_cards_from_excel.py`).")
    else: print(f"[Excel] {xlsx.name} 에 새 카드 {len(added)}장이 추가되었습니다. Excel 에서 확인/수정한 뒤 GitHub 에 올리세요.")


def main():
    ap = argparse.ArgumentParser(description="새 카드 세트를 기존 data/cards.json 에 추가")
    ap.add_argument("folder", help="새 카드 이미지 폴더 (하위 폴더 포함)")
    ap.add_argument("--db", default=str(HERE / "data" / "cards.json"), help="대상 카드 DB (기본: 프로젝트의 data/cards.json)")
    ap.add_argument("--replace-existing", action="store_true", help="이미 있는 ID 도 새 결과로 교체(기본: 건너뜀)")
    ap.add_argument("--init", action="store_true", help="cards.json 이 없을 때 새로 만든다")
    ap.add_argument("--dry-run", action="store_true", help="API 호출/파일 변경 없이 무엇을 처리할지만 출력")
    ap.add_argument("--id-regex", default=r"(.+)", help="파일 이름(확장자 제외)에서 카드 ID 를 뽑는 정규식(import_cards.py 와 동일)")
    ap.add_argument("--model", default="claude-sonnet-5-5"); ap.add_argument("--struct-model", default="claude-sonnet-5-5")
    ap.add_argument("--no-struct", action="store_true"); ap.add_argument("--no-rules", action="store_true")
    ap.add_argument("--workers", type=int, default=6); ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--send-px", type=int, default=1100); ap.add_argument("--crop-px", type=int, default=1500); ap.add_argument("--thumb-px", type=int, default=240)
    a = ap.parse_args()
    db_path = Path(a.db); folder = Path(a.folder)
    if not folder.is_dir(): print(f"이미지 폴더를 찾을 수 없습니다: {folder}"); return 2
    try: data = load_existing(db_path, a.init)
    except (FileNotFoundError, ValueError) as e: print(e); return 2
    old = data["cards"]; n_old = len(old)
    try: rx = re.compile(a.id_regex)
    except re.error as e: print(f"--id-regex 오류: {e}"); return 2

    files = sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMG_EXT)
    if a.limit: files = files[:a.limit]
    if not files: print(f"이미지를 찾지 못했습니다: {folder}"); return 1
    todo, dup_exist, dup_input, seen = [], [], 0, {}
    for p in files:
        m = rx.search(p.stem); cid = m.group(1) if m else p.stem
        if cid in seen: dup_input += 1; continue  # 같은 ID(패러렐 등)는 1장으로
        seen[cid] = p
        if cid in old and not a.replace_existing: dup_exist.append(cid); continue
        todo.append((cid, p))
    n_dup = len(dup_exist) + dup_input
    replaced = [cid for cid, _ in todo if cid in old]

    def stats(added, failed, final, repl=0):
        print(f"\n기존 카드 수: {n_old}\n입력 이미지 수: {len(files)}\n신규 추가: {added}" + (f"\n교체: {repl}" if a.replace_existing else "")
              + f"\n중복: {n_dup}\n실패: {failed}\n최종 카드 수: {final}")

    if a.dry_run:
        print(f"[dry-run] 새로 처리할 카드 {len(todo)}장 (교체 {len(replaced)}장), 건너뛸 중복 {n_dup}장 — API 호출/파일 변경 없음")
        for cid, p in todo[:20]: print(f"  + {cid}  ({p.name})" + ("  [교체]" if cid in old else ""))
        if len(todo) > 20: print(f"  … 외 {len(todo) - 20}장")
        stats(len(todo) - len(replaced), 0, n_old + len(todo) - len(replaced), len(replaced)); return 0
    if not todo: print("새로 추가할 카드가 없습니다. (API 호출 없음, 파일 변경 없음)"); stats(0, 0, n_old); return 0
    if ic.anthropic is None: print("anthropic 패키지가 없습니다. pip install anthropic pillow"); return 2
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    rep_dir = db_path.parent / "reports"; cache = db_path.parent / ".add_cache"
    try: rep_dir.mkdir(parents=True, exist_ok=True); cache.mkdir(exist_ok=True)
    except Exception as e: print(f"출력 폴더를 만들 수 없습니다: {e}"); return 2
    ic.ERRLOG = str(rep_dir / f"add-{stamp}.errors.log"); open(ic.ERRLOG, "w", encoding="utf-8").close()
    try: cli = ic.anthropic.Anthropic()
    except Exception as e: print(f"API 클라이언트를 만들 수 없습니다(ANTHROPIC_API_KEY 확인): {ic.err_detail(e)}"); return 2

    new, rows, fails, ok_n, first_fatal, bad = {}, [], [], 0, None, 0
    print(f"새 카드 {len(todo)}장만 처리합니다 (기존 {len(dup_exist)}장은 건너뜀, API 호출 없음)", file=sys.stderr)
    with ThreadPoolExecutor(a.workers) as ex:
        fut = {ex.submit(ic.work, cli, a, p, cache): (cid, p) for cid, p in todo}
        for i, f in enumerate(as_completed(fut), 1):
            cid, p = fut[f]
            try:
                d, st = f.result(); ok_n += 1; bad = 0
                if a.no_struct: st = {**st, "_nostruct": 1}
                card, fl = ic.card_entry(cid, d, st); new[cid] = card
                if fl: rows.append([cid, d["name"], d["file"], " / ".join(fl)])
                if len(todo) <= 50 or i % 50 == 0: print(f"{i}/{len(todo)} 완료: {p.name}", file=sys.stderr, flush=True)
            except ic.Skipped: fails.append((p.name, "건너뜀(앞선 오류로 중단)"))
            except Exception as e:  # 카드 1장의 실패가 전체를 깨지 않는다
                detail = e.detail if isinstance(e, ic.ApiFail) else f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                fails.append((p.name, detail)); ic.log(f"[실패] {p.name}: {detail}")
                if isinstance(e, ic.ApiFail) and e.status in (400, 401, 403, 404, 422) and ok_n == 0:
                    first_fatal = first_fatal or detail; bad += 1
                    if bad >= 4 and not ic.STOP.is_set(): ic.STOP.set(); ic.log(f"[중단] 성공 없이 같은 종류의 오류가 {bad}번 연속되어 남은 카드를 건너뜁니다.\n{first_fatal}")
    for n, e in fails: print(f"실패: {n}\n   {e}")
    if not new:
        print("추가된 카드가 없어 cards.json 은 변경하지 않았습니다."); stats(0, len(fails), n_old); return 1

    # ── 백업 → 임시 파일 → 검증 → 교체
    added = [c for c in new if c not in old]; repl = [c for c in new if c in old]
    merged = {**old, **new}; out = {**data, "cards": {k: merged[k] for k in sorted(merged)}}
    keep = {k: v for k, v in old.items() if k not in repl}
    bk = None
    if db_path.exists():
        bk_dir = db_path.parent / "backup"; bk_dir.mkdir(exist_ok=True); bk = bk_dir / f"cards-{stamp}.json"; k = 1
        while bk.exists(): k += 1; bk = bk_dir / f"cards-{stamp}-{k}.json"  # 같은 초에 다시 실행해도 기존 백업을 덮어쓰지 않는다
        shutil.copy2(db_path, bk)
    try: final = atomic_write(db_path, out, merged.keys(), keep)
    except Exception as e:
        print(f"저장 실패 — 기존 cards.json 은 그대로입니다: {e}"); stats(0, len(fails) + len(new), n_old); return 1
    # 새 카드만 확인용 파일 생성
    with open(rep_dir / f"add-{stamp}.review.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh); w.writerow(["ID", "이름", "파일", "확인 필요 사유"]); w.writerows(sorted(rows))
    man = [(cid, c) for cid, c in sorted(new.items()) if c["type"] != "partner" and c["fx"] and "manual" in json.dumps(c["ab"])]
    lines = [f"[이번에 추가한 카드 중 manual 이 남은 카드 {len(man)}장]"] + [f"{cid}\t{c['n']}\t" + " | ".join(ic.effect_rules.manual_texts(c["ab"]) if ic.effect_rules else ["(?)"]) for cid, c in man]
    (rep_dir / f"add-{stamp}.manual.txt").write_text("\n".join(lines), "utf-8")
    if bk: print(f"백업: {bk}")
    print(f"확인 필요 목록(새 카드만): {rep_dir / f'add-{stamp}.review.csv'} ({len(rows)}장) / manual 목록: {rep_dir / f'add-{stamp}.manual.txt'}")
    sync_excel_after_import(db_path, added, repl)
    print("서버는 재시작하지 않아도 다음 접속부터 새 카드가 보입니다(파일 변경을 자동 감지). Render 에서는 cards.xlsx 와 cards.json 을 함께 커밋/배포하세요.")
    stats(len(added), len(fails), final, len(repl)); return 0


if __name__ == "__main__":
    sys.exit(main())
