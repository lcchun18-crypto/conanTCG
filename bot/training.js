'use strict';
// v1.12.0 — Training Script (강제 전개형 연습 모드)
// 공정한 AI 가 아니라 "연습 상황 생성기": 사용자가 방 생성 시 명시적으로 켠 경우에만(R.bot && ctl.training) 동작한다.
//  · 카드 효과/카드 데이터를 건드리지 않는다. AI 자신의 "등록된 덱" 안의 카드만 손패/FILE 로 옮긴다(카드 생성 없음).
//  · 어시스트/넥스트 힌트/카드 사용은 실제 act 경로(dispatch)로 수행 → UI 에서 AI 가 실제로 사용한 것으로 보인다.
//  · 스크립트가 끝난 뒤(또는 진행 불가 시)의 모든 결정은 평소 Expert 가 한다 (next() 가 null 반환).
// 스크립트(k = AI 의 k번째 턴):
//   선공: 1턴 Lv2 / 2턴 Lv4 / 3턴 Lv6 / 4턴 Lv8→힌트→Lv7 + 상대 최고 코스트 2장 제거 / 5턴~ Lv9→힌트→Lv8→힌트→Lv7 + 최대 4장 제거
//   후공: 1턴 Lv3(덱에 3코스트 없으면 Lv2) / 2턴 Lv5 / 3턴 Lv7 + 1장 제거 / 4턴 Lv9→힌트→Lv8→힌트→Lv7 + 최대 4장 제거 / 5턴~ 평소 Expert
const TAG = '[TRAINING] ';
const lib = () => require('../server.js');

function plan(R, seat) {
  const first = R.first === seat, k = first ? (R.n + 1) >> 1 : R.n >> 1;   // R.n = 전역 턴 카운터
  const H = 'H';
  if (first) {
    if (k === 1) return { k, steps: [2], rm: 0 }; if (k === 2) return { k, steps: [4], rm: 0 }; if (k === 3) return { k, steps: [6], rm: 0 };
    if (k === 4) return { k, steps: [8, H, 7], rm: 2 };
    return { k, steps: [9, H, 8, H, 7], rm: 4 };
  }
  if (k === 1) return { k, steps: [3], rm: 0, alt2: true }; if (k === 2) return { k, steps: [5], rm: 0 }; if (k === 3) return { k, steps: [7], rm: 1 };
  if (k === 4) return { k, steps: [9, H, 8, H, 7], rm: 4 };
  return null;
}
const isChar = (L, R, id) => L.D(R, id).type === 'char';
const apOf = (L, R, id) => +L.D(R, id).ap || 0;

function pickBest(L, R, ids) { return ids.slice().sort((a, b) => apOf(L, R, b) - apOf(L, R, a) || (a < b ? -1 : 1))[0]; }   // 동일 코스트 → 기존 평가(AP 우선), 동률은 id

