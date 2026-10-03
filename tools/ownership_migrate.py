#!/usr/bin/env python3
"""own(소유자) 미지정 target / 트리거 주체 필터를 카드 원문으로 분류해 명시하는 마이그레이션 도구 (v1.11.0)

    python tools/ownership_migrate.py                 # 분석만 (cards.json 은 건드리지 않음, CSV 2개만 생성)
    python tools/ownership_migrate.py --apply         # 확실한(high) 것만 cards.json 의 데이터에 own 을 써 넣는다 (그 뒤 export_cards_to_excel.py --update-ids … 로 Excel 동기화)

출력
    data/ownership_review.csv   — 확실하지 않아 자동 수정하지 않은 항목 (사람이 확인)
    data/ownership_applied.csv  — 자동으로 own 을 명시한 항목 (근거 포함, 감사용)

원칙
  · 단순히 "원문에 相手/自分 가 있다" 로 결정하지 않는다. 능력 원문(txt)에서 **그 효과의 대상 절**(…を1枚まで選び)만 떼어, 구역 단어(리무브 에리어/손패/증거 …)가 섞인 절은 제외하고,
    효과(do)에 대응하는 절을 순서대로 맞춘 뒤 소유자 표현을 읽는다.  — 이미 own 이 명시된 87개 select 와 대조해 87/87 일치(불일치 0)함을 검증했다. (그중 소유자 표현이 없는 것은 소수 — 나머지 any 는 룰북 p.22 에 근거)
  · 소유자 표현이 없는 「キャラを～枚まで選び」: 공식 룰북 p.22 에 따라 any(양쪽 현장). 효과 종류(리무브/AP+/키워드 …)로 구분하지 않는다.
  · 대상 절을 기계적으로 대응시키지 못한 것은 원문을 직접 읽어 MANUAL_SEL 에 근거와 함께 기록한다.
  · 절을 확실히 대응시킬 수 없으면(코스트형/2택/절 개수 불일치 …) 자동으로 정하지 않는다(→ review).
"""
import argparse, csv, json, re, sys, collections
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards_xlsx as X  # noqa: E402

ROOT = X.ROOT
PICKW = re.compile(r'選(?:び|ぶ|んで)')
OPTC = re.compile(r'([^、。：:\n・「」]*?)を[0-9０-９]+枚(?:まで)?[^、。：:\n]*?(?:させて|リムーブして|移して|アクティブにして|捨てて)もよい')
ZONE = re.compile(r'リムーブエリア|手札|デッキ|FILE|ファイル|パートナーエリア|証拠|セットされ|カットイン|裏向き|発見|公開|ネクストヒント')
VERBS = [('deckTopOrBottom', r'デッキの上か下'), ('deckBottom', r'デッキの下'), ('deckTop', r'デッキの上'), ('remove', r'リムーブ'), ('sleep', r'スリープ(?:させ|状態に)'),
         ('stun', r'スタンさせ'), ('active', r'アクティブに'), ('ap', r'AP[+＋\-－]'), ('lp', r'LP[+＋\-－]'), ('lpBase', r'元のLP'),
         ('kw', r'与え|を持つ|突撃|迅速|バレット'), ('hand', r'手札に'), ('lv', r'レベル[+＋\-－]')]


def prep(t):
    for _ in range(3): t = re.sub(r'\([^()]*\)|（[^（）]*）', '', t)
    return re.sub(r'【[^】]*】', '', t)


def first_verb(rest):
    best = None
    for d, p in VERBS:
        m = re.search(p, rest)
        if m and (best is None or m.start() < best[0]): best = (m.start(), d)
    return best[1] if best else None


CRIT = re.compile(r'(?:のレベルの合計以下の|のレベル以下のレベルの|のレベル以上のレベルの|以下のレベルの|以上のレベルの|のいずれかと同じレベルの|と同じレベルの|と同じAPの|と同じカード名の)')


def core(seg):
    """'発見されたカードのレベル以下のレベルの' 같은 기준 표현은 대상 소유자/구역과 무관하므로 잘라낸다"""
    return CRIT.split(seg)[-1]


def clauses(txt):
    txt = prep(txt); out = []
    for m in OPTC.finditer(txt):
        rest = txt[m.start():].split('。')[0]
        out.append((m.start(), m.group(1), first_verb(rest[len(m.group(1)):])))
    for m in PICKW.finditer(txt):
        head = txt[:m.start()]; k = max(head.rfind(c) for c in '、。：:\n・「」'); seg = head[k + 1:]
        if re.search(r'以下から|ものから|のうち', seg) or txt[m.start():m.start() + 8].startswith('選んで行') or not seg.strip(): continue
        out.append((m.start(), seg, first_verb(txt[m.end():].split('。')[0])))
    out.sort(); return out


