"""카드 색상 판별 (픽셀 기반, 해상도 무관).
우선순위(요청 사양):
  1. 좌상단 FILE 코스트 원형 배지의 *내부* 배경색  — 카드 크기에 대한 상대 좌표, 여러 지점 샘플링(숫자/테두리/광택 제외, 투표)
  2. 카드 프레임의 고정 색상 영역(상단 헤더 띠)
  3. 기타 보조 표식(카드 바깥 테두리 — 금박 장식에 약하므로 마지막 보조)
  4. OCR/API 모델이 돌려준 색은 호출하는 쪽(import_cards.check_color)에서 마지막으로만 사용
일러스트/캐릭터 옷/배경색은 쓰지 않는다(샘플링 영역이 배지 내부·헤더 띠뿐).
지원 색상은 게임의 6색(red/blue/green/yellow/white/black). 두 색 이상인 사건(원이 부채꼴로 나뉨)은 'a/b' 로 반환.
"""
import colorsys, math, collections

# 배지 원의 상대 좌표: (cx/W, cy/H, R/W).  세로 카드(캐릭터·이벤트·세로 사건) / 가로 사건
GEOM = {"P": (0.082, 0.059, 0.045), "L": (0.060, 0.088, 0.034)}
BAND = {"P": (0.20, 0.95, 0.018, 0.040), "L": None}   # 헤더 띠(프레임 고정 영역): x0,x1 (W 비율), y0,y1 (H 비율). 가로 사건의 띠는 항상 검정이라 사용 안 함
COLORS_OK = ("red", "blue", "green", "yellow", "white", "black")
ANGLES = 24
RADII = (0.38, 0.52, 0.66, 0.80)           # 원 반지름 대비 샘플 반경 (바깥 흰 테두리 r≈1.0 과 숫자 중심부 모두 피함)
SAT_MIN, VAL_MIN = 0.40, 0.30
PALE_SAT, PALE_VAL = 0.20, 0.55   # 밝고 연한 색(파스텔 원)도 색으로 본다. 흰 원은 채도 0.1 미만


def hue_color(h):
    """색상각(0~360) → 색 이름. 금색/주황 계열(노랑 카드의 원)은 yellow."""
    if h < 22 or h >= 340: return "red"
    if h < 70: return "yellow"
    if h < 170: return "green"
    if h < 255: return "blue"
    return "purple"      # 6색 체계 밖 → 신뢰하지 않음


def layout(W, H): return "L" if W > H else "P"


def _px(im, x, y):
    W, H = im.size; x = min(max(int(round(x)), 0), W - 1); y = min(max(int(round(y)), 0), H - 1); return im.getpixel((x, y))


def _classify(rgb):
    h, s, v = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    return ("c", hue_color(h * 360)) if (s >= SAT_MIN and v >= VAL_MIN) or (s >= PALE_SAT and v >= PALE_VAL) else ("a", v)


def _decide(samples, min_valid, multi=False):
    """샘플 [(kind,val)] → (colors, confidence, n_valid). 채도 있는 픽셀이 절반 이상이면 그 색상 투표(흰 숫자·광택 무시),
    아니면 무채색(흰/검) 판정: 밝기 중앙값. multi=True 이면 두 색 이상(부채꼴)도 허용."""
    ch = [v for k, v in samples if k == "c" and v != "purple"]; ac = [v for k, v in samples if k == "a"]; n = len(samples)
    if multi:   # 사건 카드: 원이 색별 부채꼴로 나뉜다(검정/흰색 조각 포함). 숫자가 없으므로 무채색 픽셀도 한 조각으로 센다.
        pie = [v for k, v in samples if k == "c" and v != "purple"] + ["black" for k, v in samples if k == "a" and v <= 0.25]   # 광택(흰 하이라이트)은 조각으로 세지 않는다
        if len(pie) >= max(min_valid, n * 0.5) and sum(1 for k, v in samples if k == "c") >= n * 0.25:
            cnt = collections.Counter(pie); tot = len(pie); sel = [c for c, k in cnt.most_common() if k / tot >= 0.28] or [cnt.most_common(1)[0][0]]
            return sel, sum(cnt[c] for c in sel) / tot, tot
    if len(ch) >= max(min_valid, n * 0.40):
        cnt = collections.Counter(ch); tot = sum(cnt.values()); top = cnt.most_common()
        sel = [c for c, k in top if k / tot >= (0.22 if multi else 0.5)] or [top[0][0]]
        return sel, sum(cnt[c] for c in sel) / tot, tot
    if len(ac) >= max(min_valid, n * 0.30):
        wh = sum(1 for v in ac if v >= 0.55) / len(ac); bk = sum(1 for v in ac if v <= 0.40) / len(ac)   # 숫자(반대 밝기)·광택 때문에 100% 가 되지 않으므로 비율로 신뢰도 산출
        if wh >= 0.6 and wh >= bk: return ["white"], wh, len(ac)
        if bk >= 0.6: return ["black"], bk, len(ac)
    return [], 0.0, len(ch) + len(ac)


