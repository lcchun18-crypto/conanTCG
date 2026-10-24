// WG-AI v0.16 — PD 피드백 15차: FILE 은 다음 턴 9코(MR)/8코 콤보의 재료 — 이유 없이 힌트로 줄이지 않는다. 힌트 이어 전개(hint-deploy)는 6코 소노코(강제 컨택)로만, 그것도 지금 공격수만으로 상대 캐릭터를 다 못 치울 때만(5코 돌격 힌트 전개 삭제).
// (아래는 v0.15 설명)
// WG-AI v0.15 — PD 피드백 14차: (1) 키드 직접 사용 금지 대체 선택에서 1코 서치 이벤트를 먼저(힌트 후 이벤트 미사용 버그), (2) 이미 한 장 낸 뒤 FILE 이 남고 6코 소노코/5코 돌격이 손에 있으면 넥스트 힌트로 이어서 전개(턴 종료 금지),
//   (3) 마코토 패시브 손패 리무브는 이미 AP10000 이상이면 쓰지 않음(14000 낭비 방지), (4) 마코토(AP10000↑, 액티브)가 때릴 캐릭터가 있으면 다른 캐릭터보다 먼저 공격, (5) 턴 끝에 파트너 추리가 가능하면 한다.
// (아래는 v0.14 설명)
// WG-AI v0.14 — PD 피드백 13차: (0) MR 이 선언 효과로 파트너 에리어(P.pa)로 이동하면 MR 버프(+2000)를 '없음'으로 계산하던 버그 수정(모든 MR 판정에 파트너 에리어 포함), (1) 2코 소노코/경구 선언 효과의 대상 선택이 '선택 안 함'이 되어 아무 효과도 없던 버그 수정(소노코→마코토, 경구→액티브 때릴 수 있는 가장 강한 경찰),
//   (2) 소노코(6코) 강제 컨택이 액티브를 이미 처리할 수 있으면 경구 선언 비용(손패 1장)을 아낌, (3) 상대 캐릭터가 전부 액티브이고 마코토 대신 6코 소노코가 손에 있으면 소노코를 냄(캐릭터를 치우는 것이 핵심).
// (아래는 v0.13 설명)
// WG-AI v0.13 — PD 피드백 12차: 목표 = 매 턴 콤보 1회 [MR(카이토)→8(경구/헤이지/유사쿠)→7마코토|6소노코] 또는 [헤이지→유사쿠→7마코토|6소노코]. 마지막 장은 6코 소노코가 있으면 소노코(마코토 아끼기),
//   마코토는 낼 5코↑(돌격 등)/6코 소노코가 없을 때만. 콤보 부품이 모자라면 서치로 부족한 부품 우선, FILE 9 가 모자라면 어시스트.
// (아래는 v0.12 설명)
// WG-AI v0.12 — PD 피드백 11차: 넥스트 힌트 후 추가 사용 구간(hw)에서도 1코 이벤트/규칙이 적용됨, 어시스트는 정말 전개가 늘 때만(저코스트 교체용 금지),
//   MR 이 있고 8코(손/필드)+마코토가 있으면 마코토를 아끼지 않고 콤보 실행(8코 → 마코토), 마코토 2장/스킵 처리 수정.
// (아래는 v0.11 설명) WG-AI v0.11 — PD 피드백 10차: 콤보 2종(A: 헤이지→유사쿠→마코토, B: MR(카이토)→경구→마코토)을 손패에 갖췄으면 순서대로 실행(+어시스트/힌트로 FILE 확보, 마코토 포함 연속 전개 계산),
//   헤이지 선언 효과는 공격한 뒤에(공격 전 금지), 7키드는 직접 내지 않음(변장 전용; 7코는 마코토 → 6코 소노코), 서치는 콤보 완성 카드 우선.
// (아래는 v0.10 설명) WG-AI v0.10 — PD 피드백 9차(self-play 008/009 리뷰): 마코토 아끼기(2장 금지, 7코 이벤트는 리무브 4장↑일 때만), 2코 소노코/경구 선언은 액티브 캐릭터를 때릴 때만,
//   6코 소노코는 때리지 않고 선언으로 2번째 컨택, 헤이지→유사쿠→마코토 / MR→경구→마코토 콤보, 킬 가능하면 사건 공격보다 캐릭터 정리, 사건 효과는 이길 수 있는 공격 전에,
//   1코 서치 이벤트는 후보와 선택 이유를 표시(필요 카드 우선), 해결편 어시스트 후 소노코.
// (아래는 v0.9 설명) WG-AI v0.9 — PD 피드백 8차: MR(+2000, Lv8+) 효과는 양쪽 모두 계산 — 내 MR 이 깔려 있으면 AP8000 은 10000 으로 취급(액면 AP9000 도 공격), 상대 MR 이 있으면 상대 Lv8+ 도 +2000.
// (아래는 v0.8 설명) WG-AI v0.8 — PD 피드백 7차: 미스리드 위협 = 같거나 높은 AP(3000 하한 삭제), 증거 충분 = 양측 증거 합 ≥ 내 사건 해결 필요 수 → 추리 대신 상대 증거 액션으로 뺏어옴.
// (아래는 v0.7 설명) WG-AI v0.7 — PD 피드백 6차: 미스리드는 항상 AP 비교(이번 턴 등장한 비돌격 상대는 제외), 마코토 효과 버림=가장 싼 캐릭터, 증거가 충분하면 추리 안 함, 낼 캐릭터가 없으면 어시스트(+1코 이벤트).
// (아래는 v0.6 설명) WG-AI v0.6 — PD 피드백 5차(self-play 005 리뷰): 미스리드(상대 FILE≤4 면 무조건), 막히는 공격 최종 방지(행동권 보존), 킬 가능하면 추리 대신 정리, 마코토 선언(드로우+액티브),
//   MR 선언 우선(리무브에 8코 있으면 돌격보다 선언), 카이토는 손에서 내지 않음(경구/헤이지 우선), 파트너 어시스트로 8코 2장 전개.
// (아래는 v0.5 설명) WG-AI v0.5 — PD 피드백 4차(self-play 004 리뷰): 미스리드 조건, 변장 대비(수비 블록 금지/공격 블록 회피), 사건 공격이 막히면 추리, 소노코 우선 등장·액티브 우선·사건효과 연계,
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
const hasMR = (R, P) => P.hand.concat(P.field, P.pa || [], [P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
const remHasTarget = (R, P) => P.rem.some(id => mrTarget(R, id));
function ctxOf(c) { const { R, seat, helpers: H } = c, P = R.P[seat], O = R.P[1 - seat];
  const lv = id => H.lvOf(R, id), ap = id => H.apOf(R, id);
  const hasBuff = P.field.concat(P.pa || [], [P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
  const cutin = ex => { let m = 0; for (const id of P.hand) { if (id === ex || is('MR_BUFF', defOf(R, id))) continue; /* MR 은 내는 것이 기본 — 컷인으로 세지 않음 */ try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} } return m; };
  const oBuff = O.field.concat(O.pa || [], [O.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id))), tap = t => ap(t) + (oBuff && lv(t) >= 8 ? 2000 : 0);   // 상대 MR 이 깔려 있으면 상대 Lv8+ 의 컨택 AP 도 +2000
  const kid = P.hand.find(id => is('DISGUISE', defOf(R, id))), disg = kid != null && P.file.length >= 6;      // 키드 변장 가능(FILE 6 이상): 컨택 중 AP 7000 캐릭터로 교체
  const power0 = id => ap(id) + (hasBuff && lv(id) >= 8 ? 2000 : 0), power = id => Math.max(power0(id), disg && id !== kid ? 7000 : 0);             // 컨택 시 내 기본 AP(버프 포함, 컷인 제외)
  const blockers = O.field.filter(x => act(R, x) && !S.FX.hasKwTk(R, x, 'cantguard'));
  const guardAp = t => Math.max(tap(t), ...blockers.map(tap));                       // R10: 상대가 가장 센 액티브로 막을 수 있다고 가정
  const margin = (a, t) => power(a) + cutin(a) - guardAp(t);                      // 컷인까지 계산한 내 우위 (막힐 경우 포함)
  const marginF = (a, t) => power(a) + cutin(a) - tap(t);                          // 막을 수 없는 강제 컨택용
  const sure = (a, t) => margin(a, t) >= 2000;                                    // 상대가 +2000 컷인해도 막지 못함
  const sureF = (a, t) => marginF(a, t) >= 2000;
  const win = (a, t) => power(a) - guardAp(t) >= 0 || sure(a, t);                 // v0.4: 컷인에 기대는 동타성 공격은 '이긴다'로 치지 않음 (컷인은 확실한 킬일 때만)
  return { R, seat, P, O, lv, ap, tap, oBuff, guardAp, power, power0, disg, kid, cutin, margin, marginF, sure, sureF, win, hasBuff, blockers }; }

function atkMoves(c) { const X = ctxOf(c); return c.moves.filter(m => m.tag === 'atkc').map(m => ({ m, a: m.m.id, t: m.m.tid })).filter(x => !(is('FORCED_CONTACT', defOf(c.R, x.a)) && !X.sure(x.a, x.t))); }   // v0.10: 6코 소노코는 기본적으로 때리지 않음(확실한 킬 제외) — 강한 캐릭터가 친 뒤 선언으로 2번째 컨택
function bestAttack(c, X, minWin = true) {                                    // 점수: 확실한 킬 > 승리, 액티브 우선, 높은 레벨, 약한 공격자로
  const L = atkMoves(c).filter(x => minWin ? X.win(x.a, x.t) : true).map(x => ({ ...x, sure: X.sure(x.a, x.t), tAct: act(X.R, x.t), tLv: X.lv(x.t), aAp: X.ap(x.a) }));
  L.sort((p, q) => (q.sure - p.sure) || (q.tAct - p.tAct) || (q.tLv - p.tLv) || (p.aAp - q.aAp)); return L[0] || null; }
const why = (a, t, X) => `${nm(X.R, a)}(AP${X.ap(a)}${X.hasBuff && X.lv(a) >= 8 ? '+MR2000' : ''}${X.cutin(a) ? '+컷인' + X.cutin(a) : ''}) → ${nm(X.R, t)}(AP${X.ap(t)}${act(X.R, t) ? ', 액티브' : ', 슬립'})`;

function main0(c) { const X = ctxOf(c), { R, seat, P, O, moves, base, mem } = { ...X, moves: c.moves, base: c.base, mem: c.mem };
  const by = tag => moves.filter(m => m.tag === tag), played = !!R.fl.played && !R.fl.hw, mv = (m, rule, w, f) => ({ mv: m, rule, why: w, factors: f });
  const baseTag = base.mv.tag, pending = mem.plan && mem.plan.turn === R.n && mem.plan.seat === seat ? mem.plan : null;
  if (baseTag === 'solve') return null;                                                  // 사건 해결은 기본 규칙(리살 탐색) 그대로
  // 대안 수: 이길 수 있는 공격 → (턴패스 방지) 낼 수 있는 카드 → 증거 공격 → 종료. 마코토는 다른 선택지가 없을 때만.
  const worstB = X.blockers.length ? Math.max(...X.blockers.map(X.tap)) : 0, atkkOK = id => !X.blockers.length || X.power(id) + X.cutin(id) >= worstB;     // v0.6: 증거 공격(액션)도 블로커에 막히면 행동권을 잃는다
  const fallback = () => { const b = bestAttack(c, X); if (b) return b.m;
    const pl = by('play').filter(m => !is('FINISHER', defOf(R, m.m.id)) && !is('DISGUISE', defOf(R, m.m.id))).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0] || by('play')[0]; if (!played && pl) return pl;
    return by('atkk').filter(m => atkkOK(m.m.id))[0] || moves.find(m => m.tag === 'end'); };
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
  const heijiCombo = P.field.some(id => defOf(R, id) === 'id_0188') && P.field.some(id => defOf(R, id) === 'id_0873');             // 헤이지 + 유사쿠 콤보(2번 공격) → 마코토를 내도 됨
  const handHas = d => P.hand.some(id => defOf(R, id) === d), fieldHas = d => P.field.some(id => defOf(R, id) === d), anyHas = d => handHas(d) || fieldHas(d);
  const mrAny = P.hand.concat(P.field, P.pa || [], [P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)));
  const lv8Any = P.field.some(id => X.lv(id) >= 8 && X.ap(id) >= 8000) || P.hand.some(id => { try { return S.D(R, id).type === 'char' && X.lv(id) >= 8 && X.ap(id) >= 8000 && defOf(R, id) !== 'id_1153'; } catch (e) { return false; } });
  const sono6 = P.hand.find(id => defOf(R, id) === 'id_1096'), closerD = sono6 != null ? 'id_1096' : 'id_1097', hasCloser = sono6 != null || handHas('id_1097');
  const remK = P.rem.some(id => mrTarget(R, id)), comboA = anyHas('id_0188') && anyHas('id_0873') && hasCloser, comboB = mrAny && hasCloser && (lv8Any || remK);                    // 콤보 A(헤이지→유사쿠→마코토), B(MR→경구/카이토→마코토)
  const maco = P.hand.find(id => is('FINISHER', defOf(R, id))), macoOn = P.field.some(id => is('FINISHER', defOf(R, id)));
  const eight = P.field.filter(id => X.lv(id) >= 8 && X.ap(id) >= 8000), ten = P.field.filter(id => !is('FINISHER', defOf(R, id)) && act(R, id) && X.power(id) + X.cutin(id) >= 10000), comboReady = ten.length > 0 && (maco != null || macoOn);
  if (baseTag === 'reason' && base.mv.m.who !== 'p' && lpOf(base.mv.m.who) <= 0) { const alt = reasonOK()[0] || fallback(); return mv(alt, 'wg:no-lp0-reason', `LP 0 인 ${nm(R, base.mv.m.who)}는 추리하지 않음`); }
  // 첫 MR(9코)은 무조건: 낼 수 있으면 내고, 어시스트로 낼 수 있으면 어시스트
  if (!played && !P.field.concat(P.pa || [], [P.partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id)))) { const mrP = plays.find(m => is('MR_BUFF', defOf(R, m.m.id)));
    if (mrP) return mv(mrP, 'wg:mr-first', '첫 MR(9코)은 무조건 먼저 냄 — 컨택 시 Lv8 이상 AP+2000 효과가 가장 강력');
    const mrH = P.hand.find(id => is('MR_BUFF', defOf(R, id))), asst = by('assist')[0]; if (mrH != null && asst && P.file.length + 1 >= X.lv(mrH)) return mv(asst, 'wg:mr-first', `어시스트로 FILE ${P.file.length + 1} → MR(9코)을 낼 수 있음 — 추리보다 높은 코스트 전개 우선`); }
  // v0.6 N1 마코토 선언(드로우 + 액티브): 선언 가능하면 항상 쓴다 (10000 이상으로 킬한 뒤 → 한 번 더 공격)
  { const mk = abil.find(x => x.def === 'id_1097'); if (mk) return mv(mk.m, 'wg:makoto-declare', `마코토 선언 효과 — AP${X.ap(mk.m.m.id)}로 킬했으므로 카드 1장 드로우 + 액티브로 되돌려 한 번 더 공격`); }
  // v0.6 N2 MR 선언 우선: 리무브 에어리어에 8코(돌격) 대상이 있으면 돌격 공격보다 선언 효과가 먼저
  { const ma = abil.find(x => is('MR_BUFF', x.def)); if (ma && remHasTarget(R, P) && baseTag !== 'solve') { const tg = P.rem.filter(id => mrTarget(R, id)).map(id => nm(R, id)).join(', ');
      return mv(ma.m, 'wg:mr-declare-first', `MR 선언 효과 우선 — 리무브 에어리어에 ${tg}(돌격 8코)가 있음: 돌격으로 직접 공격하기보다 선언으로 8코를 꺼내 공격 기회를 늘림`); } }
  // v0.13 콤보 FILE 확보: 콤보 부품이 갖춰졌는데 FILE 이 모자라면(9 필요: 8→8→7 사이에 힌트로 1씩 줄어듦) 어시스트
  if (!played && by('assist').length && (comboA || comboB) && baseTag !== 'solve') { const f0 = P.file.length + (P.pIn ? 1 : 0), rem = comboA ? [fieldHas('id_0188') ? 0 : 8, fieldHas('id_0873') ? 0 : 8, closerD === 'id_1096' ? 6 : 7].filter(x => x) : [handHas('id_1153') && !hasMR(R, P) ? 9 : 0, P.field.some(id => X.lv(id) >= 8 && X.ap(id) >= 8000) ? 0 : 8, closerD === 'id_1096' ? 6 : 7].filter(x => x), need = Math.max(...rem.map((l, k) => l + k)); if (f0 < need && f0 + 1 >= need) return mv(by('assist')[0], 'wg:combo-assist', `콤보 준비(${comboA ? 'A' : 'B'}): FILE ${f0} < ${need} — 어시스트로 FILE ${f0 + 1} (8→8→7 사이에 힌트로 1씩 줄어들므로 FILE 9 가 필요)`); }
  // v0.6 N3 어시스트로 연속 전개(8-8 등): 어시스트하면 전개 가능한 캐릭터 수가 늘어나면 어시스트 먼저 (파트너가 아무것도 안 하고 남는 것 방지)
  if (!played && by('assist').length) { const lvs = P.hand.filter(id => { try { return S.D(R, id).type === 'char' && (!is('FINISHER', defOf(R, id)) || comboA || comboB) && !is('DISGUISE', defOf(R, id)) && !(defOf(R, id) === 'id_1098' && hasMR(R, P)); } catch (e) { return false; } }).map(X.lv).sort((a, b) => b - a);
    const chain = f => { let cur = f, n = 0, v = 0; for (const l of lvs.slice().sort((a, b) => b - a)) { if (l <= cur) { n++; v += l; cur--; } } return { n, v }; };
    const f0 = P.file.length + (P.pIn ? 1 : 0), a0 = chain(f0), a1 = chain(f0 + 1);
    const hi = f => { let cur = f, n = 0; for (const l of lvs.filter(l => l >= 5).sort((a, b) => b - a)) if (l <= cur) { n++; cur--; } return n; };           // 어시스트는 고코스트 전개가 늘 때만 (저코스트 교체 목적 금지)
    if ((a1.n > a0.n && a0.n === 0) || hi(f0 + 1) > hi(f0)) return mv(by('assist')[0], 'wg:assist-chain', `파트너 어시스트(FILE ${f0}→${f0 + 1}): 연속 전개 ${a0.n}장 → ${a1.n}장 (레벨 합 ${a0.v}→${a1.v}) — 파트너가 아무것도 안 하고 남지 않도록`); }
  // v0.7 N4 턴패스 방지: 지금 낼 수 있는 캐릭터가 없고 1코 서치 이벤트가 있으면 어시스트(FILE+1) 후 이벤트 — 낼 수 있는 캐릭터 종류가 늘어남
  if (!played && by('assist').length) { const f0 = P.file.length + (P.pIn ? 1 : 0), isCh = id => { try { return S.D(R, id).type === 'char'; } catch (e) { return false; } };
    const ev = P.hand.find(id => is('ENGINE_EVENT', defOf(R, id))), canNow = P.hand.some(id => isCh(id) && X.lv(id) <= f0 && !is('FINISHER', defOf(R, id)));
    if (ev != null && !canNow) return mv(by('assist')[0], 'wg:assist-event', `낼 수 있는 캐릭터가 없고 1코 서치 이벤트가 있음 → 어시스트로 FILE ${f0}→${f0 + 1} 후 이벤트 사용 (낼 수 있는 캐릭터 종류↑, 턴패스 방지)`); }
  // v0.11 콤보 실행: A(헤이지 → 유사쿠 → 마코토) / B(MR → [선언으로 카이토] → 경구 → 마코토). 손패에 갖췄으면 순서대로 낸다 (FILE 이 모자라면 힌트로 이어감)
  if (baseTag !== 'solve') { const cn = closerD === 'id_1096' ? '6코 소노코' : '마코토', seqA = [['id_0188', '헤이지'], ['id_0873', '유사쿠'], [closerD, cn]], eb = ['id_0688', 'id_0188', 'id_0873'].find(d => handHas(d) && !fieldHas(d)) || 'id_0688', seqB = [['id_1153', 'MR'], [eb, eb === 'id_0688' ? '경구' : eb === 'id_0188' ? '헤이지' : '유사쿠'], [closerD, cn]];
    for (const [name, seq, on] of [['A', seqA, comboA], ['B', seqB, comboB]]) { if (!on) continue;
      const next = seq.find(([d]) => !fieldHas(d) && handHas(d) && !(d === closerD && !(name === 'A' ? fieldHas('id_0188') && fieldHas('id_0873') : P.field.some(id => X.lv(id) >= 8 && X.ap(id) >= 8000)))); if (!next) continue;
      const pm = plays.find(m => defOf(R, m.m.id) === next[0]);
      if (pm && (!played || R.fl.hw)) return mv(pm, 'wg:combo-' + name, `콤보 ${name === 'A' ? '헤이지→유사쿠→' : 'MR→경구(카이토)→'}${cn}: 다음 ${next[1]} 사용 (손패에 콤보 카드가 갖춰져 있음)`);
      const nid = P.hand.find(id => defOf(R, id) === next[0]);
      if (nid != null && played && !R.fl.hw && by('hint').length && P.file.length + (P.pIn ? 1 : 0) - 1 >= X.lv(nid)) return mv(by('hint')[0], 'wg:combo-' + name, `콤보 ${name}: ${next[1]}(Lv${X.lv(nid)})를 이어서 내기 위해 넥스트 힌트`);
    } }
  // v0.14 상대 캐릭터가 전부 액티브면 마코토(일반 공격)는 아무도 못 때림 → 6코 소노코(강제 컨택)로 치운다. 단, 액티브를 때리게 해주는 선언(2코 소노코/경구)이 가능하면 마코토도 의미 있음
  if (!played && baseTag !== 'solve' && sono6 != null && O.field.length > 0 && O.field.every(t => act(R, t)) && !abil.some(x => x.def === 'id_0876' || x.def === 'id_0688') && !P.field.some(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id))) {
    const sp6 = plays.find(m => m.m.id === sono6); if (sp6) return mv(sp6, 'wg:sono6-over-makoto', `상대 캐릭터가 전부 액티브(${O.field.map(t => nm(R, t)).join(', ')}) — 마코토로는 때릴 수 없으므로 6코 소노코를 내서 강제 컨택으로 치움 (이 덱의 핵심은 캐릭터를 먼저 치우는 것)`); }
  // 9-8-7 콤보: MR + AP8000(Lv8)이 있고 마코토가 손패에 있으면 마코토까지 먼저 내놓고(필요하면 힌트) 액션
  if (comboReady && maco != null && !macoOn) { const mp = plays.find(m => m.m.id === maco); if (mp) return mv(mp, 'wg:combo-987', `10000 공격 가능(${nm(R, ten[0])} AP${X.power(ten[0])}${X.cutin(ten[0]) ? '+컷인' + X.cutin(ten[0]) : ''}) → 마코토를 먼저 내서 마코토 효과가 터지게 함 (10000으로 때린 뒤에 내면 효과 불발)`);
    if (by('hint').length && P.file.length - 1 >= X.lv(maco)) return mv(by('hint')[0], 'wg:combo-hint', '9-8-7 콤보: 마코토를 내기 위해 넥스트 힌트로 FILE 을 낮춤'); }
  // R4/R5 준비: 지금 합법인 공격 중 "확실한 킬"
  const sureAtk = atkMoves(c).filter(x => X.sure(x.a, x.t)), winAtk = atkMoves(c).filter(x => X.win(x.a, x.t));
  // R4 사건 효과: 확실한 킬이 있을 때만 (함수: 소노코 규칙과 순서를 맞추기 위해)
  const caseAb = abil.find(x => is('CASE_BOOST', x.def));
  const caseRule = () => { if (!caseAb) return null;
    if ((sureAtk.length || winAtk.length) && !pending) { const b = bestAttack(c, X); mem.plan = { turn: R.n, seat, att: b.a, tid: b.t, via: 'case' };
      return mv(caseAb.m, 'wg:case-sure', `사건 효과(서치) 사용 — 죽일 수 있는 공격이 있음: ${why(b.a, b.t, X)} — 사건 효과(증거 뒤집기)를 먼저 쓰고 컨택해야 리무브 시 돌격 카드를 가져올 수 있음`, { plan: mem.plan.via }); }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === caseAb.def && !sureAtk.length && !winAtk.length) { const alt = fallback(); return mv(alt, 'wg:case-hold', '사건 효과(서치)는 실패하면 타격이 커서, 확실히 죽일 수 있는 공격(내 AP+버프+컷인 ≥ 상대 AP+2000)이 생길 때까지 사용하지 않음'); }
    return null; };
  // R5 6코 소노코: 혼자 슬립 금지 / 확실한 킬 대상이 있을 때만 / 먼저 강한 캐릭터가 눕는다
  const sono = abil.find(x => is('FORCED_CONTACT', x.def));
  const sleeping = P.field.filter(id => R.cards[id].st === 's' && !is('FORCED_CONTACT', defOf(R, id)));
  const sonoOnField = P.field.find(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id));
  const forcedOk = (a, t) => act(R, t) ? X.marginF(a, t) >= 1000 : X.sureF(a, t);                 // 액티브 대상은 막을 수 없는 컨택이므로 +1000 이면 허용(액티브 우선), 슬립 대상은 확실한 킬(+2000)만
  const bestForced = () => { let best = null; for (const a of sleeping) for (const t of O.field) { if (!forcedOk(a, t)) continue; const k = [act(R, t) ? 1 : 0, X.lv(t), -X.ap(a)]; if (!best || k[0] > best.k[0] || (k[0] === best.k[0] && (k[1] > best.k[1] || (k[1] === best.k[1] && k[2] > best.k[2])))) best = { a, t, k }; } return best; };
  const prepRule = () => { if (!(sonoOnField && P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved)) return null;              // 소노코가 있고 해결편: 먼저 (약한) 캐릭터가 추리/증거 액션으로 눕는다
    const cand = [...by('atkk').filter(m => atkkOK(m.m.id)).map(m => ({ id: m.m.id, m, k: 'atkk' })), ...reasonOK().filter(m => m.m.who !== 'p').map(m => ({ id: m.m.who, m, k: 'reason' }))].filter(x => x.id !== sonoOnField && act(R, x.id));
    for (const t of O.field.slice().sort((a, b) => X.ap(b) - X.ap(a))) { const a = cand.filter(x => X.sureF(x.id, t)).sort((p, q) => (X.blockers.length ? (q.k === 'reason') - (p.k === 'reason') : 0) || X.ap(p.id) - X.ap(q.id))[0];
      if (a) return mv(a.m, 'wg:sonoko-prep', `먼저 ${nm(R, a.id)}(AP${X.ap(a.id)})가 ${a.k === 'reason' ? '추리' : '증거 액션'}로 눕는다 → 그 뒤 소노코 효과로 ${nm(R, t)}(AP${X.ap(t)})에 확실한 강제 컨택${X.disg && X.power(a.id) === 7000 ? ' (키드 변장으로 AP7000)' : ''} — 소노코가 혼자 눕지 않도록`); } return null; };
  if (sono) { const f = bestForced();
    if (f) { if (caseAb && !pending) { mem.plan = { turn: R.n, seat, att: f.a, tid: f.t, via: 'case-sono' }; return mv(caseAb.m, 'wg:case-sono', `사건 효과(서치)를 먼저 — 곧 소노코 강제 컨택으로 ${nm(R, f.a)}가 ${nm(R, f.t)}를 확실히 죽임 (죽이면 서치 발동)`); }
      mem.plan = { turn: R.n, seat, att: f.a, tid: f.t, via: 'sonoko' }; return mv(sono.m, 'wg:sonoko-forced', `소노코 강제 컨택 — 이미 누운 ${nm(R, f.a)}가 ${nm(R, f.t)}(AP${X.ap(f.t)}${act(R, f.t) ? ', 액티브 우선' : ''})를 확실히 죽일 수 있음 (${X.marginF(f.a, f.t)} 우위)`); }
    { const pr = prepRule(); if (pr) return pr; }
    { const cr = caseRule(); if (cr) return cr; }
    if (baseTag === 'ability' && defOf(R, base.mv.m.id) === sono.def) { const alt = fallback(); if (alt) return mv(alt, 'wg:sonoko-hold', '소노코 효과를 쓰면 확실한 킬이 없어 혼자 슬립만 하게 됨 → 사용 안 함(턴패스가 되지 않도록 다른 행동 선택)'); } }
  else { const pr = prepRule(); if (pr) return pr; const cr = caseRule(); if (cr) return cr; }
  // v0.10 선언 효과 규칙: 2코 소노코(마코토에게 '액티브 캐릭터 지정 액션'), 8코 경구(경찰 캐릭터에게 같은 효과)는 액티브 캐릭터를 실제로 때릴 때만 쓴다
  { const canActNow = id => act(R, id) && !(R.cards[id].sum && !(S.FX.hasKwTk(R, id, 'rapid') || S.FX.hasKwTk(R, id, 'assault') || ((S.D(R, id).kw || '').includes('assault'))));
    const actTargets = O.field.filter(t => act(R, t));
    const altReason = () => { const rs = !turnpass && P.file.length < 8 ? reasonOK().filter(m => m.m.who !== 'p' && lpOf(m.m.who) > 0).sort((p, q) => X.ap(p.m.who) - X.ap(q.m.who))[0] : null; return rs || fallback() || moves.find(m => m.tag === 'end') || moves.find(m => m.tag === 'skip'); };
    const sono2 = abil.find(x => x.def === 'id_0876'), gin = abil.find(x => x.def === 'id_0688');
    const police = P.field.filter(id => { try { return String(S.D(R, id).trait || '').includes('警察'); } catch (e) { return false; } });
    if (sono2) { const mk = P.field.find(id => defOf(R, id) === 'id_1097'), okS = mk != null && canActNow(mk) && actTargets.some(t => X.win(mk, t));
      if (okS && baseTag !== 'solve') return mv(sono2.m, 'wg:sono2-active', `2코 소노코 선언: 마코토(AP${X.ap(mk)})가 액티브 캐릭터 ${actTargets.filter(t => X.win(mk, t)).map(t => nm(R, t)).join(', ')}를 공격할 수 있음 → 효과 사용 후 액티브 캐릭터를 때림`);
      if (baseTag === 'ability' && defOf(R, base.mv.m.id) === 'id_0876') { const alt = altReason(); if (alt) return mv(alt, 'wg:sono2-hold', '2코 소노코 선언 효과는 마코토가 액티브 캐릭터를 때릴 수 있을 때만 사용(슬립만 하게 됨) → 사용하지 않고 추리/다른 행동'); } }
    const forcedFree = P.field.filter(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id)).length + (sono2 && P.field.some(id => defOf(R, id) === 'id_1097' && canActNow(id)) ? 1 : 0);
    const gg = c.mem.ginGrant && c.mem.ginGrant.turn === R.n && R.cards[c.mem.ginGrant.id] && act(R, c.mem.ginGrant.id) && P.field.includes(c.mem.ginGrant.id) ? c.mem.ginGrant.id : null;
    if (gin && gg != null) { if (baseTag === 'ability' && defOf(R, base.mv.m.id) === 'id_0688') { const alt = altReason(); if (alt) return mv(alt, 'wg:gin-once', `경구 선언 중복 금지: 이미 효과를 받은 ${nm(R, gg)}가 아직 액티브 — 먼저 그 캐릭터로 액티브 캐릭터를 때림 (손패를 또 버리지 않음)`); } }
    if (gin && actTargets.length > 0 && actTargets.length <= forcedFree) {
      if (baseTag === 'ability' && defOf(R, base.mv.m.id) === 'id_0688') { const alt = altReason(); if (alt) return mv(alt, 'wg:gin-save', `경구 선언 보류: 상대 액티브 캐릭터 ${actTargets.length}장은 소노코 강제 컨택/2코 소노코 선언으로 이미 처리 가능 → 손패 1장(비용)을 아낌`); } }
    if (gin && gg == null && !(actTargets.length > 0 && actTargets.length <= forcedFree)) { const okG = police.some(a => canActNow(a) && actTargets.some(t => X.win(a, t)));
      if (okG) { const a = police.find(a => canActNow(a) && actTargets.some(t => X.win(a, t))); return mv(gin.m, 'wg:gin-active', `경구 선언: 경찰 캐릭터 ${nm(R, a)}(AP${X.ap(a)})가 액티브 캐릭터 ${actTargets.filter(t => X.win(a, t)).map(t => nm(R, t)).join(', ')}를 공격할 수 있음 → 효과 사용`); }
      if (baseTag === 'ability' && defOf(R, base.mv.m.id) === 'id_0688') { const alt = altReason(); if (alt) return mv(alt, 'wg:gin-hold', '경구 선언 효과는 액티브 캐릭터를 때릴 수 있을 때만 사용 → 사용하지 않음'); } } }
  // v0.10 해결편 어시스트 + 소노코: 어시스트로 FILE 7 이 되어 해결편이 되고, 소노코(6코)가 현장에 있으면 어시스트 후 선언 효과로 컨택(상대 필드를 죽일 수 있음)
  if (!played && by('assist').length && P.kase != null && R.cards[P.kase] && !R.cards[P.kase].solved && P.file.length + (P.pIn ? 1 : 0) < 7 && P.file.length + 1 >= 7) { const so = P.field.find(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id));
    if (so != null && chars.some(id => R.cards[id].st === 's' && id !== so) && O.field.length >= 2) return mv(by('assist')[0], 'wg:assist-solve', `어시스트로 FILE ${P.file.length + 1} → 해결편이 되어 소노코(${nm(R, so)}) 선언 효과를 쓸 수 있음 — 상대 필드를 연속으로 죽일 기회`); }
  // v0.11 헤이지 선언 효과(세트 → 액티브/돌격)는 공격한 뒤에 쓴다 (공격 전에 쓰면 낭비). 등장 턴(돌격 없음)이면 유사쿠를 먼저
  if (baseTag === 'ability' && defOf(R, base.mv.m.id) === 'id_0188') { const hid = base.mv.m.id, c0 = R.cards[hid], acted = R.fl.acted && R.fl.acted[hid], sick = c0.sum && !S.FX.hasKwTk(R, hid, 'rapid') && !S.FX.hasKwTk(R, hid, 'assault');
    if (act(R, hid) && !acted) { const mine = atkMoves(c).filter(x => x.a === hid && X.win(x.a, x.t)).sort((p, q) => (act(R, q.t) - act(R, p.t)) || X.lv(q.t) - X.lv(p.t))[0];
      if (!sick && mine) return mv(mine.m, 'wg:heiji-attack-first', `헤이지는 공격한 뒤에 선언 효과(세트→액티브)로 2번 공격 — 지금은 먼저 공격: ${why(mine.a, mine.t, X)}`);
      if (sick) { const yp = plays.find(m => defOf(R, m.m.id) === 'id_0873'); if (yp && !played) return mv(yp, 'wg:heiji-yusaku-first', '헤이지가 등장한 턴: 유사쿠 세트(돌격 부여)를 먼저 — 선언 효과는 공격 뒤의 재활성화용으로 남김'); }
      else if (!mine) { const alt = fallback(); if (alt && alt !== base.mv) return mv(alt, 'wg:heiji-hold', '헤이지가 아직 공격하지 않았고 이길 공격도 없음 — 선언 효과(재활성화)는 공격 뒤에 쓰므로 보류'); } } }
  // v0.15 헤이지가 등장한 턴(돌격 없음)이라 공격할 수 없으면, 선언 효과(덱 3장 리무브 → 세트)로 돌격을 받아 바로 공격한다 (공격 뒤 소노코 강제 컨택의 '누운 캐릭터'도 됨). 유사쿠를 낼 수 있으면 유사쿠 세트 먼저
  { const hab = abil.find(x => x.def === 'id_0188'); if (hab && baseTag !== 'solve' && !pending && O.field.length > 0) { const hid = hab.m.m.id, c0 = R.cards[hid], acted = R.fl.acted && R.fl.acted[hid], sick = c0.sum && !S.FX.hasKwTk(R, hid, 'rapid') && !S.FX.hasKwTk(R, hid, 'assault') && !String(S.D(R, hid).kw || '').includes('assault');
      if (act(R, hid) && !acted && sick) { const yp = plays.find(m => defOf(R, m.m.id) === 'id_0873'); if (!(yp && !played)) return mv(hab.m, 'wg:heiji-assault', `헤이지(${nm(R, hid)})가 등장한 턴이라 돌격이 없어 공격 불가 — 선언 효과로 세트하며 '돌격'을 받아 바로 공격 (상대 캐릭터 ${O.field.length}장, 공격 뒤 누운 헤이지로 소노코 강제 컨택도 가능)`); } } }
  // v0.11 7키드는 직접 내지 않는다(변장 전용): 7코는 마코토 → 6코 소노코
  if (baseTag === 'play' && is('DISGUISE', defOf(R, base.mv.m.id))) { const evK = !played ? plays.find(m => is('ENGINE_EVENT', defOf(R, m.m.id))) : null; if (evK) return mv(evK, 'wg:event-first', `1코 서치 이벤트 「${nm(R, evK.m.id)}」 우선 사용 (7코 키드는 직접 내지 않음 — 서치로 필요한 카드를 먼저 찾음)`);
    const alt = plays.filter(m => { try { return S.D(R, m.m.id).type === 'char' && !is('DISGUISE', defOf(R, m.m.id)) && !is('FINISHER', defOf(R, m.m.id)) && !(defOf(R, m.m.id) === 'id_1098'); } catch (e) { return false; } }).sort((p, q) => (is('FORCED_CONTACT', defOf(R, q.m.id)) - is('FORCED_CONTACT', defOf(R, p.m.id))) || X.lv(q.m.id) - X.lv(p.m.id))[0];
    if (alt) return mv(alt, 'wg:no-direct-kid', `7코 키드(${nm(R, base.mv.m.id)})는 직접 내지 않음(변장으로만 등장) → ${nm(R, alt.m.id)}(Lv${X.lv(alt.m.id)}) 사용`);
    const e2 = moves.find(m => m.tag === 'end' || m.tag === 'skip'); if (e2 && !pending) return mv(e2, 'wg:no-direct-kid', '7코 키드는 직접 내지 않고 변장용으로 손패에 둠'); }
  // R11 MR(9코): 리무브 에어리어에 8코 대상이 없으면 선언 금지(자기만 죽음) → 돌격으로만 사용. 대상이 없고 손패에 8코가 있으면 먼저 리무브로 보냄(경구 효과/해결편 효과)
  const mrAb = abil.find(x => is('MR_BUFF', x.def)), remOK = remHasTarget(R, P);
  if (mrAb && !remOK && baseTag === 'ability' && defOf(R, base.mv.m.id) === mrAb.def) { const alt = fallback(); return mv(alt, 'wg:mr-hold', 'MR 선언 효과는 리무브 에어리어에 8코(돌격) 대상이 없으면 자신만 슬립/이동하므로 사용하지 않음 — 돌격 캐릭터로 사용'); }
  if (hasMR(R, P) && !remOK && !played) { const cand = P.hand.some(id => mrTarget(R, id) && !is('MR_BUFF', defOf(R, id)));
    if (cand) { const dis = plays.find(m => is('DISCARDER', defOf(R, m.m.id))); if (dis) return mv(dis, 'wg:mr-prep', `MR 이 있고 리무브 에어리어에 8코가 없음 → 경구(${nm(R, dis.m.id)})를 먼저 내서 효과로 8코를 리무브에 버림`);
      const dab = abil.find(x => is('DISCARDER', x.def)); if (dab) return mv(dab.m, 'wg:mr-prep', 'MR 준비: 경구 선언 효과(손패 리무브)로 8코를 리무브 에어리어에 버림'); } }
  // 소노코 우선 등장: 해결편 + 키드 변장 가능(FILE 6+)이고 AP5000 이하 대상이 있으면, 어시스트 후에도 소노코를 먼저 내서 (약한 캐릭터 추리 → 강제 컨택+변장) 콤보 준비
  if (!played && P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved && X.disg) { const sp = plays.find(m => is('FORCED_CONTACT', defOf(R, m.m.id)));
    if (sp && O.field.some(t => X.ap(t) <= 5000)) return mv(sp, 'wg:sonoko-first', '소노코(6코)를 먼저 냄 — 해결편 + 키드 변장(FILE 6+): 약한 캐릭터로 추리 → 소노코 강제 컨택 + 변장(AP7000)으로 AP5000 이하를 확실히 처리'); }
  // v0.15 마코토 우선: AP10000 이상으로 액티브인 마코토가 이길 수 있는 캐릭터가 있으면 다른 캐릭터(MR/경구 등)보다 먼저 때린다 (마코토는 캐릭터를 죽여야 효과가 터지고, 다른 캐릭터가 목표를 가져가면 효과가 불발)
  if (baseTag === 'atkc' || baseTag === 'end' || baseTag === 'reason') { const mkA = atkMoves(c).filter(x => defOf(R, x.a) === 'id_1097' && X.ap(x.a) >= 10000 && X.win(x.a, x.t)).sort((p, q) => (act(R, q.t) - act(R, p.t)) || X.lv(q.t) - X.lv(p.t))[0];
    if (mkA && !(baseTag === 'atkc' && defOf(R, base.mv.m.id) === 'id_1097')) return mv(mkA.m, 'wg:makoto-attack-first', `마코토(AP${X.ap(mkA.a)})가 먼저 ${nm(R, mkA.t)}를 때림 — 마코토 효과(드로우+액티브)는 마코토가 캐릭터를 죽여야 발동하므로 다른 캐릭터가 목표를 먼저 가져가면 안 됨`); }
  // v0.15 힌트로 이어서 전개: 한 장 낸 뒤 턴을 끝내려 할 때, 손에 6코 소노코(강제 컨택)/5코 이상 돌격이 있고 힌트로 낼 수 있으면 힌트 → 전개 (캐릭터를 치울 수단을 최대한 늘림)
  if ((baseTag === 'end' || baseTag === 'reason') && played && !R.fl.hw && by('hint').length && P.field.length < 5 && O.field.length > 0 && !pending) { const f1 = P.file.length + (P.pIn ? 1 : 0) - 1, solvedC = P.kase != null && R.cards[P.kase] && R.cards[P.kase].solved;
    const useful = P.hand.filter(id => { try { const d = S.D(R, id); if (d.type !== 'char' || X.lv(id) > f1 || is('FINISHER', defOf(R, id)) || is('DISGUISE', defOf(R, id)) || (defOf(R, id) === 'id_1098' && hasMR(R, P))) return false; if (is('FORCED_CONTACT', defOf(R, id))) return solvedC && P.field.length >= 1; return false; } catch (e) { return false; } });
    const capable = new Set(atkMoves(c).filter(x => X.win(x.a, x.t)).map(x => x.a)), killers = capable.size + P.field.filter(id => is('FORCED_CONTACT', defOf(R, id)) && act(R, id)).length;
    if (useful.length && O.field.length > killers) return mv(by('hint')[0], 'wg:hint-deploy', `턴 종료 대신 넥스트 힌트: FILE ${f1 + 1}→${f1} 로 ${useful.map(id => nm(R, id) + '(Lv' + X.lv(id) + ')').join(', ')}를 이어서 낼 수 있음 — 상대 캐릭터 ${O.field.length}장을 치울 수단을 더 늘림`); }
  // v0.15 턴 끝에 파트너 추리: 더 할 게 없어 턴을 끝내려 하고 파트너가 추리 가능하면 한다
  if (baseTag === 'end' && !turnpass) { const pr = by('reason').find(m => m.m.who === 'p'); if (pr && !by('hint').length && !by('assist').length) return mv(pr, 'wg:partner-reason-end', '턴 종료 전 파트너 추리 — 캐릭터를 쓰지 않는 파트너 행동은 공짜로 증거를 늘림'); }
  // 안 움직인 캐릭터가 있으면 끝내지 않는다 (이길 수 있는 공격이 있는데 턴 종료)
  if (baseTag === 'end' && !turnpass) { const b = bestAttack(c, X); if (b && (b.sure || X.power(b.a) >= X.guardAp(b.t))) return mv(b.m, 'wg:attack-before-end', `행동하지 않은 캐릭터가 있음 → 턴 종료 전에 공격: ${why(b.a, b.t, X)}`); }
  // 사건 공격(증거 액션)은 막힐 수 있다 — 블로커보다 약하면(변장 불가) 행동권만 잃으므로 추리로
  if (baseTag === 'atkk' && X.blockers.length) { const att = base.mv.m.id, worst = Math.max(...X.blockers.map(X.tap)); if (X.power(att) + X.cutin(att) < worst + 0) { const rs = reasonOK().filter(m => m.m.who !== 'p' && lpOf(m.m.who) > 0).sort((p, q) => X.ap(p.m.who) - X.ap(q.m.who))[0];
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
      const alt = plays.filter(m => m.m.id === base.mv.m.id && m.m.rep != null && !(act(R, m.m.rep) && !(R.fl.acted && R.fl.acted[m.m.rep]))).sort((p, q) => X.lv(p.m.rep) - X.lv(q.m.rep))[0]; if (alt) return mv(alt, 'wg:push-acted', `이미 행동한 ${nm(R, alt.m.rep)}를 밀어냄 (행동 안 한 ${nm(R, rp)}는 유지)`); 
      const rs0 = reasonOK().find(m => m.m.who === rp); if (rs0 && !(R.fl.acted && R.fl.acted[rp])) return mv(rs0, 'wg:reason-before-push-out', `${nm(R, rp)}는 아직 아무것도 안 했는데 밀려남 → 밀어내기 전에 추리로 행동권 사용`); } }
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
    if (baseTag === 'play' && X.lv(bid) >= 8) { const same = charPlays.filter(m => X.lv(m.m.id) === X.lv(bid)), heijiHere = P.field.concat(P.hand).some(id => defOf(R, id) === 'id_0188'), rank = id => { const d = defOf(R, id); return is('LV8_8000', d) ? (d === 'id_0188' ? 90 : 85) : d === 'id_1098' ? 10 : d === 'id_0873' && heijiHere ? 88 : 70; };
      const best = same.slice().sort((p, q) => rank(q.m.id) - rank(p.m.id))[0];
      if (best && best.m.id !== bid && rank(best.m.id) > rank(bid)) return mv(best, 'wg:lv8-order', `8코는 AP8000(헤이지/경구)을 먼저${is('LV8_8000', defOf(R, best.m.id)) ? '' : ''}: ${nm(R, best.m.id)} 사용 (카이토는 MR 로 리무브에서 꺼내는 것이 가장 강력)`);
      if (defOf(R, bid) === 'id_1098') { const alt5 = charPlays.filter(m => m.m.id !== bid && X.lv(m.m.id) >= 5 && !is('FINISHER', defOf(R, m.m.id))).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0], alt = alt5 || (hasMR(R, P) ? charPlays.filter(m => m.m.id !== bid).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0] : null); if (alt) return mv(alt, 'wg:kaito-from-rem', `8코 카이토는 손에서 내는 경우가 드묾 — MR 로 리무브에서 꺼냄(경구/헤이지 우선) → 대신 ${nm(R, alt.m.id)}`); } }
    { const trashN = P.rem.filter(id => { try { const dd = S.D(R, id); return dd.type === 'char' && (defOf(R, id) === 'id_1097' || String(dd.trait || '').includes('鈴木財閥')); } catch (e) { return false; } }).length;
      if (baseTag === 'play' && bdef === 'id_0564' && trashN < 4) { const alt = charPlays.filter(m => !is('FINISHER', defOf(R, m.m.id))).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0] || null; const al = alt || fallback() || moves.find(m => m.tag === 'skip'); if (al && al !== base.mv) return mv(al, 'wg:hold-trash-event', `7코 이벤트 「${nm(R, bid)}」는 리무브 에어리어의 마코토/스즈키 재벌 캐릭터가 4장 이상일 때만 사용(현재 ${trashN}장) — 중요한 순간에 마코토를 트래시에서 가져오기 위해 아낌`); } }
    if (baseTag === 'play' && is('FINISHER', bdef) && macoOn) { const alt = charPlays.filter(m => !is('FINISHER', defOf(R, m.m.id))).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0]; const al = alt || fallback() || moves.find(m => m.tag === 'skip'); if (al && al !== base.mv) return mv(al, 'wg:one-makoto', `마코토는 한 장만 — 이미 현장에 마코토가 있어 두 번째 마코토는 내지 않음(콤보용으로 아낌)`); }
    if (baseTag === 'play' && is('FINISHER', bdef) && !(comboReady || heijiCombo || comboB)) { const alts = charPlays.filter(m => !is('FINISHER', defOf(R, m.m.id)) && !is('DISGUISE', defOf(R, m.m.id)) && X.lv(m.m.id) >= 5).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id));
      if (alts.length) return mv(alts[0], 'wg:hold-finisher', `마코토(콤보 핵심)를 아끼고 대신 ${nm(R, alts[0].m.id)}(Lv${X.lv(alts[0].m.id)}) 사용 — 6코 소노코/5코↑ 돌격이 있으면 마코토 대신 그것을 냄. 낼 것이 정말 없을 때만 마코토`); }
    if (baseTag === 'play' && !is('ENGINE_EVENT', bdef) && !(comboReady && maco != null) && bAtk && (bAtk.sure || X.win(bAtk.a, bAtk.t)) && !is('REMOVER_ON_PLAY', bdef))
      return mv(bAtk.m, 'wg:act-before-play', `캐릭터 등장 전에 행동부터: ${why(bAtk.a, bAtk.t, X)} — 등장은 행동 뒤로 미뤄 전략 노출을 줄임`); }
  return null; }

