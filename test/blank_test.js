// v1.8.3: 효과 무효(blankAb) — 대상은 이번 턴 동안 텍스트의 모든 효과가 발동하지 않는다 (현장을 떠날 때의 【현장 리무브 시】 포함)
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, ans, req, FX, S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const mk = () => { const defs = { H: real('id_0419', { color: 'green' }), V: dummy('VICTIM', { color: 'green', ap: '3000', kw: 'rapid',
  ab: [{ ic: 'static', tgt: { sel: 'self' }, kw: 'assault-case' }, { ic: 'static', tgt: { sel: 'self' }, ap: 1000 }, { ic: 'declare', ops: [{ op: 'draw', n: 1 }] }, { ic: 'onremoved', ops: [{ op: 'draw', n: 1 }] }, { ic: 'mr' }] }) };
  const R = G(defs, ['H', 'V'], ['H', 'V'], { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } }); fillFile(R, 0, 8); fillFile(R, 1, 8); return R; };
const R = mk(), s = R.turn, o = 1 - s, v = field(R, o, 'V'); R.cards[v].sum = 0;
const info = () => ({ ap: S.ap(R, v), rapid: !!S.tk(R, v).rapid, ac: FX.hasKwTk(R, v, 'assault-case'), abs: FX.abInfo(R, v).length, mr: FX.isMR(R, v) });
const b = info(); ok(b.ap === 4000 && b.rapid && b.ac && b.abs === 5 && b.mr, '무효 전: 능력/키워드/정적 효과가 모두 유효 ' + JSON.stringify(b));
const h = hand(R, s, 'H'); try { U.play(R, s, h); } catch (e) { console.log(e.message); } pump(R);
let g = 0; while (R.eff && g++ < 8) { const q = req(R); if (q.kind === 'yn') ans(R, true); else if (q.kind === 'pick') ans(R, q.sel.includes(v) ? [v] : q.sel.slice(0, q.min)); else ans(R, 0); pump(R); }
ok(R.cards[v].blank === 1, '등장 효과로 상대 캐릭터가 효과 무효 대상이 됨');
const a = info(); ok(a.ap === 3000 && !a.rapid && !a.ac && a.abs === 0 && !a.mr, '무효 중: 능력·키워드·정적 AP·MR 이 모두 사라짐 ' + JSON.stringify(a));
const vw = JSON.parse(JSON.stringify(S.view(R, o))); const vc = vw.P[o].field.find(c => c.id === v); ok(vc && vc.bl === 1, '뷰에 효과 무효 표시(bl) 포함');
const hand0 = R.P[o].hand.length; FX.rmChar(R, v, 'effect', null); pump(R); ok(R.P[o].hand.length === hand0, `효과 무효 캐릭터가 리무브돼도 【현장 리무브 시】가 발동하지 않음 (손패 ${hand0}→${R.P[o].hand.length})`);
ok(!R.cards[v].lkiBlank, '임시 무효 표시 정리');
console.log(`blank_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
