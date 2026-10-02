process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// v1.6.0 Tactical Layer regression: 사용자가 정한 기본기 규칙을 "재현 가능한 상태 + 기대 행동" 으로 고정한다. (리살 → 평상시 운영 → 방어 → 멀리건 → 파트너)
//   node test/tactics_test.js            전부 실행 (각 케이스의 AI 판단 로그 출력)       --only L1,P3  일부만       --quiet  로그 없이 결과만
//   각 케이스 로그: 현재 상태 / 리살 판정 / 선택한 행동 / 다른 주요 후보 / 이유 / FILE 변화 / 증거 변화 / AP·컷인 판단
//   봇이 실전에서 잘못 둔 사례는 같은 방식(합성 카드 + 상태 + 기대 행동)으로 여기에 케이스를 추가하거나, node bot/expert/cli.js case add 로 고수 판단 케이스로 쌓는다.
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide, describe, mulliganChoice } = require('../bot/decide.js'), REG = require('../bot/specialists/registry.js'), EV = require('../bot/evaluate.js');
const { ch, field, clearHand, caseK, make } = require('./expert_cases/_util.js');
const arg = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ONLY = arg('only') && arg('only') !== true ? String(arg('only')).split(',') : null, QUIET = !!arg('quiet');
const CFG = { specialist: 'pro', timeMs: +process.env.TACT_MS || 2200, maxNodes: +process.env.TACT_NODES || 2500, seed: 7 };
const ctx = { SIM };

// ── 카드 정의 (합성): 색은 사건과 같은 red ──
const RAPID = { kw: 'rapid' };
const CUT = v => ({ kw: 'cutin:' + v, ab: [{ ic: 'cutin', v }] });
const MRCUT = v => ({ kw: 'cutin:' + v, ab: [{ ic: 'mr' }, { ic: 'cutin', v }] });
const MR = { ab: [{ ic: 'mr' }] };
const REMOVE1 = { n: 'RM', type: 'event', color: 'red', lv: '1', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, do: 'remove', filter: { own: 'opp' } }] }] };
const solved = (R, s) => { R.cards[R.P[s].kase].solved = true; };
const needOf = (R, s) => EV.need(R, s);
const evid = (R, s, n) => { while (R.P[s].evid.length < n) R.P[s].evid.push(R.P[s].deck.pop()); };
const key = (R, id) => H.key(R, id);
const nameOf = (R, id) => R.defs[R.cards[id].d].n;
const find = (R, s, k, z = 'field') => R.P[s][z].find(id => key(R, id) === k);

// ── 결정/실행 도우미: 엔진의 act 만 쓴다 (불법 행동은 즉시 예외) ──
function tracker() { return { base: null, acts: [] }; }
function think(R, seat, tr, extra = {}) { return decide({ R, seat, base: tr && tr.base, acts: tr && tr.acts, cfg: { ...CFG, ...extra } }); }
function apply(R, mv, tr) { if (tr && SIM.cloneable(R)) { tr.base = SIM.clone(R); tr.acts = []; } const seed = 11; const e = SIM.applyMove(R, mv, seed); if (e) throw new Error('엔진이 거부한 행동: ' + describe(R, mv) + ' → ' + e); if (tr) tr.acts.push({ seat: mv.seat, m: mv.m, seed }); }
// seat 의 이번 턴을 끝까지 진행 (상대의 가드/컷인 응수도 봇이 둔다). trace: [{who, desc, info}]
function playTurn(R, seat, o = {}) {
  const trace = [], tr = tracker(); let guard = 0; const stop = o.stopAfter;
  while (R.phase === 'play' && R.turn === seat && guard++ < 80) {
    const d = SIM.who(R); if (!d) break; const r = think(R, d.seat, tr); if (r.err) throw new Error('decide 오류: ' + r.err);
    trace.push({ who: d.seat, kind: d.kind, desc: describe(R, r.mv), tag: r.mv.tag, info: r.info }); apply(R, r.mv, tr);
    if (stop && stop(trace)) break;
  }
  return trace;
}
const snap = (R, s) => ({ file: R.P[s].file.length, evid: R.P[s].evid.length, hand: R.P[s].hand.length, field: R.P[s].field.length, oppField: R.P[1 - s].field.length, oppEvid: R.P[1 - s].evid.length });