// v0.6 최종 점검: 어떤 규칙이 골랐든 (1) 블로커에 막히는 공격으로 행동권을 버리지 않고 (2) 죽일 수 있는 공격이 있으면 추리보다 먼저 한다
function main(c) { const r = main0(c); const { R, seat, moves, base } = c; if (base.mv.tag === 'solve') return r;
  const X = ctxOf(c), P = X.P, fin = r && r.mv ? r.mv : base.mv, rule = r ? r.rule : '', mv = (m, rl, w) => ({ mv: m, rule: rl, why: w });
  if (/^wg:(lethal|case-attack|makoto)/.test(rule)) return r;
  const by = tag => moves.filter(m => m.tag === tag), lpOf = id => { try { return S.lpOf(R, id); } catch (e) { return 1; } };
  const reasonOK = () => by('reason').filter(m => m.m.who === 'p' || lpOf(m.m.who) > 0), played = !!R.fl.played && !R.fl.hw, turnpass = !played && !by('play').length && !by('hint').length;
  const worstB = X.blockers.length ? Math.max(...X.blockers.map(X.tap)) : 0, bAtk = bestAttack(c, X);
  const noAct = (why0) => { const rs = !turnpass && P.file.length < 8 ? reasonOK().filter(m => m.m.who !== 'p' && lpOf(m.m.who) > 0).sort((p, q) => X.ap(p.m.who) - X.ap(q.m.who))[0] : null; const e = moves.find(m => m.tag === 'end');
    return rs ? mv(rs, 'wg:keep-action', `${why0} → 행동권을 버리지 않고 ${nm(R, rs.m.who)}로 추리`) : e ? mv(e, 'wg:keep-action', `${why0} → 행동권만 잃으므로 하지 않고 종료`) : r; };
  if (fin.tag === 'play' && is('FINISHER', defOf(R, fin.m.id)) && P.field.some(id => is('FINISHER', defOf(R, id)))) { const alt = by('play').filter(m => { try { return S.D(R, m.m.id).type === 'char' && !is('FINISHER', defOf(R, m.m.id)) && !is('DISGUISE', defOf(R, m.m.id)) && m.m.rep == null; } catch (e) { return false; } }).sort((p, q) => X.lv(q.m.id) - X.lv(p.m.id))[0] || moves.find(m => m.tag === 'skip') || moves.find(m => m.tag === 'end'); if (alt) return mv(alt, 'wg:one-makoto', '마코토는 한 장만 — 이미 현장에 마코토가 있어 두 번째 마코토는 내지 않음(콤보용으로 아낌)'); }
  if (fin.tag === 'atkk' && X.blockers.length) { const id = fin.m.id; if (X.power(id) + X.cutin(id) < worstB) { if (bAtk) return mv(bAtk.m, 'wg:keep-action', `증거 공격(${nm(R, id)} AP${X.power(id)})은 상대 블로커(AP${worstB})에 막혀 행동권을 잃음 → 확실히 이기는 컨택 ${why(bAtk.a, bAtk.t, X)} 로 대체`); return noAct(`막히는 증거 공격(${nm(R, id)} AP${X.power(id)} < 블로커 AP${worstB})`); } }
  if (fin.tag === 'atkc' && !X.win(fin.m.id, fin.m.tid)) { if (bAtk) return mv(bAtk.m, 'wg:keep-action', `지거나 막히는 공격(${why(fin.m.id, fin.m.tid, X)}) 대신 ${why(bAtk.a, bAtk.t, X)}`); return noAct(`지거나 막히는 공격(${why(fin.m.id, fin.m.tid, X)})`); }
  { let need = 0; try { need = +(seat === R.first ? S.D(R, P.kase).lv : S.D(R, P.kase).lv2) || 0; } catch (e) {}
    const atkkOK = id => !X.blockers.length || X.power(id) + X.cutin(id) >= worstB;
    const O1 = R.P[1 - seat], total = P.evid.length + O1.evid.length;                    // 양 플레이어 증거 합 ≥ 내 사건 해결 필요 수 → 추리보다 상대 증거 액션(뺏어오기)이 이득
    if (fin.tag === 'reason' && need && total >= need) { const steal = by('atkk').filter(m => atkkOK(m.m.id)).sort((p, q) => X.ap(p.m.id) - X.ap(q.m.id))[0];
      if (steal) return mv(steal, 'wg:evidence-enough', `증거 합 ${P.evid.length}+${O1.evid.length}=${total} ≥ 해결 필요 ${need}: 추리보다 상대 증거에 액션해 뺏어오는 것이 이득 → ${nm(R, steal.m.id)} 증거 액션`);
      if (bAtk && X.win(bAtk.a, bAtk.t)) return mv(bAtk.m, 'wg:evidence-enough', `증거 합 ${total} ≥ ${need}: 추리하지 않고 공격 ${why(bAtk.a, bAtk.t, X)}`);
      const e = moves.find(m => m.tag === 'end'); if (e && !by('play').length) return mv(e, 'wg:evidence-enough', `증거 합 ${total} ≥ ${need}: 추리하지 않음 (증거 액션/공격할 수단이 없음)`); } }
  if (fin.tag === 'atkk' && bAtk && X.win(bAtk.a, bAtk.t) && !/^wg:case/.test(rule)) return mv(bAtk.m, 'wg:kill-before-case', `캐릭터를 죽일 수 있는데 사건 공격 대신 캐릭터 정리: ${why(bAtk.a, bAtk.t, X)}`);
  if (fin.tag === 'atkc' && is('FORCED_CONTACT', defOf(R, fin.m.id)) && !X.sure(fin.m.id, fin.m.tid)) { if (bAtk) return mv(bAtk.m, 'wg:sonoko-no-attack', `6코 소노코는 직접 때리지 않음 → ${why(bAtk.a, bAtk.t, X)}`); return noAct('소노코로 직접 공격'); }
  // v0.16 제거할 상대 캐릭터(슬립)가 없으면 돌격(마코토)을 아낌: 3코 미스리드/2코 소노코 등 싼 캐릭터를 대신 낸다
  if (fin.tag === 'play' && is('FINISHER', defOf(R, fin.m.id)) && !R.P[1 - seat].field.some(t => !act(R, t)) && !/^wg:lethal/.test(rule)) {
    const cheapP = by('play').filter(m => { try { return S.D(R, m.m.id).type === 'char' && X.lv(m.m.id) <= 3 && m.m.rep == null && !is('DISGUISE', defOf(R, m.m.id)); } catch (e) { return false; } }).sort((p, q) => (defOf(R, q.m.id) === 'id_0876') - (defOf(R, p.m.id) === 'id_0876') || X.lv(q.m.id) - X.lv(p.m.id))[0];
    if (cheapP) return mv(cheapP, 'wg:save-makoto-no-target', `제거할 상대 캐릭터가 없음 → 돌격 마코토를 아끼고 ${nm(R, cheapP.m.id)}(Lv${X.lv(cheapP.m.id)})를 냄`);
    const e0 = moves.find(m => m.tag === 'skip') || moves.find(m => m.tag === 'end'); if (e0 && !by('play').some(m => m.m.id !== fin.m.id && X.lv(m.m.id) < 7)) return mv(e0, 'wg:save-makoto-no-target', '제거할 상대 캐릭터가 없음 → 마코토를 아끼고 내지 않음'); }
  // v0.16 FILE 7 미만으로 내려가는 힌트 금지 (내가 죽기 직전이 아니면; 콤보 힌트 제외)
  if (fin.tag === 'hint' && !/^wg:(lethal|combo)/.test(rule)) { const f1 = P.file.length + (P.pIn ? 1 : 0) - 1, O1h = R.P[1 - seat]; let needO = 99; try { needO = +((1 - seat) === R.first ? S.D(R, O1h.kase).lv : S.D(R, O1h.kase).lv2) || 99; } catch (e) {}
    const danger = O1h.evid.length >= needO - 1; if (f1 < 7 && !danger) { const e1 = moves.find(m => m.tag === 'end'); if (e1) return mv(e1, 'wg:file-floor', `넥스트 힌트로 FILE ${f1 + 1}→${f1} (7 미만): 내가 죽기 직전이 아니므로 하지 않음 (상대 증거 ${O1h.evid.length}/${needO})`); } }
  // v0.16 밀어내기 최종 점검(콤보/키드/기타 어떤 규칙이 골랐든): 같은 카드로 더 싼 캐릭터를 밀어내는 수가 있으면 그걸로, 8코 이상은 밀어내지 않고, 등장 카드가 밀려나는 카드보다 비싸지 않으면 하지 않음
  if (fin.tag === 'play' && fin.m.rep != null && !/^wg:lethal/.test(rule)) { const same = by('play').filter(m => m.m.id === fin.m.id && m.m.rep != null).sort((p, q) => X.lv(p.m.rep) - X.lv(q.m.rep)), ch = same[0];
    if (ch && X.lv(ch.m.rep) < X.lv(fin.m.rep)) return mv(ch, 'wg:push-cheapest', `현장이 가득 참: ${nm(R, fin.m.id)}로 가장 싼 ${nm(R, ch.m.rep)}(Lv${X.lv(ch.m.rep)})를 밀어냄 (${nm(R, fin.m.rep)} Lv${X.lv(fin.m.rep)}는 지킴)`);
    const cr = ch ? ch.m.rep : fin.m.rep;
    if (X.lv(cr) >= 8 || (X.lv(fin.m.id) <= X.lv(cr) && !/^wg:combo/.test(rule))) { const alt0 = (bAtk && X.win(bAtk.a, bAtk.t)) ? bAtk.m : (moves.find(m => m.tag === 'skip') || moves.find(m => m.tag === 'end'));
      if (alt0) return mv(alt0, 'wg:no-push-out', `현장이 가득 참: ${nm(R, fin.m.id)}(Lv${X.lv(fin.m.id)})를 내려면 ${nm(R, cr)}(Lv${X.lv(cr)})를 밀어내야 함 — ${X.lv(cr) >= 8 ? '8코 이상은 밀어내지 않음' : '더 싸거나 같은 카드로 밀어내지 않음'}`); } }
  // v0.16 행동 안 한 캐릭터를 밀어내고 등장하기 전에: 그 캐릭터로 먼저 공격(이기는 경우) → 추리 (어떤 규칙이 골랐든 최종 점검, 콤보 연속 전개 포함)
  if (fin.tag === 'play' && fin.m.rep != null && !/^wg:lethal/.test(rule)) { const rp = fin.m.rep, unacted = act(R, rp) && !(R.fl.acted && R.fl.acted[rp]);
    if (unacted) { const own = atkMoves(c).filter(x => x.a === rp && (X.sure(x.a, x.t) || X.win(x.a, x.t)))[0]; if (own) return mv(own.m, 'wg:act-before-push-out', `${nm(R, rp)}가 아직 행동하지 않음 → 밀어내기 전에 공격: ${why(own.a, own.t, X)}`);
      const rs1 = reasonOK().find(m => m.m.who === rp); if (rs1) return mv(rs1, 'wg:reason-before-push-out', `${nm(R, rp)}는 아직 아무것도 안 했는데 ${nm(R, fin.m.id)}에게 밀려남 → 밀어내기 전에 추리로 행동권 사용`); } }
  // v0.16 마코토 첫 공격: AP10000 이상 액티브 마코토가 캐릭터를 이길 수 있으면, 다른 캐릭터가 먼저 공격/추리하지 않고 마코토가 먼저 (2번 공격 기회 보존)
  if (['atkc', 'atkk', 'reason'].includes(fin.tag) && !(fin.tag === 'atkc' && defOf(R, fin.m.id) === 'id_1097')) { const mkA = atkMoves(c).filter(x => defOf(R, x.a) === 'id_1097' && X.ap(x.a) >= 10000 && X.win(x.a, x.t)).sort((p, q) => (act(R, q.t) - act(R, p.t)) || X.lv(q.t) - X.lv(p.t))[0];
    if (mkA) return mv(mkA.m, 'wg:makoto-attack-first', `마코토(AP${X.ap(mkA.a)})가 먼저 ${nm(R, mkA.t)}를 때림 — 마코토 효과는 마코토가 캐릭터를 죽여야 발동, 다른 카드가 먼저 행동하면 2번 공격 기회를 잃음`); }
  // v0.16 2코 소노코는 추리 대신 상대 증거를 때린다 (막히지 않을 때)
  if (fin.tag === 'reason' && defOf(R, fin.m.who) === 'id_0876' && R.P[1 - seat].evid.length > 0) { const st = by('atkk').filter(m => m.m.id === fin.m.who && (!X.blockers.length || X.power(m.m.id) + X.cutin(m.m.id) >= worstB))[0]; if (st) return mv(st, 'wg:sono2-evidence', `2코 소노코는 추리하지 않고 상대 증거(${R.P[1 - seat].evid.length}장)를 때려 뺏어옴`); }
  // v0.16 현장이 가득 찬 상태의 어시스트 금지 (FILE 소모/파트너 낭비, 낼 자리가 없음)
  if (fin.tag === 'assist' && P.field.length >= 5 && !/^wg:lethal/.test(rule)) { if (bAtk && X.win(bAtk.a, bAtk.t)) return mv(bAtk.m, 'wg:no-assist-full', `현장이 가득 참(5/5): 어시스트하지 않고 ${why(bAtk.a, bAtk.t, X)}`); return noAct('현장이 가득 참(5/5): 어시스트 불필요'); }
  if (fin.tag === 'reason' && bAtk && X.win(bAtk.a, bAtk.t)) return mv(bAtk.m, 'wg:kill-before-reason', `죽일 수 있는 공격이 있으면 추리보다 먼저 정리: ${why(bAtk.a, bAtk.t, X)} (추리: ${nm(R, fin.m.who === 'p' ? P.partner : fin.m.who)})`);
  return r; }

