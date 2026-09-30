#!/usr/bin/env python3
"""카드 이미지 폴더 → 시뮬레이터용 카드 DB(JSON) 변환기 (Claude 비전 사용, 중단 후 재개 가능)

1단계(이미지): 이름/종류/색/레벨/AP/LP/특징/효과 원문을 읽는다.
2단계(텍스트): 효과 원문을 시뮬레이터 엔진이 실행하는 '효과 데이터(ab)'로 바꾼다.
             바꿀 수 없는 문장은 manual 로 남겨 게임 중 사람이 처리한다(엉뚱하게 자동 처리하지 않음).

사용법:
  pip install anthropic pillow
  export ANTHROPIC_API_KEY=sk-ant-...
  python import_cards.py ./card_images --out conan-db.json --limit 20      # 먼저 20장만 시험
  python import_cards.py ./card_images --out conan-db.json                 # 전체 (중단 후 다시 실행하면 이어서)
  옵션: --id-regex "^([A-Z]\\d+)"  파일명에서 카드 ID 추출 / --model, --struct-model / --no-struct(효과 구조화 생략)
결과 conan-db.json 을 시뮬레이터 [📚 카드/덱 관리] → 가져오기 로 불러오세요.
같은 폴더에 conan-db.review.csv(사람이 확인할 카드 목록), conan-db.effects.txt(효과 문장 패턴 통계)도 만들어집니다."""
import argparse, base64, collections, csv, io, json, re, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import anthropic
from PIL import Image

CACHE_VER = "v2"  # 예전(v1) 캐시는 아이콘 목록 유출 오류가 있어 사용하지 않는다
COLORS = ["red", "blue", "green", "yellow", "purple", "white", "black"]
S = {"type": "string"}

# ───────────────────────── 1단계: 이미지 읽기 ─────────────────────────
GLOSSARY = """[게임 용어 사전 — 글자를 정확히 읽는 데 참고만 하세요. 카드에 적혀 있지 않은 용어를 절대 출력하지 마세요]
手札(손패) 現場(현장) 証拠(증거) 事件(사건) 事件編/解決編 FILEエリア リムーブ(リムーブエリア) デッキ 登場 スリープ スタン アクティブ パートナー キャラ イベント
迅速 突撃 ブレット ミスリード カットイン 変装 ヒラメキ 宣言 ターン① ターン② 自分ターン中 相手ターン中 現場リムーブ時 登場時 コンタクト アクション 推理 LP AP レベル
자주 오독되는 글자: 手札(×手紙/手銃) リムーブ(×リームーブ/リープ) スリープ(×スリーブ) 証拠(×証城/証閣) 現場(×場所/領地) ヒラメキ(×ビラメキ)"""
SYS1 = ("너는 '명탐정 코난 트레이딩 카드 게임' 카드 이미지를 읽어 정확한 데이터로 옮기는 도우미다. "
        "이미지에 실제로 보이는 것만 기록하고, 보이지 않는 값은 추측하지 말고 빈 문자열로 둔다. 반드시 card 도구로만 답한다.\n" + GLOSSARY)
TOOL1 = {"name": "card", "description": "카드 1장의 정보를 기록한다", "input_schema": {"type": "object", "required": ["name", "type", "color", "fx_ja"], "properties": {
    "name": {**S, "description": "카드 이름 (일본어 원문)"},
    "type": {"type": "string", "enum": ["partner", "char", "event", "case"], "description": "パートナー=partner, キャラ=char, イベント=event, 事件=case"},
    "color": {"type": "string", "enum": COLORS + [""], "description": "카드의 색. 캐릭터/이벤트는 카드 테두리(프레임)와 좌상단 레벨 배지의 색, 사건 카드는 좌상단 동그란 색 아이콘의 색. 2색이면 'red/blue' 처럼 /로 연결. 사진 속 옷 색이 아니라 프레임 색을 본다. 주황/금색 프레임은 yellow"},
    "lv": {**S, "description": "좌상단 레벨 숫자. 사건 카드는 '先'(선공) 옆 사건레벨 숫자. 없으면 빈 문자열"},
    "lv2": {**S, "description": "사건 카드만: '後'(후공) 옆 사건레벨 숫자. 그 외 빈 문자열"},
    "ap": {**S, "description": "AP(캐릭터 하단 왼쪽의 큰 숫자, 예 4000). 없으면 빈 문자열"},
    "lp": {**S, "description": "LP(하단 오른쪽 열쇠구멍 안 숫자). 없으면 빈 문자열"},
    "trait": {**S, "description": "카드에 적힌 특징(이름 위/옆의 작은 라벨들)을 쉼표로 나열. 예: 高校生,探偵. 없으면 빈 문자열"},
    "fx_ja": {**S, "description": "텍스트 박스에 실제로 적힌 문장을 일본어 원문 그대로 옮긴다(줄바꿈은 그대로). 아이콘은 아이콘 안/옆의 글자를 【】로 감싸 표기한다. 주석문 '(…)'도 포함. 텍스트가 없으면 빈 문자열. 이미지에 없는 문장이나 아이콘을 만들어 넣지 말 것"},
    "fx_ko": {**S, "description": "위 효과 텍스트의 한국어 번역"}}}}
