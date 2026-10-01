"""묶음 2: 효과로 이벤트 사용(useEv) 계열"""
from ext_p1 import sel, done, notdone

def use(f): return {"op": "useEv", "filter": {"type": "event", **f}}

def load(reg):
    reg('id_0286', 'リムーブエリアにある【緑】のイベントを2枚', [{"ic": "declare", "lim": 1, "cost": [{"c": "sleepSelf", "n": 1}, {"c": "remBottom", "n": 2, "order": True, "filter": {"type": "event", "color": "green"}}],
        "ops": [use({"lvMin": 5, "lvMax": 6, "color": "green"})]}])
    reg('id_0546', '手札からレベル6以下の【緑】のカード名[ラブリースポット]以外のイベント', [{"ic": "event", "ops": [use({"lvMax": 6, "color": "green", "nameNot": "ラブリースポット"})]}])
    reg('id_0747', '手札からレベル5か6の【緑】のイベントを1枚まで使用する', [{"ic": "declare", "cond": {"pcolor": "green"}, "lim": 1, "cost": [{"c": "sleepSelf", "n": 1}],
        "ops": [use({"lvMin": 5, "lvMax": 6, "color": "green"})]}])
    reg('id_0866', '手札からレベル6以下のイベントを1枚まで使用する', [{"ic": "declare", "cond": {"fh": {"own": "self", "name": "服部平次"}, "fhN": 1}, "cost": [{"c": "selfRem", "n": 1}],
        "ops": [use({"lvMax": 6})]}])
    reg('id_0839', '手札からカード名[シャッフルロマンス]のイベントを1枚まで使用する', [{"ic": "declare", "cond": {"bond": "工藤新一"}, "lim": 1, "ops": [use({"name": "シャッフルロマンス"})]}])
    reg('id_0842', '以下から1つ選んで行う', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [{"c": "flipEvid", "n": 2}], "ops": [
        {"op": "choose", "opts": [{"lab": "リムーブエリアの[シャッフルロマンス]を手札に", "ops": [{"op": "fetch", "n": 1, "from": "rem", "filter": {"name": "シャッフルロマンス"}}]},
                                   {"lab": "手札の[シャッフルロマンス]を使用", "ops": [use({"name": "シャッフルロマンス"})]}]}]}])
    reg('id_0982', '自分のパートナーエリアかリムーブエリアにある特徴[ビッグジュエル]のイベント', [{"ic": "onplay", "ops": [{"op": "fetch", "n": 1, "from": "rempa", "filter": {"type": "event", "trait": "ビッグジュエル"}}]}])
    reg('id_0982', '手札からレベル5の特徴[ビッグジュエル]のイベント', [{"ic": "declare", "lim": 1, "ops": [use({"lvEq": 5, "trait": "ビッグジュエル"}),
        done({"op": "fetch", "n": 1, "from": "rem", "filter": {"type": "char", "lvMax": 3, "color": "white"}}, done({"op": "discard", "n": 1}))]}])
