// v1.9.0: (1) id_0909 상대 캐릭터 리무브 선택  (2) 공개(reveal) 이벤트 시스템  (3) 이번 턴 다시시작(턴 시작 스냅샷 복원)  (4) 다시하기(방 초기화) — 엔진 레벨
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, req, auto, ans, FX, S, solve } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const BS = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const ev = (n, ops) => ({ n, type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops }] });
const top3 = R => R.P[R.turn].deck.slice(-3);
// ───── (1) id_0909 ─────
{ const bs = { p: { n: '高木渉', type: 'partner', color: 'blue', lp: '1' }, k: BS.k };
  const R = G({ T: real('id_0909', { color: 'blue' }), O1: dummy('O1', { ap: '1000' }), O2: dummy('O2', { ap: '9000' }), TK: dummy('高木渉', { ap: '1000' }) }, ['T', 'O1', 'O2', 'TK'], ['T', 'O1', 'O2'], bs); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, o = 1 - s; solve(R, s); field(R, s, 'TK'); const o1 = field(R, o, 'O1'), o2 = field(R, o, 'O2'); const t = hand(R, s, 'T');
  const e = S.act(R, s, { a: 'play', id: t }); if (e) console.log('  play err:', e); pump(R); const q = req(R);
  const def = Object.values(R.defs).find(d => d.n && d.ab && d.ab.some(a => a.ic === 'onplay' && JSON.stringify(a).includes('apMax')));
  ok(def && JSON.stringify(def.ab[0]).includes('"own":"any"'), 'id_0909 데이터: 선택 대상 own=any (양쪽)');
  ok(q && q.kind === 'pick' && q.sel.includes(o1), `id_0909 상대 캐릭터(AP 이하)를 선택할 수 있다 (sel=${q && JSON.stringify(q.sel)})`);
  ok(q && !q.sel.includes(o2), 'AP가 더 높은 상대 캐릭터는 선택 불가');
  if (q && q.kind === 'pick') { ans(R, [o1]); pump(R); ok(R.P[o].rem.includes(o1) && !R.P[o].field.includes(o1), '선택한 상대 캐릭터가 리무브됨'); } }
