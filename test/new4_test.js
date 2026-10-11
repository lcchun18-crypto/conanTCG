// v1.17.10 신규 카드 4장: id_1182 / id_1244 / id_1260 / id_1263
const U = require('./mz_util'); const { G, real, dummy, field, hand, rem, pa, has, req, ans, auto, pump, endTurn, solve, fillFile, evid, FX, DB, t, runAll, ok, eq, give } = U;
const kase = c => ({ p: { n: 'P', type: 'partner', color: c.pc || 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: c.k, lv: '2', lv2: '3' } });
const D = DB(); const HAY = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }];
t('data', '4장 데이터/이미지/manual 없음', () => {
  for (const [id, n, ty] of [['id_1182', '毛利小五郎', 'char'], ['id_1244', '「まだ配属先は決まってないけどね…」', 'event'], ['id_1260', '諸伏景光&スコッチ', 'char'], ['id_1263', '警視庁公安部の潜入捜査官', 'case']]) {
    const c = D[id]; ok(c && c.n === n && c.type === ty, `${id} 데이터`); ok(c.file === id + '.jpg' && c.img === `CardImageWeb/${id}.webp` && require('fs').existsSync(__dirname + `/../CardImageWeb/${id}.webp`), `${id} 이미지`);
    ok(!c.ab.some(a => a.ic === 'manual' || a.ops && a.ops.some(o => o.op === 'manual')), `${id} manual 없음`); }
  ok(D.id_1260.lv === '9' && D.id_1260.ap === '8000' && D.id_1260.lp === '2' && D.id_1182.ap === '8000' && D.id_1182.lp === '0' && D.id_1263.lv === '7' && D.id_1263.lv2 === '6', '수치'); });
t('id_1182', '登場時: 리무브의 Lv4 이하 妃英理 / 毛利探偵事務所 캐릭터를 슬립으로 등장', () => {
  const R = G({ x: real('id_1182', { color: 'blue' }), a: dummy('妃英理', { lv: '4' }), b: dummy('사무소', { lv: '3', trait: '毛利探偵事務所' }), c: dummy('사무소Lv5', { lv: '5', trait: '毛利探偵事務所' }), d: dummy('무관', { lv: '2' }) }, ['x', 'a', 'b', 'c', 'd'], ['d'], kase({ k: 'blue', pc: 'blue' })); const s = R.turn; fillFile(R, s, 8);
  const x = hand(R, s, 'x'), a = rem(R, s, 'a'), b = rem(R, s, 'b'), c = rem(R, s, 'c'), d = rem(R, s, 'd'); U.play(R, s, x); pump(R); const q = req(R);
  ok(q && q.kind === 'pick' && q.sel.includes(a) && q.sel.includes(b) && !q.sel.includes(c) && !q.sel.includes(d), '후보: 妃英理 + 毛利探偵事務所(Lv4 이하)만'); ans(R, [b]); pump(R); ok(has(R, s, 'field', b) && R.cards[b].st === 's', '슬립 상태로 등장'); });
t('id_1244', '이벤트: 疾風을 가진 Lv7+ 黄/黒 캐릭터에만 세트 / ヒラメキ: 疾風 카드를 손패로', () => {
  const R = G({ e: real('id_1244', { type: 'event', color: 'yellow' }), e2: real('id_1244', { type: 'event', color: 'yellow' }), a: dummy('疾風黄Lv7', { color: 'yellow', lv: '7' }), b: dummy('疾風青Lv7', { color: 'blue', lv: '7' }), c: dummy('疾風黒Lv6', { color: 'black', lv: '6' }), d: dummy('일반黒Lv7', { color: 'black', lv: '7' }), y: dummy('疾風', { color: 'blue', lv: '9' }) }, ['e', 'e2', 'a', 'b', 'c', 'd', 'y'], ['d'], kase({ k: 'yellow', pc: 'yellow' })); const s = R.turn; fillFile(R, s, 8);
  const a = field(R, s, 'a'), b = field(R, s, 'b'), c = field(R, s, 'c'), d = field(R, s, 'd'); for (const i of [a, b, c]) R.defs[R.cards[i].d].ab = HAY; const e = hand(R, s, 'e'); eq(U.act(R, s, { a: 'play', id: e }), undefined, '이벤트 사용'); pump(R); const q = req(R);
  if (q) { ok(q.kind === 'pick' && q.sel.includes(a) && !q.sel.includes(b) && !q.sel.includes(c) && !q.sel.includes(d), '세트 대상 후보'); ans(R, [a]); pump(R); } ok((R.cards[a].sets || []).includes(e) && !(R.cards[b].sets || []).length && !(R.cards[c].sets || []).length && !(R.cards[d].sets || []).length, '세트 대상: 疾風 + Lv7+ + 黄/黒 → 疾風黄Lv7 만(다른 캐릭터에는 세트되지 않음)');
  const y = rem(R, s, 'y'); R.defs[R.cards[y].d].ab = HAY; const e2 = give(R, s, 'e2', 'evid'); R.cards[e2].up = false; FX.queueFlash(R, s, e2); pump(R); auto(R, { pref: [y] }); ok(has(R, s, 'hand', y), 'ヒラメキ: 리무브 에리어의 疾風 카드를 손패로'); });
