"""importer 가 카드 ID 를 효과 변환기(effect_rules.compile_card)에 넘겨 카드별 확장 데이터(ext_*.py)를 적용하는지 검사.
(v1.1.0 이전에는 ID 가 전달되지 않아 ext 데이터가 한 장도 반영되지 않았다.)"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import import_cards, effect_rules

CASES = {
    "id_0365": ("char", "【パートナー(黒)】【自分ターン中】自分の現場にいるこのキャラが自分の能力や効果によってリムーブされたとき、このキャラをリムーブエリアからスリープ状態で登場させてもよい。そうした場合、カードを1枚引く。\n【カットイン】AP+1000(コンタクト中に手札からリムーブして使う)"),
    "id_0192": ("char", "【ターン1】相手の現場にいるキャラがアクションするとき、このキャラを指定できる場合、必ず指定する。"),
    "id_0518": ("char", "現場にいるこのキャラはカード名[毛利小五郎]としても扱い、特徴[探偵]を持つ。"),
}
bad = 0
for cid, (ty, fx) in CASES.items():
    st, _ = import_cards.apply_rules({"kw": "", "abilities": []}, fx, ty, cid)
    man = effect_rules.has_manual(st["abilities"])
    st0, _ = import_cards.apply_rules({"kw": "", "abilities": []}, fx, ty)  # ID 없이는 공통 규칙만
    print(("✓" if not man else "✗"), cid, "ID 전달 시 manual 없음" if not man else "manual 남음")
    if man: bad += 1
print("ext 연결 테스트 " + ("실패 %d건" % bad if bad else "통과"))
sys.exit(1 if bad else 0)
