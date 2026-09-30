// 전체 DB(conan-db-full.json)에서 새로 자동화한 패턴의 대표 카드 검증.
//  (1) 규칙 파서의 ab 결과(골든, test/fixtures/full_samples.json — API 없이 원문 fx 로만 생성)  (2) 실제 엔진이 그 ab 를 "실행"하는지.
//  fixture 재생성: python3 test/gen_full_fixture.py conan-db-full.json   /  골든 일치 검사는 test/importer_test.py
const fs = require('fs'), path = require('path');
const { S, game, key, give, ok, eq, act } = require('./helpers');
const FX = S.FX;
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/full_samples.json'), 'utf8')).cards;
const real = (id, over = {}) => ({ ...FIX[id], color: 'blue', lv: '0', ...over });
const B = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const dummy = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ...extra });
const G = (defs, l0 = [], l1 = l0) => { const R = game({ ...B, ...defs }, l0, l1); R.P.forEach(P => P.deck.unshift(...P.file.splice(0))); return R; };
const T = []; const t = (n, f) => T.push([n, f]);
const req = R => R.eff && R.eff.req;
const ans = (R, v) => { ok(R.eff, '질의가 와야 함'); const e = act(R, R.eff.req.who, { a: 'ans', v }); if (e) throw new Error('ans: ' + e); };
const auto = (R, yn = true, ...pref) => { let g = 0; while (R.eff && g++ < 30) { const q = req(R); ans(R, q.kind === 'yn' ? yn : q.kind === 'pick' ? (q.ordered ? q.ids : [pref.find(x => q.sel.includes(x)) ?? q.sel[0]].filter(x => x != null && (q.min > 0 || pref.some(y => q.sel.includes(y))))) : q.kind === 'opt' ? 0 : q.kind === 'optm' ? [] : null); } };
const filler = (R, s, n) => { const out = []; const P = R.P[s]; for (let i = P.deck.length - 1; i >= 0 && out.length < n; i--) { const k = key(R, P.deck[i]); if (k === 'filler' || /^f\d+$/.test(k)) out.push(P.deck.splice(i, 1)[0]); } ok(out.length === n, '필러 부족'); return out; };
const fillFile = (R, s, n) => { const P = R.P[s]; while (P.file.length < n) P.file.push(filler(R, s, 1)[0]); };
const evid = (R, s, n, up = false) => { const ids = filler(R, s, n); ids.forEach(i => { R.cards[i].up = up; R.P[s].evid.push(i); }); return ids; };
const solve = (R, s) => { FX.setSolved(R, s); FX.pump(R); };
const ready = (R, id) => { R.cards[id].sum = 0; R.cards[id].st = 'a'; return id; };
const field = (R, s, k, st = 'a') => { const id = give(R, s, k, 'field'); R.cards[id].st = st; R.cards[id].sum = 0; return id; };
// 공격자 s 의 a 가 상대 캐릭터 tid 를 액션 → 가드 없음 → 컨택트 진입. 상대(o)가 행동할 차례까지 s 는 패스.
function toContact(R, s, a, tid) { ready(R, a); const e = act(R, s, { a: 'action', id: a, k: 'char', tid }); if (e) throw new Error('action: ' + e); act(R, 1 - s, { a: 'guard', id: null }); ok(R.sub && R.sub.type === 'contact', '컨택트'); }
const endContact = R => { let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' }); FX.pump(R); };
const parsed = (id, ic, n = 0) => { const a = FIX[id].ab.filter(x => x.ic === ic); ok(a[n], `${id}: 파싱 결과에 ${ic} 없음 ${JSON.stringify(FIX[id].ab.map(x => x.ic))}`); return a[n]; };
const autoAll = (R, want) => { let g = 0; while (R.eff && g++ < 30) { const q = req(R); if (q.kind === 'pick' && want.some(x => q.sel.includes(x))) ans(R, want.filter(x => q.sel.includes(x))); else auto1(R); } };
const auto1 = R => { const q = req(R); ans(R, q.kind === 'yn' ? true : q.kind === 'pick' ? q.sel.slice(0, q.max || 1).slice(0, Math.max(q.min, 1)) : q.kind === 'opt' ? 0 : q.kind === 'optm' ? [] : null); };
const top = (R, s, k, over) => { const id = give(R, s, k, 'deck'); const d = R.P[s].deck; d.splice(d.indexOf(id), 1); d.push(id); return id; };
const has = (R, s, z, id) => R.P[s][z].includes(id);
// ══ peek(공개) → 결과 레지스터 분기 ══
t('peek+if reg (id_0044): 공개한 카드가 Lv6 이하 캐릭터면 登場, 아니면 手札 (else 분기)', () => {
  const a = parsed('id_0044', 'onplay'); eq(a.ops[0].op, 'peek', 'peek'); eq(a.ops[1].c, 'reg', 'reg 분기'); ok(a.ops[1].else, 'else');
  for (const [k, def, zone] of [['lo', dummy('LO', { lv: '3' }), 'field'], ['hi', dummy('HI', { lv: '9' }), 'hand'], ['ev', dummy('EV', { type: 'event' }), 'hand']]) {
    const R = G({ c: real('id_0044'), [k]: def }, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); const x = top(R, s, k);
    eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); auto(R); ok(has(R, s, zone, x), `${k}: ${zone} 로`); eq(R.cards[c].st, 's', '스리프 상태로 登場'); } });
