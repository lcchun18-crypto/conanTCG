"""add_new_cards.py (증분 추가) 검증 — 모의 API 서버 사용. 실행: python test/addcards_test.py"""
import json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
os.environ.pop("CARD_IMAGE_DIR", None)   # v1.14.0: 임시 프로젝트를 쓰는 테스트는 실제 CardImage 폴더를 건드리지 않는다
from PIL import Image, ImageDraw
HERE = Path(__file__).parent; ROOT = HERE.parent; sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "shim")); sys.path.insert(0, str(ROOT))
import mock_api as M
srv, URL = M.start()
ADD = ROOT / "add_new_cards.py"; IMP = ROOT / "import_cards.py"
T = []; t = lambda n: (lambda f: T.append((n, f)) or f)
tmp = Path(tempfile.mkdtemp(prefix="add_"))
def ok(c, m):
    if not c: raise AssertionError(m)
ENV = {**os.environ, "PYTHONPATH": str(HERE / "shim"), "ANTHROPIC_API_KEY": "test-key", "ANTHROPIC_BASE_URL": URL}
def mk(d, prefix, n, col=(30, 150, 60)):
    d.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        im = Image.new("RGB", (630 + i, 880), col); ImageDraw.Draw(im).rectangle((25, 25, 605, 855), fill=(240, 235, 220)); im.save(d / f"{prefix}{i:03d}_p.png")
    return d
def add(folder, db, *args):
    r = subprocess.run([sys.executable, str(ADD), str(folder), "--db", str(db), "--id-regex", r"^([A-Z]\d+)", "--workers", "3", *args], capture_output=True, env=ENV, timeout=180)
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")
def cards(p): return json.load(open(p, encoding="utf-8"))["cards"]
def num(o, k): return int(re.search(k + r": (\d+)", o).group(1))

# 기존 DB: import_cards.py 로 한 번 만든 결과를 data/cards.json 으로
base = tmp / "data"; base.mkdir(); DB = base / "cards.json"
M.reset(); setA = mk(tmp / "setA", "A", 6)
r = subprocess.run([sys.executable, str(IMP), str(setA), "--out", str(tmp / "a.json"), "--id-regex", r"^([A-Z]\d+)", "--workers", "3"], capture_output=True, env=ENV, timeout=180)
assert r.returncode == 0, r.stdout.decode("utf-8", "replace") + r.stderr.decode("utf-8", "replace")
shutil.copy(tmp / "a.json", DB); OLD = DB.read_bytes(); N0 = len(cards(DB)); assert N0 == 6, N0

@t("신규만 추가: 기존 6장 이미지는 API 호출 없이 건너뜀, 새 4장만 요청, 통계 출력")
def _():
    global NEWDIR
    NEWDIR = tmp / "set"; shutil.copytree(setA, NEWDIR / "old"); mk(NEWDIR / "new", "B", 4, (230, 150, 20)); M.reset()
    rc, o, e = add(NEWDIR, DB); ok(rc == 0, o + e)
    c = cards(DB); ok(len(c) == 10, len(c)); ok(num(o, "기존 카드 수") == 6 and num(o, "입력 이미지 수") == 10 and num(o, "신규 추가") == 4 and num(o, "중복") == 6 and num(o, "실패") == 0 and num(o, "최종 카드 수") == 10, o)
    ok(len(M.S["reqs"]) > 0, "새 카드는 API 로 처리돼야 함")
    sent = json.dumps(M.S["reqs"])[:0]; ok(len(M.S["reqs"]) <= 4 * 3, f"요청이 너무 많음(기존 카드 재호출?): {len(M.S['reqs'])}")
    old = json.loads(OLD.decode("utf-8"))["cards"]; ok(all(c[k] == v for k, v in old.items()), "기존 카드 내용은 그대로여야 함")

@t("자동 백업: 기존 cards.json 과 동일한 사본이 data/backup 에 생김")
def _():
    bk = list((base / "backup").glob("cards-*.json")); ok(len(bk) == 1, bk); ok(bk[0].read_bytes() == OLD, "백업 내용이 원본과 다름")

@t("새 카드 전용 확인 파일: reports/add-*.review.csv 는 새 카드 ID 만 포함")
def _():
    rv = list((base / "reports").glob("add-*.review.csv")); ok(rv, "review.csv 없음"); txt = rv[0].read_text("utf-8-sig")
    ids = [l.split(",")[0] for l in txt.splitlines()[1:]]; ok(all(i.startswith("B") for i in ids), ids)
    ok(list((base / "reports").glob("add-*.manual.txt")), "manual.txt 없음")

