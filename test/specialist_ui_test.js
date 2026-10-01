// 실제 브라우저 + 실제 서버: 전문 봇 목록이 registry 에서 자동 생성되고(HTML 하드코딩 없음), 선택 → 고정 덱 → 대전 시작이 되는지.
// 서버에 BOT_SPECIALISTS_DIR 로 "mock 전문 봇 파일"을 추가한다 (실제 전문 봇 아님). 사용 가능 2개 + 사용 불가 1개(규칙 위반 덱).
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os'), X = require('./specialist_util.js'), U = X.U, http = require('http');
const PORT = 9600 + Math.floor(Math.random() * 300); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spui-')); fs.mkdirSync(path.join(tmp, 'decks'));
const dA = U.makeDeck(41), dB = U.makeDeck(42), dBad = U.makeDeck(43), badJ = X.exportDeck('BadDeck', dBad); badJ.main[0].n = 4;
const put = (id, name, deckJson, extra = '') => { fs.writeFileSync(path.join(tmp, 'decks', id + '.json'), JSON.stringify(deckJson, null, 1)); fs.writeFileSync(path.join(tmp, id + '.js'), `module.exports={id:'${id}',name:${JSON.stringify(name)},desc:'mock',${extra}deckFile:'decks/${id}.json',profile:{}};`); };
put('mock_red', '적색 Mock Expert', X.exportDeck('RedMockDeck', dA)); put('mock_two', '둘째 Mock Expert', X.exportDeck('SecondMockDeck', dB), "color:'green',"); put('mock_bad', '깨진 Mock Expert', badJ);
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, NODE_PATH: path.dirname(path.dirname(WS)), BOT_SPECIALISTS_DIR: tmp, BOT_THINK_MS: '300', BOT_MICRO_MS: '200', BOT_DELAY_MS: '100' }, stdio: 'ignore' }); process.on('exit', () => srv.kill());
const toDeck = (name, d) => ({ name, cards: d.list.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {}), partner: d.partner, kase: d.kase });
const getJson = p => new Promise((res, rej) => http.get(`http://localhost:${PORT}${p}`, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
(async () => {
  await new Promise(r => setTimeout(r, 1300));
  const api = await getJson('/api/specialists'), j = JSON.parse(api.body), names = j.specialists.map(x => x.id).sort();
  ok(api.status === 200 && names.join() === 'mock_bad,mock_red,mock_two', '/api/specialists: registry 에서 자동 생성된 목록 ' + names.join(','));
  const r = j.specialists.find(x => x.id === 'mock_red'), t = j.specialists.find(x => x.id === 'mock_two'), b = j.specialists.find(x => x.id === 'mock_bad');
  ok(r.ok && r.deckName === 'RedMockDeck' && r.cards === 40 && r.colors.length === 1, `목록 정보: 이름/덱 이름/색(${r.colorLabel})/장수`); ok(t.colorLabel === '녹색', 'color 지정 시 그 색 표시 (녹색)'); ok(!b.ok && b.errors.length, '규칙 위반 덱은 ok=false + 이유: ' + b.errors[0]);
  ok(!api.body.includes('profile') && !api.body.includes('"hooks"'), 'API 는 전략 프로필을 내보내지 않음');
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/`); ok(await pg.evaluate(() => dbReady) === true, '카드 DB 자동 로딩');
  await pg.evaluate(([a]) => { DB.decks = { my: a }; curDeck = 'my'; decks(); }, [toDeck('내 덱', U.makeDeck(44))]);
  await pg.click('#botBtn'); await pg.waitForSelector('#botList button.bsi', { timeout: 5000 }); await pg.waitForFunction(() => document.querySelectorAll('#botList button.bsi').length === 4, null, { timeout: 5000 });
  const items = await pg.evaluate(() => [...document.querySelectorAll('#botList button.bsi')].map(b => ({ t: b.innerText.replace(/\s+/g, ' '), dis: b.disabled, sel: b.classList.contains('sel') })));
  ok(items[0].t.includes('범용 Expert') && items[0].sel, '목록 맨 위 "범용 Expert" (기본 선택)'); ok(items.some(x => x.t.includes('적색 Mock Expert') && x.t.includes('RedMockDeck') && x.t.includes('적색') && !x.dis), '전문 봇 항목: 이름 + 색 / 덱 이름: ' + items.map(x => x.t).join(' | ').slice(0, 260));
  ok(items.some(x => x.t.includes('둘째 Mock Expert') && x.t.includes('녹색 / SecondMockDeck')), '색 지정 봇은 "녹색 / 덱 이름"'); ok(items.some(x => x.t.includes('깨진 Mock Expert') && x.dis && /사용 불가/.test(x.t)), '규칙 위반 덱 봇은 비활성 + "사용 불가" 이유');
  ok(await pg.locator('#botDkL').isVisible() && !(await pg.locator('#botFixed').isVisible()), '범용 선택 시: 봇 덱 선택 드롭다운 표시');
  await pg.click('#botList button.bsi:has-text("적색 Mock Expert")'); ok(!(await pg.locator('#botDkL').isVisible()) && await pg.locator('#botFixed').isVisible() && /RedMockDeck/.test(await pg.locator('#botFixed').innerText()), '전문 봇 선택 시: 봇 덱 선택 숨김 + 고정 덱 표시 (' + await pg.locator('#botFixed').innerText() + ')');
  await pg.check('input[name=bf][value=first]'); await pg.click('#botm >> text=대전 시작'); await pg.waitForSelector('#game', { state: 'visible', timeout: 8000 }); await pg.waitForFunction(() => V && V.phase !== 'setup', null, { timeout: 8000 });
  ok(await pg.evaluate(() => V.bot === 1 && V.botName === '적색 Mock Expert' && V.P[0].ready && V.P[1].ready), '전문 봇 대전 시작: 내 덱 자동 등록 + 봇 고정 덱 등록, 이름 전달');
  ok((await pg.locator('#botpill').innerText()).includes('적색 Mock Expert'), '상단 표시에 전문 봇 이름: ' + await pg.locator('#botpill').innerText()); ok(await pg.evaluate(() => V.first === 0), '"선공" 선택 적용');
  await pg.waitForFunction(() => V.phase === 'mull', null, { timeout: 5000 }); await pg.waitForFunction(() => V.mull === 0, null, { timeout: 15000 }); await pg.locator('#btns button', { hasText: '확정' }).first().click(); await pg.waitForFunction(() => V.phase === 'play', null, { timeout: 8000 }); ok(true, '멀리건 → 게임 진행');
  // 다시 대전 (같은 전문 봇 유지)
  await pg.evaluate(() => { V.phase !== 'over' && A('resign'); }); await pg.waitForFunction(() => V.phase === 'over', null, { timeout: 5000 }); await pg.click('#botover >> text=다시 대전'); await pg.waitForFunction(() => V && V.phase !== 'over' && V.botName === '적색 Mock Expert', null, { timeout: 10000 }); ok(true, '다시 대전: 같은 전문 봇/덱 유지');
  await pg.evaluate(() => botLobby()); await pg.waitForSelector('#lobby', { state: 'visible', timeout: 5000 });
  // 범용 Expert 는 기존과 동일
  await pg.evaluate(([a, bb]) => { DB.decks = { my: a, bot: bb }; curDeck = 'my'; decks(); }, [toDeck('내 덱', U.makeDeck(44)), toDeck('봇 덱', U.makeDeck(45))]); await pg.click('#botBtn'); await pg.waitForFunction(() => document.querySelectorAll('#botList button.bsi').length === 4, null, { timeout: 5000 });
  await pg.click('#botList button.bsi:has-text("범용 Expert")'); await pg.selectOption('#botMy', 'my'); await pg.selectOption('#botDk', 'bot'); await pg.click('#botm >> text=대전 시작');
  await pg.waitForFunction(() => V && V.bot === 1 && V.phase !== 'setup', null, { timeout: 8000 }); ok(await pg.evaluate(() => V.botName === 'BOT / EXPERT'), '범용 Expert 대전도 정상 (봇 덱 선택 방식 그대로)');
  ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|')); await br.close(); console.log(fail ? `\n전문 봇 UI 테스트 ${fail}건 실패` : `\n전문 봇 UI 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
