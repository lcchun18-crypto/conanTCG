// 카드 DB 자동 로딩: 서버의 data/cards.json 이 원본. 새 브라우저/시크릿/휴대폰/저장소 차단/예전 IndexedDB/DB 없음·손상/Render 식 실행
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const { spawn } = require('child_process'), http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), REAL = path.join(ROOT, 'data', 'cards.json'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'auto_'));
const NP = path.dirname(path.dirname(WS)); let fail = 0, pass = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const kids = []; process.on('exit', () => kids.forEach(k => k.kill()));
const boot = (env, cwd) => new Promise((res, rej) => { const port = 9500 + Math.floor(Math.random() * 400), c = spawn('node', [path.join(ROOT, 'server.js')], { cwd: cwd || ROOT, env: { ...process.env, NODE_PATH: NP, PORT: port, ...env } }); kids.push(c); let t = 0; c.stdout.on('data', d => { if (!t && /listen|3000|port|실행/i.test(String(d))) t = 1; }); setTimeout(() => res({ port, c }), 1000); c.on('error', rej); });
const get = (port, p, h) => new Promise(r => http.get({ port, path: p, headers: h || {} }, s => { const b = []; s.on('data', d => b.push(d)); s.on('end', () => r({ s: s.statusCode, h: s.headers, b: Buffer.concat(b) })); }));
const realN = Object.keys(JSON.parse(fs.readFileSync(REAL, 'utf8')).cards).length;
(async () => {
  ok(realN > 0, `data/cards.json 이 프로젝트에 있음 (${realN}장, 상대경로)`);
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const mk = async (opt, init) => { const ctx = await br.newContext(opt || { viewport: { width: 1600, height: 900 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); if (init) await pg.addInitScript(init); return { ctx, pg }; };
  // ── 1) Render 식: 프로젝트 밖 cwd, PORT 만 지정, CARDS_JSON 없음 → __dirname 기준 data/cards.json
  const S = await boot({ CARDS_JSON: '' }, os.tmpdir()), U = `http://localhost:${S.port}/`;
  const r = await get(S.port, '/api/cards', { 'Accept-Encoding': 'gzip' }); ok(r.s === 200 && r.h['content-encoding'] === 'gzip' && r.h['x-card-count'] == realN, `Render 식 실행(cwd 무관, PORT 만): /api/cards 200 + gzip + ${r.h['x-card-count']}장`);
  const r2 = await get(S.port, '/api/cards', { 'If-None-Match': r.h.etag }); ok(r2.s === 304, 'ETag 캐시(304)');
  const h = await get(S.port, '/health'); ok(h.s === 200 && h.b.toString() === 'OK', '/health 유지');
  // ── 2) 새 브라우저: 파일 선택/가져오기 없이 자동 표시
  const A = await mk(); await A.pg.goto(U); ok(await A.pg.evaluate(() => dbReady) === true, '새 브라우저: 접속만으로 카드 DB 자동 로딩');
  ok(await A.pg.evaluate(() => Object.keys(DB.cards).length) === realN, `DB.cards = 서버 카드 ${realN}장`);
  ok(await A.pg.locator('#mg, #imp, [onclick*="imp("]').count() === 0, '카드 DB 직접 불러오기/편집 UI 없음'); ok(await A.pg.locator('input[type=file]').evaluateAll(l => l.map(e => e.id)).then(x => x.join() === 'dbImp'), '파일 입력은 덱 파일 가져오기 하나뿐');
  ok(!(await A.pg.locator('#cdbErrL').isVisible()), '오류 배너 없음'); await A.pg.evaluate(() => openDB());
  ok(new RegExp(`결과 ${realN}장 / 전체 ${realN}장`).test(await A.pg.locator('#dbCnt').innerText()), '덱 빌더: 전체 카드 목록 자동 표시 ' + await A.pg.locator('#dbCnt').innerText());
  const f = await A.pg.evaluate(() => { const c = Object.values(DB.cards); return { img: c.filter(x => x.img).length, ko: c.filter(x => x.extra).length, ap: c.filter(x => x.ap).length }; }); ok(f.img > 0 && f.ko > 0 && f.ap > 0, `이미지/한글 효과/AP 데이터 포함 (img ${f.img}, 한글 ${f.ko}, AP ${f.ap})`);
  await A.pg.click('#dbCols button[data-c=red]'); const red = await A.pg.evaluate(() => [...document.querySelectorAll('#dbGrid .cc')].length), redN = await A.pg.evaluate(() => Object.values(DB.cards).filter(c => /red/.test(c.color) && !['partner', 'case'].includes(c.type) || /red/.test(c.color)).length); ok(red > 0 && red < realN, `색상 필터 동작 (적 ${red}장)`);
  ok(A.pg.errs.length === 0, 'JS 오류 없음 ' + A.pg.errs.join('|')); await A.ctx.close();
  // ── 3) 시크릿 창 / 다른 PC: 완전히 새 컨텍스트(저장소 없음) 2개, 휴대폰 화면, IndexedDB 차단 환경
  for (const [nm, opt, init] of [['시크릿(새 컨텍스트)', { viewport: { width: 1280, height: 800 } }], ['휴대폰 화면', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }], ['IndexedDB 사용 불가', { viewport: { width: 1280, height: 800 } }, () => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); }]]) {
    const X = await mk(opt, init); await X.pg.goto(U); ok(await X.pg.evaluate(() => dbReady) === true && await X.pg.evaluate(() => Object.keys(DB.cards).length) === realN, `${nm}: 자동 로딩 (${realN}장)`); ok(X.pg.errs.length === 0, `${nm}: JS 오류 없음 ` + X.pg.errs.join('|')); await X.ctx.close();
  }
  // ── 4) 예전 버전이 IndexedDB 에 저장해 둔 카드 DB 는 무시, 내 덱은 유지
  { const X = await mk({ viewport: { width: 1280, height: 800 } }); await X.pg.goto(U); await X.pg.evaluate(() => dbReady);
    await X.pg.evaluate(async () => { await kv('set', 'db', { cards: { OLD1: { id: 'OLD1', n: '예전카드', type: 'char' } }, decks: { d1: { name: '내 덱', cards: { OLD1: 3 }, partner: '', kase: '' } } }); });
    await X.pg.reload(); await X.pg.evaluate(() => dbReady);
    const st = await X.pg.evaluate(async () => ({ hasOld: !!DB.cards.OLD1, n: Object.keys(DB.cards).length, decks: Object.values(DB.decks).map(d => d.name), stored: Object.keys((await kv('get', 'db')).cards).length }));
    ok(!st.hasOld && st.n === realN && st.decks.join() === '내 덱' && st.stored === 0, `서버 DB 가 원본: 예전 카드 무시(${st.n}장), 내 덱 유지, 브라우저에는 카드 저장 안 함`); await X.ctx.close(); }
  // ── 5) data/cards.json 없음 / 손상 / 비어 있음 → 빈 목록이 아니라 명확한 오류
  for (const [nm, mkf] of [['없음', null], ['JSON 손상', '{"cards": {oops'], ['카드 0장', '{"cards":{}}'], ['형식 오류', '{"cards":{"a":{"id":"a"}}}']]) {
    const cf = path.join(TMP, 'bad.json'); try { fs.unlinkSync(cf); } catch (e) {} if (mkf) fs.writeFileSync(cf, mkf);
    const B = await boot({ CARDS_JSON: cf }); const x = await get(B.port, '/api/cards'); let j = {}; try { j = JSON.parse(x.b); } catch (e) {}
    ok(x.s === 503 && j.error === '카드 DB를 불러올 수 없습니다.', `DB ${nm}: 서버가 503 + 명확한 오류 (${j.detail})`);
    const X = await mk(); await X.pg.goto(`http://localhost:${B.port}/`); ok(await X.pg.evaluate(() => dbReady) === false, `DB ${nm}: 클라이언트 로딩 실패로 처리`);
    ok(await X.pg.locator('#cdbErrL').isVisible() && /카드 DB를 불러올 수 없습니다\./.test(await X.pg.locator('#cdbErrL').innerText()), `DB ${nm}: 로비에 "카드 DB를 불러올 수 없습니다." 표시`);
    await X.pg.evaluate(() => openDB()); ok(await X.pg.locator('#cdbErrB').isVisible() && await X.pg.locator('#dbGrid .cc').count() === 0, `DB ${nm}: 덱 빌더는 빈 목록 대신 오류 표시`);
    ok(await X.pg.evaluate(() => Object.keys(DB.cards).length) === 0 && await X.pg.locator('#dsel').isDisabled(), `DB ${nm}: 덱 등록 불가`);
    if (nm === '없음') { fs.writeFileSync(cf, JSON.stringify({ cards: JSON.parse(fs.readFileSync(REAL, 'utf8')).cards })); await X.pg.evaluate(() => retryDb()); await X.pg.waitForTimeout(600);
      ok(await X.pg.evaluate(() => Object.keys(DB.cards).length) === realN && !(await X.pg.locator('#cdbErrB').isVisible()), '파일을 복구하고 "다시 시도" → 서버 재시작 없이 복구'); }
    await X.ctx.close(); B.c.kill(); }
  // ── 6) 카드 추가(add_new_cards.py 가 파일을 바꾼 상황): 재시작 없이 새 카드가 보임
  { const cf = path.join(TMP, 'live.json'), j = JSON.parse(fs.readFileSync(REAL, 'utf8')); fs.writeFileSync(cf, JSON.stringify(j)); const L = await boot({ CARDS_JSON: cf });
    const n1 = JSON.parse((await get(L.port, '/api/cards')).b).cards; j.cards.NEW_1 = { ...Object.values(j.cards)[0], id: 'NEW_1', n: '새카드' }; await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(cf, JSON.stringify(j));
    const n2 = JSON.parse((await get(L.port, '/api/cards')).b).cards; ok(!n1.NEW_1 && n2.NEW_1 && Object.keys(n2).length === Object.keys(n1).length + 1, '파일이 바뀌면 서버 재시작 없이 새 카드 반영'); L.c.kill(); }
  S.c.kill(); await br.close(); console.log(fail ? `\n자동 로딩 테스트 ${fail}건 실패 (통과 ${pass})` : `\n자동 로딩 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