t('id_1260', '相手ターン中 疾風 캐릭터 등장 시: 1장 뽑고, 뒷면 증거 2개를 앞면으로 하면 1장 더 (파트너 에리어에서도 발동)', () => {
  for (const inPa of [false, true]) { const R = G({ x: real('id_1260', { color: 'yellow' }), y: dummy('疾風', { color: 'yellow' }), d: dummy('덱', { color: 'yellow' }), d2: dummy('덱2', { color: 'yellow' }), d3: dummy('덱3', { color: 'yellow' }), d4: dummy('덱4', { color: 'yellow' }) }, ['x', 'y', 'd', 'd2', 'd3', 'd4'], ['d'], kase({ k: 'yellow' })); const o = R.turn, s = 1 - o; // 카드 주인 s = 비턴 플레이어
    const x = give(R, s, 'x', inPa ? 'pa' : 'field'); R.cards[x].st = 'a'; const y = field(R, s, 'y'); R.defs[R.cards[y].d].ab = HAY; const ev = evid(R, s, 3, false); const dk = R.P[s].deck.length;
    FX.fireAlly(R, s, y, { by: 'effect' }); pump(R); auto(R, { yn: true }); eq(R.P[s].deck.length, dk - 2, `${inPa ? '파트너 에리어' : '현장'}: 1장 + 증거 앞면 후 1장 = 2장 뽑음`); eq(ev.filter(i => R.cards[i].up).length, 2, '증거 2개 앞면'); } });
t('id_1263', '事件 해결편: 이행 시 손패 1장 리무브 / 선언: FILE 1장 리무브 → 손패의 疾風 黄/黒 (Lv≤FILE 수) → 파트너 에리어 → 상대 턴 메인 시작 시 등장', () => {
  for (const yes of [true, false]) { const R = G({ h: dummy('손패', { color: 'yellow' }), y: dummy('疾風Lv5', { color: 'yellow', lv: '5' }), z: dummy('疾風Lv9', { color: 'black', lv: '9' }), w: dummy('疾風青', { color: 'blue', lv: '1' }), f: dummy('필러', { color: 'yellow' }) }, ['h', 'y', 'z', 'w', 'f'], ['f'], { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: real('id_1263', { color: 'yellow/black' }) }); const s = R.turn, o = 1 - s; fillFile(R, s, 6);
    const h = hand(R, s, 'h'); solve(R, s); const q0 = req(R); ok(q0 && q0.kind === 'pick', '해결편 이행: 손패 1장 리무브 질의'); if (q0) { ans(R, [h]); pump(R); } auto(R);
    const y = hand(R, s, 'y'), z = hand(R, s, 'z'), w = hand(R, s, 'w'); for (const i of [y, z, w]) R.defs[R.cards[i].d].ab = HAY; const kid = R.P[s].kase; const i = R.defs[R.cards[kid].d].ab.findIndex(a => a.ic === 'declare');
    ok(!FX.declareCheck(R, s, kid, i), '선언 가능'); const f0 = R.P[s].file.length; FX.declare(R, s, kid, i); pump(R); const q = req(R); ok(q && q.kind === 'pick' && q.sel.includes(y) && !q.sel.includes(z) && !q.sel.includes(w), '후보: 疾風 + 黄/黒 + Lv≤FILE 수(5)'); ans(R, [y]); pump(R);
    eq(R.P[s].file.length, f0 - 1, 'FILE 1장 리무브(코스트)'); ok(has(R, s, 'pa', y), '파트너 에리어로'); endTurn(R); pump(R); const q3 = req(R); ok(q3 && q3.kind === 'yn' && q3.who === s, '상대 턴 메인 시작 시 질의'); ans(R, yes); pump(R);
    if (yes) ok(has(R, s, 'field', y), '파트너 에리어에서 등장'); else ok(has(R, s, 'rem', y), '리무브 에리어로'); } });
t('id_1244', '相手ターン中 세트된 캐릭터가 떠나 이벤트가 리무브 에리어에 놓이면: 리무브의 疾風 Lv6 이하 黄/黒을 등장 (내 턴이면 발동 안 함)', () => {
  for (const oppTurn of [true, false]) { const R = G({ e: real('id_1244', { type: 'event', color: 'yellow' }), a: dummy('세트대상', { color: 'yellow', lv: '7' }), y: dummy('疾風Lv6', { color: 'black', lv: '6' }), z: dummy('疾風Lv8', { color: 'black', lv: '8' }) }, ['e', 'a', 'y', 'z'], ['a'], kase({ k: 'yellow' })); const s = R.turn, o = 1 - s;
    const a = field(R, s, 'a'); const e = give(R, s, 'e', 'hand'); R.P[s].hand = R.P[s].hand.filter(x => x !== e); R.cards[a].sets = [e]; R.cards[e].setOn = a; const y = rem(R, s, 'y'), z = rem(R, s, 'z'); for (const i of [y, z]) R.defs[R.cards[i].d].ab = HAY;
    R.turn = oppTurn ? o : s; FX.release(R, a); pump(R); const q = req(R);
    if (oppTurn) { ok(q && q.kind === 'pick' && q.sel.includes(y) && !q.sel.includes(z), '후보: Lv6 이하만'); ans(R, [y]); pump(R); ok(has(R, s, 'field', y), '등장'); } else ok(!q, '내 턴: 발동 안 함'); } });
runAll('new4_test');
