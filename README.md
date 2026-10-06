# 명탐정 코난 TCG 시뮬레이터

## 🗂 v1.8.6 — FILE 표시 수정 + 개별 색 지정
- FILE 개수 라벨이 파트너 카드에 가려지던 문제 수정(라벨 z-index 상향)
- 카드 이동 애니메이션이 끝나면 카드의 z-index 를 비워 버려, 파트너가 FILE 카드 뒤로 가려지던 문제 수정(원래 값 복원)
- OCR 로 애매한 카드 색은 `data/color_overrides.json` 에 개별 지정(`{"id_0548":"white","id_0930":"blue/black"}`) — cards.json 을 다시 만들어도 유지. id_0548 백색, id_0930 청색/흑색 사건

## 🔎 v1.8.5 — 상세 패널 레벨 변화 표시
- 카드 상세 패널의 Lv 칩에도 효과로 인한 레벨 변화를 표시(예: `Lv 4 (-1)`, AP/증거 칩과 동일한 방식). 필드 카드의 `Lv ▼1` 배지는 v1.8.2 부터
- 실제 카드(id_0806) 선언 → 서버 뷰 `lvx` 검증 테스트 `test/lv_view_test.js`

## 🎯 v1.8.4 — 대상 미지정 = 아군만
- 카드 텍스트에 [상대] 같은 지정이 없는 대상(선택·비용·조건)은 **아군(자신)만** 대상이 됨 (기본 own = self). `own:'opp'`(상대) / `own:'any'`(양쪽)로 명시된 것은 그대로
- “모든 캐릭터” 류 3장(id_0438 / 0721 / 0931)은 양쪽(any)을 명시해 유지
- 옛 동작이 필요하면 환경변수 `CONAN_DEFAULT_OWN=any` (옛 카드 시나리오 테스트가 이 값으로 실행됨). 새 규칙 테스트: `npm run test:own`
- ⚠ v1.11.0 에서 이 "기본값"은 **굵은 발동 조건/코스트에만** 적용되도록 문맥별로 분리됐습니다 (아래 v1.11.0 참고). 실제 효과 대상은 데이터의 `own` 이 정합니다.

## 🚫 v1.8.3 — 효과 무효 수정/표시, 로비 오류 메시지
- 효과 무효(`blankAb`) 대상이 현장을 떠날 때 【현장 리무브 시】 등 원래 능력이 발동하던 문제 수정(떠나는 순간 무효 표시가 풀리던 것이 원인). MR 도 무효 처리
- 효과 무효 대상 카드에 `효과 무효` 띠 + 점선 테두리, 상세 패널에 chip 표시
- 게임 중 오류 메시지가 로비에 남던 문제 수정(게임 오류는 게임 화면에만, 로비로 나가면 초기화)

## ✨ v1.8.2 — 봇 효과 적극 사용 + 능력치 변화 표시
- 봇: 등장 시·선언 효과는 쓸 수 있으면 사용(필드 → 파트너 → 그 밖의 선언 능력), 선택 가능한 효과는 최대로 사용. 상대를 고르는 효과는 가능한 가장 높은 코스트(레벨, 같으면 AP) 캐릭터. 같은 코스트 카드가 여럿이면 상대 필드를 제거하는 카드를 먼저 사용. 현장 상한이 줄어든 상태에서의 스위치 보충
- UI: 효과로 AP/LP/레벨이 오르거나 내려간 캐릭터에 ▲/▼ 변화량 배지 + 초록(상승)/빨강(하락) 빛

## 🖱 v1.8.1 — 효과 처리를 플레이 화면에서
- 효과 처리 중 카드 이미지 + 이름 + ID + 질문 + 적용 중인 효과는 **오른쪽 패널**(클릭 불가)에 표시. 보드를 어둡게 덮지 않음
- 대상 선택(`pick`)은 팝업이 아니라 **현장/손패의 카드를 직접 클릭**(빛나는 카드). 최대 1장이면 클릭 즉시 처리, 여러 장이면 클릭 후 [확정]. 화면에 없는 카드(공개된 덱 카드 등)만 임시 트레이에 표시. 증거 선택은 증거 더미 클릭(또는 트레이)
- [효과 창 다시 열기]/[필드 보기] 토글 제거
- 어시스트한 파트너가 FILE 카드 뒤로 가려지던 문제 수정(맨 앞)

## 🤖 v1.8.0 — 규칙 스크립트 AI
AI 는 이전 탐색/평가 방식을 버리고 아래 규칙만 따른다 (`bot/rulebot.js`, 엔진이 허용하는 합법 후보 중에서만 선택).
1. 손패 최고 코스트(레벨) 카드: 어시스트로 낼 수 있으면 어시스트 후 사용, 직접 낼 수 있으면 사용 후 파트너 추리 → 2번
2. FILE(파트너 제외) > 6 → 넥스트 힌트 후 1번 반복, ≤ 6 → 3번
3. 필드 캐릭터: 능력 사용 가능하면 사용, 아니면 액션 준비. 상대 액티브 중 AP 가 더 높은 캐릭터가 있으면 행동 안 함
4. 슬립 상대 캐릭터(AP 같거나 낮음) 우선 → 없으면 상대 증거(사건 액션) → 상대 증거 없으면 추리 (LP 0 이면 세워 둠)
5. 컷인: 상대가 컷인했을 때만, 내 AP 가 상대 이상이 되도록. 이미 같거나 높으면 안 함
6. 방어: 가드 중에는 컷인 안 함, 상대 공격 AP 보다 높은 액티브 캐릭터가 있으면 항상 가드
7. 리살이 보이면 즉시 선택 (`bot/tactics/lethal.js`)
멀리건/효과 선택창 등 규칙에 없는 결정은 단순 기본값. 이전 엔진은 `BOT_ENGINE=expert` 로 사용 가능. 테스트: `npm run test:rulebot`.

## 🔌 v1.5.1 — WebSocket 연결 복구

- 모든 전송은 `S()` 한 곳을 거치며 소켓이 `OPEN` 일 때만 `send` 합니다. 끊겨 있으면 예외 없이 무시하고 화면 위쪽에 상태만 표시합니다 (`서버 연결 중...` / `연결이 끊어졌습니다. 재연결 중...` / `서버에 다시 연결되었습니다.`).
- `onclose`/`onerror` → 단일 타이머(0.5초부터 1.6배씩, 최대 8초)로 재연결. 9초 안에 열리지 않으면(Render 가 깨어나는 중) 포기하고 다시 시도합니다. 온라인 복귀·탭 활성화 때는 즉시 한 번 시도합니다.
- 이벤트 핸들러는 자기 소켓이 현재 소켓일 때만 동작합니다 (죽은 소켓 참조 없음).
- 방에 들어가면 서버가 `{code, seat, token}` 을 주고, 끊긴 뒤 같은 자리로 `resume` 합니다. 서버는 `RECONNECT_GRACE_MS`(기본 60000, 0 이면 예전처럼 즉시 종료) 동안 기다린 뒤에야 "상대가 나가서 종료" 처리합니다. 서버가 재시작되어 방이 사라졌으면 이유를 안내하고 로비로 돌아갑니다.
- 서버 heartbeat ping 은 `OPEN` 인 소켓에만 보냅니다. 테스트: `npm run test:ws`.

## 실행
    npm install
    npm start            # http://localhost:3000
    npm test             # 룰/효과 엔진 테스트 (단위 + 무작위 대전)

## 배포 (Render 등)
폴더 전체(server.js, fx.js, index.html, package.json)를 올리고 Build: `npm install`, Start: `npm start`.

## 카드 DB 만들기
    pip install anthropic pillow
    export ANTHROPIC_API_KEY=...
    python import_cards.py ./card_images --out conan-db.json --limit 20   # 시험
    python import_cards.py ./card_images --out conan-db.json              # 전체
`conan-db.review.csv` 의 카드는 사람이 확인하세요. 결과 JSON은 시뮬레이터 📚 카드/덱 관리 → 가져오기.

- 오류는 잘리지 않고 전문이 출력되며 `conan-db.errors.log` 에도 저장됩니다.
- `--dry-run` : API를 호출하지 않고 보낼 요청의 형태만 확인합니다.
- Sonnet 5.5 등은 `tool_choice` 의 강제 호출(tool/any)을 400 으로 거부하므로 `auto` 를 사용합니다. thinking 옵션은 보내지 않습니다.
- 같은 오류(400/401/403/404)로 성공 없이 연속 실패하면 남은 카드를 건너뛰고 첫 오류 전문을 보여줍니다.
- 이전 버전 캐시(v1, v2)는 사용하지 않습니다(캐시 v3).
- 테스트: `python test/importer_test.py` (모의 API 서버로 실제 HTTP 요청 형식을 검증)

## 효과 처리 방식
- 카드 효과는 `ab`(효과 데이터)로 저장되고 서버(`fx.js`)가 실행합니다. 선택이 필요하면 화면에 선택 패널이 뜹니다.
- v1.1.0부터 DB의 모든 효과 카드가 자동 처리됩니다(전체 1,251장 중 효과 카드 1,143장 = 100%). 게임 중 '수동 효과/효과 도구/직접 처리' 기능은 없습니다.
- 변환기가 이해 못 하는 문장이 새 세트에서 생기면 `manual` 로 표시되고 리뷰 목록(`.review.csv`/`.manual.txt`)에 나옵니다. 그 카드는 `ext_*.py`(카드별 구조화 데이터) / `fx_ext_*.js`(공통 프리미티브)에 추가한 뒤 재변환하세요(아래 'v1.1.0' 참고).
- 카드 편집 화면에서 `효과 데이터(JSON)`를 직접 고칠 수 있습니다. 목록의 ✅=자동, △=일부 수동(변환기 미지원), ⚠=효과 데이터 없음.

## 효과 자동화 개선 (v4)

### 새로 자동 처리되는 효과 (fx.js)
| 패턴 | 데이터(DSL) |
|---|---|
| 넥스트 힌트로 사용한 카드 레벨 이하 캐릭터 선택 | `ic:"onhint"` + 필터 `lvMax:"used"` |
| 컨택트로 상대 캐릭터를 리무브했을 때 | `ic:"onkill"` |
| 슬립 상태로 등장 | `ic:"enter", st:"s"` |
| 능력/효과로 (조건에 맞는) 캐릭터가 등장했을 때 → 그 캐릭터에 처리 | `ic:"onally"` + `on.by:"effect"` + `ef:{필터}` + `op:"ent"` |
| Lv3 이상 캐릭터의 능력 / Lv3 이상 이벤트의 효과로 등장한 경우만 발동 | `cond.via:[{type:"char",lvMin:3},{type:"event",lvMin:3}]` |
| 「카드명 [X]를 등장시킨 경우」 | `op:"if", c:"played", name:"X"` |
| 유대(絆): 상대의 능력·효과로 선택되지 않음 | `static` + `kw:"untarget"` (+ `cond.bond`) |
| 슬립이면 상대가 내 Lv≤N 캐릭터를 지정해 액션할 수 없음 | `static` + `kw:"noact"` + `cond.selfSt:"s"` |
| 손패에 있는 동안 레벨 변경 (양쪽 현장 N장 이상이면 Lv4) | `ic:"hand"` + `cond.fieldMin` + `lv` |
| 카드명 X가 나올 때까지 덱을 공개 → 손패, 나머지 덱 아래 + 셔플 | `op:"reveal"` |
| 이벤트를 캐릭터에 세트 / 세트된 캐릭터가 능력을 얻음 | `op:"set"` + `ic:"grant", g:{능력}` (캐릭터가 떠나면 세트 카드는 리무브 에리어로) |

### 임포터 새 기능
* `--effects-only [기존.json]` : 이미지 인식(1단계)을 **다시 하지 않고** 저장된 원문(일/한)·이미지 파일(CardImage)로 효과 JSON(2단계, 텍스트만 전송)만 재생성. 인자를 생략하면 `--out` 파일을 읽어 갱신(덮어쓰기 전에 `*.before-effects.json` 백업). 색 판별도 저장된 썸네일로 다시 수행.
* `--effects-only --rules-only` : API도 키도 없이, 규칙 변환기(`effect_rules.py`)만 다시 적용(무료·즉시).
* 2단계 캐시 키에 **SPEC·스키마·모델·카드 텍스트의 해시**를 넣었습니다 → 프롬프트를 고치면 예전 결과를 자동으로 재사용하지 않습니다.
* `effect_rules.py` : 모델이 manual 로 남긴 정형 문장(숫자/카드명/특징/색만 바뀌는 문형)을 결정적으로 구조화. 하나라도 모르는 문장이 섞이면 손대지 않고 manual 유지.
* `--sample N [--seed S]` : 폴더 전체에서 무작위 N장(색 검증 표본용). 같은 `--seed` 는 같은 표본.
* 색 판별: **좌상단 레벨 배지**를 우선 사용(금박·노란 테두리 장식에 영향 없음). 배지로 못 정하면 테두리를 '참고'로만 쓰고 확정 불일치로 표시하지 않음.
* 실행이 끝나면 `<out>.manual.txt` 에 남은 manual 카드와 문장 **유형별 빈도**가 나옵니다 → 많은 유형부터 규칙/엔진에 추가하면 자동 비율이 가장 빨리 오릅니다.

## 효과 자동화 개선 (v5 — 실제 무작위 100장 기준)
`test/fixtures/sample100.json`(사용자가 돌린 실제 100장, 효과 92장)에서 **완전 자동 22장 → 92장**. 카드 ID 하드코딩 없이 문형(숫자·이름·특징·색·레벨이 바뀌어도 동작)으로 규칙화했고, `fx.js`/`server.js`/스키마도 함께 확장했습니다.

| 빈도 | 문장 | 데이터(DSL) |
|---|---|---|
| 6+ | 「この事件が解決編になったとき、自分は手札をN枚リムーブする」 | `ic:"onsolve"` (+ 사건 카드의 【解決編】【宣言】…: `cond.cstate:"solve"`, 비용 `flipEvid`) |
| 3 | 【MR能力】相手ターン中に現場を離れる場合、パートナーエリアに移動する | `ic:"mr"` — 상대 턴에 어떤 경로로 떠나도 파트너 에리어(현장→pa), `pa` 능력은 파트너 에리어에서도 동작 |
| 3 | 自分の現場にMRが登場する場合、リムーブする | 같은 `mr` — 등장(등장/변장/효과 등장) 시 기존 MR 을 현장·파트너 에리어에서 리무브 |
| 그 외 | 대체 효과(代わりに)、메인 페이즈 시작 시、다른 아군 리무브/컨택트/킬 시、리무브 에리어에서 떠날 때、증거 뒤집기/【!ヒラメキ】、세트(뒷면)·겹치기(스택)·상대가 고르는 비용 카드、가위바위보、다중 선택(N개까지)、捜査/발견、덱 위 공개 분기、FILE 위 카드、痕跡、레벨/AP 조건(FILE 수·비용 레벨)、특징/이름 any-of、증거 隠滅 승리 대체 … | `replace, onmain, onallyremoved, onallykill, onallycontact, onremleave, flip, flashFlipped, unset, setDeck, stack, pickPaid, rps, chooseMulti, investigate, revealTop, revealHand, revealFile, fetch, fileToHand, ifc, optcost, winalt, traitAll, nohint …` (전체 목록은 `import_cards.py` SPEC 의 “추가 형식”) |

