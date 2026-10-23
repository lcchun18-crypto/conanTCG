// WG-AI v0.2 — PD 피드백 1차(self-play 001 리뷰) 반영. 기반은 v0.1(Expert 규칙 스크립트)이고, 아래 "PD 규칙"만 main/eff 훅으로 덮어쓴다.
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
const ROLE = { ENGINE_EVENT: ['id_0130'], CASE_BOOST: ['id_1156'], FORCED_CONTACT: ['id_1096'], FINISHER: ['id_1097'], MR_BUFF: ['id_1153'], REMOVER_ON_PLAY: ['id_0873'] };
const is = (role, def) => ROLE[role].includes(def);
const defOf = (R, id) => { const c = R.cards[id]; return c ? String(c.d).replace(/^\d+:/, '') : ''; };
const nm = (R, id) => { try { return S.D(R, id).n; } catch (e) { return '?'; } };
const act = (R, id) => R.cards[id] && R.cards[id].st === 'a';

function ctxOf(c) { const { R, seat, helpers: H } = c, P = R.P[seat], O = R.P[1 - seat];
  const lv = id => H.lvOf(R, id), ap = id => H.apOf(R, id);
  const hasBuff = P.field.concat([P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
  const cutin = ex => { let m = 0; for (const id of P.hand) { if (id === ex) continue; try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} } return m; };
  const power = id => ap(id) + (hasBuff && lv(id) >= 8 ? 2000 : 0);             // 컨택 시 내 기본 AP(버프 포함, 컷인 제외)
  const margin = (a, t) => power(a) + cutin(a) - ap(t);                          // 컷인까지 계산한 내 우위
  const sure = (a, t) => margin(a, t) >= 2000;                                   // 상대가 +2000 컷인해도 막지 못함
  const win = (a, t) => margin(a, t) >= 0;
  return { R, seat, P, O, lv, ap, power, cutin, margin, sure, win, hasBuff }; }

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
  const abil = by('ability').map(m => ({ m, def: defOf(R, m.m.id) }));
  const chars = P.field.filter(id => R.cards[id].st);
  // R4/R5 준비: 지금 합법인 공격 중 "확실한 킬"
  const sureAtk = atkMoves(c).filter(x => X.sure(x.a, x.t));
  // R4 사건 효과: 확실한 킬이 있을 때만
  const caseAb = abil.find(x => is('CASE_BOOST', x.def));
  if (caseAb) { if (sureAtk.length && !pending) { const b = bestAttack(c, X); mem.plan = { turn: R.n, seat, att: b.a, tid: b.t, via: 'case' };
      return mv(caseAb.m, 'wg:case-sure', `사건 효과(서치) 사용 — 확실히 죽일 수 있는 공격이 있음: ${why(b.a, b.t, X)} (내 AP+버프+컷인 ≥ 상대 AP+2000)`, { plan: mem.plan.via }); }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === caseAb.def && !sureAtk.length) { const alt = fallback(); return mv(alt, 'wg:case-hold', '사건 효과(서치)는 실패하면 타격이 커서, 확실히 죽일 수 있는 공격(내 AP+버프+컷인 ≥ 상대 AP+2000)이 생길 때까지 사용하지 않음'); } }
  // R5 6코 소노코: 혼자 슬립 금지 / 확실한 킬 대상이 있을 때만 / 먼저 강한 캐릭터가 눕는다
  const sono = abil.find(x => is('FORCED_CONTACT', x.def));
  const sleeping = P.field.filter(id => R.cards[id].st === 's' && !is('FORCED_CONTACT', defOf(R, id)));
  const sonoOnField = P.field.find(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id));
  const bestForced = () => { let best = null; for (const a of sleeping) for (const t of O.field) { if (!X.sure(a, t)) continue; const k = [act(R, t) ? 1 : 0, X.lv(t), -X.ap(a)]; if (!best || k[0] > best.k[0] || (k[0] === best.k[0] && (k[1] > best.k[1] || (k[1] === best.k[1] && k[2] > best.k[2])))) best = { a, t, k }; } return best; };
  if (sono) { const f = bestForced();
    if (f) { mem.plan = { turn: R.n, seat, att: f.a, tid: f.t, via: 'sonoko' }; return mv(sono.m, 'wg:sonoko-forced', `소노코 강제 컨택 — 이미 누운 ${nm(R, f.a)}가 ${nm(R, f.t)}(AP${X.ap(f.t)}${act(R, f.t) ? ', 액티브' : ''})를 확실히 죽일 수 있음 (${X.margin(f.a, f.t)} 우위)`); }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === sono.def) { const alt = fallback(); if (alt) return mv(alt, 'wg:sonoko-hold', '소노코 효과를 쓰면 확실한 킬이 없어 혼자 슬립만 하게 됨 → 사용 안 함(턴패스가 되지 않도록 다른 행동 선택)'); } }
  else if (sonoOnField && P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved) {              // 소노코가 있고 해결편: 먼저 강한 캐릭터가 증거 액션으로 눕는다
    const cand = by('atkk').map(m => m.m.id).filter(id => id !== sonoOnField).map(id => ({ id, m: by('atkk').find(x => x.m.id === id) }));
    for (const t of O.field) { const a = cand.filter(x => x.m && X.sure(x.id, t)).sort((p, q) => X.ap(q.id) - X.ap(p.id))[0]; if (a) return mv(a.m, 'wg:sonoko-prep', `먼저 ${nm(R, a.id)}가 증거 액션으로 눕는다 → 그 뒤 소노코 효과로 ${nm(R, t)}(AP${X.ap(t)})에 확실한 강제 컨택 (소노코가 혼자 눕지 않도록)`); } }
  // R7 + 액티브 우선: 합법 공격 중 최선 (자살 공격 금지). 확실한 킬/승리가 있으면 캐릭터 등장보다 먼저 한다 (R3)
  const bAtk = bestAttack(c, X);
  const plays = by('play'), playMv = id => plays.find(m => m.m.id === id);
  const charPlays = plays.filter(m => { try { return S.D(R, m.m.id).type === 'char'; } catch (e) { return false; } });
  if (baseTag === 'atkc') { const b0 = base.mv.m, ok = X.win(b0.id, b0.tid);
    if (!ok) { if (bAtk) return mv(bAtk.m, 'wg:no-suicide', `자살 공격 금지: ${why(b0.id, b0.tid, X)} 는 질 수 있음 → 대신 ${why(bAtk.a, bAtk.t, X)}`); const alt = moves.find(m => m.tag === 'end'); return mv(alt, 'wg:no-suicide', `자살 공격 금지: ${why(b0.id, b0.tid, X)} 는 질 수 있고 대안 공격도 없음 → 턴 종료`); }
    if (bAtk && (bAtk.t !== b0.tid || bAtk.a !== b0.id)) { const cur = { sure: X.sure(b0.id, b0.tid), act: act(R, b0.tid) };
      if ((bAtk.sure && !cur.sure) || (act(R, bAtk.t) && !cur.act && bAtk.sure === cur.sure)) return mv(bAtk.m, 'wg:active-first', `액티브/확실한 킬 우선: ${why(bAtk.a, bAtk.t, X)} (기본: ${why(b0.id, b0.tid, X)})`); } }
  // R1 1코 서치 이벤트 우선
  if (!played) { const ev = plays.find(m => is('ENGINE_EVENT', defOf(R, m.m.id)));
    if (ev) return mv(ev, 'wg:event-first', `1코 서치 이벤트 「${nm(R, ev.m.id)}」 우선 사용 (캐릭터보다 먼저 — 서치 후 캐릭터 등장까지 이어짐)`); }
  // R2 턴패스 시 추리 금지
  if (baseTag === 'reason' && !played && !plays.length && !by('hint').length) { const end = moves.find(m => m.tag === 'end'); if (end) return mv(end, 'wg:turnpass-no-reason', '턴패스(낼 카드가 없음)에서는 추리하지 않음 — 증거를 늦게 쌓아 상대의 종료를 늦춘다'); }
  // R6 마코토 보존 + R3 행동 먼저
  if (baseTag === 'play' || baseTag === 'assist') { const bid = base.mv.m.id, bdef = bid != null ? defOf(R, bid) : '';
    if (baseTag === 'play' && is('FINISHER', bdef)) { const alts = charPlays.filter(m => !is('FINISHER', defOf(R, m.m.id)) ).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id));
      if (alts.length) return mv(alts[0], 'wg:hold-finisher', `마코토(콤보 핵심)를 아끼고 대신 ${nm(R, alts[0].m.id)}(Lv${X.lv(alts[0].m.id)}) 사용 — 9→8→7 콤보에서 10000으로 2번 치고 드로우하는 것이 목표`); }
    if (baseTag === 'play' && !is('ENGINE_EVENT', bdef) && bAtk && (bAtk.sure || X.win(bAtk.a, bAtk.t)) && !is('REMOVER_ON_PLAY', bdef))
      return mv(bAtk.m, 'wg:act-before-play', `캐릭터 등장 전에 행동부터: ${why(bAtk.a, bAtk.t, X)} — 등장은 행동 뒤로 미뤄 전략 노출을 줄임`); }
  return null; }

