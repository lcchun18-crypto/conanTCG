// v1.8.0 규칙 스크립트 AI — 탐색/평가/전문봇 정책을 쓰지 않고, 사용자가 정한 7단계 규칙만 따른다.
// 입력: 현재 상태 R, 내 좌석, genMoves 가 만든 "엔진 합법 후보". 출력: 그 중 하나 + 판단 로그(rule/why). 후보 밖의 수는 절대 내지 않는다.
const SIM = require('./simulate.js');
const { S, who, genMoves, clone, cloneable, applyMove } = SIM;
const { D, FX } = S;
const { cardBase } = require('./evaluate.js');
const val = (R, id) => cardBase(R, id);
const ap = (R, id) => S.ap(R, id), lv = (R, id) => FX.lvOf(R, id);
const nm = (R, id) => { try { return D(R, id).n; } catch (e) { return '?'; } };
const pick = (mv, rule, why, extra) => ({ mv, rule, why, ...extra });
// 상대 필드를 리무브할 수 있는 카드(효과에 select:remove(상대 대상) 또는 rmAll 이 있음) — 같은 코스트일 때 우선 사용 (v1.8.2)
function removesOpp(R, id) { let hit = false; const walk = o => { if (hit || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
  if ((o.op === 'select' && o.do === 'remove' && !(o.filter && o.filter.own === 'self')) || o.op === 'rmAll') { hit = true; return; } Object.values(o).forEach(walk); };
  try { walk(D(R, id).ab || []); } catch (e) {} return hit; }

// ── v1.17.11 선언 효과 재평가 / 제거 효과 타겟 우선순위 (카드 ID 하드코딩 없음 — ab 구조만 읽는다)
// 능력(ab) 안의 "상대 대상 리무브" select 필터들 (own 이 self 가 아닌 것). rmAll(전체 리무브)도 제거 효과로 본다.
function removeFilters(ab) { const out = []; let all = false; const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
  if (o.op === 'select' && o.do === 'remove' && !(o.filter && o.filter.own === 'self')) out.push(o.filter || {}); if (o.op === 'rmAll') all = true; Object.values(o).forEach(walk); }; walk(ab); return { filters: out, all, is: out.length > 0 || all }; }
const numOf = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
// 제거 효과의 타겟 기준: 'ap'(AP 이하 제거) / 'lv'(레벨 이하 제거 또는 기준 없음) / 'both'(둘 다)
function removeMode(ab) { const { filters } = removeFilters(ab); let hasLv = false, hasAp = false, lvMax = null, apMax = null;
  for (const f of filters) { if (f.lvMax != null && f.lvMax !== '') { hasLv = true; lvMax = numOf(f.lvMax) ?? lvMax; } if (f.apMax != null && f.apMax !== '') { hasAp = true; apMax = numOf(f.apMax) ?? apMax; } }
  return { mode: hasLv && hasAp ? 'both' : hasAp ? 'ap' : 'lv', lvMax, apMax }; }
// 제거 대상 후보(엔진이 합법으로 인정한 카드들) 중 가치가 가장 높은 순서로 정렬. 코스트 기준: Lv→AP, AP 기준: AP→Lv, 둘 다: (Lv/최대Lv + AP/최대AP)→Lv→AP
function rankRemoval(R, ids, ab) { const { mode, lvMax, apMax } = removeMode(ab), A_ = id => (D(R, id).type === 'char' ? ap(R, id) : 0);
  const score = id => { if (mode !== 'both') return 0; return (lvMax ? lv(R, id) / lvMax : 0) + (apMax ? A_(id) / apMax : 0); };
  return ids.slice().sort((a, b) => mode === 'ap' ? (A_(b) - A_(a)) || (lv(R, b) - lv(R, a)) : mode === 'both' ? (score(b) - score(a)) || (lv(R, b) - lv(R, a)) || (A_(b) - A_(a)) : (lv(R, b) - lv(R, a)) || (A_(b) - A_(a))); }
