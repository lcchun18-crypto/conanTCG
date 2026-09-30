"""공통 실행 primitive 파서 (Turn 12).

문장 전체를 정규식 하나로 잡는 대신, 서로 다른 복합 효과에서 함께 쓰이는 '부품'을 해석해 엔진의 공통 op 로 조립한다.
 - 대상 참조(그 캐릭터 / 선택한 캐릭터 / 등장시킨 캐릭터 / 공개한 카드 / 리무브한 카드 …)  → 결과 레지스터(ref)
 - 지속시간 접두(ターン終了時まで / アクション終了時まで / コンタクト中 / 相手のターン終了時まで)가 붙은 행동열(acts)
 - 분기(そうした場合 / 〜した場合 / それ以외の場合)를 실제 실행 결과(레지스터)로 판정
 - 덱 look / reveal / until / pick / 이동(mv) 을 하나의 부품 세트로 조립
effect_rules.py 의 clause 파서가 기존 정형 패턴으로 못 읽은 절에서만 호출한다(기존 자동 카드 결과는 바뀌지 않는다).
"""
import re


def _er():
    import effect_rules as er
    return er


# ─────────────────────────── 공통 조각 ───────────────────────────
def split_top(s, seps):
    """「」 밖에서만 seps(문자열 리스트) 로 나눈다. 구분자는 버린다"""
    out, cur, depth, i = [], "", 0, 0
    while i < len(s):
        ch = s[i]
        if ch == "「": depth += 1
        if ch == "」": depth = max(0, depth - 1)
        if depth == 0:
            hit = next((sp for sp in seps if s.startswith(sp, i)), None)
            if hit:
                out.append(cur); cur = ""; i += len(hit); continue
        cur += ch; i += 1
    out.append(cur)
    return out


def _outside(s, rx):
    """「」 밖에서 rx 가 처음 매치되는 위치의 match (없으면 None)"""
    depth = 0
    for i, ch in enumerate(s):
        if ch == "「": depth += 1
        elif ch == "」": depth = max(0, depth - 1)
        elif depth == 0:
            m = re.compile(rx).match(s, i)
            if m: return m
    return None


DUR_RX = [
    (r"相手のターン終了時まで、?", "oppEnd"),
    (r"ターン終了時まで、?", "turn"),
    (r"このターン中、?", "turn"),
    (r"アクション終了時まで、?", "contact"),
    (r"(?:この|その)?コンタクト中、?", "contact"),
]


def take_dur(s):
    for rx, u in DUR_RX:
        m = re.match(rx, s)
        if m: return u, s[m.end():]
    return None, s


CONT = (("させ", "させる"), ("にし", "にする"), ("し", "する"), ("持ち", "持つ"), ("失い", "失う"), ("与え", "与える"), ("移し", "移す"), ("加え", "加える"), ("引き", "引く"), ("せ", "せる"))


def to_term(p):
    p = p.strip()
    for a, b in CONT:
        if p.endswith(a): return p[:-len(a)] + b
    return p


def _kw(tok):
    er = _er()
    return er._kw_of(tok)


# ─────────────────────────── 행동열(acts) ───────────────────────────
def _grants(obj):
    """'【突撃】と「…」' → acts (모르면 None)"""
    er = _er(); acts = []
    for piece in split_top(obj, ["と"]):
        piece = piece.strip()
        if not piece: return None
        q = re.fullmatch(r"「(.+)」", piece)
        if q:
            g = er._quoted_grant(q.group(1))
            if g is None: return None
            if isinstance(g, tuple): acts.append({"do": "kw", "v": g[1]})
            else: acts.append({"do": "gab", "g": g})
        else:
            kw = _kw(piece)
            if kw is None: return None
            acts.append({"do": "kw", "v": kw})
    return acts


