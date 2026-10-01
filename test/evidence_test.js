// 증거 앞면 처리 + 증거 선택(8코 마츠다 id_0704) 엔진 테스트: node test/evidence_test.js
const U = require('./mz_util'); const { G, real, dummy, field, play, auto, ok, eq, req, ans, fillFile, pump, act, FX, S } = U;
const BS = pc => ({ p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } });
const mk = (defs, l0, l1, pc = 'yellow') => { const R = G(defs, l0, l1, BS(pc)); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
let pass = 0, fail = 0; const T = (n, f) => { try { f(); console.log('✓', n); pass++; } catch (e) { console.log('✗', n, '\n    ', String(e.message || e).slice(0, 400)); fail++; } };
const JS = x => JSON.parse(JSON.stringify(x));
// 서로 다른 이름의 증거 n장을 s 에게 (앞/뒷면 지정). 이름은 e0,e1,.. 로 구별
const defsE = n => { const d = {}; for (let i = 0; i < n; i++) d['e' + i] = dummy('EV' + i); return d; };
const addEv = (R, s, key, up) => { const id = U.give(R, s, key, 'evid'); R.cards[id].up = !!up; return id; };

T('공통 flip: 뒷면 증거 1장 → 서버 상태(up) + 양쪽 view(evl)에 실제 카드 앞면으로 반영', () => {
  const R = mk({ ...defsE(3), ev: { n: 'FLIPEV', type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'flip', n: 1 }] }] } }, ['ev', 'e0', 'e1', 'e2'], ['e0']);
  const s = R.turn, o = 1 - s, ids = ['e0', 'e1', 'e2'].map(k => addEv(R, s, k, false)); const h = U.hand(R, s, 'ev'); play(R, s, h); auto(R); pump(R);
  const ups = ids.filter(x => R.cards[x].up); eq(ups.length, 1, '정확히 1장만 앞면'); const up = ups[0];
  for (const seat of [s, o]) { const v = S.view(R, seat), P = v.P[s]; eq(P.evl.length, 3, 'evl 길이'); const pos = ids.indexOf(up); ok(P.evl[pos] && P.evl[pos].d === R.cards[up].d, `seat ${seat}: 앞면 위치에 실제 카드(d) — 정체 일치`); ok(P.evl.filter(x => !x).length === 2, '나머지는 뒷면(0)'); eq(P.evUp.length, 1, 'evUp'); }
  const vo = S.view(R, o).P[s]; ok(!JSON.stringify(vo.evl).includes(R.cards[ids.find(x => !R.cards[x].up)].d), '뒷면 증거의 정체는 상대 view 에 없다');
  // 턴이 넘어가도/ 여러 번 view 를 만들어도 상태 유지 (뒷면으로 돌아가지 않는다)
  U.endTurn(R); for (let i = 0; i < 3; i++) for (const seat of [s, o]) { const P = S.view(R, seat).P[s]; ok(P.evl[ids.indexOf(up)] && P.evl[ids.indexOf(up)].d === R.cards[up].d, '턴 경과 후에도 앞면 유지'); }
  eq(R.cards[up].up, true, '서버 canonical 상태 유지');
});
T('공통 flip: 여러 증거 중 "특정" 증거만 앞면 (flipEv ids) — 다른 증거/상대 증거/이미 앞면은 건드리지 않는다', () => {
  const R = mk(defsE(5), ['e0', 'e1', 'e2', 'e3', 'e4'], ['e0', 'e1']); const s = R.turn, o = 1 - s;
  const mine = ['e0', 'e1', 'e2', 'e3'].map(k => addEv(R, s, k, false)); const theirs = addEv(R, o, 'e0', false); R.cards[mine[3]].up = true;
  const got = FX.flipEv(R, s, 1, [mine[2]]); eq(JSON.stringify(got), JSON.stringify([mine[2]]), '요청한 증거만 뒤집힘'); eq(R.cards[mine[2]].up, true, '선택한 증거 앞면'); ok(!R.cards[mine[0]].up && !R.cards[mine[1]].up, '나머지 뒷면 유지');
  eq(JSON.stringify(FX.flipEv(R, s, 2, [theirs, mine[3]])), '[]', '상대 증거·이미 앞면인 증거는 합법 대상이 아니라 무시'); ok(!R.cards[theirs].up, '상대 증거 불변');
  const v = S.view(R, o).P[s]; eq(v.evl.map(x => x ? 1 : 0).join(''), '0011', '위치별 공개 상태(상대 화면)'); eq(v.evl[2].d, R.cards[mine[2]].d, '앞면 정체');
  ok(v.evl[0] === 0 && v.evl[1] === 0, '뒷면은 정체 비공개');
});
T('공통 flip: 효과 op(flip)/코스트(flipEvid)/전부 앞면(flipAllEvid) 모두 같은 경로 — view 와 상태 일치', () => {
  const R = mk({ ...defsE(3), all: { n: 'ALL', type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'flipAllEvid' }] }] } }, ['all'], ['e0']);
  const s = R.turn; const ids = ['e0', 'e1', 'e2'].map(k => addEv(R, s, k, false)); play(R, s, U.hand(R, s, 'all')); auto(R); pump(R);
  ok(ids.every(x => R.cards[x].up), '전부 앞면'); const P = S.view(R, 1 - s).P[s]; ok(P.evl.every(Boolean) && P.evl.length === 3, '상대 view 에서도 전부 앞면');
});

