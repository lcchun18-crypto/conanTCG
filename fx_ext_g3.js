// 묶음 g3: 카드명 지정 / 카드명 바꿔쓰기 / 트리거 캐릭터에 대한 선택적 처리
//  - nameDesig : 카드명을 1개 지정한다(ctx.named). pool 'text' = 이름 입력(정식 카드명으로 정규화), 'field' = 내 현장 캐릭터의 카드명 중에서 선택
//  - nameApply : 지정한 카드명(ctx.named)으로 캐릭터(self/played/sel)의 카드명을 턴 종료 시까지 바꿔 쓴다 (R.fl.nmx — 이름 필터·조건·【絆】 등이 모두 따른다)
//  - entDo     : 트리거를 일으킨 캐릭터(ctx.t.ent)에 대해 (확인 후) 슬립/액티브/리무브 등을 한다 ("〜をスリープさせてもよい。そうした場合")
module.exports = function (K, def) {
  const { D, say, nm, onField, opt, str, setReg, regIds, yn } = K;
  const norm = x => String(x == null ? '' : x).normalize('NFKC').replace(/[\s\[\]「」〈〉<>【】]/g, '');
  const effN = (R, id) => (R.fl && R.fl.nmx && R.fl.nmx[id] != null && onField(R, id)) ? R.fl.nmx[id] : D(R, id).n;
  // 지정 가능한 카드명 풀: 이 게임의 덱에 들어 있는 카드 + (서버가 가진) 전체 카드 DB
  let _dbN = null, _dbT = 0;   // 서버가 가진 전체 카드 DB의 [이름, 종류] 목록(5초 캐시: 봇 시뮬레이션에서 자주 불려도 가볍게)
  const dbNames = () => { const now = Date.now(); if (_dbN && now - _dbT < 5000) return _dbN; _dbT = now;
    try { const c = require('./server.js').loadCards(); if (!c.obj) c.obj = JSON.parse(c.body.toString('utf8')).cards; _dbN = Object.values(c.obj).map(d => [d.n, d.type]); } catch (e) { _dbN = _dbN || []; } return _dbN; };
  const namePool = (R, kind) => { const set = new Set(); const add = (n, t) => { if (n && (kind !== 'char' || t === 'char')) set.add(n); };
    Object.values(R.defs || {}).forEach(d => add(d.n, d.type)); dbNames().forEach(([n, t]) => add(n, t)); return [...set]; };

  def('nameDesig', o => ({ op: 'nameDesig', pool: opt(o.pool, ['text', 'field'], 'text'), kind: opt(o.kind, ['char', 'any'], 'any'), opt: !!o.opt, ynMsg: str(o.ynMsg, 80) }), function* (R, s, src, o, ctx) {
    ctx.done = false; let name = null;
    if (o.pool === 'field') {
      const names = [...new Set(R.P[s].field.map(x => effN(R, x)))]; if (!names.length) return; name = names[0];
      if (names.length > 1) name = names[+(yield { who: s, kind: 'opt', msg: '지정할 카드 이름을 선택 (내 현장의 캐릭터)', labels: names })];
    } else {
      if (o.opt && !(yield yn(s, o.ynMsg || '카드 이름을 지정해서 바꿔 쓸까요?'))) return;
      const typed = norm(yield { who: s, kind: 'text', msg: o.kind === 'char' ? '지정할 캐릭터의 카드 이름을 입력하세요' : '지정할 카드 이름을 입력하세요', max: 40 });
      const pool = namePool(R, o.kind), exact = pool.filter(n => norm(n) === typed);
      if (exact.length) name = exact[0];
      else { const c = pool.filter(n => typed && norm(n).includes(typed));
        if (c.length === 1) name = c[0]; else if (c.length > 1 && c.length <= 8) name = c[+(yield { who: s, kind: 'opt', msg: '어느 카드 이름입니까?', labels: c })]; }
      if (name == null) { say(R, `[효과] 카드 이름 지정: 해당하는 카드 이름이 없음`); if (o.kind === 'char') return; ctx.named = '\u0000'; ctx.done = true; return; }
    }
    ctx.named = name; ctx.done = true; say(R, `[효과] 카드 이름 지정: ${name}`); });

  def('nameApply', o => ({ op: 'nameApply', to: opt(o.to, ['self', 'played', 'sel'], 'self') }), function* (R, s, src, o, ctx) {
    ctx.done = false; const name = ctx.named; if (!name || name === '\u0000') return;
    const tgt = o.to === 'self' ? src : regIds(R, ctx, o.to).find(x => onField(R, x)); if (tgt == null || !onField(R, tgt)) return;
    R.fl.nmx = R.fl.nmx || {}; R.fl.nmx[tgt] = name; say(R, `[효과] ${D(R, tgt).n}의 카드명이 턴 종료 시까지 [${name}](으)로 바뀜`); ctx.done = true; });

  def('entDo', o => ({ op: 'entDo', do: opt(o.do, ['sleep', 'active', 'remove', 'ap', 'kw'], 'sleep'), v: str(o.v, 40), until: opt(o.until, ['turn', 'contact'], 'turn'), opt: !!o.opt }), function* (R, s, src, o, ctx) {
    ctx.done = false; const e = ctx.t && ctx.t.ent; if (e == null || !onField(R, e)) return; if (o.do === 'sleep' && (R.cards[e].st || 'a') !== 'a') return;
    if (o.opt && !(yield yn(s, `「${D(R, e).n}」을(를) ${o.do === 'sleep' ? '슬립' : o.do === 'active' ? '액티브' : o.do === 'remove' ? '리무브' : o.do}시킬까요?`))) return;
    yield* K.applyG(R, s, src, e, o.do, o.v, o.until); say(R, `[효과] ${D(R, e).n}: ${o.do}${o.v ? ' ' + o.v : ''}`); ctx.done = true; });
};
