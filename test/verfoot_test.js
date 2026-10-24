// v1.29.1: 로비 하단 버전 표시 — 화면(index.html CLIENT_VER)과 서버(package.json) 버전을 함께 보여 패치 적용 여부를 바로 알 수 있게
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), pkg = require(path.join(ROOT, 'package.json'));
const cv = (html.match(/const CLIENT_VER='([^']+)'/) || [])[1];
ok(cv === pkg.version, `1 CLIENT_VER(${cv}) == package.json(${pkg.version})`);
ok(/<div id="verfoot"[^>]*>[^<]*<span id="vfc"><\/span>[^<]*<span id="vfs">/.test(html), '2 로비에 #verfoot(화면 버전 vfc · 서버 버전 vfs) 있음');
ok(html.indexOf('<div id="verfoot"') > html.indexOf('<div id="lobby">') && html.indexOf('<div id="verfoot"') < html.indexOf('<div id="game">'), '3 #verfoot 은 로비 영역 안, 게임 화면 앞');
ok(/m\.t==='hello'\)\{NET\.sv=m\.sv/.test(html) && /function verFoot\(\)/.test(html) && /DOMContentLoaded',verFoot/.test(html), '4 클라이언트: hello 수신 시 서버 버전 저장 + verFoot 로 표시, 로드 시 화면 버전 표시');
ok(/t: 'hello', sv: SERVER_VER/.test(srv), '5 서버: 접속 즉시 {t:hello, sv} 전송');
ok(/f\.className=v===CLIENT_VER\?'':'bad'/.test(html) && /#verfoot\.bad\{/.test(html), '6 버전이 다르면 .bad 로 강조');
console.log(`\nverfoot_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
