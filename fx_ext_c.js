// 확장 효과 프리미티브 — 모듈 c (Turn 26): 세트 카드 선택 리무브 / 상대 손패 공개·리무브 / 공개 / 겹침 이동 등
module.exports = function (K, def) {
  const { D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, regIds, setReg, bus, yn, takeOut, unsetOne, setCards, remLeft, applyG, noTarget, chosenCheck, chk, shuf } = K;
  const REGL = ['self', 'sel', 'played', 'seen', 'hit', 'chosen', 'chosen2', 'rest', 'revealed', 'removed', 'drawn', 'moved', 'cost', 'costRev', 'last', 'ent', 'cin'];
  const clampN = (x, d, mx) => Math.max(1, Math.min(num(x, d), mx));

  // ── 홀더(캐릭터)에 세트된 카드 중 1장 고르기. 상대의 뒷면 카드는 구별할 수 없으므로 id 를 질의에 싣지 않는다(정보 비노출)
  function* pickSetCard(R, s, h, cards) {
    if (cards.length === 1) return cards[0];
    const hc = R.cards[h], fdl = hc.fd || [], pubs = cards.filter(x => !fdl.includes(x)), hid = cards.filter(x => fdl.includes(x));
    if (hc.o === s && hid.length === 0 && !fdl.some(x => cards.includes(x))) return (yield pickReq(s, '리무브할 세트 카드를 선택', cards, 1, 1))[0];
    if (hc.o === s) return (yield* K.pickSets(R, s, '리무브할 세트 카드를 선택', cards, 1))[0];   // v1.17.1: 내 뒷면 세트 카드는 위치만 보이는 선택(증거 뒤집기와 동일)
    if (!hid.length) return (yield pickReq(s, '리무브할 세트 카드를 선택', cards, 1, 1))[0];
    if (!pubs.length) return hid[0];
    const i = yield { who: s, kind: 'opt', msg: '리무브할 세트 카드를 선택', labels: [...pubs.map(x => D(R, x).n), '뒷면 카드'] };
    return i < pubs.length ? pubs[i] : hid[0]; }

  // unsetPick: 캐릭터에 세트된 카드(앞면 이벤트·뒷면 카드)를 n장 골라 리무브. scope=세트를 가진 캐릭터의 범위, fd=뒷면 카드만,
  //   upto=0장도 선택 가능(「1枚まで選び、リムーブする」) / opt=먼저 할지 묻고 n장을 전부 리무브(「合わせて2枚リムーブしてもよい」). 전부 리무브했을 때만 성공(done)
  def('unsetPick', o => ({ op: 'unsetPick', scope: opt(o.scope, ['self', 'any', 'opp', 'mine'], 'any'), fd: !!o.fd, n: clampN(o.n, 1, 3), opt: !!o.opt, upto: !!o.upto, filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx) {
    ctx.done = false; const f = rf(R, o.filter, ctx);
    const holders = () => (o.scope === 'self' ? (onField(R, src) ? [src] : []) : o.scope === 'opp' ? R.P[1 - s].field : o.scope === 'mine' ? R.P[s].field : [...R.P[0].field, ...R.P[1].field]).slice();
    const cardsOf = h => setCards(R, h, o.fd).filter(x => fOk(R, s, x, f, src, true));
    if (holders().reduce((t, h) => t + cardsOf(h).length, 0) < o.n) return;
    if (o.opt && !(yield yn(s, `세트된 ${o.fd ? '뒷면 ' : ''}카드를 ${o.n}장 리무브할까요?`))) return;
    const removed = [];
    for (let i = 0; i < o.n; i++) {
      const hs = holders().filter(h => cardsOf(h).length); if (!hs.length) break; let h;
      if (hs.length === 1 && !o.upto) h = hs[0];
      else { const r = (yield pickReq(s, `세트된 ${o.fd ? '뒷면 ' : ''}카드를 리무브할 캐릭터를 ${o.upto ? '최대 ' : ''}1장 선택${o.n > 1 ? ` (${i + 1}/${o.n})` : ''}`, hs, o.upto ? 0 : 1, 1)).filter(x => hs.includes(x)); if (!r.length) break; h = r[0]; }
      const card = yield* pickSetCard(R, s, h, cardsOf(h)); if (card == null) break;
      unsetOne(R, h, card); removed.push(card); say(R, `[효과] ${D.cn(R, h)}에 세트된 카드를 리무브`); }
    if (removed.length) setReg(ctx, 'removed', removed);
    ctx.done = removed.length === o.n; });

  // unsetGrantor: (세트된 이벤트가 부여한 능력 안에서) 이 캐릭터에 세트되어 있는 부여 원본 이벤트를 리무브
  def('unsetGrantor', o => ({ op: 'unsetGrantor', opt: !!o.opt }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const from = it && it.ab && it.ab._from; if (from == null || !R.cards[src] || !(R.cards[src].sets || []).includes(from)) return;
    if (o.opt && !(yield yn(s, `${D(R, src).n}에 세트된 ${D(R, from).n}을(를) 리무브할까요?`))) return;
    unsetOne(R, src, from); ctx.done = true; });

  // rhand: 상대가 손패를 공개한다(내가 본다). 그 중 조건에 맞는 카드를 최대 n장 내가 골라, 상대가 리무브한다(상대의 손패 리무브 = handRem 이벤트, 원인은 나)
  def('rhand', o => ({ op: 'rhand', filter: cleanFilter(o.filter), n: clampN(o.n, 1, 3) }), function* (R, s, src, o, ctx) {
    ctx.done = false; const t = 1 - s, T = R.P[t], f = rf(R, o.filter, ctx), all = T.hand.slice(); if (!all.length) return;
    yield { who: s, kind: 'ack', msg: `${nm(t)}의 손패 ${all.length}장 공개 (확인 후 원래대로)`, ids: all, reveal: 1 }; say(R, `[효과] ${nm(t)} 손패 ${all.length}장 공개: ${D.nms(R, all)}`);
    const cand = all.filter(x => fOk(R, t, x, f, src, true)); if (!cand.length) return;
    const ids = (yield pickReq(s, `공개된 손패에서 상대가 리무브할 카드를 최대 ${o.n}장 선택`, all, 0, Math.min(o.n, cand.length), { sel: cand, reveal: 1 })).filter(x => cand.includes(x)); if (!ids.length) return;
    T.hand = T.hand.filter(x => !ids.includes(x)); T.rem.push(...ids); setReg(ctx, 'removed', ids); say(R, `[효과] ${nm(t)} 손패 ${ids.length}장 리무브: ${ids.map(x => D.cn(R, x)).join(', ')}`);
    ids.forEach(x => bus(R, 'handRem', { s: t, ent: x, cz: s, by: 'effect' })); ctx.done = true; });

  // showReg: 직전에 확인한 카드(레지스터)를 상대에게도 공개한다(상대가 확인). 처리 결과(done)는 바꾸지 않는다
  def('showReg', o => ({ op: 'showReg', ref: opt(o.ref, REGL, 'seen') }), function* (R, s, src, o, ctx) {
    const ids = regIds(R, ctx, o.ref).filter(x => R.cards[x]); if (!ids.length) return;
    yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}이(가) 카드를 공개: ${ids.map(x => D(R, x).n).join(', ')}`, ids, reveal: 1 }; say(R, `[효과] ${nm(s)} 카드 공개: ${ids.map(x => D.cn(R, x)).join(', ')}`); });

  // deckSink: 덱 위에서 확인한 카드(레지스터)를 덱 아래로 보낸다(order=any: 순서 선택). 카드는 덱 안에 있는 채로 이동하므로 리프레시가 일어나지 않는다
  def('deckSink', o => ({ op: 'deckSink', ref: opt(o.ref, REGL, 'rest'), order: opt(o.order, ['asis', 'any'], 'asis') }), function* (R, s, src, o, ctx) {
    const T = R.P[s], ids = regIds(R, ctx, o.ref).filter(x => T.deck.includes(x)); ctx.done = false; if (!ids.length) return;
    let ord = ids; if (o.order === 'any' && ids.length > 1) ord = yield pickReq(s, `${ids.length}장을 덱 아래에 놓을 순서대로 클릭`, ids, ids.length, ids.length, { ordered: true });
    T.deck = T.deck.filter(x => !ids.includes(x)); ord.forEach(x => T.deck.unshift(x)); say(R, `[효과] ${nm(s)} 덱 확인 카드 ${ids.length}장을 덱 아래로`); ctx.done = true; });

  // setFromReg: 덱 위에서 확인한 카드(레지스터)를 뒷면으로 캐릭터에 세트(to=self: 이 캐릭터 / sel: 직전에 선택한 캐릭터)
  def('setFromReg', o => ({ op: 'setFromReg', ref: opt(o.ref, REGL, 'rest'), to: opt(o.to, ['self', 'sel'], 'self') }), function* (R, s, src, o, ctx) {
    ctx.done = false; const ids = regIds(R, ctx, o.ref).filter(x => R.cards[x]); if (!ids.length) return;
    const hid = o.to === 'self' ? src : regIds(R, ctx, 'sel').filter(x => onField(R, x)).pop(); if (hid == null || !onField(R, hid)) return; const h = R.cards[hid]; let k = 0;
    for (const x of ids) { if (R.cards[x].o !== h.o || !R.P[h.o].deck.includes(x)) continue; takeOut(R, x); R.cards[x].up = false; (h.fd = h.fd || []).push(x); R.cards[x].fdOn = hid; k++; bus(R, 'setOn', { s: h.o, ent: x, holder: hid, fd: true }); }
    if (!k) return; chk(R, h.o); say(R, `[효과] 덱에서 확인한 카드 ${k}장을 뒷면으로 ${D.cn(R, hid)}에 세트`); ctx.done = true; });

  // moveUnder: 이 캐릭터 아래에 겹쳐진 카드를 최대 n장 골라, 자신의 현장에 있는 다른 캐릭터 1장(조건 tf) 아래로 옮겨 겹친다
  def('moveUnder', o => ({ op: 'moveUnder', n: clampN(o.n, 2, 5), tf: cleanFilter(o.tf) }), function* (R, s, src, o, ctx) {
    ctx.done = false; const h = R.cards[src]; if (!onField(R, src) || !(h.under || []).length) return;
    const f = rf(R, o.tf, ctx), cand = R.P[s].field.filter(x => x !== src && fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const tid = (yield pickReq(s, '이 캐릭터 아래의 카드를 옮겨 겹칠 캐릭터를 최대 1장 선택', cand, 0, 1)).filter(x => cand.includes(x)); if (!tid.length) return;
    const under = h.under.slice(), ids = (yield pickReq(s, `이 캐릭터 아래에 겹쳐진 카드를 최대 ${o.n}장 선택`, under, 0, Math.min(o.n, under.length), { reveal: 1 })).filter(x => under.includes(x)); if (!ids.length) return;
    if (!onField(R, tid[0]) || !onField(R, src)) return; h.under = h.under.filter(x => !ids.includes(x)); const tc = R.cards[tid[0]]; (tc.under = tc.under || []).push(...ids);
    setReg(ctx, 'moved', ids); say(R, `[효과] ${D.cn(R, src)} 아래의 카드 ${ids.length}장을 ${D.cn(R, tid[0])} 아래로 옮김`); ctx.done = true; });

  // bottomSame (카드 전용: 工藤新一 id_0735): 상대 현장의 캐릭터 1장(조건)과 상대 리무브 에리어의 같은 카드 이름 캐릭터 1장을 골라, 상대가 순서를 정해 덱 아래로 옮긴다
  def('bottomSame', o => ({ op: 'bottomSame', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const t = 1 - s, T = R.P[t], f = rf(R, o.filter, ctx);
    const cand = T.field.filter(x => fOk(R, s, x, f, src) && !noTarget(R, x, src)); let ch = [];
    if (cand.length) { ch = (yield pickReq(s, '덱 아래로 보낼 상대 캐릭터를 최대 1장 선택', cand, 0, 1)).filter(x => cand.includes(x)); if (ch.length) ch = yield* chosenCheck(R, s, src, ch, it); }
    let rm = []; if (ch.length) { const nmx = D(R, ch[0]).n, rc = T.rem.filter(x => D(R, x).type === 'char' && D(R, x).n === nmx);
      if (rc.length) rm = (yield pickReq(s, `상대의 리무브 에리어에서 같은 카드 이름 「${nmx}」 캐릭터를 최대 1장 선택`, rc, 0, 1, { reveal: 1 })).filter(x => rc.includes(x)); }
    let list = [...ch, ...rm]; if (!list.length) return;
    if (list.length > 1) list = yield pickReq(t, `${list.length}장을 덱 아래에 놓을 순서대로 클릭`, list, list.length, list.length, { ordered: true, reveal: 1 });
    const moved = []; for (const x of list) { if (R.P[t].field.includes(x)) { yield* applyG(R, s, src, x, 'deckBottom'); if (!R.P[t].field.includes(x)) moved.push(x); }
      else if (T.rem.includes(x)) { T.rem = T.rem.filter(y => y !== x); T.deck.unshift(x); remLeft(R, t, [x]); moved.push(x); } }
    if (!moved.length) return; setReg(ctx, 'moved', moved); say(R, `[효과] ${nm(t)}의 카드 ${moved.length}장을 덱 아래로: ${moved.map(x => D.cn(R, x)).join(', ')}`); ctx.done = true; });
};
