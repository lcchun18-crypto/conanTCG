// v1.5.1 WebSocket 연결 수명주기 검증: 실제 server.js + TCP 프록시(연결 끊기/차단/무응답)로 Render 재배포·재시작·sleep/wake·순간 단절을 흉내낸다.
//   - 프로토콜: create/join 이 토큰을 주고, 끊겼다 같은 자리로 resume 되며, 잘못된 토큰/사라진 방은 resumeFail
//   - 브라우저: 끊김 → 자동 재연결(타이머 1개) → 방 복구, 끊긴 동안 버튼을 눌러도 예외/콘솔 'CLOSING or CLOSED' 없음, 서버 재시작 → 안내 후 로비 복귀, 로비에서 새 방 생성
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WSP; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WSP = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WSP) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const WS = require(WSP), net = require('net'), { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
const SP = 9000 + Math.floor(Math.random() * 400), PP = SP + 500, cf = path.join(os.tmpdir(), 'wsrc_cards_' + process.pid + '.json');
const mk = (id, n, type, extra = {}) => ({ id, n, type, color: 'blue', lv: '1', lv2: '2', ap: '3000', lp: '1', kw: '', trait: '', fx: '', extra: '', ab: [], img: '', ...extra });
const cards = {}; for (let i = 0; i < 14; i++) cards['c' + i] = mk('c' + i, '캐릭터' + i, 'char', { lv: String(i % 3) }); cards.p = mk('p', '파트너', 'partner'); cards.k = mk('k', '사건', 'case');
fs.writeFileSync(cf, JSON.stringify({ cards })); process.on('exit', () => { try { fs.unlinkSync(cf); } catch (e) {} });
let srv = null; const kids = [];
const startSrv = (port, grace) => { const s = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT: port, CARDS_JSON: cf, RECONNECT_GRACE_MS: String(grace), NODE_PATH: path.dirname(path.dirname(WSP)) }, stdio: 'ignore' }); kids.push(s); return s; };
process.on('exit', () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch (e) {} }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = async port => { for (let i = 0; i < 100; i++) { const up = await new Promise(r => { const c = net.connect(port, '127.0.0.1', () => { c.destroy(); r(true); }); c.on('error', () => r(false)); }); if (up) return; await sleep(100); } throw new Error('서버가 뜨지 않음 ' + port); };
let fail = 0, pass = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓', m); } else { fail++; console.log('✗', m); } };
// TCP 프록시: cut() 모든 연결 끊기, refuse(true) 접속 거부(서버 꺼짐), hang(true) 접속은 받되 응답 없음(깨어나는 중), 동시 접속 수 기록
function proxy(listen, target) { const P = { socks: new Set(), mode: 'ok', maxLive: 0, accepted: 0, srv: null };
  P.start = () => new Promise(r => { P.srv = net.createServer(c => { P.accepted++; if (P.mode === 'hang') { P.socks.add(c); c.on('error', () => {}); c.on('close', () => P.socks.delete(c)); return; }
      const u = net.connect(target, '127.0.0.1'); P.socks.add(c); P.socks.add(u); P.maxLive = Math.max(P.maxLive, P.socks.size / 2); c.pipe(u); u.pipe(c);
      const dn = () => { c.destroy(); u.destroy(); P.socks.delete(c); P.socks.delete(u); }; c.on('error', dn); u.on('error', dn); c.on('close', dn); u.on('close', dn); }); P.srv.listen(listen, '127.0.0.1', r); });
  P.cut = () => { for (const s of [...P.socks]) s.destroy(); P.socks.clear(); };
  P.refuse = async on => { if (on) { const cl = new Promise(r => P.srv.close(r)); P.cut(); await cl; } else await P.start(); };
  return P; }
