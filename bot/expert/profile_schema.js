// 전문 봇 프로필의 v1.5.0 확장 항목 검증 (Expert Knowledge Layer 가 읽는 항목).  policy.validateProfile 이 호출한다.
//   archetype            덱 성격 태그 (문자열 또는 배열) — knowledge entry 의 archetype 범위와 매칭
//   formation            이 덱이 만들고 싶은 이상적인 중간 필드 { name, field:[slot], hand:[slot], file, evidence, weight, completeBonus, protect }
//   lethal.packages      리살 패키지 [{ name, field:[slot], hand:[slot], file, evidence, solved, sequence:[문자열], bonus }]
//   requiredEarlyPlays   초동 요구 [{ turn, type:'char'|'any', lvMax?, cards?:[id], penalty? }]
//   mulliganKeepGroups   멀리건 유지 그룹 [{ name, cards?:[id], filter?:{type,lvMin,lvMax}, min, bonus, force? }]
//   curveFailurePenalty  초동 실패(패스) 벌점: 숫자 또는 [1턴, 2턴, 3턴 …]
//   firstPlayerPlan / secondPlayerPlan  선공/후공 계획 { notes, requiredEarlyPlays, mulliganKeepGroups, curveFailurePenalty, formation, partner, fileFloor }
//   partner              { preserveDeduction: 0~1 (파트너 추리 보존 성향), note }
//   fileFloor            { floor, fromTurn? } 이 덱이 지키고 싶은 FILE 하한
//   tactics              { lethal, file6, charEveryTurn, contact, partner, defense, mulligan: true/false } — v1.6.0 Tactical Layer 규칙 켜기/끄기 (범용 Expert 는 전부 켜짐, 전문 봇은 lethal·contact·defense 만 기본 켜짐)
//   knowledge            { use:[entry id], exclude:[entry id], entries:[이 봇 전용 knowledge entry] }
//   slot = { cards?:[id], role?:'역할', type?:'char'|'event', lvMin?, lvMax?, n?:1, weight?:1 }
'use strict';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const EXPERT_KEYS = ['archetype', 'formation', 'requiredEarlyPlays', 'mulliganKeepGroups', 'curveFailurePenalty', 'firstPlayerPlan', 'secondPlayerPlan', 'partner', 'fileFloor', 'knowledge', 'tactics'];
const SLOT_KEYS = ['cards', 'role', 'type', 'lvMin', 'lvMax', 'n', 'weight', 'name'];
const PLAN_KEYS = ['notes', 'requiredEarlyPlays', 'mulliganKeepGroups', 'curveFailurePenalty', 'formation', 'partner', 'fileFloor'];