* 변환기: `effect_rules.compile_card(원문, 종류, kw, 모델결과)` — **원문 줄이 진실의 원천**입니다. 줄마다 규칙 변환 → 못 바꾼 줄만 모델 결과(같은 원문 줄) → 그래도 없으면 `manual`. 모르는 문장이 섞이면 추측하지 않고 manual 로 남깁니다.
* 클라이언트: 다중 선택(`optm`)·텍스트 입력(`text`)·파트너 에리어 행·부여된 【宣言】 능력·표/뒷면 증거·痕跡 표시 추가.
* 색 판별: 배지 색 분포에서 1위가 압도적이면(60% 또는 2위의 1.5배) 배지로 확정, 애매하면 표시하지 않음(모델 색이 배지 상위 2색에 있으면 테두리 오탐 플래그 없음). 진짜 불일치는 그대로 표시.
* 주의: 규칙은 이 100장(+앞선 20장)에서 나온 문형입니다. “엔진 기준 자동”은 sanitizer 통과 + 문형별 동작 테스트(66개)를 뜻하며, 카드 한 장 한 장의 의미 검증은 아닙니다. 나머지 카드에서는 새 문형이 나올 수 있으니 `--sample N --rules-only` 후 `<out>.manual.txt` 의 빈도표를 보고 추가하세요.

### 테스트 (v5)
`npm test` = 단위 17 + SPEC 예시 8 + 패턴 26(20장) + **패턴 66(sample100, `test/patterns100.js`)** + fuzz(새 효과·파트너 에리어·세트/스택 카드 보존 검사 포함) / `npm run test:importer` (28) / `npm run report:fixture` (20장·100장 개선 전후).

### 테스트
`npm test` (단위 17 + SPEC 예시 + **패턴 26**(실제 20장 카드 데이터로 각 효과 동작 검증) + fuzz) / `npm run test:importer` (21) / `npm run report:fixture` (20장 개선 전후 리포트) / `node test/check_db.js 내DB.json` (엔진 기준 자동/manual 판정).

## v6 (화면 + 카드 종류 판정)
- **LP / FILE 표시**: 내 영역·상대 영역 모두 카드 뒷면을 겹쳐 쌓은 더미 + `LP N` / `FILE N` 라벨 (LP = 캐릭터가 추리로 얻은 증거 수). 서버 뷰가 바뀔 때마다 즉시 갱신.
- **배치**: 손패 | `FILE | 사건 | 파트너` (사건이 파트너 바로 왼쪽), LP 더미는 필드 왼쪽. 좁은 화면에서는 줄바꿈되며 겹치지 않음.
- **카드 종류(char/event/case/partner) 판정** (`import_cards.py`): `classify_type(obs, geom_landscape)` 는 효과 텍스트를 인자로 받지 않으므로 `パートナー` 등의 단어가 type 에 영향을 줄 수 없다. 모델은 `observed`(가로 레이아웃, 레벨 배지, AP, LP, 先後 표기, 인쇄된 종류 표기)를 보고하고, `decide_type` 이 근거로 확정한 뒤 `declared_type`, `type_basis` 로 근거를 남긴다. 모델 판정과 다르면 review.csv 에 '종류 보정' 으로 표시. 예전 캐시도 API 재호출 없이 재판정된다.
- 엔진 신규: `moveSet`(裏向き 세트를 다른 캐릭터로 이동), `choose`(以下から1つ選んで行う), `unset` 비용의 `fd`.
- 테스트: `npm run test:ui` (Playwright, 실제 브라우저).

## v7 (OPTCG SIM 스타일 화면 구조)
- 왼쪽 아래 = 손패(많으면 자동으로 겹침), 왼쪽 = 사건(위) + 증거 더미(아래, 뒷면이 위쪽으로 비치는 반대 방향), 중앙 아래 = FILE, 중앙 = 파트너 + 필드, 상대는 위쪽에 대칭. UI 명칭은 LP 대신 **증거** (= 추리로 얻은 증거 카드 수).
- 오른쪽 위 = 마우스를 올린 카드의 큰 이미지(손패/필드/상대 필드/파트너/사건 모두), 오른쪽 아래 = 선택한 카드의 행동 버튼. 다시 클릭/빈 곳 클릭/턴 종료 시 선택 해제.
- 행동 버튼의 근거는 서버가 계산하는 `view.acts` (`server.js actsFor`, 능력은 `FX.declareCheck`): 추리 / 어시스트 / 사건 해결 / 액션(캐릭터·사건) / 【宣言】 능력 중 지금 실제로 가능한 것만 나온다. `test/acts_test.js` 가 표시 ↔ 서버 거부를 대조한다.
- 손패 카드 클릭 = 사용(기존과 동일), 효과 선택창/덱 확인창은 보드 중앙 오버레이.

## v11: 전체 DB 규칙 파서 확장 (API/OCR 재호출 없음)
- `python3 import_cards.py --effects-only conan-db-full.json --rules-only` 로 저장된 fx 텍스트만 재파싱. 전체 1251장 / 효과 1143장 → 완전 자동 773장(67.6%), manual 370장 (기존 499장).
- 신규 ic: disguise, deckfree, ontrig(범용 이벤트 버스), usecond, ignorecolor. 정화기(cleanAb 등)에 반영되지 않은 필드는 조용히 사라지므로 `node test/roundtrip.js <db.json>` 로 손실 0 을 확인할 것.
- 테스트: `npm test` (patterns_v11 포함), `python3 test/importer_test.py` (full_samples 골든), `node test/roundtrip.js`.
- 의도적으로 manual 유지: 선택 강제(必ず選ぶ/ガード), "選ばれたとき", 증거 획득 차단(순서 민감), 전역 규칙 변경(id_0407), 스리플 ⑦/콘택트 발생, 복합 look/공개/검색.

## Turn 12 — 공통 primitive 확장 (manual 370 → 229, 자동 773 → 914 / 1143 = 80.0%)
- 대상 참조: 레지스터 `sel/played/seen/hit/chosen/rest/revealed/removed/drawn/moved/cost/costRev/last/ent/cin`, `if c:reg`(개수·distinct·else), `dynN`, `self pc`(「N枚につき」).
- 분기: `そうした場合`(done), 코스트/효과로 리무브·공개한 결과 분기, 모달 "代わりにNつとも".
- 지속/지연: `until` turn|contact|oppEnd, `delay`(R.fl.tmp), `turnPk`(nocutin/nodisguise/noevent).
- 덱: peek/pick/mv/reorder, 상대 덱, `setDeck to:pick`, 존+소유자 이동(`_zone_move_ops`).
- 【疾風】: 순번(`nth`)·`noEnter`·`hayAny`·`hayIgn` 엔진 처리, 손패 lvd/per.
- 상태 정적/이벤트: selfSt, rem/oppField 개수 조건, sleepEv/setOn/fdOff/fileHand/hint 버스 이벤트.
- 강제 선택: mustdesig / mustguard / mustsel, 보호 kw(nrm-ev, nrm-ab, nsl-ab, nst-ab, evsafe, untarget).
- 남긴 manual: 규칙 불명확(효과로 인한 손패 이벤트 사용), 「AするかB」 강제 선택, 치환/부정, 컨택트 생성, 이름 변경, 티어 표 등.
- 테스트: `node test/patterns_v12.js` (35개).

## UI 개편 (Turn 13) — index.html 만 변경 (엔진/파서/DB 무변경)
- 구조: 상단바(브랜드·턴 badge·방 코드·덱 등록/관리/항복) → 메인(보드 매트 | 우측 독립 패널). 보드는 하나의 어두운 테이블 매트 안에 상대(위)/중앙 바/나(아래).
- 각 플레이어 영역(3열 그리드): 왼쪽 = 사건 / FILE, 가운데 = 캐릭터 5칸 균등 슬롯 + 파트너(중앙축, 금색 테두리), 오른쪽 = 증거 / 덱·손패·리무브 badge, 맨 아래(상대는 맨 위) = 손패.
- 증거 · FILE 은 가로 방향으로 겹치는 스택 + `증거 N` / `FILE N` badge. 상대 손패는 뒷면을 위쪽에서 가로로 표시.
- 카드 뒷면: `assets/cardback.png` (server.js 가 `/assets/<파일>` 만 정적 제공). 뒷면 카드 전부(상대 손패·증거·FILE·덱 더미·비공개 카드)가 이 이미지를 사용.
- 우측 패널: 확대 카드 → 메타 chip → 한국어 효과(DB `extra`) → 효과 도구/로그(접기) → 행동 버튼. 일본어 `fx` 원문은 화면에 표시하지 않음.
- 행동 버튼은 여전히 서버가 계산한 `view.acts` 만 사용. 테스트: `node test/ui_test.js`(4개 해상도), `node test/e2e_ui.js`(실서버 + 2브라우저).

## UI 개편 2차 (Turn 14) — index.html / 테스트만 변경 (엔진·파서·DB 무변경)
- 배치: 아래쪽 기준 왼쪽 아래 = 손패, 중앙 아래 = FILE, 중앙 = 파트너 / 캐릭터(5칸 타이트). 상대는 위쪽에 대응. 왼쪽 열 = 사건(위) → 증거(바로 아래), 오른쪽 열 = 덱/손패/리무브 badge (리무브 badge 클릭 = 리무브 에리어 보기).
- 사건 / FILE / 증거는 카드 자체를 90° 눕힌 가로 카드. 카드 위 AP / 증거 / 코스트 텍스트 오버레이 제거 (정보는 이미지 + 우측 상세 패널(현재 AP·증거 보정 포함) + 전투 표시).
- 손패 입력: 클릭 = 선택, 오른쪽 아래 행동 패널의 [등장] / [이벤트 사용] / [컷인 사용] / [변장] 버튼으로 실행 (멀리건 선택은 토글 그대로).
- 공격 표시: 서버 view.sub(guard/contact)의 atk/def/tk 로 출발 카드 → 목표(캐릭터 또는 상대 증거) 화살표, 전투 배너에 공격/방어 AP 와 컷인 후 상승 AP(취소선 → 강조), 종료 시 결과 잠깐 표시.
- 카드 이동 모션: 렌더 전후 위치 비교(FLIP) + 날아가는 뒷면 카드(덱→손패/증거/FILE, 손패→필드, 필드→리무브 등). `prefers-reduced-motion` 이면 생략.
- 로그는 왼쪽 열(접기/펼치기, 좁은 화면은 기본 접힘). (v1.1.0에서 개발자 도구/수동 효과 처리 UI는 완전히 제거되었습니다.)
- 테스트: `node test/ui_test.js`, `node test/e2e_ui.js`.

## Turn 15 (UI 추가 수정)
- 증거: 카드 이미지는 세로 그대로, 좌→우 배치. 카드마다 어두운 테두리+그림자로 윤곽 구분(수가 많으면 겹침).
- FILE: 카드 한 장은 가로(눕힘) 유지, 여러 장은 손패처럼 좌→우로 나열/겹침.
- "네크스트 힌트" → "넥스트 힌트" (화면 문구·서버 메시지 전부).
- 덱 N 은 덱 위치 유지, "손패 N" 삭제, 리무브 N 은 덱 아래가 아닌 별도 리무브 에리어(맨 위 카드 표시, 클릭 시 목록).

## Turn 16 (UI)
- 사건: 회전 없음(.card.kase, 원본 방향). 증거: 가로 카드 + 위→아래(.stk.ev). FILE: 가로 카드 + 좌→우(.stk.file). 세 규칙은 각각 독립 CSS.
- 어시스트(서버 partner.inFile): 파트너 카드가 FILE 줄 맨 오른쪽으로 이동(기존 이동 모션 사용). 상태는 서버 값 그대로 따름.

## Turn 17 (UI)
- 어시스트 중 파트너(FILE 맨 오른쪽): 슬립 상태여도 상태 회전을 적용하지 않고 FILE 카드와 같은 가로 카드로 표시. 종료 후 파트너 영역에서 원래 방향으로 복귀.
- 캐릭터 세트 카드: 캐릭터 밑에 오른쪽 아래로 조금씩 어긋나 겹쳐 표시. 앞면=실제 카드(hover 상세), 뒷면=카드 뒷면. 상대의 뒷면 세트는 서버 뷰에서부터 `{fd:1,hidden:1}` 뿐(내용/ID 미전송). server.js 는 표시용 직렬화(`withSets`)만 추가, 게임 규칙 변경 없음.

## Turn 18 (UI)
- 전투/사건 액션 결과 팝업(중앙 VS 박스, "사건 액션 성공/격파!/변화 없음" 문구) 제거. 화살표 + 각 카드 윗부분에 붙는 작은 AP 배지만 표시(컷인 시 4000 → 6000), 전투가 끝나면 즉시 사라짐. 사건 액션은 공격 AP 배지 + 증거를 향한 화살표.

## Turn 19 (덱 빌더 개편)
- 로비/상단의 "카드 / 덱 관리" → 새 덱 빌더(OPTCG SIM 식). 왼쪽: 이름·저장·불러오기·파일 내보내기/가져오기 + 호버 큰 이미지 + 한국어 extra / 오른쪽 위: 사건·파트너 슬롯 + 메인덱(같은 카드 겹침 ×N) + 상태(메인 N/40 · 사건 · 파트너) / 색상 6종 토글 + 검색 / 카드 이미지 그리드(전체 DB 대상, 스크롤하며 이어서 렌더).
- 검색: `ap2000`, `lp2`, `event`(char/case/partner 도 가능), 숫자만(=FILE 코스트 lv, 캐릭터만), 공백으로 AND, 그 외 텍스트는 효과/특징 검색. 색상과 동시 적용.
- 규칙(기존 그대로): 메인 40장 · 같은 카드 3장(deckfree 카드는 서버 규칙대로 예외) · 사건 1 / 파트너 1(교체). 저장 형식은 기존 `DB.decks`({name, cards:{id:n}, partner, kase}) 그대로, 덱 등록(ready)과 서버 검증은 변경 없음.
- 덱 파일(JSON): `{format:'conan-deck', version:1, name, case, partner, main:[{id,n}]}`. 가져오기는 존재하지 않는 ID / 3장 초과 / 40장 초과 / 사건·파트너 여러 장 / 종류 불일치 / 형식 오류를 모두 검증하고, 문제가 있으면 적용하지 않고 목록으로 안내.
- 기존 카드 편집기는 빌더의 "카드 DB 관리" 버튼으로 계속 사용 가능. 테스트: `node test/deck_test.js` (1,251장 합성 DB, 82개 검사).

## Turn 20 (UI)
- 파트너가 어시스트로 FILE 줄에 있으면 FILE 숫자에 파트너도 포함(FILE 5 → 6).
- 효과 선택창: 카드를 "내 캐릭터 / 상대 캐릭터"로 나눠 표시하고, 지금 적용 중인 효과를 한국어 텍스트(카드 extra, 능력 순서가 맞으면 해당 줄 강조)로 표시. server.js 의 effView 에 표시용 필드(srcD, abI, abN, abLab, itK)만 추가.

