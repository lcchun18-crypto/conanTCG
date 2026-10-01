"""묶음 5: 재등장 / 손패 리무브 / 플래시 등장 (playSelf)"""
from ext_p1 import sel, done, notdone

def rmTrig(extra_cond, ops, evs=("removed",), cz="self", **kw):
    return {"ic": "ontrig", "evs": list(evs), "sub": "self", "cz": cz, "cond": extra_cond, "ops": ops, **kw}

def load(reg):
    load2(reg)
    PS = {"op": "playSelf", "asleep": True, "opt": True}
    reg('id_0365', 'このキャラをリムーブエリアからスリープ状態で登場させてもよい。そうした場合、カードを1枚引く', [rmTrig({"turn": "self", "pcolor": "black"}, [PS, done({"op": "draw", "n": 1})], by="effect")])
    reg('id_0603', 'このキャラをリムーブエリアからスリープ状態で登場させてもよい', [rmTrig({"turn": "self", "pcolor": "black"}, [PS], by="effect")])
    reg('id_1163', 'レベル7以下のスリープ状態のキャラを1枚まで選び、リムーブする', [rmTrig({"turn": "self", "pcolor": "black"}, [sel({"lvMax": 7, "st": "s"}, opt=True)], by="effect")])
    # 0611: 상대 효과로 손패에서 리무브되었을 때 등장
    reg('id_0611', '相手の能力や効果によって手札からこのカードをリムーブしたとき', [rmTrig({"turn": "opp"}, [{"op": "playSelf", "opt": True}], evs=("handRem",), cz="opp")])
    # 0648: 플래시 — 내 캐릭터 1장 리무브해도 좋다. 그러면 이 캐릭터 등장
    reg('id_0648', '自分の現場にいるキャラを1枚まで選び、リムーブしてもよい。リムーブした場合、このキャラを登場させる', [{"ic": "flash", "ops": [
        sel({"own": "self"}, opt=True), done({"op": "playSelf", "from": "any"})]}])
    reg('id_0650', 'このキャラをスリープ状態で登場させる', [{"ic": "flash", "cond": {"cstate": "solve"}, "ops": [{"op": "playSelf", "from": "any", "asleep": True}]}])

def load2(reg):
    # 0359: 파트너(黒) 내 턴 종료 시 FILE 위에서 2장 손패에 → 손패 2장 리무브 + 이 캐릭터 이외 모두 리무브
    reg('id_0359', '自分のターン終了時、自分のFILEエリアにあるカードを上から2枚手札に加えてもよい', [{"ic": "onend", "cond": {"turn": "self", "pcolor": "black"}, "ops": [
        {"op": "fileToHand", "n": 2, "opt": True}, done({"op": "discard", "n": 2, "opt": False}, {"op": "rmAll", "scope": "others"})]}])
    # 0720: 해결편 선언(손패에서) — 내 (黒) 캐릭터 1장 리무브, 이 캐릭터를 슬립으로 등장, 이번 턴 카드명 ジン 사용/등장 불가
    reg('id_0720', '手札からこのキャラをスリープ状態で登場させる', [{"ic": "declare", "fromHand": True, "cond": {"cstate": "solve", "fh": {"own": "self", "color": "black"}, "fhN": 1}, "ops": [
        sel({"own": "self", "color": "black"}, force=True), done({"op": "playSelf", "from": "hand", "asleep": True}, {"op": "banName", "name": "ジン"})]}])
    # 0997: 파트너(赤) FILE8 선언, 슬립, 손패 赤井秀一 1장 리무브 코스트: 이 캐릭터 리무브 → 파트너/리무브 에리어의 赤井秀一&世良真純 등장
    reg('id_0997', 'このキャラをリムーブし、自分のパートナーエリアかリムーブエリアにあるカード名[赤井秀一&世良真純]', [{"ic": "declare", "cond": {"pcolor": "red", "fileMin": 8}, "lim": 1, "cost": [{"c": "sleepSelf", "n": 1}, {"c": "discard", "n": 1, "filter": {"name": "赤井秀一"}}], "ops": [
        {"op": "self", "do": "remove"}, {"op": "play", "from": "rempa", "n": 1, "filter": {"name": "赤井秀一&世良真純"}}]}])
    # 1146
    reg('id_1146', '【カットイン】を持つ【黒】のキャラが4枚以上いる場合', [{"ic": "static", "cond": {"fh": {"own": "self", "color": "black", "hasIc": "cutin"}, "fhN": 4}, "tgt": {"sel": "self"}, "kw": "assault"}])
    reg('id_1146', 'このターン中にこのキャラが【カットイン】の効果によって登場していた場合', [{"ic": "onend", "cond": {"turn": "self", "cutinPlayed": True}, "ops": [sel({"own": "self"}, do="deckBottom", force=True)]}])
    reg('id_1146', '【カットイン】を持つレベル8以上の【黒】のキャラに【カットイン】した場合', [{"ic": "ontrig", "evs": ["cutin"], "fromRem": True, "who": "self", "cond": {"turn": "self", "pcolor": "black"}, "tf": {"type": "char", "color": "black", "lvMin": 8, "hasIc": "cutin"}, "ops": [{"op": "playSelf", "mark": True}]}])
