// v1.5.0 Expert Knowledge Layer 테스트: node test/expert_test.js
//  1) 지식 베이스: 형식 검증·적용 범위(아키타입/매치업/선후공/봇)·오래된 환경 confidence 감소·카드 전용 지식의 global 금지·프로필 use/exclude/entries
//  2) 특징: turnsToSolve(내/상대 승리 턴)·winPly·FILE 요구치(nextTurn/lethal/defensive)·boardLeakRisk·futureCleanupValue·partnerDeduction vs assist·Action Economy
//  3) 평가: 엔진 스탯 일치(cstat)·반대칭·Σ 판단 요소 = 평가값(기본/PRO/전문/Knowledge)
//  4) 탐색: 소프트 pruning + 탐색 override·앞 행동 고정(prefix)·첫 행동이 다른 후보·넥스트 힌트 연속(8→7)
//  5) 멀리건(초동 실패 확률)·formation/lethal package·설명 로그·회귀 케이스 도구·AI 기록
process.env.BOT_DELAY_MS = '0'; process.env.BOT_THINK_MS = process.env.BOT_THINK_MS || '250'; process.env.BOT_MICRO_MS = '200';
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('./helpers.js'), U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), EV = require('../bot/evaluate.js');
const { decide } = require('../bot/decide.js'), { Searcher, priority } = require('../bot/search.js'), REG = require('../bot/specialists/registry.js'), POL = require('../bot/specialists/policy.js');
const KB = require('../bot/expert/knowledge.js'), F = require('../bot/expert/features.js'), LAYER = require('../bot/expert/layer.js'), MUL = require('../bot/expert/mulligan.js'), CS = require('../bot/expert/cases.js'), XP = require('../bot/expert/fx_profile.js'), PRO = require('../bot/pro.js');
const { S } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const run = (name, f) => { try { f(); } catch (e) { ok(false, name + ' — 예외: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); } };
const ch = (n, lv, ap, lp, e = {}) => ({ n, type: 'char', color: 'red', lv: String(lv), ap: String(ap), lp: String(lp), ...e });
const field = (R, s, k, st = 'a') => { const id = H.give(R, s, k, 'field'); R.cards[id].st = st; R.cards[id].sum = 0; return id; };
const clearHand = (R, s) => { R.P[s].deck.push(...R.P[s].hand); R.P[s].hand = []; };
const G = (defs, f) => SIM.withRng(42, () => { const R = H.game(defs); if (f) f(R, R.turn, 1 - R.turn); return R; });
const DB = U.db();

// ── 1) 지식 베이스 ─────────────────────────────────────────────
run('kb', () => {
  const kb = KB.reload(); ok(kb.problems.length === 0 && kb.entries.length >= 15, `지식 파일 로드: ${kb.entries.length}개 entry, 문제 ${kb.problems.length}건`);
  ok(kb.entries.every(e => e.source && e.env && e.date && e.archetype && e.matchup && e.side && typeof e.confidence === 'number'), '모든 entry 에 source·env·date·archetype·matchup·side·confidence 기록');
  const v = e => KB.validateEntry(e, { DB }).errors;
  const good = { id: 'x-test', title: 't', text: 't', source: 's', env: 'any', date: '2026-10-01', archetype: 'any', matchup: 'any', side: 'any', confidence: 0.5, effects: { features: { turnsToWin: 1 } } };
  ok(v(good).length === 0, '정상 entry 통과');
  ok(v({ ...good, source: undefined }).some(x => /source/.test(x)) && v({ ...good, date: '어제' }).some(x => /date/.test(x)) && v({ ...good, confidence: 2 }).some(x => /confidence/.test(x)), '출처/날짜/confidence 누락·오류 검출');
  ok(v({ ...good, effects: { features: { turnzToWin: 1 } } }).some(x => /알 수 없는 특징/.test(x)) && v({ ...good, effects: { priors: { fly: 1 } } }).some(x => /prior/.test(x)), '효과 이름 오타 검출');
  ok(v({ ...good, effects: { mulligan: { mulliganKeepGroups: [{ cards: ['id_0001'] }] } } }).some(x => /archetype 을 'any'/.test(x)), "특정 카드 ID 를 쓰는 지식은 archetype 'any'(전체 적용) 불가");
  ok(v({ ...good, archetype: { colors: ['green'], cards: ['id_9999'] } }).some(x => /DB 에 없는/.test(x)), '범위 조건의 카드 ID 를 DB 로 검증');
  // 범위: 녹단 지식은 녹색 단색 덱에만, 5FILE 진행은 최고 레벨 7 이하 녹단에만
  const green = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/deck_green.json'), 'utf8')), DF = require('../bot/specialists/deckfile.js'), gd = DF.parseDeckFile(JSON.stringify(green)).deck;
  const Rg = U.newGame(3, { list: gd.list, partner: gd.partner, kase: gd.kase }, U.makeDeck(1), { first: 0 }); const Rr = U.newGame(3, U.makeDeck(1), { list: gd.list, partner: gd.partner, kase: gd.kase }, { first: 0 });   // makeDeck(1) = 적색 덱
  const kg = KB.compile(KB.contextOf(Rg, 0, { bot: 'pro' })), kr = KB.compile(KB.contextOf(Rr, 0, { bot: 'pro' }));
  const has = (k, id) => k.applied.some(a => a.id === id), why = (k, id) => (k.skipped.find(s => s.id === id) || {}).why || '';
  ok(has(kg, 'sumomo-green-evidence-first') && !has(kr, 'sumomo-green-evidence-first'), `녹단 운영법은 녹색 단색 덱에만 적용 (다른 덱: "${why(kr, 'sumomo-green-evidence-first')}")`);
  ok(!has(kg, 'sumomo-5file-progress') && /레벨 ≤ 7/.test(why(kg, 'sumomo-5file-progress')), `8코 미채용 전용 지식은 레벨 8+ 를 쓰는 녹단에도 미적용 ("${why(kg, 'sumomo-5file-progress')}")`);
  const kSpec = KB.compile(KB.contextOf(Rg, 0, { bot: 'some_specialist' })); ok(has(kg, 'pro-v12-hint-timing') && !has(kSpec, 'pro-v12-hint-timing'), 'v1.2 PRO 규칙은 범용 Expert(pro)에만 (전문 봇 제외)');
  const s1 = kg.applied.find(a => a.id === 'kazamona-file-output'), u1 = kg.applied.find(a => a.id === 'user-turns-to-win'); ok(s1 && s1.stale && s1.conf < s1.baseConf * 0.5 && u1 && !u1.stale && u1.conf === u1.baseConf, `오래된 환경(2024-06) 지식은 confidence 자동 감소 (${s1 && s1.baseConf} → ${s1 && s1.conf}), 게임 구조 원칙(env any)은 그대로`);
  const side2 = KB.compile(KB.contextOf(Rg, 1, { bot: 'pro' }), { kb: { ...kb, entries: [{ ...good, id: 'only-first', side: 'first' }] } }); ok(side2.applied.length === 0 && /선공 전용/.test(side2.skipped[0].why), '선공 전용 지식은 후공 좌석에 미적용');
  const mu = KB.compile(KB.contextOf(Rg, 0, { bot: 'pro' }), { kb: { ...kb, entries: [{ ...good, id: 'vs-blue', matchup: { colors: ['blue'] } }] } }); const oppBlue = KB.contextOf(Rg, 0).opp.colors.includes('blue'); ok(oppBlue ? mu.applied.length === 1 : mu.applied.length === 0, `매치업 범위(상대 색) 매칭 (상대 ${KB.contextOf(Rg, 0).opp.colors.join('/')})`);
  const ex = KB.compile(KB.contextOf(Rg, 0, { bot: 'pro' }), { knowledge: { exclude: ['user-turns-to-win'], entries: [{ ...good, id: 'mine-1', confidence: 1, effects: { priors: { baitAttack: 5 } } }] } });
  ok(!has(ex, 'user-turns-to-win') && has(ex, 'mine-1') && ex.prior.baitAttack > 5, '프로필 knowledge.exclude / entries(이 봇 전용 지식)');
  ok(kg.feat.turnsToWin > 0.8 && kg.feat.evidenceTempo > 0.8 && kg.prior.multiZone > 0 && kg.prune.hintFileFloor && kg.prune.hintFileFloor.on, '적용된 지식 → 평가 특징 크기·prior·소프트 pruning 으로 컴파일');
});

// ── 2) 특징 ───────────────────────────────────────────────────
run('features', () => {
  // 해결편 + 증거 충분 + 파트너 액티브 → 지금 해결 가능(0턴)
  const R1 = G({}, (R, s) => { R.cards[R.P[s].kase].solved = true; while (R.P[s].evid.length < 3) R.P[s].evid.push(R.P[s].deck.pop()); });
  const s1 = R1.turn, A1 = F.side(R1, s1), B1 = F.side(R1, 1 - s1); ok(F.turnsToSolve(R1, A1, B1).t === 0 && F.winPly(A1, 0) === 0, 'turnsToSolve: 해결편+증거 충분 → 이번 턴(0)');
  // 해결편 아님, FILE 6 → 이번 턴 어시스트로 해결편, 다음 턴 해결
  const R2 = G({ A: ch('A', 3, 3000, 2) }, (R, s) => { H.fill(R, s, 6); field(R, s, 'A'); });
  const s2 = R2.turn, T2 = F.turnsToSolve(R2, F.side(R2, s2), F.side(R2, 1 - s2)); ok(T2.solvedAt === 0 && T2.t === 1, `turnsToSolve: FILE 6 → 이번 턴 해결편(어시스트), 다음 턴 해결 (solvedAt ${T2.solvedAt}, t ${T2.t})`);
  // FILE 이 부족하면 증거가 있어도 늦어진다 → lethalFileRequirement 부족분
  const R3 = G({ A: ch('A', 3, 3000, 3) }, (R, s) => { H.fill(R, s, 2); field(R, s, 'A'); while (R.P[s].evid.length < 3) R.P[s].evid.push(R.P[s].deck.pop()); });
  const s3 = R3.turn, X3 = F.side(R3, s3), Y3 = F.side(R3, 1 - s3), T3 = F.turnsToSolve(R3, X3, Y3), tE = F.turnsToSolve(R3, X3, Y3, { solved: true }).t, N3 = F.fileNeeds(R3, X3, { t: T3.t, tE });
  ok(T3.t > tE && N3.lethalCritical && N3.lethalFileRequirement > X3.fileLen, `FILE 이 승리 턴의 병목: 증거만 보면 ${tE}턴, 실제 ${T3.t}턴 · lethalFileRequirement ${N3.lethalFileRequirement} > FILE ${X3.fileLen}`);
  // 넥스트 힌트로 FILE 을 쓰면 다음 턴 핵심 카드(레벨 9)가 막힌다
  const R4 = G({ C9: ch('C9', 9, 10000, 2) }, (R, s) => { clearHand(R, s); H.give(R, s, 'C9', 'hand'); H.fill(R, s, 6); R.first = 1 - s; });
  const s4 = R4.turn, X4 = F.side(R4, s4), n0 = F.fileNeeds(R4, X4, { t: 3, tE: 3 }), n1 = F.fileNeeds(R4, { ...X4, fileLen: X4.fileLen - 1 }, { t: 3, tE: 3 });
  ok(n0.nextTurnFileRequirement === 9 && n0.shortNext === 0 && n1.shortNext === 1, `nextTurnFileRequirement: 손패 레벨 9 → FILE 6 이면 다음 턴(8+어시스트) 가능, 힌트로 5 가 되면 부족 1`);
  // boardLeakRisk: 상대 턴에 상대 공격자가 내 슬립 캐릭터를 잡을 수 있으면 > 0
  const R5 = G({ BIG: ch('BIG', 7, 8000, 1), L: ch('L', 2, 2000, 1) }, (R, s, o) => { field(R, o, 'BIG'); field(R, s, 'L', 's'); R.turn = o; });
  const o5 = R5.turn, leak = F.threat(R5, F.side(R5, o5), F.side(R5, 1 - o5), 2.2); ok(leak > 0.5, `boardLeakRisk: 상대 AP8000 이 내 슬립 AP2000 을 노림 → ${leak.toFixed(2)}`);
  // futureCleanupValue: 다음 턴 쓸 수 있는 전체 제거가 손패에 있으면 상대 캐릭터 2장 이상은 '처리 예정'
  const M = { n: 'M', type: 'event', color: 'red', lv: '5', ab: [{ ic: 'event', ops: [{ op: 'select', all: true, do: 'remove', filter: { own: 'opp' } }] }] };
  const R6 = G({ M, X1: ch('X1', 1, 1000, 1), X2: ch('X2', 2, 2000, 1) }, (R, s, o) => { clearHand(R, s); H.give(R, s, 'M', 'hand'); H.fill(R, s, 4); field(R, o, 'X1', 's'); field(R, o, 'X2', 's'); });
  const s6 = R6.turn, cl = EV.memo(R6, () => F.cleanup(R6, F.side(R6, s6), F.side(R6, 1 - s6))); ok(cl > 1 && XP.card(R6.defs[R6.cards[R6.P[s6].hand[0]].d]).mass >= 2, `futureCleanupValue: 다면 제거(전체) 보유 → 상대 2장 가치 ${cl.toFixed(2)} 를 '처리 예정'으로`);
  // 파트너 추리 vs 어시스트
  const pa = F.partnerAssist(R2, F.side(R2, s2), F.side(R2, 1 - s2), 2.2); ok(pa.available && pa.assistValue > pa.partnerDeductionValue && pa.assistWhy.includes('해결편 이행'), `FILE 6: assistValue ${pa.assistValue} > partnerDeductionValue ${pa.partnerDeductionValue} (해결편 이행)`);
  const R7 = G({}, (R, s) => { H.fill(R, s, 2); }), s7 = R7.turn, pb = F.partnerAssist(R7, F.side(R7, s7), F.side(R7, 1 - s7), 2.2); ok(pb.partnerDeductionValue > pb.assistValue && pb.assistOpportunityCost === pb.partnerDeductionValue, `어시스트로 얻는 것이 없으면 partnerDeductionValue ${pb.partnerDeductionValue} > assistValue ${pb.assistValue} (기회비용 = 추리 가치)`);
  // Action Economy: 등장 + 제거 + 증거 = 3영역
  const Y = ch('Y', 3, 3000, 1, { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'remove', filter: { own: 'opp' } }, { op: 'gain', n: 1 }] }] });
  const R8 = G({ Y, Z: ch('Z', 2, 2000, 1) }, (R, s, o) => { clearHand(R, s); H.give(R, s, 'Y', 'hand'); H.fill(R, s, 4); field(R, o, 'Z', 's'); }), s8 = R8.turn, R8b = SIM.clone(R8);
  const yid = R8.P[s8].hand[0]; ok(XP.playZones(R8.defs[R8.cards[yid].d]).zones === 3, '효과 구조 → 예상 영향 영역 3개 (전개·제거·증거)');
  const e8 = SIM.withRng(1, () => { const e = S.dispatch(R8b, s8, { t: 'act', a: 'play', id: yid }); let g = 0; while (R8b.eff && g++ < 5) { const ms = SIM.genMoves(R8b, () => 0), mv = ms.find(m => Array.isArray(m.m.v) && m.m.v.length) || ms[0]; S.dispatch(R8b, mv.seat, mv.m); } return e; });
  const tr = F.transition(R8, R8b, s8); ok(!e8 && tr.zonesAffected >= 3 && tr.cardsSpent === 1 && tr.removalGenerated === 1 && tr.evidenceGenerated === 1 && tr.boardCreated === 1, `transition: ${JSON.stringify(tr)}`);
  const pol8 = REG.policyFor('pro', s8, R8), plain = SIM.genMoves(R8, () => 0).find(m => m.tag === 'play'); ok(pol8.priorOf(R8, plain) > 0 && pol8.lineBonus(R8, R8b, plain, s8).v > 0, '다면 플레이: 행동 prior(탐색 순서) + 라인 Action Economy 가산');
});

