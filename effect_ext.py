"""확장 효과 규칙 (Turn 26): 기존 규칙 파서가 manual 로 남기던 문장을 구조화한다.
순서: (1) 공통 프리미티브(effect_rules/effect_prims) → (2) 이 모듈의 카드별 구조화 데이터(EXT, 카드 ID 키) → (3) 모델 결과 → (4) manual.
EXT[card_id] = [ {'m': '<원문 줄에 포함된 문자열>', 'ab': [능력...], 'cls': 'A|B|G'} ... ]
  cls: A = 이번에 추가한 공통 엔진 프리미티브 사용, B = 기존 프리미티브 조합, G = 카드 전용 핸들러(op:'x')."""
import re, unicodedata
EXT = {}

def _n(s): return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s or ""))

def reg(cid, m, ab, cls="B", merge=False, pre=False):
    """merge=True: 바로 앞 줄에서 만든 능력을 이 ab 로 교체(한 능력이 두 줄에 걸친 경우)"""
    EXT.setdefault(cid, []).append({"m": _n(m), "ab": ab, "cls": cls, "merge": merge, "pre": pre})  # pre=True: 공통 규칙이 잘못 컴파일하는 줄을 카드별 데이터로 먼저 덮어쓴다

def lookup(cid, line):
    """원문 줄 → 능력 리스트 (없으면 None). 같은 줄에 여러 항목이 걸리면 첫 항목"""
    if not cid or cid not in EXT: return None
    n = _n(line)
    for e in EXT[cid]:
        if e["m"] and e["m"] in n: return e
    return None

from ext_cards import load as _load  # noqa: E402  (카드 데이터 모듈)
_load(reg)
