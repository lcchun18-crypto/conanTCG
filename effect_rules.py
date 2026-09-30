"""효과 문장(일본어 원문) → 엔진용 효과 데이터, 규칙 기반 카드 변환기 (API 호출 없음)

카드 단위 컴파일러:  compile_card(fx원문, 카드종류, kw, 모델이_만든_ab) -> ab 리스트
 - fx 원문(OCR 텍스트)을 '능력 1개 = 논리 줄 1개'로 정리(줄바꿈으로 끊긴 문장을 합침)하고,
   태그(【登場時】【宣言】【ターン①】…) / 코스트 / 발동 조건 / 본문(절 단위)을 문법으로 해석한다.
 - 숫자·카드명·특징·색·레벨이 달라도 같은 문형이면 그대로 적용된다(카드 ID 하드코딩 없음).
 - 이해하지 못한 줄은 그 줄만 manual 로 남기고, 모델이 그 줄을 이미 구조화해 놓았으면 모델 결과를 쓴다.
 - 모델이 만든 ab 는 중복/태그 누락/txt 없는 manual 이 섞여 있어도 fx 줄이 기준이므로 영향을 받지 않는다.
옛 API(upgrade/upgrade_ability/has_manual/manual_texts/parse_filter/ops_from_text/parse_tags/parse_ability)도 유지한다."""
import copy, re, unicodedata
import effect_prims as PR

COL = {"赤": "red", "青": "blue", "緑": "green", "黄": "yellow", "紫": "purple", "白": "white", "黒": "black"}
_COLRX = "|".join(COL)
_CIRC = {"①": 1, "②": 2, "1": 1, "2": 2}


def nk(s):
    s = unicodedata.normalize("NFKC", s or "").replace("　", " ")
    return s.replace("−", "-").replace("‐", "-").replace("‑", "-").replace("―", "-").replace("ーー", "ー").strip()


def _strip_reminder(s):
    """【…】 밖의 ( … ) 설명문을 제거"""
    out, depth, intag = [], 0, False
    for ch in s:
        if ch == "【": intag = True
        if ch == "】": intag = False
        if not intag and ch == "(": depth += 1; continue
        if not intag and ch == ")" and depth: depth -= 1; continue
        if not depth: out.append(ch)
    return "".join(out)


def _clean_ws(s):
    return re.sub(r"\s+", " ", s).strip()


def _pre(t):
    """OCR/표기 흔들림 정규화 (의미는 바꾸지 않음): 【事件【白】】 / 事件編【 / LPO / 숫자 사이 공백 / (赤) 색 표기 / カード名【X】"""
    t = re.sub(r"【事件【([^】]+)】】", r"【事件(\1)】", t)
    t = re.sub(r"【事件(?!\s*[赤青緑黄紫白黒&(])([^\s】(]+) ?FILE ?(\d+)】", r"【事件\1】【FILE\2】", t)
    t = re.sub(r"^(事件編|解決編)(?=【)", r"【\1】", t)
    t = re.sub(r"アクション【(事件|キャラ)】", r"アクション[\1]", t)
    t = re.sub(r"ブレット", "バレット", t)
    t = re.sub(r"突撃 ?【(事件|キャラ)】", r"突撃[\1]", t); t = re.sub(r"突撃 ([\[［])", r"突撃\1", t)
    t = re.sub(r"LPO\b", "LP0", t)
    t = re.sub(r"(?<=\d) +(?=[^\x00-\x7f])", "", t); t = re.sub(r"(?<=[^\x00-\x7f]) +(?=\d)", "", t)
    t = re.sub(r"\(([赤青緑黄紫白黒])\)(?=の|キャラ|イベント|カード)", r"【\1】", t)
    t = re.sub(r"(カード名|特徴)【([^】]+)】", r"\1[\2]", t)
    t = re.sub(r"(AP|LP|レベル) ?([+-]) ?(\d)", r"\1\2\3", t)
    return t


# ─────────────────────────── 대상 필터 (명사구) ───────────────────────────
BR = r"\[([^\]]+)\]"


def _names(seg):
    return [x.strip() for x in re.findall(BR, seg)]


def _parse_alt(a):
    """명사구 한 덩어리 → 필터 dict (모르는 게 남으면 None).  예: 'レベル5以下の【青】の特徴[X]のキャラ'"""
    p = nk(a); f = {}
    m = re.search(r"(キャラ|イベント|カード)$", p)
    if m:
        if m.group(1) == "キャラ": f["type"] = "char"
        elif m.group(1) == "イベント": f["type"] = "event"
        p = p[:m.start()]
    if "それぞれカード名の異なる" in p: f["_distinct"] = True; p = p.replace("それぞれカード名の異なる", "")
    if "【カットイン】と【ヒラメキ】以外の元の能力を持たない" in p: f["plain"] = True; p = p.replace("【カットイン】と【ヒラメキ】以外の元の能力を持たない", "")
    if "このキャラ以外の" in p: f["notSelf"] = True; p = p.replace("このキャラ以外の", "")
    m = re.search(r"カード名\[([^\]]+)\]以外の", p)
    if m: f["nameNot"] = m.group(1); p = p.replace(m.group(0), "")
    m = re.search(r"カード名((?:\[[^\]]+\]か?)+)", p)
    if m:
        ns = _names(m.group(1)); p = p.replace(m.group(0), "")
        if len(ns) == 1: f["name"] = ns[0]
        else: f["names"] = ns
    m = re.search(r"特徴(?:((?:\[[^\]]+\]か?)+)|「([^」]+)」)", p)
    if m:
        ts = _names(m.group(1)) if m.group(1) else [m.group(2)]; p = p.replace(m.group(0), "")
        if len(ts) == 1: f["trait"] = ts[0]
        else: f["any"] = [{"trait": t} for t in ts]
    m = re.search(r"自分のFILEエリアの枚数(以下|以上)のレベルの", p)
    if m: f["lvMax" if m.group(1) == "以下" else "lvMin"] = "file"; p = p.replace(m.group(0), "")
    m = re.search(r"LP(\d+)の", p)
    if m:
        f["lpMax"] = int(m.group(1)); p = p.replace(m.group(0), "", 1)
        if f["lpMax"] > 0: f["lpMin"] = f["lpMax"]  # LP0 は「LP0以下」と同じ(LP は負にならない)
    for rx, key in ((r"レベル(\d+)以下", "lvMax"), (r"レベル(\d+)以上", "lvMin"), (r"AP(\d+)以下", "apMax"), (r"AP(\d+)以上", "apMin"), (r"LP(\d+)以下", "lpMax"), (r"LP(\d+)以上", "lpMin"), (r"レベル(\d+)の", "lvEq")):
        m = re.search(rx, p)
        if m: f[key] = int(m.group(1)); p = p.replace(m.group(0), "", 1)
    m = re.search(rf"【({_COLRX})】以外の色を持つ", p)
    if m: f["colorNot"] = COL[m.group(1)]; p = p.replace(m.group(0), "")
    m = re.search(r"(スリープ状態かスタン状態|スリープ状態|スタン状態|アクティブ状態)の", p)
    if m: f["st"] = {"スリープ状態かスタン状態": "sx", "スリープ状態": "s", "スタン状態": "x", "アクティブ状態": "a"}[m.group(1)]; p = p.replace(m.group(0), "", 1)
    m = re.search(r"元のLPが(\d+)で", p)
    if m: f["lpBase"] = int(m.group(1)); p = p.replace(m.group(0), "", 1)
    m = re.search(r"(裏向きの)?カードがセットされて(いる|いない)", p)
    if m: f["sets"] = ("fdAny" if m.group(1) else "any") if m.group(2) == "いる" else ("fdNone" if m.group(1) else "none"); p = p.replace(m.group(0), "", 1)
    if "このキャラのAP以下のAPの" in p: f["apMax"] = "self"; p = p.replace("このキャラのAP以下のAPの", "", 1)
    if "このキャラと同じ特徴を持つ" in p: f["sameTrait"] = True; p = p.replace("このキャラと同じ特徴を持つ", "", 1)
    if "このキャラと同じカード名の" in p: f["sameName"] = True; p = p.replace("このキャラと同じカード名の", "", 1)
    m = re.search(r"このターン中にアクション(\[キャラ\]|\[事件\])?していた", p)
    if m: f["acted"] = {"[キャラ]": "char", "[事件]": "case"}.get(m.group(1), "any"); p = p.replace(m.group(0), "", 1)
    if "【疾風】を持つ" in p: f["hasHay"] = True; p = p.replace("【疾風】を持つ", "", 1)
    for w, key, val in (("突撃", "hasKw", "assault"), ("変装", "hasIc", "disguise"), ("現場リムーブ時", "hasIc", "onremoved"), ("カットイン", "hasIc", "cutin"), ("ヒラメキ", "hasIc", "flash")):
        m = re.search(rf"【{w}】を持つ", p)
        if m: f[key] = val; p = p.replace(m.group(0), "")
    m = re.search(rf"【({_COLRX})】(?:と【({_COLRX})】)?", p)
    if m and "以外" not in p[m.end():m.end() + 2]:
        f["color"] = COL[m.group(1)]; p = p.replace(m.group(0), "", 1)
    if re.sub(r"[のとで、,\s]", "", p): return None
    return f


def parse_np(text):
    """명사구(필터). '카드명A か 특징B' 처럼 か 로 이어진 대안은 any 로 만든다"""
    t = nk(text)
    mr = re.match(r"(リムーブしたカード|リムーブしたキャラ|リムーブエリアに移したカード|手札に加えたカード)のレベル(の合計)?(以下|以上)のレベルの(.+)$", t)
    if mr:
        f = parse_np(mr.group(4))
        if f is None: return None
        f = dict(f); reg = "removed" if mr.group(1).startswith("リムーブしたカ") or mr.group(1) == "リムーブしたキャラ" else "moved"
        f["lvMax" if mr.group(3) == "以下" else "lvMin"] = "reg:%s:%s" % (reg, "sum" if mr.group(2) else "first")
        return f
    parts = re.split(r"か(?=(?:レベル|AP|LP|【|特徴|カード名|イベント|キャラ))", t)
    if len(parts) == 1: return _parse_alt(t)
    subs = [_parse_alt(x) for x in parts]
    if any(s is None for s in subs): return None
    ty = next((s["type"] for s in reversed(subs) if "type" in s), None)
    for s in subs:
        if "type" not in s and ty and not any(k in s for k in ("hasIc", "hasKw")): s["type"] = ty
    typ = {s.get("type") for s in subs}; f = {}
    if len(typ) == 1 and None not in typ: f["type"] = typ.pop(); [s.pop("type", None) for s in subs]
    # 레벨/AP 처럼 모든 대안에 같은 값이 들어 있으면 위로 올린다
    for k in ("lvMax", "lvMin", "apMax", "apMin", "lpMax", "lpMin", "lvEq", "colorNot", "color"):
        if all(k in s for s in subs) and len({str(s[k]) for s in subs}) == 1: f[k] = subs[0][k]; [s.pop(k) for s in subs]
    f["any"] = subs
    return f


ZONES = [  # (접두어, zone, own)
    ("自分のリムーブエリアかパートナーエリアにある", "rempa", "self"), ("自分のリムーブエリアにある", "rem", "self"), ("自分のFILEエリアにある", "file", "self"), ("相手のFILEエリアにある", "file", "opp"),
    ("自分の現場にいる", "field", "self"), ("相手の現場にいる", "field", "opp"), ("現場にいる", "field", "any"), ("手札から", "hand", "self"),
]


def split_zone(t):
    t = nk(t).lstrip("、 ")
    for pre, z, own in ZONES:
        if t.startswith(pre): return z, own, t[len(pre):].lstrip("、 ")
    return None, "any", t


def parse_filter(prefix):
    """(옛 API) 'レベル5以下の【青】の特徴[X]のキャラ' 앞부분 → 필터. 모르면 None"""
    p = nk(prefix); f = {}
    z, own, p = split_zone(p)
    if z in ("field",) and own != "any": f["own"] = own
    r = _parse_alt(p + "キャラ") if p else {}
    if r is None: return None
    r.pop("type", None)
    f.update(r); return f


# ─────────────────────────── 조건 ───────────────────────────
def _fh(np_text, own="self", notSelf=False, n=1):
    f = parse_np(np_text) if np_text else {}
    if f is None: return None
    f = dict(f); f["own"] = own
    dist = f.pop("_distinct", False)
    if notSelf: f["notSelf"] = True
    return {"fh": f, "fhN": n, **({"fhDist": True} if dist else {})}


# ─────────────────────────── 확장: 개수 세기(cnt) / 조건 ───────────────────────────
def _own_np(x):
    """'…キャラ' 같은 명사구 → 필터(own 지정 안 함)"""
    f = parse_np(x)
    return None if f is None else dict(f)


def parse_count(t):
    """'…の数/…1枚(つ)' 앞부분 → {src, f}.  예: '自分の現場にいる特徴[警察]のキャラ' / '自分のパートナーエリアにある特徴[X]のカード' / '自分の表向きの証拠'"""
    t = nk(t).strip("、 ")
    if t in ("自分の表向きの証拠",): return {"src": "evidUp"}
    if t in ("自分の証拠",): return {"src": "evid"}
    if t in ("相手の証拠",): return {"src": "oppEvid"}
    if t == "このキャラにセットされているカード": return {"src": "sets"}
    if t == "このキャラの下に重なっているカード": return {"src": "under"}
    if t == "自分の現場にいるキャラに裏向きでセットされているカード": return {"src": "setsAll"}
    if t == "自分と相手の現場にいるキャラ": return {"src": "fieldBoth"}
    for pre, src, own in (("自分の現場にいる", "field", "self"), ("相手の現場にいる", "field", "opp"), ("自分の現場に", "field", "self"), ("相手の現場に", "field", "opp")):
        if t.startswith(pre):
            r = t[len(pre):]
            f = _own_np(np_char(r)) if r else {}
            if f is None: return None
            f.pop("type", None); f["own"] = own; return {"src": "field", "f": f}
    m = re.fullmatch(r"自分のパートナーエリアにある(.+)", t)
    if m:
        f = _own_np(np_char(m.group(1)).replace("キャラ", "カード") if not re.search(r"(キャラ|イベント|カード)$", m.group(1)) else m.group(1)); 
        if f is None: return None
        return {"src": "pa", "f": f}
    m = re.fullmatch(r"自分のリムーブエリアにある(.+)", t)
    if m:
        f = _own_np(m.group(1) if re.search(r"(キャラ|イベント|カード)$", m.group(1)) else m.group(1) + "カード")
        if f is None: return None
        return {"src": "rem", "f": f}
    m = re.fullmatch(r"(?:自分の)?手札にある(.+)", t)
    if m:
        f = _own_np(m.group(1) if re.search(r"(キャラ|イベント|カード)$", m.group(1)) else m.group(1) + "カード")
        if f is None: return None
        return {"src": "hand", "f": f}
    return None


