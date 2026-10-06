#!/usr/bin/env python3
"""게임용 웹 최적화 이미지 생성 (v1.16.0) — CardImage(고해상도 원본) → CardImageWeb(WebP).

    python tools/make_web_images.py                 # 새로 추가됐거나 바뀐 원본만 (이미 최신인 것은 건너뜀)
    python tools/make_web_images.py --check         # 아무것도 만들지 않고 '무엇을 만들어야 하는지'만 보고
    python tools/make_web_images.py --force         # 전부 다시 만들기
    python tools/make_web_images.py --quality 88    # 화질 올려서 (설정이 바뀌면 자동으로 전부 다시 만든다)
    python tools/make_web_images.py --only id_0001 id_0002
    python tools/make_web_images.py --prune         # 원본이 없어진 최적화본 삭제

규칙
  · 원본(CardImage)은 읽기만 한다. 수정·삭제·재압축 절대 없음 (원본 폴더와 출력 폴더가 같으면 중단).
  · 긴 변(세로 카드는 세로)이 --max(기본 1200px) 를 넘을 때만 비율 유지로 줄인다. 원본이 더 작으면 그대로 두고 확대하지 않는다.
  · 포맷 WebP, quality 기본 85, 파일명은 원본과 같은 ID (id_0001.jpg → id_0001.webp). cards.xlsx 의 image_file(원본 파일명)에서 자동으로 연결된다.
  · 원본이 더 최신(수정 시각)이거나 크기가 달라졌거나 설정(--max/--quality)이 바뀌면 다시 만든다. 기록: CardImageWeb/.manifest.json
  · 폴더 위치는 환경변수 CARD_IMAGE_DIR / CARD_IMAGE_WEB_DIR 로 바꿀 수 있다 (--src / --dest 도 가능).
필요: Pillow (pip install pillow)
"""
import argparse, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import card_images as CI  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="CardImage → CardImageWeb(WebP) 최적화본 생성")
    ap.add_argument("--src", default=None, help=f"원본 폴더 (기본 {CI.IMG_DIR_NAME})"); ap.add_argument("--dest", default=None, help=f"출력 폴더 (기본 {CI.WEB_DIR_NAME})")
    ap.add_argument("--max", type=int, default=CI.WEB_MAX, help="긴 변 최대 px (기본 1200, 확대 안 함)"); ap.add_argument("--quality", type=int, default=CI.WEB_QUALITY, help="WebP quality (기본 85)")
    ap.add_argument("--force", action="store_true", help="이미 있어도 전부 다시 만들기"); ap.add_argument("--check", action="store_true", help="만들지 않고 필요한 작업만 보고")
    ap.add_argument("--only", nargs="*", help="이 ID/파일명만"); ap.add_argument("--prune", action="store_true", help="원본이 없는 최적화본 삭제")
    ap.add_argument("--workers", type=int, default=4); a = ap.parse_args(argv)
    src = Path(a.src) if a.src else CI.img_dir(); dest = Path(a.dest) if a.dest else CI.web_dir()
    if not src.is_dir(): print(f"원본 폴더가 없습니다: {src}"); return 2
    if src.resolve() == dest.resolve(): print("원본 폴더와 출력 폴더가 같습니다. 중단합니다."); return 2
    try: import PIL  # noqa: F401
    except Exception:
        if not a.check: print("Pillow 가 필요합니다: pip install pillow"); return 2
    if not (1 <= a.quality <= 100) or a.max < 200: print("--quality 는 1~100, --max 는 200 이상이어야 합니다."); return 2
    only = set(a.only) if a.only else None
    R = CI.sync_web(src, dest, only=only, force=a.force, max_side=a.max, quality=a.quality, workers=a.workers, dry=a.check)
    total = len([p for p in src.iterdir() if p.is_file() and p.suffix.lower() in CI.IMG_EXT])
    if a.check:
        print(f"원본 {total}장 중 새로 만들 것 {len(R['todo'])}장 / 이미 최신 {R['skipped']}장")
        for n, why in R["todo"][:30]: print(f"  - {n} ({why})")
        if len(R["todo"]) > 30: print(f"  … 외 {len(R['todo']) - 30}장")
        return 0
    print(f"원본 {total}장: 새로 만듦/다시 만듦 {R['made']}장, 이미 최신이라 건너뜀 {R['skipped']}장" + (f", 실패 {len(R['failed'])}장" if R["failed"] else ""))
    rows = R["rows"]
    if rows:
        ob = [(src / n).stat().st_size for n in rows]; wb = [r["bytes"] for r in rows.values()]
        print(f"  이번에 만든 것: 원본 평균 {sum(ob)//len(ob)//1024}KB → 최적화 평균 {sum(wb)//len(wb)//1024}KB (−{100-100*sum(wb)/sum(ob):.0f}%), 최소 {min(wb)//1024}KB / 최대 {max(wb)//1024}KB")
        print(f"  축소된 것 {sum(1 for r in rows.values() if r['resized'])}장 (긴 변 > {a.max}px), 그대로 크기 유지 {sum(1 for r in rows.values() if not r['resized'])}장")
        big = [n for n, r in rows.items() if r["bytes"] > 250 * 1024]
        if big: print(f"  250KB 초과 {len(big)}장 (화질을 낮추지 않았습니다): {', '.join(big[:6])}{' …' if len(big) > 6 else ''}")
    if a.prune:
        keep = {CI.web_name(p.name) for p in src.iterdir() if p.is_file() and p.suffix.lower() in CI.IMG_EXT}
        gone = [p for p in dest.glob("*.webp") if p.name not in keep]
        for p in gone: p.unlink()
        man = CI.load_manifest(dest)
        for p in gone: (man.get("files") or {}).pop(p.name, None)
        if gone: CI.save_manifest(dest, man)
        print(f"  원본이 없는 최적화본 {len(gone)}장 삭제")
    else:
        keep = {CI.web_name(p.name) for p in src.iterdir() if p.is_file() and p.suffix.lower() in CI.IMG_EXT}
        orphan = [p.name for p in dest.glob("*.webp") if p.name not in keep] if dest.is_dir() else []
        if orphan: print(f"  (참고) 원본이 없는 최적화본 {len(orphan)}장 — 지우려면 --prune")
    return 1 if R["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