t('peek 색 조건 (id_0171): 공개한 4장에 【緑】【白】이 모두 있어야 스턴, 후 덱 아래로 셔플 (distinct filters)', () => {
  const run = cols => { const defs = { c: real('id_0171') }; cols.forEach((col, i) => defs['x' + i] = dummy('X' + i, { color: col })); defs.v = dummy('V');
    const R = G(defs, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); const v = field(R, s, 'v', 's'); const xs = cols.map((_, i) => top(R, s, 'x' + i)); const n0 = R.P[s].deck.length;
    eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); autoAll(R, [v]); return { R, v, xs, s, n0 }; };
  let r = run(['green', 'white', 'red', 'red']); eq(R_st(r), 'stun', '緑+白 → 스턴'); r = run(['green', 'green', 'red', 'red']); ok(R_st(r) !== 'stun', '白 없음 → 스턴 안 함');
  ok(r.xs.every(i => r.R.P[r.s].deck.includes(i)), '공개한 카드 덱에 복귀'); });
const R_st = r => r.R.cards[r.v].st === 'x' ? 'stun' : r.R.cards[r.v].st;
t('peek→pick→mv (id_0018): 위에서 6장 보고 조건 캐릭터 2장 登場, 나머지 셔플 후 덱 아래', () => {
  const R = G({ e: real('id_0018', { type: 'event', color: 'blue' }), a: dummy('A', { trait: '少年探偵団', lv: '3' }), b: dummy('B', { trait: '少年探偵団', lv: '4' }), z: dummy('Z', { trait: '少年探偵団', lv: '4' }), q: dummy('Q', { lv: '1' }), h: dummy('H') }, ['e']);
  const s = R.turn; const e = give(R, s, 'e', 'hand'); give(R, s, 'h', 'hand'); const ids = ['a', 'b', 'z', 'q'].map(k => top(R, s, k)); const f0 = R.P[s].field.length;
  eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트'); autoAll(R, ids.slice(0, 2)); ok(R.P[s].field.length - f0 === 2, '2장 登場: ' + (R.P[s].field.length - f0));
  ok(!has(R, s, 'field', ids[3]), '조건 밖 카드는 登場 안 함'); });
t('상대 덱 peek + 위/아래 선택 (id_0081): 상대 덱 맨 위 1장을 공개하고 내가 위/아래를 고른다', () => {
  const R = G({ c: real('id_0081') }, ['c']); const s = R.turn, o = 1 - s; const c = give(R, s, 'c', 'hand'); const n = R.P[o].deck.length; const t0 = R.P[o].deck[n - 1];
  eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); ok(req(R), '위/아래 질의'); const q = req(R); eq(q.who, s, '내가 고른다'); ans(R, q.kind === 'pick' ? [q.sel[0]] : q.opts ? q.opts[q.opts.length - 1] : false); auto(R);
  eq(R.P[o].deck.length, n, '상대 덱 장수 그대로'); ok(R.P[o].deck.includes(t0), '같은 카드가 상대 덱에'); });

// ══ ref 대상 체계 (登場させたキャラ) + 지속(gab) ══
t('ref played (id_0342): 手札/리무브 에리어에서 登場시킨 그 캐릭터에게만 AP+2000·突撃·「ターン終了時リムーブ」 부여', () => {
  const a = parsed('id_0342', 'onplay'); eq(a.ops[1].op, 'ref', 'ref op'); eq(a.ops[1].ref, 'played', 'played');
  const R = G({ c: real('id_0342', { lv: '0' }), pl: dummy('Pol', { trait: '警察', lv: '3', ap: '3000' }) }, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); const p = give(R, s, 'pl', 'rem');
  eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); auto(R, true, p); ok(has(R, s, 'field', p), '경찰 캐릭터 登場'); eq(S.ap(R, p), 5000, 'AP+2000'); ok(FX.hasKwTk(R, p, 'assault'), '突撃'); ok(!FX.hasKwTk(R, c, 'assault'), '본인은 아님');
  FX.bus; FX.endTurn ? FX.endTurn(R, s) : 0; });
