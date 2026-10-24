// WG 턴 플래너 (v0.17) — "이번 턴에 상대 현장을 최대한 비운다"를 목표로 턴 전체(전개·힌트·선언·공격·추리 순서)를 룰 엔진 시뮬레이션으로 탐색한다.
//   · 판단은 관측 상태(observe.js)에서만: 상대 손패/덱·내 덱 순서는 모른다. 시뮬레이션 중 덱에서 새로 들어온(정체를 모르는) 카드는 "내는 수"의 재료로 쓰지 않는다.
//   · 상대의 응답(가드/컷인/미스리드)은 공개 정보만으로 "합리적인 상대" 모델로 가정하고, 컷인/변장으로 뒤집힐 수 있는 킬은 '위험 킬'로 할인한다.
//   · PD 규칙(8코 밀어내기 금지, FILE 7 하한, 마코토 아끼기 등)은 후보 생성/평가에 들어 있다.
//   · 결과는 "턴 계획(수순)" — 전략(v0_17)은 실제 상태가 계획대로 흘러가는 동안 계획을 따라가고, 어긋나면(상대 응답·공개된 카드) 다시 계획한다.
const SIM = require('../simulate.js');
const { S, who, genMoves, cloneable, stateKey, Node } = SIM;
const { FX, D } = S;

const DEF = (R, id) => { const c = R.cards[id]; return c ? String(c.d).replace(/^\d+:/, '') : ''; };
const nm = (R, id) => { try { return D(R, id).n; } catch (e) { return '?'; } };
const lv = (R, id) => { try { return FX.lvOf(R, id); } catch (e) { return 0; } };
const ap = (R, id) => { try { return S.ap(R, id); } catch (e) { return 0; } };
const lp = (R, id) => { try { return S.lpOf(R, id); } catch (e) { return 0; } };
const typeOf = (R, id) => { try { return D(R, id).type; } catch (e) { return ''; } };
const ID = { MR: 'id_1153', MAKOTO: 'id_1097', GIN: 'id_0688', HEIJI: 'id_0188', YUSAKU: 'id_0873', KAITO: 'id_1098', KID: 'id_0205', SONO6: 'id_1096', SONO2D: 'id_0876', SONO2C: 'id_0214', AYAKO: 'id_0308', NAKA5: 'id_0123', LG: 'id_0130', EV7: 'id_0564', CASE: 'id_1156' };
const hasMR = (R, s) => { const P = R.P[s]; return [...P.field, ...(P.pa || []), P.partner].some(id => id != null && R.cards[id] && DEF(R, id) === ID.MR); };
const effAP = (R, id) => { const s = R.cards[id].o; return ap(R, id) + (hasMR(R, s) && lv(R, id) >= 8 && !(R.sub && R.sub.type === 'contact') ? 2000 : 0); };   // 컨택 밖에서는 MR +2000 을 미리 더한다(컨택 중에는 엔진이 이미 더함)
const needOf = (R, s) => { try { const P = R.P[s]; return +(s === R.first ? D(R, P.kase).lv : D(R, P.kase).lv2) || 0; } catch (e) { return 0; } };

// ── 상대가 컷인/변장을 들고 있을 확률 (공개 정보만): 보이지 않는 카드 중 컷인 카드 수를 덱 구성(최대치)으로 가정
function hyperNone(U, K, h) { if (K <= 0 || h <= 0) return 1; if (K > U) K = U; let p = 1; for (let i = 0; i < h; i++) { const u = U - i; if (u <= 0) break; p *= Math.max(0, u - K) / u; } return p; }
function oppRisk(R, s) { const O = R.P[1 - s], vis = [...O.field, ...O.rem, ...O.evid.filter(x => R.cards[x].up), ...(O.pa || [])];
  const cnt = def => vis.filter(x => DEF(R, x) === def).length;
  const unseen = O.hand.length + O.deck.length + O.file.length + O.evid.filter(x => !R.cards[x].up).length, h = O.hand.length;
  const cutK = Math.max(0, 3 - cnt(ID.SONO2C)) + Math.max(0, 3 - cnt(ID.MR)), kidK = Math.max(0, 2 - cnt(ID.KID));
  return { pCut: 1 - hyperNone(unseen, cutK, h), pKid: 1 - hyperNone(unseen, kidK, h), fcount: S.fcount(R, 1 - s) }; }

// ── 손패 카드 "버림 가치" (낮을수록 먼저 버림)
function discardValue(R, s, id, known) {
  if (!known.has(id)) return 5;
  const d = DEF(R, id), P = R.P[s], have = def => P.hand.filter(x => DEF(R, x) === def).length, onField = def => P.field.some(x => DEF(R, x) === def);
  const mrAround = hasMR(R, s) || have(ID.MR) > 0, remHasKaito = P.rem.some(x => DEF(R, x) === ID.KAITO);
  switch (d) {
    case ID.LG: return 4; case ID.AYAKO: return 2; case ID.SONO2C: return have(ID.SONO2C) > 1 ? 2 : 4; case ID.SONO2D: return (have(ID.MAKOTO) || onField(ID.MAKOTO)) ? 5 : 3;
    case ID.NAKA5: return 4; case ID.SONO6: return have(ID.SONO6) > 1 ? 4 : 6; case ID.KID: return have(ID.KID) > 1 ? 3 : 5;
    case ID.MAKOTO: return (have(ID.MAKOTO) > 1 || onField(ID.MAKOTO)) ? 4 : 9; case ID.HEIJI: return 7; case ID.GIN: return 8; case ID.YUSAKU: return 7;
    case ID.KAITO: return mrAround && !remHasKaito ? 1 : 3;            // MR 이 있으면 카이토는 리무브로 보내 MR 선언으로 꺼낸다
    case ID.MR: return have(ID.MR) > 1 ? 6 : 9; case ID.EV7: { const n = P.rem.filter(x => { try { const dd = D(R, x); return dd.type === 'char' && (DEF(R, x) === ID.MAKOTO || String(dd.trait || '').includes('鈴木財閥')); } catch (e) { return false; } }).length; return n >= 4 ? 7 : 3; }
    default: return 5; } }