def owner_of(seg):
    opp = bool(re.search(r'相手の|相手が|相手は', seg)); me = bool(re.search(r'自分の|自分が|自分は|自分と', seg))
    if re.search(r'お互い|両方|自分と相手|相手と自分|持ち主', seg): return 'any', '互い/両方/持ち主'
    if opp and me: return None, '相手/自分 혼재'
    if opp: return 'opp', '相手の'
    if me: return 'self', '自分の'
    return 'any', 'owner-free'


def eff_do(o):
    if o['op'] == 'selLvSum': return 'remove'   # selLvSum 은 레벨 합계 조건의 리무브 select
    if o.get('do'): return o['do']
    a = o.get('acts')
    return a[0].get('do') if isinstance(a, list) and a and isinstance(a[0], dict) else None


def walk_ops(x, path=()):
    """x 안의 모든 op 딕셔너리를 (경로, op) 로 돌려준다"""
    if isinstance(x, dict):
        if 'ic' in x and isinstance(x.get('ic'), str) and path and path[-1] != 'ops': return   # 부여(grant)된 중첩 능력은 별도로 처리
        if 'op' in x and isinstance(x.get('op'), str): yield path, x
        for k, v in x.items():
            if k in ('filter', 'filters', 'cond', 'cost'): continue
            yield from walk_ops(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x): yield from walk_ops(v, path + (i,))


# 대상 절을 기계적으로 대응시키지 못했지만(2택/목록/세트 카드 등) 원문을 직접 읽어 확정한 select — (card_id, op_path) → (own, 근거)
RULE22 = '공식 룰북 p.22 — 원문 대상 절에 自分の/相手の 없음(양쪽 현장 선택 가능)'
MANUAL_SEL = {
    ('id_0189', 'ops.0'): ('any', RULE22 + ': 「カードがセットされているキャラを1枚まで選び、アクティブにする」'),
    ('id_0466', 'ops.0.opts.1.ops.0'): ('any', RULE22 + ': 「LP0の特徴[警察]のキャラを1枚まで選び、…LP+1するか、…AP+2000する」'),
    ('id_0531', 'ops.0.opts.1.ops.0'): ('any', RULE22 + ': 「レベル8以下の【緑】のキャラを1枚まで選び、アクティブにするか、…突撃を与える」'),
    ('id_0681', 'ops.0.opts.1.ops.0'): ('any', RULE22 + ': 「特徴[YAIBA]のキャラを1枚まで選び、アクティブにするか、…突撃を与える」'),
    ('id_0688', 'ops.0'): ('any', RULE22 + ': 「特徴[警察]のキャラを1枚まで選び、…「このキャラは相手の現場にいる…」を与える」(相手の は 부여되는 능력 내부)'),
    ('id_0783', 'ops.0.ops.2'): ('any', RULE22 + ': 「【白】のキャラを1枚まで選び、…「このキャラは相手の現場にいる…」を与える」(相手の は 부여되는 능력 내부)'),
    ('id_0783', 'ops.0.else.0.opts.2.ops.0'): ('any', RULE22 + ': 「【白】のキャラを1枚まで選び、…を与える」'),
    ('id_0964', 'ops.1.ops.1.ops.0'): ('any', RULE22 + ': 「キャラが5枚登場した場合、キャラを1枚まで選び、リムーブする」(앞 절의 自分の は 리무브 에리어 풀/登場 효과의 것)'),
}


