// WG-AI v0.17 — 턴 플래너 도입: "매 턴 상대 현장을 전부 비운다"를 목표로 턴 전체(전개·힌트·선언·공격·추리 순서)를 룰 엔진 시뮬레이션으로 탐색해 수순을 정한다 (bot/whitegreen/planner.js).
//   · 내 턴의 메인/힌트/컨택 응답/효과 선택은 계획(plan)을 따른다. 실제 상태가 계획과 어긋나면(상대의 가드·컷인, 공개된 카드 등) 그 자리에서 다시 계획한다.
//   · 계획을 세울 수 없는 상태(효과 처리 중 + 계획 이탈)는 v0.16 규칙으로 결정한다. 상대 턴(가드/미스리드)·멀리건도 v0.16 그대로.
//   · 비공개 정보 규칙 유지: 플래너는 관측 상태에서만 돌고, 시뮬레이션 중 덱에서 들어온 카드(정체 모름)는 내는 재료로 쓰지 않는다.
//   · PD 규칙은 플래너의 후보/평가에 들어 있다: 8코↑/더 비싼 카드 밀어내기 금지, FILE 7 하한(죽기 직전 제외), 다른 5코↑가 있으면 마코토 아끼기, 7키드 직접 사용 금지, 현장 5/5 어시스트 금지, 이유 없는 힌트 금지, 7코 이벤트는 리무브 4장↑(3개 효과) 또는 손패가 망했을 때 '리무브에서 꺼내기'에만(2드로·슬립용 사용 금지).
const V16 = require('./v0_16.js');
const PL = require('../planner.js');
const SIM = require('../../simulate.js'), S = SIM.S;

function followPlan(c) {
  const { R, seat, moves, mem, d } = c; if (R.turn !== seat || R.phase !== 'play') return null;
  const key = PL.keyOf(R, seat), sig = PL.sigOf(R);
  const legalOf = step => moves.find(m => JSON.stringify(m.m) === JSON.stringify(step.mv.m));
  const plan = mem.plan;
  if (plan && plan.turn === R.n && plan.seat === seat) { const step = plan.steps[plan.i];
    if (step && step.key === key && step.sig === sig) { const legal = legalOf(step); if (legal) { plan.i++; return { mv: legal, rule: 'wg:plan', why: `[계획 ${plan.i}/${plan.steps.length}] ${step.desc}\n계획: ${plan.summary}\n예상: ${plan.notes.join(', ')}` }; } }
    if (step) { mem.planMiss = (mem.planMiss || 0) + 1; if (process.env.WG_PLAN_DEBUG) { const a = step.key, b = key; let i = 0; while (i < a.length && a[i] === b[i]) i++; console.error('[plan-miss]', step.desc, 'sig', step.sig === sig, 'diff@' + i, '\n P:', a.slice(Math.max(0, i - 60), i + 80), '\n L:', b.slice(Math.max(0, i - 60), i + 80)); } } }
  if (!SIM.cloneable(R)) return null;
  const nodes = +process.env.WG_PLAN_NODES || 6000, p = PL.plan(R, seat, { nodes, seed: (R.n * 131 + seat * 17 + R.P[seat].hand.length) >>> 0 });
  if (!p || !p.steps.length) return null;
  mem.plan = { turn: R.n, seat, steps: p.steps, i: 0, summary: p.summary, notes: p.notes, score: p.score, nodes: p.nodes, ms: p.ms };
  const step = p.steps[0], legal = legalOf(step); if (!legal) return null; mem.plan.i = 1;
  return { mv: legal, rule: 'wg:plan', why: `[계획 1/${p.steps.length}] ${step.desc}\n계획: ${p.summary}\n예상: ${p.notes.join(', ')} (탐색 ${p.nodes}노드 ${p.ms}ms)` }; }

// 7코 이벤트(鈴木家と京極真)의 '1개 선택' 질의(리무브 4장 미만): 계획을 벗어났을 때도 리무브 에리어에서 꺼내는 효과만 고른다 (2드로 1리무브·슬립 금지 — PD). 기본 규칙(rulebot)은 첫 선택지(2드로)를 고르므로 여기서 막는다
function ev7Opt(c) { const { R, moves } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'opt' || src == null || PL.DEF(R, src) !== PL.ID.EV7 || !/효과를 선택/.test(String(q.msg || ''))) return null;
  const L = q.labels || [], i = L.findIndex(l => /리무브 에리어|리무브에리어|登場|등장/.test(String(l))); const m = i >= 0 ? moves.find(x => x.m.v === i) : null;
  return m ? { mv: m, rule: 'wg:ev7-recover-only', why: '7코 이벤트는 리무브 에리어의 마코토/스즈키 재벌 캐릭터를 꺼내는 데만 쓴다 (2드로 1리무브·슬립은 고르지 않음)' } : null; }

