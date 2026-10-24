// 사용: node tools/wg_h2h.js [판수] [버전A] [버전B]  — 두 전략 버전 교차 대전(선후공 교대) 승률·정리율
// v0.17(A) vs v0.16(B) 교차 대전: 승률 + 각 버전의 턴당 클리어율
const ROOT = require('path').resolve(__dirname, '..');
const SP = require(ROOT + '/bot/whitegreen/selfplay.js');
const n = +(process.argv[2] || 10), vA = process.argv[3] || '0.17', vB = process.argv[4] || '0.16';
const res = { [vA]: { w: 0, turnsOpp: 0, clr: 0, kills: 0, opp: 0 }, [vB]: { w: 0, turnsOpp: 0, clr: 0, kills: 0, opp: 0 } }; let games = 0;
for (let seed = 1; seed <= n; seed++) for (const swap of [0, 1]) {
  const va = swap ? vB : vA, vb = swap ? vA : vB; let prevOpp = null, prevSeat = null, lastN = 0, startOpp = null;
  const m = SP.playMatch({ seed, first: seed % 2, frames: false, versionA: va, versionB: vb, onStep: (rec, R) => {
    if (R.phase !== 'play') return;
    if (R.n !== lastN) { if (startOpp && prevOpp) { const v = prevSeat === 0 ? va : vb; if (startOpp.length) { res[v].turnsOpp++; res[v].opp += startOpp.length; const k = startOpp.filter(id => !prevOpp.includes(id)).length; res[v].kills += k; if (!prevOpp.length) res[v].clr++; } }
      lastN = R.n; prevSeat = R.turn; startOpp = R.P[1 - R.turn].field.slice(); }
    prevOpp = R.P[1 - prevSeat].field.slice(); } });
  games++; const w = m.result.winner === 'A' ? va : m.result.winner === 'B' ? vb : null; if (w) res[w].w++;
  console.log(`seed ${seed} A=${va} B=${vb} winner=${m.result.winner}(${w}) turns=${m.result.turns}`); }
for (const [v, r] of Object.entries(res)) console.log(v, 'wins', r.w, '/', games, 'clear', r.clr, '/', r.turnsOpp, `(${(100 * r.clr / r.turnsOpp).toFixed(0)}%)`, 'kills/turn', (r.kills / r.turnsOpp).toFixed(2), 'opp/turn', (r.opp / r.turnsOpp).toFixed(2));
