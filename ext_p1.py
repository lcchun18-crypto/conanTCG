"""묶음 1: 기존 op 조합 + 소수의 신규 프리미티브"""
def sel(f=None, do='remove', n=1, **k): return {"op": "select", "n": n, "filter": f or {}, "do": do, **k}
def selkw(f, kw, n=1, until='turn'): return {"op": "select", "n": n, "filter": f, "do": "kw", "v": kw, "until": until}
def done(*ops, els=None): return {"op": "if", "c": "done", "ops": list(ops), **({"else": els} if els else {})}
def notdone(*ops): return {"op": "if", "c": "notdone", "ops": list(ops)}
DISC1 = {"op": "discard", "n": 1, "opt": True}


def load(reg):
    # 0067: 상대 손패 랜덤 1장 리무브 + 캐릭터 1장에 バレット
    reg('id_0067', '相手は手札を1枚ランダムにリムーブする', [{"ic": "event", "cond": {"pcolor": "red"}, "ops": [
        {"op": "discard", "n": 1, "who": "opp", "rand": True}, selkw({}, 'bullet')]}])
    # 0262: 手札1枚 リムーブ → LP0 의 毛利蘭 액티브
    reg('id_0262', '手札を1枚リムーブしてもよい', [{"ic": "onplay", "cond": {"cstate": "solve"}, "ops": [DISC1,
        done(sel({"own": "self", "name": "毛利蘭", "lpMax": 0}, 'active'))]}])
    # 0320: 상대에게 증거 1장 → 레벨7 이하 리무브
    reg('id_0320', '相手に証拠を1つ与えてもよい', [{"ic": "onplay", "ops": [{"op": "gain", "n": 1, "who": "opp", "opt": True},
        done(sel({"lvMax": 7}))]}])
    # 0220: 선언 — 자신의 레벨7 이하 【赤】 캐릭터에 バレット か 突撃[事件]
    reg('id_0220', '沖矢昴' if False else 'レベル7以下の【赤】のキャラを1枚まで選び、ターン終了時までバレットか突撃[事件]', [{"ic": "declare", "lim": 1, "cost": [{"c": "sleepSelf", "n": 1}], "ops": [
        {"op": "choose", "opts": [{"lab": "バレット", "ops": [selkw({"own": "self", "lvMax": 7, "color": "red"}, 'bullet')]},
                                   {"lab": "突撃[事件]", "ops": [selkw({"own": "self", "lvMax": 7, "color": "red"}, 'assault-case')]}]}]}])
    # 0244: 상대 현장 스턴 캐릭터 1장당 드로우, 한 장도 못 뽑으면 스턴
    reg('id_0244', '相手の現場にいるスタン状態のキャラ1枚につき', [{"ic": "event", "cond": {"pcolor": "yellow"}, "ops": [
        {"op": "draw", "n": 1, "ncnt": {"src": "field", "f": {"own": "opp", "st": "x"}}}, notdone(sel({}, 'stun'))]}])
    # 0245: 레벨6 이상 캐릭터에 세트 → 레벨6 이하 리무브
    reg('id_0245', 'このイベントを自分の現場にいるレベル6以上のキャラ1枚にセットする', [{"ic": "event", "ops": [
        {"op": "set", "filter": {"lvMin": 6}}, done(sel({"lvMax": 6}))]}])
    # 0512: 선언 — 액티브면 突撃, 슬립/스턴이면 리무브+드로우 (조건: 妃英理 또는 다른 毛利探偵事務所)
    reg('id_0512', 'スリープ状態かスタン状態の場合', [{"ic": "declare", "cond": {"pcolor": "blue", "fh": {"own": "self", "any": [{"name": "妃英理"}, {"trait": "毛利探偵事務所", "notSelf": True}]}, "fhN": 1}, "lim": 1, "ops": [
        {"op": "ifc", "cond": {"selfSt": "a"}, "ops": [{"op": "self", "do": "kw", "v": "assault"}]},
        {"op": "ifc", "cond": {"selfSt": "sx"}, "ops": [sel({"apMax": 8000}), {"op": "draw", "n": 1}]}]}], merge=True)
