// 묶음 ct11 (CT-P11 공개분): 공통 코스트/프리미티브 — 카드 ID 를 직접 보지 않는 일반 구현
//  - stunAny(cost)   : 현장의 (액티브 또는 슬립 상태) 캐릭터를 n장 스턴시킨다. 코스트로 스턴시킨 캐릭터는 ctx.cost.slept / .lv / .ap 에 남아 이후 효과(「…のAP以下」「…のレベル以下」「…に与える」)가 참조한다
//  - swapRem         : 변장으로 교체되어 덱 아래로 간 이 카드를 (확인 후) 덱 아래로 가는 대신 리무브 에리어로 옮긴다 (「デッキの下に移す代わりにリムーブしてもよい」)
//  - ptnActive   : 파트너를 액티브로 한다(who). 어시스트(FILE)에 가 있으면 파트너 에리어로 돌려놓고 액티브로 한다
//  - setEvToPa       : (세트된 이벤트가 준 능력 안에서) 이 이벤트를 파트너 에리어로 옮긴다(확인 후)
module.exports = function (K, def) {
  const { A, D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, bus, yn, defCost } = K;
  const stunPool = (R, s, src, k) => (k.sc === 'self' ? R.P[s].field : [...R.P[0].field, ...R.P[1].field]).filter(x => (k.st === 'a' ? ['a'] : ['a', 's']).includes(R.cards[x].st || 'a') && ((k.orSelf && x === src) || fOk(R, s, x, k.filter, src, true)));
  defCost('stunAny', k => ({ sc: opt(k.sc, ['self', 'any'], 'any'), st: opt(k.st, ['a', 'as'], 'as'), orSelf: !!k.orSelf }),
    (R, s, src, k) => stunPool(R, s, src, k).length < k.n ? '코스트로 스턴시킬 캐릭터가 부족합니다' : '',
    function* (R, s, src, k, ctx) {
      const co = ctx.cost = ctx.cost || {}, cand = stunPool(R, s, src, k);
      const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 스턴시킬 캐릭터 ${k.n}장`, cand, k.n, k.n);
      ids.forEach(x => { const was = R.cards[x].st || 'a'; R.cards[x].st = 'x'; if (was === 'a') bus(R, 'sleepEv', { s, ent: x, by: 'cost' }); });
      co.slept = (co.slept || []).concat(ids); co.lv = ids.length ? (K.lvOf(R, ids[0]) || 0) : co.lv; co.ap = ids.length ? A.ap(R, ids[0]) : co.ap;
      say(R, `코스트: ${ids.map(x => D.cn(R, x)).join(', ')} 스턴`); });

  def('swapRem', o => ({ op: 'swapRem' }), function* (R, s, src, o, ctx) {
    ctx.done = false; const P = R.P[s]; if (!P.deck.includes(src)) return;
    if (!(yield yn(s, `「${D(R, src).n}」을(를) 덱 아래로 보내는 대신 리무브할까요?`))) return;
    if (!P.deck.includes(src)) return; P.deck = P.deck.filter(x => x !== src); P.rem.push(src); say(R, `[효과] ${D.cn(R, src)}: 덱 아래로 가는 대신 리무브`); ctx.done = true; });

  def('ptnActive', o => ({ op: 'ptnActive', who: opt(o.who, ['self', 'opp'], 'self') }), function* (R, s, src, o, ctx) {
    ctx.done = false; const t = o.who === 'opp' ? 1 - s : s, P = R.P[t], pc = P.partner != null ? R.cards[P.partner] : null; if (!pc) return;
    if (P.pIn) { P.pIn = false; say(R, `[효과] ${nm(t)}의 파트너를 파트너 에리어로 되돌림`); }
    pc.st = 'a'; say(R, `[효과] ${nm(t)}의 파트너를 액티브로`); ctx.done = true; });

  def('setEvToPa', o => ({ op: 'setEvToPa', opt: !!o.opt }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const ev = it && it.ab ? it.ab._from : null, h = ev != null ? R.cards[ev] : null; if (!h || h.setOn == null) return;
    const holder = h.setOn; if (!(R.cards[holder] && (R.cards[holder].sets || []).includes(ev))) return;
    if (o.opt && !(yield yn(s, `「${D(R, ev).n}」을(를) 파트너 에리어로 옮길까요?`))) return;
    R.cards[holder].sets = R.cards[holder].sets.filter(x => x !== ev); h.setOn = null; R.P[R.cards[ev].o].pa.push(ev); say(R, `[효과] ${D.cn(R, ev)}을(를) 파트너 에리어로 이동`); ctx.done = true; });
  // playMix: 레지스터(리무브 에리어)의 캐릭터 중 awake 장은 통상 상태로, asleep 장은 슬립 상태로 등장시키고, 나머지는 손패에 더한다 (「1枚まで登場させ、1枚までスリープ状態で登場させ、残りを手札に加える」)
  def('playMix', o => ({ op: 'playMix', ref: str(o.ref, 12) || 'chosen', awake: Math.max(0, Math.min(num(o.awake, 1), 5)), asleep: Math.max(0, Math.min(num(o.asleep, 1), 5)) }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false; let ids = regIds(R, ctx, o.ref).filter(x => P.rem.includes(x) && D(R, x).type === 'char'); if (!ids.length) return;
    let aw = [], sl = [];
    if (o.awake > 0 && ids.length) { aw = (yield pickReq(s, `통상 상태로 등장시킬 캐릭터를 최대 ${o.awake}장 선택`, ids, 0, Math.min(o.awake, ids.length), { reveal: 1 })).filter(x => ids.includes(x)); }
    const rest1 = ids.filter(x => !aw.includes(x));
    if (o.asleep > 0 && rest1.length) { sl = (yield pickReq(s, `슬립 상태로 등장시킬 캐릭터를 최대 ${o.asleep}장 선택 (나머지는 손패)`, rest1, 0, Math.min(o.asleep, rest1.length), { reveal: 1 })).filter(x => rest1.includes(x)); }
    const toHand = ids.filter(x => !aw.includes(x) && !sl.includes(x));
    P.rem = P.rem.filter(x => !ids.includes(x)); K.remLeft(R, s, ids); ctx.played = []; setReg(ctx, 'played', []);
    if (aw.length) yield* K.placeCards(R, s, src, aw, false, ctx);
    if (sl.length) yield* K.placeCards(R, s, src, sl, true, ctx);
    const failed = [...aw, ...sl].filter(x => !onField(R, x));   // 현장이 가득 차는 등으로 등장하지 못한 카드는 리무브 에리어에 되돌린다
    failed.forEach(x => P.rem.push(x));
    toHand.forEach(x => P.hand.push(x)); if (toHand.length) say(R, `[효과] ${toHand.map(x => D.cn(R, x)).join(', ')}을(를) 손패에 추가`);
    ctx.done = [...aw, ...sl].some(x => onField(R, x)) || toHand.length > 0; });

  // ifIdDiff: 레지스터 a 의 카드와 b 의 카드의 ID(카드 번호: 같은 카드 종류 = 같은 ID)가 서로 다르면 ops, 아니면 else (「選んだキャラとIDの異なるカードを…した場合」)
  def('ifIdDiff', (o, depth) => ({ op: 'ifIdDiff', a: str(o.a, 12) || 'sel', b: str(o.b, 12) || 'removed', ops: K.cleanOps(o.ops, (depth || 0) + 1), else: K.cleanOps(o.else, (depth || 0) + 1) }), function* (R, s, src, o, ctx, it) {
    const A1 = regIds(R, ctx, o.a), B1 = regIds(R, ctx, o.b), key = x => (R.cards[x] && R.cards[x].d != null ? R.cards[x].d : D(R, x).id || D(R, x).n);
    const hit = A1.length > 0 && B1.length > 0 && key(A1[0]) !== key(B1[0]);
    if (hit) yield* K.runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* K.runOps(R, s, src, o.else, ctx, it); });
  // winGame: 이 효과를 처리한 플레이어가 게임에 승리한다 (「ゲームに勝利する」)
  def('winGame', o => ({ op: 'winGame' }), function* (R, s, src, o, ctx) {
    ctx.done = true; if (A.win) A.win(R, s, `${nm(s)}은(는) 카드 효과로 게임에 승리`); });
};
