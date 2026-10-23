// WhiteGreenStrategy 의 카드 지식 레이어 — 카드 ID 로 분기하는 코드를 흩뿌리지 않고, "역할/시너지 그룹" 이름으로만 전략이 카드를 다루게 한다.
//   · roles : 카드 효과 구조(ab)에서 자동으로 읽은 기능 (서치/제거/돌격/컷인/변장/미스리드/…). 카드가 바뀌어도 데이터에서 따라간다.
//   · groups: 덱의 시너지 묶음 (이름/특징 기준). v0.1 에서는 "설명(로그)용" 이며 의사결정을 바꾸지 않는다. 사용자 피드백으로 우선순위/보존 규칙이 정해지면 versions/ 에서 이 이름으로 참조한다.
const rb = require('../rulebot.js');

// 시너지 그룹 정의 — 이름(부분일치) 또는 특징(trait) 기준. (확정 덱의 카드 구성에서 읽은 묶음; 순서/우선순위는 아직 정하지 않음)
const GROUPS = {
  suzuki:   { label: '스즈키 재벌',     match: d => /鈴木/.test(d.n) || /鈴木財閥/.test(d.trait || '') },
  kyogoku:  { label: '쿄고쿠 마코토',   match: d => /京極真/.test(d.n) },
  kid:      { label: '괴도 키드 계열',  match: d => /怪盗キッド|黒羽快斗/.test(d.n) },
  heiji:    { label: '핫토리 헤이지',   match: d => /服部平次/.test(d.n) },
  nakamori: { label: '나카모리 경부',   match: d => /中森銀三/.test(d.n) },
  yusaku:   { label: '쿠도 유사쿠',     match: d => /工藤優作/.test(d.n) },
};

function abText(d) { return JSON.stringify(d.ab || []); }
function rolesOf(R, id) {
  let d; try { d = R.defs[R.cards[id].d]; } catch (e) { return []; } if (!d) return [];
  const t = abText(d), out = [];
  if (d.type === 'event') out.push('event');
  if (/"op":"(look|reveal|revealTop|peek)"/.test(t.replace(/\s/g, '')) && /"hand"|"to":"hand"/.test(t.replace(/\s/g, ''))) out.push('search');
  if (rb.removeFilters(d.ab || []).is) out.push('removal');
  if (/"ic":"cutin"/.test(t.replace(/\s/g, '')) || /カットイン|컷인/.test(d.extra || d.fx || '')) out.push('cutin');
  if (/assault|돌격|突撃/.test(String(d.kw || '') + String(d.extra || ''))) out.push('assault');
  if (/disguise|変装|변장/.test(String(d.kw || ''))) out.push('disguise');
  if (/misread|ミスリード|미스리드/.test(String(d.kw || '') + String(d.extra || ''))) out.push('misread');
  if (/"ic":"declare"/.test(t.replace(/\s/g, ''))) out.push('declare');
  if (/"ic":"onplay"/.test(t.replace(/\s/g, ''))) out.push('onplay');
  if (/"op":"stack"|"op":"set/.test(t.replace(/\s/g, ''))) out.push('set');
  return out;
}
function groupsOf(R, id) { let d; try { d = R.defs[R.cards[id].d]; } catch (e) { return []; } if (!d) return []; return Object.entries(GROUPS).filter(([, g]) => g.match(d)).map(([k]) => k); }
const GROUP_LABEL = Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.label]));
const ROLE_LABEL = { search: '서치', removal: '제거', cutin: '컷인', assault: '돌격', disguise: '변장', misread: '미스리드', declare: '선언', onplay: '등장 시', set: '세트/겹침', event: '이벤트' };
function tagsText(R, id) { const r = rolesOf(R, id).map(x => ROLE_LABEL[x] || x), g = groupsOf(R, id).map(x => GROUP_LABEL[x]); return [...r, ...g].join('·'); }
module.exports = { GROUPS, GROUP_LABEL, ROLE_LABEL, rolesOf, groupsOf, tagsText };