## Render 배포 (무료 Web Service)
- Build Command: `npm install` / Start Command: `npm start` (환경변수 필요 없음. `PORT` 는 Render 가 자동 제공, 없으면 3000).
- `render.yaml`(Blueprint)도 포함: GitHub 에 올린 뒤 New → Blueprint 로 배포하거나, New → Web Service 에서 위 두 값만 입력. Health Check Path: `/health` (→ `OK`).
- 서버는 PORT 를 사용하고 특정 주소(localhost)에 묶지 않습니다. 클라이언트는 현재 페이지 protocol/host 로 WebSocket 에 접속합니다(https → wss, http → ws).
- 방/게임 상태는 서버 메모리에만 있습니다. 무료 플랜은 15분 유휴 시 잠들고 재시작되면 진행 중인 방이 사라집니다(다시 만들기). 카드 DB/덱은 각자 브라우저(IndexedDB)에 저장됩니다.
- 유휴 WebSocket 이 프록시에 끊기지 않도록 25초마다 ping 을 보냅니다. `node test/deploy_test.js` 로 배포 호환 검사.

## 카드 DB 자동 로딩 (`data/cards.json`)

**카드 DB 원본은 프로젝트 안의 `data/cards.json` 하나입니다.** 사용자가 브라우저에서 파일을 고르거나 IndexedDB 에 카드 DB 를 넣는 과정은 없어졌습니다.

- 서버가 `data/cards.json`(`__dirname` 기준 상대경로)을 읽어 `GET /api/cards` 로 제공합니다(gzip + ETag). 파일이 바뀌면 서버 재시작 없이 다음 요청부터 새 내용을 읽습니다.
- 페이지에 접속하면 자동으로 받아 카드 목록/색상·AP·LP·이벤트·코스트 검색/이미지/한글 효과 텍스트에 그대로 씁니다. 새 브라우저·시크릿 창·다른 PC·휴대폰 모두 같습니다.
- 브라우저(IndexedDB)에는 **내 덱만** 저장됩니다. 예전 버전이 저장해 둔 카드 DB 가 남아 있어도 무시하고 서버 DB 를 씁니다.
- `data/cards.json` 이 없거나 깨졌거나 카드가 0장이면 `503` + **"카드 DB를 불러올 수 없습니다."** 를 로비/덱 빌더에 크게 표시하고(빈 목록으로 넘어가지 않음) 덱 등록·저장을 막습니다. 파일을 고친 뒤 "다시 시도".
- 파일 형식: `{"cards": {"<ID>": {id, n, type, color, lv, lv2, ap, lp, kw, trait, fx, extra, ab, img, file}, ...}}` (`import_cards.py` 출력에서 `decks` 는 없어도 됩니다). 경로를 바꾸려면 환경변수 `CARDS_JSON`(선택).

> ⚠ **이 압축 파일의 `data/cards.json` 은 개발 환경에서 확보 가능했던 실제 카드 117장(샘플)입니다.** 전체 DB(1,251장)는 사용자 PC 에만 있으므로, 배포 전에 본인의 전체 DB 파일(예: `conan-db-full.json`)을 `data/cards.json` 으로 **덮어써 주세요.** (`{cards:{...}}` 형식이면 그대로 동작합니다. 서버 시작 시 별도 설정은 필요 없습니다.) 확인: `http://localhost:3000/api/cards` 응답 헤더 `X-Card-Count`.

### 새 세트 추가 — `add_new_cards.py`
```
pip install anthropic pillow
set ANTHROPIC_API_KEY=...            (Windows)   /   export ANTHROPIC_API_KEY=...
python add_new_cards.py "E:\conanTCG\newset"
```
- 이미 `data/cards.json` 에 있는 ID 는 **OCR/API 를 다시 호출하지 않고 건너뜁니다**(중복). 새 ID 의 이미지만 처리합니다. 같은 ID 를 새 결과로 바꾸려면 `--replace-existing`.
- 쓰기 전 `data/backup/cards-<시각>.json` 으로 자동 백업 → 임시 파일(`cards.json.tmp`)에 작성 → JSON 재검증(구조/ID 목록/기존 카드 불변) → 성공해야만 원본 교체. 실패하면 원본은 그대로.
- 확인 필요/manual 목록은 새 카드만 `data/reports/add-<시각>.review.csv`, `.manual.txt`, `.errors.log` 로 생성.
- 옵션: `--dry-run`(계획만 출력), `--init`(cards.json 이 없을 때 새로 생성), `--id-regex`, `--model`, `--struct-model`, `--no-struct`, `--workers`, `--limit`. (카드 읽기/효과 구조화는 `import_cards.py` 와 같은 코드)
- 출력 예: `기존 카드 수: 1251 / 입력 이미지 수: 200 / 신규 추가: 195 / 중복: 3 / 실패: 2 / 최종 카드 수: 1446`
- 추가 후 배포: `data/cards.json` 을 커밋/배포하면 Render 에서도 새 카드가 보입니다(Render 디스크에는 쓰지 않습니다).

테스트: `npm run test:autoload`(새 브라우저/시크릿/휴대폰/저장소 차단/옛 IndexedDB/DB 없음·손상/Render 식 실행), `npm run test:add`(증분 추가·중복·교체·백업·원자적 저장).


---

## 🤖 봇과 대전 (BOT / EXPERT) — 1인용 AI

로비의 **「봇과 대전」** 버튼 → 내 저장 덱 / 봇 덱(저장된 덱 중 선택) / 선공·후공·랜덤을 고르면 시작합니다. 봇 덱 목록은 서버로 전달되고, 카드 정의는 서버가 자동 로드한 현재 `data/cards.json` 을 그대로 씁니다(별도 DB 없음). 난이도는 **BOT / EXPERT** 하나뿐이며 일부러 실수하지 않습니다.

### 구조 (`bot/`)
| 파일 | 역할 |
|---|---|
| `controller.js` | 방 생성, 봇 좌석(가짜 소켓), 모든 결정 창(멀리건·선후공·공격·가드·컷인·효과 선택·어시스트·턴 종료·상대 턴 응답) 처리, 워커 호출, 결정 로그 |
| `search.js` | 탐색: 내 한 턴 전체를 수열로 계획(빔 + 반복 심화 + 전치표), 전투/컷인/효과 선택은 정확한 미니맥스, 상대 응수 검증 |
| `evaluate.js` | 평가 함수(확정 승리 > 전부, 확정 패배 회피, 증거·FILE·캐릭터·패·컷인·템포·파트너·어시스트·케이스·세트·덱 잔여 핵심 카드 등) |
| `simulate.js` | 엔진 복제/결정화(determinize)/합법 수 생성/재생(replay). 사람과 봇이 같은 `dispatch` 경로를 사용 |
| `decide.js`, `job.js`, `worker.js`, `track.js` | 결정 진입점, 워커 스레드(이벤트 루프 차단 방지), 효과 중간 상태 재생 |

* 봇은 엔진이 허용하는 행동만 선택합니다(카드 생성·AP/FILE/증거/패/턴 임의 변경 불가). 탐색 상태는 라이브 상태와 완전히 분리된 복제본입니다.
* 정보: 양쪽 손패, 공개 카드, 뒤집어 놓은 세트 카드의 실제 내용, 덱 잔여 구성, 트래시/제외를 사용하지만 **덱 순서(다음 카드)와 미실현 난수는 사용하지 않습니다**(덱 순서를 섞어 탐색, 테스트로 검증).
* 카드 효과는 카드 데이터의 `ab` 를 엔진으로 그대로 시뮬레이션합니다(카드 이름 하드코딩 없음). `ab` 가 없는 `manual`(텍스트 전용) 효과는 봇이 시뮬레이션·사용하지 못합니다.

### 환경 변수
* `BOT_THINK_MS` — 한 결정의 최대 생각 시간(ms, 기본 **3000**). 시간이 다 되면 그때까지의 최선 수를 반환합니다.
* `BOT_MICRO_MS` — 전투/효과 선택 같은 세부 결정의 시간(기본 ≤1500).
* `BOT_DELAY_MS` — 봇 행동 사이 UI 연출 지연(기본 650).
* `BOT_NO_WORKER=1` — 워커 스레드 없이 같은 프로세스에서 실행(디버깅용).

### 결정 로그
게임이 끝난 뒤 「AI 기록 다운로드」로 JSON(상태 요약·선택·상위 후보와 값·깊이/노드 수·생각 시간)을 받을 수 있습니다. 게임 중에는 노출되지 않습니다.

### 회귀 케이스 추가
"이 상황에서는 봇이 X 를 했어야 한다" → `test/bot_cases/NN_이름.js` 를 추가하세요 (형식은 `test/bot_regress.js` 상단 주석, 예시는 기존 3개 파일). `npm run test:bot` 이 자동으로 실행합니다.

### 테스트
* `npm run test:bot` — 단위 / 회귀 / 실제 서버 방 테스트
* `npm run test:bot:selfplay` — BOT vs BOT·기준선(랜덤/단순 휴리스틱) 시드 재현 자기 대전 (`--games --a --b --nodes --seed`; 실제 DB 로 돌리려면 `BOT_TEST_DB=data/cards.json`)
* `npm run test:bot:stress` — 특이 효과 카드가 섞인 DB 로 교착/불법 행동/상태 손상 점검
* `npm run test:bot:ui` — 실제 브라우저(로비→봇 대전→종료→로그 다운로드→재대전)

### 알려진 한계
* 탐색은 내 턴 전체 + 상대의 다음 한 턴 응수(얕은 빔)까지이며, 그 이후는 정적 평가입니다. 결정화는 표본 1개 기반(완전한 몬테카를로 평균 아님).
* 평가 가중치는 수작업 설정이고 AI vs AI 로만 측정했습니다(사람 상대 실력은 검증되지 않음).
* 샌드박스에는 실제 1,251장 DB 가 없어 실제 샘플 117장 + 대표 효과 픽스처로 검증했습니다. 실제 DB 로 자기 대전을 돌려 보시길 권합니다.


---

## 🎯 덱 전문 봇 (Specialist) 시스템

```
기존 Expert Bot 공통 두뇌 (bot/*.js — 탐색·시뮬레이션·전투 계산·평가)
        +
덱 전용 전략 프로필 (bot/specialists/<id>.js)
        =
덱 전문 Bot
```

전문 봇은 **AI 를 복사하지 않습니다.** 탐색(search)은 언제나 범용 Expert 의 것이고, 프로필은 그 위에 **평가 점수 · 행동 탐색 순서 · 멀리건**만 더합니다. 프로필에 없는 상황에서는 범용 Expert 와 완전히 같은 판단을 합니다 (빈 프로필 = 범용 Expert, 테스트로 검증).

### 구조
```
bot/                         ← 공통 AI 코어 (덱 지식 없음, 카드 ID 를 모름)
  search.js evaluate.js simulate.js decide.js controller.js job.js worker.js track.js snapshot.js
  └ 코어가 아는 것은 "정책(policy)" 인터페이스 뿐: { W(가중치), score(R), moveBonus(R,mv), mulValue/mulAdjust }
bot/specialists/             ← 덱별 지식은 전부 여기에만
  registry.js                전문 봇 목록(자동 스캔) · 덱/프로필 검증 · 정책 생성
  deckfile.js                덱 빌더 "덱 파일 내보내기" JSON 읽기 + 검증 (자동 보정 없음)
  policy.js                  프로필 → 정책 컴파일러 · 프로필 검증 · 훅용 읽기 전용 view
  cli.js                     등록/갱신/검증 CLI
  _template.js               프로필 전체 항목 설명 (등록되지 않음)
  decks/<id>.json            내보낸 덱 JSON "그대로"
  <id>.js                    전문 봇 하나 = 파일 하나 (이름, 설명, 덱 파일, profile)
```

### 새 전문 봇 등록 (덱 JSON 하나 → 봇 하나)
1. 덱 빌더에서 덱을 만들고 **「덱 파일 내보내기」** → `conan-deck_xxx.json`
2. 프로젝트 루트에서 (카드 DB `data/cards.json` 은 읽기만 합니다):
   ```
   node bot/specialists/cli.js add conan-deck_xxx.json --id fbi_red --name "적색 FBI Expert" --desc "한 줄 설명"
   ```
   덱 이름·사건·파트너·메인덱 카드/장수를 자동으로 읽고, **카드 DB 에 없는 ID / 같은 카드 3장 초과 / 메인덱 40장 아님 / 사건·파트너가 정확히 1장 아님**을 검증합니다. 하나라도 틀리면 **아무것도 등록하지 않고** 무엇이 틀렸는지만 출력합니다 (임의 보정·카드 교체 없음).
3. `bot/specialists/fbi_red.js` 의 `profile` 에 덱 운영법을 채웁니다 (비워 두면 범용 Expert 와 동일). 항목은 `_template.js` 참고.
4. 서버를 다시 시작하면 **「봇과 대전」 목록에 자동으로 나타납니다** (HTML 수정 없음).
* 덱 리스트를 새 버전으로: `node bot/specialists/cli.js update fbi_red 새덱.json` (검증 통과 시에만 교체, 이전 파일은 `.bak`; 프로필이 새 덱과 안 맞으면 알려줌).
* 검증: `npm run specialist:check` (모든 전문 봇의 덱·프로필을 카드 DB 로 검사), `node bot/specialists/cli.js validate 덱.json`.

### registry / UI
* `registry.js` 가 `bot/specialists/*.js` 를 스캔해 목록을 만듭니다 (`_` 로 시작하는 파일과 인프라 파일 제외). 환경변수 `BOT_SPECIALISTS_DIR` 로 같은 형식의 추가 폴더도 읽을 수 있습니다(개인/실험용).
* 서버 `GET /api/specialists` → `{id, name, deckName, colorLabel, desc, cards, ok, errors}` 목록 (전략 프로필은 내보내지 않음). 색은 `color` 를 적지 않으면 사건 카드의 색을 카드 DB 에서 읽습니다.
* 「봇과 대전」 창은 이 목록으로 버튼을 **자동 생성**합니다: `범용 Expert` + 전문 봇들(예: `적색 FBI Expert / 적색 / FBI`). 전문 봇을 고르면 내 덱·선공/후공/랜덤만 고르고, 봇은 등록된 고정 덱을 씁니다. 덱/프로필이 규칙에 어긋나는 봇은 비활성(사용 불가 + 이유)으로 표시됩니다.

### 프로필이 조절할 수 있는 것 (`profile`)
| 항목 | 의미 |
|---|---|
| `weights`, `weightsBy.first/second`, `lethal.weight` | 평가 가중치(FILE·증거·손패·컷인·리살 …), 선공/후공 보정 |
| `roles`, `cards` | 카드 역할·값: `hand`(손패 가치) `field`(필드 가치) `play`(사용 순서) `attack`(공격 순서) `target`(상대 필드에 있을 때 제거 우선순위) `keep`/`mulligan`(멀리건) `conserve`(보존) |
| `combos`, `sequences` | 콤보 시너지(`where` hand/field/any, `keep`), 사용 순서(탐색 순서 가산) |
| `mulligan` | 유지/교체 카드 목록 |
| `file`, `evidence`, `hand`, `conserve.cutin` | FILE·증거·손패 장수 가치 곡선, 컷인 보존 |
| `actions` | 행동 종류별 탐색 순서 가산(`assist`, `reason`, `end` …) |
| `matchups` | 상대 사건/파트너/카드/색 조건에 따른 보정 |
| `hooks.score / move / mulligan` | 상태를 **읽기 전용 view** 로만 받아 **숫자만** 반환 (상태 변경 불가, 예외/NaN 은 0, `limit` 상한) |
* 프로필의 모든 효과는 “점수/순서/멀리건”에만 작용합니다. 합법 수를 새로 만들거나 없애지 않고 행동을 고정하지 않으므로 탐색이 최종 선택을 합니다. 확정 승리(±1e6)는 프로필 점수와 무관하게 항상 우선합니다.
* 프로필 오타(알 수 없는 키·가중치 이름·DB 에 없는 카드 ID)는 검증에서 오류로 잡힙니다.

