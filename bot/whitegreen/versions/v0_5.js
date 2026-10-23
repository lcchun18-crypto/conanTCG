// WG-AI v0.5 — PD 피드백 4차(self-play 004 리뷰): 미스리드 조건, 변장 대비(수비 블록 금지/공격 블록 회피), 사건 공격이 막히면 추리, 소노코 우선 등장·액티브 우선·사건효과 연계,
//   10000 공격 전에 마코토 먼저, FILE 8+ 에서는 추리 금지(전개 우선), 헤이지 첫 세트=돌격, 안 움직인 캐릭터를 밀어내지 않음, 턴 시작 리살 체크(큰 예산).
// (아래는 v0.4 설명) WG-AI v0.4 — PD 피드백 3차(self-play 003 리뷰): 변장(키드) 적극 사용·변장 계산, 막힐 땐 액션 대신 추리, LP0 추리 금지, MR 첫 장 무조건,
//   8코는 AP8000 먼저(헤이지/경구), 카이토는 MR 로 리무브에서, 9-8-7 콤보(마코토 마지막) 때는 먼저 내놓고 액션, 10000 컷인, 의미 없는 3코 서치/버림 금지, MR 컷인 최후수단.
// (아래는 v0.3 설명) WG-AI v0.3 — PD 피드백 2차(self-play 002 리뷰) 반영: v0.2 규칙 + 아래 R8~R12.
//   R8 이벤트로 등장시킬 캐릭터가 있으면 반드시 낸다(후공 1턴 이벤트→2코). R9 현장이 가득 찼으면 등장 효과로 더 비싼 캐릭터를 밀어내지 않는다.
//   R10 상대가 막을 수 있는 공격은 가장 센 블로커 기준으로 계산(막혀서 지면 하지 않음). R11 MR(9코)은 리무브 에어리어에 8코 대상이 있을 때만 선언, 없으면 돌격으로만 사용하고 미리 8코를 리무브에 버림.
//   R12 약한 캐릭터로 블록할 수 있으면 비싼 캐릭터 대신 블록.
// (아래는 v0.2 설명) WG-AI v0.2 — PD 피드백 1차(self-play 001 리뷰) 반영. 기반은 v0.1(Expert 규칙 스크립트)이고, 아래 "PD 규칙"만 main/eff 훅으로 덮어쓴다.
// 카드 id 분기 대신 "역할" 표(ROLE)로 묶어 둔다 — 새 카드/콤보가 생기면 표와 규칙만 늘리면 된다.
//  PD 규칙 (모두 근거를 Decision Log 에 남김)
//   R1 1코 서치 이벤트(ENGINE_EVENT)가 있으면 캐릭터보다 먼저 쓴다 (특히 후공 1턴: 이벤트 → 2코 캐릭터)
//   R2 턴패스(아무것도 못 내는 턴)면 추리하지 않는다 — 증거를 늦게 쌓아 상대의 종료를 늦춘다
//   R3 캐릭터는 가능하면 행동(컨택/증거 공격)을 다 한 뒤에 낸다 (상대에게 전략 노출 ↓). 예외: 등장 시 제거로 길을 열어야 하는 경우
//   R4 사건 효과(CASE_BOOST)는 "확실히 죽일 수 있을 때만" — 내 AP(+MR 버프+손패 컷인) ≥ 상대 AP + 2000
//   R5 6코 소노코(FORCED_CONTACT)는 혼자 슬립 금지. 강한 캐릭터가 먼저 행동해 눕고, 그 캐릭터가 확실히 죽일 수 있는 상대에게 강제 컨택
//   R6 7코 마코토(FINISHER)는 다른 낼 카드가 있으면 아낀다 (턴패스가 되는 경우는 예외)
//   R7 자살 공격 금지 (내 AP + 버프 + 컷인 < 상대 AP), 액티브 캐릭터를 우선 제거
const SIM = require('../../simulate.js'), S = SIM.S;
const ROLE = { ENGINE_EVENT: ['id_0130'], CASE_BOOST: ['id_1156'], FORCED_CONTACT: ['id_1096'], FINISHER: ['id_1097'], MR_BUFF: ['id_1153'], REMOVER_ON_PLAY: ['id_0873'], DISCARDER: ['id_0688'], DISGUISE: ['id_0205'], LV8_8000: ['id_0188', 'id_0688'], FETCH3: ['id_0308'] };
const is = (role, def) => ROLE[role].includes(def);
const defOf = (R, id) => { const c = R.cards[id]; return c ? String(c.d).replace(/^\d+:/, '') : ''; };
const nm = (R, id) => { try { return S.D(R, id).n; } catch (e) { return '?'; } };
const act = (R, id) => R.cards[id] && R.cards[id].st === 'a';

const mrTarget = (R, id) => { try { const d = S.D(R, id), nmv = [d.n, ...(d.ab || []).filter(a => a.ic === 'static' && a.nm).map(a => a.nm)], lv = S.FX.lvOf(R, id);
  const asl = String(d.kw || '').includes('assault') || (d.ab || []).some(a => a.ic === 'static' && a.kw === 'assault'); return lv <= 8 && asl && nmv.some(n => n === '服部平次' || n === '怪盗キッド'); } catch (e) { return false; } };
