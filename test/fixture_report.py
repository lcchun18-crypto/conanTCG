"""실제 20장(fixture) 회귀 리포트: 개선 전(모델 원본 출력) vs 개선 후(규칙 변환 적용) — 엔진 정화기 기준.
실행: python test/fixture_report.py   (API 호출 없음)"""
import json, subprocess, sys, tempfile
from pathlib import Path
HERE = Path(__file__).parent; ROOT = HERE.parent
FIXES = [("실제 20장(conan-db-test20)", HERE / "fixtures" / "conan-db-test20.json"), ("실제 무작위 100장(sample100)", HERE / "fixtures" / "sample100.json")]
def chk(p): return json.loads(subprocess.run(["node", str(HERE / "check_db.js"), str(p), "--json"], capture_output=True, cwd=str(ROOT), check=True).stdout)
tmp = Path(tempfile.mkdtemp())
for title, FIX in FIXES:
    out = tmp / (FIX.stem + ".after.json")
    subprocess.run([sys.executable, str(ROOT / "import_cards.py"), "--effects-only", str(FIX), "--rules-only", "--out", str(out)], capture_output=True, check=True, cwd=str(tmp))
    b, a = chk(FIX), chk(out)
    print(f"\n══ {title} ══")
    print(f"{'':10}{'효과 있는 카드':>12}{'완전 자동':>10}{'manual':>8}{'자동 비율':>10}")
    for name, r in (("개선 전", b), ("개선 후", a)): print(f"{name:10}{r['withFx']:>12}{r['auto']:>10}{r['manual']:>8}{100 * r['auto'] / r['withFx']:>9.1f}%")
    ch = [k for k in sorted(b["cards"]) if b["cards"][k]["st"] != a["cards"][k]["st"]]
    print(f"\n상태가 바뀐 카드 {len(ch)}장 (manual → auto)" if all(a['cards'][k]['st'] == 'auto' for k in ch) else "\n카드별 변화")
    for k in sorted(b["cards"]):
        x, y = b["cards"][k], a["cards"][k]
        if y["st"] not in ("auto", "no-text"): print(f"  {k} {x.get('n', ''):8} {x['st']:8} → {y['st']:8}" + (("  남은 이유: " + " | ".join(y["man"])) if y.get("man") else ""))
    print(f"남은 manual 카드: {[k for k, v in a['cards'].items() if v['st'] in ('manual', 'no-data')] or '없음'}")
