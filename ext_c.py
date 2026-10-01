"""묶음 c (Turn 26): 세트(裏向き/이벤트) · 겹침(重ねる) · 손패 공개/리무브 · 덱 확인 계열 26장"""
from ext_p1 import sel, selkw, done, notdone


def gkw(kw, txt=""):
    """세트된 이벤트가 캐릭터에 부여하는 키워드(static)"""
    return {"ic": "grant", "g": {"ic": "static", "tgt": {"sel": "self"}, "kw": kw, "txt": txt}}


# 「このキャラがコンタクトしたとき、そのコンタクト中、このキャラをAP+2000する。」(공통 규칙과 같은 형태)
AP2000 = {"ic": "oncontact", "on": {"k": "atk"}, "ops": [{"op": "self", "do": "ap", "v": "2000", "until": "contact"}], "txt": "このキャラがコンタクトしたとき、そのコンタクト中、このキャラをAP+2000する。"}
SETDECK_OPP = {"op": "setDeck", "n": 1, "deck": "opp", "to": "pick", "filter": {"own": "opp"}}


def load(reg):
    # ── 세트 이벤트(부여 키워드/능력) ──
    reg('id_0201', 'このイベントがセットされているキャラは突撃', [gkw("assault-char actactive", "突撃[キャラ]と「このキャラは相手の現場にいるアクティブ状態のキャラを指定してアクションできる。」")], "B")
    reg('id_0298', 'このイベントがセットされているキャラは「このキャラがアクションしたとき', [
        gkw("forceguard", "このキャラがアクションしたとき、相手はガードできる場合、必ずガードする。"), {"ic": "grant", "g": AP2000}], "A")
    # 0637: 「特徴[少年探偵団]のキャラは…」 — 세트된 캐릭터 자신의 특징 조건(공통 규칙이 사건 특징으로 잘못 해석하므로 우선 적용)
    reg('id_0637', 'このイベントがセットされている特徴', [{"ic": "grant", "g": {**AP2000, "cond": {"fh": {"own": "self", "self": True, "trait": "少年探偵団"}, "fhN": 1}}}], "A", pre=True)
    reg('id_0637', '自分か相手のターン終了時、キャラにセットされているこのイベントをリムーブしてもよい', [{"ic": "grant", "g": {"ic": "ontrig", "evs": ["turnEnd"], "txt": "自分か相手のターン終了時、キャラにセットされているこのイベントをリムーブしてもよい。そうした場合、自分のリムーブエリアにあるレベル8以下のカード名[阿笠博士]を1枚まで選び、スリープ状態で登場させる。", "ops": [
        {"op": "unsetGrantor", "opt": True}, done({"op": "play", "from": "rem", "n": 1, "filter": {"name": "阿笠博士", "lvMax": 8}, "asleep": True})]}}], "A")
    reg('id_0746', 'このイベントがセットされているキャラは突撃', [gkw("assault-char", "突撃[キャラ]"), {"ic": "grant", "g": {"ic": "declare", "lim": 1, "txt": "【宣言】【ターン1】自分のリムーブエリアにあるキャラを1枚まで選び、デッキの上に移す。", "ops": [
        {"op": "pick", "from": "rem", "own": "self", "filter": {"type": "char"}, "n": 1, "min": 0, "as": "chosen"}, {"op": "mv", "ref": "chosen", "to": "deckTop"}]}}], "B")
    reg('id_0613', 'このイベントがセットされているキャラは「【相手ターン中】このキャラが現場から離れたとき', [{"ic": "ontrig", "evs": ["holdLeft"], "sub": "self", "cond": {"turn": "opp", "cnt": [{"src": "field", "op": "eq", "n": 0, "f": {"own": "self"}}]}, "ops": [
        sel({}), {"op": "play", "from": "rem", "n": 2, "filter": {"hasIc": "cutin", "lvMax": 6}}]}], "A")

    # ── 세트(裏向き) 카드 ──
    reg('id_0248', '【登場時】相手の現場にいるキャラにセットされているカードを1枚まで選び', [{"ic": "onplay", "ops": [
        {"op": "unsetPick", "scope": "opp", "n": 1, "upto": True}, done({"op": "self", "do": "kw", "v": "assault-char", "until": "turn"})]}], "A")
    reg('id_0289', 'このキャラは相手の現場にいるカードがセットされているアクティブ状態', [{"ic": "static", "tgt": {"sel": "self"}, "kw": "actset"}], "A")
    reg('id_0291', '【カットイン】AP+1000、相手の現場にいるコンタクト中のキャラ', [{"ic": "cutin", "v": 1000, "ops": [
        {"op": "setDeck", "n": 1, "deck": "opp", "to": "pick", "filter": {"own": "opp", "contacting": True}}]}], "B")
    reg('id_0296', '【カットイン】AP+1000、相手の現場にいるキャラに裏向きでセットされているカード', [{"ic": "cutin", "v": 1000, "ops": [
        {"op": "unsetPick", "scope": "opp", "fd": True, "n": 1, "upto": True}, done({"op": "ref", "ref": "cin", "acts": [{"do": "ap", "v": "2000", "until": "contact"}]})]}], "A")
    reg('id_0532', '【宣言】【スリープ】:自分の現場にいる特徴[警察]のキャラを1枚までと', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1}], "ops": [
        {"op": "setDeck", "n": 1, "deck": "self", "to": "pick", "filter": {"own": "self", "trait": "警察"}}, SETDECK_OPP]}], "B")
    reg('id_0533', '合わせて2枚リムーブしてもよい', [{"ic": "declare", "cond": {"pcolor": "green"}, "lim": 1, "ops": [
        {"op": "unsetPick", "scope": "any", "fd": True, "n": 2, "opt": True}, done(sel({"lvMax": 7}))]}], "A")
    reg('id_0539', '【登場時】自分のデッキのカードを上から1枚公開する', [{"ic": "onplay", "ops": [
        {"op": "peek", "deck": "self", "from": "top", "n": 1, "reveal": True, "viewer": "self"}, {"op": "showReg", "ref": "seen"},
        {"op": "pick", "from": "seen", "own": "self", "filter": {"names": ["服部平次", "遠山和葉"]}, "n": 1, "min": 0, "as": "chosen"},
        {"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "setFromReg", "ref": "rest", "to": "self"}]}], "A")
    reg('id_0760', '【事件赤魔術】【宣言】【スリープ】手札を1枚リムーブする', [{"ic": "declare", "cond": {"ctrait": "赤魔術"}, "cost": [{"c": "sleepSelf", "n": 1}, {"c": "discard", "n": 1}], "ops": [
        sel({}), {"op": "unsetPick", "scope": "mine", "fd": True, "n": 2, "opt": True}, done({"op": "play", "from": "rem", "n": 1, "filter": {"color": "white", "lvMax": 3}})]}], "A")
    reg('id_0787', '【事件赤魔術】自分のリムーブエリアにあるレベル3以下の【白】のキャラ', [{"ic": "event", "cond": {"ctrait": "赤魔術"}, "ops": [
        {"op": "play", "from": "rem", "n": 1, "filter": {"color": "white", "lvMax": 3}},
        done({"op": "played", "do": "ap", "v": "3000", "until": "turn"}, {"op": "played", "do": "kw", "v": "assault-char", "until": "turn"}, {"op": "setDeck", "n": 1, "deck": "self", "to": "played"})]}], "B")

    # ── 손패 공개/리무브 ──
    reg('id_0360', '【パートナー(黒)】【登場時】相手は手札を公開する', [{"ic": "onplay", "cond": {"pcolor": "black"}, "ops": [{"op": "rhand", "filter": {"lvMax": 7}, "n": 1}]}], "A")
    reg('id_0827', '【パートナー(黒)】【登場時】相手は手札を公開する', [{"ic": "onplay", "cond": {"pcolor": "black"}, "ops": [
        {"op": "rhand", "filter": {"hasIc": "cutin", "lvMax": 8}, "n": 1}, done({"op": "ifc", "cond": {"ohandMax": 4}, "ops": [{"op": "draw", "n": 1, "who": "opp"}]})]}], "A")

    # ── 덱 확인/공개 ──
    reg('id_0281', '特徴[毛利探偵事務所]のキャラが自分の現場に登場したとき', [{"ic": "ontrig", "evs": ["enter"], "who": "self", "sf": {"trait": "毛利探偵事務所", "type": "char"}, "cond": {"turn": "self"}, "lim": 1, "ops": [
        {"op": "peek", "deck": "opp", "from": "top", "n": 1, "reveal": True, "viewer": "self"}]}], "B")
    reg('id_0317', '【パートナー(白)】自分の現場にいるキャラを1枚デッキの下に移してもよい', [{"ic": "event", "cond": {"pcolor": "white"}, "ops": [
        sel({"own": "self"}, do="deckBottom"), done(
            {"op": "peek", "deck": "self", "from": "top", "n": 1, "until": {"type": "char", "lvEq": 8}, "cap": 60, "reveal": True, "viewer": "self"}, {"op": "showReg", "ref": "seen"},
            {"op": "mv", "ref": "hit", "to": "field"}, {"op": "deckSink", "ref": "rest"}, {"op": "shuffle"})]}], "A")
    reg('id_0428', 'このキャラのアクション終了時、自分のデッキのカードを上から4枚見る', [{"ic": "ontrig", "evs": ["actend"], "sub": "self", "who": "self", "ops": [
        {"op": "peek", "deck": "self", "from": "top", "n": 4, "viewer": "self"},
        {"op": "pick", "from": "seen", "own": "self", "filter": {"type": "char", "lvMax": 8, "name": "怪盗キッド"}, "n": 1, "min": 0, "as": "chosen", "reveal": True},
        {"op": "deckSink", "ref": "rest", "order": "any"},
        {"op": "if", "c": "reg", "ref": "chosen", "n": 1, "ops": [{"op": "choose", "opts": [
            {"lab": "公開したキャラを手札に加える", "ops": [{"op": "mv", "ref": "chosen", "to": "hand"}]},
            {"lab": "公開したキャラを登場させてこのキャラをリムーブする", "ops": [{"op": "mv", "ref": "chosen", "to": "field"}, done({"op": "self", "do": "remove"})]}]}]}]}], "A")

    # ── 겹침(重ねる) ──
    reg('id_0551', '【宣言】【ターン1】手札からカード名[怪盗キッド]を1枚公開してデッキの上に移す', [{"ic": "declare", "lim": 1, "cost": [{"c": "handDeckTop", "n": 1, "filter": {"name": "怪盗キッド"}}], "ops": [
        selkw({"name": "黒羽快斗"}, "assault")]}], "A")
    reg('id_0630', '【登場時】自分のリムーブエリアにある特徴[少年探偵団]のキャラを2枚まで選び', [{"ic": "onplay", "ops": [
        {"op": "stack", "n": 2, "filter": {"trait": "少年探偵団"}}, done(sel({"lvMax": "reg:moved:sum"}))]}], "A")
    reg('id_0630', 'このキャラの下に重なっているカードを2枚までそのキャラの下に重ねる', [{"ic": "declare", "lim": 1, "cost": [{"c": "sleepSelf", "n": 1}], "ops": [{"op": "moveUnder", "n": 2}]}], "A")
    reg('id_0633', 'このキャラのアクション終了時、自分の現場にいるカード名[仮面ヤイバー]以外のキャラを1枚選び', [{"ic": "ontrig", "evs": ["actend"], "sub": "self", "who": "self", "ops": [
        {"op": "mv", "ref": "self", "to": "under", "tf": {"own": "self", "nameNot": "仮面ヤイバー", "type": "char"}}, done({"op": "draw", "n": 1})]}], "B")
    reg('id_0840', '【事件シャッフルロマンス】【宣言】【ターン1】自分の現場にいるカード名[毛利蘭]を1枚まで選び', [{"ic": "declare", "cond": {"ctrait": "シャッフルロマンス"}, "lim": 1, "ops": [
        {"op": "select", "n": 1, "filter": {"own": "self", "name": "毛利蘭"}, "do": "mark"}, {"op": "mv", "ref": "sel", "to": "under"},
        done({"op": "self", "do": "kw", "v": "assault-char", "until": "turn"})]}], "B")
    reg('id_0843', '【パートナー(青)】【宣言】【ターン1】キャラを1枚まで選び、リムーブする', [{"ic": "declare", "cond": {"pcolor": "blue"}, "lim": 1, "ops": [
        sel({}), done({"op": "deckrem", "n": 1, "nref": {"ref": "sel", "by": "lv"}})]}], "B")
    reg('id_0843', '自分のリムーブエリアにある特徴[少年探偵団]のキャラを1枚まで選び', [{"ic": "declare", "lim": 1, "pa": True, "ops": [
        {"op": "pick", "from": "rem", "own": "self", "filter": {"type": "char", "trait": "少年探偵団"}, "n": 1, "min": 0, "as": "chosen"},
        {"op": "mv", "ref": "chosen", "to": "under", "tf": {"own": "self", "color": "blue"}}]}], "B")
    reg('id_0847', '【宣言】【スリープ】手札から特徴[少年探偵団]のキャラを1枚公開し', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1},
        {"c": "stackCost", "n": 1, "from": "hand", "onto": "pick", "ontoF": {"own": "self", "color": "blue"}, "filter": {"type": "char", "trait": "少年探偵団"}}], "ops": [sel({"lvMax": 7})]}], "B")

    # ── 특수 ──
    reg('id_0735', '自分の手札にある【青】のカードは', [{"ic": "static", "tgt": {"sel": "self"}, "pk": "handcut", "tr": "blue:1000"}], "A")
    reg('id_0735', '【パートナー(青)】【登場時】相手の現場にいるレベル8以下のキャラを1枚までと', [{"ic": "onplay", "cond": {"pcolor": "blue"}, "ops": [{"op": "bottomSame", "filter": {"lvMax": 8}}]}], "G")