_CMP = {"以下": "le", "以上": "ge", "未満": "lt"}


def parse_cnt_cond(t):
    """개수 비교 조건 → {"cnt":[{src,f,op,n|ref}]}  (모르면 None)"""
    t = nk(t).strip("、 ")
    def one(src, op, n, f=None, ref=None):
        d = {"src": src, "op": op}
        if f: d["f"] = f
        if ref: d["ref"] = ref
        else: d["n"] = n
        return {"cnt": [d]}
    m = re.fullmatch(r"自分の証拠が(\d+)つ(以下|以上)", t)
    if m: return one("evid", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"自分の表向きの証拠が(\d+)つ(以下|以上)", t)
    if m: return one("evidUp", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"相手の証拠が自分の証拠より(\d+)つ以上多い", t)
    if m: return {"cnt": [{"src": "oppEvid", "op": "ge", "ref": "evid", "plus": int(m.group(1))}]}
    m = re.fullmatch(r"自分の証拠の数が相手の証拠の数(以下|以上)", t)
    if m: return {"cnt": [{"src": "evid", "op": _CMP[m.group(1)], "ref": "oppEvid"}]}
    m = re.fullmatch(r"自分の手札が(\d+)枚(以下|以上)(?:ある)?", t)
    if m: return one("hand", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"相手の手札が(\d+)枚(以下|以上)(?:ある)?", t)
    if m: return one("oppHand", _CMP[m.group(2)], int(m.group(1)))
    if re.fullmatch(r"相手の手札が自分の手札の枚数以上ある", t): return {"cnt": [{"src": "oppHand", "op": "ge", "ref": "hand"}]}
    m = re.fullmatch(r"自分のFILEエリアにあるカードが(\d+)枚(以下|以上)(?:ある)?", t)
    if m: return one("file", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"自分のリムーブエリアにカードが(\d+)枚(以下|以上)(?:ある)?", t)
    if m: return one("rem", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"自分のリムーブエリアに(.+?)が(合わせて)?(\d+)枚(以下|以上)(?:ある)?", t)
    if m:
        f = _own_np(np_char(m.group(1)) if not re.search(r"(キャラ|イベント|カード)$", m.group(1)) else m.group(1))
        if f is None: return None
        return one("rem", _CMP[m.group(4)], int(m.group(3)), f)
    m = re.fullmatch(r"自分の現場にいるキャラが(\d+)枚(以下|以上)", t)
    if m: return one("field", _CMP[m.group(2)], int(m.group(1)), {"own": "self"})
    m = re.fullmatch(r"自分の現場に(.+?)が(合わせて)?(\d+)枚(以下|以上)いる", t)
    if m:
        f = _own_np(np_char(m.group(1)))
        if f is None: return None
        f.pop("type", None); f["own"] = "self"; return one("field", _CMP[m.group(4)], int(m.group(3)), f)
    if t == "自分の現場にいるキャラが相手の現場にいるキャラより少ない": return {"cnt": [{"src": "field", "f": {"own": "self"}, "op": "lt", "ref": "oppField"}]}
    m = re.fullmatch(r"自分の現場にいるキャラに裏向きでセットされているカードが合わせて(\d+)枚(以下|以上)ある", t)
    if m: return one("setsAll", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"このキャラに(?:カードが)?(\d+)枚(以下|以上)セットされている", t)
    if m: return one("sets", _CMP[m.group(2)], int(m.group(1)))
    m = re.fullmatch(r"このキャラに(特徴\[[^\]]+\])のカードが(\d+)枚(以下|以上)セットされている", t)
    if m:
        f = _own_np(m.group(1) + "のカード")
        return one("sets", _CMP[m.group(3)], int(m.group(2)), f) if f is not None else None
    m = re.fullmatch(r"自分の現場にこのキャラ以外のキャラがいない", t)
    if m: return one("field", "eq", 0, {"own": "self", "notSelf": True})
    m = re.fullmatch(r"自分の現場に(.+?)がいない", t)
    if m and re.search(r"(カード名|特徴|キャラ)", m.group(1)):
        f = _own_np(np_char(m.group(1)))
        if f is None: return None
        f.pop("type", None); f["own"] = "self"; return one("field", "eq", 0, f)
    m = re.fullmatch(r"自分の現場に(スリープ状態かスタン状態)のキャラが合わせて(\d+)枚以上いる", t)
    if m: return one("field", "ge", int(m.group(2)), {"own": "self", "st": "sx"})
    return None


def parse_cond(t):
    """'…場合' 앞부분 → cond dict (모르면 None)"""
    t = nk(t).strip("、 ")
    r = _parse_cond(t)
    if r is None and t.endswith("の"): r = _parse_cond(t[:-1])
    if r is None:
        parts = re.split(r"で、|、かつ|かつ", t)
        if len(parts) > 1:
            rs = [_parse_cond(x) or parse_cnt_cond(x) for x in parts]
            if all(x is not None for x in rs):
                out = {}
                for x in rs: out = _merge_cond(out, x)
                return out
    if r is None: r = parse_cnt_cond(t) or (parse_cnt_cond(t[:-1]) if t.endswith("の") else None)
    return r


def _parse_cond(t):
    m = re.fullmatch(r"自分のリムーブエリアに(.+?)がある", t)
    if m and "枚" not in m.group(1):
        f = parse_np(m.group(1))
        if f is not None: return {"cnt": [{"src": "rem", "op": "ge", "n": 1, "f": f}]}
    m = re.fullmatch(r"相手の現場にキャラが(\d+)枚(以上|以下)いる", t)
    if m: return {"cnt": [{"src": "oppField", "op": "ge" if m.group(2) == "以上" else "le", "n": int(m.group(1))}]}
    m = re.fullmatch(r"(?:このターン中、)?自分のキャラの【疾風】が発動していた", t)
    if m: return {"hayAny": True}
    m = re.fullmatch(r"(?:このターン中、)?自分のキャラが(?:まだ)?登場していない", t)
    if m: return {"noEnter": True}
    m = re.fullmatch(r"自分の事件が【(%s)】以外の色を持たない" % _COLRX, t)
    if m: return {"conly": COL[m.group(1)]}
    m = re.fullmatch(r"自分の事件が【(%s)】以外の色を持つ" % _COLRX, t)
    if m: return {"cnot": COL[m.group(1)]}
    m = re.fullmatch(r"自分の現場にこのキャラ以外の(.+?)がいる", t)
    if m: return _fh(m.group(1), "self", True)
    m = re.fullmatch(r"自分の現場にキャラが(\d+)枚以上いる", t)
    if m: return {"fh": {"own": "self"}, "fhN": int(m.group(1))}
    m = re.fullmatch(r"自分の現場に(.+?)が(\d+)枚以上いる", t)
    if m: return _fh(m.group(1), "self", False, int(m.group(2)))
    m = re.fullmatch(r"自分の現場に(カード名.+?)がいる", t)
    if m: return _fh(m.group(1), "self")
    m = re.fullmatch(r"自分の現場に(.+?)がいる", t)
    if m and "キャラ" in m.group(1): return _fh(m.group(1), "self")
    m = re.fullmatch(r"自分の現場にいるすべてのキャラが(.+)", t)
    if m:
        f = parse_np(np_char(m.group(1)))
        if f is None: return None
        f = dict(f); f.pop("type", None); f["own"] = "self"; return {"fa": f}
    m = re.fullmatch(r"自分のパートナーエリアに(.+?)のカードがある", t)
    if m:
        f = parse_np(m.group(1) + "の" + "カード")
        return {"paHas": f} if f is not None else None
    if re.fullmatch(r"痕跡[\[【]発見済み[\]】](?:の\(.+?\))?の?", t) or re.fullmatch(r"痕跡[\[【]発見済み[\]】]の\(.+\)", t): return {"trace": "found"}
    if re.fullmatch(r"痕跡[\[【]未発見[\]】]の?", t): return {"trace": "unfound"}
    m = re.fullmatch(r"自分の手札が(\d+)枚以下", t)
    if m: return {"handMax": int(m.group(1))}
    if t == "このキャラがスリープ状態で現場にいる": return {"selfSt": "s"}
    if t in ("このキャラがスリープ状態かスタン状態", "このキャラがスリープ状態かスタン状態の"): return {"selfSt": "sx"}
    if t in ("このキャラがアクティブ状態", "このキャラがアクティブ状態の"): return {"selfSt": "a"}
    m = re.fullmatch(r"このキャラがAP(\d+)以上で、このターン中に相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされていた", t)
    if m: return {"selfApMin": int(m.group(1)), "killed": True}
    m = re.fullmatch(r"(カード名.+?)に【カットイン】した", t)
    if m:
        f = parse_np(np_char(m.group(1)))
        if f is None: return None
        f = dict(f); f.pop("type", None); return {"cin": f}
    m = re.fullmatch(r"カード名\[([^\]]+)\]と入れ替わった", t)
    if m: return {"swapName": m.group(1)}
    m = re.fullmatch(r"相手の(?:FILEエリア)?にある1番上のカードがキャラ", t) or re.fullmatch(r"相手のFILEエリアにある1番上のカードがキャラ", t)
    if m: return {"ftop": {"who": "opp", "type": "char"}}
    m = re.fullmatch(r"(?:(.+?)の)?(?:カード|キャラ)?が発見された", t)
    return None


def _merge_cond(a, b):
    r = dict(a or {})
    for k, v in (b or {}).items():
        if k == "cnt" and k in r: r[k] = list(r[k]) + list(v); continue
        if k in r and k in ("fh", "fa", "paHas", "cin"):  # 같은 종류 조건이 둘이면 합칠 수 없음
            return None
        r[k] = v
    return r


# ─────────────────────────── 절(clause) → op ───────────────────────────
DOS = {"スリープさせる": "sleep", "スタンさせる": "stun", "アクティブにする": "active", "リムーブする": "remove", "手札に移す": "hand", "デッキの下に移す": "deckBottom", "デッキの上に移す": "deckTop", "デッキの上か下に移す": "deckTopOrBottom"}
KWMAP = {"突撃": "assault", "突撃[事件]": "assault-case", "突撃[キャラ]": "assault-char", "迅速": "rapid", "バレット": "bullet"}


def _kw_of(tok):
    t = nk(tok).replace("【", "").replace("】", "").strip()
    t = re.sub(r"\s+", "", t)
    return KWMAP.get(t)


def _quoted_grant(inner):
    """「…」 안의 부여 능력 → 능력 dict 또는 ('kw', 이름)"""
    t = nk(inner).strip("。 ")
    for pat, kw_ in (("このキャラは相手の現場にいるアクティブ状態のキャラを指定してアクションできる", "actactive"), ("このキャラはガードできない", "cantguard"),
                     ("このキャラはアクションできない", "cantact"), ("このキャラは事件を指定してアクションできない", "nocase"), ("このキャラはスリープ状態でもガードできる", "sleepguard"),
                     ("このキャラはガードできる場合、必ずガードする", "mustguard"),
                     ("相手の現場にいるキャラがアクションするとき、このキャラを指定できる場合、必ず指定する", "mustdesig")):
        if t == pat: return ("kw", kw_)
    if t.startswith("ターン終了時、"): t = "自分の" + t  # 부여된 능력의 「ターン終了時、」는 '부여받은 그 턴의 종료 시'(엔진이 양쪽 현장의 부여 능력을 발동)
    ab = parse_ability_text(t + "。", ctype="char", quoted=True)
    return ab


