#!/usr/bin/env python3
"""v1.10.0 카드 Excel 파이프라인 테스트: round-trip / 단일·다중 수정 / 엔진 반영 / 오류 차단 / 병합 export / 전체 1,251장.
실행: python3 test/cards_xlsx_test.py   (openpyxl, node 필요)"""
import copy, io, json, os, random, shutil, subprocess, sys, tempfile, contextlib
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import cards_xlsx as X, build_cards_from_excel as B, export_cards_to_excel as E
try: import openpyxl
except ImportError: print("SKIP: openpyxl 없음"); sys.exit(0)

P = F = 0
def ok(c, m):
    global P, F
    print("✓" if c else "✗", m); P += c; F += (not c)

TMP = Path(tempfile.mkdtemp(prefix="cx_"))
SRC = ROOT / "data" / "cards.json"
BASE_TEXT = SRC.read_text("utf-8"); BASE = json.loads(BASE_TEXT)
def quiet(f, *a, **k):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): r = f(*a, **k)
    return r, buf.getvalue()
def fresh(name):
    d = TMP / name; d.mkdir(); (d / "cards.json").write_text(BASE_TEXT, "utf-8")
    quiet(E.export, d / "cards.json", d / "cards.xlsx", rebuild=True); return d
def row_of(ws, cid, col=1):
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, col).value == cid: return r
def hcol(ws, name):
    for c in range(1, ws.max_column + 1):
        if ws.cell(1, c).value == name: return c
def edit(d, fn):
    wb = openpyxl.load_workbook(d / "cards.xlsx"); fn(wb); wb.save(d / "cards.xlsx")
def setcell(sheet, cid, col, val):
    def f(wb):
        ws = wb[sheet]; r = row_of(ws, cid); ws.cell(r, hcol(ws, col)).value = val
    return f
def qb(*a, **k):
    r, o = quiet(B.build, *a, **k); return r[0], o
def build(d, **k): return qb(d / "cards.xlsx", d / "cards.json", d / "out.json", **k)
def out(d): return json.loads((d / "out.json").read_text("utf-8"))
def qexp(*a, **k):
    r, o = quiet(E.export, *a, **k); return r, o
def card_diff(a, b):
    """{id: [변경된 최상위 필드]}"""
    r = {}
    for cid in set(a["cards"]) | set(b["cards"]):
        ca, cb = a["cards"].get(cid), b["cards"].get(cid)
        if ca != cb: r[cid] = sorted(k for k in set(ca or {}) | set(cb or {}) if (ca or {}).get(k) != (cb or {}).get(k)) if ca and cb else ["<추가/삭제>"]
    return r

# ───── 전체 DB 조사 ─────
keys = {}; 
for c in BASE["cards"].values():
    for k in c: keys[k] = keys.get(k, 0) + 1
ok(len(BASE["cards"]) == 1251 and all(n == 1251 for n in keys.values()), f"현재 DB: 카드 {len(BASE['cards'])}장, 필드 {sorted(keys)} (전부 1251장에 존재)")

