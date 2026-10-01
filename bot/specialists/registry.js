// 전문 봇 registry.  bot/specialists/<id>.js 파일 하나 = 전문 봇 하나.  새 파일을 넣으면 서버 재시작 후 UI 목록에 자동으로 나타납니다 (HTML 수정 불필요).
//
// 각 파일은 다음을 export 합니다 (전체 예시는 _template.js):
//   { id, name, desc?, color?, deckFile: 'decks/<id>.json', profile: { ...전략 프로필... } }
//   · deckFile  : 덱 빌더의 "덱 파일 내보내기" JSON 을 "그대로" 넣은 파일 (형식 변환 없음)
//   · profile   : 덱 전용 전략 정보 (policy.js 상단 주석 / README 참고). 비워 두면 범용 Expert 와 똑같이 행동합니다.
// '_' 로 시작하는 파일, registry.js / policy.js / deckfile.js / cli.js 는 전문 봇으로 읽지 않습니다.
const fs = require('fs'), path = require('path');
const DF = require('./deckfile.js'), POL = require('./policy.js');
const SKIP = new Set(['registry.js', 'policy.js', 'deckfile.js', 'cli.js']);
const COLOR_KO = { red: '적색', blue: '청색', green: '녹색', yellow: '황색', purple: '보라색', black: '흑색', white: '백색', orange: '주황색', pink: '분홍색' };
const ID_RE = /^[a-z0-9][a-z0-9_]{1,40}$/;

let _specs = null; const _extra = new Map();   // _extra: 테스트용 mock specialist (파일 없이 등록)
function readSpec(mod, src, baseDir = __dirname) {
  const errors = [];
  if (!mod || typeof mod !== 'object') return { errors: [`${src}: export 가 객체가 아닙니다`] };
  for (const k of Object.keys(mod)) if (!['id', 'name', 'desc', 'color', 'deckFile', 'deck', 'profile'].includes(k)) errors.push(`${src}: 알 수 없는 항목 ${k}`);
  if (!ID_RE.test(String(mod.id || ''))) errors.push(`${src}: id 는 영소문자/숫자/_ (2~41자) 여야 합니다 (현재 ${JSON.stringify(mod.id)})`);
  if (!mod.name || typeof mod.name !== 'string') errors.push(`${src}: name 이 필요합니다`);
  let deckJson = mod.deck; if (!deckJson && mod.deckFile) { const fp = path.resolve(baseDir, mod.deckFile); try { deckJson = fs.readFileSync(fp, 'utf8'); } catch (e) { errors.push(`${src}: 덱 파일을 읽을 수 없습니다 (${mod.deckFile}): ${e.message}`); } }
  if (!deckJson && !errors.length) errors.push(`${src}: deckFile(덱 빌더가 내보낸 JSON)이 필요합니다`);
  const pd = deckJson ? DF.parseDeckFile(deckJson) : { errors: [], deck: null }; for (const e of pd.errors) errors.push(`${src}: 덱 파일 — ${e}`);
  return { errors, spec: errors.length ? null : { id: mod.id, name: mod.name, desc: mod.desc || '', color: mod.color || null, deck: pd.deck, profile: mod.profile || {} } };
}
// 추가 폴더: 환경변수 BOT_SPECIALISTS_DIR (같은 형식의 파일들; 개인용/실험용 봇이나 테스트용). 기본 폴더(이 폴더)가 먼저 읽힙니다.
const dirs = () => [__dirname, ...(process.env.BOT_SPECIALISTS_DIR ? [path.resolve(process.env.BOT_SPECIALISTS_DIR)] : [])];
function load() {
  if (_specs) return _specs; const out = new Map(), problems = [];
  for (const dir of dirs()) { let files = []; try { files = fs.readdirSync(dir); } catch (e) { problems.push(`${dir}: 폴더를 읽을 수 없습니다`); continue; }
    for (const f of files.filter(x => x.endsWith('.js') && !x.startsWith('_') && !(dir === __dirname && SKIP.has(x))).sort()) {
      try { const r = readSpec(require(path.join(dir, f)), f, dir); if (r.spec) { if (out.has(r.spec.id)) problems.push(`${f}: id 중복 (${r.spec.id})`); else out.set(r.spec.id, r.spec); } else problems.push(...r.errors); }
      catch (e) { problems.push(`${f}: 불러오기 실패 — ${e.message}`); } } }
  for (const [id, s] of _extra) out.set(id, s);
  _specs = out; load.problems = problems; return out;
}
load.problems = [];
const reload = () => { _specs = null; for (const k of Object.keys(require.cache)) for (const d of dirs()) if (k.startsWith(d + path.sep) && !SKIP.has(path.basename(k)) && !path.basename(k).startsWith('_')) delete require.cache[k]; return load(); };
const get = id => load().get(id) || null;

