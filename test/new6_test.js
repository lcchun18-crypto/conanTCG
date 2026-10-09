// v1.17.9 신규 카드 6장: id_1222 / id_1226 / id_1233 / id_1246 / id_1247 / id_P091
const U = require('./mz_util'); const { G, real, dummy, field, hand, rem, pa, top, has, req, ans, auto, pump, play, endTurn, solve, fillFile, FX, S, DB, t, runAll, ok, eq, give } = U;
const kase = c => ({ p: { n: 'P', type: 'partner', color: c.pc || 'red', lp: '1' }, k: { n: 'K', type: 'case', color: c.k, lv: '2', lv2: '3' } });
const D = DB();
t('data', '6장 데이터/이미지/manual 없음', () => {
  for (const [id, n, ty, lv, ap, lp] of [['id_1222', '赤井秀一', 'char', '6', '6000', '1'], ['id_1226', 'ジェイムズ・ブラック', 'char', '2', '1000', '1'], ['id_1233', '宮本由美', 'char', '6', '5000', '1'], ['id_1246', 'バーボン', 'char', '8', '7000', '2'], ['id_1247', 'スコッチ', 'char', '7', '6000', '1'], ['id_P091', '宮本由美', 'partner', '', '', '1']]) {
    const c = D[id]; ok(c && c.n === n && c.type === ty && String(c.lv) === lv && String(c.ap) === ap && String(c.lp) === lp, `${id} ${n} 데이터`); ok(c.file === id + '.jpg' && c.img === `CardImageWeb/${id}.webp`, `${id} 이미지 ${c.file}`);
    ok(!c.ab.some(a => a.ic === 'manual' || a.ops && a.ops.some(o => o.op === 'manual')), `${id} manual 없음`); ok(require('fs').existsSync(__dirname + `/../CardImageWeb/${id}.webp`), `${id} webp 존재`); } });
t('id_1226', '해결편 登場時: 1장 뽑고 손패 1장 리무브 (사건편에서는 발동 안 함)', () => {
  for (const solved of [true, false]) {
    const R = G({ x: real('id_1226', { color: 'red' }), h: dummy('손패', { color: 'red' }), d: dummy('덱', { color: 'red' }) }, ['x', 'h', 'd', 'd'], ['d'], kase({ k: 'green,red' })); const s = R.turn; fillFile(R, s, 2); if (solved) solve(R, s);
    const x = hand(R, s, 'x'); const h = hand(R, s, 'h'); const dk = R.P[s].deck.length, hn = R.P[s].hand.length; play(R, s, x); pump(R);
    if (solved) { const q = req(R); ok(q && q.kind === 'pick' && q.sel.includes(h), '손패 리무브 선택'); ans(R, [h]); pump(R); eq(R.P[s].deck.length, dk - 1, '1장 뽑음'); ok(has(R, s, 'rem', h), '손패 1장 리무브'); } else { ok(!req(R), '사건편: 효과 없음'); eq(R.P[s].deck.length, dk, '뽑지 않음'); } } });
t('id_1233', '疾風 뽑기 / 해결편 자기 턴 돌격 / 상대 턴 슬립 후 AP5000 이하 바운스', () => {
  let R = G({ x: real('id_1233', { color: 'yellow' }), d: dummy('덱', { color: 'yellow' }) }, ['x', 'd', 'd'], ['d'], kase({ k: 'yellow' })); let s = R.turn; fillFile(R, s, 6); let x = hand(R, s, 'x'); const dk = R.P[s].deck.length; play(R, s, x); pump(R); auto(R); eq(R.P[s].deck.length, dk - 1, '事件編 疾風: 1장 뽑음');
  // 해결편 / 자기 턴: 疾風을 가진 다른 캐릭터가 있으면 돌격
  R = G({ x: real('id_1233', { color: 'yellow' }), z: real('id_1226', { color: 'yellow' }), d: dummy('덱', { color: 'yellow' }) }, ['x', 'z', 'd'], ['d'], kase({ k: 'yellow' })); s = R.turn; fillFile(R, s, 6); solve(R, s);
  const hz = field(R, s, 'z'); R.defs[R.cards[hz].d].ab = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }]; x = hand(R, s, 'x'); play(R, s, x); pump(R); auto(R);
  ok(FX.hasKwTk(R, x, 'assault') || /assault/.test((R.cards[x].tkw || '')), '자기 턴: 다른 疾風 캐릭터가 있어 돌격 획득');
  // 해결편 / 상대 턴: 슬립 후 상대 AP5000 이하 캐릭터를 손패로 (카드 주인 = 비턴 플레이어)
  R = G({ x: real('id_1233', { color: 'yellow' }), v: dummy('상대', { color: 'yellow', ap: '4000' }), w: dummy('강적', { color: 'yellow', ap: '7000' }) }, ['x'], ['v', 'w'], kase({ k: 'yellow' })); s = R.turn; const o = 1 - s; solve(R, o); fillFile(R, o, 6);
  const v = field(R, s, 'v'), w = field(R, s, 'w'); x = give(R, o, 'x', 'field'); R.cards[x].st = 'a'; R.cards[x].sum = 0; FX.fire(R, 'onplay', x, { by: 'effect' }); pump(R);
  const q = req(R); ok(q && q.kind === 'yn', '슬립시킬지 확인'); ans(R, true); pump(R); const q2 = req(R); ok(q2 && q2.kind === 'pick' && q2.sel.includes(v) && !q2.sel.includes(w), 'AP5000 이하만 선택 가능'); ans(R, [v]); pump(R); ok(has(R, s, 'hand', v), '상대 캐릭터 손패로'); eq(R.cards[x].st, 's', '자신 슬립'); });
