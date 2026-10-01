// 묶음 E 회귀 테스트 (38장) — CARDS_DB=<빌드된 DB> node test/mz_pe.js
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, req, ans, fillFile, pump, give, act, endTurn, attack, finishContact, filler, FX } = U;
const BS = (c, k = c) => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: k, lv: '2', lv2: '3' } });
const rc = (id, over = {}) => real(id, { color: U.DB()[id].color, ...over });
const dm = (n, over = {}) => dummy(n, over);
const EVD = (n, color, ops) => ({ n, type: 'event', color, lv: '0', ab: [{ ic: 'event', ops }] });
// base 를 생략하면 주 카드(c/e)의 색에 맞는 사건·파트너를 쓴다(색이 다르면 손패에서 사용할 수 없으므로)
const mk = (defs, l0, l1, base) => { const m = defs.c || defs.e; if (!base && m && m.color) base = BS(m.color); const R = G(defs, l0, l1, base); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
const sol = (R, s) => U.solve(R, s);
const trim = (R, s, n) => { const P = R.P[s]; while (P.hand.length > n) P.deck.unshift(P.hand.pop()); while (P.hand.length < n) P.hand.push(...filler(R, s, 1)); };
const di = (R, id, ic = 'declare', n = 0) => { let k = 0; const ab = R.defs[R.cards[id].d].ab || []; for (let i = 0; i < ab.length; i++) if (ab[i].ic === ic && k++ === n) return i; return -1; };
const decl = (R, s, id, n = 0) => { const e = FX.declare(R, s, id, di(R, id, 'declare', n)); if (e) throw new Error('declare: ' + e); pump(R); };
const opp = (R, s, x) => { R.turn = 1 - s; R.fl = {}; play(R, 1 - s, x); };

t('id_0307', '변장: 베르모트가 이 캐릭터와 교체되었을 때 캐릭터 1장 슬립(교체되어 덱으로 간 뒤에도 발동) / 다른 카드면 발동 안 함', () => {
  const run = nmB => { const R = mk({ c: rc('id_0307'), b: dm(nmB, { kw: 'disguise', color: 'white' }), d: dm('D'), u: dm('U') }, ['c', 'b'], ['d', 'u'], BS('white')); const s = R.turn, o = 1 - s;
    const c = field(R, s, 'c'), b = hand(R, s, 'b'), d = field(R, o, 'd'), u = field(R, o, 'u'); attack(R, c, d); finishContact(R, [{ s, m: { a: 'dis', id: b } }], { pref: [u] }); return { R, c, b, u, s }; };
  let r = run('ベルモット'); eq(r.R.cards[r.u].st, 's', '슬립'); ok(r.R.P[r.s].deck.includes(r.c), '샤론은 덱 아래로');
  r = run('ジン'); eq(r.R.cards[r.u].st, 'a', '다른 이름은 발동 안 함'); });
t('id_0318', '死闘: 내 [空手家] 수만큼 상대 캐릭터 슬립 + [空手家] 전원 AP+1000', () => {
  const R = mk({ e: rc('id_0318'), k1: dm('K1', { trait: '空手家' }), k2: dm('K2', { trait: '空手家' }), n: dm('N'), x: dm('X'), y: dm('Y'), z: dm('Z') }, ['e'], ['x', 'y', 'z'], BS('white')); const s = R.turn, o = 1 - s;
  const e = hand(R, s, 'e'); const k1 = field(R, s, 'k1'), k2 = field(R, s, 'k2'), n = field(R, s, 'n'); const x = field(R, o, 'x'), y = field(R, o, 'y'), z = field(R, o, 'z'); play(R, s, e);
  const q = req(R); ok(q.max === 2, '최대 2장'); ans(R, [x, y]); pump(R); eq(R.cards[x].st, 's', 'x 슬립'); eq(R.cards[y].st, 's', 'y 슬립'); eq(R.cards[z].st, 'a', 'z 그대로');
  eq(R.cards[k1].apm, 1000, 'AP+1000'); eq(R.cards[k2].apm, 1000, 'AP+1000'); eq(R.cards[n].apm || 0, 0, '비[空手家]'); });
t('id_0321', '파트너(적) 선언: Lv7+ 아카이/라이를 리무브 → 액티브 (Lv6 는 코스트 불가) / 턴 1회', () => {
  const R = mk({ c: rc('id_0321'), a: dm('赤井秀一', { lv: '7' }), r: dm('ライ', { lv: '7' }), l: dm('ライ', { lv: '6' }) }, ['c'], ['a', 'r', 'l'], BS('red')); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c', 's'); const a = field(R, o, 'a'), r = field(R, o, 'r'), l = field(R, s, 'l'); decl(R, s, c); const q = req(R); ok(q.sel.includes(a) && q.sel.includes(r) && !q.sel.includes(l), 'Lv7 이상만 코스트 대상'); ans(R, [a]); pump(R);
  eq(R.cards[c].st, 'a', '액티브'); ok(has(R, o, 'rem', a), '코스트로 리무브'); R.cards[c].st = 's'; ok(FX.declareCheck(R, s, c, di(R, c)), '턴 1회'); });
t('id_0348', '상대 캐릭터가 액션했을 때 이 캐릭터가 슬립이면 내 [警察] 1장 액티브', () => {
  const run = st => { const R = mk({ c: rc('id_0348'), pl: dm('P', { trait: '警察' }), n: dm('N'), d: dm('D'), u: dm('U') }, ['c'], ['u'], BS('yellow')); const s = R.turn, o = 1 - s;
    const c = field(R, s, 'c', st), pl = field(R, s, 'pl', 's'), n = field(R, s, 'n', 's'), d = field(R, s, 'd'), u = field(R, o, 'u'); attack(R, u, d); return { R, c, pl, n, s }; };
  let r = run('s'); const q = req(r.R); ok(q && q.sel.includes(r.pl) && !q.sel.includes(r.n), '[警察] 만 대상'); ans(r.R, [r.pl]); eq(r.R.cards[r.pl].st, 'a', '액티브');
  r = run('a'); ok(!r.R.eff, '이 캐릭터가 액티브면 발동 안 함'); });
t('id_0437', '파트너(백) 解決編: 레벨 합계 10 이하 2장까지 스턴(합계 초과 선택 불가)', () => {
  const R = mk({ e: rc('id_0437'), a: dm('A', { lv: '5' }), b: dm('B', { lv: '5' }), c: dm('C', { lv: '4' }) }, ['e'], ['a', 'b', 'c'], BS('white')); const s = R.turn, o = 1 - s; sol(R, s);
  const e = hand(R, s, 'e'); const a = field(R, o, 'a'), b = field(R, o, 'b'), c = field(R, o, 'c'); play(R, s, e); ok(req(R), '질의');
  ok(act(R, s, { a: 'ans', v: [a, b, c] }), '3장은 불가'); ok(act(R, s, { a: 'ans', v: [a, b, c].slice(0, 2).concat([c]) }), '레벨 합계 초과'); ans(R, [a, b]); eq(R.cards[a].st, 'x', '스턴'); eq(R.cards[b].st, 'x', '스턴'); eq(R.cards[c].st, 'a', 'c 그대로'); });
t('id_0468', '解決編: 손패 2장 리무브 → 리무브 에리어 Lv8 이하 [警察] 합계 Lv10 이하 2장, 1장 통상 + 나머지 슬립 등장', () => {
  const R = mk({ e: rc('id_0468'), h1: dm('H1', { color: 'yellow' }), h2: dm('H2', { color: 'yellow' }), h3: dm('H3', { color: 'yellow' }), p1: dm('P1', { trait: '警察', lv: '5' }), p2: dm('P2', { trait: '警察', lv: '5' }), big: dm('Big', { trait: '警察', lv: '9' }), n: dm('N', { lv: '1' }) }, ['e'], ['h1'], BS('yellow')); const s = R.turn; sol(R, s);
  trim(R, s, 0); const e = hand(R, s, 'e'), h1 = hand(R, s, 'h1'), h2 = hand(R, s, 'h2'), h3 = hand(R, s, 'h3'); /* 손패가 코스트 장수와 같으면 자동 선택되므로 1장 더 둔다 */ const p1 = rem(R, s, 'p1'), p2 = rem(R, s, 'p2'), big = rem(R, s, 'big'), n = rem(R, s, 'n'); play(R, s, e);
  ans(R, true); ok(req(R).sel.includes(h3), '손패 아무 카드나 코스트 후보'); ans(R, [h1, h2]); const q = req(R); ok(q.sel.includes(p1) && q.sel.includes(p2) && !q.sel.includes(big) && !q.sel.includes(n), 'Lv8 이하 [警察] 만'); ans(R, [p1, p2]); eq(req(R).kind, 'ack', '상대에게 공개'); eq(req(R).who, 1 - s, '상대가 확인'); ans(R, null);
  const q2 = req(R); ok(q2.kind === 'pick' && q2.sel.length === 2, '통상 등장시킬 1장 선택'); ans(R, [p1]); pump(R); ok(has(R, s, 'field', p1) && has(R, s, 'field', p2), '둘 다 등장'); eq(R.cards[p1].st, 'a', 'p1 통상'); eq(R.cards[p2].st, 's', 'p2 슬립'); eq(R.P[s].rem.filter(x => x === h1 || x === h2).length, 2, '손패 2장 리무브'); ok(has(R, s, 'hand', h3), '선택하지 않은 손패는 그대로'); });
t('id_0537', '내 [探偵]의 선언 능력: 코스트(슬립 포함) 대신 이 캐릭터를 리무브 / 비[探偵]는 불가', () => {
  const AB = [{ ic: 'declare', cost: [{ c: 'sleepSelf', n: 1 }], ops: [{ op: 'draw', n: 1 }] }];
  const mkG = () => mk({ c: rc('id_0537'), d: dm('D', { trait: '探偵', ab: AB }), n: dm('N', { ab: AB }) }, ['c'], ['c']);
  let R = mkG(); let s = R.turn; const c = field(R, s, 'c'), d = field(R, s, 'd', 's'), n = field(R, s, 'n', 's'); ok(FX.declareCheck(R, s, n, 0), '비[探偵] 슬립은 선언 불가'); eq(FX.declareCheck(R, s, d, 0), '', '슬립 [探偵] 은 대체 코스트로 가능');
  const h0 = R.P[s].hand.length; decl(R, s, d); ok(!R.eff, '대체 코스트 자동'); ok(has(R, s, 'rem', c), '楠川 리무브'); eq(R.P[s].hand.length, h0 + 1, '효과 처리(드로우)'); eq(R.cards[d].st, 's', '슬립 그대로');
  R = mkG(); s = R.turn; const c2 = field(R, s, 'c'), d2 = field(R, s, 'd', 'a'); decl(R, s, d2); const q = req(R); eq(q.kind, 'yn', '코스트를 낼 수 있으면 선택'); ans(R, true); pump(R); ok(has(R, s, 'rem', c2), '리무브'); eq(R.cards[d2].st, 'a', '슬립 코스트 안 냄');
  R = mkG(); s = R.turn; field(R, s, 'c'); const d3 = field(R, s, 'd', 'a'); decl(R, s, d3); ans(R, false); pump(R); eq(R.cards[d3].st, 's', '일반 코스트'); });
t('id_0561', '상대 턴 턴1: 슬립 상태의 이 캐릭터/내 [探偵]가 리무브되었을 때 1장 드로우', () => {
  const X = EVD('X', 'white', [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }]);
  const run = (target, st, st0 = 'a') => { const R = mk({ c: rc('id_0561'), d: dm('D', { trait: '探偵' }), n: dm('N'), x: X }, ['c'], ['x'], BS('white')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', st0), d = field(R, s, 'd', st), n = field(R, s, 'n', st);
    const id = { c, d, n }[target]; if (target === 'c') R.cards[c].st = st; const x = hand(R, o, 'x'); const h0 = R.P[s].hand.length; opp(R, s, x); auto(R, { pref: [id] }); pump(R); return R.P[s].hand.length - h0; };
  eq(run('d', 's'), 1, '슬립 [探偵] 리무브 → 드로우'); eq(run('d', 'a'), 0, '액티브 [探偵]'); eq(run('n', 's'), 0, '비[探偵]'); eq(run('c', 's'), 1, '슬립 상태의 자신'); eq(run('c', 'a'), 0, '액티브 자신'); });
t('id_0585', '턴 종료 시: 리무브 에리어 Lv6 이하 [長野県警] → 손패 / 손패 6장 이상이면 1장 리무브', () => {
  const run = n => { const R = mk({ c: rc('id_0585'), g: dm('G', { trait: '長野県警', lv: '6' }), h: dm('H', { trait: '長野県警', lv: '7' }) }, ['c'], ['c'], BS('blue')); /* 파트너(黄) 조건 능력이 끼어들지 않도록 파트너는 青 */ const s = R.turn; field(R, s, 'c'); const g = rem(R, s, 'g'), h = rem(R, s, 'h'); trim(R, s, n); endTurn(R);
    const q = req(R); ok(q.sel.includes(g) && !q.sel.includes(h), 'Lv6 이하만'); ans(R, [g]); return { R, s, g }; };
  let r = run(3); ok(!r.R.eff, '5장 이하면 추가 질의 없음'); ok(has(r.R, r.s, 'hand', r.g), '손패로'); eq(r.R.P[r.s].hand.length, 4, '+1');
  r = run(5); ok(r.R.eff && r.R.eff.req.kind === 'pick', '6장 → 1장 리무브'); auto(r.R); eq(r.R.P[r.s].hand.length, 5, '리무브 후 5장'); });
t('id_0626', '解決編 登場時: Lv6+ [探偵]/[喫茶ポアロ] 가 있으면 이 캐릭터 스턴(선택) → Lv7 이하 리무브', () => {
  const run = (name, lv, trait, yes) => { const R = mk({ c: rc('id_0626'), f: dm(name, { lv, trait }), v: dm('V', { lv: '7' }), w: dm('W', { lv: '8' }) }, ['c'], ['v', 'w']); const s = R.turn, o = 1 - s; sol(R, s); const c = hand(R, s, 'c'); field(R, s, 'f'); const v = field(R, o, 'v'), w = field(R, o, 'w'); play(R, s, c); return { R, s, o, c, v, w }; };
  let r = run('F', '6', '探偵'); eq(req(r.R).kind, 'yn', '스턴 확인'); ans(r.R, true); const q = req(r.R); ok(q.sel.includes(r.v) && !q.sel.includes(r.w), 'Lv7 이하만'); ans(r.R, [r.v]); eq(r.R.cards[r.c].st, 'x', '스턴'); ok(has(r.R, r.o, 'rem', r.v), '리무브');
  r = run('F', '6', '喫茶ポアロ'); ok(req(r.R) && req(r.R).kind === 'yn', '[喫茶ポアロ] 도 OK'); r = run('F', '5', '探偵'); ok(!r.R.eff, 'Lv5 는 불가'); r = run('F', '6', '探偵'); ans(r.R, false); ok(!r.R.eff && r.R.cards[r.c].st === 'a', '거절'); });
t('id_0628', '선언: 현장 3장 이상·LP 합계 2 이하 / 1장 드로우, 손패 5장 이상이면 1장 리무브 / 파트너 에리어에서도 선언', () => {
  const mkG = () => mk({ c: rc('id_0628'), a: dm('A', { lp: '0' }), b: dm('B', { lp: '0' }), d: dm('D', { lp: '1' }) }, ['c'], ['c']);
  let R = mkG(); let s = R.turn; const c = field(R, s, 'c'); field(R, s, 'a'); ok(FX.declareCheck(R, s, c, di(R, c, 'declare', 1)), '2장뿐이면 불가'); field(R, s, 'b'); trim(R, s, 3); eq(FX.declareCheck(R, s, c, di(R, c, 'declare', 1)), '', '선언 가능'); decl(R, s, c, 1); ok(!R.eff, '손패 4장 이하: 질의 없음'); eq(R.P[s].hand.length, 4, '+1'); ok(FX.declareCheck(R, s, c, di(R, c, 'declare', 1)), '턴 1회');
  R = mkG(); s = R.turn; const c2 = field(R, s, 'c'); field(R, s, 'a'); field(R, s, 'b'); const d = field(R, s, 'd'); ok(FX.declareCheck(R, s, c2, di(R, c2, 'declare', 1)), 'LP 합계 3 → 불가');
  R = mkG(); s = R.turn; const c3 = pa(R, s, 'c'); field(R, s, 'a'); field(R, s, 'b'); field(R, s, 'd'); const d3 = R.P[s].field[2]; R.cards[d3].lpm = 2; ok(FX.declareCheck(R, s, c3, di(R, c3, 'declare', 1)), 'LP 합계 3 → 불가(파트너 에리어에서도 같은 조건)'); R.cards[d3].lpm = 0; trim(R, s, 5); eq(FX.declareCheck(R, s, c3, di(R, c3, 'declare', 1)), '', '파트너 에리어 선언'); decl(R, s, c3, 1); eq(req(R).kind, 'pick', '손패 6장 → 1장 리무브'); auto(R); eq(R.P[s].hand.length, 5, '드로우 1 - 리무브 1'); });
t('id_0679', '解決編 登場時: 손패 1장 리무브 → LP0 인 鉄刃 액티브(LP1 은 대상 아님)', () => {
  const R = mk({ c: rc('id_0679'), t0: dm('鉄刃', { lp: '0' }), t1: dm('鉄刃', { lp: '1' }), h: dm('H') }, ['c']); const s = R.turn; sol(R, s); const c = hand(R, s, 'c'); const a = field(R, s, 't0', 's'), b = field(R, s, 't1', 's'), h = hand(R, s, 'h'); play(R, s, c);
  eq(req(R).kind, 'pick', '손패 질의'); ans(R, [h]); const q = req(R); ok(q.sel.includes(a) && !q.sel.includes(b), 'LP0 만'); ans(R, [a]); eq(R.cards[a].st, 'a', '액티브'); eq(R.cards[b].st, 's', 'LP1 그대로'); });
t('id_0741', '컷인 AP+1000, 白鳥任三郎/[少年探偵団] 에게 컷인했으면 1장 드로우', () => {
  const run = (nm, trait) => { const R = mk({ c: rc('id_0741'), a: dm(nm, { trait, ap: '2000' }), d: dm('D') }, ['c'], ['d']); const s = R.turn, o = 1 - s; const k = hand(R, s, 'c'); const a = field(R, s, 'a'), d = field(R, o, 'd'); const h0 = R.P[s].hand.length;
    attack(R, a, d); let g = 0; while (R.sub && R.sub.who !== s && g++ < 4) { const e0 = act(R, R.sub.who, { a: 'pass' }); if (e0) throw new Error(e0); } const e = act(R, s, { a: 'cin', id: k }); if (e) throw new Error(e); eq(R.cards[a].cm, 1000, 'AP+1000'); finishContact(R); return R.P[s].hand.length - h0; };
  eq(run('白鳥任三郎', ''), 0, '컷인 -1 + 드로우 1'); eq(run('A', '少年探偵団'), 0, '[少年探偵団] 드로우'); eq(run('A', ''), -1, '일반 캐릭터: 드로우 없음'); });
t('id_0745', '3모드 중 택1 / 코난을 슬립시키면 3개 모두(위에서 순서대로)', () => {
  const mkG = () => { const R = mk({ e: rc('id_0745'), cn: dm('江戸川コナン'), sx: dm('SX'), kt: dm('KT', { trait: '怪盗' }), rc: dm('RC') }, ['e'], ['sx', 'kt']); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'); const cn = field(R, s, 'cn'), sx = field(R, o, 'sx', 'x'), kt = field(R, o, 'kt'), r = rem(R, s, 'rc'); return { R, s, o, e, cn, sx, kt, r }; };
  let g = mkG(); play(g.R, g.s, g.e); ans(g.R, [g.cn]); auto(g.R, { pref: [g.sx, g.kt, g.r] }); pump(g.R); eq(g.R.cards[g.cn].st, 's', '코난 슬립'); eq(g.R.cards[g.sx].st, 'a', '스턴 → 액티브'); eq(g.R.cards[g.kt].st, 'x', '[怪盗] 스턴'); ok(has(g.R, g.s, 'hand', g.r), '리무브 에리어 → 손패');
  g = mkG(); play(g.R, g.s, g.e); ans(g.R, []); eq(req(g.R).kind, 'opt', '모드 선택'); ans(g.R, 1); ans(g.R, [g.kt]); pump(g.R); eq(g.R.cards[g.kt].st, 'x', '모드 2 만'); eq(g.R.cards[g.sx].st, 'x', '모드 1 은 안 함'); ok(!has(g.R, g.s, 'hand', g.r), '모드 3 안 함'); });
t('id_0751', '解決編 登場時: 【緑】이벤트의 효과로 등장했을 때 슬립(선택) → Lv7 이하 리무브 / 손패 등장은 불가', () => {
  const E = col => EVD('E', col, [{ op: 'play', from: 'hand', n: 1, filter: {} }]);
  const run = (ecol, viaEv) => { const R = mk({ c: rc('id_0751'), e: E(ecol), v: dm('V', { lv: '7' }) }, ['c', 'e'], ['v'], BS('green', 'green,blue')); const s = R.turn, o = 1 - s; sol(R, s); const c = hand(R, s, 'c'), v = field(R, o, 'v'); if (viaEv) { const e = hand(R, s, 'e'); play(R, s, e); ans(R, [c]); } else play(R, s, c); return { R, s, o, c, v }; };
  let r = run('green', true); eq(req(r.R).kind, 'yn', '슬립 확인'); ans(r.R, true); ans(r.R, [r.v]); ok(has(r.R, r.o, 'rem', r.v), '리무브'); eq(r.R.cards[r.c].st, 's', '슬립');
  r = run('green', false); ok(!r.R.eff, '손패에서 등장: 발동 안 함'); r = run('blue', true); ok(!r.R.eff, '【緑】 이외 이벤트: 발동 안 함'); });
t('id_0756', '상대 턴: 상대 현장에 Lv8 캐릭터 등장 시 1장 드로우(선택) → 1장 리무브', () => {
  const run = (lv, yes) => { const R = mk({ c: rc('id_0756'), big: dm('Big', { lv, color: 'green' }) }, ['c'], ['big'], BS('green')); const s = R.turn, o = 1 - s; field(R, s, 'c'); const b = hand(R, o, 'big'); const h0 = R.P[s].hand.length; opp(R, s, b); return { R, s, h0 }; };
  let r = run('8'); eq(req(r.R).kind, 'yn', '드로우 확인'); eq(req(r.R).who, r.s, '내가 응답'); ans(r.R, true); eq(req(r.R).kind, 'pick', '1장 리무브'); auto(r.R); eq(r.R.P[r.s].hand.length, r.h0, '드로우 1 - 리무브 1');
  r = run('8'); ans(r.R, false); eq(r.R.P[r.s].hand.length, r.h0, '거절'); r = run('7'); ok(!r.R.eff, 'Lv7 은 발동 안 함'); });
t('id_0758', '파트너(녹): AP8000 이하 리무브 / 효과로 사용되었으면 1장 드로우', () => {
  const U1 = EVD('U', 'green', [{ op: 'useEv', filter: {} }]);
  const mkG = () => { const R = mk({ e: rc('id_0758'), u: U1, v: dm('V', { ap: '8000' }), w: dm('W', { ap: '9000' }) }, ['e', 'u'], ['v', 'w'], BS('green')); const s = R.turn, o = 1 - s; return { R, s, o, v: field(R, o, 'v'), w: field(R, o, 'w') }; };
  let g = mkG(); const e = hand(g.R, g.s, 'e'); const h0 = g.R.P[g.s].hand.length; play(g.R, g.s, e); ok(req(g.R).sel.includes(g.v) && !req(g.R).sel.includes(g.w), 'AP8000 이하'); ans(g.R, [g.v]); pump(g.R); ok(has(g.R, g.o, 'rem', g.v), '리무브'); eq(g.R.P[g.s].hand.length, h0 - 1, '직접 사용: 드로우 없음');
  g = mkG(); const e2 = hand(g.R, g.s, 'e'), u = hand(g.R, g.s, 'u'); const h1 = g.R.P[g.s].hand.length; play(g.R, g.s, u); ans(g.R, [e2]); ans(g.R, [g.v]); pump(g.R); eq(g.R.P[g.s].hand.length, h1 - 2 + 1, '효과로 사용: 1장 드로우'); });
t('id_0761', '선언(슬립+손패1리무브): AP8000 이하 리무브, 파트너 에리어 [ビッグジュエル] 1장 리무브하면 2장 드로우', () => {
  const run = hasBj => { const R = mk({ c: rc('id_0761'), v: dm('V', { ap: '8000' }), w: dm('W', { ap: '9000' }), bj: dm('BJ', { trait: 'ビッグジュエル' }) }, ['c'], ['v', 'w']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v'), w = field(R, o, 'w'); const bj = hasBj ? pa(R, s, 'bj') : null; const h0 = R.P[s].hand.length;
    decl(R, s, c); eq(req(R).kind, 'pick', '코스트: 손패 1장'); ans(R, [R.P[s].hand[0]]); const q = req(R); ok(q.sel.includes(v) && !q.sel.includes(w), 'AP8000 이하'); ans(R, [v]); return { R, s, o, c, v, bj, h0 }; };
  let r = run(true); eq(req(r.R).kind, 'yn', '파트너 에리어 카드 리무브 확인'); ans(r.R, true); pump(r.R); ok(has(r.R, r.o, 'rem', r.v), '리무브'); ok(has(r.R, r.s, 'rem', r.bj), 'BJ 리무브'); eq(r.R.P[r.s].hand.length, r.h0 - 1 + 2, '2장 드로우'); eq(r.R.cards[r.c].st, 's', '슬립 코스트');
  r = run(true); ans(r.R, false); eq(r.R.P[r.s].hand.length, r.h0 - 1, '거절: 드로우 없음'); r = run(false); ok(!r.R.eff, 'BJ 없음: 질의 없음'); eq(r.R.P[r.s].hand.length, r.h0 - 1, '드로우 없음'); });
t('id_0765', '解決編 登場時: 내 【白】 1장 슬립+손패 1장 리무브 → Lv7 이하 리무브 / 黒羽快斗 를 슬립시켰으면 1장 드로우', () => {
  const run = nm => { const R = mk({ c: rc('id_0765'), w: dm(nm, { color: 'white' }), v: dm('V', { lv: '7' }), x: dm('X', { lv: '8' }) }, ['c'], ['v', 'x']); const s = R.turn, o = 1 - s; sol(R, s); const c = hand(R, s, 'c'), w = field(R, s, 'w'), v = field(R, o, 'v'), x = field(R, o, 'x'); const h0 = R.P[s].hand.length; play(R, s, c);
    eq(req(R).kind, 'yn', '코스트 확인'); ans(R, true); const q0 = req(R); ok(q0.sel.includes(w) && q0.sel.includes(c), '내 【白】 캐릭터'); ans(R, [w]); ans(R, [R.P[s].hand[0]]); const q = req(R); ok(q.sel.includes(v) && !q.sel.includes(x), 'Lv7 이하'); ans(R, [v]); pump(R); return { R, s, o, w, v, h0 }; };
  let r = run('黒羽快斗'); eq(r.R.cards[r.w].st, 's', '슬립'); ok(has(r.R, r.o, 'rem', r.v), '리무브'); eq(r.R.P[r.s].hand.length, r.h0 - 1 - 1 + 1, '黒羽快斗 → 드로우'); r = run('Z'); eq(r.R.P[r.s].hand.length, r.h0 - 1 - 1, '다른 캐릭터: 드로우 없음'); });
t('id_0766', '登場時: 파트너 에리어 [ビッグジュエル] 2장 리무브 → 리무브 에리어 Lv6 이하 中森青子 를 슬립 상태로 등장', () => {
  const run = nBj => { const R = mk({ c: rc('id_0766'), a: dm('中森青子', { lv: '6' }), b: dm('中森青子', { lv: '7' }), j1: dm('J1', { trait: 'ビッグジュエル' }), j2: dm('J2', { trait: 'ビッグジュエル' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'), a = rem(R, s, 'a'), b = rem(R, s, 'b'); const js = []; if (nBj > 0) js.push(pa(R, s, 'j1')); if (nBj > 1) js.push(pa(R, s, 'j2')); play(R, s, c); return { R, s, a, b, js }; };
  let r = run(2); eq(req(r.R).kind, 'yn', '확인'); ans(r.R, true); const q = req(r.R); ok(q.sel.includes(r.a) && !q.sel.includes(r.b), 'Lv6 이하'); ans(r.R, [r.a]); ok(has(r.R, r.s, 'field', r.a), '등장'); eq(r.R.cards[r.a].st, 's', '슬립'); ok(r.js.every(j => has(r.R, r.s, 'rem', j)), 'BJ 2장 리무브');
  r = run(1); ok(!r.R.eff && !has(r.R, r.s, 'field', r.a), 'BJ 1장: 불가'); });
t('id_0809', '登場時: 리무브 에리어 Lv1 이하 【黄】 이벤트 → 손패 / 손패 6장 이상이면 1장 리무브', () => {
  const run = n => { const R = mk({ c: rc('id_0809'), e1: { ...EVD('E1', 'yellow', []), lv: '1' }, e2: { ...EVD('E2', 'yellow', []), lv: '2' }, e3: { ...EVD('E3', 'red', []), lv: '1' } }, ['c']); const s = R.turn; const c = hand(R, s, 'c'), e1 = rem(R, s, 'e1'), e2 = rem(R, s, 'e2'), e3 = rem(R, s, 'e3'); trim(R, s, n); if (!R.P[s].hand.includes(c)) { R.P[s].hand.pop(); R.P[s].hand.push(c); } play(R, s, c); const q = req(R); ok(q.sel.includes(e1) && !q.sel.includes(e2) && !q.sel.includes(e3), 'Lv1 이하 【黄】 이벤트만'); ans(R, [e1]); return { R, s, e1 }; };
  let r = run(3); ok(!r.R.eff && has(r.R, r.s, 'hand', r.e1), '손패로'); eq(r.R.P[r.s].hand.length, 3, '3 -1 +1'); r = run(7); eq(req(r.R).kind, 'pick', '6장 이상 → 1장 리무브'); auto(r.R); eq(r.R.P[r.s].hand.length, 6, '7 -1 +1 -1'); });
t('id_0814', '[ミスリード]1 을 가진다(상대 턴 현장리무브 능력도 유지)', () => {
  const R = mk({ c: rc('id_0814') }, ['c']); const s = R.turn; const c = field(R, s, 'c'); ok(FX.stat(R, c).kw.includes('misread1'), '미스리드'); const ab = R.defs[R.cards[c].d].ab; ok(!ab.some(a => a.ic === 'manual'), 'manual 없음'); ok(ab.some(a => a.ic === 'onremoved'), '현장리무브 능력 유지'); });
t('id_0874', '解決編 登場時: 상대 캐릭터 1장 — 슬립이면 스턴 / 액티브면 슬립 / 스턴이면 변화 없음', () => {
  const run = st => { const R = mk({ c: rc('id_0874'), v: dm('V') }, ['c'], ['v']); const s = R.turn, o = 1 - s; sol(R, s); const c = hand(R, s, 'c'), v = field(R, o, 'v', st); play(R, s, c); ans(R, [v]); pump(R); return R.cards[v].st; };
  eq(run('s'), 'x', '슬립 → 스턴'); eq(run('a'), 's', '액티브 → 슬립'); eq(run('x'), 'x', '스턴 그대로'); });
t('id_0966', '파트너(녹) 解決編 登場時: Lv6+ [探偵] 1장 슬립+손패 1장 리무브 → Lv7 이하 리무브 / 服部平次·江戸川コナン 슬립이면 드로우', () => {
  const run = (nm, lv) => { const R = mk({ c: rc('id_0966'), w: dm(nm, { trait: '探偵', lv }), v: dm('V', { lv: '7' }) }, ['c'], ['v'], BS('green')); const s = R.turn, o = 1 - s; sol(R, s); const c = hand(R, s, 'c'), w = field(R, s, 'w'), v = field(R, o, 'v'); const h0 = R.P[s].hand.length; play(R, s, c); return { R, s, o, c, w, v, h0 }; };
  let r = run('服部平次', '6'); ans(r.R, true); /* Lv6+ [探偵] 가 1명뿐이므로 슬립 대상은 자동 선택 */ ans(r.R, [r.R.P[r.s].hand[0]]); ans(r.R, [r.v]); pump(r.R); ok(has(r.R, r.o, 'rem', r.v), '리무브'); eq(r.R.P[r.s].hand.length, r.h0 - 2 + 1, '服部平次 → 드로우');
  r = run('江戸川コナン', '6'); ans(r.R, true); /* Lv6+ [探偵] 가 1명뿐이므로 슬립 대상은 자동 선택 */ ans(r.R, [r.R.P[r.s].hand[0]]); ans(r.R, [r.v]); pump(r.R); eq(r.R.P[r.s].hand.length, r.h0 - 2 + 1, '江戸川コナン → 드로우');
  r = run('X', '6'); ans(r.R, true); /* Lv6+ [探偵] 가 1명뿐이므로 슬립 대상은 자동 선택 */ ans(r.R, [r.R.P[r.s].hand[0]]); ans(r.R, [r.v]); pump(r.R); eq(r.R.P[r.s].hand.length, r.h0 - 2, '다른 이름: 드로우 없음');
  r = run('服部平次', '5'); ok(!r.R.eff, 'Lv5 [探偵]: 코스트 불가');
  { const R = mk({ c: rc('id_0966'), w: dm('服部平次', { trait: '探偵', lv: '6' }), w5: dm('W5', { trait: '探偵', lv: '5' }), w7: dm('W7', { trait: '探偵', lv: '7' }), z: dm('Z', { trait: '高校生', lv: '9' }), v: dm('V', { lv: '7' }) }, ['c'], ['v'], BS('green')); const s = R.turn; sol(R, s); const c = hand(R, s, 'c'), w = field(R, s, 'w'), w5 = field(R, s, 'w5'), w7 = field(R, s, 'w7'), z = field(R, s, 'z'); play(R, s, c); ans(R, true); const q = req(R); ok(q.sel.includes(w) && q.sel.includes(w7) && !q.sel.includes(w5) && !q.sel.includes(z), '슬립 대상: Lv6 이상 [探偵] 만'); } });
t('id_1005', '내 턴 턴1: 내 현장에 Lv8 캐릭터 등장 시 상대 현장에 Lv7 이 없으면 1장 드로우', () => {
  const run = (oppLv, n8 = 1) => { const R = mk({ c: rc('id_1005'), b1: dm('B1', { lv: '8', color: 'red' }), b2: dm('B2', { lv: '8', color: 'red' }), v: dm('V', { lv: oppLv }) }, ['c'], ['v'], BS('red')); const s = R.turn, o = 1 - s; field(R, s, 'c'); field(R, o, 'v'); const a = hand(R, s, 'b1'), b = hand(R, s, 'b2'); trim(R, s, 2); R.P[s].hand.push(a, b); const h0 = R.P[s].hand.length; play(R, s, a); if (n8 > 1) { R.fl.hw = 0; play(R, s, b); } pump(R); return R.P[s].hand.length - h0; };
  eq(run('6'), 0, 'Lv7 없음: 드로우(-1+1)'); eq(run('7'), -1, '상대 Lv7 있음: 드로우 없음'); });
t('id_1010', '내 턴 종료 시: 이번 턴 【疾風】 을 발동한 내 캐릭터 전원 액티브(파트너 에리어에서도)', () => {
  for (const zone of ['field', 'pa']) { const R = mk({ c: rc('id_1010'), a: dm('A'), b: dm('B') }, ['c']); const s = R.turn; const c = zone === 'pa' ? pa(R, s, 'c') : field(R, s, 'c'); const a = field(R, s, 'a', 's'), b = field(R, s, 'b', 's');
    R.fl.hayFired = { [a]: 1 }; endTurn(R); auto(R); eq(R.cards[a].st, 'a', zone + ': 질풍 발동 캐릭터 액티브'); eq(R.cards[b].st, 's', zone + ': 미발동 캐릭터 그대로'); } });
t('id_1029', 'AP8000 이하 리무브 / 이번 턴 캐릭터가 등장하지 않았다면 리무브 에리어 Lv4 이하 [警察] 등장', () => {
  const run = entered => { const R = mk({ e: rc('id_1029'), v: dm('V', { ap: '8000' }), pl: dm('P', { trait: '警察', lv: '4' }), q: dm('Q', { trait: '警察', lv: '5' }) }, ['e'], ['v'], BS('yellow')); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'), v = field(R, o, 'v'), pl = rem(R, s, 'pl'), q = rem(R, s, 'q'); if (entered) { R.fl.entCnt = [0, 0]; R.fl.entCnt[s] = 1; } play(R, s, e); ans(R, [v]); return { R, s, o, v, pl, q }; };
  let r = run(false); const q = req(r.R); ok(q && q.sel.includes(r.pl) && !q.sel.includes(r.q), 'Lv4 이하 [警察]'); ans(r.R, [r.pl]); ok(has(r.R, r.s, 'field', r.pl), '등장'); ok(has(r.R, r.o, 'rem', r.v), '리무브');
  r = run(true); ok(!r.R.eff && !has(r.R, r.s, 'field', r.pl), '이번 턴 등장했으면 등장 효과 없음'); ok(has(r.R, r.o, 'rem', r.v), '리무브는 함'); });
t('id_1035', '解決編 선언(슬립): 이 캐릭터와 같은 AP 의 캐릭터 1장 리무브(다른 AP 는 불가)', () => {
  const R = mk({ c: rc('id_1035'), e: dm('E', { ap: '3000' }), d: dm('D', { ap: '4000' }) }, ['c'], ['e', 'd']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const e = field(R, o, 'e'), d = field(R, o, 'd');
  ok(FX.declareCheck(R, s, c, di(R, c)), '解決編 이전엔 불가'); sol(R, s); decl(R, s, c); const q = req(R); ok(q.sel.includes(e) && !q.sel.includes(d) && !q.sel.includes(c), '같은 AP 만'); ans(R, [e]); ok(has(R, o, 'rem', e), '리무브'); eq(R.cards[c].st, 's', '슬립 코스트'); });
t('id_1036', '事件【赤】&【黒】 事件編 登場時: 【赤】/【黒】 손패 1장 리무브 → 2장 드로우, Lv7 이상이면 상대 덱 위 3장 리무브', () => {
  const run = (lv, caseCol = 'red,black', solved = false) => { const R = mk({ c: rc('id_1036'), r: dm('R', { color: 'red', lv }), u: dm('U', { color: 'blue' }) }, ['c'], ['c'], BS('black', caseCol)); const s = R.turn, o = 1 - s; if (solved) sol(R, s); const c = hand(R, s, 'c'), r = hand(R, s, 'r'), u = hand(R, s, 'u'); play(R, s, c); return { R, s, o, c, r, u }; };
  let g = run('7'); const q = req(g.R); ok(q.sel.includes(g.r) && !q.sel.includes(g.u), '【赤】/【黒】 만'); const d0 = g.R.P[g.o].deck.length, h0 = g.R.P[g.s].hand.length; ans(g.R, [g.r]); pump(g.R); eq(g.R.P[g.s].hand.length, h0 - 1 + 2, '2장 드로우'); eq(g.R.P[g.o].deck.length, d0 - 3, '상대 덱 3장 리무브');
  g = run('6'); const d1 = g.R.P[g.o].deck.length; ans(g.R, [g.r]); pump(g.R); eq(g.R.P[g.o].deck.length, d1, 'Lv6: 상대 덱 그대로'); g = run('7', 'black'); ok(!g.R.eff, '사건 색 불일치'); g = run('7', 'red,black', true); ok(!g.R.eff, '解決編 에서는 발동 안 함'); });
t('id_1054', '내 턴 登場時/変装時: 파트너 에리어 [ビッグジュエル] 1장 리무브 → Lv7 이하 슬립/스턴 캐릭터 리무브(액티브·Lv8 불가)', () => {
  const defs = { c: rc('id_1054'), m: dm('M', { ap: '9000' }), d: dm('D'), bj: dm('BJ', { trait: 'ビッグジュエル' }), v: dm('V', { lv: '7' }), w: dm('W', { lv: '7' }), x: dm('X', { lv: '8' }), y: dm('Y', { lv: '7' }) };
  let R = mk(defs, ['c'], ['v']); let s = R.turn, o = 1 - s; let c = hand(R, s, 'c'); const bj = pa(R, s, 'bj'); let v = field(R, o, 'v', 's'), w = field(R, o, 'w', 'a'), x = field(R, o, 'x', 's'), y = field(R, o, 'y', 'x'); play(R, s, c); ans(R, true); let q = req(R); ok(q.sel.includes(v) && q.sel.includes(y) && !q.sel.includes(w) && !q.sel.includes(x), '슬립/스턴 Lv7 이하'); ans(R, [v]); ok(has(R, o, 'rem', v), '리무브'); ok(has(R, s, 'rem', bj), 'BJ 리무브');
  R = mk(defs, ['c', 'm'], ['v']); s = R.turn; o = 1 - s; c = hand(R, s, 'c'); const m = field(R, s, 'm'); const d = field(R, o, 'd'); pa(R, s, 'bj'); v = field(R, o, 'v', 's'); attack(R, m, d); finishContact(R, [{ s, m: { a: 'dis', id: c } }], { pref: [v] }); ok(has(R, o, 'rem', v), '変装時에도 발동'); });
t('id_1106', '턴 종료 시: 내 현장에 怪盗キッド 가 있으면 리무브 에리어의 [ビッグジュエル] 이벤트 → 파트너 에리어 또는 손패', () => {
  const run = (kid, pick) => { const R = mk({ c: rc('id_1106'), kd: dm('怪盗キッド'), b: { ...EVD('B', 'white', []), trait: 'ビッグジュエル' }, e: EVD('E', 'white', []) }, ['c']); const s = R.turn; field(R, s, 'c'); if (kid) field(R, s, 'kd'); const b = rem(R, s, 'b'), e = rem(R, s, 'e'); endTurn(R); return { R, s, b, e }; };
  let r = run(true); const q = req(r.R); ok(q.sel.includes(r.b) && !q.sel.includes(r.e), '[ビッグジュエル] 이벤트만'); ans(r.R, [r.b]); eq(req(r.R).kind, 'ack', '상대에게 공개'); ans(r.R, null); eq(req(r.R).kind, 'opt', '이동처 선택'); ans(r.R, 0); auto(r.R); ok(has(r.R, r.s, 'pa', r.b), '파트너 에리어로');
  r = run(true); ans(r.R, [r.b]); ans(r.R, null); ans(r.R, 1); auto(r.R); ok(has(r.R, r.s, 'hand', r.b), '손패로'); r = run(false); ok(!r.R.eff, '怪盗キッド 없음: 발동 안 함'); });
t('id_1127', '상대 턴 턴1: 상대 캐릭터가 액션[事件]했을 때 이 캐릭터를 액티브(선택)', () => {
  const run = k => { const R = mk({ c: rc('id_1127'), u: dm('U'), d: dm('D') }, ['c'], ['u']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', 's'), d = field(R, s, 'd'), u = field(R, o, 'u'); R.turn = o; R.fl = {}; R.cards[u].sum = 0;
    if (k === 'case') { U.evid(R, s, 1); const e = act(R, o, { a: 'action', id: u, k: 'case' }); if (e) throw new Error(e); act(R, s, { a: 'guard', id: null }); } else attack(R, u, d); return { R, c, s }; };
  let r = run('case'); eq(req(r.R) && req(r.R).kind, 'yn', '확인'); ans(r.R, true); eq(r.R.cards[r.c].st, 'a', '액티브'); r = run('char'); ok(!r.R.eff, '캐릭터에 대한 액션: 발동 안 함'); });
t('id_1137', '리무브 에리어의 지정 5명 중 1장 → 손패, 그 카드의 레벨 이상의 캐릭터 1장 리무브', () => {
  const R = mk({ e: rc('id_1137'), f: dm('降谷零', { lv: '5' }), x: dm('X', { lv: '4' }), y: dm('Y', { lv: '5' }), z: dm('Z', { lv: '6' }), g: dm('Other', { lv: '1' }) }, ['e'], ['x', 'y', 'z']); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'), f = rem(R, s, 'f'), g = rem(R, s, 'g'); const x = field(R, o, 'x'), y = field(R, o, 'y'), z = field(R, o, 'z'); play(R, s, e);
  const q = req(R); ok(q.sel.includes(f) && !q.sel.includes(g), '지정 이름만'); ans(R, [f]); ok(has(R, s, 'hand', f), '손패'); const q2 = req(R); ok(!q2.sel.includes(x) && q2.sel.includes(y) && q2.sel.includes(z), '레벨 5 이상'); ans(R, [z]); ok(has(R, o, 'rem', z), '리무브'); });
t('id_0419', '이 캐릭터/服部平次 등장 시: 상대 캐릭터 1장의 원래 능력을 턴 종료 시까지 무효', () => {
  const mkG = () => { const R = mk({ c: rc('id_0419'), h: dm('服部平次', { color: 'green' }), n: dm('N', { color: 'green' }), v: dm('V', { ab: [{ ic: 'static', tgt: { sel: 'self' }, ap: 2000 }] }) }, ['c', 'h', 'n'], ['v'], BS('green')); const s = R.turn, o = 1 - s; return { R, s, o, v: field(R, o, 'v') }; };
  let g = mkG(); const c = hand(g.R, g.s, 'c'); eq(FX.stat(g.R, g.v).ap, 2000, '기본 static'); play(g.R, g.s, c); ans(g.R, [g.v]); pump(g.R); eq(FX.stat(g.R, g.v).ap, 0, '능력 무효'); g.R.turn = g.s; endTurn(g.R); eq(FX.stat(g.R, g.v).ap, 2000, '턴 종료 시 복구');
  g = mkG(); const c2 = field(g.R, g.s, 'c'), h = hand(g.R, g.s, 'h'); play(g.R, g.s, h); ans(g.R, [g.v]); eq(FX.stat(g.R, g.v).ap, 0, '服部平次 등장 시에도'); g = mkG(); field(g.R, g.s, 'c'); const n = hand(g.R, g.s, 'n'); play(g.R, g.s, n); ok(!g.R.eff, '다른 캐릭터 등장: 발동 안 함'); });
t('id_0576', '解決編 상대 턴 종료 시: 내 현장 2장 이하면 상대는 손패 1장 리무브', () => {
  const run = (n, solved) => { const R = mk({ c: rc('id_0576'), a: dm('A'), b: dm('B') }, ['c'], ['c']); const s = R.turn, o = 1 - s; field(R, s, 'c'); if (n > 1) field(R, s, 'a'); if (n > 2) field(R, s, 'b'); if (solved) sol(R, s); R.turn = o; R.fl = {}; trim(R, o, 4); endTurn(R); return { R, o }; };
  let r = run(2, true); const q = req(r.R); ok(q && q.who === r.o && q.kind === 'pick', '턴 플레이어가 1장 리무브'); auto(r.R); eq(r.R.P[r.o].hand.length, 3, '-1'); r = run(3, true); ok(!r.R.eff, '3장이면 발동 안 함'); r = run(2, false); ok(!r.R.eff, '事件編 에서는 발동 안 함'); });
t('id_1094', '解決編 내 턴: 현장에 服部平蔵/遠山銀司郎 가 있으면 손패의 이 이벤트는 Lv-3', () => {
  const R = mk({ e: rc('id_1094'), a: dm('服部平蔵'), b: dm('遠山銀司郎'), z: dm('Z') }, ['e']); const s = R.turn; const e = hand(R, s, 'e'); eq(FX.lvOf(R, e), 7, '기본'); sol(R, s); eq(FX.lvOf(R, e), 7, '해당 캐릭터 없음'); field(R, s, 'z'); eq(FX.lvOf(R, e), 7, '다른 캐릭터');
  const a = field(R, s, 'a'); eq(FX.lvOf(R, e), 4, '服部平蔵'); R.P[s].field = R.P[s].field.filter(x => x !== a); field(R, s, 'b'); eq(FX.lvOf(R, e), 4, '遠山銀司郎'); R.turn = 1 - s; eq(FX.lvOf(R, e), 7, '상대 턴: 해제'); });
t('id_1099', '解決編 내 턴: 상대 캐릭터가 컨택트로 리무브되어도 그 【現場リムーブ時】 는 발동하지 않음(효과 리무브는 발동)', () => {
  const run = (hasC, viaEff) => { const R = mk({ c: rc('id_1099'), a: dm('A', { ap: '9000' }), v: dm('V', { ab: [{ ic: 'onremoved', ops: [{ op: 'draw', n: 1 }] }] }), d: dm('D'), x: EVD('X', 'green', [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }]) }, ['c', 'x'], ['v', 'd']); const s = R.turn, o = 1 - s; sol(R, s); if (hasC) field(R, s, 'c'); const a = field(R, s, 'a'), v = field(R, o, 'v'); const h0 = R.P[o].hand.length;
    if (viaEff) { const x = hand(R, s, 'x'); play(R, s, x); ans(R, [v]); pump(R); } else { attack(R, a, v); finishContact(R); } ok(!has(R, o, 'field', v), '리무브됨'); return R.P[o].hand.length - h0; };
  eq(run(false, false), 1, '대조군: 컨택트 리무브 시 발동'); eq(run(true, false), 0, '컨택트 리무브: 발동 안 함'); eq(run(true, true), 1, '효과 리무브: 발동'); });
t('id_1107', '내 사건이 [工藤新一 NYの事件] 이면 손패에서 사용할 때 사건 카드의 색을 무시', () => {
  const run = nm => { const R = mk({ c: rc('id_1107') }, ['c'], ['c'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: nm, type: 'case', color: 'red', lv: '2', lv2: '3' } }); const s = R.turn; const c = hand(R, s, 'c'); try { play(R, s, c); return true; } catch (e) { return false; } };
  eq(run('工藤新一 NYの事件'), true, '색 무시로 사용 가능'); eq(run('K'), false, '다른 사건: 색 불일치로 불가'); });
module.exports = {};
if (require.main === module) U.runAll('mz_pe');
