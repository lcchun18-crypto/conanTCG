#!/usr/bin/env python3
"""base64 이미지 방식 → 파일 방식 1회 마이그레이션 (v1.14.0).

    python tools/migrate_images.py --src E:\\conanTCG\\conan-sim\\CardImage              # 점검만 (아무것도 바꾸지 않음)
    python tools/migrate_images.py --src <원본 폴더> --apply                          # 실제 적용

하는 일
  1. 원본 폴더의 id_XXXX.jpg 를 CardImage/ 로 그대로 복사(이미 같은 폴더면 복사 없음, 재압축 없음).
  2. 파일명이 ID 와 다른 이미지는 '옛 썸네일과의 내용 비교'로 유일하게 확실한 것만 CardImage/<카드ID>.jpg 로 정리한다 (애매하면 건드리지 않고 보고).
  3. 원본이 전혀 없는 카드만 옛 base64 를 파일로 풀어 CardImage/<ID>.jpg 로 저장한다(저해상도 fallback, 보고서에 표시).
  4. data/cards.xlsx 의 Cards 시트에서 file 열 이름을 image_file 로 바꾸고 값(id_XXXX.jpg)을 채운다 — 다른 셀/서식/검증은 건드리지 않는다.
  5. cards.xlsx → cards.json 을 다시 만든다 (img 는 "CardImage/<파일>" 경로, base64 제거). AP/LP/color/lv/trait/series/fx/extra/ab 는 그대로.
  6. data/image_migration_report.csv 를 쓴다.
"""
import argparse, base64, csv, datetime, json, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import card_images as CI  # noqa: E402
import audit_images as AU  # noqa: E402
import cards_xlsx as X  # noqa: E402

ROOT = CI.ROOT


