// 전문 봇 "프로필" → 코어가 쓰는 "정책(policy)" 컴파일러.   코어(search/evaluate/decide)는 카드 ID 를 전혀 모르고, 아래 정책이 돌려주는 "숫자"만 받는다.
//   policy = { seat, W, score(R), moveBonus(R, mv), mulValue(R, id), mulAdjust(R, seat, repIds), explain(R) }
//   - W          : 평가 가중치 (범용 W 에 프로필 weights / 선후공 / 매치업 보정을 덮어쓴 것)
//   - score(R)   : 정책 좌석 입장의 "추가 평가 점수" (카드 역할·콤보·FILE/증거·보존·상대 카드 제거 우선순위·hooks.score)
//   - moveBonus  : 탐색의 행동 "순서"에만 쓰이는 가산점 (빔 가지치기 우선순위) — 합법 수를 새로 만들거나 없애지 않는다
//   - mul*       : 멀리건 보정
// 모든 함수는 게임 상태를 읽기만 한다. 훅(hooks)에는 R 이 아니라 읽기 전용 "view" 만 주고, 반환값은 숫자로 정제(유한값·상한)한다.
const SIM = require('../simulate.js'), EV = require('../evaluate.js');
const { S } = SIM, { FX, D, fcount, tok } = S;

const TOP = ['id', 'name', 'color', 'desc', 'deckFile', 'deck', 'profile'];
const PROFILE_KEYS = ['notes', 'weights', 'weightsBy', 'matchups', 'roles', 'cards', 'combos', 'sequences', 'mulligan', 'file', 'evidence', 'hand', 'conserve', 'lethal', 'actions', 'limit', 'hooks'];
const CARD_FIELDS = ['role', 'hand', 'field', 'play', 'attack', 'target', 'keep', 'mulligan', 'conserve', 'note'];
const ROLE_FIELDS = ['hand', 'field', 'play', 'attack', 'target', 'keep', 'conserve', 'note'];
const ACTION_TAGS = ['play', 'atkc', 'atkk', 'reason', 'assist', 'solve', 'hint', 'skip', 'end', 'ability'];
const HOOKS = ['score', 'move', 'mulligan'];
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const keyOf = (R, id) => { const d = R.cards[id].d; return d.slice(d.indexOf(':') + 1); };
const clamp = (x, lim) => !isNum(x) ? 0 : x > lim ? lim : x < -lim ? -lim : x;