// 선언 효과를 복제 상태에서 끝까지 시험 실행(엔진 합법성 그대로) → 실제로 상대 현장에서 제거되는 카드. 실행 불가면 null.
function dryRun(R, seat, mv) { if (!cloneable(R)) return null; const R2 = clone(R); if (applyMove(R2, mv, 7)) return null; const opp = 1 - seat, before = R.P[opp].field.slice(); let g = 0;
  while (R2.eff && R2.phase === 'play' && g++ < 14) { const d = who(R2); if (!d || d.seat !== seat) break; const mvs = genMoves(R2, val); if (!mvs.length) break; const r = effChoice(R2, seat, mvs, val); if (!r || !r.mv || applyMove(R2, r.mv, 7)) break; }
  return { removed: before.filter(id => !R2.P[opp].field.includes(id)), done: !R2.eff }; }
// 지금 엔진이 합법으로 인정하는 선언 효과 전부(필드 캐릭터·사건·파트너 등)를 다시 평가한다. 제거 효과는 시험 실행으로 "실제 타겟이 있는가"를 확인하고, 있으면 가치 높은 순으로 반환.
function declareReview(R, seat, moves) { const abs = moves.filter(m => m.tag === 'ability'), out = { removal: [], other: [], dead: [] };
  for (const m of abs) { const base = (D(R, m.m.id).ab || [])[m.m.i], rf = base ? removeFilters(base) : { is: false };
    if (!rf.is) { out.other.push(m); continue; }
    const dr = dryRun(R, seat, m); if (!dr || !dr.removed.length) { out.dead.push(m); continue; }   // 타겟 없음/제거 못 함 → 쓰지 않음
    const best = rankRemoval(R, dr.removed, base)[0]; out.removal.push({ m, removed: dr.removed, best, key: [dr.removed.length, lv(R, best), ap(R, best)] }); }
  out.removal.sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2]); return out; }

// ── 1번: 손패에서 가장 코스트(레벨)가 높은 카드 — 지금 낼 수 있거나, 어시스트하면 낼 수 있는 카드
function bestPlay(R, seat, moves) {
  const P = R.P[seat], plays = moves.filter(m => m.tag === 'play'), assist = moves.find(m => m.tag === 'assist');
  const cand = [];   // { id, direct, mv }
  const seen = new Set();
  for (const mv of plays) { if (seen.has(mv.m.id)) continue; seen.add(mv.m.id); cand.push({ id: mv.m.id, direct: true, mv }); }
  if (assist && !R.fl.played && !R.fl.hint && !R.fl.hw && cloneable(R)) {
    let R2 = null;
    for (const id of P.hand) { if (seen.has(id)) continue; const err0 = S.playCheck(R, seat, id); if (!err0 || !/레벨|FILE/.test(err0)) continue;
      if (!R2) { R2 = clone(R); if (applyMove(R2, assist, 1)) { R2 = false; } } if (!R2) break;
      if (!S.playCheck(R2, seat, id)) { seen.add(id); cand.push({ id, direct: false, mv: assist }); } }
  }
  if (!cand.length) return null;
  const key = c => [lv(R, c.id), removesOpp(R, c.id) ? 1 : 0, D(R, c.id).type === 'char' ? 1 : 0, val(R, c.id)];
  cand.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return y[i] - x[i]; return (a.direct ? 0 : 1) - (b.direct ? 0 : 1); });
  const top = cand[0];
  // 같은 카드의 직접 사용 후보가 여러 개(스위치 대상)이면, 가장 약한 필드 캐릭터와 교체
  if (top.direct) { const same = plays.filter(m => m.m.id === top.id); if (same.length > 1) { same.sort((a, b) => (a.m.rep != null ? ap(R, a.m.rep) + lv(R, a.m.rep) : -1) - (b.m.rep != null ? ap(R, b.m.rep) + lv(R, b.m.rep) : -1)); top.mv = same[0]; } }
  // 현장 상한이 5 미만으로 줄어든 경우(카드 효과) genMoves 가 스위치 대상을 만들지 못하므로 직접 보충한다
  if (top.direct && top.mv.m.rep == null && D(R, top.id).type === 'char' && P.field.length >= FX.fieldMax(R, seat) && P.field.length) {
    const weak = P.field.slice().sort((a, b) => (ap(R, a) + lv(R, a)) - (ap(R, b) + lv(R, b)))[0]; top.mv = { ...top.mv, m: { ...top.mv.m, rep: weak } }; }
  return top;
}

