// 덱 파일(conan-deck JSON) 하나로 BOT 두 종류를 대결: node test/bot_match.js --deck deck.json --a classic --b spec:pro --games 40 --nodes 3000 --seed 1 [--deckB other.json]
// 좌석/선후공을 4가지 조합(A좌석 0/1 × 선공 0/1)으로 돌려 편향을 제거하고, A 기준 승/패, 선공·후공별 승률, 평균 턴을 출력.
const fs = require('fs'), U = require('./bot_util.js'), { playGame } = require('./bot_selfplay.js'), { parseDeckFile } = require('../bot/specialists/deckfile.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const load = f => { const r = parseDeckFile(fs.readFileSync(f, 'utf8')); if (!r.ok) throw new Error(f + ': ' + r.errors.join('; ')); return { list: r.deck.list, partner: r.deck.partner, kase: r.deck.kase, name: r.deck.name }; };
const dA = load(arg('deck', '')), dB = arg('deckB', '') ? load(arg('deckB', '')) : dA, A = arg('a', 'expert'), B = arg('b', 'expert'), GAMES = +arg('games', 20), SEED0 = +arg('seed', 1), OFF = +arg('offset', 0);
const SIM = require('../bot/simulate.js'), { S } = U, { fcount } = S;
// 행동 품질 지표(봇 종류별): 조기 힌트 / 이미 이기는 공격에 컷인 / 죽는 가드 / 낼 캐릭터가 있는데 턴 종료
const Q = {}; const qk = k => Q[k] || (Q[k] = { decisions: 0, earlyHint: 0, hints: 0, wasteCutin: 0, cutins: 0, deadGuard: 0, guards: 0, endNoChar: 0, turnsEnded: 0 });
const hooks = { onDecision(R, d, mv, info, s) {
  const q = qk(s.spec ? 'spec:' + s.spec : 'classic'), seat = d.seat, P = R.P[seat]; q.decisions++;
  if (mv.tag === 'hint') { q.hints++; const tgt = R.first === seat ? 8 : 9; if (fcount(R, seat) + (P.pIn ? 0 : 1) < tgt) q.earlyHint++; }
  if (mv.tag === 'cin') { q.cutins++; const sb = R.sub; if (sb && sb.type === 'contact' && R.cards[sb.atk].o === seat && S.ap(R, sb.atk) > S.ap(R, sb.def)) q.wasteCutin++; }
  if (mv.tag === 'guard' && mv.m.id != null) { q.guards++; const sb = R.sub; if (sb && S.ap(R, mv.m.id) <= S.ap(R, sb.atk)) q.deadGuard++; }
  if (mv.tag === 'end') { q.turnsEnded++; if (!R.fl.played && !R.fl.hint && P.field.length < 5 && SIM.genMoves(R, () => 0).some(m => m.tag === 'play' && S.D(R, m.m.id).type === 'char')) q.endNoChar++; } } };
const res = { a: 0, b: 0, stall: 0, aFirst: [0, 0], aSecond: [0, 0], turns: 0, illegal: 0, byWhy: {} }; const t0 = Date.now();
for (let g = OFF; g < OFF + GAMES; g++) {
  const aSeat = g & 1, first = (g >> 1) & 1, kinds = aSeat === 0 ? [A, B] : [B, A], decks = aSeat === 0 ? [dA, dB] : [dB, dA], seed = SEED0 + (g >> 2);
  const st = playGame(seed * 100 + g, decks[0], decks[1], kinds, first, hooks);
  res.turns += st.turns; res.illegal += st.illegal;
  if (st.stall || st.winner == null) { res.stall++; continue; }
  const aWon = st.winner === aSeat; if (aWon) res.a++; else res.b++;
  const slot = (aSeat === first ? res.aFirst : res.aSecond); slot[1]++; if (aWon) slot[0]++;
  const w = (st.why || '').replace(/^\S+\s*/, '').slice(0, 14); res.byWhy[w] = (res.byWhy[w] || 0) + 1;
}
const n = res.a + res.b; console.log(JSON.stringify({ A, B, deck: dA.name, games: n, A_wins: res.a, B_wins: res.b, A_winrate: +(res.a / Math.max(1, n)).toFixed(3), A_first: res.aFirst, A_second: res.aSecond, avgTurns: +(res.turns / Math.max(1, n)).toFixed(1), stall: res.stall, illegal: res.illegal, why: res.byWhy, sec: Math.round((Date.now() - t0) / 1000), quality: Q }));