### 새 전문 봇을 만든 뒤: 자동 점검
```
node test/specialist_eval.js fbi_red --games 12 [--vs all] [--heur 1]
```
실제 카드 DB 로 (A) 전문 봇 vs 같은 덱의 범용 Expert, (B) 미러, (C) 다른 전문 봇과의 대전을 선후공 교대로 돌리고, 멀리건 교체 카드, 낼 수 있는 손패를 안 내고 끝낸 턴, 놓친 리살, AP 열세 공격 같은 이상 지표를 출력합니다. **AI 끼리의 승률은 실제 덱의 강함을 뜻하지 않습니다.**

### 실전 피드백 → 회귀 테스트 → 프로필 수정
1. 게임 종료 후 **「AI 기록 다운로드」** — 메인 결정마다 `snap`(그 시점의 전체 상태: 카드 ID 기준)이 들어 있어 “○번째 결정에서 A 를 했는데 B 를 해야 한다”를 그대로 재현할 수 있습니다.
2. `test/specialist_cases/<봇id>/NN_설명.js` 에 케이스 추가 (`snapshot` 을 붙여 넣거나 `setup(H, ctx)` 로 직접 구성):
   ```js
   module.exports = { name: '리살 직전에는 ○○ 를 아끼고 공격', snapshot: { /* 로그의 snap */ }, seat: 1,
     expect(res, R, H, SIM, ctx) { if (!ctx.X.attacks(R, res, 'id_0123')) throw new Error('공격해야 함: ' + res.mv.tag); } };
   ```
3. `node test/specialist_regress.js --id fbi_red` 로 실패를 확인 → 프로필 수정 → 통과 확인.
4. `npm run test:specialist` (또는 전체 `npm test`) 가 **모든 전문 봇의 케이스 + 각 봇 정책을 붙인 범용 전술 케이스(리살/전투 계산/멀리건)** 를 함께 돌려 다른 상황이 망가지지 않았는지 검사합니다. 카드 DB 에 없는 카드가 필요한 케이스는 `SKIP` 으로 표시됩니다(`--strict` 면 실패).

테스트: `npm run test:specialist` (덱 파일 검증·정책·탐색 결합·self-play·방·스냅샷·회귀 러너), `npm run test:specialist:ui` (브라우저: 목록 자동 생성·선택·고정 덱·시작). 테스트는 mock specialist 만 사용하며 실제 전문 봇은 포함하지 않습니다.

## 📱 모바일 / 태블릿 (v1.4.0 방침 변경)
- 모바일 전용 UI/레이아웃은 폐지. 모든 기기에서 PC 와 **완전히 동일한 화면**(카드 배치·우측 미리보기·로그·버튼).
- 해상도: 터치 기기는 뷰포트를 가상 1280x720 이상(기기 비율에 맞춰 폭 확장)으로 맞춰 PC 화면 전체가 비율 그대로 들어온다(벡터/이미지는 기기 해상도로 선명하게 렌더). 세로 화면은 작게 보이므로 가로 사용 권장.
- 조작: 탭 = 마우스 클릭, 카드 길게 누르기(0.45초) = 마우스 오버(우측 미리보기 갱신, 클릭 동작 안 함), 우클릭 메뉴·더블탭 확대·핀치·텍스트 선택·이미지 끌기 차단.
- 테스트: `npm run test:mobile` (= `test/touch_pc_test.js`, 폰/태블릿 에뮬레이션에서 PC 와 좌표 동일·터치 조작 검증). 기존 `mobile_test.js`/`mobile_real.js` 는 모바일 전용 UI 검증이라 삭제됨.

## v1.4.0 — 모바일 = PC UI
- 위 모바일 항목 참고. `index.html` 에서 `isMobile()` 은 항상 false(`body.m` 규칙은 비활성), 터치 보정 블록(뷰포트 맞춤, 길게 누르기 미리보기, 제스처 차단) 추가.

## v1.1.0 — 모든 카드 효과 자동 실행 (수동 효과 제거)
- 전체 1,251장 중 효과 카드 **1,143장 모두 자동 실행**(`manual` 0장). 게임 중 사람이 효과를 직접 처리하는 기능(개발자 패널, 우클릭 수동 메뉴, 모바일 ⚙ 수동, 서버의 `a:'fx'` 도구)은 **완전히 삭제**되었습니다.
- 플레이어는 규칙상 필요한 결정(대상 선택, [사용]/[사용 안 함], 택일 [A]/[B], 카드명 입력)만 합니다. 대상은 서버가 계산한 합법 대상만 선택할 수 있고, 응답은 서버가 다시 검증합니다(불법 대상은 거부).
- `data/cards.json`: 전체 DB를 새 파서로 재변환한 결과입니다. 이전 DB 대비 **`ab`(효과 데이터)만** 바뀌었습니다(이미지·원문 `fx`·번역 `extra`·ID·AP/LP/코스트 불변).

### 구조 (새 세트가 나와도 같은 방식으로 확장)
1. 공통 파서 규칙(`effect_rules.py`/`effect_prims.py`)이 먼저 문장을 구조화 →
2. 못 푼 문장은 카드별 구조화 데이터 `ext_*.py`(`reg(카드ID, 원문 일부, [ab…], cls)`; cls A=신규 공통 프리미티브 / B=기존 프리미티브 조합 / G=카드 전용) →
3. 필요한 공통 연산은 `fx_ext_*.js`(`def('op', clean, run)`; 폴더 안의 `fx_ext_*.js`/`ext_*.py` 는 자동 로드).
- importer 는 이제 카드 ID 를 변환기에 넘깁니다(이전엔 ext 데이터가 반영되지 않았음). 재변환: `python3 import_cards.py <db.json> --effects-only <db.json> --rules-only --out <out.json>`.
- 새 카드에서 `manual` 이 나오면 `.manual.txt` 에 나오므로 `ext_<이름>.py`/`fx_ext_<이름>.js` 를 추가하고 `test/mz_<이름>.js` 에 카드별 테스트를 넣으세요.

### 테스트 (전체 DB 필요: `data/cards.json` 또는 `CARDS_DB=...`)
- `npm run test:cards` — 전수 검사(`all_cards_auto.js`: 효과 카드 전부 자동 / 이전 manual 229장 모두 카드별 테스트 보유 / 수동 도구 거부 / 수동 UI 잔재 없음) + roundtrip 손실 0 + 카드별 회귀 `mz_*.js`(합계 327개 시나리오).
- `npm run test:bot:fulldb` — 전체 DB 무작위 합법 덱으로 BOT vs BOT(교착/불법수/상태 손상/예외 0건 확인). 
- `npm run test:ext` — importer 가 ext 데이터를 실제로 적용하는지.
- `npm test` 에 위 카드 테스트가 포함됩니다.

### 이번에 고친 엔진 버그(전체 DB 스트레스에서 발견)
- AP 조건부 상시 능력(예: 赤木英雄 id_0953)이 자기 AP 계산을 다시 불러 무한 재귀(스택 오버플로) → 가드 추가.
- 덱 위/아래로 카드를 옮길 때 일시적으로 덱이 비면 잘못 리프레시되어 상대가 증거를 얻던 문제.
- 확인(비공개) 덱 탐색의 로그에 발견한 카드명이 노출되던 문제.
- 추리 불가 캐릭터에게도 추리 버튼이 표시되던 문제 / 손패 사용 가능 판정을 서버·행동 목록·봇이 같은 함수(`playCheck`)로 공유.
- 가드 이벤트의 `dst`(지정된 대상) 컨텍스트가 비어 있던 문제.

## v1.1.1 — 카드 색 판별 수정 (card_color.py)
- 원인: 예전엔 좌상단 배지 영역을 넓게 잡아 일러스트가 섞였고(빨강 44% < 60% → 미결정), 결정 못 하면 카드 **바깥 금박 테두리**로 떨어져 yellow 로 읽혔다(id_1109 조조 스탈링).
- 판별 우선순위: ① 좌상단 FILE 코스트 원 배경 → ② 프레임 고정 색 영역(상단 띠) → ③ 보조 마커(바깥 테두리) → ④ OCR/API 모델 색. 일러스트 분위기·옷·배경색은 쓰지 않는다. 6색 체계 유지.
- FILE 원은 상대 좌표 탐색창에서 24방향 고리 대비로 위치를 찾고(해상도 무관), 원 안쪽 0.38~0.80R 4겹×24방향 96점을 HSV 로 투표한다(테두리·숫자·광택은 제외, 연한 파스텔은 채도 규칙으로 유채색 처리).
- `python3 test/color_test.py` (fixture: test/fixtures/color/jodie_red.png → red), `python3 test/color_scan.py [--fix]` → `color_suspects.csv`. `--fix` 는 '확실'한 단일색 불일치의 color 필드만 교정(백업 생성), 나머지는 CSV 보류.

## v1.2.0 — 봇 AI 강화 (PRO 전략 정책)
- `bot/pro.js` (신규): 탐색 엔진 위에 얹는 전략 정책. 기본 봇(범용 Expert)이 이 정책을 쓰며, 이전 방식은 `createBot` 의 `bot:'classic'` 으로만 남아 있다.
- 반영한 원칙: ①서 있는 캐릭터가 죽는 가드 감점(액티브 캐릭터 가치↑) ②·⑥·⑦ 이른 넥스트 힌트 금지(선공은 어시스트 포함 FILE 8, 후공은 9 가 되기 전까지 탐색에서 제외, 힌트 후 FILE 6 미만 금지) ③ 결과를 못 바꾸는 컷인 낭비 감점(손패 가치↑) ④ 상대 캐릭터+증거로 사건 해결선에 닿으면 큰 감점(내가 닿으면 가점) ⑤ 상대 필드 전멸 보너스 ⑧ 중반 이후 FILE 6 유지 ⑨ 낼 수 있는 캐릭터가 있으면 턴 종료 금지 + 멀리건에서 FILE 곡선(선공 1·3·5·7 / 후공 2·4·6·8)에 맞는 캐릭터 확보. 높은 레벨(9·8·7) 우선 플레이는 행동 순서·필드 레벨 가점으로 반영.
- 킬각은 기존 탐색(승리 라인 즉시 채택)이 그대로 최우선이다.
- `search.js`: 정책의 `ban(R, mv, moves)` 훅(메인 페이즈 계획에서 금지할 행동) 추가. `test/bot_pro_test.js`(규칙 테스트), `test/bot_match.js`(덱 파일로 두 봇 대결 + 행동 품질 지표).
- 사용: `node test/bot_match.js --deck my.json --a expert --b spec:pro --games 40 --nodes 1500` (expert = 이전 방식, spec:pro = 강화판)

## v1.3.0 — 증거 앞면/선택 수정 + 선공·후공 칩 + 해결편 표시
- 증거 앞면 처리: 모든 증거 flip(효과 op `flip`·`flipAllEvid`·`flipTopEvid`·`flipEvid`·코스트)이 `fx.js` 의 `flipEv` 한 곳을 지난다(합법 대상만, 서버 `cards[id].up`). 서버 view 는 `P.evl`(증거 순서대로 앞면=카드 / 뒷면=0)과 `P.fil` 을 보내고, 클라이언트는 이를 그대로 그린다(앞면 = 실제 카드 이미지, 뒷면 정체는 상대 view 에 없음).
- 증거 선택: `chooseEvid`(8코 마츠다 id_0704 등 "증거를 1개까지 선택" 계열 공통)가 무작위 대신 증거 하나하나를 선택지로 내고(`opt` + `evp`), 클라이언트는 해당 증거를 강조해 직접 클릭/터치로 고른다. 서버는 선택지 번호를 엄격 검증(`null`/배열 등 거부). 봇은 같은 구조를 쓰되 뒷면 증거는 구별하지 않는다.
- UI: 상단 턴 표시 옆 선공/후공 칩(`#firstb`), 해결편 사건 카드 강조(테두리·글로우·"✔ 해결편" 배지·구역 라벨, 전환 순간 짧은 애니메이션). 게임 규칙/판정 로직은 그대로.
- 테스트: `npm run test:evidence`

## 🧠 v1.5.0 — Expert Knowledge Layer (고수 판단 기준)
self-play 점수만 올리는 대신, 상위권 플레이어가 **무엇을 가치 있게 보는지**를 탐색(search)·평가(evaluation)·행동 순서(action ordering)·pruning 에 넣었다. 강제 스크립트가 아니며, 실제 시뮬레이션 결과가 지식과 다르면 **탐색 결과가 이긴다**.
```
bot/expert/   features.js(상태 특징) layer.js(정책에 얹기) knowledge.js(지식 로드·범위) mulligan.js(초동 실패 확률) explain.js(설명 로그)
              cases.js(고수 판단 회귀) cli.js(케이스 추가·설명·지식 점검) fx_profile.js(효과 영역 분석) profile_schema.js(프로필 확장 검증)
bot/knowledge/*.json  지식 entry (source·env·date·archetype·matchup·side·confidence) — 형식: bot/knowledge/README.md
test/expert_cases/    고수 판단 회귀 케이스            test/expert_test.js / test/expert_regress.js
```
모든 봇(범용 Expert = PRO 정책, 전문 봇)에 자동으로 얹힌다. 비교용: `pro_v12`(v1.2 PRO 그대로), 전문 봇 id 뒤 `@raw`, 환경변수 `BOT_KNOWLEDGE=0`.

