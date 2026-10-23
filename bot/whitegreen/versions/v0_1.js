// WG-AI v0.1 — 첫 버전. 의도적으로 "백녹 덱의 완벽한 플레이법"을 임의로 정하지 않는다.
// 의사결정은 기존 Expert 의 합리적인 공통 판단(bot/rulebot.js: 최고 코스트 전개 → FILE 6 초과 시 힌트 → 선언/제거 효과 → 공격 → 컷인/가드 규칙)을 그대로 따르고,
// 백녹 전용 구조(관측 상태·카드 역할/시너지 그룹·Decision Log·훅)만 먼저 갖춘다. 사용자 피드백이 쌓이면 다음 버전(v0.2…)의 hooks 에 "이 상황에서는 이렇게" 를 누적한다.
//
// hooks: 결정 지점별 개선 슬롯. 각 훅은 ctx(관측 상태 R, 합법 후보 moves, 결정 종류 …)를 받아
//        { mv, rule, why, factors? } (후보 moves 중 하나) 를 돌려주거나 null(= 기본 규칙에 맡김)을 돌려준다. 후보 밖의 수는 절대 낼 수 없다(검사됨).
//   슬롯: mulligan, play(등장 카드/순서), declare(선언·제거 효과 사용), removeTarget, attack, evidence(사건/증거 공격), reason(추리), hint(넥스트 힌트), cutin, guard, eff(그 밖의 효과 선택)
module.exports = {
  id: '0.1', label: 'WG-AI v0.1', date: '2026-10',
  notes: '기반: Expert 규칙 스크립트(rulebot) 그대로. 백녹 전용 훅은 모두 비어 있음(null → 기본 규칙). 카드 역할/그룹은 로그 설명용.',
  hooks: {},
};