// ── 내 효과 질의의 후보(분기) — 비용(버림)·순서·서치는 휴리스틱 한 가지, 대상 선택은 전부 분기
function effCandidates(R, s, moves, known) {
  const q = R.eff && R.eff.req; if (!q) return moves.slice(0, 6);
  const msg = String(q.msg || ''), sel = q.sel || q.ids || [], pickOf = id => moves.find(m => m.m.v && m.m.v.length === 1 && m.m.v[0] === id), none = moves.find(m => m.m.v && Array.isArray(m.m.v) && m.m.v.length === 0);
  if (q.kind === 'pick') {
    if (/손패 1장을 리무브|코스트: 손패/.test(msg)) {   // 버림 비용: 가장 싼 카드 (+ MR 콤보용 카이토)
      const order = sel.slice().sort((a, b) => discardValue(R, s, a, known) - discardValue(R, s, b, known)), out = [];
      const opt = /선택, 0장이면/.test(msg);   // 마코토 패시브(+4000) 선택 버림: 마코토가 아직 때릴 수 있고 +4000 으로 이길 수 있는 상대가 생기면 버림을 먼저, 아니면 '안 함'을 먼저
      const P1 = R.P[s], O1 = R.P[1 - s], mk = P1.field.find(x => DEF(R, x) === ID.MAKOTO && canAct(R, x)), mkAp = mk != null ? effAP(R, mk) : 0,
        useful = mk != null && mkAp < 10000 && mkAp + 4000 >= 10000 && (O1.field.some(t => effAP(R, t) <= mkAp + 4000) || O1.evid.length > 0);   // 10000 이 되면 마코토 선언(드로우+액티브)이 열린다 → 때릴 것(또는 증거)이 있으면 버린다
      if (opt && none && !useful) out.push(none);
      if (order.length && pickOf(order[0])) out.push(pickOf(order[0]));
      if (opt && none && useful) out.push(none);
      const kai = order.find(x => DEF(R, x) === ID.KAITO); if (kai && kai !== order[0] && pickOf(kai) && discardValue(R, s, kai, known) <= 3) out.push(pickOf(kai));
      return out.length ? out : moves.slice(0, 2); }
    if (/덱 아래에 놓을 순서/.test(msg)) return moves.slice(0, 1);
    if (/덱 위 \d장 확인|手札に加えるカード/.test(msg)) { const best = sel.filter(x => pickOf(x)).sort((a, b) => lv(R, b) - lv(R, a))[0]; return best != null ? [pickOf(best)] : moves.slice(0, 1); }
    if (/카드를 세트할 캐릭터/.test(msg)) { const h = sel.find(x => DEF(R, x) === ID.HEIJI); const m = h != null ? pickOf(h) : (sel.length ? pickOf(sel[0]) : null); return m ? [m] : moves.slice(0, 1); }
    // 대상/등장/가져오기: 전부 분기 (내 캐릭터를 리무브하는 선택은 제외), 큰 레벨부터
    const P = R.P[s], out = [];
    const src = R.eff.it && R.eff.it.src != null ? DEF(R, R.eff.it.src) : '', O = R.P[1 - s];
    const ids = sel.filter(x => pickOf(x)).filter(x => !(/대상 캐릭터/.test(msg) && ((src === ID.YUSAKU || src === ID.EV7) ? !O.field.includes(x) : (src === ID.GIN || src === ID.SONO2D || src === ID.CASE) ? !P.field.includes(x) : false)))   // 제거/슬립은 상대 캐릭터에게, 부여(경구/소노코2/사건)는 내 캐릭터에게
      .filter(x => !(src === ID.CASE && /대상 캐릭터/.test(msg) && !(canAct(R, x) && O.field.some(t => R.cards[t].st !== 'a' && effAP(R, x) >= effAP(R, t)))))   // 사건 효과(킬 시 돌격 서치)는 아직 행동할 수 있고 죽일 대상이 있는 캐릭터에게만
      .sort((a, b) => (src === ID.CASE ? effAP(R, b) - effAP(R, a) : 0))
      // 효과로 손패에서 등장시키는 경우(1코 이벤트의 무료 등장 등)는 방금 서치한(정체 모르는) 카드도 후보 — 플래너 안에서는 '평범한 2코'로 보이므로 보수적인 가치로 계산되고, 실전에서는 공개된 실제 카드로 v0.16 규칙이 고른다
      .sort((a, b) => lv(R, b) - lv(R, a));
    for (const x of ids.slice(0, 8)) out.push(pickOf(x)); if (none && (q.min || 0) === 0) out.push(none);
    return out.length ? out : moves.slice(0, 3); }
  if (q.kind === 'opt') { if (/증거 중 표향|동시에 발동/.test(msg)) return moves.slice(0, 1);
    const srcId = R.eff.it && R.eff.it.src; if (srcId != null && DEF(R, srcId) === ID.HEIJI && /효과를 선택/.test(msg)) {   // 헤이지 세트 트리거: 등장 턴(행동 불가)이면 돌격, 이미 행동해 누웠으면 액티브 (v0.16 hattori-set 과 동일)
      const labels = q.labels || [], iA = labels.findIndex(l => /돌격|assault|突撃/i.test(l)), iB = labels.findIndex(l => /액티브|active|アクティブ/i.test(l)); const c = R.cards[srcId], sick = c.st === 'a' && !!c.sum, want = sick ? iA : iB;
      const first = moves.find(m => m.m.v === want); if (first) return [first, ...moves.filter(m => m !== first)].slice(0, 4); }
    if (srcId != null && DEF(R, srcId) === ID.EV7 && /효과를 선택/.test(msg)) {   // 7코 이벤트(리무브 4장 미만 → 1개 선택): 리무브 에리어에서 꺼내는 효과만 (2드로 1리무브·슬립은 고르지 않는다 — PD)
      const labels = q.labels || [], iR = labels.findIndex(l => /리무브 에리어|리무브에리어|登場|등장/.test(String(l))); const m = iR >= 0 ? moves.find(x => x.m.v === iR) : null; if (m) return [m]; }
    return moves.slice(0, 4); }
  if (q.kind === 'yn') return moves.slice(0, 2);
  return moves.slice(0, 1); }

