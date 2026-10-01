// Expert Knowledge Layer — 지식 베이스(knowledge entry) 로더 · 검증 · 적용 범위(scope) 매칭 · 컴파일.
//
// 지식은 "이 상황이면 무조건 A" 같은 강제 규칙이 아니다. entry 의 effects 는 탐색이 쓰는 숫자로만 바뀐다:
//   features : 평가 특징의 크기(1 = 기본 크기)             → evaluation feature
//   priors   : 행동 탐색 순서 가산                          → action prior / action ordering
//   prune    : 메인 계획 탐색에서 뒤로 미루는 행동(소프트)   → pruning 판단 (루트에서는 탐색이 다시 검증해 더 좋으면 뒤집는다)
//   fileFloor / partner / mulligan : 파라미터
// entry 마다 source · env(세트/환경) · date · archetype · matchup · side(first/second) · confidence 를 기록하고,
// 범위가 맞지 않으면 적용하지 않으며(예: 예전 환경 특정 덱의 운영법을 모든 덱에 적용하지 않음), 오래된 환경의 지식은 confidence 를 낮춘다.
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'knowledge');

const FEATURES = ['turnsToWin', 'evidenceTempo', 'boardLeakRisk', 'futureCleanupValue', 'nextTurnFileRequirement', 'lethalFileRequirement', 'defensiveFileRequirement', 'fileFloor', 'assistResidual', 'actionEconomy', 'formation', 'handCurve'];
const PRIORS = ['multiZone', 'baitAttack', 'lowApReasonFirst', 'reasonBeforeHint', 'partnerChoice', 'preserveDeduction', 'formationBreak', 'protectFileRoute'];
const PRUNES = ['hintFileFloor', 'proHintTiming', 'proCharEveryTurn'];
const EFFECT_KEYS = ['features', 'priors', 'prune', 'fileFloor', 'partner', 'mulligan'];
const ENTRY_KEYS = ['id', 'title', 'principle', 'text', 'quote', 'source', 'env', 'envStrict', 'date', 'archetype', 'matchup', 'side', 'bots', 'confidence', 'effects', 'note'];
const ARCH_KEYS = ['colors', 'mono', 'maxLvMax', 'maxLvMin', 'tags', 'cards'];
const MATCH_KEYS = ['colors', 'cards', 'case', 'partner', 'tags'];
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const ID_RE = /\bid_[0-9A-Za-z]{3,6}\b/;

function readEnv() { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'env.json'), 'utf8')); } catch (e) { return { current: { name: 'current', date: '2026-10-01' }, staleAfterMonths: 12, staleFactor: 0.6, minFactor: 0.2 }; } }
const monthsOf = d => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(d || '')); return m ? (+m[1]) * 12 + (+m[2] - 1) + (m[3] ? (+m[3] - 1) / 31 : 0) : null; };

