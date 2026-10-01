// 실제 브라우저(Playwright) + 실제 서버(server.js) + 워커 스레드 봇: 로비 "봇과 대전" → 덱 선택 → 선후공 → 멀리건 → 플레이 → 종료 → AI 기록 → 다시 대전
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), U = require('./bot_util.js');
const PORT = 9100 + Math.floor(Math.random() * 400); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, NODE_PATH: path.dirname(path.dirname(WS)), BOT_THINK_MS: '300', BOT_MICRO_MS: '200', BOT_DELAY_MS: '120' }, stdio: 'ignore' }); process.on('exit', () => srv.kill());
const toDeck = (name, d) => ({ name, cards: d.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: d.partner, kase: d.kase });
const AUTO = () => { // 사람 플레이어 자동 조종(페이지 안에서 실제 서버 메시지 A()/S() 사용). 화면(V.acts) 기준으로만 행동한다.
  window.__seen = window.__seen || new Set(); window.__errs = window.__errs || []; let last = '', tries = 0;
  const step = () => { try { if (!V) return; const me = V.me; for (const l of V.log) window.__seen.add(l);
    if (V.phase === 'mull') { if (V.mull === me) A('mull', { ids: [] }); return; } if (V.phase !== 'play') return;
    const sig = V.n + '|' + V.log.length + '|' + JSON.stringify(V.sub || 0) + (V.eff ? V.eff.kind : ''); if (sig !== last) { last = sig; tries = 0; } else tries++;
    if (V.eff) { const E = V.eff; if (E.wait) return; const sel = E.sel || (E.cards || []).map(c => c.id);
      if (E.kind === 'yn') A('ans', { v: tries % 2 === 0 }); else if (E.kind === 'ack') A('ans', { v: null }); else if (E.kind === 'opt') A('ans', { v: tries % E.labels.length });
      else if (E.kind === 'optm') A('ans', { v: Array.from({ length: E.min || 0 }, (_, i) => i) }); else if (E.kind === 'text') A('ans', { v: 'a' });
      else A('ans', { v: sel.slice(tries % Math.max(1, sel.length), tries % Math.max(1, sel.length) + (E.min || 0)).concat(sel.slice(0, E.min || 0)).filter((x, i, a) => a.indexOf(x) === i).slice(0, E.min || 0) }); return; }
    if (V.sub) { if (V.sub.who !== me) return; const s = V.sub; if (s.type === 'guard') A('guard', { id: null }); else if (s.type === 'mis') A('mis', { ids: [] }); else A('pass'); return; }
    if (V.turn !== me) return;
    const P = V.P[me], fc = P.file + (P.partner && P.partner.inFile ? 1 : 0);
    if (V.fl && V.fl.hw) return A('skip');
    if (tries > 6) return A('end');
    const cand = P.hand.filter(c => c.lvx <= fc); if (!V.fl.played && !V.fl.hint && cand.length && tries < 3) return A('play', { id: cand[tries % cand.length].id, rep: P.field.length >= 5 ? P.field[0].id : undefined });
    const acts = V.acts || {}; const pick = k => { for (const [id, l] of Object.entries(acts)) { const a = l.find(x => x.k === k); if (a) return [+id, a]; } return null; };
    let x = pick('solve'); if (x) return A('solve'); x = pick('assist'); if (x && fc + 1 >= 7) return A('assist');
    x = pick('actc'); if (x && x[1].tg.length) return A('action', { id: x[0], k: 'char', tid: x[1].tg[0] }); x = pick('actk'); if (x) return A('action', { id: x[0], k: 'case' });
    x = pick('reason'); if (x) return A('reason', { who: x[0] === (P.partner && P.partner.id) ? 'p' : x[0] });
    A('end'); } catch (e) { window.__errs.push(String(e)); } };
  NET.ws.addEventListener('message', () => setTimeout(step, 40)); setInterval(step, 600); };