// ── 상대 응답 모델 (공개 정보만): 가드는 "이기는 액티브"가 있을 때만, 컷인은 쓰지 않는다고 가정하되 뒤집힐 수 있으면 위험 기록
function oppModel(R, os, moves, risk) {
  const d = who(R); if (!d) return null;
  if (d.kind === 'sub:guard') { const u = R.sub, A = effAP(R, u.atk);
    const gs = moves.filter(m => m.tag === 'guard' && m.m.id != null).map(m => ({ m, ap: effAP(R, m.m.id) })).filter(g => g.ap > A).sort((a, b) => a.ap - b.ap);
    if (gs.length) { risk[gs[0].m.m.id] = Math.max(risk[gs[0].m.m.id] || 0, u.tk === 'case' ? 0.5 : 0.25); return gs[0].m; }   // 가드를 유도해 죽이는 수는 상대가 가드해야 성립 → 증거 공격 미끼 0.5, 캐릭터 공격 0.25 할인(어느 쪽이 죽는지만 불확실)
    // 고수 자료(「強いカードで攻め、弱いカードで守れ」): 핵심 캐릭터(Lv7↑·LP2↑)를 노리는 공격은 싼 액티브(Lv3↓)로 대신 맞아 준다 — 증거 공격은 약한 캐릭터로 막지 않는다
    if (u.tk === 'char' && u.tid != null && (lv(R, u.tid) >= 7 || lp(R, u.tid) >= 2)) {
      const ch = moves.filter(m => m.tag === 'guard' && m.m.id != null && lv(R, m.m.id) <= 3 && lv(R, m.m.id) < lv(R, u.tid)).sort((a, b) => lv(R, a.m.id) - lv(R, b.m.id) || effAP(R, a.m.id) - effAP(R, b.m.id))[0];
      if (ch) return ch; }
    return moves.find(m => m.tag === 'noguard') || moves[0]; }
  if (d.kind === 'sub:contact') { const u = R.sub;
    if (R.cards[u.def].o === os && R.P[os].hand.length) { const A = ap(R, u.atk), Dp = ap(R, u.def);   // 내 턴의 컨택: 상대 캐릭터가 수비수. 지금 AP 로 죽는데 컷인(+2000)/변장(7000)으로 살 수 있으면 위험 킬
      if (A >= Dp) { const rk = oppRisk(R, 1 - os), me = 1 - os;
        // 공식 룰: 컷인은 AP가 낮은 쪽(=수비하는 상대)이 먼저 선언하므로, 내 손패에 컷인(2코 園子)이 있으면 상대의 컷인/변장을 보고 되받아 킬을 지킬 수 있다 → 그 몫의 위험을 절반으로 (고수 자료 「カットインは攻めの保証」)
        const answer = R.P[me].hand.some(x => DEF(R, x) === ID.SONO2C) && !(R.sub.used && R.sub.used[me]);
        let p = 0; if (Dp + 2000 > A) p = Math.max(p, rk.pCut * (answer ? 0.5 : 1)); if (rk.fcount >= 6 && 7000 > A) p = Math.max(p, rk.pKid * 0.9 * (answer && A + 2000 >= 7000 ? 0.5 : 1));
        if (p > 0) risk[u.def] = Math.max(risk[u.def] || 0, p); } }
    return moves.find(m => m.tag === 'pass') || moves[0]; }
  if (d.kind === 'sub:mis') { const myFc = S.fcount(R, 1 - os), me = 1 - os, u = R.sub;
    { let lpv = 0; try { lpv = u.rs === 'p' ? (+D(R, R.P[me].partner).lp || 0) : lp(R, u.rs); } catch (e) {} const need = needOf(R, me);   // 리살 저지: 내 추리가 해결 수에 닿으면 상대는 FILE 과 무관하게 미스리드한다(v0.17 미스리드 규칙과 대칭)
      if (need > 0 && lpv > 0 && R.P[me].evid.length + lpv >= need) { const all = moves.slice().sort((a, b) => (b.m.ids || []).length - (a.m.ids || []).length)[0]; if (all && (all.m.ids || []).length) return all; } }
    if (myFc >= 5) return moves.find(m => !(m.m.ids || []).length) || moves[0];   // 상대(모델)는 내 FILE 5+ 면 미스리드로 눕지 않는다(돌격 위험) — v0.16 규칙과 동일
    const all = moves.slice().sort((a, b) => (b.m.ids || []).length - (a.m.ids || []).length)[0]; return all || moves[0]; }
  return moves[0]; }

// ── 선언 효과의 전제 조건 (엔진은 '선언 가능'만 보므로, 효과가 실제로 일을 하는지 플래너가 미리 거른다)
const isPolice = (R, id) => { try { return String(D(R, id).trait || '').includes('警察'); } catch (e) { return false; } };
const canAct = (R, id) => { const c = R.cards[id]; if (!c || c.st !== 'a') return false; if (!c.sum) return true; try { return !!S.tok(D(R, id)).asC || FX.hasKwTk(R, id, 'assault'); } catch (e) { return false; } };
const mrTarget = (R, id) => { try { const d = D(R, id), nmv = [d.n, ...(d.ab || []).filter(a => a.ic === 'static' && a.nm).map(a => a.nm)]; return lv(R, id) <= 8 && (d.ab || []).some(a => a.ic === 'static' && a.kw === 'assault') && nmv.some(n => n === '服部平次' || n === '怪盗キッド'); } catch (e) { return false; } };
function abilityOk(R, s, m) { const id = m.m.id, d = DEF(R, id), P = R.P[s], O = R.P[1 - s]; let ab = null; try { ab = (D(R, id).ab || [])[m.m.i]; } catch (e) {} if (!ab || ab.ic !== 'declare') return true;
  const oppAct = O.field.filter(x => R.cards[x].st === 'a'), A = x => effAP(R, x);
  switch (d) {
    case ID.SONO6: return P.field.some(x => x !== id && R.cards[x].st === 's') && O.field.length > 0;
    case ID.MR: return P.rem.some(x => mrTarget(R, x)) && O.field.length > 0;
    case ID.GIN: { if (!(P.hand.length > 0 && oppAct.length > 0 && P.field.some(x => isPolice(R, x) && canAct(R, x) && oppAct.some(t => A(x) >= A(t))))) return false;
      // 선언(손패 1장)은 '필요할 때만': 눕힌 상대만으로는 내 공격수가 남을 때 (눕힌 킬 가능 대상 수 < 행동 가능한 공격수 수)
      const slp = O.field.filter(t => R.cards[t].st !== 'a'), atk = P.field.filter(x => canAct(R, x) && O.field.some(t => A(x) >= A(t)));
      const slpKill = slp.filter(t => atk.some(x => A(x) >= A(t))).length; return slpKill < atk.length; }
    case ID.SONO2D: return oppAct.length > 0 && P.field.some(x => DEF(R, x) === ID.MAKOTO && canAct(R, x) && oppAct.some(t => A(x) >= A(t)));
    case ID.HEIJI: { const c = R.cards[id]; if (c.st === 'a' && !c.sum) return false; return O.field.some(t => R.cards[t].st !== 'a' && A(id) >= A(t)) || c.st === 's'; }
    case ID.CASE: return P.field.some(x => canAct(R, x) && O.field.some(t => R.cards[t].st !== 'a' && A(x) >= A(t)));
    default: return true; } }

// ── 7코 이벤트(鈴木家と京極真, id_0564) 사용 규칙 (PD): 리무브 에리어의 마코토/스즈키 재벌 캐릭터 4장↑(3개 효과 모두)일 때 쓰는 카드.
//    손패가 망해 어쩔 수 없이 쓸 때도 '리무브 에리어의 Lv7 이하 마코토/스즈키 재벌 캐릭터 등장'에만 쓴다 — 2드로 1리무브·슬립을 고르기 위해 쓰느니 턴 종료가 낫다.
const isMakotoSuzuki = (R, x) => { try { const dd = D(R, x); return dd.type === 'char' && (DEF(R, x) === ID.MAKOTO || String(dd.trait || '').includes('鈴木財閥')); } catch (e) { return false; } };
function ev7Info(R, s) { const ms = R.P[s].rem.filter(x => isMakotoSuzuki(R, x)); return { n: ms.length, full: ms.length >= 4, recoverable: ms.some(x => lv(R, x) <= 7 && canPlace(R, s, x)) }; }   // 꺼낼 캐릭터를 현장에 놓을 수 있어야 '꺼내기' 용도가 성립
// 현장에 놓을 수 있는가 (5/5 이면 가장 싼 8코 미만 캐릭터를 밀어낼 수 있을 때만 — PD 밀어내기 규칙과 동일)
const canPlace = (R, s, x) => { const P = R.P[s]; if (typeOf(R, x) !== 'char') return true; if (P.field.length < 5) return true; const minF = Math.min(...P.field.map(y => lv(R, y))); return minF < lv(R, x) && minF < 8; };
// 7코 이벤트 말고 낼 수 있는 카드가 있는가 (지금 FILE 로, 어시스트하면, 허용되는 힌트로 FILE 맨 위 카드를) — '손패가 망했다'의 판정
function otherPlayExists(R, s, exceptId, known, fc, danger) { const P = R.P[s];
  const okCard = (x, f) => x != null && x !== exceptId && known.has(x) && DEF(R, x) !== ID.KID && DEF(R, x) !== ID.EV7 && lv(R, x) <= f && canPlace(R, s, x);
  if (P.hand.some(x => okCard(x, fc))) return true;
  if (!P.pIn && R.cards[P.partner] && R.cards[P.partner].st === 'a' && P.field.length < 5 && P.hand.some(x => okCard(x, fc + 1))) return true;
  if ((fc - 1 >= 7 || danger) && okCard(P.file[P.file.length - 1], fc - 1)) return true;
  return false; }
