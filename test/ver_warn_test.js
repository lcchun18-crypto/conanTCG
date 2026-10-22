// v1.17.35: 서버와 index.html 버전이 다르면 경고 / 같으면 없음 + 선후공 선택 버튼·채팅창이 실제 index.html 에 있다(두 기능 동시)
const path = require('path'), fs = require('fs'); const U = require('./mz_util'); const S = U.S; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const pk = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version; const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
ok(html.includes(`CLIENT_VER='${pk}'`), `1 index.html 의 CLIENT_VER 이 package.json(${pk}) 과 같음`);
const orig = S.mkR; S.mkR = c => { const R = orig(c); R.ws = [{}, {}]; R.firstPref = undefined; return R; };
const R = (() => { try { const R = S.mkR('T'); const d = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' }, f: { n: 'F', type: 'char', color: 'red', lv: '0', ap: '1000', lp: '1' } }; for (let s = 0; s < 2; s++) { const list = []; for (let i = 0; i < 40; i++) { const k = 'f' + Math.floor(i / 3); d[k] = { ...d.f, n: k }; list.push(k); } const e = S.ready(R, s, { defs: d, list, partner: 'p', kase: 'k' }); if (e) throw new Error(e); } return R; } finally { S.mkR = orig; } })();
ok(R.phase === 'choose', '2 두 명 등록 → choose 단계 (' + R.phase + ')');
(async () => { const { chromium } = require('playwright'); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [label, sv, expWarn] of [['같은 버전', pk, false], ['서버가 더 새 버전', '9.9.9', true]]) for (const seat of [R.chooser, 1 - R.chooser]) {
    const pg = await br.newPage({ viewport: { width: 1366, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs);
    const v = JSON.parse(JSON.stringify(S.view(R, seat))); v.sv = sv; await pg.evaluate(vv => window.__ws.onmessage({ data: JSON.stringify(vv) }), v); await pg.waitForTimeout(250);
    const warn = await pg.locator('#verwarn').count(), btn = await pg.evaluate(() => [...document.querySelectorAll('#btns button')].map(b => b.textContent.trim()).join('/')), chat = await pg.evaluate(() => { const e = document.getElementById('chatp'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 60; });
    ok((warn === 1) === expWarn, `3 [${label}] 좌석${seat === R.chooser ? '(결정권자)' : '(상대)'} 버전 경고 ${expWarn ? '표시' : '없음'}`); ok(chat, `4 [${label}] 채팅창 보임`); ok(seat === R.chooser ? /선공으로 시작\/후공으로 시작/.test(btn) : btn === '', `5 [${label}] 선후공 버튼: "${btn}"`); ok(!errs.length, '6 오류 없음 ' + errs.join('|')); await pg.close(); }
  await br.close(); console.log(`\nver_warn_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