// ── 3·4번: 필드 캐릭터 행동
function actionFor(R, seat, moves) {
  const P = R.P[seat], O = R.P[1 - seat], notes = [];
  // 능력 사용: 필드 캐릭터(+파트너)가 쓸 수 있는 능력
  const rv = declareReview(R, seat, moves);   // v1.17.11: 제거 선언 효과는 실제 타겟이 있을 때만(시험 실행), 가치 높은 순으로 / 타겟 없는 제거 효과는 쓰지 않음
  if (rv.removal.length) { const x = rv.removal[0]; return pick(x.m, '3', `선언 재평가: ${nm(R, x.m.m.id)}#${x.m.m.i} 제거 효과 사용 (제거 대상 ${nm(R, x.best)} Lv${lv(R, x.best)} AP${ap(R, x.best)})`); }
  const abs = rv.other, ab = abs.find(m => P.field.includes(m.m.id)) || abs.find(m => m.m.id === P.partner) || abs[0];   // 그 밖의 선언 효과는 쓸 수 있으면 적극적으로 (필드 → 파트너 → 그 밖의 선언 능력)
  if (ab) return pick(ab, '3', `능력 사용 가능: ${nm(R, ab.m.id)}`);
  if (rv.dead.length) notes.push(`타겟 없음/제거 불가 → 선언 효과 사용 안 함: ${rv.dead.map(m => nm(R, m.m.id) + '#' + m.m.i).join(', ')}`);
  const ids = P.field.filter(id => R.cards[id].st === 'a').sort((a, b) => ap(R, b) - ap(R, a));
  const oppActive = O.field.filter(x => R.cards[x].st === 'a');
  for (const id of ids) {
    const mine = ap(R, id), can = moves.filter(m => (m.tag === 'atkc' || m.tag === 'atkk' || m.tag === 'reason') && (m.tag === 'reason' ? m.m.who === id : m.m.id === id));
    if (!can.length) continue;
    const higher = oppActive.filter(x => ap(R, x) > mine);
    if (higher.length) { notes.push(`${nm(R, id)}(AP${mine}): 상대 액티브 AP 더 높은 ${nm(R, higher[0])}(AP${ap(R, higher[0])}) → 행동 안 함`); continue; }
    // 4번: 슬립 우선, AP 같거나 낮은 캐릭터
    const tg = can.filter(m => m.tag === 'atkc' && ap(R, m.m.tid) <= mine).sort((a, b) => ((R.cards[b.m.tid].st !== 'a') - (R.cards[a.m.tid].st !== 'a')) || (ap(R, b.m.tid) - ap(R, a.m.tid)));
    if (tg.length) { const t = tg[0], sl = R.cards[t.m.tid].st !== 'a'; return pick(t, '4', `${nm(R, id)}(AP${mine}) → ${sl ? '슬립 ' : ''}${nm(R, t.m.tid)}(AP${ap(R, t.m.tid)})`, { notes }); }
    const ck = can.find(m => m.tag === 'atkk'); if (ck) return pick(ck, '4', `${nm(R, id)}: 공격할 수 있는 캐릭터 없음 → 상대 증거(사건 액션)`, { notes });
    if (!O.evid.length || !ck) { if (S.lpOf(R, id) <= 0) { notes.push(`${nm(R, id)}: LP 0 → 그냥 세워 둠`); continue; }
      const rs = can.find(m => m.tag === 'reason'); if (rs) return pick(rs, '4', `${nm(R, id)}: 상대 증거 없음 → 추리`, { notes }); }
  }
  return { notes };
}

