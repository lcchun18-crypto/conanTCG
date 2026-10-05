"""CT-P11 (2026-10-06 공개분 90종 unique ID) 효과 데이터.  기존 프리미티브 조합 + 소수의 공통 확장(evTotMin/Max 조건, tApLow 트리거, az 이름 취급 확장, swapRem/ptnActive 등 fx_ext_ct11.js)
카드 ID 로 키잉하지만 카드별 하드코딩 핸들러가 아니라 공통 op 의 조합이다."""
from ext_p1 import sel, selkw, done, notdone

DISC1 = {"op": "discard", "n": 1, "opt": True}
DISC1F = {"op": "discard", "n": 1, "opt": False}
BW = [{"color": "blue"}, {"color": "white"}]          # 【青】か【白】
GR = [{"color": "green"}, {"color": "red"}]           # 【緑】か【赤】


def ifc(cond, *ops, els=None):
    d = {"op": "ifc", "cond": cond, "ops": list(ops)}
    if els: d["else"] = list(els)
    return d


def play_rem(f, asleep=True):
    return {"op": "play", "from": "rem", "n": 1, "filter": f, **({"asleep": True} if asleep else {})}


def declare(cond, cost, ops, lim=0, **k):
    a = {"ic": "declare", "cond": cond, "cost": cost, "ops": ops, **k}
    if lim: a["lim"] = lim
    return a


def trig(evs, ops, **k):
    return {"ic": "ontrig", "evs": evs, "ops": ops, **k}


SELF_REM = lambda cond, ops: {"ic": "ontrig", "evs": ["removed"], "sub": "self", "cz": "self", "by": "effect", "cond": cond, "ops": ops}   # 自分の現場にいるこのキャラが自分の能力や効果によってリムーブされたとき
ACT_LOW4 = {"evs": ["act"], "sub": "self", "tApLow": 4000}                                                                                       # このキャラが、このキャラよりAPが4000以上低いキャラを指定してアクションしたとき


