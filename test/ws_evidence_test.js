// 실제 서버(WebSocket 2인): 효과로 뒤집은 증거가 양쪽 클라이언트에 앞면(실제 카드 d)으로 동기화되고 턴이 지나도 유지되는지. 'ws' 모듈이 없으면 건너뜀
const { spawn } = require('child_process'), net = require('net'), path = require('path'); let WS; try { WS = require('ws'); } catch (e) { console.log('SKIP: ws 모듈 없음'); process.exit(0); }
const root = path.resolve(__dirname, '..'); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const free = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IMG = t => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text y="9">${t}</text></svg>`);
(async () => { const port = await free(); const c = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) } }); await new Promise(r => c.stdout.on('data', d => /listening/.test(String(d)) && r()));
  const mk = () => new Promise((r, j) => { const w = new WS('ws://127.0.0.1:' + port); w.msgs = []; w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => r(w)); w.on('error', j); }); const last = w => w.msgs.filter(m => m.t === 'v').pop(), snd = (w, m) => w.send(JSON.stringify(m));
  try { const A = await mk(), B = await mk(); snd(A, { t: 'create' }); await sleep(200); const code = last(A).code; snd(B, { t: 'join', code }); await sleep(300);
    const defs = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1', img: IMG('P') }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3', img: IMG('K') } }, list = [];
    for (let i = 0; i < 40; i++) { defs['f' + i] = { n: 'FLIP' + i, type: 'event', color: 'yellow', lv: '0', img: IMG('F' + i), ab: [{ ic: 'event', ops: [{ op: 'flip', n: 1 }] }] }; list.push('f' + i); }
    for (const w of [A, B]) snd(w, { t: 'ready', defs, list, partner: 'p', kase: 'k' }); await sleep(400);
    const vA = last(A), first = vA.first, F = first === 0 ? A : B, O = first === 0 ? B : A; for (const w of [F, O]) snd(w, { t: 'act', a: 'mull', ids: [] }); await sleep(300);
    ok(last(F).phase === 'play' && last(F).turn === first, '게임 시작 (선공 ' + first + ')');
    snd(F, { t: 'act', a: 'reason', who: 'p' }); await sleep(300); ok(last(F).P[first].evid === 1 && (last(O).P[first].evl || []).length === 1 && last(O).P[first].evl[0] === 0, '추리로 뒷면 증거 1장 — 상대 화면에도 뒷면(0)');
    const hid = last(F).P[first].hand[0].id; snd(F, { t: 'act', a: 'play', id: hid }); await sleep(400);
    const eF = last(F).P[first].evl[0], eO = last(O).P[first].evl[0]; ok(eF && eF.d && eO && eO.d && eF.d === eO.d, `효과로 앞면 처리 → 양쪽 클라이언트에 같은 실제 카드(d=${eO && eO.d}) — WebSocket 동기화`);
    ok(last(F).P[first].evUp.length === 1 && last(O).P[first].evUp.length === 1, 'evUp 도 양쪽 동일');
    snd(F, { t: 'act', a: 'end' }); await sleep(400); snd(O, { t: 'act', a: 'end' }); await sleep(400);
    const eO2 = last(O).P[first].evl[0], eF2 = last(F).P[first].evl[0]; ok(eO2 && eO2.d === eO.d && eF2 && eF2.d === eF.d, '턴이 두 번 넘어가도 앞면 유지(뒷면으로 돌아가지 않음)');
    A.close(); B.close(); } catch (e) { ok(false, '예외: ' + (e && e.stack || e)); } c.kill();
  console.log(fail ? `\nWS 증거 테스트 ${fail}건 실패 (통과 ${pass})` : `\nWS 증거 테스트 통과 (${pass}개)`); process.exit(fail ? 1 : 0); })();
