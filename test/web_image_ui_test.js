// v1.16.0 게임용 최적화 이미지(CardImageWeb): 서버 제공/캐시/대체 응답/보안 + 브라우저 캐시·중복 다운로드·lazy·미리 받기
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WSP; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WSP = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WSP) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), { spawn } = require('child_process'), WS = require(WSP);
const ROOT = path.join(__dirname, '..'), WEBDIR = path.join(ROOT, 'CardImageWeb');
if (!fs.existsSync(WEBDIR)) { console.log('SKIP: CardImageWeb 폴더 없음'); process.exit(0); }
const ORIG = process.env.CARD_IMAGE_DIR || path.join(ROOT, 'CardImage'), haveOrig = fs.existsSync(path.join(ORIG, 'id_0001.jpg'));
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const get = (port, p, hdr = {}) => new Promise(r => http.get({ host: '127.0.0.1', port, path: p, headers: hdr }, res => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => r({ code: res.statusCode, h: res.headers, body: Buffer.concat(b) })); }).on('error', () => r({ code: 0, h: {}, body: Buffer.alloc(0) })));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const kids = []; process.on('exit', () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch (e) {} }));
const start = async (port, env) => { const k = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port), NODE_PATH: path.dirname(path.dirname(WSP)), ...env }, stdio: 'ignore' }); kids.push(k); for (let i = 0; i < 60; i++) { if ((await get(port, '/health')).code === 200) return k; await sleep(150); } throw new Error('server'); };
(async () => {
  const P1 = 9900 + Math.floor(Math.random() * 90), P2 = P1 + 100;
  await start(P1, haveOrig ? { CARD_IMAGE_DIR: ORIG } : {});
  // ── 서버: 최적화본 제공 / 캐시 / 보안
  const f = 'id_0001.webp', disk = fs.readFileSync(path.join(WEBDIR, f));
  const a = await get(P1, '/CardImageWeb/' + f);
  ok(a.code === 200 && a.h['content-type'] === 'image/webp' && a.body.equals(disk), `/CardImageWeb/${f} → 200 image/webp, 디스크 파일과 바이트 동일 (${(a.body.length / 1024) | 0}KB)`);
  ok(/max-age=86400/.test(a.h['cache-control']) && /public/.test(a.h['cache-control']) && a.h.etag && a.h['last-modified'], '캐시 헤더: public, max-age=86400(하루) + ETag + Last-Modified → 같은 이미지를 반복 다운로드하지 않음');
  const b = await get(P1, '/CardImageWeb/' + f, { 'If-None-Match': a.h.etag }); ok(b.code === 304 && b.body.length === 0, '같은 ETag 로 재요청 → 304 (본문 재전송 없음)');
  if (haveOrig) { const o = await get(P1, '/CardImage/id_0001.jpg'); ok(o.code === 200 && o.h['content-type'] === 'image/jpeg' && o.body.equals(fs.readFileSync(path.join(ORIG, 'id_0001.jpg'))), '고해상도 원본 /CardImage/id_0001.jpg 도 그대로 제공 (원본 바이트 동일)'); }
  ok((await get(P1, '/CardImageWeb/not_exists.webp')).code === 404, '없는 최적화 이미지(원본도 없음) → 404');
  for (const bad of ['/CardImageWeb/..%2Fserver.js', '/CardImageWeb/%2e%2e/server.js', '/CardImageWeb/id_0001.svg', '/CardImageWeb/../server.js', '/CardImageWeb/.manifest.json', '/CardImageWeb/']) { const r = await get(P1, bad); ok(r.code === 404 || r.code === 400, `경로 이탈/비이미지 차단: ${bad} → ${r.code}`); }
  // ── 최적화본이 아직 없을 때: 같은 ID 의 원본으로 대신 응답 (이미지가 안 뜨는 일 없음)
  if (haveOrig) { const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'webempty_')); await start(P2, { CARD_IMAGE_DIR: ORIG, CARD_IMAGE_WEB_DIR: empty });
    const fb = await get(P2, '/CardImageWeb/id_0001.webp'); ok(fb.code === 200 && fb.h['content-type'] === 'image/jpeg' && fb.body.equals(fs.readFileSync(path.join(ORIG, 'id_0001.jpg'))) && /no-cache/.test(fb.h['cache-control']), '최적화본이 없으면 같은 ID 원본으로 대체 응답 (임시본이라 캐시하지 않음 → 생성 후 바로 최적화본으로 교체)');
    fs.copyFileSync(path.join(WEBDIR, f), path.join(empty, f)); const nw = await get(P2, '/CardImageWeb/' + f); ok(nw.h['content-type'] === 'image/webp' && nw.body.equals(disk), '최적화본이 생기면 서버 재시작 없이 바로 최적화본 제공'); }
  // ── 서버가 받는 카드 정의: CardImageWeb 경로 허용, 외부 URL 차단
  { const w = new WS('ws://127.0.0.1:' + P1); const msgs = []; w.on('message', d => msgs.push(JSON.parse(d))); await new Promise(r => w.on('open', r)); w.send(JSON.stringify({ t: 'create' })); await sleep(300);
    const defs = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1', img: 'CardImageWeb/id_0001.webp' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3', img: 'https://evil.example/x.png' } }, list = [];
    for (let i = 0; i < 14; i++) defs['c' + i] = { n: 'C' + i, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', img: i === 0 ? 'CardImageWeb/../server.js' : 'CardImageWeb/id_0002.webp' }; for (let i = 0; i < 40; i++) list.push('c' + Math.floor(i / 3));
    w.send(JSON.stringify({ t: 'ready', defs, list, partner: 'p', kase: 'k' })); await sleep(400); const d = msgs.filter(m => m.t === 'defs').pop(); ok(d && d.defs['0:p'].img === 'CardImageWeb/id_0001.webp' && d.defs['0:k'].img === '' && d.defs['0:c0'].img === '' && d.defs['0:c1'].img === 'CardImageWeb/id_0002.webp', '대전 카드 정의: CardImageWeb 경로는 통과, 외부 URL·경로 이탈은 제거'); w.terminate(); }
  // ── 브라우저: 목록 lazy / 캐시 / 중복 다운로드 / 미리 받기
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await br.newContext({ viewport: { width: 1366, height: 800 } });
  const track = async (pg) => { const cdp = await ctx.newCDPSession(pg); await cdp.send('Network.enable'); const T = { ids: {}, net: {}, errs: [] };
    cdp.on('Network.requestWillBeSent', e => { if (/\/CardImage(Web)?\//.test(e.request.url)) T.ids[e.requestId] = e.request.url; });
    cdp.on('Network.responseReceived', e => { const u = T.ids[e.requestId]; if (u) (T.net[u] = T.net[u] || []).push({ st: e.response.status, disk: !!e.response.fromDiskCache, type: e.response.mimeType }); });
    cdp.on('Network.loadingFailed', e => { const u = T.ids[e.requestId]; if (u && !e.canceled) T.errs.push(u); }); return T; };
  const stat = T => { const urls = Object.keys(T.net); return { urls, fromNet: urls.filter(u => T.net[u].some(x => !x.disk && x.st === 200)), disk: urls.filter(u => T.net[u].every(x => x.disk)), dup: urls.filter(u => T.net[u].filter(x => !x.disk && x.st === 200).length > 1) }; };
  const open1 = async () => { const pg = await ctx.newPage(); const T = await track(pg); await pg.goto(`http://localhost:${P1}/`); await pg.waitForFunction(() => typeof DB !== 'undefined' && DB.cards && Object.keys(DB.cards).length > 1000, null, { timeout: 20000 }); await pg.evaluate(() => openDB()); await pg.waitForSelector('#dbGrid .cc img', { timeout: 15000 }); await pg.waitForTimeout(2500); return [pg, T]; };
  const [pg, T1] = await open1(); const s1 = stat(T1); const total = await pg.evaluate(() => Object.keys(DB.cards).length);
  ok(s1.urls.length > 20 && s1.urls.every(u => /\/CardImageWeb\/[\w.-]+\.webp$/.test(u)) && s1.urls.every(u => T1.net[u].every(x => x.st === 200 && x.type === 'image/webp')), `덱빌더: 이미지 ${s1.urls.length}건 전부 /CardImageWeb/*.webp (200, image/webp)`);
  ok(s1.dup.length === 0, `같은 이미지를 두 번 이상 내려받은 것 0건 (네트워크 ${s1.fromNet.length}건 = 고유 URL ${s1.urls.length}건)`);
  const lz = await pg.evaluate(() => { const L = [...document.querySelectorAll('#dbGrid .cc img')]; return { n: L.length, lazy: L.filter(i => i.loading === 'lazy').length }; });
  ok(lz.n > 0 && lz.lazy === lz.n && s1.urls.length < total * 0.4, `덱빌더 목록 img ${lz.n}개 전부 loading=lazy — 처음에 화면 근처 ${s1.urls.length}장만 받음 (전체 ${total}장 중 ${Math.round(100 * s1.urls.length / total)}%)`);
  ok(T1.errs.length === 0, '이미지 요청 실패 0건'); await pg.close();
  const [pg2, T2] = await open1(); const s2 = stat(T2);
  ok(s2.urls.length > 20 && s2.fromNet.length === 0 && s2.disk.length === s2.urls.length, `같은 브라우저로 다시 열기: 이미지 ${s2.urls.length}건 전부 브라우저 캐시에서 (네트워크 다운로드 ${s2.fromNet.length}건)`);
  // 미리 받기: 대전 정의가 오면 두 덱 카드 이미지를 한 번씩만 받고, 카드를 그릴 때 추가 요청이 없다
  const loaded = new Set(s1.urls.map(u => u.replace(/^https?:\/\/[^/]+\//, '')));
  const ids = (await pg2.evaluate(() => Object.keys(DB.cards).filter(k => DB.cards[k].type === 'char').map(k => [k, DB.cards[k].img]))).filter(x => !loaded.has(x[1])).slice(300, 320).map(x => x[0]);
  const T3 = T2; Object.keys(T3.net).forEach(k => delete T3.net[k]);
  await pg2.evaluate(ids => { const d = {}; ids.forEach(k => d[k] = { ...DB.cards[k] }); onMsg({ data: JSON.stringify({ t: 'defs', defs: d }) }); }, ids); await pg2.waitForTimeout(1800);
  const s3 = stat(T3); if (process.env.DBG) console.log(' dbg', s3.urls.length, ids.length, JSON.stringify(Object.entries(T3.net).slice(0,3))); ok(s3.urls.length === ids.length && s3.dup.length === 0 && s3.urls.every(u => /CardImageWeb/.test(u)), `defs 도착 → 카드 ${ids.length}장 이미지를 미리 받음(각 1회, 중복 0)`);
  const before = Object.keys(T3.net).length; await pg2.evaluate(ids => { ids.forEach(k => { const e = mk({ id: k, d: k, st: 'a' }, {}); document.body.appendChild(e); setTimeout(() => e.remove(), 10); }); }, ids); await pg2.waitForTimeout(600);
  ok(Object.keys(T3.net).length === before && stat(T3).dup.length === 0, '미리 받은 카드를 화면에 그릴 때 추가 다운로드 없음 (카드가 늦게 뜨지 않음)');
  const sharp = await pg2.evaluate(async id => { const f = DB.cards[id]; pv(f, { d: id }); await new Promise(r => setTimeout(r, 500)); const i = document.querySelector('#pv img'); return i ? { nw: i.naturalWidth, nh: i.naturalHeight, rw: i.getBoundingClientRect().width } : null; }, ids[0]);
  ok(sharp && sharp.nw >= 600 && sharp.nh >= 850, `우측 상세 이미지: 실제 픽셀 ${sharp && sharp.nw}x${sharp && sharp.nh} `);
  await br.close(); console.log(`\nweb_image_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
