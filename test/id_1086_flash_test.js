// v1.17.5 id_1086 登場時: 【!】ヒラメキ(=카드에 인쇄된 히라메키)를 가진 레벨 7 (녹) 이벤트를 실제 DB 카드로 가져온다
const U = require('./mz_util'); const { G, real, dummy, hand, top, act, req, S } = U; const DB = U.DB();
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const lv7 = Object.values(DB).filter(x => x.type === 'event' && String(x.lv) === '7' && /green/.test(x.color) && (x.ab || []).some(a => a.ic === 'flash')).map(x => x.id);
ok(lv7.length >= 3 && lv7.includes('id_0163'), `DB: 히라메키가 있는 Lv7 녹 이벤트 ${lv7.join(', ')}`);
const BS = { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } };
for (const id of lv7) {
  const R = G({ c: real('id_1086', { color: 'green', lv: '0' }), t: real(id, { color: DB[id].color }), n1: dummy('덱카드1', { color: 'green' }), n2: dummy('덱카드2', { color: 'green' }) }, ['c'], ['c'], BS); const s = R.turn;
  const c = hand(R, s, 'c'); const t = top(R, s, 't'); top(R, s, 'n1'); top(R, s, 'n2'); R.P[s].file.push(...U.filler(R, s, 8));
  const e = act(R, s, { a: 'play', id: c }); let g = 0; while ((R.sub || R.eff) && g++ < 12) { const q = R.eff && req(R); if (q && q.kind === 'ack') U.ans(R, true); else U.auto(R); }
  ok(!e && R.P[s].hand.includes(t), `${id}(${DB[id].n.slice(0, 12)}): 가져와서 손패에 들어온다`);
  const L = R.log.join('\n'); ok(L.includes(DB[id].n), `${id}: 로그에 가져온 카드 이름이 남는다`); }
// 히라메키가 없는 Lv7 녹 이벤트는 해당하지 않는다(id_1094)
{ const R = G({ c: real('id_1086', { color: 'green', lv: '0' }), t: real('id_1094', { color: 'green' }) }, ['c'], ['c'], BS); const s = R.turn; const c = hand(R, s, 'c'); const t = top(R, s, 't'); R.P[s].file.push(...U.filler(R, s, 8));
  act(R, s, { a: 'play', id: c }); let g = 0; while ((R.sub || R.eff) && g++ < 12) { const q = R.eff && req(R); if (q && q.kind === 'ack') U.ans(R, true); else U.auto(R); }
  ok(!R.P[s].hand.includes(t), 'id_1094(Lv7 녹 이벤트, 히라메키 없음)는 가져오지 않는다'); }
console.log(`\nid_1086_flash_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
