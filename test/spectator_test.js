// v1.15.0 관전 모드 WebSocket 통합 검증 (실제 server.js + 클라이언트 여러 개)
let WSP; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WSP = require.resolve(m); break; } catch (e) {} }
if (!WSP) { console.log('SKIP: ws 없음'); process.exit(0); }
const WS = require(WSP), { spawn } = require('child_process'), path = require('path'), net = require('net');
const PORT = 9100 + Math.floor(Math.random() * 400); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, RECONNECT_GRACE_MS: '800', NODE_PATH: path.dirname(path.dirname(WSP)) }, stdio: 'ignore' }); process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) {} });
const up = async () => { for (let i = 0; i < 80; i++) { if (await new Promise(r => { const c = net.connect(PORT, '127.0.0.1', () => { c.destroy(); r(true); }); c.on('error', () => r(false)); })) return; await sleep(100); } throw new Error('server'); };
const cli = () => new Promise((res, rej) => { const w = new WS('ws://127.0.0.1:' + PORT); w.msgs = []; w.on('message', d => { const m = JSON.parse(d); w.msgs.push(m); if (m.t === 'v') w.V = m; if (m.t === 'defs') w.defs = m.defs; if (m.t === 'joined') w.seat = m.seat; }); w.on('open', () => res(w)); w.on('error', rej); });
const send = (w, o) => w.send(JSON.stringify(o)); const waitFor = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(30); } return null; };
const err = (w, re) => w.msgs.some(m => m.t === 'err' && re.test(m.msg));
const card = n => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1' });
const mkDeck = tag => { const defs = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } }; const list = [];
  for (let i = 0; i < 14; i++) defs[tag + i] = card(tag + i); for (let i = 0; i < 40; i++) list.push(tag + Math.floor(i / 3)); return { defs, list, partner: 'p', kase: 'k' }; };
