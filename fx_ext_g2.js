// 묶음 g2 (다단계 이벤트/모달/덱 공개 카드용 공통 프리미티브)
module.exports = function (K, def) {
  const { D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, runOps, lvOf, cleanOps, yn, bus } = K;

  // ifSelf: 이 카드(src)가 filter 에 맞으면 ops, 아니면 else. lki: 현장을 떠난 뒤라면 떠나기 직전의 특징(ptm)으로 판정한다
  def('ifSelf', (o, depth) => ({ op: 'ifSelf', filter: cleanFilter(o.filter), lki: !!o.lki, ops: cleanOps(o.ops, (depth || 0) + 1), else: cleanOps(o.else, (depth || 0) + 1) }), function* (R, s, src, o, ctx, it) {
    const c = R.cards[src]; let hit = false;
    if (c) { const f = rf(R, o.filter, ctx), sv = c.tmod, useL = o.lki && !onField(R, src) && c.ptm !== undefined;
      if (useL) c.tmod = c.ptm || null;
      try { hit = fOk(R, s, src, f, src, true); } finally { if (useL) c.tmod = sv; } }
    if (hit) yield* runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* runOps(R, s, src, o.else, ctx, it); });

  // traitMod: 이 캐릭터는 특징 lose 를 잃고 add 를 가진다(현장을 떠날 때까지 유지 — 턴 종료로 끝나지 않는다)
  def('traitMod', o => ({ op: 'traitMod', lose: (Array.isArray(o.lose) ? o.lose : []).slice(0, 4).map(x => str(x, 30)).filter(Boolean), add: (Array.isArray(o.add) ? o.add : []).slice(0, 4).map(x => str(x, 30)).filter(Boolean) }), function* (R, s, src, o, ctx) {
    const c = R.cards[src]; ctx.done = false; if (!c || !onField(R, src)) return;
    const m = c.tmod || { lose: [], add: [] }; c.tmod = { lose: [...m.lose, ...o.lose], add: [...m.add.filter(x => !o.lose.includes(x)), ...o.add] };
    say(R, `[효과] ${D.cn(R, src)}: 특징 [${o.lose.join(', ')}]을(를) 잃고 [${o.add.join(', ')}]을(를) 가짐`); ctx.done = true; });

  // trigRem: 레지스터(removed)의 리무브 에리어에 있는 카드의 【現場リムーブ時】 능력을 (확인 후) 발동시킨다
  def('trigRem', o => ({ op: 'trigRem', ref: opt(o.ref, ['removed', 'last', 'moved'], 'removed') }), function* (R, s, src, o, ctx, it) {
    ctx.done = false;
    for (const x of regIds(R, ctx, o.ref)) { const c = R.cards[x]; if (!c || !R.P[c.o].rem.includes(x)) continue;
      const abs = K.abList(R, x).filter(a => a.ic === 'onremoved' && K.condOk(R, s, x, a, { by: 'effect' })); if (!abs.length) continue;
      if (!(yield yn(s, `「${D(R, x).n}」의 【現場リムーブ時】 효과를 발동시킬까요?`))) continue;
      say(R, `▶ 효과 발동: ${D.cn(R, x)} (현장 리무브 시)`); const c2 = { done: true, t: { by: 'effect' }, cost: {}, src: x };
      for (const ab of abs) yield* runOps(R, s, x, ab.ops, c2, it); ctx.done = true; } });

  // handToLv: 손패가 n장이 될 때까지 리무브하고, 리무브한 카드의 레벨 합계를 기록한다(ctx.lvSum)
  def('handToLv', o => ({ op: 'handToLv', n: Math.max(0, Math.min(num(o.n, 2), 30)) }), function* (R, s, src, o, ctx) {
    const T = R.P[s]; ctx.done = false; ctx.lvSum = 0; const k = T.hand.length - o.n; if (k <= 0) return;
    const ids = yield pickReq(s, `손패가 ${o.n}장이 되도록 ${k}장 리무브`, T.hand.slice(), k, k);
    for (const x of ids) ctx.lvSum += lvOf(R, x);
    T.hand = T.hand.filter(x => !ids.includes(x)); T.rem.push(...ids); setReg(ctx, 'removed', ids); say(R, `[효과] ${nm(s)} 손패 ${ids.length}장 리무브`);
    ids.forEach(x => bus(R, 'handRem', { s, ent: x, cz: s, by: 'effect' })); ctx.done = true; });

  // selLvSum: 기록한 레벨 합계(ctx.lvSum) 이하가 되도록 캐릭터를 n장까지 선택하여 리무브
  def('selLvSum', o => ({ op: 'selLvSum', n: Math.max(1, Math.min(num(o.n, 2), 10)), filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    const op = cleanOps([{ op: 'select', n: o.n, filter: o.filter, do: 'remove', sumLv: ctx.lvSum | 0 }], 0)[0]; yield* runOps(R, s, src, [op], ctx, it); });

  // deckRemSome: 덱 위 n장을 리무브한다(덱이 n장보다 적으면 있는 만큼). opt: 하기 전에 확인. 리무브한 카드는 레지스터 removed / ctx.remd
  def('deckRemSome', o => ({ op: 'deckRemSome', n: Math.max(1, Math.min(num(o.n, 1), 30)), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    const T = R.P[s]; ctx.done = false; if (!T.deck.length) return;
    if (o.opt && !(yield yn(s, `덱 위 ${Math.min(o.n, T.deck.length)}장을 리무브할까요?`))) return;
    const got = []; for (let i = 0; i < o.n && T.deck.length; i++) { const x = T.deck.pop(); T.rem.push(x); got.push(x); }
    ctx.remd = got; setReg(ctx, 'removed', got); K.chk(R, s); say(R, `[효과] ${nm(s)} 덱 위 ${got.length}장 리무브`); ctx.done = got.length > 0; });
};
