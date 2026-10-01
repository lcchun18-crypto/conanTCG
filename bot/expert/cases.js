// 훈련용 Decision Regression (expert regression case).
// 케이스 하나 = "이 상황(게임 상태)에서 후보 A / 후보 B 중 고수는 A 를 골랐다(이유 …)".  봇을 고칠 때마다 다시 판단시켜 이미 배운 고수 판단을 잃지 않는지 검사한다.
//
// 케이스 JSON (test/expert_cases/NNN_이름.json) — 사람이 쓰거나 `node bot/expert/cli.js case add` 로 만든다:
//   { name, reason, expert: 'A', candidates: { A: <행동>, B: <행동>, ... }, bot?: 'pro'|<전문 봇 id>, seat?, check?: 'prefer'|'first', margin?, budget?: { maxNodes },
//     source?, date?, tags?, snapshot?: <AI 기록의 snap>, state?: <간이 상태> }
//   · 상태: snapshot(AI 기록 다운로드의 snap 그대로) 또는 state(간이 상태: 존별 카드 ID, FILE/증거는 장수만 써도 됨, 덱 파일 지정 가능)
//   · 행동: describe() 문자열('추리: 파트너', '공격: A → B', '사용: X', '어시스트', '턴 종료', '넥스트 힌트' …) 또는 객체
//     { a:'reason', who:'p'|카드ID } { a:'attack', id:카드ID, tid:카드ID } { a:'case', id } { a:'play', id, rep? } { a:'assist'|'hint'|'end'|'solve'|'skip' } { a:'ability', id, i } { a:'mull', replace:[카드ID…] }
//     또는 짧은 문자열 'reason:p' 'reason:id_0861' 'attack:id_0861>id_0001' 'case:id_0861' 'play:id_0419' 'assist' 'hint' 'end' 'solve'
//   · check 'prefer'(기본): 각 후보로 시작하는 최선 라인을 같은 탐색 예산으로 계산해 expert 후보 값 > 나머지 + margin
//     check 'first': 위 + 봇이 자유롭게 고른 첫 행동이 expert 후보와 같아야 함
// JS 케이스(.js)는 위 필드 + setup(H, ctx) → R 로 상태를 직접 만들 수 있다 (합성 카드). 멀리건·가드/컨택트 같은 메인 밖 결정은 JS 케이스로 (후보 'mull:키,키' / 'guard:키' / 'noguard').
'use strict';
const fs = require('fs'), path = require('path');
const SIM = require('../simulate.js'), EV = require('../evaluate.js'), SN = require('../snapshot.js'), { Searcher } = require('../search.js'), { decide, describe } = require('../decide.js'), MUL = require('./mulligan.js'), EXPL = require('./explain.js');
const { S, genMoves, clone, determinize, who, Node } = SIM, { D } = S;
const keyOf = (R, id) => { const d = R.cards[id] && R.cards[id].d; return d ? d.slice(d.indexOf(':') + 1) : null; };
const val = (R, id) => EV.cardBase(R, id);

