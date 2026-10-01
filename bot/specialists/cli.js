#!/usr/bin/env node
// 전문 봇 관리 CLI.  data/cards.json 은 읽기만 합니다 (절대 수정하지 않음).
//   node bot/specialists/cli.js validate <덱.json>                       덱 파일만 검증 (등록 안 함)
//   node bot/specialists/cli.js add <덱.json> --id fbi_red --name "적색 FBI Expert" [--desc "..."] [--color red]
//   node bot/specialists/cli.js update <id> <새덱.json>                  덱 리스트를 새 버전으로 교체 (프로필은 그대로, 검증 통과 시에만)
//   node bot/specialists/cli.js list | check [id]                        등록된 전문 봇 / 덱·프로필 검증
// 옵션: --db <cards.json 경로> (기본: data/cards.json 또는 CARDS_JSON 환경변수)
const fs = require('fs'), path = require('path');
const DF = require('./deckfile.js'), REG = require('./registry.js');
const args = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; } else pos.push(args[i]); }
const cmd = pos[0];
const OUT = process.env.BOT_SPECIALISTS_DIR ? path.resolve(process.env.BOT_SPECIALISTS_DIR) : __dirname; // 기본: 이 폴더 (BOT_SPECIALISTS_DIR 이 있으면 그 폴더에 등록 — 개인용/테스트용)
function loadDb() { const p = opt.db || process.env.CARDS_JSON || path.join(__dirname, '..', '..', 'data', 'cards.json'); try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (!j.cards) throw new Error("'cards' 없음"); return { db: j.cards, path: p }; } catch (e) { console.error(`카드 DB 를 읽을 수 없습니다 (${p}): ${e.message}`); process.exit(2); } }
const fail = (errs, head) => { console.error('✗ ' + head); errs.forEach(e => console.error('  - ' + e)); console.error('\n덱을 자동으로 고치거나 카드를 바꾸지 않았습니다. 덱 빌더에서 수정 후 다시 내보내 주세요.'); process.exit(1); };
const readFile = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { console.error('파일을 읽을 수 없습니다: ' + f); process.exit(2); } };

if (cmd === 'validate') {
  const { db } = loadDb(), r = DF.loadDeck(readFile(pos[1] || ''), db); if (!r.ok) fail(r.errors, `덱 검증 실패 (${pos[1]})`);
  console.log(`✓ 덱 "${r.deck.name}" — 사건 ${r.deck.kase}, 파트너 ${r.deck.partner}, 메인 ${r.deck.total}장 (${Object.keys(r.deck.cards).length}종), 색: ${DF.deckColors(r.deck, db).join('/')}`);
} else if (cmd === 'add') {
  const src = pos[1], id = opt.id, name = opt.name; if (!src || !id || !name || id === true || name === true) { console.error('사용법: add <덱.json> --id <id> --name "<표시 이름>"'); process.exit(2); }
  if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) fail([`id 는 영소문자/숫자/_ (2~41자): ${id}`], '잘못된 id');
  const tgtJs = path.join(OUT, id + '.js'), tgtDeck = path.join(OUT, 'decks', id + '.json');
  if (fs.existsSync(tgtJs) || fs.existsSync(tgtDeck)) fail([`이미 등록된 id 입니다: ${id} (덱 교체는 update 사용)`], '등록 실패');
  if (['registry', 'policy', 'deckfile', 'cli'].includes(id) || id.startsWith('_')) fail([`사용할 수 없는 id: ${id}`], '등록 실패');
  const { db } = loadDb(), raw = readFile(src), r = DF.loadDeck(raw, db); if (!r.ok) fail(r.errors, `덱 검증 실패 (${src}) — 등록하지 않았습니다`);
  fs.mkdirSync(path.join(OUT, 'decks'), { recursive: true }); fs.writeFileSync(tgtDeck, raw.endsWith('\n') ? raw : raw + '\n');
  const colorLine = opt.color && opt.color !== true ? `  color: ${JSON.stringify(opt.color)},\n` : '';
  fs.writeFileSync(tgtJs, `// ${name} — 덱: ${r.deck.name} (사건 ${r.deck.kase} / 파트너 ${r.deck.partner}).  전략 프로필은 아래 profile 에만 추가합니다 (범용 Expert 탐색 위에 얹힘).\n// 항목 설명: bot/specialists/_template.js\nmodule.exports = {\n  id: ${JSON.stringify(id)},\n  name: ${JSON.stringify(name)},\n  desc: ${JSON.stringify(typeof opt.desc === 'string' ? opt.desc : '')},\n${colorLine}  deckFile: ${JSON.stringify('decks/' + id + '.json')},\n  profile: {\n    notes: '',\n  },\n};\n`);
  console.log(`✓ 등록 완료: ${name} (${id})\n  - ${path.relative(process.cwd(), tgtDeck)}  (내보낸 덱 JSON 그대로)\n  - ${path.relative(process.cwd(), tgtJs)}  (프로필: 비어 있으면 범용 Expert 와 동일)\n  서버를 다시 시작하면 "봇과 대전" 목록에 자동으로 나타납니다.`);
} else if (cmd === 'update') {
  const id = pos[1], src = pos[2]; if (!id || !src) { console.error('사용법: update <id> <새덱.json>'); process.exit(2); }
  const tgtDeck = path.join(OUT, 'decks', id + '.json'); if (!fs.existsSync(tgtDeck)) fail([`등록되지 않은 id: ${id}`], '갱신 실패');
  const { db } = loadDb(), raw = readFile(src), r = DF.loadDeck(raw, db); if (!r.ok) fail(r.errors, `덱 검증 실패 (${src}) — 기존 덱을 그대로 두었습니다`);
  fs.copyFileSync(tgtDeck, tgtDeck + '.bak'); fs.writeFileSync(tgtDeck, raw.endsWith('\n') ? raw : raw + '\n'); console.log(`✓ ${id} 덱 교체 (이전 버전: decks/${id}.json.bak)`);
  const ck = REG.check(REG.reload().get(id), db); ck.warnings.forEach(w => console.log('  ⚠ ' + w)); if (!ck.ok) { ck.errors.forEach(e => console.log('  ✗ ' + e)); console.log('  프로필이 새 덱과 맞지 않습니다 — 위 항목을 수정하세요.'); process.exit(1); }
} else if (cmd === 'list' || cmd === 'check') {
  const { db } = loadDb(); let bad = 0; const L = REG.checkAll(db).filter(x => !pos[1] || x.id === pos[1]);
  if (!L.length) console.log('등록된 전문 봇이 없습니다.'); for (const x of L) { console.log(`${x.ok ? '✓' : '✗'} ${x.id} — ${x.name}`); x.errors.forEach(e => console.log('    ✗ ' + e)); x.warnings.forEach(w => console.log('    ⚠ ' + w)); if (!x.ok) bad++; }
  REG.problems().forEach(p => { console.log('✗ ' + p); bad++; }); process.exit(bad ? 1 : 0);
} else { console.log('명령: validate | add | update | list | check  (파일 상단 주석 참고)'); process.exit(cmd ? 2 : 0); }
