// 전문 봇 시스템 테스트 (mock specialist 만 사용 — 실제 덱/전문 봇은 만들지 않는다).
//  1) registry  2) 프로필 검증  3) 정책(평가/순서/멀리건/훅 안전)  4) 코어 탐색과의 결합(프로필이 "선택"을 바꾸되 탐색은 그대로)  5) 범용 fallback(빈 프로필 = 범용 Expert)
//  6) 전문 봇 self-play(불법/교착/손상 0)  7) 방 통합(서버 createRoom, 고정 덱)  8) 스냅샷 복원 + 회귀 러너
process.env.BOT_DELAY_MS = '0'; process.env.BOT_THINK_MS = '200'; process.env.BOT_MICRO_MS = '150'; process.env.BOT_NO_WORKER = '1'; // mock 은 이 프로세스의 registry 에만 있으므로 worker 없이
const fs = require('fs'), path = require('path'), os = require('os');
const X = require('./specialist_util.js'), { U } = X, H = require('./helpers.js'), SIM = require('../bot/simulate.js'), EV = require('../bot/evaluate.js');
const REG = require('../bot/specialists/registry.js'), POL = require('../bot/specialists/policy.js'), { Searcher, priority } = require('../bot/search.js'), { decide } = require('../bot/decide.js'), SP = require('./bot_selfplay.js'), SN = require('../bot/snapshot.js');
const { S } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const throws = (f, re, m) => { try { f(); ok(false, m + ' (예외 없음)'); } catch (e) { ok(re.test(e.message), m + ' → ' + e.message.slice(0, 90)); } };
const DB = U.db(), D1 = U.makeDeck(101), D2 = (() => { for (let sd = 102; ; sd++) { const d = U.makeDeck(sd); if (!/[\/,&]/.test(String(DB[d.kase].color))) return d; } })(),   // 단색 사건이 나오는 시드(DB 가 바뀌어도 테스트가 흔들리지 않게)
  keysOf = d => [...new Set(d.list)];

// ── 1) registry ─────────────────────────────────────────────────────────────
{
  const before = REG.load().size; ok(REG.problems().length === 0, `등록된 전문 봇 파일 구조 문제 없음 (현재 ${before}개)`);
  const spec = REG.readSpec(X.mockSpec('mock_a', D1, {}, { name: '적색 Mock Expert', color: 'red', deckName: 'MockDeck' }), 'mock').spec; REG._register(X.mockSpec('mock_a', D1, {}, { name: '적색 Mock Expert', color: 'red', deckName: 'MockDeck' }));
  const L = REG.list(DB), m = L.find(x => x.id === 'mock_a'); ok(m && m.ok && m.name === '적색 Mock Expert' && m.deckName === 'MockDeck' && m.colorLabel === '적색' && m.cards === 40, 'registry.list: 이름/덱 이름/색/장수 (UI 목록 원본): ' + JSON.stringify(m));
  ok(!JSON.stringify(L).includes('profile') && !JSON.stringify(L).includes('hooks'), '목록에는 전략 프로필을 내보내지 않음');
  REG._register(X.mockSpec('mock_b', D2, {}, { name: 'Mock B' })); const b = REG.list(DB).find(x => x.id === 'mock_b'); ok(b.colors.length === 1 && b.colorLabel, `색 생략 시 사건 카드 색을 DB 에서 자동 표시: ${b.colorLabel}`);
  ok(REG.list(DB).length === before + 2, '새 전문 봇 등록 → 목록에 자동으로 나타남 (HTML 수정 없음)');
  throws(() => REG._register({ id: 'Bad Id', name: 'x', deck: X.exportDeck('d', D1), profile: {} }), /id 는 영소문자/, '잘못된 id 거부');
  throws(() => REG._register({ id: 'nodeck', name: 'x' }), /deckFile/, '덱 없는 전문 봇 거부');
  throws(() => REG._register({ id: 'typo1', name: 'x', deck: X.exportDeck('d', D1), profiel: {} }), /알 수 없는 항목/, '최상위 오타 거부');
  const badDeck = X.exportDeck('bad', D1); badDeck.main[0].n = 4; REG._register({ id: 'baddeck', name: 'BadDeck', deck: badDeck, profile: {} });
  const bd = REG.list(DB).find(x => x.id === 'baddeck'); ok(bd && !bd.ok && bd.errors.length, `규칙 위반 덱은 목록에 "사용 불가"로 표시 + 이유: ${bd.errors[0]}`);
  throws(() => REG.botDeck('baddeck', DB), /올바르지 않습니다/, '사용 불가 봇은 대전 생성 거부 (자동 보정 없음)'); throws(() => REG.botDeck('nope', DB), /등록되지 않은/, '없는 봇 id');
  const okd = REG.botDeck('mock_a', DB); ok(Object.values(okd.deck.cards).reduce((a, c) => a + c, 0) === 40 && okd.deck.kase === D1.kase && okd.deck.partner === D1.partner, '고정 덱: 등록한 덱 JSON 그대로 (사건/파트너/40장)');
  // 덱 폴더(BOT_SPECIALISTS_DIR) 로드: 파일 기반 등록 경로
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-')); fs.mkdirSync(path.join(tmp, 'decks')); fs.writeFileSync(path.join(tmp, 'decks', 'filebot.json'), JSON.stringify(X.exportDeck('FileDeck', D1), null, 1));
  fs.writeFileSync(path.join(tmp, 'filebot.js'), "module.exports={id:'filebot',name:'File Bot',deckFile:'decks/filebot.json',profile:{}};"); fs.writeFileSync(path.join(tmp, 'broken.js'), "module.exports={id:'broken'};");
  process.env.BOT_SPECIALISTS_DIR = tmp; REG.reload(); ok(REG.get('filebot') && REG.get('filebot').deck.name === 'FileDeck', '파일 기반 등록: <id>.js + decks/<id>.json 자동 로드'); ok(REG.problems().some(p => /broken\.js/.test(p)), '깨진 전문 봇 파일은 문제 목록에 보고되고 나머지는 계속 동작');
  delete process.env.BOT_SPECIALISTS_DIR; REG.reload(); REG._register(X.mockSpec('mock_a', D1, {}, { name: '적색 Mock Expert', color: 'red', deckName: 'MockDeck' })); REG._register(X.mockSpec('mock_b', D2, {}, { name: 'Mock B' }));
}

