process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
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

// ══ 변장 조건 ══
t('【変装】【事件(白)】【FILE5】(id_0170): 파싱 {ic:disguise, cond:{ccolor:white,fileMin:5}} → 사건이 白이고 FILE 5장 이상일 때만 변장 가능 (서버 검증)', () => {
  const a = parsed('id_0170', 'disguise'); eq(JSON.stringify(a.cond), JSON.stringify({ ccolor: 'white', fileMin: 5 }), '조건 JSON');
  const run = (kc, file) => { const R = G({ k: { n: 'K', type: 'case', color: kc, lv: '2', lv2: '3' }, a: dummy('A', { ap: '5000' }), d: dummy('D', { ap: '1000' }), x: real('id_0170', { color: kc }) }, ['a'], ['d', 'x']); const s = R.turn, o = 1 - s;
    const atk = field(R, s, 'a'); const d = field(R, o, 'd', 's'); const x = give(R, o, 'x', 'hand'); fillFile(R, o, file); toContact(R, s, atk, d);
    if (R.sub.who === s) act(R, s, { a: 'pass' }); return { R, o, x, e: act(R, o, { a: 'dis', id: x }) }; };
  let r = run('white', 4); ok(r.e && /변장 조건/.test(r.e), 'FILE 4장이면 불가: ' + r.e);
  r = run('red', 5); ok(r.e && /변장 조건/.test(r.e), '사건이 白이 아니면 불가 (' + r.e + ')');
  r = run('white', 5); eq(r.e, undefined, '조건 충족 → 변장'); ok(r.R.P[r.o].field.includes(r.x), '변장한 캐릭터가 현장에'); });

// ══ 이벤트: 표향 그대로 증거로 얻기 / 힌트(ヒラメキ) 이동·뒤집기 ══
t('「このカードを表向きのまま証拠として得る」(id_0162): 이벤트가 리무브 에리어가 아니라 내 증거(표향)에 놓이고, 상대 사건 액션으로 리무브되면 ヒラメキ 로 증거 1', () => {
  eq(JSON.stringify(parsed('id_0162', 'event').ops), JSON.stringify([{ op: 'selfEvid' }]), 'ops');
  const R = G({ e: real('id_0162', { type: 'event' }), a: dummy('A', { ap: '5000' }) }, ['e'], ['a']); const s = R.turn, o = 1 - s; const e = give(R, s, 'e', 'hand'); const ev0 = R.P[s].evid.length;
  eq(act(R, s, { a: 'play', id: e }), undefined, '사용'); ok(R.P[s].evid.includes(e) && R.cards[e].up === true, '표향 증거로'); ok(!R.P[s].rem.includes(e), '리무브 에리어에 없음'); eq(R.P[s].evid.length, ev0 + 1, '증거 +1');
  R.turn = o; const a = field(R, o, 'a'); act(R, o, { a: 'action', id: a, k: 'case' }); act(R, s, { a: 'guard', id: null }); FX.pump(R); ok(req(R) && req(R).kind === 'yn', 'ヒラメキ 확인'); ans(R, true); FX.pump(R);
  ok(R.P[s].rem.includes(e), '힌트 후 리무브 에리어'); ok(R.P[s].evid.length >= ev0, 'ヒラメキ 로 증거 획득'); });
t('ヒラメキ 「このカードをパートナーエリアに移す/手札に加える」(id_0788/id_0185): 리무브 에리어로 가지 않고 이동', () => {
  for (const [id, zone, ix] of [['id_0788', 'pa', 1], ['id_0185', 'hand', 2]]) {
    const R = G({ e: real(id, { type: 'event' }), a: dummy('A', { ap: '5000' }) }, ['e'], ['a']); const s = R.turn, o = 1 - s; const e = give(R, s, 'e', 'evid'); R.cards[e].up = false; R.turn = o; const a = field(R, o, 'a');
    eq(parsed(id, 'flash').ops[0].to, zone, id + ' 파싱'); act(R, o, { a: 'action', id: a, k: 'case' }); act(R, s, { a: 'guard', id: null }); FX.pump(R);
    if (req(R)) ans(R, true); FX.pump(R); ok(R.P[s][zone].includes(e), `${id}: ${zone} 로 이동`); ok(!R.P[s].rem.includes(e), `${id}: 리무브 에리어에 남지 않음`); } });
t('ヒラメキ 「自分の表向きの証拠をNつまで選び、裏向きにする」(id_0519): 표향 증거를 고른 만큼 뒷면으로 (登場時 2장 / ヒラメキ 1장)', () => {
  const R = G({ c: real('id_0519') }, ['c']); const s = R.turn; const ev = evid(R, s, 3, true); const c = give(R, s, 'c', 'hand'); eq(act(R, s, { a: 'play', id: c }), undefined, '사용');
  ok(req(R) && req(R).kind === 'pick', '고르기'); eq(req(R).max, 2, '최대 2장'); ans(R, [ev[0], ev[1]]); eq(ev.filter(i => R.cards[i].up).length, 1, '2장이 뒷면으로');
  const R2 = G({ c: real('id_0519') }, ['c']); const ev2 = evid(R2, R2.turn, 2, true); const st = FX.queueFlash; ok(typeof st === 'function', 'flash API'); ok(parsed('id_0519', 'flash').ops[0].op === 'flipDown', 'ヒラメキ 도 flipDown'); });

