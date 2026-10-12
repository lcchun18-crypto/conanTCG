// v1.17.11 Expert(규칙) AI: 새 캐릭터 등장 후 기존 현장 캐릭터 전체의 선언 효과 재평가 / 제거 효과 타겟 우선순위(코스트·AP·둘 다) / 사용 제한·비용·타겟 없음
process.env.BOT_ENGINE = 'rule';
const fs = require('fs'), path = require('path');
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide, describe } = require('../bot/decide.js');
const { ch, field, clearHand, caseK, make } = require('./expert_cases/_util.js'); const ctx = { SIM };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const nm = (R, id) => R.defs[R.cards[id].d].n;
// 제거 선언 효과(합성 카드 — 특정 카드 ID 를 쓰지 않는다). cond: 필드 캐릭터 N장 이상, cost: 비용, filter: 제거 대상 조건
const REM = (filter, o = {}) => ({ ab: [{ ic: 'declare', cond: o.cond === undefined ? { fh: { type: 'char', own: 'self' }, fhN: 2 } : o.cond, lim: o.lim === undefined ? 1 : o.lim, cost: o.cost || [{ c: 'sleepSelf', n: 1 }], ops: [{ op: 'select', n: 1, filter: { ...filter, own: 'opp' }, do: 'remove' }], txt: '제거' }], extra: '【선언】제거' });
const game = (defs, setup) => make(ctx, () => { const R = H.game({ ...defs, ...caseK(12) }), s = R.turn; clearHand(R, s); setup(R, s); return R; });
const turn = (R, s, max = 40) => { const log = []; let g = 0; while (R.phase === 'play' && R.turn === s && g++ < max) { const d = SIM.who(R); if (!d) break; const r = decide({ R, seat: s, cfg: { lethal: false } }); if (r.err) throw new Error(r.err); log.push({ kind: d.kind, tag: r.mv.tag, desc: describe(R, r.mv), why: r.info.why || '', rule: r.info.rule, id: r.mv.m.id }); const e = SIM.applyMove(R, r.mv, 5); if (e) throw new Error('엔진 거부: ' + describe(R, r.mv) + ' → ' + e); if (r.mv.tag === 'end') break; } return log; };
const abIdx = (R, id) => R.defs[R.cards[id].d].ab.findIndex(a => a.ic === 'declare');
const remNames = (R, o) => R.P[o].rem.map(i => nm(R, i));

// 1) 기존 A 의 제거 선언: 처음엔 불가 → B 등장 → 재평가 → 사용 → 코스트 최고 타겟
{ const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 6 })), B: ch('B', 2, 3000, 1), O2: ch('O2', 2, 2000, 1), O4: ch('O4', 4, 2000, 1), O6: ch('O6', 6, 2000, 1), O8: ch('O8', 8, 2000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); for (const k of ['O2', 'O4', 'O6', 'O8']) field(H, R, 1 - s, k); });
  const s = R.turn, o = 1 - s, A = R.P[s].field[0]; const chk0 = require('../fx.js') && SIM.S.FX.declareCheck(R, s, A, abIdx(R, A)); ok(!!chk0, '1-1 A 의 선언 제거 효과는 처음(B 등장 전)에는 사용 불가: ' + chk0);
  const log = turn(R, s); const iB = log.findIndex(l => l.tag === 'play' && /B/.test(l.desc)), iA = log.findIndex(l => l.tag === 'ability');
  ok(iB === 0 && iA === 1, `1-2 B 등장 직후(다음 행동)에 기존 A 의 선언 효과를 재평가해 사용 (${log.slice(0, 3).map(l => l.desc).join(' → ')})`); ok(/재평가/.test(log[iA].why), '1-3 판단 로그: ' + log[iA].why);
  ok(remNames(R, o).join() === 'O6', `1-4 제거 가능(Lv≤6) 중 최고 코스트 O6 제거 (Lv8 은 불법 타겟 → 선택 안 함): ${remNames(R, o)}`); ok(R.P[o].field.some(i => nm(R, i) === 'O8'), '1-5 Lv8 은 현장에 남음'); }