// ── 2) 프로필 검증 ──────────────────────────────────────────────────────────
{
  const dk = keysOf(D1), v = (p, o = {}) => POL.validateProfile(p, { DB, deckCards: dk, ...o });
  ok(v({}).errors.length === 0, '빈 프로필 = 유효'); ok(v({ weights: { file: 1 }, cards: { [dk[0]]: { hand: 1 } } }).errors.length === 0, '정상 프로필은 오류 없음');
  ok(v({ wieghts: {} }).errors.some(e => /알 수 없는 항목/.test(e)), '프로필 키 오타 검출'); ok(v({ weights: { fileee: 1 } }).errors.some(e => /알 수 없는 평가 가중치/.test(e)), '가중치 이름 오타 검출');
  ok(v({ weights: { file: 'a' } }).errors.some(e => /숫자/.test(e)), '숫자 아닌 값 검출'); ok(v({ cards: { id_nope: { hand: 1 } } }).errors.some(e => /DB 에 없는 ID/.test(e)), 'DB 에 없는 카드 ID 검출');
  ok(v({ cards: { [dk[0]]: { role: 'zz' } } }).errors.some(e => /정의되지 않은 역할/.test(e)), '정의 안 된 역할 검출'); ok(v({ cards: { [dk[0]]: { mulligan: 'maybe' } } }).errors.some(e => /keep.*replace/.test(e)), 'mulligan 값 검출');
  ok(v({ actions: { fly: 1 } }).errors.some(e => /알 수 없는 행동/.test(e)), '행동 이름 오타 검출'); ok(v({ hooks: { score: 5 } }).errors.some(e => /함수/.test(e)), '훅은 함수만');
  const other = Object.keys(DB).find(id => !dk.includes(id)); ok(v({ cards: { [other]: { hand: 1 } } }).warnings.some(e => /내 덱에 없는 카드/.test(e)), '내 덱에 없는 카드에 내 쪽 항목 → 경고');
  ok(v({ combos: [{ cards: [], bonus: 1 }] }).errors.length > 0, '빈 콤보 검출'); ok(v({ matchups: [{ name: 'x', vs: { bogus: 1 } }] }).errors.some(e => /vs\.bogus/.test(e)), '매치업 조건 오타 검출');
  const spec = REG.get('mock_a'); REG._register(X.mockSpec('mock_bad', D1, { cards: { id_nope: { hand: 1 } } })); ok(!REG.list(DB).find(x => x.id === 'mock_bad').ok, '프로필 오류가 있는 봇은 목록에서 "사용 불가"'); REG._unregister('mock_bad');
}

