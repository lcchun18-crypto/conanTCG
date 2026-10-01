// "PRO" 전략 정책 (v1.2.0): 범용 탐색 엔진(search.js)에 붙는 정책. 카드 ID 를 하드코딩하지 않고, 룰·수치(FILE/증거/레벨/AP/LP)만 본다.
//   policy = { seat, W, score(R), moveBonus(R,mv), ban(R,mv,moves), mulAdjust(R,seat,rep) }   (specialists/policy.js 와 같은 인터페이스 + ban)
// 반영한 운영 원칙 (사용자 제공 9개):
//  1 서 있는(액티브) 캐릭터가 가드하다 죽는 것은 손해 → 액티브 캐릭터 가치↑, 눕는 것과 차이를 둠
//  2/6/7 이른 넥스트 힌트 금지: 선공은 (어시스트 포함) FILE 8, 후공은 9 가 될 때까지 hint 를 탐색에서 제외, 이후에도 힌트 뒤 FILE 6 미만이면 금지
//  3 이미 이기는 공격에 컷인 낭비 금지 → 손패(아드) 가치↑ (결과를 바꾸지 못하는 컷인은 손해)
//  4 상대 캐릭터 + 증거로 사건 해결이 가능한 상태(위험)는 강하게 감점, 내가 그 상태면 가점
//  5 상대 캐릭터 전부 제거 우선 (제거 보너스)
//  8 중반 이후 FILE 6장 이상 유지
//  9 매 턴 캐릭터 1장 이상 등장(가능하면 ban 으로 턴 종료 금지), 멀리건은 FILE 곡선(선공 1,3,5,7 / 후공 2,4,6,8)에 맞춰 매 턴 낼 캐릭터를 확보
//  우선순위: 킬각(탐색이 WIN 을 찾으면 즉시) > 위험 회피 > 파일 유지 > 상대 필드 제거 > 내 캐릭터 5장 > 증거
const SIM = require('./simulate.js'), EV = require('./evaluate.js');
const { S } = SIM, { FX, D, fcount, okc } = S;
const num = x => +x || 0;

const W = { ...EV.W, ch: 2.0, hand: 1.35, chLp: 0.5, solved: 6 };
const K = { lvChar: 0.10, fieldN: 0.45, sleepPenalty: 0.5, oppClear: 3.0, oppOne: 0.6, fileFloor: 1.2, danger: 6, dangerNear: 2.5, myThreat: 5 };

const targetFile = (R, s) => (R.first === s ? 8 : 9);           // 어시스트 포함 FILE 기준 (선공 8 / 후공 9)
const fileEff = (R, s) => fcount(R, s) + (R.P[s].pIn ? 0 : 1);    // 아직 어시스트 안 했다면 어시스트로 +1 가능

// 이 좌석이 다음 턴(또는 이번 턴)에 만들 수 있는 증거 총량 ≈ 증거 + Σ 캐릭터 LP(스턴 제외) + 파트너 LP
function evidPotential(R, s) {
  const P = R.P[s]; let pot = P.evid.length + num(D(R, P.partner).lp);
  for (const id of P.field) { const c = R.cards[id]; if (c.st === 'x') continue; pot += Math.max(1, S.lpOf(R, id)); }
  return pot;
}
const needOf = (R, s) => { const k = R.P[s].kase; return num(s === R.first ? D(R, k).lv : D(R, k).lv2); };

// 한 좌석의 "전략 가산점" (양수 = 그 좌석에 유리). 최종 점수 = adj(me) - adj(opp)
function adj(R, s) {
  const P = R.P[s], O = R.P[1 - s]; let v = 0, n = 0;
  for (const id of P.field) { const c = R.cards[id]; n++; v += K.lvChar * Math.min(9, FX.lvOf(R, id)); if (c.st === 's') v -= K.sleepPenalty; }
  v += K.fieldN * Math.min(n, 5);
  // 8: 중반 이후 FILE 6장 유지
  const f = fcount(R, s); if (R.n >= 7 && f < 6) v -= K.fileFloor * (6 - f);
  // 4: 사건 해결 위협 (증거 + 캐릭터로 해결선에 닿는가). 해결편은 FILE 7(어시스트 포함)이 필요 → FILE 6 이상이면 임박
  const need = needOf(R, s), pot = evidPotential(R, s), solvedSoon = !!R.cards[P.kase].solved || fileEff(R, s) >= 7;
  if (solvedSoon) { if (pot >= need) v += K.myThreat * (R.cards[P.kase].solved ? 1 : 0.7); else if (pot >= need - 1) v += K.myThreat * 0.35; }
  return v;
}
// 5: 상대 필드 정리 보너스는 "상대 캐릭터 수" 에 대한 함수 → 반대칭 유지를 위해 side 별로 계산
function clearBonus(R, s) { const O = R.P[1 - s]; return O.field.length === 0 ? K.oppClear : 0; }