### 평가에 분리해 넣은 특징 (좌석별 절대값 → 나 − 상대, 반대칭 유지)
| 요청 항목 | 구현 |
|---|---|
| evidenceTempo | (증거 + 다음 턴 추리 가능량) / 필요 증거 |
| boardRemovalValue | 상대 필드 가치(기존 평가의 `base:oppBoard`) + 보정: 증거도 못 만들고 효과도 없고 상대를 잡지도 막지도 못하는 "무해한" 캐릭터는 가치 절반, 상대 필드가 무해한 캐릭터뿐이면 (PRO) 전멸 보너스의 70% 인정 |
| boardLeakRisk | 차례인 쪽이 상대의 노출된(슬립) 캐릭터·증거에서 뽑아낼 기대 이득 (공격자 AP + 손패 컷인 vs 가드/컷인, 손패 공개 정보) |
| futureCleanupValue | 다음 턴 쓸 수 있는 다면 제거(2장 이상/전체)가 함께 처리할 상대 캐릭터 → 지금 하나 제거하는 가치↓ |
| turnsToSolve / myTurnsToWin / oppTurnsToWin | 규칙(해결편 = FILE+어시스트 7, 해결 = 해결편+파트너 액티브+증거) 기반으로 "몇 번째 내 턴에 해결 가능한가" 추정. 두 값의 차이(승리 ply)가 평가에 크게 들어간다 |
| partnerDeductionValue / assistValue / assistOpportunityCost | 루트에서 비교해 행동 prior 로 사용 + 턴이 끝난 뒤 남는 "임시 FILE+1·파트너 액티브" 착시를 평가에서 제거(assistResidual) |
| actionsGenerated zonesAffected cardsSpent fileSpent evidenceGenerated removalGenerated boardCreated | 매크로 행동마다 계산(Action Economy). 2개 이상 영역에 영향 → 라인 가산 + 효과 구조로 예상해 탐색 순서 우선 |
| fileNow fileAfterAction nextTurnFileRequirement lethalFileRequirement defensiveFileRequirement | FILE 은 마나가 아님: 다음 턴 핵심 카드 레벨·해결편 시점·변장 FILE 조건이 깨지면 큰 감점, 자연 FILE 보다 쓴 만큼 감점(fileSpent), FILE 하한(지식) |
| setup/formation progress · combo pieces ready · lethal package ready | 전문 봇 프로필 `formation` / `lethal.packages` (예: `bot/specialists/_example_green.js`). 깨는 플레이는 탐색 순서에서 뒤로 + 평가 감점 |

### 탐색과의 결합 (강제 규칙 아님)
* **행동 prior**: 다면 플레이, 약한 공격자로 방어 자원 먼저 소비(낚기), 미스리드가 있으면 낮은 AP 부터 추리, 파트너 추리/어시스트 비교, FILE 루트를 깨는 힌트는 뒤로, formation 을 깨는 스위치는 뒤로.
* **소프트 pruning**: 지식이 "하지 말 것"이라고 하는 행동(예: v1.2 의 이른 넥스트 힌트, 낼 캐릭터가 있는데 턴 종료, FILE 5 아래로 힌트)은 계획 탐색에서 뒤로 미룬다. 루트에서는 두 번째 반복 뒤 같은 예산으로 따로 탐색해 **최선보다 1.5 + 4×confidence 이상 좋으면 다시 허용**(탐색이 지식을 이김, AI 기록 `overrides`).
* **넥스트 힌트**: 사람 UI 처럼 손패 사용 뒤에도, 여러 번 후보가 된다(이전엔 "아무것도 안 했을 때 1회"만). 단, 손패 사용 뒤의 추가 힌트는 힌트 후 FILE 5 이상이 남을 때만 후보(그 아래는 다음 턴 전개를 무너뜨리므로 탐색 폭을 아낌). FILE 8 에서 8→7 같은 연속 행동을 탐색하고, FILE 보존 특징이 언제 멈출지 정한다.
* **Perfect Information**: 상대 손패가 공개된 정보(Training Mode)는 "상대가 실제로 쓸 수 있는 가드·컷인·변장·미스리드"를 minimax 로 정확히 계산하는 데 쓰인다. 설명 로그의 `steps` 에 "공격 A ⇒ 상대 가드/컷인 소비 → 공격 B" 순서가 남는다.

### 멀리건 = 초동 실패 확률
교체 조합(최대 32가지)마다 덱(공개)에서 시드 몬테카를로로 첫 4턴(선공 FILE 1·3·5·7 / 후공 2·4·6·8)을 시뮬레이션: 낼 카드가 없으면 `curveFailurePenalty`, 그 턴 FILE 에 가까운 레벨을 내면 템포 가산, `mulliganKeepGroups` 충족 가산, 최종 손패 가치. 덱별 `requiredEarlyPlays` · `firstPlayerPlan` / `secondPlayerPlan` 으로 조정. AI 기록의 멀리건 결정에 턴별 패스 확률이 남는다.

### 지식 entry 와 적용 범위
entry 마다 `source · env(세트/환경) · date · archetype · matchup · side · bots · confidence`. 범위가 맞지 않으면 적용하지 않고(이유 기록), 오래된 환경의 지식은 confidence 가 자동으로 줄어든다. 카드 ID 를 쓰는 지식은 `archetype: "any"`(전체 적용)로 둘 수 없다.
기본 지식: 사용자 원칙(v1.5.0, v1.2.0) + 외부 고수 글 3편(제1탄 2024: かざも·どんかファミリー探偵団 / 2025-04: sumomo 녹단 — 녹색 단색 덱에만). `npm run expert:kb -- --deck 덱.json --side second` 로 적용 목록 확인.

### 고수 판단 회귀 (Decision Regression)
```
node bot/expert/cli.js case add --log conan-bot-log.json --n 12 --a "공격: 服部平次 → 遠山和葉" --b "추리: 服部平次" --expert B --reason "방치해도 해결선에 못 닿음, 증거로 승리 턴 단축"
node bot/expert/cli.js case add --state 상황.json --a "reason:id_0861" --b "attack:id_0861>id_0419" --expert A --reason "…"   (간이 상태: FILE/증거는 장수만)
npm run test:expert          # 모든 케이스를 다시 판단 (봇을 고칠 때마다)
npm run expert:regress       # + v1.2 PRO 와 비교 표시
```
케이스 = 게임 상태 + 후보 A/B(행동 또는 "앞 몇 행동" 라인) + 고수의 선택 + 이유. 각 후보로 시작하는 최선 라인을 같은 탐색 예산으로 계산해 고수 후보가 더 높아야 통과(`check: "first"` 면 봇의 자유 선택도 일치해야 함). 실패하면 두 후보의 판단 요소 차이를 출력한다. 형식: `bot/expert/cases.js` 상단 주석, 예시: `test/expert_cases/`.

### AI 설명 로그 (「AI 기록 다운로드」)
* 상단 `knowledge`: 적용/제외된 지식(출처·환경·confidence·오래됨), 특징 크기, prior, 소프트 pruning.
* 메인 결정마다 `explain`: `now`(내/상대 승리 턴, FILE 요구치, 파트너 추리 vs 어시스트 값, 상대 방어 자원), `candidates`(첫 행동이 서로 다른 후보 라인마다 **증거 템포 · 보드 가치 · FILE 보존 · 리살 거리 · 상대 리살 위협 · Action Economy · 콤보/포메이션 · 손패 품질 · 상대 응수 검증(탐색)** 이 점수에 준 영향 = 지금 상태 대비 Δ, 세부 항목, 라인 후 승리 턴, 단계별 상대 응수/영역), `why`(선택 vs 차선 차이 문장), 후보별 `vsChosen`, `pruned`/`overrides`.
* `node bot/expert/cli.js why --log conan-bot-log.json --n 12` 로 읽기 좋게 출력. 예: "왜 캐릭터를 잡고 증거를 안 먹었어?" → 공격 후보와 추리 후보의 요소 차이(보드 +, 증거 템포 −, 리살 거리 …)를 그대로 본다.


## v1.6.0 — Tactical Layer (Expert Bot 기본기 강화)
탐색 앞단의 빠른 규칙 계층. 규칙상 불가능한 행동은 엔진 `dispatch` 로만 실행되므로 절대 두지 않는다.
- **리살 솔버** (`bot/tactics/lethal.js`): 매 메인 결정마다 최우선. 1-A 추리/등장+추리, 1-B 사건 공격 증거, 1-C 블로커 제거 후 공격, 1-D 실제 FILE 가능 여부(가짜 리살 거부).
- **우선순위** (`bot/tactics/rules.js`): 리살 → 큰 위협 → FILE → 효과 제거 → 유리한 AP 컨택 → 증거 공격 → 추리. 탐색 결과가 명확히 더 좋으면 규칙을 뒤집는다(soft prune).
- **FILE 6**: FILE > 6 이면 넥스트 힌트로 적극 전개, ≤ 6 이면 리살/큰 이득 없이 힌트 금지.
- **멀리건** (`bot/tactics/mulligan.js`): 2코 1 + 4코 1 + MR 1 유지(예외: 2코 2 + 4코 0 + MR). 카드 ID 하드코딩 없음.
- 끄기: `BOT_TACTICS=0`. 회귀: `npm run test:tactics` (22 케이스, 판단 로그 출력; `--only P3` 로 개별 실행).


## v1.7.0 — 버그 수정 / 편의성
- **행동 버튼 통일**: 카드 선택 시 오른쪽 아래 행동 버튼(선택 해제 포함)을 전부 노란 배경 + 검은 글씨로 통일. 특정 행동만 강조하지 않음.
- **효과 팝업에 카드 이미지**: 효과 발동 여부/선택 팝업 왼쪽에 카드 이미지, 오른쪽에 카드명·카드 ID·질문·적용 중인 효과. 예/아니오 유지.
- **카드 ID 표시**: 카드 상세 패널(게임 화면, 모바일 시트/전체화면)에 `카드 ID: id_XXXX` 칩(누르면 복사), 덱 빌더 상세에도 표시. 버그 제보용.
- **증거 직접 선택**: "뒷면 증거 1개를 앞면으로" 처럼 위치를 지정하지 않는 효과(`flip`, `flipEvid`, 코스트 `flipEvid`)는 효과 사용자가 증거를 직접 선택(선택 가능한 증거 하이라이트 + 클릭). "증거 맨 위 n장" 같은 위치 지정 효과와, 전부 뒤집거나 뒷면이 1장뿐인 경우는 자동 처리.
- **승패 배너**: 게임 종료 시 화면 중앙에 크게 "승리!/패배" 표시 (닫기 버튼).
- 테스트: `npm run test:v17` (`test/evidence_pick_test.js`, `test/ui_v17_test.js`).

- v1.7.1: 봇과 대전 시작/재시작 시 게임 화면이 뜰 때까지 "봇 대전을 준비하는 중…" 로딩 오버레이 표시 (오류/30초 후 자동 해제).
- v1.7.2: 효과 팝업의 카드 이미지가 안 보이던 경우 대비(카드명/DB 이미지 대체 조회, 이미지 없으면 카드명 자리표시), 이미지 크기 확대.
- v1.7.3: 리무브 에리어 호버 시 상세 표시, 액션 버튼 하나로 통합(누르면 상대 캐릭터/사건·증거를 클릭해 대상 지정), id_0884 등 손패 리무브 코스트의 "レベル8以上なら追加" 판정(costHas) 버그 수정.
- v1.7.4: 능력 버튼에 "능력 n 사용" 대신 실제 능력 텍스트 전체 표시(길면 글씨 축소).
- v1.7.5: 효과 팝업이 떠 있는 동안 필드를 볼 수 있도록 "필드 보기 / 효과 창 다시 열기" 토글 버튼 추가 (새 효과가 오면 자동으로 다시 표시).
- v1.7.6: 액션 대상 하이라이트는 상대 사건에만 표시(증거 더미 하이라이트 제거).
- v1.7.7: 앞면이 된 증거가 쌓임 순서(위/아래)를 무시하고 맨 위로 올라오던 표시 버그 수정 (증거/FILE 더미 z-order = 원래 순서).
- v1.7.8: id_0652 등 5장("증거를 손패로")을 FILE→손패로 잘못 처리하던 카드 데이터/엔진 수정(evidToHand/handToEvid), 상대 쪽 배치(증거↔사건, 덱↔리무브) 상하 대칭, 멀리건/준비/종료 단계 알약 숨김, "로비로" 버튼 상시 표시(일반 대전은 leaveRoom).


## v1.9.0 — 사람 vs 사람: 공개 팝업 / 다시하기 / 이번 턴 다시시작 + id_0909 수정
- **공개(reveal) 시스템**: 효과가 카드를 **공개**한다고 명시한 경우에만(`reveal`/`revealTop`/`revealHand`/`revealFile`, `peek`·`pick` 의 `reveal:true`, 손패 공개 코스트) 서버가 `{t:'reveal', by, to, cards[], msg, src, ack}` 메시지를 양쪽 클라이언트에 같은 내용으로 보낸다. `to`(공개자의 상대)에게 실제 카드 앞면·이름·ID 팝업이 뜨고 [확인]으로 닫는다(여러 장 가능, 모바일 대응). 카드가 손패에 들어갔다는 이유만으로는 공개되지 않으며(비공개 탐색은 이미지 노출 없음), 플레이 로그는 그대로 남는다. 카드별 하드코딩 없이 `fx.js` 의 `ack(reveal+by)` → `R.rv` 큐 → `flushReveal` 공통 경로.
- **다시하기**: 사람 대전 화면 상단 `[다시하기] [로비로]`. 확인창(예/아니오) 후 서버가 같은 방 코드·연결을 유지한 채 방 상태 전체(덱·정의·손패·FILE·증거·사건·파트너·필드·리무브·세트·효과 큐·보류 선택·턴/선후공·승패·게임 로그)를 초기화하고 양쪽에 동시에 반영한다. 이전 덱은 재사용하지 않으며 양쪽이 덱을 다시 등록 → 선후공 재결정. 게임 중/종료 후 언제든 사용 가능, 봇 대전에서는 숨김.
- **이번 턴 다시시작**: 메인 버튼 줄의 `[이번 턴 다시시작]`(현재 턴 플레이어에게만). 서버가 턴 시작 처리(오토/드로우/FILE/자동 효과) 직후의 정규 상태를 스냅샷(덱 순서·난수 상태 `R.rng` 포함)으로 보관하고, 복원은 드로우 재실행이 아니라 스냅샷 자체를 되돌린다 → 드로우 카드/덱 순서 동일. 효과 큐·선택 대기·컨택트·컷인·턴 한정 상태까지 모두 되돌리며, 같은 턴에 여러 번 눌러도 항상 원래 턴 시작 상태로 복원된다. 턴이 넘어가면 스냅샷은 폐기되고 새 턴 시작 스냅샷이 만들어진다. 사람 대전 방은 방별 난수(mulberry32)를 써서 같은 랜덤 효과를 다시 하면 같은 결과가 나온다.
- **id_0909 수정**: v1.8.4 의 "대상 미지정 = 아군만" 기본값이 `…を1枚まで選び、リムーブする` 류(리무브 선택) 전체에 적용돼 상대 캐릭터를 고를 수 없었다. 리무브 선택은 대상 미지정이면 양쪽 모두 선택 가능으로 되돌리고(`fx.js`), id_0909 데이터에 `own:any` 를 명시. 슬립 등 다른 선택은 v1.8.4 규칙(아군만) 유지.
- 테스트: `npm run test:v19` (`test/v190_test.js` 엔진 깊은 비교 12개 시나리오·난수·다시하기 반복, `test/v190_ws_test.js` 실제 서버+2클라이언트, `test/ui_v19_test.js` PC/모바일 팝업·확인창).


## v1.10.0 — 카드 데이터를 Excel 로 관리 (cards.xlsx = 원본, cards.json = 자동 생성)

### 한눈에 (비개발자용)
**기존 카드 수정**
1. `data/cards.xlsx` 열기
2. `Cards` 시트에서 카드 ID 검색 (Ctrl+F, 예: `id_0831`)
3. 원하는 칸 수정 (색 `color`, `ap`, `lp`, `lv`, 한국어 설명 `extra` …)
4. 저장
5. GitHub 에 올리기(push / 웹에서 파일 교체) → 자동으로 **검증 → cards.json 생성 → Render 재배포 → 게임 반영**.
   잘못 고쳤다면 GitHub 의 **Actions 탭**에 빨간 ✗ 와 함께 `ERROR / 카드 ID / 시트·열·행 / 이유` 가 표시되고, **배포되지 않습니다**(기존 게임은 그대로).