const hasMR = (R, P) => P.hand.concat(P.field, [P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
const remHasTarget = (R, P) => P.rem.some(id => mrTarget(R, id));
function ctxOf(c) { const { R, seat, helpers: H } = c, P = R.P[seat], O = R.P[1 - seat];
  const lv = id => H.lvOf(R, id), ap = id => H.apOf(R, id);
  const hasBuff = P.field.concat([P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
  const cutin = ex => { let m = 0; for (const id of P.hand) { if (id === ex || is('MR_BUFF', defOf(R, id))) continue; /* MR 은 내는 것이 기본 — 컷인으로 세지 않음 */ try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} } return m; };
  const kid = P.hand.find(id => is('DISGUISE', defOf(R, id))), disg = kid != null && P.file.length >= 6;      // 키드 변장 가능(FILE 6 이상): 컨택 중 AP 7000 캐릭터로 교체
  const power0 = id => ap(id) + (hasBuff && lv(id) >= 8 ? 2000 : 0), power = id => Math.max(power0(id), disg && id !== kid ? 7000 : 0);             // 컨택 시 내 기본 AP(버프 포함, 컷인 제외)
  const blockers = O.field.filter(x => act(R, x) && !S.FX.hasKwTk(R, x, 'cantguard'));
  const guardAp = t => Math.max(ap(t), ...blockers.map(ap));                       // R10: 상대가 가장 센 액티브로 막을 수 있다고 가정
  const margin = (a, t) => power(a) + cutin(a) - guardAp(t);                      // 컷인까지 계산한 내 우위 (막힐 경우 포함)
  const marginF = (a, t) => power(a) + cutin(a) - ap(t);                          // 막을 수 없는 강제 컨택용
  const sure = (a, t) => margin(a, t) >= 2000;                                    // 상대가 +2000 컷인해도 막지 못함
  const sureF = (a, t) => marginF(a, t) >= 2000;
  const win = (a, t) => power(a) - guardAp(t) >= 0 || sure(a, t);                 // v0.4: 컷인에 기대는 동타성 공격은 '이긴다'로 치지 않음 (컷인은 확실한 킬일 때만)
  return { R, seat, P, O, lv, ap, power, power0, disg, kid, cutin, margin, marginF, sure, sureF, win, hasBuff, blockers }; }

function atkMoves(c) { return c.moves.filter(m => m.tag === 'atkc').map(m => ({ m, a: m.m.id, t: m.m.tid })); }
function bestAttack(c, X, minWin = true) {                                    // 점수: 확실한 킬 > 승리, 액티브 우선, 높은 레벨, 약한 공격자로
  const L = atkMoves(c).filter(x => minWin ? X.win(x.a, x.t) : true).map(x => ({ ...x, sure: X.sure(x.a, x.t), tAct: act(X.R, x.t), tLv: X.lv(x.t), aAp: X.ap(x.a) }));
  L.sort((p, q) => (q.sure - p.sure) || (q.tAct - p.tAct) || (q.tLv - p.tLv) || (p.aAp - q.aAp)); return L[0] || null; }
const why = (a, t, X) => `${nm(X.R, a)}(AP${X.ap(a)}${X.hasBuff && X.lv(a) >= 8 ? '+MR2000' : ''}${X.cutin(a) ? '+컷인' + X.cutin(a) : ''}) → ${nm(X.R, t)}(AP${X.ap(t)}${act(X.R, t) ? ', 액티브' : ', 슬립'})`;

function main(c) { const X = ctxOf(c), { R, seat, P, O, moves, base, mem } = { ...X, moves: c.moves, base: c.base, mem: c.mem };
  const by = tag => moves.filter(m => m.tag === tag), played = !!R.fl.played, mv = (m, rule, w, f) => ({ mv: m, rule, why: w, factors: f });
  const baseTag = base.mv.tag, pending = mem.plan && mem.plan.turn === R.n && mem.plan.seat === seat ? mem.plan : null;
  if (baseTag === 'solve') return null;                                                  // 사건 해결은 기본 규칙(리살 탐색) 그대로
  // 대안 수: 이길 수 있는 공격 → (턴패스 방지) 낼 수 있는 카드 → 증거 공격 → 종료. 마코토는 다른 선택지가 없을 때만.
  const fallback = () => { const b = bestAttack(c, X); if (b) return b.m;
    const pl = by('play').filter(m => !is('FINISHER', defOf(R, m.m.id))).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0] || by('play')[0]; if (!played && pl) return pl;
    return by('atkk')[0] || moves.find(m => m.tag === 'end'); };
  if (pending && pending.via === 'case') { const pm = atkMoves(c).find(x => x.a === pending.att && x.t === pending.tid); if (pm && X.win(pm.a, pm.t)) { mem.plan = null; return mv(pm.m, 'wg:case-attack', `사건 효과를 준 ${why(pm.a, pm.t, X)} 로 공격 (계획대로)`); } }
  const plays = by('play');
  const abil = by('ability').map(m => ({ m, def: defOf(R, m.m.id) }));
  const chars = P.field.filter(id => R.cards[id].st);
  // ── v0.4 선행 규칙 ──
  const lpOf = id => { try { return S.lpOf(R, id); } catch (e) { return 1; } };
  // 턴 시작/매 행동: 내가 이번 턴에 게임을 끝낼 수 있는가? (추리 연쇄 + 사건 해결) — 큰 예산으로 먼저 확인
  if (baseTag !== 'solve') { try { const LT = require('../../tactics/lethal.js'), rp = LT.report(R, seat);
    if (rp.state === 'ok' && (rp.verdict.A || rp.verdict.B || rp.verdict.C)) { const sol = by('solve')[0]; if (sol) return mv(sol, 'wg:lethal', `사건 해결 가능(증거 ${P.evid.length}/${rp.need}) → 즉시 해결`);
      if (rp.verdict.A) { const rs = by('reason').filter(m => m.m.who === 'p' || lpOf(m.m.who) > 0).sort((p, q) => (q.m.who === 'p' ? 0 : lpOf(q.m.who)) - (p.m.who === 'p' ? 0 : lpOf(p.m.who)))[0]; if (rs) return mv(rs, 'wg:lethal', `리살 체크: 추리만으로 증거 ${rp.A}/${rp.need} 가능 → 살아있는 캐릭터로 계속 추리`, { lethal: { A: rp.A, B: rp.B, C: rp.C, need: rp.need } }); }
      const r2 = LT.solve(R, seat, { ms: 2500, nodes: 15000 }); if (r2.found && r2.mv) { const lm = moves.find(m => JSON.stringify(m.m) === JSON.stringify(r2.mv.m)); if (lm) return mv(lm, 'wg:lethal', '리살 체크(큰 예산 탐색): 이번 턴 승리 시퀀스 발견'); } } } catch (e) {} }
  const reasonOK = () => by('reason').filter(m => m.m.who === 'p' || lpOf(m.m.who) > 0);
  const turnpass = !played && !plays.length && !by('hint').length;
  const maco = P.hand.find(id => is('FINISHER', defOf(R, id))), macoOn = P.field.some(id => is('FINISHER', defOf(R, id)));
  const eight = P.field.filter(id => X.lv(id) >= 8 && X.ap(id) >= 8000), ten = P.field.filter(id => !is('FINISHER', defOf(R, id)) && act(R, id) && X.power(id) + X.cutin(id) >= 10000), comboReady = ten.length > 0 && (maco != null || macoOn);
  if (baseTag === 'reason' && base.mv.m.who !== 'p' && lpOf(base.mv.m.who) <= 0) { const alt = reasonOK()[0] || fallback(); return mv(alt, 'wg:no-lp0-reason', `LP 0 인 ${nm(R, base.mv.m.who)}는 추리하지 않음`); }
  // 첫 MR(9코)은 무조건: 낼 수 있으면 내고, 어시스트로 낼 수 있으면 어시스트
  if (!played && !P.field.concat([P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)))) { const mrP = plays.find(m => is('MR_BUFF', defOf(R, m.m.id)));
    if (mrP) return mv(mrP, 'wg:mr-first', '첫 MR(9코)은 무조건 먼저 냄 — 컨택 시 Lv8 이상 AP+2000 효과가 가장 강력');
    const mrH = P.hand.find(id => is('MR_BUFF', defOf(R, id))), asst = by('assist')[0]; if (mrH != null && asst && P.file.length + 1 >= X.lv(mrH)) return mv(asst, 'wg:mr-first', `어시스트로 FILE ${P.file.length + 1} → MR(9코)을 낼 수 있음 — 추리보다 높은 코스트 전개 우선`); }
  // 9-8-7 콤보: MR + AP8000(Lv8)이 있고 마코토가 손패에 있으면 마코토까지 먼저 내놓고(필요하면 힌트) 액션
  if (comboReady && maco != null && !macoOn) { const mp = plays.find(m => m.m.id === maco); if (mp) return mv(mp, 'wg:combo-987', `10000 공격 가능(${nm(R, ten[0])} AP${X.power(ten[0])}${X.cutin(ten[0]) ? '+컷인' + X.cutin(ten[0]) : ''}) → 마코토를 먼저 내서 마코토 효과가 터지게 함 (10000으로 때린 뒤에 내면 효과 불발)`);
    if (by('hint').length && P.file.length - 1 >= X.lv(maco)) return mv(by('hint')[0], 'wg:combo-hint', '9-8-7 콤보: 마코토를 내기 위해 넥스트 힌트로 FILE 을 낮춤'); }
  // R4/R5 준비: 지금 합법인 공격 중 "확실한 킬"
  const sureAtk = atkMoves(c).filter(x => X.sure(x.a, x.t));
  // R4 사건 효과: 확실한 킬이 있을 때만 (함수: 소노코 규칙과 순서를 맞추기 위해)
  const caseAb = abil.find(x => is('CASE_BOOST', x.def));
  const caseRule = () => { if (!caseAb) return null;
    if (sureAtk.length && !pending) { const b = bestAttack(c, X); mem.plan = { turn: R.n, seat, att: b.a, tid: b.t, via: 'case' };
      return mv(caseAb.m, 'wg:case-sure', `사건 효과(서치) 사용 — 확실히 죽일 수 있는 공격이 있음: ${why(b.a, b.t, X)} (내 AP+버프+컷인 ≥ 상대 AP+2000)`, { plan: mem.plan.via }); }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === caseAb.def && !sureAtk.length) { const alt = fallback(); return mv(alt, 'wg:case-hold', '사건 효과(서치)는 실패하면 타격이 커서, 확실히 죽일 수 있는 공격(내 AP+버프+컷인 ≥ 상대 AP+2000)이 생길 때까지 사용하지 않음'); }
    return null; };
  // R5 6코 소노코: 혼자 슬립 금지 / 확실한 킬 대상이 있을 때만 / 먼저 강한 캐릭터가 눕는다
  const sono = abil.find(x => is('FORCED_CONTACT', x.def));
  const sleeping = P.field.filter(id => R.cards[id].st === 's' && !is('FORCED_CONTACT', defOf(R, id)));
  const sonoOnField = P.field.find(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id));
  const forcedOk = (a, t) => act(R, t) ? X.marginF(a, t) >= 1000 : X.sureF(a, t);                 // 액티브 대상은 막을 수 없는 컨택이므로 +1000 이면 허용(액티브 우선), 슬립 대상은 확실한 킬(+2000)만
  const bestForced = () => { let best = null; for (const a of sleeping) for (const t of O.field) { if (!forcedOk(a, t)) continue; const k = [act(R, t) ? 1 : 0, X.lv(t), -X.ap(a)]; if (!best || k[0] > best.k[0] || (k[0] === best.k[0] && (k[1] > best.k[1] || (k[1] === best.k[1] && k[2] > best.k[2])))) best = { a, t, k }; } return best; };
  const prepRule = () => { if (!(sonoOnField && P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved)) return null;              // 소노코가 있고 해결편: 먼저 (약한) 캐릭터가 추리/증거 액션으로 눕는다
    const cand = [...by('atkk').map(m => ({ id: m.m.id, m, k: 'atkk' })), ...reasonOK().filter(m => m.m.who !== 'p').map(m => ({ id: m.m.who, m, k: 'reason' }))].filter(x => x.id !== sonoOnField && act(R, x.id));
    for (const t of O.field.slice().sort((a, b) => X.ap(b) - X.ap(a))) { const a = cand.filter(x => X.sureF(x.id, t)).sort((p, q) => (X.blockers.length ? (q.k === 'reason') - (p.k === 'reason') : 0) || X.ap(p.id) - X.ap(q.id))[0];
      if (a) return mv(a.m, 'wg:sonoko-prep', `먼저 ${nm(R, a.id)}(AP${X.ap(a.id)})가 ${a.k === 'reason' ? '추리' : '증거 액션'}로 눕는다 → 그 뒤 소노코 효과로 ${nm(R, t)}(AP${X.ap(t)})에 확실한 강제 컨택${X.disg && X.power(a.id) === 7000 ? ' (키드 변장으로 AP7000)' : ''} — 소노코가 혼자 눕지 않도록`); } return null; };
  if (sono) { const f = bestForced();
    if (f) { if (caseAb && !pending) { mem.plan = { turn: R.n, seat, att: f.a, tid: f.t, via: 'case-sono' }; return mv(caseAb.m, 'wg:case-sono', `사건 효과(서치)를 먼저 — 곧 소노코 강제 컨택으로 ${nm(R, f.a)}가 ${nm(R, f.t)}를 확실히 죽임 (죽이면 서치 발동)`); }
      mem.plan = { turn: R.n, seat, att: f.a, tid: f.t, via: 'sonoko' }; return mv(sono.m, 'wg:sonoko-forced', `소노코 강제 컨택 — 이미 누운 ${nm(R, f.a)}가 ${nm(R, f.t)}(AP${X.ap(f.t)}${act(R, f.t) ? ', 액티브 우선' : ''})를 확실히 죽일 수 있음 (${X.marginF(f.a, f.t)} 우위)`); }
    { const pr = prepRule(); if (pr) return pr; }
    { const cr = caseRule(); if (cr) return cr; }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === sono.def) { const alt = fallback(); if (alt) return mv(alt, 'wg:sonoko-hold', '소노코 효과를 쓰면 확실한 킬이 없어 혼자 슬립만 하게 됨 → 사용 안 함(턴패스가 되지 않도록 다른 행동 선택)'); } }
  else { const pr = prepRule(); if (pr) return pr; const cr = caseRule(); if (cr) return cr; }
  // R11 MR(9코): 리무브 에어리어에 8코 대상이 없으면 선언 금지(자기만 죽음) → 돌격으로만 사용. 대상이 없고 손패에 8코가 있으면 먼저 리무브로 보냄(경구 효과/해결편 효과)
  const mrAb = abil.find(x => is('MR_BUFF', x.def)), remOK = remHasTarget(R, P);
  if (mrAb && !remOK && baseTag === 'ability' && defOf(R, base.mv.m.id) === mrAb.def) { const alt = fallback(); return mv(alt, 'wg:mr-hold', 'MR 선언 효과는 리무브 에어리어에 8코(돌격) 대상이 없으면 자신만 슬립/이동하므로 사용하지 않음 — 돌격 캐릭터로 사용'); }
  if (hasMR(R, P) && !remOK && !played) { const cand = P.hand.some(id => mrTarget(R, id) && !is('MR_BUFF', defOf(R, id)));
    if (cand) { const dis = plays.find(m => is('DISCARDER', defOf(R, m.m.id))); if (dis) return mv(dis, 'wg:mr-prep', `MR 이 있고 리무브 에어리어에 8코가 없음 → 경구(${nm(R, dis.m.id)})를 먼저 내서 효과로 8코를 리무브에 버림`);
      const dab = abil.find(x => is('DISCARDER', x.def)); if (dab) return mv(dab.m, 'wg:mr-prep', 'MR 준비: 경구 선언 효과(손패 리무브)로 8코를 리무브 에어리어에 버림'); } }
  // 소노코 우선 등장: 해결편 + 키드 변장 가능(FILE 6+)이고 AP5000 이하 대상이 있으면, 어시스트 후에도 소노코를 먼저 내서 (약한 캐릭터 추리 → 강제 컨택+변장) 콤보 준비
  if (!played && P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved && X.disg) { const sp = plays.find(m => is('FORCED_CONTACT', defOf(R, m.m.id)));
    if (sp && O.field.some(t => X.ap(t) <= 5000)) return mv(sp, 'wg:sonoko-first', '소노코(6코)를 먼저 냄 — 해결편 + 키드 변장(FILE 6+): 약한 캐릭터로 추리 → 소노코 강제 컨택 + 변장(AP7000)으로 AP5000 이하를 확실히 처리'); }
  // 안 움직인 캐릭터가 있으면 끝내지 않는다 (이길 수 있는 공격이 있는데 턴 종료)
  if (baseTag === 'end' && !turnpass) { const b = bestAttack(c, X); if (b && (b.sure || X.power(b.a) >= X.guardAp(b.t))) return mv(b.m, 'wg:attack-before-end', `행동하지 않은 캐릭터가 있음 → 턴 종료 전에 공격: ${why(b.a, b.t, X)}`); }
  // 사건 공격(증거 액션)은 막힐 수 있다 — 블로커보다 약하면(변장 불가) 행동권만 잃으므로 추리로
  if (baseTag === 'atkk' && X.blockers.length) { const att = base.mv.m.id, worst = Math.max(...X.blockers.map(X.ap)); if (X.power(att) + X.cutin(att) < worst + 0) { const rs = reasonOK().filter(m => m.m.who !== 'p' && lpOf(m.m.who) > 0).sort((p, q) => X.ap(p.m.who) - X.ap(q.m.who))[0];
      if (rs && !turnpass && P.file.length < 8) return mv(rs, 'wg:reason-over-blocked', `사건 공격(${nm(R, att)} AP${X.power(att)})은 상대 블로커(AP${worst})에 막혀 행동권만 잃음(변장 없음) → ${nm(R, rs.m.who)} 추리로 대체`);
      const alt = fallback(); if (alt && alt.tag !== 'atkk') return mv(alt, 'wg:no-blocked-attack', `막히는 사건 공격(${nm(R, att)} AP${X.power(att)} < 블로커 AP${worst}) 대신 다른 행동`); } }
  // FILE 8~9 이후에는 (극도로 유리한 경우 제외) 추리하지 않고 전개: 낼 수 있으면 내고, 힌트로 연속 전개, 어시스트로 8코 전개
  if (P.file.length >= 8 && baseTag === 'reason' && !/리살|해결/.test(String(base.why || ''))) { const hi = plays.filter(m => { try { return S.D(R, m.m.id).type === 'char'; } catch (e) { return false; } }).sort((a, b) => X.lv(b.m.id) - X.lv(a.m.id))[0];
    if (!played && hi) return mv(hi, 'wg:late-deploy', `FILE ${P.file.length}: 추리 대신 전개 — ${nm(R, hi.m.id)}(Lv${X.lv(hi.m.id)}) (FILE 8~9 이후 추리는 극도로 유리한 경우뿐)`);
    const hint = by('hint')[0]; if (hint && P.hand.some(id => { try { return S.D(R, id).type === 'char' && X.lv(id) <= P.file.length - 1 && X.lv(id) >= 7; } catch (e) { return false; } })) return mv(hint, 'wg:late-deploy', `FILE ${P.file.length}: 추리 대신 넥스트 힌트로 연속 전개(8-8-7)`);
    const asst = by('assist')[0]; if (!played && asst && P.hand.some(id => { try { return S.D(R, id).type === 'char' && X.lv(id) === P.file.length + 1 && X.lv(id) >= 8; } catch (e) { return false; } })) return mv(asst, 'wg:late-deploy', `FILE ${P.file.length}: 어시스트로 FILE ${P.file.length + 1} → 높은 코스트 전개`);
    const b = bestAttack(c, X); if (b) return mv(b.m, 'wg:late-no-reason', `FILE ${P.file.length}: 추리하지 않음 → 공격 ${why(b.a, b.t, X)}`); const e2 = moves.find(m => m.tag === 'end'); if (e2) return mv(e2, 'wg:late-no-reason', `FILE ${P.file.length}: 추리하지 않고 턴 종료`); }
  // R7 + 액티브 우선: 합법 공격 중 최선 (자살 공격 금지). 확실한 킬/승리가 있으면 캐릭터 등장보다 먼저 한다 (R3)
  const bAtk = bestAttack(c, X);
  const playMv = id => plays.find(m => m.m.id === id);
  const charPlays = plays.filter(m => { try { return S.D(R, m.m.id).type === 'char'; } catch (e) { return false; } });
  if (baseTag === 'atkc') { const b0 = base.mv.m, ok = X.win(b0.id, b0.tid);
    if (!ok) { if (bAtk) return mv(bAtk.m, 'wg:no-suicide', `자살 공격 금지: ${why(b0.id, b0.tid, X)} 는 질 수 있음 → 대신 ${why(bAtk.a, bAtk.t, X)}`); const rs = !turnpass ? reasonOK().filter(m => m.m.who !== 'p').sort((p, q) => X.ap(p.m.who) - X.ap(q.m.who))[0] : null; if (rs) return mv(rs, 'wg:reason-over-blocked', `막히거나 지는 공격(${why(b0.id, b0.tid, X)})은 행동권만 잃음 → 액션 대신 ${nm(R, rs.m.who)}로 추리`); const alt = moves.find(m => m.tag === 'end'); return mv(alt, 'wg:no-suicide', `자살 공격 금지: ${why(b0.id, b0.tid, X)} 는 질 수 있고 대안 공격도 없음 → 턴 종료`); }
    if (bAtk && (bAtk.t !== b0.tid || bAtk.a !== b0.id)) { const cur = { sure: X.sure(b0.id, b0.tid), act: act(R, b0.tid) };
      if ((bAtk.sure && !cur.sure) || (act(R, bAtk.t) && !cur.act && bAtk.sure === cur.sure)) return mv(bAtk.m, 'wg:active-first', `액티브/확실한 킬 우선: ${why(bAtk.a, bAtk.t, X)} (기본: ${why(b0.id, b0.tid, X)})`); } }
  // 아직 행동하지 않은 캐릭터를 밀어내고 등장하지 않는다: 먼저 그 캐릭터로 행동(공격 → 없으면 추리 가능 시)
  if (baseTag === 'play' && base.mv.m.rep != null) { const rp = base.mv.m.rep, unacted = act(R, rp) && !(R.fl.acted && R.fl.acted[rp]);
    if (unacted) { const own = atkMoves(c).filter(x => x.a === rp && (X.sure(x.a, x.t) || X.power(x.a) >= X.guardAp(x.t)))[0]; if (own) return mv(own.m, 'wg:act-before-push-out', `${nm(R, rp)}가 아직 행동하지 않음 → 밀어내기 전에 공격: ${why(own.a, own.t, X)}`);
      const alt = plays.filter(m => m.m.id === base.mv.m.id && m.m.rep != null && !(act(R, m.m.rep) && !(R.fl.acted && R.fl.acted[m.m.rep]))).sort((p, q) => X.lv(p.m.rep) - X.lv(q.m.rep))[0]; if (alt) return mv(alt, 'wg:push-acted', `이미 행동한 ${nm(R, alt.m.rep)}를 밀어냄 (행동 안 한 ${nm(R, rp)}는 유지)`); } }
  // R9 현장이 가득 찼을 때 스위치 등장: 가장 싼 캐릭터를 밀어내고, 등장하는 카드가 더 싸거나 같으면 하지 않음
  if (baseTag === 'play' && base.mv.m.rep != null) { const same = plays.filter(m => m.m.id === base.mv.m.id && m.m.rep != null).sort((p, q) => X.lv(p.m.rep) - X.lv(q.m.rep))[0];
    if (same && X.lv(same.m.rep) >= X.lv(base.mv.m.id)) { const alt = by('atkk')[0] || moves.find(m => m.tag === 'end'); const other = plays.filter(m => m.m.rep == null && m.m.id !== base.mv.m.id)[0]; return mv(other || alt, 'wg:no-push-out', `현장이 가득 참: ${nm(R, base.mv.m.id)}(Lv${X.lv(base.mv.m.id)})로 더 비싸거나 같은 ${nm(R, same.m.rep)}(Lv${X.lv(same.m.rep)})를 밀어내지 않음`); }
    if (same && same.m.rep !== base.mv.m.rep) return mv(same, 'wg:push-cheapest', `현장이 가득 참: 가장 싼 ${nm(R, same.m.rep)}(Lv${X.lv(same.m.rep)})를 교체 대상으로`); }
  // R1 1코 서치 이벤트 우선
  if (!played) { const ev = plays.find(m => is('ENGINE_EVENT', defOf(R, m.m.id)));
    if (ev) return mv(ev, 'wg:event-first', `1코 서치 이벤트 「${nm(R, ev.m.id)}」 우선 사용 (캐릭터보다 먼저 — 서치 후 캐릭터 등장까지 이어짐)`); }
  // R2 턴패스 시 추리 금지
  if (baseTag === 'reason' && !played && !plays.length && !by('hint').length) { const end = moves.find(m => m.tag === 'end'); if (end) return mv(end, 'wg:turnpass-no-reason', '턴패스(낼 카드가 없음)에서는 추리하지 않음 — 증거를 늦게 쌓아 상대의 종료를 늦춘다'); }
  // R6 마코토 보존 + R3 행동 먼저
  if (baseTag === 'play' || baseTag === 'assist') { const bid = base.mv.m.id, bdef = bid != null ? defOf(R, bid) : '';
    if (baseTag === 'play' && X.lv(bid) >= 8) { const same = charPlays.filter(m => X.lv(m.m.id) === X.lv(bid)), rank = id => { const d = defOf(R, id); return is('LV8_8000', d) ? (d === 'id_0188' ? 90 : 85) : d === 'id_1098' ? (hasMR(R, P) ? 10 : 60) : 70; };
      const best = same.slice().sort((p, q) => rank(q.m.id) - rank(p.m.id))[0];
      if (best && best.m.id !== bid && rank(best.m.id) > rank(bid)) return mv(best, 'wg:lv8-order', `8코는 AP8000(헤이지/경구)을 먼저${is('LV8_8000', defOf(R, best.m.id)) ? '' : ''}: ${nm(R, best.m.id)} 사용 (카이토는 MR 로 리무브에서 꺼내는 것이 가장 강력)`);
      if (defOf(R, bid) === 'id_1098' && hasMR(R, P)) { const alt = charPlays.filter(m => m.m.id !== bid).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0]; if (alt) return mv(alt, 'wg:kaito-from-rem', `8코 카이토는 손에서 내지 않고 MR 로 리무브에서 꺼냄 → 대신 ${nm(R, alt.m.id)}`); } }
    if (baseTag === 'play' && is('FINISHER', bdef) && !comboReady) { const alts = charPlays.filter(m => !is('FINISHER', defOf(R, m.m.id)) ).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id));
      if (alts.length) return mv(alts[0], 'wg:hold-finisher', `마코토(콤보 핵심)를 아끼고 대신 ${nm(R, alts[0].m.id)}(Lv${X.lv(alts[0].m.id)}) 사용 — 9→8→7 콤보에서 10000으로 2번 치고 드로우하는 것이 목표`); }
    if (baseTag === 'play' && !is('ENGINE_EVENT', bdef) && !(comboReady && maco != null) && bAtk && (bAtk.sure || X.win(bAtk.a, bAtk.t)) && !is('REMOVER_ON_PLAY', bdef))
      return mv(bAtk.m, 'wg:act-before-play', `캐릭터 등장 전에 행동부터: ${why(bAtk.a, bAtk.t, X)} — 등장은 행동 뒤로 미뤄 전략 노출을 줄임`); }
  return null; }

