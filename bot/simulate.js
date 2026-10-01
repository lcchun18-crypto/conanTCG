// 탐색용 게임 상태 복제 / 결정 주체 판별 / 합법 행동 생성 / 상태 해시.
// 원칙: 봇은 엔진의 act()(= dispatch)를 통해서만 상태를 바꾼다. 여기 있는 모든 시뮬레이션은 clone() 한 사본에서만 일어나며 live 상태를 건드리지 않는다.
const S = require('../server.js');
const { FX, D, fcount, okc, mustGuard } = S;

// ── 시드 RNG (엔진이 Math.random 으로 셔플하므로, 시뮬레이션/리플레이를 재현 가능하게 만들기 위해 동기 구간에서만 교체)
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function withRng(seed, fn) { const old = Math.random; Math.random = mulberry32(seed >>> 0); try { return fn(); } finally { Math.random = old; } }

// ── 복제
const SHARE = new Set(['defs', 'ab', 'ops', 'ws', 'bot']); // 불변 데이터(카드 정의/효과 JSON)는 공유, 소켓/봇 참조는 복제 대상이 아님
class NoClone extends Error {}
function cl(v) {
  if (v === null || typeof v !== 'object') { if (typeof v === 'function') throw new NoClone('function'); return v; }
  if (Array.isArray(v)) { const n = new Array(v.length); for (let i = 0; i < v.length; i++) n[i] = cl(v[i]); return n; }
  const n = {}; for (const k in v) n[k] = SHARE.has(k) ? v[k] : cl(v[k]); return n;
}
// 효과 처리 중(제너레이터가 살아 있음)이거나 클로저가 큐에 있으면 복제할 수 없다 → 그런 상태는 "안정 시점 스냅샷 + 행동 리플레이"로만 재구성한다.
function cloneable(R) {
  if (R.eff || R.curS != null) return false;
  for (const it of R.q) if (it.g || typeof it.fn === 'function') return false;
  return true;
}
function clone(R) {
  const n = {}; for (const k in R) { if (k === 'log') n.log = []; else if (SHARE.has(k)) n[k] = k === 'ws' ? [null, null] : k === 'bot' ? undefined : R[k]; else n[k] = cl(R[k]); }
  return n;
}
function determinize(R, seed) { // 앞으로의 덱 순서는 모른다 → 양쪽 덱을 섞어 "가능한 미래 하나"로 대체 (Perfect-Information 이지만 미래 RNG 는 예언하지 않음)
  withRng(seed, () => { for (const s of [0, 1]) { const d = R.P[s].deck; d.sort((a, b) => a - b); /* 실제 순서 정보를 지운다(정렬 후 시드 셔플) */ for (let i = d.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [d[i], d[j]] = [d[j], d[i]]; } } }); return R;
}

// ── 결정 주체
function who(R) {
  if (R.phase === 'over') return null;
  if (R.phase === 'mull') return { seat: R.mullSeat, kind: 'mull' };
  if (R.phase !== 'play') return null;
  if (R.eff) return { seat: R.eff.req.who, kind: 'eff' };
  if (R.ending) return null;
  if (R.sub) return { seat: R.sub.who, kind: 'sub:' + R.sub.type };
  return { seat: R.turn, kind: R.fl.hw ? 'hint' : 'main' };
}
const isMainKind = k => k === 'main' || k === 'hint';

