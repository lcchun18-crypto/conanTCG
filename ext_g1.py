"""묶음 g1: 상시 규칙 / 키워드 부여 / 제한 / 스탯 보정 / 반응형 트리거 (28장)
cls: A=신규 공통 프리미티브(또는 pk/kw), B=기존 프리미티브 조합, G=카드 전용"""
from ext_p1 import sel, done, notdone


def ST(**k): return {"ic": "static", "tgt": {"sel": "self"}, **k}
def ENT(do, v="", until="turn"): return {"op": "ent", "do": do, **({"v": v} if v else {}), "until": until}
def SELF(do, v="", until="turn", **k): return {"op": "self", "do": do, **({"v": v} if v else {}), "until": until, **k}
DISC1 = {"op": "discard", "n": 1, "opt": True}


def load(reg):
    # 0192: 【ターン①】 필수 지정(이 턴에 한 번만) — kw mdonce (server.js mustDesig 가 턴당 1회로 판정)
    reg('id_0192', '【ターン①】相手の現場にいるキャラがアクションするとき', [ST(kw="mdonce")], "A")

    # 0407: 지정된 이벤트로만 / 파트너 모든 색 / 현장 최대 4장
    reg('id_0407', 'この事件は指定されたイベントでのみ使用できる', [ST(pk="evcase")], "A")
    reg('id_0407', '自分のパートナーの色は', [ST(pk="pcolorAll")], "B")
    reg('id_0407', '自分の現場に置けるキャラの枚数は最大4枚', [ST(pk="field4")], "B")

    # 0432: 【絆】鈴木園子 내 턴 중 상대는 컷인 불가 + 상대 캐릭터의 변장 시 발동 안 함
    C432 = {"bond": "鈴木園子", "turn": "self"}
    reg('id_0432', '【絆】鈴木園子【自分ターン中】相手は', [ST(cond=C432, pk="nocutin"), ST(cond=C432, pk="nodisev")], "B")

    # 0459: 내 캐릭터가 가드했을 때 그 캐릭터 AP+1000 (지정된 게 三池苗子라면 +3000) — 액션 종료 시까지
    reg('id_0459', '自分の現場にいるキャラがガードしたとき', [{"ic": "ontrig", "evs": ["guard"], "who": "self", "ops": [
        {"op": "ifc", "cond": {"dstName": "三池苗子"}, "ops": [ENT("ap", "3000", "contact")], "else": [ENT("ap", "1000", "contact")]}]}], "B")

    # 0513: 【絆】毛利小五郎 선언 ターン① 손패 1장 리무브: 이 턴 내 毛利探偵事務所 캐릭터가 액션했을 때 액션 종료 시까지 상대 컷인 불가
    reg('id_0513', '【絆】毛利小五郎【宣言】【ターン①】手札を1枚リムーブする', [{"ic": "declare", "cond": {"bond": "毛利小五郎"}, "lim": 1, "cost": [{"c": "discard", "n": 1}], "ops": [
        {"op": "delay", "evs": ["act"], "who": "self", "keep": True, "sf": {"own": "self", "trait": "毛利探偵事務所"}, "ops": [{"op": "turnPk", "key": "nocutin", "until": "action"}]}]}], "B")

    # 0518: 현장에서는 이름 毛利小五郎 로도, 특징 探偵 도 가진다
    reg('id_0518', '現場にいるこのキャラはカード名[毛利小五郎]としても扱い', [ST(nm="毛利小五郎"), ST(tr="探偵")], "B")

    # 0643: 내 턴 중 손패의 【緑】 특징[YAIBA] 캐릭터는 「컷인 AP+2000」을 가진다 (static pk handcut + v + tgt.filter)
    reg('id_0643', '自分の手札にある【緑】の特徴[YAIBA]のキャラは', [{"ic": "static", "cond": {"turn": "self"}, "pk": "handcut", "v": 2000,
        "tgt": {"sel": "self", "filter": {"type": "char", "color": "green", "trait": "YAIBA"}}}], "A")

    # 0668: 손패의 【白】 특징[YAIBA] 이벤트 레벨-1
    reg('id_0668', '自分の手札にある【白】の特徴[YAIBA]のイベントをレベル-1する', [{"ic": "static", "pk": "handLv", "v": -1,
        "tgt": {"sel": "self", "filter": {"type": "event", "color": "white", "trait": "YAIBA"}}}], "A")

    # 0737: 이 캐릭터의 컨택트 중 자신은 컷인 불가 (kw nocinself — server.js cont())
    reg('id_0737', 'このキャラのコンタクト中、自分はカットインを使用できない', [ST(kw="nocinself")], "A")

    # 0762: 내 턴 중 파트너 에리어에 특징[ビッグジュエル] 카드가 2장 이상이면 AP+2000
    reg('id_0762', '自分のパートナーエリアに特徴[ビッグジュエル]のカードが2枚以上ある場合', [ST(ap=2000, cond={"turn": "self", "cnt": [{"src": "pa", "op": "ge", "n": 2, "f": {"trait": "ビッグジュエル"}}]})], "B")

    # 0897: 내 턴 중 내 현장에 레벨7 캐릭터가 2장 이상이면 레벨+1 / AP+1000 / 突撃
    reg('id_0897', '自分の現場にレベル7のキャラが2枚以上いる場合', [ST(lv=1, ap=1000, kw="assault", cond={"turn": "self", "cnt": [{"src": "field", "op": "ge", "n": 2, "f": {"own": "self", "type": "char", "lvEq": 7}}]})], "B")

    # 0956: 선언 ターン① 원래 LP 0 이고 레벨4 인 특징[少年探偵団] 전원의 원래 LP를 턴 종료 시까지 1로
    reg('id_0956', '【宣言】【ターン①】自分の現場にいる元のLPが0でレベル4', [{"ic": "declare", "lim": 1, "ops": [
        {"op": "select", "all": True, "filter": {"own": "self", "type": "char", "lpBase": 0, "lvEq": 4, "trait": "少年探偵団"}, "acts": [{"do": "lpBase", "v": "1"}]}]}], "B")

    # 0962: 상대 턴 중 내 현장에 吉田歩美 이외의 레벨4 특징[少年探偵団] 캐릭터가 있으면 상대는 컷인 불가
    reg('id_0962', '【相手ターン中】自分の現場にカード名[吉田歩美]以外のレベル4', [ST(pk="nocutin", cond={"turn": "opp", "fhN": 1, "fh": {"own": "self", "type": "char", "nameNot": "吉田歩美", "lvEq": 4, "trait": "少年探偵団"}})], "B")

    # 0968: 이 캐릭터 이외의 특징[大阪府警] 아군에게 「【相手ターン中】【現場リムーブ時】 1장 드로 + 손패 1장 리무브」 부여 (static gab)
    reg('id_0968', '自分の現場にいるこのキャラ以外の特徴[大阪府警]のキャラに', [{"ic": "static", "tgt": {"sel": "allies", "notSelf": True, "filter": {"trait": "大阪府警"}},
        "gab": {"ic": "onremoved", "cond": {"turn": "opp"}, "ops": [{"op": "draw", "n": 1}, {"op": "discard", "n": 1}], "txt": "【相手ターン中】【現場リムーブ時】カードを1枚引き、手札を1枚リムーブする。"}}], "B")
    # 0968: 스리프 상태의 캐릭터를 리무브한 경우(리무브 처리 뒤, 떠난 시점의 상태로 판정) 덱 위 1장을 뒷면으로 이 캐릭터에 세트
    reg('id_0968', '手札から特徴[警察]のキャラを1枚公開する', [{"ic": "declare", "cond": {"pcolor": "green"}, "cost": [{"c": "sleepSelf", "n": 1}, {"c": "revealHand", "n": 1, "filter": {"type": "char", "trait": "警察"}}], "ops": [
        {"op": "select", "n": 1, "filter": {"lvMax": 7, "own": "opp"}, "do": "remove"},
        {"op": "ifLeft", "ref": "sel", "filter": {"type": "char", "st": "s"}, "ops": [{"op": "setDeck", "n": 1, "deck": "self", "to": "self"}]}]}], "A", pre=True)

    # 1077: 내 현장의 カード名[妃英理]는 특징[毛利探偵事務所]를 가진다 / 이름이 다른 毛利探偵事務所 4장 이상이면 迅速(기존 규칙)
    reg('id_1077', '自分の現場にいるカード名[妃英理]は特徴[毛利探偵事務所]を持つ', [{"ic": "static", "tgt": {"sel": "allies", "filter": {"name": "妃英理"}}, "tr": "毛利探偵事務所"}], "B")

    # 1098: 덱/리무브 에리어에서는 カード名[怪盗キッド]로도 취급 / 登場時 내 캐릭터의 능력으로 등장한 경우 턴 종료 시까지 (ターン① 상대 캐릭터를 이 캐릭터와의 컨택트로 리무브했을 때 리무브 에리어의 Lv3 이하 캐릭터를 등장)
    reg('id_1098', 'デッキかリムーブエリアにあるこのキャラはカード名[怪盗キッド]としても扱う', [ST(nm="怪盗キッド", az=True)], "A")
    reg('id_1098', '自分のキャラの能力によって登場した場合、ターン終了時までこのキャラは', [{"ic": "onplay", "cond": {"via": [{"type": "char"}]}, "ops": [
        {"op": "select", "all": True, "filter": {"own": "self", "self": True}, "acts": [{"do": "gab", "g": {"ic": "onkill", "lim": 1, "ops": [{"op": "play", "from": "rem", "n": 1, "filter": {"lvMax": 3}}],
            "txt": "【ターン①】相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、自分のリムーブエリアにあるレベル3以下のキャラを1枚まで選び、登場させる。"}}]}]}], "B")

    # 0710: 상대 턴 중 ターン① 이 캐릭터가 지정된 액션을 (다른 내 캐릭터가) 가드했을 때, 가드한 캐릭터를 액티브로 하고 턴 종료 시까지 AP+2000
    reg('id_0710', '【相手ターン中】【ターン①】このキャラが指定されたアクションをガードしたとき', [{"ic": "ontrig", "evs": ["guard"], "who": "self", "dself": True, "cond": {"turn": "opp"}, "lim": 1, "ops": [ENT("active"), ENT("ap", "2000")]}], "B", pre=True)

    # 0938: 레벨7 이상의 액티브 상대 캐릭터도 지정 가능 (kw act7up) / 내 턴 ターン① 자신보다 AP가 높은 캐릭터와 컨택트했을 때 손패 1장 리무브해도 좋다 → 그 컨택트 중 AP+3000
    reg('id_0938', 'このキャラは相手の現場にいるレベル7以上のアクティブ状態のキャラを指定して', [ST(kw="act7up")], "A")
    reg('id_0938', '【自分ターン中】【ターン①】このキャラが、このキャラよりAPの高いキャラとコンタクトしたとき', [{"ic": "oncontact", "cond": {"turn": "self"}, "lim": 1, "ef": {"apGt": "self"}, "ops": [
        DISC1, done(SELF("ap", "3000", "contact"))]}], "B")

    # 0984: 이 캐릭터의 액션이 Lv6 이하에게 가드되었을 때 그 캐릭터는 이 컨택트로 리무브되지 않음 / 선언 ターン① 이 턴 액션이 가드되었다면 Lv7 이상 캐릭터 리무브
    reg('id_0984', 'このキャラのアクションがレベル6以下のキャラによってガードされたとき', [{"ic": "ontrig", "evs": ["guard"], "tself": True, "sf": {"own": "opp", "lvMax": 6}, "ops": [{"op": "protect", "who": "ent"}]}], "B")
    reg('id_0984', '【宣言】【ターン①】レベル7以上のキャラを1枚まで選び', [{"ic": "declare", "cond": {"guarded": True}, "lim": 1, "ops": [sel({"lvMin": 7})]}], "B")

    # 1026: 이 캐릭터의 컨택트 중 諸伏景光/특징[長野県警] 캐릭터의 【N】컷인(손패 컷인)을 사용했을 때 그 컨택트 중 AP+2000
    reg('id_1026', 'このキャラのコンタクト中に自分がカード名[諸伏景光]か特徴[長野県警]のキャラの', [{"ic": "ontrig", "evs": ["cutin"], "who": "self", "tself": True,
        "sf": {"type": "char", "any": [{"name": "諸伏景光"}, {"trait": "長野県警"}]}, "ops": [SELF("ap", "2000", "contact")]}], "B")

    # 0544 / 0893 / 0975: 컷인 — 손패 리무브(선택) 후 레벨/AP에 비례해 컨택트 중 AP 증가, 현장의 探偵 수에 비례
    reg('id_0544', '【カットイン】【自分ターン中】手札を1枚リムーブしてもよい', [{"ic": "cutin", "cond": {"turn": "self"}, "v": 0, "ops": [
        DISC1, {"op": "ref", "ref": "cin", "acts": [{"do": "ap", "v": "1000", "until": "contact"}], "mul": {"ref": "removed", "by": "lv"}}]}], "B")
    reg('id_0893', '【カットイン】【自分ターン中】手札からキャラを1枚リムーブしてもよい', [{"ic": "cutin", "cond": {"turn": "self"}, "v": 0, "ops": [
        {"op": "discard", "n": 1, "opt": True, "filter": {"type": "char"}}, {"op": "ref", "ref": "cin", "acts": [{"do": "ap", "v": "1000", "until": "contact"}], "mul": {"ref": "removed", "by": "ap1000"}}]}], "B")
    reg('id_0975', '【自分ターン中】自分の現場にいる特徴[探偵]のキャラ1枚', [], "B")
    reg('id_0975', '【カットイン】につき、AP+1000', [{"ic": "cutin", "cond": {"turn": "self"}, "v": 1000, "per": {"src": "field", "f": {"own": "self", "type": "char", "trait": "探偵"}}}], "B")

    # 0689: 【絆】鈴木園子 ターン① 상대 캐릭터를 이 캐릭터와의 컨택트로 리무브했을 때 손패 1장 리무브해도 좋다 → 액티브 + 턴 종료 시까지 突撃[キャラ]를 잃고 突撃[事件]를 가짐
    reg('id_0689', '【絆】鈴木園子 【ターン①】相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき', [{"ic": "onkill", "cond": {"bond": "鈴木園子"}, "lim": 1, "ops": [
        DISC1, done(SELF("active"), SELF("kwLose", "assault-char"), SELF("kw", "assault-case"))]}], "B")

    # 1141: 파트너(黒) 내 턴 ターン① 이 캐릭터의 컨택트 중 バーボン의 컷인을 사용했을 때 액티브로 하고 턴 종료 시까지 컨택트 중 컷인 불가를 가짐 / 컷인 AP+1000 (컷인을 가진 【黒】 캐릭터에 컷인하면 1장 드로)
    reg('id_1141', '【パートナー(黒)】【自分ターン中】【ターン①】このキャラのコンタクト中に自分がカード名[バーボン]の', [{"ic": "ontrig", "evs": ["cutin"], "who": "self", "tself": True, "sf": {"type": "char", "name": "バーボン"},
        "cond": {"pcolor": "black", "turn": "self"}, "lim": 1, "ops": [SELF("active"), SELF("kw", "nocinself")]}], "B")
    reg('id_1141', '【カットイン】AP+1000、【カットイン】を持つ', [{"ic": "cutin", "v": 1000, "ops": [
        {"op": "ifc", "cond": {"cin": {"type": "char", "color": "black", "hasIc": "cutin"}}, "ops": [{"op": "draw", "n": 1}]}]}], "B")

    # 0855: 액션했을 때 턴 종료 시까지 「턴 종료 시, 이 턴 자신의 MR 능력으로 선택되지 않았다면 이 캐릭터를 현장에서 손패로」를 가짐
    reg('id_0855', 'このキャラがアクションしたとき、ターン終了時までこのキャラは', [{"ic": "onact", "ops": [
        {"op": "select", "all": True, "filter": {"own": "self", "self": True}, "acts": [{"do": "gab", "g": {"ic": "onend", "cond": {"noMrSel": True}, "ops": [{"op": "self", "do": "hand"}],
            "txt": "ターン終了時、このターン中にこのキャラが自分のMRの能力によって選ばれていなかった場合、このキャラを現場から手札に移す。"}}]}]}], "B")

    # 0886: 액션[キャラ]했을 때 지정한 캐릭터를 턴 종료 시까지 레벨-1, 그 캐릭터가 Lv6 이하면 액션 종료 시까지 AP+3000
    reg('id_0886', 'このキャラがアクション[キャラ]したとき', [{"ic": "ontrig", "evs": ["act"], "sub": "self", "k": "char", "ops": [
        {"op": "trigTgt", "do": "lv", "v": "-1", "until": "turn"},
        {"op": "if", "c": "reg", "ref": "sel", "filters": [{"lvMax": 6}], "ops": [SELF("ap", "3000", "contact")]}]}], "A")

    # 0733: 파트너(青) 선언 ターン① 덱 위 3장 리무브: 이 코스트로 리무브된 특징[少年探偵団]/[毛利探偵事務所] 카드 1장당 턴 종료 시까지 AP+1000, 突撃을 가짐
    reg('id_0733', '【パートナー】【青】【宣言】【ターン①】デッキのカードを上から3枚リムーブする', [{"ic": "declare", "cond": {"pcolor": "blue"}, "lim": 1, "cost": [{"c": "deckrem", "n": 3}], "ops": [
        {"op": "pick", "from": "cost", "as": "chosen", "all": True, "filter": {"any": [{"trait": "少年探偵団"}, {"trait": "毛利探偵事務所"}]}},
        {"op": "self", "do": "ap", "v": "1000", "until": "turn", "mul": {"ref": "chosen", "by": "count"}},
        SELF("kw", "assault")]}], "B")