// '손패가 망했다' = 이 턴에 아직 아무것도 내지 않았고(힌트 창의 두 번째 사용도 아님) 7코 이벤트 말고는 낼 수 있는 카드가 없다
function ev7Ok(R, s, id, known, fc, danger, playedAny) { const i = ev7Info(R, s); return i.full || (i.recoverable && !playedAny && !otherPlayExists(R, s, id, known, fc, danger)); }

// ── 전개 카드가 "이번 턴 킬로 이어질 가능성" (정렬 휴리스틱) — 프로의 사고: 어떤 카드로 상대 캐릭터를 몇 장 치울 수 있는가
function playPotential(R, s, id) {
  const P = R.P[s], O = R.P[1 - s], d = DEF(R, id), mr = hasMR(R, s) || P.hand.some(x => DEF(R, x) === ID.MR), l = lv(R, id);
  const slp = O.field.filter(t => R.cards[t].st !== 'a'), act = O.field.filter(t => R.cards[t].st === 'a'), A = x => effAP(R, x);
  const myAp = (base) => base + (mr && l >= 8 ? 2000 : 0), killsSlp = apv => slp.filter(t => apv >= A(t)).length, killsAct = apv => act.filter(t => apv >= A(t)).length;
  switch (d) {
    case ID.YUSAKU: return (O.field.some(t => ap(R, t) <= 8000) ? 140 : 0) + 10 + (P.field.concat(P.hand).some(x => x !== id && DEF(R, x) === ID.HEIJI) ? 20 : 0);   // 콤보 A(세트 → 헤이지 돌격/액티브)
    case ID.GIN: { const atkN = P.field.filter(x => canAct(R, x)).length + 1, slpK = slp.filter(t => myAp(8000) >= A(t)).length; return (killsSlp(myAp(8000)) ? 120 : 0) + (P.hand.length >= 2 && killsAct(myAp(8000)) && slpK < atkN ? 90 : 0); }   // 선언(액티브 처리)은 눕힌 대상만으로 공격수가 남을 때만 가치
    case ID.MR: return P.rem.some(x => mrTarget(R, x)) && O.field.length ? 130 : killsSlp(10000) ? 120 : 20;
    case ID.KAITO: return killsSlp(myAp(7000)) ? 100 : 0;
    case ID.HEIJI: return (killsSlp(myAp(8000)) ? 110 : 10) + (P.hand.some(x => x !== id && DEF(R, x) === ID.YUSAKU) ? 20 : 0);   // 콤보 A(헤이지→유사쿠) 부품
    case ID.MAKOTO: return killsSlp(6000) ? 100 : 0;
    case ID.NAKA5: return killsSlp(5000) ? 100 : 0;
    case ID.SONO6: { const strong = P.field.concat(P.hand).some(x => x !== id && typeOf(R, x) === 'char' && O.field.some(t => A(x) >= A(t))); return strong && O.field.length ? 90 : 10; }
    case ID.SONO2D: return (P.field.concat(P.hand).some(x => DEF(R, x) === ID.MAKOTO) && act.length) ? 80 : 0;
    case ID.EV7: { const i = ev7Info(R, s); return i.full ? 120 : i.recoverable ? 60 : 0; }   // 4장↑: 3개 효과 모두(드로우·등장·슬립) / 그 외: 리무브 에리어에서 꺼내는 용도만(손패가 망했을 때)
    case ID.LG: return S.fcount(R, s) >= 5 ? 60 : 40;
    case ID.AYAKO: return P.rem.some(x => { try { const dd = D(R, x); return dd.type === 'char' && DEF(R, x) !== ID.AYAKO && String(dd.trait || '').includes('鈴木財閥'); } catch (e) { return false; } }) ? 30 : 0;
    default: return 0; } }

