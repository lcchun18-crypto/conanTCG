"""묶음 g3: FILE / 증거 / 痕跡 / 카드명 바꿔쓰기 / 겹침 / 세트 / 손패·현장 → 리무브 코스트 계열 22장 (fx_ext_g3.js + 기존 fx_ext_a..e 의 op 사용)"""
from ext_p1 import sel, selkw, done, notdone

SLEEP = {"c": "sleepSelf", "n": 1}
FLIP2 = {"c": "flipEvid", "n": 2}
SOLVE = {"cstate": "solve"}


def ifc(cond, *ops, els=None):
    d = {"op": "ifc", "cond": cond, "ops": list(ops)}
    if els: d["else"] = list(els)
    return d


def cnt(src, n, op="ge", f=None):
    c = {"src": src, "op": op, "n": n}
    if f is not None: c["f"] = f
    return {"cnt": [c]}


def declare(cond, cost, ops, lim=0, **k):
    a = {"ic": "declare", "cond": cond, "cost": cost, "ops": ops, **k}
    if lim: a["lim"] = lim
    return a


NAME_FILE = [{"op": "nameDesig", "pool": "text", "kind": "any"}, {"op": "oppFileNamed"}]  # 카드명 지정 → 상대 FILE 위 1장 리무브 + 상대는 덱 위를 뒷면으로 FILE 위에
PEEK_BOTTOM = lambda ncnt: [  # 덱 위 N장을 보고, 1장까지 손패에 + 나머지는 좋아하는 순서로 덱 아래
    {"op": "peek", "deck": "self", "from": "top", "ncnt": ncnt}]