// 카드 DB(cards 객체) 기준 검사 — 덱 규칙 + 프로필 오타/없는 카드. 자동 보정 없음.
function check(spec, DB) {
  const errors = [], warnings = []; if (!DB) return { ok: true, errors, warnings };
  errors.push(...DF.validateDeck(spec.deck, DB).errors);
  const pv = POL.validateProfile(spec.profile, { DB, deckCards: Object.keys(spec.deck.cards).concat([spec.deck.kase, spec.deck.partner]) }); errors.push(...pv.errors); warnings.push(...pv.warnings);
  return { ok: !errors.length, errors, warnings };
}
function checkAll(DB) { return [...load().values()].map(s => ({ id: s.id, name: s.name, ...check(s, DB) })); }
// UI 용 목록 (전략 프로필은 내보내지 않는다)
function list(DB) {
  return [...load().values()].map(s => { const ck = check(s, DB), cols = s.color ? [s.color] : DF.deckColors(s.deck, DB), ko = cols.map(c => COLOR_KO[c] || c);
    return { id: s.id, name: s.name, deckName: s.deck.name, colors: cols, colorLabel: ko.join('/'), desc: s.desc, cards: s.deck.total, ok: ck.ok, errors: ck.ok ? [] : ck.errors.slice(0, 5) }; });
}
// 봇이 쓸 덱 (검증 통과 필수). 실패하면 이유를 담은 Error.
function botDeck(id, DB) {
  const s = get(id); if (!s) throw new Error(`등록되지 않은 전문 봇입니다: ${id}`);
  const ck = check(s, DB); if (!ck.ok) throw new Error(`"${s.name}" 의 덱/프로필이 올바르지 않습니다 — ` + ck.errors.slice(0, 4).join(' / '));
  return { spec: s, deck: DF.toBotDeck(s.deck) };
}
// v1.5.0: 모든 정책에 Expert Knowledge Layer(bot/expert/layer.js)를 얹는다 — 고수 판단 기준(평가 특징·행동 prior·소프트 pruning·초동 멀리건).
//   'pro'       = 범용 Expert (PRO 정책 + knowledge)        'pro_v12' = v1.2.0 PRO 정책 그대로 (비교용, knowledge 없음)
//   '<전문 봇>' = 프로필 정책 + knowledge(프로필의 formation/plan/knowledge 포함)   '<id>@raw' = knowledge 없이 프로필 정책만 (비교용)
//   환경변수 BOT_KNOWLEDGE=0 이면 knowledge 를 끈다.
function policyFor(id, seat, R) {
  const LAYER = require('../expert/layer.js'), TACT = require('../tactics/rules.js'), off = process.env.BOT_KNOWLEDGE === '0', tOn = process.env.BOT_TACTICS !== '0';
  if (id === 'pro_v12') return require('../pro.js').policy(seat, R);
  // v1.6.0: Tactical Layer(bot/tactics) — 리살 solver 는 decide.js 가 탐색 전에 돌리고, 평상시 규칙(FILE 6·AP/컷인·파트너·MR)은 정책 필터/정렬/평가로 들어간다.
  //   범용 'pro' 는 v1.2 의 "이른 힌트 금지(FILE 8/9)·매 턴 캐릭터" 하드 ban 을 버리고 같은 내용을 소프트 규칙(FILE 6 기준)으로 대체한다.  BOT_TACTICS=0 이면 v1.5.0 동작.
  if (id === 'pro') { const b = require('../pro.js').policy(seat, R); if (tOn) delete b.ban; const l = off ? b : LAYER.attach(b, { seat, R, bot: 'pro' }); return tOn ? TACT.attach(l, { seat }) : l; }
  const raw = /@raw$/.test(id), sid = raw ? id.slice(0, -4) : id, s = get(sid); if (!s) throw new Error('등록되지 않은 전문 봇: ' + sid);
  const b = POL.buildPolicy(s, { seat, R }); if (raw) return b; const l = off ? b : LAYER.attach(b, { seat, R, bot: sid, profile: s.profile });
  return tOn ? TACT.attach(l, { seat, flags: { file6: false, charEveryTurn: false, partner: false, mulligan: false, ...((s.profile && s.profile.tactics) || {}) } }) : l;
}
// 테스트 전용: 파일 없이 mock specialist 등록/해제
function _register(mod) { const r = readSpec(mod, 'mock'); if (!r.spec) throw new Error(r.errors.join('; ')); _extra.set(r.spec.id, r.spec); if (_specs) _specs.set(r.spec.id, r.spec); return r.spec; }
function _unregister(id) { _extra.delete(id); if (_specs) _specs.delete(id); }
module.exports = { load, reload, get, list, check, checkAll, botDeck, policyFor, readSpec, COLOR_KO, _register, _unregister, problems: () => (load(), load.problems) };