// 효과 선택(대상/카드): 사건 효과/소노코 계획이 있으면 계획대로
function effOpt(c) { const { R, seat } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'opt' || src == null || defOf(R, src) !== 'id_0188') return null;
  const labels = q.labels || [], iA = labels.findIndex(l => /돌격|assault|突撃/i.test(l)), iB = labels.findIndex(l => /액티브|active|アクティブ/i.test(l)); if (iA < 0 || iB < 0) return null;
  let acts = []; try { acts = S.actsFor(R, seat)[src] || []; } catch (e) {} const sick = R.cards[src].st === 'a' && !acts.length;   // 등장한 턴(행동 불가)이면 돌격, 이미 행동해 누웠으면 액티브
  const pick = sick ? iA : iB, mvv = c.moves.find(x => x.m.v === pick); return mvv ? { mv: mvv, rule: 'wg:hattori-set', why: sick ? '헤이지 등장 턴 첫 세트는 돌격 선택 → 바로 공격' : '헤이지가 이미 행동해 누움 → 액티브로 되돌려 한 번 더 공격' } : null; }
function eff(c) { const eo = effOpt(c); if (eo) return eo; const { R, seat, mem, moves } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'pick' || src == null) return null;
  const sel0 = q.sel || q.ids || [], P0 = R.P[seat], X0 = ctxOf(c), msg = String(q.msg || ''), pickV = id => c.moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === id), none = () => c.moves.find(x => x.m.v && x.m.v.length === 0);
  const full = P0.field.length >= 5, minF = Math.min(...P0.field.map(X0.lv), 99);
  if (/등장시킬/.test(msg) && (q.min || 0) === 0) {                                                  // R8/R9 등장 효과: 낼 수 있으면 가장 높은 레벨, 현장이 가득이면 더 비싼 것만
    let cs = sel0.filter(id => !full || X0.lv(id) > minF).sort((a, b) => X0.lv(b) - X0.lv(a)); const nf = cs.filter(id => !is('FINISHER', defOf(R, id))); if (nf.length) cs = nf;
    if (cs.length && pickV(cs[0])) return { mv: pickV(cs[0]), rule: 'wg:play-pick', why: `등장 효과: ${nm(R, cs[0])}(Lv${X0.lv(cs[0])}) 등장 — 등장시킬 수 있는 카드는 반드시 등장시킴(이벤트 뒤 캐릭터 미등장 방지)` };
    if (full && none()) return { mv: none(), rule: 'wg:no-push-out', why: '현장이 가득 참 — 등장 효과로 더 비싼 캐릭터를 밀어내지 않고 효과를 쓰지 않음' }; }
  if (/스위치로 리무브/.test(msg)) { const lo = sel0.slice().sort((a, b) => X0.lv(a) - X0.lv(b))[0]; if (lo != null && pickV(lo)) return { mv: pickV(lo), rule: 'wg:push-cheapest', why: `밀어낼 캐릭터: 가장 싼 ${nm(R, lo)}(Lv${X0.lv(lo)})` }; }
  if (/손패 1장을 리무브/.test(msg) && (q.min || 0) >= 1 && hasMR(R, P0) && !remHasTarget(R, P0)) { const t = sel0.filter(id => mrTarget(R, id) && !is('MR_BUFF', defOf(R, id)))[0]; if (t != null && pickV(t)) return { mv: pickV(t), rule: 'wg:mr-prep', why: `MR 대비: 8코 ${nm(R, t)}를 리무브 에어리어로 버림 (MR 선언 효과로 현장에 가져오기 위함)` }; }
  if (/덱 위 3장 확인/.test(msg) && src != null && is('ENGINE_EVENT', defOf(R, src))) { const playableHand = P0.hand.some(id => X0.lv(id) <= P0.file.length && (() => { try { return S.D(R, id).type === 'char'; } catch (e) { return false; } })());
    if (!playableHand) { const cs = sel0.filter(id => X0.lv(id) <= P0.file.length).sort((a, b) => X0.lv(b) - X0.lv(a)); if (cs.length && pickV(cs[0])) return { mv: pickV(cs[0]), rule: 'wg:search-pick', why: `서치: 손패에 바로 낼 캐릭터가 없어 FILE(${P0.file.length}) 이하인 ${nm(R, cs[0])}(Lv${X0.lv(cs[0])})를 가져옴` }; } }
  if (/세트할 캐릭터/.test(msg) && defOf(R, src) === 'id_0873') { const h = sel0.find(id => defOf(R, id) === 'id_0188'); if (h != null && pickV(h)) return { mv: pickV(h), rule: 'wg:set-on-hattori', why: '유사쿠 효과: 뒷면 세트는 헤이지에게 (세트될 때마다 액티브/돌격 → 헤이지가 2번 공격하는 기본 콤보)' }; }
  if (/리무브 에리어에서 손패에 가져올/.test(msg) && is('FETCH3', defOf(R, src))) { const best = sel0.slice().sort((a, b) => X0.lv(b) - X0.lv(a))[0];
    const meaningful = best != null && (P0.hand.some(h => X0.lv(h) < X0.lv(best)) || (is('FINISHER', defOf(R, best)) || is('FORCED_CONTACT', defOf(R, best))) && !P0.hand.some(h => defOf(R, h) === defOf(R, best)));
    if (meaningful && pickV(best)) { c.mem.fetched = best; return { mv: pickV(best), rule: 'wg:fetch', why: `리무브에서 ${nm(R, best)}를 가져옴 (버릴 더 약한 카드가 있음)` }; }
    if (none()) return { mv: none(), rule: 'wg:no-pointless-fetch', why: '가져와도 같은 카드를 다시 버리게 되어 의미 없음 → 가져오지 않음' }; }
  if (/손패 1장을 리무브/.test(msg) && (q.min || 0) >= 1 && is('FETCH3', defOf(R, src)) && c.mem.fetched != null) { const lo = sel0.filter(id => id !== c.mem.fetched).sort((a, b) => X0.lv(a) - X0.lv(b))[0]; c.mem.fetched = null; if (lo != null && pickV(lo)) return { mv: pickV(lo), rule: 'wg:discard-not-fetched', why: `방금 가져온 카드가 아닌 가장 낮은 ${nm(R, lo)}(Lv${X0.lv(lo)})를 리무브` }; }
  const def = defOf(R, src), pl = mem.plan && mem.plan.turn === R.n && mem.plan.seat === seat ? mem.plan : null; if (!pl) return null;
  const sel = q.sel || q.ids || [];
  if (is('CASE_BOOST', def) && sel.includes(pl.att)) { const m = moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === pl.att); if (m) return { mv: m, rule: 'wg:case-pick', why: `사건 효과를 받을 캐릭터: 계획한 공격자 ${nm(R, pl.att)}` }; }
  if (is('FORCED_CONTACT', def)) { const want = [pl.tid, pl.att].find(x => sel.includes(x)); if (want != null) { const m = moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === want); if (m) return { mv: m, rule: 'wg:sonoko-pick', why: `소노코 강제 컨택: ${want === pl.tid ? '대상' : '공격자'} 선택 = ${nm(R, want)}` }; } }
  return null; }