// 2) AP 기준 제거: 가능한 범위에서 AP 최고 / 동률이면 코스트 높은 쪽
{ const mk = (opps) => game({ A: ch('A', 3, 3000, 1, REM({ apMax: 5000 })), B: ch('B', 2, 3000, 1), ...Object.fromEntries(opps.map(([n, lv, ap]) => [n, ch(n, lv, ap, 1)])) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); for (const [n] of opps) field(H, R, 1 - s, n); });
  let R = mk([['P3', 6, 3000], ['P4', 5, 4000], ['P5', 1, 5000], ['P6', 9, 6000]]); let s = R.turn, o = 1 - s; turn(R, s);
  ok(remNames(R, o).join() === 'P5', `2-1 AP 5000 이하 제거: 후보 3000/4000/5000 중 최고 AP(5000) 제거, 6000 은 불법: ${remNames(R, o)}`);
  R = mk([['Q1', 3, 5000], ['Q2', 7, 5000], ['Q3', 9, 2000]]); s = R.turn; o = 1 - s; turn(R, s); ok(remNames(R, o).join() === 'Q2', `2-2 AP 동률이면 코스트 높은 쪽(Lv7): ${remNames(R, o)}`);
  R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 6 })), B: ch('B', 2, 3000, 1), L1: ch('L1', 6, 1000, 1), L2: ch('L2', 6, 4000, 1), L3: ch('L3', 2, 9000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); for (const n of ['L1', 'L2', 'L3']) field(H, R, 1 - s, n); }); s = R.turn; o = 1 - s; turn(R, s);
  ok(remNames(R, o).join() === 'L2', `2-3 코스트 기준 동률(Lv6)이면 AP 높은 쪽: ${remNames(R, o)}`); }
// 3) Lv/AP 둘 다 조건: 합법 후보를 먼저 만든 뒤 그 안에서 선택 (불법 타겟 선택 후 실패 없음)
{ const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 6, apMax: 5000 })), B: ch('B', 2, 3000, 1), X1: ch('X1', 6, 2000, 1), X2: ch('X2', 3, 5000, 1), X3: ch('X3', 5, 4000, 1), X4: ch('X4', 9, 1000, 1), X5: ch('X5', 2, 8000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); for (const n of ['X1', 'X2', 'X3', 'X4', 'X5']) field(H, R, 1 - s, n); });
  const s = R.turn, o = 1 - s, log = turn(R, s); ok(remNames(R, o).join() === 'X3', `3-1 Lv≤6 & AP≤5000 합법 후보(X1,X2,X3) 중 종합 가치 최고(X3 Lv5/AP4000): ${remNames(R, o)}`); ok(!log.some(l => /거부|실패/.test(l.why)) && R.P[o].rem.length === 1, '3-2 불법 타겟(Lv9, AP8000)을 고르지 않고 1회에 성공'); }
// 4) 이미 턴 제한을 소모한 선언 효과는 다시 쓰지 않는다 / 제한 2회면 2번까지
for (const lim of [1, 2]) { const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 9 }, { lim, cost: [] })), B: ch('B', 2, 3000, 1), E1: ch('E1', 2, 1000, 1), E2: ch('E2', 4, 1000, 1), E3: ch('E3', 6, 1000, 1), E4: ch('E4', 8, 1000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); for (const n of ['E1', 'E2', 'E3', 'E4']) field(H, R, 1 - s, n); });
  const s = R.turn, o = 1 - s, log = turn(R, s), n = log.filter(l => l.tag === 'ability').length; ok(n === lim && R.P[o].rem.length === lim, `4-${lim} [턴${lim}] 선언 효과 사용 횟수 ${n} = ${lim} (소진 후 재사용 없음), 제거 ${R.P[o].rem.length}장`); }