function policy(seat, R0) {
  const pol = { seat, W,
    score(R) {
      const o = 1 - seat; let v = adj(R, seat) - adj(R, o) + clearBonus(R, seat) - clearBonus(R, o);
      v -= 0.0; return v;
    },
    // 탐색 행동 순서(빔 우선순위)
    moveBonus(R, mv) {
      const P = R.P[seat], f = fcount(R, seat);
      switch (mv.tag) {
        case 'play': { const lv = FX.lvOf(R, mv.m.id), d = D(R, mv.m.id); const gap = Math.max(0, f - lv); return (d.type === 'char' ? 8 : 0) + Math.max(0, 6 - gap * 2) + lv * 0.8; }   // 9,8,7 플레이: FILE 에 가까운 높은 레벨부터
        case 'hint': return -60;
        case 'atkc': { const t = R.cards[mv.m.tid]; return t && t.st === 'a' ? -2 : 4; }                                           // 누운(슬립) 캐릭터 우선 공격
        default: return 0;
      } },
    // 합법 수 중 이 정책이 "하지 않는" 행동 — 메인 페이즈 계획 탐색에서만 적용 (반드시 end 는 남긴다)
    ban(R, mv, moves) {
      if (mv.seat !== seat || R.turn !== seat) return false;
      const P = R.P[seat];
      if (mv.tag === 'hint') return fileEff(R, seat) < targetFile(R, seat) || fcount(R, seat) - 1 < 6;       // 2/6/7
      if (mv.tag === 'end') {                                                                                          // 9: 낼 캐릭터가 있으면 이번 턴에 한 장은 낸다
        if (R.fl.played || R.fl.hint || R.fl.hw) return false; if (P.field.length >= FX.fieldMax(R, seat)) return false;
        return moves.some(m => m.tag === 'play' && m.seat === seat && D(R, m.m.id).type === 'char');
      }
      return false;
    },
    // 9: 멀리건 — FILE 곡선에 맞춰 매 턴 낼 수 있는 캐릭터를 확보
    mulAdjust(R, sd, rep) {
      const P = R.P[sd], first = R.first === sd, caps = first ? [1, 3, 5, 7, 9] : [2, 4, 6, 8, 10];
      const chars = P.hand.filter(id => D(R, id).type === 'char' && okc(R, sd, D(R, id), id)).map(id => ({ id, lv: FX.lvOf(R, id), v: EV.cardBase(R, id) }));
      const keep = new Set(), used = new Set();
      for (const cap of caps.slice(0, 4)) {   // 각 턴 슬롯에 "코스트가 맞는(≤cap+1, 가능하면 cap 근처)" 가장 높은 레벨의 캐릭터를 배정
        const c = chars.filter(x => !used.has(x.id) && x.lv <= cap + 1 && x.lv >= cap - 3).sort((a, b) => Math.abs(cap - a.lv) - Math.abs(cap - b.lv) || b.v - a.v)[0];
        if (c) { used.add(c.id); keep.add(c.id); } }
      // 슬롯에 못 들어간 카드 중 가치 높은 저레벨/컷인은 한 두 장 유지 (손패 아드)
      const rest = P.hand.filter(id => !keep.has(id)).map(id => ({ id, lv: FX.lvOf(R, id), v: EV.handValue(R, sd, id) })).filter(x => x.lv <= caps[2] && okc(R, sd, D(R, x.id), x.id)).sort((a, b) => b.v - a.v);
      for (const x of rest) { if (keep.size >= 4) break; if (x.v >= 1.4) keep.add(x.id); }
      if (keep.size === 0) return rep;     // 쓸 만한 게 하나도 없으면 기본 규칙에 맡긴다
      let out = P.hand.filter(id => !keep.has(id)); if (out.length > 4) out = out.sort((a, b) => EV.handValue(R, sd, a) - EV.handValue(R, sd, b)).slice(0, 4);
      return out;
    },
  };
  return pol;
}
module.exports = { policy, W, K, targetFile, fileEff, evidPotential };
