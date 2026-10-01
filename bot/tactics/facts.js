// Tactical Layer 공용 사실(facts) 계산: 카드 이름/ID 를 모른다. 엔진 규칙(FILE/증거/컨택트/컷인/MR)과 카드 수치(AP/LP/레벨)만 본다.
// 모든 함수는 상태를 바꾸지 않는다.
'use strict';
const SIM = require('../simulate.js'), EV = require('../evaluate.js'), XP = require('../expert/fx_profile.js');
const { S } = SIM, { FX, D, fcount } = S;
const num = x => +x || 0;

const isMR = (R, id) => !!FX.isMR(R, id);
const lvOf = (R, id) => FX.lvOf(R, id);
const apOf = (R, id) => S.ap(R, id);
const lpOf = (R, id) => Math.max(0, S.lpOf(R, id));
const needOf = (R, s) => EV.need(R, s);
const isChar = (R, id) => D(R, id).type === 'char';
const nm = (R, id) => { try { return D(R, id).n; } catch (e) { return '?'; } };

// 그 캐릭터가 지금(이 상태에서) 할 수 있는 일 (엔진 actsFor 와 같은 조건)
function canReason(R, id) { const c = R.cards[id], t = S.tk(R, id); return c.st === 'a' && (!c.sum || t.rapid) && !FX.hasKwTk(R, id, 'cantreason'); }
function canActChar(R, id) { const c = R.cards[id], t = S.tk(R, id); return c.st === 'a' && (!c.sum || t.rapid || t.asC) && !FX.hasKwTk(R, id, 'cantact'); }
function canActCase(R, id) { const c = R.cards[id], t = S.tk(R, id); return c.st === 'a' && (!c.sum || t.rapid || t.asE) && !FX.hasKwTk(R, id, 'cantact') && !FX.hasKwTk(R, id, 'nocase'); }

// 상대(s)의 가드 가능한 캐릭터 (액티브, 또는 슬립 가드 능력)
function guardersOf(R, s) { return R.P[s].field.filter(id => { const c = R.cards[id]; return (c.st === 'a' || (c.st === 's' && FX.hasKwTk(R, id, 'sleepguard'))) && !FX.hasKwTk(R, id, 'cantguard'); }); }
const activeChars = (R, s) => R.P[s].field.filter(id => R.cards[id].st === 'a');

// 컷인 자원: 손패의 컷인 카드 (MR 은 별도 표시 — 정책상 컷인 비용으로 쓰지 않는다)
function cutValue(R, seat, id, my) {
  const d = D(R, id), t = S.tok(d); if (!(FX.hasCut(R, id) || t.cut > 0)) return 0;
  if (FX.pk(R, 1 - seat, 'nocutin')) return 0; if (!FX.cutOk(R, seat, id, t.cut)) return 0;
  try { return num(FX.cutV(R, seat, id, t.cut, my)); } catch (e) { return num(t.cut) || 1000; }
}
function cutIns(R, seat, my) { const out = []; for (const id of R.P[seat].hand) { const v = cutValue(R, seat, id, my); if (v > 0) out.push({ id, v, mr: isMR(R, id) }); } return out.sort((a, b) => b.v - a.v); }
// MR 을 뺀 "쓸 수 있는" 최대 컷인
const maxCutNoMR = (R, seat, my) => cutIns(R, seat, my).filter(x => !x.mr).reduce((m, x) => Math.max(m, x.v), 0);
const maxCutAny = (R, seat, my) => cutIns(R, seat, my).reduce((m, x) => Math.max(m, x.v), 0);

// 카드 정의에 'solve' 효과(해결편 이행)나 '활성화' 효과가 있는가 (리살 solver 의 상한 계산용; 정의별 캐시)
const fxCache = new WeakMap();
function fxFlags(d) { let f = fxCache.get(d); if (f) return f; const js = (() => { try { return JSON.stringify(d.ab || []); } catch (e) { return ''; } })();
  f = { solve: js.includes('"op":"solve"'), wake: js.includes('"do":"active"') || js.includes('"op":"active"') || js.includes('"op":"wake"'), evid: XP.card(d).any.evid }; fxCache.set(d, f); return f; }

// 사건 해결 조건 (이 턴 즉시 승리의 전제): 해결편 + 액티브 파트너 + 어시스트 안 함 + 해결 불가 효과 없음
function solveState(R, s) {
  const P = R.P[s], pc = R.cards[P.partner], solved = !!R.cards[P.kase].solved;
  const partnerReady = pc.st === 'a' && !P.pIn && !FX.pk(R, s, 'nosolve');
  return { solved, partnerReady, need: needOf(R, s), evid: P.evid.length, fileLen: P.file.length, fc: fcount(R, s), pIn: !!P.pIn };
}
module.exports = { SIM, EV, XP, S, FX, D, fcount, num, isMR, lvOf, apOf, lpOf, needOf, isChar, nm, canReason, canActChar, canActCase, guardersOf, activeChars, cutValue, cutIns, maxCutNoMR, maxCutAny, fxFlags, solveState };
