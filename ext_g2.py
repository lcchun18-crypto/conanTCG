"""묶음 g2: 다단계 이벤트/모달 선택/덱 공개·탐색·덱에서 등장/능력 부여(따옴표 본문) 카드.
 사용한 신규 공통 op: ifSelf(자기 자신 조건 분기, LKI 지원) · traitMod(특징 교체, 현장에 있는 동안 유지) · trigRem(리무브된 카드의 【現場リムーブ時】를 발동)
                    · handToLv(손패를 N장까지 리무브하고 레벨 합계 기록) · selLvSum(기록한 레벨 합계 이하가 되도록 캐릭터 선택)  → fx_ext_g2.js
 나머지는 기존 프리미티브(fetch/play/played/select/choose/ifc(cnt)/optcost/peek/pick/mv/playSeen/repeatCost/deckAll 코스트 등)의 조합."""
from ext_p1 import sel, selkw, done, notdone


def ev(cond, ops): return {"ic": "event", "cond": cond, "lim": 0, "ops": ops}
def ch(*opts): return {"op": "choose", "opts": [{"lab": l, "ops": o} for l, o in opts]}
def nm(n): return {"src": "field", "op": "ge", "n": 1, "f": {"own": "self", "name": n}}
CUTBLK = {"color": "black", "hasIc": "cutin"}
HAND_PLAY = lambda f: {"op": "play", "n": 1, "from": "hand", "filter": f}