// 5) 비용 부족이면 사용하지 않는다 (손패 3장 리무브 비용인데 손패 부족 / 이미 슬립)
{ const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 9 }, { cost: [{ c: 'discard', n: 3 }] })), B: ch('B', 2, 3000, 1), E: ch('E', 4, 1000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); field(H, R, 1 - s, 'E'); });
  const s = R.turn, o = 1 - s, log = turn(R, s); ok(!log.some(l => l.tag === 'ability') && R.P[o].rem.length === 0, '5-1 손패 비용 부족 → 사용 안 함'); }
{ const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 9 })), B: ch('B', 2, 3000, 1), E: ch('E', 4, 1000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A', 's'); H.give(R, s, 'B', 'hand'); field(H, R, s, 'B', 'a'); R.P[s].hand = []; field(H, R, 1 - s, 'E'); });
  const s = R.turn, o = 1 - s, log = turn(R, s); ok(!log.some(l => l.tag === 'ability') && R.P[o].rem.length === 0, '5-2 이미 슬립(비용 지불 불가) → 사용 안 함'); }
// 6) 합법 타겟이 없으면(상대가 모두 Lv 초과) 비용을 낭비하지 않는다
{ const R = game({ A: ch('A', 3, 3000, 1, REM({ lvMax: 6 })), B: ch('B', 2, 3000, 1), E: ch('E', 9, 1000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A'); H.give(R, s, 'B', 'hand'); field(H, R, 1 - s, 'E'); });
  const s = R.turn, o = 1 - s, A = R.P[s].field[0], log = turn(R, s); ok(!log.some(l => l.tag === 'ability') && R.P[o].rem.length === 0 && R.P[o].field.length === 1, '6-1 합법 타겟 없음 → 선언 효과 사용 안 함 (비용 낭비 없음)'); }
// 7) 새 캐릭터 등장 후 "기존 현장 캐릭터 전체"를 재체크: A1, A2 둘 다 조건이 B 등장으로 충족 → 둘 다 사용 (B 자신의 효과만 보지 않음)
{ const R = game({ A1: ch('A1', 3, 3000, 1, REM({ lvMax: 9 }, { cond: { fh: { type: 'char', own: 'self' }, fhN: 3 } })), A2: ch('A2', 3, 3000, 1, REM({ lvMax: 9 }, { cond: { fh: { type: 'char', own: 'self' }, fhN: 3 } })), B: ch('B', 2, 3000, 1), E1: ch('E1', 2, 1000, 1), E2: ch('E2', 5, 1000, 1), E3: ch('E3', 7, 1000, 1) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'A1'); field(H, R, s, 'A2'); H.give(R, s, 'B', 'hand'); for (const n of ['E1', 'E2', 'E3']) field(H, R, 1 - s, n); });
  const s = R.turn, o = 1 - s, log = turn(R, s), ab = log.filter(l => l.tag === 'ability'); ok(ab.length === 2 && new Set(ab.map(l => l.id)).size === 2, `7-1 기존 캐릭터 A1·A2 의 선언 효과를 모두 재평가해 사용 (${ab.length}회)`); ok(remNames(R, o).join() === 'E3,E2', `7-2 높은 코스트부터 제거: ${remNames(R, o)}`); }
// 8) 제거 효과가 아닌 선언 효과(드로우)는 기존처럼 사용 / 특정 카드 ID 하드코딩 없음 / 새 등장이 없어도(손패 사용 후) 기존 규칙 유지
{ const R = game({ C: ch('C', 1, 3000, 1, { ab: [{ ic: 'declare', ops: [{ op: 'draw', n: 1 }] }], extra: '【선언】드로우' }) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'C'); }); const s = R.turn, log = turn(R, s); ok(log.some(l => l.tag === 'ability'), '8-1 제거가 아닌 선언 효과는 기존처럼 사용'); }
{ const src = fs.readFileSync(path.join(__dirname, '../bot/rulebot.js'), 'utf8'); ok(!/id_[0-9A-Za-z]{3,}/.test(src.replace(/\/\/.*$/gm, '')), '8-2 rulebot.js 에 특정 카드 ID 하드코딩 없음'); }
console.log(`\ndeclare_recheck_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
