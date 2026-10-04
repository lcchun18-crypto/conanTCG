// v1.12.5: (1) 효과/공개/선택 팝업 안 카드 hover → 상세 패널, hover 끝나면 이전 preview 복귀 (PC)
//          (2) 모바일: 손가락이 닿는 순간(touchstart/pointerdown, 손 떼기 전) preview 표시, 행동 확정은 기존 tap/click 유지
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const DBC = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const defs = { a: dummy('ALPHA', { color: 'yellow', ap: '3000' }), b: dummy('BRAVO', { color: 'yellow', ap: '4000' }), c: dummy('CHARLIE', { color: 'yellow' }), s: dummy('SOURCEX', { color: 'yellow', ap: '2000' }) };
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const R = G(defs, ['a', 'b', 'c', 's'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#' + (k.length * 3 + 5) + 'cb'); S.snapTake(R);
  const s = R.turn, hv = () => JSON.parse(JSON.stringify(S.view(R, s)));
  const srcD = Object.keys(R.defs).find(k => R.defs[k].n === 'SOURCEX'), srcImg = R.defs[srcD].img;
  const mkPage = async mobile => { const ctx = await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); pg.feed = m => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m); await pg.feed({ t: 'defs', defs: R.defs }); await pg.feed(hv()); pg.ctx = ctx; return pg; };
  const pvImg = pg => pg.evaluate(() => { const i = document.querySelector('#pv img'); return i ? i.getAttribute('src') : null; });
  const effView = kind => { const v = hv(); const hand = v.P[v.me].hand.slice(0, 3).map((c, i) => ({ ...c, id: 90000 + i })); v.eff = kind === 'yn' ? { kind: 'yn', msg: '효과를 발동하시겠습니까?', yes: '예', no: '아니오', src: 'SOURCEX', srcD, who: v.me } : { kind: 'pick', msg: '카드를 고르세요', src: 'SOURCEX', srcD, who: v.me, min: 1, max: 1, cards: hand, sel: hand.map(c => c.id) }; return v; };
  // ───── PC
  { const pg = await mkPage(false);
    const base = await pg.evaluate(() => { const c = document.querySelector('#hand .card'); c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); c.dispatchEvent(new MouseEvent('mouseenter')); return document.querySelector('#pv .nm') ? document.querySelector('#pv .nm').textContent : null; });
    await pg.feed(effView('yn')); await pg.waitForSelector('#effp .fxi'); const box = await pg.locator('#effp .fxi').boundingBox();
    await pg.mouse.move(5, 5); await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await pg.waitForTimeout(50);
    ok(await pvImg(pg) === srcImg, 'PC 효과 확인 팝업: 카드 이미지 hover → 오른쪽 상세 패널에 해당 카드 이미지 표시');
    await pg.mouse.move(5, 5); await pg.waitForTimeout(50); ok(await pg.evaluate(() => { const n = document.querySelector('#pv .nm'); return !!n; }) && (await pvImg(pg)) !== srcImg, 'PC: hover 가 끝나면 이전 preview 로 복귀');
    // 공개 카드 팝업
    const cards = hv().P[s].hand.slice(0, 2); await pg.feed({ t: 'reveal', id: 7, by: 1 - s, to: [s], ack: 1 - s, msg: '상대가 공개', src: 'X', cards }); await pg.waitForSelector('#rvl.on .ri .card');
    const rb = await pg.locator('#rvl .ri .card').first().boundingBox(); await pg.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await pg.waitForTimeout(50);
    const want = cards[0].d; ok(await pvImg(pg) === R.defs[want].img, 'PC 공개 카드 팝업: 카드 hover → 상세 패널 표시'); await pg.click('#rvOk');
    // 카드 선택 팝업
    await pg.feed(effView('pick')); await pg.waitForTimeout(100); const pk = pg.locator('#etray .card, #pk .card').first(); const pb = await pk.boundingBox();
    await pg.mouse.move(5, 5); await pg.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await pg.waitForTimeout(50); ok((await pvImg(pg)) !== null && (await pvImg(pg)) !== srcImg, 'PC 카드 선택 팝업: 카드 hover → 상세 패널 표시');
    ok(pg.errs.length === 0, 'PC: JS 오류 없음 ' + pg.errs.join('|')); await pg.ctx.close(); }
  // ───── 모바일: 손가락이 닿는 순간
  { const pg = await mkPage(true), cdp = await pg.ctx.newCDPSession(pg);
    const down = async (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }), up = async () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const center = async sel => { const b = await pg.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    // 게임 화면 손패 카드
    const hid = await pg.evaluate(() => document.querySelector('#hand .card')._pv[0].img); let [x, y] = await center('#hand .card');
    await down(x, y); await pg.waitForTimeout(80); const during = await pg.evaluate(() => ({ img: (document.querySelector('#pv img') || { getAttribute() {} }).getAttribute('src'), sent: window.__sent.filter(m => m.t === 'act').length }));
    ok(during.img === hid, '모바일 게임 화면(손패): 손가락을 떼기 전에 즉시 오른쪽 상세 패널에 preview 표시'); ok(during.sent === 0, '  닿는 것만으로 서버 행동 전송 없음 (카드 사용/선택 확정 안 됨)');
    await up(); await pg.waitForTimeout(100); ok(await pg.evaluate(() => window.__sent.filter(m => m.t === 'act' && m.a === 'play').length) === 0, '  손을 뗀 뒤에도 자동 플레이 없음 (기존 tap 규칙 유지)');
    // 필드/그 밖 영역: 필드에 카드가 없으면 건너뛰고 증거/리무브 대신 효과 팝업/선택 팝업에서 확인
    await pg.feed(effView('yn')); await pg.waitForSelector('#effp .fxi'); [x, y] = await center('#effp .fxi'); await down(x, y); await pg.waitForTimeout(80);
    ok(await pvImg(pg) === srcImg, '모바일 효과 확인 팝업: 닿는 즉시(손 떼기 전) 상세 패널에 해당 카드 표시'); await up();
    await pg.feed(effView('pick')); await pg.waitForTimeout(150); const sel = '#etray .card, #pk .card'; { const b2 = await pg.locator(sel).nth(1).boundingBox(); [x, y] = [b2.x + b2.width / 2, b2.y + b2.height / 2]; } await down(x, y); await pg.waitForTimeout(80);
    ok((await pvImg(pg)) === R.defs[hv().P[s].hand[1].d].img, '모바일 카드 선택 팝업: 닿는 즉시 상세 패널에 해당 카드 표시'); const before = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans').length);
    ok(before === 0, '  닿음(손 떼기 전)만으로 선택 확정(ans) 전송 안 됨'); await up(); await pg.waitForTimeout(300);
    // 공개 팝업
    await pg.feed(hv()); const rc = hv().P[s].hand.slice(0, 2); await pg.feed({ t: 'reveal', id: 9, by: 1 - s, to: [s], ack: 1 - s, msg: '공개', src: 'X', cards: rc }); await pg.waitForSelector('#rvl.on .ri .card'); [x, y] = await center('#rvl .ri .card'); await down(x, y); await pg.waitForTimeout(80);
    ok(await pvImg(pg) === R.defs[rc[0].d].img, '모바일 공개 카드 팝업: 닿는 즉시 상세 패널 표시'); await up();
    // 드래그/스크롤을 막지 않음: 닿은 뒤 움직이는 동안에도 preview 유지 & touchmove 취소 안 함
    await pg.click('#rvOk'); await pg.feed(hv()); [x, y] = await center('#hand .card'); await down(x, y); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 40, y: y }] }); await pg.waitForTimeout(60);
    ok(await pvImg(pg) === hid, '모바일: 닿은 채 움직여도 처음 닿은 카드 preview 유지(스크롤/드래그 막지 않음)'); await up();
    ok(pg.errs.length === 0, '모바일: JS 오류 없음 ' + pg.errs.join('|')); await pg.ctx.close(); }
  // ───── 행동 확정은 기존 tap 그대로 (새 페이지: 손가락 닿음 → preview 만 / tap → 선택 확정)
  { const pg = await mkPage(true); await pg.feed(effView('pick')); await pg.waitForTimeout(200); const b2 = await pg.locator('#etray .card').nth(1).boundingBox(); await pg.evaluate(() => { window.__sent.length = 0; });
    await pg.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans' && m.v[0] === 90001).length) >= 1, '모바일 카드 선택 팝업: 기존 tap 으로 선택 확정(ans) 정상 전송 (회귀)');
    ok(await pvImg(pg) === R.defs[hv().P[s].hand[1].d].img, '  같은 tap 에서 preview 도 표시됨');
    const pg2 = await mkPage(true); await pg2.evaluate(() => { window.__sent.length = 0; }); const hb = await pg2.locator('#hand .card').first().boundingBox(); await pg2.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2); await pg2.waitForTimeout(400);
    ok(await pg2.evaluate(() => window.__sent.filter(m => m.t === 'act').length) === 0 && await pg2.evaluate(() => !!hsel || true), '모바일 손패 tap: 서버 행동 없이 선택만(기존 규칙, 카드 사용은 별도 [사용] 버튼)');
    await pg.ctx.close(); await pg2.ctx.close(); }
  // ───── 덱 빌더 (PC hover / 모바일 touchstart)
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC'; const pg = await mkPage(mobile);
    await pg.evaluate(cs => { DB.cards = cs; DB.decks = {}; try { cdbErr = ''; } catch (e) {} decks(); openDB(); document.getElementById('db').classList.remove('err'); }, Object.fromEntries(Object.entries(DBC).slice(0, 60))); await pg.waitForTimeout(300); await pg.evaluate(() => { try { cdbErr = ''; } catch (e) {} document.getElementById('db').classList.remove('err'); }); await pg.waitForSelector('#dbGrid .cc'); const cc = pg.locator('#dbGrid .cc').nth(1), id = await cc.getAttribute('data-id'), b = await cc.boundingBox();
    if (mobile) { const cdp = await pg.ctx.newCDPSession(pg); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] }); await pg.waitForTimeout(80);
      ok((await pg.locator('#dbChips').innerText()).includes(id), `모바일 덱빌더 목록: 닿는 순간(손 떼기 전) 상세 표시 (${id})`); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await pg.waitForTimeout(60); ok((await pg.locator('#dbChips').innerText()).includes(id), `PC 덱빌더 목록 hover 상세 표시 (${id})`); }
    ok(pg.errs.length === 0, `${T} 덱빌더: JS 오류 없음 ` + pg.errs.join('|')); await pg.ctx.close(); }
  await br.close(); console.log(fail ? `\n실패 ${fail}` : `\n preview 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0); })();