// ── 내 후보 생성 + 정렬 (PD 하드 규칙 포함). mode: 'search'(탐색 정렬) | 'greedy'(기본 전투 수순) | 'lethal'(증거 라인만)
function myCandidates(R, s, moves, st, known, mode = 'search') {
  const P = R.P[s], O = R.P[1 - s], out = [], danger = O.evid.length >= needOf(R, 1 - s) - 1, fc = S.fcount(R, s);
  const playableAfterHint = () => { const top = P.file[P.file.length - 1]; const pool = [...P.hand, top].filter(x => x != null && known.has(x)); const minF = P.field.length >= 5 ? Math.min(...P.field.map(y => lv(R, y))) : -1;
    return pool.some(x => { try { if (lv(R, x) > fc - 1) return false; if (DEF(R, x) === ID.EV7) { const i = ev7Info(R, s); return i.full || (i.recoverable && !st.playedAny); } if (typeOf(R, x) !== 'char') return true; if (DEF(R, x) === ID.KID) return false; return minF < 0 || (minF < lv(R, x) && minF < 8); } catch (e) { return false; } }); };   // 현장 5/5 이면 밀어낼 수 있는(더 싼, 8코 미만) 캐릭터가 있어야 '낼 수 있음'; 7코 이벤트는 사용 규칙에 맞을 때만
  const blockers = O.field.filter(x => R.cards[x].st === 'a').map(x => effAP(R, x)), worstB = blockers.length ? Math.max(...blockers) : 0;
  const sc = m => { switch (m.tag) {
    case 'solve': return 100000;
    case 'atkc': { if (mode === 'lethal') return null; const a = effAP(R, m.m.id), t = effAP(R, m.m.tid); if (a < t) return null; const sure = a >= t + 2000 || !O.hand.length; return (sure ? 560 : 360) + lv(R, m.m.tid) * 10 + (R.cards[m.m.tid].st === 'a' ? 30 : 0) - lv(R, m.m.id); }
    case 'ability': { if (!abilityOk(R, s, m)) return null; const d = DEF(R, m.m.id); if (mode === 'lethal') return null;
      if (mode === 'greedy') return d === ID.MAKOTO ? 710 : d === ID.GIN ? 700 : d === ID.MR ? 690 : d === ID.SONO2D ? 680 : d === ID.HEIJI ? 650 : d === ID.CASE ? 640 : d === ID.SONO6 ? 320 : 300;
      return d === ID.MAKOTO ? 350 : d === ID.GIN ? 620 : d === ID.MR ? 615 : d === ID.SONO2D ? 610 : d === ID.HEIJI ? 605 : d === ID.SONO6 ? 330 : d === ID.CASE ? 600 : 300; }   // 탐색 정렬: 전개(800↑) → 전투 전 선언(600↑) → 공격(560↓) → 전투 후 선언(소노코6/마코토) → 추리/증거
    case 'play': { if (st.acted || mode !== 'search') return null; const id = m.m.id; if (!known.has(id)) return null; const l = lv(R, id), d = DEF(R, id); if (d === ID.KID) return null;   // 7코 키드는 변장 전용
      if (d === ID.EV7 && !ev7Ok(R, s, id, known, fc, danger, !!st.playedAny)) return null;   // 7코 이벤트: 리무브 4장↑(3개 모두) 또는 '손패가 망했을 때 리무브에서 꺼내기' 만 — 2드로/슬립용 사용은 턴 종료보다 나쁨
      if (m.m.rep != null) { const rl = lv(R, m.m.rep); if (rl >= 8 || rl >= l) return null; const cheapest = Math.min(...P.field.map(x => lv(R, x))); if (rl !== cheapest) return null; }   // 밀어내기는 가장 싼 캐릭터만, 8코 이상/더 비싸거나 같은 카드 밀어내기 금지
      return 700 + l * 6 + playPotential(R, s, id) + (typeOf(R, id) === 'event' ? 10 : 0) + (d === ID.MAKOTO ? -20 : d === ID.KAITO ? -30 : 0); }
    case 'assist': { if (st.acted || mode !== 'search' || P.field.length >= 5) return null; const en = P.hand.filter(x => known.has(x) && typeOf(R, x) === 'char' && lv(R, x) >= fc && lv(R, x) <= fc + 1 && DEF(R, x) !== ID.KID); return en.length ? 700 + Math.max(0, ...en.map(x => playPotential(R, s, x))) : 300; }   // FILE+1 은 'fc+1 카드' 또는 '힌트 후 fc 카드'를 가능하게 한다 — 그 카드의 킬 가능성만큼 가산
    case 'hint': { if (st.acted || mode !== 'search') return null; if (fc >= 7 && fc - 1 < 7 && !danger && !st.lethalHint) return null; /* FILE(파트너 포함) 7 하한: 7 → 6 으로 내려가는 힌트 금지 (죽기 직전 제외) */ if (!playableAfterHint()) return null; return 650; }
    case 'skip': return 50;
    case 'reason': { if (m.m.who !== 'p' && lp(R, m.m.who) <= 0) return null; return 100 + (m.m.who === 'p' ? 5 : lp(R, m.m.who) * 10); }
    case 'atkk': { const a = effAP(R, m.m.id); if (mode === 'lethal' && a < worstB) return null; return a >= worstB ? (mode === 'lethal' ? 500 : 95) : 60; }
    case 'end': return 1;
    default: return mode === 'search' ? 10 : null; } };
  for (const m of moves) { const v = sc(m); if (v != null) out.push({ m, v }); }
  out.sort((a, b) => b.v - a.v); return out.map(x => x.m); }