const wsc = (port) => new Promise((res, rej) => { const w = new WS('ws://127.0.0.1:' + port); w.msgs = []; w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => res(w)); w.on('error', rej); });
const waitFor = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(50); } return null; };
const last = (w, t) => w.msgs.filter(m => m.t === t).pop();
(async () => {
  // ───── 1) 프로토콜 (직접 접속) ─────
  srv = startSrv(SP, 4000); await ready(SP);
  const A = await wsc(SP); A.send(JSON.stringify({ t: 'create' })); const jA = await waitFor(() => last(A, 'joined')); ok(jA && jA.token && jA.seat === 0 && /^[A-Z0-9]{4}$/.test(jA.code), 'create → joined(code, seat 0, token) 발급');
  const B = await wsc(SP); B.send(JSON.stringify({ t: 'join', code: jA.code })); const jB = await waitFor(() => last(B, 'joined')); ok(jB && jB.seat === 1 && jB.token && jB.token !== jA.token, 'join → joined(seat 1, 다른 token)');
  await waitFor(() => last(A, 'v') && last(A, 'v').both); ok(last(A, 'v').both, '2인 입장 후 both=true');
  A.terminate(); ok(await waitFor(() => last(B, 'v') && !last(B, 'v').both), '호스트 끊김 → 상대 화면 both=false (게임 즉시 종료 아님)');
  const A2 = await wsc(SP); A2.send(JSON.stringify({ t: 'resume', code: jA.code, seat: 0, token: jA.token })); ok(await waitFor(() => last(A2, 'joined') && last(A2, 'v')), 'resume(토큰) → 같은 자리로 복귀하고 뷰 수신');
  ok(await waitFor(() => last(B, 'v') && last(B, 'v').both), '재접속 후 상대 화면 both=true');
  const X = await wsc(SP); X.send(JSON.stringify({ t: 'resume', code: jA.code, seat: 1, token: jA.token })); ok(await waitFor(() => last(X, 'resumeFail')) && !last(X, 'v'), '잘못된 토큰(남의 자리) resume 거부');
  const Y = await wsc(SP); Y.send(JSON.stringify({ t: 'resume', code: 'ZZZZ', seat: 0, token: 'x' })); ok(await waitFor(() => last(Y, 'resumeFail')), '없는 방 resume → resumeFail');
  // 죽은 줄 모르는 옛 소켓이 있어도 새 소켓이 자리를 가져가고, 옛 소켓의 close 가 방을 망치지 않는다
  const A3 = await wsc(SP); A3.send(JSON.stringify({ t: 'resume', code: jA.code, seat: 0, token: jA.token })); await waitFor(() => last(A3, 'v')); await sleep(300);
  ok(last(B, 'v').both && last(A3, 'v'), '새 소켓이 옛 소켓을 대체 (A2 terminate 되어도 방 유지)');
  [A2, A3, B, X, Y].forEach(w => { try { w.terminate(); } catch (e) {} });
  // 유예 만료: 둘 다 끊기고 유예가 지나면 방이 사라지고 resume 은 실패
  srv.kill('SIGKILL'); await sleep(300); srv = startSrv(SP, 300); await ready(SP);
  const C = await wsc(SP); C.send(JSON.stringify({ t: 'create' })); const jC = await waitFor(() => last(C, 'joined')); C.terminate(); await sleep(900);
  const C2 = await wsc(SP); C2.send(JSON.stringify({ t: 'resume', code: jC.code, seat: 0, token: jC.token })); ok(await waitFor(() => last(C2, 'resumeFail')), '유예(300ms) 만료 후 빈 방은 삭제 → resumeFail'); C2.terminate();
  srv.kill('SIGKILL'); await sleep(300);

  // ───── 2) 브라우저 (프록시 경유) ─────
  srv = startSrv(SP, 20000); const P = proxy(PP, SP); await P.start(); await ready(SP);
  const br = await chromium.launch({ ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
  const pg = await br.newPage({ viewport: { width: 1600, height: 900 } }); const errs = [], cons = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => cons.push(m.text()));
  await pg.addInitScript(() => { const O = window.WebSocket, live = []; window.__maxLive = 0; window.__made = 0; window.WebSocket = class extends O { constructor(u, p) { super(u, p); window.__made++; live.push(this); const n = live.filter(w => w.readyState <= 1).length; if (n > window.__maxLive) window.__maxLive = n; } }; });
  await pg.goto('http://127.0.0.1:' + PP + '/'); await pg.evaluate(() => dbReady);
  const net_ = () => pg.evaluate(() => ({ cls: document.getElementById('net').className, txt: document.getElementById('net').textContent, open: wsOpen(), timer: !!NET.timer, tries: NET.tries }));
  ok(await waitFor(async () => (await net_()).open, 5000), '페이지 로드 후 WebSocket 연결됨 (프록시 경유)');
  await pg.getByText('방 만들기').click(); await pg.waitForSelector('#game', { state: 'visible' }); const code = await pg.locator('#rc').innerText(); ok(/^[A-Z0-9]{4}$/.test(code), '브라우저 방 생성 ' + code);
  const G = await wsc(SP); G.send(JSON.stringify({ t: 'join', code })); await waitFor(() => last(G, 'v') && last(G, 'v').both); ok(last(G, 'v').both, '게스트(직접 접속) 입장 → 2인 방');
  // (a) 순간 단절
  P.cut(); const sawDown = await waitFor(async () => /재연결 중/.test((await net_()).txt), 3000); ok(sawDown, '순간 단절 → "연결이 끊어졌습니다. 재연결 중..." 표시');
  ok(await waitFor(async () => (await net_()).open && /다시 연결/.test((await net_()).txt + 'x') || (await net_()).open, 8000), '자동 재연결 성공');
  ok(await waitFor(() => last(G, 'v') && last(G, 'v').both && G.msgs.filter(m => m.t === 'v').length > 2, 5000), '재접속 후 같은 방/자리로 복귀 (상대 화면 both=true)');
  ok((await pg.locator('#rc').innerText()) === code && await pg.locator('#game').isVisible(), '게임 화면과 방 코드 유지');
  // (b) 서버 sleep(접속 거부 6초) 동안 버튼을 눌러도 예외 없음, 재시도는 타이머 1개
  await P.refuse(true); await waitFor(async () => !(await net_()).open, 3000); const acc0 = P.accepted;
  const clicks = await pg.evaluate(() => { let thrown = 0; for (let i = 0; i < 15; i++) { try { A('end'); } catch (e) { thrown++; } try { S({ t: 'create' }); } catch (e) { thrown++; } } return thrown; });
  ok(clicks === 0, '끊긴 동안 버튼(행동/전송) 30회 → JS 예외 0');
  await sleep(6000); const st = await net_(); ok(!st.open && st.timer && /재연결 중/.test(st.txt), '서버가 안 깨어난 동안 계속 재시도 표시 + 예약 타이머 1개: ' + st.txt + ' (tries ' + st.tries + ')');
  const ml = await pg.evaluate(() => [window.__maxLive, window.__made]); ok(ml[0] <= 1 && ml[1] >= 3, '브라우저 소켓 동시 연결/연결 중 최대 ' + ml[0] + '개, 총 시도 ' + ml[1] + '회 (중복 reconnect 없음)');
  await P.refuse(false); ok(await waitFor(async () => (await net_()).open, 8000), '서버가 깨어난 뒤 자동 재연결');
  ok(await waitFor(() => last(G, 'v') && last(G, 'v').both), '재접속 후 방 복구 (both=true)');
  // (c) 깨어나는 중(접속은 되지만 응답 없음) → 9초 후 포기하고 다시 시도
  P.mode = 'hang'; P.cut(); await waitFor(async () => !(await net_()).open, 3000); await sleep(11500); const hang = await net_(); ok(!hang.open && /재연결 중/.test(hang.txt), '응답 없는 서버(깨어나는 중): 계속 재시도 표시'); ok(P.accepted - acc0 >= 2, '응답 없는 접속은 시간 초과로 정리되고 재시도 (접속 시도 ' + (P.accepted - acc0) + '회)');
  P.mode = 'ok'; ok(await waitFor(async () => (await net_()).open, 15000), '서버 응답 복구 후 연결');
  ok(await waitFor(() => last(G, 'v') && last(G, 'v').both), '방 복구 확인');
  ok(!cons.some(t => /CLOSING or CLOSED/i.test(t)), "콘솔에 'WebSocket is already in CLOSING or CLOSED state' 없음 (단절 3종 후)");
  // (d) Render 재배포/재시작: 서버 프로세스가 죽고 새로 뜸 → 방은 사라짐 → 안내 후 로비, 새 방 생성 가능
  G.terminate(); srv.kill('SIGKILL'); await waitFor(async () => !(await net_()).open, 4000); await sleep(2500);
  ok(/재연결 중/.test((await net_()).txt), '서버 재시작 중: 재연결 중 표시'); srv = startSrv(SP, 20000);
  ok(await waitFor(async () => (await net_()).open, 15000), '서버가 다시 뜬 뒤 자동 재연결');
  ok(await waitFor(async () => await pg.locator('#lobby').isVisible(), 5000), '방이 사라졌으면 로비로 복귀'); const w = await net_(); ok(/찾을 수 없|로비/.test(w.txt), '이유 안내: ' + w.txt);
  await pg.getByText('방 만들기').click(); await pg.waitForSelector('#game', { state: 'visible' }); ok(/^[A-Z0-9]{4}$/.test(await pg.locator('#rc').innerText()), '재시작 후 새 방 생성 가능');
  ok(!cons.some(t => /CLOSING or CLOSED/i.test(t)), "전체 시나리오 후에도 'CLOSING or CLOSED' 콘솔 오류 0 (총 콘솔 " + cons.length + '개)');
  ok(errs.length === 0, '페이지 예외 0' + (errs.length ? ': ' + errs[0] : ''));
  await br.close(); srv.kill('SIGKILL'); console.log(`\nws_reconnect_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