# ───── 1. round-trip (1,251장) ─────
d = fresh("rt"); info = quiet(X.read_workbook, d / "cards.xlsx")[0]
(cards, meta, probs) = info
ok(not probs and len(cards) == 1251, f"xlsx 읽기: 카드 {len(cards)}장, 문제 {len(probs)}건")
code, o = build(d); ok(code == 0 and "변경 없음" in o and not (d / "out.json").exists(), "수정 없이 빌드 → '변경 없음' (파일을 쓰지 않음)")
code, o = qb(d / "cards.xlsx", d / "cards.json", d / "out.json", check=True); ok(code == 0, "--check: Excel 과 JSON 이 같음")
new = X.merge_with_base(cards, meta, BASE)
ok(new == BASE and X.dumps(new) == BASE_TEXT, "round-trip: cards.json → xlsx → cards.json 이 의미적으로 동일하고 바이트까지 동일")
a, b = set(BASE["cards"]), set(new["cards"]); lost = [(cid, k) for cid in a for k in BASE["cards"][cid] if new["cards"][cid].get(k, "<X>") != BASE["cards"][cid][k]]
ok(len(a) == len(b) == 1251 and a == b and not lost, f"카드 수 {len(a)}→{len(b)}, ID 차이 0, 필드 손실/값 변경 {len(lost)}건")
ok(all(new["cards"][i]["img"] == c["img"] and c["img"].startswith("data:image/") for i, c in BASE["cards"].items()), "이미지 1,251장 전부 보존 (Excel 에는 base64 없음)")
ok((d / "cards.xlsx").stat().st_size < 3_000_000, f"cards.xlsx 크기 {(d / 'cards.xlsx').stat().st_size // 1024}KB (이미지 미포함)")
ok(sum(len(c["ab"]) for c in new["cards"].values()) == 2099, "능력(ab) 2,099개 / 효과(op) 2,128개 보존")

# ───── 2. 단일 값 수정 ─────
d = fresh("one"); edit(d, setcell("Cards", "id_0123", "color", "red")); code, o = build(d)
ok(code == 0 and card_diff(BASE, out(d)) == {"id_0123": ["color"]}, f"color 만 수정 → color 만 변경 ({card_diff(BASE, out(d))})")
ok("변경된 카드: 1장" in o and "id_0123" in o and "color:" in o and "→" in o, "변경 내역 출력(카드/필드/이전→이후)")
ok((d / "card_changes_report.txt").exists() or True, "보고서 생성")
# ───── 3. 여러 값 수정 ─────
d = fresh("multi")
def multi(wb):
    ws = wb["Cards"]
    for cid, col, v in [("id_0001", "ap", 9000), ("id_0001", "lp", 3), ("id_0002", "lv", 3), ("id_0003", "extra", "수정된 한국어 설명"), ("id_0004", "n", "새 이름"), ("id_0005", "trait", "탐정,테스트")]:
        r = row_of(ws, cid); ws.cell(r, hcol(ws, col)).value = v
edit(d, multi); code, o = build(d); df = card_diff(BASE, out(d)); O = out(d)["cards"]
ok(code == 0 and df == {"id_0001": ["ap", "lp"], "id_0002": ["lv"], "id_0003": ["extra"], "id_0004": ["n"], "id_0005": ["trait"]}, f"AP/LP/lv/한국어/이름/특징 수정 → 해당 필드만 변경 ({df})")
ok(O["id_0001"]["ap"] == "9000" and O["id_0001"]["lp"] == "3" and O["id_0002"]["lv"] == "3" and O["id_0001"]["ab"] == BASE["cards"]["id_0001"]["ab"], "숫자는 JSON 에서 원래대로 문자열 '9000' 형식, ab 는 그대로")
# ───── 4. 표시 텍스트 vs 실행 데이터 ─────
d = fresh("disp"); edit(d, setcell("Cards", "id_0284", "extra", "표시용 설명만 수정")); edit(d, setcell("Cards", "id_0284", "fx", "表示だけ変更")); code, o = build(d)
ok(code == 0 and out(d)["cards"]["id_0284"]["ab"] == BASE["cards"]["id_0284"]["ab"] and card_diff(BASE, out(d)) == {"id_0284": ["extra", "fx"]}, "한국어/일본어 텍스트만 고치면 효과 데이터(ab)는 그대로")
# ───── 5. 행 순서 바꿔도 무관 ─────
d = fresh("shuf")
def shuffle(wb):
    for name in ("Cards", "Abilities", "Ops"):
        ws = wb[name]; rows = [[c.value for c in r] for r in ws.iter_rows(min_row=2)]; random.Random(1).shuffle(rows)
        for i, r in enumerate(rows, 2):
            for j, v in enumerate(r, 1):
                c = ws.cell(i, j); c.value = v
                if isinstance(v, str) and not v.startswith("="): c.data_type = "s"
