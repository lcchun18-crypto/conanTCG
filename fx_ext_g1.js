// 묶음 g1: 상시 규칙 / 키워드 부여 / 제한 / 반응형 트리거용 공통 op
module.exports = function (K, def) {
  const { D, say, nm, fOk, rf, onField, cleanFilter, opt, str, setReg, regIds } = K;
  const REGS = ['self', 'sel', 'played', 'seen', 'hit', 'chosen', 'chosen2', 'rest', 'revealed', 'removed', 'drawn', 'moved', 'cost', 'last'];
  // trigTgt: 트리거(예: 액션)의 「지정된 대상」(ctx.t.tid) 캐릭터에게 효과를 준다 — 예) 「アクション[キャラ]したとき、指定したキャラをターン終了時までレベル-1する」
  def('trigTgt', o => ({ op: 'trigTgt', do: opt(o.do, ['sleep', 'stun', 'active', 'ap', 'lp', 'lv', 'kw', 'remove', 'deckBottom', 'hand'], 'lv'), v: str(o.v, 40), until: opt(o.until, ['turn', 'contact', 'oppEnd'], 'turn'), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    const id = ctx.t && ctx.t.tid; ctx.done = false; if (id == null || !R.cards[id] || !onField(R, id)) return;
    if (o.opt && !(yield { who: s, kind: 'yn', msg: `「${D(R, id).n}」을(를) ${o.do === 'deckBottom' ? '덱 아래로 옮길까요' : o.do === 'remove' ? '리무브할까요' : o.do === 'hand' ? '손패로 되돌릴까요' : '처리할까요'}?` })) return;
    yield* K.applyG(R, s, src, id, o.do, o.v, o.until); setReg(ctx, 'sel', [id]); say(R, `[효과] ${D.cn(R, id)}: ${o.do}${o.v ? ' ' + o.v : ''}`); ctx.done = true; });
  // ifLeft: 레지스터(기본 sel)의 카드 중 현장을 떠난 것이 있고(리무브 등) 그 카드가 (떠난 시점의 상태로) 필터에 맞으면 ops, 아니면 else —
  //   예) 「スリープ状態のキャラをリムーブした場合」: 리무브 처리 뒤에 평가하며, 현장에 남아 있는 카드(보호/대체 효과)는 해당하지 않는다
  def('ifLeft', o => ({ op: 'ifLeft', ref: opt(o.ref, REGS, 'sel'), filter: cleanFilter(o.filter), ops: K.cleanOps(o.ops, 1), else: K.cleanOps(o.else, 1) }), function* (R, s, src, o, ctx, it) {
    const f = rf(R, o.filter, ctx), hit = regIds(R, ctx, o.ref).some(x => R.cards[x] && !onField(R, x) && fOk(R, s, x, f, src, true));
    if (hit) yield* K.runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* K.runOps(R, s, src, o.else, ctx, it); });
};
