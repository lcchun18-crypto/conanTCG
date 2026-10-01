// ─────────────────────────────────────────────────────────────────────────────
// 예시 전문 봇 프로필 (v1.5.0 Expert Knowledge Layer 항목 사용 예) — '_' 로 시작하므로 등록되지 않습니다.
// 덱: test/fixtures/deck_green.json (녹단 헤이지/카즈하, 사건 id_0666, 파트너 id_P010)
// 등록하려면: node bot/specialists/cli.js add test/fixtures/deck_green.json --id green_heiji --name "녹색 헤이지 Expert"
//             → 만들어진 bot/specialists/green_heiji.js 의 profile 에 아래 내용을 옮기세요.
// 아래 수치는 예시입니다(실전 피드백 → test/expert_cases 회귀 케이스 → 수치 조정 순서로 다듬으세요).
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  id: 'example_green', name: '녹색 헤이지 Expert (예시)', deckFile: '../../test/fixtures/deck_green.json',
  profile: {
    notes: '녹단: 헤이지(돌격)+카즈하 인연으로 공격, 2코 컷인으로 공격 보장, 해결편 제거 이벤트로 리살.',
    archetype: ['green_heiji'],                       // knowledge entry 의 archetype.tags 와 매칭
    roles: { cutin: { hand: 0.4, conserve: 0.3 }, kazuha: { field: 0.5 }, heiji: { field: 0.5, attack: 2 }, removal: { hand: 0.5 } },
    cards: {
      id_0027: { role: 'cutin' }, id_0540: { role: 'cutin' }, id_0974: { role: 'cutin' },
      id_0861: { role: 'heiji' }, id_0404: { role: 'heiji' },
      id_0419: { role: 'kazuha' }, id_0860: { role: 'kazuha' }, id_1083: { role: 'kazuha' },
      id_0427: { role: 'removal' }, id_0117: { role: 'removal' },
    },
    // 이상적인 중간 필드: 헤이지(돌격) + 카즈하(인연 AP+2000), 손패에 컷인 1장(공격의 보장), FILE 6, 증거 3
    formation: { name: '헤이지+카즈하 중반 필드', field: [{ role: 'heiji', n: 1 }, { role: 'kazuha', n: 1 }], hand: [{ role: 'cutin', n: 1 }], file: 6, evidence: 3, weight: 3, completeBonus: 1.5 },
    // 리살 패키지: 해결편 + 헤이지/카즈하 + 손패 제거 이벤트 + 증거 (필요 증거보다 2 적어도 추리·사건 공격으로 채움)
    lethal: { packages: [{ name: '해결편 제거 → 사건 공격 → 해결', field: [{ role: 'heiji' }, { role: 'kazuha' }], hand: [{ role: 'removal' }], file: 6, evidence: 4, solved: true,
      sequence: ['「後ろの女に一言…」(id_0427) 또는 平次の洞察力(id_0117)로 가드할 캐릭터 제거', '服部平次(id_0861, 돌격)로 사건 공격 → 증거 +1', '캐릭터 추리로 증거 채우고 파트너로 사건 해결'], bonus: 2 }] },
    // 초동: 1~2턴에 레벨 2 캐릭터, 3턴 레벨 3~5
    requiredEarlyPlays: [{ turn: 1, type: 'char', lvMax: 2 }, { turn: 2, type: 'char', lvMax: 3 }, { turn: 3, type: 'char' }, { turn: 4, type: 'char' }],
    mulliganKeepGroups: [{ name: '2코 컷인 캐릭터', cards: ['id_0027', 'id_0540', 'id_0974'], min: 1, bonus: 1.0 }],
    curveFailurePenalty: [1.6, 3.0, 2.4, 1.6],
    firstPlayerPlan: { notes: '선공: 4턴째(FILE 7) 7·6 전개, FILE 6 을 남겨 다음 턴 어시스트 8·8·7', fileFloor: { floor: 6, fromTurn: 7 } },
    secondPlayerPlan: { notes: '후공: 상대 첫 캐릭터를 2코 컷인으로 받아내고 FILE 5 진행', fileFloor: { floor: 5, fromTurn: 6 }, partner: { preserveDeduction: 0.3 } },
    knowledge: { entries: [
      { id: 'example-green-keep-formation', title: '헤이지+카즈하+컷인 포메이션을 깨지 않는다', text: '컷인은 공격의 보장(かざも). 포메이션 조각(헤이지·카즈하·2코 컷인)을 잃는 플레이는 신중히.', source: '예시 (deck_green 운영 메모)', env: 'any', date: '2026-10-01', archetype: { tags: ['green_heiji'] }, matchup: 'any', side: 'any', confidence: 0.6,
        effects: { features: { formation: 1.3 }, priors: { formationBreak: 4 } } },
    ] },
  },
};