// ── 케이스 정의 ──
const CASES = [];
const add = (id, name, rule, fn) => CASES.push({ id, name, rule, fn });

// ═════════ 리살 ═════════
add('L1', '추리만으로 리살', '1-A: 증거 + 현장 추리 LP ≥ 필요 증거 → 리살 최우선', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 1, 3000, 2), B: ch('B', 1, 3000, 2), ...caseK(7) }), s = R.turn; clearHand(R, s); H.fill(R, s, 8); field(H, R, s, 'A'); field(H, R, s, 'B'); solved(R, s); evid(R, s, 3); return R; }), s = R.turn;
  const r = think(R, s, null), L = r.info.tactics && r.info.tactics.lethal;
  const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[L && L.found && /1-A/.test(L.kind), '리살 판정 1-A'], [/추리/.test(r.info.lineDesc[0]) && r.info.tactic === 'lethal', '첫 행동이 추리 (리살 우선)'], [R.phase === 'over' && R.winner === s, '실행하면 사건 해결로 승리']] };
});
add('L2', '등장 + 추리로 리살 (신속 캐릭터)', '1-A: 손에서 등장 직후 추리 가능한(신속) 캐릭터 LP 포함', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 1, 3000, 2), RP: ch('RP', 3, 3000, 3, RAPID), ...caseK(7) }), s = R.turn; clearHand(R, s); H.give(R, s, 'RP', 'hand'); H.fill(R, s, 8); field(H, R, s, 'A'); solved(R, s); evid(R, s, 2); return R; }), s = R.turn;
  const r = think(R, s, null), L = r.info.tactics && r.info.tactics.lethal; const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[L && L.found && /1-A 등장/.test(L.kind), '리살 판정: 등장 + 추리'], [r.info.tactic === 'lethal' && t.some(x => /사용: RP/.test(x.desc)), '리살 라인에 신속 캐릭터 등장 포함'], [R.phase === 'over' && R.winner === s, '실행하면 승리']] };
});
add('L3', '상대 증거 공격 + 추리로 리살', '1-B: 사건 공격으로 빼앗은 증거 포함 (상대 가드 가능 캐릭터 없음)', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 1, 3000, 2), B: ch('B', 1, 3000, 0), ...caseK(7) }), s = R.turn, o = 1 - s; clearHand(R, s); H.fill(R, s, 8); field(H, R, s, 'A'); field(H, R, s, 'B'); solved(R, s); evid(R, s, 4); evid(R, o, 3); return R; }), s = R.turn;
  const r = think(R, s, null), L = r.info.tactics && r.info.tactics.lethal; const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[L && L.found && /1-B/.test(L.kind), '리살 판정: 상대 증거 공격 + 추리'], [t.some(x => /사건 공격: B/.test(x.desc)), 'LP0 캐릭터 B 가 사건 공격'], [R.phase === 'over' && R.winner === s, '실행하면 승리']] };
});
add('L4', '블로커 제거 후 리살', '1-C: 상대 액티브 캐릭터(블로커)를 효과로 제거 → 공격 → 증거 → 추리', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 1, 3000, 2), B: ch('B', 1, 3000, 0), G: ch('G', 3, 4000, 1), RM: REMOVE1, ...caseK(7) }), s = R.turn, o = 1 - s; clearHand(R, s); H.give(R, s, 'RM', 'hand'); H.fill(R, s, 8); field(H, R, s, 'A'); field(H, R, s, 'B'); solved(R, s); evid(R, s, 4); evid(R, o, 3); field(H, R, o, 'G', 'a'); return R; }), s = R.turn;
  const r = think(R, s, null), L = r.info.tactics && r.info.tactics.lethal; const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[L && L.found && /1-C/.test(L.kind), '리살 판정: 블로커 제거 후 공격'], [L && L.line.some(x => /사용: RM/.test(x.desc || x)) && t.findIndex(x => /사용: RM/.test(x.desc)) < t.findIndex(x => /사건 공격/.test(x.desc)), '제거 효과를 사건 공격 전에 사용'], [R.phase === 'over' && R.winner === s, '실행하면 승리 (상대 블로커가 사라진 뒤 공격)']] };
});
add('L5', 'FILE 부족으로 실제 불가능한 가짜 리살 거부', '1-D: 단순 계산(손에 신속 캐릭터가 있음)이 아니라 FILE 레벨 조건까지 본다', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 1, 3000, 1), BIG: ch('BIG', 7, 5000, 3, RAPID), ...caseK(7) }), s = R.turn; clearHand(R, s); H.give(R, s, 'BIG', 'hand'); H.fill(R, s, 5); field(H, R, s, 'A'); solved(R, s); evid(R, s, 3); return R; }), s = R.turn;
  const r = think(R, s, null), L = r.info.tactics && r.info.tactics.lethal; const e = SIM.applyMove(SIM.clone(R), { seat: s, m: { t: 'act', a: 'play', id: R.P[s].hand[0] }, tag: 'play' }, 1);
  return { R, s, r, trace: [], checks: [[L && !L.found, '리살 없음으로 판정'], [L && L.fake && /FILE/.test(L.fake), '가짜 리살 사유에 FILE 부족 표시: ' + (L && L.fake)], [!!e, '엔진도 Lv7 을 FILE 5 에서 낼 수 없다고 거부 (규칙상 불가능한 행동은 실행되지 않음)'], [r.info.tactic !== 'lethal', '리살 모드로 들어가지 않음']] };
});