def _select_acts(act, cx):
    """select 의 '~する' 부분 → acts 리스트 (모르면 None)"""
    a = act.strip("。 ")
    if a in DOS: return [{"do": DOS[a]}]
    m = re.fullmatch(r"ターン終了時まで(?:このキャラを)?AP([+-]\d+)する", a)
    if m: return [{"do": "ap", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"ターン終了時まで(?:このキャラを)?LP([+-]\d+)する", a)
    if m: return [{"do": "lp", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"ターン終了時まで(?:このキャラを)?レベル([+-]\d+)する", a)
    if m: return [{"do": "lv", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:この)?コンタクト中、?AP([+-]\d+)する", a)
    if m: return [{"do": "ap", "v": str(int(m.group(1))), "until": "contact"}]
    m = re.fullmatch(r"この【宣言】能力のコストで表向きにした証拠1つにつき、ターン終了時までAP([+-]\d+)する", a)
    if m: return [{"do": "ap", "v": str(int(m.group(1))), "per": "flip"}]
    m = re.fullmatch(r"ターン終了時まで(.+?)を与える", a)
    if m:
        acts = []
        for piece in re.split(r"と(?=「)|(?<=」)と", m.group(1)):
            piece = piece.strip()
            q = re.fullmatch(r"「(.+)」", piece)
            if q:
                g = _quoted_grant(q.group(1))
                if g is None: return None
                if isinstance(g, tuple): acts.append({"do": "kw", "v": g[1]})
                else: acts.append({"do": "gab", "g": g})
            else:
                kw = _kw_of(piece)
                if kw is None: return None
                acts.append({"do": "kw", "v": kw})
        return acts
    acts, alts = PR.parse_acts(a)
    return acts


def _mkselect(pre, n, act, cx):
    z, own, rest = split_zone(pre)
    if z not in (None, "field"): return None
    f = {}
    rest = rest.strip("、 ")
    if rest.startswith("コンタクト中の"): f["contacting"] = True; rest = rest[len("コンタクト中の"):]
    if rest.startswith("アクション中の"): f["acting"] = True; rest = rest[len("アクション中の"):]
    m = re.match(r"発見されたカードのいずれかと同じレベルの", rest)
    if m: f["lvIn"] = "disc"; rest = rest[m.end():]
    m = re.match(r"この【宣言】能力のコストによってリムーブしたカードのレベル以下のレベルの", rest)
    if m: f["lvMax"] = "costLv"; rest = rest[m.end():]
    r = parse_np(np_char(rest))
    if r is None: return None
    r = dict(r); r.pop("_distinct", None); f.update(r)
    if own != "any": f["own"] = own
    acts = _select_acts(act, cx)
    if acts is None:
        _a, alts = PR.parse_acts(act)
        if _a: acts = _a
    if acts is None:
        if not alts: return None
        if f.get("type") == "char": f = {k: v for k, v in f.items() if k != "type"}
        return {"op": "choose", "opts": [{"lab": PR.alt_label(a), "ops": [_sel_op(n, f, a)]} for a in alts]}
    if f.get("type") == "char": f = {k: v for k, v in f.items() if k != "type"}  # 選択対象は現場のキャラのみ(自明)
    return _sel_op(n, f, acts)


def _sel_op(n, f, acts):
    op = {"op": "select", "n": n, "filter": f}
    if len(acts) == 1 and "per" not in acts[0] and "g" not in acts[0]:
        op["do"] = acts[0]["do"]
        for k in ("v", "until"):
            if k in acts[0]: op[k] = acts[0][k]
    else:
        op["acts"] = acts
        op["do"] = acts[0]["do"]
    return op


def _ref(cx):
    return "played" if cx.get("played") else "ent"


def _ends(c):
    """연용형(…し/…させ/…引き/…加え/…移し) → 종지형"""
    c = c.strip()
    for a, b in (("させ", "させる"), ("引き", "引く"), ("加え", "加える"), ("移し", "移す"), ("見て", "見る"), ("し", "する"), ("持ち", "持つ")):
        if c.endswith(a) and not c.endswith(b): return c[:-len(a)] + b
    return c


def np_char(x):
    """'…のキャラ' 처럼 이미 명사로 끝나면 그대로, 아니면 キャラ 를 붙인다"""
    x = nk(x)
    return x if re.search(r"(キャラ|イベント|カード)$", x) else x + "キャラ"


def parse_clause(c, cx):
    """절 1개 → op 리스트 (모르면 None).  cx: {'played': bool, 'ic': ...}"""
    c = c.strip("、 ").strip()
    if not c: return []
    m = re.fullmatch(r"(相手は)?(?:自分は)?カードを(\d+)枚引く(てもよい)?", c)
    if m:
        o = {"op": "draw", "n": int(m.group(2))}
        if m.group(1): o["who"] = "opp"
        if m.group(3): o["opt"] = True
        return [o]
    m = re.fullmatch(r"(?:(相手は)|自分は)?手札(?:から(.+?)を|を)(\d+)枚リムーブ(する|してもよい)", c)
    if m:
        o = {"op": "discard", "n": int(m.group(3)), "opt": m.group(4) != "する"}
        if m.group(1): o["who"] = "opp"
        if m.group(2):
            f = parse_np(m.group(2))
            if f is None: return None
            o["filter"] = f
        return [o]
    m = re.fullmatch(r"(?:自分は)?証拠を(\d+)つ得る", c)
    if m: return [{"op": "gain", "n": int(m.group(1))}]
    m = re.fullmatch(r"相手に証拠を(\d+)つ与える", c)
    if m: return [{"op": "gain", "n": int(m.group(1)), "who": "opp"}]
    m = re.fullmatch(r"(自分の|相手の)?デッキのカードを上から(\d+)枚リムーブ(する|してもよい)", c)
    if m: return [{"op": "deckrem", "n": int(m.group(2)), "opt": m.group(3) != "する", **({"who": "opp"} if m.group(1) == "相手の" else {})}]
    m = re.fullmatch(r"カード名\[(.+?)\]を登場させた場合、(.+)", c)
    if m:
        inner = parse_sentence_ops(m.group(2), cx)
        return [{"op": "if", "c": "played", "name": m.group(1), "ops": inner}] if inner else None
    m = re.fullmatch(r"手札から(.+?)を(\d+)枚公開してもよい", c)
    if m:
        f = parse_np(m.group(1))
        if f is not None: return [{"op": "optcost", "cost": [{"c": "revealHand", "n": int(m.group(2)), "filter": f}]}]
    # ── このキャラ
    m = re.fullmatch(r"このキャラをスリープさせ、手札を(\d+)枚リムーブしてもよい", c)
    if m: return [{"op": "optcost", "cost": [{"c": "sleepSelf", "n": 1}, {"c": "discard", "n": int(m.group(1))}]}]
    if c in ("このキャラを現場からデッキの下に移す", "このキャラをデッキの下に移す"): return [{"op": "self", "do": "deckBottom"}]
    if c in ("このキャラを現場から手札に移す", "このキャラを手札に移す"): return [{"op": "self", "do": "hand"}]
    m = re.fullmatch(r"このキャラを現場からデッキの下に移してもよい", c)
    if m: return [{"op": "self", "do": "deckBottom", "opt": True}]
    m = re.fullmatch(r"このキャラを(?:現場から)?(スリープさせ|アクティブにす|リムーブ)(?:る|する|してもよい|てもよい)", c)
    if m:
        do = {"スリープさせ": "sleep", "アクティブにす": "active", "リムーブ": "remove"}[m.group(1)]
        return [{"op": "self", "do": do, **({"opt": True} if c.endswith("もよい") else {})}]
    m = re.fullmatch(r"(?:そのコンタクト中、|アクション終了時まで)このキャラをAP([+-]\d+)する", c)
    if m: return [{"op": "self", "do": "ap", "v": str(int(m.group(1))), "until": "contact"}]
    m = re.fullmatch(r"ターン終了時までそのキャラをLP([+-]\d+)する", c)
    if m and cx.get("ic") == "ontrig": return [{"op": "ent", "do": "lp", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:ターン終了時まで)?このキャラは(バレット)を持つ", c)
    if m: return [{"op": "self", "do": "kw", "v": "bullet"}]
    m = re.fullmatch(r"ターン終了時までそのキャラをAP([+-]\d+)する", c)
    if m and cx.get("ic") == "ontrig": return [{"op": "ent", "do": "ap", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:このコンタクト中、|アクション終了時まで)そのキャラをAP([+-]\d+)する", c)
    if m and cx.get("ic") == "ontrig": return [{"op": "ent", "do": "ap", "v": str(int(m.group(1))), "until": "contact"}]
    m = re.fullmatch(r"(?:ターン終了時まで)?このキャラを(AP|LP)([+-]\d+)する", c)
    if m: return [{"op": "self", "do": m.group(1).lower(), "v": str(int(m.group(2)))}]
    m = re.fullmatch(r"(?:ターン終了時まで)?このキャラは(突撃(?:\[[^\]]+\])?|迅速)を持つ", c)
    if m:
        kw = _kw_of(m.group(1))
        return [{"op": "self", "do": "kw", "v": kw}] if kw else None
    m = re.fullmatch(r"突撃を持つ", c)
    if m: return [{"op": "self", "do": "kw", "v": "assault"}]
    # ── そのキャラ / 登場させたキャラ
    ref = _ref(cx); tgt = "played" if ref == "played" else "ent"
    m = re.fullmatch(r"(?:ターン終了時まで)?そのキャラに(突撃(?:\[[^\]]+\])?|迅速)を与える", c)
    if m:
        kw = _kw_of(m.group(1)); return [{"op": tgt, "do": "kw", "v": kw}] if kw else None
    m = re.fullmatch(r"(?:ターン終了時まで)?そのキャラに「(.+)」を与える", c)
    if m:
        g = _quoted_grant(m.group(1))
        if isinstance(g, tuple): return [{"op": tgt, "do": "kw", "v": g[1]}]
        return None
    m = re.fullmatch(r"(?:そのコンタクト中、)?そのキャラをAP([+-]\d+)する", c)
    if m: return [{"op": "ent", "do": "ap", "v": str(int(m.group(1))), "until": "contact"}]
    m = re.fullmatch(r"そのキャラをリムーブする", c)
    if m: return [{"op": "ent", "do": "remove"}]
    m = re.fullmatch(r"登場させたキャラとこのキャラをアクティブにする", c)
    if m: return [{"op": "played", "do": "active"}, {"op": "self", "do": "active"}]
    # ── 무더기 리무브
    m = re.fullmatch(r"すべてのキャラを(スリープさせる|アクティブにする|スタンさせる)", c)
    if m: return [{"op": "select", "n": 99, "filter": {}, "do": DOS[m.group(1)], "all": True}]
    if re.fullmatch(r"すべてのキャラをリムーブする", c): return [{"op": "rmAll", "scope": "all"}]
    if re.fullmatch(r"コンタクト中のすべてのキャラをリムーブする", c): return [{"op": "rmAll", "scope": "contact"}]
    if c == "相手は手札を公開する": return [{"op": "revealHand", "who": "opp"}]
    if c == "このターン中、自分はネクストヒントできない": return [{"op": "nohint"}]
    m = re.fullmatch(r"ターン終了時まで、自分のすべてのエリアにあるキャラは特徴\[([^\]]+)\]を持つ", c)
    if m: return [{"op": "traitAll", "trait": m.group(1)}]
    if c == "相手とじゃんけんで勝敗を決める": return [{"op": "rps"}]
    # ── 수사
    m = re.fullmatch(r"カード名を1つ指定し、捜査(\d+)する", c)
    if m: return [{"op": "investigate", "n": int(m.group(1)), "named": True}]
    m = re.fullmatch(r"捜査(\d+)する", c)
    if m: return [{"op": "investigate", "n": int(m.group(1))}]
    # ── 증거 / FILE
    if c == "このカードを表向きのまま証拠として得る": return [{"op": "selfEvid"}]
    if c == "このカードをパートナーエリアに移す": return [{"op": "selfTo", "to": "pa"}]
    if c == "このカードを手札に加える": return [{"op": "selfTo", "to": "hand"}]
    m = re.fullmatch(r"(自分の)?表向きの証拠を(\d+)つ(?:まで)?選び、裏向きにする", c)
    if m: return [{"op": "flipDown", "n": int(m.group(2)), **({} if m.group(1) else {"who": "any"})}]
    m = re.fullmatch(r"(自分|相手)の裏向きの証拠を(\d+)つ(?:まで選び、|)表向きにする", c)
    if m: return [{"op": "flip", "n": int(m.group(2)), **({"who": "opp"} if m.group(1) == "相手" else {})}]
    m = re.fullmatch(r"(相手の)?FILEエリアにあるカードを上から(\d+)枚表向きにする", c)
    if m: return [{"op": "revealFile", "n": int(m.group(2)), **({"who": "opp"} if m.group(1) else {})}]
    m = re.fullmatch(r"相手のFILEエリアにあるカードを上から(\d+)枚表向きにする", c)
    m = re.fullmatch(r"自分のFILEエリアにあるカードを上から(\d+)枚手札に加え(る|てもよい)", c)
    if m: return [{"op": "fileToHand", "n": int(m.group(1)), **({"opt": True} if m.group(2) != "る" else {})}]
    m = re.fullmatch(r"この(効果|【宣言】能力のコスト)によって(【!】ヒラメキ|【!ヒラメキ】|【ヒラメキ】)を持つ(.+?)が表向きになった場合、その(?:【!】ヒラメキ|【!ヒラメキ】|【ヒラメキ】)の効果を発動させてもよい", c)
    if m:
        f = parse_np(m.group(3))
        if f is None: return None
        return [{"op": "flashFlipped", "bang": "!" in m.group(2), "filter": f}]
    # ── 세트 / 겹침
    m = re.fullmatch(r"自分のデッキのカードを上から(\d+)枚裏向きで(このキャラ|そのキャラ)にセットする", c)
    if m: return [{"op": "setDeck", "n": int(m.group(1)), "deck": "self", "to": "self" if m.group(2) == "このキャラ" else "played"}]
    m = re.fullmatch(r"(自分の現場にいる|相手の現場にいる|)(.+?)を1枚まで選び、(自分|相手|持ち主)のデッキのカードを上から(\d+)枚裏向きで(?:選んだキャラに|そのキャラに)?セットする(?:し、(.+))?", c)
    if m and not m.group(2).startswith("自分のデッキ"):
        f = parse_np(m.group(2))
        if f is not None:
            f = dict(f); f.pop("type", None)
            if m.group(1): f["own"] = "self" if m.group(1).startswith("自分") else "opp"
            op = {"op": "setDeck", "n": int(m.group(4)), "deck": {"自分": "self", "相手": "opp", "持ち主": "owner"}[m.group(3)], "to": "pick", "filter": f}
            ops = [op]
            if m.group(5):
                mm = re.fullmatch(r"(ターン終了時まで|アクション終了時まで)(.+)", m.group(5))
                r = PR.clause_ref_acts(mm.group(1) + "選んだキャラを" + mm.group(2), {}) if mm else None
                if r is None: return None
                ops += r
            return ops
    m = re.fullmatch(r"相手の現場にいるキャラを1枚まで選び、相手のデッキのカードを上から(\d+)枚裏向きでセットする", c)
    if m: return [{"op": "setDeck", "n": int(m.group(1)), "deck": "opp", "to": "pick", "filter": {"own": "opp"}}]
    m = re.fullmatch(r"このイベントを自分の現場にいる(.+?)1枚にセットする", c)
    if m:
        f = parse_np(m.group(1))
        if f is None: return None
        f = dict(f); f.pop("type", None); return [{"op": "set", **({"filter": f} if f else {})}]
    m = re.fullmatch(r"このキャラにセットされているカードを(\d+)枚リムーブ(する|してもよい)", c)
    if m: return [{"op": "unset", "n": int(m.group(1)), "scope": "self", "opt": m.group(2) != "する"}]
    m = re.fullmatch(r"このキャラに裏向きでセットされているカードを(\d+)枚リムーブ(する|してもよい)", c)
    if m: return [{"op": "unset", "n": int(m.group(1)), "scope": "self", "fd": True, "opt": m.group(2) != "する"}]
    m = re.fullmatch(r"自分の現場にいる(裏向きのカードがセットされていない)?(.+?)を1枚まで選び、このキャラ(?:に)?セットされている裏向きのカードを1枚移す", c)
    if m:  # 裏向きセットの付け替え(このキャラ → 選んだ自分のキャラ)
        f = parse_np(m.group(2))
        if f is None: return None
        f = dict(f); f.pop("type", None); f["own"] = "self"; f["notSelf"] = True
        return [{"op": "moveSet", "n": 1, "filter": f, "toEmpty": bool(m.group(1))}]
    m = re.fullmatch(r"自分か相手の現場にいるキャラに裏向きでセットされているカードを(\d+)枚リムーブ(する|してもよい)", c)
    if m: return [{"op": "unset", "n": int(m.group(1)), "scope": "any", "fd": True, "opt": m.group(2) != "する"}]
    m = re.fullmatch(r"自分のリムーブエリアにある(.+?)を(\d+)枚まで選び、このキャラの下に重ねる", c)
    if m:
        f = parse_np(np_char(m.group(1)))
        if f is None: return None
        f = dict(f); d = f.pop("_distinct", False); f.pop("type", None); return [{"op": "stack", "n": int(m.group(2)), "filter": f, **({"distinct": True} if d else {})}]
    # ── 등장
    m = re.fullmatch(r"手札から(.+?)を(\d+)枚まで登場させるか、自分のリムーブエリアにある(.+?)を(\d+)枚まで選び、登場させる", c)
    if m:
        f1, f2 = parse_np(m.group(1)), parse_np(np_char(m.group(3)))
        if f1 is None or f2 is None: return None
        f1 = dict(f1); f2 = dict(f2); f1.pop("type", None); f2.pop("type", None)
        if f1 != f2: return None
        return [{"op": "play", "from": "handrem", "n": int(m.group(2)), "filter": f1}]
    m = re.fullmatch(r"手札から(.+?)を(\d+)枚まで(スリープ状態で)?登場させ(?:る|てもよい)", c)
    if m:
        f = parse_np(m.group(1))
        if f is None: return None
        f = dict(f); f.pop("type", None); return [{"op": "play", "from": "hand", "n": int(m.group(2)), "filter": f, **({"asleep": True} if m.group(3) else {})}]
    m = re.fullmatch(r"自分のリムーブエリアにある(?:、)?(.+?)を(\d+)枚まで選び、(現場に|スリープ状態で)?登場させる", c)
    if m:
        f = parse_np(np_char(m.group(1)))
        if f is None: return None
        f = dict(f); f.pop("type", None); o = {"op": "play", "from": "rem", "n": int(m.group(2)), "filter": f}
        if m.group(3) == "スリープ状態で": o["asleep"] = True
        return [o]
    m = re.fullmatch(r"登場させ", c) or re.fullmatch(r"登場させる", c)
    if m and cx.get("picked"): return [{"op": "play", "from": "picked", "n": 1}]
    # ── 손패로 (fetch)
    m = re.fullmatch(r"自分のリムーブエリア(か)?(?:パートナーエリア)?にある(.+?)を(\d+)枚まで選び、手札に加える", c)
    if m:
        f = parse_np(m.group(2))
        if f is None: return None
        return [{"op": "fetch", "n": int(m.group(3)), "from": "rempa" if m.group(1) else "rem", "filter": f}]
    m = re.fullmatch(r"自分のリムーブエリアかパートナーエリアにある(.+?)を(\d+)枚まで選び、手札に加える", c)
    if m:
        f = parse_np(m.group(1))
        if f is None: return None
        return [{"op": "fetch", "n": int(m.group(2)), "from": "rempa", "filter": f}]
    # ── 선택
    m = re.fullmatch(r"(.*?)キャラを(?:(\d+)枚まで|(\d+)枚|(好きな数))選び、(.+)", c)
    if m:
        n = 99 if m.group(4) else int(m.group(2) or m.group(3))
        return _wrap([_mkselect(m.group(1), n, m.group(5), cx)])
    m = re.fullmatch(r"((?:自分の|相手の)?現場にいる(?:カード名.+?|特徴.+?))を(?:(\d+)枚まで|(\d+)枚|(好きな数))選び、(.+)", c)  # '…カード名[X]を1枚まで選び' 처럼 キャラ 라는 말이 없는 형태
    if m:
        n = 99 if m.group(4) else int(m.group(2) or m.group(3))
        return _wrap([_mkselect(m.group(1) + "キャラ", n, m.group(5), cx)])
    return None


def _wrap(ops):
    return None if any(o is None for o in ops) else ops


def _try_clause_chain(sentence, cx):
    """한 문장 안의 '…し、…' 연쇄를 절로 나눠 각각 해석"""
    cands = [m.end() for m in re.finditer(r"(?:し|させ|引き|加え|移し|見て)、(?!$)", sentence)]
    # 인용부호(「」) 안의 위치는 제외
    def inq(pos): return sentence[:pos].count("「") > sentence[:pos].count("」")
    cands = [p for p in cands if not inq(p)]
    if not cands: return None
    n = len(cands)
    for mask in range(1, 1 << n):
        cuts = [cands[i] for i in range(n) if mask >> i & 1]
        if len(cuts) != n and bin(mask).count("1") != n: continue
    pieces, last = [], 0
    for p in cands: pieces.append(sentence[last:p - 1]); last = p
    pieces.append(sentence[last:])
    ops = []; lcx = dict(cx)
    for i, pc in enumerate(pieces):
        pc = _ends(pc) if i < len(pieces) - 1 else pc
        r = parse_clause(pc, lcx)
        if r is None: r = PR.clause(pc, lcx)
        if r is None: return None
        if PR.has_op(r, "play"): lcx["played"] = True
        PR.note_ops(lcx, r)
        ops += r
    return ops


def _restrict_ops(s):
    """제한/예약 공통 primitive: turnPk(컷인·변장·이벤트 사용 불가), hayIgn(다음 등장 캐릭터 疾風 조건 무시)"""
    s = re.sub(r"[(（][^)）]*[)）]$", "", s).strip("。 ")
    m = re.fullmatch(r"(このターン中|アクション終了時まで)、?相手は(【カットイン】|【変装】|【カットイン】と【変装】|【変装】と【カットイン】)を使用できない", s)
    if m:
        u = "action" if m.group(1) == "アクション終了時まで" else "turn"
        keys = []
        if "カットイン" in m.group(2): keys.append("nocutin")
        if "変装" in m.group(2): keys.append("nodisguise")
        return [{"op": "turnPk", "key": k, "until": u} for k in keys]
    m = re.fullmatch(r"このターン中、自分はイベントを使用できない", s)
    if m: return [{"op": "turnPk", "key": "noevent", "until": "turn"}]
    if re.fullmatch(r"このターン中、次に自分の現場に登場したキャラは【疾風】の条件を無視できる", s):
        return [{"op": "hayIgn"}]
    return None


def _delay_ops(s):
    """「このターン中、次にXとき、Y」 → delay(1회 예약). 버스 이벤트가 who 만으로 판별될 때만(필터가 필요하면 None)"""
    m = re.fullmatch(r"このターン中、次に(.+?とき)、(.+)", s)
    if not m: return None
    ab = _bus_trigger(m.group(1) + "、" + m.group(2), None, {}, 0)
    if not ab or set(ab) - {"ic", "evs", "cond", "lim", "ops", "who"} or ab.get("cond") or ab.get("lim") or not ab.get("ops"): return None
    if any(o.get("op") == "manual" for o in ab["ops"]): return None
    return [{"op": "delay", "evs": ab["evs"], "who": ab.get("who", ""), "ops": ab["ops"]}]


def _per_ops(s):
    """「NP1枚につき、…」 공통 배율: 자신 AP(지속 포함) / 드로우·리무브·손패 리무브(1장 단위)"""
    m = re.fullmatch(r"(.+?)(?:1枚|1つ)につき、(.+)", s)
    if not m: return None
    cn = m.group(1); cn = cn[:-1] if cn.endswith("の") else cn
    pc = parse_count(cn)
    if pc is None: return None
    body = m.group(2).strip("。")
    mm = re.fullmatch(r"(ターン終了時まで|アクション終了時まで)このキャラをAP([+-]\d+)する", body)
    if mm: return [{"op": "self", "do": "ap", "v": str(int(mm.group(2))), "until": "contact" if mm.group(1).startswith("アクション") else "turn", "pc": pc}]
    inner = parse_sentence_ops(body, {})
    if inner and len(inner) == 1 and inner[0].get("op") in ("draw", "deckrem", "discard") and inner[0].get("n") == 1 and not inner[0].get("opt") and not any(k in inner[0] for k in ("nref", "ncnt", "filter")):
        return [{**inner[0], "ncnt": pc}]
    return None


def _setdeck_ops(s):
    """NPを選び、(自分の|相手の|持ち主の)?デッキのカードを上からN枚裏向きでセットする[し、지속 AP 등] — 고른 캐릭터를 sel 레지스터로 참조"""
    m = re.fullmatch(r"(自分の現場にいる|相手の現場にいる|)(.+?)を1枚まで選び、(自分の|相手の|持ち主の|)デッキのカードを上から(\d+)枚裏向きで(?:選んだキャラに|そのキャラに)?セット(?:する|し、(.+))。?", s)
    if not m: return None
    f = parse_np(m.group(2))
    if f is None: return None
    f = dict(f); f.pop("type", None)
    if m.group(1): f["own"] = "self" if m.group(1).startswith("自分") else "opp"
    ops = [{"op": "setDeck", "n": int(m.group(4)), "deck": {"自分の": "self", "": "self", "相手の": "opp", "持ち主の": "owner"}[m.group(3)], "to": "pick", "filter": f}]
    if m.group(5):
        mm = re.fullmatch(r"(ターン終了時まで|アクション終了時まで)(.+)", m.group(5).rstrip("。"))
        r = PR.clause_ref_acts(mm.group(1) + "選んだキャラを" + mm.group(2), {}) if mm else None
        if r is None: return None
        ops += r
    return ops


def parse_sentence_ops(s, cx):
    """문장 1개 → ops (조건 접두 처리). 모르면 None"""
    s = s.strip("、 ").strip()
    if not s: return []
    if cx.get("_ph") and s in cx["_ph"]: return copy.deepcopy(cx["_ph"][s])
    r = _restrict_ops(s)
    if r is not None: return r
    r = _setdeck_ops(s)
    if r is not None: return r
    r = _delay_ops(s)
    if r is not None: return r
    r = _per_ops(s)
    if r is not None: return r
    m = re.fullmatch(r"そうした場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(1), cx); return [{"op": "if", "c": "done", "ops": inner}] if inner else None
    m = re.fullmatch(r"そうしなかった場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(1), cx); return [{"op": "if", "c": "notdone", "ops": inner}] if inner else None
    m = re.fullmatch(r"(カードを手札に加えた|登場させた)場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(2), cx); return [{"op": "if", "c": "done", "ops": inner}] if inner else None
    m = re.fullmatch(r"(カードを手札に加えなかった|登場させなかった)場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(2), cx); return [{"op": "if", "c": "notdone", "ops": inner}] if inner else None
    m = re.fullmatch(r"自分が(勝った|負けた)場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(2), cx); return [{"op": "if", "c": "win" if m.group(1) == "勝った" else "lose", "ops": inner}] if inner else None
    m = re.fullmatch(r"(これ|この効果|この【宣言】能力のコスト)によって(.+?)がリムーブされた場合、(.+)", s)
    if m:
        f = parse_np(m.group(2))
        inner = parse_sentence_ops(m.group(3), cx)
        if f is None or not inner: return None
        return [{"op": "if", "c": "costHas" if "コスト" in m.group(1) else "remHas", "filter": f, "ops": inner}]
    m = re.fullmatch(r"指定したカード名のカードが発見された場合、(.+)", s)
    if m:
        inner = parse_sentence_ops(m.group(1), cx); return [{"op": "ifc", "cond": {"found": {"named": True}}, "ops": inner}] if inner else None
    m = re.fullmatch(r"(.+?)が発見された場合、(.+)", s)
    if m:
        f = parse_np(m.group(1)); inner = parse_sentence_ops(m.group(2), cx)
        if f is None or not inner: return None
        f = dict(f); f.pop("type", None); return [{"op": "ifc", "cond": {"found": {"filter": f}}, "ops": inner}]
    m = re.fullmatch(r"(.+?)場合、代わりに(.+)", s)
    if m:
        cd = parse_cond(m.group(1)); rest = m.group(2)
        if cd is None: return None
        return [{"op": "_alt", "cond": cd, "txt": rest}]
    m = re.fullmatch(r"(.+?)場合、(.+)", s)
    if m and not m.group(1).endswith("とき"):
        cd = parse_cond(m.group(1))
        if cd is not None:
            inner = parse_sentence_ops(m.group(2), cx)
            return [{"op": "ifc", "cond": cd, "ops": inner}] if inner else None
    r = parse_clause(s, cx)
    if r is not None: return r
    r = _try_clause_chain(s, cx)
    if r is not None: return r
    r = PR.branch(s, cx)
    if r is not None: return r
    r = PR.clause(s, cx)
    if r is not None: return r
    return _zone_move_ops(s)


_ZONE = {"リムーブエリア": "rem", "パートナーエリア": "pa", "手札": "hand"}
_DEST = {"手札に加え": "hand", "デッキの下に移": "deckBottom", "デッキの上に移": "deckTop", "パートナーエリアに移": "pa", "リムーブ": "rem", "登場させ": "field"}


def _zone_move_ops(s):
    """공통 primitive pick(존+필터) → mv(목적지): 「(自分|相手)のZONEにあるNPをN枚(まで)選び、DEST(してもよい)」"""
    m = re.fullmatch(r"(自分|相手)の(リムーブエリア|パートナーエリア|手札)にある(.+?)を(\d+)枚(まで)?選び、(手札に加え|デッキの下に移|デッキの上に移|パートナーエリアに移|リムーブ|登場させ)(る|す|してもよい|てもよい)", s)
    if not m: return None
    f = parse_np(m.group(3))
    if f is None: return None
    z = _ZONE[m.group(2)]; d = _DEST[m.group(6)]
    if d == "field" and m.group(1) == "相手": return None
    if d == z: return None
    n = int(m.group(4)); opt = bool(m.group(5)) or m.group(7).endswith("もよい")
    pick = {"op": "pick", "from": z, "as": "chosen", "filter": f, "n": n, **({"min": 0} if opt else {"min": n})}
    if m.group(1) == "相手": pick["own"] = "opp"
    return [pick, {"op": "mv", "ref": "chosen", "to": d}]


# ─────────────────────────── 여러 문장 / 매크로 ───────────────────────────
def _split_sentences(t):
    out, cur, depth = [], "", 0
    for ch in t:
        if ch == "「": depth += 1
        if ch == "」": depth = max(0, depth - 1)
        cur += ch
        if ch == "。" and depth == 0: out.append(cur[:-1]); cur = ""
    if cur.strip(): out.append(cur)
    return [x.strip() for x in out if x.strip()]


def _macros(t, cx):
    """여러 문장에 걸친 정형 패턴을 자리표시자로 바꾼다(문장 분리 전)."""
    ph = cx.setdefault("_ph", {}); k = [0]

    def put(ops):
        k[0] += 1; key = f"<<OP{k[0]}>>"; ph[key] = ops; return key + "。"
    # 덱 위에서 N장 보고 1장 손패, 나머지 덱 아래
    def m_look(m):
        cond = m.group(2)
        f = {} if cond == "カード" else parse_np(cond)
        if f is None: return m.group(0)
        return put([{"op": "look", "n": int(m.group(1)), "filter": f, "max": 1, "then": "hand", "rest": "bottom"}])
    t = re.sub(r"自分のデッキのカードを上から(\d+)枚見る。その中から(.+?)を1枚(?:まで)?(?:公開して)?手札に加え、残りを好きな順番でデッキの下に移す。?", m_look, t)
    def m_lookopp(m):
        f = parse_np(m.group(2))
        if f is None: return m.group(0)
        return put([{"op": "look", "n": int(m.group(1)), "filter": f, "max": 1, "then": "hand", "rest": "bottom", "by": "opp"}])
    t = re.sub(r"自分のデッキのカードを上から(\d+)枚公開する。相手はその中から(.+?)を1枚選び、自分はそれを手札に加える。残りを自分が好きな順番でデッキの下に移す。?", m_lookopp, t)
    def m_until(m):
        f = parse_np(m.group(1))
        if f is None: return m.group(0)
        o = {"op": "reveal", "then": "hand", "rest": "shuffleBottom", "shuffle": True}
        if list(f.keys()) == ["name"] and f["name"]: o["name"] = f["name"]
        else: o["filter"] = f
        return put([o])
    t = re.sub(r"自分のデッキのカードを上から(.+?)が出るまで1枚ずつ公開し、それを手札に加える。残りの公開したカードをデッキの下に移し、デッキをシャッフルする。?", m_until, t)
    def m_revtop(m):
        cond = m.group(1)
        if "リムーブされたキャラのいずれかと同じ特徴を持つ" in cond: f = {"traitOf": "ent"}
        else:
            f = parse_np(cond)
            if f is None: return m.group(0)
        hit = {"手札に加える": "hand", "リムーブする": "rem"}.get(m.group(2)); miss = {"デッキの下に移す": "bottom", "デッキの上に戻す": "top", "リムーブする": "rem", "手札に加える": "hand"}.get(m.group(3))
        if not hit or not miss: return m.group(0)
        return put([{"op": "revealTop", "n": 1, "filter": f, "hit": hit, "miss": miss}])
    t = re.sub(r"自分のデッキのカードを上から1枚公開する。公開したカードが(.+?)(?:の)?場合、(.+?)。公開したカードがそれ以外の場合、(.+?)。?(?=$|<<)", m_revtop, t)
    t = re.sub(r"自分のデッキのカードを上から1枚公開する。公開したカードが(.+?)(?:の)?場合、(.+?)。公開したカードがそれ以外の場合、(.+?)。?$", m_revtop, t)
    def m_deckrem_has(m):
        f = parse_np(m.group(3) if m.group(3).endswith(("キャラ", "カード", "イベント")) else m.group(3) + "カード")
        ops2 = ops_from_text(m.group(5), dict(cx))
        if f is None or ops2 is None: return m.group(0)
        f = dict(f); f.pop("_distinct", None)
        return put([{"op": "deckrem", "n": int(m.group(1)), "opt": True}, {"op": "if", "c": "remHas", "n": int(m.group(4)), "filter": f, "ops": ops2}])
    t = re.sub(r"自分のデッキのカードを上から(\d+)枚リムーブしてもよい。(この効果によって)(.+?)が(\d+)枚以上リムーブされた場合、(.+?)。?$", m_deckrem_has, t)
    # 상대에게 증거 뒤집기 등은 clause 로 처리. 0882: 선택 후 LP 비교
    def m_lpcmp(m):
        pre = m.group(1); f = parse_np(pre + "キャラ") if pre else {"type": "char"}
        if f is None: return m.group(0)
        f = dict(f); f["own"] = "opp"
        return put([{"op": "select", "n": 1, "filter": f, "do": "remove", "when": "lpLeOwnMax"}])
    t = re.sub(r"相手の現場にいる(.*?)キャラを1枚まで選ぶ。そのキャラが自分の現場にいるLPがもっとも高いキャラのLP以下のLPの場合、リムーブする。?", m_lpcmp, t)
    # 0844: 상대가 코스트로 리무브된 카드 중 하나를 고르고, 조건이 맞으면 등장/리무브/손패 리무브
    def m_paid(m):
        f = parse_np(m.group(1))
        if f is None: return m.group(0)
        rest = m.group(2)
        cx2 = dict(cx); cx2["picked"] = True
        ops = parse_sentence_ops(rest, cx2)
        if ops is None: return m.group(0)
        return put([{"op": "pickPaid", "who": "opp"}, {"op": "if", "c": "picked", "filter": f, "ops": ops}])
    t = re.sub(r"相手はこの【宣言】能力のコストによってリムーブされたキャラの中から1枚選ぶ。それが(.+?)の場合、(.+?)。?$", m_paid, t)
    # 0965: FILE 맨 위를 앞면으로 → 조건
    def m_ftop(m):
        inner = parse_sentence_ops(m.group(1), cx)
        if not inner: return m.group(0)
        return put([{"op": "revealFile", "who": "opp", "n": 1}, {"op": "ifc", "cond": {"ftop": {"who": "opp", "type": "char"}}, "ops": inner}])
    t = re.sub(r"相手のFILEエリアにある(?:カードを)?上から1枚表向きにする。相手のFILEエリアにある1番上のカードがキャラの場合、(.+?)。?$", m_ftop, t)
    return t


def _fix_ops(ops):
    """내부 표식(_distinct 등)을 엔진 필드로 옮기고, 엔진이 모르는 것이 남으면 False"""
    for o in ops:
        if not isinstance(o, dict): continue
        f = o.get("filter")
        if isinstance(f, dict) and f.pop("_distinct", False):
            if o.get("op") in ("play", "stack"): o["distinct"] = True
            else: return False
        for k in ("ops", "else"):
            if isinstance(o.get(k), list) and not _fix_ops(o[k]): return False
        for ch in o.get("opts") or []:
            if not _fix_ops(ch.get("ops") or []): return False
    return True


def ops_from_text(text, cx=None):
    r = _ops_from_text(text, cx)
    if r is not None and not _fix_ops(r): return None
    return r


def _ops_from_text(text, cx=None):
    """여러 문장 → ops (하나라도 모르면 None)"""
    cx = dict(cx or {}); t = _strip_reminder(nk(text))
    mu = re.match(r"以下から1つ選んで行う。(.+?)代わりに(\d+)つとも行う。?\s*((?:・.+(?:\n|$))+)\s*$", t)
    if mu:  # 「以下から1つ選んで行う。COND場合、代わりに全部行う」/「COSTしてもよい。そうした場合、代わりに全部行う」(공통: 조건/선택 비용 → 전부, 아니면 1개 선택)
        bl = [x.strip()[1:].strip() for x in mu.group(3).split("\n") if x.strip().startswith("・")]
        if len(bl) != int(mu.group(2)) or len(bl) < 2: return None
        opts = []
        for b in bl:
            o = ops_from_text(b, {"ic": cx.get("ic")})
            if o is None: return None
            opts.append({"lab": _clean_ws(b)[:80], "ops": o})
        allops = [x for o in opts for x in copy.deepcopy(o["ops"])]
        head = mu.group(1).strip()
        mm = re.fullmatch(r"(.+?)場合、", head)
        if mm and not mm.group(1).endswith("そうした"):
            cd = parse_cond(mm.group(1))
            if cd is None: return None
            return [{"op": "ifc", "cond": cd, "ops": allops, "else": [{"op": "choose", "opts": opts}]}]
        mm = re.fullmatch(r"(.+?てもよい)。そうした場合、", head)
        if mm:
            pre = parse_sentence_ops(mm.group(1), cx)
            if pre is None: return None
            return pre + [{"op": "if", "c": "done", "ops": allops, "else": [{"op": "choose", "opts": opts}]}]
        return None
    mb = re.match(r"以下から(\d+)つ(まで)?選んで行う。?\s*((?:・.+(?:\n|$))+)\s*$", t)
    if mb and not mb.group(2) and int(mb.group(1)) != 1: mb = None  # 「N つ選ぶ」(N≥2 ちょうど)は未対応 → manual
    if mb:
        opts = []
        for b in [x.strip()[1:].strip() for x in mb.group(3).split("\n") if x.strip().startswith("・")]:
            o = ops_from_text(b, {"ic": cx.get("ic")})
            if o is None: return None
            opts.append({"lab": _clean_ws(b)[:80], "ops": o})
        if not mb.group(2): return [{"op": "choose", "opts": opts}]  # 以下から1つ選んで行う
        return [{"op": "chooseMulti", "max": int(mb.group(1)), "opts": opts}]
    t = _clean_ws(t)
    t = _macros(t, cx)
    ops = []
    for s in _split_sentences(t):
        r = parse_sentence_ops(s, cx)
        if r is None: return None
        # "…場合、代わりに…" 는 바로 앞 op 를 교체/변형
        if r and r[0].get("op") == "_else":
            if not ops or ops[-1].get("op") != "if" or ops[-1].get("c") != "reg" or ops[-1].get("ref") != r[0]["ref"] or ops[-1].get("else"): return None
            ops[-1]["else"] = r[0]["ops"]; continue
        if r and r[0].get("op") == "_alt":
            alt = r[0]
            if not ops: return None
            if not _apply_alt(ops, alt, cx): return None
            continue
        if PR.has_op(r, "play"): cx["played"] = True
        PR.note_ops(cx, r)
        ops += r
    return ops


def _apply_alt(ops, alt, cx):
    prev = ops[-1]; txt = alt["txt"].strip("、 ")
    m = re.fullmatch(r"そのキャラを(リムーブ|スリープさせ|スタンさせ)(?:する|る)", txt)
    if m and prev.get("op") == "select":
        prev["alt"] = {"cond": alt["cond"], "do": {"リムーブ": "remove", "スリープさせ": "sleep", "スタンさせ": "stun"}[m.group(1)]}; return True
    m = re.fullmatch(r"捜査(\d+)する", txt)
    if m and prev.get("op") == "investigate":
        base = ops.pop(); new = dict(base); new["n"] = int(m.group(1)); ops.append({"op": "ifc", "cond": alt["cond"], "ops": [new], "else": [base]}); return True
    r = parse_sentence_ops(txt, cx)
    if r:
        base = ops.pop(); ops.append({"op": "ifc", "cond": alt["cond"], "ops": r, "else": [base]}); return True
    return False


def sentence_ops(s):
    """(옛 API) 문장 1개 → ops"""
    r = ops_from_text(s); return r if r is not None else None


# ─────────────────────────── 태그 / 능력 ───────────────────────────
TAGKW = ("突撃", "変装", "カットイン", "ミスリード", "迅速", "バレット", "絆")


def parse_tags(src):
    """맨 앞의 【…】 태그들 → (cond, lim, ic, decl, 남은 본문) (옛 API 형식)"""
    r = parse_tags2(src)
    return r["cond"], r["lim"], r["ic"], r["decl"], r["body"]


def parse_tags2(src):
    s = nk(src); cond, lim, ic, decl = {}, 0, None, False
    flags = {"cost": [], "bang": False, "mr": False, "bond": None, "kwtags": [], "disguise": False, "hayate": False}
    while True:
        m = re.match(r"\s*【([^】]+)】", s)
        if not m: break
        tag = m.group(1); rest = s[m.end():]
        mm = re.fullmatch(rf"パートナー\(?({_COLRX})?\)?", tag)
        if mm:
            s = rest
            if mm.group(1): cond["pcolor"] = COL[mm.group(1)]
            else:
                m2 = re.match(rf"\s*\(({_COLRX})\)", s) or re.match(rf"\s*【({_COLRX})】", s)
                if m2: cond["pcolor"] = COL[m2.group(1)]; s = s[m2.end():]
            continue
        mm = re.fullmatch(r"ターン([①②12])", tag)
        if mm: lim = _CIRC[mm.group(1)]; s = rest; continue
        if tag == "自分ターン中": cond["turn"] = "self"; s = rest; continue
        if tag == "相手ターン中": cond["turn"] = "opp"; s = rest; continue
        if tag == "登場時": ic = "onplay"; s = rest; continue
        if tag == "現場リムーブ時": ic = "onremoved"; s = rest; continue
        if tag == "変装時": ic = "ondisguise"; s = rest; continue
        if tag in ("ヒラメキ", "!ヒラメキ"):
            ic = "flash"; flags["bang"] = flags["bang"] or tag.startswith("!"); s = rest; continue
        if tag == "!":  # 【!】【ヒラメキ】
            m2 = re.match(r"\s*【ヒラメキ】", rest)
            if m2: ic = "flash"; flags["bang"] = True; s = rest[m2.end():]; continue
        if tag == "宣言": decl = True; s = rest; continue
        if tag == "解決編": cond["cstate"] = "solve"; s = rest; continue
        if tag == "事件編": cond["cstate"] = "kase"; s = rest; continue
        if tag == "カットイン": ic = "cutin"; s = rest; continue
        if tag == "MR能力": flags["mr"] = True; s = rest; continue
        if tag == "スリープ": flags["cost"].append({"c": "sleepSelf", "n": 1}); s = rest; continue
        if tag == "証拠隠滅": flags["evidkill"] = True; s = rest; continue
        if tag == "変装": flags["disguise"] = True; s = rest; continue
        if tag == "疾風": ic = "onplay"; cond["nth"] = 1; flags["hayate"] = True; s = rest; continue
        mm = re.fullmatch(r"事件[ (]?([赤青緑黄紫白黒&()]+)", tag)
        if mm and tag.startswith("事件"):
            cols = mm.group(1); s = rest
            cond["ccolor"] = "&".join(COL[c] for c in re.findall(rf"[{_COLRX}]", cols)); continue
        mm = re.fullmatch(r"事件(?: ?([赤青緑黄紫白黒&]+))?", tag)
        if mm and tag.startswith("事件") and not re.fullmatch(r"事件[A-Za-z]+", tag):
            cols = mm.group(1)
            s = rest
            if not cols:  # 【事件】【緑】&【白】 / 【事件】【青&緑】
                m2 = re.match(rf"\s*((?:【[{_COLRX}&]+】&?)+)", s)
                if m2:
                    cols = "".join(re.findall(rf"[{_COLRX}]", m2.group(1))); s = s[m2.end():]
            if cols: cond["ccolor"] = "&".join(COL[c] for c in re.findall(rf"[{_COLRX}]", cols))
            continue
        mm = re.fullmatch(r"事件([^\s()&]+)", tag)
        if mm: cond["ctrait"] = mm.group(1); s = rest; continue
        mm = re.fullmatch(r"FILE ?(\d+)", tag)
        if mm and not re.match(r"\s*\(", rest) and ic is None and not decl and False: pass
        mm = re.fullmatch(r"FILE ?(\d+)", tag)
        if mm and (flags["disguise"] or not rest.lstrip().startswith("(")): cond["fileMin"] = int(mm.group(1)); s = rest; continue
        mm = re.fullmatch(r"絆 ?(\S+)", tag)
        if mm: cond["bond"] = mm.group(1); s = rest; continue
        if tag == "絆":
            m2 = re.match(r"\s*【(?!(?:宣言|ターン|自分ターン中|相手ターン中|登場時|変装時|カットイン|ヒラメキ|パートナー|事件|解決編|FILE|スリープ|現場リムーブ時))([^】]+)】\s*", rest) or re.match(r"\s*([^\s【]+)\s*", rest)
            if m2: cond["bond"] = m2.group(1); s = rest[m2.end():]; continue
        s = f"【{tag}】" + rest; break
    return {"cond": cond, "lim": lim, "ic": ic, "decl": decl, "flags": flags, "body": _strip_reminder(s).strip()}


# ── 코스트 ──
def parse_cost(t):
    """코스트 문장 → [cost dict] (모르면 None)"""
    t = nk(t).strip(" 、").replace("手札から、", "手札から")
    if not t: return []
    out = []
    for piece in re.split(r"(?<!か)(?<!につき)、(?=[^」]*$)", t):
        piece = piece.strip()
        if not piece: continue
        piece = piece.replace("表向きにし", "表向きにする").rstrip("し") if piece.endswith("にし") else piece
        piece = re.sub(r"(リムーブし|スリープさせ|公開し|移し)$", lambda mm: mm.group(1)[:-1] + {"し": "する", "せ": "せる"}.get(mm.group(1)[-1], mm.group(1)[-1]), piece) if re.search(r"(リムーブし|スリープさせ|公開し|移し)$", piece) else piece
        c = None
        m = re.fullmatch(r"デッキのカードを上から(\d+)枚リムーブする", piece)
        if m: c = {"c": "deckrem", "n": int(m.group(1))}
        if c is None:
            m = re.fullmatch(r"手札を(\d+)枚リムーブする", piece)
            if m: c = {"c": "discard", "n": int(m.group(1))}
        if c is None:
            m = re.fullmatch(r"手札から、?(.+?)を(\d+)枚リムーブする", piece)
            if m:
                f = parse_np(m.group(1)); c = {"c": "discard", "n": int(m.group(2)), "filter": f} if f is not None else None
        if c is None:
            m = re.fullmatch(r"手札から、?(.+?)を(\d+)枚公開する", piece)
            if m:
                f = parse_np(m.group(1)); c = {"c": "revealHand", "n": int(m.group(2)), "filter": f} if f is not None else None
        if c is None and piece == "デッキの下に移す": c = {"c": "selfBottom", "n": 1}
        if c is None and piece == "リムーブエリアに移す": c = {"c": "selfRem", "n": 1}
        if c is None and piece == "パートナーエリアに移す": c = {"c": "selfPa", "n": 1}
        if c is None:
            m = re.fullmatch(r"裏向きの証拠を(\d+)つ表向きにする", piece)
            if m: c = {"c": "flipEvid", "n": int(m.group(1))}
        if c is None:
            m = re.fullmatch(r"裏向きの証拠を(\d+)つ以上表向きにする", piece)
            if m: c = {"c": "flipEvid", "n": int(m.group(1)), "var": True}
        if c is None:
            m = re.fullmatch(r"(?:現場にいる)(.+?)を(\d+)枚デッキの下に移す", piece)
            if m:
                f = parse_np(m.group(1)); c = {"c": "fieldBottom", "n": int(m.group(2)), "filter": f} if f is not None else None
        if c is None:
            m = re.fullmatch(r"リムーブエリアにある(.+?)を(\d+)枚(好きな順番で)?デッキの下に移す", piece)
            if m:
                f = parse_np(m.group(1)); c = {"c": "remBottom", "n": int(m.group(2)), "filter": f} if f is not None else None
                if c and m.group(3) and c["n"] > 1: c["order"] = True
        if c is None:
            m = re.fullmatch(r"このキャラに(?P<fd>裏向きで)?セットされているカード(?P<nm>カード名\[[^\]]+\])?を(?P<n>\d+)枚リムーブする", piece) or re.fullmatch(r"このキャラにセットされている(?P<nm>カード名\[[^\]]+\])を(?P<n>\d+)枚リムーブする", piece)
            if m:
                g = m.groupdict(); c = {"c": "unset", "n": int(g["n"])}
                if g.get("fd"): c["fd"] = True
                if g.get("nm"):
                    f = parse_np(g["nm"]); c["filter"] = f
        if c is None:
            m = re.fullmatch(r"このキャラの下に重なっているカードを(\d+)枚リムーブする", piece)
            if m: c = {"c": "unstack", "n": int(m.group(1))}
        if c is None: c = PR.cost_either(piece) or PR.cost_piece(piece)
        if c is None: return None
        out.append(c)
    return out


def _split_cost(body):
    """'코스트:효과' 분리 (첫 콜론). 콜론이 없으면 (None, body)"""
    depth = 0
    for i, ch in enumerate(body):
        if ch == "「": depth += 1
        elif ch == "」": depth = max(0, depth - 1)
        elif ch == ":" and depth == 0: return body[:i], body[i + 1:]
    return None, body


PA_SENT = re.compile(r"この能力はパートナーエリアでも(?:宣言できる|有効になる|発動する)。?")
DECL_COND = re.compile(r"この能力は(.+?)場合に宣言できる。?")


def parse_ability_text(src, ctype="char", quoted=False):
    """능력 1줄 → ab dict (모르면 None)"""
    src0 = src; t = _pre(nk(src))
    t = re.sub(r"【カットイン\s*(AP[+-]\d+)】", r"【カットイン】\1", t)  # OCR: 【カットインAP+2000】
    tg = parse_tags2(t); cond, lim, ic, decl, flags, body = tg["cond"], tg["lim"], tg["ic"], tg["decl"], tg["flags"], tg["body"]
    rm_ = re.search(r"\(((?:自分|相手)のターン)?の?コンタクト中に手札からリムーブ(?:して使う|することで発動する)\)", t)
    if rm_:  # 【カットイン】 タグが欠けていても、リマインダーから判定する
        if ic is None and not decl and body.strip(): ic = "cutin"
        if ic == "cutin" and rm_.group(1) and "turn" not in cond: cond = dict(cond); cond["turn"] = "self" if rm_.group(1).startswith("自分") else "opp"
    # ── MR 능력 (여러 표현)
    if flags["mr"] and not body.strip(): return {"ic": "mr", "txt": src0}
    b = body.strip().rstrip("。")
    if b in ("相手ターン中に現場を離れる場合、パートナーエリアに移動する", "自分の現場にMRが登場する場合、リムーブする", "相手ターン中に現場を離れる場合、パートナーエリアに移動する。自分の現場にMRが登場する場合、リムーブする"):
        return {"ic": "mr", "txt": src0}
    # ── 절대 규칙 문장들
    pa = bool(PA_SENT.search(body)); body = PA_SENT.sub("", body).strip()
    dm = DECL_COND.search(body)
    if dm:
        cd = parse_cond(dm.group(1))
        if cd is None: return None
        cond = _merge_cond(cond, cd)
        if cond is None: return None
        body = DECL_COND.sub("", body).strip()
    r = _special(src0, t, body, cond, lim, ic, decl, flags, ctype)
    if r is not None:
        if r is False: return None
        if pa: r["pa"] = True
        return r
    # ── 선언 능력: 코스트 : 효과
    if decl:
        cost_t, eff_t = _split_cost(body)
        cost = list(flags["cost"])
        if cost_t is None: eff_t = body
        else:
            cc = parse_cost(cost_t)
            if cc is None: return None
            cost += cc
        cx = {"ic": "declare"}
        ops = ops_from_text(eff_t, cx)
        if ops is None: return None
        ab = {"ic": "declare", "cond": cond, "lim": lim, "cost": cost, "ops": ops, "txt": src0}
        if pa: ab["pa"] = True
        return _clean(ab)
    if flags["disguise"] and not body and ic is None: return _clean({"ic": "disguise", "cond": cond, "txt": src0})
    if flags["cost"] or flags.get("evidkill"): return None
    # ── 컷인
    if ic == "cutin":
        m = re.match(r"(?:AP([+-]\d+)、)?(.+?)に(?:【カットイン】|カットイン)(?:カットイン)?する場合、(代わりに)?AP([+-]\d+)$", body)
        if m:
            f_ = parse_np(np_char(m.group(2)))
            if f_ is not None and (m.group(1) is None) == (m.group(3) is None):
                f_ = dict(f_); f_.pop("type", None)
                if m.group(1) is None: return _clean({"ic": "cutin", "cond": _merge_cond(cond, {"cin": f_}), "v": int(m.group(4)), "txt": src0})
                return _clean({"ic": "cutin", "cond": cond, "v": int(m.group(1)), "alt": {"cond": {"cin": f_}, "v": int(m.group(4))}, "txt": src0})
        m = re.match(r"(.+?)(\d+)(?:枚|つ)につき、AP([+-]\d+)$", body)
        if m and m.group(2) == "1":
            pc = parse_count(m.group(1))
            if pc is not None: return _clean({"ic": "cutin", "cond": cond, "v": int(m.group(3)), "per": pc, "txt": src0})
        m = re.match(r"AP([+-]\d+)(?:、(.+))?$", body)
        if m:
            v = int(m.group(1)); ops = []
            if m.group(2):
                ops = ops_from_text(m.group(2));
                if ops is None: return None
            return _clean({"ic": "cutin", "cond": cond, "v": v, "ops": ops, "txt": src0})
        ops = ops_from_text(body)
        if ops is None: return None
        return _clean({"ic": "cutin", "cond": cond, "v": 0, "ops": ops, "txt": src0})
    # ── 이벤트 효과 / 트리거 없는 본문
    trig = _trigger(body, ic, cond, lim, ctype)
    if trig is False: return None
    if trig is not None:
        trig["txt"] = src0
        if pa: trig["pa"] = True
        return _clean(trig)
    ic2 = ic or ("event" if ctype == "event" else None)
    if ic2 in ("onplay", "onremoved", "flash", "event", "ondisguise"):
        cx = {"ic": ic2}
        if ic2 == "ondisguise":
            m = re.match(r"(カード名\[[^\]]+\])と入れ替わった場合、(.+)", body)
            if m:
                nm_ = _names(m.group(1))[0]; cond = _merge_cond(cond, {"swapName": nm_}); body = m.group(2)
        ops = ops_from_text(body, cx)
        if ops is None: return None
        ab = {"ic": ic2, "cond": cond, "lim": lim, "ops": ops, "txt": src0}
        if flags["bang"]: ab["bang"] = True
        if flags["hayate"] and ic2 == "onplay": ab["hay"] = True
        if pa: ab["pa"] = True
        return _clean(ab)
    return None


def _clean(a):
    return {k: v for k, v in a.items() if not (k in ("cond", "cost", "ops") and not v) and not (k == "lim" and not v)}


VIA = r"レベル(\d+)以上のキャラの能力(?:や|か)レベル(\d+)以上のイベントの効果によって登場した場合、(.+)"


def _ef(np_text, extra=None):
    f = parse_np(np_text)
    if f is None: return None
    f = dict(f); f.pop("type", None) if False else None
    if extra: f.update(extra)
    return f


def _trigger(body, ic, cond, lim, ctype):
    """태그 없는 트리거 문장('…とき、…')·상시 문장 해석. 해당 없으면 None, 해석 실패면 False"""
    b = body.strip().rstrip("。")
    # 해결편 이행
    m = re.fullmatch(r"この事件が解決編(?:になった|に移行した)とき、(.+)", b)
    if m:
        ops = ops_from_text(m.group(1))
        return False if ops is None else {"ic": "onsolve", "cond": cond, "lim": lim, "ops": ops}
    m = re.fullmatch(r"自分のターンのメインフェイズ開始時、(.+)", b)
    if m:
        ops = ops_from_text(m.group(1)); return False if ops is None else {"ic": "onmain", "cond": cond, "lim": lim, "ops": ops}
    m = re.fullmatch(r"自分のターン終了時、(.+)", b)
    if m:
        rest = m.group(1); mm = re.match(r"([^。]+?)場合、(.+)", rest); c2 = {}
        if mm and not rest.startswith("そうした"):
            c2 = parse_cond(mm.group(1))
            if c2 is None: return False
            rest = mm.group(2)
        ops = ops_from_text(rest)
        return False if ops is None else {"ic": "onend", "cond": _merge_cond(cond, c2), "lim": lim, "ops": ops}
    # 자신이 콘택트
    m = re.fullmatch(r"このキャラが(?:(.+?)のキャラと)コンタクトしたとき、(.+)", b)
    if m:
        f = _ef(m.group(1) + "キャラ"); f.pop("type", None)
        ops = ops_from_text(m.group(2), {"ic": "oncontact"})
        return False if ops is None else {"ic": "oncontact", "cond": cond, "lim": lim, "ef": f, "ops": ops}
    m = re.fullmatch(r"自分の現場にいる(?:このキャラ以外の)?(.*?)キャラがコンタクトしたとき、(.+)", b)
    if m:
        f = _ef(m.group(1) + "キャラ") if m.group(1) else {}
        if f is None: return False
        f = dict(f); f.pop("type", None)
        if "このキャラ以外の" in b.split("キャラ")[0] + "": f["notSelf"] = True
        rest = m.group(2); ops = ops_from_text(rest, {"ic": "onallycontact"})
        if ops is None: return False
        return {"ic": "onallycontact", "cond": cond, "lim": lim, "ef": f, "ops": ops}
    m = re.fullmatch(r"自分の現場にいるこのキャラ以外のキャラがコンタクトしたとき、(.+)", b)
    if m:
        m2 = re.match(r"(.+?)場合、(.+)", m.group(1)); rest = m.group(1)
        ops = None
        # "…スリープさせてもよい。そうした場合、…" — 문장 통째
        ops = ops_from_text(rest, {"ic": "onallycontact"})
        return False if ops is None else {"ic": "onallycontact", "cond": _merge_cond(cond, {"selfSt": "a"}), "lim": lim, "ef": {"notSelf": True}, "ops": ops}
    # 아군 등장
    m = re.fullmatch(r"このキャラかカード名\[([^\]]+)\]が自分の現場に登場したとき、(.+)", b)
    if m:
        ops = ops_from_text(m.group(2), {"ic": "onally"})
        return False if ops is None else {"ic": "onally", "cond": cond, "lim": lim, "ef": {"any": [{"self": True}, {"name": m.group(1)}]}, "ops": ops}
    m = re.fullmatch(r"自分の現場にこのキャラ以外の(.+?)が登場したとき、(.+)", b)
    if m:
        f = parse_np(m.group(1))
        if f is None: return False
        f = dict(f); f["notSelf"] = True; f.pop("type", None) if "type" not in f else None
        ops = ops_from_text(m.group(2), {"ic": "onally"})
        return False if ops is None else {"ic": "onally", "cond": cond, "lim": lim, "ef": f, "ops": ops}
    m = re.fullmatch(r"能力や効果によって(.+?)が自分の現場に登場したとき、その中から1枚をアクティブにし、ターン終了時までそのキャラに(迅速|突撃)を与える", b)
    if m:
        f = parse_np(m.group(1))
        if f is None: return False
        f = dict(f); f.pop("type", None) if f.get("type") == "char" else None  # 登場するのは常にキャラ
        return {"ic": "onally", "on": {"by": "effect"}, "cond": cond, "lim": lim, "ef": f, "ops": [{"op": "ent", "do": "active"}, {"op": "ent", "do": "kw", "v": "rapid" if m.group(2) == "迅速" else "assault"}]}
    # 다른 아군 리무브
    m = re.fullmatch(r"自分の現場にいるこのキャラ以外の(.+?)がリムーブされたとき、(.+)", b)
    if m:
        f = parse_np(m.group(1))
        if f is None: return False
        f = dict(f); f["notSelf"] = True
        rest = m.group(2); c2 = {}
        mm = re.match(r"([^。]+?)場合、(.+)", rest)
        if mm:
            c2 = parse_cond(mm.group(1))
            if c2 is None: return False
            rest = mm.group(2)
        ops = ops_from_text(rest, {"ic": "onallyremoved"})
        return False if ops is None else {"ic": "onallyremoved", "cond": _merge_cond(cond, c2), "lim": lim, "ef": f, "ops": ops}
    # 리무브 에리어에서 떠났을 때
    m = re.fullmatch(r"自分のリムーブエリアにある(.+?)がリムーブエリアから離れたとき、(.+)", b)
    if m:
        f = parse_np(m.group(1))
        if f is None: return False
        ops = ops_from_text(m.group(2), {"ic": "onremleave"})
        return False if ops is None else {"ic": "onremleave", "cond": cond, "lim": lim, "ef": f, "ops": ops}
    # 아군 콘택트 킬
    m = re.fullmatch(r"相手の現場にいるキャラが自分の現場にいる(.+?)とのコンタクトによってリムーブされたとき、(.+)", b)
    if m:
        f = parse_np(m.group(1))
        if f is None: return False
        ops = ops_from_text(m.group(2), {"ic": "onallykill"})
        return False if ops is None else {"ic": "onallykill", "cond": cond, "lim": lim, "ef": f, "ops": ops}
    m = re.fullmatch(r"(?:相手の現場にいるキャラが)?このキャラとのコンタクトによってリムーブされたとき、(.+)", b)
    if m:
        ops = ops_from_text(m.group(1))
        return False if ops is None else {"ic": "onkill", "cond": cond, "lim": lim, "ops": ops}
    # 대체 효과
    m = re.fullmatch(r"自分の現場にいるこのキャラ以外のキャラ1枚が相手の能力や効果、コンタクトによって現場から離れるとき、このキャラをリムーブしてもよい。そうした場合、そのキャラは現場から離れる代わりに手札に移す", b)
    if m: return {"ic": "replace", "cond": cond, "lim": lim, "ef": {"own": "self", "notSelf": True}, "cost": [{"c": "selfRem", "n": 1}], "rep": {"to": "hand"}}
    # 상시
    if b == "相手は【ヒラメキ】を発動できない": return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "pk": "noflash"}
    m = re.fullmatch(r"相手の現場にいるキャラをレベル([+-]\d+)する", b)
    if m: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "opp"}, "lv": int(m.group(1))}
    m = re.fullmatch(r"(?:自分の現場にいる(?:すべての)?キャラ)?をAP([+-]\d+)する", b)
    m = re.fullmatch(r"(.+?)場合、自分の現場にいるすべてのキャラをAP([+-]\d+)する", b)
    if m:
        c2 = parse_cond(m.group(1))
        if c2 is None: return False
        return {"ic": "static", "cond": _merge_cond(cond, c2), "lim": 0, "tgt": {"sel": "allies"}, "ap": int(m.group(2))}
    m = re.fullmatch(r"(.+?)場合、このキャラをAP([+-]\d+)する", b)
    if m and ic is None:
        c2 = parse_cond(m.group(1))
        if c2 is None: return False
        return {"ic": "static", "cond": _merge_cond(cond, c2), "lim": 0, "tgt": {"sel": "self"}, "ap": int(m.group(2))}
    m = re.fullmatch(r"AP([+-]\d+)", b)
    if m and ic is None and (cond.get("bond") is not None or cond.get("turn") or cond.get("fileMin") or cond.get("pcolor") or cond.get("ccolor")): return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "ap": int(m.group(1))}
    m = re.fullmatch(r"(.+?)場合、このキャラは(突撃(?:\[[^\]]+\])?)を持つ", b)
    if m and ic is None:
        c2 = parse_cond(m.group(1)); kw = _kw_of(m.group(2))
        if c2 is None or not kw: return False
        return {"ic": "static", "cond": _merge_cond(cond, c2), "lim": 0, "tgt": {"sel": "self"}, "kw": kw}
    m = re.fullmatch(r"【?(突撃(?:\[[^\]]+\])?|迅速|バレット)】?(?:\[[^\]]+\])?", b)
    if m and cond:  # 【事件 赤&黒】突撃［キャラ］ / 【パートナー】【青】【突撃】 — 조건부 키워드
        kw = _kw_of(m.group(1)); return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "kw": kw}
    for pat, kw_ in (("このキャラは相手の現場にいるアクティブ状態のキャラを指定してアクションできる", "actactive"),
                     ("このキャラは事件を指定してアクションできない", "nocase"),
                     ("このキャラはスリープ状態でもガードできる", "sleepguard"),
                     ("このキャラはガードできない", "cantguard"),
                     ("このキャラはガードできる場合、必ずガードする", "mustguard"),
                     ("相手の現場にいるキャラがアクションするとき、このキャラを指定できる場合、必ず指定する", "mustdesig"),
                     ("相手はイベントの効果によってこのキャラを選べる場合、必ず選ぶ", "mustsel")):
        if b == pat and ic is None and not lim: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "kw": kw_}
    m = re.fullmatch(r"現場にいるこのキャラはカード名\[([^\]]+)\]としても扱う", b)
    if m and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "nm": m.group(1)}
    if b == "相手は【カットイン】を使用できない" and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "pk": "nocutin"}
    if b == "相手のキャラの【変装時】は発動しない" and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "pk": "nodisev"}
    m = re.fullmatch(r"自分は特徴\[([^\]]+)\]以外のキャラを手札から使用できない", b)
    if m and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "pk": "onlytrait", "tr": m.group(1)}
    m = re.fullmatch(r"犯人\[ID:\d+\]はデッキに何枚でも入れることができる", b)
    if m and ic is None: return {"ic": "deckfree", "cond": {}, "lim": 0}
    m = re.fullmatch(r"現場にいるこのキャラは特徴\[([^\]]+)\]を持つ", b)
    if m and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "tr": m.group(1)}
    if ic is None:
        r = PR.static_body(b, cond)
        if r is not None: return r
    m = re.fullmatch(r"(.+?)(?:のカード|の)(\d+)(?:枚|つ)につき、このキャラをAP([+-]\d+)する", b)
    if m and ic is None:
        pc = parse_count(m.group(1))
        if pc is not None and m.group(2) == "1": return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "ap": int(m.group(3)), "per": pc}
    m = re.fullmatch(r"LP([+-]\d+)", b)
    if m and ic is None and (cond.get("pcolor") or cond.get("turn") or cond.get("fileMin") or cond.get("ccolor")): return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "lp": int(m.group(1))}
    m = re.fullmatch(r"(.+?)場合、このキャラをLP([+-]\d+)する", b)
    if m and ic is None:
        c2 = parse_cond(m.group(1))
        if c2 is None: return False
        return {"ic": "static", "cond": _merge_cond(cond, c2), "lim": 0, "tgt": {"sel": "self"}, "lp": int(m.group(2))}
    m = re.fullmatch(r"相手の能力や効果によって選ばれない", b)
    if m: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "kw": "untarget"}
    m = re.fullmatch(r"このキャラがアクションしたとき、(.+)", b)
    if m:
        ops = ops_from_text(m.group(1))
        return False if ops is None else {"ic": "onact", "cond": cond, "lim": lim, "ops": ops}
    m = re.fullmatch(r"このキャラがスリープ状態の場合、相手は自分の現場にいるレベル(\d+)以下のキャラを指定してアクションできない", b)
    if m: return {"ic": "static", "cond": {**cond, "selfSt": "s"}, "lim": 0, "tgt": {"sel": "allies", "filter": {"lvMax": int(m.group(1))}}, "kw": "noact"}
    m = re.fullmatch(r"お互いの現場にキャラが合わせて(\d+)枚以上いる場合、手札にあるこのキャラはレベル(\d+)になる", b)
    if m: return {"ic": "hand", "cond": {**cond, "fieldMin": int(m.group(1))}, "lim": 0, "lv": int(m.group(2))}
    if b == "このキャラはスリープ状態で登場する": return {"ic": "enter", "cond": cond, "lim": 0, "st": "s"}
    m = re.fullmatch(r"(?:自分が)?ネクスト ?ヒントで手札を使用したとき、そのカードのレベル以下のレベルのキャラを1枚まで選び、(.+?)", b)
    if m and m.group(1) in DOS: return {"ic": "onhint", "cond": cond, "lim": lim, "ops": [{"op": "select", "n": 1, "do": DOS[m.group(1)], "filter": {"type": "char", "lvMax": "used"}}]}
    m = re.fullmatch(VIA, b)
    if m:
        ops = ops_from_text(m.group(3))
        if ops: return {"ic": ic or "onplay", "cond": {**cond, "via": [{"type": "char", "lvMin": int(m.group(1))}, {"type": "event", "lvMin": int(m.group(2))}]}, "lim": lim, "ops": ops}
    m = re.fullmatch(r"このイベントがセットされているキャラは「(.+)」を持つ", b)
    if m:
        g = parse_ability_text(m.group(1) + "。", ctype="char", quoted=True) if not m.group(1).startswith("このキャラが") else _grant_contact(m.group(1))
        if g is None or isinstance(g, tuple): return False
        return {"ic": "grant", "cond": cond, "lim": 0, "g": g}
    return _bus_trigger(b, ic, cond, lim)


