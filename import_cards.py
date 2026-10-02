#!/usr/bin/env python3
"""카드 이미지 폴더 → 시뮬레이터용 카드 DB(JSON) 변환기 (Claude 비전 사용, 중단 후 재개 가능)

1단계(이미지): 이름/종류/색/레벨/AP/LP/특징/효과 원문을 읽는다.
2단계(텍스트): 효과 원문을 시뮬레이터 엔진이 실행하는 '효과 데이터(ab)'로 바꾼다.
             바꿀 수 없는 문장은 manual 로 남겨 게임 중 사람이 처리한다(엉뚱하게 자동 처리하지 않음).

사용법:
  pip install anthropic pillow
  export ANTHROPIC_API_KEY=sk-ant-...
  python import_cards.py ./card_images --out conan-db.json --limit 20      # 먼저 20장만 시험
  python import_cards.py ./card_images --out conan-db.json                 # 전체 (중단 후 다시 실행하면 이어서)
  옵션: --id-regex "^([A-Z]\\d+)"  파일명에서 카드 ID 추출 / --model, --struct-model / --no-struct(효과 구조화 생략)
        --dry-run  API를 호출하지 않고 보낼 요청의 형태만 출력 / 오류 전문은 <out>.errors.log 에도 저장
결과 conan-db.json 을 시뮬레이터 [📚 카드/덱 관리] → 가져오기 로 불러오세요.
같은 폴더에 conan-db.review.csv(사람이 확인할 카드 목록), conan-db.effects.txt(효과 문장 패턴 통계)도 만들어집니다."""
import argparse, base64, collections, csv, io, json, re, sys, threading, time, traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
try:
    import anthropic
except ImportError:  # --dry-run 은 SDK 없이도 동작
    anthropic = None
from PIL import Image
try:
    import effect_rules  # 규칙 기반 효과 변환기(같은 폴더)
except ImportError:
    effect_rules = None

for _st in (sys.stdout, sys.stderr):  # Windows 콘솔(cp949 등)에서 일본어/한글 출력으로 죽지 않도록
    try: _st.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

CACHE_VER = "v3"  # 이전 버전(v1,v2) 캐시는 오류 결과가 섞여 있을 수 있어 사용하지 않는다
COLORS = ["red", "blue", "green", "yellow", "purple", "white", "black"]
S = {"type": "string"}

# ───────────────────────── 1단계: 이미지 읽기 ─────────────────────────
GLOSSARY = """[게임 용어 사전 — 글자를 정확히 읽는 데 참고만 하세요. 카드에 적혀 있지 않은 용어를 절대 출력하지 마세요]
手札(손패) 現場(현장) 証拠(증거) 事件(사건) 事件編/解決編 FILEエリア リムーブ(リムーブエリア) デッキ 登場 スリープ スタン アクティブ パートナー キャラ イベント
迅速 突撃 ブレット ミスリード カットイン 変装 ヒラメキ 宣言 ターン① ターン② 自分ターン中 相手ターン中 現場リムーブ時 登場時 コンタクト アクション 推理 LP AP レベル
자주 오독되는 글자: 手札(×手紙/手銃) リムーブ(×リームーブ/リープ) スリープ(×スリーブ) 証拠(×証城/証閣) 現場(×場所/領地) ヒラメキ(×ビラメキ)"""
SYS1 = ("너는 '명탐정 코난 트레이딩 카드 게임' 카드 이미지를 읽어 정확한 데이터로 옮기는 도우미다. "
        "이미지에 실제로 보이는 것만 기록하고, 보이지 않는 값은 추측하지 말고 빈 문자열로 둔다. 반드시 card 도구로만 답한다.\n" + GLOSSARY)
TOOL1 = {"name": "card", "description": "카드 1장의 정보를 기록한다", "input_schema": {"type": "object", "required": ["name", "type", "color", "fx_ja"], "properties": {
    "name": {**S, "description": "카드 이름 (일본어 원문)"},
    "type": {"type": "string", "enum": ["partner", "char", "event", "case"], "description": "카드 종류 — 카드에 인쇄된 프레임/레이아웃/숫자 배치로만 판단한다. 효과 텍스트 안의 'パートナー' 'パートナーエリア' '【パートナー(色)】' 같은 단어는 능력 표기일 뿐 카드 종류와 무관하다(캐릭터 카드에도 흔히 쓰인다). キャラ=char, イベント=event, 事件=case, パートナー=partner(레벨 배지·AP가 없고 LP만 있는 전용 레이아웃일 때만)"},
    "observed": {"type": "object", "description": "카드 종류 판정의 근거: 이미지에 실제로 보이는 인쇄 요소만 true/false 로 기록한다(효과 문장은 근거가 아니다)", "properties": {
        "landscape": {"type": "boolean", "description": "카드가 가로 방향(사건 카드 레이아웃)인가"},
        "level_badge": {"type": "boolean", "description": "좌상단에 동그란 레벨(또는 사건 색) 배지 숫자가 있는가"},
        "ap": {"type": "boolean", "description": "하단 왼쪽에 큰 AP 숫자가 있는가"},
        "lp": {"type": "boolean", "description": "하단 오른쪽 열쇠구멍 안 LP 숫자가 있는가"},
        "case_marks": {"type": "boolean", "description": "'先' '後' 사건레벨 표기가 있는가"},
        "printed_kind": {"type": "string", "description": "카드 자체에 인쇄된 종류 표기(예: キャラ/イベント/事件/パートナー)가 보이면 그대로, 없으면 빈 문자열. 효과 텍스트 상자 안의 글자는 제외"}}},
    "color": {"type": "string", "enum": COLORS + [""], "description": "카드의 색. 캐릭터/이벤트는 카드 테두리(프레임)와 좌상단 레벨 배지의 색, 사건 카드는 좌상단 동그란 색 아이콘의 색. 2색이면 'red/blue' 처럼 /로 연결. 사진 속 옷 색이 아니라 프레임 색을 본다. 주황/금색 프레임은 yellow"},
    "lv": {**S, "description": "좌상단 레벨 숫자. 사건 카드는 '先'(선공) 옆 사건레벨 숫자. 없으면 빈 문자열"},
    "lv2": {**S, "description": "사건 카드만: '後'(후공) 옆 사건레벨 숫자. 그 외 빈 문자열"},
    "ap": {**S, "description": "AP(캐릭터 하단 왼쪽의 큰 숫자, 예 4000). 없으면 빈 문자열"},
    "lp": {**S, "description": "LP(하단 오른쪽 열쇠구멍 안 숫자). 없으면 빈 문자열"},
    "trait": {**S, "description": "카드에 적힌 특징(이름 위/옆의 작은 라벨들)을 쉼표로 나열. 예: 高校生,探偵. 없으면 빈 문자열"},
    "fx_ja": {**S, "description": "텍스트 박스에 실제로 적힌 문장을 일본어 원문 그대로 옮긴다(줄바꿈은 그대로). 아이콘은 아이콘 안/옆의 글자를 【】로 감싸 표기한다. 주석문 '(…)'도 포함. 텍스트가 없으면 빈 문자열. 이미지에 없는 문장이나 아이콘을 만들어 넣지 말 것"},
    "fx_ko": {**S, "description": "위 효과 텍스트의 한국어 번역"}}}}
FIX = {"手紙": "手札", "手銃": "手札", "リームーブ": "リムーブ", "スリーブ": "スリープ", "ビラメキ": "ヒラメキ", "ひらめき": "ヒラメキ", "証城": "証拠", "証閣": "証拠", "蒸閣": "証拠"}
LEGEND = "【登場時】【宣言】【カットイン】"  # 예전 버전의 유출 문자열이 다시 나오면 오류로 간주


