process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// 전문 봇 등록 CLI 테스트: 덱 JSON → add (검증 통과 시에만 파일 생성) / 실패 시 아무것도 쓰지 않음 / update / list·check.  (임시 폴더 + 샘플 카드 DB 사용)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process'), X = require('./specialist_util.js'), U = X.U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')), out = path.join(tmp, 'out'); fs.mkdirSync(out);
const dbp = path.join(tmp, 'cards.json'); fs.writeFileSync(dbp, JSON.stringify({ cards: U.db() })); const dbBefore = fs.readFileSync(dbp, 'utf8');
const CLI = path.join(__dirname, '../bot/specialists/cli.js'), run = (...a) => spawnSync('node', [CLI, ...a, '--db', dbp], { env: { ...process.env, BOT_SPECIALISTS_DIR: out }, encoding: 'utf8' });
const d1 = U.makeDeck(201), d2 = U.makeDeck(202), f1 = path.join(tmp, 'd1.json'), f2 = path.join(tmp, 'd2.json'), raw1 = JSON.stringify(X.exportDeck('내보낸 덱', d1), null, 1) + '\n'; fs.writeFileSync(f1, raw1); fs.writeFileSync(f2, JSON.stringify(X.exportDeck('새 버전', d2), null, 1));
let r = run('validate', f1); ok(r.status === 0 && /내보낸 덱/.test(r.stdout) && /메인 40장/.test(r.stdout), 'validate: 덱 이름/사건/파트너/40장 인식 → ' + r.stdout.trim().slice(0, 90));
r = run('add', f1, '--id', 'cli_bot', '--name', '적색 CLI Expert', '--desc', '설명'); ok(r.status === 0 && fs.existsSync(path.join(out, 'cli_bot.js')) && fs.existsSync(path.join(out, 'decks', 'cli_bot.json')), 'add: 전문 봇 파일 + 덱 파일 생성');
ok(fs.readFileSync(path.join(out, 'decks', 'cli_bot.json'), 'utf8') === raw1, '덱 JSON 은 내보낸 파일 그대로 (변환 없음)');
const env = { ...process.env, BOT_SPECIALISTS_DIR: out }; const chk = spawnSync('node', ['-e', `const R=require('${path.join(__dirname, '../bot/specialists/registry.js')}');const s=R.get('cli_bot');const DB=JSON.parse(require('fs').readFileSync('${dbp}','utf8')).cards;console.log(JSON.stringify({n:s&&s.name,d:s&&s.deck.name,ok:R.check(s,DB).ok,p:R.problems()}))`], { env, encoding: 'utf8' });
ok(JSON.parse(chk.stdout).n === '적색 CLI Expert' && JSON.parse(chk.stdout).d === '내보낸 덱' && JSON.parse(chk.stdout).ok, 'registry 가 새 파일을 읽고 덱 검증 통과: ' + chk.stdout.trim());
r = run('add', f1, '--id', 'cli_bot', '--name', 'x'); ok(r.status !== 0 && /이미 등록된 id/.test(r.stderr), '같은 id 재등록 거부 (덮어쓰지 않음)');
// 잘못된 덱: 아무 파일도 만들지 않고 이유만 출력
const bad = X.exportDeck('나쁜 덱', d1); bad.main[0].n = 4; bad.main.push({ id: 'id_NOPE', n: 1 }); const fb = path.join(tmp, 'bad.json'); fs.writeFileSync(fb, JSON.stringify(bad));
r = run('add', fb, '--id', 'bad_bot', '--name', 'Bad'); ok(r.status === 1 && /DB 에 없는 카드 ID: id_NOPE/.test(r.stderr) && /최대 3장/.test(r.stderr) && /정확히 40장/.test(r.stderr), '검증 실패: 없는 ID / 3장 초과 / 장수 오류를 모두 보고: ' + r.stderr.split('\n').slice(0, 4).join(' | ').slice(0, 200));
ok(!fs.existsSync(path.join(out, 'bad_bot.js')) && !fs.existsSync(path.join(out, 'decks', 'bad_bot.json')) && /자동으로 고치거나 카드를 바꾸지 않았습니다/.test(r.stderr), '실패 시 아무것도 등록하지 않음 (자동 보정 없음)');
r = run('add', f1, '--id', 'Bad Id', '--name', 'x'); ok(r.status === 1 && /id 는 영소문자/.test(r.stderr), '잘못된 id 거부');
// update
r = run('update', 'cli_bot', f2); ok(r.status === 0 && JSON.parse(fs.readFileSync(path.join(out, 'decks', 'cli_bot.json'), 'utf8')).name === '새 버전' && fs.readFileSync(path.join(out, 'decks', 'cli_bot.json.bak'), 'utf8') === raw1, 'update: 덱 교체 + 이전 버전 .bak 보관');
r = run('update', 'cli_bot', fb); ok(r.status === 1 && JSON.parse(fs.readFileSync(path.join(out, 'decks', 'cli_bot.json'), 'utf8')).name === '새 버전', 'update 검증 실패 → 기존 덱 유지');
r = run('list'); ok(r.status === 0 && /✓ cli_bot/.test(r.stdout), 'list/check: 검증 결과 표시'); ok(fs.readFileSync(dbp, 'utf8') === dbBefore, '카드 DB 파일은 전혀 수정되지 않음');
console.log(fail ? `\n전문 봇 CLI 테스트 ${fail}건 실패` : `\n전문 봇 CLI 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