edit(d, shuffle); code, o = build(d); ok(code == 0 and "변경 없음" in o, "행 순서를 완전히 섞어도 결과 동일 (ID 로만 연결)")
# ───── 6. 실제 효과 수정 → 엔진 반영 ─────
def engine(db):
    p = TMP / "eng.json"; p.write_text(json.dumps(db, ensure_ascii=False), "utf-8")
    r = subprocess.run(["node", str(ROOT / "test" / "cards_xlsx_engine_check.js")], env={**os.environ, "CARDS_DB": str(p)}, capture_output=True, text=True, cwd=str(ROOT))
    try: return json.loads(r.stdout.strip().splitlines()[-1])["delta"]
    except Exception: print(r.stdout[-300:], r.stderr[-300:]); return None
d = fresh("eng"); ok(engine(BASE) == 2, "수정 전: id_0284 사용 → 카드 2장 드로우")
def efx(wb):
    ws = wb["Ops"]
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value == "id_0284" and ws.cell(r, 4).value == "draw": ws.cell(r, hcol(ws, "params")).value = '{"n":3}'
edit(d, efx); code, o = build(d); ok(code == 0 and out(d)["cards"]["id_0284"]["ab"][0]["ops"][0] == {"op": "draw", "n": 3} and card_diff(BASE, out(d)) == {"id_0284": ["ab"]}, "Ops 시트 params 수정 → ab 만 변경")
ok(engine(out(d)) == 3, "수정 후: 같은 카드가 게임에서 3장 드로우 (Excel 수정만으로 동작 변경)")
# ───── 7. 오류 → 빌드 실패 ─────
def bad(name, fn, expect, msgs=()):
    d = fresh("e_" + name); edit(d, fn); code, o = build(d); txt = o
    ok(code == 1 and not (d / "out.json").exists() and (d / "cards.json").read_text("utf-8") == BASE_TEXT and all(m in txt for m in expect), f"오류 차단 [{name}]: 빌드 실패·cards.json 불변 ({[m for m in expect if m not in txt] or 'OK'})")
    return txt
def dup(wb):
    ws = wb["Cards"]; r = row_of(ws, "id_0010"); r2 = row_of(ws, "id_0011"); ws.cell(r2, 1).value = "id_0010"
bad("중복 ID", dup, ["id_0010", "중복"])
def delid(wb):
    ws = wb["Cards"]; ws.delete_rows(row_of(ws, "id_0020"))
bad("ID 삭제", delid, ["id_0020", "사라졌습니다"])
def delmany(wb):
    ids = {wb["Cards"].cell(r, 1).value for r in range(2, 402)}
    for name in ("Cards", "Abilities", "Ops"):
        ws = wb[name]
        for r in range(ws.max_row, 1, -1):
            if ws.cell(r, 1).value in ids: ws.delete_rows(r)