// ── entry 하나 검증
function validateEntry(e, o = {}) {
  const errors = [], warnings = [], at = o.at || (e && e.id ? `entry ${e.id}` : 'entry');
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { errors: [`${at}: 객체여야 합니다`], warnings };
  for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) errors.push(`${at}.${k}: 알 수 없는 항목 (허용: ${ENTRY_KEYS.join(', ')})`);
  if (!/^[a-z0-9][a-z0-9_.-]{2,60}$/.test(String(e.id || ''))) errors.push(`${at}.id: 영소문자/숫자/_.- (3~61자)`);
  if (!e.title) errors.push(`${at}.title: 필요합니다`);
  if (!e.source || (typeof e.source !== 'string' && !(typeof e.source === 'object' && e.source.name))) errors.push(`${at}.source: 출처(문자열 또는 {name,url,author})가 필요합니다`);
  if (!e.env || typeof e.env !== 'string') errors.push(`${at}.env: 세트/환경 문자열이 필요합니다 ('any' 가능)`);
  if (monthsOf(e.date) == null) errors.push(`${at}.date: YYYY-MM 또는 YYYY-MM-DD`);
  if (!isNum(e.confidence) || e.confidence < 0 || e.confidence > 1) errors.push(`${at}.confidence: 0~1 숫자`);
  if (!['any', 'first', 'second'].includes(e.side)) errors.push(`${at}.side: any|first|second`);
  if (e.bots != null && e.bots !== 'any' && !(Array.isArray(e.bots) && e.bots.every(x => typeof x === 'string'))) errors.push(`${at}.bots: 'any' 또는 봇 id 배열`);
  const scope = (v, keys, w) => { if (v === 'any') return; if (!v || typeof v !== 'object' || Array.isArray(v)) return errors.push(`${w}: 'any' 또는 조건 객체`); for (const k of Object.keys(v)) if (!keys.includes(k)) errors.push(`${w}.${k}: 알 수 없는 조건 (허용: ${keys.join(', ')})`);
    for (const k of ['colors', 'tags', 'cards']) if (v[k] != null && (!Array.isArray(v[k]) || v[k].some(x => typeof x !== 'string'))) errors.push(`${w}.${k}: 문자열 배열`);
    if (o.DB) for (const id of v.cards || []) if (!o.DB[id]) errors.push(`${w}.cards: 카드 DB 에 없는 ID ${id}`); };
  scope(e.archetype, ARCH_KEYS, `${at}.archetype`); scope(e.matchup, MATCH_KEYS, `${at}.matchup`);
  // 카드 전용 지식은 global(archetype 'any')로 둘 수 없다
  if (e.archetype === 'any' && !o.own && ID_RE.test(JSON.stringify(e.effects || {}))) errors.push(`${at}: 특정 카드 ID 를 쓰는 지식은 archetype 을 'any' 로 둘 수 없습니다 (덱/아키타입 범위를 지정하세요)`);
  const ef = e.effects; if (!ef || typeof ef !== 'object' || Array.isArray(ef)) errors.push(`${at}.effects: 객체가 필요합니다`);
  else { for (const k of Object.keys(ef)) if (!EFFECT_KEYS.includes(k)) errors.push(`${at}.effects.${k}: 알 수 없는 효과 (허용: ${EFFECT_KEYS.join(', ')})`);
    for (const [k, v] of Object.entries(ef.features || {})) { if (!FEATURES.includes(k)) errors.push(`${at}.effects.features.${k}: 알 수 없는 특징 (허용: ${FEATURES.join(', ')})`); else if (!isNum(v) || v < 0 || v > 4) errors.push(`${at}.effects.features.${k}: 0~4 숫자 (1 = 기본 크기)`); }
    for (const [k, v] of Object.entries(ef.priors || {})) { if (!PRIORS.includes(k)) errors.push(`${at}.effects.priors.${k}: 알 수 없는 prior (허용: ${PRIORS.join(', ')})`); else if (!isNum(v) || Math.abs(v) > 20) errors.push(`${at}.effects.priors.${k}: -20~20 숫자`); }
    for (const [k, v] of Object.entries(ef.prune || {})) { if (!PRUNES.includes(k)) errors.push(`${at}.effects.prune.${k}: 알 수 없는 prune (허용: ${PRUNES.join(', ')})`); else if (v !== true && (typeof v !== 'object' || Array.isArray(v))) errors.push(`${at}.effects.prune.${k}: true 또는 파라미터 객체`); }
    if (ef.fileFloor != null && (!ef.fileFloor || !isNum(ef.fileFloor.floor))) errors.push(`${at}.effects.fileFloor: { floor, fromTurn? }`);
    if (ef.partner != null && (!ef.partner || !isNum(ef.partner.preserveDeduction))) errors.push(`${at}.effects.partner: { preserveDeduction: 0~1 }`);
    if (ef.mulligan != null) { const m = ef.mulligan; if (!m || typeof m !== 'object') errors.push(`${at}.effects.mulligan: 객체`); else for (const k of Object.keys(m)) if (!['requiredEarlyPlays', 'mulliganKeepGroups', 'curveFailurePenalty'].includes(k)) errors.push(`${at}.effects.mulligan.${k}: requiredEarlyPlays|mulliganKeepGroups|curveFailurePenalty`); } }
  if (!e.text && !e.quote) warnings.push(`${at}: text/quote(사람이 읽는 설명)가 없습니다`);
  return { errors, warnings };
}

