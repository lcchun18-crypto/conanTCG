// v1.9.0 WebSocket 통합: 실제 server.js + 클라이언트 2개 — 다시하기(게임 초기화) 반복, 이번 턴 다시시작, 공개 이벤트 전달
let WSP; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WSP = require.resolve(m); break; } catch (e) {} }
if (!WSP) { console.log('SKIP: ws 없음'); process.exit(0); }
const WS = require(WSP), { spawn } = require('child_process'), path = require('path'), net = require('net');
const PORT = 9600 + Math.floor(Math.random() * 300); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, NODE_PATH: path.dirname(path.dirname(WSP)) }, stdio: 'ignore' }); process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) {} });
const up = async () => { for (let i = 0; i < 80; i++) { if (await new Promise(r => { const c = net.connect(PORT, '127.0.0.1', () => { c.destroy(); r(true); }); c.on('error', () => r(false)); })) return; await sleep(100); } throw new Error('server'); };
const cli = () => new Promise((res, rej) => { const w = new WS('ws://127.0.0.1:' + PORT); w.msgs = []; w.on('message', d => { const m = JSON.parse(d); w.msgs.push(m); if (m.t === 'v') w.V = m; if (m.t === 'defs') w.defs = m.defs; if (m.t === 'joined') w.seat = m.seat; }); w.on('open', () => res(w)); w.on('error', rej); });
const send = (w, o) => w.send(JSON.stringify(o)); const waitFor = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(30); } return null; };
const card = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ...extra });
const mkDeck = tag => { const defs = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } }; const list = [];
  for (let i = 0; i < 14; i++) defs[tag + i] = card(tag + i); defs.RV = { n: 'RV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'revealTop', n: 2, filter: {}, hit: 'hand', miss: 'bottom' }] }] };
  for (let i = 0; i < 38; i++) list.push(tag + Math.floor(i / 3)); list.push('RV'); list.push('RV'); return { defs, list, partner: 'p', kase: 'k' }; };