@t("중복 건너뜀: 같은 폴더를 다시 실행하면 API 호출 0건, 파일/백업 변화 없음")
def _():
    before = DB.read_bytes(); M.reset(); rc, o, e = add(NEWDIR, DB); ok(rc == 0 and len(M.S["reqs"]) == 0, f"요청 {len(M.S['reqs'])}건\n{o}{e}")
    ok(DB.read_bytes() == before, "변경되면 안 됨"); ok("새로 추가할 카드가 없습니다" in o and num(o, "중복") == 10 and num(o, "최종 카드 수") == 10, o); ok(len(list((base / "backup").glob("*.json"))) == 1, "불필요한 백업 생성")

@t("--replace-existing: 지정했을 때만 같은 ID 를 교체(요청 발생, 장수 동일, 백업 추가)")
def _():
    M.reset(); rc, o, e = add(NEWDIR / "old", DB); ok(rc == 0 and len(M.S["reqs"]) == 0, "기본은 교체 안 함")
    tgt = tmp / "rep"; mk(tgt, "A", 2, (30, 70, 200)); M.reset(); rc, o, e = add(tgt, DB, "--replace-existing"); ok(rc == 0, o + e)
    ok(len(M.S["reqs"]) > 0, "교체는 API 재호출"); ok(len(cards(DB)) == 10, "장수 유지"); ok(num(o, "교체") == 2 and num(o, "신규 추가") == 0, o)
    ok(len(list((base / "backup").glob("*.json"))) == 2, "교체 전 백업")

@t("--dry-run: API 호출 0건, 파일 변경 없음")
def _():
    before = DB.read_bytes(); M.reset(); d2 = mk(tmp / "dry", "D", 3); rc, o, e = add(d2, DB, "--dry-run"); ok(rc == 0 and len(M.S["reqs"]) == 0 and DB.read_bytes() == before, o + e); ok(num(o, "최종 카드 수") == 13, o)

@t("기존 DB 없음/손상: 아무것도 바꾸지 않고 오류(--init 으로만 새로 생성)")
def _():
    miss = tmp / "x" / "cards.json"; (tmp / "x").mkdir(); rc, o, e = add(setA, miss); ok(rc == 2 and not miss.exists() and "기존 카드 DB가 없습니다" in o, o)
    bad = tmp / "x" / "bad.json"; bad.write_text("{oops", "utf-8"); rc, o, e = add(setA, bad); ok(rc == 2 and bad.read_text() == "{oops" and "변경하지 않았습니다" in o, o)
    M.reset(); rc, o, e = add(setA, miss, "--init"); ok(rc == 0 and len(cards(miss)) == 6, o + e)

@t("원자적 교체: 검증 실패 시 원본 그대로, 임시 파일 정리")
def _():
    import add_new_cards as AN
    p = tmp / "atom.json"; p.write_bytes(OLD); old = json.loads(OLD.decode("utf-8")); bad = {"cards": {**old["cards"]}}; k = next(iter(bad["cards"])); bad["cards"][k] = {**bad["cards"][k], "n": "변조"}
    try: AN.atomic_write(p, bad, bad["cards"].keys(), old["cards"]); ok(False, "예외가 나야 함")
    except ValueError: pass
    ok(p.read_bytes() == OLD and not list(tmp.glob("atom.json.tmp")), "원본 보존/임시 파일 정리")
    try: AN.atomic_write(p, {"cards": {"x": {"id": "x"}}}, ["x"], {}); ok(False, "형식 오류는 예외")
    except ValueError: pass
    ok(p.read_bytes() == OLD, "원본 보존")
    ok(AN.atomic_write(p, old, old["cards"].keys(), old["cards"]) == 6, "정상 교체")

bad = 0
for n, f in T:
    try: f(); print("✓", n)
    except Exception as ex: bad += 1; print("✗", n, "\n   ", str(ex)[:1200])
shutil.rmtree(tmp, ignore_errors=True); print(f"\n{'전체 ' + str(len(T)) + '개 통과' if not bad else str(bad) + '개 실패'}"); sys.exit(1 if bad else 0)
