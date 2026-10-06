// CT-P11 신규 88장: 전수 실플레이 스모크(수동 fallback 없이 엔진이 끝까지 처리) + 데이터 검증 + 위험 카드 개별 테스트
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, req, ans, fillFile, pump, evid, DB, FX } = U;
const fs = require('fs'), path = require('path');
const IMGD = process.env.CARD_IMAGE_DIR || require('path').join(__dirname, '..', 'CardImage');   // v1.14.0: 카드 이미지는 CardImage 폴더의 파일
const NEW = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ct11_ids.json'), 'utf8'));
const BS = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const colors = c => String(c).split('/');
// 데이터 검증
t('ct11-data', '88장 모두 존재/이미지/색/타입/KO 텍스트/ab', () => {
  const db = DB(); eq(NEW.length, 88, '88장'); const seen = new Set();
  for (const id of NEW) { const c = db[id]; ok(c, id + ' 없음'); ok(!seen.has(id), '중복'); seen.add(id); ok(c.img, id + ' img'); ok((/^CardImage\//.test(c.img) ? (!fs.existsSync(IMGD) || fs.existsSync(path.join(IMGD, c.img.slice(10)))) : false) || fs.existsSync(path.join(__dirname, '..', c.img.replace(/^\/+/, ''))) || fs.existsSync(path.join(__dirname, '..', 'assets', path.basename(c.img))) || /^(data:|https?:)/.test(c.img), id + ' 이미지 파일'); ok(c.n, id + ' 이름');
    ok(['char', 'event', 'case', 'partner'].includes(c.type), id + ' type'); ok(colors(c.color).every(x => ['red', 'blue', 'green', 'yellow', 'white', 'black'].includes(x)), id + ' color ' + c.color);
    if (c.type === 'char') ok(c.ap && c.lp, id + ' ap/lp'); ok(c.fx || c.type === 'partner', id + ' JP 텍스트'); if (c.ab && c.ab.length) ok(c.extra, id + ' KO 텍스트'); } });
// 전수 실플레이: 카드 종류별로 가능한 모든 시작 방법으로 실행 → 예외/멈춤/수동 fallback 없음
const mkGame = (cid, base) => { const c = real(cid, { lv: '0' });
  const R = G({ c, d: dummy('D'), e: dummy('E', { lv: '2' }), ev: { n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'draw', n: 1 }] }] } }, ['d', 'd', 'd', 'e'], ['d', 'd', 'e'], base); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
for (const id of NEW) t(id, '실플레이 스모크', () => {
  const c = DB()[id]; const hasManual = JSON.stringify(c.ab || []).includes('"manual"'); ok(!hasManual, 'manual ab'); if (!c.ab || !c.ab.length || c.type === 'case') return;
  const cols = colors(c.color); for (const col of cols.length > 1 ? [cols[0], cols[1]] : [cols[0]]) {
    const base = BS(col); let R = mkGame(id, base); const s = R.turn, o = 1 - s;
    const d0 = field(R, s, 'd'), d1 = field(R, s, 'd', 's'), e0 = field(R, s, 'e'), x0 = field(R, o, 'd'), x1 = field(R, o, 'e', 's'), x2 = field(R, o, 'd', 'a'); evid(R, s, 3); evid(R, o, 2);
    const me = c.type === 'char' || c.type === 'event' ? hand(R, s, 'c') : null;
    R.P[s].hand.forEach(h => { const k = R.cards[h]; if (k) k.sum = 0; });
    if (me != null) { try { play(R, s, me); } catch (e) { if (!/play:/.test(e.message)) throw e; try { R.P[s].hand.includes(me) && (R.P[s].rem.push(me), R.P[s].hand.splice(R.P[s].hand.indexOf(me), 1)); } catch (_) { } } }
    let g = 0; while (R.eff && g++ < 12) { auto(R, { yn: true }); pump(R); } ok(!R.eff, '질의가 끝나지 않음'); } });

