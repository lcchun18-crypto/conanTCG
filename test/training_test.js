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
  const rnd = U.mulberry32(seed), RMFX = /"(remove|deckrem|paRemove|moveUnder|remToDeck)"/, chars = all.filter(c => c.type === 'char' && c.color === 'yellow' && !(opt.no3 && +c.lv === 3) && !(opt.noLv && opt.noLv.includes(+c.lv)) && !(opt.noRmFx && +c.lv >= 7 && RMFX.test(JSON.stringify(c.ab || [])))), list = [], cnt = {};
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

const turnOf = (rec, n) => { const r = rec.filter(x => x.n === n && ['play', 'hint', 'assist'].includes(x.a)); return { plays: r.filter(x => x.a === 'play').map(x => x.lv), seq: r.map(x => x.a === 'play' ? x.lv : x.a === 'hint' ? 'H' : 'A') }; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = seq => seq.filter(x => x !== 'A');   // (스크립트 이후 Expert 가 추가 행동을 할 수 있으므로 스크립트 길이만큼의 접두부를 비교)
const pre = (seq, exp) => strip(seq).slice(0, exp.length);
const FIRST_PLAN = k => k <= 3 ? [[2], [4], [6]][k - 1] : k === 4 ? [8, 'H', 7] : [9, 'H', 8, 'H', 7];
const SECOND_PLAN = k => k === 1 ? [3] : k === 2 ? [5] : k === 3 ? [7] : [9, 'H', 8, 'H', 7];
const RM_TURN_FIRST = k => k >= 4, RM_TURN_SECOND = k => k >= 3;
// 상태 흩뜨리기: AI 의 7/8/9 코스트 캐릭터를 전부 손패에서 빼서 지정 구역에 둔다 (카드 복제 없음 — 인스턴스를 옮길 뿐)
function scatter(R, seat, zones) {
  const P = R.P[seat]; const ids = Object.keys(R.cards).map(Number).filter(id => R.cards[id].o === seat && !R.P[0].field.includes(id) && !R.P[1].field.includes(id) && S.D(R, id).type === 'char' && [7, 8, 9].includes(FX.lvOf(R, id)));
  for (const id of ids) { for (const z of ['hand', 'deck', 'rem', 'evid', 'file', 'pa']) { const i = P[z].indexOf(id); if (i >= 0) P[z].splice(i, 1); } }
  for (const id of ids) { const z = zones[FX.lvOf(R, id)]; if (z === 'evid') R.cards[id].up = false; P[z].push(id); }
  return ids.length;
}
async function game(seed, first, o = {}, maxN = 14) {
  const { R, rec, bd } = mkRoom(seed, first, o), h = B.heuristic(U.mulberry32(seed)); const ids0 = botIds(R).length, tl = [], snap = []; let lastN = -1, scat = -1; const endField = {};
  const origEnd = rec.push.bind(rec);
  const bc = () => R.bot.tick(), after = () => { if (o.scatter && R.phase === 'play' && R.turn === 1 && R.n !== scat && R.n >= (o.scatterFrom || 1) && SIM.who(R) && SIM.who(R).kind === 'main') { scat = R.n; scatter(R, 1, o.scatter); } bc(); };
  after(); const T0 = Date.now();
  while (R.phase !== 'over' && R.n <= maxN && Date.now() - T0 < 120000) {
    const d = SIM.who(R);
    if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; const e = S.dispatch(R, 0, mv.m); if (e) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); after(); await new Promise(r => setImmediate(r)); }
    else { if (d && d.seat === 1) bc(); await new Promise(r => setTimeout(r, 2)); }
    if (R.n !== lastN) { if (lastN > 0 && R.P[0]) endField[lastN] = R.P[0].field.length; lastN = R.n; snap.push({ n: R.n, own: botIds(R).length, seen: Object.values(owned(R)).every(c => c === 1) }); }
  }
  R.bot.stop(); return { R, rec, bd, snap, ids0, endField };
}
// 한 AI 턴 기록 검증(건너뜀 허용 없음). 마지막 진행 중인 턴은 제외
function checkTurns(g, first, label, upTo) {
  const ai = first ? [1, 3, 5, 7, 9, 11, 13] : [2, 4, 6, 8, 10, 12, 14];
  ai.forEach((n, i) => { if (n >= upTo) return; const k = i + 1, exp = first ? FIRST_PLAN(k) : SECOND_PLAN(k), t = turnOf(g.rec, n);
    ok(eq(pre(t.seq, exp), exp), `${label} T${k}(R.n=${n}): ${strip(t.seq).join('→')} = ${exp.join('→')}${t.seq.includes('A') ? ' (어시스트 사용)' : ''}`); });
}
(async () => {
  // ── 1. 선공(자연 진행): 1~3턴 2/4/6, 4턴 8→H→7, 5턴~ 9→H→8→H→7 반복. 건너뜀 허용 없음. 제거 턴마다 사람 현장 0장
  const f = await game(7, 'second', {}, 14); ok(f.R.first === 1, 'AI 선공'); checkTurns(f, true, '선공', Math.min(f.R.n, 13));
  ok(f.R.bot.illegal === 0, `불법 행동 0 (${f.R.bot.illegal})`);
  ok(f.snap.every(s => s.own === f.ids0 && s.seen), `카드 보존: AI 카드 ${f.ids0}장 유지, 모든 카드 인스턴스가 정확히 한 구역에만 존재 (${f.snap.length}개 시점)`);
  const defs = new Set([...f.bd.list, f.bd.partner, f.bd.kase]); ok(botIds(f.R).every(id => defs.has(f.R.cards[id].d.split(':')[1])), '등록 덱 밖의 카드 생성 없음');
  const rmEv = (f.R.bot.trainEvents || []).filter(e => e.kind === 'TRAINING_FORCE_REMOVE'); ok(rmEv.length >= 1 && f.R.log.some(l => l.startsWith('[TRAINING] TRAINING_FORCE_REMOVE')), `TRAINING_FORCE_REMOVE 실행 ${rmEv.length}회 + 로그`);
  ok(rmEv.every(e => f.endField[e.n] === 0), `제거 턴 종료 시 사람 현장 0장 (${rmEv.map(e => 'R.n=' + e.n + ':' + f.endField[e.n]).join(', ')})`);
  ok(f.R.log.some(l => /^\[TRAINING\].*코스트 전개용 카드 확보/.test(l)), '카드 확보 로그 "[TRAINING] N코스트 전개용 카드 확보"');
  // ── 2. 후공(자연 진행): 1~3턴 3/5/7, 4턴~ 9→H→8→H→7 계속 반복 (5턴 이후 포함)
  const s = await game(9, 'first', {}, 14); ok(s.R.first === 0, 'AI 후공'); checkTurns(s, false, '후공', Math.min(s.R.n, 14));
  ok(s.R.n >= 12, `후공 게임이 5턴 이후(R.n=${s.R.n})까지 진행됨`); ok(s.R.bot.illegal === 0 && s.snap.every(x => x.own === s.ids0 && x.seen), '후공: 불법 0, 카드 보존');
  ok(turnOf(s.rec, 10).plays.length >= 3 && turnOf(s.rec, 12).plays.length >= 3, '후공 5·6턴: 계속 9→8→7 반복 (Expert 로 넘어가지 않음)');
  // ── 3. 후공 1턴: 등록 덱에 3코스트 캐릭터가 전혀 없으면 2코스트
  const n3 = await game(5, 'first', { deck: botDeck(5, { no3: true }) }, 3); ok(eq(turnOf(n3.rec, 2).plays, [2]), `후공 1턴: 3코스트 없는 덱 → 2코스트 (${JSON.stringify(turnOf(n3.rec, 2).plays)})`);
  // ── 4. 987 카드를 일부러 흩어놓아도 반드시 실행: 모든 7/8/9 를 손패 밖의 서로 다른 구역으로
  const SC = [{ 9: 'rem', 8: 'evid', 7: 'pa', name: '9=리무브 / 8=증거 / 7=파트너 에리어' }, { 9: 'deck', 8: 'deck', 7: 'deck', name: '987 모두 덱(손패에 없음)' }, { 9: 'evid', 8: 'rem', 7: 'file', name: '9=증거 / 8=리무브 / 7=FILE' }];
  for (const [i, sc] of SC.entries()) {
    const g = await game(12 + i, 'second', { scatter: sc, scatterFrom: 7 }, 12); const t5 = [9, 11].filter(n => n < g.R.n).map(n => turnOf(g.rec, n));
    ok(t5.length >= 1 && t5.every(t => eq(pre(t.seq, [9, 'H', 8, 'H', 7]), [9, 'H', 8, 'H', 7])), `[${sc.name}] 선공 5턴~: ${t5.map(t => strip(t.seq).join('→')).join(' | ')} (반드시 9→8→7)`);
    const sec = (g.R.bot.trainEvents || []).filter(e => e.kind === 'secure' && e.n >= 7); ok([9, 8, 7].filter(lv => sc[lv] !== 'file').every(lv => sec.some(e => e.lv === lv)), `[${sc.name}] 회수 ${sec.length}회: ${[...new Set(sec.map(e => e.lv + '←' + e.from))].join(', ')}`);
    ok(g.R.bot.illegal === 0 && g.snap.every(x => x.own === g.ids0 && x.seen), `[${sc.name}] 불법 0, 카드 총수/인스턴스 보존(복제 없음)`);
    ok(!g.R.log.some(l => /강제 전개 불가|건너뜁니다/.test(l)), `[${sc.name}] 전개 불가/건너뜀 로그 없음`);
  }
  // 후공도 흩어놓은 상태에서 4턴~ 반복
  { const g = await game(15, 'first', { scatter: SC[0], scatterFrom: 8 }, 13); const ts = [8, 10, 12].filter(n => n < g.R.n).map(n => turnOf(g.rec, n)); ok(ts.length >= 2 && ts.every(t => eq(pre(t.seq, [9, 'H', 8, 'H', 7]), [9, 'H', 8, 'H', 7])), `후공 흩어놓은 상태: ${ts.map(t => strip(t.seq).join('→')).join(' | ')}`); }
  // ── 5. 987 카드에 제거 효과가 전혀 없어도 사람 현장 전부 제거
  { const dk = botDeck(16, { noRmFx: true }), RM = /"(remove|deckrem|paRemove|moveUnder|remToDeck)"/; const hi = dk.list.filter(id => +cards[id].lv >= 7);
    ok(hi.length >= 6 && hi.every(id => !RM.test(JSON.stringify(cards[id].ab || []))), `fixture: 7~9코스트 ${hi.length}장 모두 제거 효과 없음 (${[...new Set(hi)].join(',')})`);
    const g = await game(16, 'second', { deck: dk, humanDeck: true }, 11); const ev = (g.R.bot.trainEvents || []).filter(e => e.kind === 'TRAINING_FORCE_REMOVE');
    ok(ev.length >= 1 && ev.every(e => g.endField[e.n] === 0), `제거 효과 없는 987 → 그래도 사람 현장 전부 제거 (제거 ${ev.map(e => e.ids.length + '장').join(',')} / 종료 시 현장 ${ev.map(e => g.endField[e.n]).join(',')})`);
    ok(eq(pre(turnOf(g.rec, 9).seq, [9, 'H', 8, 'H', 7]), [9, 'H', 8, 'H', 7]), '제거 효과 없는 987 로도 9→8→7 실행'); }
  // ── 6. 등록 덱에 9코스트가 한 장도 없으면: 그 단계만 로그 후 불가, 나머지(8→7)는 계속, Expert 가 끼어들지 않음
  { const g = await game(17, 'second', { deck: botDeck(17, { noLv: [9] }) }, 10);
    ok(g.R.log.some(l => l === '[TRAINING] 등록 덱에 9코스트 캐릭터가 없어 강제 전개 불가'), '로그: [TRAINING] 등록 덱에 9코스트 캐릭터가 없어 강제 전개 불가'); const t = turnOf(g.rec, 9);
    ok(eq(pre(t.seq, ['H', 8, 'H', 7]), ['H', 8, 'H', 7]), `9 없음 → 8→7 은 계속 (${t.seq.join('→')}), 2코스트 등 Expert 전개 없음`); }
  // ── 7. 제거 = 현장 전부 (5/4/2/0장), 효과와 무관한 시스템 처리 (단위)
  async function removalCase(lvs) {
    const { R } = mkRoom(31, 'second', { noRec: true, humanDeck: true }); const h = B.heuristic(U.mulberry32(3)); let g = 0;
    while (g++ < 400 && !(R.phase === 'play' && R.turn === 1 && SIM.who(R).kind === 'main' && R.n >= 1)) { const d = SIM.who(R); if (R.phase === 'over') break; if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; if (S.dispatch(R, 0, mv.m)) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); R.bot.tick(); } else { R.bot.tick(); await new Promise(r => setTimeout(r, 3)); } }
    R.bot.stop(); const ctl = R.bot, P = R.P[0]; P.field.splice(0).forEach(id => P.deck.push(id));
    const pool = Object.keys(R.cards).map(Number).filter(id => R.cards[id].o === 0 && S.D(R, id).type === 'char' && [...P.deck, ...P.hand].includes(id)), used = new Set();
    for (const lv of lvs) { const id = pool.find(x => !used.has(x) && FX.lvOf(R, x) === lv); if (!id) return null; used.add(id); P.deck = P.deck.filter(x => x !== id); P.hand = P.hand.filter(x => x !== id); P.field.push(id); R.cards[id].st = 'a'; }
    ctl.trn = { n: R.n, p: { k: 9, steps: [], rm: true }, i: 0, abort: false, removed: false, logged: true };
    const before = P.field.slice(); T.next(ctl, SIM.who(R)); const gone = before.filter(x => !P.field.includes(x)), o = owned(R);
    return { n: before.length, gone: gone.length, left: P.field.length, one: gone.every(x => o[x] === 1), log: R.log.filter(l => l.includes('TRAINING_FORCE_REMOVE')).length };
  }
  for (const lvs of [[3, 9, 5, 7, 2], [3, 9, 5, 7], [6, 2], [8], []]) { const r = await removalCase(lvs); if (!r) { ok(false, `제거 케이스 구성 실패 ${JSON.stringify(lvs)}`); continue; }
    ok(r.gone === r.n && r.left === 0 && r.one && r.log === (r.n ? 1 : 0), `현장 ${r.n}장 → ${r.gone}장 전부 제거, 남은 ${r.left}장, 카드 한 구역에만 존재 ${r.one}, 로그 ${r.log}회`); }
  // ── 8. 사람 vs 사람: 영향 없음
  { const R = S.mkR('HH1'), d1 = U.makeDeck(41), d2 = U.makeDeck(42); [d1, d2].forEach((d, s) => { const defs = {}; for (const id of [...new Set(d.list), d.partner, d.kase]) defs[id] = cards[id]; const e = S.dispatch(R, s, { t: 'ready', defs, list: d.list, partner: d.partner, kase: d.kase }); if (e) throw new Error(e); });
    const h = [B.heuristic(U.mulberry32(1)), B.heuristic(U.mulberry32(2))]; let g = 0; while (R.phase !== 'over' && R.n < 14 && g++ < 3000) { const d = SIM.who(R); if (!d) break; const mv = h[d.seat](R, d.seat); if (!mv) break; if (S.dispatch(R, d.seat, mv.m)) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, d.seat, m.m)); }
    ok(!R.bot && !R.log.some(l => l.includes('[TRAINING]')), `사람 vs 사람 ${R.n}턴 진행: 봇/연습 로그 없음`); }
  // ── 9. 연습 모드 OFF(기본값): 영향 없음
  { const off = mkRoom(7, 'second', { training: false }); ok(off.R.bot.training === false, '옵션이 꺼져 있으면 비활성 (기본값)'); off.R.bot.stop();
    const g = await game(7, 'second', { training: false }, 6); ok(!g.R.log.some(l => l.includes('[TRAINING]')) && !(g.R.bot.trainEvents || []).length, '꺼진 상태로 6턴 진행: [TRAINING] 로그/이벤트 없음'); }
  // ── 10. 카드 데이터 불변
  ok(hashDB() === dbHash0, '카드 DB(메모리) 전후 동일');
  ok(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../data/cards.json'))).digest('hex') === fileHash0, 'data/cards.json 변경 없음');
  console.log(fail ? `\n연습 모드 테스트 ${fail}건 실패` : `\n연습 모드 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})();