// ───── (2) 공개 이벤트 ─────
const rvOf = R => (R.rvLog || []);
{ // 덱 위 3장 확인 → 1장 선택 → '공개'하고 손패
  const R = G({ LK: ev('LK', [{ op: 'peek', n: 3 }, { op: 'pick', from: 'seen', n: 1, min: 1, reveal: true, as: 'chosen' }, { op: 'mv', ref: 'chosen', to: 'hand' }]), A: dummy('A'), B: dummy('B'), C: dummy('C') }, ['LK', 'A', 'B', 'C'], ['LK', 'A', 'B', 'C']);
  const s = R.turn, a = U.top(R, s, 'A'), b = U.top(R, s, 'B'), c = U.top(R, s, 'C'); hand(R, s, 'LK'); R.rv = []; R.rvLog = [];
  U.play(R, s, hand(R, s, 'LK') || R.P[s].hand.find(x => R.defs[R.cards[x].d].n === 'LK')); pump(R); let q = req(R);
  let g = 0; while (q && q.kind === 'ack' && g++ < 3) { ans(R, null); pump(R); q = req(R); }
  ok(q && q.kind === 'pick', '3장 확인 후 1장 선택 질의'); if (q && q.kind === 'pick') { ok(!R.rv.length && !rvOf(R).length, '확인(peek)만 한 시점에는 공개 이벤트 없음'); ans(R, [b]); pump(R); g = 0; while (R.eff && g++ < 4) { const x = req(R); ans(R, x.kind === 'yn' ? true : null); pump(R); } }
  const ev1 = R.rv || [];
  ok(ev1.length === 1 && ev1[0].ids.length === 1 && ev1[0].ids[0] === b && ev1[0].by === s, `선택한 1장만 공개 이벤트로 만들어짐 (${JSON.stringify(ev1.map(e => e.ids))})`);
  ok(!JSON.stringify(ev1).includes('"' + a + '"') || ev1[0].ids[0] === b, '선택하지 않은 카드는 공개되지 않음'); ok(R.P[s].hand.includes(b), '선택 카드는 손패에'); }
{ // 여러 장 공개
  const R = G({ RV: ev('RV', [{ op: 'revealTop', n: 3, filter: {}, hit: 'hand', miss: 'bottom' }]), A: dummy('A'), B: dummy('B'), C: dummy('C') }, ['RV', 'A', 'B', 'C'], ['RV', 'A', 'B', 'C']);
  const s = R.turn; const ids = top3(R); R.rv = []; U.play(R, s, hand(R, s, 'RV')); pump(R); const q = req(R); pump(R);
  ok(R.rv.length >= 1 && R.rv[0].ids.length === 3 && R.rv[0].by === s, `여러 장(3장) 공개 이벤트 (${R.rv[0] && R.rv[0].ids.length}장)`); }
{ // 비공개 탐색(pick without reveal) → 이벤트 없음
  const R = G({ SR: ev('SR', [{ op: 'peek', n: 3 }, { op: 'pick', from: 'seen', n: 1, min: 1, as: 'chosen' }, { op: 'mv', ref: 'chosen', to: 'hand' }]), A: dummy('A'), B: dummy('B'), C: dummy('C') }, ['SR', 'A', 'B', 'C'], ['SR', 'A', 'B', 'C']);
  const s = R.turn; const b = U.top(R, s, 'B'); R.rv = []; R.rvLog = []; U.play(R, s, hand(R, s, 'SR')); pump(R); let g = 0, q = req(R); while (q && g++ < 6) { ans(R, q.kind === 'pick' ? [q.sel.includes(b) ? b : q.sel[0]] : q.kind === 'yn' ? true : null); pump(R); q = req(R); }
  ok(!R.rv.length && !rvOf(R).length, '공개를 명시하지 않은 탐색(손패 추가)은 공개 이벤트를 만들지 않는다'); }
{ // revealHand: 상대 손패 공개 → by=공개당한 쪽
  const R = G({ RH: ev('RH', [{ op: 'revealHand', who: 'opp' }]), A: dummy('A') }, ['RH', 'A'], ['A']);
  const s = R.turn, o = 1 - s; R.rv = []; U.play(R, s, hand(R, s, 'RH')); pump(R);
  const e = R.rv[0]; ok(e && e.by === o && e.ack === s && e.ids.length === R.P[o].hand.length, `손패 공개: 공개자=상대, 확인자=나 (${e && JSON.stringify({ by: e.by, ack: e.ack, n: e.ids.length })})`); }
{ // flushReveal: 서버가 두 클라이언트에 같은 이벤트(앞면 카드 정보 포함)를 전송
  const R = G({ RV: ev('RV', [{ op: 'revealTop', n: 2, filter: {}, hit: 'hand', miss: 'bottom' }]), A: dummy('A') }, ['RV', 'A'], ['RV', 'A']); const sent = [[], []]; R.ws = [{ readyState: 1, send: d => sent[0].push(JSON.parse(d)) }, { readyState: 1, send: d => sent[1].push(JSON.parse(d)) }];
  const s = R.turn; U.play(R, s, hand(R, s, 'RV')); pump(R); S.flushReveal(R);
  const r0 = sent[0].filter(m => m.t === 'reveal'), r1 = sent[1].filter(m => m.t === 'reveal');
  ok(r0.length === 1 && r1.length === 1 && JSON.stringify(r0[0]) === JSON.stringify(r1[0]) && r0[0].to.length === 1 && r0[0].to[0] === 1 - s && r0[0].cards.length === 2 && r0[0].cards.every(c => c.d), '두 클라이언트가 동일한 reveal 메시지를 받음 (to=상대, 카드 정보 포함)'); }
// ───── (3) 이번 턴 다시시작 ─────
const dump = R => { const keep = {}; for (const k of Object.keys(R)) if (!['ws', 'tok', 'gt', 'bot', 'defs', 'log', 'rv', 'rvSeq', 'rvLog', 'snap', 'curS', '_dp'].includes(k)) keep[k] = R[k]; return JSON.stringify(keep, (k, v) => typeof v === 'function' ? 'fn' : v); };
const defs3 = { M1: dummy('M1', { ap: '3000', lv: '1' }), M2: dummy('M2', { ap: '2000' }), O1: dummy('O1', { ap: '1000' }), O2: dummy('O2', { ap: '1500' }),
  DR: ev('DR', [{ op: 'draw', n: 2 }]), RM: ev('RM', [{ op: 'select', n: 1, do: 'remove', filter: { own: 'opp' } }]), LK: ev('LK', [{ op: 'peek', n: 3 }, { op: 'pick', from: 'seen', n: 1, min: 1, reveal: true, as: 'chosen' }, { op: 'mv', ref: 'chosen', to: 'hand' }]),
  SH: ev('SH', [{ op: 'reveal', name: 'ZZZ', rest: 'shuffleBottom' }]) };