function mainChoice(R, seat, moves, d, opt) {
  const P = R.P[seat], tag = t => moves.find(m => m.tag === t);
  // 7번 리살
  if (opt.lethal !== false && cloneable(R)) { try { const LT = require('./tactics/lethal.js'), r = LT.solve(R, seat, { ms: opt.lethalMs || 700, nodes: opt.lethalNodes || 3500 }); if (r.found && r.mv) return pick(r.mv, '7', '리살 발견 → 즉시 선택: ' + (r.line || []).map(x => x.desc).join(' → ')); } catch (e) {} }
  // 1번 손패 사용
  if (d.kind === 'hint' || (!R.fl.played && !R.fl.hint)) {
    const bp = bestPlay(R, seat, moves);
    if (bp) return pick(bp.mv, '1', `${nm(R, bp.id)}(레벨${lv(R, bp.id)}${removesOpp(R, bp.id) ? ', 상대 리무브 효과' : ''}) ${bp.direct ? '직접 사용' : '어시스트 후 사용'}`);
    if (d.kind === 'hint') return pick(tag('skip') || moves[0], '1', '힌트로 얻은 카드 중 낼 수 있는 카드 없음 → 스킵');
  }
  // v1.17.11 새 캐릭터가 등장한 직후(이번 턴 손패를 사용한 뒤) 현장의 기존 캐릭터를 포함한 모든 선언 효과를 다시 평가 → 사용할 수 있는 제거 효과는 적극적으로 사용
  if (opt.redeclare !== false && R.fl.played) { const rv = declareReview(R, seat, moves);
    if (rv.removal.length) { const x = rv.removal[0]; return pick(x.m, '1', `새 캐릭터 등장 후 선언 효과 재평가: ${nm(R, x.m.m.id)}#${x.m.m.i} 제거 효과 사용 (제거 대상 ${nm(R, x.best)} Lv${lv(R, x.best)} AP${ap(R, x.best)})`); } }
  // 1번 후속: 사용 직후 파트너 추리
  if (R.fl.played && !P.pIn && R.cards[P.partner].st === 'a') { const pr = moves.find(m => m.tag === 'reason' && m.m.who === 'p'); if (pr) return pick(pr, '1', '카드 사용 후 파트너 추리'); }
  // 2번 FILE(파트너 제외) > 6 → 넥스트 힌트
  if (P.file.length > 6) { const h = tag('hint'); if (h) return pick(h, '2', `FILE ${P.file.length}장 > 6 → 넥스트 힌트`); }
  // 3·4번
  const a = actionFor(R, seat, moves); if (a.mv) return a;
  return pick(tag('end') || moves[moves.length - 1], '3', 'FILE ≤ 6, 더 할 행동 없음 → 턴 종료', { notes: a.notes });
}