def plan(db_cards, src, dest):
    d = Path(src); files = {p.name.lower(): p.name for p in d.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")}
    orphan = []
    P, used = {}, set()
    for cid in sorted(db_cards):
        hit = next((files[(cid + e).lower()] for e in (".jpg", ".jpeg", ".png", ".webp") if (cid + e).lower() in files), None)
        if hit: P[cid] = ("copy", hit); used.add(hit)
    orphan = [f for f in files.values() if f not in used]
    ok, amb = AU.similar_orphans({c: db_cards[c] for c in db_cards if c not in P}, orphan, d)
    for f, (cid, sim) in ok.items():
        if cid not in P: P[cid] = ("rename", f, sim); used.add(f)
    amb = [f for f in orphan if f not in used]
    return P, amb


def patch_cards_xlsx(xlsx, names, infos):
    """Cards 시트의 file 열 → image_file(값=이미지 파일명), img_info 열(해상도/용량) 만 고친다. 나머지 XML 은 한 글자도 바꾸지 않는다."""
    import re, zipfile, tempfile, os
    from xml.sax.saxutils import escape
    xlsx = Path(xlsx)
    with zipfile.ZipFile(xlsx) as z:
        items = [(zi, z.read(zi.filename)) for zi in z.infolist()]
    D = {zi.filename: data for zi, data in items}
    wbx = D["xl/workbook.xml"].decode("utf-8"); rel = D["xl/_rels/workbook.xml.rels"].decode("utf-8")
    m = re.search(r'<sheet [^>]*name="Cards"[^>]*r:id="(rId\d+)"', wbx) or re.search(r'<sheet [^>]*r:id="(rId\d+)"[^>]*name="Cards"', wbx)
    tgt = re.search(r'<Relationship [^>]*Id="%s"[^>]*Target="([^"]+)"' % m.group(1), rel) or re.search(r'<Relationship [^>]*Target="([^"]+)"[^>]*Id="%s"' % m.group(1), rel)
    sheet_path = "xl/" + tgt.group(1).lstrip("/").replace("xl/", "", 1)
    sx = D[sheet_path].decode("utf-8")
    ss = []
    for si in re.findall(r"<si>(.*?)</si>", D["xl/sharedStrings.xml"].decode("utf-8"), re.S): ss.append("".join(re.findall(r"<t(?:\s[^>]*)?>(.*?)</t>", si, re.S)))
    import html
    def sval(cell):
        t = re.search(r' t="(\w+)"', cell.split(">")[0]); v = re.search(r"<v>(.*?)</v>", cell, re.S)
        if t and t.group(1) == "s" and v: return html.unescape(ss[int(v.group(1))])
        if t and t.group(1) == "inlineStr": return html.unescape("".join(re.findall(r"<t(?:\s[^>]*)?>(.*?)</t>", cell, re.S)))
        return html.unescape(v.group(1)) if v else ""
    row1 = re.search(r'<row r="1".*?</row>', sx, re.S).group(0)
    hdr = {sval(c.group(0)).strip(): c.group(1) for c in re.finditer(r'<c r="([A-Z]+)1"[^>]*?(?:/>|>.*?</c>)', row1, re.S)}
    fcol = hdr.get("image_file") or hdr.get("file"); icol, infocol = hdr["id"], hdr.get("img_info")
    if not fcol: raise ValueError("Cards 시트에 file / image_file 열이 없습니다")
    def put(cell_re_col, r, text, sx_):
        pat = re.compile(r'<c r="%s%d"((?:\s[^>]*?)?)(?:/>|>.*?</c>)' % (cell_re_col, r), re.S)
        m_ = pat.search(sx_)
        if not m_: raise ValueError(f"{cell_re_col}{r} 셀을 찾을 수 없습니다")
        st = re.search(r' s="\d+"', m_.group(1)); st = st.group(0) if st else ""
        new = f'<c r="{cell_re_col}{r}"{st}/>' if text in (None, "") else f'<c r="{cell_re_col}{r}"{st} t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'
        return sx_[:m_.start()] + new + sx_[m_.end():]
    n = 0
    for rm in list(re.finditer(r'<row r="(\d+)"[^>]*>.*?</row>', sx, re.S)):
        pass
    # 행을 뒤에서부터 처리해 위치가 밀리지 않게 한다
    rows = [(int(m_.group(1)), m_.start(), m_.end()) for m_ in re.finditer(r'<row r="(\d+)"[^>]*>.*?</row>', sx, re.S)]
    for r, st_, en_ in reversed(rows):
        seg = sx[st_:en_]
        if r == 1: seg = put(fcol, 1, "image_file", seg)
        else:
            idc = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (icol, r), seg, re.S)
            if not idc: continue
            cid = sval(idc.group(0)).strip()
            if cid in names: seg = put(fcol, r, names[cid], seg); n += 1
            if infocol and cid in infos: seg = put(infocol, r, infos[cid], seg)
        sx = sx[:st_] + seg + sx[en_:]
    D[sheet_path] = sx.encode("utf-8")
    OLD_G = "이미지(base64)는 Excel 에 없습니다. cards.json 에 그대로 보존되며 ID 로 자동 연결됩니다."   # Guide 시트 안내 문구도 새 방식으로
    sst = D["xl/sharedStrings.xml"].decode("utf-8")
    if OLD_G in sst: D["xl/sharedStrings.xml"] = sst.replace(OLD_G, X.GUIDE_IMG_TEXT).encode("utf-8")
    # 헤더 메모(설명) 갱신
    cm = next((k for k in D if k.startswith("xl/comments") and re.search(r'<comment ref="%s1"' % fcol, D[k].decode("utf-8"))), None)
    if cm:
        c = D[cm].decode("utf-8"); mm = re.search(r'(<comment ref="%s1".*?<t(?:\s[^>]*)?>)(.*?)(</t>)' % fcol, c, re.S)
        if mm: c = c[:mm.start(2)] + escape(X.DESC["image_file"][0]) + "\n[엔진 동작에 영향]" + c[mm.end(2):]; D[cm] = c.encode("utf-8")
    tmp = xlsx.with_name(xlsx.name + ".tmp")
    with zipfile.ZipFile(tmp, "w") as zo:
        for zi, _ in items:
            ni = zipfile.ZipInfo(zi.filename, zi.date_time); ni.compress_type = zi.compress_type; ni.external_attr = zi.external_attr
            zo.writestr(ni, D[zi.filename])
    os.replace(tmp, xlsx); return n



