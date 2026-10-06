#!/usr/bin/env python3
"""cards.json <-> cards.xlsx 변환 공용 라이브러리 (v1.10.0).

원칙
  · Excel(data/cards.xlsx) = 사람이 관리하는 원본, JSON(data/cards.json) = 게임이 읽는 런타임 파일(자동 생성).
  · 연결 키는 항상 카드 ID. 행 순서/정렬은 의미가 없다.
  · 이미지(img: base64 data URL)는 Excel 에 넣지 않는다. 빌드할 때 기존 cards.json 에서 ID 로 그대로 가져온다(손실 없음).
  · 값 인코딩은 무손실: 문자열은 그대로, 숫자/true/false/null/배열/객체는 JSON 표기. (예: 문자열 "5" 는 "\"5\"" 로 구분)
"""
import copy, hashlib, json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# ───────── 시트/열 정의 (현재 cards.json 에 실제 존재하는 필드 기준) ─────────
SHEETS = ("Cards", "Abilities", "Ops", "CardExtra", "Meta")
CARD_COLS = ["id", "type", "color", "lv", "lv2", "ap", "lp", "kw", "trait", "n", "series", "fx", "extra", "file"]   # 카드 1장의 스칼라 필드 (모두 문자열)
CARD_READONLY = ["ab_count", "img_info"]                                                                   # 참고용(가져올 때 무시)
NUM_COLS = ("lv", "lv2", "ap", "lp")
CARD_ABKEY, CARD_IMG = "ab", "img"
OPTIONAL_COLS = {"series"}   # 옛 Excel 에 없어도 오류가 아닌 열 (없으면 기존 JSON 값 유지)
LAST_HAS = set()             # 마지막으로 읽은 Cards 시트에 실제로 있던 선택 열
CORE_KEYS = set(CARD_COLS) | {CARD_ABKEY, CARD_IMG}
AB_FIXED = ["card_id", "ab_index"]
AB_FIRST = ["ic", "txt", "lim", "cond", "tgt", "cost", "ops"]            # 항상 앞에 두는 열
AB_READONLY = ["ops_count"]
OPS_COLS = ["card_id", "ab_index", "op_index", "op", "params"]                  # 필수 열
OPS_ALL = ["card_id", "ab_index", "op_index", "op", "filter_own", "params"]      # 실제로 쓰는 열 (filter_own 은 선택 열: 없는 옛 Excel 도 읽힌다)
OWN_VALUES = ("self", "opp", "any")
OPS_PLACEHOLDER = "→Ops"                                                 # Abilities.ops 셀: 이 능력의 ops 는 Ops 시트에 있음
COLOR_TOKENS_DEFAULT = ["red", "blue", "green", "yellow", "white", "black", "purple"]
ID_RE = re.compile(r"^id_[0-9A-Za-z_]+$")
DIGITS = re.compile(r"^\d+$")
KW_RE = re.compile(r"^(rapid|assault(-char|-case)?|bullet|disguise|misread\d+|cutin\d+)$")
# 타입별 필수 숫자 필드 (현재 DB 1,251장이 전부 만족하는 규칙만 사용)
TYPE_REQ = {"char": ("lv", "ap", "lp"), "event": ("lv",), "partner": ("lp",), "case": ("lv", "lv2")}

DESC = {   # 필드 설명 / 편집 구분
 "id": ("카드 ID (연결 키, 바꾸지 마세요)", "key"), "type": ("카드 종류 char/event/partner/case", "logic"), "color": ("색상 (여러 색은 / 로 연결)", "logic"),
 "lv": ("레벨 = FILE 코스트", "logic"), "lv2": ("사건 카드의 해결편 레벨", "logic"), "ap": ("AP (공격력)", "logic"), "lp": ("LP (라이프)", "logic"),
 "kw": ("키워드 (assault, misread1, disguise, rapid, bullet …)", "logic"), "trait": ("특징 (쉼표로 구분)", "logic"), "n": ("카드명", "display"),
 "fx": ("일본어 원문 효과 텍스트 (표시용, 엔진 동작에 영향 없음)", "display"), "extra": ("한국어 효과 설명 (표시용, 엔진 동작에 영향 없음)", "display"),
 "file": ("카드 이미지 원본 파일명 (참고용 메타데이터)", "meta"),
 "series": ("시리즈/상품 코드 (P01~P11 = 박스, D01~ = 덱; 카드 이미지 오른쪽 아래 B11…/D01… 코드 기준). 덱빌더에서 P11 처럼 검색. 잘못 읽혔으면 여기서 고치세요", "display"),
 "ab_count": ("능력(ab) 개수 — 자동 계산, 편집 불필요", "readonly"), "img_info": ("이미지 정보 — 참고용. 이미지는 Excel 이 아니라 cards.json 에 보존됨", "readonly"),
 "card_id": ("카드 ID", "key"), "ab_index": ("카드 안에서의 능력 번호 (0부터)", "key"), "ic": ("trigger/능력 종류 (onplay, declare, flash …)", "logic"),
 "txt": ("이 능력의 일본어 원문 (표시용)", "display"), "lim": ("사용 제한 횟수(ターン n)", "logic"), "cond": ("발동 조건 (JSON 객체)", "logic"), "tgt": ("대상 지정 (JSON 객체)", "logic"),
 "cost": ("코스트 (JSON 배열)", "logic"), "ops": ("실행 효과 → Ops 시트 참조", "logic"), "ops_count": ("ops 개수 — 자동 계산", "readonly"),
 "filter_own": ("실제 효과 대상(filter)의 소유자: self=내 쪽 / opp=상대 쪽 / any=양쪽. 최상위 효과의 filter.own 을 여기서 관리합니다 (params 의 filter 에는 own 이 안 보임). 비워 두면 own 미지정 — 엔진은 플레이를 막지 않도록 제한 없이(양쪽) 처리하고 검증이 경고합니다. 굵은 조건/코스트의 own 은 Abilities 시트의 cond/cost 안에 있습니다.", "logic"),
 "op_index": ("능력 안에서의 효과 순서 (0부터)", "key"), "op": ("효과 primitive 이름 (엔진이 지원하는 것만)", "logic"), "params": ("효과 매개변수 (JSON 객체, 하위 ops 포함)", "logic"),
}
FILL = {"key": "D9E1F2", "logic": "FCE4D6", "display": "E2EFDA", "meta": "FFF2CC", "readonly": "D9D9D9"}


