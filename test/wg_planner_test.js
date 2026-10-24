// WG-AI v0.17 턴 플래너 테스트: 등록, self-play 완주(불법수 0·훅 오류 0·계획 사용률), 구성 상황에서의 킬 수, 숨은 정보 비의존, PD 하드 규칙, 계획 추종률
process.env.WG_PLAN_NODES = process.env.WG_PLAN_NODES || '1500'; process.env.WG_PLAN_MS = process.env.WG_PLAN_MS || '4000';
const SIM = require('../bot/simulate.js'), { S } = SIM, SP = require('../bot/whitegreen/selfplay.js'), OBS = require('../bot/whitegreen/observe.js'), PL = require('../bot/whitegreen/planner.js'), VERS = require('../bot/whitegreen/versions/index.js'), { WhiteGreenStrategy } = require('../bot/whitegreen/strategy.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const nm = (R, id) => { try { return S.D(R, id).n; } catch (e) { return '?'; } };
// 구성 상황: v0.16 끼리의 경기를 재현해 특정 턴 시작 상태를 꺼낸다 (v0.16 은 고정 버전이라 재현 가능)
function stateAt(seed, first, n, seat) { let R = null; SP.playMatch({ seed, first, frames: false, versionA: '0.16', onStep: (rec, R0) => { if (R0.n === n && !R && SIM.cloneable(R0) && R0.turn === seat && !R0.fl.played && !R0.fl.hint && !R0.sub) R = SIM.clone(R0); } }); return R; }
(async () => {
  // 1 등록
  ok(VERS.LATEST === '0.17' && VERS.get('0.17') && VERS.get('0.17').label === 'WG-AI v0.17', '1 v0.17 등록 + LATEST');
  ok(/v0\.17/.test(require('../bot/specialists/baekrok.js').desc), '2 백녹이기기 설명에 v0.17');
  // 2 self-play 완주 + 계획 사용률
  { let hookErr = 0, planN = 0, mainN = 0, miss = 0; const t0 = Date.now();
    for (const [seed, first] of [[11, 0], [12, 1]]) { const m = SP.playMatch({ seed, first, frames: false, maxTurns: 24 }), r = m.result;
      ok(r.ended && r.winner && r.illegalFallbacks === 0, `3 self-play seed${seed}: 종료·승자 ${r.winner}·${r.turns}턴·결정 ${r.decisions}·불법 대체 ${r.illegalFallbacks}`);
      for (const d of m.decisions) { if (d.hookError) hookErr++; if (d.kind === 'main' || d.kind === 'hint') { mainN++; if (d.rule === 'wg:plan') planN++; } } }
    ok(hookErr === 0, `4 훅 오류 0 (${hookErr})`); ok(planN >= mainN * 0.8, `5 내 턴 메인 결정의 계획 사용률 ${planN}/${mainN} (${Date.now() - t0}ms)`); }
  // 3 구성 상황에서 킬 수 (분석에서 뽑은 대표 국면)
  const cases = [
    { seed: 2, first: 0, n: 12, seat: 1, kills: 3, orDeny: 3, name: '상대 전원 액티브 4장(유사쿠 제거·이벤트7 슬립·MR선언 카이토·소노코 강제컨택) — 단, 상대 증거 6/7 이면 증거 3장 뺏기(리살 저지)도 정답' },
    { seed: 1, first: 1, n: 8, seat: 0, kills: 3, name: '경구 3장 손패 vs 액티브 4장(경구 선언 액티브 처리)' },
    { seed: 4, first: 0, n: 11, seat: 0, kills: 2, name: '이벤트7 + 경구 + 마코토 10000 연계' } ];
  for (const c of cases) { const R = stateAt(c.seed, c.first, c.n, c.seat); if (!R) { ok(false, `6 상황 재현 실패 ${c.name}`); continue; }
    const Rv = OBS.observe(R, c.seat, 777), p = PL.plan(Rv, c.seat, { nodes: 2500 });
    const O0 = Rv.P[1 - c.seat].field.length; ok(p && (p.kills >= c.kills || (c.orDeny && p.oev >= c.orDeny && p.kills >= 2)), `6 ${c.name}: 킬 ${p && p.kills}/${O0}, 상대 증거 -${p && p.oev} (목표 킬 ${c.kills}${c.orDeny ? ' 또는 증거 -' + c.orDeny : ''}) ${p && p.ms}ms — ${p && p.summary.slice(0, 140)}`); }
  // 4 숨은 정보 비의존: 상대 손패/덱 순서·내 덱 순서를 바꿔도 (이름 기준) 같은 결정
  { let n = 0, same = 0; const dsc = (R, mv) => mv ? PL.describe(R, mv, SIM.who(R).seat) : '';
    SP.playMatch({ seed: 5, first: 0, frames: false, maxTurns: 12, onStep: (rec, R) => { if (rec.n % 7 || R.phase === 'over') return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, o = 1 - seat;
      const R1 = SIM.clone(R), R2 = SIM.clone(R); const hid = R2.P[o].hand.concat(R2.P[o].deck); for (let i = hid.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [hid[i], hid[j]] = [hid[j], hid[i]]; } R2.P[o].hand = hid.slice(0, R2.P[o].hand.length); R2.P[o].deck = hid.slice(R2.P[o].hand.length); R2.P[seat].deck = R2.P[seat].deck.slice().reverse();
      const c1 = new WhiteGreenStrategy({}).choose(R1, seat, {}), c2 = new WhiteGreenStrategy({}).choose(R2, seat, {}); n++; if (dsc(R1, c1.mv) === dsc(R2, c2.mv)) same++; else console.log('   diff:', dsc(R1, c1.mv), '|', dsc(R2, c2.mv)); } });
    ok(n >= 3 && same === n, `7 숨은 정보를 바꿔도 결정 동일 (${same}/${n})`); }
  // 5 PD 하드 규칙 (후보/계획)
  { const R = stateAt(2, 0, 12, 1); const Rv = OBS.observe(R, 1, 1); const P = Rv.P[1];
    // 현장을 5장으로 채우고 8코를 밀어내는 수가 후보에 없는지
    const C = SIM.clone(Rv); const hand8 = C.P[1].hand.find(id => S.FX.lvOf(C, id) === 8 && S.D(C, id).type === 'char');
    while (C.P[1].field.length < 5) { const x = C.P[1].hand.find(id => S.D(C, id).type === 'char' && id !== hand8); if (x == null) break; C.P[1].hand = C.P[1].hand.filter(y => y !== x); C.P[1].field.push(x); C.cards[x].st = 'a'; }
    const p = PL.plan(C, 1, { nodes: 600 }); const push8 = (p ? p.steps : []).some(st => st.mv.tag === 'play' && st.mv.m.rep != null && S.FX.lvOf(C, st.mv.m.rep) >= 8); ok(p && !push8, `8 현장 5/5: 8코 밀어내기 없음 (${p && p.summary.slice(0, 80)})`);
    const kid = (p ? p.steps : []).some(st => st.mv.tag === 'play' && PL.DEF(C, st.mv.m.id) === PL.ID.KID); ok(!kid, '9 7코 키드를 직접 내지 않음');
    // FILE 7 하한: FILE(파트너 포함) 7 에서 힌트 후보 없음 (죽기 직전 아님)
    const C2 = SIM.clone(Rv); C2.P[1].file = C2.P[1].file.slice(0, 7); C2.P[1].pIn = false; C2.cards[C2.P[1].partner].st = 's'; C2.P[0].evid = C2.P[0].evid.slice(0, 1);
    const p2 = PL.plan(C2, 1, { nodes: 800 }); const hinted = (p2 ? p2.steps : []).some(st => st.mv.tag === 'hint'); ok(p2 && !hinted && C2.P[1].file.length === 7, `10 FILE 7 에서 넥스트 힌트 없음 (${p2 && p2.summary.slice(0, 80)})`);
    ok(p2 && p2.steps.every(st => !(st.mv.tag === 'play' && !new Set([...C2.P[1].hand, ...C2.P[1].file]).has(st.mv.m.id))), '11 정체를 모르는(뽑은) 카드를 내는 수 없음'); }
  // 6 계획 키: 상대 비공개 카드 정의가 달라도 같은 키
  { const R = stateAt(1, 1, 8, 0); const a = OBS.observe(R, 0, 1), b = OBS.observe(R, 0, 99); ok(PL.keyOf(a, 0) === PL.keyOf(b, 0), '12 계획 키는 상대 비공개 카드의 대역 정의에 무관'); }
  // 7 PD 피드백(영상 wg017d): 10000 컷인·사건 효과·유사쿠 대상 — 합성 상황
  const { mk: mk0 } = require('./wg_synth.js'); const mk = spec => mk0(spec, stateAt(22, 0, 8, 1) || stateAt(2, 0, 12, 1));
  try { const { R, seat } = mk({ hand: ['id_0214', 'id_0130'], field: [['id_0688', 'a'], ['id_1097', 'a']], opp: [['id_1096', 's'], ['id_1096', 's'], ['id_0308', 's']], file: 7, evid: 2, oevid: 2 });
    const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 3000 }); const cin = p.steps.some(st => st.mv.tag === 'cin'), mkDecl = p.steps.some(st => st.mv.tag === 'ability' && PL.DEF(Rv, st.mv.m.id) === PL.ID.MAKOTO);
    ok(p && cin && mkDecl, `13 경구 8000 공격에 2코 컷인으로 10000 → 마코토 +4000 → 마코토 선언 (컷인 ${cin}, 선언 ${mkDecl}) — ${p && p.summary.slice(0, 120)}`); } catch (e) { ok(false, '13 구성 실패 ' + e.message); }
  try { const { R, seat } = mk({ hand: ['id_0214'], field: [['id_0688', 'a']], opp: [['id_1096', 's'], ['id_0308', 'a']], file: 7, evid: 3, oevid: 2 });
    const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 2500 }); const ci = p.steps.findIndex(st => st.mv.tag === 'ability' && PL.DEF(Rv, st.mv.m.id) === PL.ID.CASE), ai = p.steps.findIndex(st => st.mv.tag === 'atkc');
    ok(p && ci >= 0 && ai > ci, `14 죽일 수 있는 공격이 있으면 사건 효과(돌격 서치)를 공격 전에 그 캐릭터에게 (선언 ${ci}, 공격 ${ai}) — ${p && p.summary.slice(0, 120)}`); } catch (e) { ok(false, '14 구성 실패 ' + e.message); }
  try { const { R, seat } = mk({ hand: ['id_0214', 'id_0876', 'id_0214', 'id_0564', 'id_0873', 'id_0873'], field: [['id_0308', 'a']], opp: [['id_0188', 's'], ['id_0873', 'a'], ['id_1097', 's']], file: 8, evid: 1, oevid: 3 });
    const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 4000 }); const O = Rv.P[0], oppY = O.field.find(x => PL.DEF(Rv, x) === PL.ID.YUSAKU); const removedY = p.steps.some(st => st.mv.tag === 'ans' && Array.isArray(st.mv.m.v) && st.mv.m.v.includes(oppY));
    ok(p && removedY, `15 유사쿠 등장 제거는 서 있는(공격 불가) 상대 유사쿠에게 — 가드 유도에 기대지 않음 (${removedY}) — ${p && p.summary.slice(0, 120)}`); } catch (e) { ok(false, '15 구성 실패 ' + e.message); }
  try { // 영상 wg017e #151: 선공 — 손패 헤이지·MR·유사쿠·5경구·8경구, 현장 아야코, 상대 유사쿠(a)·카이토(s)·마코토(s), 양쪽 MR 파트너 에리어, FILE 8(위: 6소노코, 아야코, 헤이지)
    const { R, seat } = mk({ hand: ['id_0188', 'id_1153', 'id_0873', 'id_0123', 'id_0688'], field: [['id_0308', 'a']], opp: [['id_0873', 'a'], ['id_1098', 's'], ['id_1097', 's']], pa: ['id_1153'], oppPa: ['id_1153'], file: ['id_0214', 'id_0214', 'id_0876', 'id_0876', 'id_0130', 'id_0188', 'id_0308', 'id_1096'], evid: 1, oevid: 3 });
    const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 6000 }); const played = p.steps.filter(st => st.mv.tag === 'play').map(st => PL.DEF(Rv, st.mv.m.id)); const combo = played.includes(PL.ID.HEIJI) && played.includes(PL.ID.YUSAKU), ginDecl = p.steps.some(st => st.mv.tag === 'ability' && PL.DEF(Rv, st.mv.m.id) === PL.ID.GIN);
    ok(p && combo && !ginDecl && p.kills >= 3, `16 헤이지→유사쿠(세트→돌격) 콤보로 전부 정리 (경구+선언으로 손패를 버리지 않음) 킬 ${p && p.kills} — ${p && p.summary.slice(0, 150)}`); } catch (e) { ok(false, '16 구성 실패 ' + e.message); }
  // 8 PD 피드백(영상 wg017f): 7코 이벤트(鈴木家と京極真)는 리무브 4장↑(3개 효과 모두)일 때 쓰고, 손패가 망했을 때도 '리무브 에리어에서 꺼내기'에만 쓴다 — 2드로·슬립을 위해 쓰느니 턴 종료
  { const ev7Steps = (Rv, p) => p.steps.filter(st => st.mv.tag === 'play' && PL.DEF(Rv, st.mv.m.id) === PL.ID.EV7), base = { field: [['id_0308', 'a']], opp: [['id_0214', 's'], ['id_0308', 'a']], file: 7, pIn: true, evid: 1, oevid: 1 };
    try { const { R, seat } = mk({ ...base, hand: ['id_0564'], rem: ['id_0873', 'id_0188'] }); const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 3000 });
      ok(p && !ev7Steps(Rv, p).length, `17a 리무브에 꺼낼 것 없음(유사쿠·헤이지만) + 손패 7코 이벤트만 → 슬립/드로우용으로 쓰지 않고 종료 (${p && p.summary.slice(0, 90)})`); } catch (e) { ok(false, '17a 구성 실패 ' + e.message); }
    try { const { R, seat } = mk({ ...base, hand: ['id_0564'], rem: ['id_1097', 'id_0873'] }); const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 3000 });
      const used = ev7Steps(Rv, p).length === 1, opt = p.steps.find(st => st.kind === 'eff' && st.mv.m.a === 'ans' && typeof st.mv.m.v === 'number'), recover = opt && opt.mv.m.v === 1, makotoOut = p.steps.some(st => /선택: 京極真/.test(st.desc));
      ok(p && used && recover && makotoOut, `17b 손패 7코 이벤트만 + 리무브에 7마코토 → 사용하되 '리무브에서 꺼내기'(선택지 1)만 (${p && p.summary.slice(0, 90)})`); } catch (e) { ok(false, '17b 구성 실패 ' + e.message); }
    try { const { R, seat } = mk({ ...base, hand: ['id_0564', 'id_0214'], rem: ['id_1097', 'id_0873'] }); const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 3000 });
      ok(p && !ev7Steps(Rv, p).length, `17c 2코 소노코를 낼 수 있으면 7코 이벤트(리무브 4장 미만)는 아낌 — 2코는 내거나 컷인으로 보유 (${p && p.summary.slice(0, 90)})`); } catch (e) { ok(false, '17c 구성 실패 ' + e.message); }
    try { const { R, seat } = mk({ ...base, hand: ['id_0564', 'id_0688'], rem: ['id_1096', 'id_0214', 'id_0214', 'id_0308'] }); const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 4000 });
      const sleptOwn = p.steps.some(st => st.kind === 'eff' && /대상 캐릭터/.test(st.sig || '') && Array.isArray(st.mv.m.v) && st.mv.m.v.some(x => Rv.P[seat].field.includes(x)));
      ok(p && ev7Steps(Rv, p).length === 1 && !sleptOwn && p.kills >= 2, `17d 리무브 4장↑ → 7코 이벤트 사용(3개 효과 모두, 슬립은 상대에게) 킬 ${p && p.kills} (${p && p.summary.slice(0, 110)})`); } catch (e) { ok(false, '17d 구성 실패 ' + e.message); } }
  // 9 고수 자료 반영(2026-10 비교 분석): 상대 모델의 저코 가드(핵심 캐릭터 보호) → 가드 요원을 먼저 치운다 / 미스리드 리살 저지 예외
  try { const { R, seat } = mk({ hand: ['id_0876'], field: [['id_0688', 'a'], ['id_1097', 'a']], opp: [['id_0873', 's'], ['id_0214', 'a']], file: 7, evid: 1, oevid: 2 }); for (const id of R.P[seat].field) R.cards[id].sum = 0;
    const Rv = OBS.observe(R, seat, 3), p = PL.plan(Rv, seat, { nodes: 4000 }); const atks = p.steps.filter(st => st.mv.tag === 'atkc').map(st => PL.DEF(Rv, st.mv.m.tid)); const iCh = atks.indexOf(PL.ID.SONO2C), iYu = atks.indexOf(PL.ID.YUSAKU);
    ok(p && p.kills >= 2 && iCh >= 0 && iYu >= 0 && iCh < iYu, `18 상대 2코 園子(a)가 유사쿠(s)를 가드로 지킨다고 보고 → 園子를 먼저 처리(선언으로 액티브 타격)하고 유사쿠를 침 (공격 순서 ${atks.map(d => d === PL.ID.SONO2C ? '園子' : d === PL.ID.YUSAKU ? '優作' : d).join('→')}, 킬 ${p && p.kills})`); } catch (e) { ok(false, '18 구성 실패 ' + e.message); }
  try { const { R, seat } = mk({ hand: ['id_0214'], field: [['id_0308', 'a']], opp: [['id_0873', 'a']], file: 7, evid: 1, oevid: 4 }); const O = R.P[0]; R.turn = 0; R.first = 1; const yu = O.field[0]; R.cards[yu].sum = 0; R.cards[yu].st = 'a';
    const e = S.dispatch(R, 0, { t: 'act', a: 'reason', who: yu }); let r = null; if (!e && R.sub && R.sub.type === 'mis') r = new WhiteGreenStrategy({ version: '0.17' }).choose(R, 1, {});
    ok(r && r.rule === 'wg:misread-lethal' && (r.mv.m.ids || []).length === 1, `19 상대 FILE ${S.fcount(R, 0)}(≥5)이지만 LP2 추리로 증거 4→6=해결 → 綾子 미스리드로 저지 (${r && r.rule})`); } catch (e) { ok(false, '19 구성 실패 ' + e.message); }
  // 10 PD 피드백(wg017i #24): 가드한 綾子가 상대 컷인에 지게 되면 2코 園子 컷인으로 되받아 살린다
  try { const { R, seat } = mk({ hand: ['id_0214', 'id_0214'], field: [['id_0308', 'a']], opp: [['id_0214', 'a']], file: 5, evid: 2, oevid: 1 }); R.turn = 0; const O = R.P[0], atk = O.field[0]; R.cards[atk].sum = 0;
    let e = S.dispatch(R, 0, { t: 'act', a: 'action', id: atk, k: 'case' }); const st = new WhiteGreenStrategy({ version: '0.17' }); let r = st.choose(R, 1, {}); const guarded = r && r.mv.tag === 'guard'; if (!e && guarded) e = S.dispatch(R, 1, r.mv.m);
    const cin = SIM.genMoves(R, () => 0).find(m => m.tag === 'cin'); if (!e && cin) e = S.dispatch(R, 0, cin.m); r = (!e && R.sub && R.sub.type === 'contact') ? st.choose(R, 1, {}) : null;
    ok(guarded && r && r.rule === 'wg:defend-cutin' && r.mv.tag === 'cin', `20 가드한 綾子(2000)가 상대 컷인(3000)에 지게 되면 수비 컷인으로 되받음 (${r && r.rule})`); } catch (e) { ok(false, '20 구성 실패 ' + e.message); }
  console.log(`\nwg_planner_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