def load(reg):
    # ── 1170 江戸川コナン: 自分ターン中 現場からの自効果リムーブ時 — 証拠5以上なら裏向き証拠1つを表向き → Lv2↓ 【青】か【白】をスリープで登場
    reg('id_1170', '自分の裏向きの証拠を1つ表向きにしてもよい', [SELF_REM({"turn": "self", "evTotMin": 5}, [
        {"op": "flip", "n": 1, "opt": True}, done(play_rem({"lvMax": 2, "type": "char", "any": BW}))])], "A")

    # ── 1171 灰原哀: パートナー(青)・自分ターン・ターン1 — Lv4 少年探偵団が登場 → AP8000↓ リムーブ / 宣言: デッキ3枚リムーブ → レベル-4
    reg('id_1171', 'レベル4の特徴[少年探偵団]のキャラが自分の現場に登場したとき', [
        {"ic": "onally", "cond": {"pcolor": "blue", "turn": "self"}, "lim": 1, "ef": {"trait": "少年探偵団", "lvEq": 4, "own": "self"},
         "ops": [sel({"apMax": 8000, "own": "any"})]}], "B")
    reg('id_1171', 'デッキのカードを上から3枚リムーブする', [declare({}, [{"c": "deckrem", "n": 3}], [
        {"op": "self", "do": "lv", "v": "-4", "until": "turn"}], lim=1)], "B")

    # ── 1172 工藤新一: 登場時 — 他の探偵がいれば 毛利蘭(Lv2↓)をリムーブから スリープ登場 → 登場させ 証拠合計4以下なら手札1枚リムーブ
    reg('id_1172', '自分の現場にこのキャラ以外の特徴[探偵]のキャラがいる場合', [{"ic": "onplay", "ops": [
        ifc({"fh": {"own": "self", "trait": "探偵", "notSelf": True}, "fhN": 1},
            play_rem({"name": "毛利蘭", "lvMax": 2}),
            {"op": "if", "c": "played", "ops": [ifc({"evTotMax": 4}, DISC1F)]})]}], "A")

    # ── 1173 毛利蘭: 事件(青&白)・自分ターン中 証拠合計5以上で AP+3000
    reg('id_1173', 'お互いの証拠が合わせて5つ以上ある場合、このキャラをAP+3000する', [
        {"ic": "static", "cond": {"ccolor": "blue&white", "turn": "self", "evTotMin": 5}, "tgt": {"sel": "self"}, "ap": 3000}], "A")

    # ── 1180 日原誠人: 現場以외의 에리어에서 카드명 [工藤新一] 으로도 취급 / 1193 和田進一: 모든 에리어에서 [伊織無我]
    reg('id_1180', '現場以外のエリアにあるこのキャラはカード名[工藤新一]としても扱う', [
        {"ic": "static", "tgt": {"sel": "self"}, "nm": "工藤新一", "az": True}], "A")
    reg('id_1193', 'このキャラはすべてのエリアでカード名[伊織無我]としても扱う', [
        {"ic": "static", "tgt": {"sel": "self"}, "nm": "伊織無我"},
        {"ic": "static", "tgt": {"sel": "self"}, "nm": "伊織無我", "az": True}], "A")

    # ── 1186 大岡紅葉: パートナー(緑) 宣言 ターン2 — 裏向きのカードがセットされた相手キャラをリムーブ → デッキ上から裏向きでこのキャラにセット
    reg('id_1186', '裏向きのカードがセットされているキャラを1枚まで選び、リムーブする', [declare({"pcolor": "green"}, [], [
        sel({"own": "opp", "sets": "fdAny"}), done({"op": "setDeck", "n": 1, "deck": "self", "to": "self"})], lim=2)], "B")

    # ── 1188 服部平次 / 1189 遠山和葉: 自分よりAPが4000以上低いキャラを指定してアクションしたとき
    reg('id_1188', 'このキャラよりAPが4000以上低いキャラを指定してアクションしたとき', [
        trig(ACT_LOW4["evs"], [sel({"lvMax": 7, "own": "any"})], sub="self", tApLow=4000, lim=1)], "A")
    reg('id_1189', 'このキャラよりAPが4000以上低いキャラを指定してアクションしたとき', [
        trig(ACT_LOW4["evs"], [play_rem({"lvEq": 2, "type": "char", "any": GR})], sub="self", tApLow=4000, lim=1, cond={"ccolor": "green&red"})], "A")

    # ── 1190 島袋君恵: 相手ターン中 現場リムーブ時 — 自身をリムーブ에리어에서 덱 아래로 → Lv3 캐릭터 1장 손패
    reg('id_1190', 'このキャラをリムーブエリアからデッキの下に移してもよい', [{"ic": "onremoved", "cond": {"turn": "opp"}, "ops": [
        {"op": "mv", "ref": "self", "to": "deckBottom", "opt": True},
        done({"op": "fetch", "n": 1, "from": "rem", "filter": {"lvEq": 3, "type": "char"}})]}], "B")

    # ── 1198 中森銀三: 手札から使用する場合 증거 합계 5 이상이면 손패의 이 캐릭터 레벨-1 (사건 青&白 / 파트너 白)
    reg('id_1198', '手札から使用する場合、手札にあるこのキャラはレベル-1される', [
        {"ic": "hand", "cond": {"ccolor": "blue&white", "pcolor": "white", "evTotMin": 5}, "lvd": -1}], "A")

    # ── 1200 中森青子: 登場時 증거 합계 5 이상이면 AP+1000
    reg('id_1200', 'お互いの証拠が合わせて5つ以上ある場合、ターン終了時までこのキャラをAP+1000する', [
        {"ic": "onplay", "cond": {"evTotMin": 5}, "ops": [{"op": "self", "do": "ap", "v": "1000", "until": "turn"}]}], "A")

    # ── 1201 白馬探: 事件(青&白)・自分ターン중 증거 합계 5 이상이면 LP+1
    reg('id_1201', 'お互いの証拠が合わせて5つ以上ある場合、このキャラをLP+1する', [
        {"ic": "static", "cond": {"ccolor": "blue&white", "turn": "self", "evTotMin": 5}, "tgt": {"sel": "self"}, "lp": 1}], "A")

    # ── 1202 怪盗キッド: 自分ターン中の【登場時】/【変装時】 — リムーブエリアの特徴[ビッグジュエル]のイベント1枚をパートナーエリアへ → 移したらカード1枚ドロー
    BJ = [{"op": "pick", "from": "rem", "own": "self", "filter": {"type": "event", "trait": "ビッグジュエル"}, "n": 1, "min": 0, "as": "chosen", "reveal": True, "msg": "パートナーエリアへ移すイベント"},
          {"op": "mv", "ref": "chosen", "to": "pa"}, done({"op": "draw", "n": 1})]
    reg('id_1202', 'パートナーエリアに移す', [{"ic": "onplay", "cond": {"turn": "self"}, "ops": BJ}, {"ic": "ondisguise", "cond": {"turn": "self"}, "ops": BJ}], "B")

    # ── 1203 工藤優作: 相手ターン中の【変装時】 デッキの下から1枚を手札に
    reg('id_1203', '自分のデッキのカードを下から1枚手札に加える', [{"ic": "ondisguise", "cond": {"turn": "opp"}, "ops": [
        {"op": "look", "n": 1, "from": "bottom", "max": 1, "then": "hand", "rest": "bottom"}]}], "B")

    # ── 1204 工藤有希子: 登場時 キャラのカード名を指定 → デッキ上4枚から指定名のキャラ1枚を公開して手札、残りは好きな順でデッキの下
    reg('id_1204', 'キャラのカード名を1つ指定し', [{"ic": "onplay", "ops": [
        {"op": "nameDesig", "pool": "text", "kind": "char"}, {"op": "peek", "n": 4, "reveal": False},
        {"op": "pick", "from": "seen", "as": "chosen", "filter": {"nameCtx": True, "type": "char"}, "n": 1, "reveal": True},
        {"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "deckBottom", "order": "any"}]}], "B")

    # ── 1205 真田一三: 相手ターン中の【変装時】[怪盗キッド]と入れ替わった場合 — このキャラをリムーブしてもよい → デッキ下1枚を手札、手札1枚リムーブ
    reg('id_1205', 'カード名[怪盗キッド]と入れ替わった場合', [{"ic": "ondisguise", "cond": {"turn": "opp", "swapName": "怪盗キッド"}, "ops": [
        {"op": "self", "do": "remove", "opt": True},
        done({"op": "look", "n": 1, "from": "bottom", "max": 1, "then": "hand", "rest": "bottom"}, DISC1F)]}], "B")

    # ── 1206 シャロン / 1212 土井塔克樹: 相手ターン中 [ベルモット]/[怪盗キッド]が【変装】で入れ替わるとき、デッキの下に移す代わりにリムーブしてもよい → 追加効果
    def sw_rep(nm, ops):
        return {"ic": "ontrig", "evs": ["disguise"], "who": "self", "sw": True, "sf": {"name": nm, "own": "self"}, "cond": {"turn": "opp"}, "ops": [{"op": "swapRem"}, done(*ops)]}
    reg('id_1206', 'デッキの下に移す代わりにリムーブしてもよい', [sw_rep("ベルモット", [sel({"acting": True, "own": "any"}, "stun")])], "A")
    reg('id_1212', 'デッキの下に移す代わりにリムーブしてもよい', [sw_rep("怪盗キッド", [{"op": "flipDown", "n": 2}])], "A")

    # ── 1208 鈴木次郎吉: 自分か相手の現場にカード名[怪盗キッド]がいる場合 AP+2000
    reg('id_1208', 'カード名[怪盗キッド]がいる場合、このキャラをAP+2000する', [
        {"ic": "static", "cond": {"fh": {"own": "any", "name": "怪盗キッド"}, "fhN": 1}, "tgt": {"sel": "self"}, "ap": 2000}], "B")

    # ── 1209 鈴木園子: 事件(青&白) 登場時 — 上3枚公開 → 1枚手札・1枚リムーブエリア・残りデッキ下 → 高校生/怪盗のキャラが公開されなかった場合 手札1枚リムーブ
    reg('id_1209', 'デッキのカードを上から3枚公開する', [{"ic": "onplay", "cond": {"ccolor": "blue&white"}, "ops": [
        {"op": "peek", "n": 3, "reveal": True},
        {"op": "pick", "from": "seen", "as": "chosen", "n": 1, "min": 1, "msg": "手札に加えるカード"}, {"op": "mv", "ref": "chosen", "to": "hand"},
        {"op": "pick", "from": "rest", "as": "chosen2", "n": 1, "min": 1, "msg": "リムーブエリアに移すカード"}, {"op": "mv", "ref": "chosen2", "to": "rem"},
        {"op": "mv", "ref": "rest", "to": "deckBottom"},
        {"op": "if", "c": "reg", "ref": "revealed", "cmp": "eq", "n": 0, "filters": [{"type": "char", "any": [{"trait": "高校生"}, {"trait": "怪盗"}]}], "ops": [DISC1F]}]}], "B")

    # ── 1210 鈴木朋子: カードがセットされている場合 突撃 / 登場時 リムーブエリアの[漆黒の星]をこのキャラにセット
    reg('id_1210', 'このキャラにカードがセットされている場合', [
        {"ic": "static", "cond": {"cnt": [{"src": "sets", "op": "ge", "n": 1}]}, "tgt": {"sel": "self"}, "kw": "assault"}], "B")
    reg('id_1210', 'カード名[漆黒の星]を1枚まで選び、このキャラにセットする', [{"ic": "onplay", "ops": [
        {"op": "setFrom", "from": "rem", "filter": {"name": "漆黒の星"}, "hf": {"self": True, "own": "self"}}]}], "B")

    # ── 1211 茶木神太郎: 【ターン1】相手が【変装】を使用したとき このキャラをアクティブに
    reg('id_1211', '相手が【変装】を使用したとき', [trig(["disguise"], [{"op": "self", "do": "active"}], who="opp", lim=1)], "B")

    # ── 1214 ルパン: 相手のターン終了時 このキャラを現場からリムーブしてもよい
    reg('id_1214', '相手のターン終了時、このキャラを現場からリムーブしてもよい', [{"ic": "onend", "cond": {"turn": "opp"}, "ops": [
        {"op": "self", "do": "remove", "opt": True}]}], "B")

    # ── 1216 漆黒の星(イベント): 表向きの証拠1つ→裏向き、特徴[鈴木財閥]か[怪盗]のキャラにセット+AP+2000 / セット中: 相手ターン中 コンタクトしたとき パートナーエリアへ移して そのキャラはこのコンタクトでリムーブされない
    reg('id_1216', '自分の表向きの証拠を1つまで選び、裏向きにする', [{"ic": "event", "ops": [
        {"op": "flipDown", "n": 1},
        {"op": "set", "filter": {"own": "self", "any": [{"trait": "鈴木財閥"}, {"trait": "怪盗"}]}},
        done({"op": "ref", "ref": "sel", "acts": [{"do": "ap", "v": "2000", "until": "turn"}]})]}], "B")
    reg('id_1216', 'このイベントがセットされているキャラがコンタクトしたとき', [{"ic": "grant", "g": {"ic": "ontrig", "evs": ["contact"], "sub": "self", "cond": {"turn": "opp"}, "ops": [
        {"op": "setEvToPa", "opt": True}, done({"op": "protect", "who": "self"})]}}], "A")

    # ── 1217 宮野志保&宮野明美: パートナー(赤) 宣言 ターン1 — Lv7のアクティブ/スリープのキャラ1枚をスタンさせる: Lv9以下のキャラ1枚をリムーブ
    reg('id_1217', 'レベル7のアクティブ状態かスリープ状態のキャラを1枚スタンさせる', [declare({"pcolor": "red"}, [
        {"c": "stunAny", "n": 1, "sc": "any", "filter": {"lvEq": 7, "own": "any"}}], [sel({"lvMax": 9, "own": "any"})], lim=1)], "A")

    # ── 1219 ジョディ: 事件(緑&赤) 宣言 スリープ — 相手のAP8000以下を1枚リムーブ / このキャラよりAPが4000以上低いキャラをリムーブした場合 リムーブエリアのLv2の【緑】か【赤】をスリープで登場
    reg('id_1219', '相手の現場にいるAP8000以下のキャラを1枚まで選び、リムーブする', [declare({"ccolor": "green&red"}, [{"c": "sleepSelf", "n": 1}], [
        {"op": "select", "n": 1, "filter": {"apMax": 8000, "own": "opp"}, "do": "mark"},
        {"op": "if", "c": "reg", "ref": "sel", "filters": [{"apLowSelf": 4000}], "ops": [
            {"op": "ref", "ref": "sel", "acts": [{"do": "remove"}]}, done(play_rem({"lvEq": 2, "type": "char", "any": GR}))],
         "else": [{"op": "ref", "ref": "sel", "acts": [{"do": "remove"}]}]}])], "A")

    # ── 1220 世良真純: 登場時 【赤】以外の色を持つキャラがいる場合 — 突撃[事件] か (解決編: スリープ → Lv6以下を手札に戻し相手は手札1枚リムーブ)
    reg('id_1220', '【赤】以外の色を持つキャラがいる場合', [{"ic": "onplay", "cond": {"fh": {"own": "self", "colorNot": "red"}, "fhN": 1}, "ops": [{"op": "choose", "opts": [
        {"lab": "ターン終了時までこのキャラは突撃[事件]を持つ", "ops": [{"op": "self", "do": "kw", "v": "assault-case", "until": "turn"}]},
        {"lab": "自分の事件が解決編の場合: スリープ → Lv6以下を手札に移し、相手は手札を1枚リムーブ", "ops": [ifc({"cstate": "solve"},
            {"op": "self", "do": "sleep", "opt": True},
            done(sel({"lvMax": 6, "own": "opp"}, "hand"), {"op": "discard", "n": 1, "who": "opp"}))]}]}]}], "B")

    # ── 1221 羽田秀吉: パートナー(赤) 宣言(このキャラがスリープ状態の場合のみ) — このキャラをスタン: キャラ1枚 AP-2000
    reg('id_1221', 'スタンさせる:キャラを1枚まで選び', [declare({"pcolor": "red", "selfSt": "s"}, [
        {"c": "stunAny", "n": 1, "sc": "self", "filter": {"self": True, "own": "self"}}], [{"op": "select", "n": 1, "filter": {"own": "any"}, "do": "ap", "v": "-2000", "until": "turn"}])], "A")

    # ── 1224 キャメル / 1229 レイチェル: このキャラよりAPが4000以上低いキャラを指定してアクションしたとき
    reg('id_1224', 'そのキャラをデッキの下に移してもよい', [trig(["act"], [{"op": "trigTgt", "do": "deckBottom", "opt": True}], sub="self", tApLow=4000)], "A")
    reg('id_1229', 'このキャラよりAPが4000以上低いキャラを指定してアクションしたとき', [trig(["act"], [{"op": "draw", "n": 1}], sub="self", tApLow=4000)], "A")

    # ── 1225 瓜生祥子: カットイン AP+1000 / 特徴[女流棋士]か[棋士]のキャラにカットインした場合 1枚ドロー
    reg('id_1225', '特徴[女流棋士]か[棋士]のキャラにカットインした場合', [
        {"ic": "cutin", "v": 1000, "ops": []},
        {"ic": "cutin", "v": 0, "cond": {"cin": {"any": [{"trait": "女流棋士"}, {"trait": "棋士"}]}}, "ops": [{"op": "draw", "n": 1}]}], "B")

    # ── 1227 宮野エレーナ: パートナー(赤)・解決編 宣言 — Lv7のアクティブのキャラ1枚をスタン: そのキャラのAP以下のキャラ1枚リムーブ
    reg('id_1227', 'この【宣言】能力のコストによってスタンさせたキャラのAP以下', [declare({"pcolor": "red", "cstate": "solve"}, [
        {"c": "stunAny", "n": 1, "sc": "any", "st": "a", "filter": {"lvEq": 7, "own": "any"}}], [sel({"apMax": "costAp", "own": "any"})], lim=1)], "A")

    # ── 1235 千葉和伸: パートナー(黄) 宣言 — 他のLv7以下[警視庁]のアクティブをスタン: そのキャラのレベル以下のキャラ1枚リムーブ
    reg('id_1235', 'この【宣言】能力のコストによってスタンさせたキャラのレベル以下', [declare({"pcolor": "yellow"}, [
        {"c": "stunAny", "n": 1, "sc": "any", "st": "a", "filter": {"notSelf": True, "lvMax": 7, "trait": "警視庁", "own": "any"}}], [sel({"lvMax": "costLv", "own": "any"})], lim=1)], "A")

    # ── 1237 榎本梓: 登場時 上2枚公開 → 相手がキャラ1枚を選び手札に、残りリムーブ → [喫茶ポアロ]を加えた場合 そのレベル以下をリムーブ
    reg('id_1237', '相手はその中からキャラを1枚選び', [{"ic": "onplay", "ops": [
        {"op": "peek", "n": 2, "reveal": True},
        {"op": "pick", "from": "seen", "chooser": "opp", "as": "chosen", "filter": {"type": "char"}, "n": 1, "min": 1, "msg": "手札に加えるキャラ"},
        {"op": "mv", "ref": "chosen", "to": "hand"}, {"op": "mv", "ref": "rest", "to": "rem"},
        {"op": "if", "c": "reg", "ref": "chosen", "filters": [{"trait": "喫茶ポアロ"}], "ops": [sel({"lvMax": "reg:chosen:first", "own": "any"})]}]}], "B")

    # ── 1240 目暮十三: 登場時 リムーブエリアの特徴[警察]のキャラ3枚までをデッキの下へ → 1枚以上移したらシャッフル
    reg('id_1240', '特徴[警察]のキャラを3枚まで選び、デッキの下に移す', [{"ic": "onplay", "ops": [
        {"op": "pick", "from": "rem", "own": "self", "filter": {"type": "char", "trait": "警察"}, "n": 3, "min": 0, "as": "chosen", "reveal": True, "msg": "デッキの下に移すキャラ"},
        {"op": "mv", "ref": "chosen", "to": "deckBottom"}, done({"op": "shuffle", "who": "self"})]}], "B")

    # ── 1245 ジン&ベルモット: 宣言 — Lv7以下の【黒】のアクティブ/スリープのキャラ1枚をスタン: そのキャラに相手のターン終了時まで「【現場リムーブ時】カードを1枚引く」/ パートナーエリアでも宣言可
    reg('id_1245', 'この【宣言】能力のコストによってスタンさせたキャラに', [declare({}, [
        {"c": "stunAny", "n": 1, "sc": "any", "filter": {"lvMax": 7, "color": "black", "own": "any"}}], [
        {"op": "ref", "ref": "costSlept", "acts": [{"do": "gab", "until": "oppEnd", "g": {"ic": "onremoved", "ops": [{"op": "draw", "n": 1}], "txt": "【現場リムーブ時】カードを1枚引く。"}}]}], lim=1, pa=True)], "A")

    # ── 1248 ウォッカ: パートナー(黒)・自分ターン中 自分の能力や効果でリムーブされたとき このターン中アクションしていた場合 スリープで登場してもよい
    reg('id_1248', 'このターン中にこのキャラがアクションしていた場合', [
        {"ic": "ontrig", "evs": ["removed"], "sub": "self", "cz": "self", "by": "effect", "cond": {"turn": "self", "pcolor": "black"}, "sf": {"acted": "any"},
         "ops": [{"op": "playSelf", "asleep": True, "opt": True}]}], "A")

    # ── 1249 ベルモット: 宣言(スリープ) — 他の【黒】キャラ1枚をリムーブしてもよい: そのレベル以下のスリープ状態のキャラ1枚をリムーブ
    reg('id_1249', 'リムーブしたキャラのレベル以下のレベルのスリープ状態', [declare({}, [{"c": "sleepSelf", "n": 1}], [
        sel({"own": "self", "notSelf": True, "color": "black"}), done(sel({"own": "any", "st": "s", "lvMax": "reg:sel:first"}))])], "B")

    # ── 1250 狼男: 解決編 宣言(スリープ) — Lv4以下の【黒】の自キャラ1枚をリムーブしてもよい: そのレベル以下のキャラ1枚をスタンさせる
    reg('id_1250', 'リムーブしたキャラのレベル以下のレベルのキャラを1枚まで選び、スタンさせる', [declare({"cstate": "solve"}, [{"c": "sleepSelf", "n": 1}], [
        sel({"own": "self", "lvMax": 4, "color": "black"}), done(sel({"own": "any", "lvMax": "reg:sel:first"}, "stun"))])], "B")

    # ── 1251 キール: 登場時 上3枚を見て[黒ずくめの組織]のキャラ1枚を公開して手札、残りリムーブエリア → 手札に加え 解決編なら手札1枚リムーブ
    reg('id_1251', '自分のデッキのカードを上から3枚見る', [{"ic": "onplay", "ops": [
        {"op": "look", "n": 3, "filter": {"type": "char", "trait": "黒ずくめの組織"}, "max": 1, "then": "hand", "rest": "rem"},
        done(ifc({"cstate": "solve"}, DISC1F))]}], "B")

    # ── 1252 犯人: 自分ターン中の登場時 相手のパートナーをアクティブにする(アシスト中ならパートナーエリアに戻してアクティブ)
    reg('id_1252', '相手のパートナーをアクティブにする', [{"ic": "onplay", "cond": {"turn": "self"}, "ops": [{"op": "ptnActive", "who": "opp"}]}], "A")

    # ── 1254 火傷の男: 自分ターン中 自分の能力や効果でリムーブされたとき 1枚ドロー
    reg('id_1254', '自分の能力や効果によってリムーブされたとき、カードを1枚引く', [SELF_REM({"turn": "self"}, [{"op": "draw", "n": 1}])], "B")

    # ── 1185 五人囃子(イベント): リムーブエリアのLv4・名前の異なる[少年探偵団]3枚まで → 1枚登場・1枚スリープ登場・残りを手札
    reg('id_1185', 'それぞれカード名の異なる特徴[少年探偵団]のキャラを3枚まで選ぶ', [{"ic": "event", "ops": [
        {"op": "pick", "from": "rem", "own": "self", "filter": {"type": "char", "trait": "少年探偵団", "lvEq": 4}, "n": 3, "min": 0, "distinct": True, "as": "chosen", "reveal": True, "msg": "Lv4・カード名の異なる少年探偵団のキャラ"},
        {"op": "playMix", "ref": "chosen", "awake": 1, "asleep": 1}]}], "A")

    # ── 1197 怪盗キッド: 事件[探偵VS怪盗]・証拠合計5以上で宣言(ターン1): 手札1枚リムーブ → アクティブ・AP-2000・キャラ1枚スリープ / 宣言(スリープ): 相手のスリープ状態のキャラとコンタクト
    reg('id_1197', 'このキャラをアクティブにし、ターン終了時までこのキャラをAP-2000する', [declare({"ctrait": "探偵VS怪盗", "evTotMin": 5}, [{"c": "discard", "n": 1}], [
        {"op": "self", "do": "active"}, {"op": "self", "do": "ap", "v": "-2000", "until": "turn"}, sel({"own": "any"}, "sleep")], lim=1)], "B")
    reg('id_1197', '相手の現場にいるスリープ状態のキャラを1枚まで選び、このキャラとのコンタクトを発生させる', [declare({}, [{"c": "sleepSelf", "n": 1}], [
        {"op": "contact", "atk": "self", "tf": {"own": "opp", "st": "s"}}])], "B")

    # ── 1230 消毒と絆創膏(イベント): パートナー(赤) 3つから1つ(宮野4名がそろっていれば3つとも)
    O1 = sel({"apMax": 8000, "own": "any"})
    O2 = sel({"apMax": 8000, "own": "any"}, "deckBottom")
    O3 = ifc({"fh": {"own": "self", "st": "x"}, "fhN": 1}, {"op": "loseEvid", "n": 1, "who": "opp"}, {"op": "gain", "n": 1})
    reg('id_1230', 'カード名[宮野厚司]と[宮野エレーナ]と[宮野明美]と[宮野志保]がいる場合', [{"ic": "event", "cond": {"pcolor": "red"}, "ops": [
        ifc({"fh": {"own": "self", "names": ["宮野厚司", "宮野エレーナ", "宮野明美", "宮野志保"]}, "fhN": 4, "fhDist": True}, O1, O2, O3, els=[{"op": "choose", "opts": [
            {"lab": "AP8000以下のキャラを1枚まで選び、リムーブする", "ops": [O1]},
            {"lab": "AP8000以下のキャラを1枚まで選び、デッキの下に移す", "ops": [O2]},
            {"lab": "自分の現場にスタン状態のキャラがいる場合、相手の証拠を上から1つリムーブし、自分は証拠を1つ得る", "ops": [O3]}]}])]}], "B")

    # ── 1243 「うるさい!!これは警察の仕事だ!!」(イベント): 解決編 — 自分の現場のキャラが持つ色の数まで(上から順に)
    reg('id_1243', '自分の現場にいるキャラが持つ色の数まで選んで行う', [{"ic": "event", "cond": {"cstate": "solve"}, "ops": [{"op": "chooseMulti", "maxCol": True, "max": 6, "opts": [
        {"lab": "キャラを1枚まで選び、リムーブする", "ops": [sel({"own": "any"})]},
        {"lab": "キャラを1枚まで選び、スリープさせる", "ops": [sel({"own": "any"}, "sleep")]},
        {"lab": "相手の裏向きの証拠を1つまで選び、表向きにする", "ops": [{"op": "flip", "n": 1, "who": "opp"}]},
        {"lab": "自分の表向きの証拠を1つまで選び、裏向きにする", "ops": [{"op": "flipDown", "n": 1}]},
        {"lab": "カードを1枚引く", "ops": [{"op": "draw", "n": 1}]},
        {"lab": "相手は手札を1枚リムーブする", "ops": [{"op": "discard", "n": 1, "who": "opp"}]}]}]}], "A")

    # ── 1256 「黒と黒が混ざっても…」(イベント): 2つから1つ(現場かパートナーエリアに[ジン&ベルモット]がいれば2つとも)
    P1 = [sel({"own": "any"}, "sleep"), {"op": "draw", "n": 1}]
    P2 = [sel({"own": "self", "color": "black"}), done(sel({"own": "any"}), sel({"own": "any", "st": "s"}))]
    CH = {"op": "choose", "opts": [{"lab": "キャラを1枚まで選び、スリープさせる。カードを1枚引く", "ops": P1},
                                   {"lab": "自分の【黒】のキャラを1枚リムーブしてもよい → キャラとスリープ状態のキャラを各1枚リムーブ", "ops": P2}]}
    reg('id_1256', 'カード名[ジン&ベルモット]がいる場合、代わりに2つとも行う', [{"ic": "event", "ops": [
        ifc({"fh": {"own": "self", "name": "ジン&ベルモット"}, "fhN": 1}, *P1, *P2,
            els=[ifc({"paHas": {"name": "ジン&ベルモット"}}, *P1, *P2, els=[CH])])]}], "B")

    # ── 1257 ドライマティーニ(事件): 解決編 宣言 — 裏向きの証拠3つを表向き: Lv7以下の自キャラ1枚をリムーブしてもよい → リムーブエリアのLv3以下[黒ずくめの組織]をスリープ登場
    reg('id_1257', '自分の現場にいるレベル7以下のキャラを1枚リムーブしてもよい', [declare({"cstate": "solve"}, [{"c": "flipEvid", "n": 3}], [
        sel({"own": "self", "lvMax": 7}), done(play_rem({"lvMax": 3, "type": "char", "trait": "黒ずくめの組織"}))], lim=1)], "B")

    # ── 1258 江戸川コナン&怪盗キッド: 事件[探偵VS怪盗] 自分のターン終了時 自分の証拠9以上でゲームに勝利 / 登場時: 証拠合計5以上 → 2枚引き2枚リムーブ、4以下 → 手札1枚リムーブしてもよい → 証拠1つ得る
    reg('id_1258', '自分のターン終了時、自分の証拠が9つ以上ある場合、ゲームに勝利する', [{"ic": "onend", "cond": {"turn": "self", "ctrait": "探偵VS怪盗", "cnt": [{"src": "evid", "op": "ge", "n": 9}]}, "ops": [{"op": "winGame"}]}], "A")
    reg('id_1258', 'お互いの証拠が合わせて5つ以上ある場合、カードを2枚引き', [{"ic": "onplay", "ops": [
        ifc({"evTotMin": 5}, {"op": "draw", "n": 2}, {"op": "discard", "n": 2, "opt": False}, els=[ifc({"evTotMax": 4}, DISC1, done({"op": "gain", "n": 1}))])]}], "A")

    # ── 1259 服部平次&ジョディ: 【ターン1】自分の【緑】か【赤】のキャラが、そのキャラよりAPが4000以上低いキャラを指定してアクションしたとき 手札1枚リムーブしてもよい → 証拠1つ
    reg('id_1259', '自分の現場にいる【緑】か【赤】のキャラが、そのキャラよりAPが4000以上低いキャラを指定してアクションしたとき', [
        trig(["act"], [DISC1, done({"op": "gain", "n": 1})], who="self", sf={"own": "self", "any": GR}, tApLow=4000, lim=1)], "A")

    # ── 1261 コナンVS怪盗キッド(事件): パートナー(青or白) 解決編 宣言 — 裏向きの証拠2つを表向き: 自キャラ1枚リムーブしてもよい → 相手のLv7以下MR以外のスリープ状態のキャラを手札へ・相手は手札1枚リムーブ・IDが違えばさらに1枚
    reg('id_1261', '自分の現場にいるキャラを1枚リムーブしてもよい', [declare({"pcolor": "blue|white", "cstate": "solve"}, [{"c": "flipEvid", "n": 2}], [
        sel({"own": "self"}),
        done(sel({"own": "opp", "lvMax": 7, "st": "s", "notMr": True}, "hand"), {"op": "discard", "n": 1, "who": "opp"},
             {"op": "ifIdDiff", "a": "sel", "b": "removed", "ops": [{"op": "discard", "n": 1, "who": "opp"}]})], lim=1)], "A")

    # ── 1199 黒羽快斗: 공통 규칙이 「Lv5以下の【青】か【白】の特徴[高校生]」를 잘못 해석하므로 카드별 데이터가 우선한다(pre)
    reg('id_1199', 'このキャラをスリープさせ、手札を1枚リムーブしてもよい', [{"ic": "onplay", "cond": {"ccolor": "blue&white", "pcolor": "white"}, "ops": [
        ifc({"fh": {"own": "self", "trait": "探偵"}, "fhN": 1},
            {"op": "optcost", "cost": [{"c": "sleepSelf", "n": 1}, {"c": "discard", "n": 1}]},
            done(play_rem({"lvMax": 5, "type": "char", "trait": "高校生", "any": BW}, asleep=False),
                 {"op": "if", "c": "played", "name": "中森青子", "ops": [{"op": "draw", "n": 1}]}))]}], "B", pre=True)

    # ── 1234 三池苗子: 「そうした場合」가 조건(Lv8以上の【黄】か【黒】) 바깥으로 빠지지 않도록 하나의 ifc 안에 둔다(pre)
    reg('id_1234', 'このキャラをスリープさせてもよい。そうした場合、このキャラのAP以下のAPのキャラ', [{"ic": "onplay", "cond": {"ccolor": "yellow&black", "cstate": "solve"}, "ops": [
        ifc({"fh": {"own": "self", "lvMin": 8, "any": [{"color": "yellow"}, {"color": "black"}]}, "fhN": 1},
            {"op": "self", "do": "sleep", "opt": True}, done(sel({"apMax": "self", "own": "any"})))]}], "B", pre=True)