// ── 프로필 검증: 오타(알 수 없는 키)·숫자 아님·DB 에 없는 카드 ID 를 잡아낸다 (카드를 고치지 않고 보고만)
function validateProfile(profile, o = {}) {
  const errors = [], warn = [], DB = o.DB, own = o.deckCards ? new Set(o.deckCards) : null, p = profile || {};
  const num = (v, w) => { if (!isNum(v)) errors.push(`${w}: 숫자가 아닙니다 (${JSON.stringify(v)})`); };
  const cardId = (id, w, ownSide) => { if (DB && !DB[id]) errors.push(`${w}: 카드 DB 에 없는 ID ${id}`); else if (ownSide && own && !own.has(id)) warn.push(`${w}: ${id} 는 이 봇의 덱에 없습니다 (효과 없음)`); };
  const obj = (v, w) => v && typeof v === 'object' && !Array.isArray(v) ? true : (errors.push(`${w}: 객체여야 합니다`), false);
  if (!obj(p, 'profile')) return { errors, warnings: warn };
  for (const k of Object.keys(p)) if (!PROFILE_KEYS.includes(k)) errors.push(`profile.${k}: 알 수 없는 항목 (허용: ${PROFILE_KEYS.join(', ')})`);
  const weights = (w, at) => { if (!obj(w, at)) return; for (const [k, v] of Object.entries(w)) { if (!(k in EV.W)) errors.push(`${at}.${k}: 알 수 없는 평가 가중치 (허용: ${Object.keys(EV.W).join(', ')})`); else num(v, `${at}.${k}`); } };
  const cardsSec = (c, at, roles) => { if (!obj(c, at)) return; for (const [id, e] of Object.entries(c)) { cardId(id, `${at}.${id}`, false); if (!obj(e, `${at}.${id}`)) continue;
    for (const [k, v] of Object.entries(e)) { if (!CARD_FIELDS.includes(k)) errors.push(`${at}.${id}.${k}: 알 수 없는 항목 (허용: ${CARD_FIELDS.join(', ')})`); else if (k === 'role') { if (roles && !roles[v] && !(p.roles || {})[v]) errors.push(`${at}.${id}.role: 정의되지 않은 역할 "${v}"`); } else if (k === 'mulligan') { if (!['keep', 'replace'].includes(v)) errors.push(`${at}.${id}.mulligan: "keep" 또는 "replace"`); } else if (k !== 'note') num(v, `${at}.${id}.${k}`); }
    if (own && (e.hand != null || e.field != null || e.play != null || e.keep != null || e.mulligan != null || e.attack != null) && !own.has(id)) warn.push(`${at}.${id}: 내 덱에 없는 카드에 내 쪽 항목(hand/field/play/keep/mulligan/attack)이 지정됨`); } };
  const rolesSec = (r, at) => { if (!obj(r, at)) return; for (const [n, e] of Object.entries(r)) { if (!obj(e, `${at}.${n}`)) continue; for (const [k, v] of Object.entries(e)) { if (!ROLE_FIELDS.includes(k)) errors.push(`${at}.${n}.${k}: 알 수 없는 항목`); else if (k !== 'note') num(v, `${at}.${n}.${k}`); } } };
  const combosSec = (c, at) => { if (!Array.isArray(c)) return errors.push(`${at}: 배열이어야 합니다`); c.forEach((x, i) => { const w = `${at}[${i}]`; if (!obj(x, w)) return; if (!Array.isArray(x.cards) || !x.cards.length) errors.push(`${w}.cards: 카드 ID 배열이 필요합니다`); else x.cards.forEach(id => cardId(id, `${w}.cards`, true)); num(x.bonus, `${w}.bonus`); if (x.where && !['hand', 'field', 'any'].includes(x.where)) errors.push(`${w}.where: hand|field|any`); }); };
  const seqSec = (c, at) => { if (!Array.isArray(c)) return errors.push(`${at}: 배열이어야 합니다`); c.forEach((x, i) => { const w = `${at}[${i}]`; if (!obj(x, w)) return; cardId(x.first, `${w}.first`, true); cardId(x.then, `${w}.then`, true); num(x.bonus, `${w}.bonus`); }); };
  const curve = (c, at) => { if (!obj(c, at)) return; if (c.perCard != null) num(c.perCard, `${at}.perCard`); if (c.bonusAt != null) { if (!Array.isArray(c.bonusAt)) errors.push(`${at}.bonusAt: [{n, bonus}] 배열`); else c.bonusAt.forEach((x, i) => { num(x && x.n, `${at}.bonusAt[${i}].n`); num(x && x.bonus, `${at}.bonusAt[${i}].bonus`); }); } };
  if (p.weights != null) weights(p.weights, 'weights');
  if (p.weightsBy != null && obj(p.weightsBy, 'weightsBy')) for (const [k, v] of Object.entries(p.weightsBy)) { if (!['first', 'second'].includes(k)) errors.push(`weightsBy.${k}: first|second`); else weights(v, `weightsBy.${k}`); }
  if (p.roles != null) rolesSec(p.roles, 'roles');
  if (p.cards != null) cardsSec(p.cards, 'cards', true);
  if (p.combos != null) combosSec(p.combos, 'combos');
  if (p.sequences != null) seqSec(p.sequences, 'sequences');
  if (p.file != null) curve(p.file, 'file'); if (p.evidence != null) curve(p.evidence, 'evidence');
  if (p.hand != null && obj(p.hand, 'hand') && p.hand.perCard != null) num(p.hand.perCard, 'hand.perCard');
  if (p.conserve != null && obj(p.conserve, 'conserve')) for (const [k, v] of Object.entries(p.conserve)) { if (!['cutin', 'cutinPlay'].includes(k)) errors.push(`conserve.${k}: cutin|cutinPlay`); else num(v, `conserve.${k}`); }
  if (p.lethal != null && obj(p.lethal, 'lethal')) for (const [k, v] of Object.entries(p.lethal)) { if (k !== 'weight') errors.push(`lethal.${k}: weight 만 허용`); else num(v, 'lethal.weight'); }
  if (p.actions != null && obj(p.actions, 'actions')) for (const [k, v] of Object.entries(p.actions)) { if (!ACTION_TAGS.includes(k)) errors.push(`actions.${k}: 알 수 없는 행동 (허용: ${ACTION_TAGS.join(', ')})`); else num(v, `actions.${k}`); }
  if (p.limit != null) num(p.limit, 'limit');
  if (p.mulligan != null && obj(p.mulligan, 'mulligan')) { for (const k of Object.keys(p.mulligan)) if (!['keep', 'replace'].includes(k)) errors.push(`mulligan.${k}: keep|replace (콤보 유지는 combos[].keep:true)`); for (const k of ['keep', 'replace']) if (p.mulligan[k] != null) { if (!Array.isArray(p.mulligan[k])) errors.push(`mulligan.${k}: 카드 ID 배열`); else p.mulligan[k].forEach(id => cardId(id, `mulligan.${k}`, true)); } }
  if (p.hooks != null && obj(p.hooks, 'hooks')) for (const [k, v] of Object.entries(p.hooks)) { if (!HOOKS.includes(k)) errors.push(`hooks.${k}: 알 수 없는 훅 (허용: ${HOOKS.join(', ')})`); else if (typeof v !== 'function') errors.push(`hooks.${k}: 함수여야 합니다`); }
  if (p.matchups != null) { if (!Array.isArray(p.matchups)) errors.push('matchups: 배열이어야 합니다'); else p.matchups.forEach((m, i) => { const w = `matchups[${i}]`; if (!obj(m, w)) return; if (!m.name) warn.push(`${w}.name 없음`); if (!m.vs || typeof m.vs !== 'object') errors.push(`${w}.vs: 조건 객체가 필요합니다 ({cards|allCards|case|partner|color})`); else { for (const k of Object.keys(m.vs)) if (!['cards', 'allCards', 'case', 'partner', 'color'].includes(k)) errors.push(`${w}.vs.${k}: cards|allCards|case|partner|color`); for (const k of ['cards', 'allCards']) (m.vs[k] || []).forEach(id => cardId(id, `${w}.vs.${k}`, false)); }
      for (const k of Object.keys(m)) if (!['name', 'vs', 'weights', 'cards', 'roles', 'combos', 'sequences', 'file', 'evidence', 'hand', 'conserve', 'lethal', 'actions', 'mulligan'].includes(k)) errors.push(`${w}.${k}: 알 수 없는 항목`);
      if (m.weights) weights(m.weights, `${w}.weights`); if (m.cards) cardsSec(m.cards, `${w}.cards`, false); if (m.roles) rolesSec(m.roles, `${w}.roles`); if (m.combos) combosSec(m.combos, `${w}.combos`); if (m.sequences) seqSec(m.sequences, `${w}.sequences`); }); }
  return { errors, warnings: warn };
}