// ── 간이 상태(state) → snapshot(v1)
function deckList(spec, DB, base) {
  if (!spec) return null;
  let j = spec; if (typeof spec === 'string') { const fp = path.resolve(base || process.cwd(), spec); j = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  if (Array.isArray(j)) return j.slice();
  if (j.format === 'conan-deck' || j.main) { const out = []; for (const e of j.main || []) { const id = e.id || e[0], n = e.n || e[1] || 1; for (let i = 0; i < n; i++) out.push(id); } return out; }
  if (j.list) return j.list.slice(); return null;
}
function fillerPool(DB, color, exclude) {
  const abN = c => { try { const a = typeof c.ab === 'string' ? JSON.parse(c.ab) : c.ab; return Array.isArray(a) ? a.length : 0; } catch (e) { return 9; } };
  return Object.values(DB).filter(c => c.type === 'char' && !exclude.has(c.id) && String(c.color || '').toLowerCase().split(/[\/,&\s]+/).includes(color)).sort((a, b) => abN(a) - abN(b) || (+a.lv || 0) - (+b.lv || 0) || (a.id < b.id ? -1 : 1)).map(c => c.id);
}
function liteToSnapshot(st, DB, base) {
  const P = st.P.map((p, s) => {
    const k = x => typeof x === 'string' ? x : x.k, kase = typeof p.kase === 'string' ? { k: p.kase, solved: 0 } : { k: p.kase.k, solved: p.kase.solved ? 1 : 0 }, partner = typeof p.partner === 'string' ? { k: p.partner, st: 'a' } : { k: p.partner.k, st: p.partner.st || 'a' };
    const hand = (p.hand || []).map(k), field = (p.field || []).map(f => typeof f === 'string' ? { k: f, st: 'a', sum: 0, mods: {}, sets: [], fd: [], under: [] } : { k: f.k, st: f.st || 'a', sum: f.sum ? 1 : 0, mods: f.mods || {}, sets: f.sets || [], fd: f.fd || [], under: f.under || [] });
    const rem = (p.rem || []).map(k), named = [...hand, ...field.flatMap(f => [f.k, ...f.sets, ...f.fd, ...f.under]), ...rem];
    const evidL = Array.isArray(p.evid) ? p.evid.map(e => typeof e === 'string' ? { k: e, up: 0 } : { k: e.k, up: e.up ? 1 : 0 }) : null, fileL = Array.isArray(p.file) ? p.file.map(k) : null;
    if (evidL) named.push(...evidL.map(e => e.k)); if (fileL) named.push(...fileL);
    // 나머지 카드: 덱 목록이 있으면 거기서, 없으면 같은 색 카드로 채운다 (같은 카드 최대 3장, 메인 40장)
    let pool = deckList(p.deck, DB, base); const cnt = {}; for (const id of named) cnt[id] = (cnt[id] || 0) + 1;
    if (pool) { for (const id of named) { const i = pool.indexOf(id); if (i >= 0) pool.splice(i, 1); } }
    else { const color = String((DB[kase.k] || {}).color || 'red').toLowerCase().split(/[\/,&\s]+/)[0]; pool = []; for (const id of fillerPool(DB, color, new Set(named))) { for (let i = 0; i < 3 && pool.length + named.length < 40; i++) pool.push(id); if (pool.length + named.length >= 40) break; } }
    const take = n => pool.splice(0, n), fileN = fileL ? fileL : take(+p.file || 0), evid = evidL ? evidL : take(+p.evid || 0).map(x => ({ k: x, up: 0 }));
    const deck = pool.splice(0, Math.max(0, 40 - named.length - (fileL ? 0 : fileN.length) - (evidL ? 0 : evid.length)));
    return { hand, field, file: fileN, evid, deck, rem, pa: p.pa || [], partner, pIn: p.pIn ? 1 : 0, tr: 0, kase };
  });
  return { v: 1, n: st.n || 5, turn: st.turn || 0, first: st.first || 0, phase: 'play', fl: st.fl || {}, P };
}
function buildState(c, ctx) {
  if (c.setup) return c.setup(ctx.H, ctx);
  if (c.snapshot) return SN.restore(JSON.parse(JSON.stringify(c.snapshot)), ctx.DB, S);
  if (c.state) return SN.restore(liteToSnapshot(c.state, ctx.DB, ctx.base), ctx.DB, S);
  throw new Error('케이스에 snapshot / state / setup 중 하나가 필요합니다');
}

// ── 후보 행동 기술 → 합법 수 찾기
function parseDesc(x) {
  if (x && typeof x === 'object') return x;
  const s = String(x || '').trim(), m = /^(reason|attack|case|play|ability|assist|hint|end|solve|skip|guard|noguard|pass|cin|mull):?(.*)$/i.exec(s);
  if (!m) return { desc: s };
  const a = m[1].toLowerCase(), r = m[2].trim();
  if (a === 'reason') return { a, who: r || 'p' };
  if (a === 'attack') { const [id, tid] = r.split('>').map(t => t.trim()); return { a, id, tid }; }
  if (a === 'case' || a === 'play' || a === 'cin' || a === 'guard') { const [id, rep] = r.split('/').map(t => t.trim()); return { a, id, rep }; }
  if (a === 'ability') { const [id, i] = r.split('#'); return { a, id: id.trim(), i: +i || 0 }; }
  if (a === 'mull') return { a, replace: r ? r.split(',').map(t => t.trim()).filter(Boolean) : [] };
  return { a };
}
function moveMatches(R, mv, d) {
  if (d.desc) return describe(R, mv) === d.desc;
  const m = mv.m, k = id => id == null ? null : keyOf(R, id), a = d.a;
  switch (a) {
    case 'reason': return mv.tag === 'reason' && (d.who === 'p' ? m.who === 'p' : m.who !== 'p' && k(m.who) === d.who);
    case 'attack': case 'action': return mv.tag === 'atkc' && k(m.id) === d.id && (!d.tid || k(m.tid) === d.tid);
    case 'case': return mv.tag === 'atkk' && k(m.id) === d.id;
    case 'play': return mv.tag === 'play' && k(m.id) === d.id && (!d.rep || k(m.rep) === d.rep);
    case 'ability': return mv.tag === 'ability' && k(m.id) === d.id && (d.i == null || m.i === d.i);
    case 'cin': return mv.tag === 'cin' && k(m.id) === d.id; case 'guard': return mv.tag === 'guard' && k(m.id) === d.id;
    default: return mv.tag === a || m.a === a;
  }
}
function findMove(R, moves, x) { const d = parseDesc(x); return moves.find(mv => moveMatches(R, mv, d)) || null; }

// ── 판정
function judge(R, seat, c, o = {}) {
  const pol = o.policy !== undefined ? o.policy : null, budget = { maxNodes: 6000, ...(c.budget || {}) }, seed = c.seed || 3, d = who(R);
  if (!d || d.seat !== seat) throw new Error(`이 상태의 결정 좌석은 ${d && d.seat} (케이스 seat ${seat})`);
  const keys = Object.keys(c.candidates || {}); if (keys.length < 2) throw new Error('후보가 2개 이상 필요합니다'); if (!keys.includes(c.expert)) throw new Error(`expert "${c.expert}" 가 후보에 없습니다`);
  const out = { values: {}, lines: {}, factors: {}, ok: false, kind: d.kind };
  if (d.kind === 'mull') {   // 멀리건: 교체 조합의 기대 점수(초동 실패 확률 모델)
    for (const k of keys) { const x = parseDesc(c.candidates[k]); const ids = []; const pool = R.P[seat].hand.slice(); for (const key of x.replace || []) { const i = pool.findIndex(id => keyOf(R, id) === key); if (i < 0) throw new Error(`후보 ${k}: 손패에 ${key} 없음`); ids.push(pool.splice(i, 1)[0]); }
      out.values[k] = Math.round(MUL.scoreOption(R, seat, ids, { plan: pol && pol.knowledge ? pol.knowledge.mulligan : {}, mulValue: pol && pol.mulValue }) * 100) / 100; out.lines[k] = '교체: ' + (x.replace || []).join(',') || '없음'; }
  } else {
    const moves = genMoves(R, val), mvs = {}, seqs = {};
    for (const k of keys) { const cand = c.candidates[k], seq = Array.isArray(cand) ? cand : [cand]; seqs[k] = seq.map(parseDesc);
      const mv = findMove(R, moves, seq[0]); if (!mv) throw new Error(`후보 ${k} (${JSON.stringify(seq[0])}) 를 지금 합법 수에서 찾지 못함. 합법 수: ${moves.map(m => describe(R, m)).slice(0, 25).join(' | ')}`); mvs[k] = mv; }
    if (d.kind === 'main') {
      for (const k of keys) { const sr = new Searcher({ seed, policy: pol }); sr.maxNodes = budget.maxNodes; sr.deadline = Infinity; const root = determinize(clone(R), (seed * 2654435761 + R.n * 97) >>> 0), sig = JSON.stringify(mvs[k].m);
        const prefix = [m => JSON.stringify(m.m) === sig, ...seqs[k].slice(1).map(dd => m => moveMatches(R, m, dd))];   // 후보가 배열이면 "앞 몇 행동"을 고정한 라인
        const res = sr.planTurn(root, seat, { prefix, noOverride: true }); if (!res.best) throw new Error(`후보 ${k}: 탐색 결과 없음 (라인의 뒤쪽 행동을 실행할 수 없음?)`);
        if (seqs[k].length > 1 && res.best.line.length < seqs[k].length && !res.best.win) throw new Error(`후보 ${k}: 라인 ${seqs[k].length}수 중 ${res.best.line.length}수만 실행됨`);
        out.values[k] = Math.round(res.best.value * 100) / 100; out.lines[k] = res.best.line.map(l => describe(root, l.mv)).join(' → ');
        if (pol && pol.expert) { try { const ex = EXPL.explain(root, { best: res.best, cands: [res.best] }, pol, seat, describe, { n: 1 }); out.factors[k] = ex.candidates[0] && ex.candidates[0].factors; } catch (e) { /* 설명 실패는 판정과 무관 */ } } }
    } else {   // 미시 결정(가드/컨택트/효과 선택): 각 후보 적용 후 정확 minimax
      const sr = new Searcher({ seed, policy: pol }); sr.maxNodes = budget.maxNodes; const node = Node.root(determinize(clone(R), seed));
      for (const k of keys) { const ch = node.child(mvs[k]); if (ch.err) throw new Error(`후보 ${k}: 엔진 거부 ${ch.err}`); const r = sr.micro(ch.node, ch.pending || ch.node.R, seat, sr.microDepth); out.values[k] = Math.round(r.v * 100) / 100; out.lines[k] = describe(R, mvs[k]); }
    }
    if (c.check === 'first') { const r = decide({ R, seat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: budget.maxNodes, seed, explain: false } }, new Searcher({ seed, policy: pol })); out.chosen = r.mv ? describe(R, r.mv) : null; out.chosenOk = !!r.mv && JSON.stringify(r.mv.m) === JSON.stringify(mvs[c.expert].m); }
  }
  const margin = c.margin || 0, ev = out.values[c.expert]; out.ok = keys.every(k => k === c.expert || ev > out.values[k] + margin) && (c.check !== 'first' || out.chosenOk !== false);
  return out;
}
function loadCases(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.(json|js)$/.test(f) && !f.startsWith('_')).sort().flatMap(f => { const fp = path.join(dir, f); const x = f.endsWith('.json') ? JSON.parse(fs.readFileSync(fp, 'utf8')) : require(fp); return [].concat(x).map((c, i) => ({ file: f + ([].concat(x).length > 1 ? '#' + i : ''), path: fp, c })); });
}
function validateCase(c) {
  const errors = [];
  for (const k of ['name', 'expert', 'candidates']) if (!c[k]) errors.push(`${k} 가 필요합니다`);
  if (!c.reason) errors.push('reason(고수가 그렇게 고른 이유)이 필요합니다');
  if (!c.snapshot && !c.state && !c.setup) errors.push('snapshot / state / setup 중 하나가 필요합니다');
  if (c.check && !['prefer', 'first'].includes(c.check)) errors.push("check: 'prefer' | 'first'");
  return errors;
}
module.exports = { judge, buildState, liteToSnapshot, parseDesc, findMove, moveMatches, loadCases, validateCase, keyOf };
