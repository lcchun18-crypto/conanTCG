// 배포(Render) 호환 검사: PORT / health / 외부 바인딩 / 하드코딩 없음 / 경로 대소문자 / WebSocket 2인 + ping
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), path = require('path'), net = require('net');
const root = path.resolve(__dirname, '..'); let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const get = (port, p, host = '127.0.0.1') => new Promise(r => http.get({ host, port, path: p }, res => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => r({ s: res.statusCode, h: res.headers, b: Buffer.concat(b) })); }).on('error', e => r({ s: 0, e: e.code })));
const free = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const boot = (env) => new Promise((res, rej) => { const c = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, ...env } }); let out = ''; c.stdout.on('data', d => { out += d; if (/listening/.test(out)) res({ c, out }); }); c.stderr.on('data', d => out += d); c.on('exit', code => rej(new Error('exit ' + code + ' ' + out))); setTimeout(() => rej(new Error('timeout ' + out)), 8000); });
(async () => {
  // 1) 소스에 하드코딩 없음
  const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok(!/localhost|127\.0\.0\.1/.test(srv) && !/localhost|127\.0\.0\.1/.test(idx), 'server.js / index.html 에 localhost·127.0.0.1 하드코딩 없음');
  ok(!/ws:\/\/[a-z0-9.]+(:\d+)?/i.test(idx.replace(/'ws:\/\/'/g, '')) && /location\.protocol==='https:'\?'wss:\/\/':'ws:\/\/'\)\+location\.host/.test(idx), '클라이언트 WebSocket 주소는 현재 페이지 protocol/host 기준 (https → wss, http → ws)');
  ok(/process\.env\.PORT/.test(srv) && !/listen\(\s*3000/.test(srv) && !/listen\([^)]*(localhost|127)/.test(srv), 'PORT 환경변수 사용, 포트/주소 고정 없음');
  ok(!/writeFile|appendFile|createWriteStream|mkdirSync/.test(srv), '서버가 로컬 디스크에 상태를 저장하지 않음(메모리 방 상태만)');
  // 2) 파일 경로 대소문자: index.html 이 참조하는 assets/* 가 실제 파일명과 정확히 일치 (Linux 는 대소문자 구분)
  const refs = [...idx.matchAll(/assets\/([\w.\-]+)/g)].map(m => m[1]), real = fs.readdirSync(path.join(root, 'assets'));
  ok(refs.length >= 1 && refs.every(f => real.includes(f)), `assets 참조 대소문자 일치: ${[...new Set(refs)]} ⊂ ${real}`);
  ok(/require\('\.\/fx'\)/.test(srv) && fs.existsSync(path.join(root, 'fx.js')) && fs.existsSync(path.join(root, 'index.html')), 'require/읽는 파일 이름 대소문자 일치 (fx.js, index.html)');
  const pk = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); ok(pk.scripts.start === 'node server.js' && pk.dependencies.ws && /18/.test(pk.engines.node), 'npm start = node server.js, 의존성 ws, engines.node >= 18');
  // 3) PORT 사용 + 외부 인터페이스 바인딩 + health + assets 대소문자
  const port = await free(), { c, out } = await boot({ PORT: String(port), WS_PING_MS: '300' });
  try {
    ok(new RegExp('port ' + port).test(out), 'PORT 환경변수로 실행: ' + out.trim());
    const h = await get(port, '/health'); ok(h.s === 200 && h.b.toString() === 'OK', '/health → 200 OK');
    const addr = Object.values(require('os').networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal);
    if (addr) { const e = await get(port, '/health', addr.address); ok(e.s === 200, `외부 인터페이스(${addr.address})로도 접속 가능 (localhost 전용 바인딩 아님)`); } else console.log('  (외부 인터페이스 없음 - 건너뜀)');
    const i = await get(port, '/'); ok(i.s === 200 && /text\/html/.test(i.h['content-type']) && i.b.toString().includes('명탐정 코난'), '/ → index.html');
    const a = await get(port, '/assets/cardback.png'); ok(a.s === 200 && /image\/png/.test(a.h['content-type']) && a.b.length > 1000, '/assets/cardback.png → 200 (카드 뒷면)');
    const a2 = await get(port, '/assets/CardBack.png'); ok(a2.s === 404, '대소문자가 다르면 404 (Linux 동작과 동일하게 정확한 이름만 사용)');
    const t = await get(port, '/assets/..%2fserver.js'); ok(t.s !== 200 || !/createServer/.test(t.b.toString()), '경로 이탈 차단');
    // 4) WebSocket 2인 (실제 서버, 같은 host 기준) + ping 유지
    const WS = require('ws'); const mk = () => new Promise((r, j) => { const w = new WS('ws://127.0.0.1:' + port); w.msgs = []; w.pings = 0; w.on('ping', () => w.pings++); w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => r(w)); w.on('error', j); });
    const A = await mk(); A.send(JSON.stringify({ t: 'create' })); await new Promise(r => setTimeout(r, 200)); const code = A.msgs.find(m => m.t === 'v').code;
    const B = await mk(); B.send(JSON.stringify({ t: 'join', code })); await new Promise(r => setTimeout(r, 300));
    ok(code && B.msgs.some(m => m.t === 'v' && m.me === 1) && A.msgs.filter(m => m.t === 'v').pop().both, `WebSocket 방 생성/입장 (${code}), 2인 동기화`);
    await new Promise(r => setTimeout(r, 900)); ok(A.pings >= 2 && B.pings >= 2, `서버 ping 으로 연결 유지 (A ${A.pings}회 / B ${B.pings}회)`);
    const C = await mk(); C.send(JSON.stringify({ t: 'join', code: 'ZZZZ' })); await new Promise(r => setTimeout(r, 200)); ok(C.msgs.some(m => m.t === 'err'), '없는 방 코드는 기존처럼 오류'); [A, B, C].forEach(w => w.close());
    c.kill('SIGTERM'); const code2 = await new Promise(r => c.on('exit', r)); ok(code2 === 0, 'SIGTERM 종료(재배포) 정상: exit ' + code2);
  } finally { c.kill(); }
  // 5) PORT 없이 실행 = 기존처럼 3000
  const s3 = await new Promise(r => { const t = net.createServer().once('error', () => r(false)).listen(3000, () => t.close(() => r(true))); });
  if (s3) { const env = { ...process.env }; delete env.PORT; const { c: c3, out: o3 } = await boot(env).then(x => x); ok(/port 3000/.test(o3), 'PORT 없으면 기존처럼 3000: ' + o3.trim()); const l = await get(3000, '/health', 'localhost'); ok(l.s === 200, 'http://localhost:3000 접속'); c3.kill(); } else console.log('  (3000 포트 사용 중 - 기본 포트 검사 건너뜀)');
  console.log(fail ? `배포 테스트 ${fail}건 실패 (통과 ${pass})` : `배포 호환 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ✗ 예외', e.message); process.exit(1); });