// ── 매치업/선후공 패치 병합 (프로필은 읽기만, 복사본 생성)
const merge2 = (a, b) => ({ ...(a || {}), ...(b || {}) });
function applyPatch(base, patch) {
  const o = { ...base };
  o.weights = merge2(base.weights, patch.weights);
  o.cards = { ...(base.cards || {}) }; for (const [id, e] of Object.entries(patch.cards || {})) o.cards[id] = merge2(o.cards[id], e);
  o.roles = { ...(base.roles || {}) }; for (const [n, e] of Object.entries(patch.roles || {})) o.roles[n] = merge2(o.roles[n], e);
  o.combos = [...(base.combos || []), ...(patch.combos || [])]; o.sequences = [...(base.sequences || []), ...(patch.sequences || [])];
  for (const k of ['file', 'evidence', 'hand', 'conserve', 'lethal', 'actions']) if (patch[k]) o[k] = merge2(base[k], patch[k]);
  if (patch.mulligan) o.mulligan = { keep: [...((base.mulligan || {}).keep || []), ...(patch.mulligan.keep || [])], replace: [...((base.mulligan || {}).replace || []), ...(patch.mulligan.replace || [])] };
  return o;
}
function oppKeys(R, opp) { const P = R.P[opp], ks = new Set(); for (const z of ['deck', 'hand', 'file', 'evid', 'rem', 'field', 'pa']) for (const id of P[z]) ks.add(keyOf(R, id)); return ks; }
function matchVs(vs, R, opp) {
  const ks = oppKeys(R, opp), P = R.P[opp], kase = keyOf(R, P.kase), partner = keyOf(R, P.partner); let ok = true;
  if (vs.cards) ok = ok && vs.cards.some(id => ks.has(id)); if (vs.allCards) ok = ok && vs.allCards.every(id => ks.has(id));
  if (vs.case) ok = ok && vs.case === kase; if (vs.partner) ok = ok && vs.partner === partner;
  if (vs.color) { const c = String(D(R, P.kase).color || '').toLowerCase(); ok = ok && c.split(/[\/,&\s]+/).includes(String(vs.color).toLowerCase()); }
  return ok;
}