// 현재 상태 R 에서 AI(seat)의 다음 연습 행동. {mv:{seat,m}, desc, commit?()} 또는 null(→ 평소 Expert)
function next(ctl, d) {
  const R = ctl.R, seat = ctl.seat, L = lib(), P = R.P[seat], O = R.P[1 - seat];
  if (R.turn !== seat || R.phase !== 'play') return null;
  let st = ctl.trn; if (!st || st.n !== R.n) { const p = plan(R, seat); st = ctl.trn = { n: R.n, p, i: 0, abort: false, removed: false, logged: false }; if (p && p.alt2) { const has3 = [...P.hand, ...P.deck, ...P.file].some(id => isChar(L, R, id) && L.FX.lvOf(R, id) === 3); if (!has3) p.steps = [2]; } }
  if (!st.p) return null;
  const log = t => { R.log.push(TAG + t); };
  if (!st.logged) { st.logged = true; R.log.push(`${TAG}연습 스크립트 ${st.p.k}번째 턴: ${st.p.steps.map(x => x === 'H' ? '넥스트 힌트' : x + '코스트').join(' → ')}${st.p.rm ? ' + 상대 고코스트 ' + st.p.rm + '장 제거' : ''}`); }
  const lvOf = id => L.FX.lvOf(R, id);
  const assistable = () => !P.pIn && R.cards[P.partner].st === 'a';
  const sys = f => { if (!require('./simulate.js').cloneable(R)) return false; f(); ctl.sysDirty(); return true; };   // 시스템 변경 → 탐색 추적기 재설정
  // 필요 FILE 장수 확보: 어시스트 우선(실제 행동), 부족하면 덱에서 FILE 보충(시스템)
  const ensureFcount = need => {
    if (L.fcount(R, seat) >= need) return 'ok';
    if (d.kind === 'main' && assistable()) return { mv: { seat, m: { t: 'act', a: 'assist' } }, desc: '어시스트(연습 스크립트)' };
    let n = 0; while (L.fcount(R, seat) < need && P.deck.length) { if (!sys(() => { const id = P.deck.shift(); R.cards[id].up = false; P.file.push(id); })) return 'stop'; n++; }
    if (n) log(`FILE ${n}장을 덱에서 보충했습니다 (연습 전개용)`);
    return L.fcount(R, seat) >= need ? 'ok' : 'stop';
  };
  while (true) {
    if (st.abort || st.i >= st.p.steps.length) break;
    const step = st.p.steps[st.i];
    if (d.kind === 'hint' && step === 'H') return null;   // 힌트로 얻은 사용 기회는 먼저 처리(Expert)
    if (step === 'H') {
      const nextLv = st.p.steps[st.i + 1];
      if (R.fl.nh) { st.abort = true; break; }
      if (d.kind !== 'main') return null;
      const e = ensureFcount((nextLv || 0) + 1); if (e !== 'ok') { if (e === 'stop') { st.abort = true; break; } return e; }
      if (!P.file.length) { st.abort = true; break; }
      return { mv: { seat, m: { t: 'act', a: 'hint' } }, desc: '넥스트 힌트(연습 스크립트)', commit() { st.i++; log('AI가 넥스트 힌트를 사용했습니다.'); } };
    }
    const lv = step;
    if (d.kind === 'main' && (R.fl.played || R.fl.hint)) { st.abort = true; break; }   // 이번 턴 손패 사용 기회가 이미 없음
    const cand0 = [...P.hand, ...P.deck].filter(id => isChar(L, R, id) && lvOf(id) === lv && L.okc(R, seat, L.D(R, id), id));
    if (!cand0.length) { log(`AI 덱에 사용 가능한 ${lv}코스트 캐릭터가 없어 이 단계를 건너뜁니다.`); st.i++; continue; }
    const e = ensureFcount(lv); if (e !== 'ok') { if (e === 'stop') { log(`${lv}코스트 전개에 필요한 FILE 을 확보하지 못해 스크립트를 중단합니다.`); st.abort = true; break; } return e; }
    const okIds = cand0.filter(id => { const pc = L.playCheck(R, seat, id); return !pc; });
    if (!okIds.length) { log(`${lv}코스트 캐릭터가 사용 조건을 만족하지 않아 이 단계를 건너뜁니다.`); st.i++; continue; }
    const inHand = okIds.filter(id => P.hand.includes(id)), id = pickBest(L, R, inHand.length ? inHand : okIds);
    if (!P.hand.includes(id)) { if (!sys(() => { P.deck.splice(P.deck.lastIndexOf(id), 1); P.hand.push(id); })) { st.abort = true; break; } log(`${lv}코스트 전개용 카드 확보`); log(`AI가 ${lv}코스트 캐릭터를 강제 확보했습니다. (${L.D(R, id).n})`); }
    const m = { t: 'act', a: 'play', id }; let rep;
    if (P.field.length >= L.FX.fieldMax(R, seat)) { rep = P.field.slice().sort((a, b) => lvOf(a) - lvOf(b) || apOf(L, R, a) - apOf(L, R, b))[0]; m.rep = rep; }
    return { mv: { seat, m }, desc: `${lv}코스트 전개(연습 스크립트): ${L.D(R, id).n}`, commit() { st.i++; } };
  }
  // 스크립트 완료 → 강제 제거(시스템 처리, 코스트 높은 순) 한 번
  if (!st.removed && d.kind === 'main' && !R.fl.hw) {
    const want = st.p.rm; st.removed = true;
    if (want > 0 && require('./simulate.js').cloneable(R)) {
      const ids = O.field.slice().sort((a, b) => lvOf(b) - lvOf(a)).slice(0, Math.min(want, O.field.length));
      if (ids.length) { ctl.sysDirty(); L.sysRun(R, () => ids.forEach(x => { if (O.field.includes(x)) L.FX.rmChar(R, x, 'training', null); })); ctl.sysDirty();
        R.log.push(`${TAG}연습 상황 생성을 위해 코스트가 높은 캐릭터 ${ids.length}장을 제거했습니다. (${ids.map(x => L.D(R, x).n + ' Lv' + lvOf(x)).join(', ')})`); st.removedIds = ids; (ctl.trainEvents = ctl.trainEvents || []).push({ kind: 'remove', n: R.n, ids: ids.slice() }); }
    }
  }
  return null;
}
module.exports = { next, plan };