// 컨택 중 컷인/변장: 변장은 적극적으로(특히 FILE 6~7 의 낮은 AP), 10000 이 되면 마코토 효과, MR 컷인은 최후수단
function contact(c) { const { R, seat, moves, base } = c, u = R.sub; if (!u || u.type !== 'contact') return null; const X = ctxOf(c), side = R.cards[u.atk].o === seat ? 'atk' : 'def', me = u[side], op = u[side === 'atk' ? 'def' : 'atk'];
  if (me == null || op == null) return null; const myAp = X.ap(me), oAp = X.ap(op), dis = moves.filter(m => m.tag === 'dis'), cin = moves.filter(m => m.tag === 'cin'), pass = moves.find(m => m.tag === 'pass');
  const cv = id => { let m = 0; try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} return m; };
  if (dis.length && base.mv.tag !== 'dis') { const gain7 = 7000; if ((myAp <= 4000 && gain7 > myAp) || (myAp < oAp && gain7 >= oAp)) return { mv: dis[0], rule: 'wg:disguise', why: `변장 사용: 내 ${nm(R, me)} AP${myAp} → 키드 AP7000 (상대 ${nm(R, op)} AP${oAp}). 6~7 FILE 에서는 낮은 캐릭터로 컨택하고 변장하면 상대가 대응하기 어렵다` }; }
  const macoOn = X.P.field.some(id => is('FINISHER', defOf(R, id)));
  if (macoOn && side === 'atk' && !is('FINISHER', defOf(R, me)) && myAp < 10000 && cin.length) { const ok = cin.filter(m => !is('MR_BUFF', defOf(R, m.m.id)) && myAp + cv(m.m.id) >= 10000 && myAp + cv(m.m.id) >= oAp).sort((a, b) => cv(a.m.id) - cv(b.m.id))[0];
    if (ok) return { mv: ok, rule: 'wg:cutin-10000', why: `컷인으로 AP${myAp + cv(ok.m.id)} = 10000 이상 → 마코토 효과(드로우+액티브) 발동 조건. 10000 을 만들 수 있으면 항상 만든다` }; }
  if (base.mv.tag === 'cin' && is('MR_BUFF', defOf(R, base.mv.m.id)) && !(myAp < oAp && myAp + 2000 >= oAp)) { const alt = cin.find(m => !is('MR_BUFF', defOf(R, m.m.id))) || pass; if (alt) return { mv: alt, rule: 'wg:mr-no-cutin', why: 'MR 은 내는 것이 기본이라 컷인으로는 어쩔 수 없을 때만 사용' }; }
  return null; }

