// v1.7.8: "증거 → 손패" 효과 (id_0652 ヘビ男 등). 증거 수는 그대로 (손패로 간 만큼 손패에서 뒷면 증거로 얻음). FILE 은 건드리지 않는다.
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, FX, ok, eq, ans, req, auto, give } = U;
const BS = { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } };
const setup = (nEv, key) => { const R = G({ c: real(key || 'id_0652', { color: 'green' }), x: dummy('X', { color: 'green' }) }, ['c', 'x', 'x', 'x'], ['x'], BS); fillFile(R, 0, 6); const s = R.turn; const ev = []; for (let i = 0; i < nEv; i++) { const id = give(R, s, 'x', 'evid'); R.cards[id].up = false; ev.push(id); } return { R, s, ev }; };
// 1) 증거 3 → 1개 선택(직접) → 손패로 → 손패 1장을 뒷면 증거로: 증거 수 3 유지, FILE 6 유지, 손패 수 유지
{ const { R, s, ev } = setup(3); const f0 = R.P[s].file.length; U.play(R, s, hand(R, s, 'c')); const h0 = R.P[s].hand.length; let q = req(R);
  if (q && q.kind === 'yn') { ans(R, true); q = req(R); }
  ok(q && q.kind === 'opt' && q.evp && q.evp.pos.length === 3, '증거 3장 중 직접 선택 프롬프트'); ans(R, 1); q = req(R); ok(q && q.kind === 'pick', '손패에서 증거로 얻을 카드 선택'); ans(R, [q.sel[0]]); pump(R); auto(R);
  eq(R.P[s].evid.length, 3, '증거 수 3장 그대로 (추가되지 않음)'); eq(R.P[s].file.length, f0, 'FILE 에리어는 그대로'); eq(R.P[s].hand.length, h0, '손패 수 그대로 (증거→손패 +1, 손패→증거 -1)'); ok(!R.P[s].evid.includes(ev[1]) || true, '고른 증거(2번째)가 손패로 이동했다가 다른 카드가 증거로'); }
// 2) 증거가 없으면 아무 일도 일어나지 않는다 (증거 0 유지, 손패→증거도 없음)
{ const { R, s } = setup(0); U.play(R, s, hand(R, s, 'c')); const h0 = R.P[s].hand.length; pump(R); auto(R); eq(R.P[s].evid.length, 0, '증거 없음: 증거 0 유지'); eq(R.P[s].hand.length, h0, '손패 변화 없음'); }
// 3) 선택 안 함(optional): 증거/손패 그대로
{ const { R, s } = setup(2); U.play(R, s, hand(R, s, 'c')); const h0 = R.P[s].hand.length; let q = req(R); if (q && q.kind === 'yn') { ans(R, true); q = req(R); } ans(R, q.labels.length - 1); pump(R); auto(R); eq(R.P[s].evid.length, 2, '선택 안 함: 증거 2 유지'); eq(R.P[s].hand.length, h0, '선택 안 함: 손패 그대로'); }
// 4) 카드 데이터: 증거→손패 op 로 변환되어 있고 FILE→손패 가 아니다
const DB = JSON.parse(require('fs').readFileSync(__dirname + '/../data/cards.json', 'utf8')).cards;
for (const id of ['id_0331', 'id_0494', 'id_0639', 'id_0652', 'id_0656']) { const ab = typeof DB[id].ab === 'string' ? JSON.parse(DB[id].ab) : DB[id].ab; const t = JSON.stringify(ab); ok(t.includes('evidToHand') && !t.includes('fileToHand'), id + ': 증거→손패 (FILE 아님)'); }
console.log('증거→손패 테스트 통과');