// ── 3) 평가 ───────────────────────────────────────────────────
run('eval', () => {
  const states = []; for (let g = 1; g <= 4; g++) { const R = U.newGame(g, U.makeDeck(g * 3 + 1), U.makeDeck(g * 3 + 2), { first: g & 1 }), h = B.heuristic(U.mulberry32(g)); let st = 0;
    SIM.withRng(g, () => { while (R.phase !== 'over' && st++ < 500) { const d = SIM.who(R); if (d.kind === 'main' && SIM.cloneable(R) && st % 7 === 0) states.push(SIM.clone(R)); const mv = h(R, d.seat); S.dispatch(R, mv.seat, mv.m); } }); }
  let statBad = 0, n = 0; for (const R of states) for (const id of [...R.P[0].field, ...R.P[1].field]) { n++; const x = EV.cstat(R, id); if (x.ap !== S.ap(R, id) || x.lp !== S.lpOf(R, id) || JSON.stringify(x.t) !== JSON.stringify(S.tk(R, id))) statBad++; for (const w of ['cantreason', 'cantguard', 'sleepguard', 'cantact']) if (EV.hasKw(R, id, w) !== S.FX.hasKwTk(R, id, w)) statBad++; }
  ok(statBad === 0 && n > 20, `엔진 스탯 일치: 캐릭터 ${n}개의 AP/LP/키워드가 엔진(ap/lpOf/tk/hasKwTk)과 동일 (불일치 ${statBad})`);
  let anti = 0, sum = 0, cnt = 0; const pols = ['pro', 'pro_v12'];
  for (const R of states) for (const kind of pols) { const pol = REG.policyFor(kind, R.turn, R); cnt++;
    const a = EV.evaluate(R, 0, pol), b = EV.evaluate(R, 1, pol); if (Math.abs(a + b) > 1e-6) anti++;
    const p = EV.evalParts(R, R.turn, pol), v = EV.evaluate(R, R.turn, pol); if (Math.abs(p.total - v) > 1e-6) sum++; }
  ok(anti === 0, `반대칭 evaluate(R,0) == -evaluate(R,1) (Knowledge 포함, ${cnt}개 상태·정책)`); ok(sum === 0, `설명 분해: Σ 판단 요소 = 평가값 (${cnt}개, 불일치 ${sum})`);
  const R = states[3], spec = { id: 'tsp', profile: { cards: { [H.key(R, R.P[R.turn].hand[0] || R.P[R.turn].deck[0])]: { hand: 2 } }, file: { perCard: 0.3 } } }, sp = POL.buildPolicy(spec, { seat: R.turn, R }), lp = LAYER.attach(sp, { seat: R.turn, R, bot: 'tsp', profile: spec.profile });
  ok(Math.abs(EV.evalParts(R, R.turn, sp).total - EV.evaluate(R, R.turn, sp)) < 1e-6 && Math.abs(EV.evalParts(R, R.turn, lp).total - EV.evaluate(R, R.turn, lp)) < 1e-6, '전문 봇 정책(+Knowledge)도 Σ 판단 요소 = 평가값');
  const ps = EV.evalParts(R, R.turn, REG.policyFor('pro', R.turn, R)); ok(['expert:turnsToWin', 'expert:oppTurnsToWin', 'expert:evidenceTempo', 'base:oppBoard(=boardRemovalValue)'].every(t => t in ps.terms), '판단 요소 세부 항목: turnsToWin / oppTurnsToWin / evidenceTempo / boardRemovalValue …');
});