class Problem:
    __slots__ = ("level", "id", "where", "msg")
    def __init__(self, level, id_, where, msg): self.level, self.id, self.where, self.msg = level, id_, where, msg
    def __str__(self): return f"{self.id or '-'}\n  [{self.where}] {self.msg}" if self.where else f"{self.id or '-'}\n  {self.msg}"


# ───────── 값 인코딩 (무손실) ─────────
def _jloads(s):
    try: return True, json.loads(s)
    except Exception: return False, None

def enc(v):
    """JSON 값 → 셀 값. 문자열은 가능하면 그대로, 모호하면 JSON 문자열, 숫자는 숫자, 나머지는 JSON 표기."""
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int): return v
    if isinstance(v, float): return json.dumps(v)
    if isinstance(v, str):
        if v == "" or v != v.strip() or _jloads(v)[0]: return json.dumps(v, ensure_ascii=False)
        return v
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))

MISSING = object()
def dec(c):
    """셀 값 → JSON 값 (빈 셀 = MISSING)."""
    if c is None: return MISSING
    if isinstance(c, bool): return c
    if isinstance(c, int): return c
    if isinstance(c, float): return int(c) if c.is_integer() else c
    if isinstance(c, str):
        if c.strip() == "": return MISSING
        ok, v = _jloads(c)
        return v if ok else c
    return str(c)


# ───────── JSON → 시트 행 ─────────
def ab_columns(cards):
    freq = {}
    for c in cards.values():
        for a in c.get(CARD_ABKEY) or []:
            for k in a: freq[k] = freq.get(k, 0) + 1
    rest = sorted((k for k in freq if k not in AB_FIRST), key=lambda k: (-freq[k], k))
    return [k for k in AB_FIRST if k in freq or k == "ops"] + rest


def img_info(card):
    im = card.get(CARD_IMG) or ""
    if not im: return "(이미지 없음)"
    head, _, b64 = im.partition(",")
    return f"{head.replace('data:', '')} {len(b64) * 3 // 4 // 1024}KB sha1:{hashlib.sha1(im.encode()).hexdigest()[:8]}"


def card_rows(cards):
    """cards(dict id→card) → (Cards 행, Abilities 행(dict), Ops 행, CardExtra 행). 정렬: ID 순."""
    cr, ar, orows, er = [], [], [], []
    for cid in sorted(cards):
        c = cards[cid]
        row = {"id": cid}
        for k in CARD_COLS[1:]:
            if k in c:
                v = c[k]
                row[k] = (int(v) if k in NUM_COLS and isinstance(v, str) and re.fullmatch(r"0|[1-9]\d*", v) else v)
        row["ab_count"] = len(c.get(CARD_ABKEY) or []); row["img_info"] = img_info(c)
        cr.append(row)
        for i, a in enumerate(c.get(CARD_ABKEY) or []):
            arow = {"card_id": cid, "ab_index": i}
            for k, v in a.items():
                if k == "ops":
                    arow["ops"] = OPS_PLACEHOLDER if v else "[]"
                    for j, o in enumerate(v or []):
                        op = o.get("op") if isinstance(o, dict) else None
                        if not isinstance(o, dict) or not isinstance(op, str):
                            raise ValueError(f"{cid} ab[{i}].ops[{j}] 형식이 op 객체가 아닙니다")
                        params = {pk: pv for pk, pv in o.items() if pk != "op"}
                        fown = ""
                        if isinstance(params.get("filter"), dict) and "own" in params["filter"] and isinstance(params["filter"]["own"], str):
                            fown = params["filter"]["own"]; params["filter"] = {fk: fv for fk, fv in params["filter"].items() if fk != "own"}   # own 은 filter_own 열에서 관리
                        orows.append({"card_id": cid, "ab_index": i, "op_index": j, "op": op, "filter_own": fown, "params": json.dumps(params, ensure_ascii=False, separators=(",", ":")) if params else ""})
                else: arow[k] = enc(v) if k not in ("ic", "txt", "lim") else v
            arow["ops_count"] = len(a.get("ops") or [])
            ar.append(arow)
        for k, v in c.items():
            if k not in CORE_KEYS: er.append({"card_id": cid, "key": k, "value": enc(v)})
    return cr, ar, orows, er


# ───────── 시트 → JSON ─────────
def _headers(ws, sheet, required, probs):
    hdr = []
    for cell in ws[1]:
        v = cell.value
        hdr.append(None if v is None or str(v).strip() == "" else str(v).strip())
    seen = {}
    for i, h in enumerate(hdr):
        if h is None or h.startswith(("#", "_")): continue
        if h in seen: probs.append(Problem("ERROR", None, f"{sheet} 시트 {i + 1}열", f"열 이름 '{h}' 이(가) 중복되었습니다"))
        seen[h] = i
    for r in required:
        if r not in seen: probs.append(Problem("ERROR", None, f"{sheet} 시트 1행", f"필수 열 '{r}' 이(가) 없습니다 (열 이름을 바꾸거나 지우지 마세요)"))
    return hdr, seen


