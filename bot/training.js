'use strict';
// v1.12.1 — Training Script (강제 전개형 연습 모드, 강화판)
// 공정한 AI 가 아니라 "연습 상황 생성기". 사용자가 방 생성 시 명시적으로 켠 경우(ctl.training)에만 동작한다.
//  · 카드 데이터/효과는 건드리지 않는다. AI 의 "등록 덱" 카드 인스턴스만 이동시킨다(생성/복제 없음, 한 카드는 항상 한 구역에만).
//  · 어시스트/넥스트 힌트/카드 사용은 실제 act 경로(dispatch)로 수행 → UI 에 그대로 표시된다.
//  · 전개 단계는 건너뛰지 않는다: 등록 덱에 그 코스트 캐릭터가 한 장이라도 있으면 어느 구역(손패/덱/리무브/증거/FILE/파트너 에리어/상대 구역)에 있든 회수해서 쓴다.
//  · 강제 제거(TRAINING_FORCE_REMOVE)는 방금 낸 카드의 효과와 무관한 시스템 처리: 시퀀스가 끝나면 사람 현장 캐릭터를 전부 제거한다.
// 스크립트(k = AI 의 k번째 턴):
//   선공: 1턴 Lv2 / 2턴 Lv4 / 3턴 Lv6 / 4턴 Lv8→힌트→Lv7 + 전부 제거 / 5턴~ Lv9→힌트→Lv8→힌트→Lv7 + 전부 제거 (반복)
//   후공: 1턴 Lv3(등록 덱에 3코스트가 없으면 Lv2) / 2턴 Lv5 / 3턴 Lv7 + 전부 제거 / 4턴~ Lv9→힌트→Lv8→힌트→Lv7 + 전부 제거 (반복)
const TAG = '[TRAINING] ';
const lib = () => require('../server.js');
const ZN = { hand: '손패', deck: '덱', rem: '리무브', evid: '증거', file: 'FILE', pa: '파트너 에리어' };
const SEARCH_OWN = ['hand', 'deck', 'rem', 'evid', 'file', 'pa'];   // 우선순위: 손패 → 덱 → 그 외

function plan(R, seat) {
  const first = R.first === seat, k = first ? (R.n + 1) >> 1 : R.n >> 1, H = 'H';
  if (first) {
    if (k === 1) return { k, steps: [2], rm: false }; if (k === 2) return { k, steps: [4], rm: false }; if (k === 3) return { k, steps: [6], rm: false };
    if (k === 4) return { k, steps: [8, H, 7], rm: true };
    return { k, steps: [9, H, 8, H, 7], rm: true };
  }
  if (k === 1) return { k, steps: [3], rm: false, alt2: true }; if (k === 2) return { k, steps: [5], rm: false }; if (k === 3) return { k, steps: [7], rm: true };
  return { k, steps: [9, H, 8, H, 7], rm: true };
}
const apOf = (L, R, id) => +L.D(R, id).ap || 0;
const pickBest = (L, R, ids) => ids.slice().sort((a, b) => apOf(L, R, b) - apOf(L, R, a) || a - b)[0];   // 동일 코스트 → 기존 평가(AP 우선), 동률은 인스턴스 id

// AI 소유 카드(인스턴스)가 현재 있는 구역: [{id, zone, seat}] — 현장(field)은 이미 전개된 카드이므로 제외, 파트너/사건 카드는 제외
function ownedCards(R, seat) {
  const out = [], P0 = R.P[seat];
  const zones = [[seat, SEARCH_OWN], [1 - seat, ['hand', 'deck', 'rem', 'evid', 'file', 'pa']]];
  for (const [s, zs] of zones) for (const z of zs) for (const id of R.P[s][z] || []) { const c = R.cards[id]; if (c && c.o === seat && id !== P0.partner && id !== P0.kase) out.push({ id, zone: z, seat: s }); }
  const rank = c => (c.seat === seat ? SEARCH_OWN.indexOf(c.zone) : 10);
  return out.sort((a, b) => rank(a) - rank(b));
}
function detach(R, id) { // 어느 구역에 있든 그 구역에서만 꺼낸다 (복제 없음)
  for (const s of [0, 1]) for (const z of ['hand', 'deck', 'rem', 'evid', 'file', 'pa']) { const a = R.P[s][z]; const i = a ? a.indexOf(id) : -1; if (i >= 0) { a.splice(i, 1); return { seat: s, zone: z }; } }
  return null;
}