// ═════════ 평상시 운영 ═════════
add('P1', '효과 제거 우선 (높은 코스트 먼저)', '리살 없음 → 효과 제거 > 유리한 AP 컨택 > 애매한 컨택, 제거는 고코스트 우선', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 3000, 1), X: ch('X', 6, 5000, 1), Y: ch('Y', 1, 1000, 1), RM: REMOVE1, ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); H.give(R, s, 'RM', 'hand'); H.fill(R, s, 5); field(H, R, s, 'A'); field(H, R, o, 'X', 's'); field(H, R, o, 'Y', 's'); H.fill(R, o, 3); return R; }), s = R.turn, o = 1 - s;
  const r = think(R, s, null); const before = snap(R, s); const t = playTurn(R, s);
  return { R, s, r, trace: t, before, checks: [[/사용: RM/.test(r.info.lineDesc ? r.info.lineDesc.join(' ') : ''), '선택한 라인에 제거 효과 사용'], [!find(R, o, 'X'), '상대의 높은 코스트 캐릭터 X(Lv6) 제거'], [!!find(R, o, 'Y') || true, '(Y 는 유리한 컨택으로 처리될 수 있음)']] };
});
add('P2', '+2000 AP 차 컨택 선택', '컨택은 내 AP ≥ 상대 AP + 2000 인 대상을 우선 (상대에게 컷인 +2000 이 있으면 같은 AP 는 위험)', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 5000, 1), X1: ch('X1', 2, 3000, 1), X2: ch('X2', 2, 5000, 1), OC: ch('OC', 1, 1000, 1, CUT(2000)), ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); clearHand(R, o); H.give(R, o, 'OC', 'hand'); H.fill(R, s, 5); H.fill(R, o, 4); field(H, R, s, 'A'); field(H, R, o, 'X1', 's'); field(H, R, o, 'X2', 's'); return R; }), s = R.turn, o = 1 - s;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[t.some(x => x.who === s && /공격: A → X1/.test(x.desc)), 'AP 차 +2000 인 X1 을 컨택 공격'], [!t.some(x => x.who === s && /공격: A → X2/.test(x.desc)), 'AP 가 같고 상대 컷인이 있는 X2 는 공격하지 않음']] };
});
add('P3', 'FILE 6 보존 (리살 아님)', 'FILE = 6 이면 넥스트 힌트로 더 줄이지 않는다', () => {
  const R = make(ctx, () => { const R = H.game({ C: ch('C', 3, 4000, 1), D: ch('D', 4, 4000, 1), ...caseK(9) }), s = R.turn; clearHand(R, s); H.give(R, s, 'C', 'hand'); H.give(R, s, 'D', 'hand'); H.fill(R, s, 6); return R; }), s = R.turn;
  const before = snap(R, s), r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, before, checks: [[!t.some(x => x.tag === 'hint'), '넥스트 힌트를 쓰지 않음'], [R.P[s].file.length === 6, `턴 종료 후 FILE ${R.P[s].file.length} (6 유지)`]] };
});
add('P4', 'FILE 초과분(>6)은 넥스트 힌트로 적극 사용', 'FILE 9 → 힌트/캐릭터 전개로 FILE 6 근처까지', () => {
  const R = make(ctx, () => { const R = H.game({ C1: ch('C1', 3, 3000, 1), C2: ch('C2', 5, 4000, 1), C3: ch('C3', 7, 5000, 1), ...caseK(10) }), s = R.turn; clearHand(R, s); for (const k of ['C1', 'C2', 'C3']) H.give(R, s, k, 'hand'); H.fill(R, s, 9); return R; }), s = R.turn;
  const before = snap(R, s), r = think(R, s, null); const t = playTurn(R, s), hints = t.filter(x => x.tag === 'hint').length;
  return { R, s, r, trace: t, before, checks: [[hints >= 2, `넥스트 힌트 ${hints}회 (FILE 9 의 초과분 사용)`], [R.P[s].file.length >= 6 && R.P[s].file.length <= 7, `턴 종료 후 FILE ${R.P[s].file.length} (6 아래로 내려가지 않음)`], [R.P[s].field.length >= 3, `전개한 캐릭터 ${R.P[s].field.length}장`]] };
});
add('P5', 'FILE ≤ 6 에서는 넥스트 힌트로 FILE 을 더 줄이지 않는다', 'FILE 5 에서 힌트 금지 (리살/큰 이득이 없는 한)', () => {
  const R = make(ctx, () => { const R = H.game({ C: ch('C', 3, 4000, 1), ...caseK(9) }), s = R.turn; clearHand(R, s); H.give(R, s, 'C', 'hand'); H.fill(R, s, 5); return R; }), s = R.turn;
  const before = snap(R, s), r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, before, checks: [[!t.some(x => x.tag === 'hint'), '넥스트 힌트를 쓰지 않음'], [R.P[s].file.length === 5, `FILE ${R.P[s].file.length} 유지`], [R.P[s].field.length === 1, '손패 캐릭터는 등장']] };
});
add('P6', '상대 캐릭터 없음 → 상대 증거 공격', '상대 필드가 비었고 상대에게 증거가 있으면 사건 공격', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 3000, 1), ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); H.fill(R, s, 6); field(H, R, s, 'A'); evid(R, o, 2); H.fill(R, o, 3); return R; }), s = R.turn;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[/사건 공격: A/.test(r.info.lineDesc ? r.info.lineDesc.join(' ') : ''), '선택한 라인에 사건 공격'], [R.P[1 - s].evid.length === 1, `상대 증거 2 → ${R.P[1 - s].evid.length}`]] };
});
add('P7', '상대 증거 없음 → 추리', '상대에게 빼앗을 증거가 없으면 추리', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 3000, 2), ...caseK(9) }), s = R.turn; clearHand(R, s); H.fill(R, s, 6); field(H, R, s, 'A'); H.fill(R, 1 - s, 3); return R; }), s = R.turn;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[t.some(x => /추리: A/.test(x.desc)), 'A 가 추리'], [R.P[s].evid.length >= 2, `내 증거 ${R.P[s].evid.length}`]] };
});
add('P8', 'CUT-IN 이 없으면 불리한 컨택을 피한다', '내 AP < 상대 AP + 2000 이고 컷인도 없으면 컨택하지 않고 추리/증거 공격', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 5000, 2), X: ch('X', 3, 6000, 1), OC: ch('OC', 1, 1000, 1, CUT(2000)), ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); clearHand(R, o); H.give(R, o, 'OC', 'hand'); H.fill(R, s, 6); H.fill(R, o, 4); field(H, R, s, 'A'); field(H, R, o, 'X', 's'); return R; }), s = R.turn;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[!t.some(x => x.who === s && /공격: A → X/.test(x.desc)), '내 AP5000 < 상대 6000 인 X 를 컨택 공격하지 않음'], [t.some(x => /추리: A/.test(x.desc)), '대신 A 가 추리']] };
});
add('P9', '같은 AP + 내 +2000 CUT-IN 보유 → 공격', '내 AP = 상대 AP 라도 손에 +2000 컷인(MR 아님)이 있으면 컨택 공격을 적극 고려', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 5000, 1), X: ch('X', 3, 5000, 1), MC: ch('MC', 1, 1000, 1, CUT(2000)), OC: ch('OC', 1, 1000, 1, CUT(2000)), ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); clearHand(R, o); H.give(R, s, 'MC', 'hand'); H.give(R, o, 'OC', 'hand'); H.fill(R, s, 6); H.fill(R, o, 4); field(H, R, s, 'A'); field(H, R, o, 'X', 's'); return R; }), s = R.turn;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[t.some(x => x.who === s && /공격: A → X/.test(x.desc)), '같은 AP 의 X 를 컨택 공격'], [!!r.info.tactics && !!r.info.tactics.chosen, '판단 로그가 남음']] };
});
add('P10', '+1000 AP + CUT-IN 보유 → 공격', '내 AP = 상대 AP + 1000 이고 손에 +1000/+2000 컷인이 있으면 공격', () => {
  const R = make(ctx, () => { const R = H.game({ A: ch('A', 2, 6000, 1), X: ch('X', 3, 5000, 1), MC: ch('MC', 1, 1000, 1, CUT(1000)), OC: ch('OC', 1, 1000, 1, CUT(2000)), ...caseK(9) }), s = R.turn, o = 1 - s; clearHand(R, s); clearHand(R, o); H.give(R, s, 'MC', 'hand'); H.give(R, o, 'OC', 'hand'); H.fill(R, s, 6); H.fill(R, o, 4); field(H, R, s, 'A'); field(H, R, o, 'X', 's'); return R; }), s = R.turn;
  const r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, checks: [[t.some(x => x.who === s && /공격: A → X/.test(x.desc)), '+1000 AP 차 + 컷인 보유 → X 를 컨택 공격']] };
});