def prep(p, send_px, crop_px, thumb_px):
    im = Image.open(p).convert("RGB")
    full = im.copy(); full.thumbnail((send_px, send_px))
    w, h = im.size; box = im.crop((0, int(h * 0.55), w, h)); box.thumbnail((crop_px, crop_px))  # 텍스트 박스가 있는 아래쪽을 크게 한 번 더
    def b64(x, q=88):
        b = io.BytesIO(); x.save(b, "JPEG", quality=q); return base64.b64encode(b.getvalue()).decode()
    t = im.copy(); t.thumbnail((thumb_px, thumb_px)); b = io.BytesIO(); t.save(b, "JPEG", quality=60)
    return b64(full), b64(box), "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode(), im


import card_color as CC


# 이전 API 호환(테스트/외부 스크립트용): 내부 구현은 전부 card_color.py
def card_color(im):
    r = CC.detect(im); return r["color"], r["source"]


def badge_color(im):
    bc, conf, _n = CC.badge_color(im, False); return ("/".join(bc), conf) if bc else ("", conf)


def badge_hist(im):
    bc, conf, _n = CC.badge_color(im, False); return [("/".join(bc), conf)] if bc else []


def ring_color(im):
    oc, _c, _n = CC.outer_ring_color(im); return "/".join(oc)


def check_color(d, im):
    """카드 색 판별: 1) 좌상단 FILE 원 배경 → 2) 프레임 고정 색 영역 → 3) 보조 마커(바깥 테두리) → 4) 모델/OCR/API 색(마지막).
    일러스트 분위기·옷 색·배경색은 쓰지 않는다(card_color.py 참고). 6색 체계 유지.
    - 모델 색이 비어 있으면 픽셀 색으로 채운다.
    - 픽셀 색이 '확실(certain)'하고 모델 색(단일색)과 다르면 픽셀 색으로 교정하고 flags 에 남긴다(우선순위 1~3 > 4).
    - 확실하지 않으면 값은 건드리지 않고 '색 불일치' 로만 표시한다."""
    r = CC.detect(im, d.get("type", "")); pc, src = r["color"], r["source"]; mc = d.get("color", "")
    if not pc:
        if not mc: d["flags"].append("색 없음")
        return
    if not mc: d["color"] = pc; d["flags"].append(f"색을 픽셀로 보정({pc}, 근거={src})"); return
    if set(pc.split("/")) == set(mc.split("/")): return
    if r["certain"] and "/" not in mc and "/" not in pc:
        d["flags"].append(f"색 자동 교정: 모델={mc} → {pc} (FILE 원 기준, 신뢰도 {r['conf']:.2f})"); d["color"] = pc; return
    if src == "badge": d["flags"].append(f"색 불일치: 모델={mc} 픽셀={pc} (신뢰도 {r['conf']:.2f})")
    elif not set(pc.split("/")) & {"white", "black"}:   # 프레임/테두리 기준의 흰·검은 틀 색일 뿐이라 표시하지 않는다(FILE 원이 없을 때의 보조 근거)
        d["flags"].append(f"색 불일치({'프레임' if src=='band' else '테두리'} 기준·참고만, FILE 원 판별 불가): 모델={mc} 픽셀={pc}")


# ───────────────────────── API 호출 계층 ─────────────────────────
# 주의: Sonnet 5.5 / Opus 5.5 / Fable 5.1 / Mythos 5.1 은 tool_choice 의 "tool"·"any"(강제 호출)를 400 으로 거부한다.
#       그래서 tool_choice 는 "auto" 로 두고, 응답에서 tool_use 를 꺼내며, 도구 모드 자체가 거부되면 JSON 텍스트 모드로 자동 전환한다.
#       thinking 옵션은 보내지 않는다(모델 기본값 사용).
LOCK = threading.Lock(); STOP = threading.Event(); ERRLOG = None
STATE = {"mode": "tool"}  # tool → json (도구 모드가 형식 오류로 거부되면 전환)


class ApiFail(Exception):
    def __init__(self, detail, status=None): super().__init__(detail); self.detail = detail; self.status = status


class Skipped(Exception):
    pass


def log(msg):
    with LOCK:
        print(msg, file=sys.stderr, flush=True)
        if ERRLOG:
            try:
                with open(ERRLOG, "a", encoding="utf-8") as f: f.write(msg + "\n")
            except Exception: pass


def err_detail(e):
    """오류 전문(잘라내지 않음): 예외 종류, HTTP 상태, 응답 본문, request_id"""
    sc = getattr(e, "status_code", None); parts = [type(e).__name__ + (f" (HTTP {sc})" if sc else "")]
    body = getattr(e, "body", None)
    if body is None:
        r = getattr(e, "response", None); body = getattr(r, "text", None) if r is not None else None
    if body is not None and not isinstance(body, str):
        try: body = json.dumps(body, ensure_ascii=False)
        except Exception: body = str(body)
    parts.append(body if body else str(e))
    rid = getattr(e, "request_id", None)
    if rid: parts.append(f"request_id={rid}")
    return " | ".join(parts)


def is_retryable(e):
    sc = getattr(e, "status_code", None)
    if sc is not None: return sc in (408, 409, 429, 500, 502, 503, 504, 529)
    return type(e).__name__ in ("APIConnectionError", "APITimeoutError") or isinstance(e, (ConnectionError, TimeoutError))


def send(cli, payload, tag):
    for k in range(6):
        if STOP.is_set(): raise Skipped("앞선 오류로 작업이 중단되었습니다")
        try: return cli.messages.create(**payload)
        except Exception as e:
            detail = err_detail(e)
            if is_retryable(e) and k < 5:
                hdr = getattr(getattr(e, "response", None), "headers", None); ra = None
                try: ra = float(hdr.get("retry-after")) if hdr and hdr.get("retry-after") else None
                except Exception: ra = None
                wait = min(ra if ra else 2 ** (k + 1), 60); log(f"[재시도 {k + 1}/5] {tag}: {detail} → {wait:.0f}초 후")
                time.sleep(wait); continue
            raise ApiFail(detail, getattr(e, "status_code", None)) from e
    raise ApiFail("재시도 횟수를 초과했습니다")


def text_of(resp): return "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text")


def tool_input(resp, name):
    for b in resp.content:
        if getattr(b, "type", None) == "tool_use" and getattr(b, "name", None) == name and isinstance(getattr(b, "input", None), dict): return dict(b.input)
    return None


def parse_json(text):
    t = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip(); i, j = t.find("{"), t.rfind("}")
    if i < 0 or j <= i: return None
    try: d = json.loads(t[i:j + 1]); return d if isinstance(d, dict) else None
    except Exception: return None


def _valid(d, tool): return isinstance(d, dict) and all(k in d for k in tool["input_schema"].get("required", []))


def _ask_tool(cli, model, system, content, tool, max_tokens, tag):
    name = tool["name"]; payload = {"model": model, "max_tokens": max_tokens, "system": system, "tools": [tool], "tool_choice": {"type": "auto"},
        "messages": [{"role": "user", "content": content + [{"type": "text", "text": f"결과는 반드시 `{name}` 도구를 호출해서 답하세요. 다른 텍스트는 쓰지 마세요."}]}]}
    for _ in range(3):
        resp = send(cli, payload, tag); d = tool_input(resp, name)
        if _valid(d, tool): return d
        if getattr(resp, "stop_reason", None) == "max_tokens": payload["max_tokens"] = min(payload["max_tokens"] * 2, 16000); continue
        d = parse_json(text_of(resp))
        if _valid(d, tool): return d
    raise ApiFail(f"{tag}: 응답에 `{name}` 도구 호출(또는 JSON)이 없습니다 (stop_reason={getattr(resp, 'stop_reason', None)})")


def _ask_json(cli, model, system, content, tool, max_tokens, tag):
    ins = "응답은 JSON 객체 하나만 출력하세요(코드블록·설명 금지). 스키마(JSON Schema): " + json.dumps(tool["input_schema"], ensure_ascii=False)
    sysv = (system + "\n\n" + ins) if isinstance(system, str) else list(system) + [{"type": "text", "text": ins}]
    payload = {"model": model, "max_tokens": max_tokens, "system": sysv, "messages": [{"role": "user", "content": content}]}
    for _ in range(3):
        resp = send(cli, payload, tag); d = parse_json(text_of(resp))
        if _valid(d, tool): return d
        if getattr(resp, "stop_reason", None) == "max_tokens": payload["max_tokens"] = min(payload["max_tokens"] * 2, 16000)
    raise ApiFail(f"{tag}: 응답을 JSON 으로 해석하지 못했습니다")