# ── 범용 이벤트 트리거 (ic:"ontrig") ──
def _bus_np(text, own):
    """주체/대상 명사구 → 필터 (own 지정)"""
    f = parse_np(text)
    if f is None: return None
    f = dict(f); f["own"] = own; return f


def _bus_subject(t):
    """'…が' 앞의 주체 → spec / None. spec: who, sub, sf"""
    t = t.strip()
    if t in ("このキャラ", "このイベント"): return {"sub": "self"}
    if t == "自分": return {"who": "self"}
    if t == "相手": return {"who": "opp"}
    m = re.fullmatch(r"このキャラ以外のカード名\[([^\]]+)\]", t)
    if m: return {"sub": "notSelf", "sf": {"name": m.group(1), "own": "self"}}
    m = re.fullmatch(r"このキャラ以外の(.+)", t)
    if m:
        if m.group(1) == "キャラ": return {"sub": "notSelf"}
        f = _bus_np(m.group(1), "self"); return None if f is None else {"sub": "notSelf", "sf": f}
    m = re.fullmatch(r"このキャラか自分の現場にいる(.+)", t)
    if m:
        f = _bus_np(m.group(1), "self"); return None if f is None else {"sub": "orSelf", "sf": f}
    m = re.fullmatch(r"自分の現場にいる(.+)", t)
    if m:
        f = _bus_np(m.group(1), "self"); return None if f is None else {"who": "self", "sf": f}
    m = re.fullmatch(r"相手の現場にいる(.+)", t)
    if m:
        f = _bus_np(m.group(1), "opp"); return None if f is None else {"who": "opp", "sf": f}
    return None