// 효과 선택(대상/카드): 사건 효과/소노코 계획이 있으면 계획대로
function effOpt(c) { const { R, seat } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'opt' || src == null || defOf(R, src) !== 'id_0188') return null;
  const labels = q.labels || [], iA = labels.findIndex(l => /돌격|assault|突撃/i.test(l)), iB = labels.findIndex(l => /액티브|active|アクティブ/i.test(l)); if (iA < 0 || iB < 0) return null;
  let acts = []; try { acts = S.actsFor(R, seat)[src] || []; } catch (e) {} const sick = R.cards[src].st === 'a' && !acts.length;   // 등장한 턴(행동 불가)이면 돌격, 이미 행동해 누웠으면 액티브
  const pick = sick ? iA : iB, mvv = c.moves.find(x => x.m.v === pick); return mvv ? { mv: mvv, rule: 'wg:hattori-set', why: sick ? '헤이지 등장 턴 첫 세트는 돌격 선택 → 바로 공격' : '헤이지가 이미 행동해 누움 → 액티브로 되돌려 한 번 더 공격' } : null; }
function eff(c) { const eo = effOpt(c); if (eo) return eo; const { R, seat, mem, moves } = c, q = R.eff && R.eff.req, src = R.eff && R.eff.it && R.eff.it.src; if (!q || q.kind !== 'pick' || src == null) return null;
  const sel0 = q.sel || q.ids || [], P0 = R.P[seat], X0 = ctxOf(c), msg = String(q.msg || ''), pickV = id => c.moves.find(x => x.m.v && x.m.v.length === 1 && x.m.v[0] === id), none = () => c.moves.find(x => x.m.v && x.m.v.length === 0);
  if ((defOf(R, src) === 'id_0876' || defOf(R, src) === 'id_0688') && (q.min || 0) === 0 && /대상 캐릭터/.test(msg) && sel0.some(id => P0.field.includes(id)) && pickV) {
    const O0 = R.P[1 - seat], actT = O0.field.filter(t => act(R, t));
    let best = null, why0 = '';
    if (defOf(R, src) === 'id_0876') { best = sel0.find(id => P0.field.includes(id) && defOf(R, id) === 'id_1097'); why0 = '2코 소노코 선언: 효과를 줄 대상은 마코토 (액티브 캐릭터를 직접 때려 킬)'; }
    else { const cand = sel0.filter(id => P0.field.includes(id) && act(R, id) && actT.some(t => X0.win(id, t))).sort((a, b) => X0.ap(b) - X0.ap(a)); best = cand[0] != null ? cand[0] : sel0.filter(id => P0.field.includes(id) && act(R, id)).sort((a, b) => X0.ap(b) - X0.ap(a))[0] || sel0.filter(id => P0.field.includes(id)).sort((a, b) => X0.ap(b) - X0.ap(a))[0]; why0 = '경구 선언: 효과를 줄 경찰 캐릭터는 액티브 캐릭터를 이길 수 있는 가장 강한 캐릭터'; }
    if (best != null && defOf(R, src) === 'id_0688') c.mem.ginGrant = { turn: R.n, id: best };
    if (best != null && pickV(best)) return { mv: pickV(best), rule: 'wg:actactive-target', why: `${why0}: ${nm(R, best)}(AP${X0.ap(best)}) — 대상을 고르지 않으면 효과가 아무 일도 하지 않음` }; }
  const full = P0.field.length >= 5, minF = Math.min(...P0.field.map(X0.lv), 99);
  if (/등장시킬/.test(msg) && (q.min || 0) === 0) {                                                  // R8/R9 등장 효과: 낼 수 있으면 가장 높은 레벨, 현장이 가득이면 더 비싼 것만
    let cs = sel0.filter(id => !full || X0.lv(id) > minF).sort((a, b) => X0.lv(b) - X0.lv(a)); const nf = cs.filter(id => !is('FINISHER', defOf(R, id))); if (nf.length && defOf(R, src) !== 'id_0564' && !(is('ENGINE_EVENT', defOf(R, src)) && !P0.field.some(id => defOf(R, id) === 'id_1097'))) cs = nf;   // v0.16: 1코 이벤트의 무료 등장은 FILE 을 쓰지 않으므로 마코토(7코)를 우선(이미 필드에 마코토가 있으면 제외)
                  // 7코 이벤트(조건 충족 시)는 트래시의 마코토를 꺼내는 것이 목적
    if (cs.length && pickV(cs[0])) return { mv: pickV(cs[0]), rule: 'wg:play-pick', why: `등장 효과: ${nm(R, cs[0])}(Lv${X0.lv(cs[0])}) 등장 — 등장시킬 수 있는 카드는 반드시 등장시킴(이벤트 뒤 캐릭터 미등장 방지)` };
    if (full && none()) return { mv: none(), rule: 'wg:no-push-out', why: '현장이 가득 참 — 등장 효과로 더 비싼 캐릭터를 밀어내지 않고 효과를 쓰지 않음' }; }
  if (defOf(R, src) === 'id_1097' && /손패/.test(msg) && pickV && (q.min || 0) === 0 && X0.ap(src) >= 10000 && none()) return { mv: none(), rule: 'wg:makoto-no-double', why: `마코토 AP${X0.ap(src)} 이미 10000 이상 — 손패를 또 리무브해 AP+4000 을 더 얹을 필요 없음` };
  if (defOf(R, src) === 'id_1097' && /손패/.test(msg) && pickV) { const isCh = id => { try { return S.D(R, id).type === 'char'; } catch (e) { return false; } };
    const cs = sel0.slice().sort((a, b) => (isCh(b) - isCh(a)) || X0.lv(a) - X0.lv(b)); const pk = cs[0];                       // 일반적으로 코스트가 가장 낮은 캐릭터를 버린다
    if (pk != null && pickV(pk)) return { mv: pickV(pk), rule: 'wg:makoto-discard', why: `마코토 효과: 손패에서 코스트가 가장 낮은 ${isCh(pk) ? '캐릭터' : '카드'} ${nm(R, pk)}(Lv${X0.lv(pk)})를 리무브하고 AP+4000 (10000 → 마코토가 킬 후 선언 가능)` }; }
  if (/스위치로 리무브/.test(msg)) { const lo = sel0.slice().sort((a, b) => X0.lv(a) - X0.lv(b))[0]; if (lo != null && pickV(lo)) return { mv: pickV(lo), rule: 'wg:push-cheapest', why: `밀어낼 캐릭터: 가장 싼 ${nm(R, lo)}(Lv${X0.lv(lo)})` }; }
  if (/손패 1장을 리무브/.test(msg) && (q.min || 0) >= 1 && hasMR(R, P0) && !remHasTarget(R, P0)) { const t = sel0.filter(id => mrTarget(R, id) && !is('MR_BUFF', defOf(R, id))).sort((a, b) => (defOf(R, b) === 'id_1098') - (defOf(R, a) === 'id_1098'))[0]; if (t != null && pickV(t)) return { mv: pickV(t), rule: 'wg:mr-prep', why: `MR 대비: 8코 ${nm(R, t)}를 리무브 에어리어로 버림 (MR 선언 효과로 현장에 가져오기 위함)` }; }
  if (/덱 위 3장 확인/.test(msg) && src != null && is('ENGINE_EVENT', defOf(R, src))) { const playableHand = P0.hand.some(id => X0.lv(id) <= P0.file.length + (P0.pIn ? 1 : 0) && (() => { try { return S.D(R, id).type === 'char'; } catch (e) { return false; } })());
    const fcn = P0.file.length + (P0.pIn ? 1 : 0), have = d => P0.hand.concat(P0.field).some(h => defOf(R, h) === d), hasMk = have('id_1097'), hasKid = have('id_0205');
    const H = P0.hand.concat(P0.field), hv = d => H.some(h => defOf(R, h) === d), closerHave = hv('id_1097') || hv('id_1096');
    const eightHave = hv('id_0688') || hv('id_0188') || hv('id_0873') || hv('id_1098') || P0.rem.some(r => mrTarget(R, r));
    const missA = (hv('id_0188') ? 0 : 1) + (hv('id_0873') ? 0 : 1) + (closerHave ? 0 : 1), missB = (hv('id_1153') || hasMR(R, P0) ? 0 : 1) + (eightHave ? 0 : 1) + (closerHave ? 0 : 1);
    const fills = (d, A) => A ? ((d === 'id_0188' && !hv(d)) || (d === 'id_0873' && !hv(d)) || ((d === 'id_1097' || d === 'id_1096') && !closerHave)) : ((d === 'id_1153' && !hv(d) && !hasMR(R, P0)) || ((d === 'id_0688' || d === 'id_0188' || d === 'id_0873') && !eightHave) || ((d === 'id_1097' || d === 'id_1096') && !closerHave));
    const comboBonus = id => { const d = defOf(R, id), tA = missA <= missB; let b = 0; if (fills(d, tA)) b = 60 - 10 * (tA ? missA : missB); else if (fills(d, !tA)) b = 40 - 10 * (tA ? missB : missA); return b; };
    const scoreN = id => { const d = defOf(R, id), nt = []; let v = X0.lv(id); const cb = comboBonus(id); if (cb) { v += cb; nt.push(`콤보 부족 부품 +${cb}`); }
      if (d === 'id_1153') { v = hasMR(R, P0) ? 20 : 100; nt.push(hasMR(R, P0) ? 'MR 이미 있음 → 낮음' : 'MR 없음 → 최우선'); }
      else if (d === 'id_0188') { v = have('id_0873') ? 95 : 75; nt.push(have('id_0873') ? '유사쿠 보유 → 헤이지+유사쿠 콤보' : '헤이지(콤보 A 부품)'); }
      else if (d === 'id_0873') { v = have('id_0188') ? 94 : 74; nt.push(have('id_0188') ? '헤이지 보유 → 헤이지+유사쿠 콤보' : '유사쿠(콤보 A 부품)'); }
      else if (d === 'id_0688') { v = 80; nt.push('경구(콤보 B 8코)'); }
      else if (d === 'id_1098') { v = hasMR(R, P0) ? 12 : 15; nt.push('카이토는 MR 선언으로 리무브에서 꺼내므로 손에 필요 없음'); }
      else if (d === 'id_1097') { v = hasMk ? 5 : (have('id_0188') && have('id_0873') || hasMR(R, P0) ? 92 : 45); nt.push(hasMk ? '마코토 이미 있음(한 장만)' : (v === 92 ? '콤보 마무리용 마코토 필요' : '마코토(콤보 마무리, 아끼는 카드)')); }
      else if (d === 'id_0205') { v = hasKid ? 3 : 30; nt.push(hasKid ? '키드 이미 있음' : '키드는 변장용(직접 안 냄)'); }
      else if (d === 'id_1096') { v = hv('id_1096') ? 8 : 58 + comboBonus(id); nt.push(hv('id_1096') ? '6코 소노코 이미 있음' : '6코 소노코(강제 컨택·콤보 마무리)'); }
      else if (d === 'id_0876' && sel0.every(x => X0.lv(x) <= 3) && fcn < 3) { v = 200; nt.push('후보가 전부 2~3코이고 지금 3코를 낼 수 없음 → 컷인 2000 있는 2코 소노코 최우선'); }
      else nt.push(`Lv${X0.lv(id)} 기본점수`);
      if (!playableHand && X0.lv(id) <= fcn) { v += 50; nt.push('손에 낼 캐릭터가 없어 FILE 이하 +50'); } return { v, nt }; };
    const score = id => scoreN(id).v;
    const cs = sel0.slice().sort((a, b) => score(b) - score(a)), names = ids => ids.map(i => `${nm(R, i)}(Lv${X0.lv(i)})`).join(', ');
    const allIds = q.ids || sel0, board = allIds.map(id => { if (!sel0.includes(id)) return `✘ ${nm(R, id)}(Lv${X0.lv(id)}) — 가져올 수 없음(${(() => { try { const dd = S.D(R, id); return dd.type !== 'char' ? '캐릭터가 아님' : '백색 조건 불충족: ' + dd.color; } catch (e) { return '조건 불충족'; } })()})`; const r = scoreN(id); return `${id === cs[0] ? '✔ 선택' : '✘ 제외'} ${nm(R, id)}(Lv${X0.lv(id)}) 점수 ${r.v} — ${r.nt.join(' / ')}`; }).join('\n');
    if (cs.length && pickV(cs[0])) return { mv: pickV(cs[0]), rule: 'wg:search-pick', why: `[서치] 덱 위 ${allIds.length}장 중 1장 선택\n${board}\n나머지는 덱 아래로` }; }
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
  if (me == null || op == null) return null; const myB = R.P[R.cards[me].o].field.concat(R.P[R.cards[me].o].pa || [], [R.P[R.cards[me].o].partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id))), opB = R.P[R.cards[op].o].field.concat(R.P[R.cards[op].o].pa || [], [R.P[R.cards[op].o].partner]).some(id => R.cards[id] && is('MR_BUFF', defOf(R, id))), myAp = X.ap(me) + (myB && X.lv(me) >= 8 ? 2000 : 0), oAp = X.ap(op) + (opB && X.lv(op) >= 8 ? 2000 : 0), dis = moves.filter(m => m.tag === 'dis'), cin = moves.filter(m => m.tag === 'cin'), pass = moves.find(m => m.tag === 'pass');
  const cv = id => { let m = 0; try { for (const a of (S.D(R, id).ab || [])) if (a.ic === 'cutin' && typeof a.v === 'number' && a.v > m) m = a.v; } catch (e) {} return m; };
  if (dis.length && base.mv.tag !== 'dis') { const gain7 = 7000; if ((myAp <= 4000 && gain7 > myAp) || (myAp < oAp && gain7 >= oAp)) return { mv: dis[0], rule: 'wg:disguise', why: `변장 사용: 내 ${nm(R, me)} AP${myAp} → 키드 AP7000 (상대 ${nm(R, op)} AP${oAp}). 6~7 FILE 에서는 낮은 캐릭터로 컨택하고 변장하면 상대가 대응하기 어렵다` }; }
  const macoOn = X.P.field.some(id => is('FINISHER', defOf(R, id)));
  if (macoOn && side === 'atk' && !is('FINISHER', defOf(R, me)) && myAp < 10000 && cin.length) { const ok = cin.filter(m => !is('MR_BUFF', defOf(R, m.m.id)) && myAp + cv(m.m.id) >= 10000 && myAp + cv(m.m.id) >= oAp).sort((a, b) => cv(a.m.id) - cv(b.m.id))[0];
    if (ok) return { mv: ok, rule: 'wg:cutin-10000', why: `컷인으로 AP${myAp + cv(ok.m.id)} = 10000 이상 → 마코토 효과(드로우+액티브) 발동 조건. 10000 을 만들 수 있으면 항상 만든다` }; }
  if (base.mv.tag === 'cin' && is('MR_BUFF', defOf(R, base.mv.m.id)) && !(myAp < oAp && myAp + 2000 >= oAp)) { const alt = cin.find(m => !is('MR_BUFF', defOf(R, m.m.id))) || pass; if (alt) return { mv: alt, rule: 'wg:mr-no-cutin', why: 'MR 은 내는 것이 기본이라 컷인으로는 어쩔 수 없을 때만 사용' }; }
  return null; }

