"""묶음 E (Turn 26): 38장 — 변장 교체 트리거, 대체 선언 코스트, 능력 무효, 상태 단계 이동 등"""
from ext_p1 import sel, selkw, done, notdone

DISC1 = {"op": "discard", "n": 1, "opt": True}
# 카드를 손패에 더한 뒤 손패가 6장 이상이면 1장 리무브
HAND6 = {"op": "if", "c": "done", "ops": [{"op": "ifc", "cond": {"cnt": [{"src": "hand", "op": "ge", "n": 6}]}, "ops": [{"op": "discard", "n": 1}]}]}
BJ = {"trait": "ビッグジュエル"}


def load(reg):
    # 0307: 베르모트가 변장으로 이 캐릭터와 교체되었을 때(교체되어 떠난 뒤 발동)
    reg('id_0307', 'ベルモット', [{"ic": "ontrig", "evs": ["disguise"], "who": "self", "sw": True, "sf": {"name": "ベルモット"}, "ops": [sel({}, 'sleep')]}], "A")
    # 0318: 내 [空手家] 수만큼 상대 캐릭터 슬립 + 내 [空手家] 전원 AP+1000
    reg('id_0318', '空手家', [{"ic": "event", "ops": [
        {"op": "select", "n": 1, "ncnt": {"src": "field", "f": {"own": "self", "trait": "空手家"}}, "filter": {"own": "opp"}, "do": "sleep"},
        {"op": "select", "all": True, "n": 1, "filter": {"own": "self", "trait": "空手家"}, "do": "ap", "v": "1000"}]}], "B")
    # 0321: 파트너(적) 선언 — 현장의 Lv7+ 아카이/라이를 리무브(코스트) → 이 캐릭터 액티브
    reg('id_0321', '赤井秀一', [{"ic": "declare", "cond": {"pcolor": "red"}, "lim": 1, "cost": [
        {"c": "fieldRem", "n": 1, "filter": {"any": [{"name": "赤井秀一", "lvMin": 7}, {"name": "ライ", "lvMin": 7}]}}],
        "ops": [{"op": "self", "do": "active"}]}], "B")
    # 0348: 상대 캐릭터가 액션했을 때, 이 캐릭터가 슬리프면 내 [警察] 1장 액티브
    reg('id_0348', 'アクションしたとき', [{"ic": "ontrig", "evs": ["act"], "who": "opp", "lim": 1, "sf": {"type": "char"}, "cond": {"selfSt": "s"},
        "ops": [sel({"own": "self", "trait": "警察"}, 'active')]}], "B")
    # 0437: 레벨 합계 10 이하가 되도록 2장까지 스턴
    reg('id_0437', 'レベルの合計が10以下', [{"ic": "event", "cond": {"pcolor": "white", "cstate": "solve"}, "ops": [sel({}, 'stun', 2, sumLv=10)]}], "B")
    # 0468: 손패 2장 리무브 → 리무브 에리어의 Lv8 이하 [警察] 합계 Lv10 이하 2장까지, 1장은 통상·나머지는 슬리프로 등장
    reg('id_0468', '手札を2枚リムーブしてもよい', [{"ic": "event", "cond": {"pcolor": "yellow", "cstate": "solve"}, "ops": [
        {"op": "optcost", "cost": [{"c": "discard", "n": 2}]},
        done({"op": "pick", "from": "rem", "filter": {"type": "char", "trait": "警察", "lvMax": 8}, "n": 2, "sumLv": 10, "as": "chosen", "reveal": True, "msg": "등장시킬 캐릭터"},
             {"op": "playSplit", "ref": "chosen"})]}], "A")
    # 0537: 내 [探偵] 캐릭터는 코스트 대신 이 캐릭터를 리무브하고 선언 능력을 선언할 수 있다
    reg('id_0537', 'このキャラを現場からリムーブすることで', [{"ic": "static", "pk": "altdecl", "tgt": {"sel": "allies", "filter": {"trait": "探偵"}}}], "A")
    # 0561: 상대 턴 — 슬리프 상태의 이 캐릭터/내 [探偵]가 리무브되었을 때 1장 드로우
    reg('id_0561', 'スリープ状態のこのキャラか', [{"ic": "ontrig", "evs": ["removed"], "incl": True, "who": "self", "lim": 1, "cond": {"turn": "opp"},
        "sf": {"own": "self", "trait": "探偵", "st": "s"}, "ops": [{"op": "draw", "n": 1}]}], "A")
    # 0585: 턴 종료 시 리무브 에리어의 Lv6 이하 [長野県警] → 손패, 손패 6장 이상이면 1장 리무브
    reg('id_0585', '長野県警', [{"ic": "onend", "ops": [{"op": "fetch", "n": 1, "from": "rem", "filter": {"type": "char", "lvMax": 6, "trait": "長野県警"}}, HAND6]}], "B")
    # 0626: 登場時 — 현장에 Lv6+ [探偵]/[喫茶ポアロ] 가 있으면 이 캐릭터를 스턴시켜도 됨 → Lv7 이하 리무브
    reg('id_0626', 'このキャラをスタンさせてもよい', [{"ic": "onplay", "cond": {"cstate": "solve", "fh": {"own": "self", "lvMin": 6, "any": [{"trait": "探偵"}, {"trait": "喫茶ポアロ"}]}, "fhN": 1}, "ops": [
        {"op": "self", "do": "stun", "opt": True}, done(sel({"lvMax": 7}))]}], "B")
    # 0628: 선언(파트너 에리어에서도) — 내 캐릭터 3장 이상, LP 합계 2 이하
    reg('id_0628', 'カードを1枚引く。自分の手札が5枚以上', [{"ic": "declare", "pa": True, "lim": 1, "cond": {"fh": {"own": "self"}, "fhN": 3, "lpSumMax": 2}, "ops": [
        {"op": "draw", "n": 1}, {"op": "ifc", "cond": {"cnt": [{"src": "hand", "op": "ge", "n": 5}]}, "ops": [{"op": "discard", "n": 1}]}]}], "A")
    # 0679: 解決編 登場時 — 손패 1장 리무브 → LP0 인 鉄刃 액티브
    reg('id_0679', '鉄刃', [{"ic": "onplay", "cond": {"cstate": "solve"}, "ops": [DISC1, done(sel({"own": "self", "name": "鉄刃", "lpMax": 0}, 'active'))]}], "B")
    # 0741: 컷인 AP+1000, 白鳥任三郎/[少年探偵団]에게 컷인했으면 1장 드로우
    reg('id_0741', 'カットイン】AP+1000', [
        {"ic": "cutin", "v": 1000},
        {"ic": "cutin", "v": 0, "cond": {"cin": {"any": [{"name": "白鳥任三郎"}, {"trait": "少年探偵団"}]}}, "ops": [{"op": "draw", "n": 1}]}], "B")
    # 0745: 3모드 중 1개 / 코난을 슬리프시키면 3개 모두
    m1 = {"lab": "스턴 캐릭터를 액티브로 → 다시 액티브", "ops": [{"op": "select", "n": 1, "filter": {"st": "x"}, "acts": [{"do": "active"}, {"do": "active"}], "do": "active"}]}
    m2 = {"lab": "[怪盗] 캐릭터를 스턴", "ops": [sel({"trait": "怪盗"}, 'stun')]}
    m3 = {"lab": "리무브 에리어의 캐릭터를 손패에", "ops": [{"op": "fetch", "n": 1, "from": "rem", "filter": {"type": "char"}}]}
    reg('id_0745', '以下から1つ選んで行う', [{"ic": "event", "ops": [
        sel({"own": "self", "name": "江戸川コナン", "st": "a"}, 'sleep'),
        {"op": "if", "c": "done", "ops": m1["ops"] + m2["ops"] + m3["ops"], "else": [{"op": "choose", "opts": [m1, m2, m3]}]}]}], "B")
    # 0751: 登場時 — 【緑】이벤트의 효과로 등장했다면 이 캐릭터를 슬립시켜도 됨 → Lv7 이하 리무브
    reg('id_0751', '【緑】のイベントの効果によって登場', [{"ic": "onplay", "cond": {"cstate": "solve", "via": [{"type": "event", "lvMin": 0, "color": "green"}]}, "ops": [
        {"op": "self", "do": "sleep", "opt": True}, done(sel({"lvMax": 7}))]}], "A")
    # 0756: 상대 턴 — 상대 현장에 Lv8 캐릭터가 등장했을 때 1장 드로우(선택) → 1장 리무브
    reg('id_0756', 'レベル8のキャラが登場したとき', [{"ic": "ontrig", "evs": ["enter"], "who": "opp", "cond": {"turn": "opp"}, "sf": {"type": "char", "lvEq": 8}, "ops": [
        {"op": "draw", "n": 1, "opt": True}, done({"op": "discard", "n": 1})]}], "B")
    # 0758: 파트너(녹) — AP8000 이하 리무브, 능력/효과로 사용되었으면 1장 드로우
    reg('id_0758', 'このイベントが能力や効果によって使用されていた', [{"ic": "event", "cond": {"pcolor": "green"}, "ops": [
        sel({"apMax": 8000}), {"op": "ifc", "cond": {"viaEffect": True}, "ops": [{"op": "draw", "n": 1}]}]}], "B")
    # 0761: 선언(슬립+손패1리무브) — AP8000 이하 리무브, 파트너 에리어의 [ビッグジュエル] 1장 리무브하면 2장 드로우
    reg('id_0761', 'AP8000以下のキャラを1枚までで選び', [{"ic": "declare", "cost": [{"c": "sleepSelf", "n": 1}, {"c": "discard", "n": 1}], "ops": [
        sel({"apMax": 8000}), {"op": "optcost", "cost": [{"c": "paRem", "n": 1, "filter": BJ}]}, done({"op": "draw", "n": 2})]}], "B")
    # 0765: 解決編 登場時 — 내 【白】 1장 슬립 + 손패 1장 리무브 → Lv7 이하 리무브 / 黒羽快斗를 슬립시켰다면 1장 드로우
    reg('id_0765', '黒羽快斗', [{"ic": "onplay", "cond": {"cstate": "solve"}, "ops": [
        {"op": "optcost", "cost": [{"c": "sleepAny", "n": 1, "filter": {"color": "white"}}, {"c": "discard", "n": 1}]},
        done(sel({"lvMax": 7})),
        {"op": "ifCost", "k": "slept", "filter": {"name": "黒羽快斗"}, "ops": [{"op": "draw", "n": 1}]}]}], "A")
    # 0766: 登場時 — 파트너 에리어의 [ビッグジュエル] 2장 리무브 → 리무브 에리어의 Lv6 이하 中森青子 1장 슬립 상태로 등장
    reg('id_0766', 'ビッグジュエル', [{"ic": "onplay", "ops": [
        {"op": "optcost", "cost": [{"c": "paRem", "n": 2, "filter": BJ}]},
        done({"op": "play", "from": "rem", "n": 1, "asleep": True, "filter": {"lvMax": 6, "name": "中森青子"}})]}], "B")
    # 0809: 登場時 — 리무브 에리어의 Lv1 이하 【黄】 이벤트 → 손패, 손패 6장 이상이면 1장 리무브
    reg('id_0809', 'レベル1以下の【黄】のイベント', [{"ic": "onplay", "ops": [{"op": "fetch", "n": 1, "from": "rem", "filter": {"type": "event", "lvMax": 1, "color": "yellow"}}, HAND6]}], "B")
    # 0814: 미스리드1
    reg('id_0814', 'ミスリード】1', [{"ic": "static", "cond": {}, "tgt": {"sel": "self"}, "kw": "misread1", "txt": "【ミスリード】1 (相手の推理に対し、スリープさせることでLP-1する)"}], "B")
    # 0874: 解決編 登場時 — 상대 캐릭터 1장: 슬립이면 스턴, 액티브면 슬립
    reg('id_0874', 'スタンさせる。そのキャラがアクティブ状態', [{"ic": "onplay", "cond": {"cstate": "solve"}, "ops": [{"op": "selAdv", "filter": {"own": "opp"}}]}], "A")
    # 0966: 파트너(녹) 解決編 登場時 — 내 Lv6+ [探偵] 1장 슬립 + 손패 1장 리무브 → Lv7 이하 리무브 / 服部平次·江戸川コナン 슬립이면 1장 드로우
    reg('id_0966', '服部平次', [{"ic": "onplay", "cond": {"pcolor": "green", "cstate": "solve"}, "ops": [
        {"op": "optcost", "cost": [{"c": "sleepAny", "n": 1, "filter": {"lvMin": 6, "trait": "探偵"}}, {"c": "discard", "n": 1}]},
        done(sel({"lvMax": 7})),
        {"op": "ifCost", "k": "slept", "filter": {"names": ["服部平次", "江戸川コナン"]}, "ops": [{"op": "draw", "n": 1}]}]}], "A")
    # 1005: 내 턴 — 내 현장에 Lv8 캐릭터가 등장했을 때, 상대 현장에 Lv7 이 없으면 1장 드로우
    reg('id_1005', 'レベル8のキャラが登場したとき', [{"ic": "ontrig", "evs": ["enter"], "who": "self", "lim": 1, "sf": {"type": "char", "own": "self", "lvEq": 8},
        "cond": {"turn": "self", "cnt": [{"src": "field", "f": {"own": "opp", "lvEq": 7}, "op": "eq", "n": 0}]}, "ops": [{"op": "draw", "n": 1}]}], "B")
    # 1010: 내 턴 종료 시 — 이번 턴 【疾風】을 발동한 내 캐릭터 전원 액티브(파트너 에리어에서도)
    reg('id_1010', '疾風', [{"ic": "onend", "pa": True, "ops": [sel({"own": "self", "hayFired": True}, 'active', all=True)]}], "B")
    # 1029: AP8000 이하 리무브, 이번 턴 내 캐릭터가 등장하지 않았다면 리무브 에리어의 Lv4 이하 [警察] 등장
    reg('id_1029', 'このターン中、自分の現場にキャラが登場していない', [{"ic": "event", "ops": [
        sel({"apMax": 8000}), {"op": "ifc", "cond": {"noEnter": True}, "ops": [{"op": "play", "from": "rem", "n": 1, "filter": {"lvMax": 4, "trait": "警察"}}]}]}], "B")
    # 1035: 解決編 선언(슬립) — 이 캐릭터와 같은 AP의 캐릭터 1장 리무브
    reg('id_1035', '同じAPのキャラ', [{"ic": "declare", "cond": {"cstate": "solve"}, "cost": [{"c": "sleepSelf", "n": 1}], "ops": [sel({"apEq": "self", "notSelf": True})]}], "B")
    # 1036: 事件【赤】&【黒】 事件編 登場時
    reg('id_1036', '手札から【赤】か【黒】のカード', [{"ic": "onplay", "cond": {"ccolor": "red&black", "cstate": "kase"}, "ops": [
        {"op": "discard", "n": 1, "opt": True, "filter": {"any": [{"color": "red"}, {"color": "black"}]}},
        done({"op": "draw", "n": 2}, {"op": "if", "c": "reg", "ref": "removed", "filters": [{"lvMin": 7}], "ops": [{"op": "deckrem", "n": 3, "who": "opp"}]})]}], "B")
    # 1054: 내 턴 登場時/変装時 — 파트너 에리어의 [ビッグジュエル] 1장 리무브 → Lv7 이하 슬립/스턴 캐릭터 리무브
    k_ops = [{"op": "optcost", "cost": [{"c": "paRem", "n": 1, "filter": BJ}]}, done(sel({"lvMax": 7, "st": "sx"}))]
    reg('id_1054', 'ビッグジュエル', [{"ic": "onplay", "cond": {"turn": "self"}, "ops": k_ops}, {"ic": "ondisguise", "cond": {"turn": "self"}, "ops": k_ops}], "B")
    # 1106: 턴 종료 시 내 현장에 怪盗キッド 가 있으면 리무브 에리어의 [ビッグジュエル] 이벤트 → 파트너 에리어 또는 손패
    reg('id_1106', '怪盗キッド', [{"ic": "onend", "cond": {"fh": {"own": "self", "name": "怪盗キッド"}, "fhN": 1}, "ops": [
        {"op": "pick", "from": "rem", "filter": {"type": "event", "trait": "ビッグジュエル"}, "n": 1, "as": "chosen", "reveal": True, "msg": "리무브 에리어의 이벤트"},
        done({"op": "choose", "opts": [{"lab": "파트너 에리어로 이동", "ops": [{"op": "mv", "ref": "chosen", "to": "pa"}]}, {"lab": "손패에 넣는다", "ops": [{"op": "mv", "ref": "chosen", "to": "hand"}]}]})]}], "B")
    # 1127: 상대 턴 — 상대 캐릭터가 액션[事件]했을 때 이 캐릭터를 액티브(선택)
    reg('id_1127', 'アクション[事件]', [{"ic": "ontrig", "evs": ["act"], "who": "opp", "k": "case", "lim": 1, "cond": {"turn": "opp"}, "sf": {"type": "char"}, "ops": [{"op": "self", "do": "active", "opt": True}]}], "B")
    # 1137: 리무브 에리어의 지정 5명 중 1장 → 손패, 그 카드의 레벨 이상의 캐릭터 1장 리무브
    reg('id_1137', '降谷零', [{"ic": "event", "ops": [
        {"op": "fetch", "n": 1, "from": "rem", "filter": {"names": ["降谷零", "諸伏景光", "伊達航", "萩原研二", "松田陣平"]}},
        done(sel({"lvMin": "reg:moved:first"}))]}], "A")
    # 0419: 이 캐릭터나 服部平次 가 내 현장에 등장했을 때 상대 캐릭터 1장의 원래 능력을 턴 종료 시까지 무효
    reg('id_0419', '元の能力を無効', [{"ic": "ontrig", "evs": ["enter"], "who": "self", "sub": "orSelf", "sf": {"name": "服部平次", "own": "self"}, "ops": [{"op": "blankAb", "filter": {"own": "opp"}}]}], "A")
    # 0576: 解決編 상대 턴 종료 시 — 내 현장 2장 이하면 상대는 손패 1장 리무브
    reg('id_0576', '相手は手札を1枚リムーブする', [{"ic": "onend", "cond": {"turn": "opp", "cstate": "solve", "cnt": [{"src": "field", "f": {"own": "self"}, "op": "le", "n": 2}]}, "ops": [{"op": "discard", "n": 1, "who": "opp"}]}], "B")
    # 1094: 解決編 내 턴 — 내 현장에 服部平蔵/遠山銀司郎 가 있으면 손패의 이 이벤트 Lv-3
    reg('id_1094', 'レベル-3', [{"ic": "hand", "cond": {"cstate": "solve", "turn": "self", "fh": {"own": "self", "any": [{"name": "服部平蔵"}, {"name": "遠山銀司郎"}]}, "fhN": 1}, "lvd": -3}], "B")
    # 1099: 解決編 내 턴 — 상대 캐릭터가 컨택트로 리무브되어도 그 【現場リムーブ時】는 발동하지 않는다
    reg('id_1099', '現場リムーブ時】は発動しない', [{"ic": "static", "pk": "noremtrig", "cond": {"cstate": "solve", "turn": "self"}, "tgt": {"sel": "self"}}], "A")
    # 1107: 내 사건이 [工藤新一 NYの事件] 일 때 사건 카드의 색을 무시
    reg('id_1107', '工藤新一 NYの事件', [{"ic": "ignorecolor", "cond": {"cname": "工藤新一 NYの事件"}, "lim": 0}], "A")