// ── 3) 정책 (실제 샘플 카드 게임 위에서) ─────────────────────────────────────
const newMain = (seed, first = 0) => { const R = U.newGame(seed, D1, D2, { first }); for (let i = 0; i < 2; i++) S.act(R, R.mullSeat, { a: 'mull', ids: [] }); return R; };
const mk = (profile, R, seat) => POL.buildPolicy({ id: 't', profile }, { seat, R });
{
  const R = newMain(7, 0), seat = 0, handK = R.P[seat].hand.map(id => POL.keyOf(R, id)), k0 = handK[0];
  const p0 = mk({}, R, seat); ok(p0.W === null && p0.score(R) === 0 && p0.explain(R).total === 0, '빈 프로필: 가중치/점수 보정 없음 (범용 Expert 와 동일)');
  const cnt0 = handK.filter(k => k === k0).length, p1 = mk({ cards: { [k0]: { hand: 1.5 } } }, R, seat); ok(Math.abs(p1.score(R) - 1.5 * cnt0) < 1e-9, `카드 hand 값 = 손패 사본 수 × 값 (${cnt0}×1.5)`);
  const e = p1.explain(R); ok(e.parts.length === 1 && Math.abs(e.total - e.parts.reduce((a, x) => a + x.value, 0)) < 1e-9, 'explain: 항목별 점수 분해');
  const pr = mk({ roles: { eng: { hand: 2 } }, cards: { [k0]: { role: 'eng' } } }, R, seat); ok(Math.abs(pr.score(R) - 2 * cnt0) < 1e-9, '역할 상속 (role → 카드)'); const pr2 = mk({ roles: { eng: { hand: 2 } }, cards: { [k0]: { role: 'eng', hand: 0.5 } } }, R, seat); ok(Math.abs(pr2.score(R) - 0.5 * cnt0) < 1e-9, '카드 값이 역할 값을 덮어씀');
  const pl = mk({ limit: 3, cards: { [k0]: { hand: 100 } } }, R, seat); ok(pl.score(R) === 3, '정책 추가 점수 상한(limit) 적용');
  // 반대칭: evaluate(R,0,pol) == -evaluate(R,1,pol)
  for (const pol of [p1, mk({ cards: { [k0]: { hand: 2, field: 1, target: 3 } }, file: { perCard: 0.3 }, weights: { file: 1.4 } }, R, seat)]) ok(Math.abs(EV.evaluate(R, 0, pol) + EV.evaluate(R, 1, pol)) < 1e-9, '평가 반대칭 유지 (정책 포함)');
  ok(EV.evaluate(R, seat, p1) - EV.evaluate(R, seat, null) === p1.score(R), '평가 = 범용 평가 + 정책 점수');
  // 가중치
  const pw = mk({ weights: { file: 2 }, lethal: { weight: 2 } }, R, seat); ok(pw.W.file === 2 && pw.W.lethalNow === EV.W.lethalNow * 2 && EV.W.file !== 2, '가중치 덮어쓰기 + lethal 배율 (전역 W 는 불변)');
  // 선공/후공, 매치업
  const pf = mk({ weightsBy: { first: { file: 3 }, second: { file: 4 } } }, R, seat); ok(R.first === seat ? pf.W.file === 3 : pf.W.file === 4, `선공/후공 보정 (선공=${R.first === seat})`);
  const oppCase = POL.keyOf(R, R.P[1].kase), pm = mk({ matchups: [{ name: 'vs opp', vs: { case: oppCase }, weights: { hand: 1.7 } }, { name: 'nomatch', vs: { case: 'zzz' }, weights: { hand: 9 } }] }, R, seat); ok(pm.W.hand === 1.7 && pm.applied.some(a => /vs opp/.test(a)) && !pm.applied.some(a => /nomatch/.test(a)), '매치업 보정: 상대 사건/카드/색 조건으로 선택 적용');
  const pm2 = mk({ cards: { [k0]: { hand: 1 } }, matchups: [{ name: 'm', vs: { case: oppCase }, cards: { [k0]: { hand: 4 } } }] }, R, seat); ok(Math.abs(pm2.score(R) - 4 * cnt0) < 1e-9, '매치업 카드 값이 기본 프로필을 덮어씀');
  // 콤보 / FILE / 증거 / 컷인
  const [a, b2] = [...new Set(handK)]; if (b2) { const pc = mk({ combos: [{ name: 'c', cards: [a, b2], where: 'hand', bonus: 2 }] }, R, seat), pc2 = mk({ combos: [{ name: 'c', cards: [a, b2, 'nonexistent'], where: 'hand', bonus: 2 }] }, R, seat); ok(pc.score(R) === 2 && pc2.score(R) === 0, '콤보: 모든 카드가 모였을 때만 보너스'); }
  R.P[seat].file.push(...R.P[seat].deck.splice(0, 4)); const pfi = mk({ file: { perCard: 0.5, bonusAt: [{ n: 4, bonus: 1 }, { n: 7, bonus: 5 }] }, evidence: { perCard: 2 } }, R, seat); ok(Math.abs(pfi.score(R) - (0.5 * S.fcount(R, seat) + 1)) < 1e-9, `FILE 가치 곡선 (FILE ${S.fcount(R, seat)}장)`);
  // 상대 카드 제거 우선순위: 상대 필드 카드의 target 만큼 "제거하면 +" 
  const oc = R.P[1].deck.pop(); R.P[1].field.push(oc); R.cards[oc].st = 's'; const ok_ = POL.keyOf(R, oc), pt = mk({ cards: { [ok_]: { target: 4 } } }, R, seat); ok(Math.abs(pt.score(R) + 4 * 0.6) < 1e-9, '상대 필드의 지정 카드는 점수 감점(=제거하면 이득) — 슬립은 0.6배'); R.P[1].field.pop(); R.P[1].deck.push(oc);
}
{ // 행동 순서 보너스 (priority) — 합법 수를 바꾸지 않고 순서만
  const R = newMain(8, 0), seat = R.turn; R.P[seat].file.push(...R.P[seat].deck.splice(0, 6)); const moves = SIM.genMoves(R, () => 0), pl = moves.filter(m => m.tag === 'play'); ok(pl.length >= 2, `테스트 상태에 낼 수 있는 카드 ${pl.length}종`);
  const tk = POL.keyOf(R, pl[0].m.id), pol = mk({ cards: { [tk]: { play: 7 } }, actions: { end: -3 } }, R, seat);
  const d = priority(R, pl[0], pol) - priority(R, pl[0], null); ok(d === 7, `카드 play 값 = 순서 가산 (+${d})`); const en = moves.find(m => m.tag === 'end'); ok(priority(R, en, pol) - priority(R, en, null) === -3, '행동 종류별 순서 가산 (end -3)');
  const opp = mk({ cards: { [tk]: { play: 7 } } }, R, 1 - seat); ok(priority(R, pl[0], opp) === priority(R, pl[0], null), '정책 좌석이 아닌 쪽 수에는 영향 없음');
  const pcs = mk({ conserve: { cutinPlay: -5 } }, R, seat); ok(typeof pcs.moveBonus(R, pl[0]) === 'number', '컷인 보존 설정 동작');
  const other = pl.find(m => POL.keyOf(R, m.m.id) !== tk); const ps = mk({ sequences: [{ first: tk, then: POL.keyOf(R, other.m.id), bonus: 6 }] }, R, seat); ok(ps.moveBonus(R, pl[0]) === 6 && ps.moveBonus(R, other) === -3, '사용 순서: first 는 +bonus, then 을 먼저 내면 -bonus/2');
  const after = SIM.genMoves(R, () => 0); ok(JSON.stringify(after.map(m => m.m)) === JSON.stringify(moves.map(m => m.m)), '합법 수 목록은 정책과 무관 (순서 가산은 탐색 순서에만 사용)');
}
{ // 멀리건
  const R = U.newGame(9, D1, D2, { first: 0 }); const seat = R.mullSeat, hand = R.P[seat].hand.slice(), ks = hand.map(id => POL.keyOf(R, id)), { mulliganChoice } = require('../bot/decide.js');
  const base = mulliganChoice(R, seat, null).ids; ok(Array.isArray(base), `범용 멀리건: ${base.length}장 교체`);
  const keepAll = mk({ mulligan: { keep: ks } }, R, seat), m1 = mulliganChoice(R, seat, keepAll).ids; ok(m1.length === 0, 'mulligan.keep: 지정 카드는 교체하지 않음');
  const repAll = mk({ mulligan: { replace: [ks[0]] } }, R, seat), m2 = mulliganChoice(R, seat, repAll).ids; ok(m2.some(id => POL.keyOf(R, id) === ks[0]), 'mulligan.replace: 지정 카드는 교체');
  const cb2 = mk({ combos: [{ cards: [ks[0], ks[1]], keep: true, bonus: 1 }] }, R, seat), m4 = mulliganChoice(R, seat, cb2).ids; ok(!m4.some(id => [ks[0], ks[1]].includes(POL.keyOf(R, id))), '콤보 keep: 콤보 카드가 모두 손에 있으면 함께 유지');
  const hk = mk({ hooks: { mulligan: (v, rep) => v.hand().slice(0, 2) } }, R, seat), m5 = mulliganChoice(R, seat, hk).ids; ok(m5.length === 2 && m5.every(id => hand.includes(id)), '훅 mulligan: 키 배열 → 손패 카드로 변환');
  const bad = mk({ hooks: { mulligan: () => { throw new Error('x'); } } }, R, seat); ok(Array.isArray(mulliganChoice(R, seat, bad).ids), '훅 예외 시 안전하게 무시');
  const kv = mk({ cards: { [ks[0]]: { keep: 9 } } }, R, seat); ok(mulliganChoice(R, seat, kv).ids.every(id => POL.keyOf(R, id) !== ks[0]), 'keep 가산값이 크면 유지');
  const mres = decide({ R, seat, cfg: { seed: 1 } }, new Searcher({ seed: 1, policy: keepAll })); ok(mres.mv.tag === 'mull' && mres.mv.m.ids.length === 0, 'decide(): 멀리건에 정책 적용');
}
{ // 훅 안전: 상태 변경 불가, 이상한 반환 무시
  const R = newMain(10, 0), seat = 0; const key0 = SIM.stateKey(R), snap = JSON.stringify(SN.snapshot(R)); let seen = null;
  const evil = mk({ hooks: { score: v => { seen = v; try { v.hand().push('x'); v.field().length = 0; v.deckKeys().pop(); v.def(v.hand()[0]).n = 'hacked'; v.R = 1; } catch (e) {} return NaN; }, move: v => Infinity } }, R, seat);
  ok(evil.score(R) === 0, '훅이 NaN 반환 → 0'); ok(evil.moveBonus(R, SIM.genMoves(R, () => 0)[0]) <= 40, '훅이 Infinity 반환 → 상한으로 제한'); ok(SIM.stateKey(R) === key0 && JSON.stringify(SN.snapshot(R)) === snap, '훅이 view 를 조작해도 게임 상태 불변');
  ok(seen && !('P' in seen) && !('cards' in seen) && !Object.keys(seen).some(k => /^R$/.test(k)), 'view 에는 R(게임 상태 객체)이 노출되지 않음'); ok(Object.isFrozen(seen), 'view 객체는 freeze');
  const big = mk({ limit: 5, hooks: { score: () => 1e9 } }, R, seat); ok(big.score(R) === 5, '훅 점수도 limit 적용');
  const thr = mk({ hooks: { score: () => { throw new Error('boom'); }, move: () => { throw new Error('boom'); } } }, R, seat); ok(thr.score(R) === 0 && thr.moveBonus(R, SIM.genMoves(R, () => 0)[0]) === 0, '훅 예외 → 0');
  const gen = SIM.genMoves(R, () => 0); ok(gen.length > 0, '훅 호출 후에도 합법 수 생성 정상');
}