def _rows(ws):
    for ridx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if all(v is None or (isinstance(v, str) and v.strip() == "") for v in row): continue
        yield ridx, row


def _colname(i):
    s, i = "", i + 1
    while i: i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s


def read_workbook(path):
    """xlsx → (cards: dict id→card(img 제외), meta dict, problems). 형식 오류는 problems 에 쌓는다(예외 아님)."""
    import openpyxl
    probs = []
    try: wb = openpyxl.load_workbook(str(path), data_only=False)
    except Exception as e: return None, None, [Problem("ERROR", None, str(path), f"Excel 파일을 열 수 없습니다: {e}")]
    for s in ("Cards", "Abilities", "Ops"):
        if s not in wb.sheetnames: probs.append(Problem("ERROR", None, "시트", f"필수 시트 '{s}' 이(가) 없습니다"))
    if probs: return None, None, probs
    cards, order = {}, {}
    # --- Cards
    ws = wb["Cards"]; hdr, hx = _headers(ws, "Cards", [c for c in CARD_COLS if c not in OPTIONAL_COLS], probs)
    LAST_HAS.clear(); LAST_HAS.update(c for c in OPTIONAL_COLS if c in hx)
    if probs: return None, None, probs
    known = set(CARD_COLS) | set(CARD_READONLY)
    for h in hx:
        if h not in known: probs.append(Problem("WARN", None, "Cards 시트", f"알 수 없는 열 '{h}' 은(는) 무시됩니다 (메모용 열은 이름 앞에 # 을 붙이세요)"))
    for r, row in _rows(ws):
        cid = row[hx["id"]]; cid = "" if cid is None else str(cid).strip()
        w = lambda col: f"Cards 시트 {_colname(hx[col])}{r} ({col})"
        if not cid: probs.append(Problem("ERROR", None, f"Cards 시트 {r}행", "카드 ID 가 비어 있습니다")); continue
        if cid in cards: probs.append(Problem("ERROR", cid, f"Cards 시트 {r}행", "카드 ID 가 중복되었습니다")); continue
        if not ID_RE.match(cid): probs.append(Problem("ERROR", cid, w("id"), "카드 ID 형식이 올바르지 않습니다 (id_0001 형태)"))
        c = {"id": cid}; cards[cid] = c; order[cid] = r
        for k in CARD_COLS[1:]:
            if k not in hx: continue
            v = row[hx[k]]
            if v is None: continue
            if k in NUM_COLS:
                if isinstance(v, bool): probs.append(Problem("ERROR", cid, w(k), f"{k.upper()} 값이 숫자가 아닙니다: {v!r}")); continue
                if isinstance(v, float) and v.is_integer(): v = int(v)
                if isinstance(v, int):
                    if v < 0: probs.append(Problem("ERROR", cid, w(k), f"{k.upper()} 값은 0 이상의 정수여야 합니다: {v}")); continue
                    c[k] = str(v)
                else:
                    s = str(v).strip()
                    if s == "": continue
                    if not DIGITS.match(s): probs.append(Problem("ERROR", cid, w(k), f"{k.upper()} 값이 숫자가 아닙니다: {v!r}")); continue
                    c[k] = s
            else:
                c[k] = v if isinstance(v, str) else str(v)
    # --- Abilities
    abk = {}      # (cid, idx) → ab dict
    n0 = len(probs); ws = wb["Abilities"]; hdr, hx = _headers(ws, "Abilities", AB_FIXED + ["ic"], probs)
    if len(probs) > n0: return None, None, probs
    ab_keys = [h for h in hx if h not in AB_FIXED and h not in AB_READONLY]
    opsmark = {}
    for r, row in _rows(ws):
        cid = row[hx["card_id"]]; cid = "" if cid is None else str(cid).strip()
        w = lambda col: f"Abilities 시트 {_colname(hx[col])}{r} ({col})"
        if cid not in cards: probs.append(Problem("ERROR", cid or None, f"Abilities 시트 {r}행", "Cards 시트에 없는 카드 ID 입니다")); continue
        ix = dec(row[hx["ab_index"]])
        if not isinstance(ix, int) or isinstance(ix, bool) or ix < 0: probs.append(Problem("ERROR", cid, w("ab_index"), f"ab_index 는 0 이상의 정수여야 합니다: {row[hx['ab_index']]!r}")); continue
        if (cid, ix) in abk: probs.append(Problem("ERROR", cid, f"Abilities 시트 {r}행", f"ab_index {ix} 이(가) 중복되었습니다")); continue
        a = {}
        for k in ab_keys:
            raw = row[hx[k]]
            if raw is None or (isinstance(raw, str) and raw.strip() == ""): continue
            if k == "ops": opsmark[(cid, ix)] = (str(raw).strip(), r, hx[k]); continue
            if k in ("ic", "txt"): a[k] = raw if isinstance(raw, str) else str(raw); continue
            v = dec(raw)
            if isinstance(raw, str):
                s = raw.strip()
                if s[:1] in "{[" and not _jloads(s)[0]: probs.append(Problem("ERROR", cid, w(k), f"JSON 형식이 깨졌습니다: {raw[:60]}")); continue
            a[k] = v
        a["_row"] = r; abk[(cid, ix)] = a
    # --- Ops
    n0 = len(probs); ws = wb["Ops"]; hdr, hx = _headers(ws, "Ops", OPS_COLS, probs)
    if len(probs) > n0: return None, None, probs
    opsrows = {}
    for r, row in _rows(ws):
        cid = row[hx["card_id"]]; cid = "" if cid is None else str(cid).strip()
        w = lambda col: f"Ops 시트 {_colname(hx[col])}{r} ({col})"
        ai, oi = dec(row[hx["ab_index"]]), dec(row[hx["op_index"]])
        if (cid, ai) not in abk: probs.append(Problem("ERROR", cid or None, f"Ops 시트 {r}행", f"Abilities 시트에 없는 능력입니다 (card_id={cid}, ab_index={ai})")); continue
        if not isinstance(oi, int) or isinstance(oi, bool) or oi < 0: probs.append(Problem("ERROR", cid, w("op_index"), f"op_index 는 0 이상의 정수여야 합니다: {row[hx['op_index']]!r}")); continue
        opn = row[hx["op"]]; opn = "" if opn is None else str(opn).strip()
        if not opn: probs.append(Problem("ERROR", cid, w("op"), "효과 primitive(op) 이름이 비어 있습니다")); continue
        p = row[hx["params"]]; params = {}
        if p is not None and str(p).strip() != "":
            ok, v = _jloads(str(p))
            if not ok or not isinstance(v, dict): probs.append(Problem("ERROR", cid, w("params"), f"params 는 JSON 객체여야 합니다: {str(p)[:60]}")); continue
            params = v
        if "filter_own" in hx:
            fo = row[hx["filter_own"]]; fo = "" if fo is None else str(fo).strip()
            if fo:
                if fo not in OWN_VALUES: probs.append(Problem("ERROR", cid, w("filter_own"), f"filter_own 값이 올바르지 않습니다: {fo!r} (self / opp / any 중 하나)")); continue
                f_ = params.get("filter")
                if f_ is None: f_ = {}; params["filter"] = f_
                if not isinstance(f_, dict): probs.append(Problem("ERROR", cid, w("params"), "filter_own 을 쓰려면 params 의 filter 가 객체여야 합니다")); continue
                if "own" in f_ and f_["own"] != fo: probs.append(Problem("ERROR", cid, w("filter_own"), f"filter_own({fo}) 과 params.filter.own({f_['own']!r}) 이 서로 다릅니다 — 한쪽만 남기세요")); continue
                f_["own"] = fo
        if oi in opsrows.setdefault((cid, ai), {}): probs.append(Problem("ERROR", cid, f"Ops 시트 {r}행", f"op_index {oi} 이(가) 중복되었습니다 (ab_index {ai})")); continue
        opsrows[(cid, ai)][oi] = {"op": opn, **params}
    # --- 능력 조립
    per = {}
    for (cid, ix), a in sorted(abk.items()): per.setdefault(cid, []).append((ix, a))
    for cid, lst in per.items():
        idxs = [i for i, _ in lst]
        if idxs != list(range(len(idxs))): probs.append(Problem("ERROR", cid, "Abilities 시트", f"ab_index 가 0부터 연속되어야 합니다 (현재 {idxs})"))
        abl = []
        for ix, a in lst:
            r = a.pop("_row"); rows_ = opsrows.get((cid, ix)); mark = opsmark.get((cid, ix))
            if rows_:
                oi = sorted(rows_)
                if oi != list(range(len(oi))): probs.append(Problem("ERROR", cid, "Ops 시트", f"ab_index {ix} 의 op_index 가 0부터 연속되어야 합니다 (현재 {oi})"))
                a["ops"] = [rows_[i] for i in oi]
            elif mark:
                if mark[0] == "[]": a["ops"] = []
                elif mark[0] == OPS_PLACEHOLDER: probs.append(Problem("ERROR", cid, f"Abilities 시트 {_colname(mark[2])}{mark[1]} (ops)", f"ab_index {ix}: ops 가 '{OPS_PLACEHOLDER}' 인데 Ops 시트에 행이 없습니다 (효과를 지우려면 ops 칸에 [] 를 적으세요)")); a["ops"] = []
                else:
                    ok, v = _jloads(mark[0])
                    if ok and isinstance(v, list): a["ops"] = v
                    else: probs.append(Problem("ERROR", cid, f"Abilities 시트 {_colname(mark[2])}{mark[1]} (ops)", f"ops 칸은 '{OPS_PLACEHOLDER}' 또는 [] 이어야 합니다: {mark[0][:40]}"))
            abl.append(a)
        cards[cid][CARD_ABKEY] = abl
    for (cid, ix), rows_ in opsrows.items():
        if (cid, ix) not in opsmark and rows_ and (cid, ix) in abk:
            pass
    for cid in cards:
        if CARD_ABKEY not in cards[cid]: cards[cid][CARD_ABKEY] = []
    # --- CardExtra
    if "CardExtra" in wb.sheetnames:
        n0 = len(probs); ws = wb["CardExtra"]; hdr, hx = _headers(ws, "CardExtra", ["card_id", "key", "value"], probs)
        if len(probs) == n0:
            for r, row in _rows(ws):
                cid = str(row[hx["card_id"]] or "").strip(); k = str(row[hx["key"]] or "").strip()
                if cid not in cards: probs.append(Problem("ERROR", cid or None, f"CardExtra 시트 {r}행", "Cards 시트에 없는 카드 ID 입니다")); continue
                if not k or k in CORE_KEYS: probs.append(Problem("ERROR", cid, f"CardExtra 시트 {r}행", f"key '{k}' 이(가) 올바르지 않습니다")); continue
                v = dec(row[hx["value"]])
                if v is not MISSING: cards[cid][k] = v
    meta = {}
    if "Meta" in wb.sheetnames:
        n0 = len(probs); ws = wb["Meta"]; hdr, hx = _headers(ws, "Meta", ["key", "value"], probs)
        if len(probs) == n0:
            for r, row in _rows(ws):
                k = str(row[hx["key"]] or "").strip()
                if not k: continue
                if k == "cards": probs.append(Problem("ERROR", None, f"Meta 시트 {r}행", "key 'cards' 는 사용할 수 없습니다")); continue
                v = dec(row[hx["value"]])
                if v is not MISSING: meta[k] = v
    return cards, meta, probs