// ── 상태 해시 (동일 카드 사본은 같은 정의 키로 취급 → 대칭 상태 병합)
function ckey(R, id) { const c = R.cards[id]; return c.d + (c.st && c.st !== 'a' ? c.st : '') + (c.sum ? '!' : '') + (c.apm || c.cm ? '+' + ((c.apm || 0) + (c.cm || 0)) : '') + (c.lpm ? 'l' + c.lpm : '') + (c.lvm ? 'v' + c.lvm : '') + (c.tkw ? 'k' + c.tkw : '') + ((c.sets && c.sets.length) || (c.fd && c.fd.length) ? 's' + ((c.sets || []).length + (c.fd || []).length) : '') + (c.under && c.under.length ? 'u' + c.under.length : '') + (c.u && Object.keys(c.u).length ? 'U' + JSON.stringify(c.u) : ''); }
function stateKey(R) {
  if (R.phase === 'over') return 'over' + R.winner;
  let k = R.phase + '|' + R.turn + '|' + (R.phase === 'mull' ? R.mullSeat : '') + '|' + JSON.stringify(R.fl || {}) + '|' + (R.ending ? 'E' : '') + '|';
  for (const s of [0, 1]) { const P = R.P[s];
    k += [P.hand.map(x => R.cards[x].d).sort().join(','), P.field.map(x => ckey(R, x)).sort().join(','), P.evid.length + (P.evid.some(x => R.cards[x].up) ? 'u' : ''), P.file.length, P.deck.length, P.rem.map(x => R.cards[x].d).sort().join(','), R.cards[P.partner].st + (P.pIn ? 'I' : ''), R.cards[P.kase].solved ? 'S' : '', P.pa.length, P.tr ? 1 : 0].join(';') + '#'; }
  if (R.sub) { const u = R.sub; k += 'sub' + u.type + u.who + (u.atk || '') + '>' + (u.def || u.tid || '') + (u.tk || '') + u.i + JSON.stringify(u.pass || []) + JSON.stringify(u.used || {}) + JSON.stringify(u.ms || []); }
  if (R.q.length) k += 'Q' + R.q.map(i => i.kind + (i.src || '') + (i.s)).join(',');
  return k;
}

// ── 조합
function combos(arr, min, max, cap) { const out = []; const rec = (i, cur) => { if (out.length >= cap) return; if (cur.length >= min && cur.length <= max) out.push(cur.slice()); if (cur.length >= max) return; for (let j = i; j < arr.length && out.length < cap; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); } }; rec(0, []); return out; }
function perms(arr, cap) { if (arr.length <= 1) return [arr.slice()]; const out = []; const rec = (cur, rest) => { if (out.length >= cap) return; if (!rest.length) return out.push(cur); for (let i = 0; i < rest.length && out.length < cap; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]); }; rec([], arr); return out; }

