// 정적 평가함수: 상태 → "seat 입장에서의 유불리" 점수 (반대칭: eval(R,a) == -eval(R,1-a)).
// 카드 이름을 하드코딩하지 않는다. 카드 데이터의 AP/LP/레벨/색/키워드와 효과 JSON(ab)의 "효과 유형"(드로우·제거·증거·버프·세트 …)만 본다.
const { S } = require('./simulate.js');
const { FX, D, fcount, tok } = S;
const WIN = 1e6;
// 튜닝용 가중치 (회귀 테스트로 조정). 단위: "손패 1장의 가치 ≈ 1.0"
const W = {
  ev: 2.2, evOver: 0.35, need: 1.0, solved: 6, file: 0.9, fileOver: 0.15, pIn: 0.4,
  ch: 1.5, chAp: 0.0005, chLp: 0.45, chSleep: 0.55, chStun: 0.25, chSum: 0.85, kwRapid: 0.7, kwBullet: 0.6, kwAssault: 0.4, kwMis: 0.5, kwDis: 0.35, abVal: 0.45,
  hand: 1.0, cut: 0.55, cutAp: 0.00018, ev1: 0.15, playable: 0.25, deckLow: 1.6, rem: 0.04, partnerA: 0.6, lethalNow: 40, lethalSoon: 7, attackPot: 0.35, dangerPot: 0.45, fileLow: 0.0,
};
// ── 카드 정의별 효과 프로필 (캐시)
const cache = new WeakMap();
const FAM = [
  ['adv', /^(draw|fetch|look|peek|revealTop|search|investigate|fileToHand|handTo|play|deckTop)$/, 0.85],
  ['disrupt', /^(rem|remove|rmAll|oppField|oppRem|oppHand|oppFile|sleep|sleepOther|sleepAny|stun|flipEvid|evidDown|loseEvid|oppEvid|discard)$/, 1.0],
  ['evid', /^(gain|evid|evidUp|selfEvid|flipDown|flip)$/, 0.9],
  ['buff', /^(apm|lp|lpBase|lpSelf|kw|kwLose|gab|lv|turnPk)$/, 0.35],
  ['set', /^(set|sets|setsAll|moveSet|stack|under|unstack|setDeck|mv|pa|selfPa|self|selfTo)$/, 0.3],
  ['file', /^(fileTop|fileRem|fileBottomUp|revealFile|fileToHand)$/, 0.3],
  ['solve', /^(solve)$/, 1.5],
];
function walkOps(o, f) { if (Array.isArray(o)) o.forEach(x => walkOps(x, f)); else if (o && typeof o === 'object') { if (typeof o.op === 'string') f(o.op, o); for (const k in o) if (k !== 'op') walkOps(o[k], f); } }
function profile(d) {
  let p = cache.get(d); if (p) return p;
  p = { adv: 0, disrupt: 0, evid: 0, buff: 0, set: 0, file: 0, solve: 0, val: 0, manual: 0, cut: 0, flash: 0, dec: 0, n: 0 };
  for (const a of Array.isArray(d.ab) ? d.ab : []) { p.n++; if (a.ic === 'manual') { p.manual++; continue; } if (a.ic === 'cutin') p.cut += (+a.v || 0); if (a.ic === 'flash') p.flash++; if (a.ic === 'declare') p.dec++;
    walkOps(a.ops, op => { for (const [f, re, w] of FAM) if (re.test(op)) { p[f]++; p.val += w; break; } }); }
  cache.set(d, p); return p;
}
const num = x => +x || 0;
const need = (R, s) => { const k = R.P[s].kase; return num(s === R.first ? D(R, k).lv : D(R, k).lv2); };
// 카드 한 장의 "쓸모" (손패/덱/버림 판단용). 상황 독립적인 기본 가치
function cardBase(R, id) {
  const d = D(R, id), p = profile(d), t = tok(d); let v = 0.6;
  if (d.type === 'char') { v += 0.6 + num(d.ap) * 0.00018 + num(d.lp) * 0.25 + (t.rapid ? 0.5 : 0) + (t.bullet ? 0.4 : 0) + (t.asC || t.asE ? 0.25 : 0) + t.mis * 0.3 + (t.dis ? 0.2 : 0); }
  else v += 0.3;
  v += p.val * 0.35 + (p.cut || t.cut ? 0.4 + (Math.max(p.cut, t.cut) * 0.0002) : 0) + (p.flash ? 0.25 : 0);
  return v;
}
// 이 상태에서 이 손패 카드의 실제 가치 (레벨이 너무 높으면 당장 못 쓰고, 색이 안 맞으면 못 씀)
function handValue(R, s, id) {
  const h = hstat(R, s, id); let v = h.base; if (!h.ok) return v * 0.15;
  const lv = h.lv, f = fcount(R, s), turnsAway = Math.max(0, Math.ceil((lv - f) / 2)); v *= turnsAway === 0 ? 1 : Math.max(0.4, 1 - 0.22 * turnsAway); return v;
}
// 캐릭터 스탯 메모: evaluate() 한 번(같은 상태) 동안만 유효 — AP/LP/키워드는 정적 효과 때문에 계산이 무겁다. 호출 밖에서는 메모하지 않는다(상태가 바뀔 수 있음).
// 스탯 계산은 엔진(server.js)의 ap/lpOf/tk 와 FX.hasKwTk(kwHas) 와 같은 식이며, 정적 효과(FX.stat)를 한 번만 계산해 공유한다 (test/expert_test.js 가 엔진 값과 일치를 검사).
let MEMO = null;
function statOnce(R, id) {
  const c = R.cards[id], d = D(R, id), st = FX.stat(R, id);
  const ap = (c.bAp != null ? c.bAp : (+d.ap || 0)) + (c.apm || 0) + (c.cm || 0) + st.ap, lp = (c.bLp != null ? c.bLp : (+d.lp || 0)) + (c.lpm || 0) + st.lp;
  let kw = (c.blank ? '' : (d.kw || '')) + ' ' + (c.tkw || '') + st.kw; const lose = String(c.lose || '');
  for (const w of lose.split(/\s+/).filter(Boolean)) kw = kw.replace(new RegExp(w + '\\s*[:=]?\\s*\\d*', 'ig'), ' ');
  return { ap, lp, t: tok({ kw }), kws: st.kw + ' ' + (c.tkw || '') + ' ' + (c.ckw || ''), lose, cvW: null, cv: 0 };
}
function cstat(R, id) { if (MEMO && MEMO.R === R) { let x = MEMO.m.get(id); if (!x) { x = statOnce(R, id); MEMO.m.set(id, x); } return x; } return statOnce(R, id); }
const hasKw = (R, id, w) => { const x = cstat(R, id); return x.kws.includes(w) && !x.lose.includes(w); };   // = FX.hasKwTk
// 손패 카드 정보 메모 (사용 가능 색 / 현재 레벨 / 기본 가치)
function hstat(R, s, id) { if (MEMO && MEMO.R === R) { const k = 'h' + id; let x = MEMO.m.get(k); if (!x) { x = { ok: S.okc(R, s, D(R, id), id), lv: FX.lvOf(R, id), base: cardBase(R, id) }; MEMO.m.set(k, x); } return x; } return { ok: S.okc(R, s, D(R, id), id), lv: FX.lvOf(R, id), base: cardBase(R, id) }; }
function memo(R, fn) { if (MEMO && MEMO.R === R) return fn(); const old = MEMO; MEMO = { R, m: new Map() }; try { return fn(); } finally { MEMO = old; } }
function charValue(R, s, id, w = W) {
  const cs = cstat(R, id); if (MEMO && MEMO.R === R && cs.cvW === w) return cs.cv;
  const v = charValue0(R, s, id, w, cs); if (MEMO && MEMO.R === R) { cs.cvW = w; cs.cv = v; } return v;
}
function charValue0(R, s, id, w, cs) {
  const c = R.cards[id], d = D(R, id), t = cs.t, p = profile(d), ap = cs.ap, lp = cs.lp;
  let v = w.ch + ap * w.chAp + lp * w.chLp;
  v += (t.rapid ? w.kwRapid : 0) + (t.bullet ? w.kwBullet : 0) + (t.asC || t.asE ? w.kwAssault : 0) + t.mis * w.kwMis + (t.dis ? w.kwDis : 0) + Math.min(p.val, 3) * w.abVal;
  const st = c.st || 'a'; if (st === 's') v *= (R.turn === s ? 0.75 : 0.78); else if (st === 'x') v *= 0.45; if (c.sum && R.turn === s && !t.rapid) v *= 0.92;
  return v;
}
function sideValue(R, s, w = W) {
  const P = R.P[s], O = R.P[1 - s], nd = need(R, s), ev = P.evid.length, f = fcount(R, s), solved = !!R.cards[P.kase].solved; let v = 0;
  // 승리까지의 거리: 해결편(FILE 7) + 증거(사건 레벨)
  v += w.ev * Math.min(ev, nd) + w.evOver * Math.max(0, ev - nd) + w.file * Math.min(f, 7) + w.fileOver * Math.max(0, f - 7) + (solved ? w.solved : 0);
  const pc = R.cards[P.partner]; v += pc.st === 'a' && !P.pIn ? w.partnerA : 0; v += P.pIn ? w.pIn : 0;
  // 리살 임박 (이미 해결편이면 증거만 모이면 끝)
  if (solved) { const gap = Math.max(0, nd - ev); v += gap === 0 ? w.lethalNow : gap === 1 ? w.lethalSoon * 2 : gap === 2 ? w.lethalSoon : 0; }
  else if (f >= 6 && ev >= nd) v += w.lethalSoon;
  for (const id of P.field) v += charValue(R, s, id, w);
  v += w.hand * 0.0; for (const id of P.hand) v += w.hand * handValue(R, s, id) * 0.62;
  v += P.deck.length < 5 ? -(5 - P.deck.length) * w.deckLow : 0; v += Math.min(P.rem.length, 10) * w.rem;
  return v;
}
// 공격 잠재력: 내 액티브 캐릭터가 상대 슬립 캐릭터/사건을 칠 수 있는 정도 (손패 컷인 포함)
function potential(R, s, w = W) {
  const P = R.P[s], O = R.P[1 - s]; let pot = 0; const oppCut = O.hand.reduce((t, id) => t + Math.max(0, S.FX.hasCut(R, id) || tok(D(R, id)).cut ? 1 : 0), 0);
  for (const id of P.field) { const c = R.cards[id]; if (c.st !== 'a') continue; const cs = cstat(R, id), t = cs.t; if (c.sum && !t.rapid && !t.asC && !t.asE) continue; const ap = cs.ap;
    let kills = 0; for (const x of O.field) { if (R.cards[x].st !== 'a' && cstat(R, x).ap <= ap) kills++; } pot += 0.5 + Math.min(kills, 2) * 0.5 + (O.evid.length ? 0.5 : 0); }
  return pot - oppCut * 0.15;
}
// pol(선택): 전문 봇 정책. { W: 가중치 보정, score(R): "정책 좌석" 입장의 추가 점수 }.  코어는 카드 ID 를 모른다 — 정책이 주는 숫자만 더한다 (반대칭 유지).
function evaluate(R, me, pol) {
  if (R.phase === 'over') return R.winner === me ? WIN : -WIN;
  return memo(R, () => {
    const o = 1 - me, w = pol && pol.W ? pol.W : W; let v = sideValue(R, me, w) - sideValue(R, o, w);
    v += w.attackPot * (potential(R, me, w) * (R.turn === me ? 1 : 0.5) - potential(R, o, w) * (R.turn === o ? 1 : 0.5));
    if (pol && pol.score) { const a = pol.score(R); if (a) v += me === pol.seat ? a : -a; }
    return v;
  });
}
// ── 설명용 분해 (v1.5.0): evaluate() 와 같은 값을 "판단 요소"별로 나눈다.  Σ cat = evaluate(R, me, pol)  (테스트로 검증)
//   cat: evidenceTempo boardValue filePreservation lethalDistance oppLethalThreat actionEconomy formation handQuality other
//   terms: 세부 항목 (예: 'base:oppBoard' = 상대 필드 가치(= 제거 가치의 반대), 'expert:boardLeakRisk' …)
const CATS = ['evidenceTempo', 'boardValue', 'filePreservation', 'lethalDistance', 'oppLethalThreat', 'actionEconomy', 'formation', 'handQuality', 'other'];
function newParts() { const cat = {}; for (const k of CATS) cat[k] = 0; return { cat, terms: {} }; }
function addPart(out, catName, term, v) { if (!v) return; out.cat[catName] = (out.cat[catName] || 0) + v; out.terms[term] = (out.terms[term] || 0) + v; }
function sideParts(R, s, w, sg, out) {
  const P = R.P[s], nd = need(R, s), ev = P.evid.length, f = fcount(R, s), solved = !!R.cards[P.kase].solved, me = sg > 0;
  addPart(out, 'evidenceTempo', me ? 'base:evidence' : 'base:oppEvidence', sg * (w.ev * Math.min(ev, nd) + w.evOver * Math.max(0, ev - nd)));
  addPart(out, 'filePreservation', me ? 'base:file' : 'base:oppFile', sg * (w.file * Math.min(f, 7) + w.fileOver * Math.max(0, f - 7)));
  let le = solved ? w.solved : 0;
  if (solved) { const gap = Math.max(0, nd - ev); le += gap === 0 ? w.lethalNow : gap === 1 ? w.lethalSoon * 2 : gap === 2 ? w.lethalSoon : 0; }
  else if (f >= 6 && ev >= nd) le += w.lethalSoon;
  addPart(out, me ? 'lethalDistance' : 'oppLethalThreat', me ? 'base:lethal' : 'base:oppLethal', sg * le);
  const pc = R.cards[P.partner]; addPart(out, 'other', me ? 'base:partner' : 'base:oppPartner', sg * ((pc.st === 'a' && !P.pIn ? w.partnerA : 0) + (P.pIn ? w.pIn : 0)));
  let b = 0; for (const id of P.field) b += charValue(R, s, id, w); addPart(out, 'boardValue', me ? 'base:myBoard' : 'base:oppBoard(=boardRemovalValue)', sg * b);
  let h = 0; for (const id of P.hand) h += w.hand * handValue(R, s, id) * 0.62; addPart(out, 'handQuality', me ? 'base:hand' : 'base:oppHand', sg * h);
  addPart(out, 'other', me ? 'base:deck/rem' : 'base:oppDeck/rem', sg * ((P.deck.length < 5 ? -(5 - P.deck.length) * w.deckLow : 0) + Math.min(P.rem.length, 10) * w.rem));
}
function evalParts(R, me, pol) {
  const out = newParts();
  if (R.phase === 'over') { addPart(out, R.winner === me ? 'lethalDistance' : 'oppLethalThreat', 'win/loss', R.winner === me ? WIN : -WIN); out.total = R.winner === me ? WIN : -WIN; return out; }
  return memo(R, () => {
    const o = 1 - me, w = pol && pol.W ? pol.W : W;
    sideParts(R, me, w, 1, out); sideParts(R, o, w, -1, out);
    addPart(out, 'boardValue', 'base:attackPotential', w.attackPot * (potential(R, me, w) * (R.turn === me ? 1 : 0.5) - potential(R, o, w) * (R.turn === o ? 1 : 0.5)));
    if (pol && pol.score) {
      const sg = me === pol.seat ? 1 : -1, a = pol.score(R) || 0;
      if (pol.parts) { const pp = pol.parts(R); let sum = 0; for (const x of pp) { addPart(out, x.cat, x.term, sg * x.v); sum += x.v; } if (Math.abs(sum - a) > 1e-9) addPart(out, 'other', 'policy:rounding', sg * (a - sum)); }
      else addPart(out, 'other', 'policy:score', sg * a);
    }
    let t = 0; for (const k of CATS) t += out.cat[k]; out.total = t; return out;
  });
}
// 내 턴에 지금 당장 끝낼 수 있는가 (해결편 + 증거 충분 + 파트너 액티브) — 탐색이 이 상태를 "확정 승리 직전"으로 우선 탐색하도록 힌트
function lethalReady(R, s) { const P = R.P[s], pc = R.cards[P.partner]; return !!R.cards[P.kase].solved && !P.pIn && pc.st === 'a' && P.evid.length >= need(R, s); }
module.exports = { evaluate, evalParts, CATS, cardBase, handValue, charValue, profile, need, lethalReady, cstat, hstat, hasKw, memo, potential, WIN, W };
