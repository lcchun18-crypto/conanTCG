// ─────────────────────────────────────────────────────────────────────────────
// 전문 봇 템플릿 (이 파일은 '_' 로 시작하므로 등록되지 않습니다).
// 새 전문 봇:  node bot/specialists/cli.js add <덱.json> --id fbi_red --name "적색 FBI Expert"
//   → decks/fbi_red.json (내보낸 덱 JSON 그대로) + fbi_red.js (이 템플릿 기반) 를 만들고, data/cards.json 으로 덱을 검증합니다.
// 아래 항목은 전부 선택입니다. 비워 두면 범용 Expert 와 같습니다. 탐색(search)은 언제나 범용 Expert 의 것을 그대로 씁니다:
// 프로필은 "평가 점수 · 행동 순서 · 멀리건" 만 바꿉니다 (게임 상태를 바꾸거나 행동을 고정하지 않음).
// 점수 단위: 손패 1장의 가치 ≈ 1.0.  평가 가중치 이름은 bot/evaluate.js 의 W 참고.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  id: 'template_id',                // 영소문자/숫자/_
  name: '○색 ○○ Expert',            // UI 에 표시
  desc: '한 줄 설명 (선택)',
  // color: 'red',                  // 생략하면 사건 카드의 색을 카드 DB 에서 읽음
  deckFile: 'decks/template_id.json', // 덱 빌더 "덱 파일 내보내기" JSON 그대로

  profile: {
    notes: '이 덱의 운영 요약 (사람이 읽는 메모)',

    // 평가 가중치 (bot/evaluate.js W 의 키): 이 덱에서 FILE/증거/손패/컷인/리살 가치를 얼마나 크게 볼지
    weights: { /* file: 1.1, ev: 2.4, hand: 1.0, cut: 0.7, lethalNow: 50 */ },
    weightsBy: { first: {}, second: {} },       // 선공/후공일 때의 가중치 보정
    lethal: { /* weight: 1.2 */ },              // lethalNow/lethalSoon 배율

    // 카드 역할 템플릿 (카드마다 role: '이름' 으로 상속). 필드: hand field play attack target keep conserve
    roles: {
      // engine:   { hand: 0.4, field: 0.6, play: 4, keep: 0.6 },
      // finisher: { hand: 0.8, play: 1, conserve: 0.5 },
    },
    // 카드별 값 (id = 카드 DB ID).  hand: 손패에 있을 때 가치 / field: 내 필드에 있을 때 / play: 사용 순서 가산 / attack: 공격자일 때 순서 가산
    // target: 상대 필드에 있을 때 "제거 우선순위" / keep: 멀리건 유지 가산 / mulligan: 'keep'|'replace' 강제 / conserve: 아껴둘 가치(손패 +, 사용 순서 −)
    cards: {
      // 'id_0000': { role: 'engine', target: 3 },
    },
    // 콤보 시너지: 모든 카드가 where(hand|field|any)에 모이면 bonus.  keep:true 면 멀리건에서 한꺼번에 유지
    combos: [
      // { name: '예시 콤보', cards: ['id_0000', 'id_0001'], where: 'any', bonus: 1.5, keep: true },
    ],
    // 사용 순서: first 를 then 보다 먼저 쓰면 행동 탐색 순서에 가산 (탐색이 더 일찍 본다 — 결과 선택은 여전히 탐색이 함)
    sequences: [
      // { first: 'id_0000', then: 'id_0001', bonus: 6 },
    ],
    mulligan: { keep: [], replace: [] },        // 카드 ID 목록
    file: { /* perCard: 0.1, bonusAt: [{ n: 6, bonus: 0.8 }] */ },       // FILE 운영 가치
    evidence: { /* perCard: 0.2 */ },                                      // 증거 운영 가치
    hand: { /* perCard: 0.05 */ },                                         // 손패 장수 가치
    conserve: { /* cutin: 0.3, cutinPlay: -4 */ },                         // 컷인 카드 보존 (손패 가산 / 사용 순서 감점)
    actions: { /* assist: 2, reason: 1, hint: -1, end: -2 */ },            // 행동 종류별 순서 가산 (play atkc atkk reason assist solve hint skip end ability)
    limit: 12,                                                              // 정책 추가 점수의 상한 (승/패 확정 점수는 영향 받지 않음)

    // 매치업 보정: 상대 덱이 조건에 맞으면 해당 항목을 덮어씀/추가
    matchups: [
      // { name: 'vs 청 OO', vs: { case: 'id_0000' /* 또는 cards:[..], allCards:[..], partner, color:'blue' */ }, weights: {}, cards: {}, combos: [] },
    ],

    // 훅: 게임 상태를 "읽기 전용 view" 로만 받아 "숫자"만 돌려줍니다 (상태 변경 불가). 예외/비정상 값은 0 처리, 상한 적용.
    //   view.hand(s) field(s) fileCount(s) evidCount(s) evidNeed(s) solved(s) deckCount(s) deckKeys(s) removed(s) count(key,zone,s) def(key) isFirst() myTurn() turnNo()
    hooks: {
      // score: v => (v.fileCount() >= 5 && v.count('id_0000', 'hand') ? 1.5 : 0),
      // move: (v, mv) => (mv.tag === 'play' && mv.key === 'id_0000' ? 5 : 0),       // mv = { tag, key, targetKey }
      // mulligan: (v, repKeys) => repKeys,                                           // 교체할 카드 키 배열을 돌려줌
    },
  },
};
