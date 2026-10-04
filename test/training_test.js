// v1.12.0 연습 모드(Training Script) 테스트: 고정 시드로 선공/후공 스크립트, 카드 확보/보존, 어시스트, 제거 순서, 사람 vs 사람 무영향, 카드 데이터 불변
process.env.BOT_DELAY_MS = '0'; process.env.BOT_THINK_MS = '40'; process.env.BOT_MICRO_MS = '40';
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), C = require('../bot/controller.js'), T = require('../bot/training.js');
const { S } = U, FX = S.FX; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const cards = U.db(), loadCards = () => ({ cards });
const hashDB = () => crypto.createHash('sha256').update(JSON.stringify(cards)).digest('hex');
const dbHash0 = hashDB(), fileHash0 = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../data/cards.json'))).digest('hex');
// 봇 덱: 노란색 사건 + 코스트 2~9 캐릭터를 고르게 (연습 스크립트가 쓸 수 있는 덱). 3 코스트 없는 덱 변형도 지원.
function botDeck(seed, opt = {}) {
  const all = Object.values(cards), kase = all.find(c => c.type === 'case' && c.color === 'yellow'), partner = all.find(c => c.type === 'partner' && U.cols(c).every(x => U.cols(kase).includes(x)));
  const rnd = U.mulberry32(seed), chars = all.filter(c => c.type === 'char' && c.color === 'yellow' && !(opt.no3 && +c.lv === 3)), list = [], cnt = {};
  const byLv = {}; chars.forEach(c => (byLv[+c.lv] = byLv[+c.lv] || []).push(c)); const lvs = Object.keys(byLv).map(Number).filter(x => x >= 2 && x <= 9);
  let g = 0; while (list.length < 40 && g++ < 5000) { const lv = lvs[list.length % lvs.length], a = byLv[lv], c = a[rnd() * a.length | 0]; if ((cnt[c.id] || 0) >= 3) continue; cnt[c.id] = (cnt[c.id] || 0) + 1; list.push(c.id); }
  return { list, partner: partner.id, kase: kase.id, cnt };
}
function mkRoom(seed, first, o = {}) {
  const rooms = {}, deckH = o.humanDeck ? botDeck(seed + 100) : U.makeDeck(seed * 2 + 1), bd = o.deck || botDeck(seed), rec = [], humanWs = { readyState: 1, send() {} };
  const disp = (R, seat, m) => { if (seat === 1 && m.t === 'act' && !o.noRec) { const r = { n: R.n, a: m.a }; if (m.a === 'play') { r.lv = FX.lvOf(R, m.id); r.id = m.id; r.rep = m.rep; r.viaHint = !!R.fl.hw; r.fcount = S.fcount(R, 1); } rec.push(r); } return S.dispatch(R, seat, m); };
  const R = C.createRoom({ rooms, mkR: S.mkR, ready: S.ready, dispatch: disp, loadCards, say: (R, t) => R.log.push(t), cl: x => x, ws: humanWs, m: { t: 'createBot', first, training: o.training !== false, bot: o.bot, botDeck: { cards: bd.list.reduce((a, id) => (a[id] = (a[id] || 0) + 1, a), {}), partner: bd.partner, kase: bd.kase } }, send() {}, bc: R => { if (R.bot) R.bot.tick(); } });
  const defs = {}; for (const id of [...new Set(deckH.list), deckH.partner, deckH.kase]) defs[id] = cards[id];
  const e = S.dispatch(R, 0, { t: 'ready', defs, list: deckH.list, partner: deckH.partner, kase: deckH.kase }); if (e) throw new Error(e);
  return { R, rec, bd };
}
const owned = R => { const seen = {}; for (const s of [0, 1]) { const P = R.P[s]; for (const z of ['deck', 'hand', 'file', 'evid', 'rem', 'field', 'pa']) for (const id of P[z]) seen[id] = (seen[id] || 0) + 1; for (const id of [P.partner, P.kase]) if (id != null) seen[id] = (seen[id] || 0) + 1; } return seen; };
const botIds = R => Object.keys(R.cards).filter(id => R.cards[id].o === 1);
async function run(seed, first, o = {}, maxTurn = 14) {
  const { R, rec, bd } = mkRoom(seed, first, o), h = B.heuristic(U.mulberry32(seed)); const ids0 = botIds(R).length;
  const snap = []; let last = -1;
  const bc = () => R.bot.tick(); bc(); const T0 = Date.now();
  while (R.phase !== 'over' && R.n <= maxTurn && Date.now() - T0 < 90000) {
    const d = SIM.who(R);
    if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; const e = S.dispatch(R, 0, mv.m); if (e) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); bc(); await new Promise(r => setImmediate(r)); }
    else await new Promise(r => setTimeout(r, 2));
    if (R.n !== last) { last = R.n; snap.push({ n: R.n, own: botIds(R).length, seen: Object.values(owned(R)).every(c => c === 1) }); }
  }
  R.bot.stop(); return { R, rec, bd, snap, ids0 };
}
// 한 AI 턴의 기록 → 사용한 코스트 열 / 힌트 수 / 어시스트
const turnOf = (rec, n) => { const r = rec.filter(x => x.n === n && ['play', 'hint', 'assist'].includes(x.a)); return { plays: r.filter(x => x.a === 'play').map(x => x.lv), seq: r.map(x => x.a === 'play' ? x.lv : x.a === 'hint' ? 'H' : 'A'), hints: r.filter(x => x.a === 'hint').length, assists: r.filter(x => x.a === 'assist').length }; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // ── 1. 선공 스크립트: 고정 시드
  const f = await run(7, 'second');   // 사람 후공 → AI 선공
  ok(f.R.first === 1, `선공 스크립트: AI 선공 (first=${f.R.first})`);
  const aiTurnsF = [1, 3, 5, 7, 9, 11, 13].filter(n => n <= f.R.n);
  const expF = [[2], [4], [6], [8, 7], [9, 8, 7], [9, 8, 7], [9, 8, 7]];
  aiTurnsF.forEach((n, i) => { const t = turnOf(f.rec, n); if (f.R.phase === 'over' && n === f.R.n) return; const skipped = f.R.log.some(l => /^\[TRAINING\] AI 덱에 사용 가능한/.test(l)); ok(eq(t.plays, expF[i]) || (skipped && t.plays.length >= 1), `선공 T${i + 1}(R.n=${n}): 사용 코스트 ${JSON.stringify(t.plays)} = ${JSON.stringify(expF[i])} 순서 ${t.seq.join('→')}`); });
  const t4 = turnOf(f.rec, 7); ok(eq(t4.seq.filter(x => x !== 'A'), [8, 'H', 7]), `선공 T4: 8 → 넥스트 힌트 → 7 (${t4.seq.join('→')})`);
  const t5 = turnOf(f.rec, 9); if (t5.plays.length) ok(eq(t5.seq.filter(x => x !== 'A'), [9, 'H', 8, 'H', 7]), `선공 T5: 9 → 힌트 → 8 → 힌트 → 7 (${t5.seq.join('→')})`);
  ok(turnOf(f.rec, 1).assists >= 1 && turnOf(f.rec, 3).assists >= 1, '선공 T1·T2: 파트너 어시스트 사용 (FILE 부족분)');
  ok(f.R.log.some(l => /^\[TRAINING\] .*코스트 전개용 카드 확보/.test(l)) || f.rec.filter(x => x.a === 'play').length > 0, '카드 확보 로그 또는 손패 전개');
  ok(f.R.bot.illegal === 0, `불법 행동 0 (${f.R.bot.illegal})`);
  ok(f.snap.every(s => s.own === f.ids0 && s.seen), `카드 보존: AI 카드 수 ${f.ids0} 유지, 모든 카드가 정확히 한 구역에만 존재 (${f.snap.length}개 시점)`);
  const defs = new Set([...f.bd.list, f.bd.partner, f.bd.kase]); ok(botIds(f.R).every(id => defs.has(f.R.cards[id].d.split(':')[1])), '등록되지 않은 카드 생성 없음 (모든 AI 카드가 등록 덱의 정의)');
  ok(f.R.log.some(l => l.startsWith('[TRAINING] ')), '[TRAINING] 로그 존재: ' + (f.R.log.find(l => l.startsWith('[TRAINING] ')) || ''));
  const draws = f.R.log.filter(l => /^\[TRAINING\].*코스트 전개용 카드 확보/.test(l)).length; console.log(`  (선공 게임 덱→손패 확보 ${draws}회, 제거 이벤트 ${(f.R.bot.trainEvents || []).length}회, R.n=${f.R.n})`);
  // ── 2. 후공 스크립트
  const s = await run(9, 'first');
  ok(s.R.first === 0, `후공 스크립트: AI 후공 (first=${s.R.first})`);
  const expS = [[3], [5], [7], [9, 8, 7]]; [2, 4, 6, 8].forEach((n, i) => { if (n > s.R.n || (s.R.phase === 'over' && n === s.R.n)) return; const t = turnOf(s.rec, n); ok(eq(t.plays, expS[i]), `후공 T${i + 1}(R.n=${n}): ${JSON.stringify(t.plays)} = ${JSON.stringify(expS[i])} (${t.seq.join('→')})`); });
  const s4 = turnOf(s.rec, 8); if (s4.plays.length) ok(eq(s4.seq.filter(x => x !== 'A'), [9, 'H', 8, 'H', 7]), `후공 T4: 9→NH→8→NH→7 (${s4.seq.join('→')})`);
  ok(s.R.bot.illegal === 0 && s.snap.every(x => x.own === s.ids0 && x.seen), '후공: 불법 0, 카드 보존');
  // ── 3. 후공 T1: 덱에 3코스트 캐릭터가 없으면 2코스트
  const n3 = await run(5, 'first', { deck: botDeck(5, { no3: true }) }, 3); ok(eq(turnOf(n3.rec, 2).plays, [2]), `후공 T1: 3코스트 없는 덱 → 2코스트 (${JSON.stringify(turnOf(n3.rec, 2).plays)})`);
  // ── 4. 손패에 없는 카드는 덱에서 확보 (T1 시작 손패에 해당 코스트가 없도록 모든 시드에서 로그 확인) + 4코스트 이상 연쇄
  let fetched = 0, handPlays = 0; for (const sd of [21, 22, 23]) { const g = await run(sd, 'second', {}, 7); fetched += g.R.log.filter(l => /^\[TRAINING\].*코스트 전개용 카드 확보/.test(l)).length; handPlays += g.rec.filter(x => x.a === 'play').length; ok(g.R.bot.illegal === 0 && g.snap.every(x => x.own === g.ids0 && x.seen), `시드 ${sd}: 불법 0 / 카드 보존`); }
  ok(fetched > 0, `손패에 없는 카드를 덱에서 확보한 사례 ${fetched}회 (전개 ${handPlays}회) — 로그 "[TRAINING] N코스트 전개용 카드 확보"`);
  // ── 5. 제거: 코스트 높은 순, 필드 장수 < 제거 수 처리 (상태를 직접 구성한 단위 검사)
  async function removalCase(want, lvs) {
    const { R } = mkRoom(31, 'second', { noRec: true, humanDeck: true }); const h = B.heuristic(U.mulberry32(3)); let g = 0;
    while (g++ < 400 && !(R.phase === 'play' && R.turn === 1 && SIM.who(R).kind === 'main' && R.n >= 1)) { const d = SIM.who(R); if (R.phase === 'over') break; if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; if (S.dispatch(R, 0, mv.m)) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); R.bot.tick(); } else { R.bot.tick(); await new Promise(r => setTimeout(r, 3)); } }
    R.bot.stop(); const ctl = R.bot; ctl.stopped = false; const P = R.P[0];
    // 사람 현장을 지정한 코스트들로 구성 (사람 덱의 캐릭터를 사용 — 실제 카드)
    P.field.splice(0).forEach(id => P.deck.push(id)); const pool = Object.keys(R.cards).map(Number).filter(id => R.cards[id].o === 0 && FX.lvOf(R, id) >= 1 && S.D(R, id).type === 'char' && [...P.deck, ...P.hand].includes(id)), used = new Set(), ids = [];
    for (const lv of lvs) { const id = pool.find(x => !used.has(x) && FX.lvOf(R, x) === lv); if (!id) return null; used.add(id); P.deck = P.deck.filter(x => x !== id); P.hand = P.hand.filter(x => x !== id); P.field.push(id); R.cards[id].st = 'a'; ids.push(id); }
    ctl.trn = { n: R.n, p: { k: 9, steps: [], rm: want }, i: 0, abort: false, removed: false, logged: true };
    const before = P.field.slice(), remBefore = P.rem.length; T.next(ctl, SIM.who(R)); const gone = before.filter(x => !P.field.includes(x)), levels = before.map(x => FX.lvOf(R, x)).sort((a, b) => b - a);
    const exp = levels.slice(0, Math.min(want, before.length)), goneLv = gone.map(x => FX.lvOf(R, x)).sort((a, b) => b - a);
    return { gone, goneLv, exp, remAdded: P.rem.length - remBefore, left: P.field.length, n: before.length, log: R.log.filter(l => l.startsWith('[TRAINING] 연습 상황')).length, ok: gone.every(x => owned(R)[x] === 1 && (P.rem.includes(x) || P.pa.includes(x))), inRem: gone.filter(x => P.rem.includes(x)).length };
  }
  for (const [want, lvs] of [[4, [3, 9, 5, 7, 2]], [4, [3, 9, 5, 7]], [4, [6, 2, 8]], [4, [5, 4]], [4, [6]], [4, []], [2, [2, 9, 6, 6]], [1, [4, 8, 3]]]) {
    const r = await removalCase(want, lvs); if (!r) { ok(false, `제거 케이스 구성 실패 ${JSON.stringify(lvs)}`); continue; }
    ok(eq(r.goneLv, r.exp) && r.left === r.n - r.exp.length && r.ok, `제거 ${want}장 / 현장 ${JSON.stringify(lvs)} → 제거된 코스트 ${JSON.stringify(r.goneLv)} (기대 ${JSON.stringify(r.exp)}), 남은 ${r.left}장, 리무브 구역(자체 MR 능력은 파트너 에리어) 이동 ${r.ok}, 리무브 ${r.inRem}장, 로그 ${r.log}회`);
  }
  // ── 6. 사람 vs 사람: 연습 모드 무영향
  { const R = S.mkR('HH1'), d1 = U.makeDeck(41), d2 = U.makeDeck(42); [d1, d2].forEach((d, s) => { const defs = {}; for (const id of [...new Set(d.list), d.partner, d.kase]) defs[id] = cards[id]; const e = S.dispatch(R, s, { t: 'ready', defs, list: d.list, partner: d.partner, kase: d.kase }); if (e) throw new Error(e); });
    const h = [B.heuristic(U.mulberry32(1)), B.heuristic(U.mulberry32(2))]; let g = 0; while (R.phase !== 'over' && R.n < 14 && g++ < 3000) { const d = SIM.who(R); if (!d) break; const mv = h[d.seat](R, d.seat); if (!mv) break; if (S.dispatch(R, d.seat, mv.m)) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, d.seat, m.m)); }
    ok(!R.bot && !R.log.some(l => l.includes('[TRAINING]')), `사람 vs 사람 ${R.n}턴 진행: 봇/연습 로그 없음`); }
  // ── 7. 기본값(꺼짐)·전문 봇에서는 연습 스크립트 비활성
  { const off = mkRoom(7, 'second', { training: false }); ok(off.R.bot.training === false, '연습 모드 옵션이 꺼져 있으면 비활성 (기본값)'); off.R.bot.stop();
    const g = await run(7, 'second', { training: false }, 6); ok(!g.R.log.some(l => l.includes('[TRAINING]')), '꺼진 상태로 6턴 진행: [TRAINING] 로그 없음'); }
  // ── 8. 카드 데이터 불변
  ok(hashDB() === dbHash0, '카드 DB(메모리) 연습 게임 전후 동일');
  ok(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../data/cards.json'))).digest('hex') === fileHash0, 'data/cards.json 변경 없음');
  ok(!JSON.stringify(cards).includes('training'), '카드 데이터에 연습 모드 관련 필드/효과 없음');
  console.log(fail ? `\n연습 모드 테스트 ${fail}건 실패` : `\n연습 모드 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})();