function guardChoice(R, seat, moves) {
  const u = R.sub, P = R.P[seat], atk = ap(R, u.atk);
  const gs = moves.filter(m => m.tag === 'guard').map(m => ({ m, id: m.m.id })).filter(x => R.cards[x.id].st === 'a');
  const win = gs.filter(x => ap(R, x.id) > atk).sort((a, b) => ap(R, a.id) - ap(R, b.id));
  if (win.length) return pick(win[0].m, '6', `상대 공격 AP${atk} < 내 액티브 ${nm(R, win[0].id)} AP${ap(R, win[0].id)} → 반드시 가드`);
  const ng = moves.find(m => m.tag === 'noguard'); if (ng) return pick(ng, '6', `AP${atk} 이상 → 가드 안 함`);
  const g = gs.sort((a, b) => ap(R, b.id) - ap(R, a.id))[0] || moves.find(m => m.tag === 'guard'); return pick(g || moves[0], '6', '가드 강제');
}
function contactChoice(R, seat, moves) {
  const u = R.sub, pass = moves.find(m => m.tag === 'pass'), mineSide = R.cards[u.atk].o === seat ? 'atk' : 'def', my = u[mineSide], op = mineSide === 'atk' ? u.def : u.atk;
  if (mineSide === 'def') return pick(pass, '6', '방어(가드) 중에는 컷인을 쓰지 않음');
  const usedOpp = u.used && u.used[1 - seat], a = ap(R, my), b = ap(R, op);
  if (!usedOpp) return pick(pass, '5', '상대가 컷인을 쓰지 않음 → 패스');
  if (a >= b) return pick(pass, '5', `AP ${a} ≥ ${b} (이미 같거나 높음) → 컷인 안 함`);
  let best = null;
  for (const m of moves.filter(x => x.tag === 'cin')) { let v = 0; try { v = FX.cutV(R, seat, m.m.id, S.tok(D(R, m.m.id)).cut, my) || 0; } catch (e) { continue; } const na = a + v; if (na >= b && (!best || na < best.na)) best = { m, na }; }
  if (best) return pick(best.m, '5', `상대 컷인 → 내 AP ${a}→${best.na} (상대 ${b} 이상)`);
  return pick(pass, '5', `컷인으로 AP ${b} 이상을 만들 수 없음 → 패스`);
}
// v1.17.14: 효과 처리 중에는 상태를 복제할 수 없으므로(제너레이터) 제거 효과의 필터(apMax/lvMax)만 정적으로 대조해 "지금 제거할 수 있는 상대 카드"를 센다. 모르는 필터 키는 합법으로 간주(비용을 아끼지 않는다).
function legalRemovalCount(R, seat, ab) { const opp = 1 - seat, { filters } = removeFilters(ab); if (!filters.length) return 0;
  const fileN = R.P[seat].file.length; const num = v => v === 'file' ? fileN : numOf(v);
  return R.P[opp].field.filter(id => D(R, id).type === 'char' && filters.some(f => (f.apMax == null || f.apMax === '' || num(f.apMax) == null || ap(R, id) <= num(f.apMax)) && (f.lvMax == null || f.lvMax === '' || num(f.lvMax) == null || lv(R, id) <= num(f.lvMax)))).length; }
