// v1.16.3: id_0190 大岡紅葉 — 상대 캐릭터에 세트된 카드(앞면/뒷면 모두)가 현장에서 벗어났을 때 [세트 + 1드로]. 뒷면(fdOff)에서 발동하지 않던 문제 확인.
const U = require('./mz_util'); const { G, real, dummy, field, act, pump, attack, finishContact, ok, FX, req } = U;
let pass = 0, fail = 0; const chk = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const card = U.DB().id_0190; const evs = card.ab[0].evs;
chk(evs.includes('setOff') && evs.includes('fdOff'), `DB: id_0190 트리거 이벤트 = ${JSON.stringify(evs)} (앞면 setOff + 뒷면 fdOff)`);
function setup(kind) {
  const R = G({ x: real('id_0190'), att: dummy('ATT', { ap: '9000' }), v: dummy('V', { ap: '1000' }), m: dummy('M'), k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } }, ['x'], ['v']); R.fl = {};
  const s = R.turn, o = 1 - s; const x = field(R, s, 'x'), att = field(R, s, 'att'), v = field(R, o, 'v', 's'); const u = U.filler(R, o, 1)[0];
  if (kind === 'fd') { R.cards[v].fd = [u]; R.cards[u].fdOn = v; } else { R.cards[v].sets = [u]; R.cards[u].setOn = v; }
  return { R, s, o, x, att, v, u };
}
for (const kind of ['fd', 'sets']) for (const [label, own] of [['선택 후', 'pick'], ['선택 없이', 'none']]) {
  const { R, s, att, v, u } = setup(kind); const h0 = R.P[s].hand.length, d0 = R.P[s].deck.length;
  attack(R, att, v, true); let g = 0; while ((R.sub || R.eff) && g++ < 20) { if (R.eff) { const q = req(R); if (q.kind === 'pick') U.ans(R, own === 'pick' && q.sel.length ? [q.sel[0]] : []); else U.ans(R, true); } else { const w = R.sub.who; const e = act(R, w, R.sub.type === 'guard' ? { a: 'guard', id: null } : { a: 'pass' }); if (e) throw new Error(e); } } pump(R);
  chk(!R.P[1 - s].field.includes(v) && R.P[1 - s].rem.includes(u), `[${kind === 'fd' ? '뒷면' : '앞면'} 세트·${label}] 컨택트로 상대 캐릭터 리무브 → 세트 카드도 리무브 에리어로`);
  chk(R.P[s].hand.length === h0 + 1, `[${kind === 'fd' ? '뒷면' : '앞면'} 세트·${label}] 1장 드로우 (손패 ${h0} → ${R.P[s].hand.length})`);
  chk(R.P[s].deck.length === d0 - (own === 'pick' ? 2 : 1), `[${kind === 'fd' ? '뒷면' : '앞면'} 세트·${label}] 덱 감소 ${d0 - R.P[s].deck.length}장 (${own === 'pick' ? '세트 1 + 드로우 1' : '드로우 1'})`);
}
// 상대 턴이나 내 캐릭터에 붙은 세트에는 발동하지 않는다 / 턴①
{ const { R, s, o, v, u } = setup('fd'); R.turn = o; const h0 = R.P[s].hand.length; R.cards[v].fd = []; R.cards[u].fdOn = null; R.P[o].rem.push(u); FX.bus(R, 'fdOff', { s: o, ent: u, holder: v }); pump(R); chk(!R.eff && R.P[s].hand.length === h0, '상대 턴 중에는 발동하지 않음 ([자신 턴 중] 조건)'); }
{ const { R, s, x } = setup('fd'); const m = field(R, s, 'm'); const u = U.filler(R, s, 1)[0]; R.cards[m].fd = [u]; R.cards[u].fdOn = m; const h0 = R.P[s].hand.length; R.cards[m].fd = []; R.cards[u].fdOn = null; R.P[s].rem.push(u); FX.bus(R, 'fdOff', { s, ent: u, holder: m }); pump(R); chk(!R.eff && R.P[s].hand.length === h0, '내 캐릭터에 붙은 세트 카드가 벗어날 때는 발동하지 않음 (상대 현장 캐릭터만)'); }
{ const { R, s, o, v } = setup('fd'); const h0 = R.P[s].hand.length; for (let i = 0; i < 2; i++) { const u = U.filler(R, o, 1)[0]; R.cards[v].fd = [u]; R.cards[u].fdOn = v; R.cards[v].fd = []; R.cards[u].fdOn = null; R.P[o].rem.push(u); FX.bus(R, 'fdOff', { s: o, ent: u, holder: v }); pump(R); while (R.eff) { const q = req(R); U.ans(R, q.kind === 'pick' ? [] : true); pump(R); } }
  chk(R.P[s].hand.length === h0 + 1, '[턴①] 한 턴에 2번 벗어나도 드로우는 1번만'); }
console.log(`\nid_0190_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