**신탄 추가**
1. 새 이미지 폴더 준비
2. 기존 명령 실행: `python add_new_cards.py "E:\conanTCG\newset"`
3. `data/cards.xlsx` 를 열어 새 카드 행 확인 (자동으로 추가되어 있음 — 내가 Excel 에서 고친 값은 그대로 보존)
4. 필요한 값 수정 후 저장
5. GitHub 에 올리기 (`data/cards.xlsx` 와 `data/cards.json` 을 함께)

> `data/cards.json` 은 직접 고치지 마세요(자동 생성 파일). 고칠 것은 항상 `cards.xlsx` 입니다. 처음 한 번만 `pip install openpyxl` 이 필요합니다(자동 배포 쪽은 GitHub 가 알아서 설치).

### 구조
```
data/cards.xlsx ──(tools/build_cards_from_excel.py: 검증 후 변환)──▶ data/cards.json ──▶ 게임 서버(변경 없음)
      ▲                                                                   │
      └───────(tools/export_cards_to_excel.py: 병합, 신탄 추가 시 자동)────┘
```
* **source of truth = cards.xlsx**. cards.json 은 런타임용 산출물(v1.14.0 부터 이미지 base64 없음 — 경로만). 서버/엔진은 이전과 똑같이 cards.json 만 읽습니다.
* (v1.14.0) 이미지는 실제 파일(`CardImage/<ID>.jpg`)입니다. (v1.16.0: 게임은 이 원본에서 자동 생성한 최적화본 `CardImageWeb/<ID>.webp` 를 읽습니다 — 아래 v1.16.0 참고.) Excel Cards 시트의 **`image_file`** 열이 파일명을 관리하고(고치면 게임에 반영), 빌드할 때 cards.json 의 `file`/`img`(`CardImage/<파일명>`)가 만들어집니다. `img_info`(해상도/용량)는 자동 표시입니다.
* 연결 키는 항상 **카드 ID**. 행 순서/정렬은 바꿔도 됩니다.

### Excel 시트
| 시트 | 내용 |
|---|---|
| `Guide` | 사용법, 머리글 색 설명, 모든 필드의 의미 |
| `Cards` | 카드 1장 = 1행: `id type color lv lv2 ap lp kw trait n fx extra file` (+자동 계산 `ab_count`, 참고용 `img_info`) |
| `Abilities` | 능력(ab) 1개 = 1행: `card_id ab_index ic txt lim cond tgt cost ops …`(현재 DB 에 존재하는 ab 키 전부가 열) |
| `Ops` | 능력 안의 효과(primitive) 1개 = 1행: `card_id ab_index op_index op params`(params = JSON, 하위 ops 포함) |
| `CardExtra` / `Meta` | 위에 없는 추가 카드 필드 / 최상위 항목(`decks` 등)을 잃지 않기 위한 시트 (현재는 비어 있거나 decks 만) |
| `Lists` | 현재 DB 에 실제 존재하는 type/color/ic/op 값 (드롭다운용) |
* 머리글 색: 파랑=연결 키(바꾸지 말 것) / 주황=엔진 동작에 영향 / 초록=표시용 텍스트(`fx` 일본어 원문, `extra` 한국어, `txt`) / 노랑=참고용(`file`) / 회색=자동 계산(무시됨).
* **표시 텍스트와 실행 데이터는 분리**: 한국어/일본어 설명(`fx`, `extra`, `txt`)만 고치면 효과 로직은 바뀌지 않고, `Abilities`/`Ops` 를 고치면 게임 동작이 바뀝니다(현재 엔진이 지원하는 primitive 한정).
* 열 이름을 `#메모` 처럼 `#` 또는 `_` 로 시작하면 변환 시 무시됩니다(메모용).

### 검증 (하나라도 실패하면 배포 중단, 어느 셀인지 표시)
시트/필수 열 누락·중복 열 · ID 누락/중복/형식 · 기존 카드 삭제(실수 방지, 의도한 삭제는 `--allow-delete id_xxxx`) · 카드 수 급감 · type/color/kw 값 · lv/lv2/ap/lp 숫자 형식 및 타입별 필수 값 · 카드명 · Abilities/Ops 가 가리키는 카드/능력 존재 · ab_index/op_index 연속성 · JSON 문법(cond/tgt/cost/params …) · 값 형식(현재 DB 와 같은 형식인지) · `lim` 범위 · **엔진 검증**(`fx.js` 의 cleanAb 로 정리해 비교): 지원되지 않는 효과 primitive, 알 수 없는 trigger(ic), 엔진이 인식하지 못하는 키/값(예: `do:"explode"`) · 이미지 data URL 형식.
* 새 효과 기믹을 문자열로 적는다고 자동 구현되지 않습니다 → `지원되지 않는 효과 primitive` 오류. 그런 로직은 코드 구현이 필요합니다.
* 변환 때마다 **변경 내역**(`변경된 카드: N장 / id / 필드: 이전 → 이후`)을 출력하고 `data/card_changes_report.txt` 에 저장합니다(`data/.gitignore` 로 커밋 제외).

### 명령어
```
python tools/build_cards_from_excel.py            # Excel → cards.json (검증 후)
python tools/build_cards_from_excel.py --dry-run  # 검증 + 변경 내역만 (파일 안 씀)
python tools/build_cards_from_excel.py --check    # Excel 과 cards.json 이 같은지 확인
python tools/export_cards_to_excel.py             # cards.json → Excel (병합: 새 카드만 추가, 내 수정은 보존)
python tools/export_cards_to_excel.py --update-ids id_0123,id_0124   # 이 카드는 JSON 값으로 덮어쓰기
python tools/export_cards_to_excel.py --prefer-json                   # 전부 JSON 값으로 (Excel 수정분 사라짐 — 주의)
python tools/export_cards_to_excel.py --rebuild                       # Excel 을 JSON 에서 새로 생성
```
(`npm run cards:build` / `cards:export` / `cards:check` 도 같음)

### 자동 배포 (GitHub Actions + Render)
* `.github/workflows/build-cards.yml`: `data/cards.xlsx` 가 push 되면 → Python/Node 설치 → **검증+변환** → 성공하면 `data/cards.json` 을 자동 커밋(`[skip ci]`). 실패하면 커밋하지 않음 → Render 는 새 cards.json 을 못 받으므로 **배포 안 됨**. PR 에서는 검증만(dry-run).
* Render 는 `main` 브랜치의 새 커밋(= Actions 가 올린 cards.json)을 감지해 평소처럼 재배포 → 서버가 새 cards.json 을 로드. `render.yaml` 의 `buildFilter` 는 `cards.xlsx` 만 바뀐 커밋에는 배포하지 않도록 합니다(대시보드로 설정했다면 Settings → Build & Deploy → **Build Filters → Ignored Paths** 에 `data/cards.xlsx` 추가).
* Actions 가 커밋하려면 저장소 Settings → Actions → General → Workflow permissions 가 **Read and write** 여야 합니다. 그 직후 로컬에서는 `git pull` 로 새 cards.json 을 받으세요.
* 로컬에서 별도 실행은 필수가 아닙니다(미리 검증해 보고 싶을 때만 `--dry-run`).

### 신탄 추가 연동 / 두 파일이 갈라지지 않게
* `add_new_cards.py` 가 새 카드를 cards.json 에 넣은 뒤 자동으로 ① `cards.xlsx` 에 새 카드 행 추가(기존 행은 Excel 값 유지; `--replace-existing` 로 교체된 ID 는 JSON 값으로 갱신) ② Excel→JSON 빌드로 두 파일을 일치시킵니다. 실패해도 신탄 추가 결과는 안전하며, 안내 메시지에 따라 `export_cards_to_excel.py` 를 수동 실행하면 됩니다.
* `import_cards.py`(전체 새로 만들기)나 `test/recompile_db.py`(ab 재컴파일)처럼 cards.json 을 통째로 바꾸는 도구를 쓴 뒤에는 `python tools/export_cards_to_excel.py --prefer-json` 으로 Excel 을 맞추세요.
* Excel 에서 cards.json 으로의 반영은 "Excel 이 이긴다" 규칙입니다. cards.json 을 직접 고쳤다면 `python tools/build_cards_from_excel.py --check` 가 차이를 알려 줍니다.

### 테스트
`npm run test:cardsxlsx` (= `python3 test/cards_xlsx_test.py`, openpyxl + node 필요): 1,251장 round-trip(바이트 동일, 필드 손실 0, 이미지 보존), 단일/다중 수정, 표시 텍스트만 수정 시 ab 불변, 행 순서 섞기, **Ops 수정 → 엔진에서 실제 동작 변경(드로우 2→3)**, 오류 26종 차단, 병합 export, 신탄 추가 연동, 모호한 값 인코딩, 서버 `validateCards` 통과.

> 참고: `data/color_overrides.json`(v1.8.6)의 카드 색은 서버가 cards.json 위에 덮어써서 읽습니다. 그 파일에 있는 카드의 Excel `color` 를 다르게 고치면 변환 시 경고가 나오니, 그 줄을 지우고 Excel 에서 관리하세요.

## v1.10.1 — id_0886 수정
- 「지정한 캐릭터가 레벨 6 이하인 경우 AP+3000」처럼 이미 지정된 카드를 거르는 조건(`if`/`pick`/`ifLeft` 필터)에 v1.8.4 의 "아군만" 기본값이 적용돼, 지정한 **상대** 캐릭터가 조건 검사에서 항상 탈락하던 버그를 수정했습니다. 테스트: `npm run test:id0886`.

## v1.11.0 — own(소유자) 문맥 분리
`own`(self=내 쪽 / opp=상대 쪽 / any=양쪽)이 **비어 있을 때의 의미**는 필터가 쓰이는 문맥마다 다릅니다. 전역 기본값(self 또는 any) 하나로 처리하던 구조를 없애고 문맥별로 분리했습니다.

| 문맥 | 데이터 위치 | own 이 비어 있으면 |
|---|---|---|
| cost | `ab.cost[]` (굵은 코스트) | **self** (코난 TCG 룰: 굵은 조건/코스트는 [상대] 지정이 없으면 우리 쪽) |
| condition | `ab.cond`, `ifc.cond`, 개수/1枚につき | **self** (같은 룰) |
| target | `ab.ops[]` 의 필드 대상 (`select` 등) | **데이터의 own 을 그대로 사용**. 비어 있으면(끝까지 확정 못한 것) 제한 없음(permissive) + 검증 경고 (op 이름으로 추측하지 않음) |
| conditionCheck | `if` / `ifLeft` / `ifCost` / `ifSelf` | 소유자 제한 없음 (이미 정해진 카드를 검사) |
| zonePick | `pick` / `fetch` / `play` / `look` / `discard` / `paRemove` … | 소유자 제한 없음 (풀의 소유자는 **구역**이 정함. `pick.own` = 어느 쪽 구역, `filter.own` = 그 안에서 다시 거름) |
| triggerSubject | `ab.sf` / `ef` / `tf` | 데이터의 own 을 그대로 사용 (누가 한 행동인지는 `who`) |
| staticTarget | `ab.tgt.filter` | 소유자 제한 없음 (쪽은 `tgt.sel` 이 정함) |

- 제거한 땜질: `select + do:remove → any`, `if/filters → ANY_OWN`, `pick → ANY_OWN`, `ifLeft → 'any'`, `bottomSame` 의 강제 `own:opp`, `any:[…]` 하위 필터의 강제 `own:any`.
- 실제 효과 대상 `select` 등 own 이 비어 있던 데이터 518건(412장)을 아래 순서로 확정해 `own` 을 명시했습니다 (`tools/ownership_migrate.py`, 근거는 `data/ownership_applied.csv`).
  1. **공식 룰북 p.22**: 「『キャラを～枚まで選び』と書かれている効果では、指定のないかぎりどちらの『現場』にいるキャラでも選べ…」 → 대상 절에 `自分の/相手の` 가 없으면 **효과 종류(리무브/슬립/스턴/AP+/키워드 …)와 무관하게 any** (457건).
  2. **카드 원문/구조**: `自分の/相手の` 가 있으면 그 범위, コンタクト중/アクション중 참조 대상(any), 트리거 `who`, 컷인 이벤트의 tid(컷인한 쪽 캐릭터) 등 (61건).
  3. 끝까지 확정할 수 없는 것은 **제한 없음(permissive) + 검증 경고**(플레이를 막지 않음). 현재 데이터에는 0건이라 `data/ownership_review.csv` 는 헤더만 있습니다. 새 카드에 own 이 비어 있으면 경고가 나오고, 그 대상은 양쪽 모두 선택할 수 있습니다 — 확인 후 Excel 의 `filter_own` 열에서 `self/opp/any` 로 정하세요.
- 굵은 코스트/조건 규칙은 그대로입니다 (own 미지정 = self). 코스트에 `scope:any` 가 있는 카드(id_0193/0292/0777/0872/1082/0456/0574/1022/1083/1084)는 풀을 넓힐 뿐 코스트 필터(own:self)가 상대 카드를 걸러 내므로 수정하지 않았습니다(테스트로 확인).
- 검증: `node tools/ownership_audit.js` (own 이 비어 있는 target/주체 필터 목록, `--strict` 면 있을 때 실패). Excel 빌드는 잘못된 own 값을 오류로, 새/수정 카드의 미지정 own 을 경고로 알려 줍니다.
- Excel: Ops 시트의 `filter_own` 열(드롭다운 self/opp/any)이 최상위 효과의 `filter.own` 을 관리합니다. 굵은 조건/코스트의 own 은 Abilities 의 cond/cost JSON 안에 있습니다.
- 신탄 추가(`add_new_cards.py`)는 새 카드의 own 을 같은 방식으로 명시하고, 애매한 항목은 `reports/add-*.ownership_review.csv` 로 남깁니다.
- 숨은 버그도 함께 해결됨: 상대 행동을 보는 트리거(id_0348/0756/1127), 상대에게 적용되는 상시 능력(id_0290/0301), 상대 파트너 에리어 리무브(id_1149) 등이 "기본 self" 때문에 동작하지 않던 문제.
- 테스트: `npm run test:ownership` (= `node test/ownership_contexts_test.js && python3 test/ownership_xlsx_test.py`). 옛 시나리오 테스트용 `CONAN_DEFAULT_OWN=any` 환경변수는 운영에서 쓰지 않습니다.

## v1.12.7 — 손패 공개 트리거(hrev) 공통화 + 사용 여부 팝업 / 카드 상세에 카드명

