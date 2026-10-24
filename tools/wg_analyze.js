// 사용: node tools/wg_analyze.js [판수] [버전A] [버전B] [좌석 0|1]  — 턴별 상대 필드 잔존 원인 계측 (결과: out/wg_turns.json)
// 다판 셀프플레이: 각 턴에서 상대 필드 잔존 원인 계측
const path = require('path'), ROOT = path.resolve(__dirname, '..');
const SP = require(ROOT + '/bot/whitegreen/selfplay.js'), SIM = require(ROOT + '/bot/simulate.js'), { S } = SIM;
const seeds = +(process.argv[2] || 20), ver = process.argv[3] || undefined, verB = process.argv[4] || undefined;
const name = (R, id) => { try { return S.D(R, id).n; } catch (e) { return '?'; } };
const sum = (R, s) => { const P = R.P[s], O = R.P[1 - s];
  const f = id => ({ id, n: name(R, id), d: R.cards[id].d, lv: S.FX.lvOf(R, id), ap: S.ap(R, id), st: R.cards[id].st, sum: !!R.cards[id].sum });
  return { n: R.n, turn: R.turn, seat: s, file: P.file.length + (P.pIn ? 1 : 0), fileRaw: P.file.length, pIn: !!P.pIn, pSt: R.cards[P.partner].st, solved: !!(R.cards[P.kase] && R.cards[P.kase].solved),
    hand: P.hand.map(f), field: P.field.map(f), pa: P.pa.map(f), rem: P.rem.length, remNames: P.rem.map(id => name(R, id)), evid: P.evid.length,
    opp: O.field.map(f), oEvid: O.evid.length, oHand: O.hand.length, oFile: O.file.length + (O.pIn ? 1 : 0), fl: { ...R.fl }, acts: (() => { try { return S.actsFor(R, s); } catch (e) { return {}; } })() }; };
const turns = []; let games = 0, wins = { A: 0, B: 0, null: 0 };
for (let seed = 1; seed <= seeds; seed++) {
  let prev = null, cur = null, lastN = 0;
  const m = SP.playMatch({ seed, first: seed % 2, frames: false, versionA: ver, versionB: verB, onStep: (rec, R) => {
    if (R.phase !== 'play') return;
    if (rec.move && rec.move.a === 'end' && cur && prev && prev.n === cur.n && rec.seat === cur.seat) { cur.end = prev; cur.decisions.push(rec); turns.push(cur); cur = null; }
    if (R.n !== lastN) { lastN = R.n; if (cur) { turns.push(cur); } cur = { seed, n: R.n, seat: R.turn, start: sum(R, R.turn), decisions: [], kills: [], log: [] }; }
    if (cur && rec.seat === cur.seat) cur.decisions.push(rec);
    if (cur) { const s = cur.seat, now = sum(R, s); if (prev && prev.n === now.n) { for (const o of prev.opp) if (!now.opp.some(x => x.id === o.id)) cur.kills.push({ ...o, by: rec.rule || rec.kind, at: rec.n, mv: rec.chosen }); } prev = now; }
  } });
  games++; wins[m.result.winner]++;
}
// ── 분류
const stats = { turns: 0, withOpp: 0, cleared: 0, remain: 0, kinds: {}, byTurn: {}, unusedAttackers: 0, activeOnlyRemain: 0, apShort: 0, noAttackersLeft: 0, logicGap: 0, leftFile: {}, exampleGap: [] };
const win = (a, t) => a.ap >= t.ap;
const onlySeat = process.argv[5] != null ? +process.argv[5] : null;
for (const T of turns) { if (!T.end) continue; if (onlySeat != null && T.seat !== onlySeat) continue; stats.turns++; const st = T.start, en = T.end; if (!st.opp.length) continue; stats.withOpp++;
  const k = T.kills.length, rem = en.opp.length; (stats.byTurn[st.n] = stats.byTurn[st.n] || { t: 0, opp: 0, kills: 0, rem: 0, clr: 0 });
  const bt = stats.byTurn[st.n]; bt.t++; bt.opp += st.opp.length; bt.kills += k; bt.rem += rem; if (!rem) { stats.cleared++; bt.clr++; continue; } stats.remain++;
  // 턴 끝 상태에서: 내 액티브 캐릭터 중 공격 가능(acts 에 actc 가 있는) 것
  const myActive = en.field.filter(c => c.st === 'a'), attackersLeft = Object.entries(en.acts).filter(([id, l]) => l.some(a => a.k === 'actc')).map(([id]) => +id);
  const remAct = en.opp.filter(o => o.st === 'a'), remSlp = en.opp.filter(o => o.st !== 'a');
  const lf = en.file; stats.leftFile[lf] = (stats.leftFile[lf] || 0) + 1;
  let kind;
  if (attackersLeft.length) { const canWin = attackersLeft.some(a => { const A = en.field.find(x => x.id === a); return en.opp.some(o => (en.acts[a] || []).some(x => x.k === 'actc' && x.tg.includes(o.id)) && win(A, o)); });
    if (canWin) { kind = 'logic-gap(이길 공격 남김)'; stats.logicGap++; if (stats.exampleGap.length < 12) stats.exampleGap.push({ seed: T.seed, n: st.n, seat: st.seat, field: en.field.map(c => `${c.n}(${c.st}${c.sum ? '!' : ''},AP${c.ap})`), opp: en.opp.map(c => `${c.n}(${c.st},AP${c.ap})`), lastRules: T.decisions.slice(-4).map(d => d.rule + ':' + (d.chosen || d.move.a)) }); }
    else if (remSlp.length) { kind = 'AP부족(슬립 대상 못 이김)'; stats.apShort++; }
    else { kind = '액티브만 남음(공격자 있음)'; stats.activeOnlyRemain++; } }
  else { if (myActive.length) kind = remSlp.length ? '액티브 캐릭터 있으나 공격 불가(소환턴 등)' : '액티브만 남음(공격자 없음)'; else kind = '공격자 소진'; stats.noAttackersLeft++; }
  stats.kinds[kind] = (stats.kinds[kind] || 0) + 1; }
console.log('games', games, 'wins', wins, 'turns', stats.turns, 'withOpp', stats.withOpp, 'cleared', stats.cleared, `(${(100 * stats.cleared / stats.withOpp).toFixed(1)}%)`, 'remain', stats.remain);
console.log('kinds', stats.kinds);
console.log('leftFile at end (remain turns)', stats.leftFile);
console.log('byTurn', Object.entries(stats.byTurn).map(([n, b]) => `${n}: t${b.t} opp${(b.opp / b.t).toFixed(1)} kills${(b.kills / b.t).toFixed(1)} rem${(b.rem / b.t).toFixed(1)} clr${(100 * b.clr / b.t).toFixed(0)}%`).join('\n'));
console.log('examples (logic gap)'); for (const e of stats.exampleGap) console.log(JSON.stringify(e));
require('fs').mkdirSync(path.join(ROOT, 'out'), { recursive: true }); require('fs').writeFileSync(path.join(ROOT, 'out', 'wg_turns.json'), JSON.stringify(turns.map(T => ({ seed: T.seed, n: T.n, seat: T.seat, start: T.start, end: T.end, kills: T.kills, rules: T.decisions.map(d => ({ n: d.n, rule: d.rule, chosen: d.chosen, why: (d.why || '').slice(0, 160) })) }))));
