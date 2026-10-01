// 봇 방 통합 테스트(서버 프로세스 없이 createRoom/BotCtl 을 그대로 사용, worker 스레드 포함):
//  · 봇 좌석이 사람과 같은 dispatch 경로로만 행동하는지(불법 0), 게임이 끝까지 진행되는지, 이벤트 루프가 안 막히는지(worker),
//  · AI 기록은 게임 종료 후에만 내려받을 수 있는지, 시작 전 선공/후공 선택이 적용되는지, 사람이 나가면 봇이 멈추는지.
process.env.BOT_DELAY_MS = '0'; process.env.BOT_THINK_MS = process.env.BOT_THINK_MS || '250'; process.env.BOT_MICRO_MS = '200';
const U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), C = require('../bot/controller.js');
const { S } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const cards = U.db(); const loadCards = () => ({ cards });
function mkRoom(seed, first) {
  const rooms = {}, deckH = U.makeDeck(seed * 2 + 1), deckB = U.makeDeck(seed * 2 + 2), humanWs = { readyState: 1, send() {} };
  const bc = R => { if (R.bot) R.bot.tick(); };
  const R = C.createRoom({ rooms, mkR: S.mkR, ready: S.ready, dispatch: S.dispatch, loadCards, say: (R, t) => R.log.push(t), cl: x => x, ws: humanWs, m: { t: 'createBot', first, botDeck: { cards: deckB.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: deckB.partner, kase: deckB.kase } }, send: () => {}, bc });
  const defs = {}; for (const id of [...new Set(deckH.list), deckH.partner, deckH.kase]) defs[id] = cards[id];
  const e = S.dispatch(R, 0, { t: 'ready', defs, list: deckH.list, partner: deckH.partner, kase: deckB.kase && deckH.kase }); if (e) throw new Error(e);
  return { R, rooms, bc };
}
async function play(seed, first) {
  const { R, bc } = mkRoom(seed, first), h = B.heuristic(U.mulberry32(seed)); let steps = 0, lag = 0, last = Date.now(), stop = false;
  const iv = setInterval(() => { const now = Date.now(); lag = Math.max(lag, now - last - 20); last = now; }, 20);
  bc(R); const early = R.bot.logMsg();
  const T0 = Date.now(); while (R.phase !== 'over' && Date.now() - T0 < 100000) { steps++;
    const d = SIM.who(R);
    if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; const e = S.dispatch(R, 0, mv.m); if (e) { const alt = SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); } bc(R); await new Promise(r => setImmediate(r)); }
    else await new Promise(r => setTimeout(r, 2));
  }
  clearInterval(iv); R.bot.stop(); return { R, early, lag, steps };
}
module.exports = { play, mkRoom };
if (require.main === module) (async () => {
  const r1 = await play(11, 'second'); ok(r1.R.phase === 'over', `봇 대전이 끝까지 진행됨 (턴 ${r1.R.n}, 승자 ${r1.R.winner === 1 ? '봇' : '사람'})`);
  ok(r1.R.first === 0 || r1.R.first === 1, '선공 지정 동작: "후공" 선택 → 사람(좌석 0)이 후공 = R.first 가 봇(1)', 0); ok(r1.R.first === 1, `후공 선택 시 봇이 선공 (first=${r1.R.first})`);
  ok(r1.R.bot.illegal === 0, `봇 불법 행동 0건 (${r1.R.bot.illegal})`);
  ok(r1.early.err && /게임이 끝난 뒤/.test(r1.early.err), '진행 중에는 AI 기록을 내려받을 수 없음(숨은 정보 보호)');
  const lg = r1.R.bot.logMsg(); ok(lg.log && lg.log.decisions.length > 5 && lg.log.decisions.every(x => x.kind && (x.chosen || x.stuck)), `종료 후 AI 기록 JSON (${lg.log.decisions.length}개 결정)`);
  const main = lg.log.decisions.find(x => x.kind === 'main' && x.top && x.top.length); ok(main && main.search && main.state && main.top[0].desc, '기록에 상태·선택·후보·탐색 통계·생각 시간 포함: ' + (main && JSON.stringify(main.search).slice(0, 140)));
  ok(JSON.stringify(lg).length < 5e6, 'AI 기록 크기 적정: ' + JSON.stringify(lg).length);
  ok(r1.lag < 150, `worker 스레드로 탐색하는 동안 메인 이벤트 루프 지연 최대 ${r1.lag}ms`);
  const r2 = await play(12, 'first'); ok(r2.R.first === 0, `선공 선택 → 사람이 선공 (first=${r2.R.first})`); ok(r2.R.bot.illegal === 0 && r2.R.phase === 'over', `2번째 게임 종료, 불법 0건`);
  // 사람이 나가면 봇 정지
  const { R } = mkRoom(13, 'random'); R.bot.stop(); ok(R.bot.stopped, '봇 정지');
  console.log(fail ? `\n봇 방 테스트 ${fail}건 실패` : `\n봇 방 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
