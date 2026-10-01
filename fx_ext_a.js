// 확장 프리미티브 묶음 A (Turn 26): 증거(evidence)·FILE·세트 카드·수사 관련 op
//  - 증거에서 카드를 고를 때 뒷면 증거의 정체는 절대 질의/로그에 내보내지 않는다(옵션 질의 + 무작위).
module.exports = function (K, def) {
  const { A, D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, bus, yn, countOf, runOps, pull, shuf, gain, ally, setCards, unsetOne, moveOut, applyTo, replaceCheck, traitsOf, condOk } = K;
  const R_ = ['self', 'sel', 'played', 'seen', 'hit', 'chosen', 'chosen2', 'rest', 'revealed', 'removed', 'drawn', 'moved', 'last'];
  const regOpt = (x, d) => opt(x, R_, d);
  const side = (s, w) => (w === 'opp' ? 1 - s : s);
  const pickRandom = a => { const c = a.slice(); shuf(c); return c[0]; };

  // 증거 1장 고르기 (공통 target resolver): 앞면/뒷면 모두 "그 증거 자체"를 선택지로 낸다 (무작위 대리 선택 없음).
  //   클라이언트는 evp.pos 의 증거를 강조하고 클릭으로 고른다. 반환: 고른 증거 id / null(고르지 않음·없음). 뒷면 증거의 정체는 내보내지 않는다.
  function* chooseEvid(R, s, t, msg, optional, which) {
    const E = R.P[t].evid, cand = E.filter(x => which !== 'up' || R.cards[x].up); if (!cand.length) return null;
    if (!optional && cand.length === 1) return cand[0];
    const o = K.evOpts(R, t, cand), labels = o.labels.slice(); if (optional) labels.push('선택하지 않음');
    const i = yield { who: s, kind: 'opt', msg, labels, evp: o.evp }; const m = cand[+i]; return m === undefined ? null : m; }

  // ── 증거를 1개까지 골라 (그 증거의 소유자의) 덱 아래로 옮긴다 (리무브가 아니므로 히라메키 없음)
  def('evidToDeck', o => ({ op: 'evidToDeck', who: opt(o.who, ['self', 'opp'], 'opp'), opt: o.opt !== false }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who); ctx.done = false; const id = yield* chooseEvid(R, s, t, '덱 아래로 옮길 증거를 선택', o.opt, 'any'); if (id == null) return;
    const T = R.P[t], c = R.cards[id], wasUp = !!c.up; T.evid = T.evid.filter(x => x !== id); c.up = false; T.deck.unshift(id); setReg(ctx, 'moved', [id]);
    say(R, `[효과] ${nm(t)}의 증거 1장을 덱 아래로` + (wasUp ? ` (${D(R, id).n})` : '')); ctx.done = true; });

  // ── 덱 맨 위 카드를 (표향/뒷면으로) 증거로 얻는다
  def('deckToEvid', o => ({ op: 'deckToEvid', who: opt(o.who, ['self', 'opp'], 'self'), up: !!o.up }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who), E = R.P[t].evid, b = E.length; ctx.done = false; if (R.phase !== 'play') return; gain(R, t, 1);
    if (E.length > b) { const x = E[E.length - 1]; R.cards[x].up = !!o.up; setReg(ctx, 'moved', [x]); say(R, `[효과] ${nm(t)} 덱 위 카드를 ${o.up ? '표향' : '뒷면'}으로 증거 획득` + (o.up ? ` (${D(R, x).n})` : '')); ctx.done = true; } });

  // ── 현장의 캐릭터(레지스터 ref)를 (소유자의) 증거로 표향/뒷면 그대로 얻는다. 현장을 떠나는 처리(대체 효과·MR 의 파트너 에리어 이동)를 따른다
  def('charToEvid', o => ({ op: 'charToEvid', ref: regOpt(o.ref, 'sel'), up: o.up !== false }), function* (R, s, src, o, ctx) {
    ctx.done = false; const got = [];
    for (const id of regIds(R, ctx, o.ref).filter(x => onField(R, x))) { if (!onField(R, id)) continue; const c = R.cards[id], ow = c.o, so = R.cards[src] ? R.cards[src].o : s;
      const rep = yield* replaceCheck(R, id, so, 'effect'); if (rep) { applyTo(R, s, src, id, rep); continue; } if (!onField(R, id)) continue;
      const z = moveOut(R, id, 'rem'); if (z === 'pa') continue;   // MR: 상대 턴에 현장을 떠나면 파트너 에리어로(증거가 되지 않음)
      R.P[ow].rem = R.P[ow].rem.filter(x => x !== id); c.up = !!o.up; R.P[ow].evid.push(id); got.push(id); say(R, `[효과] ${nm(ow)}이(가) ${D(R, id).n}을(를) ${o.up ? '표향' : '뒷면'}으로 증거 획득`); bus(R, 'evgain', { s: ow, by: 'effect' }); }
    if (got.length) setReg(ctx, 'moved', got); ctx.done = got.length > 0; });

  // ── 캐릭터에 세트된 카드를 1장 골라, 그 카드의 소유자가 표향으로 증거로 얻는다
  def('setToEvid', o => ({ op: 'setToEvid' }), function* (R, s, src, o, ctx) {
    ctx.done = false; const holders = [...ally(R, 0), ...ally(R, 1)].filter(h => setCards(R, h, false).length); if (!holders.length) return;
    const h = holders.length === 1 ? holders[0] : (yield pickReq(s, '세트된 카드를 고를 캐릭터를 선택', holders, 1, 1))[0]; if (h == null || !onField(R, h)) return;
    const cs = setCards(R, h, false), hc = R.cards[h], known = x => !(hc.fd || []).includes(x) || hc.o === s, vis = cs.filter(known), hid = cs.filter(x => !known(x)); const labels = [], map = [];
    vis.forEach(x => { labels.push(D(R, x).n + ((hc.fd || []).includes(x) ? ' (뒷면 세트)' : '')); map.push(x); }); if (hid.length) { labels.push(`뒷면 세트 카드 (${hid.length}장 중 무작위 1장)`); map.push(-1); }
    let m; if (map.length === 1) m = map[0]; else m = map[+(yield { who: s, kind: 'opt', msg: '증거로 만들 세트 카드를 선택', labels })]; const x = m === -1 ? pickRandom(hid) : m; if (x == null) return;
    const ow = R.cards[x].o; unsetOne(R, h, x); R.P[ow].rem = R.P[ow].rem.filter(y => y !== x); R.cards[x].up = true; R.P[ow].evid.push(x); setReg(ctx, 'moved', [x]);
    say(R, `[효과] ${D(R, h).n}에 세트된 ${D(R, x).n}을(를) ${nm(ow)}이(가) 표향 증거로 획득`); bus(R, 'evgain', { s: ow, by: 'effect' }); ctx.done = true; });

  // ── 증거를 위에서 n장 본다(본인에게만 보임, 보고 나서 그대로 둠)
  def('peekEvid', o => ({ op: 'peekEvid', who: opt(o.who, ['self', 'opp'], 'self'), n: Math.max(1, Math.min(num(o.n, 1), 10)) }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who), E = R.P[t].evid, ids = E.slice(-o.n).reverse(); ctx.done = false; if (!ids.length) return;
    yield { who: s, kind: 'ack', msg: `${nm(t)}의 증거를 위에서 ${ids.length}장 확인 (확인 후 그대로 둡니다)`, ids, reveal: 0 }; say(R, `[효과] ${nm(s)}이(가) ${nm(t)}의 증거를 위에서 ${ids.length}장 확인`); ctx.done = true; });

  // ── 증거 위에서 n장을 표향으로 한다(이미 표향이면 그대로)
  def('flipTopEvid', o => ({ op: 'flipTopEvid', who: opt(o.who, ['self', 'opp'], 'opp'), n: Math.max(1, Math.min(num(o.n, 1), 10)) }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who), E = R.P[t].evid, ids = E.slice(-o.n); ctx.done = false; if (!ids.length) return; const fl = K.flipEv(R, t, ids.length, ids.filter(x => !R.cards[x].up));
    ctx.flipped = fl; setReg(ctx, 'moved', ids); say(R, `[효과] ${nm(t)}의 증거 위에서 ${ids.length}장을 표향으로: ${ids.map(x => D(R, x).n).join(', ')}`); ctx.done = true; });

  // ── 뒷면 증거를 표향으로(무작위로 n장). any: 0~최대장 중 장수를 직접 정한다. nref: 레지스터의 장수. as: 결과 레지스터(acc 면 이어 붙임)
  def('flipEvid', o => ({ op: 'flipEvid', who: opt(o.who, ['self', 'opp'], 'self'), n: Math.max(1, Math.min(num(o.n, 1), 99)), any: !!o.any, acc: !!o.acc, as: regOpt(o.as, 'chosen2'), nref: o.nref && typeof o.nref === 'object' ? { ref: regOpt(o.nref.ref, 'chosen2') } : null }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who), down = R.P[t].evid.filter(x => !R.cards[x].up); let n = o.nref ? regIds(R, ctx, o.nref.ref).length : o.n; ctx.done = false; const prev = o.acc ? regIds(R, ctx, o.as) : [];
    const mx = Math.min(n, down.length); let k = mx;
    if (o.any && mx > 0) k = +(yield { who: s, kind: 'opt', msg: `${nm(t)}의 뒷면 증거를 표향으로 할 장수 (최대 ${mx}장)`, labels: Array.from({ length: mx + 1 }, (_, j) => `${j}장`) });
    const ids = k > 0 ? K.flipEv(R, t, k) : []; setReg(ctx, o.as, [...prev, ...ids]); if (ids.length) say(R, `[효과] ${nm(t)}의 뒷면 증거 ${ids.length}장을 표향으로: ${ids.map(x => D(R, x).n).join(', ')}`); ctx.done = ids.length > 0; });

  // ── FILE 에리어 위에서 n장 리무브 / 덱 위에서 n장을 뒷면으로 FILE 위에 한 장씩 놓는다
  def('fileRemTop', o => ({ op: 'fileRemTop', who: opt(o.who, ['self', 'opp'], 'self'), n: Math.max(1, Math.min(num(o.n, 1), 10)) }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who), T = R.P[t], got = []; for (let i = 0; i < o.n && T.file.length; i++) { const x = T.file.pop(); R.cards[x].up = false; T.rem.push(x); got.push(x); }
    ctx.done = got.length > 0; setReg(ctx, 'removed', got); if (got.length) say(R, `[효과] ${nm(t)}의 FILE 에리어 위에서 ${got.length}장 리무브: ${got.map(x => D(R, x).n).join(', ')}`); });
  def('deckToFile', o => ({ op: 'deckToFile', who: opt(o.who, ['self', 'opp'], 'self'), n: Math.max(1, Math.min(num(o.n, 1), 10)) }), function* (R, s, src, o, ctx) {
    const t = side(s, o.who); let k = 0; for (let i = 0; i < o.n && R.phase === 'play'; i++) { const x = pull(R, t); if (x == null) break; R.cards[x].up = false; R.P[t].file.push(x); k++; }
    ctx.done = k > 0; if (k) say(R, `[효과] ${nm(t)} 덱 위 ${k}장을 뒷면으로 FILE 에리어 위에 놓음`); });

  // ── 수사(상대 덱 위 n장 발견)에 개수 계산/특징 지정을 더한 판. ncnt: 개수를 세어 n 으로(예: 내 현장의 [警察] 수). trait: 특징을 지정하고 발견된 그 특징의 카드를 레지스터 hit 에
  const SRCS = ['field', 'oppField', 'fieldBoth', 'hand', 'file', 'evid', 'oppEvid', 'rem', 'pa'];
  def('invest2', o => ({ op: 'invest2', n: Math.max(0, Math.min(num(o.n, 1), 30)), trait: !!o.trait, ncnt: o.ncnt && typeof o.ncnt === 'object' ? { src: opt(o.ncnt.src, SRCS, 'field'), f: o.ncnt.f && typeof o.ncnt.f === 'object' ? cleanFilter(o.ncnt.f) : null } : null }), function* (R, s, src, o, ctx, it) {
    const n = o.ncnt ? countOf(R, s, src, o.ncnt, ctx.t || {}) : o.n; let tr = '';
    if (o.trait) { const v = yield { who: s, kind: 'text', msg: '지정할 특징을 입력하세요 (카드에 적힌 특징명 그대로, 예: 警察)', max: 30 }; tr = String(v || '').normalize('NFKC').replace(/[\[\]「」〈〉<>【】\s]/g, ''); say(R, `[효과] 특징 지정: ${tr}`); }
    yield* runOps(R, s, src, [{ op: 'investigate', n }], ctx, it); const seen = ctx.disc || []; setReg(ctx, 'seen', seen);
    if (o.trait) { const hit = seen.filter(x => traitsOf(D(R, x)).includes(tr)); setReg(ctx, 'hit', hit); ctx.found = hit.length; say(R, `[효과] 발견된 [${tr}] 카드: ${hit.length}장`); } });

  // ── 추리 대신 드로우: 내 턴, 내 현장의 LP1 이상 캐릭터가 추리했을 때 (턴당 1회) 카드를 1장 뽑고 이 추리로 증거를 얻지 않는다
  def('reasonDraw', o => ({ op: 'reasonDraw' }), function* (R, s, src, o, ctx) {
    const e = ctx.t && ctx.t.ent; ctx.done = false; if (e == null || !onField(R, e) || A.lpOf(R, e) < 1) return;
    const c = R.cards[src]; c.u = c.u || {}; if (c.u.rsd) return; c.u.rsd = 1;
    if (!(yield yn(s, `${D(R, e).n}의 추리: 카드를 1장 뽑고, 이 추리로 증거를 얻지 않을까요?`))) return;
    const x = pull(R, s); if (x == null) return; R.P[s].hand.push(x); setReg(ctx, 'drawn', [x]); R.fl.nrg = 1; say(R, `[효과] ${nm(s)} 1장 드로우 (이 추리로는 증거를 얻지 않음)`); ctx.done = true; });

  // ── 사건 액션의 히라메키 안에서: 상대는 이 액션으로 증거를 얻을 수 없다
  def('blockActGain', o => ({ op: 'blockActGain' }), function* (R, s, src, o, ctx) { ctx.done = false; if (!R.agp) return; R.agp.block = true; say(R, '[효과] 상대는 이 액션으로 증거를 얻을 수 없음'); ctx.done = true; });

  // ── 코스트(또는 효과)로 표향이 된 【!】히라메키 카드를 1장까지 고르고, 그 효과를 발동시켜도 된다
  def('flashPickOne', o => ({ op: 'flashPickOne', bang: o.bang !== false, filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    const f = rf(R, o.filter, ctx); ctx.done = false;
    const ids = [...((ctx.cost && ctx.cost.flip) || []), ...(ctx.flipped || [])].filter((x, i, a) => a.indexOf(x) === i && R.cards[x] && fOk(R, s, x, f, src, true) && (D(R, x).ab || []).some(a => a.ic === 'flash' && !!a.bang === !!o.bang && condOk(R, s, x, a)));
    if (!ids.length) return; const x = (yield pickReq(s, `표향이 된 ${o.bang ? '【!】' : ''}히라메키 카드를 1장까지 선택 (고르지 않으면 발동하지 않음)`, ids, 0, 1, { reveal: 1 }))[0]; if (x == null || !ids.includes(x)) return;
    if (!(yield yn(s, `「${D(R, x).n}」의 ${o.bang ? '【!】' : ''}히라메키를 발동할까요?`))) return;
    const abs = (D(R, x).ab || []).filter(a => a.ic === 'flash' && !!a.bang === !!o.bang && condOk(R, s, x, a)); say(R, `▶ 히라메키 발동(표향): ${D(R, x).n}`); const c2 = { done: true, t: {}, cost: {}, src: x }; for (const ab of abs) yield* runOps(R, s, x, ab.ops, c2, it); ctx.done = true; });
};
