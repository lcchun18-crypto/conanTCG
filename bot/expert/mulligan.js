// Expert 멀리건: "좋은 카드니까 킵"이 아니라, 교체 조합마다 (덱 공개 정보 + 시드 몬테카를로) 첫 몇 턴의 초동 실패(낼 카드가 없어 패스) 확률과
// 그 벌점(curveFailurePenalty), 낸 카드의 곡선 템포(그 턴 FILE 에 가까운 레벨일수록 +), 유지 그룹(mulliganKeepGroups) 충족 확률, 최종 손패 가치를 함께 계산해 기대 점수가 가장 높은 교체를 고른다.
//   requiredEarlyPlays: [{ turn: 내 k번째 턴, type: 'char'|'any', lvMax?, cards?:[키], penalty? }]   (기본: 1~4턴 캐릭터)
//   FILE 은 선공 1,3,5,… / 후공 2,4,6,… (어시스트 +1 로 한 단계 높은 카드도 가능하지만 파트너를 쓰므로 부분 점수 0.75)
'use strict';
const SIM = require('../simulate.js'), EV = require('../evaluate.js');
const { S } = SIM, { FX, D } = S;
const TURN_W = [0.6, 1.0, 0.8, 0.6, 0.5];
const DEFAULT_EARLY = [{ turn: 1, type: 'char' }, { turn: 2, type: 'char' }, { turn: 3, type: 'char' }, { turn: 4, type: 'char' }];   // 4턴째(선공 FILE 7 / 후공 8)까지 — 7·8 코스트가 내려오는 곡선

