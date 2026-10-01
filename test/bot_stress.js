// 효과가 다양한 카드(전체 DB 대표 카드 fixture: 드로우/서치/선택/세트/플래시/컷인/변장 …)로 BOT vs BOT 스트레스 테스트.
// 카드 DB(data/cards.json)는 건드리지 않고, 테스트 전용 메모리 DB 를 만든다 (색은 전부 red 로 통일해 덱 구성이 쉽도록).
const U = require('./bot_util.js'), SP = require('./bot_selfplay.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const db = require('./bot_stressdb.js').buildStressDb();
U.setDb(db);
const N = +arg('games', 20), SEED = +arg('seed', 900), NODES = +arg('nodes', 400), kinds = [arg('a', 'expert'), arg('b', 'expert')];
const types = {}; for (const c of Object.values(db)) types[c.type] = (types[c.type] || 0) + 1; console.log('스트레스 DB', JSON.stringify(types));
let done = 0, illegal = 0, stall = 0, corrupt = 0, crash = 0, a = 0, b = 0, turns = 0; const bad = [];
for (let g = 0; g < N; g++) { const seed = SEED + g;
  try { const st = SP.playGame(seed, U.makeDeck(seed * 2 + 1), U.makeDeck(seed * 2 + 2), kinds, g & 1); done++; illegal += st.illegal; turns += st.turns; if (st.stall) { stall++; bad.push({ seed, stall: st.stall, e: st.errors.slice(0, 2) }); } else if (st.winner === 0) a++; else b++; if (st.corrupt) corrupt++; if (st.errors.length) bad.push({ seed, e: st.errors.slice(0, 3) }); }
  catch (e) { crash++; bad.push({ seed, crash: String(e.stack).slice(0, 500) }); } }
console.log(JSON.stringify({ games: N, done, illegal, stall, corrupt, crash, a, b, avgTurns: turns / Math.max(1, done), bad: bad.slice(0, 6) }));
process.exit(illegal || stall || corrupt || crash ? 1 : 0);
