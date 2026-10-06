#!/usr/bin/env python3
"""카드 이미지 파일 관리 공용 라이브러리 (v1.14.0).

원칙 (역할 분리)
  · 실제 이미지 파일  = CardImage/ 폴더 (파일명은 카드 ID: id_0001.jpg)  ← 고해상도 원본. 절대 수정/재압축하지 않는다
  · 게임용 이미지     = CardImageWeb/ 폴더 (id_0001.webp)  ← v1.16.0: 원본에서 자동 생성한 웹용 최적화본 (세로 최대 1200px, WebP q85, 확대 금지). 게임은 이것을 쓴다
  · data/cards.xlsx   = Cards 시트의 image_file 열에서 이미지 파일명을 관리 (사람이 고치는 곳)
  · data/cards.json   = file(원본 파일명) + img(게임이 읽는 상대 경로: "CardImageWeb/id_0001.webp") 만 저장. base64 는 넣지 않는다
  · 서버              = /CardImage/<파일명>, /CardImageWeb/<파일명> 으로 정적 제공 (server.js). 최적화본이 아직 없으면 같은 이름의 원본으로 대신 응답한다
Pillow 가 없어도(GitHub Actions 등) 파일 존재/확장자/해상도(JPEG·PNG·WebP 헤더) 검사는 동작한다.
"""
import os, re, shutil, struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
IMG_DIR_NAME = "CardImage"                       # 프로젝트 루트 기준 이미지 폴더 (환경변수 CARD_IMAGE_DIR 로 폴더 위치만 바꿀 수 있다)
WEB_DIR_NAME = "CardImageWeb"                    # 게임용 최적화 이미지 폴더 (환경변수 CARD_IMAGE_WEB_DIR 로 위치만 바꿀 수 있다)
IMG_URL_PREFIX = WEB_DIR_NAME                    # cards.json 의 img 값 앞부분 (게임이 읽는 경로 = 최적화본. 서버는 /CardImageWeb/<파일> 로 제공)
WEB_MAX = 1200                                   # 최적화본의 긴 변(세로 카드는 세로) 최대 px — 원본이 더 작으면 그대로 (확대 금지)
WEB_QUALITY = 85                                 # WebP quality
WEB_METHOD = 6                                   # WebP 인코더 노력(0~6). 6 = 느리지만 같은 화질에서 가장 작은 파일
IMG_EXT = (".jpg", ".png", ".webp")              # 허용 확장자 (.jpeg 는 .jpg 로 통일)
FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,118}\.(jpg|jpeg|png|webp)$", re.I)
MIN_W = 500                                      # 이보다 폭이 좁으면 '저해상도' 경고 (카드 한 장 원본은 보통 600~1000px)


def img_dir():
    p = os.environ.get("CARD_IMAGE_DIR")
    return Path(p) if p else ROOT / IMG_DIR_NAME


def img_dir_for(data_path):
    """data/cards.json(또는 xlsx) 경로 → 그 프로젝트의 CardImage 폴더 (data 폴더의 형제). 환경변수 CARD_IMAGE_DIR 가 있으면 그것을 우선."""
    p = os.environ.get("CARD_IMAGE_DIR")
    return Path(p) if p else Path(data_path).resolve().parent.parent / IMG_DIR_NAME


def web_dir():
    p = os.environ.get("CARD_IMAGE_WEB_DIR")
    return Path(p) if p else ROOT / WEB_DIR_NAME


def web_dir_for(data_path):
    """data/cards.json(또는 xlsx) 경로 → 그 프로젝트의 CardImageWeb 폴더 (CardImage 와 같은 위치의 형제). CARD_IMAGE_WEB_DIR 가 있으면 우선."""
    p = os.environ.get("CARD_IMAGE_WEB_DIR")
    return Path(p) if p else Path(data_path).resolve().parent.parent / WEB_DIR_NAME


def web_name(file):
    """원본 파일명(id_0001.jpg) → 최적화본 파일명(id_0001.webp). 규칙은 이름(확장자만 .webp)뿐이라 Excel 에 따로 적을 필요가 없다."""
    return Path(file).stem + ".webp" if file else ""


def img_path(file):
    """image_file(원본 파일명) → cards.json 의 img 값 (게임이 읽는 상대 경로 = 최적화본). 빈 값이면 ''"""
    return f"{IMG_URL_PREFIX}/{web_name(file)}" if file else ""