// ── 읽기 전용 view (훅에 전달). R 자체는 노출하지 않는다: 모든 메서드가 새 배열/값(복사본)을 돌려준다.
function makeView(seat) {
  let R = null; const opp = 1 - seat;
  const Z = (s, z) => R.P[s][z].map(id => keyOf(R, id));
  const v = {
    seat, opp, __set(r) { R = r; return v; },
    isFirst: () => R.first === seat, turnSeat: () => R.turn, myTurn: () => R.turn === seat, turnNo: () => R.n,
    hand: (s = seat) => Z(s, 'hand'), deckKeys: (s = seat) => Z(s, 'deck'), removed: (s = seat) => Z(s, 'rem'),
    field: (s = seat) => R.P[s].field.map(id => ({ key: keyOf(R, id), st: R.cards[id].st || 'a', ap: S.ap(R, id), lp: S.lpOf(R, id), summoned: !!R.cards[id].sum })),
    fileCount: (s = seat) => fcount(R, s), evidCount: (s = seat) => R.P[s].evid.length, deckCount: (s = seat) => R.P[s].deck.length, handCount: (s = seat) => R.P[s].hand.length,
    evidNeed: (s = seat) => EV.need(R, s), solved: (s = seat) => !!R.cards[R.P[s].kase].solved,
    count: (key, zone = 'hand', s = seat) => zone === 'field' ? R.P[s].field.filter(id => keyOf(R, id) === key).length : R.P[s][zone].filter(id => keyOf(R, id) === key).length,
    def: key => { const d = R.defs[seat + ':' + key] || R.defs[opp + ':' + key]; return d ? Object.freeze({ id: key, n: d.n, type: d.type, color: d.color, lv: d.lv, ap: d.ap, lp: d.lp, trait: d.trait, kw: d.kw }) : null; },
  };
  return Object.freeze(v);
}

