process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// PRO 봇 전략 규칙 테스트 (사용자 제공 운영 원칙): node test/bot_pro_test.js
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js'), { Searcher } = require('../bot/search.js'), POL = require('../bot/pro.js');
let pass = 0, fail = 0;
const run = (name, f) => { try { f(); console.log('✓', name); pass++; } catch (e) { console.log('✗', name, '\n    ', String(e.message || e).slice(0, 300)); fail++; } };
const dec = (R, seat, o = {}) => { const policy = o.classic ? null : POL.policy(seat, R); return decide({ R, seat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 4000, seed: 3 } }, new Searcher({ seed: 3, policy })); };
const defs = () => { const d = {}; for (let lv = 0; lv <= 9; lv++) d['c' + lv] = { n: 'C' + lv, type: 'char', color: 'red', lv: String(lv), ap: String(1000 + lv * 1000), lp: '1' }; return d; };
const plan = res => (res.info.lineDesc || []).join(' | ');

run('원칙2/6/7: 초반(FILE 3)에는 넥스트 힌트를 하지 않는다 (낼 카드가 있어도)', () => {
  const R = H.game(defs()), s = R.turn, P = R.P[s]; P.deck.push(...P.hand); P.hand = []; H.give(R, s, 'c1', 'hand'); H.give(R, s, 'c3', 'hand'); H.fill(R, s, 3);
  const res = dec(R, s); if (/힌트/.test(plan(res)) || res.mv.tag === 'hint') throw new Error('초반 힌트: ' + plan(res));
  const pol = POL.policy(s, R); const moves = SIM.genMoves(R, () => 0); const hint = moves.find(m => m.tag === 'hint'); if (!hint) throw new Error('hint 수가 없음(테스트 설정)'); if (!pol.ban(R, hint, moves)) throw new Error('ban 이 hint 를 막지 않음');
});
run('원칙6: 선공은 어시스트 포함 FILE 8, 후공은 9 부터 힌트 허용 / 그 전은 금지', () => {
  for (const [firstPref, fileN, allowed] of [[0, 6, false], [0, 7, true], [1, 7, false], [1, 8, true]]) {
    const R = H.game(defs()), s = R.turn; R.first = firstPref === 0 ? s : 1 - s; H.fill(R, s, fileN); const moves = SIM.genMoves(R, () => 0), hint = moves.find(m => m.tag === 'hint'); if (!hint) throw new Error('hint 수 없음');
    const banned = POL.policy(s, R).ban(R, hint, moves); if (banned === allowed) throw new Error(`first=${R.first === s} FILE ${fileN}: banned=${banned} (허용 기대 ${allowed})`); }
});
run('원칙9: 낼 수 있는 캐릭터가 있으면 이번 턴에 한 장은 낸다 (턴 종료 금지)', () => {
  const R = H.game(defs()), s = R.turn, P = R.P[s]; P.deck.push(...P.hand); P.hand = []; H.give(R, s, 'c3', 'hand'); H.give(R, s, 'c4', 'hand'); H.fill(R, s, 4);
  const res = dec(R, s); if (!/사용/.test(plan(res))) throw new Error('캐릭터를 내지 않음: ' + plan(res));
  const moves = SIM.genMoves(R, () => 0), end = moves.find(m => m.tag === 'end'); if (!POL.policy(s, R).ban(R, end, moves)) throw new Error('end 가 금지되지 않음');
});
run('원칙9/코스트: FILE 5 에서는 레벨 5(또는 어시스트 6) 카드를 우선, 레벨 2 카드를 먼저 내지 않는다', () => {
  const R = H.game(defs()), s = R.turn, P = R.P[s]; P.deck.push(...P.hand); P.hand = []; for (const k of ['c2', 'c5', 'c6']) H.give(R, s, k, 'hand'); H.fill(R, s, 5);
  const res = dec(R, s), first = (res.info.lineDesc || [])[0] || ''; if (/C2\b/.test(first) && !/C5|C6/.test(first)) throw new Error('낮은 카드를 먼저: ' + plan(res));
  if (!/C5|C6/.test(plan(res))) throw new Error('코스트에 맞는 카드를 내지 않음: ' + plan(res));
});
const mulG = (H, hand, first) => { const d = defs(), S = H.S, R = S.mkR('M'); R.firstPref = first ? 0 : 1;
  for (let lv = 0; lv <= 9; lv++) d['e' + lv] = { ...d['c' + lv], n: 'E' + lv };
  const base = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' }, ...d }, l = []; for (let lv = 0; lv <= 9; lv++) { for (let i = 0; i < 3; i++) l.push('c' + lv); l.push('e' + lv); }
  for (let s = 0; s < 2; s++) { const e = S.ready(R, s, { defs: base, list: l, partner: 'p', kase: 'k' }); if (e) throw new Error(e); }
  const P = R.P[R.mullSeat]; const all = P.hand.concat(P.deck); P.hand = []; P.deck = all; for (const k of hand) { const i = P.deck.findIndex(id => H.key(R, id) === k); P.hand.push(P.deck.splice(i, 1)[0]); } return R; };