function validateExpert(p, h) {
  const { errors, warn, cardId, roles, obj, num } = h;
  const slot = (s, at) => { if (!obj(s, at)) return; for (const k of Object.keys(s)) if (!SLOT_KEYS.includes(k)) errors.push(`${at}.${k}: 알 수 없는 항목 (허용: ${SLOT_KEYS.join(', ')})`);
    if (s.cards != null) { if (!Array.isArray(s.cards) || !s.cards.length) errors.push(`${at}.cards: 카드 ID 배열`); else s.cards.forEach(id => cardId(id, `${at}.cards`, true)); }
    if (s.role != null && !(roles || {})[s.role]) errors.push(`${at}.role: 정의되지 않은 역할 "${s.role}"`);
    if (s.type != null && !['char', 'event'].includes(s.type)) errors.push(`${at}.type: char|event`);
    for (const k of ['lvMin', 'lvMax', 'n', 'weight']) if (s[k] != null) num(s[k], `${at}.${k}`);
    if (s.cards == null && s.role == null && s.type == null && s.lvMin == null && s.lvMax == null) errors.push(`${at}: cards/role/type/lvMin/lvMax 중 하나는 필요합니다`); };
  const slots = (a, at) => { if (a == null) return; if (!Array.isArray(a)) return errors.push(`${at}: slot 배열이어야 합니다`); a.forEach((s, i) => slot(s, `${at}[${i}]`)); };
  const formation = (f, at) => { if (!obj(f, at)) return; for (const k of Object.keys(f)) if (!['name', 'field', 'hand', 'file', 'evidence', 'weight', 'completeBonus', 'protect', 'note'].includes(k)) errors.push(`${at}.${k}: 알 수 없는 항목`);
    slots(f.field, `${at}.field`); slots(f.hand, `${at}.hand`); for (const k of ['file', 'evidence', 'weight', 'completeBonus', 'protect']) if (f[k] != null) num(f[k], `${at}.${k}`);
    if (!f.field && !f.hand) errors.push(`${at}: field 또는 hand slot 이 필요합니다`); };
  const early = (a, at) => { if (!Array.isArray(a)) return errors.push(`${at}: 배열이어야 합니다`); a.forEach((x, i) => { const w = `${at}[${i}]`; if (!obj(x, w)) return;
    for (const k of Object.keys(x)) if (!['turn', 'type', 'lvMax', 'cards', 'penalty', 'note'].includes(k)) errors.push(`${w}.${k}: 알 수 없는 항목`);
    num(x.turn, `${w}.turn`); if (x.type != null && !['char', 'any'].includes(x.type)) errors.push(`${w}.type: char|any`); for (const k of ['lvMax', 'penalty']) if (x[k] != null) num(x[k], `${w}.${k}`);
    if (x.cards != null) { if (!Array.isArray(x.cards)) errors.push(`${w}.cards: 배열`); else x.cards.forEach(id => cardId(id, `${w}.cards`, true)); } }); };
  const groups = (a, at) => { if (!Array.isArray(a)) return errors.push(`${at}: 배열이어야 합니다`); a.forEach((x, i) => { const w = `${at}[${i}]`; if (!obj(x, w)) return;
    for (const k of Object.keys(x)) if (!['name', 'cards', 'filter', 'min', 'bonus', 'force', 'note'].includes(k)) errors.push(`${w}.${k}: 알 수 없는 항목`);
    if (x.cards != null) { if (!Array.isArray(x.cards) || !x.cards.length) errors.push(`${w}.cards: 카드 ID 배열`); else x.cards.forEach(id => cardId(id, `${w}.cards`, true)); }
    if (x.filter != null && obj(x.filter, `${w}.filter`)) for (const [k, v] of Object.entries(x.filter)) { if (!['type', 'lvMin', 'lvMax'].includes(k)) errors.push(`${w}.filter.${k}: type|lvMin|lvMax`); else if (k !== 'type') num(v, `${w}.filter.${k}`); }
    if (x.cards == null && x.filter == null) errors.push(`${w}: cards 또는 filter 가 필요합니다`); for (const k of ['min', 'bonus']) if (x[k] != null) num(x[k], `${w}.${k}`); }); };
  const penalty = (v, at) => { if (Array.isArray(v)) v.forEach((x, i) => num(x, `${at}[${i}]`)); else num(v, at); };
  const partner = (v, at) => { if (!obj(v, at)) return; for (const k of Object.keys(v)) if (!['preserveDeduction', 'note'].includes(k)) errors.push(`${at}.${k}: preserveDeduction|note`); if (v.preserveDeduction != null) num(v.preserveDeduction, `${at}.preserveDeduction`); };
  const floor = (v, at) => { if (!obj(v, at)) return; for (const k of Object.keys(v)) if (!['floor', 'fromTurn', 'note'].includes(k)) errors.push(`${at}.${k}: floor|fromTurn|note`); num(v.floor, `${at}.floor`); if (v.fromTurn != null) num(v.fromTurn, `${at}.fromTurn`); };
  if (p.archetype != null && !(typeof p.archetype === 'string' || (Array.isArray(p.archetype) && p.archetype.every(x => typeof x === 'string')))) errors.push('archetype: 문자열 또는 문자열 배열');
  if (p.formation != null) formation(p.formation, 'formation');
  if (p.requiredEarlyPlays != null) early(p.requiredEarlyPlays, 'requiredEarlyPlays');
  if (p.mulliganKeepGroups != null) groups(p.mulliganKeepGroups, 'mulliganKeepGroups');
  if (p.curveFailurePenalty != null) penalty(p.curveFailurePenalty, 'curveFailurePenalty');
  if (p.partner != null) partner(p.partner, 'partner');
  if (p.fileFloor != null) floor(p.fileFloor, 'fileFloor');
  for (const pk of ['firstPlayerPlan', 'secondPlayerPlan']) if (p[pk] != null && obj(p[pk], pk)) { const pl = p[pk];
    for (const k of Object.keys(pl)) if (!PLAN_KEYS.includes(k)) errors.push(`${pk}.${k}: 알 수 없는 항목 (허용: ${PLAN_KEYS.join(', ')})`);
    if (pl.requiredEarlyPlays != null) early(pl.requiredEarlyPlays, `${pk}.requiredEarlyPlays`); if (pl.mulliganKeepGroups != null) groups(pl.mulliganKeepGroups, `${pk}.mulliganKeepGroups`);
    if (pl.curveFailurePenalty != null) penalty(pl.curveFailurePenalty, `${pk}.curveFailurePenalty`); if (pl.formation != null) formation(pl.formation, `${pk}.formation`);
    if (pl.partner != null) partner(pl.partner, `${pk}.partner`); if (pl.fileFloor != null) floor(pl.fileFloor, `${pk}.fileFloor`); }
  if (p.tactics != null && obj(p.tactics, 'tactics')) for (const [k, v] of Object.entries(p.tactics)) { if (!['lethal', 'file6', 'charEveryTurn', 'contact', 'partner', 'defense', 'mulligan'].includes(k)) errors.push(`tactics.${k}: 알 수 없는 항목 (허용: lethal, file6, charEveryTurn, contact, partner, defense, mulligan)`); else if (typeof v !== 'boolean') errors.push(`tactics.${k}: true/false 여야 합니다`); }
  if (p.knowledge != null && obj(p.knowledge, 'knowledge')) { const k = p.knowledge; for (const x of Object.keys(k)) if (!['use', 'exclude', 'entries'].includes(x)) errors.push(`knowledge.${x}: use|exclude|entries`);
    for (const x of ['use', 'exclude']) if (k[x] != null && (!Array.isArray(k[x]) || k[x].some(v => typeof v !== 'string'))) errors.push(`knowledge.${x}: entry id 문자열 배열`);
    if (k.entries != null) { if (!Array.isArray(k.entries)) errors.push('knowledge.entries: 배열'); else { const KB = require('./knowledge.js'); k.entries.forEach((e, i) => { const r = KB.validateEntry(e, { DB: h.DB, at: `knowledge.entries[${i}]`, own: true }); errors.push(...r.errors); warn.push(...r.warnings); }); } } }
  // lethal.packages
  if (p.lethal && p.lethal.packages != null) { if (!Array.isArray(p.lethal.packages)) errors.push('lethal.packages: 배열'); else p.lethal.packages.forEach((x, i) => { const w = `lethal.packages[${i}]`; if (!obj(x, w)) return;
    for (const k of Object.keys(x)) if (!['name', 'field', 'hand', 'file', 'evidence', 'solved', 'sequence', 'bonus', 'note'].includes(k)) errors.push(`${w}.${k}: 알 수 없는 항목`);
    slots(x.field, `${w}.field`); slots(x.hand, `${w}.hand`); for (const k of ['file', 'evidence', 'bonus']) if (x[k] != null) num(x[k], `${w}.${k}`);
    if (x.sequence != null && (!Array.isArray(x.sequence) || x.sequence.some(s => typeof s !== 'string'))) errors.push(`${w}.sequence: 문자열 배열 (사람이 읽는 리살 순서)`); }); }
  void isNum;
}
module.exports = { validateExpert, EXPERT_KEYS, SLOT_KEYS, PLAN_KEYS };