- **id_1068 등 「손패에서 카드를 공개했을 때」 효과가 반응하지 않던 버그**: `hrev` 이벤트가 일부 효과/코스트 코드에서만 개별 호출되고, 나머지 공개 경로(효과 `revealHand`, 확장 효과 등)에서는 누락되어 있었습니다. 이제 공개 ack(`reveal:1`)가 나오는 공통 지점(`step` → `revealHrev`)에서 한 번에 처리합니다. 공개 순간 그 카드가 공개한 사람의 손패에 있고, 효과의 주인이 그 사람이면 `hrev` 발생. 덱 위/FILE 등 손패 외 공개, 상대 효과로 공개되는 경우는 기존대로 트리거 아님.
- `hrev` 트리거 효과는 실행 전에 **「…의 선언 효과를 사용하시겠습니까?」(예/아니오)** 를 묻습니다(이미 "해도 좋다"인 효과(id_0949 등)는 자체 선택이 있어 제외). 아니오 → 턴 횟수(턴②) 소모 없이 넘어감. 봇은 기존 yn 판단을 그대로 사용.
- 카드 상세(게임 우측 패널, 덱빌더)에 **카드명: ○○** 텍스트 추가 — 이미지 바로 아래, 칩 위. 긴 이름은 줄바꿈.
- 테스트: `test/reveal_trigger_test.js`, `test/card_name_test.js`.

## v1.12.6 — 터치: 손가락을 누른 채 훑으면 상세가 계속 따라 바뀜

- 카드에 손가락을 대고 떼지 않은 채 다른 카드 위로 끌면, 마우스 hover 처럼 오른쪽 상세 패널이 현재 손가락 아래 카드로 즉시 바뀝니다.
- 구현: `pointerdown`/`touchstart` 로 추적 시작 → `pointermove`/`touchmove` 마다 `document.elementFromPoint(x,y).closest('.card,.cc,.dg,.fxi')` 로 실제 좌표 hit-test (event.target 은 암묵적 pointer capture 로 최초 요소라 사용 안 함). 다른 카드면 preview 갱신, 빈 공간은 마지막 preview 유지, 손을 떼면 종료.
- 스크롤이 시작돼 `pointercancel` 이 나와도 `touchmove` 로 계속 추적. 필드/손패/효과팝업 카드에만 `touch-action:none` 적용(전역 preventDefault 없음, 리스너 모두 passive). 선택 팝업·덱빌더처럼 스크롤되는 곳은 스크롤을 그대로 두고 touchmove 로 추적.
- preview 전용: 훑는 동안 선택·등장·공격·대상 지정·덱 추가/삭제 없음. 행동은 기존 tap(click) 그대로.
- 테스트: `test/preview_sweep_test.js`.

## v1.12.5 — 팝업 카드 hover preview / 터치는 "닿는 순간" preview
1. **효과 확인 팝업의 카드 이미지**가 마우스를 올려도 반응하지 않던 원인: 팝업(`#effp`)이 보드 클릭을 막지 않으려고 `pointer-events:none` 이었고, 그 안의 이미지는 일반 카드와 달리 preview 등록(`_pv`)도 없었습니다. → 이미지만 `pointer-events:auto` + 일반 카드와 같은 `_pv`/`pv()` 경로로 연결. 공개 카드 팝업·카드 선택 팝업은 원래 일반 카드(`mk()`)라 hover 가 되고 있어 같은 테스트로 확인. **hover 가 끝나면(팝업 카드에서 벗어나면) hover 전에 보던 preview 로 복귀**합니다.
2. **터치 기기**: 예전에는 카드를 450ms 길게 눌러야 preview 가 떴습니다. 이제 `pointerdown`(닿는 순간, 손 떼기 전)에 바로 오른쪽 상세 패널이 갱신됩니다. 대상: 필드/손패/증거/FILE/리무브 등 `.card`, 효과·공개·선택 팝업 카드, 덱빌더 목록/덱 카드(`.cc`,`.dg`). 닿은 채 움직여도 처음 닿은 카드 preview 유지.
   - **행동 확정은 그대로**: pointerdown 에서는 preview 만 하며 선택/사용/공격/대상 지정은 기존 tap(click) 규칙 유지. `preventDefault` 를 새로 쓰지 않고 passive 리스너라 스크롤/드래그에 영향 없음. (이전에 길게 누른 뒤 click 을 삼키던 처리는 제거)
   - (참고) 현재 모바일 전용 레이아웃(`isMobile()`)은 꺼져 있고 터치 기기도 PC 화면 구성을 쓰므로 위 터치 경로가 실제로 쓰입니다. 모바일 전용 레이아웃을 다시 켤 경우를 대비해 해당 경로에도 pointerdown preview(시트 / 누르는 동안만 보이는 `#pvf`)를 넣어 두었습니다.
- 테스트: `node test/preview_touch_test.js` (`npm run test:preview`, 21개 검사: PC hover/복귀, 터치 pointerdown 즉시 preview, 행동 확정 회귀).

## v1.12.4 — 카드 상세에 특징(trait) badge
- 카드 상세 패널(게임 우측 `#pv`, 덱 빌더 `#dbChips`)의 [종류] [색] [Lv] [AP] [LP/증거] badge 줄에 `data/cards.json` 의 기존 `trait` 를 쉼표로 나눠 **특징마다 badge** 로 표시합니다 (예: [探偵] [毛利探偵事務所] [少年探偵団]). 새 데이터는 만들지 않고, 특징이 없는 카드는 아무것도 표시하지 않습니다. badge 는 자동 줄바꿈, **카드 ID 는 항상 마지막**.
- UI 표시만 변경(게임 로직/카드 효과 무영향). 테스트: `node test/trait_chip_test.js` (특징 1개/여러 개/없음 × PC/모바일 × 게임 패널/덱 빌더).

## v1.12.3 — 다시하기 버튼
- **[이번 턴 다시시작]** 을 행동 버튼 줄에서 상단 바의 **[다시하기] 바로 옆**으로 옮겼습니다(내 턴·`rt` 가능할 때만 표시). 모바일은 상단 메뉴가 접혀 있어 행동 버튼 줄에도 함께 둡니다.
- **봇전에서도 [다시하기] 항상 표시**(진행 중/종료 후): 확인창 후 같은 설정(덱/선후공/연습 모드)으로 새 봇 대전을 시작합니다(기존 [다시 대전] 과 같은 흐름).
- 테스트: `node test/restart_btn_test.js`. (`ui_v19_test` 는 새 위치에 맞게 갱신)

## v1.12.2 — 동적 레벨 조건 / 영문 인쇄명 카드명 조건 (id_0886 · id_0438 · id_0321 · id_0884)
세 가지 구조를 각각 점검했습니다. 재현 테스트: `node test/dynlv_pick_mr_test.js` (`npm run test:dynlv`).

1. **동적 레벨 후 조건 판정 (id_0886 + id_0438)** — 원인: 효과 처리 중 레벨 필터(`lvMax` 등)가 "상시 효과(static)로 변한 레벨"을 빼고 *기본 레벨*로 판정했습니다. id_0438(자기 턴 상대 현장 Lv-1)이 8→7로 만든 뒤 0886 의 액션(-1)으로 6이 돼도 "7"로 보아 AP+3000 이 빠졌습니다. UI 표시만의 문제가 아니라 **전투 AP 계산 자체**가 5000 이었습니다. 수정: 상시 효과 계산(`stat`) 안에서만 재귀 방지를 위해 기본 레벨을 쓰고, 그 밖의 조건 판정/선택 필터는 **현재 레벨(상시 증감 포함)** 로 판정합니다. (0438 Lv8 → 7 → 0886 -1 → 6 → AP 8000, 컨택트에서 상대 리무브까지 확인)
2. **id_0321 복수 후보 선택 / id_0438 이 赤井秀一 로 인식되지 않음** — 원인은 **카드 DB 쪽**: id_0438 의 카드명이 영문 `SHUICHI AKAI` 로 인쇄돼 있어 「赤井秀一」 이름 조건에 걸리지 않았습니다(영문명 5장: id_0260/0261/0438/0628/0843). 그래서 후보가 id_0884 한 장뿐 → 자동 리무브였습니다(선택 로직 자체는 정상). 수정: 엔진의 카드명 조건이 영문 인쇄명을 일본어 카드명으로 매핑하도록 별칭표(`NAME_ALIAS`)를 추가했습니다(카드 데이터는 수정하지 않음). 이제 후보가 2장 이상이면 선택 UI(`sel` = 후보만), 서버가 후보 밖/장수 오류 선택을 거부, 봇은 legal target 안에서만 선택합니다. 후보 1장일 때만 자동 선택.
3. **id_0884 리무브 → 파트너 에리어** — 코드 결함 없음. MR 능력은 「**相手ターン中**に現場を離れる場合」 한정이라, **상대 턴**에 어떤 경로(효과 리무브/손패로/덱 아래로/컨택트 패배/연습 모드 시스템 제거)로 떠나도 파트너 에리어로 갑니다(테스트로 확인). 반대로 id_0321 의 코스트로 **자기 턴**에 리무브하면 카드 텍스트상 리무브 에리어가 맞습니다. (자기 턴에도 파트너 에리어로 보내야 한다면 카드 해석 확인이 필요합니다.)

## v1.12.1 — 연습 모드 강화 (987 강제 전개 + 현장 전부 제거)
v1.12.0 연습 모드의 후반을 "가능하면"이 아니라 "반드시"로 바꿨습니다. (공정한 AI 가 아니라 연습 상황 생성기. 연습 모드 체크 시에만 동작, 사람 vs 사람/OFF 는 무영향)

- **강제 제거 = TRAINING_FORCE_REMOVE** (카드 효과와 완전 분리): 시퀀스가 끝나면 방금 낸 카드의 ab/ops/제거 효과 유무를 전혀 보지 않고 **사람 현장 캐릭터를 전부** 제거합니다(5장→5장, 0장→처리 없음, 우선순위 없음). 제거 후 "현장을 떠났을 때" 같은 반응은 기존 이동/트리거 처리를 그대로 탑니다.
- **제거가 일어나는 턴**: 선공 4턴 이후 매 턴, 후공 3턴 이후 매 턴(이전 "2장/4장/1장" 제거를 전부 제거로 변경).
- **후공도 5턴 이후 계속 반복**: 후공 4턴~ 매 턴 9→힌트→8→힌트→7 + 전부 제거. 선공 5턴~ 동일.
- **건너뛰지 않음**: 등록 덱에 해당 코스트 캐릭터가 한 장이라도 있으면 AI 소유 카드를 모든 구역에서 찾아 회수합니다. 우선순위: 손패 → 덱 → 리무브 → 증거 → FILE → 파트너 에리어 → (상대 구역에 있는 AI 소유 카드). 현장(이미 전개된 카드)은 제외. 새 카드를 만들거나 복제하지 않고 **기존 카드 인스턴스를 이동**만 하므로 한 카드는 항상 한 구역에만 있습니다(정상 게임에서 불가능한 이동도 허용).
- **Expert 로 넘기지 않음**: 시퀀스(카드 확보 → FILE 확보 → 어시스트 → 넥스트 힌트 → 전개 → 제거) 도중 효과 선택(eff)·가드 등 AI 가 답해야 하는 질문만 Expert 가 처리하고, 메인 단계 행동은 스크립트가 이어갑니다. 앞 단계 카드가 정말 없어 힌트로 얻은 기회가 남으면 스킵으로 소모합니다.
- **FILE 부족**: 어시스트 → 넥스트 힌트 → (그래도 부족하면) 리무브/덱/증거에서 FILE 보충(`[TRAINING] FILE N장을 보충했습니다`). 앞으로 쓸 코스트 캐릭터는 보충에 쓰지 않습니다.
- **예외**: 등록 덱에 해당 코스트 캐릭터가 전혀 없을 때만 `[TRAINING] 등록 덱에 9코스트 캐릭터가 없어 강제 전개 불가` 로그 후 그 단계만 생략합니다.
- 스크립트: 선공 1~3턴 2/4/6, 4턴 8→힌트→7, 5턴~ 9→힌트→8→힌트→7 / 후공 1~3턴 3(3코스트가 없으면 2)/5/7, 4턴~ 9→힌트→8→힌트→7. 스크립트가 끝난 뒤 남은 행동은 평소 Expert.
- 테스트: `node test/training_test.js` (`npm run test:training`) — 987 을 리무브/증거/파트너 에리어/FILE/덱으로 흩어놓은 상태, 제거 효과 없는 987 fixture, 후공 5턴 이후 반복, 카드 보존/복제 없음, 건너뜀 허용 없음.

## v1.12.0 — 연습 모드 (Training Script, 강제 전개형) — 초기 버전(위 v1.12.1 에서 강화)
AI(Expert)와 "어시스트를 적극 쓰며 고코스트 캐릭터가 빠르게 전개되는 상황"을 반복 연습하기 위한 **연습용 스크립트**입니다. 공정한 AI 가 아니라 연습 상황 생성기입니다.

- **켜는 법**: 봇 대전 창 → "연습 모드 (강제 전개 스크립트)" 체크 (기본 꺼짐, 범용 Expert 만 해당). 꺼져 있으면 동작은 v1.11.0 과 같습니다. 사람 vs 사람 방은 이 코드를 전혀 거치지 않습니다.
- **구조**: `bot/training.js` 가 Expert 탐색 *앞*에서 AI 의 다음 행동을 정합니다(`bot/controller.js` 훅). 스크립트가 끝나거나 진행할 수 없으면 평소 Expert 가 이어받습니다. 카드 데이터/효과는 수정하지 않습니다.
- **스크립트** (코스트 = 레벨, k = AI 의 k번째 턴):

| | 1턴 | 2턴 | 3턴 | 4턴 | 5턴~ |
|---|---|---|---|---|---|
| AI 선공 | 2 | 4 | 6 | 8 → 넥스트 힌트 → 7, 상대 고코스트 2장 제거 | 9 → 힌트 → 8 → 힌트 → 7, 상대 고코스트 최대 4장 제거 |
| AI 후공 | 3 (덱에 3코스트 캐릭터가 없으면 2) | 5 | 7, 상대 최고 코스트 1장 제거 | 9 → 힌트 → 8 → 힌트 → 7, 최대 4장 제거 | (미지정) 평소 Expert |

  *엔진 규칙상 손패 사용은 턴 1회이고, 추가 사용은 넥스트 힌트로만 얻으므로 8→7, 9→8→7 사이에 힌트가 들어갑니다.*
- **카드 확보**: 필요한 코스트가 손패에 없으면 AI **자신의 덱**에서 손패로 옮깁니다(`[TRAINING] N코스트 전개용 카드 확보`). 카드를 새로 만들지 않습니다. 같은 코스트 후보는 손패 우선 → AP 높은 순 → id 순.
- **어시스트/FILE**: FILE 이 모자라면 먼저 실제 `어시스트` 행동을 합니다. 그래도 모자라면 덱에서 FILE 로 보충합니다(로그). 넥스트 힌트도 실제 `hint` 행동(UI 에 그대로 표시)입니다.
- **강제 제거**: 상대 현장에서 코스트 높은 순(AP/LP/상태 무관, 동률 임의)으로 최대 N장을 `rmChar`(시스템 처리)로 리무브합니다. 제거된 카드 자신의 반응 능력(예: MR 능력)은 평소대로 처리됩니다. 현장이 N장보다 적으면 있는 만큼만 제거.
- 해당 코스트 캐릭터가 덱에 없거나 사용 조건을 못 맞추면 그 단계는 로그를 남기고 건너뜁니다.
- 테스트: `node test/training_test.js` (`npm run test:training`).

