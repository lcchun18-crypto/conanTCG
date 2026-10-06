#!/usr/bin/env python3
"""카드 이미지 오른쪽 아래 상품 코드(B11001 / D01003 …)를 읽어 카드별 시리즈(P11 / D01 …)를 판정한다.

    python tools/series_scan.py <이미지폴더> [--out data/series_scan.json] [--apply]

- 이미지 파일 이름은 카드 ID (id_0001.jpg, id_P001.jpg) 이거나 ID_1170_이름_SR.jpg 형식.
- 코드 → 시리즈: B11xxx → P11 (박스), D01xxx → D01 (스타터/덱), 그 밖의 접두는 읽은 그대로 쓰지 않고 '불확실' 목록으로.
- 이미지마다 여러 영역/전처리로 OCR 하고 다수결(3표 이상 & 80% 이상 일치, 또는 2표 이상 전부 일치)일 때만 확정한다. 코드 앞 3글자(B11 / D01)만 쓰므로 카드 번호가 일부 깨져도 된다. 애매하면 추측하지 않고 uncertain 에 남긴다.
- --apply: data/cards.json 의 series 필드를 채운다(이미 값이 있는 카드는 건드리지 않음). 이후 tools/export_cards_to_excel.py 로 Excel 반영.
필요: tesseract, pytesseract, Pillow
"""
import argparse, json, re, sys, collections
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageOps, ImageFilter
import pytesseract

CODE = re.compile(r'(?<![A-Z0-9])([BD])\s?([0O][1-9]|1[01])(?!\d{3}\d)')   # B01~B11 / D01~D11 (OCR 의 0↔O 혼동 허용). 뒤 숫자(카드 번호)는 안 읽어도 됨
PROMO = re.compile(r'P\s?R\s?\d{3}')
# 코드 위치(이미지 크기 대비 비율): 세로 카드는 오른쪽 아래에 세로로, 가로 카드(사건)는 오른쪽 아래에 가로로 인쇄돼 있다
BOX_PORTRAIT = [(.962, .80, .992, .985), (.965, .82, .995, .98), (.960, .88, .990, .998), (.955, .905, .993, 1.0), (.958, .915, .988, .996), (.945, .91, .995, .995)]
BOX_LAND = [(.745, .925, .835, .995), (.74, .92, .85, 1.0), (.73, .915, .86, 1.0)]


def card_id(name):
    s = Path(name).stem
    m = re.match(r'(?i)^id_(\w+?)(?:_|$)', s)
    return 'id_' + m.group(1) if m else s


def norm(prefix, num):
    """코드 접두 → 검색용 시리즈. B(박스)→P, D(덱)→D."""
    return ('P' if prefix == 'B' else 'D') + num.replace('O', '0')


def votes_for(path, stop_at=4):
    """→ [(코드접두+번호 'B11', 원문), ...]. stop_at 표가 일치하면 일찍 멈춘다."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    land = w > h
    out, promo = [], 0
    cnt = collections.Counter()
    for box in (BOX_LAND if land else BOX_PORTRAIT):
        c = im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))
        if not land:
            c = c.rotate(-90, expand=True)
        for sc in (3, 2):
            g = ImageOps.autocontrast(c.convert('L'))
            g = g.resize((g.width * sc, g.height * sc), Image.LANCZOS)
            for sh in (False, True):
                gg = g.filter(ImageFilter.SHARPEN) if sh else g
                t = pytesseract.image_to_string(gg, config='--psm 7').strip()
                m = CODE.search(t)
                if m:
                    code = m.group(1) + m.group(2).replace('O', '0')
                    out.append((code, t)); cnt[code] += 1
                elif PROMO.search(t.replace('O', '0')):
                    promo += 1; out.append(('PR', t))
        if cnt and cnt.most_common(1)[0][1] >= stop_at:
            break
    return out


def prefix_votes(path):
    """코드 첫 글자 B(박스) / D(덱) 구분 전용 OCR (B↔D 는 작은 글씨에서 자주 헷갈린다). 허용 문자를 BD+숫자로 제한하고 배율/이진화를 바꿔 여러 번 읽는다."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    land = w > h
    res = collections.Counter()
    for box in (BOX_LAND if land else BOX_PORTRAIT)[:3]:
        c = im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))
        if not land:
            c = c.rotate(-90, expand=True)
        if res and max(res.values()) >= 6 and len(res) == 1:      # 6표 전부 한쪽이면 충분
            break
        for sc in (4, 6):
            g = ImageOps.autocontrast(c.convert('L'))
            g = g.resize((g.width * sc, g.height * sc), Image.BICUBIC)
            for mode in ('n', 'i'):
                gg = g.point(lambda p: 255 if p > 140 else 0) if mode == 'b' else (ImageOps.invert(g) if mode == 'i' else g)
                t = pytesseract.image_to_string(gg, config='--psm 7 -c tessedit_char_whitelist=BD0123456789P').strip().replace(' ', '')
                if t[:1] in ('B', 'D') and len(t) >= 5:
                    res[t[:1]] += 1
    return res


