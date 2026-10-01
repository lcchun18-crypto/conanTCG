#!/usr/bin/env node
// Expert Knowledge Layer CLI — 고수 판단 회귀 케이스 추가/실행, AI 결정 설명, 지식 베이스 점검.
//
//   node bot/expert/cli.js case add --log <AI기록.json> --n <결정번호> --a "<행동>" --b "<행동>" --expert A --reason "<고수가 고른 이유>"
//                                   [--name 이름] [--source 출처] [--date YYYY-MM-DD] [--tags a,b] [--check prefer|first] [--margin 0.5] [--bot pro|<전문봇>] [--dir test/expert_cases]
//   node bot/expert/cli.js case add --snap <snap.json> --seat <0|1> …      (스냅샷 파일)      --state <간이상태.json> …  (간이 상태: bot/expert/cases.js 주석)
//       행동: AI 기록의 describe 문자열('추리: 파트너', '공격: A → B', '사용: X', '어시스트', '턴 종료', '넥스트 힌트') · 짧은 형식('reason:p', 'attack:id_0861>id_0001', 'play:id_0419')
//             · 여러 행동을 ';' 로 이으면 앞부분이 고정된 라인 ("사용: X; 넥스트 힌트")
//   node bot/expert/cli.js case list
//   node bot/expert/cli.js case run [--bot <id>] [--compare pro_v12] [--file 003] [--v]
//   node bot/expert/cli.js why --log <AI기록.json> --n <결정번호>          후보별 판단 요소 분해 (기록에 없으면 스냅샷으로 다시 계산)
//   node bot/expert/cli.js why --snap|--state <파일> [--seat 0|1] [--bot pro]
//   node bot/expert/cli.js kb list [--deck <덱.json>] [--opp <덱.json>] [--side first|second] [--bot pro|<전문봇>]   적용/제외되는 지식과 이유
//   node bot/expert/cli.js kb check                                         지식 파일 검증 (형식·카드 ID·범위)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const die = m => { console.error('오류: ' + m); process.exit(1); };
let _db = null; const DB = () => _db || (_db = JSON.parse(fs.readFileSync(process.env.BOT_TEST_DB || path.join(ROOT, 'data/cards.json'), 'utf8')).cards);
const readJ = f => { try { return JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')); } catch (e) { die(`${f}: ${e.message}`); } };
const r2 = x => Math.round(x * 100) / 100;

function decisionFromLog(file, n) {
  const log = readJ(file), ds = (log.decisions || log.log && log.log.decisions || []);
  const d = ds.find(x => x.n === +n) || null; if (!d) die(`기록에 결정 #${n} 이 없습니다 (1~${ds.length})`);
  return { log: log.decisions ? log : log.log, d };
}
function parseCand(s) { if (s == null || s === true) return null; const t = String(s).trim(); if (t.startsWith('[') || t.startsWith('{')) { try { return JSON.parse(t); } catch (e) { die('후보 JSON 오류: ' + e.message); } } const parts = t.split(';').map(x => x.trim()).filter(Boolean); return parts.length > 1 ? parts : parts[0]; }
const slug = s => String(s || 'case').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'case';

function caseAdd() {
  const C = require('./cases.js'), dir = path.resolve(arg('dir') || path.join(ROOT, 'test/expert_cases'));
  const c = { name: arg('name') !== true && arg('name') || null, reason: arg('reason'), expert: arg('expert') || 'A', candidates: {}, check: arg('check') || 'prefer' };
  for (const k of ['a', 'b', 'c', 'd']) { const v = parseCand(arg(k)); if (v) c.candidates[k.toUpperCase()] = v; }
  if (Object.keys(c.candidates).length < 2) die('--a 와 --b (후보 2개 이상)가 필요합니다');
  if (!c.reason || c.reason === true) die('--reason "고수가 그렇게 고른 이유" 가 필요합니다');
  if (arg('margin')) c.margin = +arg('margin'); for (const k of ['source', 'date']) if (arg(k) && arg(k) !== true) c[k] = arg(k); if (arg('tags')) c.tags = String(arg('tags')).split(',').map(x => x.trim());
  c.date = c.date || new Date().toISOString().slice(0, 10);
  if (arg('log')) { const { log, d } = decisionFromLog(arg('log'), arg('n')); if (!d.snap) die(`결정 #${d.n} 은 메인 결정이 아니라 스냅샷이 없습니다 (kind=${d.kind})`); c.snapshot = d.snap; c.seat = log.botSeat; c.bot = arg('bot') || log.specialist || 'pro'; c.name = c.name || `결정 #${d.n}: ${d.chosen && d.chosen.desc}`; c.source = c.source || `AI 기록 ${path.basename(arg('log'))} #${d.n}`; c.botChose = d.chosen && d.chosen.desc; }
  else if (arg('snap')) { c.snapshot = readJ(arg('snap')); c.seat = arg('seat') != null ? +arg('seat') : c.snapshot.turn; c.bot = arg('bot') || 'pro'; }
  else if (arg('state')) { c.state = readJ(arg('state')); c.seat = arg('seat') != null ? +arg('seat') : (c.state.turn || 0); c.bot = arg('bot') || 'pro'; }
  else die('--log + --n / --snap / --state 중 하나가 필요합니다');
  c.name = c.name || '고수 판단 케이스';
  // 저장 전 검증: 상태 복원 + 후보 행동을 실제 합법 수에서 찾고, 지금 봇의 판정도 보여준다
  const H = require(path.join(ROOT, 'test/helpers.js')), SIM = require('../simulate.js'), REG = require('../specialists/registry.js');
  const ctx = { H, SIM, S: SIM.S, DB: DB(), base: process.cwd() }; let R; try { R = C.buildState(c, ctx); } catch (e) { die('상태 복원 실패: ' + e.message); }
  const seat = c.seat != null ? c.seat : SIM.who(R).seat; let res; try { res = C.judge(R, seat, c, { policy: REG.policyFor(c.bot, seat, R) }); } catch (e) { die(e.message); }
  fs.mkdirSync(dir, { recursive: true }); const nums = fs.readdirSync(dir).map(f => +(/^(\d+)/.exec(f) || [0, 0])[1]); const num = String(Math.max(0, ...nums) + 1).padStart(3, '0');
  const file = path.join(dir, `${num}_${slug(c.name)}.json`); if (!arg('dry')) fs.writeFileSync(file, JSON.stringify(c, null, 1) + '\n');
  console.log(`${arg('dry') ? '(dry) ' : ''}케이스 저장: ${path.relative(process.cwd(), file)}`);
  console.log(`현재 봇(${c.bot}) 판정: ${res.ok ? '✓ 고수와 같은 판단' : '✗ 고수와 다른 판단 — 봇 수정 후 회귀로 확인하세요'}`);
  for (const k of Object.keys(res.values)) console.log(`  ${k}${k === c.expert ? '★' : ' '} 값 ${res.values[k]}  ${res.lines[k]}`);
}
function caseList() { const C = require('./cases.js'), dir = path.resolve(arg('dir') || path.join(ROOT, 'test/expert_cases')); for (const it of C.loadCases(dir)) console.log(`${it.file}  [${it.c.bot || 'pro'}] ${it.c.name}  expert=${it.c.expert}  ${(it.c.tags || []).join(',')}`); }
function caseRun() { const RG = require(path.join(ROOT, 'test/expert_regress.js')); const r = RG.run({ bot: arg('bot') === true ? null : arg('bot'), compare: arg('compare') === true ? null : arg('compare'), file: arg('file') === true ? null : arg('file'), verbose: !!arg('v') }); console.log(`\n통과 ${r.pass} / 실패 ${r.fail}`); process.exit(r.fail ? 1 : 0); }

function printExplain(ex, head) {
  if (head) console.log(head);
  if (!ex) return console.log('  (설명 없음)');
  if (ex.error) return console.log('  설명 오류: ' + ex.error);
  const L = ex.labels || require('./explain.js').LABEL, n = ex.now;
  if (n) console.log(`  지금: 내 승리까지 ${n.myTurnsToWin}턴 / 상대 ${n.oppTurnsToWin}턴 · 증거 ${n.evidence.me}/${n.evidence.need} (상대 ${n.evidence.oppE}/${n.evidence.oppNeed}) · FILE ${n.file.fileNow} (다음 턴 요구 ${n.file.nextTurnFileRequirement}, 리살 요구 ${n.file.lethalFileRequirement}) · 파트너 추리 ${n.partner.partnerDeductionValue} vs 어시스트 ${n.partner.assistValue}`);
  if (ex.defense) { const o = ex.defense.opp; console.log(`  상대 방어 자원: 가드 ${o.guards.map(x => x.name + '(' + x.ap + ')').join(', ') || '없음'} · 컷인 ${o.cutins.map(x => x.name).join(', ') || '없음'} · 변장 ${o.disguises.map(x => x.name).join(', ') || '없음'} · 미스리드 ${o.misdirect.map(x => x.name).join(', ') || '없음'}`); }
  for (const c of ex.candidates || []) {
    console.log(`  ${c.chosen ? '★' : ' '} ${c.desc}   값 ${c.value}${c.verified ? ' (상대 응수 검증)' : ''}`);
    if (c.factors) console.log('      ' + Object.entries(c.factors).filter(([, v]) => v).map(([k, v]) => `${L[k] || k} ${v > 0 ? '+' : ''}${v}`).join(' | '));
    if (c.vsChosen) console.log('      ★ 대비: ' + Object.entries(c.vsChosen).map(([k, v]) => `${L[k] || k} ${v > 0 ? '+' : ''}${v}`).join(', '));
    if (c.after) console.log(`      라인 후: 내 승리까지 ${c.after.myTurnsToWin}턴 / 상대 ${c.after.oppTurnsToWin}턴 · FILE ${c.after.file.fileAfterAction} (다음 턴 ${c.after.file.nextTurnFile}, 요구: 전개 ${c.after.file.nextTurnFileRequirement} / 리살 ${c.after.file.lethalFileRequirement}, 부족 ${c.after.file.shortNext}/${c.after.file.shortLethal})`);
    for (const st of c.steps || []) if (st.responses || (st.economy && st.economy.zonesAffected > 1)) console.log(`      · ${st.act}${st.responses ? ' ⇒ ' + st.responses.join(', ') : ''}${st.economy && st.economy.zonesAffected > 1 ? ` [영역 ${st.economy.zonesAffected}개: 전개 ${st.economy.boardCreated}, 제거 ${st.economy.removalGenerated}, 증거 ${st.economy.evidenceGenerated}]` : ''}`);
  }
  if (ex.why) console.log('  이유: ' + ex.why);
  for (const p of ex.pruned || []) console.log(`  지식으로 미룬 행동: ${p.act} (근거 ${p.knowledge}) — 따로 탐색한 값 ${p.value} vs 최선 ${p.best}`);
  for (const o of ex.overrides || []) console.log(`  ⚠ 탐색이 지식을 뒤집음: ${o.act} (근거 ${o.knowledge}, 이득 ${o.gain})`);
}
function why() {
  const SIM = require('../simulate.js'), REG = require('../specialists/registry.js'), SN = require('../snapshot.js'), { decide } = require('../decide.js'), { Searcher } = require('../search.js');
  let R, seat, bot = arg('bot');
  if (arg('log')) { const { log, d } = decisionFromLog(arg('log'), arg('n'));
    if (d.explain && !arg('recompute')) return printExplain(d.explain, `결정 #${d.n} (${d.kind}) 선택: ${d.chosen && d.chosen.desc}`);
    if (d.mulligan) { console.log(`결정 #${d.n} 멀리건: ${JSON.stringify(d.mulligan, null, 1)}`); return; }
    if (!d.snap) die(`결정 #${d.n} 에는 설명도 스냅샷도 없습니다`); R = SN.restore(d.snap, DB(), SIM.S); seat = log.botSeat; bot = bot || log.specialist || 'pro'; }
  else if (arg('snap')) { const s = readJ(arg('snap')); R = SN.restore(s, DB(), SIM.S); seat = arg('seat') != null ? +arg('seat') : s.turn; }
  else if (arg('state')) { const C = require('./cases.js'); const st = readJ(arg('state')); R = SN.restore(C.liteToSnapshot(st, DB(), process.cwd()), DB(), SIM.S); seat = arg('seat') != null ? +arg('seat') : (st.turn || 0); }
  else die('--log + --n / --snap / --state 중 하나가 필요합니다');
  bot = bot || 'pro'; const pol = REG.policyFor(bot, seat, R);
  const r = decide({ R, seat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: +(arg('nodes') || 6000), seed: 3 } }, new Searcher({ seed: 3, policy: pol }));
  if (r.err) die(r.err); printExplain(r.info.explain, `[${bot}] 다시 계산한 결정: ${r.info.lineDesc ? r.info.lineDesc.join(' → ') : r.mv.tag}`);
}
function kbList() {
  const KB = require('./knowledge.js'), S = require(path.join(ROOT, 'server.js')), DF = require('../specialists/deckfile.js'), REG = require('../specialists/registry.js');
  const db = DB(), load = f => { const r = DF.parseDeckFile(fs.readFileSync(path.resolve(f), 'utf8')); if (!r.ok) die(f + ': ' + r.errors.join('; ')); return r.deck; };
  const me = arg('deck') ? load(arg('deck')) : load(path.join(ROOT, 'test/fixtures/deck_green.json')), op = arg('opp') ? load(arg('opp')) : me, bot = arg('bot') || 'pro';
  const R = S.mkR('KB'); const side = arg('side') === 'second' ? 'second' : 'first'; R.firstPref = side === 'first' ? 0 : 1;
  [me, op].forEach((dk, s) => { const defs = {}; for (const id of [...new Set(dk.list), dk.partner, dk.kase]) defs[id] = db[id]; const e = S.ready(R, s, { defs, list: dk.list, partner: dk.partner, kase: dk.kase }); if (e) die(`덱 ${s}: ${e}`); });
  const pol = REG.policyFor(bot, 0, R), k = pol.knowledge; if (!k) return console.log('이 봇은 knowledge 를 쓰지 않습니다 (pro_v12 / @raw / BOT_KNOWLEDGE=0)');
  console.log(`봇 ${bot} · ${side === 'first' ? '선공' : '후공'} · 덱 색 ${k.archetype.colors.join('/')}${k.archetype.mono ? ' (단색)' : ''} 최고 레벨 ${k.archetype.maxLv} · 환경 ${k.env && k.env.name}`);
  console.log('\n적용되는 지식:'); for (const a of k.applied) console.log(`  ✓ ${a.id}  conf ${a.conf}${a.stale ? ` (오래됨 ${a.ageMonths}개월, 원래 ${a.baseConf})` : ''}  — ${a.title}\n      출처: ${a.source} · 환경 ${a.env} · ${a.date}`);
  console.log('\n제외된 지식:'); for (const s of k.skipped) console.log(`  − ${s.id}: ${s.why}`);
  console.log('\n특징 크기:', Object.entries(k.features).map(([x, v]) => `${x} ${r2(v)}`).join(', '));
  console.log('행동 prior:', Object.entries(k.priors).filter(([, v]) => v).map(([x, v]) => `${x} ${r2(v)}`).join(', '));
  console.log('소프트 pruning:', Object.entries(k.prunes).map(([x, v]) => `${x}${v.on ? '' : '(꺼짐)'} ← ${v.ids.join(',')}`).join(' / ') || '없음');
}
function kbCheck() {
  const KB = require('./knowledge.js'), kb = KB.reload(), db = DB(); let bad = kb.problems.length;
  for (const p of kb.problems) console.log('✗ ' + p);
  for (const e0 of kb.entries) { const { file, ...e } = e0; void file; const r = KB.validateEntry(e, { DB: db }); for (const x of r.errors) { console.log(`✗ ${e0.file} ${e.id}: ${x}`); bad++; } for (const x of r.warnings) console.log(`· ${e0.file} ${e.id}: ${x}`); }
  console.log(bad ? `\n지식 베이스 문제 ${bad}건` : `\n지식 베이스 정상 (${kb.entries.length}개 entry, 환경 ${kb.env.current.name})`); process.exit(bad ? 1 : 0);
}
const [a, b] = argv;
if (a === 'case' && b === 'add') caseAdd(); else if (a === 'case' && b === 'list') caseList(); else if (a === 'case' && b === 'run') caseRun();
else if (a === 'why') why(); else if (a === 'kb' && b === 'list') kbList(); else if (a === 'kb' && b === 'check') kbCheck();
else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(a ? 1 : 0); }
