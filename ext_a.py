"""묶음 A (Turn 26): 증거/FILE/세트/수사 계열 카드 28장. fx_ext_a.js 의 op 를 사용한다."""
SLEEP = {"c": "sleepSelf", "n": 1}
FLIP3 = {"c": "flipEvid", "n": 3}
def sel(f=None, do="remove", **k): return {"op": "select", "n": 1, "filter": f or {}, "do": do, **k}
def kw(v): return {"op": "self", "do": "kw", "v": v}
def done(*ops): return {"op": "if", "c": "done", "ops": list(ops)}
def hits(n, *ops): return {"op": "if", "c": "reg", "ref": "hit", "n": n, "cmp": "ge", "ops": list(ops)}
def under(n): return {"cnt": [{"src": "under", "op": "ge", "n": n}]}


def load(reg):
    # 0206: 絆黒羽盗一 — 세트된 카드 1장을 소유자가 표향 증거로 → 캐릭터 1장 리무브
    reg('id_0206', '【絆】黒羽盗一【宣言】', [{"ic": "declare", "cond": {"bond": "黒羽盗一"}, "lim": 1, "cost": [SLEEP],
        "ops": [{"op": "setToEvid"}, done(sel({}))]}], "A")
    # 0233: 捜査X(X = 내 현장의 [警察] 수) → 발견된 카드 레벨 합계 이하 캐릭터 리무브
    reg('id_0233', '捜査X(', [{"ic": "declare", "lim": 1, "cost": [SLEEP], "ops": [
        {"op": "invest2", "ncnt": {"src": "field", "f": {"own": "self", "trait": "警察"}}},
        sel({"lvMax": "reg:seen:sum"})]}], "A")
    # 0249: 犯人 — 상대 턴 종료 시 / 컷인 / 히라메키
    reg('id_0249', '自分が相手のターン終了時、自分の証拠を上から1つリムーブする', [{"ic": "onend", "cond": {"turn": "opp"}, "ops": [
        {"op": "loseEvid", "n": 1}, {"op": "charToEvid", "ref": "self", "up": True}]}], "A")
    reg('id_0249', '【カットイン】自分の現場に空きがある場合', [{"ic": "cutin", "v": 0, "ops": [{"op": "playSelf", "asleep": True, "from": "rem"}]}], "B")
    reg('id_0249', '相手はこのアクションによって証拠を得られない', [{"ic": "flash", "ops": [{"op": "blockActGain"}]}], "A")
    reg('id_0375', '相手はこのアクションによって証拠を得られない', [{"ic": "flash", "ops": [{"op": "blockActGain"}]}], "A")
    # 0264: 겹친 카드 수에 따른 능력
    reg('id_0264', 'このキャラの下に重なっているカードの数につき', [], "B")
    reg('id_0264', '【1枚以上】突撃', [{"ic": "static", "cond": under(1), "tgt": {"sel": "self"}, "kw": "assault"}], "B")
    reg('id_0264', '【3枚以上】このキャラがアクションしたとき', [{"ic": "onact", "cond": under(3), "ops": [{"op": "draw", "n": 1}]}], "B")
    reg('id_0264', '【5枚以上】このキャラがアクションしたとき', [{"ic": "onact", "cond": under(5), "ops": [{"op": "gain", "n": 1}]}], "B")
    # 0295: 추리 시 드로우로 대체
    reg('id_0295', '推理したとき、カードを1枚引いてもよい', [{"ic": "ontrig", "evs": ["reason"], "who": "self", "cond": {"turn": "self"}, "ops": [{"op": "reasonDraw"}]}], "A")
    # 0297: 증거를 얻었을 때 자신의 증거를 위에서 1개 본다
    reg('id_0297', '自分が証拠を得たとき、自分の証拠を上から1つ見る', [{"ic": "ontrig", "evs": ["evgain"], "who": "self", "cond": {"turn": "self"}, "lim": 1, "ops": [{"op": "peekEvid", "who": "self", "n": 1}]}], "A")
    # 0330: 등장 시 상대 증거 위에서 1장 표향
    reg('id_0330', '相手の証拠を上から1つ表向きにする', [{"ic": "onplay", "ops": [{"op": "flipTopEvid", "who": "opp", "n": 1}]}], "A")
    # 0337: 파트너(黄) 등장 시
    reg('id_0337', '相手の証拠を1つまで選び、デッキの下に移す', [{"ic": "onplay", "cond": {"pcolor": "yellow"}, "ops": [
        {"op": "evidToDeck", "who": "opp", "opt": True}, sel({"own": "opp", "lvMax": 7}, "mark"), {"op": "charToEvid", "ref": "sel", "up": True}]}], "A")
    # 0427: FILE 5장 이하일 때만 사용 가능
    reg('id_0427', 'このイベントは自分のFILEエリアにあるカードが5枚以下の場合に使用できる', [{"ic": "usecond", "cond": {"cnt": [{"src": "file", "op": "le", "n": 5}]}}], "B")
    # 0530: 해결편 선언 — 毛利小五郎 에게 突撃[キャラ]+バレット
    reg('id_0530', '【解決編】【宣言】【ターン1】裏向きの証拠を3つ表向きにする', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [FLIP3], "ops": [
        sel({"own": "self", "lvMin": 5, "name": "毛利小五郎"}, "kw", acts=[{"do": "kw", "v": "assault-char"}, {"do": "kw", "v": "bullet"}])]}], "B")
    # 0547: FILE 맨 위 1장을 손패로 → 손패 1장을 FILE 맨 아래에 표향으로 (파트너 에리어에서도)
    reg('id_0547', '自分のFILEエリアにあるカードを上から1枚手札に加え', [{"ic": "declare", "pa": True, "lim": 1, "ops": [
        {"op": "fileToHand", "n": 1}, {"op": "pick", "from": "hand", "n": 1, "min": 1, "as": "chosen", "msg": "FILE 아래로 보낼 손패"},
        {"op": "mv", "ref": "chosen", "to": "fileBottomUp"}]}], "B")
    # 0595: 상대는 리프레시로 증거를 얻을 수 없다 / 덱 위 5장까지 리무브
    reg('id_0595', '相手はリフレッシュによって証拠を得られない', [{"ic": "static", "tgt": {"sel": "self"}, "pk": "norefresh"}], "A")
    reg('id_0595', '自分のデッキのカードを上から5枚までリムーブする', [{"ic": "declare", "lim": 1, "ops": [{"op": "deckrem", "n": 5, "upto": True}]}], "B")
    # 0601: 이벤트
    reg('id_0601', 'キャラを1枚まで選び、リムーブする。相手の証拠が自分の証拠より2つ以上多い場合', [{"ic": "event", "cond": {"pcolor": "yellow"}, "ops": [
        sel({}), {"op": "ifc", "cond": {"cnt": [{"src": "oppEvid", "op": "ge", "ref": "evid", "plus": -2}]}, "ops": [
            {"op": "discard", "n": 1, "opt": True}, done({"op": "evidToDeck", "who": "opp", "opt": True}, {"op": "gain", "n": 1})]}]}], "A")
    # 0641: 事件YAIBA 등장 시
    reg('id_0641', '【事件YAIBA】【登場時】手札を1枚リムーブしてもよい', [{"ic": "onplay", "cond": {"ctrait": "YAIBA"}, "ops": [
        {"op": "discard", "n": 1, "opt": True}, done(
            {"op": "play", "from": "rem", "n": 1, "filter": {"trait": "YAIBA", "lvMax": 5}},
            done({"op": "ref", "ref": "played", "acts": [{"do": "kw", "v": "assault"}, {"do": "gab", "g": {"ic": "onend", "ops": [{"op": "charToEvid", "ref": "self", "up": True}]}}]}))]}], "A")
    # 0659: 코스트로 표향이 된 【!】히라메키 YAIBA 카드 효과 발동
    reg('id_0659', '【解決編】【宣言】【ターン1】裏向きの証拠を3つ表向きにする', [{"ic": "declare", "cond": {"cstate": "solve"}, "lim": 1, "cost": [FLIP3], "ops": [
        {"op": "flashPickOne", "bang": True, "filter": {"trait": "YAIBA"}}]}], "A")
    # 0693: かぐや 등장 시 (YAIBA 14장 이하 / 15장 이상)
    reg('id_0693', '【登場時】自分のリムーブエリアにある特徴[YAIBA]のカードが14枚以下の場合', [{"ic": "onplay", "ops": [
        {"op": "ifc", "cond": {"cnt": [{"src": "rem", "f": {"trait": "YAIBA"}, "op": "le", "n": 14}]},
         "ops": [sel({"lvMax": 7}, "deckBottom")],
         "else": [{"op": "pick", "from": "rem", "all": True, "as": "chosen"}, {"op": "mv", "ref": "chosen", "to": "deckBottom", "sd": True},
                  sel({}, "deckBottom"), {"op": "draw", "n": 1}, {"op": "discard", "n": 1, "who": "opp"}, {"op": "gain", "n": 1, "who": "opp"}]}]}], "B")
    # 0694: FILE 위 2장 리무브 → 턴 종료 시 FILE 5장 이하면 덱 위 2장을 FILE 위에
    reg('id_0694', '【宣言】【ターン1】FILEエリアにあるカードを上から2枚リムーブする', [{"ic": "declare", "pa": True, "lim": 1, "cost": [{"c": "fileRem", "n": 2}], "ops": [
        {"op": "delay", "evs": ["turnEnd"], "who": "self", "ops": [{"op": "ifc", "cond": {"cnt": [{"src": "file", "op": "le", "n": 5}]}, "ops": [{"op": "deckToFile", "n": 2}]}]}]}], "A")
    # 0704: 파트너(黄) 선언
    reg('id_0704', '【パートナー(黄)】【宣言】【ターン1】【スリープ】:相手の証拠を1つまで選び', [{"ic": "declare", "cond": {"pcolor": "yellow"}, "lim": 1, "cost": [SLEEP], "ops": [
        {"op": "evidToDeck", "who": "opp", "opt": True}, sel({"own": "opp", "apMax": 8000}, "mark"), {"op": "charToEvid", "ref": "sel", "up": True},
        {"op": "if", "c": "reg", "ref": "sel", "filters": [{"hasIc": "mr"}], "ops": [{"op": "deckToEvid", "who": "opp", "up": True}]}]}], "A")
    # 0705: 액션 시 서로의 뒷면 증거 1개씩 표향
    reg('id_0705', 'このキャラがアクションしたとき、自分の裏向きの証拠を1つ選び', [{"ic": "onact", "ops": [
        {"op": "flipEvid", "who": "self", "n": 1, "as": "chosen2"}, {"op": "flipEvid", "who": "opp", "n": 1, "as": "chosen2", "acc": True},
        {"op": "if", "c": "reg", "ref": "chosen2", "n": 2, "cmp": "ge", "ops": [{"op": "self", "do": "ap", "v": "1000"}]}]}], "A")
    # 0808: 風見裕也 — 파트너(黄) FILE5 선언
    reg('id_0808', '【パートナー(黄)】【FILE5】【宣言】【スリープ7】', [{"ic": "declare", "cond": {"pcolor": "yellow", "fileMin": 5}, "cost": [SLEEP,
        {"c": "fieldBottom", "n": 1, "filter": {"trait": "警視庁", "lvMax": 7}}], "ops": [sel({})]}], "B")
    # 0826: 자신의 효과로 이 캐릭터가 리무브되었을 때 표향 증거 1개를 뒷면으로
    reg('id_0826', '自分の現場にいるこのキャラが自分の能力や効果によってリムーブされたとき', [{"ic": "ontrig", "evs": ["removed"], "sub": "self", "by": "effect", "cz": "self", "who": "self",
        "cond": {"pcolor": "black", "turn": "self"}, "ops": [{"op": "flipDown", "n": 1, "who": "any"}]}], "B")
    # 0848: 겹친 카드 수에 따른 능력(내 턴 중)
    reg('id_0848', 'このキャラの下に重なっているカードの数につき', [], "B")
    reg('id_0848', '【1枚以上】AP+1000', [{"ic": "static", "cond": {"turn": "self", **under(1)}, "tgt": {"sel": "self"}, "ap": 1000, "kw": "assault-char"}], "B")
    reg('id_0848', '【3枚以上】【FILE5】【宣言】', [{"ic": "declare", "cond": {"turn": "self", "fileMin": 5, **under(3)}, "lim": 1, "cost": [{"c": "discard", "n": 1}], "ops": [{"op": "self", "do": "active"}]}], "B")
    # 0868: 日向幸
    reg('id_0868', '【宣言】【スリープ】このキャラ以外のキャラを1枚リムーブエリアに移す', [{"ic": "declare", "cost": [SLEEP, {"c": "fieldRem", "n": 1, "filter": {"notSelf": True}}], "ops": [
        {"op": "flipEvid", "who": "self", "n": 99, "any": True, "as": "chosen2"},
        {"op": "flipEvid", "who": "opp", "any": True, "nref": {"ref": "chosen2"}, "as": "moved"}]}], "A")
    # 0911: 특징 지정 수사3 → 발견 수에 따라 突撃[キャラ] / 突撃 / 迅速 (턴 종료까지)
    reg('id_0911', '特徴を1つ指定し、捜査3', [{"ic": "onplay", "ops": [{"op": "invest2", "n": 3, "trait": True},
        hits(1, kw("assault-char")), hits(2, kw("assault")), hits(3, kw("rapid"))]}], "A")
    for m in ('【1枚以上】突撃[キャラ]', '【2枚以上】突撃', '【3枚以上】迅速'): reg('id_0911', m, [], "A")
    # 0942: 등장 시 조건부 突撃
    reg('id_0942', '【登場時】相手の現場にキャラが3枚以上いる場合', [{"ic": "onplay", "ops": [
        {"op": "ifc", "cond": {"cnt": [{"src": "oppField", "op": "ge", "n": 3}]}, "ops": [kw("assault-char")]},
        {"op": "ifc", "cond": {"cnt": [{"src": "oppEvid", "op": "ge", "n": 3}]}, "ops": [kw("assault-case")]}]}], "B")
    # 0948: 絆服部平次 선언 — 카드명 지정, 상대 FILE 위 1장 리무브 + 상대 덱 위 1장을 FILE 위에
    reg('id_0948', '【絆】【服部平次】【宣言】【ターン1】', [{"ic": "declare", "cond": {"bond": "服部平次"}, "lim": 1, "cost": [{"c": "deckrem", "n": 1}], "ops": [
        {"op": "nameSel"}, {"op": "fileRemTop", "who": "opp", "n": 1}, {"op": "deckToFile", "who": "opp", "n": 1},
        {"op": "if", "c": "reg", "ref": "removed", "filters": [{"nameCtx": True}], "ops": [sel({}, "ap", v="2000")]}]}], "A")
    # 0955: 선언 끝에 자신의 FILE 위 1장 리무브 (앞 줄 능력에 이어 붙임)
    reg('id_0955', '自分のFILEエリアにあるカードを上から1枚リムーブする', [{"ic": "declare", "cond": {"fileMin": 6}, "cost": [SLEEP], "ops": [
        {"op": "play", "from": "rem", "n": 2, "filter": {"trait": "少年探偵団", "lvEq": 4}, "distinct": True}, {"op": "fileRemTop", "who": "self", "n": 1}]}], "A", merge=True)