function effChoice(R, seat, moves, val_) {
  const q = R.eff.req, ans = (v, rule, why) => pick({ seat, m: { t: 'act', a: 'ans', v }, tag: 'ans' }, rule, why);
  if (q.kind === 'yn') return pick(moves.find(m => m.m.v === true) || moves[0], 'eff', '효과 사용(예)');
  if (q.kind === 'optm') { const cs = moves.filter(m => Array.isArray(m.m.v)).sort((a, b) => b.m.v.length - a.m.v.length); if (cs.length) return pick(cs[0], 'eff', '선택 가능한 효과를 가능한 많이 사용'); }
  if (q.kind === 'opt' && !q.evp) { const L = q.labels || [], i = L.findIndex(l => !/않|안 ?함|취소|패스|no\b/i.test(String(l))); const mv = i >= 0 ? moves.find(m => m.m.v === i) : null; if (mv) return pick(mv, 'eff', '효과를 사용하는 선택지'); }
  if (q.kind === 'pick') { const sel = (q.sel || q.ids || []).slice(), mx = Math.min(q.max == null ? sel.length : q.max, sel.length), mn = Math.min(q.min || 0, mx);
    const isOpp = id => R.cards[id] && R.cards[id].o !== seat, opp = sel.filter(isOpp), own = sel.filter(id => !isOpp(id));
    const remAb = R.eff && R.eff.it && R.eff.it.ab && removeFilters(R.eff.it.ab).is ? R.eff.it.ab : null;   // v1.17.11: 제거 효과면 효과 기준(AP/코스트)에 맞춰 합법 후보 중 가치가 높은 것
    if (remAb && !opp.length && mn === 0 && own.length) {   // v1.17.14: "손패를 리무브해도 좋다. 그렇게 한 경우 … 제거" 같은 선택 비용 — 복제 상태에서 비용을 내 보고 실제로 상대 카드가 제거되면 반드시 지불
      const cand = own.slice().sort((a, b) => val(R, a) - val(R, b)).slice(0, Math.max(1, Math.min(mx, 1)));
      const gain = legalRemovalCount(R, seat, remAb); if (gain > 0) return ans(cand, 'eff', `선택 비용을 내고 제거 효과 사용: ${cand.map(id => nm(R, id)).join(', ')} 리무브 → 제거 가능한 상대 ${gain}장`);
      return ans([], 'eff', '비용을 내도 제거할 상대 카드가 없음 → 비용 지불 안 함'); }
    if (remAb && !opp.length) { const v = mn > 0 ? own.slice().sort((a, b) => val(R, a) - val(R, b)).slice(0, mn) : []; return ans(v, 'eff', v.length ? '제거 대상이 내 카드뿐(강제) → 가치 낮은 카드' : '제거 대상이 상대에게 없음 → 고르지 않음'); }   // 제거 효과로 내 카드를 고르지 않는다
    if (remAb) { const n = Math.max(mn, mx), v = rankRemoval(R, opp, remAb).slice(0, n), md = removeMode(remAb).mode;
      return ans(v, 'eff', `제거 대상(${md === 'ap' ? 'AP 기준' : md === 'both' ? '코스트+AP 기준' : '코스트 기준'}) 합법 후보 중 최선: ${v.map(id => nm(R, id) + '(Lv' + lv(R, id) + ' AP' + (D(R, id).type === 'char' ? ap(R, id) : 0) + ')').join(', ') || '없음'}`); }
    if (opp.length && !own.length) { // 상대를 고르는 효과: 가능한 가장 높은 코스트(레벨) 우선, 같으면 AP 높은 쪽
      const sorted = opp.sort((a, b) => lv(R, b) - lv(R, a) || (D(R, b).type === 'char' ? ap(R, b) : 0) - (D(R, a).type === 'char' ? ap(R, a) : 0)), n = Math.max(mn, mx), v = sorted.slice(0, n);
      return ans(v, 'eff', `상대 카드 중 최고 코스트 선택: ${v.map(id => nm(R, id) + '(Lv' + lv(R, id) + ')').join(', ') || '없음'}`); }
    // 내 카드: 비용으로 잃는 손패/필드면 필요한 최소 장수(가치 낮은 것부터), 그 밖의 구역(덱·FILE 등)이면 효과를 최대로 사용
    const P = R.P[seat], loss = own.length && own.every(id => P.hand.includes(id) || P.field.includes(id)), n = loss ? mn : mx;
    const sorted = own.concat(opp).sort((a, b) => val(R, a) - val(R, b)), v = (loss ? sorted : sorted.slice().reverse()).slice(0, n);
    return ans(v, 'eff', loss ? `필요한 최소 장수(${n}), 가치 낮은 카드` : `효과를 최대로 사용(${n}장)`); }
  return pick(moves[0], 'eff', '기본 선택'); }
const sumv = (R, ids) => ids.reduce((s, id) => s + (R.cards[id] ? val(R, id) : 0), 0);

// 진입점. 반환: { mv, rule, why, notes? }
function choose(R, seat, opt = {}) {
  const d = who(R); if (!d || d.seat !== seat) return { err: 'not my decision' };
  if (d.kind === 'mull') { const { mulliganChoice } = require('./decide.js'); return pick({ seat, m: mulliganChoice(R, seat, null), tag: 'mull' }, 'mull', '멀리건 기본 규칙(규칙 스크립트에 지정 없음)'); }
  const moves = genMoves(R, val); if (!moves.length) return { err: 'no moves' };
  if (moves.length === 1) return pick(moves[0], 'forced', '유일한 합법 행동');
  if (d.kind === 'main' || d.kind === 'hint') return mainChoice(R, seat, moves, d, opt);
  if (d.kind === 'eff') return effChoice(R, seat, moves, val);
  if (d.kind === 'sub:guard') return guardChoice(R, seat, moves);
  if (d.kind === 'sub:contact') return contactChoice(R, seat, moves);
  if (d.kind === 'sub:mis') return pick(moves[0], 'mis', '미스리드 안 함');
  return pick(moves[0], 'default', '기본');
}
module.exports = { choose, bestPlay, declareReview, rankRemoval, removeMode, removeFilters };