def classify_select(o, group, txt, fx=''):
    f0 = o.get('filter') if isinstance(o.get('filter'), dict) else {}
    if f0.get('contacting') or f0.get('acting'):
        return 'any', 'high', '대상이 コンタクト中/アクション中 의 카드로 참조 지정됨(원문 "そのキャラ") — 소유자는 참조가 정함'
    cl = [c for c in clauses(txt) if not ZONE.search(core(c[1]))]
    d = eff_do(o); cand = [c for c in cl if c[2] == d]; same = [g for g in group if eff_do(g) == d]
    if not cand and fx:   # 능력 원문에 절이 없으면(2택 목록 등) 카드 전체 원문에서 같은 효과의 절이 하나뿐일 때만 사용
        cl2 = [c for c in clauses(fx) if not ZONE.search(core(c[1]))]; c2 = [c for c in cl2 if c[2] == d]
        if len(c2) == 1 and len(same) == 1: cand = c2
    if not cand: return None, 'low', f'원문에서 이 효과(do={d})에 대응하는 대상 절을 찾지 못함(코스트형/2택/목록형 등)'
    if len(cand) != len(same):
        ow = set(owner_of(c[1])[0] for c in cand)
        if len(ow) == 1 and None not in ow: seg = cand[0][1]
        else: return None, 'low', f'대상 절 {len(cand)}개 ≠ select {len(same)}개 — 대응 불확실'
    else: seg = cand[[id(g) for g in same].index(id(o))][1]
    own, why = owner_of(seg)
    if own is None: return None, 'low', why
    if own == 'any' and why == 'owner-free':   # 공식 룰북 p.22: 소유자 지정이 없는 「キャラを～枚まで選び」는 양쪽 현장 모두 선택 가능 — 효과 종류(do)와 무관
        return 'any', 'high', f'공식 룰북 p.22 — 대상 절에 自分の/相手の 없음(「キャラを～枚まで選び」는 지정이 없으면 양쪽 현장): …{seg[-22:]}'
    return own, 'high', f'원문 대상 절 "{why}": …{seg[-22:]}'


def nested_abs(x, path=()):
    """능력 안에 중첩된 능력(grant 의 g, 효과가 부여하는 g)을 (경로, ab) 로 돌려준다"""
    if isinstance(x, dict):
        for k, v in x.items():
            if k in ('filter', 'filters', 'cond', 'cost'): continue
            if isinstance(v, dict) and isinstance(v.get('ic'), str): yield path + (k,), v
            else: yield from nested_abs(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x): yield from nested_abs(v, path + (i,))


def set_own(o, key, own):
    f = o.get(key)
    if not isinstance(f, dict): f = {}; o[key] = f
    f['own'] = own


