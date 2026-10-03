#!/usr/bin/env python3
"""v1.11.0 Excel own(소유자) 관리 테스트: filter_own 열 round-trip / 수정 반영 / 잘못된 값 차단 / 충돌 / 중첩 own 검증 / pick.own / 미지정 경고 / 옛 Excel 호환.
실행: python3 test/ownership_xlsx_test.py   (openpyxl, node 필요)"""
import contextlib, io, json, sys, tempfile, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import cards_xlsx as X, build_cards_from_excel as B, export_cards_to_excel as E
try: import openpyxl
except ImportError: print("SKIP: openpyxl 없음"); sys.exit(0)

P = F = 0
def ok(c, m):
    global P, F
    print("✓" if c else "✗", m); P += bool(c); F += (not c)

TMP = Path(tempfile.mkdtemp(prefix="ox_"))
BASE_TEXT = (ROOT / "data" / "cards.json").read_text("utf-8"); BASE = json.loads(BASE_TEXT)
def quiet(f, *a, **k):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): r = f(*a, **k)
    return r, buf.getvalue()
def fresh(name):
    d = TMP / name; d.mkdir(); (d / "cards.json").write_text(BASE_TEXT, "utf-8")
    quiet(E.export, d / "cards.json", d / "cards.xlsx", rebuild=True); return d
def hcol(ws, name):
    for c in range(1, ws.max_column + 1):
        if ws.cell(1, c).value == name: return c
def ops_row(ws, cid, ab, op_index=0):
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value == cid and ws.cell(r, 2).value == ab and ws.cell(r, 3).value == op_index: return r
def edit(d, fn):
    wb = openpyxl.load_workbook(d / "cards.xlsx"); fn(wb); wb.save(d / "cards.xlsx")
def build(d):
    r, o = quiet(B.build, d / "cards.xlsx", d / "cards.json", d / "out.json"); return r[0], o
def out(d):
    f = d / "out.json"   # 변경이 없으면 빌드가 새 파일을 만들지 않는다 → 원본 JSON 이 그대로
    return json.loads((f if f.exists() else d / "cards.json").read_text("utf-8"))
def same_except(a, b, ids):
    return [cid for cid in a["cards"] if a["cards"][cid] != b["cards"][cid] and cid not in ids] == [] and set(a["cards"]) == set(b["cards"])

# 1. round-trip: filter_own 열이 있어도 무손실
d = fresh("rt"); code, o = build(d)
ok(code == 0 and out(d) == BASE, "filter_own 열 포함 Excel → JSON round-trip 이 원본과 동일 (1,251장)")
wb = openpyxl.load_workbook(d / "cards.xlsx"); ws = wb["Ops"]
ok(ws.cell(1, 5).value == "filter_own" and ws.cell(1, 6).value == "params", "Ops 시트에 filter_own 열이 있음")
r0 = ops_row(ws, "id_0808", 1); ok(ws.cell(r0, 5).value == "any" and '"own"' not in (ws.cell(r0, 6).value or ""), "id_0808 리무브 대상: filter_own=any (params 에는 own 이 중복되지 않음)")
dvs = [(str(v.sqref), v.formula1) for v in ws.data_validations.dataValidation]
ok(any(f == '"self,opp,any"' for _, f in dvs), "filter_own 열에 self/opp/any 드롭다운(데이터 검증)")

# 2. Excel 에서 filter_own 수정 → 그 카드만 변경, 값 반영
d = fresh("edit"); edit(d, lambda wb: wb["Ops"].cell(ops_row(wb["Ops"], "id_0808", 1), 5).__setattr__("value", "opp"))
code, o = build(d); new = out(d)
ok(code == 0 and new["cards"]["id_0808"]["ab"][1]["ops"][0]["filter"]["own"] == "opp" and same_except(BASE, new, {"id_0808"}), "filter_own any→opp 수정 → id_0808 의 target own 만 opp 로 바뀜 (다른 카드 변화 없음)")
FXJS = "const FX=require('./fx')({contact(){},okc(){},win(){},D(){},say(){},shuf(){},pull(){},chk(){},gain(){},nm(){},fcount(){},cols(){},ap(){},lpOf(){}});const ab=JSON.parse(process.argv[1]);console.log(JSON.stringify(FX.cleanAb(ab)[1].ops[0].filter.own))"
r = subprocess.run(["node", "-e", FXJS, json.dumps(new["cards"]["id_0808"]["ab"])], capture_output=True, text=True, cwd=str(ROOT)); ok(r.stdout.strip() == '"opp"', "엔진(cleanAb)이 수정한 own 을 그대로 사용 (op 이름으로 바꾸지 않음)")