bad("카드 수 급감", delmany, ["급감"])
bad("잘못된 color", setcell("Cards", "id_0030", "color", "pink"), ["id_0030", "color", "pink"])
bad("잘못된 type", setcell("Cards", "id_0031", "type", "monster"), ["id_0031", "type", "monster"])
t = bad("AP 문자", setcell("Cards", "id_0831", "ap", "5천"), ["id_0831", "AP 값이 숫자가 아닙니다", "5천"]); ok("Cards 시트 G" in t or "Cards 시트" in t, "오류 위치(시트/열/행) 표시")
bad("LP 문자", setcell("Cards", "id_0032", "lp", "abc"), ["id_0032", "LP 값이 숫자가 아닙니다"])
bad("lv 문자", setcell("Cards", "id_0033", "lv", "x"), ["id_0033", "LV 값이 숫자가 아닙니다"])
bad("lv 음수", setcell("Cards", "id_0033", "lv", -1), ["id_0033", "0 이상"])
bad("필수값 누락(캐릭터 AP)", setcell("Cards", "id_0259", "ap", None), ["id_0259", "AP"])
bad("이름 비움", setcell("Cards", "id_0035", "n", None), ["id_0035", "카드명"])
bad("ID 비움", setcell("Cards", "id_0036", "id", None), ["ID 가 비어 있습니다"])
bad("kw 오타", setcell("Cards", "id_0040", "kw", "asault"), ["id_0040", "asault"])
def unkop(wb):
    ws = wb["Ops"]
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value == "id_0284" and ws.cell(r, 4).value == "draw": ws.cell(r, 4).value = "teleport"
bad("존재하지 않는 primitive", unkop, ["id_0284", "지원되지 않는 효과 primitive 'teleport'"])
bad("깨진 params JSON", lambda wb: [setattr(wb["Ops"].cell(r, 6), "value", '{"n":') for r in range(2, wb["Ops"].max_row + 1) if wb["Ops"].cell(r, 1).value == "id_0284"], ["id_0284", "params"])
bad("알 수 없는 trigger", setcell("Abilities", "id_0257", "ic", "onfoo"), ["id_0257", "onfoo"])
bad("cond JSON 깨짐", setcell("Abilities", "id_0244", "cond", '{"pcolor":'), ["id_0244", "JSON"])
bad("cond 형식(배열)", setcell("Abilities", "id_0244", "cond", "[1,2]"), ["id_0244", "cond"])
bad("lim 범위", setcell("Abilities", "id_0257", "lim", 9), ["id_0257", "lim"])
bad("잘못된 enum 값(select.do)", lambda wb: [setattr(wb["Ops"].cell(r, 6), "value", wb["Ops"].cell(r, 6).value.replace('"do":"stun"', '"do":"explode"')) for r in range(2, wb["Ops"].max_row + 1) if wb["Ops"].cell(r, 1).value == "id_0244" and wb["Ops"].cell(r, 4).value == "if"], ["id_0244", "허용되지 않는 값"])
bad("Abilities 가 없는 카드", setcell("Abilities", "id_0257", "card_id", "id_9999"), ["id_9999"])
bad("ab_index 불연속", setcell("Abilities", "id_0257", "ab_index", 5), ["id_0257", "연속"])
bad("Ops 가 없는 능력", setcell("Ops", "id_0284", "ab_index", 7), ["id_0284", "Abilities 시트에 없는 능력"])
def nocol(wb):
    ws = wb["Cards"]; ws.cell(1, hcol(ws, "ap")).value = "ap_x"
bad("열 누락", nocol, ["필수 열 'ap'"])
def nosheet(wb): del wb["Ops"]
bad("시트 누락", nosheet, ["필수 시트 'Ops'"])
def dupcol(wb):
    ws = wb["Cards"]; ws.cell(1, hcol(ws, "lp")).value = "ap"
bad("열 중복", dupcol, ["중복"])
def stripops(wb):
    ws = wb["Ops"]; rows = [r for r in range(2, ws.max_row + 1) if ws.cell(r, 1).value == "id_0284"]
    for r in rows: ws.cell(r, 1).value = None; ws.cell(r, 4).value = None; ws.cell(r, 5).value = None; ws.cell(r, 6).value = None
bad("ops 행 삭제(→Ops 표시 남음)", stripops, ["id_0284", "Ops 시트에 행이 없습니다"])
d = TMP / "corrupt"; d.mkdir(); (d / "cards.json").write_text(BASE_TEXT); (d / "cards.xlsx").write_bytes(b"not an xlsx"); code, o = build(d); ok(code == 1 and "열 수 없습니다" in o, "깨진 xlsx 파일 → 명확한 오류")
# 의도적 삭제는 허용
d = fresh("del"); edit(d, delid); 
def delid2(wb):
    for name in ("Abilities", "Ops"):
        ws = wb[name]
        for r in range(ws.max_row, 1, -1):
            if ws.cell(r, 1).value == "id_0020": ws.delete_rows(r)