// ── 평가 (턴이 끝난 상태) — 킬이 최우선, 나머지는 PD 규칙에 따른 자원 관리
function evaluate(R0, R, s, risk, opts) {
  const P = R.P[s], O = R.P[1 - s], P0 = R0.P[s], O0 = R0.P[1 - s]; let v = 0; const notes = [];
  if (R.phase === 'over') return { v: R.winner === s ? 1e6 : -1e6, notes: [R.winner === s ? '승리' : '패배'] };
  let kills = 0, kw = 0; for (const id of O0.field) if (!O.field.includes(id)) { const p = risk[id] || 0, w = (1 + lv(R0, id) / 10) * (1 - p); kills++; kw += w; }
  v += 100 * kw; if (kills) notes.push(`킬 ${kills}(가중 ${kw.toFixed(1)})`);
  if (O0.field.length && !O.field.length) { v += 60; notes.push('전부 정리 +60'); }
  for (const id of O.field) v -= 6 + 2 * lv(R, id);
  // 증거 경쟁(레이스): 해결에 가까워질수록 한 장의 가치가 가파르게 커진다 — 내 k번째 증거 15+12k, 상대의 k번째 증거를 뺏으면 12+12k (상대가 해결 직전이면 더)
  const ev = P.evid.length - P0.evid.length, oev = O0.evid.length - O.evid.length, needO = needOf(R, 1 - s), needMe = needOf(R, s);
  let phase = Math.max(0.1, Math.min(1, (S.fcount(R0, s) - 2) / 8));   // 초반(FILE 작음)의 내 증거는 가치를 낮게 — 몸(현장)이 먼저. 뺏길 수 있고 아직 해결을 위협하지 못한다
  // 고수 定石(후공 1턴 「2コス + 相手が何も出さなければ推理」): 상대 현장이 비어 있으면 내 증거를 다음 턴에 뺏을 캐릭터가 없으므로 초반에도 증거 가치를 살린다.
  // 반대로 상대가 내 증거를 공격할 수 있는 캐릭터(내 액티브 가드로 이기지 못하는)를 두고 있으면 초반 증거는 되찾아 가는 템포 손해 → 더 낮게
  if (!O.field.length) phase = Math.max(phase, 0.5);
  else if (phase < 0.4) { const myGuardAp = Math.max(0, ...P.field.filter(x => R.cards[x].st === 'a').map(x => effAP(R, x))); if (O.field.some(t => effAP(R, t) >= myGuardAp)) phase *= 0.5; }
  for (let k = P0.evid.length + 1; k <= P.evid.length; k++) v += (15 + 12 * Math.min(k, needMe)) * phase; for (let k = P.evid.length + 1; k <= P0.evid.length; k++) v -= 15 + 12 * Math.min(k, needMe);
  for (let k = O.evid.length + 1; k <= O0.evid.length; k++) v += 12 + 12 * Math.min(k, needO) + (k >= needO - 1 ? 20 : 0); for (let k = O0.evid.length + 1; k <= O.evid.length; k++) v -= 12 + 12 * Math.min(k, needO);
  if (ev || oev) notes.push(`증거 +${ev}/상대 -${oev}`);
  for (const id of O.field) v -= 8 * Math.max(0, lp(R, id));   // 남은 상대 캐릭터의 추리력(다음 턴 증거)
  // 상대 리살 위협: 다음 턴 상대가 얻을 수 있는 증거 상한(파트너 추리 1 + 남은 캐릭터의 추리력 + 내 증거를 뺏는 액션) ≥ 상대 해결 필요 수 → 지금 추리꾼을 치우거나 증거를 뺏어 막아야 한다
  { const lps = O.field.map(id => Math.max(0, lp(R, id))), steals = Math.min(P.evid.length, lps.filter(x => x === 0).length), pot = O.evid.length + 1 + lps.reduce((t, x) => t + x, 0) + steals;
    if (pot >= needO) { v -= 150 * (pot - needO + 1); notes.push(`상대 리살 위협(다음 턴 최대 ${pot}/${needO}) -${150 * (pot - needO + 1)}`); } else if (pot === needO - 1) v -= 30; }
  const f1 = P.file.length, fcEnd = f1 + (P.pIn ? 1 : 0);   // FILE 하한은 후보 규칙·v0.16 과 같이 '파트너 포함' 수로 본다(PD: "6파일(파트너포함)")
  if (fcEnd < 7) { v -= 40 * (7 - fcEnd); notes.push(`FILE ${fcEnd}${P.pIn ? '(파트너 포함)' : ''} (7 미만)`); } else v += 4 * Math.min(fcEnd, 9);
  for (const id of P.hand) if (typeOf(R, id) === 'char') { const l = lv(R, id); if (l > f1 + 3) v -= 10; else if (l > f1 + 2) v -= 4; }
  for (const id of P.hand) { const d = DEF(R, id); v += 2 + (typeOf(R, id) === 'char' ? lv(R, id) / 4 : 1); if (d === ID.MAKOTO) v += 10; else if (d === ID.MR) v += 5; else if (d === ID.GIN || d === ID.YUSAKU) v += 3; else if (d === ID.SONO2C || d === ID.SONO6) v += 2; }   // 손패 가치: 레벨과 역할(제거·액티브 처리·컷인 도구)에 따라 — 선언 비용으로 버리는 카드도 그만큼 비싸다
  for (const id of P.field) { v += 6 + 2 * lv(R, id) + 4 * Math.max(0, lp(R, id)) + ap(R, id) / 500; if (R.cards[id].st !== 'a') v -= lv(R, id); }   // 현장의 몸(다음 턴 공격·추리·블록) — 추리력이 있으면 매 턴 증거
  // 殴り返し(고수 자료 「相手の現場に殴り返し要員が残る場合にはキャラを動かさない」): 눕힌 내 캐릭터는 다음 상대 턴에 남은 상대 캐릭터(AP 같거나 높음)에게 잡힌다 → 그 몸값의 40% 를 기대 손실로
  { let hit = 0; for (const id of P.field) { if (R.cards[id].st === 'a') continue; const a = effAP(R, id); if (O.field.some(t => effAP(R, t) >= a)) { hit++; v -= 0.4 * (6 + 2 * lv(R, id) + 4 * Math.max(0, lp(R, id)) + ap(R, id) / 500); } } if (hit) notes.push(`殴り返し 노출 ${hit}장`); }
  // 컷인 1장 보유(고수 자료 「攻める側もカットインを1枚キープ」): 손패에 2코 園子(컷인)가 1장 이상 남으면 가산 — 마지막 컷인을 쓰는 수는 그만큼 비싸진다
  if (P.hand.some(x => DEF(R, x) === ID.SONO2C)) v += 6;
  if (hasMR(R, s)) v += 12;
  { const mrCut = P0.hand.filter(id => DEF(R0, id) === ID.MR && !P.hand.includes(id) && P.rem.includes(id)).length; if (mrCut) { v -= 12 * mrCut; notes.push(`MR 컷인/버림 ${mrCut}장 -${12 * mrCut}`); } }   // MR 은 내는 카드 — 컷인/비용으로 쓰는 것은 최후 수단
  if (opts && opts.makotoWaste && !opts.makotoKilled) { v -= 16; notes.push('다른 5코↑가 있는데 마코토를 내고 킬도 없음 -16'); }
  if (opts && opts.wastedHint) { v -= 15 * opts.wastedHint; notes.push(`이유 없는 힌트 ${opts.wastedHint}회 -${15 * opts.wastedHint}`); }
  if (opts && opts.played) { const pl = opts.played, has = d => pl.includes(d), closer = has(ID.MAKOTO) || has(ID.SONO6);   // PD 목표 콤보: A 헤이지→유사쿠→마코토/6소노코, B MR(카이토)→8코→마코토/6소노코
    if ((has(ID.HEIJI) && has(ID.YUSAKU) && closer) || (opts.mrDeclared && (has(ID.GIN) || has(ID.HEIJI) || has(ID.YUSAKU)) && closer)) { v += 15; notes.push('PD 콤보 수행 +15'); } }
  if (opts && opts.caseHolder != null) { if (opts.killsAtEnd && opts.killsAtEnd[opts.caseHolder]) { v += 12; notes.push('사건 효과(돌격 서치) 발동 +12'); } else { v -= 6; notes.push('사건 효과 불발(증거만 뒤집음) -6'); } }   // 시뮬레이션의 덱은 '평범한 카드'라 서치 결과가 안 보이므로 기대값으로 보정
  if (opts && !opts.playedAny && ev > 0 && !P0.field.length) { v -= 30 * ev; notes.push(`턴패스(낸 것·현장 없음)인데 추리 -${30 * ev}`); }   // PD R2: 아무것도 못 내는 턴에는 추리하지 않는다(증거를 일찍 쌓아 뺏기지 않게). 낼 수 있으면(어시스트 포함) 내는 쪽이 항상 우선
  if (P.pIn && opts && !opts.playedAny) { v -= 8; notes.push('낸 것 없는 어시스트 -8'); }   // 어시스트는 전개로 이어질 때만 (파트너를 그냥 눕히지 않는다)
  if (P.deck.length < 12) v -= 2 * (12 - P.deck.length);
  if (R.cards[P.kase] && R.cards[P.kase].solved && !(R0.cards[P0.kase] && R0.cards[P0.kase].solved)) v += 10;
  return { v, notes, kills, kw, ev, oev }; }