const reg = (w, tag) => send(w, { t: 'ready', ...mkDeck(tag) });
const ids = h => h.map(x => x.id).sort().join(',');
(async () => {
  await up();
  // 1) 관전 가능 방 생성 → 방 코드로 관전 (게임 시작 전 대기방)
  const a = await cli(); send(a, { t: 'create' }); await waitFor(() => a.V && a.V.code); const code = a.V.code;
  const s0 = await cli(); send(s0, { t: 'spectate', code: code.toLowerCase() });
  ok(await waitFor(() => s0.msgs.some(m => m.t === 'spectating') && s0.V), '관전 가능 방 생성 → 방 코드(소문자도 OK)로 관전 입장 (게임 시작 전 대기방)');
  ok(s0.V.spec === 1 && s0.V.phase === 'setup' && s0.V.code === code && !s0.msgs.some(m => m.t === 'joined'), '대기방 관전: spectator state(spec=1), 플레이어 토큰(joined) 없음');
  // 관전자는 슬롯을 차지하지 않는다
  const b = await cli(); send(b, { t: 'join', code }); ok(await waitFor(() => b.V && b.V.both && a.V.both), '관전자가 있어도 게스트가 P2 슬롯으로 입장 (관전자는 슬롯 미점유)');
  ok(b.seat === 1, '게스트 seat=1');
  // 2) 게임 진행 → 양쪽 손패
  reg(a, 'a'); reg(b, 'b'); await waitFor(() => a.V.phase === 'mull' && b.V.phase === 'mull');
  for (let i = 0; i < 2; i++) { const w = [a, b].find(x => x.V.mull === x.seat && x.V.phase === 'mull'); if (!w) break; send(w, { t: 'act', a: 'mull', ids: [] }); await waitFor(() => w.V.mull !== w.seat || w.V.phase === 'play'); }
  await waitFor(() => a.V.phase === 'play' && s0.V.phase === 'play'); await sleep(200);
  const hA = a.V.P[0].hand, hB = b.V.P[1].hand;
  ok(Array.isArray(s0.V.P[0].hand) && Array.isArray(s0.V.P[1].hand) && ids(s0.V.P[0].hand) === ids(hA) && ids(s0.V.P[1].hand) === ids(hB) && hA.length > 0 && hB.length > 0, '관전자: P1·P2 손패 모두 카드 정보(앞면) — 실제 손패와 일치');
  ok(typeof a.V.P[1].hand === 'number' && a.V.P[1].hand === hB.length, 'P1 은 P2 손패를 개수(숫자)로만 받음 — 비공개 유지');
  ok(typeof b.V.P[0].hand === 'number' && b.V.P[0].hand === hA.length, 'P2 는 P1 손패를 개수(숫자)로만 받음 — 비공개 유지');
  const leak = (w, other) => w.msgs.filter(m => m.t === 'v').some(v => v.P.some((p, i) => i !== w.seat && Array.isArray(p.hand))) || JSON.stringify(w.msgs).includes(JSON.stringify(other[0].d) + '__never__');
  ok(!leak(a, hB) && !leak(b, hA), '플레이어가 받은 모든 state 에 상대 손패 배열이 한 번도 없음');
  ok(s0.V.acts && Object.keys(s0.V.acts).length === 0 && s0.V.rt === 0 && s0.V.me === 0, '관전자 state: acts 비어 있음, rt=0');
  // 3) 관전자 조작 거부
  const bad = [{ t: 'act', a: 'end' }, { t: 'act', a: 'hint' }, { t: 'act', a: 'play', id: hA[0].id }, { t: 'act', a: 'resign' }, { t: 'act', a: 'ans', v: null }, { t: 'ready', ...mkDeck('x') }, { t: 'restartGame' }, { t: 'restartTurn' }, { t: 'leaveBot' }, { t: 'botlog' }, { t: 'createBot' }, { t: 'create' }, { t: 'join', code }, { t: 'resume', code, seat: 0, token: 'x' }];
  const before = JSON.stringify([a.V.P[0].hand, a.V.turn, a.V.n, b.V.P[1].hand]), nA = a.msgs.length, nB = b.msgs.length;
  for (const m of bad) send(s0, m); await sleep(500);
  ok(bad.length === s0.msgs.filter(m => m.t === 'err' && /관전자는 조작할 수 없습니다/.test(m.msg)).length, `관전자의 조작 메시지 ${bad.length}종 전부 서버가 거부`);
  ok(a.msgs.length === nA && b.msgs.length === nB && JSON.stringify([a.V.P[0].hand, a.V.turn, a.V.n, b.V.P[1].hand]) === before && a.V.phase === 'play', '거부된 메시지는 게임 상태·플레이어 쪽 브로드캐스트에 아무 영향 없음');
  // 4) 중간 입장 + 여러 관전자
  const s1 = await cli(), s2 = await cli(); send(s1, { t: 'spectate', code }); send(s2, { t: 'spectate', code });
  ok(await waitFor(() => s1.V && s2.V && s1.V.phase === 'play' && s2.V.phase === 'play'), '게임 진행 중 관전 입장 + 여러 관전자 동시 접속');
  ok(ids(s1.V.P[0].hand) === ids(hA) && ids(s2.V.P[1].hand) === ids(hB) && s1.V.n === a.V.n && s1.V.turn === a.V.turn && s1.V.P[0].deck === a.V.P[0].deck, '중간 입장 즉시 현재 상태 전체 수신 (양쪽 손패·턴·덱 수)');
  ok(s1.defs && Object.keys(s1.defs).length > 0, '중간 입장 시 카드 정의(defs) 수신');
  // 5) 실시간 상태 변화
  const cur = [a, b].find(x => x.V.turn === x.seat), opp = cur === a ? b : a;
  const h0 = cur.V.P[cur.seat].hand.length, f0 = cur.V.P[cur.seat].file;
  const snap = () => [s0, s1, s2].map(s => s.V.n + ':' + s.V.turn + ':' + s.V.P[cur.seat].hand.length + ':' + s.V.P[cur.seat].file);
  const hc = cur.V.P[cur.seat].hand.find(c => (cur.defs[c.d] || {}).type === 'char' && +(cur.defs[c.d].lv || 0) === 0);
  if (hc) { const hl = cur.V.P[cur.seat].hand.length; send(cur, { t: 'act', a: 'play', id: hc.id }); await sleep(400);
    ok(cur.V.P[cur.seat].field.some(x => x.id === hc.id) && [s0, s1, s2].every(s => s.V.P[cur.seat].field.some(x => x.id === hc.id) && s.V.P[cur.seat].hand.length === hl - 1 && !s.V.P[cur.seat].hand.some(x => x.id === hc.id)), '카드 등장 → 필드 반영 + 손패 감소가 관전자의 손패 목록에도 즉시 반영'); }
  else ok(true, '(레벨 0 캐릭터 없음 — 등장 검증 생략)');
  send(cur, { t: 'act', a: 'hint' }); await sleep(400);
  ok(cur.V.P[cur.seat].file !== f0 && cur.V.fl.hw === 1 && [s0, s1, s2].every(s => s.V.P[cur.seat].file === cur.V.P[cur.seat].file && s.V.fl.hw === 1), '넥스트 힌트(FILE 증가) → 새로고침 없이 모든 관전자에 반영');
  send(cur, { t: 'act', a: 'skip' }); await sleep(300);
  const t0 = cur.V.turn, n0 = cur.V.n; send(cur, { t: 'act', a: 'end' }); await sleep(500);
  ok(a.V.n === n0 + 1 && [s0, s1, s2].every(s => s.V.n === n0 + 1 && s.V.turn !== t0), '턴 종료 → 턴 변경이 관전자에 실시간 반영');
  ok([s0, s1, s2].every(s => ids(s.V.P[0].hand) === ids(a.V.P[0].hand) && ids(s.V.P[1].hand) === ids(b.V.P[1].hand)), '턴 진행 후에도 관전자 손패 = 실제 양쪽 손패 (드로우 포함)');
  ok(s0.V.nspec === 3, '관전자 수(nspec) 표시: 3명');
  // 6) 관전자 연결 종료는 게임에 영향 없음
  s1.terminate(); await sleep(500);
  ok(a.V.both && b.V.both && a.V.phase === 'play' && s0.V.nspec === 2 && s2.V.phase === 'play', '관전자 1명 종료 → 게임/Player 1·2 연결 영향 없음, 관전자 수 갱신');
  s0.terminate(); s2.terminate(); await sleep(1300);   // GRACE(800ms) 보다 오래 기다려도
  ok(a.V.phase === 'play' && a.V.both && b.V.both, '관전자 전원 종료 후 유예 시간이 지나도 방·게임 유지');
  send(a, { t: 'act', a: 'end' }); send(b, { t: 'act', a: 'end' }); await sleep(300);
  ok(a.V.phase === 'play', '관전자가 없어도 정상 진행');
  // 7) 다시하기 이후에도 관전 유지 + 종료 결과
  const sx = await cli(); send(sx, { t: 'spectate', code }); await waitFor(() => sx.V);
  const mr = sx.msgs.length; send(a, { t: 'restartGame' });
  ok(await waitFor(() => sx.msgs.slice(mr).some(m => m.t === 'reset' && m.kind === 'game') && sx.V.phase === 'setup' && sx.V.code === code), '다시하기 → 관전자 연결 유지, 새 게임(setup) 상태 수신');
  reg(a, 'a'); reg(b, 'b'); await waitFor(() => a.V.phase === 'mull');
  for (let i = 0; i < 2; i++) { const w = [a, b].find(x => x.V.mull === x.seat && x.V.phase === 'mull'); if (!w) break; send(w, { t: 'act', a: 'mull', ids: [] }); await waitFor(() => w.V.mull !== w.seat || w.V.phase === 'play'); }
  await waitFor(() => sx.V.phase === 'play'); await sleep(200);
  ok(sx.V.phase === 'play' && Array.isArray(sx.V.P[0].hand) && Array.isArray(sx.V.P[1].hand) && ids(sx.V.P[0].hand) === ids(a.V.P[0].hand), '다시하기 후 새 게임을 같은 관전 연결로 계속 관전 (양쪽 손패 앞면)');
  const loser = [a, b][0]; send(loser, { t: 'act', a: 'resign' }); await sleep(400);
  ok(sx.V.phase === 'over' && sx.V.winner === 1 && a.V.winner === 1, '게임 종료(항복) → 관전자도 승패 결과 수신');
  // 8) 관전 불가 방
  const h = await cli(); send(h, { t: 'create', noSpec: true }); await waitFor(() => h.V && h.V.code); const code2 = h.V.code;
  const z = await cli(); send(z, { t: 'spectate', code: code2 }); await sleep(400);
  ok(err(z, /이 방은 관전이 허용되지 않습니다\./) && !z.V && !z.msgs.some(m => m.t === 'spectating'), '관전 불가 방 → "이 방은 관전이 허용되지 않습니다." 로 차단, state 도 안 받음');
  const raw = new WS('ws://127.0.0.1:' + PORT); const rm = []; raw.on('message', d => rm.push(JSON.parse(d))); await new Promise(r => raw.on('open', r));
  for (const o of [{ t: 'spectate', code: code2 }, { t: 'spectate', code: code2, noSpec: false }, { t: 'spectate', code: code2.toLowerCase(), spec: true, force: true }]) raw.send(JSON.stringify(o)); await sleep(400);
  ok(rm.filter(m => m.t === 'err').length === 3 && !rm.some(m => m.t === 'v' || m.t === 'spectating'), 'WebSocket 직접 호출(변형 payload 포함)로도 관전 불가 우회 불가');
  const g2 = await cli(); send(g2, { t: 'join', code: code2 }); await waitFor(() => g2.V && g2.V.both);
  reg(h, 'a'); reg(g2, 'b'); await waitFor(() => h.V.phase === 'mull'); send(h, { t: 'restartGame' }); await waitFor(() => h.V.phase === 'setup' && !h.V.P[0].ready); await sleep(200);
  const z2 = await cli(); send(z2, { t: 'spectate', code: code2 }); await sleep(400);
  ok(err(z2, /관전이 허용되지 않습니다/), '관전 불가 방은 다시하기 이후에도 계속 관전 불가');
  // 9) 기타: 없는 방, 이미 방에 있는 소켓, 관전자 leaveRoom, 방 종료 시 관전자 통보, 봇 방
  const q = await cli(); send(q, { t: 'spectate', code: 'ZZZZ' }); ok(await waitFor(() => err(q, /없는 방 코드/)), '없는 방 코드 → 오류');
  send(a, { t: 'spectate', code }); await sleep(300); ok(err(a, /이미 방에 들어가 있습니다/) && a.V.phase === 'over', '이미 플레이어인 소켓은 관전 전환 불가');
  const sl = await cli(); send(sl, { t: 'spectate', code }); await waitFor(() => sl.V); send(sl, { t: 'leaveRoom' }); ok(await waitFor(() => sl.msgs.some(m => m.t === 'left')), '관전자 leaveRoom → 정상 퇴장');
  await sleep(200); ok(a.V.nspec === 1 || a.V.nspec === undefined, '퇴장한 관전자는 목록에서 제거');
  const sc = await cli(); send(sc, { t: 'spectate', code: code2 }); // (불가방) 무시
  const sw = await cli(); const hh = await cli(); send(hh, { t: 'create' }); await waitFor(() => hh.V && hh.V.code); send(sw, { t: 'spectate', code: hh.V.code }); await waitFor(() => sw.V);
  send(hh, { t: 'leaveRoom' }); ok(await waitFor(() => sw.msgs.some(m => m.t === 'left' && m.msg)), '방이 사라지면(모든 플레이어 퇴장) 관전자에게 종료 안내 후 로비 복귀');
  const bw = await cli(); send(bw, { t: 'createBot', mode: 'bot' }); await sleep(600); const sb = await cli();
  if (bw.V && bw.V.code) { send(sb, { t: 'spectate', code: bw.V.code }); ok(await waitFor(() => err(sb, /봇 대전/)), '봇 대전/연습 방은 관전 불가'); } else ok(true, '(봇 방 생성 불가 환경 — 생략)');
  console.log(`\n${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
