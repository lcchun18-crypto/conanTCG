// v1.11.0: ownership(소유자) 문맥 분리 회귀 테스트
//   own 이 비어 있을 때의 의미는 문맥(cost / condition / target / conditionCheck / zonePick / triggerSubject / staticTarget)마다 다르다.
//   · 굵은 조건/코스트: 미지정 = 자기 쪽(self)      · 실제 효과 target: 데이터의 own 그대로(op 이름으로 추측하지 않음)
//   · if/ifLeft/ifCost/ifSelf: 이미 정해진 카드를 검사 → 소유자 제한 없음   · 구역 pick/fetch/play…: 풀의 소유자는 구역이 정함
//   · 트리거 주체/상시 능력 대상: 데이터의 own, 쪽은 who/sel 이 정함
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, hand, rem, fillFile, pump, req, auto, S, FX } = U; const H = require('./helpers');
const SIM = require('../bot/simulate.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const clean = ab => FX.cleanAb([ab])[0];
const BS = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };

// ───────── A. 정리 단계(cleanAb): 문맥별 미지정 처리 ─────────
{ const c = clean({ ic: 'declare', cond: { fh: { type: 'char' }, fhN: 1 }, cost: [{ c: 'fieldBottom', n: 1, filter: {} }, { c: 'sleepAny', n: 1, filter: { trait: 'X' } }],
    ops: [{ op: 'select', n: 1, do: 'remove', filter: { lvMax: 5 } }] });
  ok(c.cond.fh.own === 'self', '굵은 조건(cond) own 미지정 → self');
  ok(c.cost.every(k => k.filter.own === 'self'), '굵은 코스트(cost) own 미지정 → self');
  ok(c.ops[0].filter.own === '' && FX.auditOwn([{ ic: 'declare', ops: [{ op: 'select', n: 1, do: 'remove', filter: { lvMax: 5 } }] }]).length === 1,
    '실제 target 미지정은 코스트 기본값을 물려받지 않음: 끝까지 확정 못한 것은 제한 없이(permissive) 처리되고 검증(audit)에 잡힘'); }
{ const mk = o => clean({ ic: 'declare', ops: [{ op: 'select', n: 1, do: o, filter: { own: 'any' } }] }).ops[0].filter.own;
  ok(['remove', 'sleep', 'stun', 'ap', 'hand'].every(d => mk(d) === 'any'), '명시 any 는 효과 종류와 무관하게 유지'); }
{ const un = d => clean({ ic: 'declare', ops: [{ op: 'select', n: 1, do: d, filter: {} }] }).ops[0].filter.own;
  ok(new Set(['remove', 'sleep', 'stun', 'ap', 'hand', 'deckBottom'].map(un)).size === 1, 'op 이름(do)으로 own 을 추측하지 않음 — remove/sleep/stun/ap/hand/deckBottom 미지정이 모두 같은 결과'); }
{ for (const own of ['self', 'opp', 'any']) {
    const c = clean({ ic: 'declare', cond: { fh: { own } }, cost: [{ c: 'fieldBottom', n: 1, filter: { own } }], ops: [{ op: 'select', n: 1, do: 'sleep', filter: { own } }] });
    ok(c.cond.fh.own === own && c.cost[0].filter.own === own && c.ops[0].filter.own === own, `명시 own:${own} → cond/cost/target 모두 그대로`); } }
{ const c = clean({ ic: 'onplay', ops: [{ op: 'if', c: 'reg', ref: 'sel', filters: [{ lvMax: 6 }], ops: [] }, { op: 'ifLeft', ref: 'sel', filter: { st: 's' }, ops: [] }, { op: 'pick', from: 'rem', own: 'opp', filter: { type: 'char' }, n: 1 },
    { op: 'fetch', from: 'rem', filter: { type: 'char' } }, { op: 'play', from: 'hand', filter: { type: 'char' } }, { op: 'ifCost', k: 'rem', filter: {} }] });
  ok(c.ops[0].filters[0].own === '' && c.ops[1].filter.own === '' && c.ops[5].filter.own === '', 'if / ifLeft / ifCost(참조 검사): own 미지정 = 소유자 제한 없음 (기존 카드가 기본값 때문에 탈락하지 않음)');
  ok(c.ops[2].own === 'opp' && c.ops[2].filter.own === '' && c.ops[3].filter.own === '' && c.ops[4].filter.own === '', 'pick: 구역 소유자(pick.own)와 카드 필터(filter.own)가 분리 — 필터는 기본값 없음. fetch/play 도 구역 풀'); }
{ const c = clean({ ic: 'ontrig', evs: ['enter'], who: 'opp', sf: { type: 'char', own: 'opp' }, ops: [] }), c2 = clean({ ic: 'ontrig', evs: ['enter'], who: 'self', sf: { type: 'char', own: 'self' }, ops: [] });
  ok(c.sf.own === 'opp' && c2.sf.own === 'self', '트리거 주체 sf: 명시 opp / self 유지');
  const st = clean({ ic: 'static', tgt: { sel: 'opp', filter: { st: 'x' } }, ap: 0 }); ok(st.tgt.filter.own === '', '상시 능력 대상: 쪽은 tgt.sel 이 정함 → 필터 own 기본값 없음');
  ok(FX.auditOwn([{ ic: 'ontrig', evs: ['enter'], sf: { type: 'char' }, ops: [] }]).length === 1, '주체 필터 own 미지정은 검증(audit)에 잡힘'); }

