// v1.8.5: 실제 카드 id_0806 의 【선언】(상대 캐릭터 레벨 -1) → 서버 뷰의 lvx 가 상대 캐릭터 레벨 감소를 반영한다 (클라이언트가 이 값으로 Lv ▼ 표시)
const U = require('./mz_util'); const { G, real, dummy, field, evid, pump, ans, req, FX, S } = U; const { act } = require('./helpers.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const BS = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: real('id_0806', { color: 'red' }) }; BS.k.type = 'case';
const R = G({ F: dummy('FBIC', { color: 'red', trait: 'FBI', lv: '3' }), O: dummy('OPPC', { color: 'red', lv: '5', ap: '3000' }) }, ['F', 'O'], ['F', 'O'], BS);
const s = R.turn, o = 1 - s; U.fillFile(R, s, 6); U.fillFile(R, o, 6); field(R, s, 'F'); const ov = field(R, o, 'O'); evid(R, s, 2); U.solve(R, s);
let g = 0; while (R.eff && g++ < 4) { const q = req(R); ans(R, q.kind === 'pick' ? q.sel.slice(0, q.min) : true); pump(R); }
const e = act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }); ok(!e, '사건 【선언】 발동 ' + (e || '')); pump(R); g = 0; while (R.eff && g++ < 6) { const q = req(R); if (q.kind === 'pick') ans(R, q.sel.includes(ov) ? [ov] : q.sel.slice(0, q.min)); else if (q.kind === 'yn') ans(R, true); else ans(R, 0); pump(R); }
ok(FX.lvOf(R, ov) === 4, '상대 캐릭터 레벨 5 → 4');
for (const seat of [s, o]) { const v = JSON.parse(JSON.stringify(S.view(R, seat))), c = v.P[o].field.find(x => x.id === ov); ok(c && c.lvx === 4, `좌석 ${seat} 의 뷰에서 상대 캐릭터 lvx=4`); }
console.log(`lv_view_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