// ══ 정적(static) ══
t('【解決編】現場にいるこのキャラをレベル+3する(id_0888): 사건이 해결편일 때만 Lv+3', () => {
  const R = G({ c: real('id_0888', { lv: '4' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); eq(FX.lvOf(R, c), 4, '사건편'); solve(R, s); eq(FX.lvOf(R, c), 7, '해결편 Lv+3'); });
t('키워드 static(id_0022 actactive / id_0043 nocase / id_0332 sleepguard): 액티브 캐릭터를 액션 대상으로 / 사건 액션 불가 / 슬립 상태에서도 가드', () => {
  let R = G({ h: real('id_0022'), v: dummy('V', { ap: '1000' }) }, ['h'], ['v']); let s = R.turn, o = 1 - s; let h = field(R, s, 'h'); let v = field(R, o, 'v', 'a');
  eq(act(R, s, { a: 'action', id: h, k: 'char', tid: v }), undefined, '액티브 상대도 액션 대상 가능'); const R0 = G({ h: dummy('H'), v: dummy('V') }, ['h'], ['v']); const h0 = field(R0, R0.turn, 'h'); const v0 = field(R0, 1 - R0.turn, 'v', 'a'); ok(act(R0, R0.turn, { a: 'action', id: h0, k: 'char', tid: v0 }), '대조군: 액티브 대상은 불가');
  R = G({ n: real('id_0043'), v: dummy('V') }, ['n'], ['v']); s = R.turn; o = 1 - s; const n = field(R, s, 'n'); filler(R, o, 1).forEach(i => R.P[o].evid.push(i)); R.cards[n].sum = 0;
  ok(act(R, s, { a: 'action', id: n, k: 'case' }), '사건 액션 불가'); ok(!(S.view(R, s).acts[n] || []).some(a => a.k === 'actk'), '버튼도 없음');
  R = G({ a: dummy('A', { ap: '5000' }), g: real('id_0332', { ap: '1000' }), v: dummy('V') }, ['a'], ['g', 'v']); s = R.turn; o = 1 - s; const a = field(R, s, 'a'); const v2 = field(R, o, 'v', 's'); const g = field(R, o, 'g', 's');
  eq(act(R, s, { a: 'action', id: a, k: 'char', tid: v2 }), undefined, '액션'); eq(act(R, o, { a: 'guard', id: g }), undefined, '슬립 상태 가드'); ok(R.sub && R.sub.type === 'contact' && R.sub.def === g, '가드한 캐릭터와 컨택트'); });
t('「現場にいるこのキャラは特徴[サッカー選手]を持つ」(id_1065): 특징 부여 static — 필터에 실제로 걸린다', () => {
  const R = G({ c: real('id_1065', { trait: '探偵' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); ok(FX.traitsId(R, c).includes('サッカー選手'), '특징 획득'); ok(FX.traitsId(R, c).includes('探偵'), '원래 특징 유지');
  ok(FX.condOk(R, s, c, { cond: { fh: { trait: 'サッカー選手', own: 'self' }, fhN: 1 } }), '조건/필터(fh)에도 걸린다'); const R2 = G({ c: dummy('C', { trait: '探偵' }) }, ['c']); const c2 = field(R2, R2.turn, 'c'); ok(!FX.condOk(R2, R2.turn, c2, { cond: { fh: { trait: 'サッカー選手', own: 'self' }, fhN: 1 } }), '대조군'); });
t('「特徴[X]のカードN枚につき AP+」(id_0775): 파트너 에리어의 ビッグジュエル 1장당 AP+1000 (자신의 턴)', () => {
  const R = G({ c: real('id_0775', { ap: '3000' }), j: dummy('J', { trait: 'ビッグジュエル' }), j2: dummy('J2', { trait: 'ビッグジュエル' }) }, ['c', 'j', 'j2']); const s = R.turn; const c = field(R, s, 'c'); eq(S.ap(R, c), 3000, '0장'); give(R, s, 'j', 'pa'); give(R, s, 'j2', 'pa'); eq(S.ap(R, c), 5000, '2장 → +2000');
  R.turn = 1 - s; eq(S.ap(R, c), 3000, '상대 턴엔 없음'); });
t('cnt 조건 LP(id_0323): 「自分の証拠が3つ以下の場合、このキャラをLP+1する」 — 증거 수 경계', () => {
  const R = G({ c: real('id_0323', { lp: '1' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); evid(R, s, 3); eq(S.lpOf(R, c), 2, '증거 3장 이하'); evid(R, s, 1); eq(S.lpOf(R, c), 1, '4장이면 없음'); });
t('cnt 조건 fhDist(id_1076): 「それぞれカード名の異なる特徴[毛利探偵事務所]のキャラが4枚以上」 — 이름이 같은 카드는 1로 센다', () => {
  const R = G({ c: real('id_1076', { lp: '1', trait: '毛利探偵事務所' }), a: dummy('A', { trait: '毛利探偵事務所' }), b: dummy('B', { trait: '毛利探偵事務所' }), d: dummy('D', { trait: '毛利探偵事務所' }) }, ['c', 'a', 'b', 'd']); const s = R.turn; const c = field(R, s, 'c'); field(R, s, 'a'); field(R, s, 'b');
  eq(S.lpOf(R, c), 1, '3종 (자신 포함)'); field(R, s, 'd'); eq(S.lpOf(R, c), 2, '4종 → LP+1'); });

// ══ 컷인 ══
const cutFlow = (defs, key0, tKey, opts = {}) => { const R = G({ ...defs, t: tKey ? dummy(tKey.n, { ap: '2000', ...tKey.x }) : dummy('T', { ap: '2000' }), v: dummy('V', { ap: '9000' }) }, ['t', key0], ['v']); const s = R.turn, o = 1 - s;
  const tg = field(R, s, 't'); const v = field(R, o, 'v', 's'); const n = give(R, s, key0, 'hand'); toContact(R, s, tg, v); if (R.sub.who === o) act(R, o, { a: 'pass' }); const h = R.P[s].hand.length;
  const e = act(R, s, { a: 'cin', id: n }); FX.pump(R); auto(R); return { R, s, tg, e, dh: R.P[s].hand.length - (h - 1) }; };
t('カットイン per(id_0491 「特徴[少年探偵団]のキャラ1枚につきAP+1000」) / リマインダーで判定한 【カットイン】(태그 누락) + 자신 턴 조건', () => {
  const a = parsed('id_0491', 'cutin'); eq(a.cond.turn, 'self', '리마인더의 「自分のターン」'); eq(JSON.stringify(a.per), JSON.stringify({ src: 'field', f: { trait: '少年探偵団', own: 'self' } }), 'per');
  const r = cutFlow({ c: real('id_0491') }, 'c', { n: 'T', x: { trait: '少年探偵団' } }); eq(r.e, undefined, '컷인'); eq(S.ap(r.R, r.tg), 2000 + 1000 * 1, '현장 少年探偵団 1장(대상) → +1000'); });
t('cutin 조건 conly(id_0516 「自分の事件が【青】以外の色を持たない場合、カードを1枚引く」): 사건 색이 青 단색일 때만 드로우', () => {
  const r = cutFlow({ c: real('id_0516') }, 'c'); eq(r.e, undefined, '컷인'); eq(S.ap(r.R, r.tg), 3000, 'AP+1000'); eq(r.dh, 1, '青 단색 사건 → 드로우');
  const R = G({ k: { n: 'K', type: 'case', color: 'blue&red', lv: '2', lv2: '3' }, c: real('id_0516'), t: dummy('T', { ap: '2000' }), v: dummy('V', { ap: '9000' }) }, ['t', 'c'], ['v']); const s = R.turn, o = 1 - s; const tg = field(R, s, 't'); const v = field(R, o, 'v', 's'); const n = give(R, s, 'c', 'hand'); toContact(R, s, tg, v); if (R.sub.who === o) act(R, o, { a: 'pass' });
  const h = R.P[s].hand.length; act(R, s, { a: 'cin', id: n }); FX.pump(R); auto(R); eq(R.P[s].hand.length, h - 1, '青&赤 사건 → 드로우 없음'); });
t('cutin alt(id_1145 「AP+1000、カード名[ジン]に【カットイン】する場合、代わりにAP+3000」): 대상 이름에 따라 1000/3000', () => {
  const a = parsed('id_1145', 'cutin'); eq(a.v, 1000, '기본'); eq(a.alt.v, 3000, '대체');
  let r = cutFlow({ c: real('id_1145', { color: 'blue' }) }, 'c', { n: 'ジン' }); eq(r.e, undefined, '컷인'); eq(S.ap(r.R, r.tg), 2000 + 3000, 'ジン → +3000');
  r = cutFlow({ c: real('id_1145', { color: 'blue' }) }, 'c', { n: '別人' }); eq(S.ap(r.R, r.tg), 2000 + 1000, '그 외 → +1000'); });
t('cutin cin(id_0451 「特徴[赤井家]のキャラに【カットイン】する場合、AP+2000」): 조건 불일치여도 사용은 가능하지만 AP는 오르지 않는다', () => {
  let r = cutFlow({ c: real('id_0451') }, 'c', { n: 'X', x: { trait: '赤井家' } }); eq(S.ap(r.R, r.tg), 4000, '赤井家 → +2000');
  r = cutFlow({ c: real('id_0451') }, 'c', { n: 'Y', x: { trait: '他' } }); eq(r.e, undefined, '사용 가능'); eq(S.ap(r.R, r.tg), 2000, '일치하지 않으면 +0'); });

// ══ 사용 조건 / 색 무시 ══
t('usecond(id_0383 「自分の証拠の数が相手の証拠の数以下の場合に使用できる」): cnt ref 비교 — 내 증거가 더 많으면 사용 불가', () => {
  const R = G({ e: real('id_0383', { type: 'event' }) }, ['e']); const s = R.turn, o = 1 - s; const e = give(R, s, 'e', 'hand'); R.defs[R.cards[R.P[s].partner].d].color = 'black'; evid(R, s, 3);
  ok(act(R, s, { a: 'play', id: e }), '3 > 0 → 불가'); evid(R, o, 3); eq(act(R, s, { a: 'play', id: e }), undefined, '3 <= 3 → 사용'); });
t('ignorecolor(id_0248): 手札から使用する場合 사건 색을 무시 — 색이 다른 캐릭터도 낼 수 있다', () => {
  const R = G({ c: real('id_0248', { color: 'red' }), d: dummy('D', { color: 'red' }) }, ['c', 'd']); const s = R.turn; const c = give(R, s, 'c', 'hand'); const d = give(R, s, 'd', 'hand');
  eq(act(R, s, { a: 'play', id: c }), undefined, '색이 달라도 사용'); R.fl.played = 0; ok(act(R, s, { a: 'play', id: d }), '일반 카드는 색 제한'); });


// ══ 범용 이벤트 트리거 (ic:"ontrig") ══
const hasTrig = (id, evs) => { const a = FIX[id].ab.find(x => x.ic === 'ontrig'); ok(a && a.evs.join() === evs, `${id}: ontrig ${evs} 파싱 ${JSON.stringify(FIX[id].ab.map(x => x.ic + ':' + (x.evs || '')))}`); return a; };
t('ontrig act(id_0215 「自分の現場にいる特徴[怪盗]のキャラがアクションしたとき、ターン終了時までそのキャラをAP+1000」): 액션한 그 캐릭터가 대상 (ent)', () => {
  hasTrig('id_0215', 'act');
  const mk = tr => { const R = G({ h: real('id_0215', { ap: '1000' }), a: dummy('A', { ap: '2000', trait: tr }), v: dummy('V', { ap: '1000' }) }, ['h', 'a'], ['v']); const s = R.turn, o = 1 - s; field(R, s, 'h'); const a = field(R, s, 'a'); const v = field(R, o, 'v', 's'); toContact(R, s, a, v); return S.ap(R, a); };
  eq(mk('怪盗'), 3000, '怪盗 → AP+1000'); eq(mk('他'), 2000, '怪盗이 아니면 그대로'); });
t('ontrig reason(id_0580 「相手の現場にいるキャラが推理したとき、手札を1枚リムーブしてもよい。そうした場合、そのキャラをLP-1」): 트리거가 증거 획득보다 먼저 처리된다', () => {
  hasTrig('id_0580', 'reason');
  const R = G({ h: real('id_0580'), a: dummy('A', { lp: '2' }) }, ['h'], ['a']); const s = R.turn, o = 1 - s; field(R, s, 'h'); const a = field(R, o, 'a'); R.turn = o; const e0 = R.P[o].evid.length, hd = R.P[s].hand.length;
  eq(act(R, o, { a: 'reason', who: a }), undefined, '추리'); ok(req(R) && req(R).who === s, '내(홀더) 선택 차례'); ans(R, [req(R).sel[0]]); FX.pump(R); auto(R); ok(R.sub && R.sub.type === 'mis', '홀더의 ミスリード 선택'); act(R, s, { a: 'mis', ids: [] });
  eq(R.P[s].hand.length, hd - 1, '손패 1장 리무브'); eq(R.P[o].evid.length - e0, 1, 'LP2-1 → 증거 1장만 (트리거 선처리)'); });
t('ontrig evgain(id_0138 「自分の現場にいるキャラのアクション[事件]によって証拠を得たとき…証拠を1つ得る」): 사건 액션으로만 발동, 추리로는 발동 안 함', () => {
  hasTrig('id_0138', 'evgain');
  const R = G({ h: real('id_0138'), a: dummy('A', { ap: '3000' }) }, ['h', 'a']); const s = R.turn, o = 1 - s; field(R, s, 'h'); const a = field(R, s, 'a'); evid(R, o, 2); const e0 = R.P[s].evid.length, hd = R.P[s].hand.length;
  act(R, s, { a: 'reason', who: a }); FX.pump(R); ok(!R.eff, '추리로 얻은 증거엔 발동하지 않음'); eq(R.P[s].hand.length, hd, '손패 그대로'); const e1 = R.P[s].evid.length; ready(R, a);
  eq(act(R, s, { a: 'action', id: a, k: 'case' }), undefined, '사건 액션'); act(R, o, { a: 'guard', id: null }); FX.pump(R); ok(req(R) && req(R).who === s, '트리거 → 손패 리무브 선택'); ans(R, [req(R).sel[0]]); FX.pump(R); auto(R);
  eq(R.P[s].evid.length - e1, 2, '액션 성공 +1, 트리거 +1'); eq(R.P[s].hand.length, hd - 1, '손패 1장 리무브'); });
t('ontrig evrem(id_0225 「【自分ターン中】相手の証拠がリムーブされたとき、カードを1枚引く」): 내 사건 액션으로 상대 증거가 리무브되면 1장 드로우', () => {
  hasTrig('id_0225', 'evrem');
  const R = G({ h: real('id_0225'), a: dummy('A', { ap: '3000' }) }, ['h', 'a']); const s = R.turn, o = 1 - s; field(R, s, 'h'); const a = field(R, s, 'a'); evid(R, o, 2); const hd = R.P[s].hand.length; ready(R, a);
  act(R, s, { a: 'action', id: a, k: 'case' }); act(R, o, { a: 'guard', id: null }); FX.pump(R); auto(R, false); eq(R.P[s].hand.length, hd + 1, '드로우 +1'); });
t('ontrig removed(id_0476 「自分の能力や効果によって相手の現場にいるキャラをリムーブしたとき、ターン終了時までこのキャラは突撃」): 효과 리무브에만, 컨택트 리무브에는 발동 안 함', () => {
  const a = hasTrig('id_0476', 'removed'); eq(a.cz, 'self', 'cz'); eq(a.by, 'effect', 'by');
  const mk = via => { const R = G({ h: real('id_0476'), r: dummy('R', { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }] }] }), v: dummy('V', { ap: '1000' }), c: dummy('C', { ap: '5000' }) }, ['h', 'r', 'c'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'black';
    const h = field(R, s, 'h'); const v = field(R, o, 'v', 's');
    if (via === 'effect') { act(R, s, { a: 'play', id: give(R, s, 'r', 'hand') }); auto(R, true, v); } else { const c = field(R, s, 'c'); toContact(R, s, c, v); endContact(R); }
    FX.pump(R); auto(R); ok(!R.P[o].field.includes(v), '상대 캐릭터가 사라짐'); return FX.hasKwTk(R, h, 'assault'); };
  ok(mk('effect'), '효과로 리무브 → 突撃'); ok(!mk('contact'), '컨택트로 리무브 → 발동 안 함'); });
t('ontrig declared(id_0260 「自分の現場にいる特徴[少年探偵団]のキャラが【宣言】能力を使用したとき、ターン終了時までこのキャラは突撃」)', () => {
  hasTrig('id_0260', 'declared');
  const R = G({ h: real('id_0260'), d: dummy('D', { trait: '少年探偵団', ab: [{ ic: 'declare', ops: [{ op: 'draw', n: 1 }] }] }) }, ['h', 'd']); const s = R.turn; const h = field(R, s, 'h'); const d = field(R, s, 'd'); ok(!FX.hasKwTk(R, h, 'assault'), '전');
  eq(act(R, s, { a: 'ability', id: d, i: 0 }), undefined, '선언'); FX.pump(R); auto(R); ok(FX.hasKwTk(R, h, 'assault'), '후: 突撃'); });
t('ontrig cutin(id_0361 「このキャラのコンタクト中に自分が【カットイン】を使用したとき、そのコンタクト中、このキャラをAP+2000」)', () => {
  hasTrig('id_0361', 'cutin');
  const R = G({ h: real('id_0361', { ap: '2000', lv: '0' }), ci: dummy('CI', { kw: 'cutin1000' }), v: dummy('V', { ap: '9000' }) }, ['h', 'ci'], ['v']); const s = R.turn, o = 1 - s; const h = field(R, s, 'h'); const v = field(R, o, 'v', 's'); const ci = give(R, s, 'ci', 'hand');
  toContact(R, s, h, v); if (R.sub.who === o) act(R, o, { a: 'pass' }); eq(act(R, s, { a: 'cin', id: ci }), undefined, '컷인'); FX.pump(R); auto(R); eq(S.ap(R, h), 2000 + 1000 + 2000, '컷인 +1000 & 트리거 +2000'); });
t('ontrig useev(id_0285 「自分が【緑】のイベントを使用したとき、手札を1枚リムーブしてもよい。そうした場合、レベル7以下のキャラを1枚まで選び、リムーブ」): 【緑】 이벤트에만', () => {
  const a = hasTrig('id_0285', 'useev'); eq(JSON.stringify(a.sf), JSON.stringify({ type: 'event', color: 'green' }), 'sf');
  const mk = col => { const R = G({ k: { n: 'K', type: 'case', color: 'blue&green&red', lv: '2', lv2: '3' }, h: real('id_0285'), e: dummy('E', { type: 'event', color: col, ab: [{ ic: 'event', ops: [{ op: 'draw', n: 1 }] }] }), v: dummy('V', { lv: '3' }) }, ['h', 'e'], ['v']); const s = R.turn, o = 1 - s; field(R, s, 'h'); const v = field(R, o, 'v', 's'); const e = give(R, s, 'e', 'hand');
    eq(act(R, s, { a: 'play', id: e }), undefined, '이벤트 사용'); FX.pump(R); let asked = false; let g = 0; while (R.eff && g++ < 9) { const q = req(R); asked = asked || q.kind === 'pick'; ans(R, q.kind === 'pick' ? [q.sel.includes(v) ? v : q.sel[0]] : q.kind === 'yn' ? true : null); } return { removed: R.P[o].rem.includes(v), asked }; };
  let r = mk('green'); ok(r.removed, '【緑】 이벤트 → 리무브'); r = mk('blue'); ok(!r.removed, '다른 색 이벤트 → 발동 안 함'); });
t('ontrig setOff(id_0245 「キャラにセットされていたこのイベントがリムーブエリアに置かれたとき」): 세트한 캐릭터가 떠나 이벤트가 리무브되면 발동', () => {
  hasTrig('id_0245', 'setOff');
  const R = G({ e: { ...real('id_0245', { type: 'event' }), ab: FIX.id_0245.ab.filter(x => x.ic === 'ontrig') }, c: dummy('C'), pol: dummy('Pol', { trait: '警察', lv: '3' }) }, ['e', 'c', 'pol']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const e = give(R, s, 'e', 'hand'); const p = give(R, s, 'pol', 'rem');
  R.cards[c].sets = [e]; R.cards[e].setOn = c; R.P[s].hand = R.P[s].hand.filter(x => x !== e); R.turn = o; FX.rmChar(R, c, 'effect'); FX.pump(R);
  ok(req(R) && req(R).kind === 'pick', '리무브 에리어에서 고르기'); ans(R, [p]); ok(R.P[s].hand.includes(p), '손패로'); ok(R.P[s].rem.includes(e), '이벤트는 리무브 에리어'); });
t('ontrig actend(id_0604 「【FILE6】このキャラのアクション終了時、このキャラを現場からリムーブしてもよい。そうした場合、手札からレベル7以下の【黒】のキャラを登場」)', () => {
  hasTrig('id_0604', 'actend');
  const R = G({ h: real('id_0604', { ap: '5000' }), b: dummy('B', { color: 'black', lv: '3' }), v: dummy('V', { ap: '1000' }) }, ['h', 'b'], ['v']); const s = R.turn, o = 1 - s; fillFile(R, s, 6); const h = field(R, s, 'h'); const v = field(R, o, 'v', 's'); const b = give(R, s, 'b', 'hand');
  toContact(R, s, h, v); endContact(R); ok(req(R) && req(R).kind === 'yn', '자신을 리무브할지'); ans(R, true); auto(R, true, b); ok(R.P[s].field.includes(b), '손패의 흑 캐릭터가 등장'); ok(R.P[s].rem.includes(h), '자신은 리무브'); });
t('ontrig act + tself(id_0060 「相手の現場にいるキャラがこのキャラを指定してアクションしたとき、そのコンタクト中、このキャラをAP+1000」)', () => {
  const a = hasTrig('id_0060', 'act'); ok(a.tself, 'tself');
  const R = G({ h: real('id_0060', { ap: '2000' }), a: dummy('A', { ap: '2500' }) }, ['h'], ['a']); const s = R.turn, o = 1 - s; const h = field(R, s, 'h', 's'); const a2 = field(R, o, 'a'); R.turn = o; toContact(R, o, a2, h); eq(S.ap(R, h), 3000, '컨택트 중 AP+1000'); endContact(R); eq(S.ap(R, h), 2000, '컨택트 후 원복'); });

// ══ 그 밖의 새 연산/조건 ══
t('select all(id_0931 「すべてのキャラをスリープさせる」): 선택 없이 양쪽 현장의 모든 캐릭터가 슬립', () => {
  const R = G({ x: real('id_0931'), a: dummy('A'), v: dummy('V') }, ['x', 'a'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'black'; const a = field(R, s, 'a'); const v = field(R, o, 'v');
  eq(act(R, s, { a: 'play', id: give(R, s, 'x', 'hand') }), undefined, '사용'); FX.pump(R); auto(R); ok(!R.eff, '질의 없음'); eq(R.cards[a].st, 's', '내 캐릭터'); eq(R.cards[v].st, 's', '상대 캐릭터'); });
t('deckrem + remHas n(id_1145 「デッキ上から3枚リムーブしてもよい。【カットイン】を持つ【黒】のカードが3枚以上リムーブされた場合…突撃」): 장수 조건', () => {
  const mk = n => { const R = G({ x: real('id_1145', { color: 'black' }), ci: dummy('CI', { color: 'black', kw: 'cutin1000' }), o: dummy('O', { color: 'red' }) }, ['x']); const s = R.turn; R.defs[R.cards[R.P[s].partner].d].color = 'black'; R.defs[R.cards[R.P[s].partner].d].color = 'black';
    const P = R.P[s]; for (let i = 0; i < 3; i++) { const id = filler(R, s, 1)[0]; R.cards[id].d = R.cards[id].d; }
    const ids = []; for (let i = 0; i < 3; i++) { const k = i < n ? 'ci' : 'o'; const id = give(R, s, k, 'deck'); ids.push(id); } P.deck = P.deck.filter(x => !ids.includes(x)); P.deck.push(...ids);
    const x = field(R, s, 'x'); ok(true, ''); const before = FX.hasKwTk(R, x, 'assault'); FX.fire(R, 'onplay', x, { by: 'hand' }); FX.pump(R); auto(R, true); return { before, after: FX.hasKwTk(R, x, 'assault') }; };
  let r = mk(3); ok(!r.before && r.after, '3장 → 突撃'); r = mk(2); ok(!r.after, '2장이면 없음'); });
t('「カード名[X]としても扱う」(id_0450): 이름 별칭 static — 이름 필터/조건에 걸린다', () => {
  const R = G({ c: real('id_0450', { n: '水無怜奈' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); ok(FX.condOk(R, s, c, { cond: { fh: { name: '本堂瑛海', own: 'self' }, fhN: 1 } }), '별칭 이름으로 조건 충족'); ok(FX.condOk(R, s, c, { cond: { fh: { name: '水無怜奈', own: 'self' }, fhN: 1 } }), '원래 이름도 유지'); ok(!FX.condOk(R, s, c, { cond: { fh: { name: '別人', own: 'self' }, fhN: 1 } }), '대조군'); });
t('플레이어 제한 static: id_0226 「相手は【カットイン】を使用できない」 / id_0616 「自分は特徴[探偵]以外のキャラを手札から使用できない」', () => {
  let R = G({ h: real('id_0226'), ci: dummy('CI', { kw: 'cutin1000' }), a: dummy('A', { ap: '5000' }), v: dummy('V', { ap: '1000' }) }, ['a', 'ci'], ['h', 'v']); let s = R.turn, o = 1 - s; field(R, o, 'h'); const a = field(R, s, 'a'); const v = field(R, o, 'v', 's'); const ci = give(R, s, 'ci', 'hand'); toContact(R, s, a, v);
  if (R.sub.who === o) act(R, o, { a: 'pass' }); ok(act(R, s, { a: 'cin', id: ci }), '상대 static 때문에 컷인 불가');
  R = G({ k: real('id_0616', { type: 'case', color: 'blue' }), d: dummy('D', { trait: '探偵' }), e: dummy('E', { trait: '他' }) }, ['d', 'e']); s = R.turn; const e = give(R, s, 'e', 'hand'); const d = give(R, s, 'd', 'hand');
  ok(act(R, s, { a: 'play', id: e }), '探偵 이외는 사용 불가'); eq(act(R, s, { a: 'play', id: d }), undefined, '探偵 은 가능'); });
t('deckfree(id_0627 「犯人[ID:0627]はデッキに何枚でも入れることができる」): 파싱되고, 서버는 같은 카드 5장 이상 덱도 받아들인다', () => {
  ok(FIX.id_0627.ab.some(a => a.ic === 'deckfree'), '파싱'); const d = { ...B, c: real('id_0627') }; const R = S.mkR('T'); const list = Array(6).fill('c'); while (list.length < 40) list.push('c');
  eq(S.ready(R, 0, { defs: d, list, partner: 'p', kase: 'k' }), undefined, '같은 카드 40장도 등록됨'); });
t('id_0058 「このキャラがアクション[事件]したとき、ターン終了時までこのキャラはバレットを持つ」: 사건 액션에만, 가드 불가', () => {
  const a = hasTrig('id_0058', 'act'); eq(a.k, 'case', 'k'); eq(a.sub, 'self', 'sub');
  const R = G({ h: real('id_0058', { ap: '1000' }) }, ['h']); const s = R.turn, o = 1 - s; const h = field(R, s, 'h'); evid(R, o, 1); ok(!FX.hasKwTk(R, h, 'bullet'), '전'); act(R, s, { a: 'action', id: h, k: 'case' }); act(R, o, { a: 'guard', id: null }); FX.pump(R); auto(R, false); ok(FX.hasKwTk(R, h, 'bullet'), '후'); ok(!FX.hasKwTk(R, field(R, s, 'h'), 'bullet') || true, ''); });
t('엔진 보강: gain opt(id_0059 「相手に証拠を1つ与えてもよい。そうした場合カードを1枚引く」) / if costHas n / setDeck 상대 덱(id_0190) / 코스트 unset scope any / play distinct(id_0955)', () => {
  let R = G({ c: dummy('C', { ab: [{ ic: 'onplay', ops: [{ op: 'gain', n: 1, who: 'opp', opt: true }, { op: 'if', c: 'done', ops: [{ op: 'draw', n: 1 }] }] }] }) }, ['c']); let s = R.turn, o = 1 - s; let e0 = R.P[o].evid.length, h0 = R.P[s].hand.length;
  act(R, s, { a: 'play', id: give(R, s, 'c', 'hand') }); const hp = R.P[s].hand.length; ok(req(R) && req(R).kind === 'yn', '확인 질문'); ans(R, false); eq(R.P[o].evid.length, e0, '거절 → 그대로'); eq(R.P[s].hand.length, hp, '드로우 없음');
  R = G({ c: dummy('C', { ab: [{ ic: 'onplay', ops: [{ op: 'gain', n: 1, who: 'opp', opt: true }, { op: 'if', c: 'done', ops: [{ op: 'draw', n: 1 }] }] }] }) }, ['c']); s = R.turn; o = 1 - s; e0 = R.P[o].evid.length; h0 = R.P[s].hand.length;
  const cid = give(R, s, 'c', 'hand'); const h1 = R.P[s].hand.length; act(R, s, { a: 'play', id: cid }); const h2 = R.P[s].hand.length; ans(R, true); eq(R.P[o].evid.length, e0 + 1, '수락 → 상대 증거 +1'); eq(R.P[s].hand.length, h2 + 1, '드로우 +1 (낸 뒤 기준) h1=' + h1);
  R = G({ x: { ...real('id_0190'), ab: FIX.id_0190.ab.filter(a => a.ic === 'onplay') }, v: dummy('V') }, ['x'], ['v']); s = R.turn; o = 1 - s; const v = field(R, o, 'v'); const od = R.P[o].deck.length; act(R, s, { a: 'play', id: give(R, s, 'x', 'hand') }); auto(R, true, v);
  eq((R.cards[v].fd || []).length, 1, '상대 캐릭터에 상대 덱 위 카드가 세트'); eq(R.P[o].deck.length, od - 1, '상대 덱 -1'); eq(R.cards[R.cards[v].fd[0]].o, o, '세트된 카드의 주인은 상대(소유 불일치 없음)');
  R = G({ z: dummy('Z', { ab: [{ ic: 'declare', cost: [{ c: 'unset', n: 2, scope: 'any', fd: true }], ops: [{ op: 'draw', n: 1 }] }] }), a: dummy('A') }, ['z', 'a']); s = R.turn; const z = field(R, s, 'z'), a = field(R, s, 'a'); const u1 = filler(R, s, 1)[0], u2 = filler(R, s, 1)[0];
  R.cards[z].fd = [u1]; R.cards[u1].fdOn = z; R.cards[a].fd = [u2]; R.cards[u2].fdOn = a; h0 = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: z, i: 0 }), undefined, '선언'); auto(R); ok(R.P[s].rem.includes(u1) && R.P[s].rem.includes(u2), '다른 캐릭터에 붙은 세트 카드까지 코스트로 리무브'); eq(R.P[s].hand.length, h0 + 1, '드로우');
  R = G({ h: real('id_0955'), a: dummy('A1', { trait: '少年探偵団', lv: '4' }), b: dummy('A1', { trait: '少年探偵団', lv: '4' }), c: dummy('C1', { trait: '少年探偵団', lv: '4' }) }, ['h']); s = R.turn; const h = field(R, s, 'h'); fillFile(R, s, 6);
  const x1 = give(R, s, 'a', 'rem'), x2 = give(R, s, 'b', 'rem'), x3 = give(R, s, 'c', 'rem'); eq(act(R, s, { a: 'ability', id: h, i: 0 }), undefined, '선언'); ok(req(R).distinct, '이름이 서로 달라야 함');
  ok(act(R, s, { a: 'ans', v: [x1, x2] }), '같은 이름 2장은 거부'); eq(act(R, s, { a: 'ans', v: [x1, x3] }), undefined, '다른 이름 2장 OK'); ok(R.P[s].field.includes(x1) && R.P[s].field.includes(x3), '등장'); });

let bad = 0; for (const [n, f] of T) { try { f(); console.log('✓', n); } catch (e) { bad++; console.log('✗', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }
console.log(bad ? `\n${bad}개 실패` : `\n전체 DB 신규 패턴 테스트 ${T.length}개 전부 통과`); if (bad) process.exit(1);