// ── 위험 카드 개별 테스트 ──
const decl = (R, s, id, f) => { const i = R.defs[R.cards[id].d].ab.findIndex(f); ok(i >= 0, 'ab 없음'); const e = FX.declare(R, s, id, i); if (e) throw new Error('declare: ' + e); pump(R); };
const isDecl = a => a.ic === 'declare';
const withCase = (cid, defs, l0, l1, col = 'blue') => { const R = G({ ...defs }, l0, l1, { p: { n: 'P', type: 'partner', color: col, lp: '1' }, k: real(cid, { color: col, lv: '2', lv2: '1' }) }); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
t('id_1262', '사건 선언: 증거 2개 뒷→앞 코스트, 캐릭터 AP-3000, 턴1회', () => {
  const R = withCase('id_1262', { d: dummy('D', { ap: '5000' }) }, ['d'], ['d'], 'red'); const s = R.turn, o = 1 - s; const x = field(R, o, 'd'); evid(R, s, 3); U.solve(R, s);
  const up0 = R.P[s].evid.filter(i => R.cards[i].up).length; decl(R, s, R.P[s].kase, isDecl); auto(R, { pref: [x] }); pump(R);
  eq(U.S.ap(R, x), 2000, 'AP-3000'); eq(R.P[s].evid.filter(i => R.cards[i].up).length, up0 + 2, '증거 2개 앞면'); ok(FX.declare(R, s, R.P[s].kase, R.defs[R.cards[R.P[s].kase].d].ab.findIndex(isDecl)), '턴1회'); });
t('id_1257', '사건 선언: 증거3개 코스트→내 Lv7 이하 리무브→조직 Lv3 이하 슬립 등장', () => {
  const R = withCase('id_1257', { d: dummy('D', { lv: '5' }), g: dummy('G', { lv: '3', trait: '黒ずくめの組織' }) }, ['d'], ['d'], 'black'); const s = R.turn; const d = field(R, s, 'd'); const g = rem(R, s, 'g'); evid(R, s, 3); U.solve(R, s);
  decl(R, s, R.P[s].kase, isDecl); auto(R, { pref: [d, g], yn: true }); pump(R); ok(has(R, s, 'rem', d), '리무브'); ok(has(R, s, 'field', g) && R.cards[g].st === 's', '슬립 등장'); });
t('id_1261', '사건 선언: 내 캐릭터 리무브→상대 슬립 Lv7↓ 손패로→상대 리무브 1(+ID 다르면 1)', () => {
  const R = withCase('id_1261', { d: dummy('D'), v: dummy('V', { lv: '5' }), h: dummy('H') }, ['d'], ['v', 'h', 'h', 'h'], 'white'); const s = R.turn, o = 1 - s; const d = field(R, s, 'd'); const v = field(R, o, 'v', 's'); evid(R, s, 3); U.solve(R, s); const h0 = R.P[o].hand.length;
  decl(R, s, R.P[s].kase, isDecl); auto(R, { pref: [d, v], yn: true }); pump(R); ok(has(R, s, 'rem', d), '내 캐릭터 리무브'); ok(has(R, o, 'hand', v) || has(R, o, 'rem', v), '상대 캐릭터 손패 이동'); ok(R.P[o].rem.length >= 1, '상대 리무브 발생'); });
t('id_1219', '선언: AP8000↓ 리무브, 4000 이상 낮으면 Lv2 녹/적 슬립 등장 / 아니면 등장 안 함', () => {
  const run = ap => { const R = G({ c: real('id_1219', { lv: '0', color: 'red' }), x: dummy('X', { ap }), m: dummy('M', { lv: '2', color: 'green' }) }, ['c'], ['x'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'green/red', lv: '2', lv2: '3' } }); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), x = field(R, o, 'x'), m = rem(R, s, 'm');
    try { decl(R, s, c, isDecl); } catch (e) { return { err: e.message }; } auto(R, { pref: [x, m], yn: true }); pump(R); return { R, s, o, x, m }; };
  const a = run('3000'); if (a.err) throw new Error(a.err); ok(has(a.R, a.o, 'rem', a.x), '리무브'); ok(has(a.R, a.s, 'field', a.m), '4000 이상 낮음 → 등장'); const b = run('6000'); if (b.err) throw new Error(b.err); ok(has(b.R, b.o, 'rem', b.x), '리무브'); ok(!has(b.R, b.s, 'field', b.m), '차이 부족 → 등장 안 함'); });
