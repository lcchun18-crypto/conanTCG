// v1.12.6: 모바일에서 손가락을 떼지 않고 여러 카드를 훑으면 상세 패널이 A → B → C 로 실시간 변경 (손패/필드/팝업/덱빌더). 훑기는 preview 전용.
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const DBC = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const defs = { a: dummy('ALPHA', { color: 'yellow', ap: '3000' }), b: dummy('BRAVO', { color: 'yellow', ap: '4000' }), c: dummy('CHARLIE', { color: 'yellow' }), s: dummy('SOURCEX', { color: 'yellow', ap: '2000' }) };
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const R = G(defs, ['a', 'b', 'c', 's'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); ['a', 'b', 'c'].forEach(k => U.field(R, R.turn, k)); for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#' + (k.length * 3 + 5) + 'cb'); S.snapTake(R);
  const s = R.turn, hv = () => JSON.parse(JSON.stringify(S.view(R, s)));
  const srcD = Object.keys(R.defs).find(k => R.defs[k].n === 'SOURCEX'), srcImg = R.defs[srcD].img;
  const mkPage = async mobile => { const ctx = await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); pg.feed = m => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m); await pg.feed({ t: 'defs', defs: R.defs }); await pg.feed(hv()); pg.ctx = ctx; return pg; };
  const pvImg = pg => pg.evaluate(() => { const i = document.querySelector('#pv img'); return i ? i.getAttribute('src') : null; });
  const effView = kind => { const v = hv(); const hand = v.P[v.me].hand.slice(0, 3).map((c, i) => ({ ...c, id: 90000 + i })); v.eff = kind === 'yn' ? { kind: 'yn', msg: '효과를 발동하시겠습니까?', yes: '예', no: '아니오', src: 'SOURCEX', srcD, who: v.me } : { kind: 'pick', msg: '카드를 고르세요', src: 'SOURCEX', srcD, who: v.me, min: 1, max: 1, cards: hand, sel: hand.map(c => c.id) }; return v; };
  // ───── 모바일: 손가락을 떼지 않고 여러 카드를 훑는다 (A → B → C 로 상세가 실시간 변경)
  const mob = await mkPage(true), cdp = await mob.ctx.newCDPSession(mob);
  const tdn = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }), tmv = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }), tup = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const ctr = async (pg, loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const sentActs = pg => pg.evaluate(() => window.__sent.filter(m => m.t === 'act').length);
  // 게임 화면: 손패 / 필드
  const fieldIdx = await mob.evaluate(() => { const seen = new Set(); return [...document.querySelectorAll('#board .card')].map((e, i) => { const r = e.getBoundingClientRect(); const im = e._pv && e._pv[0].img; if (!im || r.width <= 0 || e.closest('#hand') || seen.has(im)) return -1; seen.add(im); return i; }).filter(i => i >= 0); });
  for (const label of ['손패', '필드 캐릭터']) {
    const locs = label === '손패' ? mob.locator('#hand .card') : mob.locator('#board .card'); const idxs = label === '손패' ? null : fieldIdx; const n = idxs ? idxs.length : await locs.count();
    ok(n >= 3, `모바일 ${label}: 비교할 카드 3장 이상 존재 (${n}장)`); if (n < 3) continue;
    const at = i => idxs ? locs.nth(idxs[i]) : locs.nth(i);
    const srcOf = i => at(i).evaluate(e => e._pv[0].img); const imgs = [await srcOf(0), await srcOf(1), await srcOf(2)];
    ok(new Set(imgs).size === 3, `  ${label} 3장은 서로 다른 이미지`);
    const P = [await ctr(mob, at(0)), await ctr(mob, at(1)), await ctr(mob, at(2))]; const a0 = await sentActs(mob);
    await tdn(...P[0]); await mob.waitForTimeout(60); ok(await pvImg(mob) === imgs[0], `  ${label}: A 에 손가락 닿음 → A 상세`);
    await tmv(P[0][0] + 1, P[0][1]); await tmv((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2); await tmv(...P[1]); await mob.waitForTimeout(60); ok(await pvImg(mob) === imgs[1], `  ${label}: 손을 떼지 않고 B 위로 이동 → 즉시 B 상세`);
    await tmv(...P[2]); await mob.waitForTimeout(60); ok(await pvImg(mob) === imgs[2], `  ${label}: 계속 이동해 C 위 → 즉시 C 상세`);
    await tmv(...P[0]); await mob.waitForTimeout(60); ok(await pvImg(mob) === imgs[0], `  ${label}: 다시 A 로 돌아오면 A 상세`);
    await tmv(...P[1]); await mob.waitForTimeout(40); await tmv(2, 2); await mob.waitForTimeout(40); ok(await pvImg(mob) === imgs[1], `  ${label}: 빈 공간 통과 중에는 마지막 preview 유지`);
    await tup(); await mob.waitForTimeout(80); ok(await sentActs(mob) === a0, `  ${label}: 훑는 동안/손 뗄 때 서버 행동(선택·등장·공격) 전송 없음`);
    ok(await pvImg(mob) === imgs[1], `  ${label}: 손을 떼도 마지막 preview 유지`);
  }
  // 효과 팝업(선택) 안에서도 훑기
  await mob.feed(effView('pick')); await mob.waitForTimeout(200); { const q = mob.locator('#etray .card, #pk .card'); const n = await q.count(); ok(n >= 3, `모바일 선택 팝업: 카드 ${n}장`);
    if (n >= 3) { const imgs = []; for (let i = 0; i < 3; i++) imgs.push(await q.nth(i).evaluate(e => e._pv[0].img)); const P = []; for (let i = 0; i < 3; i++) P.push(await ctr(mob, q.nth(i)));
      await tdn(...P[0]); await mob.waitForTimeout(60); const r = [await pvImg(mob)]; await tmv(...P[1]); await mob.waitForTimeout(60); r.push(await pvImg(mob)); await tmv(...P[2]); await mob.waitForTimeout(60); r.push(await pvImg(mob));
      ok(r.every((v, i) => v === imgs[i]), '모바일 카드 선택 팝업: A → B → C 훑기'); ok(await mob.evaluate(() => window.__sent.filter(m => m.a === 'ans').length) === 0, '  훑는 동안 선택 확정(ans) 전송 없음'); await tup(); } }
  // 공개 팝업
  await mob.feed(hv()); { const rc = hv().P[s].hand.slice(0, 3); await mob.feed({ t: 'reveal', id: 11, by: 1 - s, to: [s], ack: 1 - s, msg: '공개', src: 'X', cards: rc }); await mob.waitForSelector('#rvl.on .ri .card'); const q = mob.locator('#rvl .ri .card'); const P = []; for (let i = 0; i < 3; i++) P.push(await ctr(mob, q.nth(i)));
    const r = []; await tdn(...P[0]); await mob.waitForTimeout(60); r.push(await pvImg(mob)); await tmv(...P[1]); await mob.waitForTimeout(60); r.push(await pvImg(mob)); await tmv(...P[2]); await mob.waitForTimeout(60); r.push(await pvImg(mob)); await tup();
    ok(r.every((v, i) => v === R.defs[rc[i].d].img), '모바일 공개 팝업: A → B → C 훑기'); await mob.click('#rvOk'); }
  // 효과 확인 팝업(yn) 의 카드 → 다른 카드(손패) 로 이동 (카드 종류가 달라도 hit-test 로 추적)
  await mob.feed(effView('yn')); await mob.waitForSelector('#effp .fxi'); { const P0 = await ctr(mob, mob.locator('#effp .fxi').first()), P1 = await ctr(mob, mob.locator('#hand .card').first()); await tdn(...P0); await mob.waitForTimeout(60); const a = await pvImg(mob); await tmv(...P1); await mob.waitForTimeout(60); const b = await pvImg(mob); await tup();
    ok(a === srcImg && b === await mob.evaluate(() => document.querySelector('#hand .card')._pv[0].img), '모바일 효과 확인 팝업 카드 → 손패 카드로 이동해도 추적'); }
  ok(mob.errs.length === 0, '모바일 게임: JS 오류 없음 ' + mob.errs.join('|')); await mob.ctx.close();
  // ───── 덱 빌더: 카드 목록 / 덱 영역
  { const pg = await mkPage(true), c2 = await pg.ctx.newCDPSession(pg); const dn = (x, y) => c2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }), mv = (x, y) => c2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }), up = () => c2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const ids = Object.keys(DBC).filter(k => !['case', 'partner'].includes(DBC[k].type)).slice(0, 60);
    await pg.evaluate(cs => { DB.cards = cs; DB.decks = {}; try { cdbErr = ''; } catch (e) {} decks(); openDB(); document.getElementById('db').classList.remove('err'); }, Object.fromEntries(ids.map(k => [k, DBC[k]]))); await pg.waitForTimeout(300); await pg.evaluate(() => { try { cdbErr = ''; } catch (e) {} document.getElementById('db').classList.remove('err'); });
    await pg.waitForSelector('#dbGrid .cc'); const chips = () => pg.locator('#dbChips').innerText(); const wsnap = () => pg.evaluate(() => JSON.stringify(W));
    const sweep = async (loc, tag, idsOf) => { const P = []; for (let i = 0; i < 3; i++) P.push(await ctr(pg, loc.nth(i))); const w0 = await wsnap(); const r = [];
      await dn(...P[0]); await pg.waitForTimeout(60); r.push(await chips()); await mv(...P[1]); await pg.waitForTimeout(60); r.push(await chips()); await mv(...P[2]); await pg.waitForTimeout(60); r.push(await chips()); await up(); await pg.waitForTimeout(120);
      if (!r.every((t, i) => t.includes(idsOf[i]))) console.log('DBG', tag, await pg.evaluate(P => P.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.tagName + '#' + e.id + '.' + e.className + ' <' + (e.parentElement && e.parentElement.className) + '>'); }), P), JSON.stringify(r.map(t => t.slice(-30))), JSON.stringify(P)); ok(r.every((t, i) => t.includes(idsOf[i])), `모바일 덱빌더 ${tag}: A → B → C 훑으면 상세가 ${idsOf.join(' → ')} 로 변경`); ok(await wsnap() === w0, `  ${tag}: 훑는 동안/손 뗄 때 카드 추가·삭제 없음`); };
    const gl = pg.locator('#dbGrid .cc'); const gids = []; for (let i = 0; i < 3; i++) gids.push(await gl.nth(i).getAttribute('data-id')); await sweep(gl, '카드 목록', gids);
    await pg.addStyleTag({ content: '#cdbErrB{display:none!important}' }); await pg.evaluate(a => a.forEach(id => bAdd(id)), gids); await pg.waitForTimeout(150); await pg.addStyleTag({ content: '#cdbErrB{display:none!important}' });
    const dl = pg.locator('#dbMain .dg'); const dn3 = await dl.count(); ok(dn3 >= 3, `모바일 덱빌더 덱 영역: 카드 묶음 ${dn3}개`);
    if (dn3 >= 3) { const dids = []; for (let i = 0; i < 3; i++) dids.push(await dl.nth(i).getAttribute('data-id')); await sweep(dl, '덱 영역', dids); }
    ok(pg.errs.length === 0, '모바일 덱빌더: JS 오류 없음 ' + pg.errs.join('|')); await pg.ctx.close(); }
  // ───── 기존 tap 동작 회귀: 이동 없는 tap 은 그대로 click 으로 동작
  { const pg = await mkPage(true); await pg.feed(effView('pick')); await pg.waitForTimeout(200); const b2 = await pg.locator('#etray .card').nth(1).boundingBox(); await pg.evaluate(() => { window.__sent.length = 0; });
    await pg.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans' && m.v[0] === 90001).length) >= 1, '모바일 카드 선택 팝업: 기존 tap 으로 선택 확정(ans) 정상 전송 (회귀)'); await pg.ctx.close(); }
  await br.close(); console.log(fail ? `\n실패 ${fail}` : `\n preview 훑기 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0); })();
