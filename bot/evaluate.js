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
  const d = D(R, id), P = R.P[s]; let v = cardBase(R, id); if (!S.okc(R, s, d, id)) return v * 0.15;
  const lv = FX.lvOf(R, id), f = fcount(R, s), turnsAway = Math.max(0, Math.ceil((lv - f) / 2)); v *= turnsAway === 0 ? 1 : Math.max(0.4, 1 - 0.22 * turnsAway); return v;
}
function charValue(R, s, id, w = W) {
  const c = R.cards[id], d = D(R, id), t = S.tk(R, id), p = profile(d), ap = S.ap(R, id), lp = S.lpOf(R, id);
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
  for (const id of P.field) { const c = R.cards[id]; if (c.st !== 'a') continue; const t = S.tk(R, id); if (c.sum && !t.rapid && !t.asC && !t.asE) continue; const ap = S.ap(R, id);
    let kills = 0; for (const x of O.field) { if (R.cards[x].st !== 'a' && S.ap(R, x) <= ap) kills++; } pot += 0.5 + Math.min(kills, 2) * 0.5 + (O.evid.length ? 0.5 : 0); }
  return pot - oppCut * 0.15;
}
// pol(선택): 전문 봇 정책. { W: 가중치 보정, score(R): "정책 좌석" 입장의 추가 점수 }.  코어는 카드 ID 를 모른다 — 정책이 주는 숫자만 더한다 (반대칭 유지).
function evaluate(R, me, pol) {
  if (R.phase === 'over') return R.winner === me ? WIN : -WIN;
  const o = 1 - me, w = pol && pol.W ? pol.W : W; let v = sideValue(R, me, w) - sideValue(R, o, w);
  v += w.attackPot * (potential(R, me, w) * (R.turn === me ? 1 : 0.5) - potential(R, o, w) * (R.turn === o ? 1 : 0.5));
  if (pol && pol.score) { const a = pol.score(R); if (a) v += me === pol.seat ? a : -a; }
  return v;
}
// 내 턴에 지금 당장 끝낼 수 있는가 (해결편 + 증거 충분 + 파트너 액티브) — 탐색이 이 상태를 "확정 승리 직전"으로 우선 탐색하도록 힌트
function lethalReady(R, s) { const P = R.P[s], pc = R.cards[P.partner]; return !!R.cards[P.kase].solved && !P.pIn && pc.st === 'a' && P.evid.length >= need(R, s); }
module.exports = { evaluate, cardBase, handValue, charValue, profile, need, lethalReady, WIN, W };
