// v1.7.8: 로비로 나가기 — 실제 서버(WebSocket 2인): 언제든(게임 중 포함) 나갈 수 있고, 나간 쪽은 'left' 를 받으며 상대는 승리 처리, 방은 정리된다
const { spawn } = require('child_process'), net = require('net'), path = require('path'); let WS; try { WS = require('ws'); } catch (e) { console.log('SKIP: ws 모듈 없음'); process.exit(0); }
const root = path.resolve(__dirname, '..'); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const free = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const port = await free(); const c = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) } }); await new Promise(r => { c.stdout.on('data', d => /listening/.test(String(d)) && r()); setTimeout(r, 4000); });
  const mk = () => new Promise((r, j) => { const w = new WS('ws://127.0.0.1:' + port); w.msgs = []; w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => r(w)); w.on('error', j); }); const snd = (w, o) => w.send(JSON.stringify(o)); const last = (w, t) => [...w.msgs].reverse().find(m => m.t === t);
  try { const A = await mk(), B = await mk(); snd(A, { t: 'create' }); await sleep(200); const code = last(A, 'joined').code; snd(B, { t: 'join', code }); await sleep(300);
    const defs = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } }, list = []; for (let i = 0; i < 40; i++) { defs['c' + i] = { n: 'C' + i, type: 'char', color: 'yellow', lv: '1', ap: '1000', lp: '1' }; list.push('c' + i); }
    for (const w of [A, B]) snd(w, { t: 'ready', defs, list, partner: 'p', kase: 'k' }); await sleep(400);
    ok(last(A, 'v').phase === 'mull', '게임이 멀리건 단계 (진행 중)');
    snd(B, { t: 'leaveRoom' }); await sleep(400); ok(!!last(B, 'left'), '나간 쪽은 left 를 받아 로비로 복귀');
    const vA = last(A, 'v'); ok(vA.phase === 'over' && vA.winner === A.msgs.find(m => m.t === 'joined').seat, '남은 쪽은 승리 처리 (게임 종료)');
    snd(A, { t: 'leaveRoom' }); await sleep(300); ok(!!last(A, 'left'), '종료 후에도 로비로 나가기 가능');
    snd(A, { t: 'leaveRoom' }); await sleep(200); ok(A.msgs.filter(m => m.t === 'left').length >= 2, '방이 없어도 leaveRoom 은 안전(left 응답)');
    const C = await mk(); snd(C, { t: 'join', code }); await sleep(300); ok(!!last(C, 'err') || !last(C, 'joined'), '나간 방은 정리되어 다시 입장할 수 없음'); A.close(); B.close(); C.close(); } catch (e) { ok(false, '예외: ' + (e && e.stack || e)); } c.kill();
  console.log(fail ? `\n로비 나가기 테스트 ${fail}건 실패 (통과 ${pass})` : `\n로비 나가기 테스트 통과 (${pass}개)`); process.exit(fail ? 1 : 0); })();
