// 확장 효과 프리미티브 (Turn 26). fx.js 가 helper 묶음 H 를 넘겨 준다.
module.exports = function (H) {
  const { A, D, say, nm } = H;
  const OPS = {};   // op 이름 → { clean(o,depth) , run: function*(R,s,src,o,ctx,it) }
  const def = (name, clean, run) => { if (OPS[name]) throw new Error('fx_ext: 중복 op 정의 ' + name); OPS[name] = { clean, run }; };
  const { fOk, rf, pickReq, onField, cleanFilter, num, opt, str, setReg, regIds, queueEvent, bus } = H;
  const yn = (who, msg) => ({ who, kind: 'yn', msg });
  // ──────────────── 프리미티브는 아래에 순서대로 추가 ────────────────
  // useEv: 손패의 이벤트를 효과로 사용(FILE 레벨 요구·턴당 1회 제한은 받지 않음, 사건 색 규칙과 사용 조건은 받음). 이벤트 효과는 현재 효과 해결 뒤에 큐로 처리된다.
  def('useEv', (o) => ({ op: 'useEv', filter: cleanFilter(o.filter), n: 1 }), function* (R, s, src, o, ctx, it) {
    const P = R.P[s], f = rf(R, o.filter, ctx); ctx.done = false;
    const cand = P.hand.filter(x => D(R, x).type === 'event' && fOk(R, s, x, f, src, true) && A.okc(R, s, D(R, x), x) && H.useOk(R, s, x));
    if (!cand.length) return;
    const ids = (yield pickReq(s, '효과로 사용할 이벤트를 최대 1장 선택', cand, 0, 1, { reveal: 1 })).filter(x => cand.includes(x)); if (!ids.length) return;
    const id = ids[0]; P.hand = P.hand.filter(x => x !== id); say(R, `${nm(s)} 효과로 사용: ${D(R, id).n}`);
    R.q.push({ kind: 'event', s, src: id, abs: (D(R, id).ab || []).filter(a => a.ic === 'event' || a.ic === 'manual'), ctx: { viaEffect: true } }); bus(R, 'useev', { s, ent: id, by: 'effect' });
    setReg(ctx, 'used', [id]); ctx.done = true; });
  // protect: 이번 컨택트로는 리무브되지 않는다 (who: self=이 카드 / ent=트리거 대상 캐릭터)
  def('protect', o => ({ op: 'protect', who: opt(o.who, ['self', 'ent'], 'self') }), function* (R, s, src, o, ctx) {
    const id = o.who === 'ent' ? (ctx.t && ctx.t.ent) : src; ctx.done = false; if (id == null || !R.cards[id] || !onField(R, id)) return;
    R.cards[id].ckw = (R.cards[id].ckw || '') + ' nrm-con'; say(R, `[효과] ${D(R, id).n}: 이 컨택트로는 리무브되지 않음`); ctx.done = true; });
  // negate: what=cutin → 방금 사용된 컷인(AP 증가와 효과)을 무효로 / what=choose → 선택된 것을 무효로(onchosen 안에서)
  def('negate', o => ({ op: 'negate', what: opt(o.what, ['cutin', 'choose'], 'choose') }), function* (R, s, src, o, ctx) {
    if (o.what === 'choose') { ctx.negated = true; ctx.done = true; return; }
    const e = ctx.t && ctx.t.ent, my = ctx.t && ctx.t.tid; ctx.done = false; if (e == null || my == null || !R.cards[my]) return;
    R.cards[my].cm = (R.cards[my].cm || 0) - (ctx.t.v || 0); R.q = R.q.filter(it => !(it.kind === 'ab' && it.src === e && it.ctx && it.ctx.cin === my));
    say(R, `[효과] 컷인 ${D(R, e).n}의 효과를 무효로 함`); ctx.done = true; });
  // setSelf: 리무브 에리어에 있는 이 카드(이벤트)를 자신의 캐릭터 1장에 세트한다(대체 효과를 사후 처리로 구현: 리무브 에리어에 놓인 직후)
  def('setSelf', o => ({ op: 'setSelf', filter: cleanFilter(o.filter), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    const P = R.P[s]; ctx.done = false; if (!P.rem.includes(src)) return; const f = rf(R, o.filter, ctx), cand = P.field.filter(x => fOk(R, s, x, f, src, true)); if (!cand.length) return;
    if (o.opt && !(yield yn(s, `${D(R, src).n}을(를) 리무브 에리어에 두는 대신 캐릭터에 세트할까요?`))) return;
    const id = cand.length === 1 ? cand[0] : (yield pickReq(s, '세트할 캐릭터를 선택', cand, 1, 1))[0]; if (!P.rem.includes(src) || !onField(R, id)) return;
    P.rem = P.rem.filter(x => x !== src); (R.cards[id].sets = R.cards[id].sets || []).push(src); R.cards[src].setOn = id; say(R, `[효과] ${D(R, src).n}을(를) ${D(R, id).n}에 세트`); bus(R, 'setOn', { s, ent: src, holder: id }); ctx.done = true; });
  // contact: 효과로 컨택트를 발생시킨다(공격 쪽: 이 카드 또는 고른 자신의 캐릭터 / 상대 캐릭터는 선택). 액션은 아니지만 이후는 일반 컨택트 처리(컷인·변장·AP 판정)
  def('contact', o => ({ op: 'contact', atk: opt(o.atk, ['self', 'pick'], 'self'), atkF: cleanFilter(o.atkF), tf: cleanFilter(o.tf) }), function* (R, s, src, o, ctx, it) {
    ctx.done = false; if (R.sub || R.phase !== 'play') return; const f = rf(R, o.tf, ctx);
    let cand = R.P[1 - s].field.filter(x => fOk(R, s, x, f, src) && !H.noTarget(R, x, src)); if (!cand.length) return;
    let d = (yield pickReq(s, '컨택트를 발생시킬 상대 캐릭터를 선택', cand, 0, 1)); if (!d.length) return; d = (yield* H.chosenCheck(R, s, src, d, it))[0]; if (d == null || !onField(R, d)) return;
    let a = src; if (o.atk === 'pick') { const af = rf(R, o.atkF, ctx), ac = R.P[s].field.filter(x => fOk(R, s, x, af, src)); if (!ac.length) return; a = ac.length === 1 ? ac[0] : (yield pickReq(s, '컨택트를 발생시킬 내 캐릭터를 선택', ac, 1, 1))[0]; }
    if (!onField(R, a) || !onField(R, d)) return; say(R, `[효과] ${D(R, a).n}와(과) ${D(R, d).n}의 컨택트가 발생`); A.contact(R, a, d); ctx.done = true; });
  // playSelf: 이 카드를 리무브 에리어(또는 어느 구역에도 없는 상태)에서 등장시킨다(asleep: 슬립 상태로). opt: 사용 여부 확인
  def('playSelf', o => ({ op: 'playSelf', asleep: !!o.asleep, opt: !!o.opt, mark: !!o.mark, from: opt(o.from, ['rem', 'any', 'hand'], 'rem') }), function* (R, s, src, o, ctx) {
    const P = R.P[s], c = R.cards[src]; ctx.done = false; if (!c || onField(R, src) || c.setOn != null) return;
    const inRem = P.rem.includes(src), loose = !H.inZone(R, src), inHand = o.from === 'hand' && P.hand.includes(src); if (!inRem && !inHand && !(o.from === 'any' && loose)) return;
    if (P.field.length >= H.fieldMax(R, s) || H.nameBanned(R, s, src)) return;
    if (o.opt && !(yield yn(s, `${D(R, src).n}을(를) ${o.asleep ? '슬립 상태로 ' : ''}등장시킬까요?`))) return;
    if (!(P.rem.includes(src) || inHand || !H.inZone(R, src)) || P.field.length >= H.fieldMax(R, s)) return;
    P.rem = P.rem.filter(x => x !== src); P.hand = P.hand.filter(x => x !== src); ctx.moved = true; if (o.mark) c.cinN = R.n; yield* H.placeCards(R, s, src, [src], !!o.asleep, ctx); ctx.done = onField(R, src); });
  // banName: 이번 턴 동안 이 카드명을 사용할 수 없고 등장시킬 수 없다
  def('banName', o => ({ op: 'banName', name: str(o.name, 40) }), function* (R, s, src, o, ctx) {
    R.fl.noName = R.fl.noName || [[], []]; R.fl.noName[s].push(o.name || D(R, src).n); say(R, `[효과] 이번 턴 동안 카드명 [${o.name || D(R, src).n}]을(를) 사용할 수 없음`); ctx.done = true; });
  // 추가 모듈 fx_ext_a..e.js : module.exports = function (K, def) { def('op', clean, run) }  (K = 헬퍼 묶음)
  // 코스트 확장: defCost(name, clean(k)->추가 필드, can(R,s,src,k)->에러문자열, function*pay(R,s,src,k,ctx))
  const COSTX = {}; const defCost = (name, clean, can, pay) => { if (COSTX[name]) throw new Error('fx_ext: 중복 cost 정의 ' + name); COSTX[name] = { clean, can, pay }; };
  const K = { ...H, yn, def, OPS, defCost };
  for (const f0 of require('fs').readdirSync(__dirname).filter(x => /^fx_ext_.+\.js$/.test(x)).sort()) { const m = f0.slice(7, -3); if (process.env.FXEXT_MODS && !process.env.FXEXT_MODS.split(',').includes(m)) continue; require('./fx_ext_' + m)(K, def); }  // 새 묶음은 fx_ext_<이름>.js 로 추가하면 자동 로드
  return {
    has: n => !!OPS[n],
    hasCost: n => !!COSTX[n], costClean: k => COSTX[k.c].clean(k), costCan: (R, s, src, k) => COSTX[k.c].can(R, s, src, k), *costPay(R, s, src, k, ctx) { yield* COSTX[k.c].pay(R, s, src, k, ctx); },
    clean(o, depth, name) { const d = OPS[name]; return d ? d.clean(o, depth) : null; },
    *run(R, s, src, o, ctx, it) { yield* OPS[o.op].run(R, s, src, o, ctx, it); },
  };
};