def _bus_target(t):
    """'…を指定して' 앞의 대상 → spec / None"""
    t = t.strip()
    if t == "このキャラ": return {"tself": True}
    m = re.fullmatch(r"自分の現場にいる(.+)", t)
    if m:
        f = _bus_np(m.group(1), "self"); return None if f is None else {"tf": f}
    return None


_BUS_TAILS = [  # (정규식, evs, 추가 필드)
    (r"キャラに(?:表向きで)?セットされていた(このイベント)がリムーブエリアに置かれた", ["setOff"], {}),
    (r"(.+?)のコンタクト中に(自分|相手)が(?:【カットイン】|カットイン)を使用した", ["cutin"], {"_cont": True}),
    (r"(自分|相手)の能力や効果によって(.+?)をリムーブした", ["removed"], {"_agent": True}),
    (r"(.+?)がアクション\[事件\]した", ["act"], {"k": "case"}),
    (r"(.+?)がアクション\[キャラ\]した", ["act"], {"k": "char"}),
    (r"(.+?)が推理かアクションした", ["reason", "act"], {}),
    (r"(.+?)がアクションした", ["act"], {}),
    (r"(.+?)が推理した", ["reason"], {}),
    (r"(.+?)がコンタクトした", ["contact"], {}),
    (r"(.+?)の証拠がリムーブされた", ["evrem"], {}),
    (r"(.+?)が(.+?)を指定してアクションした", ["act"], {"_t": 2}),
    (r"(.+?)のアクション\[事件\]によって証拠を得た", ["evgain"], {"k": "case", "by": "action"}),
    (r"(.+?)が推理によって証拠を得た", ["evgain"], {"by": "reason"}),
    (r"(.+?)が証拠を得た", ["evgain"], {}),
    (r"(.+?)がコンタクトによってリムーブされた", ["removed"], {"by": "contact"}),
    (r"(.+?)が(.+?)とのコンタクトによってリムーブされた", ["removed"], {"by": "contact", "_t": 2}),
    (r"(.+?)が自分の能力や効果によってリムーブされた", ["removed"], {"by": "effect", "cz": "self"}),
    (r"(.+?)が相手の能力や効果によってリムーブされた", ["removed"], {"by": "effect", "cz": "opp"}),
    (r"(.+?)がリムーブされた", ["removed"], {}),
    (r"(.+?)が自分の現場に登場した", ["enter"], {"_own": True}),
    (r"(.+?)が登場した", ["enter"], {}),
    (r"(.+?)が【宣言】能力を使用した", ["declared"], {}),
    (r"(.+?)が(?:【カットイン】|カットイン)か【変装】を使用した", ["cutin", "disguise"], {}),
    (r"(.+?)が(?:【カットイン】|カットイン)を使用した", ["cutin"], {}),
    (r"(.+?)が【変装】した", ["disguise"], {}),
    (r"(自分|相手)が(.+?)のイベントを使用した", ["useev"], {"_ev": 2}),
    (r"(自分|相手)がイベントを使用した", ["useev"], {}),
]