// ───────── B. 실제 진행: 굵은 코스트 = self, 같은 카드의 실제 효과 = 데이터가 정한 범위 ─────────
const DECL = (cost, ops, extra = {}) => ({ n: 'DECL', type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1', ab: [{ ic: 'declare', cost, ops, ...extra }] });
const setup = (card, own = ['M1'], opp = ['O1', 'O2'], defs = {}) => { const R = G({ D: card, M1: dummy('M1', { lv: '2' }), M2: dummy('M2', { lv: '3' }), O1: dummy('O1', { lv: '2' }), O2: dummy('O2', { lv: '4' }), ...defs }, ['D', 'M1', 'M2'], ['O1', 'O2']);
  fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, d = field(R, s, 'D'), M = own.map(k => field(R, s, k)), O = opp.map(k => field(R, o, k)); return { R, s, o, d, M, O }; };
const declare = (R, s, id, i = 0) => { const e = H.act(R, s, { a: 'ability', id, i }); if (e) throw new Error('declare: ' + e); pump(R); };
{ // 【캐릭터 1개를 덱 밑으로 돌린다】: 캐릭터 1개를 리무브한다  — 비용은 내 캐릭터만, 효과는 양쪽(any)
  const { R, s, d, M, O } = setup(DECL([{ c: 'fieldBottom', n: 1, filter: {} }], [{ op: 'select', n: 1, do: 'remove', filter: { own: 'any' } }]));
  declare(R, s, d); const q = req(R);
  ok(q && q.kind === 'pick' && q.sel.every(id => R.cards[id].o === s) && q.sel.includes(M[0]) && !O.some(x => q.sel.includes(x)), `굵은 비용(덱 밑으로): 내 캐릭터만 후보 (${q && JSON.stringify(q.sel)})`);
  ok(S.view(R, s).eff.sel.every(id => R.cards[id].o === s), 'UI(view) 가 받는 비용 후보에도 상대 카드가 없음 → 하이라이트/클릭 불가');
  const bad = H.act(R, s, { a: 'ans', v: [O[0]] }); ok(typeof bad === 'string' && /선택할 수 없는/.test(bad), `서버: 상대 카드를 비용으로 직접 보내면 거부 (${bad})`);
  const mv = SIM.genMoves(R, () => 0); ok(mv.length > 0 && mv.every(m => (m.m.v || []).every(id => q.sel.includes(id))), `봇 합법 행동 생성: 모든 후보가 비용 후보 안 (${mv.length}개)`);
  const rb = require('../bot/rulebot.js').choose(R, s); ok(rb && rb.mv && rb.mv.m && (rb.mv.m.v || []).every(id => q.sel.includes(id)), '규칙 봇의 선택도 비용 후보 안');
  ok(!H.act(R, s, { a: 'ans', v: [M[0]] }), '내 캐릭터로 비용 지불 OK'); pump(R); const q2 = req(R);
  ok(q2 && q2.kind === 'pick' && O.every(x => q2.sel.includes(x)) && q2.sel.includes(d), `같은 카드의 실제 효과(own:any): 상대 캐릭터도 후보 (${q2 && JSON.stringify(q2.sel)})`);
  const mv2 = SIM.genMoves(R, () => 0); ok(mv2.some(m => (m.m.v || []).some(id => O.includes(id))), '봇도 실제 효과에서는 상대 캐릭터를 고를 수 있음');
  ok(!H.act(R, s, { a: 'ans', v: [O[1]] }), '상대 캐릭터를 리무브'); pump(R); ok(!R.P[1 - s].field.includes(O[1]) && R.P[1 - s].rem.includes(O[1]), '상대 캐릭터 리무브 처리됨'); }
{ for (const [own, label, pick] of [['self', '명시 self', x => x.every(id => id.o === 's')], ['opp', '명시 opp', x => x.every(id => id.o === 'o')], ['any', '명시 any', x => x.some(id => id.o === 's') && x.some(id => id.o === 'o')]]) {
    const { R, s, d, M, O } = setup(DECL([{ c: 'sleepSelf' }], [{ op: 'select', n: 1, do: 'sleep', filter: { own } }])); declare(R, s, d); const q = req(R);
    const tag = q.sel.map(id => ({ o: R.cards[id].o === s ? 's' : 'o' })); ok(pick(tag), `실제 효과 target ${label} → 후보 ${JSON.stringify(q.sel)}`); } }
{ // 코스트에서 [상대] 를 명시 → 상대 쪽, any 명시 → 양쪽
  for (const [own, expect] of [['opp', x => x.every(id => id.o === 'o') && x.length === 2], ['any', x => x.some(id => id.o === 's') && x.some(id => id.o === 'o')]]) {
    const { R, s, d } = setup(DECL([{ c: 'fieldBottom', n: 1, filter: { own } }], [{ op: 'self', do: 'ap', v: '1000', until: 'turn' }])); declare(R, s, d); const q = req(R);
    ok(expect(q.sel.map(id => ({ o: R.cards[id].o === s ? 's' : 'o' }))), `굵은 비용 명시 own:${own} → 그 범위 (${JSON.stringify(q.sel)})`); } }
{ // 굵은 조건(cond) 미지정 = self: 조건 대상이 상대 현장에만 있으면 선언 불가
  const card = DECL([{ c: 'sleepSelf' }], [{ op: 'self', do: 'ap', v: '1000', until: 'turn' }], { cond: { fh: { name: 'O1' }, fhN: 1 } });
  { const { R, s, d } = setup(card, ['M1'], ['O1']); ok(!!FX.declareCheck(R, s, d, 0), '굵은 조건(미지정): 조건 카드가 상대 현장에만 있으면 발동 불가'); }
  { const { R, s, d } = setup({ ...card, ab: [{ ...card.ab[0], cond: { fh: { name: 'M1' }, fhN: 1 } }] }, ['M1'], ['O1']); ok(!FX.declareCheck(R, s, d, 0), '굵은 조건(미지정): 내 현장에 있으면 발동 가능'); }
  { const { R, s, d } = setup({ ...card, ab: [{ ...card.ab[0], cond: { fh: { name: 'O1', own: 'opp' }, fhN: 1 } }] }, ['M1'], ['O1']); ok(!FX.declareCheck(R, s, d, 0), '굵은 조건 명시 opp: 상대 현장에 있으면 발동 가능'); } }

// ───────── C. 실제 카드: id_0808 / id_0909 (한 카드 안에서 문맥별로 다른 소유자) ─────────
{ const R = G({ H: real('id_0808', { color: 'yellow' }), M1: dummy('M1', { lv: '5', trait: '警視庁' }), O1: dummy('O1', { lv: '6' }) }, ['H', 'M1'], ['O1'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, h = field(R, s, 'H'), m = field(R, s, 'M1'), o = field(R, 1 - s, 'O1'); R.P[s].partner && (R.cards[R.P[s].partner].color = 'yellow');
  const ab = R.defs[R.cards[h].d].ab[1]; ok(ab.cost.find(c => c.c === 'fieldBottom').filter.own === 'self' && ab.ops[0].filter.own === 'any', 'id_0808: 덱 아래 비용 = self(굵은 비용 미지정), 리무브 대상 = any(데이터 명시)'); }
{ const R = G({ H: real('id_0909') }, ['H'], ['H'], BS); const defs = Object.values(R.defs).find(x => x.n === '佐藤美和子'); const ab = defs.ab[0];
  ok(ab.ops[0].cond.fa.own === 'self' && ab.ops[0].ops[0].filter.own === 'any', 'id_0909: 굵은 조건/ifc = self, 실제 효과 select = any (한 카드 안에서 문맥별로 다름)'); }

// ───────── D. if / ifLeft 는 이미 정해진 카드를 검사 (소유자 기본값으로 탈락하지 않음) ─────────
{ // select 로 상대 캐릭터를 리무브 → ifLeft 로 "떠났는지" 검사 (필터에 own 없음)
  const card = { n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, do: 'remove', filter: { own: 'opp', lvMax: 9 } }, { op: 'ifLeft', ref: 'sel', filter: { st: 'a' }, ops: [{ op: 'draw', n: 1, who: 'self' }] }] }] };
  const R = G({ EV: card, O1: dummy('O1', { lv: '2' }) }, ['EV', 'O1'], ['EV', 'O1']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, e = hand(R, s, 'EV'), c = field(R, o, 'O1'); const hn = R.P[s].hand.length;
  U.play(R, s, e); pump(R); ok(req(R) && req(R).kind === 'pick' && req(R).sel.includes(c), '상대 캐릭터 select'); U.ans(R, [c]); pump(R);
  ok(!R.P[o].field.includes(c) && R.P[s].hand.length === hn - 1 + 1, `ifLeft: 떠난 상대 카드를 소유자 기본값 없이 검사 → 효과 발동(드로우) (손패 ${R.P[s].hand.length})`); }
{ for (const [lv, want] of [['7', 8000], ['8', 5000]]) { // id_0886: if 가 상대 ref 를 정상 검사
    const R = G({ C: real('id_0886'), D: dummy('D', { lv, ap: '3000', lp: '2' }) }, ['C', 'D'], ['C', 'D']); fillFile(R, 0, 6); fillFile(R, 1, 6);
    const s = R.turn, o = 1 - s, c = field(R, s, 'C'), d = field(R, o, 'D'); R.cards[d].st = 's'; U.attack(R, c, d); pump(R); ok(S.ap(R, c) === want, `id_0886: if 가 상대 캐릭터(Lv${lv}→${+lv - 1})를 검사 → AP ${S.ap(R, c)}`); } }

// ───────── E. pick: 구역 소유자(pick.own)와 카드 필터(filter.own)는 별개 ─────────
{ const mk = (pown, filt) => ({ n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'pick', from: 'rem', own: pown, filter: filt, n: 1, min: 0, as: 'chosen', msg: 'pick' }] }] });
  const run = (pown, filt) => { const R = G({ EV: mk(pown, filt), A: dummy('A'), B: dummy('B') }, ['EV', 'A'], ['EV', 'B']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, e = hand(R, s, 'EV'), a = rem(R, s, 'A'), b = rem(R, o, 'B'); U.play(R, s, e); pump(R); return { q: req(R), a, b }; };
  { const { q, a, b } = run('opp', { type: 'char' }); ok(q && q.sel.includes(b) && !q.sel.includes(a), 'pick.own=opp: 상대 리무브 구역에서 고름 — 필터 own 미지정이어도 후보가 사라지지 않음'); }
  { const { q, a, b } = run('self', { type: 'char' }); ok(q && q.sel.includes(a) && !q.sel.includes(b), 'pick.own=self: 내 리무브 구역에서 고름'); }
  { const { q, a, b } = run('opp', { type: 'char', own: 'self' }); ok(!q || !q.sel.length || !q.sel.includes(b), '구역(상대)과 필터(own:self)는 별개 — 명시한 필터 own 은 구역 안에서 다시 거름(결과 없음)'); } }

