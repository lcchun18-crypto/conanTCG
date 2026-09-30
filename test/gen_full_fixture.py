#!/usr/bin/env python3
"""전체 DB(conan-db-full.json)에서 새 패턴의 대표 카드를 뽑아 test/fixtures/full_samples.json 을 만든다.
   ab 는 API/모델 없이 규칙 파서(effect_rules.compile_card)로만 만든 결과(골든). 사용: python3 test/gen_full_fixture.py conan-db-full.json"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import effect_rules as er
IDS = os.environ.get("FIX_IDS", "").split() or """id_0170 id_0162 id_0788 id_0185 id_0519 id_0888 id_0022 id_0043 id_0332 id_1065 id_0775 id_0323 id_1076 id_0491 id_0516 id_1145 id_0451
id_0383 id_0248 id_0215 id_0580 id_0138 id_0225 id_0476 id_0260 id_0312 id_0361 id_0285 id_0245 id_0604 id_0931 id_1142 id_0450 id_0226 id_0616 id_0060 id_0135 id_0621 id_0469 id_0627 id_0058 id_0059 id_0190 id_0777 id_1063 id_0955
id_0044 id_0342 id_0039 id_0171 id_0018 id_0081 id_0037 id_1030 id_0936 id_1012 id_0107 id_0825 id_0529 id_1009 id_1161 id_0950 id_0937 id_0511 id_0612 id_0266 id_0188 id_0763 id_0552 id_0996 id_0050 id_0111 id_0734 id_0978 id_0207 id_0790 id_0782 id_0983 id_0740 id_1058 id_0346 id_0700 id_0633 id_1116 id_0228""".split()
db = json.load(open(sys.argv[1], encoding="utf-8"))["cards"]; out = {}
for i in IDS:
    c = db[i]; ab = er.compile_card(c["fx"], c["type"], c.get("kw", ""), None)
    out[i] = {k: c.get(k, "") for k in ("id", "n", "type", "color", "lv", "lv2", "ap", "lp", "kw", "trait", "fx")}; out[i]["ab"] = ab
json.dump({"cards": out}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures/full_samples.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "cards")