t('分岐 "そうした場合" (id_0039): actend 에서 자신을 덱 아래로 → 그 결과(done)로 手札 登場, 그 캐릭터에게 突撃', () => {
  const a = parsed('id_0039', 'ontrig'); eq(a.ops[1].c, 'done', 'done 분기'); eq(a.ops[1].ops[0].op, 'play', 'play');
  const R = G({ c: real('id_0039', { ap: '5000' }), v: dummy('V'), w: dummy('W', { lv: '3', color: 'white' }) }, ['c'], ['v']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v', 's'); const w = give(R, s, 'w', 'hand');
  toContact(R, s, c, v); if (R.sub && R.sub.who === o) act(R, o, { a: 'pass' }); endContact(R); auto(R, true, w); ok(has(R, s, 'field', w) || R.P[s].field.some(i => key(R, i) === 'w'), '手札의 白 캐릭터 登場 (' + JSON.stringify(R.P[s].field.map(i => key(R, i))) + ')'); });

// ══ 【疾風】 (진입 순번 · 조건 무시) — id_1030 계열 ══
// 손패 사용은 턴에 1회이므로, "2번째 登場"은 【宣言】로 리무브 에리어에서 登場시키는 캐릭터(en)로 만든다.
const ENT = { ab: [{ ic: 'declare', ops: [{ op: 'play', from: 'rem', n: 1, filter: { trait: 'HAY' } }] }] };
const hayGame = (extra = {}) => G({ h: real('id_0936', { trait: 'HAY' }), x: dummy('X'), en: dummy('EN', ENT), ...extra }, ['h', 'x', 'en']);
const enter2 = (R, s, kase, i0) => { const x = give(R, s, 'x', 'hand'); eq(act(R, s, { a: 'play', id: x }), undefined, '1번째 登場'); auto(R); const en = field(R, s, 'en'); const h = give(R, s, 'h', 'rem'); return { en, h }; };
t('【疾風】 진입 순번 (id_0936): 이번 턴 1번째로 登場하면 발동(증거 +1), 2번째면 발동하지 않는다', () => {
  ok(parsed('id_0936', 'onplay').hay, 'hay 플래그'); eq(parsed('id_0936', 'onplay').cond.nth, 1, 'nth:1');
  let R = G({ h: real('id_0936') }, ['h']); let s = R.turn; let h = give(R, s, 'h', 'hand'); let e0 = R.P[s].evid.length; eq(act(R, s, { a: 'play', id: h }), undefined, '登場'); auto(R); eq(R.P[s].evid.length - e0, 1, '첫 登場 → 발동');
  R = hayGame(); s = R.turn; const { en, h: h2 } = enter2(R, s); e0 = R.P[s].evid.length; eq(act(R, s, { a: 'ability', id: en, i: 0 }), undefined, '선언'); auto(R, true, h2); ok(R.P[s].field.includes(h2), '2번째로 登場'); eq(R.P[s].evid.length - e0, 0, '2번째 登場 → 불발'); });
t('hayIgn (id_1030 【解決編】【宣言】…次に登場したキャラは【疾風】の条件を無視できる): 코스트=手札 경찰/【疾風】 캐릭터 1장, 다음 登場 캐릭터는 2번째여도 발동', () => {
  const dc = parsed('id_1030', 'declare'); eq(dc.ops[0].op, 'hayIgn', 'hayIgn'); eq(dc.cond.cstate, 'solve', '해결편 조건'); eq(dc.cost[0].filter.any.length, 2, '코스트: 특징 또는 疾風 (OR 필터)');
  const R = hayGame({ k: real('id_1030', { type: 'case', color: 'blue', lv: '2', lv2: '3' }), po: dummy('Po', { trait: '神奈川県警' }), po2: dummy('Po2', { trait: '神奈川県警' }) }); const s = R.turn;
  const { en, h } = enter2(R, s); const po = give(R, s, 'po', 'hand'), po2 = give(R, s, 'po2', 'hand'); const kase = R.P[s].kase; const i = FIX.id_1030.ab.findIndex(a => a.ic === 'declare');
  ok(act(R, s, { a: 'ability', id: kase, i }), '사건편에서는 선언 불가'); solve(R, s); autoAll(R, [po]);
  eq(act(R, s, { a: 'ability', id: kase, i }), undefined, '해결편 선언'); autoAll(R, [po2]); ok(R.P[s].rem.includes(po2), '코스트로 경찰 캐릭터 리무브'); eq(R.fl.hayIgn && R.fl.hayIgn[s], 1, '예약됨');
  const e0 = R.P[s].evid.length; eq(act(R, s, { a: 'ability', id: en, i: 0 }), undefined, '선언'); autoAll(R, [h]); ok(R.P[s].field.includes(h), '2번째로 登場'); eq(R.P[s].evid.length - e0, 1, '조건 무시 → 疾風 발동'); eq(R.fl.hayIgn[s], 0, '1회 소비'); });
t('cond hayAny (id_1012): 이번 턴 疾風이 발동했을 때만 덱 2장 리무브+드로우', () => {
  eq(JSON.stringify(parsed('id_1012', 'onplay').ops[0].cond), JSON.stringify({ hayAny: true }), 'hayAny 조건');
  const run = fire => { const R = G({ z: real('id_1012'), h: real('id_0936', { trait: 'HAY' }) }, ['z', 'h']); const s = R.turn; if (fire) { const h = give(R, s, 'h', 'hand'); eq(act(R, s, { a: 'play', id: h }), undefined, '疾風 登場'); auto(R); ok(R.fl.hayAny[s], 'hayAny 기록'); }
    const z = give(R, s, 'z', 'hand'); const hd = R.P[s].hand.length, dk = R.P[s].deck.length; R.fl.played = 0; R.turn === s && (R.fl.handUsed = null); const er = act(R, s, { a: 'play', id: z }); if (er) return er; auto(R); return [R.P[s].hand.length - (hd - 1), dk - R.P[s].deck.length].join(); };
  eq(run(false), '0,0', '疾風 미발동 → 아무 일 없음'); const r = run(true); ok(/1,3|사용은 턴에 1회/.test(r), r); });

// ══ 선택 캐릭터 참조(sel) / 존 이동 pick+mv / 손패 공개 코스트 / 레벨 레지스터 ══
const only = (id, ic) => ({ ...real(id), ab: FIX[id].ab.filter(a => a.ic === ic) });
t('setDeck pick → ref sel (id_0207): 고른 【白】캐릭터에게 덱 위 1장을 뒷면 세트하고, 그 캐릭터만 AP+2000', () => {
  const R = G({ c: only('id_0207', 'declare'), w: dummy('W', { color: 'white', ap: '1000' }), r: dummy('R', { color: 'red', ap: '1000' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'), w = field(R, s, 'w'), r = field(R, s, 'r'); const d0 = R.P[s].deck.length;
  eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, '선언'); ok(req(R).sel.includes(w) && !req(R).sel.includes(r), '후보는 【白】 캐릭터만'); ans(R, [w]); auto(R);
  eq((R.cards[w].fd || []).length, 1, '세트됨'); eq(R.P[s].deck.length, d0 - 1, '덱 -1'); eq(S.ap(R, w), 3000, 'AP+2000'); eq(S.ap(R, r), 1000, '다른 캐릭터엔 없음'); });
t('pick(존)+mv(목적지) (id_0790 「リムーブエリアにある特徴[ビッグジュエル]のカードを1枚まで選び、パートナーエリアに移す」)', () => {
  const ops = parsed('id_0790', 'declare').ops; eq(ops[0].op, 'pick', 'pick'); eq(ops[1].to, 'pa', 'mv pa');
  const R = G({ z: dummy('Z', { ab: [{ ic: 'declare', ops }] }), j: dummy('J', { trait: 'ビッグジュエル', type: 'event' }), x: dummy('X', { type: 'event' }) }, ['z']); const s = R.turn; const z = field(R, s, 'z'), j = give(R, s, 'j', 'rem'), x = give(R, s, 'x', 'rem');
  eq(act(R, s, { a: 'ability', id: z, i: 0 }), undefined, '선언'); ok(!req(R).sel.includes(x), '특징이 다른 카드는 후보 아님'); ans(R, [j]); ok(R.P[s].pa.includes(j) && !R.P[s].rem.includes(j), '파트너 에리어로 이동'); ok(R.P[s].rem.includes(x), '나머지는 그대로'); });
t('optcost 손패 공개 (id_0782 「手札からカード名[黒羽快斗]か[怪盗キッド]を1枚公開してもよい。そうした場合、突撃」): 해당 카드가 있어야 하고 공개하면 突撃', () => {
  const run = has => { const R = G({ c: only('id_0782', 'onplay'), kd: dummy('黒羽快斗'), o: dummy('Other') }, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); R.P[s].hand.filter(x => key(R, x) === 'kd').forEach(x => { R.P[s].hand.splice(R.P[s].hand.indexOf(x), 1); R.P[s].deck.unshift(x); }); give(R, s, has ? 'kd' : 'o', 'hand'); const h0 = R.P[s].hand.length; eq(act(R, s, { a: 'play', id: c }), undefined, '登場');
    if (R.eff) { eq(req(R).kind, 'yn', '공개할지 질의'); ans(R, true); if (R.eff && req(R).kind === 'pick') ans(R, req(R).sel.slice(0, 1)); } auto(R); return [FX.hasKwTk(R, c, 'assault'), R.P[s].hand.length - (h0 - 1), R.eff ? 1 : 0]; };
  let r = run(true); ok(r[0], '공개 → 突撃'); eq(r[1], 0, '공개한 카드는 손패에 남는다'); r = run(false); ok(!r[0], '해당 카드가 없으면 발동 안 함'); });
t('레벨 레지스터 필터 (id_0983 「リムーブしたカードのレベル以下のレベルのキャラ」): 코스트로 리무브한 카드의 레벨 이하만 대상', () => {
  const R = G({ c: only('id_0983', 'onplay'), su: dummy('Su', { trait: '鈴木財閥', lv: '3' }), a: dummy('A', { lv: '3' }), b: dummy('B', { lv: '4' }) }, ['c'], ['a', 'b']); const s = R.turn, o = 1 - s; const c = give(R, s, 'c', 'hand'); const su = give(R, s, 'su', 'hand'); const a = field(R, o, 'a'), b = field(R, o, 'b');
  eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); ans(R, [su]); const q = R.eff && req(R); ok(q && q.kind === 'pick', '대상 선택'); ok(q.sel.includes(a) && !q.sel.includes(b), 'Lv3 이하만: ' + q.sel); ans(R, [a]); ok(R.P[o].rem.includes(a), '리무브됨'); });
t('손패 레벨 감소 hand lvd+per (id_0740): 해결편·자신 턴에 「阿笠博士か少年探偵団のキャラ1枚につき Lv-1」', () => {
  const R = G({ c: { ...only('id_0740', 'hand'), lv: '8' }, a: dummy('A', { trait: '少年探偵団' }), b: dummy('B', { trait: '少年探偵団' }), z: dummy('Z') }, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); eq(FX.lvOf(R, c), 8, '사건편'); solve(R, s); eq(FX.lvOf(R, c), 8, '조건 캐릭터 없음'); field(R, s, 'a'); field(R, s, 'b'); field(R, s, 'z'); eq(FX.lvOf(R, c), 6, '2장 → Lv-2'); R.turn = 1 - s; eq(FX.lvOf(R, c), 8, '상대 턴에는 없음'); });
t('보호 static (id_1058 nrm-ev / id_0346 evsafe): 상대 이벤트로는 리무브·선택되지 않고, 능력(비이벤트)으로는 리무브된다', () => {
  const rmEv = { ic: 'event', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }] }, rmAb = { ic: 'declare', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }] };
  const run = (key, abx) => { const R = G({ t: only(key, 'static'), e: dummy('E', { type: 'event', ab: [rmEv] }), g: dummy('G', { ab: [rmAb] }) }, ['e', 'g'], ['t']); const s = R.turn, o = 1 - s; const t0 = field(R, o, 't', key === 'id_0346' ? 's' : 'a'); R.cards[t0].d = R.cards[t0].d;
    if (abx) { const g = field(R, s, 'g'); eq(act(R, s, { a: 'ability', id: g, i: 0 }), undefined, '능력'); auto1x(R); } else { const e = give(R, s, 'e', 'hand'); eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트'); auto1x(R); } return R.P[o].field.includes(t0); };
  const auto1x = R => { let g = 0; while (R.eff && g++ < 5) auto1(R); };
  ok(run('id_1058', false), 'nrm-ev: 이벤트로는 리무브 안 됨'); ok(!run('id_1058', true), 'nrm-ev: 능력으로는 리무브됨'); ok(run('id_0346', false), 'evsafe(스리프 경찰): 이벤트의 대상이 될 수 없다'); });
t('선언 조건 selfSt (id_0700 「この能力はこのキャラがスリープ状態かスタン状態の場合に宣言できる」): 액티브일 때는 선언 불가', () => {
  const R = G({ c: only('id_0700', 'declare'), v: dummy('V', { lv: '3' }) }, ['c'], ['v']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', 'a'); field(R, o, 'v'); ok(act(R, s, { a: 'ability', id: c, i: 0 }), '액티브 → 선언 불가'); R.cards[c].st = 's'; eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, '스리프 → 선언 가능'); });
t('cnt 조건 rem (id_0633 「自分のリムーブエリアに特徴[少年探偵団]のキャラがある場合、突撃」)', () => {
  const run = has => { const R = G({ c: only('id_0633', 'onplay'), a: dummy('A', { trait: '少年探偵団' }) }, ['c']); const s = R.turn; const c = give(R, s, 'c', 'hand'); if (has) give(R, s, 'a', 'rem'); eq(act(R, s, { a: 'play', id: c }), undefined, '登場'); auto(R); return FX.hasKwTk(R, c, 'assault'); };
  ok(run(true), '있으면 突撃'); ok(!run(false), '없으면 없음'); });

t('delay (id_0050 「このターン中、次に相手の証拠がリムーブされたとき、…」): 1회 예약 — 내 증거 리무브에는 반응하지 않고, 상대 증거 리무브에 1번만 발동', () => {
  const dl = parsed('id_0050', 'event').ops[1]; eq(dl.op, 'delay', 'delay op'); eq(dl.evs.join(), 'evrem', '이벤트'); eq(dl.who, 'opp', '상대 측');
  const R = G({ c: dummy('C', { ab: [{ ic: 'declare', ops: parsed('id_0050', 'event').ops }] }), w: dummy('W', { color: 'white' }), v: dummy('V'), v2: dummy('V2') }, ['c', 'w'], ['v', 'v2']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), w = field(R, s, 'w'), v = field(R, o, 'v', 's'), v2 = field(R, o, 'v2', 's');
  eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, '선언'); autoAll(R, [w]); ok(R.fl.tmp && R.fl.tmp.length === 1, '예약 등록');
  FX.bus(R, 'evrem', { s, by: 'x' }); FX.pump(R); ok(!R.eff && R.cards[v].st === 's', '내 증거 리무브 → 반응 없음'); ok(R.fl.tmp.length === 1, '예약 유지');
  FX.bus(R, 'evrem', { s: o, by: 'x' }); FX.pump(R); autoAll(R, [v]); eq(R.cards[v].st, 'x', '상대 증거 리무브 → 스턴'); eq(R.fl.tmp.length, 0, '1회 소비');
  FX.bus(R, 'evrem', { s: o, by: 'x' }); FX.pump(R); autoAll(R, [v2]); eq(R.cards[v2].st, 's', '두 번째는 발동하지 않음'); });

// ══ 버스 이벤트 (sleepEv / setOn / fdOff / fileHand) + oppEnd 지속 ══
const slp = (st) => ({ ic: 'declare', ops: [{ op: 'select', n: 1, filter: { own: 'self', trait: '少年探偵団' }, do: 'sleep' }] });
t('sleepEv (id_0266 「アクティブ状態の特徴[少年探偵団]のキャラがスリープ状態になったとき」): 액티브→스리프만 발동, 이미 스리프인 캐릭터를 다시 슬립시켜도 발동 안 함', () => {
  const run = pre => { const R = G({ c: only('id_0266', 'ontrig'), x: dummy('X', { trait: '少年探偵団' }), z: dummy('Z', { ab: [slp()] }) }, ['c']); const s = R.turn; field(R, s, 'c'); const x = field(R, s, 'x', pre ? 's' : 'a'); const z = field(R, s, 'z'); const d0 = R.P[s].deck.length;
    eq(act(R, s, { a: 'ability', id: z, i: 0 }), undefined, '선언'); autoAll(R, [x]); FX.pump(R); autoAll(R, []); return { R, x, dd: d0 - R.P[s].deck.length }; };
  const a = run(false); eq(a.R.cards[a.x].st, 's', '슬립됨'); eq(a.dd, 1, '액티브→스리프: 트리거 발동(1장 드로우)'); const b = run(true); eq(b.dd, 0, '이미 스리프: 트리거 없음'); });
t('setOn (id_0188 「このキャラにカード1枚がセットされるたび、アクティブにするか突撃」): 자신의 세트 후 선택 발동 (hself)', () => {
  const R = G({ c: real('id_0188', { lv: '0' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c', 's'); const st = FIX.id_0188.ab.findIndex(a => a.ic === 'declare'); const ab = FIX.id_0188.ab; R.defs[R.cards[c].d].ab = ab; const d0 = R.P[s].deck.length;
  eq(act(R, s, { a: 'ability', id: c, i: ab.findIndex(a => a.ic === 'declare') }), undefined, '선언'); let g = 0; while (R.eff && g++ < 8) { const q = req(R); if (q.kind === 'opt') ans(R, 0); else auto1(R); }
  eq((R.cards[c].fd || []).length, 1, '세트'); eq(R.cards[c].st, 'a', '「アクティブにする」 선택 → 액티브'); });
t('fdOff (id_0763 「裏向きでセットされているカードが現場から離れるたび、カードを1枚引く」)+ 사건 특징 조건', () => {
  const R = G({ k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3', trait: '赤魔術' }, c: only('id_0763', 'ontrig'), x: dummy('X', { ab: [{ ic: 'declare', ops: [{ op: 'unset', n: 1, scope: 'mine', fd: true }] }] }) }, ['c']); const s = R.turn; field(R, s, 'c'); const x = field(R, s, 'x'); const u = filler(R, s, 1)[0]; R.cards[x].fd = [u]; R.cards[u].fdOn = x;
  const h0 = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: x, i: 0 }), undefined, '선언'); autoAll(R, [u]); FX.pump(R); autoAll(R, [u]); eq(R.cards[x].fd.length, 0, '세트 카드 이탈'); eq(R.P[s].hand.length - h0, 1, '1장 드로우'); });
t('fileHand (id_0552 「自分のFILEエリアのカードを手札に加えたとき…」): FILE→손패 이벤트에 반응해 리무브 에리어의 探偵 캐릭터를 손패로', () => {
  const R = G({ c: only('id_0552', 'ontrig'), d: dummy('Det', { trait: '探偵' }), x: dummy('X', { ab: [{ ic: 'declare', ops: [{ op: 'fileToHand', n: 1 }] }] }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'), x = field(R, s, 'x'); const d = give(R, s, 'd', 'rem'); fillFile(R, s, 3);
  eq(act(R, s, { a: 'ability', id: x, i: 0 }), undefined, '선언'); autoAll(R, [d]); FX.pump(R); autoAll(R, [d]); ok(R.P[s].hand.includes(d), '探偵 캐릭터가 손패로'); ok(R.P[s].rem.includes(c) || !R.P[s].field.includes(c), '카드를 손패에 넣은 경우 이 캐릭터는 리무브'); });
t('oppEnd 지속 (id_0996 「相手のターン終了時まで「スリープ状態でもガードできる」を与える」): 내 턴이 끝나도 유지, 상대 턴 종료 시 해제', () => {
  const R = G({ c: { ...only('id_0996', 'declare'), trait: '赤井家' } }, ['c']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', 'a'); const i = FIX.id_0996.ab.filter(a => a.ic === 'declare').findIndex(a => a.ops[0].until === 'oppEnd');
  R.defs[R.cards[c].d].ab = FIX.id_0996.ab.filter(a => a.ic === 'declare'); eq(act(R, s, { a: 'ability', id: c, i }), undefined, '선언'); autoAll(R, [c]); ok(FX.hasKwTk(R, c, 'sleepguard'), '부여됨');
  eq(act(R, s, { a: 'end' }), undefined, '내 턴 종료'); autoAll(R, []); eq(R.turn, o, '상대 턴'); ok(FX.hasKwTk(R, c, 'sleepguard'), '상대 턴 동안 유지'); eq(act(R, o, { a: 'end' }), undefined, '상대 턴 종료'); autoAll(R, []); ok(!FX.hasKwTk(R, c, 'sleepguard'), '상대 턴 종료 시 해제'); });

// ══ 강제 규칙: 必ず指定する / 必ずガードする / 必ず選ぶ ══
t('mustdesig (id_0937 「相手のターン終了時まで「…このキャラを指定できる場合、必ず指定する」を持つ」): 부여 후 상대의 액션은 그 캐릭터를 반드시 지정해야 한다 (사건 지정도 불가)', () => {
  ok(FIX.id_0937.ab.some(a => JSON.stringify(a).includes('mustdesig') && JSON.stringify(a).includes('oppEnd')), '파싱');
  const R = G({ h: { ...only('id_0937', 'declare'), lv: '0' }, a: dummy('A', { ap: '5000' }), n: dummy('N') }, ['a'], ['h', 'n']); const s = R.turn, o = 1 - s; R.turn = o; const h = field(R, o, 'h', 'a'), n = field(R, o, 'n', 's'); R.turn = o;
  eq(act(R, o, { a: 'ability', id: h, i: 0 }), undefined, '선언 (코스트: 자신 슬립)'); autoAll(R, [h]); ok(FX.hasKwTk(R, h, 'mustdesig'), '부여됨'); eq(act(R, o, { a: 'end' }), undefined, '턴 종료'); autoAll(R, []); eq(R.turn, s, '내 턴');
  const a = field(R, s, 'a'); ready(R, a); ok(/必ず指定/.test(act(R, s, { a: 'action', id: a, k: 'char', tid: n }) || ''), '다른 캐릭터 지정 불가'); ok(/必ず指定/.test(act(R, s, { a: 'action', id: a, k: 'case' }) || ''), '사건 지정도 불가');
  ok(S.view(R, s).acts[a].every(x => x.k !== 'actk'), 'UI 버튼도 사건 액션 없음'); eq(JSON.stringify(S.view(R, s).acts[a].find(x => x.k === 'actc').tg), JSON.stringify([h]), 'UI 대상은 강제 캐릭터만'); eq(act(R, s, { a: 'action', id: a, k: 'char', tid: h }), undefined, '강제 캐릭터 지정 OK'); });
t('mustguard (id_0511 「相手の現場にいるキャラを1枚まで選び、ターン終了時まで「ガードできる場合、必ずガードする」を与える」): 그 캐릭터가 가드할 수 있으면 반드시 그 캐릭터로 가드', () => {
  const R = G({ c: only('id_0511', 'declare'), a: dummy('A', { ap: '5000' }), g: dummy('G'), x: dummy('X'), t: dummy('T') }, ['c', 'a'], ['g', 'x', 't']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), a = field(R, s, 'a'); const g = field(R, o, 'g', 'a'), x = field(R, o, 'x', 'a'), tt = field(R, o, 't', 's');
  const ci = FIX.id_0511.ab.filter(q => q.ic === 'declare'); R.defs[R.cards[c].d].ab = ci; eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, '선언'); autoAll(R, [g]); ok(FX.hasKwTk(R, g, 'mustguard'), '부여됨');
  ready(R, a); eq(act(R, s, { a: 'action', id: a, k: 'char', tid: tt }), undefined, '액션'); ok(R.sub && R.sub.type === 'guard', '가드 단계');
  ok(/必ずガード/.test(act(R, o, { a: 'guard', id: null }) || ''), '가드 안 함 불가'); ok(/必ずガード/.test(act(R, o, { a: 'guard', id: x }) || ''), '다른 캐릭터로 가드 불가'); eq(act(R, o, { a: 'guard', id: g }), undefined, '강제 캐릭터로 가드'); });
t('mustsel (id_0612 「相手はイベントの効果によってこのキャラを選べる場合、必ず選ぶ」): 상대 이벤트가 1장 고르는 경우 후보가 그 캐릭터로 고정되고 최소 1장', () => {
  const R = G({ e: dummy('E', { type: 'event', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'sleep' }] }] }), m: only('id_0612', 'static'), n: dummy('N') }, ['e'], ['m', 'n']); const s = R.turn, o = 1 - s; const m = field(R, o, 'm'), n = field(R, o, 'n'); const e = give(R, s, 'e', 'hand');
  eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트'); const q = req(R); eq(q.sel.join(), String(m), '후보는 mustsel 캐릭터뿐'); eq(q.min, 1, '반드시 선택'); ans(R, [m]); auto(R); eq(R.cards[m].st, 's', 'mustsel 캐릭터가 슬립'); eq(R.cards[n].st || 'a', 'a', '다른 캐릭터는 영향 없음'); });

// ══ 코스트 레지스터 분기 (cost / costRev) ══
t('cost 레지스터 (id_1161 「この【宣言】能力のコストによって特徴[FBI]のキャラが2枚以上リムーブされた場合」): 코스트로 덱에서 리무브한 카드 중 FBI 캐릭터 수로 분기', () => {
  const run = nFbi => { const R = G({ p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, c: only('id_1161', 'declare'), fb1: dummy('F1', { trait: 'FBI' }), fb2: dummy('F2', { trait: 'FBI' }), o: dummy('O'), v0: dummy('O2'), v: dummy('V', { lv: '6' }) }, ['c'], ['v']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v');
    const ks = nFbi === 2 ? ['fb1', 'fb2', 'o'] : ['fb1', 'o', 'v0']; ks.forEach(k => top(R, s, k)); eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, '선언'); let g = 0, sawSel = 0; while (R.eff && g++ < 8) { const q = req(R); if (q.kind === 'pick' && q.sel.includes(v)) { sawSel++; ans(R, [v]); } else auto1(R); } return { R, v, o, sawSel }; };
  let r = run(2); ok(r.R.P[r.o].rem.includes(r.v), 'FBI 2장 → 조건 충족: Lv7 이하 리무브'); r = run(1); ok(!r.R.P[r.o].rem.includes(r.v), 'FBI 1장 → 조건 불충족'); });
t('costRev 레지스터 (id_0950 「コストによってカード名[江戸川コナン]か[工藤新一]を公開していた場合」): 코스트로 공개한 카드 이름으로 분기', () => {
  const run = nm => { const R = G({ c: { ...only('id_0950', 'declare'), color: 'blue' }, d: dummy(nm, { trait: '探偵' }), v: dummy('V', { lv: '3' }) }, ['c'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'blue'; const c = field(R, s, 'c'); const d = give(R, s, 'd', 'hand'); const v = field(R, o, 'v'); fillFile(R, o, 3);
    const kase = R.defs[R.cards[R.P[s].kase].d]; kase.color = 'blue,green'; const f0 = R.P[o].file.filter(x => R.cards[x].up).length; const e = act(R, s, { a: 'ability', id: c, i: 0 }); if (e) return e; let g = 0; while (R.eff && g++ < 8) { const q = req(R); if (q.kind === 'pick' && q.sel.includes(v)) ans(R, [v]); else auto1(R); } return R.P[o].file.filter(x => R.cards[x].up).length - f0; };
  const a = run('江戸川コナン'); const b = run('他の探偵'); eq(a, 1, '이름 일치 → 상대 FILE 1장 표향'); eq(b, 0, '이름 불일치 → 없음'); });

// ══ 「以下から1つ選んで行う。〜場合、代わりにNつとも行う」 (조건/선택 코스트 → 전부, 아니면 1개) ══
t('modal 업그레이드 (id_0529 「自分の現場にカード名[毛利小五郎]がいる場合、代わりに2つとも行う」): 조건 충족 시 2개 모두, 아니면 1개 선택', () => {
  const run = has => { const R = G({ e: real('id_0529', { type: 'event', color: 'blue' }), m: dummy('毛利小五郎', { trait: '毛利探偵事務所' }), v: dummy('V') }, ['e'], ['v']); const s = R.turn, o = 1 - s; const e = give(R, s, 'e', 'hand'); const m = field(R, s, 'm'); if (!has) R.P[s].field = R.P[s].field.filter(x => x !== m), R.P[s].rem.push(m); const v = field(R, o, 'v'); const d0 = R.P[s].deck.length;
    eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트'); let g = 0, opts = 0, picks = []; while (R.eff && g++ < 8) { const q = req(R); if (q.kind === 'opt') { opts++; ans(R, 1); } else if (q.kind === 'pick') { picks.push(q.sel.length); ans(R, q.sel.includes(v) ? [v] : q.sel.slice(0, 1)); } else auto1(R); } return { opts, dd: d0 - R.P[s].deck.length, slept: R.cards[v].st === 's', picks }; };
  let r = run(true); eq(r.opts, 0, '선택 없이'); eq(r.dd, 1, '드로우 1'); ok(r.slept, '슬립도 실행 (두 효과 모두)'); r = run(false); eq(r.opts, 1, '1개 선택 질의'); ok(r.dd === 1 && r.slept, '선택한 2번째 효과 (슬립+드로우)'); });
t('modal 업그레이드 (id_1009 「手札からカード名[アンドレ・キャメル]を1枚リムーブしてもよい。そうした場合、代わりに3つとも行う」)', () => {
  const run = pay => { const R = G({ e: real('id_1009', { type: 'event', color: 'blue' }), a: dummy('アンドレ・キャメル') }, ['e']); const s = R.turn; const e = give(R, s, 'e', 'hand'); const a = give(R, s, 'a', 'hand'); let opts = 0, picks = 0, g = 0;
    eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트'); while (R.eff && g++ < 12) { const q = req(R); if (q.kind === 'pick' && q.msg.includes('손패')) ans(R, pay ? [a] : []); else if (q.kind === 'opt') { opts++; ans(R, 0); } else if (q.kind === 'pick') { picks++; ans(R, q.sel.slice(0, 1)); } else if (q.kind === 'yn') ans(R, pay); else auto1(R); } return { opts, picks, out: R.P[s].rem.includes(a) }; };
  let r = run(true); ok(r.out, '코스트로 리무브'); eq(r.opts, 0, '3개 모두 → 선택 질의 없음'); r = run(false); eq(r.opts, 1, '코스트 미지불 → 1개 선택'); });

// ══ 「NP1枚につき」 공통 배율 (self pc / ncnt) ══
t('self pc (id_0825 「【カットイン】を持つ【黒】のカード1枚につき、ターン終了時までこのキャラをAP+1000」): 리무브 에리어의 해당 카드 수만큼', () => {
  const cut = { ab: [{ ic: 'cutin', v: 1000 }], color: 'black' };
  const R = G({ h: only('id_0825', 'declare'), a: dummy('A', cut), b: dummy('B', cut), x: dummy('X') }, ['h']); const s = R.turn; const h = field(R, s, 'h'); solve(R, s); const a = give(R, s, 'a', 'hand'); const b = give(R, s, 'b', 'rem'); const x = give(R, s, 'x', 'rem'); const ap0 = S.ap(R, h);
  eq(act(R, s, { a: 'ability', id: h, i: 0 }), undefined, '선언'); autoAll(R, [a]); eq(S.ap(R, h) - ap0, 2000, '코스트로 리무브한 a + 기존 b = 2장 → +2000 (x 는 제외)'); });
t('self pc + until contact (id_0107 「相手の現場にいるスリープ状態かスタン状態のキャラ1枚につき、アクション終了時までAP+1000」): 컨택트 동안만', () => {
  const R = G({ a: only('id_0107', 'onact'), d: dummy('D'), d2: dummy('D2'), d3: dummy('D3') }, ['a'], ['d', 'd2', 'd3']); const s = R.turn, o = 1 - s; const a = field(R, s, 'a'); const d = field(R, o, 'd', 's'); field(R, o, 'd2', 'x'); field(R, o, 'd3', 'a'); const ap0 = S.ap(R, a);
  toContact(R, s, a, d); eq(S.ap(R, a) - ap0, 2000, '슬립+스턴 2장 → +2000'); endContact(R); eq(S.ap(R, a), ap0, '액션 종료 후 원래대로'); });
t('draw ncnt (「相手の現場にいるスタン状態のキャラ1枚につきカードを1枚引く」 파서 산출): 스턴 캐릭터 수만큼 드로우', () => {
  const ops = [{ op: 'draw', n: 1, ncnt: { src: 'field', f: { st: 'x', own: 'opp' } } }];
  const R = G({ z: dummy('Z', { ab: [{ ic: 'declare', ops }] }), d: dummy('D'), e: dummy('E') }, ['z'], ['d', 'e']); const s = R.turn, o = 1 - s; const z = field(R, s, 'z'); field(R, o, 'd', 'x'); field(R, o, 'e', 'x'); const h0 = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: z, i: 0 }), undefined, '선언'); auto(R); eq(R.P[s].hand.length - h0, 2, '스턴 2장 → 2장 드로우'); });

// ══ 제한/지연 (turnPk) ══
t('turnPk (id_0734 【カットイン】と【変装】を使用できない / id_0978 イベントを使用できない): 실제 사용 시도가 거부된다', () => {
  eq(parsed('id_0734', 'declare').ops.map(o => o.key).join(), 'nocutin,nodisguise', '파싱'); eq(parsed('id_0978', 'event').ops.slice(-1)[0].key, 'noevent', 'noevent');
  const R = G({ c: dummy('C') }, ['c']); const s = R.turn, o = 1 - s; FX.pk(R, s, 'nocutin') && ok(false, '초기엔 없음');
  R.fl.pk = [{}, {}]; R.fl.pk[s].nocutin = 1; ok(FX.pk(R, s, 'nocutin'), 'pk 플래그'); R.fl.pk[s].noevent = 1; ok(FX.pk(R, s, 'noevent'), 'noevent');
  const R2 = G({ e: dummy('E', { type: 'event', ab: [{ ic: 'event', ops: [{ op: 'draw', n: 1 }] }] }), t: dummy('T', { ab: [{ ic: 'declare', ops: [{ op: 'turnPk', key: 'noevent', until: 'turn' }] }] }) }, ['e', 't']); const s2 = R2.turn;
  const tt = field(R2, s2, 't'); const e = give(R2, s2, 'e', 'hand'); eq(act(R2, s2, { a: 'ability', id: tt, i: 0 }), undefined, '선언'); auto(R2); const er = act(R2, s2, { a: 'play', id: e }); ok(er && /이벤트/.test(er), '이번 턴 이벤트 사용 불가: ' + er); });

t('select + acts (「キャラ1枚まで選び、AP+2000し、突撃を与える」 파서 산출): 고른 1장에 AP 와 突撃 을 함께 부여', () => {
  const ops = [{ op: 'select', n: 1, filter: { own: 'self' }, acts: [{ do: 'ap', v: '2000' }, { do: 'kw', v: 'assault' }], do: 'ap' }];
  const R = G({ z: dummy('Z', { ab: [{ ic: 'declare', ops }] }), d: dummy('D') }, ['z', 'd']); const s = R.turn; const z = field(R, s, 'z'); const d = field(R, s, 'd'); const ap0 = S.ap(R, d);
  eq(act(R, s, { a: 'ability', id: z, i: 0 }), undefined, '선언'); autoAll(R, [d]); eq(S.ap(R, d) - ap0, 2000, 'AP+2000'); ok(FX.hasKwTk(R, d, 'assault'), '突撃'); });

let bad = 0; for (const [n, f] of T) { try { f(); console.log('✓', n); } catch (e) { bad++; console.log('✗', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }
console.log(bad ? `\n${bad}개 실패` : `\nTurn12 공통 primitive 테스트 ${T.length}개 전부 통과`); if (bad) process.exit(1);
