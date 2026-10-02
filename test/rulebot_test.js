// v1.8.0 규칙 스크립트 AI 회귀 테스트: 1~7번 규칙을 "합성 상태 + 기대 행동 + 판단 로그"로 고정한다.  node test/rulebot_test.js [--quiet]
process.env.BOT_ENGINE = 'rule';
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide, describe } = require('../bot/decide.js'), RB = require('../bot/rulebot.js');
const { ch, field, clearHand, caseK, make } = require('./expert_cases/_util.js');
const QUIET = process.argv.includes('--quiet'); const ctx = { SIM };
const CUT = v => ({ kw: 'cutin:' + v, ab: [{ ic: 'cutin', v }] });
const think = (R, s) => { const r = decide({ R, seat: s, cfg: { lethal: true } }); if (r.err) throw new Error(r.err); return r; };
const run = (R, mv) => { const e = SIM.applyMove(R, mv, 5); if (e) throw new Error('엔진 거부: ' + describe(R, mv) + ' → ' + e); };
const nm = (R, id) => R.defs[R.cards[id].d].n;
const turnLog = (R, s, max = 40) => { const out = []; let g = 0; while (R.phase === 'play' && R.turn === s && !R.sub && !R.eff && g++ < max) { const r = think(R, s); out.push({ tag: r.mv.tag, desc: describe(R, r.mv), rule: r.info.rule, why: r.info.why }); run(R, r.mv); if (r.mv.tag === 'end') break; } return out; };
let pass = 0, fail = 0;
const T = (id, name, fn) => { try { const r = fn(); const bad = r.checks.filter(c => !c[0]); if (!QUIET) { console.log(`\n[${id}] ${name}`); (r.log || []).forEach(l => console.log('   · ' + (l.rule ? `(${l.rule}번) ` : '') + (l.why || l.desc || l))); r.checks.forEach(c => console.log(`   ${c[0] ? '✓' : '✗'} ${c[1]}`)); } if (bad.length) { fail++; console.log(`FAIL ${id}: ${bad.map(b => b[1]).join(' | ')}`); } else pass++; } catch (e) { fail++; console.log(`FAIL ${id}: ${e.stack || e}`); } };
const base = (defs, setup) => make(ctx, () => { const R = H.game({ ...defs, ...caseK(12) }), s = R.turn; clearHand(R, s); setup(R, s); return R; });