// ── 4) 탐색: 소프트 pruning + override / prefix / 넥스트 힌트 연속 ─────────────
run('search', () => {
  // 지금 낼 수 있는 캐릭터가 '손패 5장 버리기' 등장 효과뿐(다음 턴에 낼 강한 레벨 3 카드 5장을 잃음) → PRO 규칙(매 턴 캐릭터 1장)은 턴 종료를 미루지만, 탐색이 더 좋다고 검증하면 뒤집는다
  const BAD = ch('BAD', 1, 1000, 0, { ab: [{ ic: 'onplay', ops: [{ op: 'discard', n: 5, who: 'self' }] }] }), KS = ['K1', 'K2', 'K3', 'K4', 'K5'], kd = {}; for (const k of KS) kd[k] = ch(k, 3, 9000, 2);
  const mk = () => G({ BAD, ...kd }, (R, s) => { clearHand(R, s); for (const k of ['BAD', ...KS]) H.give(R, s, k, 'hand'); H.fill(R, s, 2); R.cards[R.P[s].partner].st = 's'; R.fl.nh = 1; });
  const R = mk(), s = R.turn, pol = REG.policyFor('pro', s, R), moves = SIM.genMoves(R, () => 0), end = moves.find(m => m.tag === 'end');
  ok(pol.prune(R, end, moves) === 'pro-v12-char-every-turn', '소프트 pruning 근거 = knowledge entry id (pro-v12-char-every-turn)');
  const r = decide({ R, seat: s, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 3000, seed: 3 } }, new Searcher({ seed: 3, policy: pol }));
  ok(r.mv.tag === 'end' && r.info.overrides && r.info.overrides[0].why === 'pro-v12-char-every-turn', `탐색이 지식을 이김: 손패 5장을 버리게 하는 캐릭터 대신 턴 종료 (override 이득 ${r.info.overrides && r.info.overrides[0].gain} > 필요 차이 1.5 + 4×confidence)`);
  const rv = decide({ R: mk(), seat: s, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 3000, seed: 3 } }, new Searcher({ seed: 3, policy: PRO.policy(s, mk()) })); ok(rv.mv.tag === 'play', `(비교) v1.2 PRO 의 강제 금지(ban)는 뒤집지 못함 → ${rv.mv.tag}`);
  ok(r.info.explain && r.info.explain.overrides.length === 1 && r.info.explain.pruned.length >= 1, '설명 로그에 미룬 행동/override 기록');
  // prefix: 앞 행동 고정
  const R2 = G({ C8: ch('C8', 8, 8000, 1), C7: ch('C7', 7, 7000, 1) }, (R, s) => { clearHand(R, s); H.give(R, s, 'C8', 'hand'); H.give(R, s, 'C7', 'hand'); H.fill(R, s, 8); });
  const s2 = R2.turn, sr = new Searcher({ seed: 3, policy: REG.policyFor('pro', s2, R2) }); sr.maxNodes = 4000; const root = SIM.determinize(SIM.clone(R2), 5);
  const res = sr.planTurn(root, s2, { prefix: [m => m.tag === 'play' && H.key(R2, m.m.id) === 'C8', m => m.tag === 'hint'], noOverride: true }); const tags = res.best.line.map(l => l.mv.tag);
  ok(tags[0] === 'play' && tags[1] === 'hint', `prefix 고정 라인: ${tags.join(' → ')}`);
  // 넥스트 힌트: 손패 사용 뒤에도 후보(엔진·사람 UI 와 같은 조건) → FILE 8 에서 8→7 연속
  const R3 = SIM.clone(R2); SIM.withRng(2, () => S.dispatch(R3, s2, { t: 'act', a: 'play', id: R3.P[s2].hand.find(id => H.key(R3, id) === 'C8') })); const mv3 = SIM.genMoves(R3, () => 0);
  ok(mv3.some(m => m.tag === 'hint') && !S.dispatch(SIM.clone(R3), s2, { t: 'act', a: 'hint' }), '손패 사용 뒤 넥스트 힌트도 후보 (엔진이 허용)');
  const r3 = decide({ R: R2, seat: s2, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 5000, seed: 3 } }, new Searcher({ seed: 3, policy: REG.policyFor('pro', s2, R2) })); const ld = (r3.info.lineDesc || []).join(' → ');
  ok(/사용: C8/.test(ld) && /넥스트 힌트/.test(ld) && ld.indexOf('사용: C8') < ld.indexOf('넥스트 힌트'), `FILE 8: 레벨 8 사용 → 넥스트 힌트(레벨 7) 라인: ${ld}`);
  // 후보 목록: 첫 행동이 서로 다른 최선 라인들
  const firsts = (r3.info.explain.candidates || []).map(c => c.first); ok(new Set(firsts).size === firsts.length && firsts.length >= 2, `설명 후보는 첫 행동이 서로 다름: ${firsts.join(' / ')}`);
});