# ───────── 기존 DB(base) 와 합치기: Excel 이 관리하는 필드는 Excel 값, 나머지(img 등)는 기존 값 그대로 ─────────
def reorder_like(new, old):
    """new 의 의미는 그대로 두고, 키 순서만 old 와 같게 맞춘다(바뀌지 않은 부분의 파일 diff 를 없애기 위함)."""
    if isinstance(new, dict) and isinstance(old, dict):
        out = {k: reorder_like(new[k], old[k]) for k in old if k in new}
        for k in new:
            if k not in out: out[k] = new[k]
        return out
    if isinstance(new, list) and isinstance(old, list):
        return [reorder_like(n, old[i]) if i < len(old) else n for i, n in enumerate(new)]
    return new


def merge_with_base(xl_cards, xl_meta, base):
    """→ 새 DB dict. base: 기존 cards.json 전체(dict) 또는 None."""
    bc = (base or {}).get("cards", {}) if base else {}
    out_cards = {}
    for cid in sorted(xl_cards):
        x = xl_cards[cid]; b = bc.get(cid)
        if b is None:
            card = {k: x[k] for k in CARD_COLS if k in x}; card["ab"] = x.get("ab", [])
            for k, v in x.items():
                if k not in CORE_KEYS: card[k] = v
            card["img"] = ""
        else:
            card = copy.deepcopy(b)
            for k in CARD_COLS:
                if k in OPTIONAL_COLS and k not in LAST_HAS: continue      # Excel 에 그 열이 없으면 기존 JSON 값 유지
                if k in x: card[k] = x[k]
                elif k in card and k != "id" and card[k] == "": pass          # 빈 칸 = 빈 문자열 유지
                elif k in card: card[k] = ""                                    # 칸을 비웠으면 빈 문자열
            if (b.get("ab") or []) == x.get("ab", []) and "ab" in b: card["ab"] = b["ab"]
            else: card["ab"] = reorder_like(x.get("ab", []), b.get("ab") or [])
            for k, v in x.items():
                if k not in CORE_KEYS: card[k] = v
        out_cards[cid] = card
    out = {}
    for k, v in (base or {}).items():
        if k != "cards": out[k] = copy.deepcopy(v)
    out.update(copy.deepcopy(xl_meta or {}))
    out["cards"] = out_cards
    if base and list(base.keys()) and "cards" in base:
        keys = list(base.keys()); out = {k: out[k] for k in keys if k in out} | {k: v for k, v in out.items() if k not in keys}
    return out