// ── 4) 코어 탐색과의 결합: 프로필은 "선택"을 바꾸지만 탐색(search)을 그대로 사용 ───────
{
  const defs = { A: { n: 'A', type: 'char', color: 'red', lv: '0', ap: '3000', lp: '1' }, B: { n: 'B', type: 'char', color: 'red', lv: '0', ap: '3000', lp: '1' } };
  const setup = () => { const R = U.withRng(42, () => H.game(defs)), s = R.turn; R.fl.nh = 1; R.P[s].deck.push(...R.P[s].hand.splice(0)); H.give(R, s, 'A', 'hand'); H.give(R, s, 'B', 'hand'); return R; }; // 넥스트 힌트 불가 → 손패 사용(A/B 중 하나)이 핵심 선택
  const run = (profile, seed = 3) => { const R = setup(), s = R.turn, pol = profile ? POL.buildPolicy({ id: 't', profile }, { seat: s, R }) : null; const r = decide({ R, seat: s, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 4000, seed } }, new Searcher({ seed, policy: pol }));
    const plays = (r.info.plan || []).filter(x => x.mv.tag === 'play').map(x => H.key(R, x.mv.m.id)); return { r, R, plays, k: plays.join(',') || r.mv.tag }; };
  const g = run(null), holdB = run({ cards: { B: { hand: 6 } } }), holdA = run({ cards: { A: { hand: 6 } } });
  ok(g.plays.length === 1 && holdB.plays.join() === 'A' && holdA.plays.join() === 'B', `프로필이 탐색 결과를 바꿈: 범용=${g.k}, B 보존(+6) → ${holdB.k}, A 보존(+6) → ${holdA.k}`);
  ok(holdB.r.info.nodes > 10 && holdB.r.info.iters.length >= 1, `전문 정책에서도 실제 게임 트리 탐색 사용 (노드 ${holdB.r.info.nodes}, 반복 ${holdB.r.info.iters.length}회)`);
  const e0 = run({}), e1 = run({ notes: 'empty', cards: {}, combos: [], sequences: [], hooks: {} }); ok(e0.k === g.k && e1.k === g.k && e0.r.info.value === g.r.info.value, `빈 프로필 = 범용 Expert 와 같은 선택·같은 평가값 (${g.k}, ${Math.round(g.r.info.value * 100) / 100})`);
  const playB = run({ cards: { B: { field: 3 }, A: { field: -3 } } }); ok(playB.plays.join() === 'B', `필드 가치(B +3, A -3) → B 를 냄 (${playB.k})`);
  const seqR = run({ sequences: [{ first: 'B', then: 'A', bonus: 50 }] }); ok(seqR.plays.length === 1 && seqR.r.info.nodes > 10, `사용 순서 가산은 탐색 "순서"에만 영향 — 선택은 여전히 탐색 결과 (${seqR.k})`);
  const ir = run({ cards: { ZZZ: { hand: 5 } } }); ok(ir.k === g.k && ir.r.info.value === g.r.info.value, '프로필에 없는 상황: 범용 Expert 판단 그대로');
  // 리살: 정책이 이상한 점수를 줘도 확정 승리는 놓치지 않는다 (±1e6)
  const lethal = () => { const R = U.withRng(5, () => H.game({ ...defs })), s = R.turn, P = R.P[s]; R.cards[P.kase].solved = true; while (P.evid.length < 9) P.evid.push(P.deck.pop()); R.cards[P.partner].st = 'a'; P.pIn = false; H.fill(R, s, 7); return R; };
  const Rl = lethal(), sl = Rl.turn, polL = POL.buildPolicy({ id: 't', profile: { cards: { A: { hand: 50 } }, file: { perCard: -5 }, actions: { solve: -40 }, limit: 12 } }, { seat: sl, R: Rl }); const lr = decide({ R: Rl, seat: sl, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 4000, seed: 1 } }, new Searcher({ seed: 1, policy: polL })); ok(lr.mv.tag === 'solve' || lr.info.win, `확정 리살은 프로필 점수/순서 가산과 무관하게 선택 (${lr.mv.tag})`);
}