const L = ['M1', 'M2', 'O1', 'O2', 'DR', 'RM', 'LK', 'SH'];
const mk3 = () => { const R = G(defs3, L, L); R.rng = 777; fillFile(R, 0, 5); fillFile(R, 1, 5); const s = R.turn, o = 1 - s; const m1 = field(R, s, 'M1'), o1 = field(R, o, 'O1'); ['M2', 'DR', 'RM', 'LK', 'SH'].forEach(k => hand(R, s, k)); R.cards[o1].st = 's'; evidT(R, o); S.snapTake(R); return { R, s, o, m1, o1 }; };
const evidT = (R, o) => { U.evid(R, o, 2); };
const hid = (R, s, k) => R.P[s].hand.find(x => R.defs[R.cards[x].d].n === k);
const doPlay = (R, s, k) => { const e = S.act(R, s, { a: 'play', id: hid(R, s, k) }); if (e) throw new Error('play ' + k + ': ' + e); pump(R); };
const finish = R => { let g = 0; while ((R.eff || R.sub) && g++ < 20) { if (R.eff) { const q = req(R); ans(R, q.kind === 'pick' ? (q.ordered ? q.ids : q.sel.slice(0, Math.max(q.min, 1))) : q.kind === 'yn' ? true : q.kind === 'opt' ? 0 : null); pump(R); } else { S.act(R, R.sub.who, { a: R.sub.type === 'guard' ? 'guard' : 'pass', id: null }); pump(R); } } };
const SC = {
  '소환': ({ R, s }) => { doPlay(R, s, 'M2'); finish(R); },
  'FILE 사용(넥스트 힌트)': ({ R, s }) => { const e = S.act(R, s, { a: 'hint' }); if (e) throw new Error(e); pump(R); },
  '공격(액션)': ({ R, s, m1, o1 }) => { U.attack(R, m1, o1); finish(R); },
  '상대 캐릭터 리무브': ({ R, s }) => { doPlay(R, s, 'RM'); finish(R); },
  '추리(증거 획득)': ({ R, s, m1 }) => { const e = S.act(R, s, { a: 'reason', who: m1 }); if (e) throw new Error(e); finish(R); },
  '이벤트 사용(드로우)': ({ R, s }) => { doPlay(R, s, 'DR'); finish(R); },
  '파트너 어시스트': ({ R, s }) => { const e = S.act(R, s, { a: 'assist' }); if (e) throw new Error('assist ' + e); finish(R); },
  '덱 탐색/이동(3장 보고 1장)': ({ R, s }) => { doPlay(R, s, 'LK'); finish(R); },
  '해결(사건 해결)': ({ R, s }) => { solve(R, s); },
  '선택 대기(pending) 중': ({ R, s }) => { doPlay(R, s, 'RM'); if (!R.eff) throw new Error('pending 없음'); },
  '컨택트(컷인 응답) 대기 중': ({ R, s, m1, o1 }) => { U.attack(R, m1, o1); if (!R.sub && !R.eff) throw new Error('컨택트 없음'); },
  '모든 행동 연속': ({ R, s, m1, o1 }) => { doPlay(R, s, 'M2'); finish(R); U.attack(R, m1, o1); finish(R); S.act(R, s, { a: 'hint' }); pump(R); },
};
for (const [name, f] of Object.entries(SC)) { try { const T = mk3(), before = dump(T.R), hd = JSON.stringify(T.R.P[T.s].hand), dk = JSON.stringify(T.R.P[T.s].deck); f(T); const changed = dump(T.R) !== before;
    const e = S.turnRestart(T.R, T.s); ok(!e && changed && dump(T.R) === before && !T.R.eff && !T.R.sub && !T.R.q.length && JSON.stringify(T.R.P[T.s].hand) === hd && JSON.stringify(T.R.P[T.s].deck) === dk, `다시시작 [${name}]: 행동 후 복원 → 전체 상태(손패·덱 순서·FILE·증거·필드·파트너·사건·리무브·세트·턴 상태·임시효과·효과큐/보류) 동일${e ? ' err=' + e : ''}${changed ? '' : ' (상태 변화 없음!)'}`); } catch (e) { ok(false, `[${name}] 예외: ${e.message}`); } }
{ const T = mk3(), before = dump(T.R); ok(S.turnRestart(T.R, T.s) === null && dump(T.R) === before, '턴 시작 직후(행동 없이) 다시시작: 변화 없음');
  const hd = JSON.stringify(T.R.P[T.s].hand), dk = JSON.stringify(T.R.P[T.s].deck), fl = JSON.stringify(T.R.P[T.s].file);
  for (let i = 0; i < 3; i++) { doPlay(T.R, T.s, 'M2'); finish(T.R); S.act(T.R, T.s, { a: 'hint' }); pump(T.R); ok(S.turnRestart(T.R, T.s) === null && dump(T.R) === before, `같은 턴 ${i + 1}번째 다시시작 → 항상 원래 턴 시작 상태`); }
  ok(JSON.stringify(T.R.P[T.s].hand) === hd && JSON.stringify(T.R.P[T.s].deck) === dk && JSON.stringify(T.R.P[T.s].file) === fl, '턴 시작 드로우 카드와 덱 순서가 매번 동일 (스냅샷 복원, 드로우 재실행 아님)'); }
{ // 난수 상태: 같은 셔플 효과를 반복하면 같은 결과
  const T = mk3(); doPlay(T.R, T.s, 'LK'); finish(T.R); S.turnRestart(T.R, T.s); const r1 = (() => { hid(T.R, T.s, 'DR'); T.R.P[T.s].deck.length; return 0; })();
  const T2 = mk3(); const r = []; for (let i = 0; i < 3; i++) { const hs = hid(T2.R, T2.s, 'DR'); T2.R.P[T2.s].hand.push(...[]); const id = T2.R.P[T2.s].deck[0]; /* SH 이벤트를 손패에 */ const sh = T2.R.P[T2.s].deck.find(x => T2.R.defs[T2.R.cards[x].d].n === 'SH'); if (sh != null) { T2.R.P[T2.s].deck.splice(T2.R.P[T2.s].deck.indexOf(sh), 1); T2.R.P[T2.s].hand.push(sh); S.snapTake(T2.R); } doPlay(T2.R, T2.s, 'SH'); finish(T2.R); r.push(JSON.stringify(T2.R.P[T2.s].deck)); S.turnRestart(T2.R, T2.s); }
  ok(r.length === 3 && r[0] === r[1] && r[1] === r[2] && r[0].length > 10, '난수(셔플) 효과를 다시시작 후 반복하면 같은 결과 (R.rng 복원)'); }
{ const T = mk3(); const oldN = T.R.n; S.act(T.R, T.s, { a: 'end' }); pump(T.R);
  ok(T.R.turn === T.o && T.R.n === oldN + 1 && T.R.snap.turn === T.o, '턴 종료 → 새 턴 시작 스냅샷으로 교체'); ok(S.turnRestart(T.R, T.s) !== null, '이전 턴 플레이어는 지난 턴 스냅샷 사용 불가'); ok(S.view(T.R, T.s).rt === 0 && S.view(T.R, T.o).rt === 1, 'view.rt: 새 턴 플레이어만'); }
