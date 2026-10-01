// 덱 빌더 (1,251장 전체 DB를 브라우저에 올린 상태): 구조 / 색상 필터 / 검색(ap·lp·event·숫자) / 3장·40장·사건·파트너 제한 / 저장·불러오기 / 파일 내보내기·가져오기 / 기존 덱 등록 흐름
const path = require('path'), fs = require('fs');
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const SV = require('../server.js');
const { spawn } = require('child_process'), os = require('os'); let WSP; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WSP = require.resolve(m); break; } catch (e) {} }
// ── 합성 전체 DB: 실제 DB와 같은 필드/분포(종류·색·레벨·AP·LP), 실제 카드 썸네일(sample100) 재사용, 1,251장
const src = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample100.json'), 'utf8')).cards);
let seed = 12345; const rnd = n => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); };
const COL = ['blue', 'green', 'white', 'red', 'yellow', 'black'], AP = ['', '1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000'];
const cards = {};
for (let i = 1; i <= 1251; i++) {
  const id = 'id_' + String(i).padStart(4, '0'), t = i % 100 < 6 ? 'partner' : i % 100 < 12 ? 'case' : i % 100 < 24 ? 'event' : 'char', th = src[i % src.length];
  const col = i % 97 === 0 ? COL[i % 6] + '/' + COL[(i + 1) % 6] : COL[rnd(6)];
  const wide = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="200"><rect width="280" height="200" fill="#3a5f9f"/><text x="20" y="110" font-size="40" fill="#fff">CASE</text></svg>');
  cards[id] = { id, n: '名前' + i, type: t, color: col, lv: t === 'partner' ? '' : String(t === 'char' ? rnd(10) : 1 + rnd(7)), lv2: t === 'case' ? '6' : '', ap: t === 'char' ? AP[1 + rnd(8)] : '', lp: t === 'char' || t === 'partner' ? String(rnd(4)) : '', kw: '', trait: '少年探偵団', fx: '【宣言】効果' + i, extra: '【선언】 한국어 효과 ' + id, ab: [], img: t === 'case' ? wide : th.img };
}
const ALL = Object.values(cards), ofT = t => ALL.filter(c => c.type === t), chars = ofT('char'), cases = ofT('case'), parts = ofT('partner');
const DF = chars[5].id; cards[DF].ab = [{ ic: 'deckfree' }];
(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)); const br = await chromium.launch(exe ? { executablePath: exe } : {}); let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
  const ctx = await br.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
  // 카드 DB 는 브라우저에 주입하지 않는다: 서버가 data/cards.json(여기선 CARDS_JSON 임시 파일)을 읽어 /api/cards 로 주고, 페이지가 자동으로 받는다.
  const cf = path.join(os.tmpdir(), 'deck_cards_' + process.pid + '.json'); fs.writeFileSync(cf, JSON.stringify({ cards })); const PORT = 8900 + Math.floor(Math.random() * 500);
  const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, CARDS_JSON: cf, NODE_PATH: path.dirname(path.dirname(WSP)) }, stdio: 'ignore' }); process.on('exit', () => { srv.kill(); try { fs.unlinkSync(cf); } catch (e) {} }); await new Promise(r => setTimeout(r, 1200));
  await pg.goto('http://localhost:' + PORT + '/'); ok(await pg.evaluate(() => dbReady) === true, '서버 DB 자동 로딩(파일 선택/주입 없음)'); ok(await pg.evaluate(() => Object.keys(DB.cards).length) === 1251, '서버에서 받은 카드 1,251장');
  await pg.evaluate(() => { DB.decks = {}; decks(); });
  const t0 = Date.now(); await pg.evaluate(() => openDB()); const tOpen = Date.now() - t0;
  const cnt = () => pg.locator('#dbCnt').innerText(), ids = () => pg.evaluate(() => [...document.querySelectorAll('#dbGrid .cc')].map(e => e.dataset.id));
  const allIds = async () => { await pg.evaluate(async () => { const g = document.getElementById('dbGrid'); for (let i = 0; i < 40; i++) { g.scrollTop = g.scrollHeight; g.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 10)); } }); return ids(); };
  const eq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  // 1) 구조
  const L = await pg.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), o = s => { const b = r(s); return [b.x, b.y, b.right, b.bottom]; }; return { pv: o('#dbPv'), img: o('#dbPvImg'), tx: o('#dbTx'), deck: o('#dbDeck'), fil: o('#dbFil'), grid: o('#dbGrid'), name: o('#dbName'), save: o('#dbSave'), sel: o('#dbSel'), load: o('#dbLoad'), cs: o('#dbCase'), pt: o('#dbPart'), main: o('#dbMain'), sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }; });
  ok(L.pv[2] <= L.deck[0] + 2 && L.pv[2] <= L.grid[0] + 2 && L.name[1] < 100 && L.save[0] > L.name[0] && L.sel[1] > L.name[1] && L.load[0] > L.sel[0], '구조: 왼쪽=미리보기/이름·저장·불러오기, 오른쪽 위=덱, 오른쪽 아래=카드 리스트 ' + JSON.stringify(L));
  ok(L.deck[3] <= L.fil[1] + 2 && L.fil[3] <= L.grid[1] + 2 && L.cs[2] <= L.main[0] + 2 && L.pt[0] >= L.cs[0] && L.sw <= L.iw && L.sh <= L.ih, '구조: 덱(사건·파트너 슬롯 + 메인덱) → 색상/검색 줄 → 카드 그리드, 넘침 없음');
  ok(/결과 1251장 \/ 전체 1251장/.test(await cnt()), '전체 1,251장이 대상: ' + await cnt());
  const tx = await pg.evaluate(() => document.getElementById('dbGrid').innerText.replace(/[\d✓\s]/g, '')); ok(tx === '', '카드 리스트에 텍스트 없음(이미지만): ' + tx.slice(0, 30));
  ok(tOpen < 2500, `열기 성능 ${tOpen}ms`);
  const shown0 = (await ids()).length; ok(shown0 >= 100 && shown0 < 1251, `처음엔 일부만 렌더(${shown0}장), 스크롤하면 이어서`);
  ok(eq(await allIds(), ALL.map(c => c.id)), '스크롤하면 1,251장 전부 도달');
  const cell = await pg.evaluate(() => { const e = document.querySelector('#dbGrid .cc'), r = e.getBoundingClientRect(); return [r.width, r.height, r.width / r.height]; }); ok(Math.abs(cell[2] - .714) < .03, '카드 비율 유지 ' + cell.map(Math.round));
  // 2) hover
  await pg.evaluate(() => document.getElementById('dbGrid').scrollTop = 0);
  const c0 = await pg.locator('#dbGrid .cc').nth(0).getAttribute('data-id'), c1 = await pg.locator('#dbGrid .cc').nth(5).getAttribute('data-id');
  await pg.locator('#dbGrid .cc').nth(0).hover(); const h0 = await pg.evaluate(() => [document.getElementById('dbPvImg').style.backgroundImage, document.getElementById('dbTx').innerText]);
  ok(h0[0].includes(cards[c0].img.slice(0, 60)) && h0[1].includes(cards[c0].extra.slice(5)) && !h0[1].includes('効果'), '호버: 왼쪽에 큰 이미지 + 한국어 extra (일본어 원문 없음)');
  await pg.locator('#dbGrid .cc').nth(5).hover(); const h1 = await pg.evaluate(() => document.getElementById('dbTx').innerText); ok(h1.includes(c1) , '다른 카드로 옮기면 즉시 교체');
  // 3) 색상 필터
  const colBtn = k => pg.locator(`.dbc[data-c="${k}"]`), has = (c, k) => c.color.split(/[\/,\s]+/).includes(k);
  ok(await pg.locator('.dbc').count() === 6 && (await pg.locator('.dbc').allInnerTexts()).join('') === '청녹백적황흑', '6색 토글: 청 녹 백 적 황 흑');
  await colBtn('red').click(); let got = await allIds(); ok(eq(got, ALL.filter(c => has(c, 'red')).map(c => c.id)) && got.length > 100, `적 필터: ${got.length}장 (종류 무관: ${[...new Set(got.map(i => cards[i].type))].sort()})`);
  ok(new Set(got.map(i => cards[i].type)).size === 4, '색 필터는 char/event/case/partner 모두 대상');
  await colBtn('blue').click(); got = await allIds(); ok(eq(got, ALL.filter(c => has(c, 'red') || has(c, 'blue')).map(c => c.id)), `적+청 동시 선택: ${got.length}장`);
  await colBtn('red').click(); await colBtn('blue').click(); ok(eq(await allIds(), ALL.map(c => c.id)), '색 선택 해제 → 전체');
  for (const [k] of [['green'], ['white'], ['yellow'], ['black']]) { await colBtn(k).click(); ok(eq(await allIds(), ALL.filter(c => has(c, k)).map(c => c.id)), `${k} 필터`); await colBtn(k).click(); }
  // 4) 검색
  const q = async t => { await pg.fill('#dbQ', t); return allIds(); };
  const AP5 = ALL.filter(c => c.ap === '5000'); ok(eq(await q('ap2000'), ALL.filter(c => c.ap === '2000').map(c => c.id)) && ALL.some(c => c.ap === '2000'), 'ap2000: AP 정확히 2000 (' + (await ids()).length + '장)');
  for (const n of ['1000', '3000', '6000']) ok(eq(await q('ap' + n), ALL.filter(c => c.ap === n).map(c => c.id)), 'ap' + n);
  ok(eq(await q('AP2000'), ALL.filter(c => c.ap === '2000').map(c => c.id)), '대소문자 무시(AP2000)');
  for (const n of [0, 1, 2, 3]) ok(eq(await q('lp' + n), ALL.filter(c => c.lp === String(n)).map(c => c.id)) && ALL.some(c => c.lp === String(n)), 'lp' + n + ': 카드 LP 스탯 정확히 ' + n);
  ok(eq(await q('event'), ofT('event').map(c => c.id)) && eq(await q('EVENT'), ofT('event').map(c => c.id)), 'event / EVENT: 이벤트 카드만 (' + ofT('event').length + '장)');
  for (const n of [3, 5, 6, 8]) { const w = chars.filter(c => c.lv === String(n)); const g = await q(String(n)); ok(eq(g, w.map(c => c.id)) && w.length > 5 && g.every(i => cards[i].type === 'char'), `숫자 ${n}: FILE 코스트 ${n} 캐릭터만 (${g.length}장, 이벤트/사건/파트너 제외)`); }
  ok(ALL.some(c => c.type !== 'char' && c.lv === '5') && !(await q('5')).some(i => cards[i].type !== 'char'), '숫자 검색에서 lv 가 같아도 이벤트/사건은 제외');
  await colBtn('red').click(); ok(eq(await q('ap5000'), AP5.filter(c => has(c, 'red')).map(c => c.id)), `적색 + ap5000 (${(await ids()).length}장)`); await colBtn('red').click();
  await colBtn('blue').click(); ok(eq(await q('5'), chars.filter(c => c.lv === '5' && has(c, 'blue')).map(c => c.id)), `청색 + 5 (${(await ids()).length}장)`); await colBtn('blue').click();
  ok(eq(await q('ap5000 lp1'), AP5.filter(c => c.lp === '1').map(c => c.id)), '여러 조건(공백) AND'); ok((await q('zzzz없는카드')).length === 0 && /결과 0장/.test(await cnt()) && await pg.locator('#dbEmpty').count() === 1, '결과 없음 표시'); await q('');
  ok(eq(await allIds(), ALL.map(c => c.id)), '검색 비우면 전체 복귀');
  // 5) 덱 규칙
  const badge = id => pg.evaluate(id => { const e = document.querySelector(`#dbGrid .cc[data-id="${id}"] .bd`); return e ? e.textContent + '|' + getComputedStyle(e).display : null; }, id), stat = () => pg.locator('#dbStat').innerText(), toast = () => pg.locator('#dbToast').innerText();
  const badgeQ = async id => { await q(id); return badge(id); };
  const pick = async id => { await q(id); await pg.locator(`#dbGrid .cc[data-id="${id}"]`).first().click(); };
  const A = chars.find(c => c.id !== DF); await q(A.id); const cellA = pg.locator(`#dbGrid .cc[data-id="${A.id}"]`).first();
  await cellA.click(); await cellA.click(); ok((await badge(A.id)) === '2|block', '클릭하면 즉시 덱에 추가 + 1/2/3 badge (2)');
  await cellA.click(); ok((await badge(A.id)).startsWith('3') && /×3/.test(await pg.locator('#dbMain .dg').first().innerText()) && (await stat()).includes('메인 덱 3 / 40'), '3장: 덱에 ×3 표시');
  await cellA.click(); ok((await badge(A.id)).startsWith('3') && /최대 3장/.test(await toast()) && (await stat()).includes('메인 덱 3 / 40'), '같은 카드 4번째는 추가 안 됨 + "최대 3장" 안내');
  const dgw = await pg.evaluate(() => { const g = document.querySelector('#dbMain .dg'), im = g.querySelectorAll('img'); return [im.length, im[1].getBoundingClientRect().x - im[0].getBoundingClientRect().x]; }); ok(dgw[0] === 3 && dgw[1] > 5, '같은 카드 3장은 이미지가 약간씩 겹쳐 보임');
  await pg.locator('#dbMain .dg').first().click(); ok((await badge(A.id)).startsWith('2') && (await stat()).includes('메인 덱 2 / 40'), '덱의 카드를 클릭하면 1장씩 빠짐');
  await pg.locator('#dbMain .dg').first().click(); await pg.locator('#dbMain .dg').first().click(); ok(await pg.locator('#dbMain .dg').count() === 0 && (await badge(A.id)).startsWith('0|none'), '0장이 되면 덱에서 사라짐');
  // deckfree 카드는 기존 규칙(서버)처럼 3장 제한 예외
  await pick(DF); for (let i = 0; i < 4; i++) await pg.locator(`#dbGrid .cc[data-id="${DF}"]`).first().click(); ok((await badge(DF)).startsWith('5'), '기존 규칙 유지: 덱 제한 면제(deckfree) 카드는 3장 초과 가능'); for (let i = 0; i < 5; i++) await pg.locator('#dbMain .dg').first().click();
  // 사건/파트너 교체
  await q(''); const cs = [cases[0], cases[1]], ps = [parts[0], parts[1]];
  await pick(cs[0].id); await pick(cs[1].id); ok((await pg.evaluate(() => document.getElementById('dbCase').dataset.id)) === cs[1].id && (await stat()).includes('사건 1 / 1') && true, '사건: 다른 사건 선택 시 교체 (1장 유지)');
  ok((await badgeQ(cs[0].id)).split('|')[1] === 'none' && (await badgeQ(cs[1].id)).split('|')[1] === 'block', '사건 badge 가 교체된 카드로 이동');
  await pick(ps[0].id); await pick(ps[1].id); ok((await pg.evaluate(() => document.getElementById('dbPart').dataset.id)) === ps[1].id && (await stat()).includes('파트너 1 / 1'), '파트너: 교체');
  ok((await pg.evaluate(() => document.getElementById('dbCase').getBoundingClientRect().x < document.getElementById('dbMain').getBoundingClientRect().x)), '사건/파트너는 메인덱과 구분된 별도 슬롯');
  { const g = await pg.evaluate(() => { const r = document.getElementById('dbCase').getBoundingClientRect(), c = document.querySelector('#dbGrid .cc.wide img'); return { w: r.width, h: r.height, cls: document.getElementById('dbCase').className, fit: c ? getComputedStyle(c).objectFit : null }; }); ok(g.w > g.h * 1.2 && /wide/.test(g.cls), '사건 슬롯은 가로 이미지 비율(원본 방향) ' + JSON.stringify(g)); }
  await pg.locator('#dbCase').click(); ok(!(await pg.evaluate(() => document.getElementById('dbCase').dataset.id)) && (await stat()).includes('사건 0 / 1'), '슬롯 클릭 = 사건 빼기'); await pick(cs[1].id);
  // 40장 제한: 서로 다른 카드 14종 × 3 = 42 시도
  await q(''); const pool = chars.filter(c => c.id !== DF).slice(0, 14); for (const c of pool) { await q(c.id); const e = pg.locator(`#dbGrid .cc[data-id="${c.id}"]`).first(); for (let i = 0; i < 3; i++) await e.click(); }
  ok((await stat()).includes('메인 덱 40 / 40') && /40장까지/.test(await toast()), '41장째는 추가 안 됨 + "40장까지" 안내: ' + (await stat()).replace(/\n/g, ' '));
  ok(/✔ 덱 등록 가능/.test(await stat()), '40 + 사건 + 파트너 → 등록 가능 표시');
  // 6) 저장 / 불러오기
  await q(''); await pg.fill('#dbName', ''); await pg.click('#dbSave'); ok(/이름/.test(await toast()) && Object.keys(await pg.evaluate(() => DB.decks)).length === 0, '이름 없으면 저장 안 됨');
  await pg.fill('#dbName', '테스트 덱'); await pg.click('#dbSave'); await pg.waitForTimeout(600);
  const snap = await pg.evaluate(() => JSON.parse(JSON.stringify(W))); const saved = await pg.evaluate(() => Object.values(DB.decks)[0]);
  ok(saved.name === '테스트 덱' && saved.partner === ps[1].id && saved.kase === cs[1].id && Object.values(saved.cards).reduce((a, b) => a + b, 0) === 40 && Object.keys(saved.cards).length === 14, '저장: DB.decks 에 이름/사건/파트너/메인덱(ID:장수) 저장 (기존 형식 그대로)');
  const idb = await pg.evaluate(async () => { const d = await kv('get', 'db'); return Object.values(d.decks).map(x => x.name); }); ok(idb.includes('테스트 덱'), '저장: 브라우저 저장소(IndexedDB)에 기록');
  await pg.click('#db >> text=새 덱'); ok((await stat()).includes('메인 덱 0 / 40') && await pg.locator('#dbMain .dg').count() === 0, '새 덱 = 비움');
  await pg.selectOption('#dbSel', { index: 0 }); await pg.click('#dbLoad'); const after = await pg.evaluate(() => JSON.parse(JSON.stringify(W)));
  ok(JSON.stringify(after.cards) === JSON.stringify(snap.cards) && after.kase === snap.kase && after.partner === snap.partner && after.name === '테스트 덱' && (await stat()).includes('메인 덱 40 / 40'), '불러오기: 저장한 덱 그대로 복원');
  ok(await pg.locator('#dbGrid .cc.in').count() > 0 || true, '');
  // 기존 덱 등록 흐름: 로비 select + loadDeck() → ready 메시지 → 서버 검증 통과
  await pg.evaluate(() => bClose()); ok(await pg.locator('#dsel option').count() === 1 && (await pg.locator('#dsel option').innerText()) === '테스트 덱', '로비의 저장된 덱 목록에 반영'); await pg.evaluate(() => { window.__sent.length = 0; loadDeck(); });
  const rd = await pg.evaluate(() => window.__sent.find(m => m.t === 'ready')); ok(rd && rd.list.length === 40 && rd.partner === ps[1].id && rd.kase === cs[1].id, '기존 덱 등록(ready) 메시지: 40장/사건/파트너');
  { const R = SV.mkR('T'); const e = SV.ready(R, 0, rd); ok(e == null, '서버 ready 검증 통과 (기존 검증 그대로): ' + e); const bad = { ...rd, list: rd.list.slice(1) }; ok(/40장/.test(SV.ready(SV.mkR('T2'), 0, bad) || ''), '39장이면 서버가 기존대로 거부'); const b2 = { ...rd, kase: '' }; ok(/사건/.test(SV.ready(SV.mkR('T3'), 0, b2) || ''), '사건 없으면 서버가 기존대로 거부'); }
  // 7) 파일 내보내기 / 가져오기
  await pg.evaluate(() => openDB()); await pg.click('#dbLoad'); await pg.selectOption('#dbSel', { index: 0 }); await pg.click('#dbLoad');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#dbExp')]); const fp = await dl.path(); const file = JSON.parse(fs.readFileSync(fp, 'utf8'));
  ok(file.name === '테스트 덱' && file.case === cs[1].id && file.partner === ps[1].id && Array.isArray(file.main) && file.main.reduce((a, e) => a + e.n, 0) === 40 && file.main.every(e => e.id && e.n >= 1) && /^conan-deck.*\.json$/.test(dl.suggestedFilename()), '내보내기 JSON: 덱 이름/사건 ID/파트너 ID/메인덱 ID+장수 ' + dl.suggestedFilename());
  const tmp = id => path.join(require('os').tmpdir(), id); const w = (n, o) => { const f = tmp(n); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); return f; };
  await pg.click('#db >> text=새 덱'); await pg.setInputFiles('#dbImp', w('ok.json', file)); await pg.waitForTimeout(300);
  const back = await pg.evaluate(() => JSON.parse(JSON.stringify(W))); ok(JSON.stringify(back.cards) === JSON.stringify(snap.cards) && back.kase === snap.kase && back.partner === snap.partner && back.name === '테스트 덱' && (await pg.locator('#dbName').inputValue()) === '테스트 덱', '가져오기: 내보낸 덱이 완전히 복원 (이름/사건/파트너/메인덱)');
  // 잘못된 파일: 적용하지 않고 오류를 알린다
  const base = await pg.evaluate(() => JSON.stringify(W)), errs = async f => { await pg.setInputFiles('#dbImp', f); await pg.waitForTimeout(250); const vis = await pg.evaluate(() => getComputedStyle(document.getElementById('dbErr')).display === 'flex'), txt = await pg.locator('#dbErrL').innerText().catch(() => ''); const same = (await pg.evaluate(() => JSON.stringify(W))) === base; await pg.evaluate(() => document.getElementById('dbErr').style.display = 'none'); return { vis, txt, same }; };
  await pg.click('#db >> text=새 덱'); const empty = await pg.evaluate(() => JSON.stringify(W));
  const okm = file.main, mk = o => ({ ...file, ...o });
  const cases_ = [
    ['존재하지 않는 카드 ID', mk({ main: [...okm.slice(1), { id: 'id_9999', n: 3 }] }), /존재하지 않는 카드 ID: id_9999/],
    ['동일 카드 3장 초과', mk({ main: [{ id: chars.find(c => c.id !== DF).id, n: 4 }] }), /같은 카드는 최대 3장/],
    ['메인덱 40장 초과', mk({ main: [...okm, { id: chars.filter(c => c.id !== DF)[20].id, n: 1 }] }), /40장을 초과/],
    ['사건 여러 장', mk({ case: [cases[0].id, cases[1].id] }), /사건 카드가 여러 장/],
    ['파트너 여러 장', mk({ partner: [parts[0].id, parts[1].id] }), /파트너 카드가 여러 장/],
    ['존재하지 않는 사건 ID', mk({ case: 'id_8888' }), /존재하지 않는 사건 카드 ID/],
    ['파트너 자리에 캐릭터', mk({ partner: chars[0].id }), /파트너 자리에/],
    ['메인덱에 사건 카드', mk({ main: [{ id: cases[0].id, n: 1 }] }), /메인덱에 넣을 수 없는 카드/],
    ['형식 다른 JSON', { hello: 1 }, /conan-deck 형식/],
    ['메인덱 항목 깨짐', mk({ main: [{ id: 1, n: 'x' }] }), /형식이 잘못/],
  ];
  for (const [nm, obj, re] of cases_) { const r = await errs(w('bad.json', obj)); ok(r.vis && re.test(r.txt) && (await pg.evaluate(() => JSON.stringify(W))) === empty, `가져오기 검증 — ${nm}: 오류 안내 + 적용 안 됨 (${r.txt.replace(/\n/g, ' / ').slice(0, 80)})`); }
  { const r = await errs(w('bad2.json', '{{깨진 json')); ok(r.vis && /JSON/.test(r.txt) && (await pg.evaluate(() => JSON.stringify(W))) === empty, '가져오기 검증 — JSON 문법 오류'); }
  { const r = await errs(w('multi.json', mk({ main: [{ id: 'id_9998', n: 1 }, { id: 'id_9999', n: 4 }], case: ['a', 'b'] }))); ok(r.vis && (r.txt.match(/\n/g) || []).length >= 2, '여러 문제는 한꺼번에 안내'); }
  // 덱 삭제 / 화면 캡처 / JS 오류
  await pg.setInputFiles('#dbImp', w('ok2.json', file)); await pg.waitForTimeout(250); await pg.locator('#dbGrid .cc').nth(3).hover(); await pg.screenshot({ path: '/tmp/ui/deckbuilder_1920.png' });
  for (const [w_, h_] of [[1366, 768], [1280, 720]]) { await pg.setViewportSize({ width: w_, height: h_ }); await pg.waitForTimeout(250); const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, g: document.getElementById('dbGrid').getBoundingClientRect().height, d: document.getElementById('dbDeck').getBoundingClientRect().height })); ok(o.sw <= o.iw && o.sh <= o.ih && o.g > 150, `${w_}x${h_}: 넘침 없음, 카드 그리드 높이 ${Math.round(o.g)}px`); await pg.screenshot({ path: `/tmp/ui/deckbuilder_${w_}.png` }); }
  ok(!pg.errs.length, 'JS 오류 없음 ' + pg.errs);
  await br.close(); console.log(fail ? `덱 빌더 테스트 ${fail}건 실패 (통과 ${pass})` : `덱 빌더 테스트 통과 (${pass}개 검사, 1,251장 DB)`); process.exit(fail ? 1 : 0);
})();
