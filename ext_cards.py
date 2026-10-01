"""카드별 구조화 데이터. load(reg) 가 reg(card_id, 원문일부, [ab...], cls, merge) 를 호출한다.  cls: A=신규 공통 프리미티브, B=기존 조합, G=카드 전용"""
import importlib
import ext_p1, ext_p2, ext_p3, ext_p4, ext_p5
EXTRA = []
import os, glob, re as _re
for _f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ext_*.py'))):
    _n = os.path.basename(_f)[:-3]
    if _n in ('ext_cards',) or _re.match(r'ext_p\d+$', _n): continue
    if os.environ.get('EXT_MODS') and _n[4:] not in os.environ['EXT_MODS'].split(','): continue
    EXTRA.append(importlib.import_module(_n))  # 새 묶음은 ext_<이름>.py 로 추가하면 자동 로드


def load(reg):
    for m in (ext_p1, ext_p2, ext_p3, ext_p4, ext_p5, *EXTRA):
        m.load(reg)