def check_name(name):
    """image_file 값 형식 검사. 문제가 있으면 사유(str), 정상이면 None. 경로(/, \\, ..)·URL·data URL·이상한 확장자는 모두 거부한다."""
    if not isinstance(name, str) or name.strip() == "": return "비어 있습니다"
    if name != name.strip(): return "앞뒤에 공백이 있습니다"
    if "/" in name or "\\" in name or ".." in name or ":" in name:
        return "폴더 경로/URL 이 아니라 파일명만 적어야 합니다 (예: id_1068.jpg)"
    if not FILE_RE.match(name):
        return "파일명 형식이 올바르지 않습니다 (영문/숫자/_/-/. 만, 확장자 .jpg .png .webp)"
    return None


def normalize_ext(suffix):
    s = suffix.lower()
    return ".jpg" if s == ".jpeg" else s


def read_size(path):
    """(너비, 높이) — 읽을 수 없으면 None. JPEG/PNG/WebP 헤더를 직접 읽는다(Pillow 불필요)."""
    try:
        with open(path, "rb") as f:
            b = f.read(65536)
            if b[:8] == b"\x89PNG\r\n\x1a\n": return struct.unpack(">II", b[16:24])
            if b[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    m = f.read(1)
                    while m and m != b"\xff": m = f.read(1)
                    while m == b"\xff": m = f.read(1)
                    if not m: return None
                    t = m[0]
                    if t in (0xD8, 0x01) or 0xD0 <= t <= 0xD7: continue
                    ln = f.read(2)
                    if len(ln) < 2: return None
                    n = struct.unpack(">H", ln)[0]
                    if t in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                        d = f.read(5); h, w = struct.unpack(">HH", d[1:5]); return (w, h)
                    f.seek(n - 2, 1)
            if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
                k = b[12:16]
                if k == b"VP8X": return (1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little"))
                if k == b"VP8 ": w, h = struct.unpack("<HH", b[26:30]); return (w & 0x3FFF, h & 0x3FFF)
                if k == b"VP8L": v = struct.unpack("<I", b[21:25])[0]; return ((v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1)
    except Exception:
        return None
    return None


def info(path):
    """→ dict(w,h,bytes) 또는 None(파일 없음)"""
    p = Path(path)
    if not p.is_file(): return None
    sz = read_size(p)
    return {"w": sz[0] if sz else 0, "h": sz[1] if sz else 0, "bytes": p.stat().st_size}


def info_text(path):
    i = info(path)
    if not i: return "(파일 없음)"
    return (f"{i['w']}x{i['h']} " if i["w"] else "") + f"{max(1, i['bytes'] // 1024)}KB"


# ───────── 웹용 최적화본 생성 (v1.16.0) ─────────
MANIFEST = ".manifest.json"


def convert_one(src, dst, max_side=WEB_MAX, quality=WEB_QUALITY, method=WEB_METHOD):
    """src(원본, 읽기만 함) → dst(WebP). 긴 변이 max_side 를 넘을 때만 비율 유지로 축소(확대 금지). dst 는 임시 파일에 쓴 뒤 교체한다. 반환: dict(w,h,bytes,sw,sh,resized)"""
    from PIL import Image
    src, dst = Path(src), Path(dst)
    if src.resolve() == dst.resolve() or src.parent.resolve() == dst.parent.resolve():
        raise ValueError("원본 폴더와 최적화 폴더가 같습니다 — 원본을 덮어쓸 수 있어 중단합니다")
    with Image.open(src) as im:
        im.load(); sw, sh = im.size
        has_a = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_a else "RGB")
        long = max(sw, sh); resized = long > max_side
        if resized:
            k = max_side / long; im = im.resize((max(1, round(sw * k)), max(1, round(sh * k))), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(dst.name + ".tmp")
        im.save(tmp, "WEBP", quality=quality, method=method)     # ICC/EXIF 는 넣지 않는다(파일 크기)
        os.replace(tmp, dst)
        return {"w": im.size[0], "h": im.size[1], "bytes": dst.stat().st_size, "sw": sw, "sh": sh, "resized": resized}


def load_manifest(web):
    try:
        import json; return json.loads((Path(web) / MANIFEST).read_text("utf-8"))
    except Exception:
        return {"params": {}, "files": {}}


def save_manifest(web, man):
    import json
    Path(web).mkdir(parents=True, exist_ok=True)
    tmp = Path(web) / (MANIFEST + ".tmp"); tmp.write_text(json.dumps(man, ensure_ascii=False, indent=1, sort_keys=True), "utf-8"); os.replace(tmp, Path(web) / MANIFEST)


def needs_web(src, web, man, max_side, quality):
    """최적화본을 (다시) 만들어야 하는가? → 사유(str) 또는 None.
    없음 / 원본이 최적화본보다 새로움(수정 시각) / 원본 크기가 기록과 다름 / 설정(최대 크기·quality)이 바뀜."""
    src = Path(src); dst = Path(web) / web_name(src.name)
    if not dst.is_file(): return "없음"
    rec = (man.get("files") or {}).get(dst.name)
    if man.get("params") != {"max": max_side, "quality": quality}: return "설정 변경"
    if rec is None: return "기록 없음"
    if rec.get("src") != src.name or rec.get("src_size") != src.stat().st_size: return "원본 변경(크기)"
    if src.stat().st_mtime > dst.stat().st_mtime + 2: return "원본이 더 최신"
    return None


def sync_web(src_dir, web_dir_, only=None, force=False, max_side=WEB_MAX, quality=WEB_QUALITY, workers=4, dry=False, log=print):
    """CardImage → CardImageWeb 동기화. 새/바뀐 원본만 다시 만든다. 반환: dict(made, skipped, failed, rows)."""
    from concurrent.futures import ThreadPoolExecutor
    src_dir, web_dir_ = Path(src_dir), Path(web_dir_)
    files = sorted(p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT) if src_dir.is_dir() else []
    if only: files = [p for p in files if p.stem in only or p.name in only]
    man = load_manifest(web_dir_); params = {"max": max_side, "quality": quality}
    todo, skipped = [], 0
    for p in files:
        why = "강제" if force else needs_web(p, web_dir_, man, max_side, quality)
        if why: todo.append((p, why))
        else: skipped += 1
    if dry: return {"made": 0, "skipped": skipped, "failed": [], "todo": [(p.name, w) for p, w in todo], "rows": {}}
    rows, failed = {}, []
    def work(item):
        p, why = item
        try: return p, convert_one(p, web_dir_ / web_name(p.name), max_side, quality), None
        except Exception as e: return p, None, e
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for p, r, e in ex.map(work, todo):
            if e is not None: failed.append((p.name, str(e))); log(f"  실패: {p.name} — {e}"); continue
            rows[p.name] = r
            man.setdefault("files", {})[web_name(p.name)] = {"src": p.name, "src_size": p.stat().st_size, "w": r["w"], "h": r["h"], "bytes": r["bytes"]}
    if todo:
        # 설정이 바뀌어 다시 만든 것만 기록을 새 설정으로 바꾼다(일부만 실패했으면 이전 설정 기록을 유지해 다음에 다시 시도)
        if not failed: man["params"] = params
        elif not man.get("params"): man["params"] = params
        save_manifest(web_dir_, man)
    return {"made": len(rows), "skipped": skipped, "failed": failed, "todo": [(p.name, w) for p, w in todo], "rows": rows}


# ───────── 새 이미지 설치 (신탄 추가용) ─────────
PENDING = {}          # card id → 원본 이미지 경로 (저장 직전에 commit_images 가 복사)


def stage_image(cid, src):
    """원본 이미지를 CardImage/<id>.<ext> 로 쓰기로 예약하고 (image_file, img 경로) 를 돌려준다. 파일은 commit_images 에서 복사."""
    ext = normalize_ext(Path(src).suffix)
    if ext not in IMG_EXT: raise ValueError(f"지원하지 않는 이미지 형식입니다: {Path(src).name}")
    name = f"{cid}{ext}"
    PENDING[cid] = Path(src)
    return name, img_path(name)


def commit_images(dest_dir, ids=None):
    """예약된 이미지를 dest_dir 로 복사한다(재압축 없이 원본 바이트 그대로). 반환: 복사한 파일명 목록. 하나라도 실패하면 예외."""
    dest = Path(dest_dir); dest.mkdir(parents=True, exist_ok=True); done = []
    for cid, src in list(PENDING.items()):
        if ids is not None and cid not in ids: continue
        name = f"{cid}{normalize_ext(Path(src).suffix)}"; tgt = dest / name
        if not Path(src).is_file(): raise FileNotFoundError(f"이미지 원본을 찾을 수 없습니다: {src}")
        if Path(src).resolve() != tgt.resolve():
            tmp = tgt.with_name(tgt.name + ".tmp"); shutil.copyfile(src, tmp); os.replace(tmp, tgt)
        done.append(name); del PENDING[cid]
    if done:   # v1.16.0: 새 원본이 들어오면 게임용 최적화본(WebP)도 바로 만든다 (Pillow 가 없으면 건너뜀 — tools/make_web_images.py 로 나중에 만들 수 있다)
        try:
            wd = Path(os.environ["CARD_IMAGE_WEB_DIR"]) if os.environ.get("CARD_IMAGE_WEB_DIR") else dest.parent / WEB_DIR_NAME
            sync_web(dest, wd, only=set(done), log=lambda *a: None)
        except Exception as e:
            print(f"(참고) 웹용 최적화 이미지를 만들지 못했습니다: {e} — python tools/make_web_images.py 로 만들 수 있습니다")
    return done