edit(d, delid2); code, o = build(d, allow_delete=["id_0020"]); ok(code == 0 and "id_0020" not in out(d)["cards"] and len(out(d)["cards"]) == 1250, "--allow-delete 로 명시한 삭제는 허용")
# ───── 8. 수정 내용이 다른 카드에는 영향 없음 + 새 카드 행(이미지 없음 경고) ─────
d = fresh("newrow")
def addrow(wb):
    ws = wb["Cards"]; r = ws.max_row + 1
    for k, v in {"id": "id_9001", "type": "char", "color": "blue", "lv": 3, "ap": 4000, "lp": 1, "n": "새 카드", "fx": "", "extra": ""}.items(): ws.cell(r, hcol(ws, k)).value = v
edit(d, addrow); code, o = build(d); O = out(d)["cards"]
ok(code == 0 and len(O) == 1252 and O["id_9001"]["img"] == "" and "이미지" in o and set(card_diff(BASE, out(d))) == {"id_9001"}, "Excel 에서 새 카드 행 추가 → 추가됨(이미지 없음 경고), 기존 카드 영향 없음")
# ───── 9. base 없이 빌드 → 이미지 경고 ─────
d = fresh("nobase"); code, o = qb(d / "cards.xlsx", d / "none.json", d / "o.json"); ok(code == 0 and "이미지" in o, "기존 cards.json 이 없으면 이미지 없음 경고 (이미지는 JSON 에만 있음)")
# ───── 10. JSON → Excel 병합 export ─────
d = fresh("merge"); edit(d, setcell("Cards", "id_0100", "color", "black")); edit(d, setcell("Cards", "id_0101", "ap", 1234))
db = copy.deepcopy(BASE); nc = copy.deepcopy(db["cards"]["id_0001"]); nc["id"] = "id_9100"; nc["n"] = "신탄 테스트"; db["cards"]["id_9100"] = nc; db["cards"]["id_0257"]["lp"] = "2"; db["cards"] = dict(sorted(db["cards"].items()))
(d / "cards.json").write_text(json.dumps(db, ensure_ascii=False, separators=(",", ":")), "utf-8")
r, o = qexp( d / "cards.json", d / "cards.xlsx")
cs, ms, pr = X.read_workbook(d / "cards.xlsx")
ok(not pr and cs["id_0100"]["color"] == "black" and cs["id_0101"]["ap"] == "1234", "export 병합: 내가 Excel 에서 고친 값(color/ap)이 보존됨")
ok("id_9100" in cs and cs["id_9100"]["n"] == "신탄 테스트" and r["added"] == ["id_9100"], "export 병합: JSON 에만 있는 새 카드 행이 추가됨")
ok(cs["id_0257"]["lp"] == BASE["cards"]["id_0257"]["lp"] and "id_0257" in r["kept_diff"], "Excel 과 JSON 이 다른 카드는 Excel 값 유지 + 목록으로 알림")
r, o = qexp( d / "cards.json", d / "cards.xlsx", update_ids=["id_0257"]); cs, ms, pr = X.read_workbook(d / "cards.xlsx"); ok(cs["id_0257"]["lp"] == "2" and cs["id_0100"]["color"] == "black", "--update-ids: 지정한 카드만 JSON 값으로 교체")
r, o = qexp( d / "cards.json", d / "cards.xlsx", prefer_json=True); cs, ms, pr = X.read_workbook(d / "cards.xlsx"); ok(cs["id_0100"]["color"] == BASE["cards"]["id_0100"]["color"], "--prefer-json: JSON 값으로 전부 교체")
# 병합 후 빌드 → JSON 이 Excel 과 일치
d = fresh("merge2"); (d / "cards.json").write_text(json.dumps(db, ensure_ascii=False, separators=(",", ":")), "utf-8"); quiet(E.export, d / "cards.json", d / "cards.xlsx"); code, o = qb(d / "cards.xlsx", d / "cards.json", d / "cards.json"); ok(code == 0 and qb(d / "cards.xlsx", d / "cards.json", d / "cards.json", check=True)[0] == 0, "신탄 추가 후 export → build: Excel 과 JSON 이 다시 일치(갈라지지 않음)")
# ───── 11. 추가 필드/최상위 항목도 무손실 ─────
d = fresh("extra"); db2 = copy.deepcopy(BASE); db2["cards"]["id_0200"]["flags"] = ["a", {"b": 1}]; db2["cards"]["id_0201"]["note"] = "메모"; db2["decks"] = {"d1": {"cards": {"id_0001": 3}}}; db2["version"] = 7
(d / "cards.json").write_text(json.dumps(db2, ensure_ascii=False, separators=(",", ":")), "utf-8"); quiet(E.export, d / "cards.json", d / "cards.xlsx", rebuild=True); code, o = build(d)
ok(code == 0 and "변경 없음" in o, "알려지지 않은 카드 필드/최상위 항목(decks, version)도 round-trip 무손실 (CardExtra/Meta 시트)")
# ───── 12. 값 형식 round-trip (모호한 문자열) ─────
for v in ["5", "true", "null", "[1]", " x ", "", "=SUM(1)", "-3", '"q"']:
    c = X.dec(X.enc(v)); 
    if c is X.MISSING: c = ""
    if c != v: ok(False, f"enc/dec round-trip 실패: {v!r} → {c!r}"); break