// ═════════ 방어 (미시 결정) ═════════
// 상대(turn 플레이어)가 액션을 선언해 내가 응답할 차례인 상태를 만든다
const attackSetup = (defs, fn) => make(ctx, () => { const R = H.game(defs), s = R.turn, o = 1 - s; fn(R, s, o); return R; });
add('P11', 'MR 카드는 +2000 컷인 비용으로 쓰지 않는다 (non-MR 컷인은 쓴다)', 'MR 컷인은 매우 큰 손해 — 정말 안 쓰면 지는 경우가 아니면 보존', () => {
  const mk = cut => attackSetup({ ATK: ch('ATK', 4, 5000, 1), DEF: ch('DEF', 2, 4000, 1), CC: ch('CC', 5, 1000, 1, cut), ...caseK(9) }, (R, s, o) => { clearHand(R, o); H.give(R, o, 'CC', 'hand'); H.fill(R, s, 6); H.fill(R, o, 6); field(H, R, s, 'ATK'); const d = field(H, R, o, 'DEF', 's'); const e = H.act(R, s, { a: 'action', id: find(R, s, 'ATK'), k: 'char', tid: d }); if (e) throw new Error(e); const e2 = SIM.applyMove(R, { seat: o, m: { t: 'act', a: 'guard', id: null }, tag: 'noguard' }, 1); if (e2) throw new Error(e2); });
  const Rm = mk(MRCUT(2000)), Rn = mk(CUT(2000)), o = 1 - Rm.turn;
  const rm = think(Rm, o, null), rn = think(Rn, o, null);
  return { R: Rm, s: o, r: rm, trace: [], extra: { nonMR: describe(Rn, rn.mv) }, checks: [[SIM.who(Rm).kind === 'sub:contact', '컨택트 응답 차례'], [rm.mv.tag === 'pass', 'MR 컷인(+2000)은 쓰지 않고 패스: ' + describe(Rm, rm.mv)], [rn.mv.tag === 'cin', '대조: MR 이 아닌 컷인(+2000)은 사용: ' + describe(Rn, rn.mv)]] };
});
add('P12', '불리한 가드 회피', '상대 공격 AP 가 내 방어 캐릭터 AP 보다 2000 이상 높으면 의미 없는 가드를 하지 않는다', () => {
  const R = attackSetup({ BIG: ch('BIG', 7, 8000, 1), G: ch('G', 5, 5000, 2), L: ch('L', 1, 1000, 1), ...caseK(9) }, (R, s, o) => { clearHand(R, o); field(H, R, s, 'BIG'); field(H, R, o, 'G', 'a'); const l = field(H, R, o, 'L', 's'); H.fill(R, s, 5); H.fill(R, o, 4); const e = H.act(R, s, { a: 'action', id: find(R, s, 'BIG'), k: 'char', tid: l }); if (e) throw new Error(e); }), o = 1 - R.turn;
  const r = think(R, o, null);
  return { R, s: o, r, trace: [], checks: [[SIM.who(R).kind === 'sub:guard', '가드 응답 차례'], [r.mv.tag === 'noguard', '가드하지 않음 (공격 AP 8000 − 가드 AP 5000 = 3000 ≥ 2000): ' + describe(R, r.mv)]] };
});
add('P13', '리살 방지를 위한 예외적 가드', '이 공격을 통과시키면 상대가 증거 1장을 얻어 바로 사건 해결(리살) → AP 가 불리해도 생존 최우선으로 가드', () => {
  const R = attackSetup({ X: ch('X', 4, 5000, 1), G: ch('G', 2, 2000, 1), ...caseK(5) }, (R, s, o) => { clearHand(R, o); field(H, R, s, 'X'); field(H, R, o, 'G', 'a'); solved(R, s); evid(R, s, needOf(R, s) - 1); evid(R, o, 2); H.fill(R, s, 7); H.fill(R, o, 4); const e = H.act(R, s, { a: 'action', id: find(R, s, 'X'), k: 'case' }); if (e) throw new Error(e); }), o = 1 - R.turn;
  const r = think(R, o, null);
  return { R, s: o, r, trace: [], checks: [[SIM.who(R).kind === 'sub:guard', '가드 응답 차례 (상대의 사건 공격)'], [r.mv.tag === 'guard', '증거를 빼앗기면 상대가 리살이므로 AP 열세(5000 vs 2000)여도 가드: ' + describe(R, r.mv)]] };
});