def scan_one(path):
    try:
        v = votes_for(path)
    except Exception as e:  # noqa
        return str(path), None, [], str(e)
    cnt = collections.Counter(x[0] for x in v)
    pre = prefix_votes(path) if cnt and 'PR' not in cnt else collections.Counter()
    return str(path), {'codes': dict(cnt), 'prefix': dict(pre)}, [x[1] for x in v[:3]], ''


def scan_job(job):
    path, codes = job
    if codes is None:
        return scan_one(path)
    try:
        pre = prefix_votes(path)
    except Exception as e:  # noqa
        return str(path), None, [], str(e)
    return str(path), {'codes': codes, 'prefix': dict(pre)}, [], ''


def decide(info):
    cnt = info.get('codes', {}) if 'codes' in info else info
    pre = info.get('prefix', {}) if 'codes' in info else {}
    if not cnt:
        return None, '코드를 읽지 못함'
    (top, n), = collections.Counter(cnt).most_common(1)
    tot = sum(cnt.values())
    if top == 'PR':
        return None, '프로모(PR…) 코드 — 박스/덱 시리즈가 아님'
    if (n >= 3 and n / tot >= 0.8) or (n >= 2 and n == tot):
        if 'codes' in info:       # 시리즈 번호는 다수결 코드에서, B/D 는 전용 판독 + 본 판독이 모두 일치할 때만 인정
            ptot = sum(pre.values()); pbest = max(pre, key=pre.get) if pre else None
            if not pre or pbest != top[0] or pre[pbest] / ptot < 0.8 or pre[pbest] < 3:
                return None, f'B/D 구분 불확실 (본판독 {top}, 전용판독 {dict(pre)})'
        return norm(top[0], top[1:]), ''
    return None, f'표가 갈림/부족 {dict(cnt)}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--out', default='data/series_scan.json')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--prior', default='', help='이전 스캔 결과(JSON): 이미 읽은 코드 표는 재사용하고 B/D 전용 판독만 추가')
    ap.add_argument('--db', default='data/cards.json')
    a = ap.parse_args()
    files = sorted(p for p in Path(a.folder).iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp'))
    res, unc = {}, {}
    fmap = {}
    try:      # DB 의 file(원본 파일명) 로 카드 ID 를 우선 찾는다 (파일명 번호와 카드 ID 가 다른 경우 대비)
        fmap = {v.get('file'): k for k, v in json.load(open(a.db, encoding='utf-8'))['cards'].items() if v.get('file')}
    except Exception:
        pass
    prior = {}
    if a.prior:
        pj = json.load(open(a.prior, encoding='utf-8'))
        prior = {k: (v['votes'].get('codes', v['votes']) if 'codes' in v['votes'] else v['votes']) for k, v in pj['series'].items()}
    with ProcessPoolExecutor() as ex:
        jobs = [(f, prior.get(fmap.get(f.name) or card_id(f))) for f in files]
        for path, cnt, raw, err in ex.map(scan_job, jobs, chunksize=4):
            cid = fmap.get(Path(path).name) or card_id(path)
            s, why = decide(cnt or {})
            if s:
                res[cid] = {'series': s, 'votes': cnt, 'raw': raw}
            else:
                unc[cid] = {'why': err or why, 'votes': cnt or {}, 'raw': raw}
    json.dump({'series': res, 'uncertain': unc}, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f'확정 {len(res)}장 / 불확실 {len(unc)}장 → {a.out}')
    print(collections.Counter(v['series'] for v in res.values()).most_common())
    if a.apply:
        db = json.load(open(a.db, encoding='utf-8'))
        n = 0
        for cid, v in res.items():
            c = db['cards'].get(cid)
            if c is not None and not c.get('series'):
                c['series'] = v['series']; n += 1
        json.dump(db, open(a.db, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'{n}장에 series 기록')


if __name__ == '__main__':
    main()