# 3. 잘못된 값 → 빌드 실패 + 어느 카드/셀인지
d = fresh("bad"); edit(d, lambda wb: wb["Ops"].cell(ops_row(wb["Ops"], "id_0808", 1), 5).__setattr__("value", "foo"))
code, o = build(d); ok(code != 0 and "id_0808" in o and "filter_own" in o and "self / opp / any" in o, "filter_own 에 foo → 오류 (카드 ID/열/허용값 안내)")
d = fresh("bad2"); edit(d, lambda wb: wb["Ops"].cell(ops_row(wb["Ops"], "id_0808", 1), 5).__setattr__("value", "any"))
def both(wb):
    ws = wb["Ops"]; r = ops_row(ws, "id_0808", 1); ws.cell(r, 6).value = '{"n":1,"do":"remove","filter":{"own":"self"}}'
edit(d, both); code, o = build(d); ok(code != 0 and "서로 다릅니다" in o, "filter_own 과 params.filter.own 이 충돌 → 오류")
# 중첩(ifc 안의 select) 의 own 값은 params JSON 에서 검증
d = fresh("nest")
def nest(wb):
    ws = wb["Ops"]; r = ops_row(ws, "id_0909", 0); v = ws.cell(r, 6).value; assert '"own":"any"' in v; ws.cell(r, 6).value = v.replace('"own":"any"', '"own":"both"')
edit(d, nest); code, o = build(d); ok(code != 0 and "id_0909" in o and "own 값이 올바르지 않습니다" in o and "both" in o, "중첩된 효과(ifc 안 select)의 own:both → 오류")
# pick.own(구역 소유자)은 self/opp 만
pk = next((cid for cid, c in BASE["cards"].items() for a in c["ab"] for op in a.get("ops", []) if op.get("op") == "pick" and op.get("own") in ("self", "opp")), None)
d = fresh("pick")
def pickbad(wb):
    ws = wb["Ops"]
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value == pk and ws.cell(r, 4).value == "pick" and '"own":"' in (ws.cell(r, 6).value or ""):
            v = ws.cell(r, 6).value; ws.cell(r, 6).value = v.replace('"own":"self"', '"own":"any"').replace('"own":"opp"', '"own":"any"'); return
edit(d, pickbad); code, o = build(d); ok(pk and code != 0 and pk in o and "pick" in o, f"pick 효과의 own(구역 소유자)에 any → 오류 ({pk})")

# 4. own 을 비우면(미지정) 경고 — 빌드는 통과하되 사람에게 알림
d = fresh("warn"); edit(d, lambda wb: wb["Ops"].cell(ops_row(wb["Ops"], "id_0808", 1), 5).__setattr__("value", None))
code, o = build(d); ok(code == 0 and "own 이 비어 있습니다" in o and "id_0808" in o, "filter_own 을 비움 → 빌드는 통과, 경고(미지정 → 제한 없이 양쪽 처리) 표시")

# 5. 옛 형식(own 이 params 안에 있고 filter_own 열이 비어 있음)도 그대로 읽힌다
d = fresh("old")
def oldfmt(wb):
    ws = wb["Ops"]; r = ops_row(ws, "id_0808", 1); ws.cell(r, 5).value = None; ws.cell(r, 6).value = '{"n":1,"do":"remove","filter":{"own":"any"}}'
edit(d, oldfmt); code, o = build(d); ok(code == 0 and out(d) == BASE, "params 안의 filter.own 으로 적은 옛 형식도 동일하게 변환됨")

# 6. 전체 DB: 모든 own 값이 올바르고, 미지정 target 은 ownership_review.csv 에 있는 것뿐
bad = [p for cid, c in BASE["cards"].items() for p in X.own_problems(cid, c.get("ab") or [])]
ok(not bad, f"cards.json 전체의 own 값이 모두 올바름 (잘못된 값 {len(bad)}개)")
print(f"ownership_xlsx_test: {P} 통과, {F} 실패"); sys.exit(1 if F else 0)