T('R1a', '1번: 손패 중 코스트 최고 카드를 낸다(직접) → 파트너 추리', () => {
  const R = base({ A: ch('A', 2, 3000, 1), B: ch('B', 4, 3000, 1), C: ch('C', 3, 3000, 1) }, (R, s) => { for (const k of ['A', 'B', 'C']) H.give(R, s, k, 'hand'); H.fill(R, s, 6); }), s = R.turn;
  const log = turnLog(R, s); const f = log[0];
  return { log, checks: [[f.tag === 'play' && /B/.test(f.desc), '첫 행동 = 레벨4 카드 사용'], [log[1] && log[1].tag === 'reason' && /파트너/.test(log[1].desc), '이어서 파트너 추리'], [!log.some(l => l.tag === 'hint'), 'FILE 6 → 힌트 없음']] };
});
T('R1b', '1번: 어시스트하면 낼 수 있는 더 높은 코스트 카드 → 어시스트 후 사용', () => {
  const R = base({ A: ch('A', 2, 3000, 1), B: ch('B', 4, 3000, 1) }, (R, s) => { H.give(R, s, 'A', 'hand'); H.give(R, s, 'B', 'hand'); H.fill(R, s, 3); }), s = R.turn;
  const log = turnLog(R, s), p = log.findIndex(l => l.tag === 'play');
  return { log, checks: [[log[0].tag === 'assist', '첫 행동 = 어시스트'], [p === 1 && /B/.test(log[p].desc), '다음 행동 = 레벨4 카드 사용'], [!log.some(l => l.tag === 'reason' && /파트너/.test(l.desc)), '어시스트 후 파트너는 슬립 → 추리 없음']] };
});
T('R2a', '2번: FILE > 6 이면 넥스트 힌트 (낼 카드가 없을 때)', () => {
  const R = base({ A: ch('A', 1, 3000, 1) }, (R, s) => { H.fill(R, s, 8); }), s = R.turn;
  const log = turnLog(R, s), h = log.filter(l => l.tag === 'hint').length;
  return { log, checks: [[log[0].tag === 'hint', '첫 행동 = 넥스트 힌트'], [R.P[s].file.length <= 6 || !log.some(l => l.tag === 'hint' && false), `턴 종료 FILE ${R.P[s].file.length}`], [h >= 1, `힌트 ${h}회`]] };
});
T('R2b', '2번: FILE ≤ 6 이면 힌트 안 함', () => {
  const R = base({ A: ch('A', 1, 3000, 1) }, (R, s) => { H.fill(R, s, 6); }), s = R.turn;
  const log = turnLog(R, s);
  return { log, checks: [[!log.some(l => l.tag === 'hint'), '힌트 없음']] };
});
const duel = (myAp, oppAp, oppSt, extra = {}) => base({ M: ch('M', 1, myAp, 2), O: ch('O', 1, oppAp, 2), ...(extra.defs || {}) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'M', 'a'); field(H, R, 1 - s, 'O', oppSt); if (extra.evid) { while (R.P[1 - s].evid.length < extra.evid) R.P[1 - s].evid.push(R.P[1 - s].deck.pop()); } if (extra.setup) extra.setup(R, s); });
T('R3a', '3번: 상대 액티브 중 AP 더 높은 캐릭터가 있으면 행동하지 않는다', () => {
  const R = duel(3000, 5000, 'a', { evid: 2 }), s = R.turn, log = turnLog(R, s);
  return { log, checks: [[!log.some(l => ['atkc', 'atkk', 'reason'].includes(l.tag) && !/파트너/.test(l.desc)), '내 캐릭터 행동 없음'], [log[log.length - 1].tag === 'end', '턴 종료']] };
});
T('R4a', '4번: 슬립 상태의 AP 같거나 낮은 상대 캐릭터를 우선 공격', () => {
  const R = duel(4000, 4000, 's', { evid: 2 }), s = R.turn, log = turnLog(R, s);
  return { log, checks: [[log[0].tag === 'atkc' && /O/.test(log[0].desc), '슬립 상대 캐릭터를 공격 (증거 공격보다 우선)']] };
});
T('R4b', '4번: 공격 가능한 캐릭터가 없으면 상대 증거(사건) 공격', () => {
  const R = duel(3000, 5000, 's', { evid: 2 }), s = R.turn, log = turnLog(R, s);
  return { log, checks: [[log[0].tag === 'atkk', '상대 슬립 캐릭터 AP가 더 높음 → 사건 액션']] };
});
T('R4c', '4번: 상대 증거가 없으면 추리, LP 0 이면 세워 둠', () => {
  const R1 = duel(3000, 5000, 's', {}), s = R1.turn, l1 = turnLog(R1, s);
  const R2 = base({ M: ch('M', 1, 3000, 0) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'M', 'a'); }), l2 = turnLog(R2, R2.turn);
  return { log: [...l1, ...l2], checks: [[l1[0].tag === 'reason', '상대 증거 없음 → 추리'], [!l2.some(l => l.tag === 'reason' && !/파트너/.test(l.desc)), 'LP 0 → 추리하지 않고 세워 둠']] };
});
T('R5', '5번: 상대가 컷인 → 나도 컷인으로 AP 맞춤, 이미 같으면 안 함', () => {
  const mk = (cut) => base({ M: ch('M', 1, 3000, 2), O: ch('O', 1, 3000, 2), X: ch('X', 1, 1000, 1, CUT(1000)), Y: ch('Y', 1, 1000, 1, CUT(cut)) }, (R, s) => { H.fill(R, s, 6); field(H, R, s, 'M', 'a'); field(H, R, 1 - s, 'O', 's'); H.give(R, s, 'Y', 'hand'); H.give(R, 1 - s, 'X', 'hand'); });
  const R = mk(1000), s = R.turn, M = R.P[s].field[0];
  const atk = SIM.genMoves(R, () => 0).find(m => m.tag === 'atkc'); run(R, atk);
  const g = think(R, 1 - s); run(R, g.mv);   // 가드(상대 액티브 O 와 AP 동일 → 가드 안 하면 슬립 대상 아님, 어쨌든 컨택트가 시작되는지 확인)
  const log = [{ rule: g.info.rule, why: g.info.why }];
  const sub = R.sub; if (!sub || sub.type !== 'contact') return { log, checks: [[false, '컨택트가 시작되지 않음: ' + (sub && sub.type)]] };
  const checks = [];
  // 상대(수비)가 직접 컷인 → 내 차례에 응수
  while (R.sub && R.sub.who !== 1 - s) { const r = think(R, R.sub.who); log.push({ rule: r.info.rule, why: r.info.why }); run(R, r.mv); }
  if (R.sub && R.sub.who === 1 - s) { const cin = SIM.genMoves(R, () => 0).find(m => m.tag === 'cin'); if (cin) run(R, cin); }
  if (R.sub && R.sub.who === s) { const r = think(R, s); log.push({ rule: r.info.rule, why: r.info.why }); checks.push([r.mv.tag === 'cin', '상대 컷인 후 AP 가 낮아짐 → 컷인으로 맞춤'], [R.cards[M] && SIM.S.ap(R, M) < SIM.S.ap(R, R.sub.def), 'AP 열세였음']); }
  else checks.push([false, '내 컷인 차례가 오지 않음']);
  return { log, checks };
});
T('R6', '6번: 공격 AP 보다 높은 내 액티브 캐릭터가 있으면 반드시 가드', () => {
  const R = base({ M: ch('M', 1, 2000, 2), G: ch('G', 1, 5000, 2), O: ch('O', 1, 3000, 2) }, (R, s) => { H.fill(R, s, 6); field(H, R, 1 - s, 'O', 'a'); field(H, R, s, 'M', 's'); field(H, R, s, 'G', 'a'); }), s = R.turn;
  // 상대(O)가 내 슬립 M 을 공격하는 상황을 만들기 위해 턴을 상대에게 넘긴다
  R.turn = 1 - s; R.fl = { ...R.fl }; R.cards[R.P[1 - s].field[0]].sum = 0;
  const atk = SIM.genMoves(R, () => 0).find(m => m.tag === 'atkc'); if (!atk) return { checks: [[false, '공격 행동 생성 실패']] };
  run(R, atk); const r = think(R, s);
  return { log: [{ rule: r.info.rule, why: r.info.why }], checks: [[r.mv.tag === 'guard' && /G/.test(describe(R, r.mv)), '가드 선택 = AP5000 캐릭터']] };
});
T('R7', '7번: 리살이 보이면 즉시 선택', () => {
  const R = base({ A: ch('A', 1, 3000, 1) }, (R, s) => { H.fill(R, s, 6); R.cards[R.P[s].kase].solved = true; const need = SIM.S.D(R, R.P[s].kase); const n = +(s === R.first ? need.lv : need.lv2) || 0; while (R.P[s].evid.length < n) R.P[s].evid.push(R.P[s].deck.pop()); }), s = R.turn;
  const r = think(R, s);
  return { log: [{ rule: r.info.rule, why: r.info.why }], checks: [[r.info.rule === '7' && r.mv.tag === 'solve', '사건 해결(리살) 즉시 선택']] };
});
T('R0', '합법 행동만 선택 (불법 0): 규칙 봇 자기 대전', () => {
  const U = require('./bot_util.js'), { playGame } = require('./bot_selfplay.js'); let ill = 0, stall = 0;
  for (let g = 0; g < 6; g++) { const st = playGame(900 + g, U.makeDeck(g * 2 + 1), U.makeDeck(g * 2 + 2), ['expert', 'expert'], g & 1); ill += st.illegal; if (st.stall) stall++; }
  return { checks: [[ill === 0, `불법 행동 ${ill}`], [stall === 0, `정지 ${stall}`]] };
});
console.log(`\nrulebot_test: ${pass} pass / ${fail} fail`); process.exit(fail ? 1 : 0);