// ───────── F. 트리거 주체: 상대/자기 ─────────
const TRG = (who, sfOwn) => ({ n: 'TRG', type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1', ab: [{ ic: 'ontrig', evs: ['enter'], who, sf: { type: 'char', own: sfOwn }, ops: [{ op: 'self', do: 'ap', v: '2000', until: 'turn' }] }] });
{ for (const [who, sfOwn, enterSide, want] of [['opp', 'opp', 'opp', 8000], ['opp', 'opp', 'self', 6000], ['self', 'self', 'self', 8000], ['self', 'self', 'opp', 6000]]) {
    const R = G({ T: TRG(who, sfOwn), X: dummy('X') }, ['T', 'X'], ['T', 'X']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, t = field(R, s, 'T'); R.cards[t].bAp = 6000; const side = enterSide === 'opp' ? o : s, x = field(R, side, 'X');
    FX.bus(R, 'enter', { s: side, ent: x }); pump(R); ok(S.ap(R, t) === want, `트리거 주체 who=${who}/own=${sfOwn}, ${enterSide === 'opp' ? '상대' : '내'} 캐릭터 등장 → AP ${S.ap(R, t)} (기대 ${want})`); } }
{ // 실제 카드: id_0756 (상대 현장에 Lv8 캐릭터가 등장했을 때) — 이전엔 주체 필터 기본 self 때문에 발동하지 않던 카드
  const R = G({ T: real('id_0756'), X: dummy('X', { lv: '8' }) }, ['T', 'X'], ['T', 'X'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s; R.turn = o; const t = field(R, 1 - o, 'T'), x = field(R, o, 'X');
  const ab = R.defs[R.cards[t].d].ab.find(a => a.ic === 'ontrig'); ok(ab && ab.who === 'opp' && ab.sf.own === 'opp', 'id_0756: 상대 캐릭터 등장 트리거의 주체 필터가 own:opp 로 명시됨');
  FX.bus(R, 'enter', { s: o, ent: x }); pump(R); ok(R.eff && R.eff.req && R.eff.req.kind === 'yn', 'id_0756: 상대 Lv8 캐릭터 등장 → 드로우 확인 질의 발생 (이전 버전에서는 발동하지 않음)'); }
{ // 실제 카드: id_0396 — 이 캐릭터가 Lv6 이하 캐릭터와 컨택트했을 때 그 캐릭터를 리무브 (컨택트 상대는 항상 상대 캐릭터)
  const R = G({ C: real('id_0396'), D: dummy('D', { lv: '5', ap: '1000', lp: '2' }) }, ['C', 'D'], ['C', 'D'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'C'), d = field(R, o, 'D'); R.cards[d].st = 's'; const ab = R.defs[R.cards[c].d].ab.find(a => a.ic === 'oncontact'); ok(ab && ab.ef.own === 'opp', 'id_0396: 컨택트 상대 필터 own:opp 명시');
  U.attack(R, c, d); U.finishContact(R); ok(!R.P[o].field.includes(d), `id_0396: Lv5 상대 캐릭터와 컨택트 → 리무브됨 (상대 현장 ${R.P[o].field.length}장)`); }
{ // 상시 능력 대상(staticTarget): sel:opp 인데 필터 own 이 비어 있어도 상대 캐릭터에 적용 — id_0290
  const R = G({ C: real('id_0290'), D: dummy('D', { ap: '3000' }) }, ['C', 'D'], ['C', 'D'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'C'), d = field(R, o, 'D'); R.cards[d].sets = [R.P[o].deck[0]]; R.P[o].deck.shift(); pump(R); const a1 = S.ap(R, d); ok(a1 === 2000, `id_0290: 카드가 세트된 상대 캐릭터 AP-1000 (AP ${a1})`); }
{ // 구역 풀 op: paRemove(상대 파트너 에리어) — 필터가 비어 있어도 후보가 사라지지 않음 (id_1149)
  const card = { n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'paRemove', filter: {} }] }] };
  const R = G({ EV: card, X: dummy('X') }, ['EV'], ['X']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, e = hand(R, s, 'EV'); const x = U.pa(R, o, 'X'); U.play(R, s, e); pump(R);
  ok(req(R) && req(R).sel.includes(x), 'paRemove: 상대 파트너 에리어 카드가 후보에 있음 (구역 풀 — 소유자 기본값 없음)'); }

// ───────── G. 데이터/검증 ─────────
{ const fs = require('fs'), path = require('path'); const db = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
  let un = 0; for (const [id, c] of Object.entries(db)) un += FX.auditOwn(c.ab || []).length;
  const text = fs.readFileSync(path.join(__dirname, '../data/ownership_review.csv'), 'utf8').replace(/^\uFEFF/, ''); let rows = 0, inq = false;   // 따옴표 안의 줄바꿈은 행으로 세지 않는다
  for (let i = 0; i < text.length; i++) { const ch = text[i]; if (ch === '"') inq = !inq; else if (ch === '\n' && !inq) rows++; } const csv = rows - 1;
  ok(un === csv, `own 미지정으로 남은 target/주체 필터(${un}) = ownership_review.csv 항목(${csv}) — 목록에 없는 미확정 데이터가 없음`); }

// ───────── H. 최종 확정(v1.11.0): 미확정 0 · 룰북 p.22 · fallback · cost scope:any 는 그대로 ─────────
{ const fs = require('fs'), path = require('path'); const db = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
  const sel = (id, ai, p) => { let x = db[id].ab[ai]; for (const k of p) x = x[k]; return x; };
  ok(sel('id_0189', 1, ['ops', 0]).filter.own === 'any' && sel('id_0964', 0, ['ops', 1, 'ops', 1, 'ops', 0]).filter.own === 'any' && sel('id_0688', 2, ['ops', 0]).filter.own === 'any',
    '룰북 p.22: 소유자 표현이 없는 「キャラを～枚まで選び」는 효과 종류(AP+/키워드/액티브/리무브)와 무관하게 any — id_0189/0688/0964');
  ok(db.id_1146.ab[2].tf.own === 'self', 'id_1146 tf: 컷인 이벤트의 tid 는 컷인한 쪽의 캐릭터 → self (구조 근거)');
  ok(sel('id_0001', 0, ['ops', 0]).filter.own === 'any', '이미 확정한 select(id_0001 등)는 유지');
  // 원문에 자기/상대 지정이 있는 select 는 그 범위만: id_0895(相手の現場) 의 마지막 select = opp
  const o895 = JSON.stringify(db.id_0895.ab); ok(/"own":"opp"/.test(o895), '원문에 相手の 지정이 있는 select 는 opp 유지 (id_0895)');
  // 미확정 fallback: own 미지정 target 은 막지 않는다(양쪽) + audit 경고, 굵은 코스트는 self
  const c = clean({ ic: 'declare', cost: [{ c: 'fieldBottom', n: 1, filter: {} }], ops: [{ op: 'select', n: 1, do: 'ap', v: 1000, filter: { lvMax: 5 } }] });
  ok(c.ops[0].filter.own === '' && c.cost[0].filter.own === 'self' && FX.auditOwn([{ ic: 'declare', ops: [{ op: 'select', n: 1, do: 'ap', v: 1000, filter: { lvMax: 5 } }] }]).length === 1, 'fallback: 미확정 target = 제한 없음 + 경고 / 굵은 코스트 미지정 = self (그대로)');
  // cost scope:any 10건: 데이터 변경 없음 + 코스트는 내 카드만 (필터가 pool 을 self 로 제한)
  const ten = [['id_0193', 1], ['id_0292', 0], ['id_0777', 1], ['id_0872', 1], ['id_1082', 1], ['id_0456', 1], ['id_0574', 1], ['id_1022', 0], ['id_1083', 1], ['id_1084', 1]];
  ok(ten.every(([id, i]) => db[id].ab[i].cost.some(k => k.scope === 'any')), 'scope:any 코스트 10건은 데이터 그대로(수정 없음)');
  let blocked = 0; for (const [id, i] of ten) { const defs = { C: real(id), T: dummy('T', { lv: '1', n: (db[id].ab[i].cost.find(k => k.scope === 'any').filter || {}).name || 'T', trait: '警察', color: 'green' }) };
    const R = G(defs, ['C', 'T'], ['C', 'T']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn, o = 1 - s, cc = field(R, s, 'C'), t = field(R, o, 'T'); const k = db[id].ab[i].cost.find(k => k.scope === 'any');
    for (const x of U.filler(R, o, 4)) { if (k.c === 'unset' && !k.fd) { (R.cards[t].sets = R.cards[t].sets || []).push(x); R.cards[x].setOn = t; } else if (k.c !== 'sleepAny') { (R.cards[t].fd = R.cards[t].fd || []).push(x); R.cards[x].fdOn = t; } }
    if (FX.canPay(R, s, cc, R.defs[R.cards[cc].d].ab[i])) blocked++; }
  ok(blocked === 10, `상대 쪽에만 자원이 있으면 scope:any 코스트 10건 모두 지불 불가 (${blocked}/10 이 막힘 — 내 카드만 코스트로 사용)`); }

console.log(`ownership_contexts_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
