# Expert Knowledge Base (`bot/knowledge/*.json`)

고수의 판단 기준을 **강제 규칙이 아니라 탐색이 쓰는 숫자**로 넣는 곳입니다. 파일 하나에 `{ "entries": [...] }`.
서버를 다시 시작하면 반영됩니다. `node bot/expert/cli.js kb check` 로 형식을 검사하고, `node bot/expert/cli.js kb list --deck 덱.json --side first` 로 어떤 지식이 적용/제외되는지 확인합니다.

## entry 형식
```json
{
  "id": "kazamona-file-output",                     // 영소문자/숫자/_.-  (중복 불가)
  "title": "FILE 을 많이 남길수록 다음 턴 최대 출력이 커진다",
  "principle": "file-preservation",                 // 분류 태그 (자유)
  "quote": "原文 그대로의 짧은 인용", "text": "한국어 요약",
  "source": { "name": "글 제목", "url": "https://…", "author": "작성자" },   // 또는 문자열
  "env": "第1弾 (2024)",                            // 세트/환경. 게임 구조 원칙이면 "any"
  "envStrict": false,                               // true 면 env 가 env.json 의 current.name 과 같을 때만 적용
  "date": "2024-06-06",                             // 오래될수록 confidence 자동 감소 (env.json)
  "archetype": "any",                               // 또는 { "colors": ["green"], "mono": true, "maxLvMax": 7, "tags": ["green_heiji"], "cards": ["id_0861"] }
  "matchup": "any",                                 // 또는 { "colors": ["blue"], "case": "id_…", "partner": "id_…", "cards": [...], "tags": [...] }
  "side": "any",                                    // "first" | "second" | "any"
  "bots": "any",                                    // 또는 ["pro", "<전문 봇 id>"]
  "confidence": 0.6,                                // 0~1, 효과의 크기에 곱해진다
  "effects": { … }
}
```
* **카드 ID 를 쓰는 지식은 `archetype: "any"` 로 둘 수 없습니다** (예전 환경 특정 덱의 운영법이 모든 덱에 적용되는 것을 막음).
* 범위가 맞지 않는 entry 는 적용되지 않고, 이유가 AI 기록(`knowledge.skipped`)과 `kb list` 에 표시됩니다.
* 오래된 환경: `date` 가 `env.json` 의 `current.date` 보다 `staleAfterMonths`(12) 이상 오래되면 기간마다 `staleFactor`(0.6)를 곱합니다 (최소 0.2). `env: "any"` 는 감소하지 않습니다.

## effects — 탐색의 어느 부분에 들어가는가
| 키 | 들어가는 곳 | 값 |
|---|---|---|
| `features` | **평가 특징**의 크기 (1 = 기본) | `turnsToWin` `evidenceTempo` `boardLeakRisk` `futureCleanupValue` `nextTurnFileRequirement` `lethalFileRequirement` `defensiveFileRequirement` `fileFloor` `assistResidual` `actionEconomy` `formation` `handCurve` (0~4) |
| `priors` | **행동 탐색 순서** (빔 가지치기 전에 먼저 볼 수) | `multiZone` `baitAttack` `lowApReasonFirst` `reasonBeforeHint` `partnerChoice` `preserveDeduction` `formationBreak` `protectFileRoute` (−20~20) |
| `prune` | **소프트 pruning**: 메인 계획 탐색에서 뒤로 미룸 | `hintFileFloor: { "floor": 5 }`, `proHintTiming: true`, `proCharEveryTurn: true` |
| `fileFloor` | FILE 하한 감점 | `{ "floor": 5, "fromTurn": 5 }` |
| `partner` | 파트너 추리 보존 성향 | `{ "preserveDeduction": 0.6 }` |
| `mulligan` | 멀리건 계산 | `requiredEarlyPlays` `mulliganKeepGroups` `curveFailurePenalty` |

여러 entry 가 같은 특징을 말하면 confidence 가중 평균(합이 1 미만이면 그만큼 약하게), prior 는 confidence × 값의 합, prune 은 confidence 합이 0.4 이상일 때 켜집니다.

**탐색이 지식을 이긴다**: 소프트 pruning 으로 미룬 루트 행동은 두 번째 반복 뒤 같은 예산으로 따로 탐색하고, 최선보다 1.5 이상 좋으면 다시 허용합니다 (AI 기록 `overrides`). 확정 승리/패배(±1e6)는 지식과 무관하게 우선합니다.

## 지금 들어 있는 지식
| 파일 | 출처 | 범위 |
|---|---|---|
| `core_user_2026-10.json` | 사용자 제공 고수 판단 원칙 (v1.5.0 요청서) | 모든 봇, env any |
| `pro_v12_rules.json` | 사용자 제공 운영 원칙 (v1.2.0) — 이른 힌트 금지, 매 턴 캐릭터 | 범용 Expert(pro)만, 소프트 pruning |
| `community_s1_2024.json` | かざも「わかった気になれる一般論・知見集」(2024-06-06), どんかファミリー探偵団「基本的な思考と各色の特徴」(2024-05-13) | 모든 덱, 제1탄 환경 → 자동 감소 |
| `green_mono_2025.json` | sumomo「8コス不採用緑単と5ファイル進行について」(2025-04-15) | 녹색 단색 덱 (5FILE 진행은 레벨 7 이하 녹단만) |

## 고수 판단 → 회귀 케이스
지식을 추가/수정했으면 `npm run test:expert` 로 기존 고수 판단(`test/expert_cases/`)을 잃지 않았는지 확인하세요.
새 상황은 `node bot/expert/cli.js case add …` (README 의 "Expert Knowledge Layer" 참고).