def dumps(db):
    return json.dumps(db, ensure_ascii=False, separators=(",", ":"))


# ───────── 검증 ─────────
def base_stats(base):
    bc = (base or {}).get("cards", {}) if base else {}
    types, colors, tokens, ics, kwt, abtypes = set(), set(), set(), set(), set(), {}
    for c in bc.values():
        types.add(c.get("type")); colors.add(c.get("color", ""))
        for t in re.split(r"[/,&\s]+", c.get("color", "") or ""):
            if t: tokens.add(t.lower())
        for t in (c.get("kw") or "").split():
            kwt.add(t)
        for a in c.get("ab") or []:
            ics.add(a.get("ic"))
            for k, v in a.items(): abtypes.setdefault(k, set()).add(type(v).__name__)
    return {"types": types, "colors": colors, "tokens": tokens or set(COLOR_TOKENS_DEFAULT), "ics": ics, "kw": kwt, "abtypes": abtypes}


def own_problems(cid, abs_):
    """모든 own(소유자) 값이 올바른지 재귀 검사한다 (필터의 own = self/opp/any, pick 효과의 own(구역 소유자) = self/opp)."""
    out = []
    def walk(x, path, in_pick=False):
        if isinstance(x, dict):
            is_pick = x.get("op") == "pick"
            for k, v in x.items():
                if k == "own":
                    ok_ = ("self", "opp") if is_pick else OWN_VALUES
                    if not isinstance(v, str) or v not in ok_:
                        out.append(Problem("ERROR", cid, f"Abilities/Ops 시트, {path or '(능력)'}", f"own 값이 올바르지 않습니다: {v!r} ({' / '.join(ok_)} 중 하나" + (" — pick 의 own 은 어느 쪽 구역에서 고를지)" if is_pick else ")")))
                else: walk(v, f"{path}.{k}" if path else k)
        elif isinstance(x, list):
            for i, v in enumerate(x): walk(v, f"{path}[{i}]")
    for ix, a in enumerate(abs_ if isinstance(abs_, list) else []): walk(a, f"ab_index {ix}")
    return out


