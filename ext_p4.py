"""묶음 4: 컨택트 발생(contact)"""
from ext_p1 import sel, done, notdone, selkw
CT = {"op": "contact", "atk": "self", "tf": {"own": "opp"}}

def load(reg):
    reg('id_0643', '相手の現場にいるキャラを1枚まで選び、このキャラとのコンタクトを発生させる', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1}, {"c": "deckrem", "n": 3}], "ops": [CT]}], "A")
    reg('id_0665', 'ターン終了時までAP+1000し', [{"ic": "event", "ops": [{"op": "select", "n": 1, "filter": {"own": "self"}, "do": "ap", "acts": [
        {"do": "ap", "v": "1000", "until": "turn"}, {"do": "gab", "g": {"ic": "declare", "lim": 1, "ops": [CT], "txt": "【宣言】【ターン1】相手の現場にいるキャラを1枚まで選び、このキャラとのコンタクトを発生させる。"}}]}]}], "A")
    reg('id_1096', '自分の現場にいるこのキャラ以外のスリープ状態のキャラ1枚とのコンタクトを発生させる', [{"ic": "declare", "cond": {"cstate": "solve", "pcolor": "white", "ccolor": "green&white"}, "cost": [{"c": "sleepSelf", "n": 1}], "ops": [
        {"op": "contact", "atk": "pick", "atkF": {"own": "self", "notSelf": True, "st": "s"}, "tf": {"own": "opp"}}]}], "A")
    reg('id_1142', '自分のデッキのカードを上から3枚リムーブしてもよい', [{"ic": "onplay", "cond": {"pcolor": "black"}, "ops": [{"op": "deckrem", "n": 3, "opt": True},
        {"op": "if", "c": "reg", "ref": "removed", "filters": [{"color": "black", "hasIc": "cutin"}], "n": 3, "cmp": "ge", "ops": [CT]}]}], "A")
    reg('id_1160', '手札を1枚リムーブし、自分の現場にいるレベル7以上のキャラを1枚スリープさせてもよい', [{"ic": "onplay", "cond": {"ccolor": "blue&black", "pcolor": "blue", "turn": "self"}, "ops": [
        {"op": "optcost", "cost": [{"c": "discard", "n": 1}, {"c": "sleepAny", "n": 1, "filter": {"lvMin": 7}}]}, done({"op": "draw", "n": 1}, CT)]}], "A")