(async () => {
  await new Promise(r => setTimeout(r, 1300));
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await br.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/`); ok(await pg.evaluate(() => dbReady) === true, '카드 DB 자동 로딩');
  const d1 = U.makeDeck(31), d2 = U.makeDeck(32);
  await pg.evaluate(([a, b]) => { DB.decks = { my: a, bot: b }; curDeck = 'my'; decks(); }, [toDeck('내 덱', d1), toDeck('봇 덱', d2)]);
  ok(await pg.locator('#botBtn').isVisible(), '로비에 "봇과 대전" 버튼'); await pg.click('#botBtn'); ok(await pg.locator('#botm').isVisible(), '봇 대전 설정 창');
  ok(await pg.locator('#botMy option').count() === 2 && await pg.locator('#botDk option').count() === 2, '내 덱/봇 덱 선택 목록(저장된 덱)');
  ok(await pg.locator('input[name=bf]').count() === 3, '선공/후공/랜덤 선택');
  await pg.selectOption('#botMy', 'my'); await pg.selectOption('#botDk', 'bot'); await pg.check('input[name=bf][value=second]'); await pg.click('#botm >> text=대전 시작');
  await pg.waitForSelector('#game', { state: 'visible', timeout: 8000 }); await pg.waitForFunction(() => V && V.phase !== 'setup', null, { timeout: 8000 });
  ok(await pg.evaluate(() => V.bot === 1 && V.P[0].ready && V.P[1].ready), '내 덱 자동 등록 + 봇 덱 등록 → 게임 시작'); ok(await pg.locator('#botpill').isVisible() && !(await pg.locator('#devp').isVisible()), '봇 표시 / 봇 대전에서는 개발자 도구 숨김');
  ok(await pg.evaluate(() => V.first === 1), '"후공" 선택 → 봇이 선공');
  // 멀리건 UI (실제 버튼)
  await pg.waitForFunction(() => V.phase === 'mull', null, { timeout: 5000 }); const hand0 = await pg.evaluate(() => V.P[0].hand.length); ok(hand0 === 5, '내 손패 5장 + 봇 손패는 숫자만(숨김): ' + await pg.evaluate(() => typeof V.P[1].hand));
  await pg.waitForFunction(() => V.mull === 0, null, { timeout: 15000 }); ok(true, '봇이 먼저 멀리건을 끝내고 내 차례'); await pg.locator('#btns button', { hasText: '확정' }).first().click();
  await pg.waitForFunction(() => V.phase === 'play', null, { timeout: 8000 }); ok(true, '멀리건 후 게임 시작');
  // 자동 플레이 + 화면 관찰
  await pg.evaluate(AUTO); const obs = { oppCard: 0, arrow: 0, bothFile: 0, evid: 0, botUse: 0 }; const t0 = Date.now();
  while (Date.now() - t0 < 110000) { const o = await pg.evaluate(() => ({ over: V.phase === 'over', opp: document.querySelectorAll('#oppl .card').length, arrow: document.querySelectorAll('#arrg *').length, sub: V.sub ? V.sub.type : '', evid: V.P[0].evid + V.P[1].evid })); if (o.opp) obs.oppCard++; if (o.arrow) obs.arrow++; if (o.evid) obs.evid++; if (o.over) break; await pg.waitForTimeout(150); }
  const over = await pg.evaluate(() => V.phase === 'over'); ok(over, '게임이 승/패로 종료됨: ' + await pg.locator('#msg').innerText().catch(() => ''));
  ok(obs.oppCard > 0, `봇 카드가 화면에 등장 (관찰 ${obs.oppCard}회)`); ok(obs.arrow > 0, `공격 화살표 표시 (관찰 ${obs.arrow}회)`); ok(obs.evid > 0, '증거 표시');
  const log = await pg.evaluate(() => [...window.__seen]); const has = re => log.some(l => re.test(l));
  for (const [nm, re] of [['봇 카드 사용', /게스트 사용/], ['공격(액션)', /게스트 액션/], ['내 공격에 대한 봇 대응(가드/컨택트)', /가드|컨택트/], ['어시스트', /게스트 어시스트/], ['추리', /게스트 추리|추리!/], ['사건 해결/승리', /승리/]]) console.log(has(re) ? '  ✓ 관찰됨:' : '  - 이번 판에서는 없음:', nm);
  ok(has(/게스트 사용/) && has(/게스트 액션|게스트 추리|게스트 어시스트/), '봇이 카드 사용 + 행동(공격/추리/어시스트)을 함');
  ok(await pg.locator('#botover').isVisible(), '종료 후 "다시 대전 / AI 기록 다운로드 / 로비로" 버튼');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#botover >> text=AI 기록 다운로드')]); const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok(j.bot === 'EXPERT' && j.decisions.length > 3 && j.decisions[0].state && j.illegalAttempts === 0, `AI 기록 JSON 다운로드: 결정 ${j.decisions.length}개, 불법 시도 ${j.illegalAttempts}건`);
  const code1 = await pg.evaluate(() => V.code); await pg.click('#botover >> text=다시 대전'); await pg.waitForFunction(c => V && V.code !== c && V.phase !== 'over', code1, { timeout: 10000 }); ok(true, '게임 재시작(같은 설정으로 새 방)');
  await pg.waitForFunction(() => V.P[0].ready, null, { timeout: 8000 }).catch(() => {}); ok(await pg.evaluate(() => V.bot === 1 && V.P[0].ready && V.P[1].ready), '재시작 후 덱 자동 등록');
  const errs = await pg.evaluate(() => window.__errs); ok(errs.length === 0 && pg.errs.length === 0, 'JS 오류 없음 ' + errs.concat(pg.errs).join('|'));
  await pg.evaluate(() => botLobby()); await pg.waitForSelector('#lobby', { state: 'visible', timeout: 5000 }); ok(true, '로비로 복귀');
  await br.close(); console.log(fail ? `\n봇 UI 테스트 ${fail}건 실패` : `\n봇 UI 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