def run(db, apply=False):
    cards = db['cards']; applied, review = [], []
    stats = collections.Counter()
    def rec(lst, cid, c, ai, path, op, cur, sug, reason, conf, ab):
        top = next((p for p in path if isinstance(p, int)), '')
        lst.append(dict(card_id=cid, card_name=c.get('n', ''), ability_index=ai, op_index=top, op_path='.'.join(map(str, path)) if path else '', op=op,
                        current_own=cur or '', suggested_own=sug or '', fx=c.get('fx', ''), extra=c.get('extra', ''), ab_txt=ab.get('txt', ''), reason=reason, confidence=conf))
    def do_ab(cid, c, ai, ab, base_path, txt_default):
        pre = tuple(base_path); abtxt = ab.get('txt') or txt_default
        ops = [(pre + p, o) for p, o in walk_ops(ab.get('ops') or [], ('ops',))]
        sels = [(p, o) for p, o in ops if o['op'] in ('select', 'selLvSum')]
        grp = [o for _, o in sels]
        for p, o in sels:
            f = o.get('filter') if isinstance(o.get('filter'), dict) else {}
            if f.get('own') in ('self', 'opp', 'any'): continue
            own, conf, why = classify_select(o, grp, abtxt, c.get('fx', ''))
            if own is None and (cid, '.'.join(map(str, p))) in MANUAL_SEL: own, why = MANUAL_SEL[(cid, '.'.join(map(str, p)))]; conf = 'high'
            stats['select ' + conf] += 1
            if conf == 'high':
                if apply: set_own(o, 'filter', own)
                rec(applied, cid, c, ai, p, o['op'], '', own, why, conf, ab)
            else: rec(review, cid, c, ai, p, o['op'], '', '', why, conf, ab)
        # ── select 외 target 필터 (op 의 구조/원문으로 확정되는 것만)
        for p, o in ops:
            f = o.get('filter') if isinstance(o.get('filter'), dict) else {}
            if f.get('own') in ('self', 'opp', 'any') or o['op'] in ('select', 'selLvSum'): continue
            t = abtxt
            if o['op'] == 'bottomSame':
                why = '이 op 는 상대 현장의 캐릭터를 대상으로 하는 효과(원문 "相手の現場にいる…")' if '相手の現場' in t else None
                if why:
                    if apply: set_own(o, 'filter', 'opp')
                    rec(applied, cid, c, ai, p, o['op'], '', 'opp', why, 'high', ab); stats['bottomSame'] += 1
                else: rec(review, cid, c, ai, p, o['op'], '', '', '원문에서 소유자 근거 없음', 'low', ab)
            elif o['op'] == 'setDeck' and '持ち主' in t:
                if apply: set_own(o, 'filter', 'any')
                rec(applied, cid, c, ai, p, o['op'], '', 'any', '원문 "持ち主のデッキ" — 대상 캐릭터가 어느 쪽이든 그 소유자의 덱', 'high', ab); stats['setDeck'] += 1
            elif o['op'] in ('flashFlipped', 'flashPickOne'):
                if ('コストによって' in t or '自分の裏向きの証拠' in t):
                    if apply: set_own(o, 'filter', 'self')
                    rec(applied, cid, c, ai, p, o['op'], '', 'self', '표향으로 만든 것은 자신의 증거(원문: 자신의 증거 / 이 능력의 코스트로 표향)', 'high', ab); stats[o['op']] += 1
                else: rec(review, cid, c, ai, p, o['op'], '', '', '증거 소유자 근거 불명', 'low', ab)
        # ── 트리거 주체(sf / ef / tf)
        ic = ab.get('ic'); t = abtxt
        for key in ('sf', 'ef', 'tf'):
            f = ab.get(key)
            if not isinstance(f, dict) or f.get('own') in ('self', 'opp', 'any'): continue
            own = why = None
            if f.get('self'): own, why = 'self', '주체가 이 카드 자신(self:true) — 소유자는 자기 자신'
            elif key == 'sf':
                who = ab.get('who')
                if who in ('self', 'opp'): own, why = who, f'트리거의 who={who}(원문이 정한 행동 주체)와 동일한 쪽'
                elif ('自分' in t or 'このキャラ' in t): own, why = 'self', '원문 "自分の現場/このキャラ" — 주체가 자기 쪽'
            elif key == 'ef':
                if ic in ('onally', 'onallycontact', 'onallykill', 'onallyremoved') and '自分の現場' in t: own, why = 'self', 'ally 계열 트리거 + 원문 "自分の現場にいる…" (아군 대상)'
                elif ic == 'oncontact': own, why = 'opp', '코난 TCG 규칙상 コンタクト 상대는 항상 상대 캐릭터(원문 "…キャラとコンタクトしたとき")'
                elif ic in ('onchosen', 'onremleave') and '自分の' in t: own, why = 'self', '원문 "自分の現場/リムーブエリアにある…"'
            elif key == 'tf' and ab.get('evs') == ['cutin']: own, why = 'self', '구조: 컷인 이벤트의 tid 는 항상 컷인한 쪽(my)의 컨택트 캐릭터(server.js cont) — 같은 형태의 id_0241/id_1140 도 tf.own=self'
            if own:
                if apply: f['own'] = own
                rec(applied, cid, c, ai, pre + (key,), f'{ic}.{key}', '', own, why, 'high', ab); stats['subject ' + key] += 1
            else: rec(review, cid, c, ai, pre + (key,), f'{ic}.{key}', '', '', '트리거 주체의 소유자를 원문/구조로 확정하지 못함 — 현재는 제한 없이(permissive) 동작 + 경고', 'low', ab); stats['subject review'] += 1

    for cid, c in cards.items():
        for ai, ab in enumerate(c.get('ab') or []):
            todo = [((), ab)] + [(p, g) for p, g in nested_abs(ab)]
            for p, a2 in todo: do_ab(cid, c, ai, a2, p, ab.get('txt', ''))
    return applied, review, stats


COLS = ['card_id', 'card_name', 'ability_index', 'op_index', 'op_path', 'op', 'current_own', 'suggested_own', 'fx', 'extra', 'ab_txt', 'reason', 'confidence']


def write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=COLS); w.writeheader(); w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--apply', action='store_true'); ap.add_argument('--json', default=str(ROOT / 'data' / 'cards.json'))
    ap.add_argument('--outdir', default=str(ROOT / 'data')); a = ap.parse_args()
    db = X.load_json(a.json)
    applied, review, stats = run(db, a.apply)
    write_csv(Path(a.outdir) / 'ownership_applied.csv', applied); write_csv(Path(a.outdir) / 'ownership_review.csv', review)
    print('자동 확정(high):', len(applied), ' / 사람 확인 필요(review):', len(review)); print(dict(stats))
    if a.apply:
        open(a.json, 'w', encoding='utf-8').write(X.dumps(db)); print('cards.json 갱신:', len({r['card_id'] for r in applied}), '장')
        print('변경 카드 ID (Excel 동기화용):', ','.join(sorted({r['card_id'] for r in applied}))[:80], '…')


if __name__ == '__main__':
    main()