// ── 5) self-play (mock 전문 봇, 범용 Expert 와 같은 덱/선후공 교대) ─────────────
{
  const prof = { weights: { file: 1.1 }, cards: {}, file: { perCard: 0.05 } }; const k1 = keysOf(D1); prof.cards[k1[0]] = { hand: 0.3, target: 1 }; REG._register(X.mockSpec('mock_sp', D1, prof, { name: 'Mock SP' }));
  const NG = 4; let res = { a: 0, b: 0, illegal: 0, stall: 0, corrupt: 0 };
  for (let g = 0; g < NG; g++) { const st = SP.playGame(700 + g, D1, D1, ['spec:mock_sp', 'expert'], g & 1); res.illegal += st.illegal; if (st.stall) res.stall++; if (st.corrupt) res.corrupt++; if (st.winner === 0) res.a++; else if (st.winner === 1) res.b++; }
  ok(res.illegal === 0 && res.stall === 0 && res.corrupt === 0 && res.a + res.b === NG, `mock 전문 봇 vs 범용 Expert ${NG}판(선후공 교대, 같은 덱): 전문 ${res.a}승 ${res.b}패, 불법 ${res.illegal}, 교착 ${res.stall}, 손상 ${res.corrupt}`);
  let mr = { illegal: 0, stall: 0, corrupt: 0, done: 0 }; for (let g = 0; g < 2; g++) { const st = SP.playGame(800 + g, D1, D2, ['spec:mock_sp', 'spec:mock_sp'], g & 1); mr.illegal += st.illegal; if (st.stall) mr.stall++; if (st.corrupt) mr.corrupt++; if (st.winner != null) mr.done++; }
  ok(mr.illegal === 0 && mr.stall === 0 && mr.corrupt === 0 && mr.done === 2, `미러전(같은 전문 봇 양쪽) 2판: 불법 ${mr.illegal}, 교착 ${mr.stall}, 손상 ${mr.corrupt}`);
}

