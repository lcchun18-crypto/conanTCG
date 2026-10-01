// v1.7.0: 위치를 지정하지 않는 증거 표향 효과("뒷면 증거 1개")는 플레이어가 직접 고르고, 위치가 지정된 효과(맨 위 n장)는 자동 처리한다.
const U = require('./mz_util'); const { G, dummy, fillFile, pump, FX, S, ok, eq, req, ans, act, give, auto } = U;
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const ev = (n, ops) => ({ n, type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops }] });
const defs = { xf1: ev('F1', [{ op: 'flip', n: 1 }]), xf2: ev('F2', [{ op: 'flip', n: 2 }]), xfo: ev('FO', [{ op: 'flip', n: 1, who: 'opp' }]), xtop: ev('TOP', [{ op: 'flipTopEvid', who: 'self', n: 1 }]), xfe: ev('FE', [{ op: 'flipEvid', who: 'self', n: 1 }]) };
for (let i = 0; i < 5; i++) defs['e' + i] = dummy('EV' + i, { color: 'yellow' });
const mk = (hand, nEv, nOpp = 0) => { const R = G(defs, [hand, 'e0', 'e1', 'e2', 'e3', 'e4'], ['e0', 'e1', 'e2', 'e3', 'e4'], BS); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const mine = [], theirs = []; for (let i = 0; i < nEv; i++) { const id = give(R, s, 'e' + i, 'evid'); R.cards[id].up = false; mine.push(id); } for (let i = 0; i < nOpp; i++) { const id = give(R, o, 'e' + i, 'evid'); R.cards[id].up = false; theirs.push(id); } return { R, s, o, mine, theirs }; };
const up = (R, ids) => ids.map(x => R.cards[x].up ? 1 : 0).join('');
// 1) 비지정 "뒷면 증거 1개": 직접 선택 프롬프트 (선택지 = 각 뒷면 증거의 위치), 고른 증거만 앞면
{ const { R, s, mine } = mk('xf1', 3); U.play(R, s, U.hand(R, s, 'xf1')); const q = req(R);
  ok(q && q.kind === 'opt' && q.evp && q.evp.t === s && q.evp.pos.length === 3 && q.evp.hid.every(x => x === 1), '비지정 증거 표향: 직접 선택 프롬프트 + 선택 가능 증거 3장(뒷면)');
  ok(q.labels.length === 3 && /뒷면 증거/.test(q.labels[0]), '선택지 라벨은 "n번째 뒷면 증거"');
  ans(R, 2); pump(R); eq(up(R, mine), '001', '3번째 증거만 앞면으로 (사용자가 고른 대로)'); ok(!R.eff, '선택 후 효과 처리 완료'); }
{ const { R, s, mine } = mk('xf1', 3); U.play(R, s, U.hand(R, s, 'xf1')); ans(R, 0); pump(R); eq(up(R, mine), '100', '1번째를 고르면 1번째만 앞면'); }
// 2) 2장 선택: 한 장씩 고르고, 이미 고른 증거는 선택지에서 빠진다
{ const { R, s, mine } = mk('xf2', 4); U.play(R, s, U.hand(R, s, 'xf2')); let q = req(R); ok(q.evp.pos.length === 4, '2장 중 첫 번째 선택: 4장 중에서'); ans(R, 3); q = req(R); ok(q && q.evp.pos.length === 3 && !q.evp.pos.includes(3), '두 번째 선택: 이미 고른 증거는 제외(3장)'); ans(R, 0); pump(R); eq(up(R, mine), '1001', '고른 1번째·4번째가 앞면'); }
// 3) 뒷면 증거가 1장뿐이거나 전부 뒤집는 경우: 선택의 여지가 없으므로 질의 없이 처리
{ const { R, s, mine } = mk('xf1', 1); U.play(R, s, U.hand(R, s, 'xf1')); pump(R); ok(!R.eff, '뒷면 증거가 1장뿐: 질의 없이 처리'); eq(up(R, mine), '1', '그 1장이 앞면'); }
// 4) 앞면이 섞여 있으면 뒷면만 선택지
{ const { R, s, mine } = mk('xf1', 3); R.cards[mine[0]].up = true; U.play(R, s, U.hand(R, s, 'xf1')); const q = req(R); ok(q.evp.pos.length === 2 && !q.evp.pos.includes(0), '이미 앞면인 증거는 선택지에서 제외'); ans(R, 1); pump(R); eq(up(R, mine), '101', '남은 뒷면 중 고른 것이 앞면'); }
// 5) 상대 증거를 뒤집는 효과: 내가(효과 사용자) 상대 증거 위치를 직접 고른다
{ const { R, s, o, theirs } = mk('xfo', 0, 3); U.play(R, s, U.hand(R, s, 'xfo')); const q = req(R); ok(q.who === s && q.evp.t === o && q.evp.pos.length === 3, '상대 증거: 사용자가 상대 증거 3장 중에서 선택'); ans(R, 1); pump(R); eq(up(R, theirs), '010', '고른 상대 증거만 앞면'); }
// 6) 위치가 지정된 효과(증거 맨 위 n장): 질의 없이 자동 처리
{ const { R, s, mine } = mk('xtop', 3); U.play(R, s, U.hand(R, s, 'xtop')); pump(R); ok(!R.eff, '위치 지정(맨 위) 효과: 질의 없음'); eq(up(R, mine).length, 3, '처리됨'); ok(mine.filter(x => R.cards[x].up).length === 1, '1장이 앞면'); }
// 7) 카드 효과 "뒷면 증거 1개를 선택해 표향" (flipEvid) 도 직접 선택
{ const { R, s, mine } = mk('xfe', 3); U.play(R, s, U.hand(R, s, 'xfe')); const q = req(R); ok(q && q.evp && q.evp.pos.length === 3, 'flipEvid 도 직접 선택 프롬프트'); ans(R, 1); pump(R); eq(up(R, mine), '010', '고른 증거가 앞면'); }
// 8) 봇(자동 응답)은 어떤 선택이든 합법적으로 응답하고 게임이 진행된다 (불법 선택은 서버가 거부하지 않고 첫 번째로 보정)
{ const { R, s, mine } = mk('xf1', 3); U.play(R, s, U.hand(R, s, 'xf1')); const e = act(R, s, { a: 'ans', v: 99 }); pump(R); ok(!R.eff && mine.filter(x => R.cards[x].up).length === 1, '범위 밖 답은 보정되어 1장만 앞면 (' + (e || 'ok') + ')'); }
console.log('증거 직접 선택 테스트 통과 (8개 시나리오)');