// 미스리드: 상대 FILE 5 이상이면 쓰지 않음(돌격으로 누운 캐릭터가 죽을 수 있음). FILE 4 이하 + 파트너(리더) 추리이면, 나를 칠 수 있는 상대 캐릭터가 없을 때만 사용
function misread(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.type !== 'mis') return null; const O = R.P[1 - seat], X = ctxOf(c), none = moves.find(m => m.m.ids && m.m.ids.length === 0);
  const ofc = O.file.length + (O.pIn ? 1 : 0);                                       // 어시스트하면 파트너가 FILE 에 들어가 +1 (돌격은 Lv5 이상)
  if (ofc >= 5) return none ? { mv: none, rule: 'wg:no-misread', why: `상대 FILE ${ofc}${O.pIn ? '(어시스트 포함)' : ''} ≥ 5: 돌격이 나올 수 있어 미스리드로 누우면 위험 → 사용 안 함` } : null;
  // v0.6: 상대 FILE 4 이하(돌격 없음)에서는 미스리드를 쓰지 않을 이유가 없다 — 누운 캐릭터는 다음 내 턴에 일어난다. 내 미스리드 캐릭터를 공격할 수 있는 상대 캐릭터(액티브 + 이번 턴 등장하지 않았거나 돌격/신속)의 AP 가 같거나 높으면 사용하지 않는다.
  const canHit = id => O.field.some(t => act(R, t) && !(R.cards[t].sum && !S.FX.hasKwTk(R, t, 'rapid') && !S.FX.hasKwTk(R, t, 'assault')) && X.tap(t) >= X.ap(id) + (X.hasBuff && X.lv(id) >= 8 ? 2000 : 0));
  const ok = id => !canHit(id);
  const want = moves.filter(m => m.m.ids && m.m.ids.length > 0 && m.m.ids.every(ok)).sort((a, b) => b.m.ids.length - a.m.ids.length)[0];
  if (want) return { mv: want, rule: 'wg:misread', why: `상대 FILE ${ofc} ≤ 4 (돌격 불가) → 미스리드 사용: ${want.m.ids.map(id => nm(R, id)).join(', ')} (LP-${want.m.ids.length}) — 나를 공격할 수 있는 상대 캐릭터 중 AP 가 같거나 높은 것이 없음` };
  return none ? { mv: none, rule: 'wg:no-misread', why: '상대에 나를 공격할 수 있고 AP 가 같거나 높은 캐릭터가 있어 누우면 죽을 수 있음 → 사용 안 함' } : null; }