def act_piece(p):
    """서술부 1조각(지속시간 접두는 이미 제거됨) → acts 리스트 (모르면 None)"""
    er = _er(); p = to_term(p.strip("、 "))
    if p in er.DOS: return [{"do": er.DOS[p]}]
    m = re.fullmatch(r"(?:(?:このキャラ|そのキャラ|選んだキャラ)[をは])?AP([+-]\d+)する", p)
    if m: return [{"do": "ap", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:(?:このキャラ|そのキャラ|選んだキャラ)[をは])?LP([+-]\d+)する", p)
    if m: return [{"do": "lp", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:(?:このキャラ|そのキャラ|選んだキャラ)[をは])?レベル([+-]\d+)する", p)
    if m: return [{"do": "lv", "v": str(int(m.group(1)))}]
    m = re.fullmatch(r"(?:(?:このキャラ|そのキャラ|選んだキャラ)[をは])?元の(AP|LP)を(\d+)にする", p)
    if m: return [{"do": "apBase" if m.group(1) == "AP" else "lpBase", "v": str(int(m.group(2)))}]
    m = re.fullmatch(r"(.+)を(?:与える|持つ)", p)
    if m: return _grants(m.group(1))
    return None


SUBJ = r"(このキャラ|そのキャラ|選んだキャラ|登場させたキャラ|それ)"


def parse_acts(text):
    """'ターン終了時まで突撃を与える' / 'AP+2000し、突撃と「…」を与える' 등 → (acts, alts) : 단일 = ([...], None), 'AかB' = (None, [[...],[...]]). 모르면 (None, None)"""
    t = text.strip("。 、")
    parts = split_top(t, ["か、", "か"]) if _outside(t, r"か[、ターンアクションスリープアクティブリムーブスタンLAP【「]") else [t]
    # 'か' 로 나눈 결과 중 한 조각이라도 해석 못 하면 통째로 실패
    if len(parts) > 1:
        alts = []
        for pt in parts:
            a = _acts_seq(pt)
            if a is None: return None, None
            alts.append(a)
        return None, alts
    a = _acts_seq(t)
    return (a, None) if a is not None else (None, None)


def _acts_seq(t):
    dur = None; acts = []
    # 지속시간 접두는 각 조각 앞에 붙거나, 맨 앞 한 번만 붙어 뒤 조각에 이어진다
    pieces = split_top(t, ["、"])
    for pc in pieces:
        pc = pc.strip()
        if not pc: continue
        d, rest = take_dur(pc)
        if d: dur = d
        m = re.match(SUBJ + r"[をにはが]", rest)
        if m: rest = rest[m.end():]
        got = act_piece(rest)
        if got is None: return None
        for a in got:
            a = dict(a)
            if a["do"] not in ("sleep", "stun", "active", "remove", "hand", "deckBottom", "deckTop", "deckTopOrBottom", "evid", "pa"):
                a["until"] = dur or "turn"
            acts.append(a)
    if not acts or len(acts) > 4: return None
    # 'turn' 은 기본값이므로 생략
    for a in acts:
        if a.get("until") == "turn": a.pop("until")
    return acts


# ─────────────────────────── 대상 참조 ───────────────────────────
def last_char_ref(cx):
    """'그 캐릭터' 가 가리키는 결과 레지스터 이름 — 직전에 캐릭터를 만든/고른 op 에 따른다"""
    lr = cx.get("lastref")
    if lr: return lr
    if cx.get("played"): return "played"
    if cx.get("ic") == "ontrig": return "ent"
    return None


def has_op(ops, name):
    for o in ops or []:
        if not isinstance(o, dict): continue
        if o.get("op") == name: return True
        if has_op(o.get("ops"), name) or has_op(o.get("else"), name): return True
        for ch in o.get("opts") or []:
            if has_op(ch.get("ops"), name): return True
    return False


def note_ops(cx, ops):
    """op 리스트를 처리한 뒤 '그 캐릭터' 가 가리킬 레지스터를 갱신"""
    for o in ops or []:
        k = o.get("op")
        if k in ("play",): cx["lastref"] = "played"
        elif k in ("select",): cx["lastref"] = "sel"
        elif k == "pick" and o.get("as"): cx["lastref"] = o["as"]
        elif k in ("if", "ifc"): note_ops(cx, o.get("ops"))
        elif k == "choose":
            for ch in o.get("opts") or []: note_ops(cx, ch.get("ops"))


REFNAME = {"選んだキャラ": "sel", "登場させたキャラ": "played", "このキャラ": "self"}


def clause_ref_acts(c, cx):
    """'[지속]SUBJECT[に/を/は]서술' → ref op"""
    er = _er()
    d, rest = take_dur(c)
    m = re.match(SUBJ + r"[をにはが]", rest)
    if not m: return None
    subj = m.group(1); body = rest[m.end():]
    if subj in REFNAME: ref = REFNAME[subj]
    else:
        ref = last_char_ref(cx)
        if ref is None: return None
    text = (("ターン終了時まで" if d == "turn" else "アクション終了時まで" if d == "contact" else "相手のターン終了時まで" if d == "oppEnd" else "") + body) if d else body
    acts, alts = parse_acts(text)
    if acts is not None:
        return [{"op": "ref", "ref": ref, "acts": acts}]
    if alts:
        return [{"op": "choose", "opts": [{"lab": alt_label(a), "ops": [{"op": "ref", "ref": ref, "acts": a}]} for a in alts]}]
    return None


def alt_label(acts):
    out = []
    for a in acts:
        d = a["do"]
        if d in ("ap", "lp", "lv"): out.append({"ap": "AP", "lp": "LP", "lv": "레벨"}[d] + ("+" if int(a["v"]) > 0 else "") + a["v"])
        elif d == "kw": out.append(a["v"])
        elif d == "gab": out.append("능력 부여")
        else: out.append({"sleep": "슬립", "stun": "스턴", "active": "액티브", "remove": "리무브", "hand": "손패로", "deckBottom": "덱 아래로", "deckTop": "덱 위로", "apBase": "원래 AP", "lpBase": "원래 LP"}.get(d, d))
    return " + ".join(out)[:60]


def clause(c, cx):
    """기존 정형 패턴으로 못 읽은 절 → 공통 부품 조합 (모르면 None)"""
    for fn in (clause_ref_acts, deck_clause, deck_clause2):
        r = fn(c, cx)
        if r is not None: return r
    return None


# ─────────────────────────── 분기 / 결과 레지스터 조건 ───────────────────────────
REGNP = {"公開したカード": "revealed", "公開したキャラ": "revealed", "リムーブしたカード": "removed", "リムーブしたキャラ": "removed", "引いたカード": "drawn",
         "手札に加えたカード": "moved", "選んだキャラ": "sel", "登場させたキャラ": "played", "移したカード": "moved"}
PASTV = {"手札に加えた": "moved", "リムーブした": "removed", "引いた": "drawn", "登場させた": "played", "公開した": "revealed", "デッキの下に移した": "moved", "移した": "moved"}
_PV = "|".join(sorted(PASTV, key=len, reverse=True))
_RN = "|".join(sorted(REGNP, key=len, reverse=True))


def _np(text):
    er = _er()
    f = er.parse_np(er.np_char(text.strip()) if not re.search(r"(キャラ|イベント|カード)$", text.strip()) else text.strip())
    if f is None: return None
    f = dict(f); f.pop("_distinct", None)
    return f


def reg_if(ref, filters, ops, els=None, **kw):
    o = {"op": "if", "c": "reg", "ref": ref, **kw}
    if filters: o["filters"] = filters
    o["ops"] = ops
    if els: o["else"] = els
    return o


def branch(s, cx):
    """조건 문장 → if 계열 op. 모르면 None. (기존 정형 패턴은 이미 parse_sentence_ops 앞쪽에서 처리됨)"""
    er = _er()
    # (a) 公開したカードが NP の場合、BODY
    m = re.fullmatch(r"(%s)(?:が|は)(.+?)の場合、(.+)" % _RN, s)
    if m and m.group(2) not in ("それ以外", "そうでない"):
        ref = REGNP[m.group(1)]; f = _np(m.group(2))
        if f is None: return None
        inner = er.parse_sentence_ops(m.group(3), {**cx, "subj_reg": ref})
        if not inner: return None
        return [reg_if(ref, [f], inner, all=True)]
    m = re.fullmatch(r"(%s)(?:が|は)(?:それ以外|そうでない)の場合、(.+)" % _RN, s)
    if m:
        inner = er.parse_sentence_ops(m.group(2), {**cx, "subj_reg": REGNP[m.group(1)]})
        if not inner: return None
        return [{"op": "_else", "ref": REGNP[m.group(1)], "ops": inner}]
    # (b) 公開したカードに【緑】と【白】のカードがそれぞれ1枚以上ある場合、BODY
    m = re.fullmatch(r"(%s)に(.+?)(?:が|の)それぞれ(\d+)枚以上ある場合、(.+)" % _RN, s)
    if m and int(m.group(3)) == 1:
        ref = REGNP[m.group(1)]; fs = []
        for part in m.group(2).split("と"):
            f = _np(part if part.endswith("カード") or part.endswith("キャラ") else part + "カード")
            if f is None: return None
            fs.append(f)
        inner = er.parse_sentence_ops(m.group(4), cx)
        if not inner or len(fs) > 4: return None
        return [reg_if(ref, fs, inner)]
    # (d) この【宣言】能力のコストによって NP が [N枚以上] リムーブされた / を公開していた場合  /  この効果によって NP が N枚以上リムーブされた場合
    m = re.fullmatch(r"この(【宣言】能力のコスト|効果)によって(.+?)が(?:(\d+)枚以上)?リムーブされた場合、(.+)", s)
    if m:
        f = _np(m.group(2))
        if f is None: return None
        inner = er.parse_sentence_ops(m.group(4), cx)
        if not inner: return None
        kw = {"n": int(m.group(3))} if m.group(3) and int(m.group(3)) != 1 else {}
        return [reg_if("cost" if m.group(1) != "効果" else "removed", [f], inner, **kw)]
    m = re.fullmatch(r"この【宣言】能力のコストによって(.+?)を公開していた場合、(.+)", s)
    if m:
        f = _np(m.group(1))
        if f is None: return None
        inner = er.parse_sentence_ops(m.group(2), cx)
        if not inner: return None
        return [reg_if("costRev", [f], inner)]
    # (c) [この効果によって][相手が|自分は]NP を [N枚] 手札に加えた/リムーブした/… 場合、BODY  (+ なかった)
    m = re.fullmatch(r"(?:この効果によって|これによって)?(?:(相手|自分)(?:が|は))?(それぞれ色の異なる)?(?:(.+?)を)?(?:(\d+)枚)?(%s)(た|なかった)場合、(.+)" % _PV.replace("た|", "").replace("た)", ")"), s) if False else None
    m = re.fullmatch(r"(?:この効果によって|これによって)?(?:(相手|自分)(?:が|は))?(?:(それぞれ色の異なる)?(.+?)を(?:(\d+)枚)?)?(%s)(?:た)場合、(.+)" % "|".join(x[:-1] for x in sorted(PASTV, key=len, reverse=True)), s)
    if m:
        verb = m.group(5) + "た"; ref = PASTV.get(verb)
        if ref is None: return None
        f = None
        if m.group(3):
            f = _np(m.group(3))
            if f is None: return None
        inner = er.parse_sentence_ops(m.group(6), cx)
        if not inner: return None
        n = int(m.group(4) or 1)
        kw = {}
        if m.group(2): kw["distinct"] = "color"
        if n != 1: kw["n"] = n
        if f is None and not kw: return None  # 필터도 개수도 없는 '〜した場合' 는 기존 done 분기가 담당
        return [reg_if(ref, [f] if f else [], inner, **kw)]
    return None


# ─────────────────────────── 코스트 부품 ───────────────────────────
def cost_piece(piece):
    """코스트 조각 1개 → cost dict (모르면 None). 연용형('…リムーブし')도 받는다"""
    er = _er(); p = to_term(piece.strip())
    m = re.fullmatch(r"手札から(.+?)を(\d+)枚公開する", p)
    if m:
        f = er.parse_np(m.group(1))
        if f is None: return None
        return {"c": "revealHand", "n": int(m.group(2)), "filter": f}
    m = re.fullmatch(r"(?:自分の)?FILE ?エリアにあるカードを上から(\d+)枚リムーブする", p)
    if m: return {"c": "fileRem", "n": int(m.group(1))}
    m = re.fullmatch(r"(?:自分の)?パートナーエリアにある(.+?)を(\d+)枚リムーブする", p)
    if m:
        f = er.parse_np(er.np_char(m.group(1)))
        if f is None: return None
        f = dict(f); f.pop("type", None); return {"c": "paRem", "n": int(m.group(2)), "filter": f}
    m = re.fullmatch(r"ターン終了時までLP(-\d+)する", p)
    if m: return {"c": "lpSelf", "v": int(m.group(1))}
    m = re.fullmatch(r"手札が(\d+)枚になるまで手札をリムーブする", p)
    if m: return {"c": "discardTo", "n": int(m.group(1))}
    m = re.fullmatch(r"(現場にいる|自分の現場にいる)?(このキャラか、)?(.+?)を(\d+)枚(スリープ|スタン)させる", p)
    if m:
        body = m.group(3)
        f = er.parse_np(er.np_char(body)) if body != "" else {}
        if f is None: return None
        f = dict(f); f.pop("type", None); f.pop("_distinct", None)
        c = {"c": "sleepAny", "n": int(m.group(4)), "filter": f}
        if m.group(1) == "現場にいる": c["scope"] = "any"
        if m.group(2): c["orSelf"] = True
        if m.group(5) == "スタン": c["to"] = "stun"
        return c
    m = re.fullmatch(r"(?:現場にいる)(.+?)を(\d+)枚リムーブする", p)
    if m and re.search(r"(キャラ|カード名)", m.group(1)):
        f = er.parse_np(er.np_char(m.group(1)))
        if f is not None:
            f = dict(f); f.pop("type", None); f.pop("_distinct", None); return {"c": "fieldRem", "n": int(m.group(2)), "filter": f}
    m = re.fullmatch(r"リムーブエリアにある(.+?)を(\d+)枚好きな順番でデッキの下に移す", p)
    if m:
        f = er.parse_np(m.group(1))
        return {"c": "remBottom", "n": int(m.group(2)), "filter": f} if f is not None else None
    m = re.fullmatch(r"相手の現場にいるキャラ1枚につき、デッキのカードを上から(\d+)枚リムーブする", p)
    if m: return {"c": "deckrem", "n": int(m.group(1)), "per": {"src": "field", "f": {"own": "opp"}}}
    m = re.fullmatch(r"(?:現場にいる)?キャラに(裏向きで)?セットされているカードを(\d+)枚リムーブする", p)
    if m: return {"c": "unset", "n": int(m.group(2)), "scope": "any", **({"fd": True} if m.group(1) else {})}
    return None


def cost_either(piece):
    """'AかB' 형태의 선택 코스트 (A, B 는 각각 cost_piece)"""
    er = _er(); piece = piece.strip()
    m = re.fullmatch(r"(.+?カード)(\d+)枚か、(.+?)を?(\d+)枚リムーブする", piece)  # 「X1枚か、Y1枚リムーブする」(동사 공유)
    if m: parts = [f"{m.group(1)}を{m.group(2)}枚リムーブする", f"{m.group(3)}を{m.group(4)}枚リムーブする"]
    else: parts = split_top(piece, ["か、"])
    if len(parts) != 2: return None
    rs = []
    for x in parts:
        x = x.strip()
        r = er.parse_cost(x) if not _outside(x, r"か、") else None
        if not r or len(r) != 1: return None
        rs.append(r[0])
    return {"c": "either", "alts": [[rs[0]], [rs[1]]]}


# ─────────────────────────── 상시 효과(static) 부품 ───────────────────────────
STATIC_KW = {
    "アクションできない": "cantact", "ガードできない": "cantguard", "推理できない": "cantreason", "オートフェイズにアクティブにならない": "noauto",
    "スリープ状態でもガードできる": "sleepguard", "相手の現場にいるアクティブ状態のキャラを指定してアクションできる": "actactive",
    "事件を指定してアクションできない": "nocase",
    "相手のイベントの効果によってリムーブされない": "nrm-ev", "相手の能力や効果によってリムーブされない": "nrm-ab",
    "相手の能力や効果によってスリープされない": "nsl-ab", "相手の能力や効果によってスタンされない": "nst-ab",
    "相手のイベントの効果によって選ばれない": "evsafe", "相手の能力や効果によって選ばれない": "untarget",
    "相手の能力や効果によってリムーブされず、スリープされず、スタンされない": "nrm-ab nsl-ab nst-ab",
}


def _kw_pred(p):
    """서술부 → kw 토큰 문자열 (모르면 None). 'このキャラは…' 는 이미 벗긴 상태"""
    p = p.strip().lstrip("、")
    if p in STATIC_KW: return STATIC_KW[p]
    ks = []
    for piece in split_top(p, ["、", "し、", "ず、"]):
        piece = piece.strip()
        if piece.endswith("できず"): piece = piece[:-3] + "できない"
        if piece in STATIC_KW: ks.append(STATIC_KW[piece]); continue
        return None
    return " ".join(ks) if ks else None


def _subject(s):
    """정적 효과 주어 → (tgt dict, rest)  s: 'このキャラは…' / '自分の現場にいる…キャラは…'"""
    er = _er()
    m = re.match(r"(?:現場にいる)?このキャラ(?:は|を|に)(.+)", s)
    if m: return {"sel": "self"}, m.group(1)
    m = re.match(r"(自分|相手)の現場にいる(この キャラ以外の|このキャラ以外の)?(.*?キャラ)(?:は|を|に)(.+)", s.replace("この キャラ", "このキャラ"))
    if m:
        f = er.parse_np(m.group(3))
        if f is None: return None, None
        f = dict(f); f.pop("type", None); f.pop("_distinct", None)
        tgt = {"sel": "allies" if m.group(1) == "自分" else "opp"}
        if f: tgt["filter"] = f
        if m.group(2): tgt["notSelf"] = True
        return tgt, m.group(4)
    return None, None


def static_body(b, cond):
    """태그 없는 상시 문장 1개 → static ab (모르면 None)"""
    er = _er(); b = b.strip().rstrip("。")
    c2 = {}
    m = re.fullmatch(r"(.+?場合)、(.+)", b)
    if m and not m.group(1).endswith("とき"):
        c2 = er.parse_cond(m.group(1)[:-2])
        if c2 is None: return None
        b = m.group(2)
    per = None
    hand = False
    m = re.fullmatch(r"手札にあるこのキャラは、?(.+)", b)
    if m: hand = True; b = m.group(1)
    m = re.fullmatch(r"(.+?)(\d+)(?:枚|つ)につき、(.+)", b)
    if m:
        if m.group(2) != "1": return None
        cn = m.group(1); cn = cn[:-1] if cn.endswith("の") else cn
        per = er.parse_count(cn)
        if per is None: return None
        b = m.group(3)
    if hand:
        mm = re.fullmatch(r"レベル([+-]\d+)される", b)
        if not mm: return None
        cnd = er._merge_cond(cond, c2) if (cond or c2) else {}
        if cnd is None: return None
        ab = {"ic": "hand", "cond": cnd, "lvd": int(mm.group(1))}
        if per is not None: ab["per"] = per
        return ab
    tgt, pred = _subject(b)
    if tgt is None: return None
    ab = {"ic": "static", "cond": er._merge_cond(cond, c2) if (cond or c2) else {}, "lim": 0, "tgt": tgt}
    if ab["cond"] is None: return None
    # 수치 조각: AP+N / LP+N / レベル+N (し、로 연결)
    nums = {}
    kws = []
    ok = True
    for piece in split_top(pred.lstrip("、"), ["、"]):
        piece = piece.strip()
        mm = re.fullmatch(r"(AP|LP|レベル)([+-]\d+)(?:する|し)?", piece)
        if mm:
            key = {"AP": "ap", "LP": "lp", "レベル": "lv"}[mm.group(1)]
            if key in nums: ok = False; break
            nums[key] = int(mm.group(2)); continue
        mm = re.fullmatch(r"(突撃(?:\[[^\]]+\])?|迅速|バレット)を持つ", piece)
        if mm:
            k = er._kw_of(mm.group(1))
            if not k: ok = False; break
            kws.append(k); continue
        mm = re.fullmatch(r"「(.+)」を持つ", piece)
        if mm:
            g = er._quoted_grant(mm.group(1))
            if isinstance(g, tuple): kws.append(g[1]); continue
            ok = False; break
        k = _kw_pred(piece)
        if k: kws.append(k); continue
        ok = False; break
    if not ok or not (nums or kws): return None
    ab.update(nums)
    if kws: ab["kw"] = " ".join(kws)
    if per: ab["per"] = per
    if per and kws: return None  # per 는 수치에만
    return ab


# ─────────────────────────── 이벤트 버스 트리거 꼬리(공통 부품) ───────────────────────────
def _subj(t):
    er = _er()
    return er._bus_subject(t)


def bus_tail(head):
    """'…とき'/'…たび' 앞부분 → (evs, spec) 또는 None"""
    er = _er(); head = head.strip()
    m = re.fullmatch(r"(.+?)がスリープ状態になった", head)
    if m:
        sp = _subj(m.group(1))
        if sp is None: return None
        sp = dict(sp)
        if isinstance(sp.get("sf"), dict) and sp["sf"].get("st") == "a": sp["sf"] = {k: v for k, v in sp["sf"].items() if k != "st"}  # '액티브→슬립' 이벤트 자체가 이전 상태를 보장
        return ["sleepEv"], sp
    m = re.fullmatch(r"(.+?)が(?:【ミスリード】|ミスリード)した", head)
    if m:
        sp = _subj(m.group(1))
        return (["mis"], dict(sp)) if sp is not None else None
    m = re.fullmatch(r"(自分|相手)がネクスト ?ヒントで(.+?)を使用した", head)
    if m:
        np_ = m.group(2)
        f = er._bus_np(np_ if re.search(r"(キャラ|イベント|カード)$", np_) else np_ + "カード", "self")
        if f is None: return None
        f.pop("own", None)
        spec = {"who": "self" if m.group(1) == "自分" else "opp", "by": "hint"}
        if {k: v for k, v in f.items() if k != "type"} or f.get("type") in ("char", "event"): spec["sf"] = {k: v for k, v in f.items() if not (k == "type" and v == "card")}
        return ["enter", "useev"], spec
    if head in ("自分のFILEエリアにあるカードを手札に加えた",): return ["fileHand"], {"who": "self"}
    m = re.fullmatch(r"(自分|相手)の現場に(.+?)が登場した", head)
    if m:
        f = er._bus_np(er.np_char(m.group(2)), "self" if m.group(1) == "自分" else "opp")
        if f is None: return None
        return ["enter"], {"who": "self" if m.group(1) == "自分" else "opp", "sf": f}
    m = re.fullmatch(r"このキャラのアクションが(.+?)によってガードされた", head)
    if m:
        f = er._bus_np(er.np_char(m.group(1)), "opp")
        if f is None: return None
        return ["guard"], {"tself": True, "sf": f}
    if head == "このキャラが指定されたアクションをガードした": return ["guard"], {"sub": "self", "dself": True}
    m = re.fullmatch(r"(.+?)がガードした", head)
    if m:
        sp = _subj(m.group(1))
        return (["guard"], dict(sp)) if sp is not None else None
    m = re.fullmatch(r"(自分|相手)の現場にいるキャラに(裏向きで)?セットされているカードが(?:1枚)?現場から離れ[たる]", head)
    if m:
        return (["fdOff"] if m.group(2) else ["setOff"]), {"hw": "self" if m.group(1) == "自分" else "opp"}
    m = re.fullmatch(r"このキャラに(.*?)カード(?:1枚)?がセットされ[たる]", head)
    if m:
        spec = {"hself": True}
        if m.group(1):
            pre = m.group(1).rstrip("の")
            f = er._bus_np(pre + "のカード", "self"); 
            if f is None: return None
            f.pop("own", None); spec["sf"] = f
        return ["setOn"], spec
    return None


# ─────────────────────────── 덱 look / reveal / search / 이동 부품 ───────────────────────────
DECKNP = r"(自分の|相手の)?デッキ"
MVDEST = {"手札に加える": "hand", "手札に加え": "hand", "登場させる": "field", "登場させ": "field"}


def _np_pick(text):
    """'特徴[探偵]のキャラ' → filter (모르면 None). 접두 '公開して' 는 호출자가 처리"""
    return _np(text)


def deck_clause(c, cx):
    er = _er()
    # 위에서 N장 보기 / 공개하기
    m = re.fullmatch(r"(?:(相手は)|(自分は))?(自分の|相手の)?デッキのカードを上から(\d+)枚(見る|公開する)", c)
    if m:
        opp = m.group(1) or m.group(3) == "相手の"
        o = {"op": "peek", "n": int(m.group(4)), "reveal": m.group(5) == "公開する"}
        if opp: o["deck"] = "opp"
        return [o]
    m = re.fullmatch(r"デッキのカードを上から(\d+)枚(見る|公開する)", c)
    if m: return [{"op": "peek", "n": int(m.group(1)), "reveal": m.group(2) == "公開する"}]
    # 상대가 사용자의 덱 (수사가 아닌 단순 열람) 은 생략
    # 나올 때까지 1장씩 공개
    m = re.fullmatch(r"自分のデッキのカードを上から(.+?)が出るまで1枚ずつ公開し、それを(手札に加える|登場させる)", c)
    if m:
        f = _np(m.group(1))
        if f is None: return None
        return [{"op": "peek", "n": 1, "until": f, "reveal": True, "cap": 60},
                {"op": "mv", "ref": "hit", "to": MVDEST[m.group(2)]}]
    # その中から … 1枚まで(公開して)手札に加える/登場させる
    m = re.fullmatch(r"その中から(.+?)(公開して)?(手札に加える|登場させる)", c)
    if m:
        body = m.group(1)
        # 「XをN枚までと、YをN枚まで」
        parts = re.findall(r"(.+?)を(\d+)枚(?:まで)?(?:と、|と|$)", body + ("" if body.endswith(("と、", "と")) else ""))
        parts = [p for p in re.split(r"(?<=枚まで)と、?|(?<=枚)と、?", body) if p]
        groups = []
        for p in parts:
            mm = re.fullmatch(r"(.+?)を(\d+)枚(?:まで)?", p)
            if not mm: return None
            fx_ = mm.group(1)
            diff = False
            if fx_.startswith("そのキャラと同じ色を持たない"):
                diff = True; fx_ = fx_[len("そのキャラと同じ色を持たない"):]
            f = _np(fx_) if fx_ != "カード" else {}
            if f is None: return None
            g = {"filter": f, "n": int(mm.group(2))}
            if diff: g["diffColor"] = True
            groups.append(g)
        if not groups or len(groups) > 3: return None
        pk = {"op": "pick", "from": "seen", "as": "chosen", "reveal": bool(m.group(2))}
        if len(groups) == 1: pk["filter"] = groups[0]["filter"]; pk["n"] = groups[0]["n"]
        else: pk["groups"] = groups
        return [pk, {"op": "mv", "ref": "chosen", "to": MVDEST[m.group(3)]}]
    # 残りを … 
    m = re.fullmatch(r"(?:残りの公開したカード|残り)を(好きな順番で)?デッキの(上|下)に移す", c)
    if m:
        o = {"op": "mv", "ref": "rest", "to": "deckTop" if m.group(2) == "上" else "deckBottom"}
        if m.group(1): o["order"] = "any"
        return [o]
    m = re.fullmatch(r"(?:残りの公開したカード|残り)を(好きな順番で)?デッキの上か下に移す", c)
    if m: return [{"op": "mv", "ref": "rest", "to": "deckTopOrBottom", "order": "any" if m.group(1) else "asis"}]
    m = re.fullmatch(r"(?:残りの公開したカード|残り)を(?:シャッフルして)?デッキの下に移し、デッキをシャッフルする", c)
    if m: return [{"op": "mv", "ref": "rest", "to": "deckBottom"}, {"op": "shuffle"}]
    if c in ("残りをリムーブエリアに移す", "残りの公開したカードをリムーブエリアに移す"): return [{"op": "mv", "ref": "rest", "to": "rem"}]
    m = re.fullmatch(r"(?:残りの公開したカード|残り)をシャッフルしてデッキの下に移す", c)
    if m: return [{"op": "mv", "ref": "rest", "to": "deckBottom", "order": "shuffle"}]
    m = re.fullmatch(r"公開したカードをシャッフルしてデッキの下に移す", c)
    if m: return [{"op": "mv", "ref": "revealed", "to": "deckBottom", "order": "shuffle"}]
    m = re.fullmatch(r"それをデッキの1番下に移してもよい", c)
    if m: return [{"op": "mv", "ref": "seen", "to": "deckBottom", "opt": True}]
    m = re.fullmatch(r"そのカードをデッキの上か下に移す", c)
    if m: return [{"op": "mv", "ref": "seen", "to": "deckTopOrBottom"}]
    m = re.fullmatch(r"好きな順番でデッキの上か下に移す", c)
    if m: return [{"op": "mv", "ref": "seen", "to": "deckTopOrBottom", "order": "any"}]
    if c == "自分のリムーブエリアにあるすべてのカードをデッキの下に移し、デッキをシャッフルする": return [{"op": "pick", "from": "rem", "as": "chosen", "all": True}, {"op": "mv", "ref": "chosen", "to": "deckBottom"}, {"op": "shuffle"}]
    return None


def deck_clause2(c, cx):
    """레지스터 문맥이 필요한 절 / 수량 참조 / 이름 지정"""
    er = _er()
    sr = cx.get("subj_reg")
    if sr:
        if c == "登場させる": return [{"op": "mv", "ref": sr, "to": "field"}]
        if c == "手札に加える": return [{"op": "mv", "ref": sr, "to": "hand"}]
        if c == "手札に加えてもよい": return [{"op": "mv", "ref": sr, "to": "hand", "opt": True}]
    m = re.fullmatch(r"その中から(.+?)を(\d+)枚(?:まで)?公開する", c)
    if m:
        f = {"nameCtx": True} if m.group(1) == "指定したカード名のカード" else _np(m.group(1))
        if f is None: return None
        return [{"op": "pick", "from": "seen", "as": "chosen", "filter": f, "n": int(m.group(2)), "reveal": True}]
    m = re.fullmatch(r"公開した(?:キャラ|カード)を(手札に加える|登場させる)", c)
    if m: return [{"op": "mv", "ref": "revealed", "to": MVDEST[m.group(1)]}]
    m = re.fullmatch(r"(?:自分の)?手札が(\d+)枚になるまで(カードを引く|手札をリムーブする)", c)
    if m: return [{"op": "handTo", "n": int(m.group(1)), "mode": "draw" if m.group(2) == "カードを引く" else "discard"}]
    if c == "カード名を1つ指定する": return [{"op": "nameSel"}]
    m = re.fullmatch(r"その中から指定したカード名のカードを(\d+)枚まで公開して手札に加える", c)
    if m: return [{"op": "pick", "from": "seen", "as": "chosen", "filter": {"nameCtx": True}, "n": int(m.group(1)), "reveal": True}, {"op": "mv", "ref": "chosen", "to": "hand"}]
    RN = {"リムーブした": "removed", "引いた": "drawn", "移した": "moved", "手札に加えた": "moved", "公開した": "revealed"}
    m = re.fullmatch(r"(リムーブした|引いた|移した|公開した|手札に加えた)(?:枚数|数)と同じ(?:枚数|数)(?:の)?カードを引く", c)
    if m: return [{"op": "draw", "n": 1, "nref": {"ref": RN[m.group(1)], "by": "count"}}]
    m = re.fullmatch(r"手札から、?(引いた|リムーブした)枚数と同じ数のカードをシャッフルしてデッキの下に移す", c)
    if m: return [{"op": "pick", "from": "hand", "as": "chosen", "n": 1, "min": 1, "nref": {"ref": RN[m.group(1)], "by": "count"}}, {"op": "mv", "ref": "chosen", "to": "deckBottom", "order": "shuffle"}]
    m = re.fullmatch(r"自分のデッキのカードを上からリムーブしたキャラのレベルと同じ枚数リムーブする", c)
    if m: return [{"op": "deckrem", "n": 1, "nref": {"ref": "removed", "by": "lv"}}]
    m = re.fullmatch(r"手札からカードを(\d+)枚まで好きな順番でデッキの下に移し、デッキをシャッフルする", c)
    if m: return [{"op": "pick", "from": "hand", "as": "chosen", "n": int(m.group(1))}, {"op": "mv", "ref": "chosen", "to": "deckBottom", "order": "any"}, {"op": "shuffle"}]
    m = re.fullmatch(r"移した枚数と同じ数のカードを引く", c)
    return None
