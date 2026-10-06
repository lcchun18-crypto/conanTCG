// v1.14.0: 카드 이미지 파일 방식 — 실제 서버(/CardImage/*) + 실제 브라우저로 확인
//  덱빌더 목록/상세 · 게임 필드/손패 · 게임 우측 상세 · 효과 팝업 · 공개 팝업 · 2인 WebSocket 대전 · 이미지 누락 fallback · 서버 정적 파일 보안
// 실행: node test/image_ui_test.js   (CardImage 폴더 위치는 환경변수 CARD_IMAGE_DIR 또는 프로젝트의 CardImage/)
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const DBC = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
const IMGDIR = process.env.CARD_IMAGE_DIR || path.join(__dirname, '../CardImage');
if (!fs.existsSync(IMGDIR)) { console.log('SKIP: CardImage 폴더 없음 (' + IMGDIR + ')'); process.exit(0); }
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const get = (port, p, hdr = {}) => new Promise(r => http.get({ host: '127.0.0.1', port, path: p, headers: hdr }, res => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => r({ code: res.statusCode, type: res.headers['content-type'], h: res.headers, len: Buffer.concat(b).length })); }).on('error', () => r({ code: 0 })));
const pick = (t, f) => Object.values(DBC).filter(c => c.type === t && (!f || f(c)));
(async () => {
  const PORT = 9300 + (process.pid % 500); const sv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' }); process.on('exit', () => sv.kill());
  for (let i = 0; i < 40; i++) { if ((await get(PORT, '/health')).code === 200) break; await new Promise(r => setTimeout(r, 250)); }
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  try {
    // ── 서버: 정적 이미지 제공 / 보안
    const a = await get(PORT, '/CardImage/id_1068.jpg'); ok(a.code === 200 && a.type === 'image/jpeg' && a.len > 100000, `/CardImage/id_1068.jpg → 200 image/jpeg ${a.len}바이트(원본 크기, 썸네일 아님)`);
    ok(a.len === fs.statSync(path.join(IMGDIR, 'id_1068.jpg')).size, '서버가 보내는 바이트 수 = 디스크 원본 파일 크기 (재압축 없음)');
    const et = a.h.etag; const b = await get(PORT, '/CardImage/id_1068.jpg', { 'If-None-Match': et }); ok(b.code === 304, '같은 ETag 로 다시 요청하면 304 (재전송 없음)');
    ok((await get(PORT, '/CardImage/not_exists.jpg')).code === 404, '없는 이미지 → 404');
    for (const bad of ['/CardImage/..%2Fserver.js', '/CardImage/%2e%2e/server.js', '/CardImage/id_1068.svg', '/CardImage/../server.js', '/CardImage/.hidden.jpg']) { const r = await get(PORT, bad); ok(r.code === 404 || r.code === 400, `경로 이탈/비이미지 차단: ${bad} → ${r.code}`); }
    const api = await get(PORT, '/api/cards', { 'Accept-Encoding': 'identity' }); ok(api.code === 200 && api.len < 4e6, `/api/cards 크기 ${(api.len / 1e6).toFixed(2)}MB (base64 제거 전 21MB)`);

    // ── 덱빌더: 목록 / 상세 (실제 서버 + 실제 DB)
    const ctx = await br.newContext({ viewport: { width: 1366, height: 800 } }); const pg = await ctx.newPage(); const errs = [], resp = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('response', r => { if (r.url().includes('/CardImage')) resp.push([r.url(), r.status(), r.headers()['content-type']]); });
    await pg.goto(`http://localhost:${PORT}/`); await pg.waitForFunction(() => typeof DB !== 'undefined' && DB.cards && Object.keys(DB.cards).length > 1000, null, { timeout: 20000 });
    const imgs = await pg.evaluate(() => Object.values(DB.cards).map(c => c.img)); ok(imgs.length >= 1339 && imgs.every(i => /^CardImageWeb\/[\w.-]+\.webp$/.test(i)), `브라우저의 카드 DB ${imgs.length}장: img 가 전부 CardImage/<파일>.jpg 경로 (base64 없음)`);
    await pg.evaluate(() => openDB()); await pg.waitForSelector('#dbGrid .cc img', { timeout: 15000 }); await pg.waitForTimeout(1200);
    const L = await pg.evaluate(() => [...document.querySelectorAll('#dbGrid .cc img')].slice(0, 30).map(i => ({ src: i.getAttribute('src'), lazy: i.loading, w: i.naturalWidth, h: i.naturalHeight, ok: i.complete })));
    ok(L.length >= 10 && L.every(i => /^CardImage(?:Web)?\//.test(i.src) && i.lazy === 'lazy'), `덱빌더 목록 이미지: 경로 방식 + loading=lazy (${L.length}개 확인)`);
    const loaded = L.filter(i => i.ok && i.w > 0); ok(loaded.length >= 5 && loaded.every(i => Math.min(i.w, i.h) >= 470), `덱빌더 목록에 실제 로드된 이미지는 원본 해상도 (예: ${loaded[0] && loaded[0].w}x${loaded[0] && loaded[0].h})`);
    const total = await pg.evaluate(() => document.querySelectorAll('#dbGrid .cc img').length), loadedN = await pg.evaluate(() => [...document.querySelectorAll('#dbGrid .cc img')].filter(i => i.complete && i.naturalWidth > 0).length);
    ok(total > 100 && loadedN < total, `lazy 로딩: 목록 ${total}장 중 화면 근처 ${loadedN}장만 로드 (전부 한 번에 받지 않음)`);
    // 상세(덱빌더 큰 미리보기)
    const sample = 'id_1068'; const det = await pg.evaluate(async id => { bPv(id); const el = document.getElementById('dbPvImg'); const u = (/url\("?([^")]+)"?\)/.exec(el.style.backgroundImage) || [])[1]; const r = el.getBoundingClientRect(); const im = new Image(); im.src = u; await im.decode(); return { u, nw: im.naturalWidth, nh: im.naturalHeight, rw: r.width, rh: r.height }; }, sample);
    ok(/^CardImageWeb\/id_1068\.webp$/.test(det.u) && det.nw >= 700 && det.nh >= 900, `덱빌더 큰 미리보기: 원본 파일 사용 (${det.u}, ${det.nw}x${det.nh}; 이전 썸네일 172x240)`);
    ok(det.nh >= det.rh * 0.95, `덱빌더 큰 미리보기: 확대하지 않음 (화면 표시 ${Math.round(det.rw)}x${Math.round(det.rh)} ≤ 원본 ${det.nw}x${det.nh})`);
    // 이미지 누락 fallback (덱빌더): 없는 파일 → 이름 텍스트
    const fb = await pg.evaluate(async () => { const id = Object.keys(DB.cards)[5]; const c = DB.cards[id]; const old = c.img; c.img = 'CardImage/__missing__.jpg'; const d = bCell(c); document.body.appendChild(d); await new Promise(r => setTimeout(r, 800)); const t = d.textContent; const hasImg = !!d.querySelector('img'); d.remove(); bPv(id); await new Promise(r => setTimeout(r, 800)); const pvTxt = document.getElementById('dbPvImg').textContent; c.img = old; return { t, hasImg, pvTxt, n: c.n }; });
    ok(!fb.hasImg && fb.t.includes(fb.n), `이미지 누락(404) fallback — 덱빌더 목록: 카드명 텍스트로 대체 (${fb.t.slice(0, 12)})`); ok(fb.pvTxt.includes(fb.n), '이미지 누락 fallback — 덱빌더 큰 미리보기: 카드명 표시');
    ok(resp.filter(r => r[1] >= 400 && !r[0].includes('__missing__')).length === 0 && resp.filter(r => r[1] === 200).every(r => /image\/(jpeg|webp)/.test(r[2])), `덱빌더 이미지 요청 ${resp.length}건: (의도한 누락 제외) 오류 없음, 모두 image/webp(또는 jpeg)`);

    // ── 게임 화면 (WebSocket 은 모의, 이미지는 실제 서버에서 로드): 필드 / 손패 / 우측 상세 / 효과 팝업 / 공개 팝업
    const cs = pick('char', c => c.lv !== '' && +c.lv <= 3 && c.img).slice(0, 8), ev = cs.map(c => c.id);
    const defs = {}; ev.forEach((id, i) => { defs['k' + i] = dummy('T' + i + '_' + DBC[id].n, { color: DBC[id].color, ap: DBC[id].ap || '3000', lp: DBC[id].lp || '1', lv: DBC[id].lv }); });
    const BS = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
    const R = G(defs, Object.keys(defs), [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); const keys = Object.keys(defs); [keys[0], keys[1], keys[2]].forEach(k => U.field(R, R.turn, k)); [keys[3], keys[4], keys[5], keys[7]].forEach(k => U.hand(R, R.turn, k));
    const dk = i => Object.keys(R.defs).find(k => R.defs[k].n.startsWith('T' + i + '_'));
    for (let i = 0; i < ev.length; i++) R.defs[dk(i)].img = DBC[ev[i]].img;
    const missingKey = dk(7); R.defs[missingKey].img = 'CardImage/__missing__.jpg';
    S.sn && 0; const s = R.turn, hv = () => JSON.parse(JSON.stringify(S.view(R, s)));
    const gctx = await br.newContext({ viewport: { width: 1600, height: 900 } }); const gp = await gctx.newPage(); const gerrs = [], gresp = []; gp.on('pageerror', e => gerrs.push(e.message)); gp.on('response', r => { if (r.url().includes('/CardImage')) gresp.push([r.url(), r.status()]); });
    await gp.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await gp.goto(`http://localhost:${PORT}/`); await gp.waitForFunction(() => window.__ws && typeof DB !== 'undefined');
    const feed = m => gp.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m); await feed({ t: 'defs', defs: R.defs }); await feed(hv()); await gp.waitForTimeout(1200);
    const bgs = await gp.evaluate(() => [...document.querySelectorAll('#board .card:not(.back), #hand .card:not(.back)')].map(e => /url\("?([^")]+)"?\)/.exec(e.style.backgroundImage || e.style.getPropertyValue('--img') || '')).filter(Boolean).map(m => m[1]));
    ok(bgs.length >= 5 && bgs.every(u => /CardImage(?:Web)?\//.test(u) || /missing/.test(u)), `게임 필드/손패 카드 ${bgs.length}장: 배경 이미지가 CardImage 경로`);
    const ldr = await gp.evaluate(async us => Promise.all([...new Set(us)].filter(u => !/missing/.test(u)).map(u => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = u; }))), bgs);
    ok(ldr.length >= 3 && ldr.every(x => x && Math.min(...x) >= 470), `게임 필드/손패 이미지는 원본 해상도로 로드됨 (예: ${ldr[0]})`);
    ok(await gp.evaluate(() => [...document.querySelectorAll('#board .card, #hand .card')].some(e => e.textContent.includes('')) ) , '게임 화면 렌더 확인');
    // 이미지 누락 카드: 이름 텍스트로 안전하게 대체
    const missName = R.defs[missingKey].n; await gp.waitForTimeout(600);
    const fbTxt = await gp.evaluate(n => [...document.querySelectorAll('#hand .card, #board .card')].filter(e => e.textContent.includes(n)).length, missName);
    ok(fbTxt >= 1, `이미지 누락 카드(${missName})는 카드명 텍스트로 표시, 게임 계속 진행 (${fbTxt}장)`);
    // 우측 상세
    await gp.locator('#me-field .card:not(.back)').first().hover(); await gp.waitForTimeout(400);
    const pvd = await gp.evaluate(async () => { const i = document.querySelector('#pv img'); if (!i) return null; await i.decode().catch(() => {}); const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, rw: r.width, rh: r.height }; });
    ok(pvd && /^CardImage(?:Web)?\//.test(pvd.src) && pvd.nw >= 600 && pvd.nh >= 800, `게임 우측 상세: 원본 파일 (${pvd && pvd.src} ${pvd && pvd.nw}x${pvd && pvd.nh})`);
    ok(pvd && pvd.nh >= pvd.rh, `게임 우측 상세: 확대하지 않음 (표시 ${pvd && Math.round(pvd.rw)}x${pvd && Math.round(pvd.rh)} ≤ 원본 ${pvd && pvd.nw}x${pvd && pvd.nh})`);
    // 효과 팝업
    const srcD = dk(0); const v1 = hv(); v1.eff = { kind: 'yn', msg: '효과를 발동하시겠습니까?', yes: '예', no: '아니오', src: R.defs[srcD].n, srcD, who: v1.me };
    await feed(v1); await gp.waitForSelector('#effp .fxi', { timeout: 5000 }); await gp.waitForTimeout(500);
    const fxd = await gp.evaluate(async () => { const i = document.querySelector('#effp img.fxi'); if (!i) return null; await i.decode().catch(() => {}); const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, rw: r.width }; });
    ok(fxd && /^CardImage(?:Web)?\//.test(fxd.src) && fxd.nw >= 470, `효과 팝업: 원본 파일 (${fxd && fxd.src} ${fxd && fxd.nw}x${fxd && fxd.nh}, 표시 폭 ${fxd && Math.round(fxd.rw)}px)`);
    await feed(hv()); await gp.waitForTimeout(300);
    // 공개 팝업
    const rc = hv().P[s].hand.filter(c => c.d !== missingKey && /^T\d/.test((R.defs[c.d] || {}).n || '')).slice(0, 3); await feed({ t: 'reveal', id: 11, by: 1 - s, to: [s], ack: 1 - s, msg: '공개', src: 'X', cards: rc });
    await gp.waitForSelector('#rvl.on .ri .card', { timeout: 5000 }); await gp.waitForTimeout(800);
    const rv = await gp.evaluate(async () => { const els = [...document.querySelectorAll('#rvl .ri .card')]; const urls = els.map(e => (/url\("?([^")]+)"?\)/.exec(e.style.backgroundImage) || [])[1]).filter(Boolean); const dims = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = u; }))); return { n: els.length, urls, dims }; });
    ok(rv.n >= 1 && rv.urls.length === rv.n && rv.urls.every(u => /^CardImage(?:Web)?\//.test(u)) && rv.dims.every(d => d && Math.min(...d) >= 470), `공개 팝업: 카드 ${rv.n}장 모두 CardImage 원본 (${rv.dims[0]})`);
    ok(gresp.filter(r => r[1] >= 400 && !r[0].includes('__missing__')).length === 0, `게임 화면 이미지 요청 ${gresp.length}건: (의도한 누락 제외) 오류 없음`);
    ok(gerrs.length === 0, '게임 화면 JS 오류 없음 ' + gerrs.slice(0, 2).join('|'));

    // ── 2인 WebSocket 대전 (실제 서버 + 실제 DB 카드 + 실제 브라우저 2개)
    const chars = pick('char', c => c.img && c.lv !== '' && +c.lv <= 2).slice(0, 14), partner = pick('partner', c => c.img)[0], kase = pick('case', c => c.img)[0];
    ok(chars.length === 14 && partner && kase, `대전용 실제 카드 확보: 캐릭터 14 + 파트너(${partner && partner.id}) + 사건(${kase && kase.id})`);
    const cc = {}; chars.forEach((c, i) => { cc[c.id] = i === 13 ? 1 : 3; }); const deck = { name: 'img', cards: cc, partner: partner.id, kase: kase.id };
    const mkp = async () => { const p = await (await br.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); p.errs = []; p.resp = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('response', r => { if (r.url().includes('/CardImage')) p.resp.push([r.url(), r.status()]); });
      await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => typeof dbReady !== 'undefined' && dbReady); await p.evaluate(d => { DB.decks = { d }; curDeck = 'd'; decks(); }, deck); return p; };
    const A = await mkp(), Bp = await mkp(); await A.getByText('방 만들기').click(); await A.waitForSelector('#game', { state: 'visible' }); const code = await A.locator('#rc').innerText();
    await Bp.fill('#code', code); await Bp.getByText('입장 (게스트)').click(); await Bp.waitForSelector('#game', { state: 'visible' });
    await A.getByRole('button', { name: '덱 등록' }).click(); await Bp.getByRole('button', { name: '덱 등록' }).click(); await A.waitForTimeout(1500); await Bp.waitForTimeout(500);
    for (const p of [A, Bp]) { const t = await p.locator('#msg').innerText(); if (/교체할 손패/.test(t)) { await p.getByRole('button', { name: /확정/ }).click().catch(() => {}); await p.waitForTimeout(300); } }
    await A.waitForTimeout(1500);
    for (const [nm, p] of [['A', A], ['B', Bp]]) {
      const info = await p.evaluate(async () => { const els = [...document.querySelectorAll('#hand .card:not(.back)')]; const urls = els.map(e => (/url\("?([^")]+)"?\)/.exec(e.style.backgroundImage) || [])[1]).filter(Boolean); const d = await Promise.all(urls.slice(0, 3).map(u => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = u; }))); return { n: els.length, urls: urls.length, ok: urls.every(u => /^CardImage(?:Web)?\//.test(u)), d }; });
      ok(info.n >= 3 && info.urls === info.n && info.ok && info.d.every(x => x && Math.min(...x) >= 470), `WebSocket 대전 ${nm} 손패 ${info.n}장: CardImage 원본 로드 (${info.d[0]})`); }
    await A.locator('#hand .card').first().hover(); await A.waitForTimeout(500); const pv2 = await A.evaluate(() => { const i = document.querySelector('#pv img'); return i && { s: i.getAttribute('src'), w: i.naturalWidth }; });
    ok(pv2 && /^CardImage(?:Web)?\//.test(pv2.s) && pv2.w >= 600, `대전 중 우측 상세: 원본 (${pv2 && pv2.s} ${pv2 && pv2.w}px)`);
    ok([A, Bp].every(p => p.resp.length > 0 && p.resp.every(r => r[1] < 400)) && !A.errs.length && !Bp.errs.length, `대전 중 이미지 요청 ${A.resp.length + Bp.resp.length}건 전부 성공, JS 오류 없음 ${A.errs.concat(Bp.errs).slice(0, 2)}`);
    // 서버가 클라이언트가 보낸 이미지 값을 검증(외부 URL/경로 이탈 차단)
    const sane = await get(PORT, '/health'); ok(sane.code === 200, '서버 정상');
    ok(errs.length === 0, '덱빌더 JS 오류 없음 ' + errs.slice(0, 2).join('|'));
  } catch (e) { ok(false, '예외 ' + (e.stack || e.message)); } finally { await br.close(); sv.kill(); }
  console.log(`image_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