TAKE1 = [{"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "deckBottom", "order": "any"}]


def load(reg):
    # ── 0486 工藤有希子: 선언 — AP+1000, 캐릭터 카드명을 지정해 이 캐릭터의 카드명을 바꿔 써도 된다
    reg('id_0486', 'ターン終了時までこのキャラをAP+1000する。キャラのカード名を1つ指定し', [declare({}, [], [
        {"op": "self", "do": "ap", "v": "1000", "until": "turn"},
        {"op": "nameDesig", "pool": "text", "kind": "char", "opt": True, "ynMsg": "캐릭터의 카드 이름을 지정해서 이 캐릭터의 카드명을 바꿔 쓸까요?"},
        done({"op": "nameApply", "to": "self"})], lim=1)], "A")

    # ── 0979 怪盗キッド: 등장 시 손패 캐릭터(Lv8↓) 공개 → 그 카드명으로 바꿔 씀 / FILE5 선언: 같은 카드명 수에 따라
    reg('id_0979', '手札からレベル8以下のキャラを1枚公開してもよい', [{"ic": "onplay", "ops": [
        {"op": "pick", "from": "hand", "own": "self", "filter": {"type": "char", "lvMax": 8}, "n": 1, "min": 0, "as": "chosen", "reveal": True, "msg": "공개할 캐릭터"},
        done({"op": "nameSwap", "to": "self", "from": "chosen"})]}], "B")
    same = {"own": "self", "sameName": True}
    reg('id_0979', '自分の現場にいるこのキャラと同じカード名のキャラの数につき', [declare({"fileMin": 5}, [], [
        ifc(cnt("field", 2, "ge", same), sel({"apMax": 8000}, "deckBottom")),
        ifc(cnt("field", 5, "ge", same), {"op": "self", "do": "kw", "v": "assault-case"})], lim=1)], "B")
    reg('id_0979', '【2枚以上】AP8000以下のキャラを1枚まで選び', [], "B")
    reg('id_0979', '【5枚以上】ターン終了時までこのキャラは突撃[事件]を持つ', [], "B")

    # ── 0995 이벤트: 1장 드로 → FILE 수 이하 레벨의 【白】 캐릭터 등장 → 다른 캐릭터의 카드명으로 바꿔 써도 됨 / 컷인: 지정한 카드명 1장당 AP+1000
    reg('id_0995', 'カードを1枚引き、手札から自分のFILEエリアの枚数以下のレベルの', [{"ic": "event", "ops": [
        {"op": "draw", "n": 1},
        {"op": "play", "from": "hand", "n": 1, "filter": {"color": "white", "lvMax": "file"}},
        {"op": "nameSwap", "to": "played", "from": "pick", "filter": {"lvMax": 8}, "opt": True}]}], "B")
    reg('id_0995', 'カード名を1つ指定し、自分の現場にいる指定したカード名のキャラ1枚につき', [{"ic": "cutin", "cond": {"turn": "self"}, "v": 0, "ops": [{"op": "nameCountAp", "v": 1000}]}], "B")

    # ── 0998 赤井秀一: 登場時 — スリープ → Lv8↓リムーブ → 痕跡で分岐
    reg('id_0998', '【登場時】このキャラをスリープさせてもよい', [{"ic": "onplay", "cond": {"ccolor": "red&black", "pcolor": "red"}, "ops": [
        {"op": "self", "do": "sleep", "opt": True},
        done(sel({"lvMax": 8}), {"op": "choose", "opts": [
            {"lab": "痕跡[発見済み]: 自分のリムーブエリアのLv3以下の【黒】キャラをスリープ状態で登場", "ops": [
                ifc({"trace": "found"}, {"op": "play", "from": "rem", "n": 1, "asleep": True, "filter": {"lvMax": 3, "color": "black"}})]},
            {"lab": "痕跡[未発見]: 相手の現場のキャラ1枚につき、相手のデッキを上から2枚リムーブ", "ops": [
                ifc({"trace": "unfound"}, {"op": "deckrem", "who": "opp", "n": 1, "ncnt": {"src": "oppField"}, "nmul": 2})]}]})]}], "B")

    # ── 0999 アンドレ・キャメル: 파트너(赤) 선언 — 痕跡[発見済み]에서만, Lv6↑ 【黒】 캐릭터 1장 리무브 코스트
    reg('id_0999', '現場にいるレベル6以上の【黒】のキャラを1枚リムーブエリアに移す', [declare({"pcolor": "red", "trace": "found"},
        [{"c": "fieldRem", "n": 1, "filter": {"lvMin": 6, "color": "black"}}], [
            {"op": "draw", "n": 1}, {"op": "self", "do": "active"}, {"op": "self", "do": "kw", "v": "assault-char"}], lim=1)], "B")

    # ── 1031 キール: 내 턴 종료 시 — 痕跡에 따른 모드 선택
    reg('id_1031', '自分のターン終了時、以下から1つ選んで行う', [{"ic": "onend", "cond": {"turn": "self"}, "ops": [{"op": "choose", "opts": [
        {"lab": "痕跡[発見済み]: 1枚引く(手札が6枚以上なら手札を1枚リムーブ)", "ops": [
            ifc({"trace": "found"}, {"op": "draw", "n": 1}, ifc(cnt("hand", 6), {"op": "discard", "n": 1}))]},
        {"lab": "痕跡[未発見]: 相手のデッキを上から4枚リムーブ", "ops": [ifc({"trace": "unfound"}, {"op": "deckrem", "who": "opp", "n": 4})]}]}]}], "B")

    # ── 1047 工藤新一&服部平次: 카드명 지정 → 상대 FILE 위 1장 리무브 (파트너 에리어에서도 선언 가능)
    reg('id_1047', 'カード名を1つ指定し、相手のFILEエリアにあるカードを上から1枚リムーブし', [declare({}, [], [
        *NAME_FILE, done({"op": "draw", "n": 2}, {"op": "discard", "n": 2})], lim=1, pa=True)], "A")

    # ── 1050 外交官殺人事件
    reg('id_1050', '【解決編】【宣言】【ターン1】裏向きの証拠を2つ表向きにする', [declare(SOLVE, [FLIP2], [
        *NAME_FILE, done(selkw({"lvEq": 6, "type": "char"}, "assault-char"))], lim=1)], "A")

    # ── 1051 キッドVS安室 王妃の...: 지정한 카드명의 내 캐릭터 수만큼 덱 위를 보고 그 카드명 캐릭터 1장을 공개해 손패로
    reg('id_1051', '【解決編】【宣言】【ターン1】裏向きの証拠を2つ表向きにする', [declare(SOLVE, [FLIP2], [
        {"op": "nameDesig", "pool": "field", "kind": "char"},
        *PEEK_BOTTOM({"src": "field", "f": {"own": "self", "nameCtx": True}}),
        {"op": "pick", "from": "seen", "filter": {"type": "char", "nameCtx": True}, "n": 1, "min": 0, "as": "chosen", "reveal": True, "msg": "공개해서 손패에 넣을 캐릭터"},
        *TAKE1], lim=1)], "A")

    # ── 1139 帰らざる刑事: 松田陣平을 표향 증거로
    reg('id_1139', '【解決編】【FILE5】【宣言】【ターン1】裏向きの証拠を3つ表向きにする', [declare({**SOLVE, "fileMin": 5}, [{"c": "flipEvid", "n": 3}], [
        sel({"own": "self", "name": "松田陣平"}, "mark"), {"op": "charToEvid", "ref": "sel", "up": True}], lim=1)], "B")

    # ── 1092 箕輪奨兵: 내 턴 종료 시 컨택트로 상대 캐릭터를 리무브했다면 표향 증거로
    reg('id_1092', '自分のターン終了時、このターン中に相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされていて', [
        {"ic": "onend", "cond": {"turn": "self", "killed": True}, "ops": [{"op": "charToEvid", "ref": "self", "up": True}]}], "B")

    # ── 1149 犯人: 표향 증거/FILE/현장에서 리무브 에리어로 → 상대 파트너 에리어의 캐릭터/이벤트 1장 리무브
    reg('id_1149', 'リムーブエリアに移す：相手のパートナーエリアにあるキャラかイベントを1枚まで選び', [declare({}, [{"c": "selfRemAny", "n": 1}], [{"op": "paRemove"}], fromUp=True)], "B")

    # ── 1150 ベルモット: 解決編 선언 — 슬립 + 이 카드를 리무브 에리어로 → 리무브 에리어의 工藤新一/毛利蘭 등장 + AP+1000
    reg('id_1150', '【パートナー【青】】【解決編】【FILE5】【宣言】【スリープ】リムーブエリアに移す', [declare({"pcolor": "blue", **SOLVE, "fileMin": 5}, [SLEEP, {"c": "selfRem", "n": 1}], [
        {"op": "play", "from": "rem", "n": 1, "filter": {"lvMax": 5, "names": ["工藤新一", "毛利蘭"]}},
        {"op": "played", "do": "ap", "v": "1000", "until": "turn"}])], "B")

    # ── 1153 服部平次&怪盗キッド: 슬립 + 파트너 에리어로 → 리무브 에리어의 突撃 Lv8↓ 服部平次/怪盗キッド 등장 + 액티브 지정 액션 부여
    reg('id_1153', '【宣言】【スリープ】パートナーエリアに移す', [declare({}, [SLEEP, {"c": "selfPa", "n": 1}], [
        {"op": "play", "from": "rem", "n": 1, "filter": {"lvMax": 8, "hasKw": "assault", "names": ["服部平次", "怪盗キッド"]}},
        {"op": "played", "do": "kw", "v": "actactive", "until": "turn"}])], "B")

    # ── 1154 赤井秀一＆安室透: 내 턴 중(2회), 元の能力がない캐릭터가 등장했을 때 슬립 → 그 레벨 이하 캐릭터 리무브 (파트너 에리어에서도)
    reg('id_1154', '自分の現場に【カットイン】と【ヒラメキ】以外の元の能力を持たないキャラが登場したとき', [{"ic": "ontrig", "evs": ["enter"], "who": "self", "pa": True, "lim": 2, "cond": {"turn": "self"},
        "sf": {"own": "self", "type": "char", "plain": True}, "ops": [
            {"op": "entDo", "do": "sleep", "opt": True}, done(sel({"lvMax": "reg:ent:first"}))]}], "A")

    # ── 1157 緋色の真相: 元の能力がない캐릭터 수만큼 덱 위를 보고 1장 손패 + 나머지는 덱 아래
    reg('id_1157', '【解決編】【宣言】【ターン1】裏向きの証拠を2つ表向きにする', [declare(SOLVE, [FLIP2], [
        *PEEK_BOTTOM({"src": "field", "f": {"own": "self", "plain": True}}),
        {"op": "pick", "from": "seen", "filter": {}, "n": 1, "min": 0, "as": "chosen", "msg": "손패에 넣을 카드"},
        *TAKE1], lim=1)], "B")

    # ── 1158 萩原研二: 【絆】松田陣平 — 덱 위 3장 리무브 코스트로 松田陣平의 【ヒラメキ】 발동
    reg('id_1158', '【絆】松田陣平【宣言】【ターン1】デッキのカードを上から3枚リムーブする', [declare({"bond": "松田陣平"}, [{"c": "deckrem", "n": 3}], [
        {"op": "triggerFlash", "filter": {"own": "self", "name": "松田陣平"}}], lim=1)], "B")

    # ── 1068 毛利蘭: 내 턴 중(2회), 효과/선언 코스트로 손패의 工藤新一/毛利蘭을 공개했을 때 액티브 + AP+1000
    reg('id_1068', '自分の能力や効果、【宣言】能力のコストによって手札からカード名', [{"ic": "ontrig", "evs": ["hrev"], "who": "self", "lim": 2,
        "cond": {"turn": "self", "ccolor": "blue&black", "fileMin": 5}, "sf": {"own": "self", "names": ["工藤新一", "毛利蘭"]}, "ops": [
            {"op": "self", "do": "active"}, {"op": "self", "do": "ap", "v": "1000", "until": "turn"}]}], "A")

    # ── 1066 江戸川コナン: 파트너(青) FILE5 — 이 캐릭터에 뒷면으로 세트된 카드 1장 리무브 → AP8000↓ 리무브 (3회째면 증거 1개)
    reg('id_1066', '【パートナー(青)】【FILE5】【宣言】【ターン3】', [declare({"pcolor": "blue", "fileMin": 5, "fh": {"own": "self", "type": "char", "trait": "サッカー選手", "notSelf": True}, "fhN": 1},
        [{"c": "unset", "n": 1, "fd": True}], [sel({"apMax": 8000}), {"op": "ifUse", "n": 3, "ops": [{"op": "gain", "n": 1}]}], lim=3)], "B")

    # ── 1060 円谷光彦: 액션 종료 시 / 소년탐정단을 아래에 겹치고 드로
    reg('id_1060', '【FILE7】【ターン1】このキャラのアクション終了時', [{"ic": "ontrig", "evs": ["actend"], "who": "self", "sub": "self", "lim": 1,
        "cond": {"fileMin": 7, **cnt("under", 1)}, "ops": [{"op": "discard", "n": 1, "opt": True}, done({"op": "self", "do": "active"})]}], "B")
    reg('id_1060', '現場にいるこのキャラ以外の特徴[少年探偵団]のキャラを1枚このキャラの下に重ねる', [declare({}, [{"c": "stackFld", "n": 1, "filter": {"trait": "少年探偵団"}}], [{"op": "draw", "n": 1}], lim=1)], "B")

    # ── 1109 ジョディ・スタリングス: 슬립 + 이 캐릭터를 리무브 에리어로 + 손패 1장 리무브 → 캐릭터 1장 리무브
    reg('id_1109', '【宣言】【スリープ】このキャラをリムーブエリアに移し、手札を1枚リムーブする', [declare({"fh": {"own": "self", "plain": True, "lvMin": 5}, "fhN": 1},
        [SLEEP, {"c": "selfRem", "n": 1}, {"c": "discard", "n": 1}], [sel({})])], "B")

    # ── 1080 どこでもボール: 青のキャラにセット / サッカー選手(뒷면 세트 없음)에 세트되면 덱 위를 뒷면 세트 + 1장 드로 / FILE8 손패에서 선언
    reg('id_1080', 'このイベントを自分の現場にいる青のキャラ1枚にセットする', [{"ic": "event", "ops": [{"op": "set", "filter": {"color": "blue"}}]}], "B")
    reg('id_1080', 'このイベントが、裏向きのカードがセットされていない特徴［サッカー選手］のキャラにセットされたとき', [{"ic": "grant", "g": {"ic": "ontrig", "evs": ["setOn"], "es": True, "hself": True,
        "cond": {"fh": {"self": True, "trait": "サッカー選手"}, "fhN": 1, **cnt("fdSets", 0, "eq")}, "ops": [
            {"op": "setDeck", "n": 1, "deck": "self", "to": "self"}, {"op": "draw", "n": 1}], "txt": "セットされたとき"}}], "B")
    reg('id_1080', '手札からこのイベントを自分の現場にいるカード名［江戸川コナン］1枚にセットする', [declare({"fileMin": 8, "fh": {"own": "self", "name": "江戸川コナン"}, "fhN": 1, "fnone": {"trait": "ガジェット"}}, [], [
        {"op": "setFromHand", "filter": {"own": "self", "name": "江戸川コナン"}}], fromHand=True)], "B")