// 효과 선택(대상/카드): 사건 효과/소노코 계획이 있으면 계획대로
function eff(c) { const { R, seat, mem, moves } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'pick' || src == null) return null;
  const def = defOf(R, src), pl = mem.plan && mem.plan.turn === R.n && mem.plan.seat === seat ? mem.plan : null; if (!pl) return null;
  const sel = q.sel || q.ids || [];
  if (is('CASE_BOOST', def) && sel.includes(pl.att)) { const m = moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === pl.att); if (m) return { mv: m, rule: 'wg:case-pick', why: `사건 효과를 받을 캐릭터: 계획한 공격자 ${nm(R, pl.att)}` }; }
  if (is('FORCED_CONTACT', def)) { const want = [pl.tid, pl.att].find(x => sel.includes(x)); if (want != null) { const m = moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === want); if (m) return { mv: m, rule: 'wg:sonoko-pick', why: `소노코 강제 컨택: ${want === pl.tid ? '대상' : '공격자'} 선택 = ${nm(R, want)}` }; } }
  return null; }

module.exports = { id: '0.2', label: 'WG-AI v0.2', date: '2026-10',
  notes: 'v0.1 + PD 피드백 1차: 이벤트 우선, 턴패스 시 추리 금지, 행동 후 등장, 확실한 킬일 때만 사건 효과, 소노코 강제 컨택 조건, 마코토 보존, 자살 공격 금지·액티브 우선.',
  hooks: { main, eff, removeTarget: eff }, ROLE };
