"""전체 DB(ab 포함)를 현재 규칙(effect_rules + effect_ext)으로 다시 컴파일한다. 사용: python3 test/recompile_db.py in.json out.json
출력: out.json (ab 만 바뀜), out.json.man.json (아직 manual 이 남은 카드 id)"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import effect_rules as er, import_cards as ic
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src)); man = []
for k, c in d["cards"].items():
    c.setdefault("flags", []); ic.apply_type(c)
    if c["type"] == "partner" or not (c.get("fx") or "").strip(): continue
    c["ab"] = er.compile_card(c["fx"], c["type"], c.get("kw", ""), c.get("ab"), cid=k)
    if er.manual_texts(c["ab"]): man.append(k)
json.dump(d, open(out, "w"), ensure_ascii=False); json.dump(man, open(out + ".man.json", "w"))
print("manual cards:", len(man))