// ───── (4) 다시하기(방 초기화) ─────
{ const T = mk3(); const R = T.R; R.ws = [{ readyState: 1, send() {} }, { readyState: 1, send() {} }]; R.tok = ['a', 'b']; R.code = 'ABCD'; doPlay(R, T.s, 'M2'); finish(R); const wsRef = R.ws;
  S.resetRoom(R, T.s);
  ok(R.code === 'ABCD' && R.ws === wsRef && R.tok[0] === 'a', '다시하기: 방 코드·연결·토큰 유지'); ok(R.phase === 'setup' && R.n === 0 && !R.eff && !R.sub && !R.q.length && !R.snap && !R.winner && Object.keys(R.cards).length === 0 && Object.keys(R.defs).length === 0, '다시하기: 게임 상태·카드·덱 정의·스냅샷 모두 초기화(이전 덱 재사용 없음)');
  ok(R.P.every(p => !p.ready && !p.deck.length && !p.hand.length && !p.file.length && !p.evid.length && !p.field.length && !p.rem.length && p.partner == null && p.kase == null), '다시하기: 양쪽 플레이어 존이 모두 비어 있음'); ok(R.log.length === 1, '다시하기: 이전 게임 로그 제거(새 안내만)'); ok(!R.bot, '봇 상태 없음');
  // 게임2 → 다시하기 → 게임3: 누수 없음
  const reg = (R, s) => { const defsX = { ...BS }; const list = Array.from({ length: 40 }, (_, i) => 'c' + Math.floor(i / 3)); for (const k of new Set(list)) defsX[k] = dummy(k); return S.ready(R, s, { defs: defsX, list, partner: 'p', kase: 'k' }); };
  const play2 = R => { R.firstPref = 0; ok(!reg(R, 0) && !reg(R, 1) && R.phase === 'mull', '게임2: 양쪽 덱 재등록 → 멀리건'); for (let i = 0; i < 2; i++) S.act(R, R.mullSeat, { a: 'mull', ids: [] }); ok(R.phase === 'play' && R.first === 0 && R.turn === 0 && R.snap && R.snap.n === 1, '게임: 선후공 새로 결정·시작·턴1 스냅샷'); };
  play2(R); S.act(R, 0, { a: 'end' }); pump(R); ok(R.n === 2, '게임2 진행(턴 넘김)'); S.resetRoom(R, 1); ok(R.phase === 'setup' && R.n === 0 && !R.snap && Object.keys(R.cards).length === 0, '게임2 → 다시하기: 완전 초기화'); play2(R); ok(R.n === 1 && R.P[0].deck.length + R.P[0].hand.length + R.P[0].file.length === 40, '게임3: 이전 게임 누수 없이 새로 시작 (카드 40장 정상)'); }
console.log(`v190_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