def validate_cards(cards, base, allow_delete=(), use_node=True, min_ratio=0.9, partial=False):
    """의미 검증(스키마). 반환: problems 리스트."""
    probs = []; st = base_stats(base); bc = (base or {}).get("cards", {}) if base else {}
    types = st["types"] - {None} or {"char", "event", "partner", "case"}
    tokens = st["tokens"]
    for cid in sorted(cards):
        c = cards[cid]
        wh = lambda col: f"Cards 시트 {col}"
        if not (c.get("n") or "").strip(): probs.append(Problem("ERROR", cid, wh("n"), "카드명(n) 이 비어 있습니다"))
        t = c.get("type")
        if t not in types: probs.append(Problem("ERROR", cid, wh("type"), f"type 값이 올바르지 않습니다: {t!r} (사용 가능: {', '.join(sorted(types))})"))
        col = c.get("color", "")
        for tk in [x for x in re.split(r"[/]", col) if x != ""] if col else []:
            if tk not in tokens: probs.append(Problem("ERROR", cid, wh("color"), f"color 값이 올바르지 않습니다: {col!r} ('{tk}' 는 현재 DB 에 없는 색 — 사용 가능: {', '.join(sorted(tokens))}, 여러 색은 / 로 연결)"))
        for k in TYPE_REQ.get(t, ()):
            if c.get(k, "") == "": probs.append(Problem("ERROR", cid, wh(k), f"type={t} 카드는 {k.upper()} 값이 필요합니다"))
        for tk in (c.get("kw") or "").split():
            if not KW_RE.match(tk) and tk not in st["kw"]: probs.append(Problem("ERROR", cid, wh("kw"), f"kw(키워드) '{tk}' 을(를) 알 수 없습니다 (현재 DB/엔진에 없는 키워드)"))
        for ix, a in enumerate(c.get("ab") or []):
            w = f"Abilities 시트 (ab_index {ix})"
            if not a.get("ic"): probs.append(Problem("ERROR", cid, w, "ic(trigger) 가 비어 있습니다")); continue
            if st["ics"] and a["ic"] not in st["ics"] and not use_node: probs.append(Problem("WARN", cid, w, f"현재 DB 에 없는 ic '{a['ic']}'"))
            for k, v in a.items():
                ts = st["abtypes"].get(k)
                if ts and type(v).__name__ not in ts and not (v is None) and not (ts == {"int"} and isinstance(v, float)):
                    probs.append(Problem("ERROR", cid, f"{w}, 열 {k}", f"'{k}' 값의 형식이 올바르지 않습니다 (현재 DB: {'/'.join(sorted(ts))}, 입력: {type(v).__name__} {json.dumps(v, ensure_ascii=False)[:50]})"))
            if "lim" in a and (not isinstance(a["lim"], int) or isinstance(a["lim"], bool) or not 0 <= a["lim"] <= 3): probs.append(Problem("ERROR", cid, f"{w}, 열 lim", f"lim 은 0~3 의 정수여야 합니다: {a['lim']!r}"))
    for cid in sorted(cards): probs += own_problems(cid, cards[cid].get("ab") or [])
    # 카드 삭제/급감 (요약을 맨 앞에)
    missing = [] if partial else sorted(set(bc) - set(cards)); ad = set(allow_delete); head = []
    if bc and not partial and len(cards) < len(bc) * min_ratio and not ad: head.append(Problem("ERROR", None, "Cards 시트", f"카드 수가 급감했습니다 ({len(bc)} → {len(cards)}장). 행을 실수로 지운 것이 아닌지 확인하세요"))
    miss = [cid for cid in missing if cid not in ad]
    for cid in miss[:20]: head.append(Problem("ERROR", cid, "Cards 시트", "기존 카드가 Excel 에서 사라졌습니다 (실수로 지운 행이면 복구하세요. 의도한 삭제라면 --allow-delete " + cid + ")"))
    if len(miss) > 20: head.append(Problem("ERROR", None, "Cards 시트", f"… 이 밖에도 기존 카드 {len(miss) - 20}장이 Excel 에서 사라졌습니다"))
    probs = head + probs
    if use_node:
        probs += node_check(cards, bc)
    return probs


def node_check(cards, base_cards):
    """엔진(fx.js cleanAb)으로 ab 문법/primitive/값 검증. 기존 DB 에서 이미 나던 차이(예: 긴 문자열 절단)는 무시한다."""
    script = HERE / "ab_check.js"
    payload = {"cards": {cid: c.get("ab") or [] for cid, c in cards.items()}, "base": {cid: c.get("ab") or [] for cid, c in base_cards.items() if cid in cards}}
    try:
        r = subprocess.run(["node", str(script)], input=json.dumps(payload), capture_output=True, text=True, cwd=str(ROOT), timeout=300)
    except FileNotFoundError:
        return [Problem("WARN", None, "검증", "node 를 찾을 수 없어 효과(ab) 엔진 검증을 건너뛰었습니다 (GitHub 자동 빌드에서는 항상 수행됩니다)")]
    except subprocess.TimeoutExpired:
        return [Problem("ERROR", None, "검증", "효과(ab) 엔진 검증 시간 초과")]
    if r.returncode != 0: return [Problem("ERROR", None, "검증", "효과(ab) 엔진 검증 실패: " + (r.stderr or r.stdout)[-400:])]
    try: res = json.loads(r.stdout)
    except Exception: return [Problem("ERROR", None, "검증", "효과(ab) 엔진 검증 출력을 읽을 수 없습니다: " + r.stdout[-200:])]
    return [Problem(p.get("level", "ERROR"), p["id"], p["where"], p["msg"]) for p in res]


# ───────── 변경 내역 ─────────
def _short(v, n=70):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    s = s.replace("\n", "\\n")
    return '"' + (s[:n] + "…" if len(s) > n else s) + '"' if isinstance(v, str) else (s[:n] + "…" if len(s) > n else s)