def _bus_trigger(b, ic, cond, lim):
    if ic is not None: return None
    b = re.sub(r"\((?:[^()]*)\)", "", b)
    m = re.fullmatch(r"(.+?)のアクション終了時、(.+)", b)
    if m:
        sp = _bus_subject(m.group(1))
        if sp is None: return None
        evs, rest, spec = ["actend"], m.group(2), dict(sp)
    else:
        m = re.match(r"(.+?)(?:とき|たび)、(.+)$", b)
        if not m: return None
        head, rest = m.group(1), m.group(2)
        spec = None
        bt = PR.bus_tail(head)
        if bt is not None: evs, spec = bt
        for rx, evs_, extra in ([] if spec is not None else _BUS_TAILS):
            evs = evs_
            mm = re.fullmatch(rx, head)
            if not mm: continue
            gs = mm.groups()
            if "_cont" in extra:
                tsp = _bus_target(gs[0]); pl = _bus_subject(gs[1])
                if tsp is None or pl is None: return None
                spec = {**tsp, "who": pl["who"]}
            elif extra.get("_agent"):
                f = _bus_np(gs[1], "opp" if gs[1].startswith("相手の現場にいる") else "self") if False else None
                mv = re.fullmatch(r"(自分|相手)の現場にいる(.+)", gs[1])
                if not mv: return None
                f = _bus_np(mv.group(2), "self" if mv.group(1) == "自分" else "opp")
                if f is None: return None
                spec = {"who": "self" if mv.group(1) == "自分" else "opp", "sf": f, "by": "effect", "cz": "self" if gs[0] == "自分" else "opp"}
            elif "_ev" in extra:
                pl = _bus_subject(gs[0]); f = _bus_np(gs[1] + "のイベント", "self")
                if pl is None or f is None: return None
                f.pop("own", None); f["type"] = "event"; spec = {"who": pl["who"], "sf": f}
            elif rx.startswith("(自分|相手)がイベント"):
                spec = {"who": _bus_subject(gs[0])["who"], "sf": {"type": "event"}}
            else:
                sp = _bus_subject(gs[0])
                if sp is None: return None
                spec = dict(sp)
                if "_t" in extra:
                    tsp = _bus_target(gs[extra["_t"] - 1]) if not (extra.get("by") == "contact" and gs[1] == "このキャラ") else {"tself": True}
                    if tsp is None: return None
                    spec.update(tsp)
                if extra.get("_own"):
                    if "who" not in spec and "sub" not in spec: spec["who"] = "self"; spec["sf"] = {**spec.get("sf", {}), "own": "self"}
                    elif "who" not in spec: spec["who"] = "self"
            spec.update({k: v for k, v in extra.items() if not k.startswith("_")})
            break
        if spec is None: return None
    if not any(k in spec for k in ("sub", "sf", "tself", "tf", "who", "hw", "hself", "dself")): return None
    c2 = {}
    mm = re.match(r"([^。]+?)場合、(.+)", rest)
    if mm and not rest.startswith("そうした"):
        c2 = parse_cond(mm.group(1))
        if c2 is None: return False
        rest = mm.group(2)
    ops = ops_from_text(rest, {"ic": "ontrig"})
    if ops is None: return False
    ab = {"ic": "ontrig", "evs": evs, "cond": _merge_cond(cond, c2), "lim": lim, "ops": ops}
    ab.update(spec)
    return ab