// 미스리드: 상대 FILE 5 이상이면 쓰지 않음(돌격으로 누운 캐릭터가 죽을 수 있음). FILE 4 이하 + 파트너(리더) 추리이면, 나를 칠 수 있는 상대 캐릭터가 없을 때만 사용
function misread(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.type !== 'mis') return null; const O = R.P[1 - seat], X = ctxOf(c), none = moves.find(m => m.m.ids && m.m.ids.length === 0);
  if (O.file.length >= 5) return none ? { mv: none, rule: 'wg:no-misread', why: `상대 FILE ${O.file.length} ≥ 5: 돌격이 나올 수 있어 미스리드로 누우면 위험 → 사용 안 함` } : null;
  if (u.rs !== 'p') return null;
  const safe = (u.ms || []).filter(id => !O.field.some(t => act(R, t) && X.ap(t) >= X.ap(id)));
  const want = moves.filter(m => m.m.ids && m.m.ids.length > 0 && m.m.ids.every(id => safe.includes(id))).sort((a, b) => b.m.ids.length - a.m.ids.length)[0];
  if (want) return { mv: want, rule: 'wg:misread', why: `상대 FILE ${O.file.length} ≤ 4 + 리더(파트너) 추리 → 돌격 없음. 상대 액티브 캐릭터 중 내 ${want.m.ids.map(id => nm(R, id)).join(', ')} 이상의 AP 가 없어 안전 → 미스리드 사용(LP-${want.m.ids.length})` };
  return none ? { mv: none, rule: 'wg:no-misread', why: '미스리드 하면 누운 캐릭터가 공격당할 수 있음 → 사용 안 함' } : null; }