const reg = (w, tag) => send(w, { t: 'ready', ...mkDeck(tag) });
const wait = async (w, f, m) => { const r = await waitFor(() => w.V && f(w.V)); if (!r) console.log('  (timeout) ' + m); return r; };
(async () => {
  await up(); const a = await cli(), b = await cli(); send(a, { t: 'create' }); const code = (await waitFor(() => a.V && a.V.code)); send(b, { t: 'join', code: a.V.code }); await wait(b, v => v.both, 'join');
  ok(a.V.both && b.V.both && a.seat === 0 && b.seat === 1, '방 생성/입장, 양쪽 연결');
  const playGame = async label => { reg(a, 'a'); reg(b, 'b'); const r = await wait(a, v => v.phase === 'mull', label + ' mull'); ok(!!r && b.V.phase === 'mull', `${label}: 양쪽 덱 등록 → 멀리건`);
    for (let i = 0; i < 2; i++) { const w = [a, b].find(x => x.V.mull === x.seat && x.V.phase === 'mull'); if (!w) break; const ph = w.V.phase; send(w, { t: 'act', a: 'mull', ids: [] }); await waitFor(() => w.V.mull !== w.seat || w.V.phase === 'play'); }
    await wait(a, v => v.phase === 'play', label + ' play'); ok(a.V.phase === 'play' && b.V.phase === 'play' && a.V.first === b.V.first, `${label}: 선후공 결정, 게임 시작 (선공=${a.V.first})`); };
  await playGame('게임1');
  const cur = () => [a, b].find(x => x.V.turn === x.seat), opp = () => [a, b].find(x => x.V.turn !== x.seat);
  ok(cur().V.rt === 1 && opp().V.rt === 0, 'rt: 현재 턴 플레이어에게만 다시시작 활성');
  // 이번 턴 다시시작
  const c = cur(), o = opp(); const h0 = JSON.stringify(c.V.P[c.seat].hand.map(x => x.id)), d0 = c.V.P[c.seat].deck, f0 = c.V.P[c.seat].file;
  const first = c.V.P[c.seat].hand.find(x => (a.defs[x.d] || b.defs[x.d] || {}).n && true); send(c, { t: 'act', a: 'hint' }); await sleep(250);
  send(o, { t: 'restartTurn' }); const er = await waitFor(() => o.msgs.some(m => m.t === 'err' && /내 턴/.test(m.msg))); ok(!!er, '상대 턴 플레이어의 다시시작 요청은 서버가 거절');
  const n0 = c.msgs.length, n1 = o.msgs.length; send(c, { t: 'restartTurn' }); await waitFor(() => c.msgs.slice(n0).some(m => m.t === 'reset' && m.kind === 'turn') && o.msgs.slice(n1).some(m => m.t === 'reset'));
  await sleep(150); ok(JSON.stringify(c.V.P[c.seat].hand.map(x => x.id)) === h0 && c.V.P[c.seat].deck === d0 && c.V.P[c.seat].file === f0, '다시시작: 손패(드로우 카드)·덱·FILE 동일 (양쪽 클라이언트 갱신)');
  // 공개 이벤트: RV(덱 위 2장 공개) 사용 → 상대에게만 reveal 팝업 대상
  const RVc = c.V.P[c.seat].hand.find(x => (c.defs[x.d] || {}).n === 'RV');
  if (RVc) { const m0 = c.msgs.length, m1 = o.msgs.length; send(c, { t: 'act', a: 'play', id: RVc.id }); await sleep(400); const rc = c.msgs.slice(m0).filter(m => m.t === 'reveal'), ro = o.msgs.slice(m1).filter(m => m.t === 'reveal');
    ok(rc.length === 1 && ro.length === 1 && ro[0].to.length === 1 && ro[0].to[0] === o.seat && ro[0].by === c.seat && ro[0].cards.length === 2, '공개 이벤트: 두 클라이언트에 동일 전달, 대상(to)=상대, 카드 2장'); }
  else console.log('  (이번 손패에 RV 없음 — 공개 전달은 엔진 테스트에서 검증)');
  // 다시하기 반복
  for (const g of ['게임2', '게임3']) { const x = [a, b][Math.random() < .5 ? 0 : 1]; const n0 = a.msgs.length, n1 = b.msgs.length; send(x, { t: 'restartGame' });
    await waitFor(() => a.msgs.slice(n0).some(m => m.t === 'reset' && m.kind === 'game') && b.msgs.slice(n1).some(m => m.t === 'reset' && m.kind === 'game')); await wait(a, v => v.phase === 'setup' && !v.P[0].ready && !v.P[1].ready, g + ' reset'); await wait(b, v => v.phase === 'setup', g + ' reset b');
    ok(a.V.phase === 'setup' && b.V.phase === 'setup' && a.V.code === code && a.V.P.every(p => !p.ready && p.deck === 0) && Object.keys(a.defs).length === 0 && a.V.n === 0 && a.V.rt === 0, `${g} 이전: 다시하기 → 같은 방 코드, 두 클라이언트 동시에 초기 상태 (덱·정의·턴 비움)`);
    ok(a.V.log.length <= 2, '이전 게임 로그 제거'); await playGame(g); }
  // 로비로(방 나가기)는 그대로 동작
  send(b, { t: 'leaveRoom' }); ok(!!(await waitFor(() => b.msgs.some(m => m.t === 'left'))), '로비로(leaveRoom) 정상'); ok(!!(await wait(a, v => v.phase === 'over', 'over')), '상대 이탈 → 게임 종료 처리 유지');
  console.log(`v190_ws_test: ${pass} 통과, ${fail} 실패`); a.close(); b.close(); process.exit(fail ? 1 : 0); })().catch(e => { console.log('예외', e); process.exit(1); });