function normalize(o = {}) {
  const early = (o.requiredEarlyPlays && o.requiredEarlyPlays.length ? o.requiredEarlyPlays : DEFAULT_EARLY).map(x => ({ turn: +x.turn || 1, type: x.type || 'char', lvMax: x.lvMax != null ? +x.lvMax : null, cards: x.cards ? new Set(x.cards) : null, penalty: x.penalty != null ? +x.penalty : null }));
  const pen = o.curveFailurePenalty != null ? o.curveFailurePenalty : +(process.env.MUL_PEN || 6.0);
  const perTurn = k => { const e = early.find(x => x.turn === k); if (e && e.penalty != null) return e.penalty; return Array.isArray(pen) ? (+pen[k - 1] || 0) : pen * (TURN_W[k - 1] != null ? TURN_W[k - 1] : 0.5); };
  const groups = (o.mulliganKeepGroups || []).map(g => ({ name: g.name || '', cards: g.cards ? new Set(g.cards) : null, filter: g.filter || null, min: g.min != null ? +g.min : 1, bonus: g.bonus != null ? +g.bonus : 1, force: !!g.force }));
  return { early, perTurn, groups, T: Math.max(...early.map(x => x.turn)), samples: o.samples || 160, tempo: o.curveTempo != null ? +o.curveTempo : +(process.env.MUL_TEMPO || 1.6), alpha: o.handWeight != null ? +o.handWeight : +(process.env.MUL_ALPHA || 0.35), aversion: o.replaceCost != null ? +o.replaceCost : +(process.env.MUL_AVERSION || 0.3), dead: o.deadCard != null ? +o.deadCard : +(process.env.MUL_DEAD || 0.6) };
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 공통 준비: 카드 정보/FILE 곡선/그룹 판정/시뮬레이터
function prep(R, seat, o) {
  const P = R.P[seat], first = R.first === seat, hand = P.hand.slice(), deck = P.deck.slice(), pl = normalize(o.plan || {});
  const key = id => R.cards[id].d.slice(R.cards[id].d.indexOf(':') + 1);
  const info = new Map(), fileAt = k => first ? 1 + 2 * (k - 1) : 2 * k, capT = fileAt(pl.T) + 1;
  // 카드 가치: 계획 구간(T턴, 어시스트 포함) 안에 낼 수 있는 카드는 그대로, 그 뒤 카드만 할인 (곡선 템포는 시뮬레이션이 따로 계산)
  for (const id of [...hand, ...deck]) { const d = D(R, id), lv = FX.lvOf(R, id), ok = S.okc(R, seat, d, id); let v = EV.cardBase(R, id); if (!ok) v *= 0.15;
    v *= lv <= capT ? 1 : lv <= capT + 1 ? 0.5 : 0.3; if (o.mulValue) v += o.mulValue(R, id) || 0;   // 계획 구간 밖(초반에 죽은 카드)은 크게 할인
    info.set(id, { lv, ch: d.type === 'char', ok, k: key(id), v, type: d.type }); }
  const groupHit = (g, ids) => { let n = 0; for (const id of ids) { const x = info.get(id); if (g.cards && !g.cards.has(x.k)) continue; if (g.filter) { const f = g.filter; if (f.type && x.type !== f.type) continue; if (f.lvMin != null && x.lv < f.lvMin) continue; if (f.lvMax != null && x.lv > f.lvMax) continue; } n++; } return n >= g.min; };
  // 교체 조합 하나의 기대 점수 (시드 몬테카를로): 최종 손패 가치 + 유지 그룹 보너스 − 초동 실패 벌점
  function evalOption(rep, keep, seedKey) {
    const rnd = mulberry32(((o.seed || 7) * 7919 + seedKey * 104729) >>> 0); let tot = 0; const fails = new Array(pl.T + 1).fill(0); let gHit = 0;
    for (let sIdx = 0; sIdx < pl.samples; sIdx++) {
      const pool = deck.concat(rep); for (let i = pool.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      const H = keep.concat(pool.slice(0, rep.length)); let ptr = rep.length, sc = -pl.aversion * rep.length;   // 교체 1장마다 작은 비용(이미 아는 카드 대신 모르는 카드)
      for (const id of H) { const x = info.get(id); sc += pl.alpha * x.v; if (x.lv > capT || !x.ok) sc -= pl.dead; }   // 계획 구간(어시스트 포함) 안에 낼 수 없는 카드 = 초반에 죽은 카드
      for (const g of pl.groups) if (groupHit(g, H)) { sc += g.bonus; gHit++; }
      const cur = H.slice();
      for (let k = 1; k <= pl.T; k++) {
        if (ptr < pool.length) cur.push(pool[ptr++]); ptr += first && k === 1 ? 1 : 2;
        const req = pl.early.find(e => e.turn === k); if (!req) continue;
        const cap = fileAt(k), lim = req.lvMax != null ? Math.min(req.lvMax, cap + 1) : cap + 1; let best = -1, bestLv = -1;
        for (let i = 0; i < cur.length; i++) { const x = info.get(cur[i]); if (!x.ok || (req.type === 'char' && !x.ch) || x.type === 'partner' || x.type === 'case') continue; if (req.cards && !req.cards.has(x.k)) continue; if (x.lv > lim) continue; const score = x.lv <= cap ? x.lv + 10 : x.lv; if (score > bestLv) { bestLv = score; best = i; } }
        if (best < 0) { sc -= pl.perTurn(k); fails[k]++; continue; }
        const x = info.get(cur[best]); if (x.lv > cap) { sc -= pl.perTurn(k) * 0.25; fails[k] += 0.25; }
        sc += pl.tempo * (0.5 + 0.5 * Math.min(1, x.lv / Math.max(1, cap))); cur.splice(best, 1);   // 곡선 템포: 그 턴에 낼 수 있으면 기본 0.5, FILE 에 가까운 레벨일수록 +
      }
      tot += sc;
    }
    return { score: tot / pl.samples, fail: fails.slice(1).map(f => Math.round(f / pl.samples * 1000) / 1000), groups: Math.round(gHit / pl.samples * 100) / 100 };
  }
  return { P, first, hand, deck, pl, info, fileAt, groupHit, evalOption };
}
// 교체할 카드(ids)를 정했을 때의 기대 점수 (expert regression 의 멀리건 후보 비교용)
function scoreOption(R, seat, ids, o = {}) { const X = prep(R, seat, o), set = new Set(ids); let mask = 0; X.hand.forEach((id, i) => { if (set.has(id)) mask |= 1 << i; }); return X.evalOption(X.hand.filter(id => set.has(id)), X.hand.filter(id => !set.has(id)), mask).score; }

// R: 멀리건 단계 상태, seat: 결정 좌석.  o: { plan(normalize 전 객체), mulValue(R,id), forcedKeep:Set(id), forcedReplace:Set(id), seed }
function choose(R, seat, o = {}) {
  const X = prep(R, seat, o), { hand, pl, info, fileAt, groupHit } = X;
  const fKeep = new Set(o.forcedKeep || []), fRep = new Set(o.forcedReplace || []);
  // 강제 유지 그룹(force:true)이 지금 손패에서 충족되면 그 카드들은 교체 후보에서 뺀다
  for (const g of pl.groups) if (g.force && groupHit(g, hand)) for (const id of hand) { const x = info.get(id); if ((!g.cards || g.cards.has(x.k)) && (!g.filter || ((!g.filter.type || x.type === g.filter.type) && (g.filter.lvMin == null || x.lv >= g.filter.lvMin) && (g.filter.lvMax == null || x.lv <= g.filter.lvMax)))) fKeep.add(id); }
  const n = hand.length, res = [];
  for (let mask = 0; mask < (1 << n); mask++) {
    const rep = [], keep = []; let bad = false;
    for (let i = 0; i < n; i++) { const id = hand[i], r = !!(mask & (1 << i)); if (r && fKeep.has(id)) { bad = true; break; } if (!r && fRep.has(id)) { bad = true; break; } (r ? rep : keep).push(id); }
    if (bad) continue;
    const e = X.evalOption(rep, keep, mask); res.push({ rep, ...e });
  }
  if (!res.length) return { ids: [...fRep].filter(id => hand.includes(id)), analysis: null };
  res.sort((a, b) => b.score - a.score || a.rep.length - b.rep.length);
  const keepAll = res.find(r => r.rep.length === 0) || null, best = res[0];
  const nm = id => D(R, id).n;
  return { ids: best.rep, analysis: { plan: pl.early.map(e => ({ turn: e.turn, type: e.type, lvMax: e.lvMax, file: fileAt(e.turn), penalty: Math.round(pl.perTurn(e.turn) * 100) / 100 })),
    chosen: { replace: best.rep.map(nm), score: Math.round(best.score * 100) / 100, curveFailProb: best.fail, groupHit: best.groups },
    keepAll: keepAll && { score: Math.round(keepAll.score * 100) / 100, curveFailProb: keepAll.fail, groupHit: keepAll.groups }, options: res.length } };
}
module.exports = { choose, scoreOption, normalize, DEFAULT_EARLY };