def load(reg):
    # 0382: 리무브 에리어의 컷인 黒 Lv6↓ 캐릭터 2장 손패 → 손패의 컷인 黒 Lv6↓ 1장 등장 → 그 캐릭터에 突撃[キャラ]
    reg('id_0382', '自分のリムーブエリアにある', [ev({}, [
        {"op": "fetch", "n": 2, "from": "rem", "filter": {"type": "char", "lvMax": 6, **CUTBLK}},
        HAND_PLAY({"lvMax": 6, **CUTBLK}),
        {"op": "played", "do": "kw", "v": "assault-char"}])], "B")

    # 0783: 3택1 — 黒羽快斗와 中森青子가 현장에 있으면 3개 모두(위에서부터)
    A = {"op": "select", "n": 1, "filter": {"color": "white"}, "acts": [{"do": "ap", "v": "2000"}, {"do": "kw", "v": "assault"}]}
    B = sel({"lvMax": 7, "st": "s"}, 'stun')
    C = {"op": "select", "n": 1, "filter": {"color": "white"}, "acts": [{"do": "kw", "v": "actactive"}]}
    reg('id_0783', '以下から1つ選んで行う', [ev({"pcolor": "white"}, [
        {"op": "ifc", "cond": {"cnt": [nm("黒羽快斗"), nm("中森青子")]}, "ops": [A, B, C],
         "else": [ch(("【白】のキャラ: AP+2000と突撃", [A]), ("Lv7以下のスリープ状態のキャラをスタン", [B]), ("【白】のキャラ: 相手のアクティブ状態のキャラを指定してアクション可", [C]))]}])], "B")

    # 0805: 2택1 — (1) 손패 2장이 될 때까지 리무브 → 레벨 합계 이하가 되도록 캐릭터 2장까지 리무브 (2) 손패 전부 리무브·4장 드로우·상대 컷인/변장 불가
    reg('id_0805', '以下から1つ選んで行う', [ev({"pcolor": "red"}, [
        ch(("手札が2枚になるまでリムーブ → レベル合計以下のキャラ2枚までリムーブ", [{"op": "handToLv", "n": 2}, {"op": "selLvSum", "n": 2, "filter": {}}]),
           ("手札をすべてリムーブして4枚引く(相手はカットイン/変装不可)", [
               {"op": "discard", "n": 99, "opt": False}, {"op": "draw", "n": 4},
               {"op": "turnPk", "key": "nocutin", "who": "opp"}, {"op": "turnPk", "key": "nodisguise", "who": "opp"}]))])], "A")

    # 0829: 登場時 — 컷인 黒 카드를 손패에서 원하는 장수 리무브 → 같은 장수 드로우
    reg('id_0829', '手札から【カットイン】を持つ【黒】のカードを好きな枚数', [{"ic": "onplay", "ops": [
        {"op": "discard", "n": 1, "any": True, "filter": CUTBLK},
        {"op": "draw", "n": 1, "nref": {"ref": "removed", "by": "count"}}]}], "B")

    # 0831: 黒 캐릭터 1장 리무브 → 캐릭터 1장 突撃 → 양쪽 현장 캐릭터 1장당 내 덱 위 2장 리무브
    reg('id_0831', '【黒】キャラを1枚まで選び', [ev({"pcolor": "black"}, [
        sel({}, 'remove'), selkw({}, 'assault'),
        {"op": "deckrem", "n": 1, "ncnt": {"src": "fieldBoth"}, "nmul": 2}])], "B")

    # 0964: FILE 위 1장 + 현장의 [結成 少年探偵団] 1장 리무브(해도 된다) → 리무브 에리어의 이름이 다른 少年探偵団 Lv4↓ 5장까지 슬립 등장 → 5장이면 캐릭터 1장 리무브 / 이번 턴 넥스트 힌트 불가
    reg('id_0964', '自分のFILEエリアにあるカードを上から1枚リムーブし', [ev({}, [
        {"op": "optcost", "cost": [{"c": "fileRem", "n": 1}, {"c": "fieldRem", "n": 1, "filter": {"own": "self", "name": "結成 少年探偵団"}}]},
        done({"op": "play", "n": 5, "from": "rem", "distinct": True, "asleep": True, "filter": {"lvMax": 4, "trait": "少年探偵団"}},
             {"op": "if", "c": "reg", "ref": "played", "n": 5, "cmp": "ge", "ops": [sel({}, 'remove')]}),
        {"op": "nohint"}])], "B")

    # 0977: 해결편 — 덱 위 4장 공개 → 高校生 Lv6↓ 1장 등장, FILE 위 1장 리무브로 3회까지 반복 → 남은 공개 카드는 원하는 순서로 덱 아래
    SEEN_PLAY = {"op": "playSeen", "n": 1, "filter": {"lvMax": 6, "trait": "高校生"}}
    reg('id_0977', '自分のデッキのカードを上から4枚公開し', [ev({"cstate": "solve"}, [
        {"op": "peek", "n": 4, "reveal": True}, {"op": "showOpp"}, SEEN_PLAY,
        {"op": "repeatCost", "max": 3, "cost": [{"c": "fileRem", "n": 1}], "ops": [SEEN_PLAY]},
        {"op": "mv", "ref": "seen", "to": "deckBottom", "order": "any"}])], "B")

    # 0990: 추리/액션했을 때 2택1
    O990 = [ch(("リムーブエリアのLv4以下の【青】か【白】のキャラを登場", [{"op": "play", "n": 1, "from": "rem", "filter": {"lvMax": 4, "any": [{"color": "blue"}, {"color": "white"}]}}]),
               ("パートナーエリアに色2つ以上のMRがいれば: キャラをスタンさせ1枚引く", [
                   {"op": "ifc", "cond": {"paHas": {"type": "char", "colorsMin": 2, "hasIc": "mr"}}, "ops": [sel({}, 'stun'), {"op": "draw", "n": 1}]}]))]
    reg('id_0990', 'このキャラが推理かアクションしたとき', [{"ic": "onreason", "ops": O990}, {"ic": "onact", "ops": O990}], "B")

    # 1044: 사건(犯人) — 파트너 슬립 + 손패 1장 + FILE 위 2장 리무브(해도 된다) → 이름(레벨)이 모두 다른 犯人 Lv8↓ 5장까지 등장 / 이번 턴 넥스트 힌트 불가
    reg('id_1044', '自分のパートナーをスリープさせ', [ev({"ctrait": "犯人"}, [
        {"op": "optcost", "cost": [{"c": "sleepPartner"}, {"c": "discard", "n": 1}, {"c": "fileRem", "n": 2}]},
        done({"op": "play", "n": 5, "from": "rem", "dlv": True, "filter": {"lvMax": 8, "trait": "犯人"}}),
        {"op": "nohint"}])], "B")

    # 1046: 사건 해결 불가 + 해결편 선언: 덱을 전부 리무브(코스트) → 증거 전부 표향 → 犯人 증거 8장 이상이면 상대 패배
    reg('id_1046', '自分は【事件解決】できない', [{"ic": "static", "tgt": {"sel": "self"}, "pk": "nosolve"}], "A")
    reg('id_1046', 'デッキのカードをすべてリムーブする', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [{"c": "deckAll"}], "ops": [
        {"op": "flipAllEvid"},
        {"op": "ifc", "cond": {"cnt": [{"src": "evid", "op": "ge", "n": 8, "f": {"trait": "犯人"}}]}, "ops": [{"op": "loseGame", "who": "opp"}]}]}], "B")

    # 1086: 登場時 — !ヒラメキ Lv7 緑 이벤트가 나올 때까지 1장씩 공개 → 손패, 나머지 덱 아래 → 셔플
    reg('id_1086', '【!】ヒラメキを持つレベル7の【緑】のイベントが出るまで', [{"ic": "onplay", "ops": [
        {"op": "peek", "until": {"type": "event", "color": "green", "lvEq": 7, "bang": True}, "reveal": True, "n": 1}, {"op": "showOpp"},
        {"op": "mv", "ref": "hit", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "deckBottom", "order": "asis"}, {"op": "shuffle", "who": "self"}]}], "B")

    # 1108: 현장의 캐릭터를 원하는 수만큼 — 컨택트했을 때 1장 드로우 + 그 컨택트 중 AP+1000 (턴 종료까지 능력 부여)
    G1108 = {"ic": "oncontact", "ops": [{"op": "draw", "n": 1}, {"op": "self", "do": "ap", "v": "1000", "until": "contact"}],
             "txt": "このキャラがコンタクトしたとき、カードを1枚引き、そのコンタクト中、そのキャラをAP+1000する。"}
    reg('id_1108', '自分の現場にいるキャラを好きな数選び', [ev({}, [
        {"op": "select", "n": 99, "filter": {"own": "self"}, "acts": [{"do": "gab", "g": G1108}]}])], "B")

    # 1119: 사건(赤&黄) — 리무브 에리어의 (컷인/ヒラメキ 이외의 능력이 없는) 赤か黄 캐릭터 1장 등장 → 2택1
    reg('id_1119', '【ヒラメキ】以外の元の能力を持たない', [ev({"ccolor": "red&yellow"}, [
        {"op": "play", "n": 1, "from": "rem", "filter": {"plain": True, "any": [{"color": "red"}, {"color": "yellow"}]}},
        ch(("登場させたキャラをスリープ → そのキャラのレベル以下のキャラをリムーブ", [
                {"op": "ref", "ref": "played", "opt": True, "acts": [{"do": "sleep"}]}, done(sel({"lvMax": "reg:played:max"}, 'remove'))]),
            ("登場させたキャラに突撃[事件]", [{"op": "played", "do": "kw", "v": "assault-case"}]))])], "B")

    # 1151: 덱 위 3장 리무브(해도 된다) → 컷인 黒이 있으면 2택1(3장 이상이면 둘 다)
    PK = [{"op": "peek", "n": 4}, {"op": "pick", "from": "seen", "as": "chosen", "n": 1, "msg": "手札に加えるカード", "reveal": True, "filter": CUTBLK},
          {"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "deckBottom", "order": "any"}]
    PL = [HAND_PLAY({"type": "char", "lvMax": "file", **CUTBLK})]
    reg('id_1151', '自分のデッキのカードを上から3枚リムーブしてもよい', [ev({"pcolor": "black"}, [
        {"op": "deckRemSome", "n": 3, "opt": True},
        {"op": "if", "c": "remHas", "n": 1, "filter": CUTBLK, "ops": [
            {"op": "if", "c": "reg", "ref": "removed", "n": 3, "cmp": "ge", "ops": PK + PL,
             "else": [ch(("デッキの上4枚を見て【カットイン】【黒】を1枚手札に", PK), ("手札からFILE枚数以下の【カットイン】【黒】キャラを登場", PL))]}]}])], "A")

    # 1156: 해결편 선언 — 뒷면 증거 2개 표향 → 緑か白 캐릭터에 (이번 턴) 컨택트로 상대 캐릭터를 리무브했을 때 덱 위 4장 → 돌격 캐릭터 1장 공개해 손패
    G1156 = {"ic": "onkill", "lim": 1, "ops": [
        {"op": "peek", "n": 4}, {"op": "pick", "from": "seen", "as": "chosen", "n": 1, "msg": "手札に加えるカード", "reveal": True, "filter": {"type": "char", "hasKw": "assault"}},
        {"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "deckBottom", "order": "any"}],
        "txt": "【ターン①】相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、自分のデッキのカードを上から4枚見る。その中から突撃を持つキャラを1枚まで公開して手札に加え、残りを好きな順番でデッキの下に移す。"}
    reg('id_1156', '裏向きの証拠を2つ表向きにする', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [{"c": "flipEvid", "n": 2}], "ops": [
        {"op": "select", "n": 1, "filter": {"own": "self", "any": [{"color": "green"}, {"color": "white"}]}, "acts": [{"do": "gab", "g": G1156}]}]}], "B")

    # 1155: 해결편 선언 — 뒷면 증거 1개 표향 + 손패 1장 리무브(코스트) → 工藤新一/毛利蘭에 Lv6↑ 액티브 지정 액션 + 컨택트로 리무브 시 1장 드로우
    G1155 = {"ic": "onkill", "ops": [{"op": "draw", "n": 1}], "txt": "相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、カードを1枚引く。"}
    reg('id_1155', '裏向きの証拠を1つ表向きにし', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [{"c": "flipEvid", "n": 1}, {"c": "discard", "n": 1}], "ops": [
        {"op": "select", "n": 1, "filter": {"own": "self", "names": ["工藤新一", "毛利蘭"]}, "acts": [{"do": "kw", "v": "act6up"}, {"do": "gab", "g": G1155}]}]}], "B")

    # 0341: 선언 — 降谷零·諸伏景光·伊達航·萩原研二가 모두 현장에 있을 때
    reg('id_0341', '【宣言】【ターン①】レベル7以下のキャラを1枚まで選び', [{"ic": "declare", "lim": 1, "cond": {"cnt": [nm("降谷零"), nm("諸伏景光"), nm("伊達航"), nm("萩原研二")]}, "ops": [
        {"op": "select", "n": 1, "filter": {"lvMax": 7}, "acts": [{"do": "active"}, {"do": "ap", "v": "1000"}, {"do": "kw", "v": "assault"}]}, {"op": "draw", "n": 1}]}], "B")

    # 0599: 상대 턴 현장 리무브 시 — 特徴[警察]이면 슬립으로 재등장+1장 드로우(해도 된다) → 特徴을 警察/警視庁 → 探偵으로 (현장에 있는 동안 유지)
    reg('id_0599', 'このキャラが特徴[警察]の場合', [{"ic": "onremoved", "cond": {"turn": "opp"}, "ops": [
        {"op": "ifSelf", "filter": {"trait": "警察"}, "lki": True, "ops": [
            {"op": "playSelf", "asleep": True, "opt": True},
            done({"op": "draw", "n": 1}, {"op": "traitMod", "lose": ["警察", "警視庁"], "add": ["探偵"]})]}]}], "A")

    # 0914: 상대 턴 현장 리무브 시 — 손패의 【現場リムーブ時】 보유 Lv7↓ 青か黒 캐릭터 1장 리무브(해도 된다) → 1장 드로우, 그 카드의 【現場リムーブ時】 발동(해도 된다)
    reg('id_0914', '手札から【現場リムーブ時】を持つレベル7以下', [{"ic": "onremoved", "cond": {"turn": "opp"}, "ops": [
        {"op": "discard", "n": 1, "opt": True, "filter": {"type": "char", "lvMax": 7, "hasIc": "onremoved", "any": [{"color": "blue"}, {"color": "black"}]}},
        done({"op": "draw", "n": 1}, {"op": "trigRem", "ref": "removed"})]}], "A")

    # 0915: 선언(슬립) — 내 사건이 黒 이외의 색을 가진 경우 AP8000 이하 캐릭터 1장 리무브
    reg('id_0915', 'AP8000以下のキャラを1枚まで選び', [{"ic": "declare", "cond": {"cnot": "black"}, "cost": [{"c": "sleepSelf", "n": 1}], "ops": [sel({"apMax": 8000}, 'remove')]}], "B")
