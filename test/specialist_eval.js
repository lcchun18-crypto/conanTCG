process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// 새 전문 봇(또는 프로필 수정 후)을 자동으로 돌려 보는 점검 도구.  사용:
//   node test/specialist_eval.js <id> [--games 12] [--nodes 600] [--seed 1] [--vs all|id1,id2] [--heur 0]
// 실행 내용 (실제 data/cards.json / BOT_TEST_DB 사용, 선후공 교대):
//   A) 전문 봇 vs "같은 덱을 쓰는 범용 Expert"  — 프로필이 탐색 위에서 실제로 어떤 차이를 만드는지 (덱 영향 제거)
//   B) 전문 봇 미러 (같은 전문 봇 양쪽)
//   C) --vs: 다른 전문 봇과 각자의 고정 덱으로 대전
//   D) (선택) 단순 휴리스틱 기준선
// 그리고 전문 봇 좌석의 결정 기록에서 "이상 징후" 지표를 모은다: 멀리건에서 많이 교체한 카드, 못 쓰고 끝낸 턴(낼 수 있는 손패가 있는데 안 냄),
// 놓친 리살(해결 가능한데 턴 종료), AP 열세 공격, 게임 종료 시 손패에 남은 카드.  → 이 지표/로그를 보고 프로필을 조정한다.
// ※ AI 끼리의 승률만으로 실제 덱의 강함을 판단하지 마세요. (AI 자기 대전 결과일 뿐입니다.)
const fs = require('fs'), path = require('path');
const U = require('./bot_util.js'), SP = require('./bot_selfplay.js'), SIM = require('../bot/simulate.js'), REG = require('../bot/specialists/registry.js'), POL = require('../bot/specialists/policy.js'), DF = require('../bot/specialists/deckfile.js'), B = require('./bot_baselines.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const id = process.argv[2]; if (!id || id.startsWith('--')) { console.log('사용법: node test/specialist_eval.js <전문 봇 id> [--games 12] [--nodes 600] [--vs all|id,id] [--heur 1]'); process.exit(2); }
const GAMES = +arg('games', 12), NODES = +arg('nodes', 600), SEED = +arg('seed', 1);
const DB = U.db(), spec = REG.get(id); if (!spec) { console.log('등록되지 않은 전문 봇:', id); REG.problems().forEach(p => console.log('  ' + p)); process.exit(2); }
const ck = REG.check(spec, DB); if (!ck.ok) { console.log('✗ 덱/프로필 검증 실패'); ck.errors.forEach(e => console.log('  ' + e)); process.exit(1); } ck.warnings.forEach(w => console.log('⚠', w));
const deckOf = s => { const d = DF.toBotDeck(s.deck), list = []; for (const [k, n] of Object.entries(d.cards)) for (let i = 0; i < n; i++) list.push(k); return { list, partner: d.partner, kase: d.kase }; };
const name = k => (DB[k] && DB[k].n) || k;
const key = (R, cid) => { const d = R.cards[cid].d; return d.slice(d.indexOf(':') + 1); };
function audit() { return { mull: {}, mullN: 0, turns: 0, unplayed: 0, lethalMissed: 0, atkLow: 0, atk: 0, handEnd: {}, played: {} }; }
function hook(A, sinkSeat) { return (R, d, mv, info, s) => { if (d.seat !== sinkSeat) return; const P = R.P[d.seat];
  if (mv.tag === 'mull') { A.mullN++; for (const cid of mv.m.ids || []) { const k = key(R, cid); A.mull[k] = (A.mull[k] || 0) + 1; } return; }
  if (mv.tag === 'play') { const k = key(R, mv.m.id); A.played[k] = (A.played[k] || 0) + 1; }
  if (mv.tag === 'atkc') { A.atk++; if (require('../server.js').ap(R, mv.m.id) < require('../server.js').ap(R, mv.m.tid)) A.atkLow++; }
  if (mv.tag === 'end' && d.kind === 'main') { A.turns++; const moves = SIM.genMoves(R, () => 0); if (moves.some(m => m.tag === 'solve')) A.lethalMissed++; if (!R.fl.played && moves.some(m => m.tag === 'play')) A.unplayed++; } }; }
function series(label, kA, kB, dA, dB, n, sinkSeats) {
  const res = { a: 0, b: 0, illegal: 0, stall: 0, corrupt: 0, turns: 0 }, A = audit(), t0 = Date.now();
  for (let g = 0; g < n; g++) { const swap = g & 1, st = SP.playGame(SEED * 1000 + g, dA, dB, [kA, kB], swap ? 1 : 0, { onDecision: hook(A, 0) }); res.illegal += st.illegal; res.turns += st.turns; if (st.stall) res.stall++; else if (st.corrupt) res.corrupt++; else if (st.winner === 0) res.a++; else res.b++; }
  console.log(`\n■ ${label}  — ${n}판 (선후공 교대): 좌 ${res.a}승 / 우 ${res.b}승, 평균 ${(res.turns / n).toFixed(1)}턴, 불법 ${res.illegal}, 교착 ${res.stall}, 손상 ${res.corrupt}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`); return { res, A }; }
function report(A) {
  const top = (o, m = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m).map(([k, v]) => `${name(k)}×${v}`).join(', ') || '-';
  console.log(`   멀리건(전문 봇 좌석): 교체 카드 TOP — ${top(A.mull)}`); console.log(`   턴 ${A.turns}개 중: 낼 수 있는 손패가 있는데 안 내고 종료 ${A.unplayed}, 놓친 리살(해결 가능한데 종료) ${A.lethalMissed}, 공격 ${A.atk}건 중 AP 열세 공격 ${A.atkLow}`);
  console.log(`   가장 많이 낸 카드 — ${top(A.played, 6)}`); if (A.lethalMissed) console.log('   ⚠ 놓친 리살이 있습니다: 정책(프로필)이 확정 승리를 방해하고 있지 않은지 확인하세요.'); }
const dS = deckOf(spec); const kS = 'spec:' + id;
console.log(`전문 봇 "${spec.name}" (${id}) — 덱 ${spec.deck.name} / 사건 ${name(spec.deck.kase)} / 파트너 ${name(spec.deck.partner)}  [data: ${process.env.BOT_TEST_DB || 'data/cards.json'}]`);
{ const r = series('A) 전문 봇(좌) vs 같은 덱의 범용 Expert(우)', kS, 'expert', dS, dS, GAMES); report(r.A); }
{ const r = series('B) 전문 봇 미러', kS, kS, dS, dS, Math.max(2, GAMES >> 1)); report(r.A); }
const vs = arg('vs', ''); const others = vs === 'all' ? [...REG.load().keys()].filter(x => x !== id) : vs ? vs.split(',').filter(Boolean) : [];
for (const o of others) { const so = REG.get(o); if (!so) { console.log('(없는 봇 건너뜀)', o); continue; } const r = series(`C) ${spec.name}(좌) vs ${so.name}(우) — 각자의 고정 덱`, kS, 'spec:' + o, dS, deckOf(so), Math.max(2, GAMES >> 1)); report(r.A); }
if (arg('heur', '0') === '1') series('D) 전문 봇 vs 단순 휴리스틱(같은 덱)', kS, 'heuristic', dS, dS, GAMES);
console.log('\n※ 위 수치는 AI 끼리의 자기 대전 결과입니다. 실제 덱의 강함/사람 상대 실력을 뜻하지 않습니다.');
