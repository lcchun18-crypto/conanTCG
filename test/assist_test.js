// v1.17.19 Expert 전개 보조: 손패에 최고 코스트 카드가 없어도 덱/리무브/증거/파트너 에리어/FILE 에서 가져와 베스트 전개
process.env.BOT_ENGINE = 'rule';
const U = require('./mz_util'); const { G, dummy, field, hand, rem, pa, give, fillFile, filler, evid, FX } = U; const SIM = require('../bot/simulate.js'), { decide, describe } = require('../bot/decide.js'); const A = require('../bot/assist.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const base = { p: { n: 'P', type: 'partner', color: 'white', lp: '1' }, k: { n: 'K', type: 'case', color: 'white', lv: '2', lv2: '3' } };
const ch = (n, lv, o = {}) => dummy(n, { color: 'white', lv: String(lv), ap: String(lv * 1000), ...o });
const FL = {}; for (const k of ['F1', 'F2', 'F3', 'F4', 'F5']) FL[k] = ch(k, 1); const FD = Object.keys(FL).flatMap(k => [k, k, k]);
const mk = (defs, deck, file) => { const R = G({ ...base, ...FL, ...defs }, [...deck, ...FD], ['L2']); const s = R.turn, P = R.P[s]; P.deck.push(...P.hand); P.hand = []; P.deck.push(...P.file); P.file = []; const fs = P.deck.filter(i => /^F\d$/.test(R.defs[R.cards[i].d].n)); for (let i = 0; i < file; i++) { const id = fs[i]; P.deck.splice(P.deck.indexOf(id), 1); R.cards[id].up = false; P.file.push(id); } return { R, s }; };
const ctl = (R, s) => ({ R, seat: s, sysDirty() { this.dirty = (this.dirty || 0) + 1; } });
const run = (R, s) => { const c = ctl(R, s), r = A.fetch(c, { kind: 'main', seat: s }); return { c, r }; };
const defs = { L2: ch('Lv2', 2), L5: ch('Lv5', 5), L7: ch('Lv7', 7), L9: ch('Lv9', 9), L8: ch('Lv8', 8), R9: ch('Lv9적', 9, { color: 'red' }) };
// 1) FILE 9 / 손패 Lv5 / 덱 Lv9 → Lv9 를 손패로
{ const { R, s } = mk(defs, ['L5', 'L9', 'L7', 'L2'], 9); const h5 = hand(R, s, 'L5'); const d9 = R.P[s].deck.find(i => R.defs[R.cards[i].d].n === 'Lv9'); const { c, r } = run(R, s);
  ok(r === true && R.P[s].hand.includes(d9) && !R.P[s].deck.includes(d9), '1 FILE 9: 손패 최고 Lv5 → 덱의 Lv9 를 손패로'); ok(R.log.some(l => l.includes('[ASSIST]') && l.includes('Lv9')), '1 로그 [ASSIST]'); ok(c.dirty === 1, '1 시스템 변경 알림');
  const dec = decide({ R, seat: s, cfg: { lethal: false } }); ok(dec.mv && dec.mv.m.a === 'play' && dec.mv.m.id === d9, '1 이어서 Expert 가 가져온 Lv9 를 낸다: ' + describe(R, dec.mv)); }
// 2) 손패에 이미 최고(Lv9)가 있으면 아무것도 가져오지 않음
{ const { R, s } = mk(defs, ['L5', 'L9', 'L8', 'L2'], 9); hand(R, s, 'L9'); const { r } = run(R, s); ok(r === null, '2 손패에 이미 최고 코스트 → 가져오지 않음'); }
// 3) FILE 6 이면 낼 수 있는 최고(Lv6 이하)만: Lv9/Lv7 은 제외, Lv5 를 가져옴
{ const { R, s } = mk(defs, ['L5', 'L9', 'L7', 'L2'], 6); const { r } = run(R, s); const n5 = R.P[s].hand.map(i => R.defs[R.cards[i].d].n); ok(r === true && n5.join() === 'Lv5', '3 FILE 6: 낼 수 없는 Lv7/Lv9 는 가져오지 않고 Lv5 를 가져옴 → ' + n5); }
// 4) 리무브 에리어 / 증거 / 파트너 에리어 에서도 가져온다
for (const z of ['rem', 'evid', 'pa']) { const { R, s } = mk({ L5: defs.L5, L8: defs.L8, L2: defs.L2 }, ['L5', 'L2', 'L2', 'L2'], 9); const id = give(R, s, 'L8', z); if (z === 'evid') R.cards[id].up = false; const { r } = run(R, s); ok(r === true && R.P[s].hand.includes(id) && !R.P[s][z].includes(id), `4 ${z} 의 Lv8 을 손패로`); }
// 5) FILE 에서 가져올 때는 남는 FILE 로 낼 수 있어야 한다 (FILE 9 → 8 이면 Lv9 불가, Lv8 가능)
{ const { R, s } = mk({ L2: defs.L2, L8: defs.L8, L9: defs.L9 }, ['L2', 'L2', 'L2'], 7); const f9 = give(R, s, 'L9', 'file'), f8 = give(R, s, 'L8', 'file'); const fc = R.P[s].file.length; const { r } = run(R, s); const got = R.P[s].hand[0]; ok(r === true && got === f8 && R.P[s].file.length === fc - 1, `5 FILE ${fc}장: 가져오면 FILE 이 줄어 Lv9 는 불가 → Lv8 (${got === f8 ? 'Lv8' : '다른 카드'})`); }
// 6) 색이 안 맞는 카드는 가져오지 않는다
{ const { R, s } = mk(defs, ['L5', 'R9', 'L2', 'L2'], 9); const { r } = run(R, s); ok(r === null || !R.P[s].hand.some(i => R.defs[R.cards[i].d].n === 'Lv9적'), '6 사건 색과 안 맞는 Lv9(적)는 가져오지 않음'); }
// 7) 이미 카드를 낸 뒤 / 내 턴이 아니면 가져오지 않음
{ const { R, s } = mk(defs, ['L5', 'L9', 'L2', 'L2'], 9); R.fl.played = 1; const { r } = run(R, s); ok(r === null && R.P[s].hand.length === 0, '7 이미 낸 뒤에는 가져오지 않음'); R.fl.played = 0; const o = 1 - s; const c = ctl(R, o); ok(A.fetch(c, { kind: 'main', seat: o }) === null, '7 내 턴이 아니면 동작 안 함'); }
// 8) 컨트롤러 연결: 평소 Expert 방에서 켜지고, 연습 스크립트/전문 봇에서는 꺼짐, assist:false 옵션
{ const src = require('fs').readFileSync(__dirname + '/../bot/controller.js', 'utf8'); ok(/ctl\.assist = !specId && !legacy && m\.assist !== false/.test(src) && /this\.assist && !this\.training/.test(src), '8 컨트롤러: Expert 방 기본 ON / 연습·전문봇 제외 / assist:false 로 끔'); }
// 9) v1.17.20 항상 어시스트 → 최고 코스트: FILE 8 + 어시스트 = 9 → 손패와 상관없이 Lv9 / FILE 7 → Lv8
{ const D_ = { kind: 'main' };
  for (const [fl, want] of [[8, 'Lv9'], [7, 'Lv8']]) { const { R, s } = mk(defs, ['L5', 'L9', 'L8', 'L2'], fl); hand(R, s, 'L5'); const P = R.P[s]; const c = ctl(R, s); D_.seat = s;
    const a1 = A.next(c, D_); ok(a1 && a1.mv.m.a === 'assist' && !P.pIn, `9 FILE ${fl}: 먼저 무조건 어시스트`);
    const e = SIM.S.act(R, s, a1.mv.m); ok(!e && P.pIn && R.cards[P.partner].st === 's', `9 FILE ${fl}: 어시스트 실행 (${e || 'ok'})`);
    const a2 = A.next(c, D_), id = a2 && a2.mv.m.id; ok(a2 && a2.mv.m.a === 'play' && R.defs[R.cards[id].d].n === want, `9 FILE ${fl}: 어시스트 후 ${want} 사용 (${a2 && a2.desc})`);
    ok(!SIM.S.act(R, s, a2.mv.m) && R.P[s].field.includes(id), `9 FILE ${fl}: ${want} 가 현장에 등장`); ok(A.next(c, D_) === null, `9 FILE ${fl}: 낸 뒤에는 개입 안 함`); }
}
console.log(`\nassist_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