// ── 탐색: (1) 리살(증거 라인) 탐침 → (2) 반복 확장(폭 2→3→5→전체) DFS + 전치표 + 노드 예산. 각 노드에서 "기본 전투 수순(greedy)"으로 끝까지 굴려 본 평가를 하한으로 삼는다.
function plan(Rin, s, opts = {}) {
  if (!cloneable(Rin)) return null;
  // 상대의 비공개 카드(손패·덱·FILE·뒷면 증거)는 관측 상태에서 무작위 대역으로 채워져 있다 → 플래너는 이를 고정된 '평범한 카드'로 바꿔 결정이 대역 추첨에 흔들리지 않게 한다 (정보 규칙은 그대로: 내용을 모른다)
  const R0 = SIM.clone(Rin); { const OBS = require('./observe.js'); const hid = OBS.hiddenOppIds(R0, s); const sample = Object.keys(R0.cards).find(x => DEF(R0, x) === ID.SONO2C) || Object.keys(R0.cards).find(x => typeOf(R0, x) === 'char'); const van = sample != null ? R0.cards[sample].d : null; if (van) { for (const x of hid) R0.cards[x].d = van; for (const x of R0.P[s].deck) if (R0.cards[x]) R0.cards[x].d = van; } }   // 내 덱 순서도 모른다 → 덱에서 올 카드 역시 '평범한 카드'로 (덱 순서 추첨에 결정이 흔들리지 않게)
  const budget = opts.nodes || +process.env.WG_PLAN_NODES || 6000, tmax = opts.ms || +process.env.WG_PLAN_MS || 3000, t0 = Date.now();
  const P0 = R0.P[s], known = new Set([...P0.hand, ...P0.file, ...P0.field, ...P0.rem, ...(P0.pa || [])]);
  const root = Node.root(R0, (opts.seed || 7) >>> 0); let nodes = 0, best = null, stopped = false;
  const turnN = R0.n;
  const terminal = R => R.phase === 'over' || R.turn !== s || R.n !== turnN;
  const consider = (R, path, risk, st) => { const e = evaluate(R0, R, s, risk, { makotoKilled: st.makotoKilled, makotoWaste: st.makotoWaste, wastedHint: st.wastedHint, playedAny: st.playedAny, caseHolder: st.caseHolder, killsAtEnd: st.killsAtEnd, played: st.played, mrDeclared: st.mrDeclared }); if (!best || e.v > best.v) best = { v: e.v, notes: e.notes, kills: e.kills, kw: e.kw, ev: e.ev, oev: e.oev, path: path.slice(), risk: { ...risk } }; return e; };
  const advance = (st, mv, R, R2, d, moves) => { const st2 = { ...st }; if (mv.tag === 'atkc' || mv.tag === 'atkk' || mv.tag === 'reason') st2.acted = true;
    if (mv.tag === 'skip') st2.wastedHint = (st.wastedHint || 0) + 1;   // 힌트로 FILE 을 쓰고 아무것도 내지 않음 (이유 없는 힌트)
    if (mv.tag === 'play') { st2.playedAny = true; st2.played = [...(st.played || []), DEF(R, mv.m.id)]; }
    if (mv.tag === 'ability' && DEF(R, mv.m.id) === ID.MR) st2.mrDeclared = true;
    if (mv.tag === 'ability' && DEF(R, mv.m.id) === ID.CASE) st2.casePending = true;
    if (st.casePending && mv.tag === 'ans' && R.eff && R.eff.it && R.eff.it.src != null && DEF(R, R.eff.it.src) === ID.CASE && Array.isArray(mv.m.v) && mv.m.v.length === 1) { st2.caseHolder = mv.m.v[0]; st2.casePending = false; }
    if (mv.tag === 'end') { st2.killsAtEnd = { ...((R.fl && R.fl.kills) || {}) };   // 턴 종료 직전의 '이 턴에 컨택으로 죽인 캐릭터' 기록 (턴이 바뀌면 fl 이 지워지므로)
      if (R.P[s].field.some(x => DEF(R, x) === ID.MAKOTO && st2.killsAtEnd[x])) st2.makotoKilled = true; }   // 마코토가 이 턴에 컨택으로 죽였는가 — 컨택은 응답(패스/컷인) 뒤에 해결되므로 공격 선언 직후가 아니라 턴 끝의 fl.kills 로 본다
    if (mv.tag === 'atkc' && DEF(R, mv.m.id) === ID.MAKOTO && !R2.P[1 - s].field.includes(mv.m.tid)) st2.makotoKilled = true;   // (즉시 해결되는 경우)
    if (mv.tag === 'play' && DEF(R, mv.m.id) === ID.MAKOTO && d.kind !== 'eff' && moves.some(x => x.tag === 'play' && x.m.id !== mv.m.id && typeOf(R, x.m.id) === 'char' && lv(R, x.m.id) >= 5 && DEF(R, x.m.id) !== ID.MAKOTO && known.has(x.m.id))) st2.makotoWaste = true;   // 다른 5코↑ 캐릭터가 있는데 손패 사용으로 마코토를 냄
    return st2; };
  const myContactPick = (R, moves) => { const u = R.sub, mine = R.cards[u.atk].o === s ? u.atk : u.def, th = mine === u.atk ? u.def : u.atk; const my = ap(R, mine), op = ap(R, th), cins = moves.filter(m => m.tag === 'cin');
    if (mine === u.atk && my < op) { const c = cins.find(m => my + 2000 >= op && DEF(R, m.m.id) !== ID.MR) || cins.find(m => my + 2000 >= op); if (c) return c; }
    if (mine === u.atk && my >= op && my < 10000 && my + 2000 >= 10000 && DEF(R, mine) !== ID.MAKOTO) { const P1 = R.P[s]; const mk = P1.field.find(x => DEF(R, x) === ID.MAKOTO && canAct(R, x) && effAP(R, x) < 10000); const c = mk != null ? cins.find(m => DEF(R, m.m.id) !== ID.MR) : null; if (c) return c; }   // 10000 컷인: 마코토 패시브(+4000) → 마코토 선언으로 이어진다
    return moves.find(m => m.tag === 'pass') || moves[0]; };
  // 기본 수순으로 끝까지: mode 'greedy'(전개 없이 전투) / 'lethal'(증거 라인)
  function rollout(node, R, path, risk, st, mode) { let steps = 0; const p = path.slice(), rk = { ...risk }; let cur = node, X = R, s2 = { ...st, acted: mode === 'greedy' ? true : st.acted };   // full: 전개 포함 기본 수순 / greedy: 전투만 / lethal: 증거 라인만
    while (steps++ < 80) { if (nodes++ > budgetLim.lim || Date.now() - t0 > tmax) { stopped = true; return null; }
      if (terminal(X)) return { e: consider(X, p, rk, s2), path: p };
      const d = who(X); if (!d) return null; const moves = genMoves(X, () => 0); if (!moves.length) return null; let mv;
      if (d.seat !== s) mv = oppModel(X, d.seat, moves, rk); else if (d.kind === 'eff') mv = effCandidates(X, s, moves, known)[0]; else if (d.kind.startsWith('sub:')) mv = myContactPick(X, moves); else mv = myCandidates(X, s, moves, s2, known, mode === 'full' ? 'search' : mode)[0];
      if (!mv) return null; const c = cur.child(mv); if (c.err) return null; const X2 = c.pending || c.node.R;
      if (d.seat === s) { p.push({ mv, key: keyOf(X, s), sig: sigOf(X), desc: describe(X, mv, s), kind: d.kind }); s2 = advance(s2, mv, X, X2, d, moves); }
      cur = c.node; X = X2; }
    return null; }
  const budgetLim = { lim: budget };
  // (1) 리살 탐침: 전개 없이 증거 공격/추리 → 사건 해결이 되는가
  const st0 = { acted: false, makotoKilled: false, makotoWaste: false, playedAny: !!(R0.fl && R0.fl.played) };   // 턴 중간에 다시 계획할 때: 이 턴에 이미 낸 카드가 있으면 '아무것도 못 낸 턴'이 아니다 (7코 이벤트 강제 사용·턴패스 추리 판정용)
  { const r = rollout(root, R0, [], {}, { ...st0 }, 'lethal'); if (r && r.e.v >= 1e6) return finish(r.path, best, nodes, t0, '리살'); }
  if (opts.greedyOnly) { const r = rollout(root, R0, [], {}, { ...st0, acted: true }, 'greedy'); return r ? finish(r.path, best, nodes, t0, 'greedy') : null; }
  const rolled = new Set();
  function rec(node, R, path, risk, st, width, tt, cap) {
    if (stopped) return; if (nodes++ > cap.lim || Date.now() - t0 > tmax) { stopped = true; return; }
    if (terminal(R)) { consider(R, path, risk, st); return; }
    const d = who(R); if (!d) return;
    const moves = genMoves(R, () => 0); if (!moves.length) return;
    if (d.seat !== s) { const mv = oppModel(R, d.seat, moves, risk); if (!mv) return; const c = node.child(mv); if (c.err) return; const R2 = c.pending || c.node.R; rec(c.node, R2, path, risk, st, width, tt, cap); return; }
    let cands; if (d.kind === 'eff') cands = effCandidates(R, s, moves, known); else if (d.kind.startsWith('sub:')) cands = moves.filter(m => m.tag === 'pass' || m.tag === 'cin' || m.tag === 'dis'); else cands = myCandidates(R, s, moves, st, known, 'search');
    // 자식마다 기본 수순(greedy)으로 끝까지 굴려 본 점수로 정렬한 뒤(best-first), 상위 width 개만 깊이 탐색
    const kids = [];
    for (const mv of cands) { if (stopped) return;
      const c = node.child(mv); if (c.err) continue; const R2 = c.pending || c.node.R;
      const key = (c.pending ? 'P' : '') + keyOf(R2, s) + (R2.eff && R2.eff.req ? '|' + R2.eff.req.kind + (R2.eff.req.msg || '').slice(0, 20) : '');
      if (tt.has(key)) continue; tt.add(key);
      const st2 = advance(st, mv, R, R2, d, moves), risk2 = { ...risk };
      const step = { mv, key: keyOf(R, s), sig: sigOf(R), desc: describe(R, mv, s), kind: d.kind };
      path.push(step); let sc = -Infinity; const rk = keyOf(R2, s) + (R2.eff && R2.eff.req ? '|' + sigOf(R2) : '');
      if (!rolled.has(rk)) { rolled.add(rk); budgetLim.lim = cap.lim; const r = terminal(R2) ? { e: consider(R2, path, risk2, st2) } : rollout(c.node, R2, path, risk2, st2, 'full'); if (r && r.e) sc = r.e.v; }
      path.pop(); if (stopped) return; kids.push({ mv, c, R2, st2, risk2, step, sc }); }
    kids.sort((x, y) => y.sc - x.sc);
    for (const k of (d.kind === 'eff' ? kids : kids.slice(0, width))) { if (stopped) return; path.push(k.step); rec(k.c.node, k.R2, path, k.risk2, k.st2, width, tt, cap); path.pop(); }
  }
  const widths = opts.widths || [2, 3, 5, 99], share = opts.share || [0.15, 0.25, 0.3, 0.3]; let used = nodes;
  for (let k = 0; k < widths.length; k++) { if (Date.now() - t0 > tmax) break; const lim = used + Math.round(budget * share[k]); stopped = false; const cap = { lim };
    rec(root, R0, [], {}, { ...st0, lethalHint: !!opts.lethalHint }, widths[k], new Set(), cap); used = Math.max(used, nodes); }
  if (!best) return null;
  return finish(best.path, best, nodes, t0, '');
  function finish(path, b, nodes, t0, tag) { return { steps: path, score: b.v, notes: (tag ? [tag] : []).concat(b.notes), kills: b.kills, kw: b.kw, ev: b.ev, oev: b.oev, nodes, ms: Date.now() - t0, risk: b.risk, summary: path.filter(p => p.kind !== 'eff' || /대상|등장|컨택|리무브/.test(p.desc)).map(p => p.desc).join(' → ') }; } }