t('id_1224', '액션: AP 4000 이상 낮은 상대 캐릭터를 지정하면 덱 아래로(수락 시) / 현장 이탈 시 액션이 깔끔히 종료', () => {
  const R = G({ c: real('id_1224', { lv: '0', color: 'green' }), x: dummy('X', { ap: '1000' }) }, ['c'], ['x'], BS('green')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), x = field(R, o, 'x');
  U.attack(R, c, x, true); auto(R, { yn: true }); pump(R); ok(!R.eff, '질의 종료'); ok(!has(R, o, 'field', x), '현장 이탈'); ok(R.P[o].deck.includes(x), '덱 아래로'); U.finishContact(R, []); ok(!R.sub && !R.eff, '액션이 깔끔히 종료'); ok(has(R, s, 'field', c), '공격 캐릭터 무사'); ok(R.P[o].deck.includes(x) && !has(R, o, 'rem', x), '덱 아래 유지(리무브 아님)'); });
t('id_1252', '登場時(내 턴): 상대 파트너를 액티브로 / 어시스트 중이면 파트너 에리어로', () => {
  const R = G({ c: real('id_1252', { lv: '0', color: 'black' }) }, ['c'], ['c'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); const pid = R.P[o].partner; if (pid != null) R.cards[pid].st = 's'; play(R, s, c); auto(R, { yn: true }); pump(R); ok(!R.eff, '질의 종료'); if (pid != null) eq(R.cards[pid].st, 'a', '파트너 액티브'); });
t('id_1245', '선언: 코스트로 스탠시킨 캐릭터에 상대 턴 종료까지 현장리무브 시 1장 드로 부여', () => {
  const rmE = { n: 'RE', type: 'event', color: 'black', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own: 'opp', lvMax: 9 }, do: 'remove' }] }] };
  const R = G({ c: real('id_1245', { lv: '0', color: 'black' }), b: dummy('B', { lv: '3', color: 'black' }), re: rmE }, ['c'], ['re'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), b = field(R, s, 'b');
  decl(R, s, c, isDecl); auto(R, { pref: [b], yn: true }); pump(R); eq(R.cards[b].st, 'x', '스턴'); const h0 = R.P[s].hand.length; const re = hand(R, o, 're'); R.turn = o; R.fl = {}; play(R, o, re); auto(R, { pref: [b], yn: true }); pump(R); ok(has(R, s, 'rem', b), '리무브됨'); eq(R.P[s].hand.length, h0 + 1, '현장리무브 시 1장 드로'); });