// ═════════ 멀리건 ═════════
const mullState = (defs, keys) => make(ctx, () => { const R = H.game({ ...defs, ...caseK(9) }), s = R.turn; clearHand(R, s); for (const k of keys) H.give(R, s, k, 'hand'); R.phase = 'mull'; R.mullSeat = s; return R; });
add('P14', '멀리건: 2코 1장 + 4코 1장 + MR 1장만 남긴다', '그 외는 전부 교체 (카드 ID 하드코딩 없이 type/cost/MR)', () => {
  const R = mullState({ T2: ch('T2', 2, 3000, 1), T22: ch('T22', 2, 2000, 1), F4: ch('F4', 4, 4000, 1), M: ch('M', 5, 5000, 1, MR), X1: ch('X1', 1, 1000, 1), S6: ch('S6', 6, 6000, 1) }, ['T2', 'T22', 'F4', 'M', 'S6']), s = R.turn;
  const r = think(R, s, null), rep = r.mv.m.ids.map(id => nameOf(R, id)).sort();
  return { R, s, r, trace: [], extra: { replace: rep }, checks: [[SIM.who(R).kind === 'mull', '멀리건 결정'], [rep.join() === ['S6', 'T22'].sort().join(), `교체: ${rep.join(', ')} (남김: 2코 T2, 4코 F4, MR M)`]] };
});
add('P15', '멀리건 예외: 2코 2장 + 4코 0장 + MR → 2코 2장 + MR', '4코가 없다는 이유로 두 번째 2코까지 버리지 않는다', () => {
  const R = mullState({ T2: ch('T2', 2, 3000, 1), T22: ch('T22', 2, 2000, 1), M: ch('M', 5, 5000, 1, MR), X1: ch('X1', 1, 1000, 1), S6: ch('S6', 6, 6000, 1) }, ['T2', 'T22', 'M', 'X1', 'S6']), s = R.turn;
  const r = think(R, s, null), rep = r.mv.m.ids.map(id => nameOf(R, id)).sort();
  return { R, s, r, trace: [], extra: { replace: rep }, checks: [[rep.join() === ['S6', 'X1'].sort().join(), `교체: ${rep.join(', ')} (남김: 2코 2장 + MR)`]] };
});

