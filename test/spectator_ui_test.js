// v1.15.0 관전 모드 UI: 실제 서버 + 브라우저 3개(P1, P2, 관전자) + 관전 불가 방
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'); const PORT = 8800 + Math.floor(Math.random() * 500);
const cf = path.join(require('os').tmpdir(), 'spec_cards_' + process.pid + '.json');
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, CARDS_JSON: cf, NODE_PATH: path.dirname(path.dirname(WS)) }, stdio: 'ignore' }); process.on('exit', () => srv.kill());
const mk = (id, n, type, extra = {}) => ({ id, n, type, color: 'blue', lv: '1', lv2: '2', ap: '3000', lp: '1', kw: '', trait: '', fx: '', extra: '', ab: [], img: '', ...extra });
const cards = {}; for (let i = 0; i < 14; i++) cards['c' + i] = mk('c' + i, '캐릭터' + i, 'char', { lv: String(i % 3) }); cards.p = mk('p', '파트너', 'partner'); cards.k = mk('k', '사건', 'case');
const cs = {}; for (let i = 0; i < 14; i++) cs['c' + i] = 3; cs.c13 = 1;
const deck = { name: '덱', cards: cs, partner: 'p', kase: 'k' }; fs.writeFileSync(cf, JSON.stringify({ cards })); process.on('exit', () => { try { fs.unlinkSync(cf); } catch (e) {} });
(async () => { await new Promise(r => setTimeout(r, 1200)); const br = await chromium.launch({ ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
  const mkp = async () => { const pg = await br.newPage({ viewport: { width: 1600, height: 950 } }); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); await pg.goto('http://localhost:' + PORT + '/'); await pg.evaluate(() => dbReady); await pg.evaluate(d => { DB.decks = { d }; curDeck = 'd'; decks(); }, deck); return pg; };
  let fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fail++; };
  const A = await mkp(), B = await mkp(), S = await mkp();
  ok(await S.locator('#scode').count() === 1 && await S.locator('#specBtn').count() === 1 && await S.locator('#nospec').count() === 1 && !(await S.locator('#nospec').isChecked()), '로비: 관전 코드 입력 + [관전] 버튼 + "관전 불가" 체크박스(기본 해제)');
  const ypos = async (pg, sel) => (await pg.locator(sel).boundingBox()).y;
  ok(await ypos(S, '#scode') > await ypos(S, 'button:has-text("입장 (게스트)")'), '관전 입력이 게스트 입장 영역 아래에 있음');
  await A.getByText('방 만들기').click(); await A.waitForSelector('#game', { state: 'visible' }); const code = await A.locator('#rc').innerText();
  // 대기방 관전
  await S.fill('#scode', code.toLowerCase()); await S.click('#specBtn'); await S.waitForSelector('#game', { state: 'visible' });
  ok(await S.locator('#specpill').isVisible() && /관전 중/.test(await S.locator('#specpill').innerText()), '대기방 관전: "관전 중" 표시');
  ok(await S.locator('#restartBtn').isHidden() && await S.locator('#topmenu').isHidden(), '관전자: 다시하기·덱 등록·항복 UI 숨김');
  await B.fill('#code', code); await B.getByText('입장 (게스트)').click(); await B.waitForSelector('#game', { state: 'visible' });
  await A.getByRole('button', { name: '덱 등록' }).click(); await B.getByRole('button', { name: '덱 등록' }).click(); await A.waitForTimeout(600);
  for (const pg of [A, B]) { const t = await pg.locator('#msg').innerText(); if (/교체할 손패/.test(t)) await pg.getByRole('button', { name: /확정/ }).click(); await pg.waitForTimeout(400); }
  for (const pg of [A, B]) { const t = await pg.locator('#msg').innerText(); if (/교체할 손패/.test(t)) await pg.getByRole('button', { name: /확정/ }).click(); await pg.waitForTimeout(400); }
  await A.waitForTimeout(700);
  const turnPg = (await A.locator('#turnb.me').count()) ? A : B, oth = turnPg === A ? B : A;
  // 양쪽 손패 앞면
  const hcnt = async (pg, sel) => pg.locator(sel + ' .card:not(.back)').count();
  const backs = async (pg, sel) => pg.locator(sel + ' .card.back').count();
  ok(await hcnt(S, '#hand') > 0 && await backs(S, '#hand') === 0 && await hcnt(S, '#opp-hand') > 0 && await backs(S, '#opp-hand') === 0, '관전자: 양쪽 손패 모두 앞면 (#hand ' + await hcnt(S, '#hand') + '장 / #opp-hand ' + await hcnt(S, '#opp-hand') + '장)');
  ok(await backs(A, '#opp-hand') > 0 && await hcnt(A, '#opp-hand') === 0 && await backs(B, '#opp-hand') > 0 && await hcnt(B, '#opp-hand') === 0, 'P1·P2 화면: 상대 손패는 여전히 뒷면');
  const names = async (pg, sel) => (await pg.locator(sel + ' .card').evaluateAll(l => l.map(e => e.dataset.id))).sort().join(',');
  const pA = A.locator('#turnb.me').count().then(c => c ? 'A' : 'B');
  ok(await names(S, '#hand') === await names(A, '#hand') && await names(S, '#opp-hand') === await names(B, '#hand'), '관전자 화면 손패 = P1·P2 가 실제로 쥔 손패');
  ok(/플레이어/.test(await S.locator('#turnb').innerText()) && /플레이어 1/.test(await S.locator('#oppl, #mel').first().innerText() + await S.locator('#mel').innerText() + await S.locator('#oppl').innerText()), '관전자: 플레이어 1/2 표기');
  // 액션 UI 없음 + 클릭해도 아무 일 없음
  ok(await S.locator('#btns button:visible').count() === 0 && await S.locator('#act button:visible').count() === 0, '관전자: 행동 버튼 없음 (턴 종료/넥스트 힌트/등장 …)');
  await S.locator('#hand .card').first().click(); await S.locator('#opp-hand .card').first().click(); await S.waitForTimeout(200);
  ok(await S.locator('.card.sel').count() === 0 && await S.locator('#act button:visible').count() === 0, '관전자가 손패 카드를 눌러도 선택/행동 UI 없음');
  await S.evaluate(() => { S({ t: 'act', a: 'end' }); }); await S.waitForTimeout(300);
  ok(await turnPg.locator('#turnb.me').count() === 1, 'JS 로 조작 메시지를 보내려 해도 클라이언트·서버가 막음 (턴 변경 없음)');
  // 미리보기(hover) + 우측 상세
  await S.locator('#opp-hand .card').first().hover(); await S.waitForTimeout(300);
  ok(await S.evaluate(() => { const p = document.getElementById('pv'); return !!p && p.offsetParent !== null && /캐릭터/.test(p.innerText); }), '관전자: 상대 손패 카드 hover → 우측 상세 미리보기 동작');
  // 실시간: 턴 플레이어가 카드 등장 → 관전자 반영
  const h0 = await S.locator('#hand .card, #opp-hand .card').count();
  const hi = await turnPg.evaluate(() => [...document.querySelectorAll('#hand .card')].map(e => { const m = /캐릭터(\d+)/.exec(e.innerText); return m ? +m[1] % 3 : 9; }).indexOf(0));
  if (hi >= 0) { await turnPg.locator('#hand .card').nth(hi).click(); await turnPg.getByRole('button', { name: /등장/ }).first().click(); await S.waitForTimeout(700);
    const sideSel = turnPg === A ? '#me-field' : '#opp-field';
    ok(await S.locator(sideSel + ' .card').count() === 1 && await S.locator('#hand .card, #opp-hand .card').count() === h0 - 1, '실시간: 카드 등장 → 관전자 필드에 나타나고 손패 1장 감소'); }
  await turnPg.getByRole('button', { name: /턴 종료/ }).click(); await S.waitForTimeout(700);
  ok(await oth.locator('#turnb.me').count() === 1 && /플레이어/.test(await S.locator('#turnb').innerText()), '실시간: 턴 변경 반영 (' + await S.locator('#turnb').innerText() + ')');
  if (process.env.SHOT) await S.screenshot({ path: process.env.SHOT });
  // 관전자 이탈 → 게임 유지, 새 관전자 중간 입장
  const S2 = await mkp(); await S2.fill('#scode', code); await S2.click('#specBtn'); await S2.waitForSelector('#game', { state: 'visible' }); await S2.waitForTimeout(400);
  ok(await hcnt(S2, '#hand') > 0 && await hcnt(S2, '#opp-hand') > 0 && /플레이어 \d 턴/.test(await S2.locator('#turnb').innerText()) && await S2.locator('#me-field .card, #opp-field .card').count() >= 1, '게임 중간 입장 관전자 2: 현재 필드·양쪽 손패·턴 즉시 표시 (여러 관전자 동시)');
  await S.close(); await A.waitForTimeout(500);
  ok(await oth.locator('#turnb.me').count() === 1 && await A.locator('#net.down').count() === 0, '관전자 브라우저 종료 → 게임/플레이어에 영향 없음');
  // 다시하기 후에도 관전 유지
  await A.getByRole('button', { name: /다시하기/ }).click(); await A.locator('#ynY').click(); await A.waitForTimeout(800);
  ok(await S2.locator('#game').isVisible() && /덱 준비/.test(await S2.locator('#msg').innerText()) && await S2.locator('#specpill').isVisible(), '다시하기 후에도 관전자 화면 유지 (새 게임 setup 관전)');
  // 게임 종료 결과
  await A.getByRole('button', { name: '덱 등록' }).click(); await B.getByRole('button', { name: '덱 등록' }).click(); await A.waitForTimeout(600);
  for (const pg of [A, B, A, B]) { const t = await pg.locator('#msg').innerText(); if (/교체할 손패/.test(t)) await pg.getByRole('button', { name: /확정/ }).click(); await pg.waitForTimeout(400); }
  await S2.waitForTimeout(500); ok(await hcnt(S2, '#hand') > 0 && await hcnt(S2, '#opp-hand') > 0, '다시하기 후 새 게임에서도 관전자에게 양쪽 손패 앞면');
  A.once('dialog', d => d.accept()); await A.evaluate(() => A_('resign')).catch(() => {}); await A.evaluate(() => S({ t: 'act', a: 'resign' })); await S2.waitForTimeout(700);
  ok(/승리/.test(await S2.locator('#msg').innerText()) && await S2.locator('#endb.on').count() === 1, '게임 종료 → 관전자 화면에 승패 결과: ' + await S2.locator('#msg').innerText());
  // 관전 불가 방
  const H = await mkp(); await H.locator('#nospec').check(); await H.getByText('방 만들기').click(); await H.waitForSelector('#game', { state: 'visible' }); const code2 = await H.locator('#rc').innerText();
  const Z = await mkp(); await Z.fill('#scode', code2); await Z.click('#specBtn'); await Z.waitForTimeout(500);
  ok(/이 방은 관전이 허용되지 않습니다\./.test(await Z.locator('#lerr').innerText()) && await Z.locator('#game').isHidden(), '관전 불가 방 → "이 방은 관전이 허용되지 않습니다." 안내, 입장 안 됨');
  await Z.fill('#scode', 'ZZZZ'); await Z.click('#specBtn'); await Z.waitForTimeout(400); ok(/없는 방/.test(await Z.locator('#lerr').innerText()), '없는 방 코드 안내');
  ok([A, B, S2, H, Z].every(p => p.errs.length === 0), '페이지 오류 없음' + [A, B, S2, H, Z].map(p => p.errs.join('|')).join(''));
  await br.close(); console.log(fail ? `\n${fail} 실패` : '\n전부 통과'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