// R12 가드: 내 캐릭터가 맞아 죽게 되면 더 싼 액티브 캐릭터로 블록
function guardWin(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.type !== 'guard' || u.atk == null) return null; const gm = moves.filter(m => m.tag === 'guard' && m.m.id != null); if (!gm.length) return null; const X = ctxOf(c);
  const aAp = X.ap(u.atk) + (X.oBuff && X.lv(u.atk) >= 8 ? 2000 : 0), eff = id => X.ap(id) + (X.hasBuff && X.lv(id) >= 8 ? 2000 : 0);                  // v0.9: 내 MR 이 깔려 있으면 Lv8+ 수비수는 +2000
  const win = gm.filter(m => eff(m.m.id) > aAp).sort((a, b) => X.lv(a.m.id) - X.lv(b.m.id))[0];
  if (win) return { mv: win, rule: 'wg:guard-win', why: `${nm(R, win.m.id)}(AP${X.ap(win.m.id)}${X.hasBuff && X.lv(win.m.id) >= 8 ? '+MR2000=' + eff(win.m.id) : ''})가 공격자 ${nm(R, u.atk)}(AP${aAp})를 이김 → 블록해서 공격자를 제거` }; return null; }
function guard(c) { const gw = guardWin(c); if (gw) return gw; const g0 = guard0(c); if (!g0) return g0; const { R, seat } = c, O = R.P[1 - seat]; if (g0.rule === 'wg:guard-weak' && O.file.length >= 6) return null;
  // v0.16: 상대가 5코 돌격을 낼 수 있는 FILE 5+ 이면 액티브 캐릭터로 블록하지 않음 (블록한 캐릭터와 지키려던 캐릭터가 둘 다 죽을 수 있음)
  if (g0.rule === 'wg:guard-weak' && O.file.length + (O.pIn ? 1 : 0) >= 5 && g0.mv.m && g0.mv.m.id != null && act(R, g0.mv.m.id)) { const ng = c.moves.find(m => m.tag === 'noguard'); if (ng) return { mv: ng, rule: 'wg:no-active-block', why: `상대 FILE ${O.file.length + (O.pIn ? 1 : 0)} ≥ 5: 5코 돌격이 나올 수 있어 액티브 ${nm(R, g0.mv.m.id)}로 블록하지 않음 (블록한 캐릭터와 지키려던 캐릭터가 둘 다 죽을 수 있음)` }; }
  return g0; }
