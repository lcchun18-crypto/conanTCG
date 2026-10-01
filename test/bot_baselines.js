// 테스트 전용 baseline 봇 (제품 코드 아님): 랜덤 합법 봇 / 단순 휴리스틱 봇. 둘 다 엔진이 허용하는 행동만 고른다(genMoves → dispatch).
const SIM = require('../bot/simulate.js');
const { S, genMoves, who } = SIM; const { D } = S;
// 랜덤: 합법 행동 중 균등 무작위
const random = rnd => (R, seat) => { const mv = genMoves(R, () => 0); return mv.length ? mv[rnd() * mv.length | 0] : null; };
// 단순 휴리스틱(한 수 앞도 보지 않음): 사건 해결 > 어시스트(FILE 7 도달) > 가장 AP 높은 캐릭터 사용 > 공격 가능하면 공격 > 추리 > 종료. 방어는 "지면 가드 안 함, 컷인 있으면 사용".
const heuristic = rnd => (R, seat) => {
  const mv = genMoves(R, () => 0), d = who(R), by = t => mv.filter(m => m.tag === t);
  if (!mv.length) return null;
  if (d.kind === 'mull') return mv[0];
  if (d.kind === 'eff') return mv[rnd() * mv.length | 0];
  if (d.kind.startsWith('sub:')) { const c = by('cin'); if (c.length && d.kind === 'sub:contact') return c[0]; const p = by('pass'); if (p.length) return p[0]; const ng = by('noguard'); return ng[0] || mv[0]; }
  if (by('solve').length) return by('solve')[0];
  const plays = by('play').sort((a, b) => (+D(R, b.m.id).ap || 0) - (+D(R, a.m.id).ap || 0)); if (plays.length && !R.fl.played) return plays[0];
  if (d.kind === 'hint') return by('skip')[0] || mv[0];
  const as = by('assist'); if (as.length && S.fcount(R, seat) + 1 >= 7) return as[0];
  const ak = by('atkc').filter(m => S.ap(R, m.m.id) >= S.ap(R, m.m.tid)); if (ak.length) return ak[0];
  const ac = by('atkk'); if (ac.length) return ac[0];
  const rs = by('reason'); if (rs.length) return rs[0];
  return by('end')[0] || mv[0];
};
module.exports = { random, heuristic };