SEARCH = {"P": ((0.060, 0.106), (0.045, 0.090), (0.040, 0.045, 0.050)), "L": ((0.040, 0.082), (0.060, 0.120), (0.028, 0.034, 0.040))}  # 원이 있을 수 있는 상대 좌표 범위(원본 스캔·썸네일의 미세한 잘림 차이를 흡수)  # (cx 범위/W, cy 범위/H, 후보 반지름/W)
_IN = tuple((r, k) for r in (0.45, 0.65, 0.82) for k in range(16)); _OUT = tuple((r, k) for r in (1.30, 1.50) for k in range(16))


def _ring(im, cx, cy, R, spec, off=0.0):
    return [_px(im, cx + math.cos(2 * math.pi * (k + off * (int(r * 100) % 2)) / 16) * R * r, cy + math.sin(2 * math.pi * (k + off * (int(r * 100) % 2)) / 16) * R * r) for r, k in spec]


def _d(a, b): return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b))) / 441


def locate_badge(im):
    """원 위치를 상대 좌표 탐색창 안에서 찾는다. 원은 사방(24방향 모두)에서 '테두리 고리가 안쪽 원판·바깥과 다르게 보이는' 모양이므로
    방향별 대비의 하위 25% 값을 점수로 쓴다(한쪽에만 경계가 있는 일러스트 윤곽은 낮은 점수). 일러스트의 색 자체는 쓰지 않는다.
    반환 (cx, cy, R, score) — 픽셀 좌표. 원본 스캔이든 잘린 썸네일이든 해상도와 무관하게 같은 코드가 동작한다."""
    W, H = im.size; xr, yr, rs = SEARCH[layout(W, H)]; best = (0, 0, 0, -9.0); N = 24; nx = ny = 14
    cs = [(math.cos(2 * math.pi * k / N), math.sin(2 * math.pi * k / N)) for k in range(N)]
    for ix in range(nx + 1):
        for iy in range(ny + 1):
            cx = (xr[0] + (xr[1] - xr[0]) * ix / nx) * W; cy = (yr[0] + (yr[1] - yr[0]) * iy / ny) * H
            for rr in rs:
                R = rr * W; sc = []
                for c, sn in cs:
                    ring = _px(im, cx + c * R * 0.97, cy + sn * R * 0.97); dsk = _px(im, cx + c * R * 0.62, cy + sn * R * 0.62); out = _px(im, cx + c * R * 1.40, cy + sn * R * 1.40)
                    sc.append((_d(ring, dsk) + _d(ring, out)) / 2)
                sc.sort(); v = sc[N // 4]
                inn = [_px(im, cx + c * R * r, cy + sn * R * r) for r in (0.5, 0.75) for c, sn in cs[::2]]; mi = [sum(p[k] for p in inn) / len(inn) for k in range(3)]
                v -= 0.5 * sum(math.sqrt(sum((p[k] - mi[k]) ** 2 for p in inn) / len(inn)) for k in range(3)) / 3 / 255  # 원판 안쪽은 균일해야 한다
                if v > best[3]: best = (cx, cy, R, v)
    return best


def badge_samples(im, loc=None):
    cx, cy, R, _ = loc or locate_badge(im); out = []
    for r in RADII:
        for i in range(ANGLES):
            a = 2 * math.pi * (i + 0.5 * (RADII.index(r) % 2)) / ANGLES; out.append(_classify(_px(im, cx + math.cos(a) * R * r, cy + math.sin(a) * R * r)))
    return out


def badge_color(im, multi=True):
    """FILE 코스트 원 내부색: 원을 찾은 뒤 반경 0.38~0.80R 의 여러 지점(4겹×24방향)을 투표. 반환: (colors, confidence, n_valid)"""
    return _decide(badge_samples(im), 18, multi=multi)


def band_color(im):
    """프레임 고정 영역(상단 헤더 띠) 색. (colors, confidence, n)"""
    W, H = im.size; b = BAND[layout(W, H)]
    if not b: return [], 0.0, 0
    smp = []
    for i in range(40):
        x = (b[0] + (b[1] - b[0]) * (i + 0.5) / 40) * W
        for yy in (b[2], (b[2] + b[3]) / 2, b[3]): smp.append(_classify(_px(im, x, yy * H)))
    return _decide(smp, 30)


def outer_ring_color(im):
    """카드 바깥 테두리(금박 장식에 약해 최후 보조)."""
    im = im.resize((120, 168)); px = im.load(); W, H = im.size; ring = []
    for x in range(W):
        for y in list(range(2, 6)) + list(range(H - 6, H - 2)): ring.append(_classify(px[x, y]))
    for y in range(H):
        for x in list(range(2, 6)) + list(range(W - 6, W - 2)): ring.append(_classify(px[x, y]))
    return _decide(ring, 60)


def detect(im, kind=""):
    """우선순위 1→2→3 로 판별한다(4순위 모델/API 색은 호출하는 쪽이 마지막에만 사용).
    kind: 'case' 이면 두 색 이상(원이 부채꼴)을 허용, 그 밖(캐릭터·이벤트)은 단일 색만 — 금박 테두리 때문에 'red/yellow' 처럼 섞여 읽히는 것을 막는다.
    반환 dict: color, source('badge'|'band'|'ring'|''), conf, badge/band(+conf), agree, certain
      certain = 배지 판정이 확실(신뢰도 ≥0.90, 유효 샘플 ≥40)하고 흰/검 같은 무채색이 아니며, 프레임 띠와 같은 색이거나 띠가 금박 장식(yellow)/판독불가일 때."""
    multi = kind == "case"; loc = locate_badge(im); bc, bconf, bn = _decide(badge_samples(im, loc), 18, multi=multi)
    if bc and set(bc) <= {"white", "black"} and loc[3] < 0.004: bc, bconf, bn = [], 0.0, 0   # 원 윤곽이 전혀 안 보이면 흰/검 판정을 하지 않는다(빈 면·가림)
    rc, rconf, rn = band_color(im); order = ['red', 'blue', 'green', 'yellow', 'white', 'black']
    out = {"badge": "/".join(bc), "badge_conf": round(bconf, 3), "badge_n": bn, "band": "/".join(rc), "band_conf": round(rconf, 3)}
    W, H = im.size; band_usable = BAND[layout(W, H)] is not None
    out["agree"] = None if not (bc and rc) else set(bc) == set(rc)
    if bc and bconf >= 0.6: out.update(color="/".join(sorted(bc, key=order.index)), source="badge", conf=bconf)
    elif rc and rconf >= 0.6: out.update(color="/".join(rc), source="band", conf=rconf * 0.8)
    else:
        oc, oconf, on = outer_ring_color(im)
        out.update(color="/".join(oc), source="ring" if oc else "", conf=oconf * 0.4)
    chroma = len(bc) == 1 and not set(bc) & {"white", "black"}
    out["certain"] = bool(out["source"] == "badge" and bconf >= 0.90 and bn >= 40 and chroma and (out["agree"] is True or not band_usable or not rc or rc == ["yellow"] or rconf < 0.6))
    return out