// ── 6) 방 통합: 서버 createRoom (고정 덱, 사람 덱만 선택) ─────────────────────────
(async () => {
  const C = require('../bot/controller.js'), B = require('./bot_baselines.js'), cards = DB;
  const mkRoom = (botId, first, m2 = {}) => { const rooms = {}, human = { readyState: 1, send() {} }, bc = R => { if (R.bot) R.bot.tick(); };
    const R = C.createRoom({ rooms, mkR: S.mkR, ready: S.ready, dispatch: S.dispatch, loadCards: () => ({ cards }), say: (R, t) => R.log.push(t), cl: x => x, ws: human, m: { t: 'createBot', first, bot: botId, ...m2 }, send: () => {}, bc });
    const dh = U.makeDeck(321), defs = {}; for (const id of [...new Set(dh.list), dh.partner, dh.kase]) defs[id] = cards[id]; const e = S.dispatch(R, 0, { t: 'ready', defs, list: dh.list, partner: dh.partner, kase: dh.kase }); if (e) throw new Error(e); return { R, rooms, bc }; };
  const { R, bc } = mkRoom('mock_sp', 'second', { botDeck: { cards: { bogus: 40 }, partner: 'x', kase: 'y' } }); // 클라이언트가 보낸 botDeck 은 전문 봇에서 무시
  const botCards = [...R.P[1].deck, ...R.P[1].hand].map(id => POL.keyOf(R, id)).sort().join(','), want = D1.list.slice().sort().join(',');
  ok(botCards === want && POL.keyOf(R, R.P[1].kase) === D1.kase && POL.keyOf(R, R.P[1].partner) === D1.partner, '전문 봇은 등록된 고정 덱을 사용 (클라이언트 덱 무시)'); ok(R.bot.name === 'Mock SP' && R.bot.specialist === 'mock_sp' && R.bot.cfg.specialist === 'mock_sp', '봇 이름/전문 봇 id 기록'); ok(R.first === 1, '후공 선택 → 봇이 선공');
  const h = B.heuristic(U.mulberry32(5)); let steps = 0; const T0 = Date.now(); bc(R);
  while (R.phase !== 'over' && Date.now() - T0 < 90000) { steps++; const d = SIM.who(R); if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; const e = S.dispatch(R, 0, mv.m); if (e) SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); bc(R); await new Promise(r => setImmediate(r)); } else await new Promise(r => setTimeout(r, 2)); }
  R.bot.stop(); ok(R.phase === 'over' && R.bot.illegal === 0, `전문 봇 대전이 끝까지 진행, 불법 행동 ${R.bot.illegal}건 (턴 ${R.n})`);
  const lg = R.bot.logMsg().log; ok(lg.botName === 'Mock SP' && lg.specialist === 'mock_sp' && lg.decisions.length > 5, `AI 기록에 전문 봇 이름/id 포함 (${lg.decisions.length}개 결정)`);
  const mains = lg.decisions.filter(x => x.kind === 'main' && x.snap); ok(mains.length > 3, `메인 결정마다 상태 스냅샷 기록 (${mains.length}개) — 실전 피드백 재현용`);
  const s1 = mains[Math.min(2, mains.length - 1)].snap, R2 = SN.restore(JSON.parse(JSON.stringify(s1)), cards, S); ok(R2.phase === 'play' && SIM.who(R2) && SIM.who(R2).kind === 'main', '기록의 스냅샷에서 게임 상태를 복원하고 그 시점의 결정을 다시 요청할 수 있음');
  throws(() => mkRoom('baddeck', 'first'), /올바르지 않습니다/, '사용 불가 전문 봇으로는 방을 만들 수 없음'); throws(() => mkRoom('nobot', 'first'), /등록되지 않은/, '없는 전문 봇 id 로는 방을 만들 수 없음');
  const g = mkRoom('expert', 'first', { botDeck: { cards: D2.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: D2.partner, kase: D2.kase } }); ok(g.R.bot.name === 'BOT / EXPERT' && !g.R.bot.specialist && g.R.bot.cfg.specialist === 'pro', '범용 Expert 방: 이름/덱 선택은 기존과 동일, v1.2.0 부터 PRO 전략 정책 사용 (봇 덱은 클라이언트가 선택)'); g.R.bot.stop(); { const gc = mkRoom('expert', 'first', { bot: 'classic', botDeck: { cards: D2.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: D2.partner, kase: D2.kase } }); ok(!gc.R.bot.cfg.specialist, 'bot:classic 은 이전 방식(정책 없음)'); gc.R.bot.stop(); }; g.R.bot.stop();
  const e2 = mkRoom('expert', 'first', { bot: undefined, botDeck: { cards: D2.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: D2.partner, kase: D2.kase } }); ok(e2.R.bot.name === 'BOT / EXPERT', 'bot 미지정(옛 클라이언트) = 범용 Expert'); e2.R.bot.stop();

  // ── 7) 스냅샷 → 회귀 케이스 러너 (mock 전문 봇) ──
  const SR = require('./specialist_regress.js'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cases-')); fs.mkdirSync(path.join(tmp, 'mock_sp'));
  fs.writeFileSync(path.join(tmp, 'mock_sp', '01_snapshot.js'), `module.exports={name:'스냅샷 케이스: 메인 결정이 합법적',snapshot:${JSON.stringify(s1)},expect(res,R,H,SIM){ if(!res.mv||!res.mv.tag) throw new Error('no move'); }};`);
  fs.writeFileSync(path.join(tmp, 'mock_sp', '02_setup.js'), `module.exports={name:'setup 케이스(합성 카드)',setup(H){ const defs={A:{n:'A',type:'char',color:'red',lv:'1',ap:'3000',lp:'1'}}; const R=H.game(defs); return R; },expect(res){ if(!res.mv) throw new Error('x'); }};`);
  fs.writeFileSync(path.join(tmp, 'mock_sp', '03_needs.js'), `module.exports={name:'DB 에 없는 카드가 필요한 케이스',needs:['id_9999'],setup(){throw new Error('실행되면 안 됨')},expect(){}};`);
  fs.writeFileSync(path.join(tmp, 'mock_sp', '04_fail.js'), `module.exports={name:'일부러 실패',setup(H){return H.game({A:{n:'A',type:'char',color:'red',lv:'1',ap:'1000',lp:'1'}})},expect(){throw new Error('expected failure')}};`);
  const origLog = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' ')); let rr; try { rr = SR.runSpecialist('mock_sp', cards, { dir: tmp }); } finally { console.log = origLog; }
  ok(rr.pass === 2 && rr.fail === 1 && rr.skip === 1, `회귀 러너: 통과 2 / 실패 1(의도) / DB 없어 건너뜀 1 (${rr.pass}/${rr.fail}/${rr.skip})`); ok(lines.some(l => /SKIP/.test(l) && /id_9999/.test(l)), '필요 카드가 DB 에 없으면 SKIP 으로 명시');
  // 전문 봇 정책을 붙인 범용 전술 케이스 (프로필이 기본 전술을 망치지 않는지)
  const RG = require('./bot_regress.js'); console.log = () => {}; let core; try { core = RG.runCases(RG.DIR, { spec: 'mock_sp' }); } finally { console.log = origLog; } ok(core.fail === 0 && core.pass >= 6, `전문 정책을 붙인 범용 전술 회귀 ${core.pass}개 통과 (리살/전투 계산/멀리건)`);
  console.log(fail ? `\n전문 봇 테스트 ${fail}건 실패` : `\n전문 봇 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
