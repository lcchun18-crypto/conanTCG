// v1.17.31: 효과로 부여된 능력(id_1156 「コンタクトでリムーブしたとき…」)을 받은 캐릭터가 변장으로 교체되어도 새 카드가 이어받아 발동한다
const U = require('./mz_util'); const { G, real, dummy, field, hand, evid, fillFile, attack, finishContact, auto, pump, FX } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const G0 = G({ k: real('id_1156') }, [], []); const g = G0.defs[Object.keys(G0.defs).find(k => G0.defs[k].n === real('id_1156').n)].ab[1].ops[0].acts[0].g;   // 서버가 정리한(cleanAb) 실제 부여 능력
const run = dis => { const R = G({ a: dummy('A', { ap: '9000', color: 'green' }), kid: { n: 'KID', type: 'char', color: 'green', lv: '0', ap: '9000', lp: '1', kw: 'disguise', ab: [{ ic: 'disguise' }] }, w: dummy('W', { ap: '1000', color: 'blue' }), as: { n: 'AS', type: 'char', color: 'green', lv: '1', ap: '1000', lp: '1', kw: 'assault' } }, ['as', 'as', 'as'], ['kid']);
  fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; R.P[s].deck = [...R.P[s].deck.filter(x => R.cards[x].d === 'as'), ...R.P[s].deck.filter(x => R.cards[x].d !== 'as')];
  const a = field(R, s, 'a'), w = field(R, o, 'w', 's'); R.cards[a].sum = 0; R.cards[a].tab = [JSON.parse(JSON.stringify(g))]; const k = dis ? hand(R, s, 'kid') : null; const h0 = R.P[s].hand.length;
  attack(R, a, w); finishContact(R, k ? [{ s, m: { a: 'dis', id: k } }] : [], { yn: true, pref: [] }); pump(R); return { R, s, a, k, h0, w };
};
{ const { R, k, a } = run(true); ok(R.P[R.turn].field.includes(k) && !R.P[R.turn].field.includes(a), '1 변장으로 교체됨'); ok(R.log.some(l => /효과 발동/.test(l) && /4장|突撃|덱/.test(l)) || R.eff || R.log.some(l => /狙われた|KID|AS/.test(l)), '2 새 카드가 부여 능력 이어받음 — 로그: ' + R.log.slice(-5).join(' | ').slice(0, 220));
  ok((R.cards[k].tab || []).length === 1 && (R.cards[a].tab || []).length === 0, '3 tab 이전: 새 카드 1 / 원래 카드 0'); }
{ const { R } = run(false); ok(R.log.some(l => /효과 발동/.test(l)) || R.eff, '4 (대조) 변장 없이도 발동: ' + R.log.slice(-4).join(' | ').slice(0, 200)); }
console.log(`\ngrant_disguise_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