// ── 합법(후보) 행동 생성: 엔진의 act0 와 같은 조건을 따르며, 애매한 것은 후보로 만들고 실제 적용에서 엔진이 거부하면 버린다(엔진이 최종 심판).
const A = (seat, m, tag) => ({ seat, m: { t: 'act', ...m }, tag: tag || m.a });
function effMoves(R, seat, val) {
  const q = R.eff.req, out = [], a = v => A(seat, { a: 'ans', v }, 'ans');
  switch (q.kind) {
    case 'yn': out.push(a(true), a(false)); break;
    case 'ack': out.push(a(null)); break;
    case 'opt': (q.labels || []).forEach((_, i) => out.push(a(i))); break;
    case 'optm': for (const c of combos((q.labels || []).map((_, i) => i), q.min || 0, q.max == null ? q.labels.length : q.max, 64)) out.push(a(c)); break;
    case 'text': { const names = new Set(); for (const z of ['hand', 'deck', 'rem', 'file', 'evid']) for (const id of R.P[1 - seat][z]) names.add(D(R, id).n); const L = [...names].slice(0, 30); if (!L.length) L.push('a'); L.forEach(n => out.push(a(n))); break; }
    case 'pick': { const sel = q.sel || q.ids || [], mx = Math.min(q.max == null ? sel.length : q.max, sel.length), mn = Math.min(q.min || 0, mx);
      let cs; const total = (() => { let t = 1, n = sel.length; for (let k = 0; k < mx; k++) { t = t * (n - k) / (k + 1); if (t > 400) return 400; } return t; })();
      if (total <= 200) cs = combos(sel, mn, mx, 120); else { const sorted = sel.slice().sort((x, y) => val(R, y) - val(R, x)); cs = []; for (let k = mn; k <= mx; k++) { cs.push(sorted.slice(0, k), sorted.slice(sorted.length - k)); if (cs.length > 12) break; } sel.slice(0, 12).forEach(x => { if (mn <= 1 && mx >= 1) cs.push([x]); }); }
      const seen = new Set(); for (let c of cs) { const k = c.join(','); if (seen.has(k)) continue; seen.add(k); if (q.ordered && c.length > 1) for (const p of perms(c, 6)) out.push(a(p)); else out.push(a(c)); } break; }
    default: out.push(a(null));
  }
  return out;
}
function subMoves(R, seat) {
  const u = R.sub, P = R.P[seat], out = [];
  if (u.type === 'mis') { for (const c of combos(u.ms || [], 0, (u.ms || []).length, 16)) out.push(A(seat, { a: 'mis', ids: c }, 'mis')); return out; }
  if (u.type === 'guard') { const mg = mustGuard(R, seat); if (!mg.length) out.push(A(seat, { a: 'guard', id: null }, 'noguard'));
    const seen = new Set(); for (const g of P.field) { const c = R.cards[g]; if (c.st !== 'a' && !(c.st === 's' && FX.hasKwTk(R, g, 'sleepguard'))) continue; if (FX.hasKwTk(R, g, 'cantguard')) continue; if (mg.length && !mg.includes(g)) continue; const k = ckey(R, g); if (seen.has(k)) continue; seen.add(k); out.push(A(seat, { a: 'guard', id: g }, 'guard')); } return out; }
  // contact: 패스 / 컷인 / 변장
  out.push(A(seat, { a: 'pass' }, 'pass')); if (u.used && u.used[seat]) return out;
  const k = R.cards[u.atk].o === seat ? 'atk' : 'def', my = u[k], seen = new Set();
  for (const id of P.hand) { const d = D(R, id), dk = R.cards[id].d; if (seen.has(dk)) continue;
    const t = S.tok(d);
    if (!seen.has(dk) && !FX.pk(R, 1 - seat, 'nocutin') && (FX.hasCut(R, id) || t.cut > 0) && FX.cutOk(R, seat, id, t.cut)) { seen.add(dk); out.push(A(seat, { a: 'cin', id }, 'cin')); }
    if (!seen.has(dk + 'd') && d.type === 'char' && !FX.pk(R, 1 - seat, 'nodisguise') && (t.dis || FX.disAbs(R, id).length) && FX.disguiseOk(R, seat, id)) { seen.add(dk + 'd'); out.push(A(seat, { a: 'dis', id }, 'dis')); } }
  return out;
}
function mullMoves(R, seat, val) { const h = R.P[seat].hand.slice().sort((x, y) => val(R, x) - val(R, y)), out = [A(seat, { a: 'mull', ids: [] }, 'mull0')];
  for (let k = 1; k <= Math.min(4, h.length); k++) out.push(A(seat, { a: 'mull', ids: h.slice(0, k) }, 'mull' + k)); return out; }
