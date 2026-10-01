// 상태 스냅샷 ↔ 복원.  (1) 결정 로그(게임 종료 후 다운로드)에 "그 시점의 전체 상태"를 카드 ID 로 남기고,
// (2) 그 로그의 한 결정을 회귀 테스트(test/specialist_cases/…)로 그대로 재현하기 위해 restore() 로 게임 상태를 다시 만듭니다.
// 복원 범위: 각 존의 카드(손패/필드/FILE/증거/덱/제외/세트·스택), 필드 카드의 액티브/슬립/스턴·소환 직후 여부, 증거 앞/뒷면, 파트너/사건 상태, 선공, 턴, 이번 턴 사용 플래그.
// 필드 카드의 임시 수정치(AP/LP/레벨/키워드/효과 카운터)도 복원. 복원하지 않는 것: 진행 중인 효과/선택창 (메인 단계 결정만 스냅샷), 이미 예약된 지연 효과(R.q)·로그.
const key = (R, id) => { const d = R.cards[id].d; return d.slice(d.indexOf(':') + 1); };
function snapshot(R) {
  const K = id => key(R, id), P = [0, 1].map(s => { const p = R.P[s];
    return { hand: p.hand.map(K), field: p.field.map(id => { const c = R.cards[id]; const mods = {}; for (const m of ['apm', 'cm', 'lpm', 'lvm', 'tkw', 'u']) if (c[m] && (typeof c[m] !== 'object' || Object.keys(c[m]).length)) mods[m] = JSON.parse(JSON.stringify(c[m])); return { k: K(id), st: c.st || 'a', sum: c.sum ? 1 : 0, mods, sets: (c.sets || []).map(K), fd: (c.fd || []).map(K), under: (c.under || []).map(K) }; }),
      file: p.file.map(K), evid: p.evid.map(id => ({ k: K(id), up: R.cards[id].up ? 1 : 0 })), deck: p.deck.map(K), rem: p.rem.map(K), pa: (p.pa || []).map(K),
      partner: { k: K(p.partner), st: R.cards[p.partner].st || 'a' }, pIn: p.pIn ? 1 : 0, tr: p.tr ? 1 : 0, kase: { k: K(p.kase), solved: R.cards[p.kase].solved ? 1 : 0 } }; });
  return { v: 1, n: R.n, turn: R.turn, first: R.first, phase: R.phase, fl: JSON.parse(JSON.stringify(R.fl || {})), P };
}
// restore(snap, DB[, S]) → 새 R.  snap 의 카드 ID 는 DB(cards 객체)에 있어야 한다.
function restore(snap, DB, S) {
  S = S || require('../server.js'); if (!snap || snap.v !== 1) throw new Error('지원하지 않는 스냅샷');
  const R = S.mkR('SNAP' + Math.random().toString(36).slice(2, 6)); R.firstPref = snap.first;
  snap.P.forEach((p, s) => {
    const list = [...p.hand, ...p.field.flatMap(f => [f.k, ...f.sets, ...f.fd, ...f.under]), ...p.file, ...p.evid.map(e => e.k), ...p.deck, ...p.rem, ...p.pa];
    for (const id of [...list, p.partner.k, p.kase.k]) if (!DB[id]) throw new Error('카드 DB 에 없는 카드: ' + id);
    const defs = {}; for (const id of [...new Set(list), p.partner.k, p.kase.k]) defs[id] = DB[id];
    const e = S.ready(R, s, { defs, list, partner: p.partner.k, kase: p.kase.k }); if (e) throw new Error(`좌석 ${s} 덱 등록 실패: ${e}`); });
  for (let i = 0; i < 2 && R.phase === 'mull'; i++) S.act(R, R.mullSeat, { a: 'mull', ids: [] });
  snap.P.forEach((p, s) => { const P = R.P[s];
    const pool = {}; for (const id of [...P.deck, ...P.hand, ...P.file, ...P.evid, ...P.rem, ...P.field]) (pool[key(R, id)] ||= []).push(id);
    const take = k => { const a = pool[k]; if (!a || !a.length) throw new Error(`복원 실패: ${k} 부족 (좌석 ${s})`); return a.pop(); };
    P.deck = []; P.hand = p.hand.map(take); P.file = p.file.map(take); P.rem = p.rem.map(take); P.pa = (p.pa || []).map(take);
    P.evid = p.evid.map(e => { const id = take(e.k); R.cards[id].up = !!e.up; return id; });
    P.field = p.field.map(f => { const id = take(f.k), c = R.cards[id]; c.st = f.st; c.sum = f.sum ? 1 : 0; Object.assign(c, JSON.parse(JSON.stringify(f.mods || {}))); const setOf = a => a.map(take); if (f.sets.length) c.sets = setOf(f.sets); if (f.fd.length) c.fd = setOf(f.fd); if (f.under.length) c.under = setOf(f.under); return id; });
    P.deck = p.deck.map(take); R.cards[P.partner].st = p.partner.st; P.pIn = !!p.pIn; P.tr = !!p.tr; R.cards[P.kase].solved = !!p.kase.solved; });
  R.n = snap.n; R.turn = snap.turn; R.first = snap.first; R.fl = { ...snap.fl }; R.phase = snap.phase === 'over' ? 'play' : snap.phase; return R;
}
module.exports = { snapshot, restore, key };