// ── 5) 멀리건 ─────────────────────────────────────────────────
run('mulligan', () => {
  const mk = (hand, first) => SIM.withRng(42, () => { const R = S.mkR('M'); R.firstPref = first ? 0 : 1; const d = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } }, l = [];
    for (let lv = 0; lv <= 9; lv++) { d['c' + lv] = ch('C' + lv, lv, 1000 + lv * 1000, 1); d['e' + lv] = ch('E' + lv, lv, 1000 + lv * 1000, 1); for (let i = 0; i < 3; i++) l.push('c' + lv); l.push('e' + lv); }
    for (let s = 0; s < 2; s++) { const e = S.ready(R, s, { defs: d, list: l, partner: 'p', kase: 'k' }); if (e) throw new Error(e); }
    const P = R.P[R.mullSeat], all = P.hand.concat(P.deck); P.hand = []; P.deck = all; for (const k of hand) { const i = P.deck.findIndex(id => H.key(R, id) === k); P.hand.push(P.deck.splice(i, 1)[0]); } return R; });
  const dm = (R, pol) => decide({ R, seat: R.mullSeat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 100, seed: 3 } }, new Searcher({ seed: 3, policy: pol }));
  const R1 = mk(['c1', 'c3', 'c5', 'c7', 'c9'], true), r1 = dm(R1, REG.policyFor('pro', R1.mullSeat, R1)), k1 = r1.mv.m.ids.map(id => H.key(R1, id));
  ok(k1.join() === 'c9' && r1.info.mulligan && r1.info.mulligan.chosen.curveFailProb.length === 4, `선공 [1,3,5,7,9] → 9 만 교체 (초동 실패 확률 ${JSON.stringify(r1.info.mulligan && r1.info.mulligan.chosen.curveFailProb)})`);
  const R2 = mk(['c2', 'c4', 'c6', 'c8', 'c9'], false), r2 = dm(R2, REG.policyFor('pro', R2.mullSeat, R2)), k2 = r2.mv.m.ids.map(id => H.key(R2, id)); ok(!k2.some(k => ['c2', 'c4', 'c6', 'c8'].includes(k)), `후공 [2,4,6,8,9] → 곡선 유지, 교체 ${k2.join(',') || '없음'}`);
  const R3 = mk(['c6', 'c6', 'e6', 'c6', 'c5'], true), a3 = MUL.choose(R3, R3.mullSeat, { plan: {} }), a3b = MUL.choose(R3, R3.mullSeat, { plan: { curveFailurePenalty: 0 } });
  ok(a3.ids.length >= a3b.ids.length && a3.analysis.keepAll.curveFailProb[0] > 0.3, `초동 실패(1턴 낼 카드 없음 확률 ${a3.analysis.keepAll.curveFailProb[0]})가 클수록 더 많이 교체 (기본 벌점: ${a3.ids.length}장 / 벌점 0: ${a3b.ids.length}장)`);
  const a4 = MUL.choose(R1, R1.mullSeat, { plan: { requiredEarlyPlays: [{ turn: 1, type: 'char', lvMax: 0, penalty: 6 }] } }); ok(a4.ids.length > 1, `requiredEarlyPlays(1턴 레벨 0 필수) → 레벨 0 을 찾아 더 교체 (${a4.ids.map(id => H.key(R1, id)).join(',')})`);
  const a5 = MUL.choose(R3, R3.mullSeat, { plan: { mulliganKeepGroups: [{ name: '레벨 6 넷', filter: { type: 'char', lvMin: 6, lvMax: 6 }, min: 4, bonus: 0, force: true }] } }); ok(a5.ids.every(id => H.key(R3, id) === 'c5'), `mulliganKeepGroups force: 그룹(레벨 6 ×4)이 충족되면 그 카드는 교체하지 않음 (교체 ${a5.ids.map(id => H.key(R3, id)).join(',') || '없음'})`);
});

