// manual 0장 검증용 공통 도구: 전체 DB 의 실제 카드(ab)를 실제 엔진에서 실행한다.
const fs = require('fs'), path = require('path');
const H = require('./helpers'); const { S, game, give, ok, eq, act } = H; const FX = S.FX;
{ const mk = S.mkR; S.mkR = code => { const R = mk(code); R.firstPref = 0; return R; }; } // 선공 고정(호스트)
const DBP = process.env.CARDS_DB || path.join(__dirname, '../data/cards.json');
let _db = null; const DB = () => _db || (_db = JSON.parse(fs.readFileSync(DBP, 'utf8')).cards);
const B = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const real = (id, over = {}) => { const c = DB()[id]; if (!c) throw new Error('no card ' + id); return { n: c.n, type: c.type, color: 'blue', lv: c.lv || '0', ap: c.ap, lp: c.lp, kw: c.kw, trait: c.trait, ab: c.ab, fx: c.fx, ...over }; };
const dummy = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ...extra });
const G = (defs, l0 = [], l1 = l0, base = B) => { const R = game({ ...base, ...defs }, l0, l1); R.P.forEach(P => P.deck.unshift(...P.file.splice(0))); return R; };
const req = R => R.eff && R.eff.req;
const ans = (R, v) => { ok(R.eff, '질의가 와야 함'); const e = act(R, R.eff.req.who, { a: 'ans', v }); if (e) throw new Error('ans: ' + e); };
// 자동 응답: yn → yn 값, pick → pref 우선 선택(없으면 min 만큼 앞에서), opt → optIdx
const auto = (R, o = {}) => { const yn = o.yn !== false, pref = o.pref || [], oi = o.opt || 0; let g = 0, log = [];
  while (R.eff && g++ < 40) { const q = req(R); log.push(q.kind);
    ans(R, q.kind === 'yn' ? (typeof o.yn === 'function' ? o.yn(q) : yn) : q.kind === 'pick' ? (q.ordered ? q.ids : (() => { const w = pref.filter(x => q.sel.includes(x)).slice(0, q.max); return w.length >= q.min ? w : q.sel.slice(0, q.min); })()) : q.kind === 'opt' ? (typeof oi === 'function' ? oi(q) : oi) : q.kind === 'optm' ? (o.optm || []) : q.kind === 'text' ? (o.text || 'x') : null); }
  return log; };
const filler = (R, s, n) => { const out = []; const P = R.P[s]; for (let i = P.deck.length - 1; i >= 0 && out.length < n; i--) { const k = H.key(R, P.deck[i]); if (k === 'filler' || /^f\d+$/.test(k)) out.push(P.deck.splice(i, 1)[0]); } ok(out.length === n, '필러 부족'); return out; };
const fillFile = (R, s, n) => { const P = R.P[s]; while (P.file.length < n) P.file.push(filler(R, s, 1)[0]); };
const evid = (R, s, n, up = false) => { const ids = filler(R, s, n); ids.forEach(i => { R.cards[i].up = up; R.P[s].evid.push(i); }); return ids; };
const solve = (R, s) => { FX.setSolved(R, s); FX.pump(R); };
const field = (R, s, k, st = 'a') => { const id = give(R, s, k, 'field'); R.cards[id].st = st; R.cards[id].sum = 0; return id; };
const hand = (R, s, k) => give(R, s, k, 'hand'); const rem = (R, s, k) => give(R, s, k, 'rem'); const pa = (R, s, k) => give(R, s, k, 'pa');
const top = (R, s, k) => { const id = give(R, s, k, 'deck'); const d = R.P[s].deck; d.splice(d.indexOf(id), 1); d.push(id); return id; };
const has = (R, s, z, id) => R.P[s][z].includes(id);
const pump = R => FX.pump(R);
const play = (R, s, id, extra = {}) => { const e = act(R, s, { a: 'play', id, ...extra }); if (e) throw new Error('play: ' + e); };
const endTurn = R => { const s = R.turn; const e = act(R, s, { a: 'end' }); if (e) throw new Error('end: ' + e); };
const ready = (R, id) => { R.cards[id].sum = 0; R.cards[id].st = 'a'; return id; };
function toContact(R, s, a, tid) { ready(R, a); const e = act(R, s, { a: 'action', id: a, k: 'char', tid }); if (e) throw new Error('action: ' + e); act(R, 1 - s, { a: 'guard', id: null }); ok(R.sub && R.sub.type === 'contact', '컨택트'); }
const endContact = R => { let g = 0; while (R.sub && g++ < 8) { if (R.eff) auto(R); act(R, R.sub.who, { a: 'pass' }); } FX.pump(R); };
// ai(공격 캐릭터)가 di(상대 캐릭터)에 액션 → 가드 없음 → 컨택트. 공격 쪽이 턴 플레이어가 된다.
function attack(R, ai, di, noGuard = true) { const a = R.cards[ai].o; R.turn = a; R.fl = {}; R.cards[ai].sum = 0; R.cards[ai].st = 'a'; if (R.cards[di].st === 'a') R.cards[di].st = 's';
  const e = act(R, a, { a: 'action', id: ai, k: 'char', tid: di }); if (e) throw new Error('action: ' + e); if (noGuard) { const e2 = act(R, 1 - a, { a: 'guard', id: null }); if (e2) throw new Error('guard: ' + e2); } }
// 컨택트 진행: script=[{s, m:{a:'cin'|'dis', id}}...] 의 행동을 해당 좌석 차례에 하고, 나머지는 패스. 효과 질의는 auto 로 처리.
function finishContact(R, script = [], ao = {}) { let g = 0; while ((R.sub || R.eff) && g++ < 30) { if (R.eff) { auto(R, ao); continue; } const w = R.sub.who; const i = script.findIndex(x => x.s === w);
    if (i >= 0) { const m = script.splice(i, 1)[0]; const e = act(R, w, m.m); if (e) throw new Error('contact act: ' + e); } else { const e = act(R, w, { a: 'pass' }); if (e) throw new Error('pass: ' + e); } } pump(R); }
const T = []; const t = (id, n, f) => T.push([id, n, f]);
const runAll = (label) => { let pass = 0, fail = 0; const bad = []; const only = process.env.ONLY;
  for (const [id, n, f] of T) { if (only && !id.includes(only)) continue; try { f(); pass++; } catch (e) { fail++; bad.push(`${id} ${n}: ${e.message.split('\n')[0]}`); } }
  console.log(`${label}: ${pass} 통과 / ${fail} 실패`); bad.forEach(b => console.log('  ✗ ' + b)); if (fail) process.exitCode = 1; return { pass, fail }; };
module.exports = { ...H, S, FX, DB, real, dummy, G, req, ans, auto, filler, fillFile, evid, solve, field, hand, rem, pa, top, has, pump, play, endTurn, ready, toContact, endContact, attack, finishContact, T, t, runAll, B };