// 계획을 벗어난 '버림 비용' 질의(7코 이벤트의 2드로 1리무브, 선언 비용 등 — 드로우 뒤에는 손패가 달라져 계획 키가 어긋난다): 남은 계획 수순에서 쓸 카드는 버리지 않고, 플래너의 버림 가치가 가장 낮은 카드를 버린다. 기본 규칙은 계획을 모르므로 다음에 낼 카드를 버릴 수 있다(wg017g #123: 다음 수순의 5코 경구를 버림)
function planDiscard(c) { const { R, seat, moves, mem } = c, q = R.eff && R.eff.req; if (!q || q.kind !== 'pick' || q.who !== seat || !/손패 1장을 리무브|코스트: 손패/.test(String(q.msg || '')) || (q.min || 0) < 1) return null;
  const plan = mem.plan; if (!plan || plan.turn !== R.n || plan.seat !== seat) return null;
  const rest = plan.steps.slice(plan.i), needed = new Set(); for (const st of rest) { const m = st.mv && st.mv.m; if (m && m.id != null && ['play', 'ability', 'cin'].includes(st.mv.tag)) needed.add(m.id); }
  const one = id => moves.find(m => m.m.v && Array.isArray(m.m.v) && m.m.v.length === 1 && m.m.v[0] === id), cands = (q.sel || q.ids || []).filter(id => one(id)); if (!cands.length) return null;
  const P = R.P[seat], known = new Set([...P.hand, ...P.field, ...P.file]), free = cands.filter(id => !needed.has(id)), pool = (free.length ? free : cands).slice().sort((a, b) => PL.discardValue(R, seat, a, known) - PL.discardValue(R, seat, b, known));
  const pick = pool[0], mv = one(pick); if (!mv) return null;
  return { mv, rule: 'wg:plan-discard', why: `버림: ${S.D(R, pick).n} — 남은 계획에서 쓸 카드(${[...needed].filter(id => P.hand.includes(id)).map(id => S.D(R, id).n).join(', ') || '없음'})는 남기고 버림 가치가 가장 낮은 카드` }; }

// 7코 이벤트의 슬립 대상(3개 효과 모두일 때, 계획 이탈 상태): 서 있는 상대 캐릭터 중 눕히면 내 공격수가 죽일 수 있는 것(가장 센 것부터), 없으면 가장 센 액티브. 상대가 전원 눕혀져 있으면 고르지 않음. 기본 규칙은 '0장'을 고른다
function ev7Sleep(c) { const { R, seat, moves } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'pick' || src == null || PL.DEF(R, src) !== PL.ID.EV7 || !/대상 캐릭터/.test(String(q.msg || ''))) return null;
  const O = R.P[1 - seat], P = R.P[seat], one = id => moves.find(m => m.m.v && Array.isArray(m.m.v) && m.m.v.length === 1 && m.m.v[0] === id), none = moves.find(m => m.m.v && Array.isArray(m.m.v) && m.m.v.length === 0);
  const act = (q.sel || q.ids || []).filter(id => O.field.includes(id) && R.cards[id].st === 'a' && one(id)); if (!act.length) return none ? { mv: none, rule: 'wg:ev7-sleep-none', why: '7코 이벤트 슬립: 서 있는 상대 캐릭터가 없어 고르지 않음' } : null;
  const myAtk = P.field.filter(x => R.cards[x].st === 'a').map(x => PL.effAP(R, x)), best = Math.max(0, ...myAtk);
  const killable = act.filter(id => PL.effAP(R, id) <= best).sort((a, b) => PL.effAP(R, b) - PL.effAP(R, a)), pick = killable[0] != null ? killable[0] : act.slice().sort((a, b) => PL.effAP(R, b) - PL.effAP(R, a))[0];
  return { mv: one(pick), rule: 'wg:ev7-sleep', why: `7코 이벤트 슬립: ${S.D(R, pick).n}(AP${PL.effAP(R, pick)}) — ${killable.length ? '눕히면 내 공격수가 죽일 수 있음' : '가장 센 서 있는 캐릭터'}` }; }