// ── 6) formation / lethal package (전문 봇 프로필) ─────────────────
run('formation', () => {
  const defs = { A: ch('A', 2, 3000, 1), B: ch('B', 3, 4000, 1), F: ch('F', 5, 6000, 1), N1: ch('N1', 1, 1000, 1), N2: ch('N2', 1, 1000, 1), N3: ch('N3', 1, 1000, 1) };
  const R = G(defs, (R, s) => { clearHand(R, s); for (const k of ['A', 'B', 'N1', 'N2', 'N3']) field(R, s, k); H.give(R, s, 'F', 'hand'); H.fill(R, s, 5); }), s = R.turn;
  const profile = { formation: { name: '중반 필드', field: [{ cards: ['A'], n: 1 }, { cards: ['B'], n: 1 }], hand: [{ cards: ['F'], n: 1 }], file: 5, weight: 3, completeBonus: 2 }, lethal: { packages: [{ name: 'F 리살', field: [{ cards: ['A'] }], hand: [{ cards: ['F'] }], file: 7, evidence: 2, sequence: ['사용: F', '공격 → 해결'], bonus: 2 }] } };
  const pv = POL.validateProfile(profile, {}); ok(pv.errors.length === 0, '프로필 formation / lethal.packages 검증 통과');
  ok(POL.validateProfile({ formation: { field: [{ nope: 1 }] } }, {}).errors.length > 0 && POL.validateProfile({ requiredEarlyPlays: [{ turn: 'x' }] }, {}).errors.length > 0 && POL.validateProfile({ firstPlayerPlan: { bogus: 1 } }, {}).errors.length > 0, '잘못된 formation/requiredEarlyPlays/선후공 계획 검출');
  const spec = { id: 'ftest', profile }, pol = LAYER.attach(POL.buildPolicy(spec, { seat: s, R }), { seat: s, R, bot: 'ftest', profile }), st = pol.formationState(R);
  ok(st.formation.fieldProgress === 1 && st.formation.comboPiecesReady === 1 && st.packages[0].ready > 0.6 && st.packages[0].ready < 1, `setup/formation progress ${st.formation.progress.toFixed(2)}, combo pieces ready 1, lethal package ready ${st.packages[0].ready.toFixed(2)}`);
  const p = EV.evalParts(R, s, pol); ok(p.terms['expert:formationProgress'] > 3 && p.cat.formation > 3, `formation 완성 → 평가 '콤보/포메이션 진행' ${p.cat.formation.toFixed(2)}`);
  const sw = SIM.genMoves(R, () => 0).filter(m => m.tag === 'play' && m.m.rep != null), brk = sw.find(m => H.key(R, m.m.rep) === 'A'), keep = sw.find(m => H.key(R, m.m.rep) === 'N1');
  ok(brk && keep && priority(R, brk, pol) < priority(R, keep, pol), 'formation 캐릭터를 스위치로 빼는 플레이는 탐색 순서에서 뒤로 (formationBreak prior)');
  const Rb = SIM.clone(R); SIM.withRng(3, () => S.dispatch(Rb, s, { t: 'act', a: 'play', id: brk.m.id, rep: brk.m.rep })); ok(EV.evaluate(Rb, s, pol) - EV.evaluate(R, s, pol) < EV.evaluate(Rb, s, POL.buildPolicy(spec, { seat: s, R: Rb })) - EV.evaluate(R, s, POL.buildPolicy(spec, { seat: s, R })), 'formation 을 깨면 Knowledge 평가가 추가로 감점 (현재 점수만 올리는 플레이 방지)');
  const an = pol.analyze(R); ok(an.formation && an.lethalPackages[0].sequence.length === 2, 'analyze: formation / lethal package(리살 순서 포함) 보고');
  // 예시 전문 봇 프로필(실제 카드 ID, deck_green): DB 로 검증 + Knowledge 적용(녹단 지식·프로필 전용 지식) + formation 계산
  const EXP = require('../bot/specialists/_example_green.js'), DF = require('../bot/specialists/deckfile.js'), gd = DF.parseDeckFile(fs.readFileSync(path.join(__dirname, 'fixtures/deck_green.json'), 'utf8')).deck;
  const ev = POL.validateProfile(EXP.profile, { DB, deckCards: [...new Set(gd.list), gd.kase, gd.partner] }); ok(ev.errors.length === 0, `예시 녹단 프로필(_example_green.js) 검증 통과 ${ev.errors.slice(0, 2).join(' / ')}`);
  const Rg = U.newGame(9, { list: gd.list, partner: gd.partner, kase: gd.kase }, U.makeDeck(1), { first: 0 }); for (let i = 0; i < 2; i++) S.act(Rg, Rg.mullSeat, { a: 'mull', ids: [] });
  const pg = LAYER.attach(POL.buildPolicy({ id: 'example_green', profile: EXP.profile }, { seat: 0, R: Rg }), { seat: 0, R: Rg, bot: 'example_green', profile: EXP.profile });
  const ids = pg.knowledge.applied.map(a => a.id); ok(ids.includes('example-green-keep-formation') && ids.includes('sumomo-green-mulligan-2cost') && !ids.includes('pro-v12-hint-timing'), `예시 녹단 봇: 프로필 전용 지식 + 녹단 지식 적용, PRO 전용 규칙 제외 (${ids.length}개)`);
  ok(pg.formationState(Rg).formation && Number.isFinite(EV.evaluate(Rg, 0, pg)) && Math.abs(EV.evaluate(Rg, 0, pg) + EV.evaluate(Rg, 1, pg)) < 1e-6, '예시 녹단 봇: formation 계산 + 평가 반대칭');
});

