// v1.17.35: 선후공 결정권자가 무응답이면 자동으로 랜덤 결정된다 (멈춤 방지)
if (!process.env.CHOOSE_MS) { const r = require('child_process').spawnSync('node', [__filename], { env: { ...process.env, CHOOSE_MS: '300' }, encoding: 'utf8', timeout: 30000 }); process.stdout.write(r.stdout); process.stderr.write(r.stderr.slice(0, 800)); process.exit(r.status); }
const U = require('./mz_util'); const S = U.S; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const orig = S.mkR; S.mkR = c => { const R = orig(c); R.ws = [{ readyState: 1, send() {} }, { readyState: 1, send() {} }]; R.firstPref = undefined; return R; };
const mk = () => { const R = S.mkR('T'); const d = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' }, f: { n: 'F', type: 'char', color: 'red', lv: '0', ap: '1000', lp: '1' } }; for (let s = 0; s < 2; s++) { const list = []; for (let i = 0; i < 40; i++) { const k = 'f' + Math.floor(i / 3); d[k] = { ...d.f, n: k }; list.push(k); } const e = S.ready(R, s, { defs: d, list, partner: 'p', kase: 'k' }); if (e) throw new Error(e); } return R; };
const A = mk(), B = mk(); ok(A.phase === 'choose' && B.phase === 'choose', '1 choose 단계 시작');
S.act(B, B.chooser, { a: 'first', v: 'first' }); ok(B.phase === 'mull', '2 직접 선택하면 즉시 멀리건');
setTimeout(() => { ok(A.phase === 'mull' && (A.first === 0 || A.first === 1) && A.log.some(l => /시간 초과/.test(l)), '3 무응답 방(A): 시간 초과 후 자동으로 선공 결정 → 멀리건: ' + A.phase); ok(B.phase === 'mull' && !B.log.some(l => /시간 초과/.test(l)), '4 직접 선택한 방(B)은 타이머가 영향을 주지 않음');
  console.log(`\nchoose_timeout_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); }, 800);