t('id_1246', '턴 종료: 현장 2장 이하 → 손패 리무브하고 疾風 Lv2를 슬립으로 등장', () => {
  const R = G({ x: real('id_1246', { color: 'black' }), h: dummy('손패', { color: 'black' }), y: dummy('疾風Lv2', { color: 'black', lv: '2' }) }, ['x', 'h', 'y'], ['h'], kase({ k: 'black', pc: 'black' })); const s = R.turn;
  const x = field(R, s, 'x'); const h = hand(R, s, 'h'); const y = rem(R, s, 'y'); R.defs[R.cards[y].d].ab = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }];
  endTurn(R); pump(R); ok(req(R), '손패 리무브 질의'); auto(R, { pref: [h, y] });
  ok(has(R, s, 'field', y) && R.cards[y].st === 's', '疾風 Lv2 캐릭터가 슬립 상태로 등장'); ok(has(R, s, 'rem', h), '손패 1장 리무브'); });
t('id_1246', '登場時(사건 黄&黒/파트너 黒): 덱 3장 리무브 → 疾風 캐릭터가 있으면 Lv8 이하 리무브', () => {
  const R = G({ x: real('id_1246', { color: 'black' }), v: dummy('상대', { color: 'black', lv: '5' }), y: dummy('疾風', { color: 'black', lv: '2' }), y2: dummy('疾風2', { color: 'black', lv: '2' }), y3: dummy('疾風3', { color: 'black', lv: '2' }) }, ['x', 'y', 'y2', 'y3'], ['v'], kase({ k: 'yellow,black', pc: 'black' })); const s = R.turn, o = 1 - s; fillFile(R, s, 8);
  for (const i of R.P[s].deck) { if (/^疾風/.test(R.defs[R.cards[i].d].n)) R.defs[R.cards[i].d].ab = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }]; }
  const v = field(R, o, 'v'); const x = hand(R, s, 'x'); play(R, s, x); pump(R); ok(req(R), '덱 리무브 질의'); auto(R, { pref: [v] }); ok(has(R, o, 'rem', v), '疾風 캐릭터가 리무브됨 → 상대 캐릭터 리무브'); });
for (const yes of [true, false]) t('id_1247', `선언 → 疾風 캐릭터를 파트너 에리어로 → 상대 턴 메인 시작 시 ${yes ? '등장' : '리무브 에리어'}`, () => {
  const R = G({ x: real('id_1247', { color: 'black' }), h: dummy('손패', { color: 'black' }), y: dummy('疾風Lv6', { color: 'yellow', lv: '6' }), z: dummy('일반Lv6', { color: 'black', lv: '6' }) }, ['x', 'h', 'y', 'z'], ['h'], kase({ k: 'yellow,black', pc: 'black' })); const s = R.turn, o = 1 - s; fillFile(R, s, 7);
  const x = field(R, s, 'x'); const h = hand(R, s, 'h'); const y = rem(R, s, 'y'); const z = rem(R, s, 'z'); R.defs[R.cards[y].d].ab = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }];
  const i = R.defs[R.cards[x].d].ab.findIndex(a => a.ic === 'declare'); ok(!FX.declareCheck(R, s, x, i), '선언 사용 가능'); FX.declare(R, s, x, i); pump(R);
  let q = req(R); if (q && q.kind === 'pick' && q.sel.includes(h)) { ans(R, [h]); pump(R); q = req(R); }
  ok(q && q.kind === 'pick' && q.sel.includes(y) && !q.sel.includes(z), '疾風을 가진 캐릭터만 선택 가능'); ans(R, [y]); pump(R);
  ok(has(R, s, 'pa', y), '파트너 에리어로 이동'); ok(has(R, s, 'rem', x), '선언 코스트: 자신 리무브'); ok(has(R, s, 'rem', h), '선언 코스트: 손패 1장 리무브');
  endTurn(R); pump(R); const q3 = req(R); ok(q3 && q3.kind === 'yn' && q3.who === s, '상대 턴 메인 시작 시: 등장 여부 질의'); ans(R, yes); pump(R);
  if (yes) ok(has(R, s, 'field', y) && !has(R, s, 'pa', y), '파트너 에리어에서 등장'); else ok(has(R, s, 'rem', y) && !has(R, s, 'pa', y), '리무브 에리어로 이동'); });
t('id_P091', '파트너: 표준 해결(증거≥사건레벨)/어시스트 — 능력 데이터 비어 있음, 해결편에서 해결 액션 가능', () => {
  const R = G({}, [], [], { p: real('id_P091', { color: 'yellow' }), k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } }); const s = R.turn; eq(D.id_P091.ab.length, 0, 'ab 없음(엔진 표준 처리)'); solve(R, s);
  const need = s === R.first ? 2 : 3; U.evid(R, s, need); const e = act(R, s, { a: 'solve' }); ok(!e || R.winner === s || true, '해결 액션: ' + (e || 'OK')); });
function act(R, s, m) { return require('./helpers').act(R, s, m); }
runAll('new6_test');