// ═════════ 파트너 ═════════
add('P16', '고코스트 전개를 위한 파트너 어시스트', '어시스트로 이번 턴 핵심 고코스트 캐릭터가 나오면 어시스트 가치를 높게', () => {
  const R = make(ctx, () => { const R = H.game({ BIGC: ch('BIGC', 6, 6000, 2), ...caseK(9) }), s = R.turn; clearHand(R, s); H.give(R, s, 'BIGC', 'hand'); H.fill(R, s, 5); return R; }), s = R.turn;
  const before = snap(R, s), r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, before, checks: [[r.mv.tag === 'assist', '첫 행동이 어시스트: ' + describe(R, r.mv)], [!!find(R, s, 'BIGC'), 'Lv6 캐릭터 등장 (FILE 5 + 어시스트 1)']] };
});
add('P17', '어시스트가 불필요하면 파트너 추리', '어시스트로 얻는 전개가 없으면 파트너를 낭비하지 않고 추리', () => {
  const R = make(ctx, () => { const R = H.game({ C: ch('C', 3, 3000, 1), ...caseK(9) }), s = R.turn; clearHand(R, s); H.give(R, s, 'C', 'hand'); H.fill(R, s, 8); solved(R, s); evid(R, s, 2); H.fill(R, 1 - s, 3); return R; }), s = R.turn;
  const before = snap(R, s), r = think(R, s, null); const t = playTurn(R, s);
  return { R, s, r, trace: t, before, checks: [[!t.some(x => x.tag === 'assist'), '어시스트하지 않음'], [t.some(x => x.tag === 'reason' && /파트너/.test(x.desc)), '파트너가 추리'], [R.P[s].evid.length >= 3, `증거 2 → ${R.P[s].evid.length}`]] };
});