function guard0(c) { const { R, seat, moves } = c, u = R.sub; if (!u || u.atk == null || u.tk !== 'char' || u.tid == null || !R.cards[u.tid] || R.cards[u.tid].o !== seat) return null; u.def = u.tid;
  const X = ctxOf(c), gm = moves.filter(m => m.tag === 'guard'); if (!gm.length) return null; const O1 = R.P[1 - seat];
  if (O1.file.length >= 6 && c.base.mv.tag === 'guard') { const gid = c.base.mv.m.id; if (gid != null && X.ap(gid) < 7000) { const ng = moves.find(m => m.tag === 'noguard'); if (ng) return { mv: ng, rule: 'wg:no-guard-vs-disguise', why: `상대 FILE ${O1.file.length} ≥ 6: 키드 변장(AP7000)이 가능하므로 ${nm(R, gid)}(AP${X.ap(gid)})로 막지 않음` }; } }
  const aAp = X.ap(u.atk) + (X.oBuff && X.lv(u.atk) >= 8 ? 2000 : 0), dAp = X.ap(u.def) + (X.hasBuff && X.lv(u.def) >= 8 ? 2000 : 0), dies = aAp >= dAp; if (!dies) return null;
  const cheap = gm.filter(m => m.m.id !== u.def && X.lv(m.m.id) < X.lv(u.def)).sort((a, b) => X.lv(a.m.id) - X.lv(b.m.id))[0];
  if (cheap) return { mv: cheap, rule: 'wg:guard-weak', why: `${nm(R, u.def)}(Lv${X.lv(u.def)}, AP${dAp})가 AP${aAp} 공격에 리무브됨 → 더 싼 ${nm(R, cheap.m.id)}(Lv${X.lv(cheap.m.id)})로 블록` };
  return null; }

module.exports = { id: '0.16', label: 'WG-AI v0.16', date: '2026-10',
  notes: 'v0.4 + PD 피드백 4차(미스리드 조건·변장 대비 수비/공격·소노코 우선/액티브 우선/사건효과 연계·마코토 선행·FILE 8+ 무추리·헤이지 돌격·밀어내기 전 행동·리살 체크). v0.4 = v0.3 + PD 피드백 3차(변장·추리 대체·LP0·MR 첫 장·8코 순서·987 콤보·10000 컷인·서치 낭비·MR 컷인 최후수단). v0.3 = v0.2 + PD 피드백 2차(이벤트 후 등장·밀어내기 금지·막히는 공격 금지·MR 선언 조건/8코 준비·약한 캐릭터 블록). v0.2 = v0.1 + PD 피드백 1차: 이벤트 우선, 턴패스 시 추리 금지, 행동 후 등장, 확실한 킬일 때만 사건 효과, 소노코 강제 컨택 조건, 마코토 보존, 자살 공격 금지·액티브 우선.',
  hooks: { main, eff, removeTarget: eff, guard, contact, misread }, ROLE };