// 미스리드(鈴木綾子 ミスリード1): v0.16 규칙(상대 FILE 5+ 면 돌격 위험으로 사용 안 함)에 '리살 저지' 예외 — 이 추리로 상대 증거가 해결 수에 닿으면(= 이 턴에 패배 가능) 綾子를 잃더라도 미스리드로 1장 깎는다. 고수 자료: 미스리드는 추리로 이기는 덱에 대한 수비의 핵심
function misread(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.type !== 'mis') return V16.hooks.misread(c);
  const os = 1 - seat, O = R.P[os]; let need = 0; try { need = +(os === R.first ? S.D(R, O.kase).lv : S.D(R, O.kase).lv2) || 0; } catch (e) {}
  let lpv = 0; try { lpv = u.rs === 'p' ? (+S.D(R, O.partner).lp || 0) : S.lpOf(R, u.rs); } catch (e) {}
  if (need > 0 && lpv > 0 && O.evid.length + lpv >= need) {
    const want = moves.filter(m => m.m.ids && m.m.ids.length > 0).sort((a, b) => b.m.ids.length - a.m.ids.length)[0];
    if (want && O.evid.length + Math.max(0, lpv - want.m.ids.length) < need) return { mv: want, rule: 'wg:misread-lethal', why: `상대 추리 LP${lpv} 로 증거 ${O.evid.length}→${O.evid.length + lpv} = 해결 수 ${need} 에 닿음 → 미스리드 ${want.m.ids.map(id => S.D(R, id).n).join(', ')} (LP-${want.m.ids.length})로 저지 (돌격에 잡힐 위험보다 패배 위험이 큼)` }; }
  return V16.hooks.misread(c); }

function main(c) { try { const r = followPlan(c); if (r) return r; } catch (e) { c.mem.planErr = String(e && e.message); } return V16.hooks.main(c); }
// 수비 컷인(고수 자료 「キャラを守る＝実質証拠一つ追加」, PD wg017i #24): 내 캐릭터가 수비 중(가드 포함)이고 상대 컷인/AP 로 지는 상황이면, 2000 컷인으로 이길 수 있을 때 던져서 살린다. MR 컷인은 쓰지 않음(최후 수단은 v0.16 규칙에 맡김)
function defendCutin(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.type !== 'contact' || R.cards[u.def].o !== seat) return null;
  const me = u.def, op = u.atk, myAp = PL.effAP(R, me), oAp = PL.effAP(R, op); if (myAp >= oAp) return null;   // 지금 이기고 있으면 아낀다
  const cv = id => { let m = 0; try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} return m; };
  const ok = moves.filter(m => m.tag === 'cin' && PL.DEF(R, m.m.id) !== PL.ID.MR && myAp + cv(m.m.id) >= oAp).sort((a, b) => cv(a.m.id) - cv(b.m.id))[0]; if (!ok) return null;
  // 상대가 이미 컷인/변장을 썼으면(한 컨택에 한쪽 1장) 되받기는 확정 → 항상. 내가 먼저(AP 낮은 쪽) 눈치로 던지는 경우는 상대가 되받을 수 있으니 살릴 가치가 큰 캐릭터(Lv6↑·LP2↑·京極真)일 때만
  const oppUsed = !!(u.used && u.used[1 - seat]); let lvv = 0, lpv = 0; try { lvv = +S.D(R, me).lv || 0; lpv = +S.D(R, me).lp || 0; } catch (e) {}
  if (!oppUsed && !(lvv >= 6 || lpv >= 2 || PL.DEF(R, me) === PL.ID.MAKOTO)) return null;
  return { mv: ok, rule: 'wg:defend-cutin', why: `수비 컷인: ${S.D(R, me).n}(AP${myAp}) vs 공격자 ${S.D(R, op).n}(AP${oAp}) → 컷인 +${cv(ok.m.id)} 으로 AP${myAp + cv(ok.m.id)}, 캐릭터를 살림 (공식 룰상 AP 낮은 쪽이 먼저 선언했으므로 상대 컷인을 보고 되받는 자리)` }; }

function contact(c) { try { const r = followPlan(c); if (r) return r; } catch (e) { c.mem.planErr = String(e && e.message); } const dc = defendCutin(c); if (dc) return dc; return V16.hooks.contact(c); }
function eff(c) { try { const r = followPlan(c); if (r) return r; } catch (e) { c.mem.planErr = String(e && e.message); }
  try { const pd = planDiscard(c); if (pd) return pd; } catch (e) { c.mem.planErr = String(e && e.message); }
  const e7 = ev7Opt(c) || ev7Sleep(c); if (e7) return e7; return V16.hooks.eff(c); }

module.exports = { id: '0.17', label: 'WG-AI v0.17', date: '2026-10',
  notes: 'v0.16 + 턴 플래너(상대 현장 전부 정리 목표, 룰 엔진 시뮬레이션 탐색). v0.16 = v0.15 + 서치 후보 표시/서치 오판 수정 등. ' + V16.notes,
  hooks: { main, eff, removeTarget: eff, guard: V16.hooks.guard, contact, misread }, ROLE: V16.ROLE };
