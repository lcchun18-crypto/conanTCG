"""import_cards.py 의 실제 HTTP 요청 형식을 검증한다 (모의 API 서버 + SDK 호환 클라이언트).
실행: python test/importer_test.py"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
os.environ.pop("CARD_IMAGE_DIR", None)   # v1.14.0: 임시 프로젝트를 쓰는 테스트는 실제 CardImage 폴더를 건드리지 않는다
from PIL import Image, ImageDraw
HERE = Path(__file__).parent; ROOT = HERE.parent; sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "shim"))
import mock_api as M
srv, URL = M.start()
IMP = ROOT / "import_cards.py"; LEG = HERE / "legacy_import_cards_v2.py"
T = []; t = lambda n: (lambda f: T.append((n, f)) or f)


def mkimgs(d, n_green=3, n_orange=2, n_blue=3, corrupt=0):
    d.mkdir(parents=True, exist_ok=True); k = 0
    for name, col, cnt in (("B", (30, 150, 60), n_green), ("E", (230, 150, 20), n_orange), ("C", (30, 70, 200), n_blue)):
        for i in range(cnt):
            im = Image.new("RGB", (630 + i, 880), col); dr = ImageDraw.Draw(im); dr.rectangle((25, 25, 605, 855), fill=(240, 235, 220)); dr.ellipse((54 - 37, 64 - 37, 54 + 37, 64 + 37), fill=col, outline=(245, 245, 245), width=8); im.save(d / f"{name}{i:02d}001_p.png"); k += 1
    for i in range(corrupt): (d / f"Z{i:02d}999_bad.png").write_bytes(b"not an image at all")
    return d


def run(script, folder, out, *args, env=None, timeout=180):
    e = {**os.environ, "PYTHONPATH": str(HERE / "shim"), "ANTHROPIC_API_KEY": "test-key", "ANTHROPIC_BASE_URL": URL, **(env or {})}
    r = subprocess.run([sys.executable, str(script), str(folder), "--out", str(out), "--id-regex", r"^([A-Z]\d+)", "--workers", "3", *args], capture_output=True, env=e, timeout=timeout)
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


tmp = Path(tempfile.mkdtemp(prefix="imp_"))
def ok(c, m): 
    if not c: raise AssertionError(m)
def db(out): return json.load(open(out, encoding="utf-8"))["cards"]


@t("회귀: 이전 버전(강제 tool_choice)은 Sonnet 5.5에서 400 — 사용자가 본 오류 메시지를 그대로 재현")
def _():
    M.reset(); imgs = mkimgs(tmp / "old", 1, 0, 0); rc, o, e = run(LEG, imgs, tmp / "old.json")
    txt = o + e; ok("Error code: 400" in txt and "'message': 'tool_choi" in txt, "구버전 오류가 재현되지 않음:\n" + txt[:600])
    ok(any(r.get("tool_choice", {}).get("type") == "tool" for r in M.S["reqs"]), "구버전은 강제 tool_choice 를 보냈어야 함")
    ok("카드 0장" in o and "실패 1" in o, "구버전 결과 요약")


@t("수정본: --limit 1 이 정상 동작 (요청은 모두 tool_choice=auto, thinking 없음, 서버 검증 통과)")
def _():
    M.reset(); imgs = mkimgs(tmp / "a", 3, 2, 3); out = tmp / "a.json"; rc, o, e = run(IMP, imgs, out, "--limit", "1")
    ok(rc == 0, f"rc={rc}\n{o}\n{e}"); ok(len(db(out)) == 1, "카드 1장이어야 함\n" + o); ok("실패 0장" in o, o)
    reqs = M.S["reqs"]; ok(len(reqs) >= 1, "요청 없음")
    for r in reqs:
        ok(r["tool_choice"] == {"type": "auto"}, f"tool_choice: {r.get('tool_choice')}"); ok("thinking" not in r, "thinking 을 보내면 안 됨"); ok(r["model"] == "claude-sonnet-5-5", r["model"])
    ok(reqs[0]["tools"][0]["name"] == "card" and reqs[0]["messages"][0]["content"][0]["type"] == "image", "1단계 요청 형태")


@t("전체 실행: 색 보정/불일치 표시, review.csv, 효과 데이터, 2회차는 캐시로 요청 0건")
def _():
    M.reset(); imgs = tmp / "a"; out = tmp / "full.json"; rc, o, e = run(IMP, imgs, out); ok(rc == 0, o + e); c = db(out); ok(len(c) == 8, f"{len(c)}장: {o}")
    by = {v["id"]: v for v in c.values()}; ev = [v for v in c.values() if v["type"] == "event"]; ok(ev and ev[0]["color"] == "yellow", "이벤트 색은 픽셀(주황=yellow)로 보정돼야 함: " + str([v['color'] for v in ev]))
    fl = [v for v in c.values() if v["ab"] and v["ab"][0]["ic"] == "flash"]; ok(fl, "ヒラメキ → flash 능력"); ok("リームーブ" not in fl[0]["fx"] and "リムーブ" in fl[0]["fx"], "오독 교정")
    ok(any(v["ab"] and v["ab"][0]["ic"] == "cutin" and "手札" in v["fx"] for v in c.values()), "컷인 + 手紙→手札 교정")
    ok((tmp / "full.review.csv").exists() and (tmp / "full.effects.txt").exists(), "review.csv / effects.txt")
    M.reset(); rc, o, e = run(IMP, imgs, out); ok(rc == 0 and len(M.S["reqs"]) == 0, f"캐시 사용 실패: 요청 {len(M.S['reqs'])}건")


@t("모델이 tool_use 없이 JSON 텍스트로 답해도 처리")
def _():
    M.reset("text_json"); out = tmp / "tj.json"; rc, o, e = run(IMP, mkimgs(tmp / "tj", 1, 1, 1), out); ok(rc == 0 and len(db(out)) == 3, o + e)


@t("도구 모드가 400으로 거부되면 오류 전문을 출력하고 JSON 모드로 자동 전환")
def _():
    M.reset("reject_tools"); out = tmp / "rt.json"; rc, o, e = run(IMP, mkimgs(tmp / "rt", 1, 1, 1), out); ok(rc == 0 and len(db(out)) == 3, o + e)
    ok("JSON 텍스트 모드로 전환" in e and "tool use is not available in this configuration (testing)" in e, "전문 출력 없음:\n" + e[:500])
    ok(any("tools" not in r for r in M.S["reqs"][1:]), "전환 후에는 tools 없이 요청")


@t("429 / 500 은 재시도 후 성공, 400 은 재시도하지 않음")
def _():
    M.reset("rate_limit_once"); rc, o, e = run(IMP, mkimgs(tmp / "r1", 1, 0, 0), tmp / "r1.json", "--no-struct"); ok(rc == 0 and len(db(tmp / "r1.json")) == 1 and "재시도" in e, o + e)
    M.reset("server_error_once"); rc, o, e = run(IMP, mkimgs(tmp / "r2", 1, 0, 0), tmp / "r2.json", "--no-struct"); ok(rc == 0 and len(db(tmp / "r2.json")) == 1 and "재시도" in e, o + e)
    M.reset("always_400"); rc, o, e = run(IMP, mkimgs(tmp / "r3", 1, 0, 0), tmp / "r3.json"); ok(len(M.S["reqs"]) == 1, f"400 을 재시도함: {len(M.S['reqs'])}건")


@t("계속 400이면 오류 전문(잘리지 않음)을 출력·저장하고 조기 중단, 프로세스는 깨지지 않음")
def _():
    M.reset("always_400"); imgs = mkimgs(tmp / "f", 4, 4, 4); out = tmp / "f.json"; rc, o, e = run(IMP, imgs, out)
    ok(rc == 1, f"rc={rc}"); full = "Could not process image; the request was rejected for testing purposes. " + "x" * 40; ok(full in o and full in e, "오류 전문이 잘렸음")
    log = (tmp / "f.errors.log").read_text(encoding="utf-8"); ok(full in log, "errors.log 에 전문 없음"); ok("모든 카드가 같은 API 오류로 실패" in o, o[-400:]); ok("Traceback" not in e, "예외 노출: " + e[-300:])
    ok(len(M.S["reqs"]) < 12, f"조기 중단 실패: 요청 {len(M.S['reqs'])}건 (카드 12장)"); ok("건너뜀" in o, "건너뜀 표시")


@t("이미지 1장이 손상돼도 나머지는 정상 처리 (카드 단위 실패 격리)")
def _():
    M.reset(); imgs = mkimgs(tmp / "c", 2, 1, 2, corrupt=1); out = tmp / "c.json"; rc, o, e = run(IMP, imgs, out); ok(rc == 0 and len(db(out)) == 5, o + e); ok("Z00999_bad.png" in o and "실패 1장" in o, o)


@t("Windows cp949 콘솔에서도 일본어/한글 오류 출력으로 죽지 않음")
def _():
    M.reset("always_400", japanese_error=True); out = tmp / "jp.json"; rc, o, e = run(IMP, mkimgs(tmp / "jp", 2, 0, 0), out, env={"PYTHONIOENCODING": "cp949"})
    ok(rc == 1 and "UnicodeEncodeError" not in e + o and "手札" in o + e, f"rc={rc}\n{e[-400:]}")


@t("--dry-run: 네트워크 호출 없이 요청 형태(tool_choice=auto) 출력")
def _():
    M.reset(); rc, o, e = run(IMP, tmp / "a", tmp / "dry.json", "--dry-run"); ok(rc == 0 and len(M.S["reqs"]) == 0, o + e); ok('"type": "auto"' in o and "claude-sonnet-5-5" in o and "thinking" not in o, o[:600])


@t("--model claude-haiku-4-5-20251001 (다른 모델)도 같은 형식으로 통과")
def _():
    M.reset(); out = tmp / "h.json"; rc, o, e = run(IMP, mkimgs(tmp / "h", 1, 0, 0), out, "--model", "claude-haiku-4-5-20251001", "--struct-model", "claude-haiku-4-5-20251001"); ok(rc == 0 and len(db(out)) == 1, o + e)


# ───────────── 이번 개선: 색 판별 / 규칙 변환 / --effects-only / --sample / 회귀 fixture ─────────────
sys.path.insert(0, str(ROOT)); import effect_rules as ER, import_cards as IC, base64 as _b64, io as _io, collections as _co
FIXJ = HERE / "fixtures" / "conan-db-test20.json"; GOLD = json.load(open(HERE / "fixtures" / "golden_ab.json", encoding="utf-8")); FIX = json.load(open(FIXJ, encoding="utf-8"))["cards"]
def norm(x):
    if isinstance(x, dict): return {k: norm(v) for k, v in x.items() if k not in ("txt", "lab") and v not in (False, 0, "", [], {}, None)}
    if isinstance(x, list): return [norm(v) for v in x]
    return x
def node_check(path):
    r = subprocess.run(["node", str(HERE / "check_db.js"), str(path), "--json"], capture_output=True, cwd=str(ROOT)); assert r.returncode == 0, r.stderr.decode()[:400]; return json.loads(r.stdout)


@t("색 판별: 금박/노란 테두리 카드도 좌상단 배지(파랑) 기준으로 blue — 예전 테두리 방식은 yellow 로 오탐")
def _():
    im = Image.new("RGB", (172, 240), (250, 250, 250)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 171, 239), outline=(230, 190, 20), width=6)  # 금색 테두리(카드 폭의 3.5%)
    d.ellipse((6, 8, 26, 28), fill=(20, 90, 200)); d.text((13, 14), "6", fill=(255, 255, 255))  # 파란 배지 + 흰 숫자
    ok(IC.ring_color(im) == "yellow", "재현: 테두리 방식은 yellow 로 오판해야 함(=사용자가 본 오탐)"); ok(IC.card_color(im) == ("blue", "badge"), f"배지 방식: {IC.card_color(im)}")
    d2 = {"color": "blue", "flags": [], "type": "char"}; IC.check_color(d2, im); ok(d2["flags"] == [], f"오탐 플래그가 남음: {d2['flags']}")


@t("색 판별: 빨강/초록/노랑 배지 + 반대 색 테두리, 가로형 사건 카드, 실제 20장 썸네일 전부 blue")
def _():
    for col, rgb in (("red", (210, 30, 40)), ("green", (30, 160, 70)), ("yellow", (235, 200, 20)), ("blue", (30, 80, 210))):
        im = Image.new("RGB", (172, 240), (245, 245, 240)); d = ImageDraw.Draw(im); d.rectangle((0, 0, 171, 239), outline=(20, 90, 200) if col != "blue" else (200, 40, 40), width=6); d.ellipse((6, 8, 26, 28), fill=rgb)
        ok(IC.card_color(im) == (col, "badge"), f"{col}: {IC.card_color(im)}")
    im = Image.new("RGB", (240, 172), (245, 245, 240)); ImageDraw.Draw(im).ellipse((6, 6, 26, 26), fill=(30, 80, 210)); ok(IC.card_color(im) == ("blue", "badge"), f"가로형 사건 카드 {IC.card_color(im)}")
    for k, c in FIX.items():
        pc, src = IC.card_color(Image.open(_io.BytesIO(_b64.b64decode(c["img"].split(",", 1)[1]))).convert("RGB")); ok((pc, src) == ("blue", "badge"), f"{k}: {(pc, src)}")


@t("색 판별: 배지로 못 정하면 테두리는 '참고'로만 표시(불일치 확정 플래그 아님), 모델 색이 없을 때만 보정에 사용")
def _():
    im = Image.new("RGB", (172, 240), (225, 225, 220)); ImageDraw.Draw(im).ellipse((6, 8, 26, 28), fill=(20, 20, 20), outline=(240, 240, 240), width=2)
    d = {"color": "red", "flags": [], "type": "char"}; IC.check_color(d, im); ok(d["color"] == "red" and any("색 불일치" in f for f in d["flags"]), f"무채색 원은 자동 교정하지 않고 표시만: {d}")
    d = {"color": "", "flags": [], "type": "char"}; IC.check_color(d, im); ok(d["color"] == "black" and d["flags"], d)
    blank = Image.new("RGB", (172, 240), (20, 20, 20)); d = {"color": "red", "flags": [], "type": "char"}; IC.check_color(d, blank); ok(d["color"] == "red" and not d["flags"], f"원이 안 보이면 모델 색 유지(4순위): {d}")


@t("규칙 변환: 실제 20장의 모델 출력 → manual 13장이 모두 골든 구조와 일치 (API 없음)")
def _():
    n_before = sum(1 for c in FIX.values() if c["type"] != "partner" and c["fx"] and ER.has_manual(c["ab"])); ok(n_before == 13, f"fixture 는 manual 13장이어야 함: {n_before}")
    for k, c in FIX.items():
        new, _ = ER.upgrade(c["ab"], c["fx"]); ok(not ER.has_manual(new), f"{k} manual 남음: {ER.manual_texts(new)}")
        if k in GOLD: ok(norm(new) == norm(GOLD[k]), f"{k} 골든과 다름:\n{json.dumps(norm(new), ensure_ascii=False)}\n{json.dumps(norm(GOLD[k]), ensure_ascii=False)}")


@t("규칙 변환: 숫자/카드명/특징/색이 바뀐 변형 문장에도 적용 (특정 카드에 맞춘 하드코딩이 아님)")
def _():
    def up(txt, ic="manual"): r, _ = ER.upgrade([{"ic": ic, "txt": txt, "ops": [{"op": "manual", "txt": txt}]}], txt); return r
    a = up("【パートナー】【赤】【ターン②】自分がネクストヒントで手札を使用したとき、そのカードのレベル以下のレベルのキャラを1枚まで選び、スリープさせる。")[0]
    ok(a["ic"] == "onhint" and a["cond"] == {"pcolor": "red"} and a["lim"] == 2 and a["ops"][0]["do"] == "sleep", a)
    a = up("相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、カードを2枚引く。")[0]; ok(a["ic"] == "onkill" and a["ops"][0]["n"] == 2, a)
    a = up("お互いの現場にキャラが合わせて4枚以上いる場合、手札にあるこのキャラはレベル2になる。")[0]; ok(a["ic"] == "hand" and a["cond"]["fieldMin"] == 4 and a["lv"] == 2, a)
    a = up("【ターン①】能力や効果によってレベル4以下の特徴[高校生]のキャラが自分の現場に登場したとき、その中から1枚をアクティブにし、ターン終了時までそのキャラに突撃を与える。")[0]
    ok(a["ic"] == "onally" and a["ef"] == {"lvMax": 4, "trait": "高校生"} and a["ops"][1]["v"] == "assault", a)
    a = up("レベル4以上のキャラの能力やレベル2以上のイベントの効果によって登場した場合、相手の現場にいるレベル3以下のキャラを1枚まで選び、スリープさせる。", "onplay")[0]
    ok(a["cond"]["via"] == [{"type": "char", "lvMin": 4}, {"type": "event", "lvMin": 2}] and a["ops"][0]["filter"] == {"own": "opp", "lvMax": 3}, a)
    a = up("【絆】灰原哀 相手の能力や効果によって選ばれない。")[0]; ok(a["cond"]["bond"] == "灰原哀" and a["kw"] == "untarget", a)
    a = up("このキャラがスリープ状態の場合、相手は自分の現場にいるレベル3以下のキャラを指定してアクションできない。")[0]; ok(a["tgt"]["filter"]["lvMax"] == 3, a)
    a = up("このキャラはスリープ状態で登場する。")[0]; ok(a["ic"] == "enter", a)


@t("규칙 변환: 모르는 문장이 섞이면 손대지 않고 manual 로 남김(오변환 방지) / 모델이 구조화한 부분은 보존")
def _():
    t1 = "相手の現場にいるキャラがこのキャラとのコンタクトによってリムーブされたとき、相手のデッキを見て好きなカードを選ぶ。"
    r, n = ER.upgrade([{"ic": "manual", "txt": t1, "ops": [{"op": "manual", "txt": t1}]}], t1); ok(n == 0 and ER.has_manual(r), r)
    t2 = "レベル3以上のキャラの能力によって登場した場合、カードを1枚引く。"  # 이벤트 절이 없는 변형 → 아직 모름 → manual 유지
    r, n = ER.upgrade([{"ic": "onplay", "ops": [{"op": "manual", "txt": t2}]}], t2); ok(ER.has_manual(r), r)
    keep = {"ic": "declare", "lim": 1, "cost": [{"c": "discard", "n": 1}], "ops": [{"op": "self", "do": "ap", "v": "1000"}]}; r, n = ER.upgrade([keep], ""); ok(r == [keep] and n == 0, "이미 구조화된 능력은 그대로")
    ok(not ER.has_manual(ER.upgrade([], "")[0]), "빈 입력")


@t("--effects-only: 이미지 인식 없이 저장된 원문으로 2단계만 재실행 (요청에 이미지 0건, 카드당 1요청), 2회차는 캐시")
def _():
    M.reset(); out = tmp / "eo.json"; shutil.copy(FIXJ, out); e = {**os.environ, "PYTHONPATH": str(HERE / "shim"), "ANTHROPIC_API_KEY": "test-key", "ANTHROPIC_BASE_URL": URL}
    r = subprocess.run([sys.executable, str(IMP), "--effects-only", "--out", str(out), "--workers", "3"], capture_output=True, env=e, timeout=180, cwd=str(tmp)); o = r.stdout.decode("utf-8", "replace")
    ok(r.returncode == 0, o + r.stderr.decode("utf-8", "replace")); reqs = M.S["reqs"]; ok(len(reqs) == 19, f"효과 있는 19장만 요청해야 함: {len(reqs)}")
    ok(all(not any(c.get("type") == "image" for c in (q["messages"][0]["content"] if isinstance(q["messages"][0]["content"], list) else [])) for q in reqs), "이미지 블록이 전송됨")
    ok(all(q["tools"][0]["name"] == "abilities" and q["tool_choice"] == {"type": "auto"} for q in reqs), "2단계 도구 요청 형태")
    ok((tmp / "eo.before-effects.json").exists(), "덮어쓰기 전 백업"); c = db(out); ok(len(c) == 20 and c["id_0001"]["img"] == (lambda f: ("CardImage/" + f) if f else "")(FIX["id_0001"].get("file", "")) and "data:image" not in c["id_0001"]["img"] and c["id_0001"]["fx"] == FIX["id_0001"]["fx"] and c["id_0001"]["extra"] == FIX["id_0001"]["extra"], "일/한 원문 보존 + 이미지는 base64 가 아닌 CardImage 경로")
    ok((tmp / "eo.manual.txt").exists() and (tmp / "eo.review.csv").exists(), "manual.txt / review.csv")
    M.reset(); r = subprocess.run([sys.executable, str(IMP), "--effects-only", "--out", str(out), "--workers", "3"], capture_output=True, env=e, timeout=180, cwd=str(tmp)); ok(r.returncode == 0 and len(M.S["reqs"]) == 0, f"2회차 요청 {len(M.S['reqs'])}건")


@t("2단계 캐시 키는 SPEC/모델/텍스트가 바뀌면 달라진다 (프롬프트·엔진 수정 후 예전 결과 재사용 방지)")
def _():
    h = IC.spec_hash("m", "txt", "char", "n"); ok(h == IC.spec_hash("m", "txt", "char", "n") and h != IC.spec_hash("m2", "txt", "char", "n") and h != IC.spec_hash("m", "txt2", "char", "n"), "모델/텍스트")
    old = IC.SPEC; IC.SPEC = old + "\n변경"; h2 = IC.spec_hash("m", "txt", "char", "n"); IC.SPEC = old; ok(h2 != h, "SPEC 변경이 키에 반영되어야 함")


@t("--effects-only --rules-only: API 없이(키/SDK 불필요) 실제 20장 → manual 13장이 0장, 엔진 정화기 기준으로도 19/19 자동")
def _():
    out = tmp / "ro.json"; env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}; env["PYTHONPATH"] = ""
    r = subprocess.run([sys.executable, str(IMP), "--effects-only", str(FIXJ), "--rules-only", "--out", str(out)], capture_output=True, env=env, timeout=120, cwd=str(tmp)); o = r.stdout.decode("utf-8", "replace")
    ok(r.returncode == 0, o + r.stderr.decode("utf-8", "replace")); ok("완전 자동 19장(100.0%)" in o and "manual 포함 0장" in o, o)
    res = node_check(out); ok(res["withFx"] == 19 and res["auto"] == 19 and res["manual"] == 0, str(res)); before = node_check(FIXJ); ok(before["auto"] == 6 and before["manual"] == 13, f"기준선: {before['auto']}/{before['manual']}")
    ok(all(v["img"] == (lambda f: ("CardImage/" + f) if f else "")(FIX[k].get("file", "")) and "data:image" not in v["img"] for k, v in db(out).items()), "이미지 경로 보존(base64 없음)"); ok(len(open(tmp / "ro.review.csv", encoding="utf-8-sig").read().strip().splitlines()) == 1, "review.csv 는 머리글만(색 오탐도 사라짐)")


@t("--sample N: 폴더 전체에서 무작위 N장, --seed 로 재현, 없으면 매번 다름")
def _():
    M.reset(); imgs = mkimgs(tmp / "s", 6, 6, 6); names = lambda o: sorted(x for x in (tmp / "s").iterdir() if x.suffix)  # noqa
    def pick(seed):
        M.reset(); out = tmp / f"s{seed}.json"; args = ["--sample", "5", "--no-struct"] + (["--seed", str(seed)] if seed is not None else []); rc, o, e = run(IMP, imgs, out, *args); ok(rc == 0, o + e); return sorted(db(out).keys()), e
    a, ea = pick(7); b, eb = pick(7); ok(a == b and len(a) == 5, f"같은 seed → 같은 표본: {a} {b}"); ok("--seed 7" in ea, ea)
    ok(any(pick(None)[0] != a for _ in range(6)), "seed 없이는 표본이 달라야 함"); ok(len(set(a[i][0] for i in range(5))) >= 2, f"종류가 고르게 섞임: {a}")



# ───────────── 실제 무작위 100장(sample100) 개선: 일반화 규칙 / 회귀 / 색 오탐 ─────────────
S100J = HERE / "fixtures" / "sample100.json"; S100 = json.load(open(S100J, encoding="utf-8"))["cards"]


def comp(txt, ctype="char"):
    r = ER.compile_card(txt, ctype, "", None); ok(r and not ER.has_manual(r), f"manual 로 남음: {txt}\n{r}"); return r


def dflt(x, key=None):  # 엔진 기본값(sanitizer 가 채우는 값)은 같은 의미로 보고 제거해 비교
    if isinstance(x, dict): return {k: dflt(v, k) for k, v in x.items() if k not in ("txt", "lab") and not (k == "n" and v == 1) and not (k == "who" and v == "self") and not (k == "from" and v == "top") and not (k == "until" and v == "turn") and not (k == "type" and v == "char") and not (k == "opt" and v is False) and v not in (False, 0, "", [], {}, None) or (k in ("lpMax", "lpMin", "lvMax") and v == 0)}
    if isinstance(x, list): return [dflt(v) for v in x]
    return x


@t("--effects-only --rules-only 파이프라인 결과(compile_card)가 실제 20장 골든 구조 13장과 (기본값 차이를 빼고) 완전히 같다 — 기존 정상 효과 회귀 없음")
def _():
    out = tmp / "g20.json"; env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}; env["PYTHONPATH"] = ""
    r = subprocess.run([sys.executable, str(IMP), "--effects-only", str(FIXJ), "--rules-only", "--out", str(out)], capture_output=True, env=env, timeout=120, cwd=str(tmp)); ok(r.returncode == 0, r.stderr.decode("utf-8", "replace")); new = db(out)
    for k, g in GOLD.items(): ok(dflt(g) == dflt(new[k]["ab"]), f"{k} 골든과 다름\n{json.dumps(dflt(g), ensure_ascii=False)}\n{json.dumps(dflt(new[k]['ab']), ensure_ascii=False)}")


@t("sample100 1순위: 「この事件が解決編になったとき、自分は手札をN枚リムーブする」— 숫자·수식어가 달라도 onsolve+discard (하드코딩 아님)")
def _():
    for n in (1, 2, 3):
        a = comp(f"この事件が解決編になったとき、自分は手札を{n}枚リムーブする。", "case")[0]; ok(a["ic"] == "onsolve" and a["ops"] == [{"op": "discard", "n": n, "who": "self", "opt": False, "rand": False}] or (a["ic"] == "onsolve" and a["ops"][0]["op"] == "discard" and a["ops"][0]["n"] == n), a)
    a = comp("この事件が解決編になったとき、相手はカードを2枚引く。", "case")[0]; ok(a["ic"] == "onsolve" and a["ops"][0]["op"] == "draw" and a["ops"][0]["who"] == "opp" and a["ops"][0]["n"] == 2, a)
    a = comp("この事件が解決編になったとき、自分はカードを1枚引く。", "case")[0]; ok(a["ic"] == "onsolve" and a["ops"][0]["op"] == "draw", a)
    ok(sum(1 for c in S100.values() for x in ER.compile_card(c["fx"], c["type"], c.get("kw", ""), None) if x["ic"] == "onsolve") >= 8, "실제 100장 중 8장 이상이 onsolve")


@t("sample100 2·3순위: 【MR能力】 (相手ターン中に現場を離れる場合パートナーエリアへ / 自分の現場にMRが登場する場合リムーブ) — 줄바꿈·태그 위치·표기 변형 모두 mr")
def _():
    for txt in ("【MR能力】相手ターン中に現場を離れる場合、パートナーエリアに移動する。\n自分の現場にMRが登場する場合、リムーブする。",
                "【MR能力】\n相手ターン中に現場を離れる場合、パートナーエリアに移動する。\n自分の現場にMRが登場する場合、リムーブする。",
                "【MR能力】 相手ターン中に現場を離れる場合、パートナーエリアに移動する。", "【MR能力】相手ターン中に現場を離れる場合、パートナーエリアに移動する。自分の現場にMRが登場する場合、リムーブする。"):
        r = comp(txt); ok([a["ic"] for a in r] == ["mr"], f"{txt!r} → {r}")
    r = comp("【カットイン】AP+2000\n【MR能力】相手ターン中に現場を離れる場合、パートナーエリアに移動する。\n自分の現場にMRが登場する場合、リムーブする。"); ok([a["ic"] for a in r] == ["cutin", "mr"], r)


@t("sample100 일반화: 숫자·이름·특징·색·레벨이 바뀐 변형 문장 (효과 종류별)")
def _():
    a = comp("【自分ターン中】自分の現場にこのキャラ以外のカード名[灰原哀]か[江戸川コナン]が登場したとき、AP5000以下のキャラを1枚まで選び、リムーブする。")[0]; ok(a["ic"] == "onally" and a["ef"]["names"] == ["灰原哀", "江戸川コナン"] and a["ops"][0]["filter"]["apMax"] == 5000 and a["cond"]["turn"] == "self", a)
    a = comp("【登場時】手札からレベル3以下の【赤】のキャラを1枚までスリープ状態で登場させてもよい。")[0]; ok(a["ic"] == "onplay" and a["ops"][0]["asleep"] and a["ops"][0]["filter"]["lvMax"] == 3 and a["ops"][0]["filter"]["color"] == "red", a)
    a = comp("【宣言】【ターン①】【スリープ】：自分のデッキのカードを上から1枚公開する。公開したカードが特徴[刑事]か[探偵]のキャラの場合、手札に加える。公開したカードがそれ以外の場合、デッキの下に移す。")[0]
    ok(a["ic"] == "declare" and a["lim"] == 1 and a["ops"][0]["op"] == "revealTop" and a["ops"][0]["filter"]["any"] == [{"trait": "刑事"}, {"trait": "探偵"}], a)
    a = comp("【登場時】自分のリムーブエリアにあるカード名［毛利蘭］を1枚まで選び、手札に加える。")[0]; ok(a["ops"][0]["op"] == "fetch" and a["ops"][0]["filter"] == {"name": "毛利蘭"}, a)
    a = comp("【登場時】手札を1枚リムーブしてもよい。そうした場合、カードを3枚引く。")[0]; ok(a["ops"][0]["opt"] and a["ops"][1] == {"op": "if", "c": "done", "ops": [{"op": "draw", "n": 3, "who": "self", "opt": False}]} or a["ops"][1]["ops"][0]["n"] == 3, a)
    a = comp("【自分ターン中】【ターン①】自分のリムーブエリアにある特徴［警視庁］のキャラがリムーブエリアから離れたとき、キャラを1枚まで選び、ターン終了時までAP－2000する。")[0]; ok(a["ic"] == "onremleave" and a["ef"]["trait"] == "警視庁" and a["ops"][0]["v"] == "-2000", a)
    a = comp("【相手ターン中】自分の現場にいるこのキャラ以外のキャラ1枚が相手の能力や効果、コンタクトによって現場から離れるとき、このキャラをリムーブしてもよい。そうした場合、そのキャラは現場から離れる代わりに手札に移す。")[0]; ok(a["ic"] == "replace" and a["rep"]["to"] == "hand" and a["cond"]["turn"] == "opp", a)
    a = comp("自分のターンのメインフェイズ開始時、手札を1枚リムーブしてもよい。そうした場合、証拠を2つ得る。")[0]; ok(a["ic"] == "onmain" and a["ops"][1]["ops"][0] == {"op": "gain", "n": 2} or a["ops"][1]["ops"][0]["n"] == 2, a)
    a = comp("【解決編】【宣言】【ターン①】裏向きの証拠を3つ表向きにする:カードを2枚引く。この能力は自分の現場に【青】の特徴[探偵]のキャラが3枚以上いる場合に宣言できる。", "case")[0]
    ok(a["cost"][0] == {"c": "flipEvid", "n": 3} and a["cond"]["fhN"] == 3 and a["cond"]["fh"]["color"] == "blue" and a["cond"]["cstate"] == "solve", a)
    a = comp("【登場時】相手とじゃんけんで勝敗を決める。自分が勝った場合、カードを2枚引く。自分が負けた場合、カードを1枚引き、手札を2枚リムーブする。")[0]; ok(a["ops"][0]["op"] == "rps" and a["ops"][1]["c"] == "win" and a["ops"][2]["c"] == "lose", a)
    a = comp("自分のターン終了時、自分のパートナーエリアに特徴[怪盗]のカードがある場合、このキャラをアクティブにする。")[0]; ok(a["ic"] == "onend" and a["cond"]["paHas"] == {"trait": "怪盗"}, a)


@t("sample100 미지원 문장은 여전히 manual 로 남긴다 (오변환 방지)")
def _():
    r = ER.compile_card("【登場時】相手のデッキのカードを好きなだけ見て、好きな順番に並べ替える。", "char", "", None); ok(ER.has_manual(r), r)
    r = ER.compile_card("この事件が解決編になったとき、自分は手札を1枚リムーブする。その後、相手の手札を全て見て1枚選び捨てさせる。", "case", "", None); ok(ER.has_manual(r), r)


@t("sample100 회귀: --effects-only --rules-only 로 실제 100장 → 효과 93장 전부 엔진 정화기 기준 자동(기준선 22 → 93), 썸네일 보존, 색 플래그 0")
def _():
    out = tmp / "s100.json"; env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}; env["PYTHONPATH"] = ""
    r = subprocess.run([sys.executable, str(IMP), "--effects-only", str(S100J), "--rules-only", "--out", str(out)], capture_output=True, env=env, timeout=300, cwd=str(tmp)); o = r.stdout.decode("utf-8", "replace")
    ok(r.returncode == 0, o + r.stderr.decode("utf-8", "replace")); ok("효과 있는 카드 93장 중 완전 자동 93장(100.0%)" in o and "manual 포함 0장" in o and "실패 0장" in o, o)
    res = node_check(out); ok(res["withFx"] == 93 and res["auto"] == 93 and res["manual"] == 0, str(res)); base = node_check(S100J); ok(base["auto"] == 22 and base["manual"] == 70, f"기준선 {base['auto']}/{base['manual']}")
    ok(all(v["img"] == (lambda f: ("CardImage/" + f) if f else "")(S100[k].get("file", "")) and "data:image" not in v["img"] for k, v in db(out).items()), "이미지 경로 보존(base64 없음)"); ok(len(open(tmp / "s100.review.csv", encoding="utf-8-sig").read().strip().splitlines()) == 2, "review.csv 는 머리글 + 종류 보정된 id_1075 1건뿐")
    new = db(out)
    for k, c in S100.items():  # 이미 자동이던 22장: 기존 능력이 (기본값 차이를 빼고) 그대로 남아 있어야 한다. 새로 붙는 것은 키워드 정적 능력뿐
        if c["type"] == "partner" or not c.get("fx") or ER.has_manual(c["ab"]): continue
        old = dflt(c["ab"]); nw = dflt(new[k]["ab"])
        for a in old: ok(a in nw, f"{k}: 기존 능력이 바뀌거나 사라짐\n기존 {a}\n신규 {nw}")
        extra = [a for a in nw if a not in old]; ok(all(a.get("ic") == "static" and a.get("kw") or a.get("ic") == "ondisguise" for a in extra), f"{k}: 예상 밖의 추가 능력 {extra}")


@t("색 판별: sample100 의 배지가 번져 보이는 카드(금박/그라데이션)도 1위가 압도적이면 배지로 확정, 애매하면 표시하지 않음")
def _():
    for k in ("id_0535", "id_1153"):  # 초록 배지 + 노란 계열 번짐 → 예전엔 배지 미확정 → 테두리(yellow) 오탐 플래그
        im = Image.open(_io.BytesIO(_b64.b64decode(S100[k]["img"].split(",", 1)[1]))).convert("RGB"); ok(IC.badge_color(im)[0] in ("green", ""), f"{k} {IC.badge_hist(im)[:3]}"); d = {"color": S100[k]["color"], "flags": [], "type": "char"}; IC.check_color(d, im); ok(d["flags"] == [], f"{k} 오탐: {d['flags']}")
    for k in ("id_0716", "id_1033", "id_0930"):
        im = Image.open(_io.BytesIO(_b64.b64decode(S100[k]["img"].split(",", 1)[1]))).convert("RGB")
        d = {"color": S100[k]["color"], "flags": [], "type": S100[k]["type"]}; IC.check_color(d, im); ok(d["flags"] == [], f"{k} 오탐: {d['flags']} {IC.card_color(im)}")
    im = Image.new("RGB", (172, 240), (240, 240, 240)); ImageDraw.Draw(im).ellipse((6, 8, 26, 28), fill=(30, 160, 70)); d = {"color": "red", "flags": [], "type": "char"}; IC.check_color(d, im); ok(any("색 불일치: 모델=red 픽셀=green" in f for f in d["flags"]), f"진짜 불일치는 그대로 잡아야 함: {d['flags']}")
    im2 = Image.new("RGB", (172, 240), (240, 240, 240)); dr = ImageDraw.Draw(im2); dr.ellipse((6, 8, 26, 28), fill=(30, 160, 70)); dr.pieslice((6, 8, 26, 28), 300, 360, fill=(230, 200, 30)); dd = {"color": "red", "flags": [], "type": "char"}; IC.check_color(dd, im2); ok(dd["flags"], "번짐이 있어도 모델 색(red)이 배지 상위 색이 아니면 플래그")

@t("종류 판정(요청4): 효과에 パートナー/パートナーエリア/【パートナー(색)】 가 있어도 캐릭터 카드는 char — 모델이 partner 라 해도 인쇄 근거가 이김")
def _():
    import inspect
    ok(list(inspect.signature(IC.classify_type).parameters) == ["obs", "geom_landscape"], "classify_type 은 텍스트 인자가 없어야 함")
    for fx in ("【パートナー(青)】このキャラは...", "自分のパートナーエリアにいる時...", "パートナーをアクティブにする"):
        d = {"declared_type": "partner", "type": "partner", "lv": "2", "ap": "5000", "lp": "3", "fx_ja": fx, "flags": [], "observed": {"landscape": None, "level_badge": True, "ap": True, "lp": True, "case_marks": None, "printed_kind": ""}}
        IC.apply_type(d); ok(d["type"] == "char" and d["type_basis"], f"{fx}: {d['type']} {d['type_basis']}")
        d2 = dict(d, fx_ja="", type="partner", declared_type="partner"); IC.apply_type(d2); ok(d2["type"] == d["type"], "효과 텍스트 유무와 무관")
        d3 = dict(d, declared_type="char", type="char", observed={}, lv="", ap="", lp="3"); d3["fx_ja"] = fx; IC.apply_type(d3); ok(d3["type"] == "char", "모델이 char 이고 근거 없으면 유지")
    pt = {"declared_type": "partner", "type": "partner", "lv": "", "ap": "", "lp": "4", "fx_ja": "この事件が...パートナー", "flags": [], "observed": {"landscape": False, "level_badge": False, "ap": False, "lp": True, "case_marks": False, "printed_kind": ""}}
    IC.apply_type(pt); ok(pt["type"] == "partner", pt["type_basis"])
    pk = {"declared_type": "char", "observed": {"printed_kind": "パートナー"}, "flags": [], "fx_ja": ""}; IC.apply_type(pk); ok(pk["type"] == "partner" and any("종류 보정" in f for f in pk["flags"]), str(pk))
    ev = {"declared_type": "partner", "observed": {"level_badge": True, "ap": False, "lp": False}, "flags": [], "fx_ja": "パートナー"}; IC.apply_type(ev); ok(ev["type"] == "event", ev["type"])
    old = {"type": "partner", "lv": "2", "ap": "4000", "lp": "3", "fx_ja": "パートナー", "flags": []}; IC.apply_type(old); ok(old["type"] == "char", "예전 캐시(partner+lv/ap)는 필드 근거로 재판정")
    ok(S100["id_1075"]["type"] == "partner" and S100["id_1075"]["lv"] and S100["id_1075"]["ap"], "픽스처 원본 id_1075 는 partner 오판 상태")
    r = dict(S100["id_1075"]); r.pop("img", None); r["flags"] = []; IC.apply_type(r); ok(r["type"] == "char" and any("종류 보정" in f for f in r["flags"]), "id_1075 → char (효과의 パートナー 와 무관)")
    ok(IC.decide_type("partner", {})[0] == "char", "근거 없는 partner 주장은 인정하지 않음")

@t("전체 DB 대표 카드(요청11): 규칙 파서만으로 compile_card(fx) 결과가 골든 ab 와 같다 (API/OCR 없음)")
def _():
    F = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures/full_samples.json"), encoding="utf-8"))["cards"]
    ok(len(F) >= 40, len(F))
    for k, c in F.items():
        ab = ER.compile_card(c["fx"], c["type"], c.get("kw", ""), None)
        ok(ab == c["ab"], f"{k} 파싱 결과가 골든과 다름")
        ok(ab is not None and ab != "manual", f"{k} 자동화되어야 함")

bad = 0
for n, f in T:
    try: f(); print("✓", n)
    except Exception as ex: bad += 1; print("✗", n, "\n   ", str(ex)[:900])
shutil.rmtree(tmp, ignore_errors=True); print(f"\n{'전체 ' + str(len(T)) + '개 통과' if not bad else str(bad) + '개 실패'}"); sys.exit(1 if bad else 0)