def diff_value(a, b, path, out):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a:
            if k not in b: out.append(f"{path}.{k}: {_short(a[k])} → (삭제)")
            else: diff_value(a[k], b[k], f"{path}.{k}", out)
        for k in b:
            if k not in a: out.append(f"{path}.{k}: (없음) → {_short(b[k])}")
    elif isinstance(a, list) and isinstance(b, list):
        for i in range(max(len(a), len(b))):
            if i >= len(a): out.append(f"{path}[{i}]: (없음) → {_short(b[i])}")
            elif i >= len(b): out.append(f"{path}[{i}]: {_short(a[i])} → (삭제)")
            else: diff_value(a[i], b[i], f"{path}[{i}]", out)
    elif a != b or type(a) is not type(b): out.append(f"{path}: {_short(a)} → {_short(b)}")


def changes(base, new):
    """→ (added ids, removed ids, {id: [변경 줄]})"""
    bc = (base or {}).get("cards", {}) if base else {}; nc = new["cards"]
    ch = {}
    for cid in sorted(set(bc) & set(nc)):
        out = []
        for k in list(bc[cid]) + [k for k in nc[cid] if k not in bc[cid]]:
            if k == "img":
                if bc[cid].get(k) != nc[cid].get(k): out.append("img: (이미지 데이터 변경)")
                continue
            if k not in nc[cid]: out.append(f"{k}: {_short(bc[cid][k])} → (삭제)")
            elif k not in bc[cid]: out.append(f"{k}: (없음) → {_short(nc[cid][k])}")
            else: diff_value(bc[cid][k], nc[cid][k], k, out)
        if out: ch[cid] = out
    other = [k for k in set(bc and (base or {}).keys() or []) | set(new.keys()) if k != "cards" and (base or {}).get(k) != new.get(k)]
    return sorted(set(nc) - set(bc)), sorted(set(bc) - set(nc)), ch, other


def report_text(added, removed, ch, other=()):
    L = []
    L.append(f"변경된 카드: {len(ch)}장" + (f" / 추가된 카드: {len(added)}장" if added else "") + (f" / 삭제된 카드: {len(removed)}장" if removed else ""))
    for k in other: L += ["", f"[최상위 항목 변경] {k}"]
    for cid in sorted(ch): L += ["", cid] + ["  " + x for x in ch[cid]]
    if added: L += ["", "[추가된 카드]"] + ["  " + a for a in added]
    if removed: L += ["", "[삭제된 카드]"] + ["  " + a for a in removed]
    return "\n".join(L) + "\n"