// ── 로드 (bot/knowledge/*.json, env.json 제외). 잘못된 entry 는 problems 에 보고하고 건너뛴다.
let _kb = null;
function load(dir = process.env.BOT_KNOWLEDGE_DIR || DIR) {
  if (_kb && _kb.dir === dir) return _kb;
  const entries = [], problems = [], ids = new Set(); let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'env.json').sort(); } catch (e) { problems.push(`${dir}: 폴더를 읽을 수 없습니다`); }
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(`${f}: JSON 오류 — ${e.message}`); continue; }
    const list = Array.isArray(j) ? j : j.entries; if (!Array.isArray(list)) { problems.push(`${f}: { entries: [...] } 형식이어야 합니다`); continue; }
    list.forEach((e, i) => { const r = validateEntry(e, { at: `${f}#${i}${e && e.id ? '(' + e.id + ')' : ''}` }); if (r.errors.length) { problems.push(...r.errors); return; } if (ids.has(e.id)) { problems.push(`${f}: id 중복 ${e.id}`); return; } ids.add(e.id); entries.push({ ...e, file: f }); });
  }
  _kb = { dir, entries, problems, env: readEnv() }; return _kb;
}
const reload = () => { _kb = null; return load(); };

// ── 적용 맥락 (덱 성격/상대/선후공/봇 종류)
const colsOf = c => String(c || '').toLowerCase().split(/[\/,&\s]+/).filter(Boolean);
function deckInfo(R, s) {
  const colors = new Set(), keys = new Set(); let maxLv = 0;
  for (const c of Object.values(R.cards)) { if (c.o !== s) continue; const d = R.defs[c.d]; if (!d) continue; const k = c.d.slice(c.d.indexOf(':') + 1); keys.add(k);
    if (d.type === 'char' || d.type === 'event') { colsOf(d.color).forEach(x => colors.add(x)); maxLv = Math.max(maxLv, +d.lv || 0); } }
  const P = R.P[s], kd = P.kase != null ? R.defs[R.cards[P.kase].d] : null; if (kd) colsOf(kd.color).forEach(x => colors.add(x));
  return { colors: [...colors].sort(), mono: colors.size === 1, maxLv, keys, kase: P.kase != null ? R.cards[P.kase].d.split(':')[1] : null, partner: P.partner != null ? R.cards[P.partner].d.split(':')[1] : null };
}
function contextOf(R, seat, o = {}) {
  const tags = [].concat(o.archetype || []).filter(Boolean).map(String);
  return { bot: o.bot || 'pro', seat, side: R.first === seat ? 'first' : 'second', deck: deckInfo(R, seat), opp: deckInfo(R, 1 - seat), tags, oppTags: [].concat(o.oppArchetype || []) };
}
function inScope(e, ctx) {
  if (e.bots && e.bots !== 'any' && !e.bots.includes(ctx.bot)) return `봇 범위 밖 (${e.bots.join(',')})`;
  if (e.side !== 'any' && e.side !== ctx.side) return `${e.side === 'first' ? '선공' : '후공'} 전용`;
  const a = e.archetype;
  if (a !== 'any') { const d = ctx.deck;
    if (a.colors && !a.colors.every(c => d.colors.includes(c))) return `덱 색 조건 (${a.colors.join('/')}) 불일치`;
    if (a.mono != null && a.mono !== d.mono) return a.mono ? '단색 덱 전용' : '다색 덱 전용';
    if (a.maxLvMax != null && d.maxLv > a.maxLvMax) return `덱 최고 레벨 ≤ ${a.maxLvMax} 전용 (현재 ${d.maxLv})`;
    if (a.maxLvMin != null && d.maxLv < a.maxLvMin) return `덱 최고 레벨 ≥ ${a.maxLvMin} 전용`;
    if (a.tags && !a.tags.some(t => ctx.tags.includes(t))) return `아키타입 태그 (${a.tags.join(',')}) 불일치`;
    if (a.cards && !a.cards.some(k => d.keys.has(k))) return '덱에 해당 카드 없음'; }
  const m = e.matchup;
  if (m !== 'any') { const d = ctx.opp;
    if (m.colors && !m.colors.some(c => d.colors.includes(c))) return `상대 색 조건 (${m.colors.join('/')}) 불일치`;
    if (m.cards && !m.cards.some(k => d.keys.has(k))) return '상대 덱에 해당 카드 없음';
    if (m.case && m.case !== d.kase) return '상대 사건 불일치'; if (m.partner && m.partner !== d.partner) return '상대 파트너 불일치';
    if (m.tags && !m.tags.some(t => (ctx.oppTags || []).includes(t))) return '상대 아키타입 불일치'; }
  return null;
}
function staleness(e, env) {
  if (e.env === 'any') return { factor: 1, stale: false, months: 0 };
  const cur = monthsOf(env.current && env.current.date), d = monthsOf(e.date), months = cur != null && d != null ? Math.max(0, cur - d) : 0;
  const per = env.staleAfterMonths || 12, periods = Math.floor(months / per), factor = Math.max(env.minFactor || 0.2, Math.pow(env.staleFactor || 0.6, periods));
  return { factor, stale: periods > 0, months: Math.round(months) };
}

