// 묶음 E 전용/공통 op (Turn 26)
module.exports = function (K, def) {
  const { D, say, nm, fOk, rf, pickReq, onField, cleanFilter, opt, str, setReg, regIds, placeCards } = K;
  // playSplit: 레지스터의 카드(리무브 에리어) 중 1장은 통상 상태로, 나머지는 슬리프 상태로 등장시킨다
  def('playSplit', o => ({ op: 'playSplit', ref: str(o.ref, 12) || 'chosen' }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false;
    const ids = regIds(R, ctx, o.ref).filter(x => P.rem.includes(x) && D(R, x).type === 'char' && !K.nameBanned(R, s, x)); if (!ids.length) return;
    let awake = ids[0]; if (ids.length > 1) awake = (yield pickReq(s, '슬리프가 아닌 통상 상태로 등장시킬 캐릭터 1장을 선택 (나머지는 슬리프 상태로 등장)', ids, 1, 1, { reveal: 1 }))[0];
    P.rem = P.rem.filter(x => !ids.includes(x)); K.remLeft(R, s, ids); ctx.played = []; setReg(ctx, 'played', []);
    yield* placeCards(R, s, src, [awake], false, ctx); yield* placeCards(R, s, src, ids.filter(x => x !== awake), true, ctx);
    ctx.done = ids.some(x => onField(R, x)); });
  // ifCost: 코스트로 처리된 카드(slept=슬립시킨 캐릭터 / rem / disc / rev) 중 조건에 맞는 것이 있으면 ops 를 처리한다
  def('ifCost', o => ({ op: 'ifCost', k: opt(o.k, ['slept', 'rem', 'disc', 'rev'], 'slept'), filter: cleanFilter(o.filter), ops: K.cleanOps(o.ops, 1), else: K.cleanOps(o.else, 1) }), function* (R, s, src, o, ctx, it) {
    const ids = ((ctx.cost || {})[o.k] || []), f = rf(R, o.filter, ctx); const hit = ids.some(x => R.cards[x] && fOk(R, s, x, f, src, true));
    if (hit) yield* K.runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* K.runOps(R, s, src, o.else, ctx, it); });
  // selAdv: 캐릭터 1장을 선택 — 슬리프 상태면 스턴, 액티브 상태면 슬리프 (스턴 상태는 변화 없음)
  def('selAdv', o => ({ op: 'selAdv', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const f = rf(R, o.filter, ctx), cand = [...R.P[0].field, ...R.P[1].field].filter(x => fOk(R, s, x, f, src) && !(R.cards[x].o !== s && K.noTarget(R, x, src))); if (!cand.length) return;
    let ids = (yield pickReq(s, '대상 캐릭터를 최대 1장 선택 (슬리프 → 스턴 / 액티브 → 슬리프)', cand, 0, 1)).filter(x => cand.includes(x)); if (!ids.length) return;
    ids = yield* K.chosenCheck(R, s, src, ids, it); if (!ids.length) return; const id = ids[0], st = R.cards[id].st || 'a'; setReg(ctx, 'sel', [id]);
    if (st === 's') yield* K.applyG(R, s, src, id, 'stun'); else if (st === 'a') yield* K.applyG(R, s, src, id, 'sleep');
    say(R, `[효과] ${D(R, id).n}: ${st === 's' ? '스턴' : st === 'a' ? '슬리프' : '변화 없음'}`); ctx.done = true; });
  // blankAb: 캐릭터 1장을 선택하여 턴 종료 시까지 원래의 능력(키워드 포함)을 무효로 한다
  def('blankAb', o => ({ op: 'blankAb', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const f = rf(R, o.filter, ctx), cand = [...R.P[0].field, ...R.P[1].field].filter(x => fOk(R, s, x, f, src) && !(R.cards[x].o !== s && K.noTarget(R, x, src))); if (!cand.length) return;
    let ids = (yield pickReq(s, '원래 능력을 무효로 할 캐릭터를 최대 1장 선택', cand, 0, 1)).filter(x => cand.includes(x)); if (!ids.length) return;
    ids = yield* K.chosenCheck(R, s, src, ids, it); if (!ids.length) return; const id = ids[0]; R.cards[id].blank = 1; setReg(ctx, 'sel', [id]);
    say(R, `[효과] ${D(R, id).n}: 턴 종료 시까지 원래의 능력을 잃음`); ctx.done = true; });
};