// ── 8코스트 마츠다: 정확한 카드는 data/cards.json 의 id_0704 (松田陣平 Lv8 AP8000 LP2, 파트너(黄) 선언: 상대 증거 1개까지 선택해 덱 아래로)
const m0704 = () => { const c = U.DB()['id_0704']; ok(c && c.n === '松田陣平' && c.lv === '8' && /証拠を1つまで選び、デッキの下/.test(c.fx), 'id_0704 데이터 확인'); };
const scen = (nUp, nDown) => { const d = { c: real('id_0704'), ...defsE(nUp + nDown) }; const R = mk(d, ['c'], Object.keys(defsE(nUp + nDown))); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const ids = [];
  for (let i = 0; i < nUp + nDown; i++) ids.push(addEv(R, o, 'e' + i, i % 2 === 0 && i / 2 < nUp)); return { R, s, o, c, ids }; };
T('마츠다 id_0704: 데이터 확인', m0704);
T('마츠다: 선택 가능한 증거가 "각각" 선택지로 나오고(evp), 고르기 전에는 아무 것도 이동하지 않는다', () => {
  const { R, s, o, c, ids } = scen(2, 2); const before = JS(R.P[o].evid), deckBefore = JS(R.P[o].deck); U.declErr = undefined; const e = FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); ok(!e, 'declare: ' + e); pump(R);
  const q = req(R); eq(q.kind, 'opt', 'opt 질의'); ok(q.evp, 'evp 첨부'); eq(q.evp.t, o, '대상은 상대 증거'); eq(q.evp.pos.length, ids.length, '모든 증거가 개별 선택지'); eq(q.labels.length, ids.length + 1, '증거 수 + 선택하지 않음');
  eq(JSON.stringify(q.evp.pos), JSON.stringify(ids.map((_, i) => i)), '증거 순서 위치'); ok(q.labels.every((l, i) => i >= ids.length || /번째/.test(l)), '라벨은 위치 표기');
  eq(JSON.stringify(R.P[o].evid), JSON.stringify(before), '선택 전 증거 불변'); eq(JSON.stringify(R.P[o].deck), JSON.stringify(deckBefore), '선택 전 덱 불변');
  const V = S.view(R, s).eff, W = S.view(R, o).eff; ok(V.evp && V.evp.pos.length === ids.length, '선택자 화면에 evp'); ok(W && W.wait && !W.evp, '상대 화면은 대기 표시만(동기화)');
  ok(!JSON.stringify(V).includes(R.cards[ids[1]].d) || R.cards[ids[1]].up, '뒷면 증거 정체가 질의에 노출되지 않음');
});
T('마츠다: 각 증거를 선택하면 "선택한 바로 그 증거"가 상대 덱 맨 아래로 간다 (모든 위치 반복)', () => {
  for (let pick = 0; pick < 4; pick++) {
    const { R, s, o, c, ids } = scen(2, 2); FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); pump(R); const chosen = ids[pick]; const wasUp = R.cards[chosen].up;
    ans(R, pick); let g = 0; while (R.eff && g++ < 6) { const q = req(R); if (q.kind === 'pick') ans(R, []); else ans(R, q.kind === 'yn' ? false : 0); } pump(R);
    eq(R.P[o].deck[0], chosen, `pick ${pick}: 덱 맨 아래가 선택한 증거`); ok(!R.P[o].evid.includes(chosen), '증거에서 빠짐'); eq(R.P[o].evid.length, 3, '다른 증거는 그대로 3장'); eq(JSON.stringify(R.P[o].evid), JSON.stringify(ids.filter(x => x !== chosen)), '나머지 증거 순서/내용 불변'); eq(R.cards[chosen].up, false, '덱에 가면 뒷면');
  }
});
T('마츠다: 서버 검증 — 범위 밖/음수/문자/배열 응답은 거부되고 질의가 유지된다', () => {
  const { R, s, c } = scen(1, 3); FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); pump(R); const q = req(R);
  for (const bad of [q.labels.length, 99, -1, 'x', null, [0]]) { const e = act(R, s, { a: 'ans', v: bad }); ok(typeof e === 'string' && e.length, `거부: ${JSON.stringify(bad)}`); ok(R.eff, '질의 유지'); }
  const wrongSeat = act(R, 1 - s, { a: 'ans', v: 0 }); ok(typeof wrongSeat === 'string', '선택 권한이 없는 좌석은 거부');
});
T('마츠다: "선택하지 않음"은 아무 것도 옮기지 않고 / 증거가 1장뿐이어도 임의 자동선택 없이 선택지로 나온다', () => {
  const { R, s, o, c, ids } = scen(0, 1); FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); pump(R); const q = req(R); eq(q.labels.length, 2, '증거 1장 + 선택하지 않음'); ans(R, 1); let g = 0; while (R.eff && g++ < 6) { const q2 = req(R); ans(R, q2.kind === 'pick' ? [] : q2.kind === 'yn' ? false : 0); } pump(R);
  eq(R.P[o].evid.length, 1, '증거 유지');
});
T('봇 시뮬레이션: 같은 질의 구조(opt+evp)를 쓰고, 뒷면 증거는 구별하지 않는다(정체 엿보기 없음)', () => {
  const SIM = require('../bot/simulate.js'); const { R, s, c, ids } = scen(2, 2); FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); pump(R);
  const mv = SIM.genMoves(R, () => 0); const q = req(R); eq(q.evp.hid.filter(Boolean).length, 2, '뒷면 2장 표시'); const idx = mv.map(m => m.m.v); eq(idx.filter(i => q.evp.hid[i]).length, 1, '뒷면은 후보 1개로 통합'); eq(idx.filter(i => q.evp.hid[i] === 0).length, 2, '앞면은 개별 후보'); ok(idx.includes(q.labels.length - 1), '선택하지 않음 후보');
  const c2 = SIM.clone ? SIM.clone(R) : null; if (c2) { const r = SIM.applyMove(c2, mv[0], 1); ok(!r, '봇이 만든 선택이 엔진에서 합법: ' + r); }
});
console.log(fail ? `\n증거 테스트 ${fail}건 실패 (통과 ${pass})` : `\n증거 테스트 통과 (${pass}개)`); process.exit(fail ? 1 : 0);
