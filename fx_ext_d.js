// 확장 모듈 d (Turn 26): 뒷면 세트 카드 / 겹침 / 손패 공개 코스트 / 덱 공개 탐색 계열 프리미티브
module.exports = function (K, def) {
  const { A, D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, bus, yn, defCost, shuf, chk, lvOf, placeCards, remLeft, takeOut, leave, unsetOne, applyG, ally, noTarget, chosenCheck, cleanAb } = K;

  // ───────── 공통: 뒷면(fd)으로 세트된 카드를 가진 캐릭터(holder) 풀 ─────────
  const fdHolders = (R, s, src, scope, hf, ctx) => { const f = rf(R, hf, ctx || {});
    const hs = scope === 'opp' ? R.P[1 - s].field : scope === 'any' ? [...R.P[0].field, ...R.P[1].field] : R.P[s].field;
    return hs.filter(h => (R.cards[h].fd || []).length && fOk(R, s, h, f, src, true)); };
  const fdTotal = (R, hs) => hs.reduce((t, h) => t + (R.cards[h].fd || []).length, 0);
  // n장 리무브(캐릭터를 고르고 그 캐릭터의 뒷면 카드 1장). 뒷면 카드의 정체는 질의에 싣지 않는다(상대 카드는 정체를 알 수 없으므로 앞에서부터).
  function* fdRemove(R, s, src, scope, hf, n, ctx) { const got = [];
    for (let i = 0; i < n; i++) { const hs = fdHolders(R, s, src, scope, hf, ctx); if (!hs.length) break;
      const h = hs.length === 1 ? hs[0] : (yield pickReq(s, `뒷면으로 세트된 카드를 리무브할 캐릭터를 선택 (${i + 1}/${n})`, hs, 1, 1))[0];
      if (h == null || !hs.includes(h)) break; const fds = R.cards[h].fd || [];
      const x = R.cards[h].o === s && fds.length > 1 ? (yield* K.pickSets(R, s, '리무브할 뒷면 카드를 선택', fds.slice(), 1))[0] : fds[0];
      unsetOne(R, h, x); got.push(x); }
    if (got.length) say(R, `[효과] 뒷면 세트 카드 ${got.length}장을 리무브`); return got; }

  // unsetFd: 현장 캐릭터에 뒷면으로 세트된 카드를 합쳐서 n장 리무브(scope: mine/opp/any, hf: 세트된 캐릭터 조건). 모자라면 처리하지 않음
  def('unsetFd', o => ({ op: 'unsetFd', n: Math.max(1, Math.min(num(o.n, 1), 5)), scope: opt(o.scope, ['mine', 'opp', 'any'], 'mine'), hf: cleanFilter(o.hf), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    ctx.done = false; if (fdTotal(R, fdHolders(R, s, src, o.scope, o.hf, ctx)) < o.n) return;
    if (o.opt && !(yield yn(s, `뒷면으로 세트된 카드를 ${o.n}장 리무브할까요?`))) return;
    const got = yield* fdRemove(R, s, src, o.scope, o.hf, o.n, ctx); setReg(ctx, 'removed', got); ctx.done = got.length >= o.n; });
  // 코스트판: 뒷면으로 세트된 카드를 n장 리무브한다
  defCost('fdUnset', k => ({ scope: opt(k.scope, ['mine', 'opp', 'any'], 'mine'), hf: cleanFilter(k.hf) }), (R, s, src, k) => fdTotal(R, fdHolders(R, s, src, k.scope, k.hf)) < k.n ? '리무브할 뒷면 세트 카드가 부족합니다' : '', function* (R, s, src, k, ctx) {
    const got = yield* fdRemove(R, s, src, k.scope, k.hf, k.n, ctx); const co = ctx.cost = ctx.cost || {}; co.rem = (co.rem || []).concat(got); });

  // remToDeck: 리무브 에리어의 모든 카드를 덱 아래로 옮기고 덱을 섞는다(who: both/self/opp)
  def('remToDeck', o => ({ op: 'remToDeck', who: opt(o.who, ['both', 'self', 'opp'], 'both'), shuffle: o.shuffle !== false }), function* (R, s, src, o, ctx) {
    const ts = o.who === 'both' ? [s, 1 - s] : o.who === 'opp' ? [1 - s] : [s]; let k = 0;
    for (const t of ts) { const T = R.P[t], ids = T.rem.slice(); T.rem = []; ids.forEach(x => T.deck.unshift(x)); k += ids.length; if (ids.length) remLeft(R, t, ids); if (o.shuffle) shuf(T.deck); }
    say(R, `[효과] 리무브 에리어의 카드 ${k}장을 덱 아래로 옮기고 덱을 섞음`); ctx.done = true; });

  // setFd: 자신의 리무브 에리어/손패의 카드(filter) 1장을 뒷면으로 캐릭터(to: self=이 캐릭터 / pick=hf 에 맞는 내 캐릭터)에 세트
  def('setFd', o => ({ op: 'setFd', from: opt(o.from, ['rem', 'hand'], 'rem'), filter: cleanFilter(o.filter), to: opt(o.to, ['self', 'pick'], 'self'), hf: cleanFilter(o.hf) }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false; const f = rf(R, o.filter, ctx);
    const hs = o.to === 'self' ? (onField(R, src) ? [src] : []) : P.field.filter(h => fOk(R, s, h, rf(R, o.hf, ctx), src, true)); if (!hs.length) return;
    const cand = P[o.from].filter(x => fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const ids = (yield pickReq(s, `${o.from === 'rem' ? '리무브 에리어' : '손패'}에서 뒷면으로 세트할 카드를 최대 1장 선택`, cand, 0, 1, { reveal: o.from === 'rem' ? 1 : 0 })).filter(x => cand.includes(x)); if (!ids.length) return;
    const h = hs.length === 1 ? hs[0] : (yield pickReq(s, '뒷면으로 세트할 캐릭터를 선택', hs, 1, 1))[0]; if (h == null || !onField(R, h)) return;
    const x = ids[0], z = takeOut(R, x); if (z === 'rem') remLeft(R, s, [x]); R.cards[x].up = false; (R.cards[h].fd = R.cards[h].fd || []).push(x); R.cards[x].fdOn = h;
    say(R, `[효과] ${nm(s)}이(가) 카드 1장을 뒷면으로 ${D.cn(R, h)}에 세트`); bus(R, 'setOn', { s: R.cards[h].o, ent: x, holder: h, fd: true }); setReg(ctx, 'moved', [x]); ctx.done = true; });

  // setFrom: 손패/리무브 에리어의 이벤트(filter) 1장을 앞면으로 내 캐릭터(hf)에 세트(이벤트 사용이 아님: 코스트·사용 조건 없음)
  def('setFrom', o => ({ op: 'setFrom', from: opt(o.from, ['hand', 'rem', 'handrem'], 'handrem'), filter: cleanFilter(o.filter), hf: cleanFilter(o.hf) }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false; const f = rf(R, o.filter, ctx), hs = P.field.filter(h => fOk(R, s, h, rf(R, o.hf, ctx), src, true)); if (!hs.length) return;
    const cand = [...(o.from === 'rem' ? [] : P.hand), ...(o.from === 'hand' ? [] : P.rem)].filter(x => D(R, x).type === 'event' && fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const ids = (yield pickReq(s, '캐릭터에 세트할 이벤트를 최대 1장 선택', cand, 0, 1, { reveal: 1 })).filter(x => cand.includes(x)); if (!ids.length) return;
    const h = hs.length === 1 ? hs[0] : (yield pickReq(s, '이벤트를 세트할 내 캐릭터를 선택', hs, 1, 1))[0]; if (h == null || !onField(R, h)) return;
    const x = ids[0], z = takeOut(R, x); if (z === 'rem') remLeft(R, s, [x]); R.cards[x].up = false; (R.cards[h].sets = R.cards[h].sets || []).push(x); R.cards[x].setOn = h;
    say(R, `[효과] ${D.cn(R, x)}을(를) ${D.cn(R, h)}에 세트`); bus(R, 'setOn', { s: R.cards[h].o, ent: x, holder: h }); setReg(ctx, 'moved', [x]); ctx.done = true; });

  // stackFrom: 리무브 에리어(손패)의 카드(filter) 1장을 내 현장 캐릭터(hf) 아래에 겹친다. 겹친 캐릭터는 레지스터 sel
  def('stackFrom', o => ({ op: 'stackFrom', from: opt(o.from, ['rem', 'hand'], 'rem'), filter: cleanFilter(o.filter), hf: cleanFilter(o.hf) }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false; const f = rf(R, o.filter, ctx), hs = P.field.filter(h => fOk(R, s, h, rf(R, o.hf, ctx), src, true)); if (!hs.length) return;
    const cand = P[o.from].filter(x => fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const ids = (yield pickReq(s, `${o.from === 'rem' ? '리무브 에리어' : '손패'}에서 캐릭터 아래에 겹칠 카드를 최대 1장 선택`, cand, 0, 1, { reveal: o.from === 'rem' ? 1 : 0 })).filter(x => cand.includes(x)); if (!ids.length) return;
    const h = hs.length === 1 ? hs[0] : (yield pickReq(s, '카드를 아래에 겹칠 내 캐릭터를 선택', hs, 1, 1))[0]; if (h == null || !onField(R, h)) return;
    const x = ids[0], z = takeOut(R, x); if (z === 'rem') remLeft(R, s, [x]); (R.cards[h].under = R.cards[h].under || []).push(x);
    say(R, `[효과] ${D.cn(R, x)}을(를) ${D.cn(R, h)} 아래에 겹침`); setReg(ctx, 'sel', [h]); setReg(ctx, 'moved', [x]); ctx.done = true; });
  // 코스트판: 현장(양쪽)의 캐릭터(filter) n장을 이 캐릭터 아래에 겹친다
  const stackPool = (R, s, src, k) => [...ally(R, 0), ...ally(R, 1)].filter(x => x !== src && fOk(R, s, x, k.filter, src, true));
  defCost('stackFld', () => ({}), (R, s, src, k) => !onField(R, src) ? '현장의 캐릭터만 사용할 수 있습니다' : stackPool(R, s, src, k).length < k.n ? '겹칠 캐릭터가 부족합니다' : '', function* (R, s, src, k, ctx) {
    const cand = stackPool(R, s, src, k), ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 이 캐릭터 아래에 겹칠 캐릭터 ${k.n}장 선택`, cand, k.n, k.n);
    const h = R.cards[src]; for (const x of ids) { leave(R, x); (h.under = h.under || []).push(x); } const co = ctx.cost = ctx.cost || {}; co.stk = (co.stk || []).concat(ids); say(R, `코스트: ${ids.map(x => D.cn(R, x)).join(', ')}을(를) ${D.cn(R, src)} 아래에 겹침`); });

  // revealVar 코스트: 손패의 카드(filter)를 원하는 만큼(0장 이상) 공개한다. 공개한 카드는 ctx.cost.rev 에 남는다
  defCost('revealVar', () => ({}), () => '', function* (R, s, src, k, ctx) { const P = R.P[s], co = ctx.cost = ctx.cost || {}, cand = P.hand.filter(x => fOk(R, s, x, k.filter, src, true));
    const ids = cand.length ? (yield pickReq(s, '코스트: 공개할 손패를 원하는 만큼 선택 (0장도 가능)', cand, 0, cand.length)).filter(x => cand.includes(x)) : [];
    co.rev = (co.rev || []).concat(ids); co.nRev = ids.length; if (!ids.length) { say(R, '코스트: 손패를 공개하지 않음'); return; }
    yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}이(가) 손패를 공개: ${ids.map(x => D(R, x).n).join(', ')}`, ids, reveal: 1, hby: 'cost' }; say(R, `코스트: 손패 ${ids.length}장 공개`); });

  // lvBudgetRm: (이 능력의 코스트로 공개한 손패 수 + 내 현장의 hf 캐릭터 수) 이하 레벨의 캐릭터를 1장까지 선택하여 리무브
  def('lvBudgetRm', o => ({ op: 'lvBudgetRm', hf: cleanFilter(o.hf), rev: o.rev !== false }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; const hf = rf(R, o.hf, ctx), lim = (o.rev ? ((ctx.cost && ctx.cost.rev) || []).length : 0) + R.P[s].field.filter(h => fOk(R, s, h, hf, src, true)).length;
    const cand = [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, { lvMax: lim }, src) && !(R.cards[x].o !== s && noTarget(R, x, src))); if (!cand.length) return;
    let ids = (yield pickReq(s, `레벨 ${lim} 이하의 캐릭터를 최대 1장 선택하여 리무브`, cand, 0, 1)).filter(x => cand.includes(x)); if (!ids.length) return;
    ids = yield* chosenCheck(R, s, src, ids, it); if (!ids.length) return; setReg(ctx, 'sel', ids); for (const id of ids) yield* applyG(R, s, src, id, 'remove'); ctx.done = true; });

  // dig: 덱(deck: self/opp)의 위에서부터 조건에 맞는 캐릭터가 나올 때까지 1장씩 공개(최대 cap장).
  //  조건: type + (byName: ref 레지스터 첫 카드와 같은 카드명) + (byLv: 같은 레벨). hit: 찾은 카드를 play/rem/hand. rest: 나머지 공개한 카드를 rem/bottom(+shuffle). g: play 한 캐릭터에 턴 종료 시까지 주는 능력
  def('dig', o => ({ op: 'dig', deck: opt(o.deck, ['self', 'opp'], 'self'), ref: opt(o.ref, ['sel', 'chosen', 'removed', 'moved', 'last', 'ent'], 'sel'), byName: !!o.byName, byLv: !!o.byLv, type: opt(o.type, ['char', 'event', ''], 'char'),
      cap: Math.max(1, Math.min(num(o.cap, 60), 60)), hit: opt(o.hit, ['play', 'rem', 'hand'], 'rem'), rest: opt(o.rest, ['rem', 'bottom'], 'rem'), shuffle: !!o.shuffle, g: o.g && typeof o.g === 'object' ? (cleanAb([o.g])[0] || null) : null }), function* (R, s, src, o, ctx) {
    const dt = o.deck === 'opp' ? 1 - s : s, T = R.P[dt]; ctx.done = false; const ref = regIds(R, ctx, o.ref)[0]; if (ref == null || !R.cards[ref]) return;
    const rn = D(R, ref).n, rl = lvOf(R, ref), seen = []; let hit = null;
    for (let k = 0; k < Math.min(o.cap, T.deck.length); k++) { const x = T.deck[T.deck.length - 1 - k]; seen.push(x); const d = D(R, x);
      if ((!o.type || d.type === o.type) && (!o.byName || d.n === rn) && (!o.byLv || lvOf(R, x) === rl)) { hit = x; break; } }
    ctx.found = hit != null ? 1 : 0; setReg(ctx, 'seen', seen); setReg(ctx, 'hit', hit != null ? [hit] : []);
    say(R, `[효과] ${nm(dt)}의 덱 위 ${seen.length}장 공개` + (hit != null ? ` → 「${D.cn(R, hit)}」 발견` : ' (해당 카드 없음)'));
    if (seen.length) { const msg = `${nm(dt)}의 덱 위 ${seen.length}장 공개` + (hit != null ? ` — 「${D(R, hit).n}」 발견` : ' — 해당하는 카드 없음');
      yield { who: s, kind: 'ack', msg, ids: seen, reveal: 1 }; yield { who: 1 - s, kind: 'ack', msg, ids: seen, reveal: 1 }; }
    T.deck = T.deck.filter(x => !seen.includes(x)); let rest = seen.filter(x => x !== hit);
    if (hit != null) { if (o.hit === 'rem') T.rem.push(hit); else if (o.hit === 'hand') T.hand.push(hit); }
    if (hit != null && o.hit === 'play') { if (dt !== s) T.rem.push(hit); else { yield* placeCards(R, s, src, [hit], false, ctx); if (onField(R, hit) && o.g) (R.cards[hit].tab = R.cards[hit].tab || []).push({ ...o.g, _from: src }); } }
    if (o.rest === 'rem') T.rem.push(...rest); else rest.forEach(x => T.deck.unshift(x));
    if (o.shuffle) shuf(T.deck); chk(R, dt); ctx.done = hit != null; });

  // rename: 선택한(레지스터 sel) 내 캐릭터의 카드명을 (코스트로 공개한 카드/레지스터 from 의 첫 카드) 카드명으로 턴 종료 시까지 바꿔 쓴다
  def('rename', o => ({ op: 'rename', from: opt(o.from, ['costRev', 'chosen', 'sel', 'moved', 'last'], 'costRev'), ref: opt(o.ref, ['sel', 'chosen', 'last'], 'sel') }), function* (R, s, src, o, ctx) {
    ctx.done = false; const h = regIds(R, ctx, o.ref).find(x => onField(R, x)), c = regIds(R, ctx, o.from)[0]; if (h == null || c == null) return; const name = D(R, c).n;
    (R.cards[h].tab = R.cards[h].tab || []).push({ ic: 'static', cond: {}, tgt: { sel: 'self' }, nm: name, txt: `카드명 [${name}]` }); R._nmD = true;
    say(R, `[효과] ${D.cn(R, h)}의 카드명이 턴 종료 시까지 [${name}](으)로 취급됨`); ctx.done = true; });

  // fdTo: 이 캐릭터에 뒷면으로 세트된 카드 1장을 손패에 가져온다
  def('fdTo', o => ({ op: 'fdTo', to: 'hand' }), function* (R, s, src, o, ctx) {
    ctx.done = false; const h = R.cards[src]; if (!onField(R, src) || !(h.fd || []).length) return;
    const x = h.fd.length === 1 ? h.fd[0] : (yield* K.pickSets(R, s, '손패에 넣을 뒷면 카드를 선택', h.fd.slice(), 1))[0]; if (x == null || !h.fd.includes(x)) return;
    h.fd = h.fd.filter(y => y !== x); R.cards[x].fdOn = null; R.P[R.cards[x].o].hand.push(x); setReg(ctx, 'moved', [x]); say(R, `[효과] ${D.cn(R, src)}에 세트된 뒷면 카드 1장을 손패에`); ctx.done = true; });
};