def ask(cli, model, system, content, tool, max_tokens, tag):
    while True:
        mode = STATE["mode"]
        try: return (_ask_tool if mode == "tool" else _ask_json)(cli, model, system, content, tool, max_tokens, tag)
        except ApiFail as e:
            if mode == "tool" and e.status in (400, 422) and re.search(r"tool|thinking|strict|schema|output_config", e.detail, re.I):
                log(f"[경고] 도구 모드 요청이 거부되어 JSON 텍스트 모드로 전환합니다. 오류 전문: {e.detail}"); STATE["mode"] = "json"; continue
            raise


def card_content(full, box):
    img = lambda b: {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b}}
    return [img(full), {"type": "text", "text": "위는 카드 전체, 아래는 텍스트 박스 확대입니다."}, img(box), {"type": "text", "text": "이 카드를 기록해줘."}]


# ───────────────────────── 카드 종류 판정 (효과 텍스트와 완전히 분리) ─────────────────────────
KINDS = ("partner", "char", "event", "case")


def classify_type(obs, geom_landscape=None):
    """카드 종류를 '인쇄된 카드 자체'의 관측값만으로 판정한다. → (type | None, 근거 문자열)
    obs: {landscape, level_badge, ap, lp, case_marks, printed_kind} 중 아는 것만 (None=모름).
    ※ 이 함수는 효과 텍스트(fx_ja/fx_ko)를 인자로 받지 않는다 → 효과 문장 때문에 결과가 바뀔 수 없다(구조적 차단)."""
    o = {k: (obs or {}).get(k) for k in ("landscape", "level_badge", "ap", "lp", "case_marks")}
    pk = str((obs or {}).get("printed_kind") or "")
    if geom_landscape is not None and o["landscape"] is None: o["landscape"] = geom_landscape
    for kind, rx in (("partner", r"^パートナー$|^partner$"), ("char", r"^キャラ(?:クター)?$|^char$"), ("event", r"^イベント$|^event$"), ("case", r"^事件$|^case$")):
        if re.search(rx, pk.strip(), re.I): return kind, f"카드에 인쇄된 종류 표기: {pk.strip()}"
    if o["landscape"] or o["case_marks"]: return "case", "가로 레이아웃/先後 표기"
    if o["ap"]: return "char", "AP 숫자가 있음"
    if o["level_badge"] and o["lp"]: return "char", "레벨 배지 + LP"
    if o["level_badge"] and o["lp"] is False: return "event", "레벨 배지만 있고 AP/LP 없음"
    if o["level_badge"] is False and o["ap"] is False and o["lp"]: return "partner", "레벨 배지·AP 없이 LP만 있는 파트너 레이아웃"
    if o["level_badge"] and o["ap"] is None and o["lp"] is None: return None, "레벨 배지만 관측됨(AP/LP 모름)"
    return None, "관측 부족"


def fields_obs(d):
    """저장된 카드 필드(레벨/AP/LP/후공 레벨 = 카드에서 읽은 숫자)에서 관측값을 복원한다. 효과 텍스트는 보지 않는다."""
    has = lambda k: bool(str(d.get(k) or "").strip())
    return {"level_badge": has("lv"), "ap": has("ap"), "lp": has("lp"), "case_marks": has("lv2")}


def decide_type(declared, obs=None, geom_landscape=None, fields=None):
    """모델이 말한 type(declared)과 관측/필드 근거를 합쳐 최종 종류와 근거를 정한다. → (type, 근거, 플래그[])
    관측 근거가 있으면 근거가 이기고(모델과 다르면 '종류 보정' 플래그), 근거가 부족할 때만 모델 값을 쓴다.
    파트너는 '레벨 배지·AP 없음 + LP 있음' 근거가 있을 때만 인정한다."""
    flags = []; decl = declared if declared in KINDS else None
    t, why = classify_type(obs, geom_landscape)
    if t is None and fields is not None:
        # 필드(숫자) 근거는 약하다(OCR 누락 가능): '파트너라는데 레벨/AP가 있음' 같은 명백한 모순을 바로잡거나 모를 때 채울 뿐, 그 외의 모델 판정은 뒤집지 않는다
        t2, why2 = classify_type(fields_obs(fields), geom_landscape)
        if t2 is not None and (decl in (None, "") or t2 == decl or (decl == "partner" and t2 != "partner")): t, why = t2, "저장된 카드 필드: " + why2
    if t is None:
        if decl == "partner": return "char", "근거 부족: 파트너는 레이아웃 근거가 있을 때만 인정 → char", ["종류 근거 부족(모델=partner) → char 로 처리"]
        if decl: return decl, "모델 판정(근거 부족)", flags
        return "char", "종류 불명 → char", ["종류 불명 → char 로 처리"]
    if decl and decl != t: flags.append(f"종류 보정: 모델={decl} → {t} ({why})")
    return t, why, flags


def norm1(d):
    """모델 출력을 안전한 문자열/enum 으로 정리 (필드 누락·엉뚱한 값이 있어도 죽지 않음)"""
    o = {k: ("" if d.get(k) is None else str(d.get(k))) for k in ("name", "color", "lv", "lv2", "ap", "lp", "trait", "fx_ja", "fx_ko")}
    ob = d.get("observed") if isinstance(d.get("observed"), dict) else {}
    o["observed"] = {k: (ob.get(k) if isinstance(ob.get(k), bool) else None) for k in ("landscape", "level_badge", "ap", "lp", "case_marks")}; o["observed"]["printed_kind"] = str(ob.get("printed_kind") or "")[:20]
    o["declared_type"] = d.get("type") if d.get("type") in KINDS else ""; o["type"] = o["declared_type"] or "char"; o["flags"] = []  # 최종 type 은 read_card 에서 decide_type 으로 확정
    if not o["declared_type"]: o["flags"].append(f"종류 불명({d.get('type')!r}) → 관측 근거로 판정")
    o["color"] = "/".join(c for c in re.split(r"[/,&\s]+", o["color"].lower()) if c in COLORS)
    if not o["name"].strip(): o["flags"].append("이름 없음")
    return o



def apply_type(d, landscape=None):
    """d['type'] 을 근거 기반으로 확정하고 근거를 d['type_basis'] 에 남긴다(효과 텍스트는 보지 않는다). 기존 플래그는 유지."""
    declared = d.get("declared_type") or d.get("type")
    t, why, fl = decide_type(declared, d.get("observed"), landscape, fields=d)
    d["declared_type"] = declared if declared in KINDS else ""; d["type"] = t; d["type_basis"] = why
    d["flags"] = [f for f in d.get("flags", []) if not f.startswith("종류")] + fl
    return d


def read_card(cli, model, p, cache, a):
    cf = cache / f"{CACHE_VER}_{p.stem}.json"
    if cf.exists():
        d = json.loads(cf.read_text("utf-8")); apply_type(d); return d  # 예전 캐시(종류를 모델이 정해 둔 것)도 카드 필드 근거로 다시 판정 — API 재호출 없음
    full, box, thumb, im = prep(p, a.send_px, a.crop_px, a.thumb_px); d = None
    for attempt in range(3):
        d = ask(cli, model, SYS1, card_content(full, box), TOOL1, 4096, p.name)
        if LEGEND in str(d.get("fx_ja") or "") and len(str(d.get("fx_ja"))) < 120 and attempt < 2: continue  # 유출 문자열 재시도
        break
    d = norm1(d)
    for bad, good in FIX.items(): d["fx_ja"] = (d.get("fx_ja") or "").replace(bad, good)
    d["img"] = thumb; d["file"] = p.name
    apply_type(d, im.size[0] > im.size[1])
    if d["type"] in ("char", "event", "case"): check_color(d, im)
    cf.write_text(json.dumps(d, ensure_ascii=False), "utf-8"); return d