function buildPolicy(spec, { seat, R }) {
  const prof0 = spec.profile || {}, opp = 1 - seat, isFirst = R.first === seat; let prof = { ...prof0 }; const applied = [];
  if (prof0.weightsBy && prof0.weightsBy[isFirst ? 'first' : 'second']) { prof = applyPatch(prof, { weights: prof0.weightsBy[isFirst ? 'first' : 'second'] }); applied.push(isFirst ? '선공 보정' : '후공 보정'); }
  for (const m of prof0.matchups || []) if (matchVs(m.vs, R, opp)) { prof = applyPatch(prof, m); applied.push('매치업: ' + (m.name || '?')); }
  const limit = isNum(prof.limit) ? prof.limit : 12;
  // 가중치
  let W = null; const wo = { ...(prof.weights || {}) };
  if (prof.lethal && isNum(prof.lethal.weight)) for (const k of ['lethalNow', 'lethalSoon']) if (wo[k] == null) wo[k] = EV.W[k] * prof.lethal.weight;
  if (Object.keys(wo).length) W = { ...EV.W, ...wo };
  // 카드별 정보(역할 상속)
  const info = {}, roles = prof.roles || {};
  for (const [id, e] of Object.entries(prof.cards || {})) { const r = e.role ? roles[e.role] || {} : {}, m = { hand: 0, field: 0, play: 0, attack: 0, target: 0, keep: 0 };
    for (const f of ['hand', 'field', 'play', 'attack', 'target', 'keep']) m[f] = isNum(e[f]) ? e[f] : isNum(r[f]) ? r[f] : 0;
    const cons = (isNum(e.conserve) ? e.conserve : isNum(r.conserve) ? r.conserve : 0); if (cons) { m.hand += cons; m.play -= cons * 2; }
    if (e.mulligan) m.mulligan = e.mulligan; info[id] = m; }
  const hasInfo = Object.keys(info).length > 0, cutin = prof.conserve && prof.conserve.cutin || 0, cutinPlay = prof.conserve && prof.conserve.cutinPlay || 0;
  const combos = (prof.combos || []).map(c => { const need = {}; for (const id of c.cards) need[id] = (need[id] || 0) + 1; return { name: c.name, need, where: c.where || 'any', bonus: c.bonus, max: c.max || 1, keep: !!c.keep }; });
  const seqs = prof.sequences || [], view = makeView(seat), hooks = prof.hooks || {}, actions = prof.actions || {};
  const handPer = prof.hand && prof.hand.perCard || 0;
  const curve = (c, n) => { if (!c) return 0; let x = (c.perCard || 0) * n; for (const b of c.bonusAt || []) if (n >= b.n) x += b.bonus; return x; };
  const stF = { a: 1, s: 0.6, x: 0.3 };
  const hasCutIn = (R_, id) => FX.hasCut(R_, id) || !!tok(D(R_, id)).cut;

  function parts(R_, out) {
    let v = 0; const add = (t, x) => { if (x) { v += x; if (out) out.push({ term: t, value: Math.round(x * 100) / 100 }); } };
    const P = R_.P[seat], O = R_.P[opp];
    if (hasInfo || handPer || cutin) { let h = 0, c = 0; for (const id of P.hand) { const i = info[keyOf(R_, id)]; if (i) h += i.hand; h += handPer; if (cutin && hasCutIn(R_, id)) c += cutin; } add('손패(카드/역할/보존)', h); add('컷인 보존', c); }
    if (hasInfo) { let f = 0; for (const id of P.field) { const i = info[keyOf(R_, id)]; if (i) f += i.field * (stF[R_.cards[id].st || 'a'] || 1); } add('필드', f);
      let t = 0; for (const id of O.field) { const i = info[keyOf(R_, id)]; if (i && i.target) t -= i.target * (stF[R_.cards[id].st || 'a'] || 1); } add('상대 카드 제거 우선순위', t); }
    if (combos.length) { let c = 0; const cnt = {}; const cz = z => { const m = {}; for (const id of P[z]) { const k = keyOf(R_, id); m[k] = (m[k] || 0) + 1; } return m; }, hm = cz('hand'), fm = cz('field');
      for (const cb of combos) { let sets = Infinity; for (const [k, n] of Object.entries(cb.need)) { const have = cb.where === 'hand' ? (hm[k] || 0) : cb.where === 'field' ? (fm[k] || 0) : (hm[k] || 0) + (fm[k] || 0); sets = Math.min(sets, Math.floor(have / n)); } if (sets > 0 && sets !== Infinity) c += cb.bonus * Math.min(sets, cb.max); } add('콤보', c); }
    if (prof.file) add('FILE', curve(prof.file, Math.min(fcount(R_, seat), 7)));
    if (prof.evidence) add('증거', curve(prof.evidence, P.evid.length));
    if (hooks.score) { view.__set(R_); let h = 0; try { h = hooks.score(view); } catch (e) { h = 0; } add('훅(score)', clamp(h, limit)); }
    if (v > limit) v = limit; else if (v < -limit) v = -limit; return v;
  }
  const pol = {
    id: spec.id, seat, W, applied, info: { limit, cards: Object.keys(info).length, combos: combos.length },
    score: R_ => parts(R_, null),
    explain: R_ => { const out = []; const v = parts(R_, out); return { total: Math.round(v * 100) / 100, parts: out }; },
    moveBonus(R_, mv) {
      let b = actions[mv.tag] || 0; const m = mv.m;
      if (mv.tag === 'play') { const k = keyOf(R_, m.id), i = info[k]; if (i) b += i.play; if (cutinPlay && hasCutIn(R_, m.id)) b += cutinPlay;
        if (seqs.length) { const hk = new Set(R_.P[seat].hand.map(id => keyOf(R_, id))); for (const s of seqs) { if (s.first === k && hk.has(s.then)) b += s.bonus; else if (s.then === k && hk.has(s.first)) b -= s.bonus * 0.5; } } }
      else if (mv.tag === 'atkc') { const ai = info[keyOf(R_, m.id)], ti = info[keyOf(R_, m.tid)]; if (ai) b += ai.attack; if (ti) b += ti.target; }
      else if (mv.tag === 'ability') { const i = info[keyOf(R_, m.id)]; if (i) b += i.play; }
      if (hooks.move) { view.__set(R_); const desc = { tag: mv.tag, key: m.id != null && R_.cards[m.id] ? keyOf(R_, m.id) : null, targetKey: m.tid != null && R_.cards[m.tid] ? keyOf(R_, m.tid) : null }; let h = 0; try { h = hooks.move(view, Object.freeze(desc)); } catch (e) { h = 0; } b += clamp(h, 30); }
      return clamp(b, 40);
    },
    mulValue: (R_, id) => { const i = info[keyOf(R_, id)]; return i ? i.keep + i.hand * 0.5 : 0; },
    mulAdjust(R_, s, rep) {
      const P = R_.P[s], set = new Set(rep), mu = prof.mulligan || {}, hk = id => keyOf(R_, id);
      for (const id of P.hand) { const k = hk(id), i = info[k]; if ((mu.keep || []).includes(k) || (i && i.mulligan === 'keep')) set.delete(id); }
      for (const id of P.hand) { const k = hk(id), i = info[k]; if ((mu.replace || []).includes(k) || (i && i.mulligan === 'replace')) { if (!((mu.keep || []).includes(k) || (i && i.mulligan === 'keep'))) set.add(id); } }
      for (const cb of combos) if (cb.keep) { const have = {}; for (const id of P.hand) { const k = hk(id); have[k] = (have[k] || 0) + 1; }
        if (Object.entries(cb.need).every(([k, n]) => (have[k] || 0) >= n)) for (const id of P.hand) if (cb.need[hk(id)]) set.delete(id); }
      let out = [...set];
      if (hooks.mulligan) { view.__set(R_); let r; try { r = hooks.mulligan(view, out.map(hk)); } catch (e) { r = undefined; }
        if (Array.isArray(r)) { const pool = P.hand.slice(), picked = []; for (const k of r) { const j = pool.findIndex(id => hk(id) === k); if (j >= 0) picked.push(pool.splice(j, 1)[0]); } out = picked; } }
      return out;
    },
  };
  return pol;
}
module.exports = { buildPolicy, validateProfile, applyPatch, makeView, keyOf, PROFILE_KEYS, CARD_FIELDS, ROLE_FIELDS, ACTION_TAGS };
