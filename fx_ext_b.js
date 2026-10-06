// 확장 효과 프리미티브 (모듈 b): 공개한 카드 등장·반복 코스트·카드명 바꿔쓰기·FILE 지정 리무브·파트너 에리어 리무브·증거 일괄 표향 등
module.exports = function (K, def) {
  const { A, D, say, nm, fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, bus, yn, defCost } = K;
  // 효과로 바뀐 현재 카드명(ターン終了時までカード名を書き換える: R.fl.nmx[id])
  const effN = (R, id) => (R.fl && R.fl.nmx && R.fl.nmx[id] != null && onField(R, id)) ? R.fl.nmx[id] : D(R, id).n;

  // ── 코스트 ──
  // sleepPartner: 자신의 파트너를 슬립시킨다(액티브일 때만)
  defCost('sleepPartner', k => ({}), (R, s) => { const pc = R.cards[R.P[s].partner]; return pc && (pc.st || 'a') === 'a' ? '' : '파트너가 액티브가 아닙니다'; }, function* (R, s) {
    R.cards[R.P[s].partner].st = 's'; say(R, `코스트: ${nm(s)}의 파트너를 슬립`); });
  // deckAll: 자신의 덱의 카드를 모두 리무브(덱이 0장이 되므로 리프레시가 일어난다)
  defCost('deckAll', k => ({}), (R, s) => R.P[s].deck.length ? '' : '리무브할 덱의 카드가 없습니다', function* (R, s, src, k, ctx) {
    const P = R.P[s], co = ctx.cost = ctx.cost || {}, got = []; while (P.deck.length) { const x = P.deck.pop(); P.rem.push(x); got.push(x); }
    co.rem = (co.rem || []).concat(got); say(R, `코스트: ${nm(s)} 덱의 카드 ${got.length}장을 모두 리무브`); K.chk(R, s); });
  // selfRemAny: 이 카드를 (현장/표향 증거/FILE/손패 어디에 있든) 리무브 에리어로 옮긴다
  defCost('selfRemAny', k => ({}), (R, s, src) => { const P = R.P[s]; return P.field.includes(src) || P.evid.includes(src) || P.file.includes(src) || P.hand.includes(src) ? '' : '이 카드를 리무브 에리어로 옮길 수 없습니다'; }, function* (R, s, src) {
    const P = R.P[s]; if (P.field.includes(src)) { K.rmChar(R, src, 'cost'); return; }
    const wasEv = P.evid.includes(src); K.takeOut(R, src); R.cards[src].up = false; P.rem.push(src); say(R, `코스트: ${D.cn(R, src)}을(를) 리무브 에리어로`); if (wasEv) bus(R, 'evrem', { s, by: 'cost', cz: s }); });

  // ── 공개한 카드(레지스터 seen) 중에서 등장 ──
  // playSeen: peek 로 확인/공개한 덱의 카드(아직 덱에 있는 것) 중에서 조건에 맞는 캐릭터를 n장까지 등장시킨다
  def('playSeen', o => ({ op: 'playSeen', n: Math.max(1, Math.min(num(o.n, 1), 5)), filter: cleanFilter(o.filter), asleep: !!o.asleep }), function* (R, s, src, o, ctx) {
    const P = R.P[s], f = rf(R, o.filter, ctx); ctx.done = false; ctx.played = []; setReg(ctx, 'played', []);
    const seen = regIds(R, ctx, 'seen'), cand = seen.filter(x => P.deck.includes(x) && D(R, x).type === 'char' && fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const ids = (yield pickReq(s, `공개한 카드 중 등장시킬 캐릭터를 최대 ${o.n}장 선택`, cand, 0, Math.min(o.n, cand.length), { reveal: 1 })).filter(x => cand.includes(x)); if (!ids.length) return;
    setReg(ctx, 'seen', seen.filter(x => !ids.includes(x)));
    yield* K.moveCards(R, s, src, ids, o.asleep ? 'fieldSleep' : 'field', {}, ctx); ctx.done = (ctx.played || []).length > 0; });

  // repeatCost: 「코스트를 지불하고 ops 를 처리한다」를 max 회까지 해도 된다(매번 확인)
  def('repeatCost', (o, depth) => ({ op: 'repeatCost', max: Math.max(1, Math.min(num(o.max, 1), 6)), cost: K.cleanCost(o.cost), ops: K.cleanOps(o.ops, (depth || 0) + 1) }), function* (R, s, src, o, ctx, it) {
    let n = 0; ctx.done = false;
    for (let i = 0; i < o.max; i++) {
      if (o.cost.some(k => K.canPayOne(R, s, src, k))) break;
      if (!(yield yn(s, `${D(R, src).n}: 코스트를 지불하고 한 번 더 처리할까요? (${i + 1}/${o.max}회째)`))) break;
      for (const k of o.cost) yield* K.pay(R, s, src, k, ctx);
      yield* K.runOps(R, s, src, o.ops, ctx, it); n++; }
    ctx.done = n > 0; });

  // ── 카드명 ──
  // nameSwap: 턴 종료 시까지 카드명을 바꿔 쓴다. to: self(이 카드)/played(방금 등장한 캐릭터), from: chosen(레지스터 chosen 의 첫 카드)/pick(내 현장의 다른 캐릭터 중 선택)
  def('nameSwap', o => ({ op: 'nameSwap', to: opt(o.to, ['self', 'played'], 'self'), from: opt(o.from, ['chosen', 'pick'], 'chosen'), filter: cleanFilter(o.filter), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    ctx.done = false; const tgt = o.to === 'self' ? src : regIds(R, ctx, 'played').find(x => onField(R, x)); if (tgt == null || !onField(R, tgt)) return; let nid;
    if (o.from === 'chosen') { nid = regIds(R, ctx, 'chosen')[0]; if (nid == null) return; }
    else { const f = rf(R, o.filter, ctx), cand = R.P[s].field.filter(x => x !== tgt && fOk(R, s, x, f, src, true)); if (!cand.length) return;
      const ids = (yield pickReq(s, '카드명을 가져올 캐릭터를 선택' + (o.opt ? ' (선택, 0장이면 하지 않음)' : ''), cand, o.opt ? 0 : 1, 1)).filter(x => cand.includes(x)); if (!ids.length) return; nid = ids[0]; }
    const name = effN(R, nid); R.fl.nmx = R.fl.nmx || {}; R.fl.nmx[tgt] = name; say(R, `[효과] ${D.cn(R, tgt)}의 카드명이 턴 종료 시까지 [${name}](으)로 바뀜`); ctx.done = true; });

  // nameCountAp: 카드명을 1개 지정(내 현장의 캐릭터 1장을 골라 그 카드명을 지정)하고, 내 현장에 있는 그 카드명의 캐릭터 1장당 컨택트 중인 캐릭터(컷인 대상)의 AP+v
  def('nameCountAp', o => ({ op: 'nameCountAp', v: Math.max(0, Math.min(num(o.v, 1000), 100000)) }), function* (R, s, src, o, ctx) {
    const P = R.P[s], tid = ctx.t && ctx.t.cin; ctx.done = false; if (tid == null || !onField(R, tid) || !P.field.length) return;
    const names = [...new Set(P.field.map(x => effN(R, x)))]; let nmv = names[0];
    if (names.length > 1) { const pk = (yield pickReq(s, '지정할 카드명의 캐릭터를 1장 선택 (그 카드명으로 지정합니다)', P.field.slice(), 1, 1))[0]; nmv = effN(R, pk); }
    const k = P.field.filter(x => effN(R, x) === nmv).length; say(R, `[효과] 카드명 [${nmv}] 지정 — 현장 ${k}장`);
    K.applyTo(R, s, src, tid, 'ap', String(o.v * k), 'contact'); ctx.done = true; });

  // ── 상대 FILE / 파트너 에리어 ──
  // oppFileNamed: 상대 FILE 에리어의 카드를 위에서 1장 리무브하고, 상대는 덱의 카드를 위에서 1장 뒷면인 채로 FILE 에리어 위에 놓는다. 직전에 지정한 카드명(ctx.named)의 카드가 리무브되면 ctx.done=true
  def('oppFileNamed', o => ({ op: 'oppFileNamed' }), function* (R, s, src, o, ctx) {
    const t = 1 - s, T = R.P[t], named = String(ctx.named || ''); let hit = false;
    if (T.file.length) { const x = T.file.pop(); R.cards[x].up = false; T.rem.push(x); hit = !!named && D(R, x).n.includes(named);
      say(R, `[효과] 상대 FILE 에리어 위의 「${D.cn(R, x)}」을(를) 리무브` + (hit ? ' (지정한 카드명)' : '')); setReg(ctx, 'removed', [x]); }
    const y = K.pull(R, t); if (y != null) { R.cards[y].up = false; T.file.push(y); say(R, '[효과] 상대가 덱의 카드를 위에서 1장 뒷면으로 FILE 에리어 위에 놓음'); }
    ctx.done = hit; });

  // paRemove: 상대의 파트너 에리어에 있는 캐릭터/이벤트를 n장까지 선택해서 리무브
  def('paRemove', o => ({ op: 'paRemove', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    const T = R.P[1 - s], f = rf(R, o.filter, ctx); ctx.done = false; const cand = T.pa.filter(x => ['char', 'event'].includes(D(R, x).type) && fOk(R, s, x, f, src, true)); if (!cand.length) return;
    let ids = (yield pickReq(s, '상대의 파트너 에리어에서 리무브할 카드를 최대 1장 선택', cand, 0, 1, { reveal: 1 })).filter(x => cand.includes(x)); if (!ids.length) return;
    ids = yield* K.chosenCheck(R, s, src, ids, it); ids = ids.filter(x => T.pa.includes(x)); if (!ids.length) return;
    T.pa = T.pa.filter(x => !ids.includes(x)); T.rem.push(...ids); setReg(ctx, 'removed', ids); say(R, `[효과] 상대의 파트너 에리어의 「${ids.map(x => D.cn(R, x)).join(', ')}」을(를) 리무브`); ctx.done = true; });

  // ── 증거 ──
  // flipAllEvid: 자신의 증거를 모두 표향으로 한다
  def('flipAllEvid', o => ({ op: 'flipAllEvid' }), function* (R, s, src, o, ctx) {
    const ids = K.flipEv(R, s, 99, R.P[s].evid.filter(x => !R.cards[x].up)); ctx.flipped = ids; say(R, `[효과] ${nm(s)}의 증거 ${R.P[s].evid.length}장을 모두 표향으로`); ctx.done = ids.length > 0; });
  // loseGame: 상대(who:'opp')는 게임에 패배한다
  def('loseGame', o => ({ op: 'loseGame', who: opt(o.who, ['opp'], 'opp') }), function* (R, s, src, o, ctx) {
    ctx.done = true; if (A.win) A.win(R, s, `${nm(1 - s)}은(는) 카드 효과로 게임에 패배`); });

  // showOpp: 직전에 공개한 카드(레지스터 seen)를 상대에게도 보여 준다(peek 는 본인에게만 확인시키므로, 「公開する」 효과용)
  def('showOpp', o => ({ op: 'showOpp' }), function* (R, s, src, o, ctx) {
    const ids = regIds(R, ctx, 'seen'); ctx.done = false; if (!ids.length) return; yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}의 덱 위 ${ids.length}장 공개`, ids, reveal: 1 }; ctx.done = true; });

  // ── 기타 ──
  // triggerFlash: 내 현장의 (filter 에 맞는) 캐릭터 1장을 골라 그 【ヒラメキ】 효과를 발동시켜도 된다
  def('triggerFlash', o => ({ op: 'triggerFlash', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx, it) {
    const P = R.P[s], f = rf(R, o.filter, ctx); ctx.done = false; const cand = P.field.filter(x => fOk(R, s, x, f, src, true) && (D(R, x).ab || []).some(a => a.ic === 'flash')); if (!cand.length) return;
    const ids = (yield pickReq(s, '【ヒラメキ】 효과를 발동시킬 캐릭터를 최대 1장 선택', cand, 0, 1)).filter(x => cand.includes(x)); if (!ids.length) return; const x = ids[0];
    const abs = (D(R, x).ab || []).filter(a => a.ic === 'flash' && K.condOk(R, s, x, a)); if (!abs.length) return;
    if (!(yield yn(s, `「${D(R, x).n}」의 【ヒラメキ】 효과를 발동시킬까요?`))) return;
    say(R, `▶ 히라메키 발동: ${D.cn(R, x)}`); const c2 = { done: true, t: {}, cost: {}, src: x }; for (const ab of abs) yield* K.runOps(R, s, x, ab.ops, c2, it); ctx.done = true; });

  // ifUse: 이 선언 능력을 이번 턴 중 n번째로 사용한 경우에만 ops 를 처리
  def('ifUse', (o, depth) => ({ op: 'ifUse', n: Math.max(1, Math.min(num(o.n, 1), 9)), ops: K.cleanOps(o.ops, (depth || 0) + 1) }), function* (R, s, src, o, ctx, it) {
    const i = it && it.ab ? K.abList(R, src).indexOf(it.ab) : -1; if (i < 0 || ((R.cards[src].u || {})[i] || 0) !== o.n) return; yield* K.runOps(R, s, src, o.ops, ctx, it); });

  // setFromHand: 손패에 있는 이 이벤트를 내 현장의 (filter 에 맞는) 캐릭터 1장에 세트한다(선언 능력용)
  def('setFromHand', o => ({ op: 'setFromHand', filter: cleanFilter(o.filter) }), function* (R, s, src, o, ctx) {
    const P = R.P[s], f = rf(R, o.filter, ctx); ctx.done = false; if (!P.hand.includes(src)) return; const cand = P.field.filter(x => fOk(R, s, x, f, src, true)); if (!cand.length) return;
    const tid = cand.length === 1 ? cand[0] : (yield pickReq(s, '이 이벤트를 세트할 캐릭터를 선택', cand, 1, 1))[0]; if (tid == null || !onField(R, tid) || !P.hand.includes(src)) return;
    P.hand = P.hand.filter(x => x !== src); const h = R.cards[tid]; (h.sets = h.sets || []).push(src); R.cards[src].setOn = tid; ctx.moved = true;
    say(R, `[효과] ${D.cn(R, src)}을(를) 손패에서 ${D.cn(R, tid)}에 세트`); bus(R, 'setOn', { s, ent: src, holder: tid }); ctx.done = true; });
};