def _grant_contact(inner):
    m = re.fullmatch(r"このキャラがコンタクトしたとき、そのコンタクト中、このキャラをAP([+-]\d+)する。?", inner)
    if m: return {"ic": "oncontact", "on": {"k": "atk"}, "ops": [{"op": "self", "do": "ap", "v": str(int(m.group(1))), "until": "contact"}]}
    return None


def _special(src0, t, body, cond, lim, ic, decl, flags, ctype):
    """줄 전체가 정형인 경우(승리 조건 재작성 등)"""
    m = re.match(r"自分の【(黒|赤|青|緑|黄|紫|白)】のパートナーの【事件解決】能力を以下の能力に書き換える。?\s*【解決編】【証拠隠滅】【スリープ】証拠を事件レベルの数だけリムーブする:相手はゲームに敗北する。?$", nk(src0))
    if m: return {"ic": "winalt", "cond": {"pcolor": COL[m.group(1)]}, "lim": 0, "txt": src0}
    m = re.fullmatch(r"このイベントは、?(.+?)場合に使用できる。?", body)
    if m and ctype == "event":
        c2 = parse_cond(m.group(1))
        if c2 is None: return False
        return {"ic": "usecond", "cond": _merge_cond(cond, c2), "lim": 0, "txt": src0}
    if re.fullmatch(r"(?:ネクストヒントで)?手札から使用する場合、このキャラは事件カードの色を無視できる。?(?:\(.*\))?", body): return {"ic": "ignorecolor", "cond": cond, "lim": 0, "txt": src0}
    m = re.fullmatch(r"現場にいるこのキャラをレベル([+-]\d+)する。?", body)
    if m and ic is None: return {"ic": "static", "cond": cond, "lim": 0, "tgt": {"sel": "self"}, "lv": int(m.group(1)), "txt": src0}
    return None