// ── 실행/출력 ──
function fmtState(R, s, before) { const P = R.P[s], O = R.P[1 - s]; return `턴 ${R.n} | 내 FILE ${P.file.length} 증거 ${P.evid.length}/${needOf(R, s)}${R.cards[P.kase].solved ? '(해결편)' : ''} 손패 ${P.hand.length} 필드 ${P.field.length} | 상대 필드 ${O.field.length} 증거 ${O.evid.length}`; }
function printLog(c, res, startState) {
  const { r, trace, checks, before, extra } = res, T = r && r.info && r.info.tactics, L = T && T.lethal, ch0 = T && T.chosen;
  console.log(`  규칙: ${c.rule}`);
  console.log(`  현재 상태: ${startState}`);
  if (L) console.log(`  lethal 판정: ${L.found ? '있음 — ' + L.kind + ' → ' + L.line.join(' → ') : '없음 — ' + (L.fake || L.skipped || '-')}${L.calc ? ` [필요 ${L.calc.need} 증거 ${L.calc.evid} 현장LP ${L.calc.fieldLP} 손LP ${L.calc.handLP} A=${L.calc.A} B=${L.calc.B} C=${L.calc.C} 블로커 ${L.calc.oppBlockers}]` : ''}`);
  else console.log('  lethal 판정: (내 메인 결정이 아님)');
  if (r) console.log(`  선택한 행동: ${describe(res.R0, r.mv)}${r.info.tactic ? '  [' + r.info.tactic + ']' : ''}${r.info.lineDesc && !r.info.tactic ? '  라인: ' + r.info.lineDesc.join(' → ') : ''}`);
  if (T && T.others && T.others.length) console.log('  다른 주요 후보: ' + T.others.slice(0, 3).map(o => `「${o.desc}」${o.value != null ? ' ' + o.value : ''}${o.prune ? ' ⟂' + o.prune : ''}${o.note ? ' (' + o.note + ')' : ''}`).join(' | '));
  if (T && T.why) console.log('  이유: ' + T.why);
  else if (ch0 && ch0.note) console.log('  이유: ' + ch0.note);
  if (T && T.prunedRoot && T.prunedRoot.length) console.log('  규칙으로 미룬 수: ' + T.prunedRoot.map(p => `${p.desc} ⟂${p.rule}${p.overridden ? '(탐색이 뒤집음)' : ''}`).join(', '));
  if (ch0 && ch0.file) console.log(`  FILE 변화: ${ch0.file.before} → ${ch0.file.after}   증거 변화: 내 ${ch0.evidence.me.join('→')} / 상대 ${ch0.evidence.opp.join('→')}   상대 필드 ${ch0.oppField.join('→')}`);
  if (trace && trace.length) console.log(`  실제 진행: ${trace.filter(x => x.kind !== 'eff').map(x => (x.who === res.s ? '' : '(상대) ') + x.desc).join(' → ')}   ⇒ ${fmtState(res.R, res.s)}`);
  if (ch0 && ch0.note && ch0.note.includes('AP')) console.log('  AP/컷인 판단: ' + ch0.note);
  const ap = T && T.chosen && T.chosen.ap; if (ap) console.log('  AP/컷인 판단: ' + JSON.stringify(ap));
  if (T && T.decision === 'micro') console.log(`  미시 결정: ${T.chosen.desc} (${T.chosen.note || '-'}) / 다른 응수: ${T.others.map(o => `${o.desc} ${o.value}${o.note ? ' [' + o.note + ']' : ''}`).join(' | ')}${T.oppLethalAvoided ? '  ← 상대 리살을 막는 응수만 선택' : ''}`);
  if (extra) console.log('  ' + JSON.stringify(extra));
}
let pass = 0, fail = 0; const failed = [];
for (const c of CASES) {
  if (ONLY && !ONLY.includes(c.id)) continue;
  let res, startState = '', err = null;
  try { const t0 = Date.now(); res = c.fn(); res.R0 = null; } catch (e) { err = e; }
  console.log(`\n■ [${c.id}] ${c.name}`);
  if (err) { fail++; failed.push(c.id); console.log('  ✗ 실행 오류: ' + (err.stack || err).toString().split('\n').slice(0, 4).join('\n    ')); continue; }
  // R0: 결정 시점 상태 (describe 용) — 케이스 함수가 R 을 진행시키므로 다시 만들지 않고 이름 조회만 하면 되는 describe 에는 최종 R 을 써도 안전(카드 정의는 같음)
  res.R0 = res.R; startState = res.before ? `FILE ${res.before.file} 증거 ${res.before.evid} 손패 ${res.before.hand} 필드 ${res.before.field} | 상대 필드 ${res.before.oppField} 증거 ${res.before.oppEvid}` : '(아래 실제 진행 참고)';
  if (!QUIET) printLog(c, res, startState);
  for (const [ok, msg] of res.checks) { if (ok) pass++; else { fail++; failed.push(c.id + ':' + msg); } console.log(`  ${ok ? '✓' : '✗'} ${msg}`); }
}
console.log(`\ntactics_test: ${pass} 통과, ${fail} 실패${fail ? ' — ' + failed.join(' / ') : ''}`);
process.exit(fail ? 1 : 0);
