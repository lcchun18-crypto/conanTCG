"""묶음 d: 뒷면 세트(fd) / 겹침 / 손패 공개 / 덱 공개 탐색 / 이름 바꿔쓰기 계열 (27장)"""
from ext_p1 import sel, done, notdone

DISC1 = {"op": "discard", "n": 1}
POL = {"names": ["大岡紅葉", "伊織無我"]}
KUDO_RAN = {"names": ["工藤新一", "毛利蘭"]}


def peekpick(n, groups=None, flt=None, pn=1, rest_to="rem"):
    """덱 위 n장을 보고, 조건에 맞는 카드를 공개하여 손패에 → 남은 것은 rest_to(rem / deckBottom)"""
    pk = {"op": "pick", "from": "seen", "reveal": True, "as": "chosen", "n": pn}
    if groups: pk["groups"] = groups
    else: pk["filter"] = flt
    return [{"op": "peek", "n": n}, pk, {"op": "mv", "ref": "chosen", "to": "hand"},
            {"op": "mv", "ref": "rest", "to": rest_to, **({"order": "any"} if rest_to == "deckBottom" else {})}]


def load(reg):
    # 0849: 소년탐정단 캐릭터를 리무브 에리어에서 【青】 캐릭터 아래에 겹침 → 그 캐릭터는 활성 상태 캐릭터를 지정해 액션 가능
    reg('id_0849', '自分のリムーブエリアにある特徴[少年探偵団]のキャラを1枚まで選び', [{"ic": "onplay", "ops": [
        {"op": "stackFrom", "from": "rem", "filter": {"type": "char", "trait": "少年探偵団"}, "hf": {"own": "self", "color": "blue"}},
        done({"op": "ref", "ref": "sel", "acts": [{"do": "kw", "v": "actactive", "until": "turn"}]})]}], "A")
    # 0859: 선언 — 뒷면 세트 카드 합쳐서 2장 리무브해도 된다 → 1장 드로우 (파트너 에리어에서도 선언 가능)
    reg('id_0859', '裏向きでセットされているカードを合わせて2枚リムーブしてもよい', [{"ic": "declare", "pa": True, "lim": 1, "cond": {"fh": {"own": "self", **POL}, "fhN": 1}, "ops": [
        {"op": "unsetFd", "n": 2, "scope": "any", "opt": True}, done({"op": "draw", "n": 1})]}], "A")
    # 0863: 등장 시 3택
    sd_sel = lambda who: {"op": "select", "n": 1, "filter": {"own": who, **({"name": "伊織無我"} if who == "self" else {})}, "do": "mark"}
    reg('id_0863', '以下から1つ選んで行う', [{"ic": "onplay", "ops": [{"op": "choose", "opts": [
        {"lab": "伊織無我: デッキ上を裏向きでセット + AP+2000", "ops": [sd_sel("self"), {"op": "setDeck", "n": 1, "deck": "self", "to": "sel"}, {"op": "ref", "ref": "sel", "acts": [{"do": "ap", "v": "2000", "until": "turn"}]}]},
        {"lab": "伊織無我: デッキ上を裏向きでセット + 突撃", "ops": [sd_sel("self"), {"op": "setDeck", "n": 1, "deck": "self", "to": "sel"}, {"op": "ref", "ref": "sel", "acts": [{"do": "kw", "v": "assault", "until": "turn"}]}]},
        {"lab": "相手のキャラ: 相手のデッキ上を裏向きでセット + スリープ", "ops": [sd_sel("opp"), {"op": "setDeck", "n": 1, "deck": "opp", "to": "sel"}, {"op": "ref", "ref": "sel", "acts": [{"do": "sleep"}]}]}]}]}], "B")
    # 0867: 이 캐릭터를 리무브해도 된다 → 양쪽 리무브 에리어를 덱 아래로, 덱을 섞음
    reg('id_0867', 'このキャラをリムーブしてもよい', [{"ic": "onplay", "ops": [{"op": "self", "do": "remove", "opt": True}, done({"op": "remToDeck", "who": "both"})]}], "A")
    # 0872: 현장 캐릭터 1장당 덱 위 1장을 뒷면으로 이 캐릭터에 세트
    reg('id_0872', '自分の現場にいるキャラ1枚につき', [{"ic": "onplay", "ops": [{"op": "setDeck", "n": 1, "deck": "self", "to": "self", "ncnt": {"src": "field", "f": {"own": "self"}}}]}], "B")
    # 0873: 내 캐릭터가 추리했을 때 — 내 캐릭터의 뒷면 세트 카드 1장 리무브해도 됨 → 1장 드로우
    reg('id_0873', '自分の現場にいるキャラが推理したとき', [{"ic": "ontrig", "evs": ["reason"], "who": "self", "lim": 1, "sf": {"own": "self", "type": "char"}, "ops": [
        {"op": "unsetFd", "n": 1, "scope": "mine", "opt": True}, done({"op": "draw", "n": 1})]}], "A")
    # 0875: 선언(슬립) — 리무브 에리어의 工藤有希子 1장을 뒷면으로 이 캐릭터에 세트 → 레벨7 이하 캐릭터를 덱 아래로
    reg('id_0875', '自分のリムーブエリアにあるカード名[工藤有希子]を1枚まで選び', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1}], "ops": [
        {"op": "setFd", "from": "rem", "filter": {"name": "工藤有希子"}, "to": "self"}, done(sel({"lvMax": 7}, do="deckBottom"))]}], "A")
    # 0888: 덱 위 3장 → 1장 공개해 손패, 나머지 리무브 에리어. 4명의 이름 이외를 가져오면 손패 1장 리무브
    reg('id_0888', '自分のデッキのカードを上から3枚見る', [{"ic": "onplay", "ops": [*peekpick(3, flt={}),
        {"op": "if", "c": "reg", "ref": "chosen", "n": 1, "cmp": "ge", "ops": [
            {"op": "if", "c": "reg", "ref": "chosen", "filters": [{"names": ["諸星大", "宮野志保", "宮野エレーナ", "宮野厚司"]}], "n": 1, "cmp": "ge", "ops": [], "else": [DISC1]}]}]}], "A")
    # 0895: 해결편 선언 — 덱 위 9장 리무브(코스트), 레벨 5/4/1 카드를 덱 아래로 → 3장 옮기면 상대 캐릭터를 덱 아래로
    reg('id_0895', '自分のリムーブエリアにあるレベル5のカードを1枚までと', [{"ic": "declare", "lim": 1, "cond": {"cstate": "solve", "fh": {"own": "self", "lvEq": 7}, "fhN": 3},
        "cost": [{"c": "sleepSelf", "n": 1}, {"c": "deckrem", "n": 9}], "ops": [
        {"op": "pick", "from": "rem", "as": "chosen", "groups": [{"filter": {"lvEq": 5}, "n": 1}, {"filter": {"lvEq": 4}, "n": 1}, {"filter": {"lvEq": 1}, "n": 1}]},
        {"op": "mv", "ref": "chosen", "to": "deckBottom", "order": "any"},
        {"op": "if", "c": "reg", "ref": "moved", "n": 3, "cmp": "ge", "ops": [sel({"own": "opp"}, do="deckBottom")]}]}], "B")
    # 0901: 이 캐릭터 또는 레벨7 이하 [警視庁] 캐릭터 1장을 덱 아래로(코스트) → 1장 드로우
    reg('id_0901', 'このキャラか、レベル7以下の特徴[警視庁]のキャラを1枚デッキの下に移す', [{"ic": "declare", "lim": 1, "cost": [
        {"c": "fieldBottom", "n": 1, "filter": {"own": "self", "any": [{"self": True}, {"trait": "警視庁", "lvMax": 7}]}}], "ops": [{"op": "draw", "n": 1}]}], "B")
    # 0905: 선언(슬립) — [喫茶ポアロ] 캐릭터를 손패에서 원하는 만큼 공개(코스트) → (공개 수 + 현장의 [喫茶ポアロ] 수) 이하 레벨 캐릭터 리무브
    reg('id_0905', '手札から特徴[喫茶ポアロ]のキャラを好きな枚数公開する', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1}, {"c": "revealVar", "n": 1, "filter": {"type": "char", "trait": "喫茶ポアロ"}}], "ops": [
        {"op": "lvBudgetRm", "hf": {"own": "self", "trait": "喫茶ポアロ", "type": "char"}, "rev": True}]}], "G")
    # 0906: 선언 — 이 캐릭터를 덱 아래로(코스트) → 턴 종료 시 손패의 레벨4 이하 [警察] 캐릭터 1장 등장
    reg('id_0906', '手札からレベル4以下の特徴[警察]のキャラを1枚まで登場させる', [{"ic": "declare", "cost": [{"c": "selfBottom", "n": 1}], "ops": [
        {"op": "delay", "evs": ["turnEnd"], "who": "self", "ops": [{"op": "play", "from": "hand", "n": 1, "filter": {"trait": "警察", "lvMax": 4}}]}]}], "B")
    # 0929: 이 캐릭터가 현장에서 리무브될 때(턴1) — 손패에서 【青】/【黒】 캐릭터 공개(코스트) → 레벨9 이하 내 캐릭터 리무브
    reg('id_0929', '手札から【青】か【黒】を持つキャラを1枚公開する', [{"ic": "onremoved", "lim": 1, "ops": [
        {"op": "optcost", "cost": [{"c": "revealHand", "n": 1, "filter": {"type": "char", "any": [{"color": "blue"}, {"color": "black"}]}}]},
        done(sel({"own": "self", "lvMax": 9}))]}], "B")
    # 0932: 등장 시 [シャッフルロマンス] 이벤트를 손패/리무브 에리어에서 내 캐릭터에 세트
    reg('id_0932', '自分の手札かリムーブエリアにあるカード名[シャッフルロマンス]のイベントを1枚まで選び', [{"ic": "onplay", "ops": [
        {"op": "setFrom", "from": "handrem", "filter": {"type": "event", "name": "シャッフルロマンス"}, "hf": {"own": "self"}}]}], "A")
    reg('id_0932', '表向きでセットされていたカード名[シャッフルロマンス]がリムーブエリアに置かれたとき', [{"ic": "ontrig", "evs": ["setOff"], "cond": {"turn": "opp"}, "lim": 1, "hw": "self",
        "sf": {"name": "シャッフルロマンス"}, "ops": [{"op": "mv", "ref": "ent", "to": "hand", "opt": True}]}], "B")
    # 0947: 내 턴 종료 시 — 손패의 工藤新一/毛利蘭 공개해도 됨 → 레벨8 이상 工藤新一/毛利蘭 1장 액티브 (파트너 에리어에서도 발동)
    reg('id_0947', '自分のターン終了時、手札からカード名[工藤新一]か[毛利蘭]を1枚公開してもよい', [{"ic": "onend", "pa": True, "cond": {"turn": "self"}, "ops": [
        {"op": "pick", "from": "hand", "filter": KUDO_RAN, "n": 1, "reveal": True, "as": "chosen"},
        done(sel({"own": "self", "lvMin": 8, **KUDO_RAN}, do="active"))]}], "B")
    # 0949: 絆 工藤新一 — 내 턴 중(턴1) 능력/효과/선언 코스트로 손패의 工藤新一/毛利蘭을 공개했을 때 → 손패 1장 리무브해도 됨 → 레벨7 이하 캐릭터 리무브
    reg('id_0949', '手札からカード名[工藤新一]か[毛利蘭]を公開したとき', [{"ic": "ontrig", "evs": ["hrev"], "who": "self", "lim": 1, "cond": {"turn": "self", "bond": "工藤新一"}, "sf": {**KUDO_RAN},
        "ops": [{"op": "discard", "n": 1, "opt": True}, done(sel({"lvMax": 7}))]}], "A")
    # 0991: 事件(白&黄) 선언 — 현장의 레벨6 이상 【黄】 [警察] 캐릭터 1장을 이 캐릭터 아래에 겹침(코스트) → 레벨6 이하 리무브
    reg('id_0991', '現場にいるレベル6以上の【黄】の特徴[警察]のキャラを1枚このキャラの下に重ねる', [{"ic": "declare", "cond": {"ccolor": "white&yellow"}, "cost": [
        {"c": "stackFld", "n": 1, "filter": {"lvMin": 6, "color": "yellow", "trait": "警察", "type": "char"}}], "ops": [sel({"lvMax": 6})]}], "A")
    # 1018: 事件編 등장 시 — 덱 위 3장에서 【白】/【黄】 캐릭터 1장까지와 【白】/【黄】 이벤트 1장까지 공개해 손패, 남은 것은 리무브 에리어. 2장 가져오면 손패 1장 리무브
    WY = [{"color": "white"}, {"color": "yellow"}]
    reg('id_1018', '自分のデッキのカードを上から3枚見る', [{"ic": "onplay", "cond": {"cstate": "kase"}, "ops": [*peekpick(3, groups=[{"filter": {"type": "char", "any": WY}, "n": 1}, {"filter": {"type": "event", "any": WY}, "n": 1}]),
        {"op": "if", "c": "reg", "ref": "chosen", "n": 2, "cmp": "ge", "ops": [DISC1]}]}], "A")
    # 1048: 선언1 — 레벨8 이하 내 캐릭터를 골라도 됨 → 덱 위에서 같은 레벨·같은 카드명 캐릭터가 나올 때까지 공개, 등장 + 턴 종료 시 덱 아래, 나머지는 덱 아래 + 셔플
    reg('id_1048', '自分の現場にいるレベル8以下のキャラを1枚選んでもよい', [{"ic": "declare", "lim": 1, "ops": [
        {"op": "select", "n": 1, "filter": {"own": "self", "lvMax": 8}, "do": "mark"},
        done({"op": "dig", "deck": "self", "ref": "sel", "byName": True, "byLv": True, "type": "char", "cap": 60, "hit": "play", "rest": "bottom", "shuffle": True,
              "g": {"ic": "onend", "cond": {}, "ops": [{"op": "self", "do": "deckBottom"}], "txt": "【ターン終了時】このキャラを現場からデッキの下に移す。"}})]}], "G")
    # 1048: 선언2 — 손패의 레벨8 이하 캐릭터 1장 공개(코스트) → 내 캐릭터 1장의 카드명을 턴 종료 시까지 공개한 카드명으로 (파트너 에리어에서도 선언 가능)
    reg('id_1048', '手札からレベル8以下のキャラを1枚公開する', [{"ic": "declare", "pa": True, "lim": 1, "cost": [{"c": "revealHand", "n": 1, "filter": {"type": "char", "lvMax": 8}}], "ops": [
        {"op": "select", "n": 1, "filter": {"own": "self"}, "do": "mark"}, done({"op": "rename", "from": "costRev", "ref": "sel"})]}], "A")
    # 1049: 事件(赤&黒) 등장 시 — 상대 레벨7 이상 캐릭터 리무브 → 상대 덱 위에서 같은 카드명 캐릭터가 나오거나 10장 공개할 때까지 공개해 모두 리무브 에리어로
    reg('id_1049', '相手の現場にいるレベル7以上のキャラを1枚まで選び、リムーブする', [{"ic": "onplay", "cond": {"ccolor": "red&black"}, "ops": [
        sel({"own": "opp", "lvMin": 7}), done({"op": "dig", "deck": "opp", "ref": "sel", "byName": True, "type": "char", "cap": 10, "hit": "rem", "rest": "rem"})]}], "G")
    # 1049: 선언 — 1장 드로우. 손패 1장 리무브 또는 이 캐릭터 리무브 (파트너 에리어에서도 선언 가능)
    reg('id_1049', 'カードを1枚引く。手札を1枚リムーブするか', [{"ic": "declare", "pa": True, "lim": 1, "ops": [{"op": "draw", "n": 1}, {"op": "choose", "opts": [
        {"lab": "手札を1枚リムーブ", "ops": [DISC1]}, {"lab": "このキャラをリムーブ", "ops": [{"op": "self", "do": "remove"}]}]}]}], "B")
    # 1056: 등장 시 — 덱 위 1장, [警視庁] 캐릭터면 공개해 손패, 나머지는 덱 아래. 가져오면 그 카드의 레벨만큼 덱 위를 리무브
    reg('id_1056', '自分のデッキのカードを上から1枚見る', [{"ic": "onplay", "ops": [*peekpick(1, flt={"type": "char", "trait": "警視庁"}, rest_to="deckBottom"),
        {"op": "if", "c": "reg", "ref": "chosen", "n": 1, "cmp": "ge", "ops": [{"op": "deckrem", "n": 1, "nref": {"ref": "chosen", "by": "lv"}}]}]}], "B")
    # 1065: 이 캐릭터의 액션 종료 시(턴1) 2택
    reg('id_1065', 'このキャラのアクション終了時、以下から1つ選んで行う', [{"ic": "ontrig", "evs": ["actend"], "sub": "self", "lim": 1, "ops": [{"op": "choose", "opts": [
        {"lab": "このキャラに裏向きでセットされているカードを1枚手札に加える", "ops": [{"op": "fdTo", "to": "hand"}]},
        {"lab": "裏向きカードがセットされていない[サッカー選手]のキャラに裏向きカードを1枚移す", "ops": [{"op": "moveSet", "filter": {"own": "self", "trait": "サッカー選手"}, "toEmpty": True}]}]}]}], "B")
    # 1083: 선언 — [服部平次] / 【緑】[警察] 캐릭터에 뒷면으로 세트된 카드 합쳐서 2장 리무브(코스트) → 레벨7 이하 슬립 캐릭터 리무브
    reg('id_1083', '現場にいるカード名[服部平次]か【緑】の特徴[警察]のキャラに裏向きでセットされているカードを合わせて2枚リムーブする', [{"ic": "declare", "lim": 1, "cost": [
        {"c": "fdUnset", "n": 2, "scope": "any", "hf": {"any": [{"name": "服部平次"}, {"color": "green", "trait": "警察"}]}}], "ops": [sel({"lvMax": 7, "st": "s"})]}], "A")
    # 1084: 선언 — 현장 캐릭터에 뒷면으로 세트된 카드 합쳐서 2장 리무브(코스트) → 1장 드로우
    reg('id_1084', '現場にいるキャラに裏向きでセットされているカードを合わせて2枚リムーブする', [{"ic": "declare", "lim": 1, "cost": [{"c": "fdUnset", "n": 2, "scope": "any"}], "ops": [{"op": "draw", "n": 1}]}], "A")
    # 1100: 등장 시 — 상대 캐릭터에 뒷면으로 세트된 카드 1장 리무브해도 됨 → 1장 드로우
    reg('id_1100', '相手の現場にいるキャラに裏向きでセットされているカードを1枚リムーブしてもよい', [{"ic": "onplay", "ops": [{"op": "unsetFd", "n": 1, "scope": "opp", "opt": True}, done({"op": "draw", "n": 1})]}], "A")
    # 1113: 事件(赤&黄) 등장 시 — 덱 위 4장에서 赤/黄 카드 1장 공개해 손패, 나머지 덱 아래(순서 자유). 레벨6 이하를 가져오면 손패 1장 리무브
    reg('id_1113', '自分のデッキのカードを上から4枚見る', [{"ic": "onplay", "cond": {"ccolor": "red&yellow"}, "ops": [*peekpick(4, flt={"any": [{"color": "red"}, {"color": "yellow"}]}, rest_to="deckBottom"),
        {"op": "if", "c": "reg", "ref": "chosen", "filters": [{"lvMax": 6}], "n": 1, "cmp": "ge", "ops": [DISC1]}]}], "A")
    # 1128: 선언 — 이 캐릭터를 덱 아래로(코스트) → 덱 위에서 레벨4/5의 [喫茶ポアロ]/[警察]/[少年探偵団] 캐릭터가 나올 때까지 공개해 손패, 나머지는 덱 아래 + 셔플
    reg('id_1128', '自分のデッキのカードを上からレベル4か5の特徴', [{"ic": "declare", "cost": [{"c": "selfBottom", "n": 1}], "ops": [
        {"op": "reveal", "filter": {"type": "char", "lvMin": 4, "lvMax": 5, "any": [{"trait": "喫茶ポアロ"}, {"trait": "警察"}, {"trait": "少年探偵団"}]}, "then": "hand", "rest": "bottom", "shuffle": True}]}], "B")