// ── 컴파일: 범위에 맞는 entry 의 효과를 confidence(×오래됨 보정)로 합친다
function compile(ctx, o = {}) {
  const kb = o.kb || load(), env = kb.env, prof = o.knowledge || {}, use = prof.use ? new Set(prof.use) : null, ex = new Set(prof.exclude || []);
  const all = [...kb.entries, ...(prof.entries || []).map(e => ({ ...e, bots: e.bots || [ctx.bot], file: 'profile' }))];
  const applied = [], skipped = [], fAcc = {}, pAcc = {}, prune = {}, mul = {}, byFeature = {}, byPrior = {}; let fileFloor = null, partner = null;
  for (const e of all) {
    if (ex.has(e.id)) { skipped.push({ id: e.id, why: '프로필에서 제외' }); continue; }
    if (use && !use.has(e.id) && e.file !== 'profile') { skipped.push({ id: e.id, why: '프로필 use 목록에 없음' }); continue; }
    const why = inScope(e, ctx); if (why) { skipped.push({ id: e.id, why }); continue; }
    const st = staleness(e, env); if (e.envStrict && e.env !== 'any' && e.env !== (env.current && env.current.name)) { skipped.push({ id: e.id, why: `환경 전용(${e.env})` }); continue; }
    const conf = Math.round(e.confidence * st.factor * 1000) / 1000; if (conf <= 0) { skipped.push({ id: e.id, why: 'confidence 0' }); continue; }
    applied.push({ id: e.id, title: e.title, principle: e.principle || null, conf, baseConf: e.confidence, stale: st.stale, ageMonths: st.months, env: e.env, date: e.date, source: typeof e.source === 'string' ? e.source : e.source.name + (e.source.url ? ' ' + e.source.url : '') });
    const ef = e.effects || {};
    for (const [k, v] of Object.entries(ef.features || {})) { const a = fAcc[k] || (fAcc[k] = { w: 0, c: 0 }); a.w += conf * v; a.c += conf; (byFeature[k] = byFeature[k] || []).push(e.id); }
    for (const [k, v] of Object.entries(ef.priors || {})) { pAcc[k] = (pAcc[k] || 0) + conf * v; (byPrior[k] = byPrior[k] || []).push(e.id); }
    for (const [k, v] of Object.entries(ef.prune || {})) { const p = prune[k] || (prune[k] = { conf: 0, ids: [], params: {} }); p.conf += conf; p.ids.push(e.id); if (typeof v === 'object') p.params = { ...p.params, ...v }; }
    if (ef.fileFloor && (!fileFloor || conf > fileFloor.conf)) fileFloor = { ...ef.fileFloor, conf, id: e.id, w: conf };
    if (ef.partner && (!partner || conf > partner.conf)) partner = { ...ef.partner, conf, id: e.id };
    if (ef.mulligan) for (const [k, v] of Object.entries(ef.mulligan)) if (!mul[k] || conf > mul[k].conf) mul[k] = { v, conf, id: e.id };
  }
  const feat = {}; for (const k of FEATURES) { const a = fAcc[k]; feat[k] = a ? a.w / Math.max(1, a.c) : 0; }
  const prior = {}; for (const k of PRIORS) prior[k] = Math.max(-20, Math.min(20, pAcc[k] || 0));
  for (const k of Object.keys(prune)) prune[k].on = prune[k].conf >= 0.4;
  return { applied, skipped, feat, prior, prune, fileFloor, partner, mulligan: mul, byFeature, byPrior, env: env.current, problems: kb.problems };
}
module.exports = { load, reload, validateEntry, compile, contextOf, deckInfo, inScope, staleness, FEATURES, PRIORS, PRUNES, EFFECT_KEYS, ENTRY_KEYS, DIR };