## v1.13.0 — CT-P11 유니크 ID 88장 추가 (실제 플레이 가능, 수동 처리 0)
- 입력 이미지 90장(2026-10-06 기준 공개분) 중 DB 에 이미 있는 P001·P004 는 ID 충돌로 건너뛰고(중복 생성 없음), P089/P090/P092 포함 88장을 신규 추가했습니다. 기존 1,251장은 한 글자도 바뀌지 않았고 최종 1,339장입니다(캐릭터 73 / 이벤트 9 / 사건 3 / 파트너 3).
- 새 카드는 기존 파이프라인(`add_new_cards.py --from-json`, `ext_ct11.py`, `ownership_migrate`, xlsx 동기화)으로 들어갔고 이미지는 모든 화면에서 기존 카드처럼 보입니다. 미공개 ID 는 만들지 않았고 패러렐은 별도 카드로 넣지 않았습니다.
- 엔진 공통 확장: 이벤트 증거 합계 조건(evTotMin/Max), 상대 AP 차 트리거(tApLow), 필터 apLowSelf/notMr/costAp, 코스트 슬립 캐릭터 레지스터(costSlept), `pcolor` OR('a|b'), 다색 선택 maxCol, 코스트 stunAny, 오퍼레이션 swapRem/ptnActive/setEvToPa/playMix/ifIdDiff/winGame, trigTgt(deckBottom/hand/opt).
- 버그 수정: 「アクション中のキャラ」(`acting`) 필터가 캐릭터 액션/컨택트 중에도 동작하도록 정리.
- 테스트: `npm run test:ct11` (88장 데이터/이미지/색/KO 텍스트 전수 + 85장 실플레이 스모크 + 위험 카드 개별 시나리오). `test/all_cards_auto.js` 로 전체 효과 카드 manual 0 확인.

## v1.13.1 — 선택지 라벨 한국어화 + 공개 트리거 진단 로그
- id_0947 등 `choose`/선언 버튼의 선택지 문구(lab)가 일본어로 나오던 문제: 37장 83개 라벨을 한국어로 정리했습니다(cards.json·cards.xlsx 동기화). 테스트(`mz_ct11.js` lab-ko)가 전체 DB 의 lab 에 가나가 남지 않았는지 검사합니다.
- id_1068 공개 트리거: 실카드 id_0408 선언(코스트 공개) → 사용 여부 팝업 → 액티브+AP+1000 흐름을 회귀 테스트로 고정했습니다. 조건(내 턴 / 사건 【青&黒】 / FILE 5장 이상 / 턴 2회)이 맞지 않아 발동하지 않으면 게임 로그에 `[공개 트리거] 毛利蘭: 조건 미충족 — …` 로 이유를 남깁니다.

## v1.13.2 — 덱빌더 시리즈/상품 코드 검색 (P01~P11 / D01~D11)
- 검색창에 `P11`, `D01` (대소문자 무관)을 입력하면 해당 시리즈/상품 카드만 표시됩니다. `P11 赤井` 처럼 다른 검색어와 함께 쓰면 AND 조건입니다. 카드명·ID·특징·ap/lp/종류/레벨 등 기존 검색은 그대로입니다. 카드 상세에는 `시리즈 P11` 칩이 추가됩니다.
- 기준은 카드 ID 가 아니라 **카드 이미지 오른쪽 아래에 인쇄된 코드**입니다: `B11xxx` → `P11`(박스), `D01xxx` → `D01`(스타터/덱). 이 값을 카드별 `series` 필드로 `cards.json` 에 저장하고(검색 때 OCR 하지 않음), `cards.xlsx` 의 **Cards 시트 `series` 열**(카드명 바로 옆)에서 확인·수정합니다. Excel 에서 고친 값이 빌드 후 JSON 에 반영되고, `series` 열이 없는 옛 Excel 도 오류 없이 읽히며 기존 값이 유지됩니다.
- 현재 DB: 1,219장에 series 기록(P01~P11, D01~D11 에서 실제 발견된 코드만). 프로모(PR…) 118장·특별(SP) 1장은 박스/덱 시리즈가 아니라서 빈 값으로 두었고 `data/series_review.csv` 에 목록이 있습니다. 판독 불가로 남은 카드는 없습니다.
- 판독 도구: `python tools/series_scan.py <이미지폴더> [--apply]` (tesseract OCR 다수결 + B/D 전용 판독, 애매하면 추측하지 않고 uncertain 목록으로). 새 카드를 `add_new_cards.py` 로 추가하면 같은 방식으로 series 가 자동으로 채워집니다(못 읽으면 빈 값 → Excel 에서 직접 입력).
- 테스트: `npm run test:series` (= `python3 test/series_xlsx_test.py && node test/series_ui_test.js`).

## v1.14.0 — 카드 이미지를 파일로 관리 + 원본 해상도 사용
**왜**: 게임 상세 화면이 cards.json 안의 172×240 base64 썸네일(약 10KB)을 확대해서 흐렸습니다. 이제 `CardImage/` 폴더의 원본 파일(평균 722×977px, 약 230KB)을 그대로 씁니다. 재압축·축소 없음.

**역할 분리**
| 무엇 | 어디 |
|---|---|
| 실제 이미지 파일 | `CardImage/id_0001.jpg …` (프로젝트 루트, 파일명 = 카드 ID) |
| 이미지 파일명 관리 | `data/cards.xlsx` Cards 시트 **`image_file`** 열 (기존 `file` 열을 이 이름으로 연결 — 옛 이름 `file` 도 읽힘) |
| 게임이 읽는 경로 | `data/cards.json` 의 `file`(= image_file) + `img`(`CardImage/id_0001.jpg`). base64 없음 → cards.json 21MB → 1.9MB |
| 제공 | `server.js` 가 `/CardImage/<파일>` 로 정적 제공 (jpg/png/webp 만, ETag/304, 경로 이탈·비이미지는 404). 위치를 바꾸려면 환경변수 `CARD_IMAGE_DIR` |

**Excel 에서 이미지 바꾸기**: 새 이미지를 `CardImage/` 에 넣고 → Cards 시트 `image_file` 에 파일명(예: `id_1068.jpg`)만 적기(폴더/URL 금지) → 평소처럼 빌드/푸시. 검증: 형식(경로·URL·확장자) 오류 / 폴더에 없는 파일 오류 / 깨진 이미지 오류 / 같은 파일 중복·저해상도(짧은 변 500px 미만)·미연결 파일 경고. 오류가 있으면 cards.json 을 만들지 않습니다.

**신탄 추가** (`add_new_cards.py`, `import_cards.py`): 새 이미지는 **원본 그대로** `CardImage/<ID>.<확장자>` 로 복사(재압축 없음) → cards.xlsx 에 `image_file` 기록 → cards.json 에는 경로만. 복사에 실패하면 cards.json 을 쓰지 않습니다.

**화면**: 게임 우측 상세·덱빌더 큰 미리보기·효과 팝업·공개 팝업은 모두 같은 원본 파일을 직접 사용(작은 이미지를 확대하지 않음). 목록/필드/손패는 같은 파일을 CSS 로 작게 표시(덱빌더 목록은 `loading="lazy"`). 파일이 없거나 깨지면(404) 카드명 텍스트로 대체되고 게임은 계속 진행됩니다. 썸네일 구조는 성능 문제가 실제로 생기면 그때 추가합니다.

**도구**
- `python tools/audit_images.py` — 전체 점검(DB 카드 수/파일 수/매칭/이미지 없는 카드/DB 에 없는 파일/중복/파일명 불일치/해상도). 목록은 `data/image_audit.csv`.
- `python tools/migrate_images.py --src <원본폴더> [--apply]` — 이번 1회성 마이그레이션 도구(base64 → 파일). 내용으로 확실히 확정되는 것만 자동 정리하고 애매하면 건드리지 않고 보고. 이번 실행 결과는 `data/image_migration_report.csv`.
- 이번 마이그레이션: `id_1260.jpg` 는 DB 에 없는 ID 였고, 옛 썸네일과 내용이 일치(유사도 0.9998, 유일한 후보)해서 **id_1261(コナンVS怪盗キッド)** 의 이미지로 확정 → `CardImage/id_1261.jpg` 로 추가했습니다(원본 `id_1260.jpg` 는 그대로 남아 있으니 직접 지우셔도 됩니다 — 빌드가 "연결되지 않은 파일" 로 알려 줍니다).
- cards.xlsx 는 보내주신 최신본을 기준으로 **image_file 열(이름·값)과 img_info 만** 바꿨습니다. 다른 셀·서식·Excel 드롭다운은 그대로입니다(XML 직접 수정).
- 배포: `CardImage/` 폴더도 저장소에 함께 올라가야 합니다(약 320MB). `.github` 자동 빌드는 `CardImage/**` 변경도 감지해 image_file 연결을 다시 검증합니다.
- 테스트: `npm run test:images` (= `python3 test/image_files_test.py && node test/image_ui_test.js`).


## v1.15.0 — PvP 관전 모드

**사용법**: 로비의 [입장 (게스트)] 아래 **관전할 방 코드** 입력 + **[👁 관전]**. 대기방(게임 시작 전)도, 진행 중인 게임도 들어갈 수 있고, 7턴째에 들어와도 현재 필드·양쪽 손패·FILE·증거·리무브·파트너·턴을 바로 받습니다. 방을 만들 때 **□ 관전 불가**(기본 해제)를 체크하면 그 방은 관전할 수 없습니다(“이 방은 관전이 허용되지 않습니다.”).

**서버 구조 (`server.js`)**
* 관전자는 플레이어 슬롯(`R.ws[0..1]`)이 아니라 별도 배열 `R.spec` 로 관리합니다(소켓은 `ws.spec = true`, `ws.seat` 없음, 최대 30명). 플레이어 토큰/resume 과 무관합니다.
* **state 분리**: 플레이어는 기존 `view(R, seat)` 그대로(자기 손패 = 카드 목록, 상대 손패 = 숫자). 관전자는 별도 `viewSpec(R)` 만 받으며, 여기에만 양쪽 손패 전체가 들어갑니다(덱 순서·뒷면 세트 카드·준비 전 파트너/사건은 비공개 유지). 플레이어에게 상대 손패 데이터는 보내지 않습니다.
* **읽기 전용**: 관전 소켓이 보내는 메시지는 `leaveRoom` 외 전부(act·ready·restartGame·restartTurn·create·join·resume …) 서버가 “관전자는 조작할 수 없습니다.” 로 거부합니다. `acts` 는 항상 비어 있습니다.
* **관전 불가**: `create` 의 `noSpec` 를 서버가 `R.noSpec` 로 저장하고 `spectate` 때마다 서버에서 검사합니다(WebSocket 직접 호출로 우회 불가). 다시하기(`resetRoom`) 후에도 `R.spec`·`R.noSpec` 는 유지됩니다.
* **브로드캐스트**: `bc(R)` 가 플레이어에게 보낸 뒤 관전자에게 `viewSpec` 을 보냅니다(카드 등장·이동·공격·AP·효과·FILE·증거·제거·턴·종료 모두 동일 경로). 다시하기/이번 턴 다시시작/defs 도 관전자에게 전달됩니다.
* **수명**: 관전자가 나가거나 끊겨도 게임·플레이어 연결·방 수명에 영향 없음(`endSeat`/유예 타이머를 거치지 않음). 두 플레이어가 모두 나가 방이 사라질 때만 관전자에게 안내하고 로비로 돌려보냅니다. 봇 대전·연습 방은 관전할 수 없습니다.

**화면 (`index.html`)**: 기존 게임판을 그대로 쓰고, 상단에 `👁 관전 중` 표시, 플레이어 1/2 표기, 양쪽 손패 앞면, 행동 버튼·다시하기·덱 등록·항복 숨김. hover/터치 미리보기·우측 상세는 그대로 동작합니다. 관전 연결이 끊기면 자동으로 다시 관전 입장합니다.

**테스트**: `npm run test:spectator` (= `test/spectator_test.js` WebSocket 34항목 + `test/spectator_ui_test.js` 브라우저 3~5창 22항목).


## v1.16.0 — 게임용 웹 최적화 이미지 (CardImageWeb)

**원본(`CardImage/`)은 절대 수정하지 않습니다.** 게임이 쓰는 이미지는 원본에서 따로 만든 `CardImageWeb/<ID>.webp` 입니다.

| 폴더 | 내용 | 용도 |
|---|---|---|
| `CardImage/` | 고해상도 원본 (id_0001.jpg …) | 보존용 · 새 카드를 넣는 곳 |
| `CardImageWeb/` | WebP 최적화본 (id_0001.webp …) + `.manifest.json` | 게임/덱빌더가 사용 |

**생성 규칙**: 긴 변(세로 카드는 세로)이 1200px 를 넘을 때만 비율 유지로 축소(원본이 더 작으면 그대로, 확대 금지) · WebP quality 85(method 6) · 파일명은 원본과 같은 ID.

```
python tools/make_web_images.py              # 새로 추가됐거나 바뀐 원본만 (이미 최신이면 건너뜀)
python tools/make_web_images.py --check      # 만들지 않고 할 일만 보고
python tools/make_web_images.py --force      # 전부 다시
python tools/make_web_images.py --quality 88 # 화질 올리기 (설정이 바뀌면 자동으로 전부 다시 생성)
python tools/make_web_images.py --prune      # 원본이 없어진 최적화본 삭제
```
필요: `pip install pillow`. 원본이 최적화본보다 새로 바뀌었거나(수정 시각·파일 크기) 설정이 바뀌면 자동으로 다시 만듭니다.

**연결(cards.xlsx)**: Cards 시트의 `image_file`(원본 파일명)이 그대로 기준입니다. 최적화본 이름은 같은 ID 에 확장자만 `.webp` 로 바뀌므로 Excel 에 따로 적을 열이 없고, cards.json 의 `img` 는 자동으로 `CardImageWeb/<ID>.webp` 가 됩니다(Excel 파일은 바뀌지 않았습니다).
**새 카드**: `add_new_cards.py`/`import_cards.py` 가 원본을 `CardImage/` 에 복사하면서 최적화본도 같이 만듭니다. GitHub 에 원본만 올려도 Actions 가 `CardImageWeb` 를 만들어 커밋합니다.
**안전장치**: 최적화본이 아직 없으면 서버가 같은 ID 의 원본으로 대신 응답합니다(이미지가 안 뜨는 일 없음, 임시본은 캐시하지 않음).

**로딩 속도**
* 서버: `/CardImageWeb/*` 는 `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` + ETag(304). 같은 브라우저로 다시 열면 이미지는 네트워크 없이 캐시에서 나옵니다(테스트: 208장 → 다운로드 0건). 첫 로드에서 같은 이미지를 두 번 받는 일도 없습니다(0건).
* 덱빌더 목록은 이미 `loading="lazy"` 라 처음에는 화면 근처 약 200장(전체 1339장의 16%)만 받습니다. 게임 필드/손패는 lazy 를 쓰지 않습니다(늦게 뜨는 것 방지).
* 대전 카드 정의(`defs`)가 도착하면 두 덱의 카드 이미지를 미리 받아 둡니다(최대 ~30장, 각 1회) → 상대가 카드를 낼 때 이미지가 늦게 뜨지 않습니다.

**테스트**: `npm run test:webimg` (= `python3 test/web_image_test.py` 생성기 규칙·증분 재생성·원본 보존 + `node test/web_image_ui_test.js` 서버/캐시/중복 다운로드/lazy/미리 받기).
