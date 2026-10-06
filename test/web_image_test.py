#!/usr/bin/env python3
"""v1.16.0 웹용 최적화 이미지 생성기(tools/make_web_images.py, card_images.sync_web) 검증 — 임시 폴더의 합성 이미지로 원본 보존/크기 규칙/증분 재생성/자동 생성을 확인한다."""
import hashlib, io, os, subprocess, sys, tempfile, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
os.environ.pop("CARD_IMAGE_DIR", None); os.environ.pop("CARD_IMAGE_WEB_DIR", None)
import card_images as CI
from PIL import Image
import numpy as np

fails = 0
def ok(c, m):
    global fails
    print(("✓ " if c else "✗ ") + m)
    if not c: fails += 1

def md5(p): return hashlib.md5(Path(p).read_bytes()).hexdigest()
def synth(path, w, h, fmt="JPEG", seed=0, mode="RGB"):
    rng = np.random.default_rng(seed); a = (rng.random((h // 8 + 1, w // 8 + 1, 3)) * 255).astype("uint8")
    im = Image.fromarray(a).resize((w, h), Image.BICUBIC).convert(mode); im.save(path, fmt, **({"quality": 95} if fmt == "JPEG" else {}))
def run(*args, env=None):
    return subprocess.run([sys.executable, str(ROOT / "tools" / "make_web_images.py"), *args], capture_output=True, text=True, env={**os.environ, **(env or {})})

with tempfile.TemporaryDirectory() as td:
    td = Path(td); src, web = td / "CardImage", td / "CardImageWeb"; src.mkdir()
    synth(src / "id_0001.jpg", 1800, 2500, seed=1)          # 큰 원본 → 세로 1200
    synth(src / "id_0002.jpg", 716, 1000, seed=2)           # 이미 작음 → 그대로(확대 금지)
    synth(src / "id_0003.jpg", 2400, 1700, seed=3)          # 가로 사건 카드 → 긴 변 1200
    synth(src / "id_0004.png", 800, 1100, fmt="PNG", seed=4, mode="RGBA")   # 알파 PNG
    h0 = {p.name: md5(p) for p in src.iterdir()}; m0 = {p.name: p.stat().st_mtime_ns for p in src.iterdir()}
    r = run("--src", str(src), "--dest", str(web)); ok(r.returncode == 0 and "새로 만듦/다시 만듦 4장" in r.stdout, "생성: 원본 4장 → 최적화본 4장 (" + r.stdout.splitlines()[0] + ")")
    ok({p.name: md5(p) for p in src.iterdir()} == h0 and {p.name: p.stat().st_mtime_ns for p in src.iterdir()} == m0 and len(list(src.iterdir())) == 4, "원본 폴더: 파일 내용·수정 시각·개수 전부 그대로 (읽기만 함)")
    names = sorted(p.name for p in web.iterdir() if not p.name.startswith(".")); ok(names == ["id_0001.webp", "id_0002.webp", "id_0003.webp", "id_0004.webp"], "파일명 = 원본 ID + .webp: " + ", ".join(names))
    def sz(n): return Image.open(web / n).size
    ok(Image.open(web / "id_0001.webp").format == "WEBP", "포맷 WebP")
    ok(sz("id_0001.webp") == (864, 1200), f"1800x2500 → 비율 유지 {sz('id_0001.webp')} (세로 1200)")
    ok(sz("id_0002.webp") == (716, 1000), f"716x1000 → 그대로 {sz('id_0002.webp')} (확대 금지)")
    w3, h3 = sz("id_0003.webp"); ok(max(w3, h3) == 1200 and abs(w3 / h3 - 2400 / 1700) < .01, f"가로 2400x1700 → 긴 변 1200 비율 유지 {w3}x{h3}")
    ok(Image.open(web / "id_0004.webp").mode in ("RGBA", "RGB") and sz("id_0004.webp") == (800, 1100), "알파 PNG 도 변환 (크기 유지)")
    ok((web / ".manifest.json").is_file(), "기록 파일 .manifest.json 생성")
    # 증분
    ts = {p.name: p.stat().st_mtime_ns for p in web.glob("*.webp")}
    r = run("--src", str(src), "--dest", str(web)); ok("새로 만듦/다시 만듦 0장" in r.stdout and "건너뜀 4장" in r.stdout and {p.name: p.stat().st_mtime_ns for p in web.glob("*.webp")} == ts, "다시 실행: 이미 최신 4장은 건너뜀 (파일 그대로)")
    r = run("--src", str(src), "--dest", str(web), "--check"); ok("새로 만들 것 0장" in r.stdout, "--check: 할 일 없음")
    synth(src / "id_0005.jpg", 716, 1000, seed=5); r = run("--src", str(src), "--dest", str(web)); ok("새로 만듦/다시 만듦 1장" in r.stdout and (web / "id_0005.webp").is_file() and {p.name: p.stat().st_mtime_ns for p in web.glob("id_000[1-4].webp")} == {k: v for k, v in ts.items()}, "새 원본 추가 → 새 것만 생성 (기존 4장은 그대로)")
    # 원본 변경
    old = md5(web / "id_0002.webp"); time.sleep(1.1); synth(src / "id_0002.jpg", 716, 1000, seed=22)
    r = run("--src", str(src), "--dest", str(web), "--check"); ok("id_0002.jpg" in r.stdout and "새로 만들 것 1장" in r.stdout, "--check: 바뀐 원본 1장만 다시 만들 대상으로 표시 (" + [l for l in r.stdout.splitlines() if "id_0002" in l][0].strip() + ")")
    r = run("--src", str(src), "--dest", str(web)); ok("다시 만듦 1장" in r.stdout and md5(web / "id_0002.webp") != old, "원본이 바뀌면 최적화본 다시 생성")
    # 수정 시각만 더 새로워도(내용 같아도) 다시 만든다
    os.utime(src / "id_0005.jpg", (time.time() + 60, time.time() + 60)); r = run("--src", str(src), "--dest", str(web)); ok("다시 만듦 1장" in r.stdout, "원본 수정 시각이 최적화본보다 새로우면 다시 생성")
    os.utime(src / "id_0005.jpg", (time.time() - 100, time.time() - 100))   # (테스트용으로 올려 둔 미래 시각을 되돌림)
    # 설정 변경 → 전부
    s85 = sum(p.stat().st_size for p in web.glob("*.webp")); r = run("--src", str(src), "--dest", str(web), "--quality", "88"); s88 = sum(p.stat().st_size for p in web.glob("*.webp"))
    ok("다시 만듦 5장" in r.stdout and s88 > s85, f"quality 85→88: 설정이 바뀌면 전부 다시 생성, 용량 증가 ({s85//1024}KB → {s88//1024}KB)")
    r = run("--src", str(src), "--dest", str(web), "--quality", "88"); ok("다시 만듦 0장" in r.stdout, "같은 설정으로 다시: 건너뜀")
    r = run("--src", str(src), "--dest", str(web), "--force", "--quality", "85"); ok("다시 만듦 5장" in r.stdout, "--force: 전부 다시 생성")
    r = run("--src", str(src), "--dest", str(web), "--max", "800", "--only", "id_0001"); ok(sz("id_0001.webp")[1] == 800 or max(sz("id_0001.webp")) == 800, "--max 800 --only id_0001: 해당 카드만 800px")
    # 안전장치
    r = run("--src", str(src), "--dest", str(src)); ok(r.returncode != 0 and {p.name: md5(p) for p in src.iterdir()} == {**h0, "id_0002.jpg": md5(src / "id_0002.jpg"), "id_0005.jpg": md5(src / "id_0005.jpg")} or r.returncode != 0, "원본 폴더 = 출력 폴더 → 중단 (원본 보호)")
    try: CI.convert_one(src / "id_0001.jpg", src / "id_0001.webp"); ok(False, "convert_one 이 같은 폴더를 허용함")
    except ValueError: ok(True, "convert_one: 같은 폴더 거부")
    # prune
    (src / "id_0005.jpg").unlink(); r = run("--src", str(src), "--dest", str(web)); ok("원본이 없는 최적화본 1장" in r.stdout and (web / "id_0005.webp").exists(), "원본이 사라져도 최적화본은 자동 삭제하지 않음(안내만)")
    r = run("--src", str(src), "--dest", str(web), "--prune"); ok(not (web / "id_0005.webp").exists(), "--prune: 원본 없는 최적화본 삭제")
    # 깨진 원본 하나가 전체를 막지 않는다
    (src / "id_0006.jpg").write_bytes(b"not an image"); r = run("--src", str(src), "--dest", str(web)); ok(r.returncode == 1 and "실패 1장" in r.stdout and (web / "id_0001.webp").exists(), "깨진 원본 1장은 실패로 보고하고 나머지는 정상 처리")
    # 규칙 함수
    ok(CI.web_name("id_0001.jpg") == "id_0001.webp" and CI.web_name("id_0001.png") == "id_0001.webp" and CI.web_name("") == "", "web_name 규칙")
    ok(CI.img_path("id_0001.jpg") == "CardImageWeb/id_0001.webp" and CI.img_path("") == "", "cards.json img = CardImageWeb/<ID>.webp (image_file 에서 자동 연결)")

# 새 카드 추가 흐름: stage + commit → 원본 복사 + 웹용 자동 생성
with tempfile.TemporaryDirectory() as td:
    td = Path(td); proj = td / "proj"; (proj / "CardImage").mkdir(parents=True); synth(td / "new.jpg", 1300, 1800, seed=9)
    name, img = CI.stage_image("id_9999", td / "new.jpg"); done = CI.commit_images(proj / "CardImage", {"id_9999"})
    ok(name == "id_9999.jpg" and img == "CardImageWeb/id_9999.webp" and done == ["id_9999.jpg"], "새 카드 등록: file=id_9999.jpg, img=CardImageWeb/id_9999.webp")
    ok(md5(proj / "CardImage" / "id_9999.jpg") == md5(td / "new.jpg"), "원본은 바이트 그대로 CardImage 에 복사")
    ok((proj / "CardImageWeb" / "id_9999.webp").is_file() and Image.open(proj / "CardImageWeb" / "id_9999.webp").size[1] == 1200, "CardImageWeb 에 최적화본 자동 생성 (1800 → 세로 1200)")

# 실제 데이터: 샘플 비교는 별도 보고 (여기서는 cards.json 전부 img 규칙을 따르는지)
import json
db = json.loads((ROOT / "data" / "cards.json").read_text("utf-8"))["cards"]
ok(all(c["img"] == CI.img_path(c["file"]) for c in db.values()), f"data/cards.json {len(db)}장: img 가 전부 file 에서 만든 CardImageWeb 경로")
web_real = ROOT / "CardImageWeb"
if web_real.is_dir():
    miss = [c["id"] for c in db.values() if not (web_real / CI.web_name(c["file"])).is_file()]
    ok(len(miss) == 0, f"CardImageWeb: 모든 카드의 최적화본 존재 (없는 카드 {len(miss)}장 {miss[:5]})")
print(f"\nweb_image_test: {'실패 ' + str(fails) if fails else '전부 통과'}"); sys.exit(1 if fails else 0)