# ───────────────────────── 2단계: 효과 문장 → 효과 데이터 ─────────────────────────
SPEC = r"""너는 '명탐정 코난 카드 게임'의 카드 효과 텍스트를, 게임 엔진이 실행하는 JSON 효과 데이터로 바꾸는 변환기다.
입력은 카드 텍스트(OCR 결과라 오독이 있을 수 있음: 手紙→手札, リームーブ→リムーブ, スリーブ→スリープ 등은 문맥으로 바로잡아 해석)다.
반드시 abilities 도구로 답한다. 확신이 없는 문장은 추측하지 말고 {"op":"manual","txt":"그 문장"} 으로 남긴다(엉뚱한 자동 처리보다 수동 처리가 낫다).

## 능력 1개(ability)의 형식
{"ic":종류, "cond":{...}, "lim":0|1|2, "cost":[...], "ops":[...], "v":숫자, "on":{"k":"char|case","by":"contact|effect"}, "lab":"짧은 이름", "txt":"원문 문장"}
ic(발동 시점):
 onplay=【登場時】 / onremoved=【現場リムーブ時】 / flash=【ヒラメキ】(証拠からリムーブされるとき) / declare=【宣言】(메인 페이즈에 스스로 사용, 코스트는 ':' 앞)
 static=상시 효과(트리거 문구 없이 "AP+N" 등) / cutin=【カットイン】(コンタクト 중 손패에서 리무브해 사용) / onact="このキャラがアクションしたとき"(on.k: アクション【キャラ】=char, 【事件】=case)
 oncontact="このキャラがコンタクトしたとき" / onreason="このキャラが推理したとき" / onend="ターン終了時" / ondisguise=【変装時】 / event=イベントカードの효과 / manual=위 어디에도 안 맞는 능력
 onhint="自分がネクストヒントで手札を使用したとき"(ops 안에서 lvMax:"used" = 그 사용한 카드의 레벨)
 onkill="相手の現場のキャラがこのキャラとのコンタクトによってリムーブされたとき"
 onally="キャラが自分の現場に登場したとき"(on.by:"effect"=能力や効果によって, ef:등장한 캐릭터 필터, ops 에서 op:"ent" 가 그 등장한 캐릭터를 가리킨다)
 enter="このキャラはスリープ状態で登場する"(추가 필드 st:"s") / hand="手札にあるこのキャラはレベルNになる"(추가 필드 lv:N, cond.fieldMin 등)
 grant="이 이벤트がセットされているキャラは「…」を持つ"(추가 필드 g:{부여되는 능력 1개}) — 「」 안의 능력을 g 에 그대로 구조화
cond(모두 만족해야 유효; 필요한 것만 쓴다): turn:"self"(【自分ターン中】)|"opp"(【相手ターン中】) / pcolor:"red"(【パートナー赤】) / ccolor:"red"(【事件 색】) / ctrait:특징
 / fileMin:N(FILEエリアにカードがN枚以上) / cstate:"kase"(【事件編】)|"solve"(【解決編】) / bond:"카드 이름"(【絆 이름】)
 / fieldMin:N(お互いの現場にキャラが合わせてN枚以上) / selfSt:"s"(このキャラがスリープ状態の場合)|"a"(アクティブ状態の場合)
 / via:[{"type":"char","lvMin":3},{"type":"event","lvMin":3}] (「レベル3以上のキャラの能力やレベル3以上のイベントの効果によって登場した場合」— 하나라도 만족하면 유효. 手札から直接使った場合는 불충족)
lim: 【ターン①】=1, 【ターン②】=2 (그 외 0)
색: 赤=red 青=blue 緑=green 黄=yellow 紫=purple 白=white 黒=black. (◎●◆★ 같은 기호가 색을 뜻하면 카드 문맥으로 판단, 모르면 manual)

## ops (순서대로 실행)
{"op":"draw","n":1,"who":"self|opp","opt":false}                     カードをN枚引く (相手は…引く → who:opp)
{"op":"discard","n":1,"who":"self|opp","opt":false,"rand":false}     手札をN枚リムーブする ("してもよい"→opt:true, ランダム→rand:true)
{"op":"deckrem","n":3,"who":"self|opp","opt":false}                  デッキの上からN枚リムーブする("してもよい"→opt:true)
{"op":"gain","n":1,"who":"self|opp"}                                 証拠をN得る / 相手に証拠をN与える(who:opp)
{"op":"loseEvid","n":1,"who":"self|opp"}                             証拠をNつリムーブ
{"op":"look","n":3,"from":"top|bottom","filter":{...},"max":1,"then":"hand|field|fieldSleep|rem","rest":"bottom|shuffleBottom|top|rem|hand|keep"}
      デッキの上からN枚見る(公開する)→その中から条件のカードをmax枚まで選び then 처리, 残りは rest 처리. 見るだけで選ばない효과는 max:0.
      "残りを好きな順でデッキの下に移す"=rest:bottom / "シャッフルしてデッキの下に移す"=shuffleBottom / 残りをリムーブ=rem / "それ以外の場合、手札に加える"=rest:hand
{"op":"select","n":1,"filter":{...},"do":"sleep|stun|active|remove|hand|deckBottom|deckTop|deckTopOrBottom|ap|lp|kw","v":"1000","until":"turn|contact"}
      キャラをN枚まで選び… (대상은 자신/상대 현장 캐릭터). スリープさせる=sleep スタンさせる=stun アクティブにする=active リムーブする=remove 手札に移す=hand
      デッキの下に移す=deckBottom デッキの上か下に移す=deckTopOrBottom ターン終了時までAP+N=ap(v:"N", until:turn) コンタクト中AP+N=ap(until:contact) LP+N=lp
      キーワード付与(ターン終了時まで突撃を与える 등)=kw(v:"assault"|"rapid"|"bullet"|"assault-char"|"assault-case")
{"op":"self","do":"sleep|active|ap|lp|hand|deckBottom|kw","v":"","opt":false}  このキャラ自身に対する処理 ("このキャラをスリープさせてもよい"→opt:true)
{"op":"play","n":1,"from":"hand|rem","filter":{...},"asleep":false}   キャラを登場させる (スリープ状態で→asleep:true)
{"op":"choose","opts":[{"lab":"…","ops":[...]},{"lab":"…","ops":[...]}]} "以下からNつ選んで行う"
{"op":"if","c":"done|notdone","ops":[...]}   "そうした場合"/"〜した場合"=直前の処理を実際に行った場合 done, "そうしなかった場合"=notdone
{"op":"shuffle","who":"self"} / {"op":"solve"}(事件を解決編にする) / {"op":"manual","txt":"…"}
{"op":"reveal","name":"카드명 일부","then":"hand","rest":"shuffleBottom","shuffle":true}  デッキの上から카드名[X]が出るまで1枚ずつ公開し、それを手札に加える。残りの公開したカードをデッキの下に移し(シャッフルして)…
{"op":"ent","do":"active|sleep|ap|lp|kw","v":"rapid"}   (onally 전용) 등장한 그 캐릭터에게 처리 — 액티브로 하고 迅速を与える → ent active + ent kw v:"rapid"
{"op":"set"}                                                 このイベントを自分の現場にいるキャラ1枚にセットする (이벤트가 리무브 에리어로 가지 않고 그 캐릭터에 붙는다. 캐릭터가 떠나면 리무브 에리어로)
{"op":"if","c":"played","name":"카드명 일부","ops":[...]}   直前の play/look 로 그 이름의 카드를 登場させた場合 (name 생략 시 뭐든 등장했으면)
filter(필요한 것만): own:"self|opp|any"(自分の現場=self, 相手の現場=opp, 指定なし=any) lvMax:N|"file"|"used"(レベルN以下 / FILEエリアの枚数以下 / ネクストヒントで使ったカードのレベル以下) lvMin:N apMax:N apMin:N lpMax:N lpMin:N color:"red" trait:"특징" name:"카드명 일부" st:"a|s|x|sx"(アクティブ/スリープ/スタン/スリープかスタン) notSelf:true(このキャラ以外) type:"char|event"

## cost (declare 능력의 ':' 앞)
{"c":"sleepSelf"}(スリープ) / {"c":"discard","n":1,"filter":{...}}(手札をN枚リムーブ) / {"c":"deckrem","n":3}(デッキの上からN枚リムーブ) / {"c":"selfBottom"}(このキャラをデッキの下に移す) / {"c":"sleepOther","n":1}(このキャラ以外のキャラをN枚スリープ)

## static 능력 (ic:"static")
{"ic":"static","cond":{...},"tgt":{"sel":"self|allies|opp|all","filter":{...},"notSelf":false},"ap":1000,"lp":0,"kw":""}
 예) 【自分ターン中】自分の現場にいるこのキャラ以外の【緑】のキャラをAP+1000 → tgt:{sel:allies,notSelf:true,filter:{color:green}}, cond:{turn:self}, ap:1000
 예) 【自分ターン中】AP+1000(자기 자신) → tgt:{sel:self}

## kw (キーワード能力, 별도 필드): 공백으로 나열
迅速=rapid 突撃=assault 突撃[キャラ]=assault-char 突撃[事件]=assault-case ブレット=bullet ミスリードX=misreadX(예 misread2) 変装=disguise
※カットインはkw가 아니라 ability(ic:cutin, v:AP값)로 표현한다. 조건별 AP가 다르면(自分ターン中 AP+N／相手ターン中 AP+M) cutin ability를 2개로 나눠 각각 cond.turn을 준다.
※カットインに追加 효과가 있으면 그 효과는 같은 ability의 ops에 넣는다.

## 예시
1) "【登場時】自分のデッキのカードを上から3枚見る。その中からカードを1枚まで公開して手札に加え、残りを好きな順でデッキの下に移す。カードを手札に加えた場合、手札を1枚リムーブする"
 → {"ic":"onplay","ops":[{"op":"look","n":3,"max":1,"then":"hand","rest":"bottom"},{"op":"if","c":"done","ops":[{"op":"discard","n":1}]}]}
2) "【ヒラメキ】(証拠からリムーブされるときに発動する)カードを1枚引く" → {"ic":"flash","ops":[{"op":"draw","n":1}]}
3) "【カットインAP+2000】(コンタクト中に手札からリムーブして使う)" → {"ic":"cutin","v":2000}
4) "【自分ターン中】【ターン①】このキャラがアクション【キャラ】したとき、ターン終了時までこのキャラをAP+2000する" → {"ic":"onact","on":{"k":"char"},"cond":{"turn":"self"},"lim":1,"ops":[{"op":"self","do":"ap","v":"2000"}]}
5) "【宣言】ターン①：手札を1枚リムーブする：キャラを1枚まで選び、スリープさせる" → {"ic":"declare","lim":1,"cost":[{"c":"discard","n":1}],"ops":[{"op":"select","n":1,"do":"sleep","filter":{}}]}
6) "【登場時】AP3000以下のキャラを1枚まで選び、リムーブする。そうした場合、カードを1枚引く" → {"ic":"onplay","ops":[{"op":"select","n":1,"do":"remove","filter":{"apMax":3000}},{"op":"if","c":"done","ops":[{"op":"draw","n":1}]}]}
7) "【解決編】自分の裏向きの証拠を1つまで選び、表向きにする" → 표현 불가 → {"ic":"manual","cond":{"cstate":"solve"},"txt":"自分の裏向きの証拠を1つまで選び、表向きにする"}
8) "【登場時】手札からレベル2以下の特徴「少年探偵団」のキャラを1枚までスリープ状態で登場させてもよい" → {"ic":"onplay","ops":[{"op":"play","n":1,"from":"hand","filter":{"lvMax":2,"trait":"少年探偵団"},"asleep":true}]}
9) "【パートナー】【青】【ターン①】自分がネクストヒントで手札を使用したとき、そのカードのレベル以下のレベルのキャラを1枚まで選び、デッキの下に移す"
 → {"ic":"onhint","cond":{"pcolor":"blue"},"lim":1,"ops":[{"op":"select","n":1,"do":"deckBottom","filter":{"type":"char","lvMax":"used"}}]}
10) "相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、手札を1枚リムーブしてもよい。そうした場合、自分は証拠を1つ得る"
 → {"ic":"onkill","ops":[{"op":"discard","n":1,"opt":true},{"op":"if","c":"done","ops":[{"op":"gain","n":1}]}]}
11) "このキャラはスリープ状態で登場する" → {"ic":"enter","st":"s"}
12) "【登場時】レベル3以上のキャラの能力やレベル3以上のイベントの効果によって登場した場合、カードを1枚引く"
 → {"ic":"onplay","cond":{"via":[{"type":"char","lvMin":3},{"type":"event","lvMin":3}]},"ops":[{"op":"draw","n":1}]}
13) "【ターン①】能力や効果によってレベル6以下の特徴[少年探偵団]のキャラが自分の現場に登場したとき、その中から1枚をアクティブにし、ターン終了時までそのキャラに迅速を与える"
 → {"ic":"onally","lim":1,"on":{"by":"effect"},"ef":{"lvMax":6,"trait":"少年探偵団"},"ops":[{"op":"ent","do":"active"},{"op":"ent","do":"kw","v":"rapid"}]}
14) "【絆】江戸川コナン 相手の能力や効果によって選ばれない" → {"ic":"static","cond":{"bond":"江戸川コナン"},"tgt":{"sel":"self"},"kw":"untarget"}
15) "このキャラがスリープ状態の場合、相手は自分の現場にいるレベル4以下のキャラを指定してアクションできない"
 → {"ic":"static","cond":{"selfSt":"s"},"tgt":{"sel":"allies","filter":{"lvMax":4}},"kw":"noact"}
16) "お互いの現場にキャラが合わせて6枚以上いる場合、手札にあるこのキャラはレベル4になる" → {"ic":"hand","cond":{"fieldMin":6},"lv":4}
17) "手札からレベル5以下のキャラを1枚まで登場させる。カード名[江戸川コナン]を登場させた場合、カードを1枚引く" → ops:[{"op":"play","n":1,"from":"hand","filter":{"lvMax":5}},{"op":"if","c":"played","name":"江戸川コナン","ops":[{"op":"draw","n":1}]}]
18) "自分のデッキのカードを上からカード名[江戸川コナン]が出るまで1枚ずつ公開し、それを手札に加える。残りの公開したカードをデッキの下に移し、デッキをシャッフルする" → ops:[{"op":"reveal","name":"江戸川コナン","then":"hand","rest":"shuffleBottom","shuffle":true}]
19) "(イベント) …見る。…手札に加え、残りを好きな順番でデッキの下に移す。このイベントを自分の現場にいるキャラ1枚にセットする。/ このイベントがセットされているキャラは「このキャラがコンタクトしたとき、そのコンタクト中、このキャラをAP+2000する。」を持つ"
 → event 능력의 ops 끝에 {"op":"set"}, 그리고 별도 능력 {"ic":"grant","g":{"ic":"oncontact","on":{"k":"atk"},"ops":[{"op":"self","do":"ap","v":"2000","until":"contact"}]}}

## 추가 형식 (엔진이 지원하는 것들 — 해당 문장이 있을 때만 사용)
ic 추가: onsolve="この事件が解決編になったとき"(사건 카드) / onmain="自分のターンのメインフェイズ開始時" / onallyremoved="自分の現場にいる他のキャラがリムーブされたとき"(ef 필터) / onallykill="自分の現場のキャラとのコンタクトで相手キャラがリムーブされたとき"
 onallycontact="自分の現場にいる他のキャラがコンタクトしたとき" / onremleave="リムーブエリアのカードがリムーブエリアから離れたとき" / mr=【MR能力】(相手ターン中に現場を離れる場合パートナーエリアへ。별도 ops 없음)
 replace="…現場から離れる代わりに手札に移す"(rep:{"to":"hand"}, cost:[{"c":"selfRem"}], ef:대상 필터) / winalt="【事件解決】能力を【解決編】【証拠隠滅】…相手はゲームに敗北する に書き換える"(cond.pcolor)
능력 필드: pa:true = "この能力はパートナーエリアでも宣言/発動/有効になる"
cond 추가: fh:{필터}+fhN:N(いずれかの現場に조건 캐릭터가 N枚以上) / fa:{필터}(自分の現場のすべてのキャラが조건) / paHas:{필터} / cin:{필터}(そのキャラに【カットイン】した場合) / trace:"found"|"unfound"(痕跡) / killed:true / selfApMin:N / handMax:N / swapName:이름(変装で入れ替わった相手) / ftop:{"who":"opp","type":"char"}(FILE 一番上のカード) / found:{"filter":{...}}(捜査で発見されたカード)
cost 추가: sleepSelf / discard(+filter) / deckrem / selfBottom / selfRem / selfPa / flipEvid(+var:true=몇 개든) / fieldBottom / unset / unstack / remBottom
ops 추가 예:
 {"op":"select","n":1,"filter":{...},"do":"remove|sleep|stun|active|ap|lv|kw|hand|deckBottom","v":"+1000","until":"turn|contact","when":"lpLeOwnMax","acts":[{"do":"ap","v":"-1000","per":"flip"}]}
 {"op":"play","from":"hand|rem|handrem|picked","n":1,"filter":{...},"asleep":true} / {"op":"if","c":"done|notdone|played|win|lose|costHas|picked|found","ops":[...]} / {"op":"ifc","cond":{...},"ops":[...]}
 {"op":"revealTop","n":1,"filter":{...},"hit":"hand","miss":"bottom"} / {"op":"fetch","from":"rem|rempa","n":1,"filter":{...}} / {"op":"fileToHand","n":1} / {"op":"investigate","n":1} / {"op":"rps"}
 {"op":"stack","n":3,"filter":{...},"distinct":true} / {"op":"moveSet","n":1,"filter":{...},"toEmpty":true}(このキャラの裏向きセットを別の自分のキャラへ移す) / {"op":"choose","opts":[{"lab":"..","ops":[..]}]}(以下から1つ選んで行う) / {"op":"unset","n":1,"scope":"self|any","fd":true} / {"op":"setDeck","n":1,"deck":"self","to":"self|played|pick"} / {"op":"flip","n":1} / {"op":"flashFlipped","bang":true,"filter":{...}}
 {"op":"chooseMulti","max":3,"opts":[{"lab":"...","ops":[...]}]} / {"op":"rmAll","scope":"all|contact"} / {"op":"traitAll","trait":"특징"} / {"op":"nohint"} / {"op":"pickPaid","who":"opp"}
 filter 추가: lvMax/lvMin:"file"|"used"|"costLv"(비용으로 리무브한 카드의 레벨) / names:[이름들](いずれか) / nameNot / colorNot / hasIc / hasKw / any:[{...},{...}](いずれか) / traitOf:"ent" / acting:true / contacting:true / own:"self|opp"
※한 문장을 절반만 구조화하지 말 것: 문장 전체를 표현할 수 있으면 구조화하고, 일부라도 표현 못 하면 그 문장 전체를 manual 로 남긴다.
※예시는 형식 설명용이다. 입력 카드에 없는 능력을 만들어 내지 말 것. 카드에 텍스트가 없으면 abilities는 빈 배열.
※각 ability의 txt에는 그 능력에 해당하는 원문 문장을 넣는다."""
TOOL2 = {"name": "abilities", "description": "효과 텍스트를 엔진용 효과 데이터로 기록한다", "input_schema": {"type": "object", "required": ["abilities", "kw"], "properties": {
    "kw": {**S, "description": "키워드 능력(rapid assault assault-char assault-case bullet misreadN disguise)을 공백으로 나열. 없으면 빈 문자열"},
    "abilities": {"type": "array", "items": {"type": "object", "required": ["ic"], "properties": {
        "ic": {"type": "string", "enum": ["onplay", "onremoved", "flash", "declare", "static", "cutin", "onact", "oncontact", "onreason", "event", "onend", "ondisguise", "onhint", "onkill", "onally", "enter", "hand", "grant", "onsolve", "onmain", "onallyremoved", "onallykill", "onallycontact", "onremleave", "replace", "mr", "winalt", "manual"]},
        "ops": {"type": "array", "items": {"type": "object", "required": ["op"], "properties": {"op": {"type": "string", "enum": ["draw", "discard", "deckrem", "gain", "loseEvid", "look", "select", "self", "play", "choose", "chooseMulti", "if", "ifc", "optcost", "played", "shuffle", "solve", "reveal", "revealTop", "revealHand", "revealFile", "investigate", "fetch", "fileToHand", "setDeck", "unset", "moveSet", "stack", "flip", "flashFlipped", "rmAll", "traitAll", "nohint", "rps", "pickPaid", "ent", "set", "manual"]}}}}}}}}}}


