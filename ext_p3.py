"""묶음 3: 대체/보호/무효(replace · protect · negate · onchosen)"""
from ext_p1 import sel, done, notdone, selkw

def load(reg):
    # 0033: 세트된 캐릭터가 상대 효과/컨택트로 현장을 떠날 때, 이 이벤트를 리무브하고 현장에 남는다(강제 대체)
    reg('id_0033', 'このイベントがセットされているキャラが相手の能力や効果、コンタクトによって現場から離れるとき', [{"ic": "grant", "g": {"ic": "replace", "ef": {"self": True}, "forced": True, "rep": {"to": "stay", "unsetSelf": True}, "msg": "세트된 이벤트를 리무브하고 현장에 남습니다"}}], "A")
    # 0213/0247: 변장 시 이 컨택트로는 리무브되지 않음
    reg('id_0213', 'LP2以上の【白】のキャラと入れ替わった場合', [{"ic": "ondisguise", "cond": {"swapLpMin": 2, "swapColor": "white"}, "ops": [{"op": "protect", "who": "self"}]}], "A")
    reg('id_0247', '相手は手札を1枚リムーブしてもよい。そうしなかった場合', [{"ic": "ondisguise", "ops": [{"op": "discard", "n": 1, "who": "opp", "opt": True}, notdone({"op": "protect", "who": "self"})]}], "A")
    # 0435: 京極真 이 컨택트하면, 手札の鈴木園子 1장 리무브 → 그 캐릭터는 이 컨택트로 리무브되지 않음
    reg('id_0435', '自分の現場にいるカード名[京極真]がコンタクトしたとき', [{"ic": "onallycontact", "cond": {"turn": "opp"}, "lim": 1, "ef": {"name": "京極真"}, "ops": [
        {"op": "discard", "n": 1, "opt": True, "filter": {"name": "鈴木園子"}}, done({"op": "protect", "who": "ent"})]}], "A")
    # 0200: 상대 컷인 사용 시 세트 카드 2장 리무브 → 컷인 무효
    reg('id_0200', '相手が【カットイン】カットインを使用したとき', [{"ic": "ontrig", "evs": ["cutin"], "who": "opp", "first": True, "ops": [
        {"op": "optcost", "cost": [{"c": "unset", "n": 2, "scope": "mine"}]}, done({"op": "negate", "what": "cutin"})]}], "A")
    # 0230: 세트된 캐릭터는 「【ターン1】상대의 능력/효과로 선택되었을 때 무효」를 가짐
    reg('id_0230', 'このイベントがセットされているキャラは', [{"ic": "grant", "g": {"ic": "onchosen", "lim": 1, "ops": [{"op": "negate", "what": "choose"}]}}], "A")
    # 0408: 絆毛利蘭 상대 턴 — 毛利蘭 이 선택되면 상대가 손패 1장 리무브(안 하면 무효)
    reg('id_0408', '自分の現場にいるカード名[毛利蘭]が相手の能力や効果によって選ばれたとき', [{"ic": "onchosen", "cond": {"turn": "opp", "bond": "毛利蘭"}, "lim": 1, "ef": {"name": "毛利蘭"}, "ops": [
        {"op": "discard", "n": 1, "who": "opp", "opt": True}, notdone({"op": "negate", "what": "choose"})]}], "A")
    # 0917: 상대 턴 — 다른 캐릭터가 선택되면 상대가 손패 1장 리무브(안 하면 무효), 【黒】 이외의 색 캐릭터가 있을 때
    reg('id_0917', '自分の現場にいるこのキャラ以外のキャラが相手の能力や効果によって選ばれたとき', [{"ic": "onchosen", "cond": {"turn": "opp", "fh": {"own": "self", "colorNot": "black"}, "fhN": 1}, "lim": 1, "ef": {"own": "self", "notSelf": True}, "ops": [
        {"op": "discard", "n": 1, "who": "opp", "opt": True}, notdone({"op": "negate", "what": "choose"})]}], "A")
    reg('id_0070', 'このキャラはアクションできず、ガードできない', [{"ic": "static", "cond": {"pcolor": "yellow"}, "tgt": {"sel": "self"}, "kw": "cantact cantguard noact"}], "B")
    reg('id_0070', 'このキャラが現場にいるかぎり、選んだキャラはオートフェイズにアクティブにならない', [{"ic": "onplay", "ops": [
        {"op": "select", "n": 1, "filter": {"lvMax": 7}, "acts": [{"do": "sleep"}, {"do": "hold"}], "do": "sleep"}]}], "A")
    reg('id_0217', 'キャラにセットされているこのイベントがリムーブエリアに置かれるとき', [{"ic": "ontrig", "evs": ["setOff"], "sub": "self", "cond": {"turn": "opp"}, "lim": 1, "ops": [
        {"op": "setSelf", "filter": {"own": "self", "trait": "怪盗"}, "opt": True}]}], "A")
    reg('id_0545', '相手の能力や効果によってリムーブされず、スリープされず、スタンされない', [{"ic": "grant", "g": {"ic": "static", "tgt": {"sel": "self"}, "kw": "nrm-ab nsl-ab nst-ab"}}], "B")
    reg('id_0892', 'このキャラに裏向きでセットされているすべてのカードをリムーブする代わりに手札に移す', [{"ic": "static", "tgt": {"sel": "self"}, "kw": "fdhand"}], "A")