// R12 가드: 내 캐릭터가 맞아 죽게 되면 더 싼 액티브 캐릭터로 블록
function guard(c) { const g0 = guard0(c); if (!g0) return g0; const { R, seat } = c, O = R.P[1 - seat]; if (g0.rule === 'wg:guard-weak' && O.file.length >= 6) return null; return g0; }
function guard0(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.atk == null || u.tk !== 'char' || u.tid == null || !R.cards[u.tid] || R.cards[u.tid].o !== seat) return null; u.def = u.tid;
  const X = ctxOf(c), gm = moves.filter(m => m.tag === 'guard'); if (!gm.length) return null; const O1 = R.P[1 - seat];
  if (O1.file.length >= 6 && c.base.mv.tag === 'guard') { const gid = c.base.mv.m.id; if (gid != null && X.ap(gid) < 7000) { const ng = moves.find(m => m.tag === 'noguard'); if (ng) return { mv: ng, rule: 'wg:no-guard-vs-disguise', why: `상대 FILE ${O1.file.length} ≥ 6: 키드 변장(AP7000)이 가능하므로 ${nm(R, gid)}(AP${X.ap(gid)})로 막지 않음` }; } }
  const aAp = X.ap(u.atk), dAp = X.ap(u.def), dies = aAp >= dAp; if (!dies) return null;
  const cheap = gm.filter(m => m.m.id !== u.def && X.lv(m.m.id) < X.lv(u.def)).sort((a, b) => X.lv(a.m.id) - X.lv(b.m.id))[0];
  if (cheap) return { mv: cheap, rule: 'wg:guard-weak', why: `${nm(R, u.def)}(Lv${X.lv(u.def)}, AP${dAp})가 AP${aAp} 공격에 리무브됨 → 더 싼 ${nm(R, cheap.m.id)}(Lv${X.lv(cheap.m.id)})로 블록` };
  return null; }

module.exports = { id: '0.5', label: 'WG-AI v0.5', date: '2026-10',
  notes: 'v0.4 + PD 피드백 4차(미스리드 조건·변장 대비 수비/공격·소노코 우선/액티브 우선/사건효과 연계·마코토 선행·FILE 8+ 무추리·헤이지 돌격·밀어내기 전 행동·리살 체크). v0.4 = v0.3 + PD 피드백 3차(변장·추리 대체·LP0·MR 첫 장·8코 순서·987 콤보·10000 컷인·서치 낭비·MR 컷인 최후수단). v0.3 = v0.2 + PD 피드백 2차(이벤트 후 등장·밀어내기 금지·막히는 공격 금지·MR 선언 조건/8코 준비·약한 캐릭터 블록). v0.2 = v0.1 + PD 피드백 1차: 이벤트 우선, 턴패스 시 추리 금지, 행동 후 등장, 확실한 킬일 때만 사건 효과, 소노코 강제 컨택 조건, 마코토 보존, 자살 공격 금지·액티브 우선.',
  hooks: { main, eff, removeTarget: eff, guard, contact, misread }, ROLE };
