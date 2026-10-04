// v1.12.3: 봇전에서도 [다시하기] 항상 표시(진행 중 포함 → 확인 후 같은 설정으로 새 봇 대전), [이번 턴 다시시작] 은 상단 [다시하기] 바로 옆
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
  const R = G({ a: dummy('A', { color: 'yellow' }) }, ['a'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); S.snapTake(R);
  const mk = (bot, phase, rt) => { const v = JSON.parse(JSON.stringify(S.view(R, R.turn))); v.bot = bot; v.botName = 'BOT'; v.phase = phase; v.rt = rt; return v; };
  const pg = await (await br.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html')); const feed = m => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m);
  const vis = id => pg.evaluate(id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, id);
  await feed({ t: 'defs', defs: R.defs });
  for (const [ph, label] of [['play', '진행 중'], ['over', '종료 후']]) { await feed(mk(1, ph, 0));
    ok(await vis('restartBtn'), `봇전 ${label}: [다시하기] 표시`);
    await pg.evaluate(() => { window.__sent.length = 0; document.getElementById('restartBtn').click(); }); ok(await vis('yn'), `봇전 ${label}: 확인창`);
    await pg.evaluate(() => document.getElementById('ynN').click()); ok(!(await pg.evaluate(() => window.__sent.some(m => m.t === 'leaveBot' || m.t === 'restartGame'))), `봇전 ${label}: [아니오] → 요청 없음`);
    await pg.evaluate(() => { document.getElementById('restartBtn').click(); document.getElementById('ynY').click(); }); ok(await pg.evaluate(() => window.__sent.some(m => m.t === 'leaveBot')), `봇전 ${label}: [예] → leaveBot(같은 설정 새 대전 흐름)`); }
  await feed(mk(0, 'play', 1)); ok(await vis('restartBtn') && await vis('rtBtn'), '사람 방: [다시하기] + [이번 턴 다시시작] 표시');
  ok(await pg.evaluate(() => { const a = document.getElementById('restartBtn'), b = document.getElementById('rtBtn'); return a.nextElementSibling === b && !!b.closest('#top'); }), '[이번 턴 다시시작] 이 상단 [다시하기] 바로 옆');
  ok(!(await pg.evaluate(() => !!document.querySelector('#acts #rtBtn'))), 'PC: 행동 버튼 줄에는 중복 없음');
  await pg.evaluate(() => { window.__sent.length = 0; document.getElementById('rtBtn').click(); document.getElementById('ynY').click(); }); ok(await pg.evaluate(() => window.__sent.some(m => m.t === 'restartTurn')), '[이번 턴 다시시작] → restartTurn 전송');
  await feed(mk(0, 'play', 0)); ok(!(await vis('rtBtn')), 'rt=0 이면 [이번 턴 다시시작] 숨김');
  ok(pg.errs.length === 0, 'JS 오류 없음 ' + pg.errs.join('|')); await br.close();
  console.log(fail ? `\n실패 ${fail}` : `\n다시하기 버튼 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0); })();