FIX = {"手紙": "手札", "手銃": "手札", "リームーブ": "リムーブ", "スリーブ": "スリープ", "ビラメキ": "ヒラメキ", "ひらめき": "ヒラメキ", "証城": "証拠", "証閣": "証拠", "蒸閣": "証拠"}
LEGEND = "【登場時】【宣言】【カットイン】"  # 예전 버전의 유출 문자열이 다시 나오면 오류로 간주


def prep(p, send_px, crop_px, thumb_px):
    im = Image.open(p).convert("RGB")
    full = im.copy(); full.thumbnail((send_px, send_px))
    w, h = im.size; box = im.crop((0, int(h * 0.55), w, h)); box.thumbnail((crop_px, crop_px))  # 텍스트 박스가 있는 아래쪽을 크게 한 번 더
    def b64(x, q=88):
        b = io.BytesIO(); x.save(b, "JPEG", quality=q); return base64.b64encode(b.getvalue()).decode()
    t = im.copy(); t.thumbnail((thumb_px, thumb_px)); b = io.BytesIO(); t.save(b, "JPEG", quality=60)
    return b64(full), b64(box), "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode(), im


def frame_color(im):
    """카드 테두리 색을 픽셀로 추정(캐릭터/이벤트용 교차 검증). 모르면 ''."""
    im = im.resize((120, 168)); hsv = im.convert("HSV"); px = hsv.load(); W, H = hsv.size; ring = []
    for x in range(W):
        for y in list(range(2, 6)) + list(range(H - 6, H - 2)): ring.append(px[x, y])
    for y in range(H):
        for x in list(range(2, 6)) + list(range(W - 6, W - 2)): ring.append(px[x, y])
    col = [(h, s, v) for h, s, v in ring if s > 90 and v > 60]
    if len(col) < len(ring) * 0.25:
        v = sum(p[2] for p in ring) / len(ring); return "white" if v > 170 else "black" if v < 70 else ""
    hs = sorted(h * 360 / 255 for h, s, v in col); h = hs[len(hs) // 2]
    return "red" if h < 20 or h >= 340 else "yellow" if h < 70 else "green" if h < 170 else "blue" if h < 255 else "purple"


def call(cli, model, **kw):
    for k in range(6):
        try: return cli.messages.create(model=model, **kw)
        except Exception:
            if k == 5: raise
            time.sleep(2 ** k)


def read_card(cli, model, p, cache, a):
    cf = cache / f"{CACHE_VER}_{p.stem}.json"
    if cf.exists(): return json.loads(cf.read_text("utf-8"))
    full, box, thumb, im = prep(p, a.send_px, a.crop_px, a.thumb_px); d = None
    for attempt in range(3):
        r = call(cli, model, max_tokens=2500, system=SYS1, tools=[TOOL1], tool_choice={"type": "tool", "name": "card"}, messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": full}}, {"type": "text", "text": "위는 카드 전체, 아래는 텍스트 박스 확대입니다."},
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": box}}, {"type": "text", "text": "이 카드를 기록해줘."}]}])
        d = next(x.input for x in r.content if x.type == "tool_use")
        if LEGEND in (d.get("fx_ja") or "") and len(d["fx_ja"]) < 120 and attempt < 2: continue  # 유출 문자열 재시도
        break
    for bad, good in FIX.items(): d["fx_ja"] = (d.get("fx_ja") or "").replace(bad, good)
    d["img"] = thumb; d["file"] = p.name; d["flags"] = []
    if d["type"] in ("char", "event"):
        fc = frame_color(im); mc = d.get("color", "")
        if not mc and fc: d["color"] = fc; d["flags"].append(f"색을 픽셀로 보정({fc})")
        elif fc and fc not in mc.split("/"): d["flags"].append(f"색 불일치: 모델={mc} 픽셀={fc}")
        elif not mc: d["flags"].append("색 없음")
    elif d["type"] == "case" and not d.get("color"): d["flags"].append("색 없음(사건)")
    cf.write_text(json.dumps(d, ensure_ascii=False), "utf-8"); return d


# ───────────────────────── 2단계: 효과 문장 → 효과 데이터 ─────────────────────────
SPEC = r"""너는 '명탐정 코난 카드 게임'의 카드 효과 텍스트를, 게임 엔진이 실행하는 JSON 효과 데이터로 바꾸는 변환기다.
입력은 카드 텍스트(OCR 결과라 오독이 있을 수 있음: 手紙→手札, リームーブ→リムーブ, スリーブ→スリープ 등은 문맥으로 바로잡아 해석)다.
반드시 abilities 도구로 답한다. 확신이 없는 문장은 추측하지 말고 {"op":"manual","txt":"그 문장"} 으로 남긴다(엉뚱한 자동 처리보다 수동 처리가 낫다).

## 능력 1개(ability)의 형식
{"ic":종류, "cond":{...}, "lim":0|1|2, "cost":[...], "ops":[...], "v":숫자, "on":{"k":"char|case","by":"contact|effect"}, "lab":"짧은 이름", "txt":"원문 문장"}
ic(발동 시점):
 onplay=【登場時】 / onremoved=【現場リムーブ時】 / flash=【ヒラメキ】(証拠からリムーブされるとき) / declare=【宣言】(메인 페이즈에 스스로 사용, 코스트는 ':' 앞)
 static=상시 효과(트리거 문구 없이 "AP+N" 등) / cutin=【カットイン】(コンタクト 중 손패에서 리무브해 사용) / onact="このキャラがアクションしたとき"(on.k: アクション【キャラ】=char, 【事件】=case)
 oncontact="このキャラがコンタクトしたとき" / onreason="このキャラが推理したとき" / onend="ターン終了時" / ondisguise=【変装時】 / event=イベントカードの효과 / manual=위 어디에도 안 맞는 능력
cond(모두 만족해야 유효; 필요한 것만 쓴다): turn:"self"(【自分ターン中】)|"opp"(【相手ターン中】) / pcolor:"red"(【パートナー赤】) / ccolor:"red"(【事件 색】) / ctrait:특징
 / fileMin:N(FILEエリアにカードがN枚以上) / cstate:"kase"(【事件編】)|"solve"(【解決編】) / bond:"카드 이름"(【絆 이름】)
lim: 【ターン①】=1, 【ターン②】=2 (그 외 0)
색: 赤=red 青=blue 緑=green 黄=yellow 紫=purple 白=white 黒=black. (◎●◆★ 같은 기호가 색을 뜻하면 카드 문맥으로 판단, 모르면 manual)

## ops (순서대로 실행)
{"op":"draw","n":1,"who":"self|opp","opt":false}                     カードをN枚引く (相手は…引く → who:opp)
{"op":"discard","n":1,"who":"self|opp","opt":false,"rand":false}     手札をN枚リムーブする ("してもよい"→opt:true, ランダム→rand:true)
{"op":"deckrem","n":3,"who":"self|opp","opt":false}                  デッキの上からN枚リムーブする("してもよい"→opt:true)
{"op":"gain","n":1,"who":"self|opp"}                                 証拠をN得る / 相手に証拠をN与える(who:opp)
{"op":"loseEvid","n":1,"who":"self|opp"}                             証拠をNつリムーブ
{"op":"look","n":3,"from":"top|bottom","filter":{...},"max":1,"then":"hand|field|fieldSleep|rem","rest":"bottom|shuffleBottom|top|rem|hand|keep"}
      デッキの上からN枚見る(公開する)→その中から条件のカードをmax枚まで選び then 처리, 残りは rest 처리. 見るだけで選ばない효과는 max:0.
      "残りを好きな順でデッキの下に移す"=rest:bottom / "シャッフルしてデッキの下に移す"=shuffleBottom / 残りをリムーブ=rem / "それ以外の場合、手札に加える"=rest:hand
{"op":"select","n":1,"filter":{...},"do":"sleep|stun|active|remove|hand|deckBottom|deckTop|deckTopOrBottom|ap|lp|kw","v":"1000","until":"turn|contact"}
      キャラをN枚まで選び… (대상은 자신/상대 현장 캐릭터). スリープさせる=sleep スタンさせる=stun アクティブにする=active リムーブする=remove 手札に移す=hand
      デッキの下に移す=deckBottom デッキの上か下に移す=deckTopOrBottom ターン終了時までAP+N=ap(v:"N", until:turn) コンタクト中AP+N=ap(until:contact) LP+N=lp
      キーワード付与(ターン終了時まで突撃を与える 등)=kw(v:"assault"|"rapid"|"bullet"|"assault-char"|"assault-case")
{"op":"self","do":"sleep|active|ap|lp|hand|deckBottom|kw","v":"","opt":false}  このキャラ自身に対する処理 ("このキャラをスリープさせてもよい"→opt:true)
{"op":"play","n":1,"from":"hand|rem","filter":{...},"asleep":false}   キャラを登場させる (スリープ状態で→asleep:true)
{"op":"choose","opts":[{"lab":"…","ops":[...]},{"lab":"…","ops":[...]}]} "以下からNつ選んで行う"
{"op":"if","c":"done|notdone","ops":[...]}   "そうした場合"/"〜した場合"=直前の処理を実際に行った場合 done, "そうしなかった場合"=notdone
{"op":"shuffle","who":"self"} / {"op":"solve"}(事件を解決編にする) / {"op":"manual","txt":"…"}
filter(필요한 것만): own:"self|opp|any"(自分の現場=self, 相手の現場=opp, 指定なし=any) lvMax:N|"file"(レベルN以下 / FILEエリアの枚数以下) lvMin:N apMax:N apMin:N lpMax:N lpMin:N color:"red" trait:"특징" name:"카드명 일부" st:"a|s|x|sx"(アクティブ/スリープ/スタン/スリープかスタン) notSelf:true(このキャラ以外) type:"char|event"

## cost (declare 능력의 ':' 앞)
{"c":"sleepSelf"}(スリープ) / {"c":"discard","n":1,"filter":{...}}(手札をN枚リムーブ) / {"c":"deckrem","n":3}(デッキの上からN枚リムーブ) / {"c":"selfBottom"}(このキャラをデッキの下に移す) / {"c":"sleepOther","n":1}(このキャラ以外のキャラをN枚スリープ)

## static 능력 (ic:"static")
{"ic":"static","cond":{...},"tgt":{"sel":"self|allies|opp|all","filter":{...},"notSelf":false},"ap":1000,"lp":0,"kw":""}
 예) 【自分ターン中】自分の現場にいるこのキャラ以外の【緑】のキャラをAP+1000 → tgt:{sel:allies,notSelf:true,filter:{color:green}}, cond:{turn:self}, ap:1000
 예) 【自分ターン中】AP+1000(자기 자신) → tgt:{sel:self}

## kw (キーワード能力, 별도 필드): 공백으로 나열
迅速=rapid 突撃=assault 突撃[キャラ]=assault-char 突撃[事件]=assault-case ブレット=bullet ミスリードX=misreadX(예 misread2) 変装=disguise
※カットインはkw가 아니라 ability(ic:cutin, v:AP값)로 표현한다. 조건별 AP가 다르면(自分ターン中 AP+N／相手ターン中 AP+M) cutin ability를 2개로 나눠 각각 cond.turn을 준다.
※カットインに追加 효과가 있으면 그 효과는 같은 ability의 ops에 넣는다.

## 예시
1) "【登場時】自分のデッキのカードを上から3枚見る。その中からカードを1枚まで公開して手札に加え、残りを好きな順でデッキの下に移す。カードを手札に加えた場合、手札を1枚リムーブする"
 → {"ic":"onplay","ops":[{"op":"look","n":3,"max":1,"then":"hand","rest":"bottom"},{"op":"if","c":"done","ops":[{"op":"discard","n":1}]}]}
2) "【ヒラメキ】(証拠からリムーブされるときに発動する)カードを1枚引く" → {"ic":"flash","ops":[{"op":"draw","n":1}]}
3) "【カットインAP+2000】(コンタクト中に手札からリムーブして使う)" → {"ic":"cutin","v":2000}
4) "【自分ターン中】【ターン①】このキャラがアクション【キャラ】したとき、ターン終了時までこのキャラをAP+2000する" → {"ic":"onact","on":{"k":"char"},"cond":{"turn":"self"},"lim":1,"ops":[{"op":"self","do":"ap","v":"2000"}]}
5) "【宣言】ターン①：手札を1枚リムーブする：キャラを1枚まで選び、スリープさせる" → {"ic":"declare","lim":1,"cost":[{"c":"discard","n":1}],"ops":[{"op":"select","n":1,"do":"sleep","filter":{}}]}
6) "【登場時】AP3000以下のキャラを1枚まで選び、リムーブする。そうした場合、カードを1枚引く" → {"ic":"onplay","ops":[{"op":"select","n":1,"do":"remove","filter":{"apMax":3000}},{"op":"if","c":"done","ops":[{"op":"draw","n":1}]}]}
7) "【解決編】自分の裏向きの証拠を1つまで選び、表向きにする" → 표현 불가 → {"ic":"manual","cond":{"cstate":"solve"},"txt":"自分の裏向きの証拠を1つまで選び、表向きにする"}
8) "【登場時】手札からレベル2以下の特徴「少年探偵団」のキャラを1枚までスリープ状態で登場させてもよい" → {"ic":"onplay","ops":[{"op":"play","n":1,"from":"hand","filter":{"lvMax":2,"trait":"少年探偵団"},"asleep":true}]}
※예시는 형식 설명용이다. 입력 카드에 없는 능력을 만들어 내지 말 것. 카드에 텍스트가 없으면 abilities는 빈 배열.
※각 ability의 txt에는 그 능력에 해당하는 원문 문장을 넣는다."""
TOOL2 = {"name": "abilities", "description": "효과 텍스트를 엔진용 효과 데이터로 기록한다", "input_schema": {"type": "object", "required": ["abilities", "kw"], "properties": {
    "kw": {**S, "description": "키워드 능력(rapid assault assault-char assault-case bullet misreadN disguise)을 공백으로 나열. 없으면 빈 문자열"},
    "abilities": {"type": "array", "items": {"type": "object", "required": ["ic"], "properties": {
        "ic": {"type": "string", "enum": ["onplay", "onremoved", "flash", "declare", "static", "cutin", "onact", "oncontact", "onreason", "event", "onend", "ondisguise", "manual"]},
        "ops": {"type": "array", "items": {"type": "object", "required": ["op"], "properties": {"op": {"type": "string", "enum": ["draw", "discard", "deckrem", "gain", "loseEvid", "look", "select", "self", "play", "choose", "if", "shuffle", "solve", "manual"]}}}}}}}}}}


def structure(cli, model, d, cache, stem):
    cf = cache / f"{CACHE_VER}_{stem}.ab.json"
    if cf.exists(): return json.loads(cf.read_text("utf-8"))
    txt = (d.get("fx_ja") or "").strip()
    if d["type"] == "partner" or not txt: out = {"kw": "", "abilities": []}
    else:
        r = call(cli, model, max_tokens=3000, system=[{"type": "text", "text": SPEC, "cache_control": {"type": "ephemeral"}}], tools=[TOOL2], tool_choice={"type": "tool", "name": "abilities"},
                 messages=[{"role": "user", "content": f"카드 종류: {d['type']}\n카드 이름: {d['name']}\n카드 텍스트:\n{txt}"}])
        out = next(x.input for x in r.content if x.type == "tool_use")
    cf.write_text(json.dumps(out, ensure_ascii=False), "utf-8"); return out


def work(cli, a, p, cache):
    d = read_card(cli, a.model, p, cache, a)
    st = {"kw": d.get("kw", ""), "abilities": []} if a.no_struct else structure(cli, a.struct_model, d, cache, p.stem)
    return d, st


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("folder"); ap.add_argument("--out", default="conan-db.json")
    ap.add_argument("--model", default="claude-sonnet-5-5", help="이미지 읽기 모델(작은 글씨 정확도 때문에 기본 sonnet. 저렴하게: claude-haiku-4-5-20251001)")
    ap.add_argument("--struct-model", default="claude-sonnet-5-5", help="효과 구조화 모델")
    ap.add_argument("--no-struct", action="store_true", help="효과 구조화를 하지 않음(텍스트만 저장)")
    ap.add_argument("--workers", type=int, default=6); ap.add_argument("--id-regex", default=r"(.+)")
    ap.add_argument("--send-px", type=int, default=1100); ap.add_argument("--crop-px", type=int, default=1500); ap.add_argument("--thumb-px", type=int, default=240); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args(); cache = Path(a.out).with_suffix(".cache"); cache.mkdir(exist_ok=True)
    files = sorted(p for p in Path(a.folder).rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"))
    if a.limit: files = files[:a.limit]
    cli = anthropic.Anthropic(); rx = re.compile(a.id_regex); cards, fails, seen, rows = {}, [], 0, []
    with ThreadPoolExecutor(a.workers) as ex:
        fut = {ex.submit(work, cli, a, p, cache): p for p in files}
        for f in as_completed(fut):
            p = fut[f]; seen += 1
            try: d, st = f.result()
            except Exception as e: fails.append((p.name, str(e)[:100])); continue
            m = rx.search(p.stem); cid = m.group(1) if m else p.stem
            if cid in cards: continue  # 같은 ID(패러렐 등)는 같은 카드 1장으로
            ab = st.get("abilities", []); man = "manual" in json.dumps(ab)
            cards[cid] = {"id": cid, "n": d["name"], "type": d["type"], "color": d.get("color", ""), "lv": d.get("lv", ""), "lv2": d.get("lv2", ""), "ap": d.get("ap", ""), "lp": d.get("lp", ""),
                          "kw": st.get("kw", "") or d.get("kw", ""), "trait": d.get("trait", ""), "fx": d.get("fx_ja", ""), "extra": d.get("fx_ko", ""), "ab": ab, "img": d["img"]}
            fl = list(d.get("flags", []))
            if d["type"] == "char" and not (d.get("ap") and d.get("lp")): fl.append("AP/LP 없음")
            if d.get("fx_ja") and d["type"] != "partner" and not ab and not a.no_struct: fl.append("효과 텍스트는 있는데 효과 데이터 없음")
            if man: fl.append("일부 효과 수동(manual)")
            if fl: rows.append([cid, d["name"], d["file"], " / ".join(fl)])
            if seen % 50 == 0: print(f"{seen}/{len(files)}", file=sys.stderr)
    Path(a.out).write_text(json.dumps({"cards": cards, "decks": {}}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    with open(Path(a.out).with_suffix(".review.csv"), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh); w.writerow(["ID", "이름", "파일", "확인 필요 사유"]); w.writerows(sorted(rows))
    cnt = collections.Counter(c["type"] for c in cards.values()); auto = sum(1 for c in cards.values() if c["ab"] and "manual" not in json.dumps(c["ab"]))
    withfx = sum(1 for c in cards.values() if c["fx"] and c["type"] != "partner")
    print(f"카드 {len(cards)}장 | 종류별 {dict(cnt)} | 효과 있는 카드 {withfx}장 중 완전 자동 {auto}장 | 확인 필요 {len(rows)}장 (→ {Path(a.out).with_suffix('.review.csv')}) | 실패 {len(fails)}")
    for n, e in fails: print("실패:", n, e)
    pat = collections.Counter()
    for c in cards.values():
        for s in re.split(r"[。\n]", c["fx"]):
            s = re.sub(r"\d+", "N", s.strip())
            if len(s) > 3: pat[s] += 1
    Path(a.out).with_suffix(".effects.txt").write_text("\n".join(f"{n}\t{s}" for s, n in pat.most_common(300)), "utf-8")


main()
