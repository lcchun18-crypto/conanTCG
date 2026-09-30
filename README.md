# 명탐정 코난 TCG 시뮬레이터

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
- 자동 처리 못 하는 문장은 `manual` 로 남고, 발동 시 로그에 `⚠ [수동 처리 필요]`가 표시됩니다(오른쪽 '효과 도구'로 처리).
- 카드 편집 화면에서 `효과 데이터(JSON)`를 직접 고칠 수 있습니다. 목록의 ✅=자동, △=일부 수동, ⚠=효과 데이터 없음.

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
* `--effects-only [기존.json]` : 이미지 인식(1단계)을 **다시 하지 않고** 저장된 원문(일/한)·썸네일로 효과 JSON(2단계, 텍스트만 전송)만 재생성. 인자를 생략하면 `--out` 파일을 읽어 갱신(덮어쓰기 전에 `*.before-effects.json` 백업). 색 판별도 저장된 썸네일로 다시 수행.
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
- 로그는 왼쪽 열(접기/펼치기, 좁은 화면은 기본 접힘). 개발자 도구(효과 도구/리무브 목록)는 숨김: `?dev=1` 또는 Shift+D.
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