// ── 7) 설명 로그 / 회귀 케이스 도구 / AI 기록 ──────────────────────
run('explain+cases', () => {
  const R = G({ A: ch('A', 5, 5000, 2), X: ch('X', 1, 1000, 1) }, (R, s, o) => { clearHand(R, s); H.fill(R, s, 4); field(R, s, 'A'); field(R, o, 'X', 's'); }), s = R.turn, pol = REG.policyFor('pro', s, R);
  const r = decide({ R, seat: s, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 3000, seed: 3 } }, new Searcher({ seed: 3, policy: pol })), ex = r.info.explain;
  const KEYS = ['evidenceTempo', 'boardValue', 'filePreservation', 'lethalDistance', 'oppLethalThreat', 'actionEconomy', 'formation', 'handQuality', 'other', 'search'];
  ok(ex && ex.candidates.length >= 2 && ex.candidates.every(c => c.factors && KEYS.every(k => k in c.factors)), `후보마다 판단 요소 ${KEYS.length}개 분해 (${ex && ex.candidates.length}개 후보)`);
  const root = EV.evaluate(SIM.determinize(SIM.clone(R), 0), s, pol), c0 = ex.candidates[0], sumF = KEYS.reduce((a, k) => a + c0.factors[k], 0); ok(Math.abs(sumF - (c0.value - root)) < 0.1, `Σ 요소(${sumF.toFixed(2)}) = 후보 값 − 현재 평가 (${(c0.value - root).toFixed(2)})`);
  ok(typeof ex.why === 'string' && /고른 이유/.test(ex.why) && ex.candidates.some(c => c.vsChosen), `선택 이유 문장 + 후보별 ★ 대비 차이: ${ex.why}`);
  ok(ex.now && 'myTurnsToWin' in ex.now && ex.now.partner && ex.defense && ex.defense.opp, '현재 상태 특징(승리 턴·FILE 요구·파트너/어시스트) + 상대 방어 자원(Perfect Information)');
  const atk = ex.candidates.find(c => /공격/.test(c.first)); ok(atk && atk.steps.some(st => st.responses && st.responses.length), '시퀀스: 공격 → 상대 응수(가드/컨택트) 기록');
  // 회귀 케이스 도구: 간이 상태(state, 실제 카드 ID) → 스냅샷 → 후보 판정
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/deck_green.json'), 'utf8'));
  const st = { first: 0, turn: 0, n: 7, P: [{ deck: 'test/fixtures/deck_green.json', hand: ['id_0419'], field: [{ k: 'id_0861', st: 'a' }], file: 6, evid: 2, partner: g.partner, kase: g.case }, { deck: 'test/fixtures/deck_green.json', field: [{ k: 'id_0404', st: 's' }], file: 5, evid: 1, partner: g.partner, kase: g.case }] };
  const snap = CS.liteToSnapshot(st, DB, path.join(__dirname, '..')), Rs = require('../bot/snapshot.js').restore(snap, DB, S);
  ok(Rs.P[0].file.length === 6 && Rs.P[0].evid.length === 2 && Rs.P[1].field.length === 1 && [...Rs.P[0].deck, ...Rs.P[0].hand, ...Rs.P[0].file, ...Rs.P[0].evid, ...Rs.P[0].field].length === 40, '간이 상태 → 40장 스냅샷 복원 (FILE/증거 장수만 써도 됨)');
  const jr = CS.judge(Rs, 0, { candidates: { A: 'reason:id_0861', B: 'attack:id_0861>id_0404' }, expert: 'A', budget: { maxNodes: 2500 } }, { policy: REG.policyFor('pro', 0, Rs) });
  ok(Object.keys(jr.values).length === 2 && jr.lines.A.startsWith('추리') && jr.lines.B.startsWith('공격') && jr.factors.A, `후보 A/B 를 같은 예산으로 탐색해 값 비교 (A ${jr.values.A} / B ${jr.values.B})`);
  let threw = ''; try { CS.judge(Rs, 0, { candidates: { A: 'reason:id_9999', B: 'end' }, expert: 'A' }, { policy: null }); } catch (e) { threw = e.message; } ok(/합법 수에서 찾지 못함/.test(threw), '없는 행동을 후보로 쓰면 합법 수 목록과 함께 오류');
  ok(CS.validateCase({ name: 'x', candidates: { A: 'end', B: 'hint' }, expert: 'A', state: {} }).some(e => /reason/.test(e)), '회귀 케이스는 고수의 선택 이유(reason) 필수');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-')), sf = path.join(tmp, 'state.json'); fs.writeFileSync(sf, JSON.stringify(st));
  const out = require('child_process').execFileSync(process.execPath, [path.join(__dirname, '../bot/expert/cli.js'), 'case', 'add', '--state', sf, '--a', 'reason:id_0861', '--b', '공격: 服部平次 → 服部平次', '--expert', 'A', '--reason', '테스트', '--dir', tmp, '--name', '테스트 케이스'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  const files = fs.readdirSync(tmp).filter(f => /^001_.*\.json$/.test(f)); ok(files.length === 1 && /케이스 저장/.test(out) && JSON.parse(fs.readFileSync(path.join(tmp, files[0]), 'utf8')).reason === '테스트', `CLI case add → ${files[0]} (${out.split('\n')[1]})`);
});

(async () => {
  try { // AI 기록: knowledge 적용 목록 + 결정별 설명
    const RT = require('./bot_room_test.js'), r = await RT.play(31, 'second'), lg = r.R.bot.logMsg().log;
    ok(lg.knowledge && lg.knowledge.applied.length > 5 && lg.knowledge.applied.every(a => a.source && a.conf > 0), `AI 기록 상단: 적용된 지식 ${lg.knowledge && lg.knowledge.applied.length}개 (출처·confidence 포함), 제외 ${lg.knowledge && lg.knowledge.skipped.length}개`);
    const withEx = lg.decisions.filter(d => d.explain && d.explain.candidates); ok(withEx.length > 2 && withEx.every(d => d.explain.candidates[0].factors), `메인 결정 ${withEx.length}개에 후보별 판단 요소 분해 기록`);
    ok(lg.decisions.some(d => d.mulligan && d.mulligan.chosen), 'AI 기록: 멀리건 결정에 초동 실패 확률 분석'); ok(r.R.bot.illegal === 0 && r.R.phase === 'over', `Knowledge 봇 대전 종료, 불법 행동 ${r.R.bot.illegal}건`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-')), lf = path.join(tmp, 'log.json'); fs.writeFileSync(lf, JSON.stringify(lg)); const n = withEx[0].n;
    const out = require('child_process').execFileSync(process.execPath, [path.join(__dirname, '../bot/expert/cli.js'), 'why', '--log', lf, '--n', String(n)], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    ok(/증거 템포|보드 가치/.test(out) && /★/.test(out), `CLI why: 기록의 결정 #${n} 설명 출력`);
  } catch (e) { ok(false, 'AI 기록 — 예외: ' + (e.stack || e)); }
  console.log(fail ? `\nExpert Knowledge 테스트 ${fail}건 실패 (통과 ${pass})` : `\nExpert Knowledge 테스트 통과 (${pass}개)`); process.exit(fail ? 1 : 0);
})();
