// v1.17.34 채팅(서버): 실제 server.js 의 WebSocket 처리 경로를 가짜 ws 모듈로 구동해 검증한다 (ws 모듈이 없어도 실행 가능).
// 사용: node test/chat_test.js  (자기 자신을 `node -r chat_test.js server.js` 로 다시 실행)
const path = require('path'), { spawnSync } = require('child_process');
if (!/server\.js$/.test(process.argv[1] || '')) { const r = spawnSync('node', ['-r', __filename, 'server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: '0', FIRST_CHOOSE: '0', CHAT_TEST: '1' }, encoding: 'utf8', timeout: 60000 }); process.stdout.write(r.stdout || ''); process.stderr.write((r.stderr || '').slice(0, 2000)); process.exit(r.status === 0 ? 0 : 1); }
const Mod = require('module'); const ol = Mod._load; const EventEmitter = require('events');
Mod._load = function (req, ...a) { if (req === 'ws') return { WebSocketServer: class extends EventEmitter { constructor() { super(); this.clients = new Set(); global.__wss = this; } } }; return ol.call(this, req, ...a); };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const sock = () => { const w = new EventEmitter(); w.readyState = 1; w.out = []; w.send = s => w.out.push(JSON.parse(s)); w.ping = () => {}; w.terminate = () => {}; w.close = () => {}; global.__wss.emit('connection', w); return w; };
const tx = (w, o) => w.emit('message', JSON.stringify(o)); const last = (w, t) => [...w.out].reverse().find(m => m.t === t); const all = (w, t) => w.out.filter(m => m.t === t);
setTimeout(() => { try {
  const A = sock(), B = sock(), C = sock(), D = sock(); tx(A, { t: 'create' }); const code = last(A, 'joined').code; tx(B, { t: 'join', code }); tx(C, { t: 'spectate', code }); tx(D, { t: 'spectate', code });
  tx(A, { t: 'chat', text: '안녕하세요 <b>x</b>' }); ok([A, B, C, D].every(w => all(w, 'chat').length === 1), '1 플레이어 메시지가 상대·관전자 모두에게 전달됨');
  const m = last(C, 'chat').m; ok(m.n === '플레이어 1' && m.w === 0 && m.t === '안녕하세요 <b>x</b>', '2 발신자 표시/원문 보존(이스케이프는 화면에서): ' + JSON.stringify(m));
  tx(C, { t: 'chat', text: '관전자 인사' }); ok(last(A, 'chat').m.n === '관전자 1' && last(A, 'chat').m.w === 2, '3 관전자도 채팅 가능 → 플레이어가 받음 (' + last(A, 'chat').m.n + ')'); tx(D, { t: 'chat', text: '두번째' }); ok(last(B, 'chat').m.n === '관전자 2', '4 관전자 번호 구분');
  tx(C, { t: 'act', a: 'pass' }); ok(!!last(C, 'err') && /관전자는 조작/.test(last(C, 'err').msg), '5 관전자의 게임 조작은 여전히 차단');
  tx(B, { t: 'chat', text: '   ' }); tx(B, { t: 'chat' }); ok(all(A, 'chat').length === 3, '6 빈 메시지 무시'); tx(B, { t: 'chat', text: 'a'.repeat(500) }); ok(last(A, 'chat').m.t.length === 200, '7 200자로 제한');
  tx(B, { t: 'chat', text: 'x\u0000y\nz' }); ok(!/[\u0000-\u001f]/.test(last(A, 'chat').m.t), '8 제어문자 제거');
  const B0 = all(A, 'chat').length; for (let i = 0; i < 8; i++) tx(B, { t: 'chat', text: 'spam' + i }); ok(all(A, 'chat').length - B0 < 8 && !!last(B, 'err'), `9 도배 제한: 8회 중 ${all(A, 'chat').length - B0}회만 통과`);
  const E = sock(); tx(E, { t: 'spectate', code }); const v = last(E, 'v'); ok(v && v.chat && v.chat.length >= 4 && v.chat[0].t === '안녕하세요 <b>x</b>', '10 늦게 들어온 관전자도 view.chat 으로 이전 대화 복원 (' + (v && v.chat && v.chat.length) + '개)');
  const F = sock(); tx(F, { t: 'chat', text: '방 밖' }); ok(!!last(F, 'err'), '11 방에 없으면 거부');
  for (let i = 0; i < 130; i++) { A.cts = []; tx(A, { t: 'chat', text: 'n' + i }); } const G = sock(); tx(G, { t: 'spectate', code }); ok(last(G, 'v').chat.length === 100, '12 최근 100개만 보관 (' + last(G, 'v').chat.length + ')');
 } catch (e) { ok(false, '예외: ' + e.stack); }
  console.log(`\nchat_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); }, 400);