run('원칙9 멀리건(선공): 레벨 1,3,5,7 캐릭터는 유지하고 쓸 수 없는 레벨 9 는 교체', () => {
  const R = mulG(H, ['c1', 'c3', 'c5', 'c7', 'c9'], true), s = R.mullSeat, res = dec(R, s), ids = res.mv.m.ids.map(id => H.key(R, id));
  if (!ids.includes('c9')) throw new Error('c9 를 교체하지 않음: ' + ids); if (ids.some(k => ['c1', 'c3', 'c5', 'c7'].includes(k))) throw new Error('곡선 카드를 교체함: ' + ids);
});
run('원칙9 멀리건(후공): 레벨 2,4,6,8 유지 / 같은 레벨 중복·레벨 9 교체', () => {
  const R = mulG(H, ['c2', 'c4', 'c6', 'c8', 'c9'], false), s = R.mullSeat, res = dec(R, s), ids = res.mv.m.ids.map(id => H.key(R, id));
  if (ids.some(k => ['c2', 'c4', 'c6', 'c8'].includes(k))) throw new Error('곡선 카드를 교체함: ' + ids);
});
run('원칙9 멀리건: 곡선에 안 맞는 손패(전부 레벨 8~9)는 대부분 교체', () => {
  const R = mulG(H, ['c8', 'c9', 'e9', 'e8', 'c7'], true), s = R.mullSeat, res = dec(R, s); if (res.mv.m.ids.length < 3) throw new Error('교체 장수 ' + res.mv.m.ids.length);
});
run('원칙4/5: 평가 — 상대 필드가 비면 가점, 상대가 사건 해결선(증거+캐릭터)이면 감점', () => {
  const R = H.game(defs()), s = R.turn, o = 1 - s, EV = require('../bot/evaluate.js'), pol = POL.policy(s, R);
  const base = EV.evaluate(R, s, pol); const id = H.give(R, o, 'c3', 'field'); const withChar = EV.evaluate(R, s, pol), without = base;
  if (!(without > withChar)) throw new Error('상대 캐릭터가 있어도 점수가 같거나 높음');
  R.cards[R.P[o].kase].solved = true; for (let i = 0; i < 3; i++) R.P[o].evid.push(R.P[o].deck.pop()); const danger = EV.evaluate(R, s, pol); if (!(danger < withChar - 3)) throw new Error('해결선 위험이 충분히 감점되지 않음 ' + [withChar, danger]);
});
run('PRO 정책: 같은 상태에서 반대칭 (evaluate(a) == -evaluate(b))', () => {
  const R = H.game(defs()), EV = require('../bot/evaluate.js'); const a = EV.evaluate(R, 0, POL.policy(0, R)), b = EV.evaluate(R, 1, POL.policy(0, R)); if (Math.abs(a + b) > 1e-6) throw new Error(`${a} ${b}`);
});
console.log(fail ? `\nPRO 봇 테스트 ${fail}건 실패 (통과 ${pass})` : `\nPRO 봇 테스트 통과 (${pass}개)`); process.exit(fail ? 1 : 0);
