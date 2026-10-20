// v1.17.32: id_0703 안무로 도루&에모토 아즈사 — 수사로 Lv7 이하 발견 시 손패 1장 리무브
const U = require('./mz_util'); const { G, real, dummy, field, hand, req, ans, pump, FX } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const run = lv => { const R = G({ c: real('id_0703', { color: 'yellow', lv: '0' }), lo: dummy('LO', { lv: String(lv) }), x: dummy('X', { lv: '3' }) }, ['x'], ['lo']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); R.cards[c].sum = 0;
  R.P[o].deck = R.P[o].deck.filter(x => R.cards[x].d !== R.cards[R.P[o].deck[0]].d || true); const top = R.P[o].deck.findIndex(x => R.defs[R.cards[x].d].n === 'LO'); const id = R.P[o].deck.splice(top, 1)[0]; R.P[o].deck.push(id);
  const h = hand(R, s, 'x'); const e = U.S.act(R, s, { a: 'ability', id: c, i: 1 }); let g = 0; const hn = []; while (R.eff && g++ < 12) { const q = req(R); hn.push(q.kind + ':' + (q.msg || '').slice(0, 20)); if (q.kind === 'ack') ans(R, undefined); else if (q.kind === 'pick') ans(R, q.sel ? q.sel.slice(0, q.min || 0) : []); else ans(R, true); pump(R); }
  return { R, s, e, hn, log: R.log.slice(-8).join(' | ') }; };
for (const [lv, want] of [[7, true], [3, true], [8, false], [9, false]]) { const { R, s, hn, log } = run(lv); const q = hn.some(x => /^(pick|opt|yn)/.test(x) && /리무브|버|손패/.test(x)); const gone = R.P[s].rem.length > 0 && R.log.some(l => /손패.*리무브|리무브.*손패|버립니다|discard/i.test(l));
  ok(want ? (q || gone) : !(q || gone), `Lv${lv}: 손패 리무브 ${want ? '발생' : '없음'} — 흐름 ${hn.join(' > ')} / 손패 ${R.P[s].hand.length}, 리무브 ${R.P[s].rem.length}`); }
console.log(`\nid_0703_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
