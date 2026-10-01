// 전체 카드 DB(1,251장: data/cards.json 또는 BOT_TEST_DB/CARDS_DB)로 무작위 합법 덱을 만들어 BOT vs BOT 를 돌린다.
// 새 효과(primitive/핸들러)가 봇 시뮬레이션에서도 같은 엔진으로 처리되는지(교착/불법수/상태 손상/예외 0건) 확인한다.
const U = require('./bot_util.js'), SP = require('./bot_selfplay.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
process.env.BOT_TEST_DB = process.env.BOT_TEST_DB || process.env.CARDS_DB || require('path').join(__dirname, '../data/cards.json');
const db = JSON.parse(require('fs').readFileSync(process.env.BOT_TEST_DB, 'utf8')).cards;
if (Object.keys(db).length < 1200) { console.log('SKIP: 전체 카드 DB 가 아님'); process.exit(0); }
U.setDb(db);
const N = +arg('games', 20), SEED = +arg('seed', 900), NODES = +arg('nodes', 400), kinds = [arg('a', 'expert'), arg('b', 'expert')];
const types = {}; for (const c of Object.values(db)) types[c.type] = (types[c.type] || 0) + 1; console.log('스트레스 DB', JSON.stringify(types));
let done = 0, illegal = 0, stall = 0, corrupt = 0, crash = 0, a = 0, b = 0, turns = 0; const bad = [];
for (let g = 0; g < N; g++) { const seed = SEED + g;
  try { const st = SP.playGame(seed, U.makeDeck(seed * 2 + 1), U.makeDeck(seed * 2 + 2), kinds, g & 1); done++; illegal += st.illegal; turns += st.turns; if (st.stall) { stall++; bad.push({ seed, stall: st.stall, e: st.errors.slice(0, 2) }); } else if (st.winner === 0) a++; else b++; if (st.corrupt) corrupt++; if (st.errors.length) bad.push({ seed, e: st.errors.slice(0, 3) }); }
  catch (e) { crash++; bad.push({ seed, crash: String(e.stack).slice(0, 500) }); } }
console.log(JSON.stringify({ games: N, done, illegal, stall, corrupt, crash, a, b, avgTurns: turns / Math.max(1, done), bad: bad.slice(0, 6) }));
process.exit(illegal || stall || corrupt || crash ? 1 : 0);