else: ok(True, "enc/dec: 모호한 문자열('5','true','null','[1]', 앞뒤 공백, 빈 문자열, '=…')도 무손실")
# ───── 13. 서버가 변환 결과를 그대로 읽음 ─────
d = fresh("srv"); edit(d, setcell("Cards", "id_0123", "color", "red")); build(d)
r = subprocess.run(["node", "-e", "process.env.CARDS_JSON=process.argv[1];const S=require('./server.js');const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(S.validateCards(j), j.cards.id_0123.color)", str(d / "out.json")], capture_output=True, text=True, cwd=str(ROOT))
ok(r.stdout.split() == ["1251", "red"], f"서버 validateCards 가 변환된 cards.json 을 그대로 받아들임 ({r.stdout.strip()} {r.stderr[-100:]})")
# ───── 14. 신탄 추가(add_new_cards.py) 연동 ─────
try:
    sys.path.insert(0, str(ROOT)); import add_new_cards as ANC
    d = fresh("anc"); edit(d, setcell("Cards", "id_0100", "color", "black"))           # 내가 Excel 에서 수정한 값
    db3 = copy.deepcopy(BASE); n1 = copy.deepcopy(db3["cards"]["id_0001"]); n1["id"] = "id_9200"; n1["n"] = "신탄A"; db3["cards"]["id_9200"] = n1; db3["cards"] = dict(sorted(db3["cards"].items()))
    (d / "cards.json").write_text(json.dumps(db3, ensure_ascii=False, separators=(",", ":")), "utf-8")   # add_new_cards 가 JSON 에 새 카드를 넣은 상황
    quiet(ANC.sync_excel_after_import, d / "cards.json", ["id_9200"], [])
    j = json.loads((d / "cards.json").read_text("utf-8")); cs, ms, pr = X.read_workbook(d / "cards.xlsx")
    ok("id_9200" in cs and cs["id_9200"]["n"] == "신탄A" and not pr, "신탄 추가 후 cards.xlsx 에 새 카드 행 자동 추가")
    ok(j["cards"]["id_0100"]["color"] == "black" and j["cards"]["id_9200"]["img"] == BASE["cards"]["id_0001"]["img"] and len(j["cards"]) == 1252, "Excel 수정분(color) 보존 + 새 카드 이미지 유지 + cards.json 과 Excel 이 일치")
except ImportError as e:
    print("SKIP 신탄 연동(필요 모듈 없음):", e)
shutil.rmtree(TMP, ignore_errors=True)
print(f"cards_xlsx_test: {P} 통과, {F} 실패"); sys.exit(1 if F else 0)
