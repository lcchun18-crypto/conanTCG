// v1.17.2 공개/서치/버림 카드가 플레이 로그에 이름(+hover 링크)으로 남는다. 비공개 정보(덱 확인, 뒷면)는 남기지 않는다.
const U = require('./mz_util'); const { G, real, dummy, field, top, hand, act, req, S } = U; const H = require('./helpers'); const DB = U.DB();
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const K = { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' };
const logTxt = R => R.log.join('\n');
const linked = (R, name) => { const V = S.view(R, 1 - R.turn); let hit = 0; V.log.forEach((t, i) => { const r = V.lr[i]; if (r) for (const [a, b] of r) if (t.slice(a, b) === name) hit++; }); return hit; };
function drive(R, s, onPick) { let g = 0; while ((R.sub || R.eff) && g++ < 30) { const q = R.eff && req(R); if (!q) { U.auto(R); continue; } if (q.kind === 'ack') U.ans(R, true); else if (q.kind === 'pick') U.ans(R, onPick ? onPick(q) : q.sel.slice(0, q.min)); else U.auto(R); } }
// 1) id_0747: 서치(공개) 카드 + 리무브된 나머지 3장이 모두 로그에 이름으로 남는다
{ const R = G({ k: K, x: real('id_0747', { color: 'green' }), h: real('id_0194', { color: 'green' }), ev: real('id_0427', { color: 'green' }), f: dummy('필러A'), g: dummy('필러B'), i: dummy('필러C') }, ['x'], ['x']);
  const s = R.turn; field(R, s, 'x'); const ev = top(R, s, 'ev');   const h = hand(R, s, 'h'); R.P[s].file.push(...U.filler(R, s, 4)); const t3 = R.P[s].deck.slice(-4, -1).slice();
  act(R, s, { a: 'play', id: h }); drive(R, s, q => q.ids.includes(ev) && q.msg.includes('선택') && !q.ordered && q.ids.length === 1 ? [ev] : q.sel.slice(0, q.min));
  const L = logTxt(R);
  ok(L.includes(DB.id_0427.n), '서치로 공개해 가져온 카드(id_0427) 이름이 로그에 있다');
  ok(/덱 위 4장 확인/.test(L) && !/확인: /.test(L), '비공개 확인(peek reveal:false) 줄에는 카드 이름이 붙지 않는다');
  ok(/카드 3장을 rem\(으\)로 이동: /.test(L), '나머지 3장이 리무브로 이동하는 줄에 이름 목록이 붙는다');
  const remLine = R.log.find(x => x.includes('3장을 rem')); ok(t3.every(id => remLine.includes(DB[R.cards[id].d] ? DB[R.cards[id].d].n : '')), '리무브된 3장 이름이 모두 줄에 들어 있다');
  ok(linked(R, DB.id_0427.n) >= 1, '공개 카드 이름에 hover 링크(V.lr)가 걸린다');
  ok(/손패 1장 리무브: /.test(L), '손패 리무브(버림) 줄에도 이름이 붙는다'); }
// 2) look(id_0028): 고른 카드는 공개로 이름, 남은 카드(덱 아래)는 이름이 로그에 나오지 않는다
{ const R = G({ k: K, e: real('id_0028', { color: 'green' }), a: dummy('초록A', { color: 'green' }), b: dummy('비밀B'), c: dummy('비밀C'), d: dummy('비밀D') }, ['e'], ['e']);
  const s = R.turn; const a = top(R, s, 'a'); const b = top(R, s, 'b'), c = top(R, s, 'c'), d = top(R, s, 'd'); const h = hand(R, s, 'e'); R.P[s].file.push(...U.filler(R, s, 9));
  act(R, s, { a: 'play', id: h }); drive(R, s, q => q.ordered ? q.ids : (q.msg.includes('리무브') ? q.sel.slice(0, q.min) : q.sel.includes(a) ? [a] : q.sel.slice(0, q.min)));
  const L = logTxt(R); ok(/선택·공개: .*초록A/.test(L), 'look 으로 공개 선택한 카드는 "선택·공개: 이름"으로 남는다');
  ok(!L.includes('비밀B') && !L.includes('비밀C') && !L.includes('비밀D'), '덱 아래로 간(비공개) 카드 이름은 로그에 없다'); }
// 3) 효과 버림(discard op) + 코스트 버림
for (const [label, ab, own] of [['효과 discard', [{ ic: 'declare', ops: [{ op: 'discard', n: 1, opt: false }] }], 0], ['코스트 discard', [{ ic: 'declare', cost: [{ c: 'discard', n: 1 }], ops: [{ op: 'draw', n: 1 }] }], 0]]) {
  const R = G({ k: K, x: dummy('버림주체', { ab }), t: dummy('버려질카드') }, ['x'], ['x']); const s = R.turn; const x = field(R, s, 'x'); const tid = hand(R, s, 't');
  const e = act(R, s, { a: 'ability', id: x, i: 0 }); drive(R, s, q => q.ids.includes(tid) ? [tid] : q.sel.slice(0, q.min)); const L = logTxt(R);
  ok(!e && L.includes('버려질카드'), `${label}: 버려진 카드 이름이 로그에 남는다${e ? ' (진입: ' + e + ')' : ''}`); }
// 4) 상대에게도 보인다 + 비공개(덱 확인만 하는 peek)는 이름 없음
{ const R = G({ k: K, x: dummy('확인주체', { ab: [{ ic: 'declare', ops: [{ op: 'peek', n: 2, reveal: false }] }] }), a: dummy('덱카드A'), b: dummy('덱카드B') }, ['x'], ['x']); const s = R.turn; const x = field(R, s, 'x'); top(R, s, 'a'); top(R, s, 'b');
  act(R, s, { a: 'ability', id: x, i: 0 }); drive(R, s); const V = S.view(R, 1 - s); const L = V.log.join('\n');
  ok(!L.includes('덱카드A') && !L.includes('덱카드B'), '상대 뷰의 로그에 peek(비공개) 카드 이름이 없다'); }
// 5) peek reveal:true 는 공개이므로 이름이 남는다
{ const R = G({ k: K, x: dummy('공개주체', { ab: [{ ic: 'declare', ops: [{ op: 'peek', n: 2, reveal: true }] }] }), a: dummy('공개카드A'), b: dummy('공개카드B') }, ['x'], ['x']); const s = R.turn; const x = field(R, s, 'x'); top(R, s, 'a'); top(R, s, 'b');
  act(R, s, { a: 'ability', id: x, i: 0 }); drive(R, s); const L = S.view(R, 1 - s).log.join('\n');
  ok(L.includes('공개카드A') && L.includes('공개카드B'), 'peek reveal:true — 공개된 2장 이름이 상대 뷰 로그에도 있다'); }
console.log(`\nlog_reveal_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