// 계획 단계 키/서명: 전략이 "실제 상태가 계획대로인가"를 판정할 때 사용
function keyOf(R, s) {   // stateKey 와 같되, 상대의 비공개 구역(손패·덱·FILE·뒷면 증거)은 정의 대신 장수만 — 관측 상태의 대역 정의는 관측마다 달라지므로
  if (R.phase === 'over') return 'over' + R.winner;
  let k = R.phase + '|' + R.turn + '|' + R.n + '|' + JSON.stringify(R.fl || {}) + '|' + (R.ending ? 'E' : '') + '|';
  for (const t of [0, 1]) { const P = R.P[t], mine = t === s;
    k += [mine ? P.hand.map(x => R.cards[x].d).sort().join(',') : 'h' + P.hand.length, P.field.map(x => SIM.ckey(R, x)).sort().join(','), P.evid.length + 'u' + P.evid.filter(x => R.cards[x].up).length, P.file.length, P.deck.length, mine ? P.rem.map(x => R.cards[x].d).sort().join(',') : 'r' + P.rem.length, R.cards[P.partner].st + (P.pIn ? 'I' : ''), R.cards[P.kase] && R.cards[P.kase].solved ? 'S' : '', (P.pa || []).map(x => SIM.ckey(R, x)).join(','), P.tr ? 1 : 0].join(';') + '#'; }
  if (R.sub) { const u = R.sub; k += 'sub' + u.type + u.who + (u.atk || '') + '>' + (u.def || u.tid || '') + (u.tk || '') + u.i + JSON.stringify(u.pass || []) + JSON.stringify(u.used || {}) + JSON.stringify(u.ms || []); }
  if (R.q && R.q.length) k += 'Q' + R.q.map(i => i.kind + (i.src || '') + (i.s)).join(',');
  return k; }
function sigOf(R) { const q = R.eff && R.eff.req; if (!q) return ''; return q.kind + '|' + String(q.msg || '').slice(0, 40) + '|' + (q.sel || q.ids || []).map(x => x + ':' + DEF(R, x)).join(','); }
function describe(R, mv, s) { const m = mv.m; const n = id => nm(R, id);
  switch (mv.tag) {
    case 'play': return `${n(m.id)}(Lv${lv(R, m.id)}) 사용${m.rep != null ? ' (' + n(m.rep) + ' 밀어냄)' : ''}`;
    case 'hint': return '넥스트 힌트'; case 'skip': return '스킵'; case 'assist': return '어시스트'; case 'solve': return '사건 해결'; case 'end': return '턴 종료';
    case 'reason': return `추리: ${m.who === 'p' ? '파트너' : n(m.who)}`;
    case 'atkc': return `${n(m.id)}(AP${effAP(R, m.id)}) → ${n(m.tid)}(AP${effAP(R, m.tid)}${R.cards[m.tid].st === 'a' ? '·액티브' : ''})`;
    case 'atkk': return `${n(m.id)} 증거 공격`; case 'ability': return `선언: ${n(m.id)}`;
    case 'ans': { if (Array.isArray(m.v)) return (m.v.length ? '선택: ' + m.v.map(x => R.cards[x] ? n(x) : x).join(',') : '선택 안 함'); return '응답: ' + JSON.stringify(m.v); }
    case 'pass': return '패스'; case 'cin': return `컷인: ${n(m.id)}`; case 'dis': return `변장: ${n(m.id)}`;
    default: return mv.tag; } }

module.exports = { plan, evaluate, keyOf, sigOf, describe, oppRisk, discardValue, effAP, hasMR, ID, DEF, oppModelPublic: oppModel, abilityOk };