// 현재 상태 R 에서 AI(seat)의 다음 연습 행동. {mv:{seat,m}, desc, commit?()} 또는 null(→ 평소 Expert)
function next(ctl, d) {
  const R = ctl.R, seat = ctl.seat, L = lib(), P = R.P[seat], O = R.P[1 - seat];
  if (R.turn !== seat || R.phase !== 'play' || !d || (d.kind !== 'main' && d.kind !== 'hint')) return null;   // 효과 선택(eff)/가드 등은 평소 Expert 가 처리
  const lvOf = id => L.FX.lvOf(R, id), isChar = id => L.D(R, id).type === 'char';
  let st = ctl.trn; if (!st || st.n !== R.n) { const p = plan(R, seat); st = ctl.trn = { n: R.n, p, i: 0, abort: false, removed: false, logged: false };
    if (p.alt2 && !ownedCards(R, seat).some(c => isChar(c.id) && lvOf(c.id) === 3)) p.steps = [2]; }
  const log = t => { R.log.push(TAG + t); };
  if (!st.logged) { st.logged = true; log(`연습 스크립트 ${st.p.k}번째 턴: ${st.p.steps.map(x => x === 'H' ? '넥스트 힌트' : x + '코스트').join(' → ')}${st.p.rm ? ' → 상대 현장 전부 제거' : ''}`); }
  const sys = f => { f(); ctl.sysDirty(); };   // 시스템 변경 → 탐색 추적기 재설정
  const remaining = () => st.p.steps.slice(st.i).filter(x => x !== 'H');
  // FILE 보충 후보: 앞으로 쓸 코스트의 캐릭터는 건드리지 않는다. 리무브 → 덱 → 증거 순
  const filler = () => { const keep = new Set(remaining()), ok = c => !(isChar(c.id) && keep.has(lvOf(c.id)));
    for (const z of ['rem', 'deck', 'evid']) { const cs = P[z].filter(id => R.cards[id].o === seat && ok({ id })); if (cs.length) return z === 'deck' ? cs[0] : cs[cs.length - 1]; } return null; };
  const ensureFcount = need => {
    if (L.fcount(R, seat) >= need) return 'ok';
    if (d.kind === 'main' && !P.pIn && R.cards[P.partner].st === 'a') return { mv: { seat, m: { t: 'act', a: 'assist' } }, desc: '어시스트(연습 스크립트)' };
    let n = 0; while (L.fcount(R, seat) < need) { const id = filler(); if (id == null) break; sys(() => { detach(R, id); R.cards[id].up = false; P.file.push(id); }); n++; }
    if (n) log(`FILE ${n}장을 보충했습니다 (연습 전개용)`);
    return L.fcount(R, seat) >= need ? 'ok' : 'stop';
  };
  while (!st.abort && st.i < st.p.steps.length) {
    const step = st.p.steps[st.i];
    if (step === 'H') {
      if (d.kind === 'hint') return { mv: { seat, m: { t: 'act', a: 'skip' } }, desc: '사용 기회 스킵(연습 스크립트: 앞 단계 카드 없음)' };
      if (R.fl.nh) { log('카드 효과로 이번 턴 넥스트 힌트를 할 수 없어 시퀀스를 중단합니다.'); st.abort = true; break; }
      const nextLv = st.p.steps[st.i + 1];
      const e = ensureFcount((nextLv || 0) + 1); if (e !== 'ok') { if (e === 'stop') { log('넥스트 힌트에 필요한 FILE 을 확보하지 못해 시퀀스를 중단합니다.'); st.abort = true; break; } return e; }
      return { mv: { seat, m: { t: 'act', a: 'hint' } }, desc: '넥스트 힌트(연습 스크립트)', commit() { st.i++; log('AI가 넥스트 힌트를 사용했습니다.'); } };
    }
    const lv = step;
    if (d.kind === 'main' && (R.fl.played || R.fl.hint)) { log('이번 턴 손패 사용 기회가 없어 시퀀스를 중단합니다.'); st.abort = true; break; }
    const loose = ownedCards(R, seat).filter(c => isChar(c.id) && lvOf(c.id) === lv && L.okc(R, seat, L.D(R, c.id), c.id));
    if (!loose.length) { log(ownedCards(R, seat).concat(R.P[seat].field.map(id => ({ id }))).some(c => isChar(c.id) && lvOf(c.id) === lv)
      ? `${lv}코스트 캐릭터가 모두 현장에 있거나 색이 맞지 않아 강제 전개 불가` : `등록 덱에 ${lv}코스트 캐릭터가 없어 강제 전개 불가`); st.i++; continue; }
    const e = ensureFcount(lv); if (e !== 'ok') { if (e === 'stop') { log(`${lv}코스트 전개에 필요한 FILE 을 확보하지 못해 시퀀스를 중단합니다.`); st.abort = true; break; } return e; }
    const okc = loose.filter(c => !L.playCheck(R, seat, c.id)); if (!okc.length) { log(`${lv}코스트 캐릭터가 사용 조건을 만족하지 않아 강제 전개 불가`); st.i++; continue; }
    const pri = okc.filter(c => c.seat === seat && c.zone === 'hand'), pool = pri.length ? pri : okc.filter(c => c.seat === seat && c.zone === 'deck').length ? okc.filter(c => c.seat === seat && c.zone === 'deck') : okc;
    const id = pickBest(L, R, pool.map(c => c.id)), from = okc.find(c => c.id === id);
    if (!(from.seat === seat && from.zone === 'hand')) { sys(() => { detach(R, id); R.cards[id].up = false; P.hand.push(id); }); log(`${lv}코스트 전개용 카드 확보`); log(`AI가 ${lv}코스트 캐릭터를 강제 확보했습니다. (${L.D(R, id).n} / ${ZN[from.zone]}${from.seat === seat ? '' : '(상대 구역)'}에서 회수)`); (ctl.trainEvents = ctl.trainEvents || []).push({ kind: 'secure', n: R.n, lv, id, from: from.zone, fromSeat: from.seat }); continue; }   // 확보 후 FILE 장수가 달라졌을 수 있으니(FILE 에서 꺼낸 경우) 처음부터 다시 점검
    const m = { t: 'act', a: 'play', id };
    if (P.field.length >= L.FX.fieldMax(R, seat)) m.rep = P.field.slice().sort((a, b) => lvOf(a) - lvOf(b) || apOf(L, R, a) - apOf(L, R, b))[0];
    return { mv: { seat, m }, desc: `${lv}코스트 전개(연습 스크립트): ${L.D(R, id).n}`, commit() { st.i++; } };
  }
  // 시퀀스 종료. 힌트 사용 기회가 남아 있으면 스킵 (Expert 가 임의로 쓰지 않게)
  if (d.kind === 'hint') return { mv: { seat, m: { t: 'act', a: 'skip' } }, desc: '사용 기회 스킵(연습 스크립트 종료)' };
  // TRAINING_FORCE_REMOVE: 방금 낸 카드의 효과/ab/ops 는 보지 않는다. 사람 현장 캐릭터를 전부 제거(시스템 처리, 우선순위 없음)
  if (!st.removed && d.kind === 'main' && !R.fl.hw) {
    st.removed = true;
    if (st.p.rm && O.field.length) {
      const ids = O.field.slice(), names = ids.map(x => L.D(R, x).n);
      ctl.sysDirty(); L.sysRun(R, () => ids.forEach(x => { if (O.field.includes(x)) L.FX.rmChar(R, x, 'training', null); })); ctl.sysDirty();
      log(`TRAINING_FORCE_REMOVE: 연습 상황 생성을 위해 상대 현장 캐릭터 ${ids.length}장을 전부 제거했습니다. (${names.join(', ')})`);
      (ctl.trainEvents = ctl.trainEvents || []).push({ kind: 'TRAINING_FORCE_REMOVE', n: R.n, ids });
    }
  }
  return null;
}
module.exports = { next, plan, ownedCards };
