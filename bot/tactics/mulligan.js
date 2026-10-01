// 범용 Expert 규칙 멀리건 (사용자 지정): 시작 손패에서 남길 카드는 "2코스트 캐릭터 1장 + 4코스트 캐릭터 1장 + MR 1장" 뿐, 나머지는 전부 교체.
//   예외: 2코스트 캐릭터 2장 + 4코스트 0장 + MR 1장 → 2코스트 2장 + MR 을 남긴다 (4코가 없다고 두 번째 2코까지 버리지 않는다).
// 카드 ID 를 하드코딩하지 않는다: 카드 데이터의 type / 레벨(코스트) / MR 여부(ic:'mr')와 내 사건 색(okc)만 본다.
//   코스트 = 카드 레벨(FX.lvOf). MR 이면서 레벨이 2/4 인 카드는 "MR" 로만 센다(MR 슬롯 1장).
'use strict';
const F = require('./facts.js');
const { EV, S, D } = F;
const CFG = { lvLow: 2, lvMid: 4 };

function classify(R, seat, id) {
  const d = D(R, id), ok = S.okc(R, seat, d, id), lv = F.lvOf(R, id), mr = F.isMR(R, id);
  return { id, name: d.n, type: d.type, lv, ok, mr, char: d.type === 'char', v: EV.cardBase(R, id) };
}
// → { replace:[id…], keep:[id…], plan:'basic'|'two-twos'|…, groups:{…}, why:[…] }
function choose(R, seat, cfg = {}) {
  const lo = cfg.lvLow || CFG.lvLow, mid = cfg.lvMid || CFG.lvMid, P = R.P[seat], cs = P.hand.map(id => classify(R, seat, id));
  const best = a => a.slice().sort((x, y) => y.v - x.v)[0];
  const twos = cs.filter(c => c.char && c.ok && !c.mr && c.lv === lo), fours = cs.filter(c => c.char && c.ok && !c.mr && c.lv === mid), mrs = cs.filter(c => c.mr && c.ok);
  const keep = [], why = []; let plan = 'basic';
  if (twos.length >= 2 && fours.length === 0 && mrs.length >= 1) { plan = 'two-twos';
    const t = twos.slice().sort((a, b) => b.v - a.v).slice(0, 2); keep.push(...t, best(mrs)); why.push(`예외: ${lo}코스트 캐릭터 ${twos.length}장 + ${mid}코스트 0장 + MR → ${lo}코 2장 + MR 유지`); }
  else {
    if (twos.length) { keep.push(best(twos)); why.push(`${lo}코스트 캐릭터 1장 유지: ${best(twos).name}`); } else why.push(`${lo}코스트 캐릭터 없음`);
    if (fours.length) { keep.push(best(fours)); why.push(`${mid}코스트 캐릭터 1장 유지: ${best(fours).name}`); } else why.push(`${mid}코스트 캐릭터 없음`);
    if (mrs.length) { keep.push(best(mrs)); why.push(`MR 1장 유지: ${best(mrs).name}`); } else why.push('MR 없음');
  }
  const kset = new Set(keep.map(c => c.id)), replace = P.hand.filter(id => !kset.has(id));
  return { replace, keep: keep.map(c => c.id), plan, why, hand: cs.map(c => ({ name: c.name, lv: c.lv, type: c.type, mr: c.mr, ok: c.ok, keep: kset.has(c.id) })) };
}
module.exports = { choose, classify, CFG };
