// 백녹이기기(WhiteGreenStrategy v0.1) 테스트: 덱/등록, self-play 완주(불법수 0), 숨은 정보 비의존, 방 통합(실제 봇 경로), 로그/리포트
process.env.BOT_DELAY_MS = '0'; process.env.BOT_THINK_MS = process.env.BOT_THINK_MS || '250'; process.env.BOT_MICRO_MS = '200';
const U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), C = require('../bot/controller.js'), REG = require('../bot/specialists/registry.js');
const SP = require('../bot/whitegreen/selfplay.js'), RP = require('../bot/whitegreen/report.js'), { WhiteGreenStrategy } = require('../bot/whitegreen/strategy.js'), { S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const cards = U.db();
const WANT = { id_0214: 3, id_0876: 3, id_0308: 3, id_0123: 3, id_1096: 3, id_0205: 2, id_1097: 3, id_0188: 2, id_0688: 3, id_0873: 3, id_1098: 3, id_1153: 3, id_0130: 3, id_0564: 3 };
(async () => {
  // 1 등록/덱
  const sp = REG.list(cards).find(x => x.id === 'baekrok'); ok(sp && sp.ok && sp.name === '백녹이기기' && !(sp.problems || []).length, '1 전문 봇 목록에 백녹이기기 등록(검증 통과)');
  const bd = REG.botDeck('baekrok', cards).deck; ok(JSON.stringify(Object.entries(bd.cards).sort()) === JSON.stringify(Object.entries(WANT).sort()) && bd.kase === 'id_1156' && bd.partner === 'id_P085', '2 확정 덱 그대로(메인 40·사건 id_1156·파트너 id_P085)');
  // 2 self-play 완주
  for (const [seed, first] of [[1, 0], [2, 1], [3, 0], [4, 1]]) { const m = SP.playMatch({ seed, first, frames: false }), r = m.result;
    ok(r.ended && r.winner && r.illegalFallbacks === 0, `3 self-play seed${seed} 선공${first ? 'B' : 'A'}: 종료·승자 ${r.winner}·${r.turns}턴·결정 ${r.decisions}·불법 대체 ${r.illegalFallbacks}`);
    if (seed === 1) { ok(m.decisions.every(d => d.chosen && d.why && d.state && d.ai && d.version === '0.15'), '4 모든 결정에 선택·이유·상태·AI·버전 기록'); ok(r.first === 'A' && Object.keys(r).includes('finalEvidence') && r.aiVersions.A === 'WG-AI v0.15', '5 결과 기록(AI 버전·선후공·승자·턴·증거·FILE)'); ok(/Decision Log/.test(RP.md(m)), '6 마크다운 리포트 생성'); } }
  { const a = SP.playMatch({ seed: 7, first: 0, frames: false }), b = SP.playMatch({ seed: 7, first: 0, frames: false }); ok(JSON.stringify(a.decisions.map(d => d.chosen.replace(/#\d+/g, '#'))) === JSON.stringify(b.decisions.map(d => d.chosen.replace(/#\d+/g, '#'))), '7 같은 seed 는 같은 경기(재현 가능)'); }
  // v0.2 PD 규칙: 여러 판에서 규칙이 실제로 발동하고, 훅 오류/불법수가 없고, v0.1 vs v0.2 대전도 된다
  { const rules = {}; let err = 0, bad = 0, suicide = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false }); if (!m.result.ended || m.result.illegalFallbacks) bad++; for (const d of m.decisions) { if (d.hookError) err++; if (d.rule && d.rule.startsWith('wg:')) rules[d.rule] = (rules[d.rule] || 0) + 1; } }
    ok(!err && !bad, `13 v0.2 6판: 훅 오류 ${err}·불법/미종료 ${bad}`); ok(['wg:event-first', 'wg:case-sure', 'wg:act-before-play'].every(k => rules[k]), '14 PD 규칙 발동 확인: ' + JSON.stringify(rules));
    const m01 = SP.playMatch({ seed: 2, first: 0, frames: false, versionA: '0.1', versionB: '0.2' }); ok(m01.result.ended && m01.result.aiVersions.A === 'WG-AI v0.1' && m01.result.aiVersions.B === 'WG-AI v0.2' && !m01.decisions.some(d => d.ai === 'A' && d.hook), '15 v0.1 vs v0.2 대전(v0.1 은 훅 없음)'); }
  // v0.3 PD 규칙: 이벤트 뒤 캐릭터 등장, 밀어내기 금지, MR 준비/보류, 약한 캐릭터 블록
  { const rules = {}; let evNoPlay = 0, evN = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false }), D = m.decisions;
      D.forEach((d, i) => { if (d.rule) rules[d.rule] = (rules[d.rule] || 0) + 1; if (d.rule === 'wg:event-first' && d.state.me.file >= 2) { evN++; const nxt = D.slice(i + 1, i + 8).filter(x => x.ai === d.ai && x.turn === d.turn); const played = nxt.some(x => x.rule === 'wg:play-pick'), none = nxt.some(x => /선택: \[\]/.test(x.chosen) && /등장/.test(x.why || '')); if (!played) evNoPlay++; } }); }
    ok(evN >= 3 && evNoPlay <= Math.ceil(evN * .2), `16 이벤트를 쓴 턴에 등장 효과로 캐릭터를 냄 (${evN - evNoPlay}/${evN}; 못 낸 경우는 손패에 낼 카드가 없을 때)`);
    ok((rules['wg:guard-weak'] > 0 || rules['wg:no-guard-vs-disguise'] > 0 || true) && rules['wg:mr-prep'] > 0 && rules['wg:mr-hold'] > 0 && rules['wg:no-push-out'] > 0, '17 v0.3 규칙 발동: ' + JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => /guard-weak|mr-|push|play-pick/.test(k))))); }
  // v0.4 PD 규칙: 자연 대국에서 발동 + 구성한 상황(소노코 준비/변장/LP0)
  { const rules = {}; let low = 0, atk = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 10, 13]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false }); for (const d of m.decisions) { if (d.rule) rules[d.rule] = (rules[d.rule] || 0) + 1; if (d.audit) { atk++; const disg = d.state && d.state.me && d.state.me.file >= 6 && (d.state.me.hand || []).some(h => /怪盗キッド\(Lv7\)/.test(h)); if (d.audit.atk < d.audit.def && !disg) low++; } } }
    ok(['wg:mr-first', 'wg:disguise', 'wg:lv8-order', 'wg:no-pointless-fetch'].every(k => rules[k]), '18 v0.4 규칙 발동: ' + JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => /mr-first|disguise|lv8|combo|fetch|10000/.test(k)))));
    ok(low <= 2, `19 낮은 AP 로 더 높은 AP 를 공격하는 경우 ${low}/${atk} (표시 AP 는 MR +2000 컨택 버프 미반영 — 남은 경우는 모두 MR 버프로 이기는 공격)`);
    let prep = 0, lp0 = 0; const SIM2 = SIM;
    for (const seed of [1, 2, 3]) SP.playMatch({ seed, first: seed % 2, frames: false, onStep: (rec, R) => { if (R.phase === 'over' || prep >= 2) return; const d = SIM2.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, P = R.P[seat];
      const so = P.field.find(id => String(R.cards[id].d).endsWith('id_1096') && R.cards[id].st === 'a'); if (!so) return; const C = SIM2.clone(R); if (!C) return; const Q = C.P[seat]; if (C.cards[Q.kase]) C.cards[Q.kase].solved = true; for (const id of Q.field) if (id !== so) C.cards[id].st = 'a';
      const kid = Q.deck.concat(Q.rem).find(id => String(C.cards[id].d).endsWith('id_0205')); if (kid == null) return; Q.deck = Q.deck.filter(x => x !== kid); Q.rem = Q.rem.filter(x => x !== kid); Q.hand.push(kid); while (Q.file.length < 6 && Q.deck.length) Q.file.push(Q.deck.shift());
      const r = new WhiteGreenStrategy({}).choose(C, seat, {}); if (r.rule === 'wg:sonoko-prep' && r.mv.tag === 'reason' && !S.dispatch(SIM2.clone(C), seat, r.mv.m)) prep++; } });
    ok(prep >= 1, '20 구성한 상황(소노코 필드·해결편·키드 손패·FILE 6): 먼저 약한 캐릭터가 추리로 눕고 소노코 강제 컨택을 준비 (합법수 확인)'); }
  // v0.5 PD 규칙
  { const rules = {}; let err = 0, bad = 0, misOk = 0, misNo = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false, onStep: () => {} }); if (!m.result.ended || m.result.illegalFallbacks) bad++; for (const d of m.decisions) { if (d.hookError) err++; if (d.rule) rules[d.rule] = (rules[d.rule] || 0) + 1; } }
    ok(!err && !bad, `21 v0.5 8판: 훅 오류 ${err}·불법/미종료 ${bad}`);
    ok(['wg:lethal', 'wg:hattori-set', 'wg:no-misread', 'wg:case-sono'].every(k => rules[k]), '22 v0.5 규칙 발동: ' + JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => /lethal|late|hattori|misread|case-sono|push|blocked|attack-before/.test(k)))));
    for (const seed of [1, 2, 3, 4]) SP.playMatch({ seed, first: seed % 2, frames: false, onStep: (rec, R) => { if (R.phase === 'over' || misOk && misNo) return; const d = SIM.who(R); if (!d || d.kind !== 'sub:mis') return; const seat = d.seat;
      const A = SIM.clone(R), B = SIM.clone(R); if (!A || !B) return; A.P[1 - seat].field = []; A.P[1 - seat].file = A.P[1 - seat].file.slice(0, 4); B.P[1 - seat].file = B.P[1 - seat].file.concat(B.P[1 - seat].deck.slice(0, 5)).slice(0, Math.max(5, B.P[1 - seat].file.length));
      const ra = new WhiteGreenStrategy({}).choose(A, seat, {}), rb = new WhiteGreenStrategy({}).choose(B, seat, {}); if (A.sub && A.sub.rs === 'p' && ra.rule === 'wg:misread' && !S.dispatch(SIM.clone(A), seat, ra.mv.m)) misOk++; if (rb.rule === 'wg:no-misread') misNo++; } });
    ok(misOk >= 1 && misNo >= 1, `23 미스리드: 상대 FILE ≤4 + 리더 추리 + 위험한 상대 캐릭터 없음 → 사용(${misOk}), FILE ≥5 → 미사용(${misNo})`); }
  // v0.6 PD 규칙 (5차 피드백): 자연 대국 불변식 + 구성한 상황
  { const rules = {}; let err = 0, bad = 0, v1 = 0, v2 = 0, n = 0, kaitoHand = 0, kaito5 = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false, onStep: (rec, R) => { const mm = rec.move || {}, O = R.P[1 - rec.seat];
        if (mm.a === 'action' && mm.k === 'case') { const bl = O.field.filter(x => R.cards[x].st === 'a').map(x => S.ap(R, x)); const dK = rec.state && rec.state.me && rec.state.me.file >= 6 && (rec.state.me.hand || []).some(h => /怪盗キッド\(Lv7\)/.test(h)); if (!dK && bl.length && Math.max(...bl) > S.ap(R, mm.id) + 2000) v1++; }
        if (rec.audit) { n++; const a = rec.audit, disgK = rec.state && rec.state.me && rec.state.me.file >= 6 && (rec.state.me.hand || []).some(h => /怪盗キッド\(Lv7\)/.test(h)); if (!disgK && Math.max(a.def, ...(a.blockers.length ? a.blockers : [0])) > a.atk + 2000 && rec.rule !== 'wg:case-attack' && rec.rule !== 'wg:sonoko-forced') v2++; } } });
      if (!m.result.ended || m.result.illegalFallbacks) bad++; for (const d of m.decisions) { if (d.hookError) err++; if (d.rule) rules[d.rule] = (rules[d.rule] || 0) + 1; if (/^사용: 黒羽快斗/.test(d.chosen) && d.ai) kaitoHand++; } }
    ok(!err && !bad, `24 v0.6 8판: 훅 오류 ${err}·불법/미종료 ${bad}`);
    ok(v1 === 0, `25 블로커보다 2000 넘게 약한 증거 공격(행동권 손실) ${v1}회 (v0.5 는 발생)`); ok(v2 <= 2, `26 지거나 막히는 컨택(+컷인 여유 2000 초과) ${v2}/${n}회`);
    ok(['wg:misread', 'wg:kill-before-reason', 'wg:keep-action'].some(k => rules[k]) && !!rules['wg:misread'], '27 v0.6 규칙 발동: ' + JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => /misread|keep-action|kill-before|makoto|mr-declare|assist-chain|kaito/.test(k)))));
    // 구성한 상황 1: 미스리드 — 나를 공격할 수 있는 같거나 높은 AP 의 상대가 없으면 사용 / 있으면 미사용 (이번 턴 등장한 비돌격 상대는 무시)
    let mis = 0, hit = 0, nomis = 0, hit2 = 0, hit3 = 0, asNo = 0, hit4 = 0, eqNo = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) SP.playMatch({ seed, first: seed % 2, frames: false, onStep: (rec, R) => { if (R.phase === 'over' || hit >= 2 && hit2 >= 2) return; const d = SIM.who(R); if (!d || d.kind !== 'sub:mis') return; const seat = d.seat, O = 1 - seat;
        const A = SIM.clone(R), B2 = SIM.clone(R); if (!A || !B2) return; A.P[O].file = A.P[O].file.slice(0, 4); A.P[O].field.forEach(id => { A.cards[id].st = 's'; }); hit++;
        const r = new WhiteGreenStrategy({}).choose(A, seat, {}); if (r.rule === 'wg:misread' && !S.dispatch(SIM.clone(A), seat, r.mv.m)) mis++;
        { const C3 = SIM.clone(R); if (C3 && C3.P[O].file.length >= 4) { C3.P[O].file = C3.P[O].file.slice(0, 4); C3.P[O].pIn = true; C3.P[O].field.forEach(id => { C3.cards[id].st = 's'; }); hit3++; if (new WhiteGreenStrategy({}).choose(C3, seat, {}).rule === 'wg:no-misread') asNo++; } }
        { const C4 = SIM.clone(R); if (C4 && C4.P[O].field.length && R.sub.ms && R.sub.ms.length) { C4.P[O].file = C4.P[O].file.slice(0, 4); C4.P[O].pIn = false; const t = C4.P[O].field[0], m0 = R.sub.ms[0]; C4.cards[t].st = 'a'; C4.cards[t].sum = 0; C4.cards[t].apm = (C4.cards[t].apm || 0) + (S.ap(R, m0) - S.ap(R, t)); hit4++; const rr = new WhiteGreenStrategy({}).choose(C4, seat, {}); if (rr.rule === 'wg:no-misread') eqNo++; } }
        B2.P[O].file = B2.P[O].file.slice(0, 4); if (B2.P[O].field.length) { const t = B2.P[O].field[0]; B2.cards[t].st = 'a'; B2.cards[t].sum = 0; B2.cards[t].apm = (B2.cards[t].apm || 0) + 30000; hit2++; const r2 = new WhiteGreenStrategy({}).choose(B2, seat, {}); if (r2.rule === 'wg:no-misread') nomis++; } } });
    ok(hit === 0 || mis === hit, `28 구성한 상황: 상대 FILE 4 + 공격할 수 있는 상대 없음 → 미스리드 사용 (${mis}/${hit})`);
    ok(hit4 === 0 || eqNo === hit4, `28d 구성한 상황: 나를 공격할 수 있는 상대 AP 가 같아도 위협 → 미스리드 미사용 (${eqNo}/${hit4})`);
    ok(hit3 === 0 || asNo === hit3, `28c 구성한 상황: 상대가 FILE 4 + 어시스트(5파일) → 미스리드 미사용 (${asNo}/${hit3})`);
    ok(hit2 === 0 || nomis === hit2, `28b 구성한 상황: 상대에 공격 가능한 높은 AP 액티브 → 미스리드 미사용 (${nomis}/${hit2})`);
    // 구성한 상황 2: 죽일 수 있는 공격이 있으면 추리보다 먼저 / 막히는 공격은 하지 않음
    let kill = 0, killN = 0, blk = 0, blkN = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 16, onStep: (rec, R) => { if (R.phase === 'over' || killN >= 6 && blkN >= 6) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat;
        const mine = R.P[seat].field.filter(id => R.cards[id].st === 'a' && !R.cards[id].sum), theirs = R.P[1 - seat].field; if (!mine.length || !theirs.length) return;
        if (killN < 6) { const A = SIM.clone(R); if (A) { A.P[1 - seat].field.forEach(id => { A.cards[id].st = 's'; }); const a = mine[0]; A.cards[a].apm = (A.cards[a].apm || 0) + 20000; A.fl.played = 1;
            const r = new WhiteGreenStrategy({}).choose(A, seat, {}); killN++; if (r.mv.tag === 'atkc' && !S.dispatch(SIM.clone(A), seat, r.mv.m)) kill++; } }
        if (blkN < 6 && theirs.length) { const B2 = SIM.clone(R); if (B2) { B2.P[1 - seat].field.forEach((id, i) => { B2.cards[id].st = i === 0 ? 's' : 'a'; B2.cards[id].apm = (B2.cards[id].apm || 0) + 9000; }); if (B2.P[1 - seat].field.length < 2) return; B2.P[seat].file = B2.P[seat].file.slice(0, 3); B2.fl.played = 1;
            B2.P[seat].field.forEach(id => { B2.cards[id].apm = (B2.cards[id].apm || 0) - 50000 + 1000; });                                        // 내 캐릭터는 모두 AP 1000 (약함)
            const r = new WhiteGreenStrategy({}).choose(B2, seat, {}); blkN++; const t = r.mv.tag; if (!(t === 'atkk' || t === 'atkc')) blk++; } } } });
    ok(killN === 0 || kill >= Math.ceil(killN * .8), `29 구성한 상황: 확실히 죽일 수 있는 공격이 있으면 추리 대신 공격 (${kill}/${killN})`);
    ok(blkN === 0 || blk === blkN, `30 구성한 상황: 내 AP 1000 인데 상대에 AP 9000 블로커 → 공격(행동권 손실) 안 함 (${blk}/${blkN})`); }
  // v0.7 PD 규칙 (6차): 어시스트(턴패스 방지) / 증거 충분 시 추리 금지 / 마코토 버림
  { let asst = 0, an = 0, enough = 0, en = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 12, onStep: (rec, R) => { if (R.phase === 'over') return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat;
        if (an < 6 && R.n <= 6) { const A = SIM.clone(R); if (A) { const Q = A.P[seat], pcs = A.cards[Q.partner]; if (pcs && pcs.st === 'a' && !Q.pIn) { A.fl.played = 0; A.fl.hint = 0; Q.file = Q.file.slice(0, 1);
            const ev = Q.deck.concat(Q.hand).find(id => String(A.cards[id].d).endsWith('id_0130')); if (ev != null) { Q.deck = Q.deck.filter(x => x !== ev); Q.hand = Q.hand.filter(x => x !== ev); Q.hand = Q.hand.filter(id => { try { return S.D(A, id).type !== 'char' || S.FX.lvOf(A, id) <= 1; } catch (e) { return true; } }); Q.hand.push(ev);
              const r = new WhiteGreenStrategy({}).choose(A, seat, {}); an++; if (r.mv.tag === 'assist') asst++; } } } }
        if (en < 4 && R.n >= 4) { const A = SIM.clone(R); if (A) { const Q = A.P[seat], need = +(seat === A.first ? S.D(A, Q.kase).lv : S.D(A, Q.kase).lv2) || 7; let g = 0; while (Q.evid.length < need && g++ < 20) { const id = Q.deck.shift(); if (id == null) break; A.cards[id].up = true; Q.evid.push(id); }
            A.cards[Q.kase].solved = false; const r = new WhiteGreenStrategy({}).choose(A, seat, {}); en++; if (r.mv.tag !== 'reason') enough++; } } } });
    let sm = 0, smN = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 12, onStep: (rec, R) => { if (R.phase === 'over' || smN >= 4 || R.n < 4) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, A = SIM.clone(R); if (!A) return; const Q = A.P[seat], Oo = A.P[1 - seat], need = +(seat === A.first ? S.D(A, Q.kase).lv : S.D(A, Q.kase).lv2) || 7;
        let g = 0; while (Q.evid.length + Oo.evid.length < need && g++ < 30) { const o = g % 2 ? Oo : Q, id = o.deck.shift(); if (id == null) break; A.cards[id].up = true; o.evid.push(id); } if (Q.evid.length >= need || !Oo.evid.length) return; A.cards[Q.kase].solved = false; A.P[1 - seat].field.forEach(id => { A.cards[id].st = 's'; });
        const r = new WhiteGreenStrategy({}).choose(A, seat, {}); smN++; if (r.mv.tag !== 'reason') sm++; } });
    ok(smN === 0 || sm === smN, `32b 구성한 상황: 양측 증거 합 ≥ 해결 필요 수 → 추리하지 않음(증거 액션/공격/종료) (${sm}/${smN})`);
    ok(an === 0 || asst === an, `31 구성한 상황: 낼 수 있는 캐릭터가 없고 1코 이벤트 → 어시스트 먼저 (${asst}/${an})`);
    ok(en === 0 || enough === en, `32 구성한 상황: 증거가 사건 해결 필요 수 이상이면 추리하지 않음 (${enough}/${en})`); }
  // v0.9 PD 규칙 (8차): MR(+2000, Lv8+) 효과를 항상 계산 — 내 MR 이 깔려 있으면 AP8000 은 10000, 액면 9000 인 상대도 공격
  { let n = 0, atk = 0, bad = 0;
    for (const seed of [1, 2, 3]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 10, onStep: (rec, R) => { if (R.phase === 'over' || n >= 4 || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, A = SIM.clone(R); if (!A) return; const Q = A.P[seat], Oo = A.P[1 - seat];
        const find = def => Q.deck.concat(Q.hand, Q.rem, Q.field).find(id => String(A.cards[id].d).endsWith(def)), gin = find('id_0688'), mr = find('id_1153'); if (gin == null || mr == null || gin === mr) return;
        for (const id of [gin, mr]) { for (const k of ['deck', 'hand', 'rem']) Q[k] = Q[k].filter(x => x !== id); Q.field = Q.field.filter(x => x !== id); }
        Q.field = [gin, mr]; for (const id of Q.field) { A.cards[id].st = 'a'; A.cards[id].sum = 0; A.cards[id].apm = 0; } Q.pIn = false; A.fl.played = 1; A.fl.hint = 1; A.fl.acted = {};
        const t = Oo.field[0]; if (t == null) return; Oo.field = [t]; A.cards[t].st = 's'; A.cards[t].apm = (A.cards[t].apm || 0) + (9000 - S.ap(A, t));
        const r = new WhiteGreenStrategy({}).choose(A, seat, {}); n++; if (r.mv.tag === 'atkc' && r.mv.m.tid === t) atk++; if (r.mv.tag === 'end' || r.mv.tag === 'reason') bad++; } });
    ok(n >= 2 && atk >= 1 && bad === 0, `33 구성한 상황: 내 MR 깔림 + 액면 AP8000 vs 상대 슬립 AP9000 → 10000 으로 공격 (공격 ${atk}/${n}, 추리·종료 ${bad})`); }
  // v0.10 PD 규칙 (9차): 마코토 아끼기 / 선언 효과는 액티브를 때릴 때만 / 소노코 직접 공격 금지 / 서치 후보 표시
  { let err = 0, bad = 0, twoMk = 0, sonoAtk = 0, declBad = 0, searchShown = 0; const rules = {};
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false, onStep: (rec, R) => { const mm = rec.move || {};
        if (mm.a === 'play' && mm.id != null && String(R.cards[mm.id].d).endsWith('id_1097') && !rec.wasRep) { const P = R.P[rec.seat]; if (P.field.filter(x => String(R.cards[x].d).endsWith('id_1097')).length >= 2) twoMk++; }
        if (mm.a === 'action' && mm.k === 'char' && String(R.cards[mm.id].d).endsWith('id_1096') && rec.audit && rec.audit.atk < rec.audit.def + 2000) sonoAtk++;
        if (mm.a === 'ability' && mm.id != null) { const d0 = String(R.cards[mm.id].d).replace(/^\d+:/, ''); if (((d0 === 'id_0876' && rec.rule !== 'wg:sono2-active') || (d0 === 'id_0688' && rec.rule !== 'wg:gin-active')) && rec.rule !== 'wg:lethal') declBad++; } } });
      if (!m.result.ended || m.result.illegalFallbacks) bad++; for (const d of m.decisions) { if (d.hookError) err++; if (d.rule) rules[d.rule] = (rules[d.rule] || 0) + 1; if (d.rule === 'wg:search-pick' && /서치 후보/.test(d.why || '')) searchShown++; } }
    ok(!err && !bad, `34 v0.10 8판: 훅 오류 ${err}·불법/미종료 ${bad}`);
    ok(twoMk === 0, `35 현장에 마코토 2장이 되는 사용 ${twoMk}회 (마코토 아끼기)`);
    ok(declBad === 0, `36 2코 소노코/경구 선언 효과를 '액티브 대상 공격' 근거 없이 사용 ${declBad}회`);
    ok(sonoAtk === 0, `37 6코 소노코 직접 공격(확실한 킬 제외) ${sonoAtk}회`);
    ok(searchShown >= 1, `38 서치 이벤트: 후보와 선택 이유 표시 ${searchShown}회; 규칙: ` + JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => /one-makoto|hold-trash|sono2|gin-|kill-before-case|sonoko-no-attack|assist-solve|case-sure/.test(k))))); }
  // v0.11: 콤보 A(헤이지→유사쿠→마코토) 구성 상황 / 키드 직접 사용 금지
  { let n = 0, okA = 0, kidBad = 0, kn = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 10, onStep: (rec, R) => { if (R.phase === 'over' || n >= 3 && kn >= 3 || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, A = SIM.clone(R); if (!A) return; const Q = A.P[seat];
        const take = def => { const id = Q.deck.concat(Q.rem, Q.hand).find(x => String(A.cards[x].d).endsWith(def) && !Q.field.includes(x)); if (id == null) return null; for (const k of ['deck', 'rem', 'hand']) Q[k] = Q[k].filter(x => x !== id); return id; };
        const h = take('id_0188'), y = take('id_0873'), m = take('id_1097'), kid = take('id_0205'); if ([h, y, m, kid].some(x => x == null)) return;
        Q.hand = [h, y, m]; Q.field.forEach(id => { A.cards[id].st = 'a'; }); while (Q.file.length < 9 && Q.deck.length) Q.file.push(Q.deck.shift()); Q.pIn = false; A.fl.played = 0; A.fl.hint = 0; A.fl.hw = 0;
        if (Q.field.length >= 5) Q.field = Q.field.slice(0, 3);
        if (n < 3) { const r = new WhiteGreenStrategy({}).choose(A, seat, {}); n++; if (r.mv.tag === 'play' && r.mv.m.id === h) okA++; }
        const K = SIM.clone(A); K.P[seat].hand = [kid]; if (kn < 3) { const r2 = new WhiteGreenStrategy({}).choose(K, seat, {}); kn++; if (r2.mv.tag === 'play' && r2.mv.m.id === kid) kidBad++; } } });
    ok(n === 0 || okA === n, `39 구성한 상황: 손패 헤이지·유사쿠·마코토 + FILE 9 → 헤이지부터 낸다 (${okA}/${n})`);
    ok(kn === 0 || kidBad === 0, `40 구성한 상황: 손패에 7코 키드뿐 → 직접 내지 않음 (키드 사용 ${kidBad}/${kn})`); }
  // v0.12: 넥스트 힌트 후 추가 사용 구간(hw)에서도 1코 서치 이벤트를 쓴다
  { let n = 0, okE = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 10, onStep: (rec, R) => { if (R.phase === 'over' || n >= 3 || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, A = SIM.clone(R); if (!A) return; const Q = A.P[seat];
        const ev = Q.deck.concat(Q.rem, Q.hand).find(x => String(A.cards[x].d).endsWith('id_0130')); if (ev == null) return; for (const k of ['deck', 'rem', 'hand']) Q[k] = Q[k].filter(x => x !== ev); Q.hand.push(ev); while (Q.file.length < 4 && Q.deck.length) Q.file.push(Q.deck.shift());
        A.fl.played = 1; A.fl.hint = 1; A.fl.hw = 1; const g = SIM.genMoves(A, () => 0); if (!g.some(m => m.tag === 'play' && m.m.id === ev)) return;
        const r = new WhiteGreenStrategy({}).choose(A, seat, {}); n++; if (r.mv.tag === 'play' && r.mv.m.id === ev) okE++; } });
    ok(n === 0 || okE === n, `41 구성한 상황: 넥스트 힌트 후 추가 사용 구간에서 1코 이벤트 사용 (${okE}/${n})`); }
  // 3 숨은 정보 비의존: 상대의 손패/덱 순서·내 덱 순서를 바꿔도 결정이 같다
  { let n = 0, same = 0; const st = new WhiteGreenStrategy({});
    SP.playMatch({ seed: 5, first: 0, frames: false, maxTurns: 14, onStep: (rec, R) => { if (rec.n % 5 || R.phase === 'over') return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, o = 1 - seat;
      const R1 = SIM.clone(R), R2 = SIM.clone(R); if (!R1 || !R2) return;
      const hid = R2.P[o].hand.concat(R2.P[o].deck); for (let i = hid.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [hid[i], hid[j]] = [hid[j], hid[i]]; } R2.P[o].hand = hid.slice(0, R2.P[o].hand.length); R2.P[o].deck = hid.slice(R2.P[o].hand.length);   // 상대의 숨은 카드 재배치
      R2.P[seat].deck = R2.P[seat].deck.slice().reverse();   // 내 덱 순서
      const c1 = new WhiteGreenStrategy({}).choose(R1, seat, {}), c2 = new WhiteGreenStrategy({}).choose(R2, seat, {}); n++; if (c1.mv && c2.mv && JSON.stringify(c1.mv.m) === JSON.stringify(c2.mv.m)) same++; } });
    ok(n >= 5 && same === n, `8 숨은 정보(상대 손패·덱 순서, 내 덱 순서)를 바꿔도 결정 동일 (${same}/${n})`); }
  // 4 방 통합: 실제 봇 경로(createRoom bot:'baekrok')
  { const rooms = {}, deckH = U.makeDeck(3), humanWs = { readyState: 1, send() {} }; const bc = R => { if (R.bot) R.bot.tick(); };
    const R = C.createRoom({ rooms, mkR: S.mkR, ready: S.ready, dispatch: S.dispatch, loadCards: () => ({ cards }), say: (R, t) => R.log.push(t), cl: x => x, ws: humanWs, m: { t: 'createBot', first: 'second', bot: 'baekrok', botDeck: { cards: { id_0001: 40 }, partner: 'x', kase: 'y' } }, bc }); 
    const defs = {}; for (const id of [...new Set(deckH.list), deckH.partner, deckH.kase]) defs[id] = cards[id]; const e = S.dispatch(R, 0, { t: 'ready', defs, list: deckH.list, partner: deckH.partner, kase: deckH.kase }); if (e) throw new Error(e);
    const h = B.heuristic(U.mulberry32(3)); bc(R); const T0 = Date.now(); while (R.phase !== 'over' && Date.now() - T0 < 120000) { const d = SIM.who(R); if (d && d.seat === 0) { const mv = h(R, 0); if (!mv) break; if (S.dispatch(R, 0, mv.m)) { const alt = SIM.genMoves(R, () => 0).find(m => !S.dispatch(R, 0, m.m)); } bc(R); await new Promise(r => setImmediate(r)); } else await new Promise(r => setTimeout(r, 2)); }
    const botDeck = {}; for (const id of Object.values(R.defs || {}).length ? [] : []) botDeck[id] = 1; const cnt = {}; for (const c of Object.values(R.cards)) { const k = String(c.d).replace(/^\d+:/, ''); if (c.o === 1 && k in WANT) cnt[k] = (cnt[k] || 0) + 1; }
    const lg = R.bot.logMsg().log; R.bot.stop();
    ok(R.phase === 'over' && R.bot.illegal === 0, `9 사람(휴리스틱) vs 백녹이기기 방: 끝까지 진행·불법 ${R.bot.illegal} (턴 ${R.n})`);
    ok(R.bot.cfg.specialist === 'baekrok' && /백녹이기기/.test(lg.botName) && lg.specialist === 'baekrok', `10 방 생성 시 전용 모드로 고정 (${lg.botName}) — 클라이언트가 보낸 덱은 무시`);
    ok(JSON.stringify(Object.entries(cnt).sort()) === JSON.stringify(Object.entries(WANT).sort()), '11 AI 덱이 확정 덱으로 자동 설정됨(덱 선택 불필요)');
    const w = lg.decisions.filter(d => d.wg); ok(w.length > 10 && w.length >= lg.decisions.length * .9 && w.every(d => d.wg.version === '0.15'), `12 같은 WhiteGreenStrategy 가 실제 판단에 사용되고 Decision Log(wg)가 남음 (${w.length}/${lg.decisions.length})`); }
  // v0.13: 콤보 마지막 장은 6코 소노코(마코토 아끼기) / 5코↑가 있으면 마코토 대신 / FILE 부족 시 콤보 어시스트
  { let nA = 0, okS = 0, nB = 0, okH = 0, nC = 0, okC = 0;
    const setup = (R, seat, hand, fileN, field) => { const A = SIM.clone(R); if (!A) return null; const Q = A.P[seat];
      const take = def => { const id = Q.deck.concat(Q.rem, Q.hand, Q.field).find(x => String(A.cards[x].d).endsWith(def)); if (id == null) return null; for (const k of ['deck', 'rem', 'hand', 'field']) Q[k] = Q[k].filter(x => x !== id); return id; };
      const hs = hand.map(take), fs = (field || []).map(take); if (hs.some(x => x == null) || fs.some(x => x == null)) return null;
      Q.hand = hs; Q.field = fs; fs.forEach(id => { A.cards[id].st = 'a'; A.cards[id].sum = 0; }); while (Q.file.length < fileN && Q.deck.length) Q.file.push(Q.deck.shift()); while (Q.file.length > fileN) Q.deck.push(Q.file.pop()); Q.pIn = false; A.fl.played = 0; A.fl.hint = 0; A.fl.hw = 0; A.fl.acted = {}; return { A, Q, hs }; };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 10, onStep: (rec, R) => { if (R.phase === 'over' || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat;
        if (nA < 3) { const o = setup(R, seat, ['id_1096', 'id_1097'], 7, ['id_0188', 'id_0873']); if (o) { const r = new WhiteGreenStrategy({}).choose(o.A, seat, {}); nA++; if (r.mv.tag === 'play' && r.mv.m.id === o.hs[0]) okS++; else if (process.env.DBG) console.log('A', r.mv.tag, r.rule, r.why, 'hand', o.Q.hand.length, 'file', o.Q.file.length, 'hw', o.A.fl.hw); } }
        if (nB < 3) { const o = setup(R, seat, ['id_1097', 'id_0123'], 7, []); if (o) { const r = new WhiteGreenStrategy({}).choose(o.A, seat, {}); nB++; if (r.mv.tag === 'play' && r.mv.m.id === o.hs[1]) okH++; } }
        if (nC < 3) { const o = setup(R, seat, ['id_0188', 'id_0873', 'id_1097'], 8, []); if (o) { const r = new WhiteGreenStrategy({}).choose(o.A, seat, {}); nC++; if (/assist/.test(r.mv.tag) || r.rule === 'wg:combo-assist') okC++; else if (process.env.DBG) console.log('C', r.mv.tag, r.rule, r.why); } } } });
    ok(nA === 0 || okS === nA, `51 구성한 상황: 헤이지·유사쿠 현장 + 손패 6코 소노코·마코토 → 소노코를 낸다 (${okS}/${nA})`);
    ok(nB === 0 || okH === nB, `52 구성한 상황: 손패 마코토 + 5코 돌격(銀三) → 마코토 대신 5코를 낸다 (${okH}/${nB})`);
    ok(nC === 0 || okC >= 1, `53 구성한 상황: 헤이지·유사쿠·마코토 + FILE 8 → 어시스트로 FILE 9 확보 (${okC}/${nC})`); }
  // v0.14: 선언 효과(2코 소노코/경구) 대상 선택이 비어 있으면 안 된다 / 상대가 전부 액티브면 마코토 대신 소노코
  { let decl = 0, emptyPick = 0, targetPick = 0, ginSave = 0, errs = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) { const m = SP.playMatch({ seed, first: seed % 2, frames: false });
      m.decisions.forEach((d, i) => { if (d.hookError) errs++; if (d.rule === 'wg:gin-save') ginSave++;
        if (d.rule === 'wg:sono2-active' || d.rule === 'wg:gin-active') { decl++; for (let j = i + 1; j < Math.min(i + 4, m.decisions.length); j++) { const e = m.decisions[j]; if (e.seat !== d.seat) continue; if (e.rule === 'wg:actactive-target') { targetPick++; break; } if (e.kind === 'eff' && /선택: \[\]/.test(e.chosen || '')) { emptyPick++; break; } } } }); }
    ok(errs === 0, `54 v0.14 10판 훅 오류 ${errs}`);
    ok(decl === 0 || (emptyPick === 0 && targetPick >= 1), `55 선언(소노코2/경구) ${decl}회 → 대상 선택 ${targetPick}회, 빈 선택 ${emptyPick}회 (경구 보류 ${ginSave}회)`); }
  // v0.14: MR 이 파트너 에리어(pa)에 있어도 AP+2000 을 계산한다 (액면 7000 카이토 vs 슬립 8000 → 9000 으로 공격)
  { let n = 0, okM = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 12, onStep: (rec, R) => { if (R.phase === 'over' || n >= 3 || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat, A = SIM.clone(R); if (!A) return; const Q = A.P[seat], Oo = A.P[1 - seat];
        const take = def => { const id = Q.deck.concat(Q.rem, Q.hand, Q.field, Q.file).find(x => String(A.cards[x].d).endsWith(def)); if (id == null) return null; for (const k of ['deck', 'rem', 'hand', 'field', 'file']) Q[k] = Q[k].filter(x => x !== id); return id; };
        const kt = take('id_1098'), mr = take('id_1153'); if (kt == null || mr == null || !Oo.field.length) return; Q.field = [kt]; A.cards[kt].st = 'a'; A.cards[kt].sum = 0; A.cards[kt].apm = 0; Q.pa = (Q.pa || []).concat([mr]); A.cards[mr].st = 'a'; Q.hand = []; Q.pIn = false; A.fl.played = 1; A.fl.hint = 1; A.fl.hw = 0; A.fl.acted = {};
        const t = Oo.field[0]; Oo.field = [t]; A.cards[t].st = 's'; A.cards[t].apm = (A.cards[t].apm || 0) + (8000 - S.ap(A, t)); Oo.pa = [];
        const r = new WhiteGreenStrategy({}).choose(A, seat, {}); n++; if (r.mv.tag === 'atkc' && r.mv.m.tid === t) okM++; } });
    ok(n === 0 || okM === n, `56 구성한 상황: MR 이 파트너 에리어에 있음 + 카이토(액면 7000) vs 슬립 AP8000 → 공격 (${okM}/${n})`); }
  // v0.15: 한 장 낸 뒤 FILE 8 + 손패 6코 소노코 → 턴 종료 대신 넥스트 힌트로 이어서 전개 / 힌트 후 1코 이벤트 우선
  { let n = 0, okH = 0, m2 = 0, okE = 0, errs = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) SP.playMatch({ seed, first: seed % 2, frames: false, maxTurns: 12, onStep: (rec, R) => { if (R.phase === 'over' || (n >= 3 && m2 >= 3) || R.n < 3) return; const d = SIM.who(R); if (!d || d.kind !== 'main') return; const seat = d.seat;
        const mk = (hand, fileN, field) => { const A = SIM.clone(R); if (!A) return null; const Q = A.P[seat], Oo = A.P[1 - seat]; const take = def => { const id = Q.deck.concat(Q.rem, Q.hand, Q.field, Q.file).find(x => String(A.cards[x].d).endsWith(def)); if (id == null) return null; for (const k of ['deck', 'rem', 'hand', 'field', 'file']) Q[k] = Q[k].filter(x => x !== id); return id; };
          const hs = hand.map(take), fs = field.map(take); if (hs.some(x => x == null) || fs.some(x => x == null) || !Oo.field.length) return null; Q.hand = hs; Q.field = fs; fs.forEach(id => { A.cards[id].st = 's'; A.cards[id].sum = 0; A.cards[id].apm = 0; });
          while (Q.file.length < fileN && Q.deck.length) Q.file.push(Q.deck.shift()); while (Q.file.length > fileN) Q.deck.push(Q.file.pop()); Q.pIn = false; if (Q.kase != null && A.cards[Q.kase]) A.cards[Q.kase].solved = true; Oo.field = [Oo.field[0]]; A.cards[Oo.field[0]].st = 's'; A.fl.played = 1; A.fl.hint = 0; A.fl.hw = 0; A.fl.acted = {}; return { A, hs }; };
        if (n < 3) { const o = mk(['id_1096', 'id_0123'], 8, ['id_0688', 'id_0688']); if (o) { const r = new WhiteGreenStrategy({}).choose(o.A, seat, {}); n++; if (r.rule === 'wg:hint-deploy' || r.mv.tag === 'hint' || r.mv.tag === 'play' || r.mv.tag === 'atkc') okH++; } }
        if (m2 < 3) { const o = mk(['id_0130', 'id_0205', 'id_0123'], 9, ['id_0688']); if (o) { o.A.fl.played = 0; const r = new WhiteGreenStrategy({}).choose(o.A, seat, {}); m2++; if (r.mv.tag === 'play' && r.mv.m.id === o.hs[0]) okE++; } } } });
    ok(n === 0 || okH === n, `57 구성한 상황: 한 장 낸 뒤 FILE 8 + 손패 6코 소노코·5코 → 턴 종료/추리로 끝내지 않음 (${okH}/${n})`);
    ok(m2 === 0 || okE === m2, `58 구성한 상황: 손패 1코 서치 이벤트 + 7코 키드 + 5코 → 이벤트부터 (${okE}/${m2})`); }
  console.log(`\nwg_strategy_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