function mainMoves(R, seat) {
  const P = R.P[seat], O = R.P[1 - seat], out = [], hw = !!R.fl.hw;
  const acts = hw ? {} : S.actsFor(R, seat), seenSig = new Set();
  // 손패 사용 (같은 정의의 사본은 하나만)
  if (hw || (!R.fl.played && !R.fl.hint)) { const seen = new Set();
    for (const id of P.hand) { const d = D(R, id), k = R.cards[id].d; if (seen.has(k)) continue; if (S.playCheck(R, seat, id)) continue; seen.add(k);
      if (d.type === 'char' && P.field.length >= 5) { const rs = new Set(); for (const r of P.field) { const rk = ckey(R, r); if (rs.has(rk)) continue; rs.add(rk); out.push(A(seat, { a: 'play', id, rep: r }, 'play')); } } else out.push(A(seat, { a: 'play', id }, 'play')); } }
  if (hw) { out.push(A(seat, { a: 'skip' }, 'skip')); return out; }
  if (!R.fl.played && !R.fl.hint && !R.fl.nh && P.file.length) out.push(A(seat, { a: 'hint' }, 'hint'));
  for (const [sid, list] of Object.entries(acts)) { const id = +sid; for (const a of list) {
    if (a.k === 'reason') { const sig = 'r' + (id === P.partner ? 'p' : ckey(R, id)); if (seenSig.has(sig)) continue; seenSig.add(sig); out.push(A(seat, { a: 'reason', who: id === P.partner ? 'p' : id }, 'reason')); }
    else if (a.k === 'assist') out.push(A(seat, { a: 'assist' }, 'assist'));
    else if (a.k === 'solve') out.push(A(seat, { a: 'solve' }, 'solve'))
    else if (a.k === 'ab') out.push(A(seat, { a: 'ability', id, i: a.i }, 'ability'));
    else if (a.k === 'actc') { const asig = ckey(R, id); const ts = new Set(); for (const t of a.tg) { const tk_ = ckey(R, t); if (ts.has(tk_)) continue; ts.add(tk_); const sig = 'a' + asig + '>' + tk_; if (seenSig.has(sig)) continue; seenSig.add(sig); out.push(A(seat, { a: 'action', id, k: 'char', tid: t }, 'atkc')); } }
    else if (a.k === 'actk') { const sig = 'k' + ckey(R, id); if (seenSig.has(sig)) continue; seenSig.add(sig); out.push(A(seat, { a: 'action', id, k: 'case' }, 'atkk')); } } }
  out.push(A(seat, { a: 'end' }, 'end')); return out;
}
function genMoves(R, val) { const d = who(R); if (!d) return []; const seat = d.seat;
  if (d.kind === 'mull') return mullMoves(R, seat, val);
  if (d.kind === 'eff') return effMoves(R, seat, val);
  if (d.kind.startsWith('sub:')) return subMoves(R, seat);
  return mainMoves(R, seat); }

function applyMove(R, mv, seed) { return withRng(seed == null ? 1 : seed, () => S.dispatch(R, mv.seat, mv.m)); }

// ── 노드: 복제 가능한 상태는 R 을 직접 가지고, 효과 처리 중 상태는 (복제 가능한 조상 + 행동 경로) 로 표현한다.
// 조상 R 은 절대 변경하지 않는다(항상 복제 후 적용).
class Node {
  constructor(R, anc, path, seedBase) { this.R = R; this.anc = anc; this.path = path; this.seed = seedBase; this._k = null; }
  static root(R, seed = 7) { if (!cloneable(R)) throw new Error('root must be cloneable'); return new Node(R, R, [], seed); }
  get key() { if (this._k == null) this._k = this.R ? stateKey(this.R) : 'P:' + stateKey(this.anc) + '>' + this.path.map(p => p.mv.m.a + JSON.stringify(p.mv.m.v != null ? p.mv.m.v : [p.mv.m.id, p.mv.m.rep, p.mv.m.tid, p.mv.m.ids, p.mv.m.who, p.mv.m.i, p.mv.m.k])).join('/'); return this._k; }
  state() { if (this.R) return this.R; const R = clone(this.anc); for (let i = 0; i < this.path.length; i++) { const e = applyMove(R, this.path[i].mv, this.path[i].seed); if (e) throw new Error('replay failed: ' + e); } return R; }
  // 자식: 복제(또는 리플레이) → 행동 적용. 거부되면 {err}
  child(mv) { const seed = (this.seed * 31 + (this.path.length + 1) * 7 + (mv.m.id | 0) + (mv.m.tid | 0) * 3) >>> 0;
    let R;
    if (this.R) R = clone(this.R); else { R = clone(this.anc); for (const p of this.path) { const e = applyMove(R, p.mv, p.seed); if (e) return { err: 'replay:' + e }; } }
    const err = applyMove(R, mv, seed); if (err) return { err };
    if (cloneable(R)) return { node: new Node(R, R, [], seed) };
    const path = this.R ? [{ mv, seed }] : [...this.path, { mv, seed }], anc = this.R ? this.R : this.anc;
    return { node: new Node(null, anc, path, seed), pending: R }; } // pending: 방금 만든 (복제 불가) 상태 — 즉시 사용하고 버린다
}

module.exports = { S, mulberry32, withRng, clone, cloneable, determinize, who, isMainKind, stateKey, genMoves, applyMove, Node, combos, ckey, NoClone };