def main():
    ap = argparse.ArgumentParser(description="base64 → 이미지 파일 방식 마이그레이션")
    ap.add_argument("--src", required=True, help="원본 이미지 폴더 (E:\\conanTCG\\conan-sim\\CardImage)")
    ap.add_argument("--apply", action="store_true"); ap.add_argument("--db", default=str(ROOT / "data" / "cards.json")); ap.add_argument("--xlsx", default=str(ROOT / "data" / "cards.xlsx"))
    ap.add_argument("--no-backup", action="store_true")
    a = ap.parse_args()
    dbp, xp, src = Path(a.db), Path(a.xlsx), Path(a.src); dest = CI.img_dir_for(dbp)
    db = json.loads(dbp.read_text("utf-8")); cards = db["cards"]
    P, amb = plan(cards, src, dest)
    fallback = [c for c in cards if c not in P and (cards[c].get("img") or "").startswith("data:image")]
    none = [c for c in cards if c not in P and c not in fallback]
    print(f"카드 {len(cards)}장: 원본 파일로 연결 {sum(1 for v in P.values() if v[0] == 'copy')} / 내용으로 확정해 이름 정리 {sum(1 for v in P.values() if v[0] == 'rename')}"
          f" / base64 fallback {len(fallback)} / 이미지 없음 {len(none)} / 애매한 파일 {len(amb)}")
    for cid, v in P.items():
        if v[0] == "rename": print(f"  이름 정리: {v[1]} → {cid}{Path(v[1]).suffix.lower()}  (옛 썸네일과 유사도 {v[2]:.4f}, 유일한 후보)")
    for f in amb: print(f"  애매한 파일(자동 매칭 안 함): {f}")
    if not a.apply: print("\n(점검만 했습니다. 적용하려면 --apply)"); return 0
    # 1~3. 파일 정리
    dest.mkdir(parents=True, exist_ok=True); rep = []
    for cid in sorted(cards):
        old = cards[cid].get("file") or ""
        if cid in P:
            kind, fn = P[cid][0], P[cid][1]; ext = CI.normalize_ext(Path(fn).suffix); name = cid + ext; tgt = dest / name
            if (src / fn).resolve() != tgt.resolve(): shutil.copyfile(src / fn, tgt)
            i = CI.info(tgt); rep.append([cid, old, name, "원본 파일 연결" if kind == "copy" else f"이름 정리({fn} → {name})", f"{i['w']}x{i['h']}", i["bytes"]])
        elif cid in fallback:
            tgt = dest / (cid + ".jpg"); tgt.write_bytes(base64.b64decode(cards[cid]["img"].split(",", 1)[1])); i = CI.info(tgt)
            rep.append([cid, old, cid + ".jpg", "원본 없음 → base64 fallback(저해상도)", f"{i['w']}x{i['h']}", i["bytes"]])
        else: rep.append([cid, old, "", "이미지 없음", "", ""])
    names = {r[0]: r[2] for r in rep}
    # 4. xlsx 의 file → image_file (이 열만 수정 — XML 을 직접 고쳐서 Excel 에서 만든 드롭다운/서식/메모를 그대로 보존한다)
    if not a.no_backup:
        bk = xp.parent / "backup"; bk.mkdir(exist_ok=True); shutil.copy2(xp, bk / f"cards-{datetime.datetime.now():%Y%m%d-%H%M%S}.pre-images.xlsx")
    infos = {cid: (CI.info_text(dest / names[cid]) if names.get(cid) else "(이미지 없음)") for cid in cards}
    try: n = patch_cards_xlsx(xp, names, infos)
    except Exception as e: print(f"cards.xlsx 를 수정하지 못했습니다(파일은 바뀌지 않았습니다): {e}"); return 2
    print(f"cards.xlsx: image_file 열 {n}칸 갱신 (다른 셀·서식·드롭다운은 그대로)")
    # 5. JSON 재생성 (xlsx 기준)
    import build_cards_from_excel as B
    code, _ = B.build(xp, dbp, dbp, use_node=True)
    if code != 0: print("cards.json 재생성 실패 — 위 ERROR 를 확인하세요 (xlsx 는 이미 image_file 로 바뀌었습니다)"); return code
    out = dbp.with_name("image_migration_report.csv")
    with open(out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh); w.writerow(["ID", "이전 file 값", "image_file", "처리", "해상도", "바이트"]); w.writerows(rep)
    print(f"완료. 보고서: {out}"); return 0


if __name__ == "__main__":
    sys.exit(main())
