#!/usr/bin/env python3
"""카드 이미지 파일 관리 공용 라이브러리 (v1.14.0).

원칙 (역할 분리)
  · 실제 이미지 파일  = CardImage/ 폴더 (파일명은 카드 ID: id_0001.jpg)  ← 원본 그대로, 재압축하지 않는다
  · data/cards.xlsx   = Cards 시트의 image_file 열에서 이미지 파일명을 관리 (사람이 고치는 곳)
  · data/cards.json   = file(파일명) + img(게임이 읽는 상대 경로: "CardImage/id_0001.jpg") 만 저장. base64 는 넣지 않는다
  · 서버              = /CardImage/<파일명> 으로 정적 제공 (server.js)
Pillow 가 없어도(GitHub Actions 등) 파일 존재/확장자/해상도(JPEG·PNG·WebP 헤더) 검사는 동작한다.
"""
import os, re, shutil, struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
IMG_DIR_NAME = "CardImage"                       # 프로젝트 루트 기준 이미지 폴더 (환경변수 CARD_IMAGE_DIR 로 폴더 위치만 바꿀 수 있다)
IMG_URL_PREFIX = IMG_DIR_NAME                    # cards.json 의 img 값 앞부분 (상대 경로, 서버는 /CardImage/<파일> 로 제공)
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


def img_path(file):
    """image_file → cards.json 의 img 값 (상대 경로). 빈 값이면 ''"""
    return f"{IMG_URL_PREFIX}/{file}" if file else ""


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
    return done