# ───────── JSON → 워크북 ─────────
def write_workbook(db, path, base_for_img=None):
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.comments import Comment
    from openpyxl.worksheet.datavalidation import DataValidation
    cards = db["cards"]
    cr, ar, orows, er = card_rows(cards)
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    hdrfont = Font(bold=True, color="000000")
    def fill(kind): return PatternFill("solid", fgColor=FILL[kind])
    def sheet(name, cols, rows, widths, wrap=(), kinds=None, freeze="B2", numeric=()):
        ws = wb.create_sheet(name)
        for j, h in enumerate(cols, 1):
            c = ws.cell(1, j, h); c.font = hdrfont; k = (kinds or {}).get(h) or DESC.get(h, ("", "logic"))[1]; c.fill = fill(k)
            c.alignment = Alignment(vertical="center", wrap_text=True)
            if h in DESC: c.comment = Comment(f"{DESC[h][0]}\n[{ {'key':'연결 키','logic':'엔진 동작에 영향','display':'표시용 텍스트','meta':'참고용','readonly':'자동 계산(수정 불필요)'}[k]} ]", "cards_xlsx")
            ws.column_dimensions[_colname(j - 1)].width = widths.get(h, 14)
        for i, row in enumerate(rows, 2):
            for j, h in enumerate(cols, 1):
                v = row.get(h)
                if v is None: continue
                cell = ws.cell(i, j)
                if isinstance(v, str):
                    cell.value = v; cell.data_type = "s"
                else: cell.value = v
                if h in numeric and isinstance(v, int): cell.number_format = "0"
                if h in wrap: cell.alignment = Alignment(wrap_text=True, vertical="top")
                else: cell.alignment = Alignment(vertical="top")
                if DESC.get(h, ("", ""))[1] == "readonly": cell.fill = fill("readonly")
        ws.freeze_panes = freeze; ws.auto_filter.ref = f"A1:{_colname(len(cols) - 1)}{max(len(rows) + 1, 2)}"
        return ws
    ccols = CARD_COLS + CARD_READONLY
    for r in cr: pass
    ws = sheet("Cards", ccols, cr, {"id": 11, "type": 9, "color": 14, "lv": 5, "lv2": 5, "ap": 8, "lp": 5, "kw": 14, "trait": 28, "n": 22, "series": 9, "fx": 70, "extra": 70, "file": 16, "ab_count": 9, "img_info": 26}, wrap=("fx", "extra", "trait"), numeric=NUM_COLS)
    for rr in range(2, len(cr) + 2): ws.cell(rr, ccols.index("ab_count") + 1).value = f'=COUNTIF(Abilities!$A:$A,A{rr})'; ws.cell(rr, ccols.index("ab_count") + 1).fill = fill("readonly")
    acols = AB_FIXED + ab_columns(cards) + AB_READONLY
    sheet("Abilities", acols, ar, {"card_id": 11, "ab_index": 8, "ic": 12, "txt": 60, "lim": 6, "cond": 36, "tgt": 30, "cost": 30, "ops": 10}, wrap=("txt", "cond", "tgt", "cost"), freeze="C2", numeric=("lim",))
    sheet("Ops", OPS_ALL, orows, {"card_id": 11, "ab_index": 8, "op_index": 9, "op": 16, "filter_own": 11, "params": 100}, wrap=("params",), freeze="E2")
    sheet("CardExtra", ["card_id", "key", "value"], er, {"card_id": 11, "key": 20, "value": 60}, kinds={"value": "logic", "key": "key"})
    meta = [{"key": k, "value": enc(v)} for k, v in db.items() if k != "cards"]
    sheet("Meta", ["key", "value"], meta, {"key": 20, "value": 80}, kinds={"value": "meta", "key": "key"})
    # 현재 DB 에 실제 존재하는 값 목록 + 드롭다운
    st = base_stats(db); wl = wb.create_sheet("Lists")
    ops_names = sorted({o["op"] for o in orows})
    lists = {"type": sorted(st["types"] - {None}), "color": sorted(c for c in st["colors"] if c), "ic": sorted(st["ics"] - {None}), "op": ops_names, "own": list(OWN_VALUES)}
    for j, (k, vals) in enumerate(lists.items(), 1):
        wl.cell(1, j, k).font = hdrfont
        for i, v in enumerate(vals, 2): wl.cell(i, j, v)
        wl.column_dimensions[_colname(j - 1)].width = 24
    wl.cell(1, 6, "※ 현재 cards.json 에 실제 존재하는 값입니다 (참고/드롭다운용).")
    def dv(ws_, col_header, cols, key, n_rows, style):
        j = cols.index(col_header) + 1; L = _colname(list(lists).index(key))
        d = DataValidation(type="list", formula1=f"=Lists!${L}$2:${L}${len(lists[key]) + 1}", allow_blank=True, errorStyle=style, showErrorMessage=True,
                           errorTitle="현재 DB 에 없는 값", error="현재 카드 DB 에 존재하지 않는 값입니다. 정말 맞는지 확인하세요.")
        ws_.add_data_validation(d); d.add(f"{_colname(j - 1)}2:{_colname(j - 1)}{max(n_rows + 1, 2) + 500}")
    dv(wb["Cards"], "type", ccols, "type", len(cr), "stop"); dv(wb["Cards"], "color", ccols, "color", len(cr), "warning")
    dv(wb["Abilities"], "ic", acols, "ic", len(ar), "warning"); dv(wb["Ops"], "op", OPS_ALL, "op", len(orows), "warning")
    d_own = DataValidation(type="list", formula1='"self,opp,any"', allow_blank=True, errorStyle="stop", showErrorMessage=True, errorTitle="own 값", error="self(내 쪽) / opp(상대 쪽) / any(양쪽) 중 하나만 입력할 수 있습니다.")
    wb["Ops"].add_data_validation(d_own); jown = OPS_ALL.index("filter_own") + 1; d_own.add(f"{_colname(jown - 1)}2:{_colname(jown - 1)}{max(len(orows) + 1, 2) + 500}")
    # 안내 시트
    g = wb.create_sheet("Guide", 0); g.column_dimensions["A"].width = 24; g.column_dimensions["B"].width = 80; g.column_dimensions["C"].width = 16
    rows = [("명탐정 코난 TCG 카드 데이터 (cards.xlsx)", "", ""), ("", "", ""),
            ("사용법", "Cards 시트에서 카드 ID 를 검색(Ctrl+F)해 셀을 고치고 저장 → GitHub 에 올리면 자동 검증/변환/배포됩니다.", ""),
            ("연결 키", "항상 카드 ID(id / card_id). 행 순서·정렬은 마음대로 바꿔도 됩니다.", ""),
            ("시트", "Cards=카드 기본 정보 / Abilities=능력(ab) 1개당 1행 / Ops=능력 안의 효과(primitive) 1개당 1행 / CardExtra=추가 필드 / Meta=최상위 항목", ""),
            ("이미지", "이미지(base64)는 Excel 에 없습니다. cards.json 에 그대로 보존되며 ID 로 자동 연결됩니다.", ""),
            ("own(소유자)", "굵은 발동 조건/코스트(Abilities 의 cond/cost)에서 own 이 없으면 자기 쪽(self)입니다. 실제 효과 대상은 Ops 시트의 filter_own 열(self/opp/any 드롭다운)에서 관리합니다. 비워 두면 '미지정'으로 검증이 경고합니다.", ""),
            ("메모 열", "열 이름 앞에 # 또는 _ 를 붙이면 변환 시 무시됩니다.", ""), ("", "", ""), ("머리글 색", "의미", ""),
            ("파랑", "연결 키(ID/번호) — 바꾸지 마세요", "key"), ("주황", "엔진 동작에 영향을 주는 값(색/AP/LP/효과 등)", "logic"), ("초록", "표시용 텍스트 — 고쳐도 게임 로직은 바뀌지 않음", "display"),
            ("노랑", "참고용 메타데이터", "meta"), ("회색", "자동 계산 열 — 수정해도 무시됨", "readonly"), ("", "", ""), ("필드", "설명 / 구분", "")]
    for r_ in rows: g.append(list(r_))
    for r_i in range(11, 16): g.cell(r_i, 1).fill = fill(rows[r_i - 1][2])
    g.cell(1, 1).font = Font(bold=True, size=14); g.cell(10, 1).font = hdrfont; g.cell(17, 1).font = hdrfont
    for k, (d, kind) in DESC.items(): g.append([k, d, {"key": "연결 키", "logic": "엔진 동작", "display": "표시용", "meta": "참고용", "readonly": "자동"}[kind]]); g.cell(g.max_row, 1).fill = fill(kind)
    for r_ in g.iter_rows(min_row=1):
        for c in r_: c.alignment = Alignment(wrap_text=True, vertical="top")
    wb.active = 1
    tmp = str(path) + ".tmp"; wb.save(tmp); os.replace(tmp, str(path))
    return {"cards": len(cr), "abilities": len(ar), "ops": len(orows), "extra": len(er)}


def load_json(path):
    with open(path, encoding="utf-8") as f: return json.load(f)