def spec_hash(model, txt, ctype, name):
    """2단계 캐시 키: 프롬프트(SPEC)·스키마·모델·카드 텍스트 중 하나라도 바뀌면 다른 키 → 예전 결과를 재사용하지 않는다"""
    import hashlib
    return hashlib.sha1(json.dumps([SPEC, TOOL2, model, txt, ctype, name], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:10]


def apply_rules(st, txt, ctype="", cid=None):
    """모델이 manual 로 남긴 문장 중 규칙으로 구조화할 수 있는 것을 구조화(API 없음). st 를 새 dict 로 반환.
    모델이 능력을 하나도 못 만든 경우엔 원문을 줄 단위로 규칙 변환에 넘겨 본다(못 바꾸는 줄은 manual 로 남김)."""
    if effect_rules is None or ctype == "partner": return st, 0
    ab = st.get("abilities") or []
    if hasattr(effect_rules, "compile_card") and (txt or "").strip():
        # 원문 줄이 진실의 원천: 줄마다 규칙 변환 → 못 바꾼 줄만 모델 결과 → 그래도 없으면 manual
        new = effect_rules.compile_card(txt, ctype or "char", st.get("kw", ""), ab, cid=cid)
        return {**st, "abilities": new}, sum(1 for a in ab if effect_rules.has_manual([a])) - sum(1 for a in new if effect_rules.has_manual([a]))
    if not ab and (txt or "").strip():
        ab = [{"ic": "manual", "txt": ln.strip(), "ops": [{"op": "manual", "txt": ln.strip()}]} for ln in txt.splitlines() if ln.strip()]
    ab, n = effect_rules.upgrade(ab, txt); return {**st, "abilities": ab}, n


def structure(cli, model, d, cache, stem, rules=True):
    txt = (d.get("fx_ja") or "").strip()
    if d["type"] == "partner" or not txt: out = {"kw": "", "abilities": []}
    else:
        cf = cache / f"{CACHE_VER}_{stem}.ab.{spec_hash(model, txt, d['type'], d['name'])}.json"
        if cf.exists(): out = json.loads(cf.read_text("utf-8"))
        else:
            out = ask(cli, model, [{"type": "text", "text": SPEC, "cache_control": {"type": "ephemeral"}}],
                      [{"type": "text", "text": f"카드 종류: {d['type']}\n카드 이름: {d['name']}\n카드 텍스트:\n{txt}"}], TOOL2, 6000, stem)
            if not isinstance(out.get("abilities"), list): out["abilities"] = []
            out["kw"] = str(out.get("kw") or ""); cf.write_text(json.dumps(out, ensure_ascii=False), "utf-8")
    if rules: out, _ = apply_rules(out, txt, d['type'], d.get('id') or stem)  # 규칙 변환은 캐시에 넣지 않는다(규칙을 고치면 바로 반영)
    return out


def work(cli, a, p, cache):
    if STOP.is_set(): raise Skipped("앞선 오류로 작업이 중단되었습니다")
    d = read_card(cli, a.model, p, cache, a)
    st = {"kw": d.get("kw", ""), "abilities": []} if a.no_struct else structure(cli, a.struct_model, d, cache, p.stem, rules=not a.no_rules)
    return d, st


def card_entry(cid, d, st):
    """1단계 결과 d + 2단계 결과 st → (DB 카드 dict, 확인 필요 사유 목록)"""
    ab = st.get("abilities", []); man = "manual" in json.dumps(ab)
    card = {"id": cid, "n": d["name"], "type": d["type"], "color": d.get("color", ""), "lv": d.get("lv", ""), "lv2": d.get("lv2", ""), "ap": d.get("ap", ""), "lp": d.get("lp", ""),
            "kw": st.get("kw", "") or d.get("kw", ""), "trait": d.get("trait", ""), "fx": d.get("fx_ja", ""), "extra": d.get("fx_ko", ""), "ab": ab, "img": d["img"], "file": d.get("file", "")}
    fl = list(d.get("flags", []))
    if d["type"] == "char" and not (d.get("ap") and d.get("lp")): fl.append("AP/LP 없음")
    if d.get("fx_ja") and d["type"] != "partner" and not ab and not st.get("_nostruct"): fl.append("효과 텍스트는 있는데 효과 데이터 없음")
    if man: fl.append("일부 효과 수동(manual)")
    return card, fl


def base_from_db(src):
    """이미 만든 카드 DB(JSON)에서 1단계 결과(이름/스탯/원문/썸네일)를 복원 — 이미지 인식 API 없이 2단계만 다시 돌리기 위함"""
    data = json.loads(Path(src).read_text("utf-8")); res = []
    for cid, c in data.get("cards", {}).items():
        d = {"name": c.get("n", ""), "type": c.get("type", "char"), "color": c.get("color", ""), "lv": c.get("lv", ""), "lv2": c.get("lv2", ""), "ap": c.get("ap", ""), "lp": c.get("lp", ""),
             "trait": c.get("trait", ""), "fx_ja": c.get("fx", ""), "fx_ko": c.get("extra", ""), "img": c.get("img", ""), "file": c.get("file") or f"{cid}(파일명 미저장)", "flags": [], "kw": c.get("kw", "")}
        res.append((cid, d))
    return res


def recheck_color(d):
    """저장된 썸네일로 색 판별을 다시 수행(이미지 원본/API 불필요)"""
    img = d.get("img", "")
    if d["type"] in ("char", "event", "case") and img.startswith("data:image"):
        try: check_color(d, Image.open(io.BytesIO(base64.b64decode(img.split(",", 1)[1]))).convert("RGB"))
        except Exception as e: d["flags"].append(f"썸네일 색 판별 실패: {e}")


def effects_only(cli, a, out):
    """--effects-only: 저장된 원문으로 2단계(효과 JSON)만 재생성. --rules-only 이면 API 없이 규칙 변환만 다시 적용."""
    src = a.effects_only if isinstance(a.effects_only, str) and a.effects_only != "-" else str(out)
    if not Path(src).exists(): print(f"기존 카드 DB를 찾을 수 없습니다: {src}\n(--effects-only [기존 JSON 경로] 또는 --out 이 기존 결과 파일이어야 합니다)"); return None
    base = base_from_db(src); cache = out.with_suffix(".cache"); cache.mkdir(exist_ok=True); rows, cards, fails = [], {}, []
    if a.limit: base = base[:a.limit]
    _SRC_CARDS = json.loads(Path(src).read_text("utf-8"))["cards"] if a.rules_only else {}
    def one(cid, d):
        apply_type(d); recheck_color(d); txt = (d.get("fx_ja") or "").strip()
        if a.rules_only:  # API 없이: 기존 ab 에 규칙 변환만 다시 적용
            old = _SRC_CARDS[cid].get("ab", []); st = {"kw": d.get("kw", ""), "abilities": old}; st, _ = apply_rules(st, txt, d["type"], cid)
        else: st = structure(cli, a.struct_model, d, cache, cid, rules=not a.no_rules)
        return card_entry(cid, d, st)
    if a.rules_only:
        for cid, d in base: card, fl = one(cid, d); cards[cid] = card; rows += [[cid, d["name"], d["file"], " / ".join(fl)]] if fl else []
    else:
        with ThreadPoolExecutor(a.workers) as ex:
            fut = {ex.submit(one, cid, d): (cid, d) for cid, d in base}
            for f in as_completed(fut):
                cid, d = fut[f]
                try: card, fl = f.result(); cards[cid] = card; rows += [[cid, d["name"], d["file"], " / ".join(fl)]] if fl else []
                except Exception as e: detail = e.detail if isinstance(e, ApiFail) else f"{type(e).__name__}: {e}"; fails.append((d["file"], detail)); log(f"[실패] {cid}: {detail}")
    return cards, rows, fails


def write_outputs(a, out, cards, rows, fails):
    order = sorted(cards)  # 결과 파일은 항상 ID 순서(재현 가능)
    out.write_text(json.dumps({"cards": {k: cards[k] for k in order}, "decks": {}}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    with open(out.with_suffix(".review.csv"), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh); w.writerow(["ID", "이름", "파일", "확인 필요 사유"]); w.writerows(sorted(rows))
    if out.name == "cards.json" and out.parent.name == "data": print("[Excel] 전체를 새로 만들었습니다. Excel 도 맞추려면: python tools/export_cards_to_excel.py --prefer-json")
    st = automation_stats(cards)
    print(f"카드 {len(cards)}장 | 종류별 {dict(collections.Counter(c['type'] for c in cards.values()))} | 효과 있는 카드 {st['with_fx']}장 중 완전 자동 {st['auto']}장({st['pct']}%), manual 포함 {st['manual']}장 | 확인 필요 {len(rows)}장 (→ {out.with_suffix('.review.csv')}) | 실패 {len(fails)}장")
    man = [(cid, c) for cid, c in sorted(cards.items()) if c["type"] != "partner" and c["fx"] and "manual" in json.dumps(c["ab"])]
    lines = [f"[manual 이 남은 카드 {len(man)}장]"]
    for cid, c in man: lines.append(f"{cid}\t{c['n']}\t" + " | ".join(effect_rules.manual_texts(c["ab"]) if effect_rules else ["(?)"]))
    pat = collections.Counter(); ex = {}
    for cid, c in man:
        for t in (effect_rules.manual_texts(c["ab"]) if effect_rules else []):
            k = re.sub(r"\d+", "N", re.sub(r"\[[^\]]*\]", "[X]", t)); pat[k] += 1; ex.setdefault(k, cid)
    lines += ["", "[남은 manual 문장 유형 (숫자→N, 카드명/특징→[X]) — 많은 것부터 규칙/엔진에 추가하면 자동 비율이 가장 빨리 오릅니다]"] + [f"{n}\t{k}\t(예: {ex[k]})" for k, n in pat.most_common(100)]
    out.with_suffix(".manual.txt").write_text("\n".join(lines), "utf-8")
    print(f"남은 manual 목록/유형 통계 → {out.with_suffix('.manual.txt')}")
    for n, e in fails: print(f"실패: {n}\n   {e}")
    if fails: print(f"오류 전문은 {ERRLOG} 에도 저장되었습니다.")
    pat2 = collections.Counter()
    for c in cards.values():
        for s_ in re.split(r"[。\n]", c["fx"]):
            s_ = re.sub(r"\d+", "N", s_.strip())
            if len(s_) > 3: pat2[s_] += 1
    out.with_suffix(".effects.txt").write_text("\n".join(f"{n}\t{s_}" for s_, n in pat2.most_common(300)), "utf-8")


def automation_stats(cards):
    fx = [c for c in cards.values() if c["type"] != "partner" and c["fx"]]
    auto = sum(1 for c in fx if c["ab"] and "manual" not in json.dumps(c["ab"]))
    return {"with_fx": len(fx), "auto": auto, "manual": len(fx) - auto, "pct": round(100 * auto / len(fx), 1) if fx else 0.0}


def dry_run(a, files):
    """API를 호출하지 않고, 실제로 보낼 요청의 형태(이미지 데이터는 크기만)를 출력한다."""
    p = files[0]; full, box, thumb, im = prep(p, a.send_px, a.crop_px, a.thumb_px)
    def brief(c): return {**c, "source": {**c["source"], "data": f"<base64 {len(c['source']['data'])}자>"}} if c["type"] == "image" else c
    req1 = {"model": a.model, "max_tokens": 4096, "system": SYS1[:60] + "…", "tools": [{"name": TOOL1["name"], "input_schema": "…"}], "tool_choice": {"type": "auto"},
            "messages": [{"role": "user", "content": [brief(c) for c in card_content(full, box)] + [{"type": "text", "text": "결과는 반드시 `card` 도구를 호출해서 답하세요. …"}]}]}
    req2 = {"model": a.struct_model, "max_tokens": 6000, "system": [{"type": "text", "text": SPEC[:60] + "…", "cache_control": {"type": "ephemeral"}}],
            "tools": [{"name": TOOL2["name"], "input_schema": "…"}], "tool_choice": {"type": "auto"}, "messages": [{"role": "user", "content": "카드 종류/이름/텍스트 …"}]}
    print(f"[dry-run] 대상 파일: {p}\n1단계 요청:\n{json.dumps(req1, ensure_ascii=False, indent=1)}\n2단계 요청:\n{json.dumps(req2, ensure_ascii=False, indent=1)}")


def main():
    global ERRLOG
    ap = argparse.ArgumentParser(); ap.add_argument("folder", nargs="?", default=".", help="카드 이미지 폴더(--effects-only 에서는 불필요)"); ap.add_argument("--out", default="conan-db.json")
    ap.add_argument("--model", default="claude-sonnet-5-5", help="이미지 읽기 모델(작은 글씨 정확도 때문에 기본 sonnet. 저렴하게: claude-haiku-4-5-20251001)")
    ap.add_argument("--struct-model", default="claude-sonnet-5-5", help="효과 구조화 모델")
    ap.add_argument("--no-struct", action="store_true", help="효과 구조화를 하지 않음(텍스트만 저장)")
    ap.add_argument("--dry-run", action="store_true", help="API를 호출하지 않고 요청 형태만 출력")
    ap.add_argument("--workers", type=int, default=6); ap.add_argument("--id-regex", default=r"(.+)")
    ap.add_argument("--effects-only", nargs="?", const="-", default=None, metavar="기존JSON", help="이미지 인식(1단계)을 다시 하지 않고, 이미 추출된 원문으로 효과 JSON(2단계)만 재생성. 인자를 생략하면 --out 파일을 읽어 그 파일을 갱신")
    ap.add_argument("--rules-only", action="store_true", help="--effects-only 와 함께: API 없이 규칙 변환(effect_rules.py)만 다시 적용")
    ap.add_argument("--no-rules", action="store_true", help="규칙 기반 후처리(effect_rules.py)를 끔")
    ap.add_argument("--sample", type=int, default=0, metavar="N", help="폴더 전체에서 무작위 N장만 처리(색 검증용 표본). 재현하려면 --seed")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--send-px", type=int, default=1100); ap.add_argument("--crop-px", type=int, default=1500); ap.add_argument("--thumb-px", type=int, default=240); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args(); out = Path(a.out); cache = out.with_suffix(".cache"); ERRLOG = str(out.with_suffix(".errors.log"))
    try: out.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e: print(f"출력 폴더를 만들 수 없습니다: {e}"); return 2
    if a.effects_only is not None:  # ── 2단계만 다시: 이미지 인식 API 를 부르지 않는다
        need_api = not a.rules_only and not a.no_struct
        if need_api and anthropic is None: print("anthropic 패키지가 없습니다. pip install anthropic pillow (API 없이 규칙만 적용하려면 --rules-only)"); return 2
        try: cli = anthropic.Anthropic() if need_api else None
        except Exception as e: print(f"API 클라이언트를 만들 수 없습니다(ANTHROPIC_API_KEY 확인): {err_detail(e)}"); return 2
        try: open(ERRLOG, "w", encoding="utf-8").close()
        except Exception as e: print(f"출력 폴더에 쓸 수 없습니다: {e}"); return 2
        src = a.effects_only if a.effects_only != "-" else str(out)
        if Path(src).exists() and Path(src).resolve() == out.resolve():  # 덮어쓰기 전에 백업
            bk = out.with_name(out.stem + ".before-effects.json")
            if not bk.exists(): bk.write_bytes(out.read_bytes()); print(f"기존 파일 백업: {bk}", file=sys.stderr)
        r = effects_only(cli, a, out)
        if r is None: return 2
        cards, rows, fails = r; write_outputs(a, out, cards, rows, fails); return 0 if cards else 1
    files = sorted(p for p in Path(a.folder).rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"))
    if a.sample:
        import random; seed = a.seed if a.seed is not None else random.SystemRandom().randrange(1 << 30); random.Random(seed).shuffle(files); files = files[:a.sample]; files.sort()
        print(f"무작위 표본 {len(files)}장 (--seed {seed} 로 같은 표본 재현 가능)", file=sys.stderr)
    elif a.limit: files = files[:a.limit]
    if not files: print(f"이미지를 찾지 못했습니다: {a.folder}"); return 1
    if a.dry_run: dry_run(a, files); return 0
    if anthropic is None: print("anthropic 패키지가 없습니다. pip install anthropic pillow"); return 2
    try: cache.mkdir(exist_ok=True); open(ERRLOG, "w", encoding="utf-8").close()
    except Exception as e: print(f"출력 폴더에 쓸 수 없습니다: {e}"); return 2
    try: cli = anthropic.Anthropic()
    except Exception as e: print(f"API 클라이언트를 만들 수 없습니다(ANTHROPIC_API_KEY 확인): {err_detail(e)}"); return 2
    rx = re.compile(a.id_regex); cards, fails, seen, rows, ok, bad_streak = {}, [], 0, [], 0, 0; first_fatal = None
    with ThreadPoolExecutor(a.workers) as ex:
        fut = {ex.submit(work, cli, a, p, cache): p for p in files}
        for f in as_completed(fut):
            p = fut[f]; seen += 1
            try:
                d, st = f.result()
                m = rx.search(p.stem); cid = m.group(1) if m else p.stem
                ok += 1; bad_streak = 0
                if cid in cards: continue  # 같은 ID(패러렐 등)는 같은 카드 1장으로
                if a.no_struct: st = {**st, "_nostruct": 1}
                card, fl = card_entry(cid, d, st); cards[cid] = card
                if fl: rows.append([cid, d["name"], d["file"], " / ".join(fl)])
                if len(files) <= 50 or seen % 50 == 0: print(f"{seen}/{len(files)} 완료: {p.name}", file=sys.stderr, flush=True)
            except Skipped: fails.append((p.name, "건너뜀(앞선 오류로 중단)"))
            except Exception as e:  # 카드 1장의 실패가 전체를 깨지 않는다
                detail = e.detail if isinstance(e, ApiFail) else f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                fails.append((p.name, detail)); log(f"[실패] {p.name}: {detail}")
                fatal = isinstance(e, ApiFail) and e.status in (400, 401, 403, 404, 422)
                if fatal and ok == 0:
                    first_fatal = first_fatal or detail; bad_streak += 1
                    if bad_streak >= 4 and not STOP.is_set():
                        STOP.set(); log(f"[중단] 성공 없이 같은 종류의 오류가 {bad_streak}번 연속되어 남은 카드를 건너뜁니다. 첫 오류 전문:\n{first_fatal}")
    write_outputs(a, out, cards, rows, fails)
    if not cards and first_fatal: print("\n모든 카드가 같은 API 오류로 실패했습니다. 위 '오류 전문'을 확인하세요.")
    return 0 if cards else 1


if __name__ == "__main__":
    sys.exit(main())