# ─────────────────────────── 카드 단위 컴파일 ───────────────────────────
def logical_lines(fx):
    raw = [_pre(nk(x)) for x in (fx or "").split("\n") if x.strip()]
    out = []
    for l in raw:
        if out and _should_join(out[-1], l): out[-1] = out[-1] + ("\n" if l.startswith("・") else "") + l
        else: out.append(l)
    return out


CONN = ("これによって", "この効果によって", "この【宣言】能力", "この能力は", "そうした場合", "そうしなかった場合")


def _should_join(prev, cur):
    if cur.startswith("・"): return True
    p = prev.rstrip()
    if p.endswith(("、", ":", ",")): return True
    if re.search(r"(この|まで|こと|を|の|が|は|に|と)$", p) and not p.endswith(("。", ")", ")")): return True
    if cur.startswith("(") and not p.endswith(("。", ")")) and not re.fullmatch(r"(?:【[^】]+】|\s)*(?:突撃|ミスリード|変装|迅速|ブレット|バレット)[^。]*", p): return True
    if p.endswith("以下の能力に書き換える。"): return True
    if p == "【MR能力】": return True
    if re.fullmatch(r"(?:【[^】]+】|&)+", p) and not re.fullmatch(r"(?:【(?:突撃|ミスリード ?\d*|変装|迅速|バレット)】)+", p): return True
    if re.search(r"以下から\d+つ(?:まで)?選んで行う。?$", _strip_reminder(p).rstrip()): return True
    if cur.startswith(CONN) and not p.endswith(("」",)): return True
    return False


KWLINE = re.compile(r"^(?:【?(?:突撃|ミスリード ?\d*|変装|迅速|バレット|カットイン ?\d*)】?)+(?:\[[^\]]+\])?(?:\s*\d+)?(?:\s*【[^】]+】)*\s*$")


def is_kwline(line):
    t = _strip_reminder(nk(line)).strip()
    if not t: return True
    t = re.sub(r"【FILE ?\d+】", "", t).strip()
    t = re.sub(r"【事件】.*?(?=$)", "", t).strip() if t.startswith("【変装】") else t
    if re.fullmatch(r"(?:【?(?:突撃|ミスリード|変装|迅速|バレット)(?: ?\d+)?】?(?:\[[^\]]+\])?\s*)+", t): return True
    return False


def kw_abilities(line):
    """키워드만 있는 줄(突撃/ミスリード N/変装/迅速/バレット) → 자기 자신에게 키워드를 주는 static (카드의 kw 칸과 같은 값이라 겹쳐도 무해)"""
    t = _strip_reminder(nk(line)); res = []
    for m in re.finditer(r"(突撃(?:\[[^\]]+\])?|ミスリード ?(\d+)|変装|迅速|バレット)", t):
        w = m.group(1)
        if w.startswith("突撃"): kw = KWMAP.get(w) or "assault"
        elif w.startswith("ミスリード"): kw = f"misread{m.group(2) or 1}"
        elif w == "変装": kw = "disguise"
        elif w == "迅速": kw = "rapid"
        else: kw = "bullet"
        res.append({"ic": "static", "cond": {}, "tgt": {"sel": "self"}, "kw": kw, "txt": line})
    return res


def _norm_txt(s):
    return re.sub(r"\s+", "", _strip_reminder(nk(s)))


def _model_match(line, model_ab):
    n = _norm_txt(line); res = []
    for a in model_ab or []:
        if not isinstance(a, dict) or a.get("ic") == "manual" and not (a.get("txt") or "").strip(): continue
        t = _norm_txt(a.get("txt") or "")
        if t and (t == n or (len(t) > 8 and (t in n or n in t))) and not has_manual([a]): res.append(a)
    return res


def _dedupe(abs_):
    out, seen = [], set()
    for a in abs_:
        k = repr({kk: vv for kk, vv in a.items() if kk != "txt"})
        if k in seen: continue
        seen.add(k); out.append(a)
    return out


def parse_ability_multi(ln, ctype="char"):
    """능력 1줄 → [ab, ...] (모르면 None). 【登場時】【変装時】처럼 트리거 태그가 둘이면 능력을 둘로 나눈다(각각 독립적으로 발동)."""
    t = nk(ln); m = re.match(r"(?:\s*【[^】]+】)+", t); lead = m.group(0) if m else ""
    if "【登場時】" in lead and "【変装時】" in lead:
        a1 = parse_ability_text(t.replace("【変装時】", "", 1), ctype); a2 = parse_ability_text(t.replace("【登場時】", "", 1), ctype)
        return [a1, a2] if a1 is not None and a2 is not None else None
    a = parse_ability_text(ln, ctype); return None if a is None else [a]


def compile_card(fx, ctype="char", kw="", model_ab=None):
    """카드 1장 → ab 리스트. fx 줄 단위로 규칙 변환, 못 바꾸는 줄은 모델 결과 → 그래도 없으면 manual"""
    out = []
    lines = logical_lines(fx)
    if not lines: return copy.deepcopy(model_ab or [])
    for ln in lines:
        if is_kwline(ln):
            out += kw_abilities(ln); continue
        try: ab = parse_ability_multi(ln, ctype)
        except Exception: ab = None
        if ab is not None: out += ab; continue
        mm = _model_match(ln, model_ab)
        if mm: out += copy.deepcopy(mm); continue
        out.append({"ic": "manual", "txt": ln, "ops": [{"op": "manual", "txt": ln}]})
    return _dedupe(out)


# ─────────────────────────── 옛 API (upgrade 등) ───────────────────────────
def parse_ability(src):
    """(옛 API) 능력 문장 1개 → ab dict 또는 None"""
    return parse_ability_text(src)


def upgrade_ability(ab):
    """능력 1개 → 대체 능력 리스트(바뀌었으면) 또는 None(그대로)"""
    ops = ab.get("ops") or []; man = [o for o in ops if o.get("op") == "manual"]
    if ab.get("ic") == "manual" or (man and len(ops) == 1):
        src = ab.get("txt") or (man[0].get("txt") if man else "")
        new = parse_ability_text(src) if src else None
        if new is None and man and ab.get("ic") not in ("manual",) and man[0].get("txt"):
            ops2 = ops_from_text(man[0]["txt"])
            if ops2: new = {"ic": ab["ic"], "cond": {}, "lim": 0, "ops": ops2, "txt": src}
        if new is None: return None
        cond = {**new.get("cond", {}), **(ab.get("cond") or {})}; lim = ab.get("lim") or new.get("lim", 0)
        res = {**new, "cond": cond, "lim": lim}
        if ab.get("cost") and not new.get("cost"): res["cost"] = ab["cost"]
        return [_clean(res)]
    if man:
        new_ops, changed = [], False
        for o in ops:
            if o.get("op") == "manual":
                r = ops_from_text(o.get("txt", ""))
                if r: new_ops += r; changed = True; continue
            new_ops.append(o)
        if changed: return [{**ab, "ops": new_ops}]
    return None


def upgrade(abilities, fx_ja="", ctype="", kw=""):
    """abilities 중 manual 을 가능한 만큼 구조화. fx 원문이 있으면 카드 단위 컴파일 결과를 쓴다. (새 리스트, 바뀐 능력 수)"""
    if (fx_ja or "").strip() and ctype:
        new = compile_card(fx_ja, ctype, kw, abilities)
        return new, sum(1 for a in new if a not in (abilities or []))
    out, n = [], 0
    for ab in abilities or []:
        r = upgrade_ability(ab) if isinstance(ab, dict) else None
        if r: out += r; n += 1
        else: out.append(copy.deepcopy(ab))
    return out, n


def has_manual(abilities):
    return "manual" in repr(abilities)


def manual_texts(abilities):
    res = []
    def walk(x):
        if isinstance(x, dict):
            if x.get("op") == "manual" or x.get("ic") == "manual":
                t = x.get("txt") or ""
                if t and t not in res: res.append(t)
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(abilities); return res