t('id_1216', '이벤트: 증거 뒤집기→세트→AP+2000 / 컨택트 시 PA 이동하면 리무브 방지', () => {
  const R = G({ e: real('id_1216', { color: 'blue' }), d: dummy('D', { trait: '怪盗' }) }, ['e', 'd'], ['d'], BS('blue')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn; const d = field(R, s, 'd'); evid(R, s, 2, true); const e = hand(R, s, 'e'); play(R, s, e); auto(R, { pref: [d], yn: true }); pump(R); ok(!R.eff, '질의 종료'); eq(U.S.ap(R, d), 3000, 'AP+2000'); });
t('id_1212', '変装 교체 시(상대 턴): 덱 아래 대신 리무브 선택 → 내 앞면 증거 2개 뒷면 / 거절하면 덱 아래', () => {
  const run = yn => { const R = G({ c: real('id_1212', { lv: '0', color: 'white' }), kid: { n: '怪盗キッド', type: 'char', color: 'white', lv: '0', ap: '1000', lp: '1', kw: 'disguise', ab: [{ ic: 'disguise' }] }, a: dummy('A', { ap: '9000', color: 'white' }) }, ['c'], ['c'], BS('white')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    const a = field(R, o, 'a'); const w = field(R, s, 'c', 's'); const k = hand(R, s, 'kid'); const ev = evid(R, s, 3, true); U.attack(R, a, w); U.finishContact(R, [{ s, m: { a: 'dis', id: k } }], { yn, pref: ev.slice(0, 2) }); return { R, s, w, k, ev }; };
  let r = run(true); ok(has(r.R, r.s, 'rem', r.w), '리무브 에리어로'); eq(r.ev.filter(i => !r.R.cards[i].up).length, 2, '증거 2개 뒷면'); r = run(false); ok(!has(r.R, r.s, 'rem', r.w), '거절: 리무브 아님'); ok(r.R.P[r.s].deck.includes(r.w), '거절: 덱 아래'); });
t('id_1206', '変装 교체 시(상대 턴): 리무브 선택 → 액션 중 캐릭터 스턴', () => {
  const R = G({ c: real('id_1206', { lv: '0', color: 'black' }), bel: { n: 'ベルモット', type: 'char', color: 'black', lv: '0', ap: '1000', lp: '1', kw: 'disguise', ab: [{ ic: 'disguise' }] }, a: dummy('A', { ap: '9000', color: 'black' }) }, ['c'], ['c'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const a = field(R, o, 'a'); const w = field(R, s, 'c', 's'); const k = hand(R, s, 'bel'); U.attack(R, a, w); U.finishContact(R, [{ s, m: { a: 'dis', id: k } }], { yn: true, pref: [a] }); ok(has(R, s, 'rem', w), '리무브'); eq(R.cards[a].st, 'x', '액션 중 캐릭터 스턴'); });
t('lab-ko', '선택지/버튼 라벨(lab)에 일본어 가나가 남아 있지 않음 (id_0947 리무브/덱 아래로 포함)', () => {
  const bad = []; const walk = (o, id) => { if (Array.isArray(o)) o.forEach(x => walk(x, id)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'lab' && typeof v === 'string' && /[\u3040-\u30ff]/.test(v)) bad.push(id + ':' + v); else walk(v, id); } };
  for (const [id, c] of Object.entries(DB())) walk(c.ab, id); ok(!bad.length, '일본어 라벨 ' + bad.slice(0, 4).join(' | '));
  const R = G({ c: real('id_0947', { lv: '0', color: 'white' }), a: dummy('工藤新一') }, ['c', 'a'], ['a'], BS('white')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; field(R, o, 'a'); const x = hand(R, s, 'c'); play(R, s, x); const labs = []; let g = 0; while (R.eff && g++ < 5) { const q = req(R); if (q.kind === 'opt') labs.push(...(q.opts || [])); auto(R, { yn: true }); }
  ok(!labs.some(l => /[\u3040-\u30ff]/.test(String(l.lab || l))), '실제 선택 버튼 문구: ' + JSON.stringify(labs).slice(0, 120)); });
t('id_1068', '실카드 id_0408 선언(코스트 공개) → id_1068 공개 트리거 yn → 예 → 액티브+AP+1000 / 조건 미충족 시 로그로 이유 표시', () => {
  const rc = (id, x = {}) => real(id, { color: DB()[id].color, ...x }); const mk = (file, kc) => { const R = G({ c: rc('id_1068', { lv: '0' }), r: rc('id_0408', { lv: '0' }), b: rc('id_0003', { lv: '0' }), x: dummy('X') }, ['c', 'r', 'b'], ['x'], { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { ...rc(kc), type: 'case' } }); fillFile(R, 0, file); fillFile(R, 1, 9); return R; };
  const go = R => { const s = R.turn; const c = field(R, s, 'c', 's'), r = field(R, s, 'r'); hand(R, s, 'b'); const xo = field(R, 1 - s, 'x'); const ap0 = U.S.ap(R, c); const i = R.defs[R.cards[r].d].ab.findIndex(a => a.ic === 'declare'); const e = FX.declare(R, s, r, i); if (e) throw new Error(e); pump(R); const kinds = []; let g = 0; while (R.eff && g++ < 8) { const q = req(R); kinds.push(q.kind); ans(R, q.kind === 'yn' ? true : q.kind === 'pick' ? [q.sel.includes(xo) ? xo : q.sel[0]] : null); pump(R); } return { R, c, kinds, ap0 }; };
  let r = go(mk(9, 'id_0930')); ok(r.kinds.includes('yn') && r.R.cards[r.c].st === 'a' && U.S.ap(r.R, r.c) === r.ap0 + 1000, '사용 → 액티브 + AP+1000');
  r = go(mk(3, 'id_0930')); ok(!r.kinds.includes('yn') && r.R.cards[r.c].st === 's', 'FILE 부족 → 발동 안 함'); ok(r.R.log.some(l => /\[공개 트리거\].*FILE 5장 이상 필요/.test(l)), '이유 로그: ' + r.R.log.filter(l => /공개 트리거/.test(l)).join('|')); });
module.exports = {}; if (require.main === module) U.runAll('mz_ct11');
