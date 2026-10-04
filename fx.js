const inZoneFx = (R, x) => R.P.some(P => [P.hand, P.evid, P.pa, P.rem, P.deck, P.file, P.field, P.kase].some(z => z && z.some && z.some(e => e === x || (e && e.id === x))));
// 카드 효과 엔진: 카드의 ab(효과 데이터, DSL)를 해석해서 실행한다.
// 파서가 이해하지 못한 텍스트는 {op:'manual'} 표식으로 남지만(개발 중 점검용), 현재 DB 는 0건이며 실행 시 사용자에게 수동 처리를 요구하지 않는다.
let FXX = null;
module.exports = function (A) {
  const { D, say, shuf, pull, chk, gain, nm, fcount, cols } = A;

  // ───────────── 데이터 정리(서버가 클라이언트 입력을 신뢰하지 않음) ─────────────
  const IC = ['onplay', 'onremoved', 'flash', 'declare', 'static', 'cutin', 'onact', 'oncontact', 'onreason', 'event', 'onend', 'ondisguise', 'disguise', 'deckfree', 'ontrig', 'usecond', 'ignorecolor', 'onhint', 'onkill', 'onally', 'enter', 'hand', 'grant',
    'onchosen', 'onsolve', 'onmain', 'onallyremoved', 'onallykill', 'onallycontact', 'onremleave', 'replace', 'mr', 'winalt', 'manual'];
  const str = (x, n = 60) => String(x == null ? '' : x).slice(0, n);
  const num = (x, d = 0) => { x = Math.trunc(+x); return Number.isFinite(x) ? Math.max(-99999, Math.min(99999, x)) : d; };
  const opt = (x, arr, d = '') => arr.includes(x) ? x : d;
  // ───────── v1.11.0 ownership(소유자) 문맥 분리 ─────────
  // 필터의 own(self|opp|any) 이 비어 있을 때의 의미는 "어디에 쓰인 필터인가(문맥)"에 따라 다르다. 전역 기본값 하나로 처리하지 않는다.
  //   cost           굵은 코스트(ab.cost[])                      → 소유자 미지정 = self (코난 TCG 룰: 굵은 조건/코스트는 [상대] 지정이 없으면 우리 쪽)
  //   condition      굵은 발동 조건(ab.cond, ifc.cond, 개수/1枚につき) → 소유자 미지정 = self (같은 룰)
  //   target         실제 효과의 대상(ab.ops[] 의 필드 대상)         → 데이터의 own 을 그대로 사용. 미지정(끝까지 확정 못한 것)은 제한 없음(permissive) + 검증 경고
  //   conditionCheck if / ifLeft / ifCost / ifSelf — 이미 정해진 카드를 검사 → 소유자 제한 없음(미지정)
  //   zonePick       손패/리무브/덱/FILE 등 구역에서 고르는 필터(pick, fetch, play, look, discard …) → 풀의 소유자는 구역이 정함. 필터는 제한 없음(미지정)
  //   triggerSubject 트리거 주체(ab.sf / ef / tf, delay.sf)         → 데이터의 own 을 그대로 사용. 미지정(끝까지 확정 못한 것)은 제한 없음(permissive) + 검증 경고
  //   staticTarget   상시 능력 대상(ab.tgt.filter)                 → 쪽은 tgt.sel(allies/opp/all/self) 이 정함. 필터는 제한 없음(미지정)
  // op 이름으로 own 을 바꾸지 않는다(select+remove→any 같은 예외 없음). 구역 풀/검사 op 인지는 "op 가 읽는 풀이 무엇인가"의 구조 정보(OP_CTX)이다.
  const LEG_ENV = process.env.CONAN_DEFAULT_OWN === 'any' ? 'any' : 'self';   // 옛 테스트 호환용(환경변수). 운영에서는 설정하지 않는다
  const OWN_CTX = { cost: LEG_ENV, condition: LEG_ENV, target: LEG_ENV, triggerSubject: LEG_ENV, conditionCheck: '', zonePick: '', staticTarget: '' };
  const OP_CTX = {};
  for (const k of ['if', 'ifLeft', 'ifCost', 'ifSelf']) OP_CTX[k] = 'conditionCheck';
  for (const k of ['pick', 'fetch', 'play', 'playSeen', 'look', 'reveal', 'revealTop', 'peek', 'discard', 'stack', 'stackFrom', 'set', 'setFd', 'setFrom', 'setFromHand', 'useEv', 'rhand', 'nameSwap', 'mv', 'lvBudgetRm', 'paRemove', 'moveUnder']) OP_CTX[k] = 'zonePick';   // paRemove=상대 PA 구역, moveUnder=자기 필드 구역 — 풀이 구역으로 정해진 op
  const FILTER_REQUIRED = new Set(['select', 'selAdv', 'selLvSum', 'blankAb', 'triggerFlash', 'setSelf']);   // 필터가 곧 대상 지정인 op — 필터 자체가 없어도 own 미지정으로 본다(검증)
  let FCTX = 'condition', AUDIT = null, CUR_OP = '';   // FCTX: 지금 정리 중인 필터의 문맥. AUDIT: 검증 수집기(배열이면 own 미지정 target/subject 를 기록)
  const withCtx = (ctx, fn) => { const prev = FCTX; FCTX = ctx; try { return fn(); } finally { FCTX = prev; } };
  const cleanFilter = (f, depth = 0, ctx = FCTX) => { const had = !!f && typeof f === 'object'; f = had ? f : {}; const explicit = ['self', 'opp', 'any'].includes(f.own);
    const unresolved = !explicit && depth === 0 && (ctx === 'target' || ctx === 'triggerSubject') && (had || FILTER_REQUIRED.has(CUR_OP));
    if (unresolved && AUDIT) AUDIT.push({ ctx, op: CUR_OP });
    // 끝까지 확정하지 못한 target/주체(own 미지정)는 플레이를 막지 않는다 = 제한 없음(permissive) + 검증 경고. (잘못 막는 것보다 잘못 허용하는 쪽 — 연습용 시뮬레이터 원칙)
    const o = { own: explicit ? f.own : unresolved ? '' : (depth === 0 ? (OWN_CTX[ctx] !== undefined ? OWN_CTX[ctx] : LEG_ENV) : '') };   // any:[…] 하위 필터(depth>0)는 기본값 없음 — 부모 own 이 이미 적용됨
    const refS = x => typeof x === 'string' && (x === 'self' || /^reg:[a-z]+:(sum|max|first|count)$/.test(x));
    const lv = k => (f[k] === 'file' || f[k] === 'used' || f[k] === 'costLv' || refS(f[k])) ? f[k] : (f[k] == null || f[k] === '' ? null : num(f[k]));
    for (const k of ['lvMax', 'lvMin']) o[k] = lv(k);
    for (const k of ['apMax', 'apMin', 'apEq', 'lpMax', 'lpMin', 'lvEq']) o[k] = f[k] === 'self' && k.startsWith('ap') ? 'self' : (f[k] == null || f[k] === '' ? null : num(f[k]));
    o.lpBase = f.lpBase == null || f.lpBase === '' ? null : num(f.lpBase); o.sameName = !!f.sameName; o.hayFired = !!f.hayFired; o.hasHay = !!f.hasHay; o.acted = opt(f.acted, ['any', 'char', 'case'], '');
    o.sets = opt(f.sets, ['any', 'none', 'fdAny', 'fdNone'], ''); o.underMin = f.underMin == null ? null : num(f.underMin); o.sameTrait = !!f.sameTrait; o.colorsMin = f.colorsMin == null ? null : num(f.colorsMin);
    o.color = str(f.color, 12).toLowerCase(); o.colorNot = str(f.colorNot, 12).toLowerCase(); o.trait = str(f.trait, 30); o.name = str(f.name, 40); o.nameNot = str(f.nameNot, 40);
    o.names = (Array.isArray(f.names) ? f.names : []).slice(0, 5).map(x => str(x, 40)).filter(Boolean);
    o.st = opt(f.st, ['a', 's', 'x', 'sx']); o.notSelf = !!f.notSelf; o.self = !!f.self; o.type = opt(f.type, ['char', 'event']);
    o.hasIc = opt(f.hasIc, IC, ''); o.hasKw = str(f.hasKw, 20).toLowerCase(); o.acting = !!f.acting; o.contacting = !!f.contacting;
    o.plain = !!f.plain; o.bang = !!f.bang; o.nameCtx = !!f.nameCtx; o.lvIn = opt(f.lvIn, ['disc'], ''); o.traitOf = opt(f.traitOf, ['ent'], '');
    o.apGt = f.apGt === 'self' ? 'self' : '';
    o.any = depth < 1 ? (Array.isArray(f.any) ? f.any : []).slice(0, 4).map(x => cleanFilter(x, depth + 1, ctx)) : [];
    return o; };
  const WHO_ = ['self', 'opp'];
  const SRC = ['field', 'oppField', 'fieldBoth', 'hand', 'oppHand', 'file', 'oppFile', 'evid', 'oppEvid', 'evidUp', 'evidDown', 'rem', 'oppRem', 'pa', 'sets', 'fdSets', 'setsAll', 'under'];
  const cleanCond = c => withCtx('condition', () => cleanCond0(c));
  const cleanCond0 = c => { c = c && typeof c === 'object' ? c : {}; const r = { turn: opt(c.turn, ['self', 'opp']), pcolor: str(c.pcolor, 12).toLowerCase(),
    ccolor: str(c.ccolor, 30).toLowerCase(), ctrait: str(c.ctrait, 30), fileMin: num(c.fileMin), cstate: opt(c.cstate, ['kase', 'solve']), bond: str(c.bond, 40),
    fieldMin: num(c.fieldMin), selfSt: opt(c.selfSt, ['a', 's', 'sx']), trace: opt(c.trace, ['found', 'unfound']), selfApMin: num(c.selfApMin), killed: !!c.killed,
    handMax: c.handMax == null || c.handMax === '' ? null : num(c.handMax), ohandMax: c.ohandMax == null || c.ohandMax === '' ? null : num(c.ohandMax), swapName: str(c.swapName, 40), fhN: Math.max(0, Math.min(num(c.fhN, 1), 10)), fhDist: !!c.fhDist, noEnter: !!c.noEnter, hayAny: !!c.hayAny, cnot: str(c.cnot, 12).toLowerCase(),
    via: (Array.isArray(c.via) ? c.via : []).slice(0, 4).map(v => v && ({ type: opt(v.type, ['char', 'event'], ''), lvMin: num(v.lvMin), color: str(v.color, 12).toLowerCase() })).filter(Boolean),
    lpSumMax: c.lpSumMax == null || c.lpSumMax === '' ? null : num(c.lpSumMax), cname: str(c.cname, 40) };
    r.cnt = (Array.isArray(c.cnt) ? c.cnt : []).slice(0, 4).map(x => x && ({ src: opt(x.src, SRC, 'hand'), op: opt(x.op, ['le', 'ge', 'lt', 'gt', 'eq'], 'ge'), n: num(x.n), ref: opt(x.ref, SRC, ''), plus: num(x.plus), f: x.f && typeof x.f === 'object' ? cleanFilter(x.f) : null })).filter(Boolean);
    r.viaHint = !!c.viaHint; r.dstName = str(c.dstName, 40); r.noMrSel = !!c.noMrSel; r.guarded = !!c.guarded; r.viaEffect = !!c.viaEffect; r.cutinPlayed = !!c.cutinPlayed; r.swapLpMin = c.swapLpMin == null ? null : num(c.swapLpMin); r.swapColor = str(c.swapColor, 12).toLowerCase(); r.nth = Math.max(0, Math.min(num(c.nth), 5)); r.conly = str(c.conly, 12).toLowerCase();
    for (const k of ['fh', 'fa', 'paHas', 'cin', 'fnone']) if (c[k] && typeof c[k] === 'object') r[k] = cleanFilter(c[k]);
    if (c.ftop && typeof c.ftop === 'object') r.ftop = { who: opt(c.ftop.who, WHO_, 'self'), type: opt(c.ftop.type, ['char', 'event', 'case'], '') };
    if (c.found && typeof c.found === 'object') r.found = { named: !!c.found.named, filter: cleanFilter(c.found.filter) };
    return r; };
  const WHO = ['self', 'opp'], DO = ['sleep', 'stun', 'active', 'remove', 'hand', 'deckBottom', 'deckTop', 'deckTopOrBottom', 'ap', 'lp', 'kw', 'lv', 'gab', 'mark', 'setDeck', 'lpBase', 'apBase', 'kwLose', 'evid', 'evidUp', 'pa', 'hold'];
  const UNTIL = ['turn', 'contact', 'oppEnd'];
  const IFC = ['done', 'notdone', 'played', 'win', 'lose', 'remHas', 'costHas', 'picked', 'found', 'reg'];
  const REGS = ['self', 'sel', 'played', 'seen', 'hit', 'chosen', 'chosen2', 'rest', 'revealed', 'removed', 'drawn', 'moved', 'cost', 'costRev', 'last', 'ent', 'cin'];
  const MVTO = ['hand', 'deckTop', 'deckBottom', 'deckTopOrBottom', 'rem', 'field', 'fieldSleep', 'pa', 'evidUp', 'evidDown', 'under', 'fileBottomUp', 'fileTop'];
  const PFROM = REGS.concat(['hand', 'rem', 'pa', 'evid', 'evidUp', 'evidDown', 'file']);
  const regN = x => opt(x, REGS, '');
  const dynN = o => ({ nref: o.nref && typeof o.nref === 'object' ? { ref: opt(o.nref.ref, REGS, 'removed'), by: opt(o.nref.by, ['count', 'lv', 'ap1000'], 'count') } : null,
    ncnt: o.ncnt && typeof o.ncnt === 'object' ? { src: opt(o.ncnt.src, SRC, 'field'), f: o.ncnt.f && typeof o.ncnt.f === 'object' ? cleanFilter(o.ncnt.f, 0, 'condition') : null } : null, nmul: o.nmul ? Math.max(1, Math.min(num(o.nmul), 20)) : null });
  function cleanActs(o) { const list = Array.isArray(o.acts) && o.acts.length ? o.acts : [{ do: o.do, v: o.v, until: o.until, per: o.per, g: o.g }];
    return list.slice(0, 4).map(a => { const g = a && a.g && a.g.ic !== 'grant' ? cleanAb([a.g])[0] : null; return { do: opt(a && a.do, DO, 'sleep'), v: str(a && a.v, 40), until: opt(a && a.until, UNTIL, 'turn'), per: opt(a && a.per, ['flip'], ''), g: g || null }; }); }
  function cleanOps(a, depth = 0) { if (!Array.isArray(a) || depth > 6) return []; return a.slice(0, 14).map(o => cleanOp(o, depth)).filter(Boolean); }
  function cleanOp(o, depth) { if (!o || typeof o !== 'object') return null; const ctx = OP_CTX[o.op] || 'target', prev = FCTX, pop = CUR_OP; FCTX = ctx; CUR_OP = String(o.op);
    try { return cleanOp0(o, depth); } finally { FCTX = prev; CUR_OP = pop; } }
  function cleanOp0(o, depth) { const p = { op: str(o.op, 12) }, n = () => Math.max(1, Math.min(num(o.n, 1), 99));
    const who = () => opt(o.who, WHO, 'self');
    switch (p.op) {
      case 'draw': return { ...p, n: n(), who: who(), opt: !!o.opt, ...dynN(o) };
      case 'discard': return { ...p, n: n(), who: who(), opt: !!o.opt, rand: !!o.rand, filter: cleanFilter(o.filter), ...dynN(o), any: !!o.any };
      case 'deckrem': return { ...p, n: n(), who: who(), opt: !!o.opt, ...dynN(o), upto: !!o.upto };
      case 'handTo': return { ...p, n: Math.max(0, Math.min(num(o.n, 1), 30)), mode: opt(o.mode, ['draw', 'discard'], 'draw') };
      case 'ref': return { ...p, ref: regN(o.ref) || 'last', acts: cleanActs(o), opt: !!o.opt, mul: o.mul && typeof o.mul === 'object' ? { ref: opt(o.mul.ref, REGS, 'removed'), by: opt(o.mul.by, ['count', 'lv', 'ap1000'], 'count') } : null };
      case 'mv': return { ...p, tf: o.tf && typeof o.tf === 'object' ? cleanFilter(o.tf) : null, ref: regN(o.ref) || 'last', to: opt(o.to, MVTO, 'hand'), filter: cleanFilter(o.filter), order: opt(o.order, ['any', 'asis', 'shuffle'], 'asis'), sd: !!o.sd, opt: !!o.opt, by: opt(o.by, WHO, 'self') };
      case 'peek': return { ...p, deck: opt(o.deck, WHO, 'self'), from: opt(o.from, ['top', 'bottom'], 'top'), n: n(), ...dynN(o), until: o.until && typeof o.until === 'object' ? cleanFilter(o.until) : null, untilName: !!o.untilName,
        cap: Math.max(1, Math.min(num(o.cap, 60), 60)), reveal: !!o.reveal, viewer: opt(o.viewer, WHO, 'self'), upto: !!o.upto };
      case 'pick': return { ...p, msg: str(o.msg, 30), from: opt(o.from, PFROM, 'seen'), own: opt(o.own, ['self', 'opp'], 'self'), filter: cleanFilter(o.filter), n: n(), min: Math.max(0, Math.min(num(o.min, 0), 20)), as: regN(o.as) || 'chosen', reveal: !!o.reveal, chooser: opt(o.chooser, WHO, 'self'),
        groups: (Array.isArray(o.groups) ? o.groups : []).slice(0, 3).map(g => g && ({ filter: cleanFilter(g.filter), n: Math.max(1, Math.min(num(g.n, 1), 10)), diffColor: !!g.diffColor })).filter(Boolean), sumLv: o.sumLv == null ? null : num(o.sumLv), distinct: !!o.distinct, all: !!o.all, ...dynN(o) };
      case 'turnPk': return { ...p, key: opt(o.key, ['nocutin', 'nodisev', 'noevent', 'nodisguise'], 'nocutin'), who: opt(o.who, WHO, 'opp'), until: opt(o.until, ['turn', 'action'], 'turn') };
      case 'delay': return { ...p, evs: (Array.isArray(o.evs) ? o.evs : []).map(x => opt(x, EVS, '')).filter(Boolean).slice(0, 3), who: opt(o.who, WHO, ''), ops: cleanOps(o.ops, depth + 1), keep: !!o.keep, sf: o.sf && typeof o.sf === 'object' ? cleanFilter(o.sf, 0, 'triggerSubject') : null };
      case 'hayIgn': return p;
      case 'nameSel': return p;
      case 'gain': case 'loseEvid': return { ...p, n: n(), who: who(), opt: !!o.opt };
      case 'selfEvid': return p;
      case 'selfTo': return { ...p, to: opt(o.to, ['pa', 'hand'], 'hand') };
      case 'flipDown': return { ...p, n: n(), who: opt(o.who, ['self', 'any'], 'self') };
      case 'shuffle': return { ...p, who: opt(o.who, ['self', 'opp', 'both'], 'self') };
      case 'look': return { ...p, n: n(), from: opt(o.from, ['top', 'bottom'], 'top'), filter: cleanFilter(o.filter), max: Math.max(0, Math.min(num(o.max, 1), 20)), by: opt(o.by, ['opp'], ''),
        then: opt(o.then, ['hand', 'field', 'fieldSleep', 'rem'], 'hand'), rest: opt(o.rest, ['bottom', 'shuffleBottom', 'top', 'rem', 'hand', 'keep'], 'bottom') };
      case 'select': return { ...p, force: !!o.force, opt: !!o.opt, all: !!o.all, n: n(), filter: cleanFilter(o.filter), acts: cleanActs(o), do: opt(o.do, DO, 'sleep'), v: str(o.v, 40), until: opt(o.until, UNTIL, 'turn'),
        alt: o.alt && typeof o.alt === 'object' ? { cond: cleanCond(o.alt.cond), do: opt(o.alt.do, DO, 'remove') } : null, when: opt(o.when, ['lpLeOwnMax'], ''), sumLv: o.sumLv == null ? null : num(o.sumLv), ...dynN(o),
        groups: (Array.isArray(o.groups) ? o.groups : []).slice(0, 3).map(g => g && ({ filter: cleanFilter(g.filter), n: Math.max(1, Math.min(num(g.n, 1), 10)) })).filter(Boolean), pairSt: !!o.pairSt };
      case 'self': return { ...p, do: opt(o.do, DO, 'sleep'), v: str(o.v, 40), until: opt(o.until, UNTIL, 'turn'), opt: !!o.opt, mul: o.mul && typeof o.mul === 'object' ? { ref: opt(o.mul.ref, REGS, 'removed'), by: opt(o.mul.by, ['count', 'lv', 'ap1000'], 'count') } : null,
        pc: o.pc && typeof o.pc === 'object' ? { src: opt(o.pc.src, SRC, 'field'), f: o.pc.f && typeof o.pc.f === 'object' ? cleanFilter(o.pc.f, 0, 'condition') : null } : null };
      case 'play': return { ...p, distinct: !!o.distinct, dlv: !!o.dlv, n: n(), from: opt(o.from, ['hand', 'rem', 'handrem', 'picked', 'rempa'], 'hand'), filter: cleanFilter(o.filter), asleep: !!o.asleep };
      case 'choose': return { ...p, opts: (Array.isArray(o.opts) ? o.opts : []).slice(0, 4).map(x => ({ lab: str(x && x.lab, 60), ops: cleanOps(x && x.ops, depth + 1) })) };
      case 'chooseMulti': return { ...p, max: Math.max(1, Math.min(num(o.max, 1), 6)), opts: (Array.isArray(o.opts) ? o.opts : []).slice(0, 6).map(x => ({ lab: str(x && x.lab, 80), ops: cleanOps(x && x.ops, depth + 1) })) };
      case 'if': return { ...p, c: opt(o.c, IFC, 'done'), name: str(o.name, 40), n: num(o.n), filter: cleanFilter(o.filter), ops: cleanOps(o.ops, depth + 1), else: cleanOps(o.else, depth + 1),
        ref: regN(o.ref) || 'last', filters: (Array.isArray(o.filters) ? o.filters : []).slice(0, 4).map(x => cleanFilter(x)), cmp: opt(o.cmp, ['ge', 'le', 'eq'], 'ge'), distinct: opt(o.distinct, ['', 'color', 'name'], ''), all: !!o.all };
      case 'ifc': return { ...p, cond: cleanCond(o.cond), ops: cleanOps(o.ops, depth + 1), else: cleanOps(o.else, depth + 1) };
      case 'optcost': return { ...p, cost: cleanCost(o.cost) };
      case 'ent': return { ...p, do: opt(o.do, ['sleep', 'active', 'ap', 'lp', 'kw', 'remove'], 'active'), v: str(o.v, 40), until: opt(o.until, UNTIL, 'turn') };
      case 'played': return { ...p, do: opt(o.do, ['sleep', 'active', 'ap', 'lp', 'kw'], 'active'), v: str(o.v, 40), until: opt(o.until, UNTIL, 'turn') };
      case 'reveal': return { ...p, name: str(o.name, 40), filter: cleanFilter(o.filter), then: opt(o.then, ['hand', 'rem'], 'hand'), rest: opt(o.rest, ['bottom', 'shuffleBottom', 'rem'], 'shuffleBottom'), shuffle: !!o.shuffle };
      case 'revealTop': return { ...p, n: n(), filter: cleanFilter(o.filter), hit: opt(o.hit, ['hand', 'rem'], 'hand'), miss: opt(o.miss, ['bottom', 'top', 'rem', 'hand'], 'bottom') };
      case 'revealHand': return { ...p, who: who() };
      case 'revealFile': return { ...p, who: who(), n: n() };
      case 'investigate': return { ...p, n: n(), named: !!o.named };
      case 'fetch': return { ...p, n: n(), from: opt(o.from, ['rem', 'rempa'], 'rem'), filter: cleanFilter(o.filter), then: 'hand' };
      case 'fileToHand': return { ...p, n: n(), opt: !!o.opt };
      case 'setDeck': return { ...p, n: n(), deck: opt(o.deck, ['self', 'opp', 'owner'], 'self'), // 세트된 카드의 소유자는 세트한 캐릭터의 소유자와 같아야 한다(실행 시 검사)
         to: opt(o.to, ['self', 'played', 'pick', 'sel'], 'self'), filter: cleanFilter(o.filter), ...dynN(o) };
      case 'moveSet': return { ...p, n: 1, filter: cleanFilter(o.filter), toEmpty: !!o.toEmpty };
      case 'unset': return { ...p, n: n(), opt: !!o.opt, scope: opt(o.scope, ['self', 'any', 'opp', 'mine'], 'self'), fd: !!o.fd, filter: cleanFilter(o.filter), mode: opt(o.mode, ['', 'evid'], '') };
      case 'stack': return { ...p, n: n(), filter: cleanFilter(o.filter), distinct: !!o.distinct };
      case 'flip': return { ...p, n: n(), who: who(), opt: !!o.opt };
      case 'flashFlipped': return { ...p, bang: !!o.bang, filter: cleanFilter(o.filter) };
      case 'rmAll': return { ...p, scope: opt(o.scope, ['all', 'contact', 'others'], 'all') };
      case 'traitAll': return { ...p, trait: str(o.trait, 30) };
      case 'nohint': case 'rps': return p;
      case 'pickPaid': return { ...p, who: who() };
      case 'set': return { ...p, filter: cleanFilter(o.filter) };
      case 'solve': return p;
      case 'manual': default: { const r = X.clean(o, depth, p.op); return r || { op: 'manual', txt: str(o.txt || o.op, 200) }; } } }
  const EVS = ['handRem', 'act', 'reason', 'contact', 'evgain', 'evrem', 'removed', 'enter', 'declared', 'cutin', 'disguise', 'useev', 'actend', 'sleep', 'guard', 'setOff', 'holdLeft', 'sleepEv', 'mis', 'hint', 'turnEnd', 'fileHand', 'setOn', 'fdOff', 'hrev'];
  const COSTS = ['sleepSelf', 'discard', 'deckrem', 'selfBottom', 'sleepOther', 'flipEvid', 'fieldBottom', 'selfRem', 'selfPa', 'unset', 'unstack', 'remBottom', 'revealHand', 'fileRem', 'paRem', 'sleepAny', 'fieldRem', 'stackCost', 'either', 'lpSelf', 'discardTo', 'handDeckTop'];
  const cleanCost = (a, depth = 0) => withCtx('cost', () => cleanCost0(a, depth));
  const cleanCost0 = (a, depth = 0) => (Array.isArray(a) ? a : []).slice(0, 5).map(c => c && ({ ...(c.c && X.hasCost(c.c) ? X.costClean(c) : {}), c: COSTS.includes(c.c) || X.hasCost(c.c) ? c.c : '', n: Math.max(1, Math.min(num(c.n, 1), 10)), filter: cleanFilter(c.filter), var: !!c.var, fd: !!c.fd, scope: opt(c.scope, ['self', 'any', 'opp', 'mine'], 'self'),
    to: opt(c.to, ['sleep', 'stun'], 'sleep'), orSelf: !!c.orSelf, from: opt(c.from, ['field', 'hand'], 'field'), onto: opt(c.onto, ['self', 'pick'], 'self'), ontoF: c.ontoF && typeof c.ontoF === 'object' ? cleanFilter(c.ontoF) : null, v: num(c.v), order: !!c.order,
    per: c.per && typeof c.per === 'object' ? { src: opt(c.per.src, SRC, 'field'), f: c.per.f && typeof c.per.f === 'object' ? cleanFilter(c.per.f, 0, 'condition') : null } : null,
    alts: depth < 1 ? (Array.isArray(c.alts) ? c.alts : []).slice(0, 3).map(x => cleanCost(x, depth + 1)) : [] })).filter(c => c && c.c);
  function cleanAb(list) { if (!Array.isArray(list)) return []; return list.slice(0, 10).map(a => { if (!a || typeof a !== 'object') return null;
    const ic = opt(a.ic, IC, 'manual'), r = { ic, cond: cleanCond(a.cond), lim: Math.max(0, Math.min(num(a.lim), 3)), cost: cleanCost(a.cost), ops: cleanOps(a.ops),
      v: num(a.v), on: { k: opt(a.on && a.on.k, ['char', 'case']), by: opt(a.on && a.on.by, ['contact', 'effect']) }, lab: str(a.lab, 60), txt: str(a.txt, 400) };
    if (a.pa) r.pa = true; if (a.bang) r.bang = true; if (a.fromHand) r.fromHand = true; if (a.fromRem) r.fromRem = true; if (a.fromUp) r.fromUp = true; if (a.es) r.es = true;
    if (a.ef) r.ef = cleanFilter(a.ef, 0, 'triggerSubject');
    r.hay = !!a.hay; r.first = !!a.first;
    if (ic === 'enter') r.st = opt(a.st, ['s'], 's');
    if (ic === 'cutin' && a.alt && typeof a.alt === 'object') r.alt = { cond: cleanCond(a.alt.cond), v: num(a.alt.v) };
    if (ic === 'cutin' && a.per && typeof a.per === 'object') r.per = { src: opt(a.per.src, SRC, 'field'), f: a.per.f && typeof a.per.f === 'object' ? cleanFilter(a.per.f, 0, 'condition') : null };
    if (ic === 'ontrig') { r.evs = (Array.isArray(a.evs) ? a.evs : []).map(x => opt(x, EVS, '')).filter(Boolean).slice(0, 4); if (!r.evs.length) { r.ic = 'manual'; r.ops = [{ op: 'manual', txt: r.txt }]; }
      r.who = opt(a.who, ['self', 'opp'], ''); r.sub = opt(a.sub, ['self', 'notSelf', 'orSelf'], ''); r.sf = a.sf && typeof a.sf === 'object' ? cleanFilter(a.sf, 0, 'triggerSubject') : null; r.tf = a.tf && typeof a.tf === 'object' ? cleanFilter(a.tf, 0, 'triggerSubject') : null;
      r.tself = !!a.tself; r.dself = !!a.dself; r.hw = opt(a.hw, ['self', 'opp'], ''); r.hself = !!a.hself; r.k = opt(a.k, ['char', 'case'], ''); r.by = opt(a.by, ['contact', 'effect', 'reason', 'action', 'hint', 'hand', 'mis', 'cost'], ''); r.cz = opt(a.cz, ['self', 'opp'], ''); r.turnEnd = !!a.turnEnd; r.sw = !!a.sw; r.incl = !!a.incl; }
    if (ic === 'hand') { r.lv = Math.max(0, Math.min(num(a.lv), 20)); r.lvd = a.lvd == null ? null : Math.max(-9, Math.min(num(a.lvd), 9)); if (a.per && typeof a.per === 'object') r.per = { src: opt(a.per.src, SRC, 'field'), f: a.per.f && typeof a.per.f === 'object' ? cleanFilter(a.per.f, 0, 'condition') : null }; }
    if (ic === 'replace') { r.rep = { to: opt(a.rep && a.rep.to, ['hand', 'deckBottom', 'deckTop', 'rem', 'stay'], 'hand'), unsetSelf: !!(a.rep && a.rep.unsetSelf) }; r.forced = !!a.forced; r.msg = str(a.msg, 80); }
    if (ic === 'grant') { const g = a.g && a.g.ic !== 'grant' ? cleanAb([a.g]) : []; r.g = g[0] || null; if (!r.g) r.ic = 'manual', r.ops = [{ op: 'manual', txt: r.txt }]; }
    if (ic === 'static') { const t = a.tgt || {}; r.tgt = { sel: opt(t.sel, ['self', 'allies', 'opp', 'all'], 'self'), filter: cleanFilter(t.filter, 0, 'staticTarget'), notSelf: !!t.notSelf };
      r.ap = num(a.ap); r.lp = num(a.lp); r.lv = num(a.lv); r.kw = str(a.kw, 60); r.tr = str(a.tr, 30); r.nm = str(a.nm, 40); if (a.per && typeof a.per === 'object') r.per = { src: opt(a.per.src, SRC, 'field'), f: a.per.f && typeof a.per.f === 'object' ? cleanFilter(a.per.f, 0, 'condition') : null }; r.pk = opt(a.pk, ['pcolorAll', 'nocutinOwn', 'handLv', 'evcase','noflash', 'nocutin', 'nodisev', 'onlytrait', 'field4', 'handcut', 'altdecl', 'noremtrig', 'nosolve', 'norefresh'], ''); }
    if (ic === 'static') { if (a.az) r.az = true; if (r.tgt && a.tgt && a.tgt.zone === 'hand') r.tgt.zone = 'hand'; if (a.gab && typeof a.gab === 'object' && a.gab.ic !== 'static') { const g = cleanAb([a.gab]); if (g[0] && g[0].ic !== 'manual') r.gab = g[0]; } }
    if (ic === 'manual' && !r.ops.length) r.ops = [{ op: 'manual', txt: r.txt }];
    return r; }).filter(Boolean); }

  // ───────────── 조건/필터 ─────────────
  const traitsOf = d => String(d.trait || '').split(/[,、\/・\s]+/).map(x => x.replace(/[\[\]「」〈〉<>【】]/g, '').trim()).filter(Boolean);
  let _inTr = 0;
  const hasTrDef = R => { if (R.phase === 'setup') return false; if (R._trD === undefined) R._trD = Object.values(R.defs || {}).some(d => (d.ab || []).some(a => a.tr)); return R._trD; };
  const traitsId = (R, id) => { const c = R.cards[id]; let l = traitsOf(D(R, id)).concat(c && R.tt ? R.tt[c.o] || [] : []);
    if (!_inTr && c && hasTrDef(R)) { _inTr = 1; try { const g = stat(R, id).tr; if (g) l = l.concat(g.split(/\s+/).filter(Boolean)); } finally { _inTr = 0; } } if (c && c.tmod) l = l.filter(x => !c.tmod.lose.includes(x)).concat(c.tmod.add); return l; };
  const isMR = (R, id) => { const c = R.cards[id]; return !(c && (c.blank || c.lkiBlank)) && (D(R, id).ab || []).some(a => a.ic === 'mr'); };   // 효과 무효인 캐릭터는 MR 도 무효
  const inPa = (R, id) => !!R.cards[id] && R.P[R.cards[id].o].pa.includes(id);
  const onField = (R, id) => !!R.cards[id] && R.P[R.cards[id].o].field.includes(id);
  // 세트(セット)된 카드가 부여한 능력 + 이번 턴 임시로 받은 능력까지 합친 능력 목록
  const abList = (R, id) => { const c = R.cards[id], d = D(R, id); let l = c && (c.blank || c.lkiBlank) ? [] : (d.ab || []);   // blank: 이번 턴 동안 원래의 능력을 잃음(세트/임시 부여 능력은 유지)
    if (c && c.sets && c.sets.length) for (const sid of c.sets) for (const a of (D(R, sid).ab || [])) if (a.ic === 'grant' && a.g) l = l.concat([{ ...a.g, _from: sid }]);
    if (c && c.tab && c.tab.length) l = l.concat(c.tab);
    if (R._gaD === undefined && R.phase !== 'setup') R._gaD = Object.values(R.defs || {}).some(x => (x.ab || []).some(a => a.ic === 'static' && a.gab));
    if (R._gaD && !_inGab && c && R.P[c.o].field.includes(id)) { _inGab = 1;   // 다른 카드의 상시 능력(static gab)이 부여하는 능력
      try { for (const t of [0, 1]) for (const sid of [...R.P[t].field, ...R.P[t].pa]) { const paS = R.P[t].pa.includes(sid);
        for (const a of (D(R, sid).ab || [])) { if (a.ic !== 'static' || !a.gab || (paS && !a.pa)) continue; const g = a.tgt || { sel: 'self' };
          const hit = g.sel === 'self' ? sid === id : g.sel === 'allies' ? c.o === t && !(g.notSelf && sid === id) && fOk(R, t, id, g.filter, sid, true) : g.sel === 'opp' ? c.o !== t && fOk(R, t, id, g.filter, sid, true) : !(g.notSelf && sid === id) && fOk(R, t, id, g.filter, sid, true);
          if (hit && condOk(R, t, sid, a)) l = l.concat([{ ...a.gab, _from: sid }]); } } } finally { _inGab = 0; } }
    return l; };
  let _inGab = 0;
  // 손패의 카드 레벨 증감(static pk:'handLv', v=증감, tgt.filter=대상 카드): 예) 자신의 손패에 있는 【白】의 특징[YAIBA]의 이벤트를 레벨-1
  let _inHL = 0;
  function handLvMod(R, s, id) { if (R.phase === 'setup' || _inHL) return 0; if (R._hlD === undefined) R._hlD = Object.values(R.defs || {}).some(x => (x.ab || []).some(a => a.ic === 'static' && a.pk === 'handLv')); if (!R._hlD) return 0;
    let m = 0; _inHL = 1; try { const P = R.P[s]; for (const sid of [...P.field, P.kase, ...P.pa]) { if (sid == null) continue; const paS = P.pa.includes(sid);
      for (const a of abList(R, sid)) if (a.ic === 'static' && a.pk === 'handLv' && !(paS && !a.pa) && condOk(R, s, sid, a) && fOk(R, s, id, a.tgt && a.tgt.filter, sid, true)) m += a.v || 0; } } finally { _inHL = 0; } return m; }
  function lvOf(R, id, noStat) { const d = D(R, id), c = R.cards[id]; let lv = +d.lv || 0;
    if (d.ab && R.P[c.o].hand.includes(id)) for (const a of d.ab) if (a.ic === 'hand' && condOk(R, c.o, id, a)) { if (a.lvd != null) lv += a.lvd * (a.per ? countOf(R, c.o, id, a.per) : 1); else lv = a.lv; }
    if (R.P[c.o].hand.includes(id)) lv += handLvMod(R, c.o, id);
    if (R.P[c.o].field.includes(id)) { lv += c.lvm || 0; if (!noStat) lv += stat(R, id).lv; }
    return Math.max(0, lv); }
  const enterSt = (R, id) => ((D(R, id).ab || []).some(a => a.ic === 'enter' && condOk(R, R.cards[id].o, id, a)) ? 's' : 'a');
  const kwHas = (R, id, w) => (stat(R, id).kw + ' ' + (R.cards[id].tkw || '') + ' ' + (R.cards[id].ckw || '')).includes(w) && !(R.cards[id].lose || '').includes(w);
  const noTarget = (R, id, src) => kwHas(R, id, 'untarget') || (src != null && R.cards[src] && D(R, src).type === 'event' && kwHas(R, id, 'evsafe')), noAct = (R, id) => kwHas(R, id, 'noact');
  const cardKw = (R, id) => String(D(R, id).kw || '').toLowerCase();
  let _inNm = 0;
  const aliasHit = (R, id, f) => { if (_inNm || R.phase === 'setup' || !(f.name || (f.names && f.names.length))) return false; if (R._nmD === undefined) R._nmD = Object.values(R.defs || {}).some(d => (d.ab || []).some(a => a.nm)); if (!R._nmD) return false;
    _inNm = 1; try { let g = (stat(R, id).nm || '').split('\n').map(x => x.trim()).filter(Boolean);
      { const c0 = R.cards[id]; if (c0 && !onField(R, id) && (R.P[c0.o].deck.includes(id) || R.P[c0.o].rem.includes(id))) g = g.concat((D(R, id).ab || []).filter(a => a.ic === 'static' && a.az && a.nm).map(a => a.nm)); }   // static az: 덱/리무브 에리어에서만 해당 카드명으로도 취급
      return g.some(n => (!f.name || n.includes(f.name)) && (!f.names || !f.names.length || f.names.some(x => n.includes(x)))); } finally { _inNm = 0; } };
  const effN = (R, id) => (R.fl && R.fl.nmx && R.fl.nmx[id] != null && onField(R, id)) ? R.fl.nmx[id] : D(R, id).n;   // 「ターン終了時までカード名を書き換える」効果を反映した現在のカード名
  // v1.12.2: 카드 DB 에 영문으로 인쇄된 이름(id_0438 'SHUICHI AKAI' 등)도 일본어 카드명 조건(「赤井秀一」 등)에 해당한다
  const NAME_ALIAS = { 'SHUICHI AKAI': '赤井秀一', 'Conan Edogawa': '江戸川コナン', 'AIHARA': '灰原哀', 'Ran Mori & Conan Edogawa': '江戸川コナン&毛利蘭\n毛利蘭&江戸川コナン', 'Conan Edogawa & Ai Haibara': '江戸川コナン&灰原哀\n灰原哀&江戸川コナン' };
  const nameOf = n => NAME_ALIAS[n] ? n + '\n' + NAME_ALIAS[n] : n;
  const nameHit = (d, f) => { const n = nameOf(d.n); return (!f.name || n.includes(f.name)) && (!f.names || !f.names.length || f.names.some(x => n.includes(x))); };
  function condOk(R, s, id, ab, ctx) { const c = ab.cond || {}, P = R.P[s], x = ctx || {};
    if (c.viaEffect && !x.viaEffect) return false;
    if (c.viaHint && !R.fl.hw) return false;   // 넥스트 힌트로 얻은 사용 기회 중일 때만(예: 「ネクストヒントで手札から使用する場合」)
    if (c.dstName && !(x.dst != null && R.cards[x.dst] && D(R, x.dst).n.includes(c.dstName))) return false;
    if (c.noMrSel && R.fl.mrSel && R.fl.mrSel[id]) return false;
    if (c.guarded && !(R.fl.guarded && R.fl.guarded[id])) return false;
    if (c.cutinPlayed && R.cards[id].cinN !== R.n) return false;
    if (c.swapLpMin != null && !(x.swLp >= c.swapLpMin)) return false; if (c.swapColor && !(x.swCols || []).includes(c.swapColor)) return false;
    if (c.fieldMin && R.P[0].field.length + R.P[1].field.length < c.fieldMin) return false;
    if (c.selfSt) { const st = R.cards[id].st || 'a'; if (c.selfSt === 'a' ? st !== 'a' : st === 'a') return false; }
    if (c.conly) { const cc = cols(D(R, P.kase)); if (!cc.length || cc.some(k => k !== c.conly)) return false; }
    if (c.nth && (R.fl.entN && R.fl.entN[id]) !== c.nth) return false;
    if (c.noEnter && R.fl.entCnt && R.fl.entCnt[s]) return false; if (c.hayAny && !(R.fl.hayAny && R.fl.hayAny[s])) return false;
    if (c.cnt && c.cnt.length) for (const d of c.cnt) { const l = countOf(R, s, id, d, x) + (d.ref ? (d.plus || 0) : 0), r = d.ref ? countOf(R, s, id, { src: d.ref }, x) : d.n;
      if (!(d.op === 'le' ? l <= r : d.op === 'ge' ? l >= r : d.op === 'lt' ? l < r : d.op === 'gt' ? l > r : l === r)) return false; }
    if (c.via && c.via.length) { if (x.by !== 'effect' || !c.via.some(v => (!v.type || x.stype === v.type) && (x.slv || 0) >= v.lvMin && (!v.color || (x.scol || []).includes(v.color)))) return false; }
    if (c.lpSumMax != null && P.field.reduce((t, y) => t + A.lpOf(R, y), 0) > c.lpSumMax) return false;
    if (c.cname && !D(R, P.kase).n.includes(c.cname)) return false;
    if (c.turn === 'self' && R.turn !== s) return false; if (c.turn === 'opp' && R.turn === s) return false;
    if (c.pcolor && !cols(D(R, P.partner)).includes(c.pcolor) && !pk(R, s, 'pcolorAll')) return false;
    if (c.ccolor) { const cc = cols(D(R, P.kase)); if (!c.ccolor.split(/[&,]/).filter(Boolean).every(k => cc.includes(k))) return false; }
    if (c.ctrait && !traitsOf(D(R, P.kase)).includes(c.ctrait)) return false;
    if (c.cnot && !cols(D(R, P.kase)).some(k => k !== c.cnot)) return false;
    if (c.fileMin && fcount(R, s) < c.fileMin) return false;
    if (c.cstate === 'kase' && R.cards[P.kase].solved) return false; if (c.cstate === 'solve' && !R.cards[P.kase].solved) return false;
    if (c.bond && !P.field.some(y => y !== id && effN(R, y).includes(c.bond))) return false;
    if (c.trace === 'found' && !P.tr) return false; if (c.trace === 'unfound' && P.tr) return false;
    if (c.selfApMin) { const gd = (condOk._g = condOk._g || new Set()); if (gd.has(id)) return false; gd.add(id); let v; try { v = A.ap(R, id); } finally { gd.delete(id); } if (v < c.selfApMin) return false; }  // AP 조건부 상시 능력이 자기 AP 계산을 다시 부르는 무한 재귀 방지(조건 평가 중에는 자기 자신을 제외한 AP 로 판정)
    if (c.killed && !(R.fl.kills && R.fl.kills[id])) return false;
    if (c.handMax != null && P.hand.length > c.handMax) return false; if (c.ohandMax != null && R.P[1 - s].hand.length > c.ohandMax) return false;
    if (c.swapName && !(x.swapped != null && D(R, x.swapped).n.includes(c.swapName))) return false;
    if (c.fh) { const need = c.fhN || 1, nm_ = new Set(); let k = 0; for (const t of [0, 1]) for (const y of R.P[t].field) if (fOk(R, s, y, c.fh, id, true)) { k++; nm_.add(effN(R, y)); } if ((c.fhDist ? nm_.size : k) < need) return false; }
    if (c.fnone) { for (const y of P.field) { if (fOk(R, s, y, c.fnone, id, true) || (R.cards[y].sets || []).some(z => fOk(R, s, z, c.fnone, id, true))) return false; } }   // 自分の現場(キャラと、それにセットされた表向きのカード)に該当するカードがない
    if (c.fa) { if (!P.field.length || !P.field.every(y => fOk(R, s, y, c.fa, id, true))) return false; }
    if (c.paHas && !P.pa.some(y => fOk(R, s, y, c.paHas, id, true))) return false;
    if (c.cin && !(x.cin != null && onField(R, x.cin) && fOk(R, s, x.cin, c.cin, id, true))) return false;
    if (c.ftop) { const T = R.P[c.ftop.who === 'opp' ? 1 - s : s], top = T.file[T.file.length - 1]; if (top == null || (c.ftop.type && D(R, top).type !== c.ftop.type)) return false; }
    if (c.found) { const ds = x.disc || []; if (!ds.some(y => c.found.named ? (x.named && D(R, y).n.includes(x.named)) : fOk(R, s, y, rf(R, c.found.filter, { t: x, cost: x.cost, disc: x.disc }), id, true))) return false; }
    return true; }
  // 개수 세기 (조건 cnt / 1枚につき 배율 공용)
  function countOf(R, s, id, d, x) { const P = R.P[s], O = R.P[1 - s], f = d.f, fo = y => !f || fOk(R, s, y, f, id, true), up = t => R.P[t].evid.filter(y => R.cards[y].up).length;
    switch (d.src) {
      case 'field': return [...R.P[0].field, ...R.P[1].field].filter(y => fOk(R, s, y, f || { own: 'self' }, id, true)).length;
      case 'oppField': return O.field.length; case 'fieldBoth': return R.P[0].field.length + R.P[1].field.length;
      case 'hand': return P.hand.filter(fo).length; case 'oppHand': return O.hand.length;
      case 'file': return fcount(R, s); case 'oppFile': return fcount(R, 1 - s);
      case 'evid': return f ? P.evid.filter(fo).length : P.evid.length; case 'oppEvid': return O.evid.length; case 'evidUp': return up(s); case 'evidDown': return P.evid.length - up(s);
      case 'rem': return P.rem.filter(fo).length; case 'oppRem': return O.rem.length; case 'pa': return P.pa.filter(fo).length;
      case 'sets': return [...((R.cards[id] || {}).fd || []), ...((R.cards[id] || {}).sets || [])].filter(fo).length; case 'fdSets': return ((R.cards[id] || {}).fd || []).filter(fo).length;
      case 'setsAll': return P.field.reduce((n, y) => n + (R.cards[y].fd || []).length, 0);
      case 'under': return ((R.cards[id] || {}).under || []).filter(fo).length;
      default: return 0; } }
  function fOk(R, s, id, f, src, noStat) { f = f || {}; const c = R.cards[id], d = D(R, id);
    const apv = () => noStat ? (c.bAp != null ? c.bAp : (+d.ap || 0)) + (c.apm || 0) + (c.cm || 0) : A.ap(R, id), lpv = () => noStat ? (c.bLp != null ? c.bLp : (+d.lp || 0)) + (c.lpm || 0) : A.lpOf(R, id);
    const sv = k => f[k] === 'self' ? (k.startsWith('ap') ? (R.cards[src] ? A.ap(R, src) : null) : (R.cards[src] ? lvOf(R, src) : null)) : f[k];
    if (f.own === 'self' && c.o !== s) return false; if (f.own === 'opp' && c.o === s) return false;
    if (f.notSelf && id === src) return false; if (f.self && id !== src) return false; if (f.type && d.type !== f.type) return false;
    if (f.lvMax != null || f.lvMin != null || f.lvEq != null || f.lvSet) { const lv = lvOf(R, id, noStat && _inStat > 0), lvm = f.lvMax === 'file' ? fcount(R, s) : sv('lvMax'), lvn = f.lvMin === 'file' ? fcount(R, s) : sv('lvMin');
      if (lvm != null && lv > lvm) return false; if (lvn != null && lv < lvn) return false;
      if (f.lvEq != null && lv !== f.lvEq) return false; if (f.lvSet && !f.lvSet.includes(lv)) return false; }
    if (f.apMax != null || f.apMin != null || f.apEq != null) { const a = apv(), mx = sv('apMax'), mn = sv('apMin'), eq = sv('apEq'); if (mx != null && a > mx) return false; if (mn != null && a < mn) return false; if (eq != null && a !== eq) return false; }
    if (f.apGt === 'self' && R.cards[src] && !(apv() > A.ap(R, src))) return false;
    if (f.lpBase != null && (c.bLp != null ? c.bLp : (+d.lp || 0)) !== f.lpBase) return false;
    if (f.sameName && !(R.cards[src] && effN(R, src) === effN(R, id))) return false;
    if (f.hayFired && !(R.fl.hayFired && R.fl.hayFired[id])) return false; if (f.hasHay && !(d.ab || []).some(a => a.hay)) return false;
    if (f.acted) { const a = R.fl.acted && R.fl.acted[id]; if (!a || (f.acted !== 'any' && a !== f.acted && a !== 'both')) return false; }
    if (f.sets) { const nf = (c.fd || []).length, ns = nf + (c.sets || []).length; if (f.sets === 'any' ? !ns : f.sets === 'none' ? ns : f.sets === 'fdAny' ? !nf : nf) return false; }
    if (f.underMin != null && (c.under || []).length < f.underMin) return false;
    if (f.sameTrait) { const mine = traitsId(R, src); if (!traitsId(R, id).some(t => mine.includes(t))) return false; }
    if (f.colorsMin != null && cols(d).length < f.colorsMin) return false;
    if (f.lpMax != null || f.lpMin != null) { const l = lpv(); if (f.lpMax != null && l > f.lpMax) return false; if (f.lpMin != null && l < f.lpMin) return false; }
    const cl = cols(d);
    if (f.color && !cl.includes(f.color)) return false; if (f.colorNot && !cl.some(k => k !== f.colorNot)) return false;
    if (f.trait && !traitsId(R, id).includes(f.trait)) return false; if (f.traitAny && !f.traitAny.some(t => traitsId(R, id).includes(t))) return false;
    { const rn = R.fl && R.fl.nmx && R.fl.nmx[id] != null && onField(R, id) ? R.fl.nmx[id] : null;
      if (rn != null) { if (!nameHit({ n: rn }, f)) return false; } else if (!nameHit(d, f) && !aliasHit(R, id, f)) return false; if (f.nameNot && (rn != null ? rn : d.n).includes(f.nameNot)) return false; }
    if (f.hasIc) { if (f.hasIc === 'cutin' ? !(/cutin/.test(cardKw(R, id)) || (d.ab || []).some(a => a.ic === 'cutin')) : !(d.ab || []).some(a => a.ic === f.hasIc)) return false; }
    if (f.hasKw && !cardKw(R, id).includes(f.hasKw)) return false;
    if (f.bang && !(d.ab || []).some(a => a.ic === 'flash' && a.bang)) return false;
    if (f.plain && !((d.ab || []).every(a => a.ic === 'cutin' || a.ic === 'flash') && !/[a-z]/.test(cardKw(R, id).replace(/cutin[:=]?\d*/g, '')))) return false;
    if (f.acting && R.actor !== id) return false; if (f.contacting && !(R.sub && (R.sub.atk === id || R.sub.def === id))) return false;
    if (f.st) { const st = (!R.P[c.o].field.includes(id) && c.pst) ? c.pst : (c.st || 'a'); if (f.st === 'sx' ? !(st === 's' || st === 'x') : st !== f.st) return false; }
    if (f.any && f.any.length && !f.any.some(a => fOk(R, s, id, a, src, noStat))) return false;
    return true; }
  // 상징 필터 → 실행 시점 값으로 치환(사용한 카드 레벨, 코스트로 리무브한 카드 레벨, 발견된 카드 레벨, 트리거 대상 특징)
  const isRegS = x => typeof x === 'string' && x.startsWith('reg:');
  function regNum(R, ctx, spec) { const [, ref, agg] = spec.split(':'); const ids = regIds(R, ctx, ref); const lvs = ids.map(x => +D(R, x).lv || 0);
    return agg === 'count' ? ids.length : agg === 'sum' ? lvs.reduce((a, b) => a + b, 0) : agg === 'max' ? Math.max(0, ...lvs) : (lvs[0] || 0); }
  function rf(R, f, ctx) { if (!f) return f; const t = ctx.t || {};
    if (f.lvMax !== 'used' && f.lvMin !== 'used' && f.lvMax !== 'costLv' && f.lvMin !== 'costLv' && !isRegS(f.lvMax) && !isRegS(f.lvMin) && !f.lvIn && !f.traitOf && !f.nameCtx && !(f.any && f.any.length)) return f;
    const g = { ...f };
    for (const k of ['lvMax', 'lvMin']) { if (g[k] === 'used') g[k] = t.lv || 0; else if (g[k] === 'costLv') g[k] = (ctx.cost && ctx.cost.lv) || 0; else if (isRegS(g[k])) g[k] = regNum(R, ctx, g[k]); }
    if (g.nameCtx) { g.name = ctx.named || '\u0000'; g.nameCtx = false; }
    if (g.lvIn === 'disc') { g.lvSet = (ctx.disc || []).map(x => +D(R, x).lv || 0); g.lvIn = ''; }
    if (g.traitOf === 'ent') { g.traitAny = t.ent != null && R.cards[t.ent] ? traitsId(R, t.ent) : []; g.traitOf = ''; }
    if (g.any && g.any.length) g.any = g.any.map(a => rf(R, a, ctx));
    return g; }

  // 상시 능력(static) 합산: 필드 캐릭터·사건에 붙은 static 능력을 대상 카드에 적용
  let _inStat = 0;   // v1.12.2: 상시 효과(stat) 계산 중에는 레벨 필터가 상시 레벨 증감을 다시 계산하지 않는다(재귀 방지). 그 밖(효과 처리/조건 판정)에서는 현재 레벨(상시 증감 포함)로 판정
  function stat(R, id) { const c = R.cards[id], out = { ap: 0, lp: 0, lv: 0, kw: '' }; if (!c || R.phase === 'setup') return out; _inStat++; try {
    for (const t of [0, 1]) { const P = R.P[t]; for (const sid of [...P.field, P.kase, ...P.pa]) { if (sid == null) continue; const d = D(R, sid); if (!d.ab && !(R.cards[sid].sets || []).length && !(R.cards[sid].tab || []).length) continue; const pa = P.pa.includes(sid);
      for (const ab of abList(R, sid)) { if (ab.ic !== 'static' || ab.az || (pa && !ab.pa) || !condOk(R, t, sid, ab)) continue; const g = ab.tgt || { sel: 'self' };
        const hit = g.sel === 'self' ? sid === id : g.sel === 'allies' ? c.o === t && !(g.notSelf && sid === id) && fOk(R, t, id, g.filter, sid, true)
          : g.sel === 'opp' ? c.o !== t && fOk(R, t, id, g.filter, sid, true) : !(g.notSelf && sid === id) && fOk(R, t, id, g.filter, sid, true);
        if (hit && (sid === id || R.P[c.o].field.includes(id))) { const m = ab.per ? countOf(R, t, sid, ab.per) : 1; out.ap += (ab.ap || 0) * m; out.lp += (ab.lp || 0) * m; out.lv += (ab.lv || 0) * m; if (ab.kw) out.kw += ' ' + ab.kw; if (ab.tr) out.tr = (out.tr || '') + ' ' + ab.tr; if (ab.nm) out.nm = (out.nm || '') + '\n' + ab.nm; } } } } } finally { _inStat--; }
    return out; }
  // 플레이어 단위 상시 효과(pk): 예) 상대는 【ヒラメキ】를 발동할 수 없다
  function pk(R, s, key) { const P = R.P[s]; if ((R.fl.pk && R.fl.pk[s] && R.fl.pk[s][key]) || (R.fl.pkA && R.fl.pkA[s] && R.fl.pkA[s][key])) return true;
    for (const sid of [...P.field, P.kase, P.partner, ...P.pa]) { if (sid == null) continue; const pa = P.pa.includes(sid);
      for (const ab of abList(R, sid)) if (ab.ic === 'static' && ab.pk === key && !(pa && !ab.pa) && condOk(R, s, sid, ab)) return true; }
    return false; }

  const pkVals = (R, s, key) => { const P = R.P[s], out = [];
    for (const sid of [...P.field, P.kase, P.partner, ...P.pa]) { if (sid == null) continue; const pa = P.pa.includes(sid);
      for (const ab of abList(R, sid)) if (ab.ic === 'static' && ab.pk === key && !(pa && !ab.pa) && condOk(R, s, sid, ab)) out.push(ab.tr || ''); }
    return out; }
  // ───────────── 트리거 / 큐 ─────────────
  function fire(R, ic, id, ctx = {}) { const c = R.cards[id]; if (!c) return; const pa = inPa(R, id);
    (ic === 'onremoved' && c.lkiAb && c.lkiAb.length ? abList(R, id).concat(c.lkiAb) : abList(R, id)).forEach((ab, i) => { if (ab.ic !== ic || (pa && !ab.pa)) return; if (ctx.gonly && i < (D(R, id).ab || []).length && !(ctx.oppEnd && ab.cond && ab.cond.turn === 'opp')) return; if (ab.on) { if (ab.on.k && ctx.k !== ab.on.k) return; if (ab.on.by && ctx.by !== ab.on.by) return; }
      const s = c.o; if (ab.ef && !(ctx.ent != null && fOk(R, s, ctx.ent, ab.ef, id))) return; if (!condOk(R, s, id, ab, ctx)) return;
      if (ab.lim) { c.u = c.u || {}; if ((c.u[i] || 0) >= ab.lim) return; c.u[i] = (c.u[i] || 0) + 1; }
      if (ab.hay) { R.fl.hayFired = R.fl.hayFired || {}; R.fl.hayFired[id] = 1; R.fl.hayAny = R.fl.hayAny || [0, 0]; R.fl.hayAny[s] = 1; }
      R.q.push({ kind: 'ab', s, src: id, ab, ctx }); }); if (ic === 'onremoved') c.lkiAb = null; }
  function noteEnter(R, s, id) { R.fl.entCnt = R.fl.entCnt || [0, 0]; R.fl.entN = R.fl.entN || {}; R.fl.entCnt[s]++; let n = R.fl.entCnt[s]; if (R.fl.hayIgn && R.fl.hayIgn[s]) { R.fl.hayIgn[s] = 0; n = 1; } R.fl.entN[id] = n; }
  function carry(R, s) { Object.values(R.cards).forEach(c => { c.bAp = c.bLp = null; c.lose = ''; }); Object.entries(R.cards).forEach(([id, c]) => { const nx = c.nx; c.nx = null; if (!nx) return; for (const e of nx) if (e.t === s && onField(R, +id)) { const keep = R.turn; applyTo(R, s, +id, +id, e.d, e.v, 'turn', e.g); } }); }
  // 범용 이벤트 버스: 게임 중 일어난 사건(ev)을 현장·사건·파트너·파트너 에리어의 ic:'ontrig' 능력에 알린다
  function bus(R, ev, ctx = {}) { if (R.phase !== 'play') return; const seen = new Set();
    if (ev === 'guard' && ctx.tid != null) (R.fl.guarded = R.fl.guarded || {})[ctx.tid] = 1;   // 이 턴에 이 캐릭터의 액션이 가드되었다(조건 guarded)
    if (R.fl.tmp && R.fl.tmp.length) { const keep = []; for (const e of R.fl.tmp) { if (e.evs.includes(ev) && (!e.who || ((ctx.s === e.s) === (e.who === 'self'))) && (!e.sf || (ctx.ent != null && R.cards[ctx.ent] && fOk(R, e.s, ctx.ent, e.sf, e.src, true)))) { R.q.push({ kind: 'ab', s: e.s, src: e.src, ab: { ic: 'ontrig', ops: e.ops, txt: '예약 효과', evs: [ev] }, ctx: { ...ctx } }); if (e.keep) keep.push(e); } else keep.push(e); } R.fl.tmp = keep; }
    const holders = []; for (const t of [0, 1]) { const P = R.P[t]; for (const h of [...P.field, P.kase, P.partner, ...P.pa]) if (h != null && !seen.has(h)) { seen.add(h); holders.push(h); } }
    if ((ev === 'removed' || ev === 'setOff' || ev === 'handRem' || ev === 'holdLeft') && ctx.ent != null && !seen.has(ctx.ent)) holders.push(ctx.ent);
    if (ev === 'disguise' && ctx.swapped != null && !seen.has(ctx.swapped)) holders.push(ctx.swapped);   // 변장으로 교체되어 떠난 카드의 「…와 교체되었을 때」
    for (const t of [0, 1]) for (const h of R.P[t].rem) if (!seen.has(h) && abList(R, h).some(a => a.ic === 'ontrig' && a.fromRem)) { seen.add(h); holders.push(h); }
    for (const h of holders) { const c = R.cards[h]; if (!c) continue; const d = D(R, h); if (!d || !abList(R, h).some(a => a.ic === 'ontrig')) continue; const s = c.o, pa = inPa(R, h), away = !onField(R, h) && !inPa(R, h) && R.P[s].partner !== h && R.P[s].kase !== h;
      abList(R, h).forEach((ab, i) => { if (ab.ic !== 'ontrig' || !ab.evs.includes(ev) || (pa && !ab.pa)) return;
        if (ab.sw && ctx.swapped !== h) return;
        if (away && !((ev === 'removed' || ev === 'setOff' || ev === 'handRem' || ev === 'holdLeft') && ctx.ent === h && (ab.sub === 'self' || ab.incl)) && !(ev === 'disguise' && ab.sw && ctx.swapped === h) && !(ab.fromRem && R.P[s].rem.includes(h))) return;
        if (ab.who && ((ctx.s === s) !== (ab.who === 'self'))) return;
        if (ab.sub === 'self' && ctx.ent !== h) return; if (ab.sub === 'notSelf' && ctx.ent === h) return;
        if (ab.sf && !(ab.sub === 'orSelf' && ctx.ent === h) && !(ctx.ent != null && R.cards[ctx.ent] && fOk(R, s, ctx.ent, ab.sf, h, true))) return;
        if (ab.sub === 'orSelf' && !ab.sf && ctx.ent !== h) return;
        if (ab.es && !(ab._from != null && ctx.ent === ab._from)) return;
        if (ab.tself && ctx.tid !== h) return; if (ab.dself && ctx.dst !== h) return; if (ab.hself && ctx.holder !== h) return; if (ab.hw && (ctx.holder == null || !R.cards[ctx.holder] || (R.cards[ctx.holder].o === s) !== (ab.hw === 'self'))) return; if (ab.tf && !(ctx.tid != null && R.cards[ctx.tid] && fOk(R, s, ctx.tid, ab.tf, h, true))) return;
        if (ab.k && ctx.k !== ab.k) return; if (ab.by && ctx.by !== ab.by) return; if (ab.cz && (ctx.cz == null || (ctx.cz === s) !== (ab.cz === 'self'))) return;
        if (!condOk(R, s, h, ab, ctx)) return;
        if (ab.lim) { c.u = c.u || {}; if ((c.u[i] || 0) >= ab.lim) return; c.u[i] = (c.u[i] || 0) + 1; }
        R.q.push({ kind: 'ab', s, src: h, ab, ctx, first: !!ab.first }); }); } }
  const nameBanned = (R, s, id) => !!(R.fl.noName && R.fl.noName[s] && R.fl.noName[s].some(n => D(R, id).n.includes(n)));
  const fieldMax = (R, s) => pk(R, s, 'field4') ? 4 : 5;
  const fieldPa = (R, s) => [...R.P[s].field, ...R.P[s].pa];
  // 자신의 현장(과 파트너 에리어) 캐릭터 전원에게 '다른 캐릭터가 …했을 때' 트리거를 알린다
  const fireAlly = (R, s, ent, ctx) => fieldPa(R, s).forEach(x => fire(R, 'onally', x, { ...ctx, ent }));
  const fireAllyKill = (R, s, ent, victim) => fieldPa(R, s).forEach(x => fire(R, 'onallykill', x, { by: 'contact', ent, victim }));
  const fireAllyContact = (R, s, ent) => fieldPa(R, s).forEach(x => fire(R, 'onallycontact', x, { ent }));
  const fireMain = (R, s) => fieldPa(R, s).forEach(x => fire(R, 'onmain', x, {}));
  const remLeft = (R, s, ids) => ids.forEach(e => fieldPa(R, s).forEach(x => fire(R, 'onremleave', x, { ent: e })));
  function queueEvent(R, s, id) { const d = D(R, id); const abs = (d.ab || []).filter(a => a.ic === 'event' || a.ic === 'manual');
    R.q.push({ kind: 'event', s, src: id, abs }); }
  function queueFlash(R, s, id) { R.q.push({ kind: 'flash', s, src: id }); }
  function setSolved(R, s) { const k = R.P[s].kase; if (R.cards[k].solved) return; R.cards[k].solved = true; say(R, `${nm(s)}의 사건이 해결편으로 이행!`); fire(R, 'onsolve', k, {}); }

  const release = (R, id) => { const c = R.cards[id]; if (!c) return;
    if (c.sets && c.sets.length) { const ss = c.sets.slice(); c.sets = []; ss.forEach(x => { R.cards[x].setOn = null; R.P[R.cards[x].o].rem.push(x); bus(R, 'setOff', { s: R.cards[x].o, ent: x, holder: id }); }); }
    if (c.fd && c.fd.length && kwHas(R, id, 'fdhand') && ((R.curS != null && R.curS !== c.o) || R._why === 'contact')) { const hs = c.fd.slice(); c.fd = []; hs.forEach(x => { R.cards[x].fdOn = null; R.P[R.cards[x].o].hand.push(x); }); say(R, `${D(R, id).n}: 뒷면 세트 카드 ${hs.length}장을 리무브하는 대신 손패로`); }
    if (c.fd && c.fd.length) { const fs = c.fd.slice(); c.fd.forEach(x => { R.cards[x].fdOn = null; R.P[R.cards[x].o].rem.push(x); }); c.fd = []; fs.forEach(x => bus(R, 'fdOff', { s: R.cards[x].o, ent: x, holder: id })); }
    if (c.under && c.under.length) { c.under.forEach(x => R.P[R.cards[x].o].rem.push(x)); c.under = []; } };
  const leave = (R, id) => { const c = R.cards[id]; const sx = (c.sets || []).slice(); release(R, id); R.P[c.o].field = R.P[c.o].field.filter(x => x !== id); sx.forEach(x => bus(R, 'holdLeft', { s: c.o, ent: x, holder: id })); // 세트된 카드가 있던 캐릭터가 떠남(떠난 뒤의 현장 기준으로 조건 판정)
    c.st = 'a'; c.apm = c.cm = c.lpm = c.lvm = 0; c.sum = 0; c.tkw = ''; c.tab = []; c.bAp = c.bLp = null; c.nx = null; c.lose = ''; c.hold = null; c.ckw = ''; c.blank = 0; c.tmod = null; };
  // 현장을 떠난 카드를 목적지로: MR 은 상대 턴에 떠나면 (어디로 가든) 파트너 에리어로 이동(룰: 대체 효과가 아님)
  function moveOut(R, id, to) { const c = R.cards[id], o = c.o, P = R.P[o]; const was = P.field.includes(id); leave(R, id);
    let z = to; if (was && isMR(R, id) && R.turn !== o) z = 'pa';
    if (z === 'pa') { P.pa.push(id); say(R, `${D(R, id).n}: 상대 턴에 현장을 떠나 파트너 에리어로 이동`); }
    else if (z === 'hand') P.hand.push(id); else if (z === 'deckTop') P.deck.push(id); else if (z === 'deckBottom') P.deck.unshift(id); else P.rem.push(id);
    return z; }
  function rmChar(R, id, why, killer) { const c = R.cards[id], o = c.o; c.lkiBlank = c.blank ? 1 : 0; c.pst = c.st || 'a'; c.ptm = c.tmod || null; c.lkiAb = abList(R, id).filter(a => !(D(R, id).ab || []).includes(a)); R._why = why; try { moveOut(R, id, 'rem'); } finally { R._why = null; } if (!(why === 'contact' && R.turn !== o && pk(R, R.turn, 'noremtrig'))) fire(R, 'onremoved', id, { by: why || 'effect' }); c.lkiBlank = 0;
    fieldPa(R, o).forEach(x => x !== id && fire(R, 'onallyremoved', x, { by: why || 'effect', ent: id }));
    bus(R, 'removed', { s: o, ent: id, tid: killer, by: why || 'effect', cz: why === 'contact' || why === 'switch' ? null : (R.curS != null ? R.curS : null) }); }
  function mrEnter(R, s, id) { if (!isMR(R, id)) return; const P = R.P[s];
    for (const x of P.field.slice()) if (x !== id && isMR(R, x)) { say(R, `MR 능력: 현장의 ${D(R, x).n} 리무브`); rmChar(R, x, 'effect'); }
    for (const x of P.pa.slice()) if (isMR(R, x)) { P.pa = P.pa.filter(y => y !== x); P.rem.push(x); say(R, `MR 능력: 파트너 에리어의 ${D(R, x).n} 리무브`); } }
  const winAlt = (R, s) => { const P = R.P[s]; for (const id of [P.kase, P.partner]) for (const ab of abList(R, id)) if (ab.ic === 'winalt' && condOk(R, s, id, ab)) return ab; return null; };

  // 대체 효과(【相手ターン中】…現場から離れる代わりに…)
  function replaceCands(R, victim, srcOwner, by) { const vo = R.cards[victim].o; if (srcOwner === vo || !onField(R, victim)) return []; const res = [];
    for (const id of fieldPa(R, vo)) { const c = R.cards[id], pa = inPa(R, id); abList(R, id).forEach((ab, i) => { if (ab.ic !== 'replace' || !ab.rep || (pa && !ab.pa)) return;
      if (id === victim && (ab.cost || []).some(k => ['selfRem', 'selfBottom', 'selfPa'].includes(k.c))) return; // 自分自身を離す代わりに自分自身を支払うことはできない(カード重複の原因)
      if (ab.ef && !fOk(R, vo, victim, ab.ef, id, true)) return; if (!condOk(R, vo, id, ab, { by })) return; if (ab.lim && ((c.u || {})[i] || 0) >= ab.lim) return;
      if ((ab.cost || []).some(k => canPayOne(R, vo, id, k))) return; res.push({ id, i, ab }); }); }
    return res; }
  const replaceAvail = (R, victim, srcOwner, by) => replaceCands(R, victim, srcOwner, by).length > 0;
  function* replaceCheck(R, victim, srcOwner, by) { const vo = R.cards[victim].o;
    for (const { id, i, ab } of replaceCands(R, victim, srcOwner, by)) { const c = R.cards[id]; if (!onField(R, victim) || !(onField(R, id) || inPa(R, id))) continue;
      if (!ab.forced) { const yes = yield { who: vo, kind: 'yn', msg: ab.msg || `${D(R, id).n}을(를) 리무브하고, ${D(R, victim).n}이(가) 현장을 떠나는 대신 ${ab.rep.to === 'hand' ? '손패로 돌아가게' : '이동시키게'} 할까요?` }; if (!yes) continue; }
      if (ab.lim) { c.u = c.u || {}; c.u[i] = (c.u[i] || 0) + 1; }
      const cx2 = { done: true, t: {}, cost: {} }; for (const k of ab.cost || []) yield* pay(R, vo, id, k, cx2);
      if (ab.rep.unsetSelf && ab._from != null && (R.cards[id].sets || []).includes(ab._from)) { say(R, `[대체 효과] ${D(R, ab._from).n}을(를) 리무브`); unsetOne(R, id, ab._from); }
      say(R, `[대체 효과] ${D(R, id).n}: ${D(R, victim).n}은(는) 현장을 떠나는 대신 ${ab.rep.to === 'stay' ? '현장에 남음' : '이동'}`); return ab.rep.to; }
    return null; }

  // ───────────── 실행기(제너레이터: 선택이 필요하면 yield) ─────────────
  const ally = (R, s) => R.P[s].field;
  const pickReq = (who, msg, ids, min, max, o = {}) => ({ who, kind: 'pick', msg, ids, sel: o.sel || ids, min, max, ordered: !!o.ordered, distinct: !!o.distinct, dlv: !!o.dlv, reveal: o.reveal ? 1 : 0, sumLv: o.sumLv == null ? null : o.sumLv });
  const cx = ctx => ({ ...ctx.t, ...ctx });
  function* placeCards(R, s, src, ids, asleep, ctx) { const P = R.P[s]; if (!ids.length) return;
    ids = ids.filter(x => !nameBanned(R, s, x)); const free = fieldMax(R, s) - P.field.length, over = ids.length - free;
    if (over > 0) { const cand = P.field.slice(); const rep = over >= cand.length ? cand : yield pickReq(s, `현장이 가득 찼습니다 — 스위치로 리무브할 내 캐릭터 ${over}장을 선택`, cand, over, over);
      rep.forEach(x => { rmChar(R, x, 'switch'); say(R, '스위치!'); }); }
    ids = ids.filter(x => !nameBanned(R, s, x));
    for (const id of ids) { if (P.field.length >= fieldMax(R, s)) break; const c = R.cards[id]; P.field.push(id); c.st = (asleep || enterSt(R, id) === 's') ? 's' : 'a'; c.sum = 1; c.apm = c.cm = c.lpm = c.lvm = 0; c.tkw = ''; c.tab = [];
      say(R, `${nm(s)} 등장: ${D(R, id).n}` + (c.st === 's' ? ' (슬립)' : '')); if (ctx) { (ctx.played = ctx.played || []).push(id); ctx.reg = ctx.reg || {}; (ctx.reg.played = ctx.reg.played || []).push(id); ctx.last = 'played'; }
      mrEnter(R, s, id); noteEnter(R, s, id);
      const cxt = { by: 'effect', stype: D(R, src).type, slv: lvOf(R, src), scol: cols(D(R, src)) }; fire(R, 'onplay', id, cxt); fireAlly(R, s, id, cxt); bus(R, 'enter', { s, ent: id, by: 'effect' }); } }
  function applyTo(R, s, src, id, d, v, until, g) { const c = R.cards[id]; if (!c) return;
    if (until === 'oppEnd' && ['ap', 'lp', 'lv', 'kw', 'lpBase', 'apBase', 'gab'].includes(d) && onField(R, id)) (c.nx = c.nx || []).push({ d, v, g, t: R.turn });
    switch (d) {
      case 'lpBase': c.bLp = +v || 0; break; case 'apBase': c.bAp = +v || 0; break;
      case 'evid': case 'evidUp': { const o = c.o; moveOut(R, id, 'rem'); R.P[o].rem = R.P[o].rem.filter(x => x !== id); c.up = d === 'evidUp'; R.P[o].evid.push(id); bus(R, 'evgain', { s: o, by: 'effect' }); break; }
      case 'pa': { const o = c.o; moveOut(R, id, 'rem'); R.P[o].rem = R.P[o].rem.filter(x => x !== id); R.P[o].pa.push(id); break; }
      case 'kwLose': c.lose = (c.lose || '') + ' ' + v; break;
      case 'hold': c.hold = s != null && R.cards[src] ? src : null; break;
      case 'sleep': if (c.st !== 'x') { const was = (c.st || 'a') === 'a'; c.st = 's'; if (was && onField(R, id)) bus(R, 'sleepEv', { s: c.o, ent: id, by: 'effect', cz: s }); } break; case 'stun': c.st = 'x'; break; case 'active': c.st = c.st === 'x' ? 's' : 'a'; break;
      case 'remove': rmChar(R, id, 'effect'); break;
      case 'hand': moveOut(R, id, 'hand'); break;
      case 'deckBottom': moveOut(R, id, 'deckBottom'); break; case 'deckTop': moveOut(R, id, 'deckTop'); break;
      case 'ap': if (until === 'contact') c.cm = (c.cm || 0) + (+v || 0); else c.apm = (c.apm || 0) + (+v || 0); break;
      case 'lp': c.lpm = (c.lpm || 0) + (+v || 0); break; case 'lv': c.lvm = (c.lvm || 0) + (+v || 0); break;
      case 'kw': c.tkw = (c.tkw || '') + ' ' + v; break;
      case 'gab': if (g) (c.tab = c.tab || []).push(g); break; } }
  // 상대의 효과로 현장을 떠나는 경우 대체 효과를 확인한 뒤 적용
  function* applyG(R, s, src, id, d, v, until, g) { const c = R.cards[id]; if (!c) return;
    { const so = R.cards[src] ? R.cards[src].o : s, isEv = R.cards[src] && D(R, src).type === 'event';   // 상대의 능력/이벤트 효과로부터의 보호(정적 키워드)
      if (c.o !== so && onField(R, id)) { if (d === 'remove' && (kwHas(R, id, 'nrm-ab') || (isEv && kwHas(R, id, 'nrm-ev')))) { say(R, `${D(R, id).n}: 효과로 리무브되지 않음`); return; }
        if (d === 'sleep' && kwHas(R, id, 'nsl-ab')) return; if (d === 'stun' && kwHas(R, id, 'nst-ab')) return; } }
    if (['remove', 'hand', 'deckBottom', 'deckTop'].includes(d) && onField(R, id)) { const so = R.cards[src] ? R.cards[src].o : s; const rep = yield* replaceCheck(R, id, so, 'effect'); if (rep) d = rep; }
    applyTo(R, s, src, id, d, v, until, g); }
  function* doActs(R, s, src, ids, o, ctx) { const alt = o.alt && condOk(R, s, src, { cond: o.alt.cond }, cx(ctx));
    for (const id of ids) { if (o.when === 'lpLeOwnMax') { const mx = Math.max(0, ...R.P[s].field.map(x => A.lpOf(R, x))); if (A.lpOf(R, id) > mx) continue; }
      for (const a of o.acts && o.acts.length ? o.acts : [{ do: o.do, v: o.v, until: o.until }]) { const dd = alt ? o.alt.do : a.do; let v = a.v; if (a.per === 'flip') v = String((+a.v || 0) * ((ctx.cost && ctx.cost.flip || []).length));
        if (dd === 'mark') continue;
        if (dd === 'deckTopOrBottom') { const top = yield { who: s, kind: 'yn', msg: `${D(R, id).n}을(를) 덱 위로 보낼까요? (아니오 = 아래)`, yes: '위', no: '아래' }; yield* applyG(R, s, src, id, top ? 'deckTop' : 'deckBottom'); }
        else yield* applyG(R, s, src, id, dd, v, a.until, a.g); } } }
  const faceDown = (R, t) => R.P[t].evid.filter(x => !R.cards[x].up);
  // ── 증거 앞면 처리의 "유일한" 공통 경로 (효과 op 'flip', 코스트 flipEvid, 그 밖의 모든 증거 flip 이 이걸 쓴다).
  //   서버의 canonical 상태(R.cards[id].up)를 바꾸고, 클라이언트는 view 의 P.evl(증거 순서대로 앞면이면 카드, 뒷면이면 0)을 그대로 그린다.
  //   ids 를 주면 그 증거만(합법성 검증: 해당 플레이어의 뒷면 증거), 안 주면 무작위 n장(뒷면 증거의 정체는 누구도 모르므로 선택과 동일).
  function flipEv(R, t, n, ids) {
    const down = faceDown(R, t); let pick;
    if (ids) { pick = ids.filter((x, i) => down.includes(x) && ids.indexOf(x) === i).slice(0, n); } else { const c = down.slice(); shuf(c); pick = c.slice(0, n); }
    pick.forEach(x => { R.cards[x].up = true; }); return pick; }
  // 증거를 "직접 고르는" 요청의 선택지: 위치(pos)를 붙여 클라이언트가 그 증거를 강조/클릭하게 한다. ids 는 증거 순서(P.evid 순)대로 넘긴다.
  //   뒷면 증거의 정체는 내보내지 않고 "n번째 뒷면 증거"로만 보인다 (hid=1). 선택지 번호 = ids 의 순서.
  const evOpts = (R, t, ids) => { const E = R.P[t].evid, labels = [], pos = [], hid = [];
    ids.forEach(x => { const i = E.indexOf(x), up = !!R.cards[x].up; pos.push(i); hid.push(up ? 0 : 1); labels.push(up ? `${i + 1}번째 앞면 증거: ${D(R, x).n}` : `${i + 1}번째 뒷면 증거`); });
    return { labels, evp: { t, pos, hid } }; };

  // 뒷면 증거를 n장 표향으로: 효과 텍스트가 위치를 정하지 않으면(= "뒷면 증거 1개") 효과를 쓰는 플레이어가 직접 고른다. 전부 뒤집는 경우(n ≥ 뒷면 수)는 선택이 무의미하므로 바로 처리.
  //   위치가 정해진 효과(맨 위 n장 등)는 이 함수를 쓰지 않고 flipEv 에 ids 를 직접 넘긴다.
  function* flipPick(R, s, t, n, why) { const down = faceDown(R, t); if (n >= down.length) return flipEv(R, t, n);
    const ids = []; let rest = down.slice();
    for (let i = 0; i < n; i++) { const cand = R.P[t].evid.filter(x => rest.includes(x)), o = evOpts(R, t, cand);
      const j = yield { who: s, kind: 'opt', fp: 1, msg: `${t === s ? '내' : '상대'} 뒷면 증거 중 표향으로 할 증거를 선택${n > 1 ? ` (${i + 1}/${n})` : ''}${why ? ' — ' + why : ''}`, labels: o.labels, evp: o.evp };
      const m = cand[+j] !== undefined ? cand[+j] : cand[0]; ids.push(m); rest = rest.filter(x => x !== m); }
    return flipEv(R, t, n, ids); }

  function unsetOne(R, holder, x) { const h = R.cards[holder], wasSet = (h.sets || []).includes(x), wasFd = (h.fd || []).includes(x); h.fd = (h.fd || []).filter(y => y !== x); h.sets = (h.sets || []).filter(y => y !== x); R.cards[x].fdOn = null; R.cards[x].setOn = null; R.P[R.cards[x].o].rem.push(x); if (wasSet) bus(R, 'setOff', { s: R.cards[x].o, ent: x, holder }); if (wasFd) bus(R, 'fdOff', { s: R.cards[x].o, ent: x, holder }); }
  const unsetPool = (R, s, src, k) => k.scope === 'any' ? [0, 1].flatMap(t => R.P[t].field).flatMap(h => setCards(R, h, !!k.fd)) : k.scope === 'mine' ? R.P[s].field.flatMap(h => setCards(R, h, !!k.fd)) : k.scope === 'opp' ? R.P[1 - s].field.flatMap(h => setCards(R, h, !!k.fd)) : setCards(R, src, !!k.fd);
  const setCards = (R, id, fdOnly) => [...(R.cards[id].fd || []), ...(fdOnly ? [] : (R.cards[id].sets || []))];

  // ───────────── 결과 레지스터(직전 op 의 선택/이동/공개/리무브/드로우 결과를 이후 op 가 참조) ─────────────
  function regIds(R, ctx, ref) { const g = ctx.reg || {}; if (ref === 'last') ref = ctx.last || 'sel';
    if (ref === 'cost') { const co = ctx.cost || {}; return [...(co.rem || []), ...(co.disc || [])].filter((x, i, a) => a.indexOf(x) === i); }
    if (ref === 'costRev') return ((ctx.cost && ctx.cost.rev) || []).slice();
    if (ref === 'self') return ctx.src != null ? [ctx.src] : [];
    if (ref === 'ent') { const e = ctx.t && ctx.t.ent; return e != null ? [e] : []; }
    if (ref === 'cin') { const e = ctx.t && ctx.t.cin; return e != null ? [e] : []; }
    return (g[ref] || []).slice(); }
  const setReg = (ctx, name, ids) => { (ctx.reg = ctx.reg || {})[name] = ids.slice(); if (name !== 'rest' && name !== 'hit') ctx.last = name; };
  const regNumBy = (R, ids, by) => by === 'lv' ? ids.reduce((t, x) => t + (+D(R, x).lv || 0), 0) : by === 'ap1000' ? ids.reduce((t, x) => t + Math.floor((+D(R, x).ap || 0) / 1000), 0) : ids.length;
  const dynNum = (R, s, src, o, ctx) => (o.nref ? regNumBy(R, regIds(R, ctx, o.nref.ref), o.nref.by) : o.ncnt ? countOf(R, s, src, { ...o.ncnt, f: rf(R, o.ncnt.f, ctx) }, ctx.t || {}) : o.n) * (o.nmul && (o.nref || o.ncnt) ? o.nmul : 1);
  // 카드를 있는 영역에서 뺀다(소유자 영역/세트/겹침). 뺀 곳을 돌려준다.
  function takeOut(R, id) { const c = R.cards[id], P = R.P[c.o];
    if (c.fdOn != null) { const h = R.cards[c.fdOn]; if (h) h.fd = (h.fd || []).filter(y => y !== id); c.fdOn = null; return 'fd'; }
    if (c.setOn != null) { const h = R.cards[c.setOn]; if (h) h.sets = (h.sets || []).filter(y => y !== id); c.setOn = null; return 'set'; }
    for (const t of [0, 1]) for (const h of [...R.P[t].field, ...R.P[t].pa]) { const hc = R.cards[h]; if (hc && hc.under && hc.under.includes(id)) { hc.under = hc.under.filter(y => y !== id); return 'under'; } }
    for (const z of ['hand', 'deck', 'rem', 'pa', 'evid', 'file']) if (P[z].includes(id)) { P[z] = P[z].filter(y => y !== id); return z; }
    if (P.field.includes(id)) { leave(R, id); return 'field'; }
    return null; }
  function* moveCards(R, s, src, ids, to, o, ctx) { ids = ids.filter(x => R.cards[x]); if (!ids.length) return [];
    const moved = [], byOwn = x => R.cards[x].o;
    if (to === 'field' || to === 'fieldSleep') { ids = ids.filter(x => R.cards[x].o === s && D(R, x).type === 'char').slice(0, 5); for (const id of ids) { const ow = byOwn(id); const z = takeOut(R, id); if (z === 'rem') remLeft(R, ow, [id]); if (z === 'deck') chk(R, ow); R.cards[id].up = false; moved.push(id); }
      yield* placeCards(R, s, src, moved, to === 'fieldSleep', ctx); return moved; }
    let list = ids.slice(); const isDeck = to === 'deckTop' || to === 'deckBottom' || to === 'deckTopOrBottom';
    if (isDeck && o.order === 'any' && list.length > 1) { const ch = o.by === 'opp' ? 1 - s : s; list = yield pickReq(ch, `${list.length}장을 ${to === 'deckTop' ? '덱 위' : '덱 아래'}에 놓을 순서대로 클릭`, list, list.length, list.length, { ordered: true }); }
    else if (o.order === 'shuffle') shuf(list);
    if (to === 'deckTop') list = list.slice().reverse();   // 먼저 고른 카드가 가장 위에 오도록
    let dest = to; const perDest = {};
    if (to === 'deckTopOrBottom') for (const x of list) { const top = yield { who: o.by === 'opp' ? 1 - s : s, kind: 'yn', msg: `${D(R, x).n}을(를) 덱 위로 보낼까요? (아니오 = 아래)`, yes: '위', no: '아래' }; perDest[x] = top ? 'deckTop' : 'deckBottom'; }
    let holder = src; if (to === 'under' && o.tf) { const hc = R.P[s].field.filter(x => fOk(R, s, x, rf(R, o.tf, ctx), src, true)); if (!hc.length) return []; holder = hc.length === 1 ? hc[0] : (yield pickReq(s, '카드를 아래에 겹칠 캐릭터를 선택', hc, 1, 1))[0]; }
    if (to === 'under' && !onField(R, holder)) return [];
    for (const id of list) { const c = R.cards[id], ow = byOwn(id), T = R.P[ow]; if (!c) continue; if (to === 'deckTopOrBottom') dest = perDest[id];
      if (T.field.includes(id)) { if (dest === 'rem') { rmChar(R, id, 'effect'); moved.push(id); continue; }
        if (['hand', 'deckTop', 'deckBottom'].includes(dest)) { yield* applyG(R, s, src, id, dest); if (!T.field.includes(id)) moved.push(id); continue; }
        leave(R, id); }
      else { const z = takeOut(R, id); if (z === 'rem' && dest !== 'rem') remLeft(R, ow, [id]); if (z === 'deck' && !isDeck) chk(R, ow); }   // 덱 안의 위치 이동(덱 위/아래)은 일시적으로 덱이 비어도 리프레시하지 않는다
      c.st = 'a'; c.up = false;
      switch (dest) {
        case 'hand': T.hand.push(id); break; case 'deckTop': T.deck.push(id); break; case 'deckBottom': T.deck.unshift(id); break; case 'rem': T.rem.push(id); break; case 'pa': T.pa.push(id); break;
        case 'evidUp': c.up = true; T.evid.push(id); bus(R, 'evgain', { s: ow, by: 'effect' }); break; case 'evidDown': T.evid.push(id); bus(R, 'evgain', { s: ow, by: 'effect' }); break;
        case 'under': (R.cards[holder].under = R.cards[holder].under || []).push(id); break;
        case 'fileBottomUp': c.up = true; T.file.unshift(id); break; case 'fileTop': T.file.push(id); break;
        default: T.hand.push(id); }
      moved.push(id); }
    if (o.sd && isDeck) { const owners = new Set(list.map(byOwn)); owners.forEach(w => shuf(R.P[w].deck)); }
    return moved; }
  const yn = (who, msg) => ({ who, kind: 'yn', msg });
  const REGS_RT = ['sel', 'played', 'seen', 'hit', 'chosen', 'chosen2', 'rest', 'revealed', 'removed', 'drawn', 'moved', 'cost', 'costRev', 'last', 'ent', 'cin'];

  // 「相手の能力や効果によって選ばれたとき」(onchosen): 선택된 카드(또는 그 아군)의 능력이 먼저 해결되고, 무효가 되면 그 카드는 대상에서 빠진다
  function* chosenCheck(R, s, src, ids, it) { if (src == null || !R.cards[src]) return ids; const so = R.cards[src].o, out = [];
    for (const id of ids) { const c = R.cards[id]; if (c && c.o === so && isMR(R, src)) { R.fl.mrSel = R.fl.mrSel || {}; R.fl.mrSel[id] = 1; }   // 「自分のMRの能力によって選ばれた」記録
      if (!c || c.o === so) { out.push(id); continue; } let neg = false; const todo = [];
      for (const h of fieldPa(R, c.o)) { const hc = R.cards[h]; abList(R, h).forEach((ab, i) => { if (ab.ic !== 'onchosen') return;
          if (ab.ef ? !fOk(R, c.o, id, ab.ef, h, true) : h !== id) return; if (!condOk(R, c.o, h, ab, { chooser: so })) return;
          if (ab.lim) { hc.u = hc.u || {}; if ((hc.u[i] || 0) >= ab.lim) return; hc.u[i] = (hc.u[i] || 0) + 1; } todo.push({ h, ab }); }); }
      for (const { h, ab } of todo) { const cc = { done: true, t: { ent: id }, cost: {}, src: h }; say(R, `▶ 효과 발동: ${D(R, h).n} (선택되었을 때)`); yield* runOps(R, c.o, h, ab.ops, cc, it); if (cc.negated) { neg = true; say(R, `${D(R, id).n}: 상대의 효과로 선택되었지만 무효`); break; } }
      if (!neg) out.push(id); }
    return out; }
  function* doOp(R, s, src, o, ctx, it) { const P = R.P[s], tg = w => w === 'opp' ? 1 - s : s;
    switch (o.op) {
      case 'draw': { const t = tg(o.who), nn = dynNum(R, s, src, o, ctx); if (nn <= 0) { ctx.done = false; return; } if (o.opt && !(yield { who: t, kind: 'yn', msg: `카드를 ${nn}장 뽑을까요?` })) { ctx.done = false; return; }
        const got = []; for (let i = 0; i < nn; i++) { const x = pull(R, t); if (x != null) { R.P[t].hand.push(x); got.push(x); } } setReg(ctx, 'drawn', got); say(R, `[효과] ${nm(t)} ${nn}장 드로우`); ctx.done = true; return; }
      case 'discard': { const t = tg(o.who), T = R.P[t], f = rf(R, o.filter, ctx), pool = T.hand.filter(x => fOk(R, t, x, f, src, true)), n = o.any ? pool.length : Math.min(dynNum(R, s, src, o, ctx), pool.length); if (!n) { ctx.done = false; return; } let ids;
        if (o.rand) { ids = pool.slice(); shuf(ids); ids = ids.slice(0, n); }
        else if (o.opt || o.any || pool.length > n) ids = yield pickReq(t, `손패 ${o.any ? '원하는 만큼' : n + '장'}을 리무브${o.opt || o.any ? ' (선택, 0장이면 하지 않음)' : ''}`, pool, o.opt || o.any ? 0 : n, n);
        else ids = pool.slice();
        if (!ids.length) { ctx.done = false; return; } T.hand = T.hand.filter(x => !ids.includes(x)); T.rem.push(...ids); setReg(ctx, 'removed', ids); say(R, `[효과] ${nm(t)} 손패 ${ids.length}장 리무브`); ids.forEach(x => bus(R, 'handRem', { s: t, ent: x, cz: s, by: 'effect' })); ctx.done = true; return; }
      case 'deckrem': { const t = tg(o.who), T = R.P[t]; let nn = dynNum(R, s, src, o, ctx); if (nn <= 0) { ctx.done = false; return; }
        if (o.upto) { const i = yield { who: s, kind: 'opt', msg: `덱 위에서 리무브할 장수를 정하세요 (최대 ${nn}장)`, labels: Array.from({ length: Math.min(nn, T.deck.length) + 1 }, (_, j) => `${j}장`) }; nn = Math.min(nn, +i); if (!nn) { ctx.done = false; return; } }
        if (o.opt) { if (T.deck.length < nn) { ctx.done = false; return; }
          if (!(yield { who: s, kind: 'yn', msg: `${o.who === 'opp' ? '상대 ' : ''}덱 위 ${nn}장을 리무브할까요?` })) { ctx.done = false; return; } }
        let k = 0; const got = []; for (let i = 0; i < nn && T.deck.length; i++) { const x = T.deck.pop(); T.rem.push(x); got.push(x); k++; } ctx.remd = got; setReg(ctx, 'removed', got); chk(R, t); say(R, `[효과] ${nm(t)} 덱 위 ${k}장 리무브`); ctx.done = k > 0; return; }
      case 'selfEvid': { const c = R.cards[src]; if (inZoneFx(R, src) || R.cards[src].setOn != null) { ctx.done = false; return; } ctx.moved = true; c.up = true; c.setOn = null; R.P[s].evid.push(src); say(R, `[효과] ${D(R, src).n}: 표향 그대로 증거로 획득`); ctx.done = true; return; }
      case 'selfTo': { const c = R.cards[src]; if (inZoneFx(R, src) || R.cards[src].setOn != null) { ctx.done = false; return; } ctx.moved = true; c.up = false; c.st = 'a'; if (o.to === 'pa') R.P[s].pa.push(src); else R.P[s].hand.push(src); say(R, `[효과] ${D(R, src).n}: ${o.to === 'pa' ? '파트너 에리어' : '손패'}로 이동`); ctx.done = true; return; }
      case 'flipDown': { const ids = (o.who === 'any' ? [0, 1] : [s]).flatMap(t => R.P[t].evid.filter(x => R.cards[x].up)); if (!ids.length) { ctx.done = false; return; }
        const ch = yield pickReq(s, `뒷면으로 되돌릴 표향 증거를 최대 ${o.n}장 선택`, ids, 0, Math.min(o.n, ids.length)); for (const x of ch || []) if (ids.includes(x)) R.cards[x].up = false; say(R, `[효과] 표향 증거 ${(ch || []).length}장을 뒷면으로`); ctx.done = (ch || []).length > 0; return; }
      case 'gain': { const t = tg(o.who); if (o.opt && !(yield { who: s, kind: 'yn', msg: `${o.who === 'opp' ? '상대에게 ' : ''}증거를 ${o.n}장 ${o.who === 'opp' ? '주' : '얻'}시겠습니까?` })) { ctx.done = false; return; } gain(R, t, o.n); say(R, `[효과] ${nm(t)} 증거 ${o.n}장 획득`); ctx.done = true; return; }
      case 'loseEvid': { const t = tg(o.who), T = R.P[t]; let k = 0; for (let i = 0; i < o.n && T.evid.length; i++) { const x = T.evid.pop(); R.cards[x].up = false; T.rem.push(x); k++; } say(R, `[효과] ${nm(t)} 증거 ${k}장 리무브`); ctx.done = k > 0; if (k) bus(R, 'evrem', { s: t, by: 'effect', cz: s }); return; }
      case 'shuffle': if (o.who === 'both') { shuf(R.P[0].deck); shuf(R.P[1].deck); } else shuf(R.P[tg(o.who)].deck); say(R, '[효과] 덱 셔플'); return;
      case 'look': { const T = P, n = Math.min(o.n, T.deck.length), ch = o.by === 'opp' ? 1 - s : s; if (!n) { ctx.done = false; return; }
        const ids = o.from === 'bottom' ? T.deck.slice(0, n).reverse() : T.deck.slice(-n).reverse(); const f = rf(R, o.filter, ctx);
        const ok = ids.filter(x => fOk(R, s, x, f, src, true)); let chosen = [];
        if (o.max > 0 && ok.length) chosen = yield { ...pickReq(ch, `${o.by === 'opp' ? '상대의 ' : ''}덱 ${o.from === 'bottom' ? '아래' : '위'} ${n}장 확인 — 최대 ${o.max}장 선택 (가능한 카드만 선택 가능)`, ids, 0, Math.min(o.max, ok.length), { sel: ok }), reveal: 1 };
        else yield { who: ch, kind: 'ack', msg: `덱 ${o.from === 'bottom' ? '아래' : '위'} ${n}장 확인`, ids };
        chosen = chosen.filter(x => ok.includes(x)); T.deck = T.deck.filter(x => !chosen.includes(x)); setReg(ctx, 'seen', ids); setReg(ctx, 'chosen', chosen); setReg(ctx, 'rest', ids.filter(x => !chosen.includes(x)));
        if (chosen.length) { say(R, `[효과] ${nm(s)} 덱에서 ${chosen.length}장 선택`);
          if (o.then === 'hand') T.hand.push(...chosen); else if (o.then === 'rem') T.rem.push(...chosen);
          else yield* placeCards(R, s, src, chosen, o.then === 'fieldSleep' || o.asleep, ctx); }
        const rest = ids.filter(x => !chosen.includes(x)); ctx.found = chosen.length; ctx.done = chosen.length > 0;
        if (rest.length && o.rest !== 'keep') { let ord = rest;
          if ((o.rest === 'bottom' || o.rest === 'top') && rest.length > 1) ord = yield pickReq(s, `남은 ${rest.length}장을 ${o.rest === 'top' ? '덱 위' : '덱 아래'}에 놓을 순서대로 클릭`, rest, rest.length, rest.length, { ordered: true });
          T.deck = T.deck.filter(x => !rest.includes(x));
          if (o.rest === 'bottom') ord.forEach(x => T.deck.unshift(x)); else if (o.rest === 'top') ord.slice().reverse().forEach(x => T.deck.push(x));
          else if (o.rest === 'shuffleBottom') { const r = ord.slice(); shuf(r); r.forEach(x => T.deck.unshift(x)); }
          else if (o.rest === 'rem') T.rem.push(...rest); else if (o.rest === 'hand') T.hand.push(...rest); }
        chk(R, s); return; }
      case 'select': { const f = rf(R, o.filter, ctx); const cand = [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src) && (o.all || !(R.cards[x].o !== s && noTarget(R, x, src)))); ctx.sel = [];
        if (!cand.length) { ctx.done = false; return; }
        const nn = dynNum(R, s, src, o, ctx); let ids; if (!o.all && nn <= 0) { ctx.done = false; return; }
        if (o.all) ids = cand.slice();
        else if (o.groups && o.groups.length) { ids = []; for (const g of o.groups) { const c2 = cand.filter(x => !ids.includes(x) && fOk(R, s, x, rf(R, g.filter, ctx), src)); if (!c2.length) continue;
            ids = ids.concat((yield pickReq(s, `대상 캐릭터를 최대 ${g.n}장 선택`, c2, 0, Math.min(g.n, c2.length))).filter(x => c2.includes(x))); } }
        else { // 「イベントの効果によってこのキャラを選べる場合、必ず選ぶ」(mustsel): 상대 이벤트가 고를 수 있으면 반드시 포함
          const must = src != null && R.cards[src] && D(R, src).type === 'event' && o.sumLv == null ? cand.filter(x => R.cards[x].o !== s && kwHas(R, x, 'mustsel')) : [];
          const c2 = must.length >= nn ? must : cand, mn = o.force ? Math.min(nn, c2.length) : must.length ? Math.min(nn, must.length) : 0;
          ids = (yield pickReq(s, `대상 캐릭터를 최대 ${nn >= 99 ? '원하는 수만큼' : nn + '장'} 선택` + (must.length ? ' (「必ず選ぶ」 캐릭터 포함)' : '') + (o.sumLv != null ? ` (레벨 합계 ${o.sumLv} 이하)` : ''), c2, mn, Math.min(nn, c2.length), o.sumLv != null ? { sumLv: o.sumLv } : {})).filter(x => c2.includes(x));
          if (must.length && must.length < nn) ids = [...new Set([...must, ...ids])].slice(0, nn); }
        if (!o.all && ids.length) ids = yield* chosenCheck(R, s, src, ids, it);
        if (!ids.length) { ctx.done = false; return; } ctx.sel = ids.slice(); setReg(ctx, 'sel', ids);
        yield* doActs(R, s, src, ids, o, ctx);
        say(R, `[효과] 캐릭터 ${ids.length}장에 ${o.do}${o.v ? ' ' + o.v : ''}`); ctx.done = true; return; }
      case 'self': { if (!onField(R, src)) { ctx.done = false; return; } if (o.do === 'sleep' && (R.cards[src].st || 'a') !== 'a') { ctx.done = false; return; }
        if (o.opt && !(yield { who: s, kind: 'yn', msg: `${D(R, src).n}: ${o.do}${o.v ? ' ' + o.v : ''} 할까요?` })) { ctx.done = false; return; }
        let vv = o.v; if (o.pc) { const k = countOf(R, s, src, o.pc, ctx.t || {}); if (!k) { ctx.done = false; return; } vv = String((+o.v || 0) * k); } if (o.mul) { const k = regNumBy(R, regIds(R, ctx, o.mul.ref), o.mul.by); if (!k) { ctx.done = false; return; } vv = String((+o.v || 0) * k); }
        yield* applyG(R, s, src, src, o.do, vv, o.until); setReg(ctx, 'sel', [src]); say(R, `[효과] ${D(R, src).n}: ${o.do}${vv ? ' ' + vv : ''}`); ctx.done = true; return; }
      case 'play': { ctx.played = []; setReg(ctx, 'played', []); const f = rf(R, o.filter, ctx), okc = x => D(R, x).type === 'char' && fOk(R, s, x, f, src, true);
        const zones = o.from === 'rem' ? [P.rem] : o.from === 'rempa' ? [P.rem, P.pa] : o.from === 'handrem' ? [P.hand, P.rem] : o.from === 'picked' ? [ctx.picked != null && P.rem.includes(ctx.picked) ? [ctx.picked] : []] : [P.hand];
        const cand = [].concat(...zones).filter(okc); if (!cand.length) { ctx.done = false; return; }
        const ids = o.from === 'picked' ? cand.slice(0, 1) : (yield pickReq(s, `등장시킬 캐릭터를 최대 ${o.n}장 선택${o.distinct ? ' (카드 이름이 서로 달라야 함)' : ''}`, cand, 0, Math.min(o.n, cand.length), { distinct: o.distinct, dlv: o.dlv })).filter(x => cand.includes(x)); // 상대가 고른 1장은 강제로 등장
        if (!ids.length) { ctx.done = false; return; } const fromRem = ids.filter(x => P.rem.includes(x));
        P.rem = P.rem.filter(x => !ids.includes(x)); P.pa = P.pa.filter(x => !ids.includes(x)); P.hand = P.hand.filter(x => !ids.includes(x)); if (fromRem.length) remLeft(R, s, fromRem);
        yield* placeCards(R, s, src, ids, o.asleep, ctx); ctx.done = true; return; }
      case 'choose': { const os = o.opts.filter(x => x.ops.length); if (!os.length) return; const i = os.length === 1 ? 0 : yield { who: s, kind: 'opt', msg: '효과를 선택하세요', labels: os.map(x => x.lab || '선택') };
        yield* runOps(R, s, src, os[i].ops, ctx, it); return; }
      case 'chooseMulti': { const os = o.opts.filter(x => x.ops.length); if (!os.length) return;
        const idx = yield { who: s, kind: 'optm', msg: `이 중에서 ${o.max}개까지 골라 위에서부터 순서대로 실행합니다`, labels: os.map(x => x.lab || '선택'), min: 0, max: Math.min(o.max, os.length) };
        for (const i of idx.slice().sort((a, b) => a - b)) yield* runOps(R, s, src, os[i].ops, ctx, it); return; }
      case 'if': { let hit;
        if (o.c === 'played') hit = (ctx.played || []).some(y => !o.name || D(R, y).n.includes(o.name));
        else if (o.c === 'remHas') hit = (ctx.remd || []).filter(y => fOk(R, s, y, rf(R, o.filter, ctx), src, true)).length >= (o.n || 1);
        else if (o.c === 'costHas') hit = [...((ctx.cost && ctx.cost.rem) || []), ...((ctx.cost && ctx.cost.disc) || [])].filter(y => fOk(R, s, y, rf(R, o.filter, ctx), src, true)).length >= (o.n || 1);
        else if (o.c === 'picked') hit = ctx.picked != null && fOk(R, s, ctx.picked, rf(R, o.filter, ctx), src, true);
        else if (o.c === 'reg') { const ids = regIds(R, ctx, o.ref), fs = (o.filters || []).map(f => rf(R, f, ctx)), N = o.n || 1, cm = (a, b) => o.cmp === 'le' ? a <= b : o.cmp === 'eq' ? a === b : a >= b;
          if (o.distinct) { const pool = fs.length ? ids.filter(x => fOk(R, s, x, fs[0], src, true)) : ids; const seenC = new Set(); let okN = 0; for (const x of pool) { const ks = o.distinct === 'name' ? [D(R, x).n] : cols(D(R, x)); if (!ks.some(k => seenC.has(k))) { ks.forEach(k => seenC.add(k)); okN++; } } const set = { size: okN }; hit = cm(set.size, N); }
          else if (!fs.length) hit = cm(ids.length, N);
          else if (fs.length > 1) hit = fs.every(f => ids.some(x => fOk(R, s, x, f, src, true)));
          else { const m = ids.filter(x => fOk(R, s, x, fs[0], src, true)); hit = o.all ? ids.length > 0 && m.length === ids.length : cm(m.length, N); } }
        else if (o.c === 'win' || o.c === 'lose') hit = ctx.rps === o.c;
        else if (o.c === 'found') hit = (ctx.found | 0) > 0;
        else hit = (o.c === 'done') === !!ctx.done;
        if (hit) yield* runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* runOps(R, s, src, o.else, ctx, it); return; }
      case 'ifc': { if (condOk(R, s, src, { cond: o.cond }, cx(ctx))) yield* runOps(R, s, src, o.ops, ctx, it); else if (o.else && o.else.length) yield* runOps(R, s, src, o.else, ctx, it); return; }
      case 'optcost': { for (const k of o.cost) if (canPayOne(R, s, src, k)) { ctx.done = false; return; }
        if (!(yield { who: s, kind: 'yn', msg: `${D(R, src).n}: 코스트를 지불하고 효과를 처리할까요?` })) { ctx.done = false; return; }
        for (const k of o.cost) yield* pay(R, s, src, k, ctx); ctx.done = true; return; }
      case 'ent': { const e = ctx.t && ctx.t.ent; if (e == null || !onField(R, e)) { ctx.done = false; return; }
        yield* applyG(R, s, src, e, o.do, o.v, o.until); say(R, `[효과] ${D(R, e).n}: ${o.do}${o.v ? ' ' + o.v : ''}`); ctx.done = true; return; }
      case 'played': { const ids = (ctx.played || []).filter(x => onField(R, x)); if (!ids.length) { ctx.done = false; return; }
        for (const e of ids) { applyTo(R, s, src, e, o.do, o.v, o.until); say(R, `[효과] ${D(R, e).n}: ${o.do}${o.v ? ' ' + o.v : ''}`); } ctx.done = true; return; }
      case 'reveal': { const T = P, seen = []; let hit = null;
        while (T.deck.length) { const x = T.deck.pop(); seen.push(x); if (D(R, x).type && (o.name || Object.values(o.filter || {}).some(v => v && (!Array.isArray(v) || v.length))) && fOk(R, s, x, o.filter, src, true) && (!o.name || D(R, x).n.includes(o.name))) { hit = x; break; } }
        yield { who: s, kind: 'ack', msg: hit != null ? `덱 위에서 ${seen.length}장을 공개 — 「${D(R, hit).n}」 발견` : `덱 위 ${seen.length}장을 공개 — 해당하는 카드가 없었습니다`, ids: seen, reveal: 1, by: s };
        const rest = seen.filter(x => x !== hit); if (hit != null) { if (o.then === 'rem') T.rem.push(hit); else T.hand.push(hit); }
        if (o.rest === 'rem') T.rem.push(...rest); else { const r = rest.slice(); if (o.rest === 'shuffleBottom') shuf(r); r.forEach(x => T.deck.unshift(x)); }
        if (o.shuffle) shuf(T.deck); say(R, `[효과] ${nm(s)} 덱을 ${seen.length}장 공개` + (hit != null ? ` → 「${D(R, hit).n}」을(를) 손패에` : ' (해당 카드 없음)')); ctx.done = hit != null; ctx.found = hit != null ? 1 : 0; chk(R, s); return; }
      case 'revealTop': { const T = P, n = Math.min(o.n, T.deck.length); if (!n) { ctx.done = false; return; } const seen = []; for (let i = 0; i < n; i++) seen.push(T.deck.pop());
        const f = rf(R, o.filter, ctx), hits = seen.filter(x => fOk(R, s, x, f, src, true)), miss = seen.filter(x => !hits.includes(x));
        yield { who: s, kind: 'ack', msg: `덱 위 ${n}장을 공개 — ` + (hits.length ? `조건에 맞는 「${D(R, hits[0]).n}」 → ${o.hit === 'rem' ? '리무브' : '손패'}` : `조건에 맞는 카드 없음 → ${o.miss === 'bottom' ? '덱 아래' : o.miss === 'top' ? '덱 위' : o.miss === 'rem' ? '리무브' : '손패'}`), ids: seen, reveal: 1, by: s };
        if (o.hit === 'rem') T.rem.push(...hits); else T.hand.push(...hits);
        if (o.miss === 'bottom') miss.forEach(x => T.deck.unshift(x)); else if (o.miss === 'top') miss.slice().reverse().forEach(x => T.deck.push(x)); else if (o.miss === 'rem') T.rem.push(...miss); else T.hand.push(...miss);
        say(R, `[효과] ${nm(s)} 덱 위 ${n}장 공개` + (hits.length ? ` → 「${D(R, hits[0]).n}」` : ' (해당 없음)')); ctx.done = hits.length > 0; ctx.found = hits.length; chk(R, s); return; }
      case 'revealHand': { const t = tg(o.who), ids = R.P[t].hand.slice(); yield { who: 1 - t, kind: 'ack', msg: `${nm(t)}의 손패 ${ids.length}장 공개 (확인 후 원래대로)`, ids, reveal: 1, by: t }; say(R, `[효과] ${nm(t)} 손패 공개`); return; }
      case 'revealFile': { const t = tg(o.who), T = R.P[t]; const ids = T.file.slice(-o.n).reverse(); if (!ids.length) { ctx.done = false; return; } ids.forEach(x => { R.cards[x].up = true; });
        yield { who: s, kind: 'ack', msg: `${nm(t)}의 FILE 에리어 위 ${ids.length}장을 표향으로`, ids, reveal: 1, by: t }; say(R, `[효과] ${nm(t)} FILE 위 ${ids.length}장 표향`); ctx.done = true; return; }
      case 'investigate': { const t = 1 - s, T = R.P[t]; ctx.named = ''; ctx.disc = [];
        if (o.named) { const v = yield { who: s, kind: 'text', msg: '수사할 카드 이름을 지정하세요 (부분 일치)', max: 40 }; ctx.named = String(v || '').slice(0, 40); }
        const n = Math.min(o.n, T.deck.length); const seen = []; for (let i = 0; i < n; i++) seen.push(T.deck.pop()); ctx.disc = seen.slice(); ctx.found = 0;
        say(R, `[효과] 수사 ${o.n}: 상대 덱 위 ${seen.length}장 공개` + (ctx.named ? ` (지정: ${ctx.named})` : ''));
        if (!n) { ctx.done = false; return; }
        yield { who: s, kind: 'ack', msg: `수사 ${o.n} — 상대 덱 위 ${n}장 발견`, ids: seen, reveal: 1 };
        let ord = seen; if (n > 1) ord = yield pickReq(t, `수사로 공개된 ${n}장을 덱 아래에 놓을 순서대로 클릭`, seen, n, n, { ordered: true, reveal: 1 });
        ord.forEach(x => T.deck.unshift(x)); ctx.found = ctx.named ? seen.filter(x => D(R, x).n.includes(ctx.named)).length : seen.length; ctx.done = true; chk(R, t); return; }
      case 'fetch': { const f = rf(R, o.filter, ctx), pool = [...P.rem, ...(o.from === 'rempa' ? P.pa : [])].filter(x => fOk(R, s, x, f, src, true)); if (!pool.length) { ctx.done = false; return; }
        const ids = (yield pickReq(s, `${o.from === 'rempa' ? '리무브/파트너 에리어' : '리무브 에리어'}에서 손패에 가져올 카드를 최대 ${o.n}장 선택`, pool, 0, Math.min(o.n, pool.length), { reveal: 1 })).filter(x => pool.includes(x));
        if (!ids.length) { ctx.done = false; return; } const fromRem = ids.filter(x => P.rem.includes(x)); P.rem = P.rem.filter(x => !ids.includes(x)); P.pa = P.pa.filter(x => !ids.includes(x)); P.hand.push(...ids); setReg(ctx, 'moved', ids);
        remLeft(R, s, fromRem); say(R, `[효과] ${nm(s)} ${ids.length}장을 손패에`); ctx.done = true; return; }
      case 'fileToHand': { const k = Math.min(o.n, P.file.length); if (!k) { ctx.done = false; return; }
        if (o.opt && !(yield { who: s, kind: 'yn', msg: `FILE 에리어의 카드를 위에서 ${k}장 손패에 가져올까요?` })) { ctx.done = false; return; }
        for (let i = 0; i < k; i++) P.hand.push(P.file.pop()); say(R, `[효과] ${nm(s)} FILE 에리어 ${k}장을 손패에`); bus(R, 'fileHand', { s, by: 'effect' }); ctx.done = true; return; }
      case 'setDeck': { let tid = null; ctx.done = false; const nn = dynNum(R, s, src, o, ctx);
        if (o.to === 'self') tid = onField(R, src) ? src : null; else if (o.to === 'played') { const l = (ctx.played || []).filter(x => onField(R, x)); tid = l.length ? l[l.length - 1] : null; }
        else if (o.to === 'sel') { const l = regIds(R, ctx, 'sel').filter(x => onField(R, x)); tid = l.length ? l[l.length - 1] : null; }
        else { const f = rf(R, o.filter, ctx); const cand = [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src) && (R.cards[x].o === s || o.deck === 'opp' || o.deck === 'owner'));
          if (cand.length) { const ids = (yield pickReq(s, '카드를 세트할 캐릭터를 최대 1장 선택', cand, 0, 1)).filter(x => cand.includes(x)); tid = ids.length ? ids[0] : null; } }
        if (o.to === 'pick') setReg(ctx, 'sel', tid != null ? [tid] : []);
        if (tid == null || nn <= 0) return;
        const dt = o.deck === 'owner' ? R.cards[tid].o : tg(o.deck), DT = R.P[dt]; if (dt !== R.cards[tid].o) { say(R, '[효과] 세트할 덱과 캐릭터 소유자가 다름 — 처리 불가'); return; } if (!DT.deck.length) return;
        for (let i = 0; i < nn; i++) { const x = pull(R, dt); if (x == null) break; const h = R.cards[tid]; (h.fd = h.fd || []).push(x); R.cards[x].fdOn = tid; ctx.done = true; bus(R, 'setOn', { s: h.o, ent: x, holder: tid, fd: true }); }
        if (ctx.done) say(R, `[효과] ${nm(dt)}의 덱 위 카드를 뒷면으로 ${D(R, tid).n}에 세트`); return; }
      case 'unset': { const holders = o.scope === 'self' ? (onField(R, src) ? [src] : []) : o.scope === 'opp' ? ally(R, 1 - s).slice() : o.scope === 'mine' ? ally(R, s).slice() : [...ally(R, 0), ...ally(R, 1)]; const f = rf(R, o.filter, ctx);
        const okH = holders.filter(h => setCards(R, h, o.fd).some(x => fOk(R, s, x, f, src, true))); if (!okH.length) { ctx.done = false; return; }
        if (o.opt && !(yield { who: s, kind: 'yn', msg: '세트된 카드를 리무브할까요?' })) { ctx.done = false; return; }
        const h = okH.length === 1 ? okH[0] : (yield pickReq(s, '세트된 카드를 리무브할 캐릭터를 선택', okH, 1, 1))[0];
        const cs = setCards(R, h, o.fd).filter(x => fOk(R, s, x, f, src, true)); const x = cs[0]; unsetOne(R, h, x); setReg(ctx, 'removed', [x]); say(R, `[효과] ${D(R, h).n}에 세트된 카드를 리무브`); ctx.done = true; return; }
      case 'moveSet': { const h = R.cards[src], mine = (h && h.fd) || []; const f = rf(R, o.filter, ctx); ctx.done = false; if (!onField(R, src) || !mine.length) return;
        const cand = ally(R, s).filter(x => x !== src && fOk(R, s, x, f, src) && !(o.toEmpty && (R.cards[x].fd || []).length)); if (!cand.length) return;
        const ids = (yield pickReq(s, '裏向きのセットカードを移す先のキャラを最大1枚選択', cand, 0, 1)).filter(x => cand.includes(x)); if (!ids.length) return;
        const card = mine.length === 1 ? mine[0] : (yield pickReq(s, '移す裏向きカードを選択', mine, 1, 1))[0], to = R.cards[ids[0]];
        h.fd = h.fd.filter(x => x !== card); (to.fd = to.fd || []).push(card); R.cards[card].fdOn = ids[0]; ctx.done = true; say(R, `[효과] 뒷면 세트 카드 1장을 ${D(R, ids[0]).n}에 옮김`); return; }
      case 'stack': { const f = rf(R, o.filter, ctx), cand = P.rem.filter(x => D(R, x).type === 'char' && fOk(R, s, x, f, src, true)); if (!cand.length || !onField(R, src)) { ctx.done = false; return; }
        const ids = (yield pickReq(s, `리무브 에리어에서 이 캐릭터 아래에 겹칠 카드를 최대 ${o.n}장 선택` + (o.distinct ? ' (카드 이름이 서로 달라야 함)' : ''), cand, 0, Math.min(o.n, cand.length), { distinct: o.distinct, reveal: 1 })).filter(x => cand.includes(x));
        if (!ids.length) { ctx.done = false; return; } P.rem = P.rem.filter(x => !ids.includes(x)); const h = R.cards[src]; (h.under = h.under || []).push(...ids); setReg(ctx, 'moved', ids); remLeft(R, s, ids); say(R, `[효과] ${D(R, src).n} 아래에 ${ids.length}장을 겹침`); ctx.done = true; return; }
      case 'flip': { const t = tg(o.who); if (o.opt && faceDown(R, t).length && !(yield { who: s, kind: 'yn', msg: `뒷면 증거 ${o.n}장을 표향으로 할까요?` })) { ctx.done = false; return; } const ids = yield* flipPick(R, s, t, o.n); ctx.flipped = ids; if (ids.length) say(R, `[효과] ${nm(t)}의 뒷면 증거 ${ids.length}장을 표향으로` + ids.map(x => ` (${D(R, x).n})`).join('')); ctx.done = ids.length > 0; return; }
      case 'flashFlipped': { const f = rf(R, o.filter, ctx), ids = [...(ctx.cost && ctx.cost.flip || []), ...(ctx.flipped || [])].filter(x => fOk(R, s, x, f, src, true) && (D(R, x).ab || []).some(a => a.ic === 'flash' && !!a.bang === !!o.bang));
        for (const x of ids) { const abs = (D(R, x).ab || []).filter(a => a.ic === 'flash' && !!a.bang === !!o.bang && condOk(R, s, x, a)); if (!abs.length) continue;
          if (!(yield { who: s, kind: 'yn', msg: `표향이 된 「${D(R, x).n}」의 ${o.bang ? '【!】' : ''}히라메키를 발동할까요?` })) continue;
          say(R, `▶ 히라메키 발동(표향): ${D(R, x).n}`); const c2 = { done: true, t: {}, cost: {} }; for (const ab of abs) yield* runOps(R, s, x, ab.ops, c2, it); }
        return; }
      case 'rmAll': { const ids = o.scope === 'contact' ? (R.sub ? [R.sub.atk, R.sub.def] : []) : [...ally(R, R.turn), ...ally(R, 1 - R.turn)].filter(x => o.scope !== 'others' || x !== src);
        for (const x of ids.filter(y => onField(R, y))) rmChar(R, x, 'effect'); say(R, `[효과] ${o.scope === 'contact' ? '컨택트 중인 캐릭터' : '모든 캐릭터'} 리무브`); ctx.done = true; return; }
      case 'traitAll': { R.tt = R.tt || [[], []]; R.tt[s].push(o.trait); say(R, `[효과] 이번 턴 내 모든 캐릭터는 특징 [${o.trait}] 를 가짐`); return; }
      case 'nohint': R.fl.nh = 1; say(R, '[효과] 이번 턴 넥스트 힌트 불가'); return;
      case 'rps': { for (let g = 0; g < 20; g++) { const a = yield { who: s, kind: 'opt', msg: '가위바위보 — 내 손을 고르세요', labels: ['바위', '가위', '보'] }; const b = yield { who: 1 - s, kind: 'opt', msg: '가위바위보 — 내 손을 고르세요', labels: ['바위', '가위', '보'] };
          if (a === b) { say(R, '가위바위보: 비김 — 다시'); continue; } ctx.rps = ((a - b + 3) % 3) === 2 ? 'win' : 'lose'; say(R, `가위바위보: ${nm(s)} ${ctx.rps === 'win' ? '승' : '패'}`); return; } ctx.rps = 'lose'; return; }
      case 'pickPaid': { const ids = ((ctx.cost && ctx.cost.rem) || []).slice(); ctx.picked = null; if (!ids.length) return; const who = tg(o.who);
        const r = ids.length === 1 ? ids : yield pickReq(who, '코스트로 리무브된 카드 중 1장을 선택하세요', ids, 1, 1, { reveal: 1 }); ctx.picked = r[0]; say(R, `[효과] ${nm(who)}이(가) 「${D(R, ctx.picked).n}」을(를) 선택`); return; }
      case 'set': { const f = rf(R, o.filter, ctx); const cand = P.field.filter(x => x !== src && fOk(R, s, x, f, src, true)); if (!cand.length || it.kind !== 'event' || R.cards[src].setOn != null || ['evid', 'rem', 'pa', 'hand', 'deck', 'file'].some(z => P[z].includes(src))) { ctx.done = false; return; } // 이벤트 효과 해결 중에만 세트 가능
        const ids = cand.length === 1 ? cand : yield pickReq(s, '이 이벤트를 세트할 내 캐릭터를 1장 선택', cand, 1, 1); const tid = ids[0], t = R.cards[tid], e = R.cards[src];
        if (t && R.P[s].field.includes(tid)) { (t.sets = t.sets || []).push(src); e.setOn = tid; say(R, `[효과] ${D(R, src).n}을(를) ${D(R, tid).n}에 세트`); ctx.done = true; bus(R, 'setOn', { s: t.o, ent: src, holder: tid }); } return; }
      case 'ref': { const ids = regIds(R, ctx, o.ref).filter(x => onField(R, x)); if (!ids.length) { ctx.done = false; return; }
        if (o.opt && !(yield yn(s, '이 효과를 처리할까요?'))) { ctx.done = false; return; }
        let oo = o; if (o.mul) { const m = regNumBy(R, regIds(R, ctx, o.mul.ref), o.mul.by); oo = { ...o, acts: o.acts.map(a => ['ap', 'lp', 'lv'].includes(a.do) ? { ...a, v: String((+a.v || 0) * m) } : a) }; }
        yield* doActs(R, s, src, ids, oo, ctx); say(R, `[효과] 앞서 처리한 캐릭터 ${ids.length}장에 적용`); ctx.done = true; return; }
      case 'mv': { let ids = regIds(R, ctx, o.ref); if (o.filter) { const f = rf(R, o.filter, ctx); ids = ids.filter(x => fOk(R, s, x, f, src, true)); }
        if (!ids.length) { ctx.done = false; return; } if (o.opt && !(yield yn(s, '이동시킬까요?'))) { ctx.done = false; return; }
        const moved = yield* moveCards(R, s, src, ids, o.to, o, ctx); if (o.ref !== 'rest') { setReg(ctx, 'moved', moved); ctx.done = moved.length > 0; } if (moved.length) say(R, `[효과] 카드 ${moved.length}장을 ${o.to}(으)로 이동`); return; }
      case 'peek': { const dt = o.deck === 'opp' ? 1 - s : s, T = R.P[dt], viewer = o.viewer === 'opp' ? 1 - s : s; let seen = [], hit = null;
        if (o.until) { const f = rf(R, o.until, ctx); const cap = Math.min(o.cap, T.deck.length);
          for (let k = 0; k < cap; k++) { const x = o.from === 'bottom' ? T.deck[k] : T.deck[T.deck.length - 1 - k]; seen.push(x); if (fOk(R, s, x, f, src, true)) { hit = x; break; } } }
        else { const n = Math.max(0, Math.min(dynNum(R, s, src, o, ctx), T.deck.length)); seen = n <= 0 ? [] : o.from === 'bottom' ? T.deck.slice(0, n) : T.deck.slice(-n).reverse(); }
        setReg(ctx, 'seen', seen); setReg(ctx, 'hit', hit != null ? [hit] : []); setReg(ctx, 'rest', seen.filter(x => x !== hit)); setReg(ctx, 'revealed', o.reveal ? seen : []); ctx.found = hit != null ? 1 : 0; ctx.done = seen.length > 0;
        say(R, `[효과] ${nm(dt)} 덱 ${o.from === 'bottom' ? '아래' : '위'} ${seen.length}장 ${o.reveal ? '공개' : '확인'}` + (o.until ? (hit != null ? (o.reveal ? ` → 「${D(R, hit).n}」 발견` : ' → 해당하는 카드를 찾음') : ' (해당 카드 없음)') : ''));
        if (seen.length) yield { who: viewer, kind: 'ack', msg: `${nm(dt)}의 덱 ${o.from === 'bottom' ? '아래' : '위'} ${seen.length}장${o.reveal ? ' 공개' : ' 확인'}` + (o.until ? (hit != null ? ` — 「${D(R, hit).n}」 발견` : ' — 해당하는 카드 없음') : ''), ids: seen, reveal: o.reveal ? 1 : 0, by: o.reveal ? s : null };
        return; }
      case 'pick': { const who = o.chooser === 'opp' ? 1 - s : s; const isReg = REGS_RT.includes(o.from); let pool;
        if (isReg) pool = regIds(R, ctx, o.from); else { const T = R.P[o.own === 'opp' ? 1 - s : s]; pool = o.from === 'evidUp' ? T.evid.filter(x => R.cards[x].up) : o.from === 'evidDown' ? T.evid.filter(x => !R.cards[x].up) : (T[o.from] || []).slice(); }
        const f = rf(R, o.filter, ctx); const cand = pool.filter(x => fOk(R, s, x, f, src, true)); ctx.done = false; setReg(ctx, o.as, []); setReg(ctx, 'rest', isReg ? pool : []);
        if (!cand.length && !o.groups.length) return; let chosen = [];
        const cap = o.sumLv != null ? { sumLv: o.sumLv } : {};
        if (o.all) chosen = cand.slice();
        else if (o.groups.length) { for (const g of o.groups) { let c2 = pool.filter(x => !chosen.includes(x) && fOk(R, s, x, rf(R, g.filter, ctx), src, true));
            if (g.diffColor && chosen.length) { const used = new Set(chosen.flatMap(x => cols(D(R, x)))); c2 = c2.filter(x => !cols(D(R, x)).some(k => used.has(k))); }
            if (!c2.length) continue; const r = (yield pickReq(who, `${g.n}장까지 선택 (해당하는 카드가 없으면 0장)`, c2, 0, Math.min(g.n, c2.length), { reveal: isReg ? 1 : 0 })).filter(x => c2.includes(x)); chosen = chosen.concat(r); } }
        else { const mx = Math.min(dynNum(R, s, src, o, ctx), cand.length); if (mx > 0) chosen = (yield pickReq(who, `${o.msg || '카드'}를 ${o.min && o.min === mx ? mx : '최대 ' + mx}장 선택` + (o.sumLv != null ? ` (레벨 합계 ${o.sumLv} 이하)` : ''), cand, Math.min(o.min, mx), mx, { distinct: o.distinct, reveal: isReg || o.reveal ? 1 : 0, ...cap })).filter(x => cand.includes(x)); }
        setReg(ctx, o.as, chosen); if (isReg) setReg(ctx, 'rest', pool.filter(x => !chosen.includes(x))); ctx.found = chosen.length; ctx.done = chosen.length > 0;
        if (chosen.length) { if (o.reveal) { setReg(ctx, 'revealed', chosen); yield { who: 1 - who, kind: 'ack', msg: `${nm(who)}이(가) 공개: ${chosen.map(x => D(R, x).n).join(', ')}`, ids: chosen, reveal: 1, by: who }; if (o.from === 'hand') chosen.forEach(x => bus(R, 'hrev', { s: who, ent: x, by: 'effect' })); } say(R, `[효과] ${nm(who)}이(가) ${chosen.length}장 선택`); }
        return; }
      case 'turnPk': { if (o.until === 'action' && !R.sub) { ctx.done = false; return; }   // 액션이 이미 끝났다면(사건 액션이 가드 없이 끝난 뒤 큐 처리 등) 적용하지 않음
        R.fl.pk = R.fl.pk || [{}, {}]; R.fl.pkA = R.fl.pkA || [{}, {}]; (o.until === 'action' ? R.fl.pkA : R.fl.pk)[s][o.key] = 1; say(R, `[효과] ${o.until === 'action' ? '이 액션이 끝날 때까지' : '이번 턴 동안'} 제한 적용: ${o.key}`); ctx.done = true; return; }
      case 'delay': { R.fl.tmp = R.fl.tmp || []; R.fl.tmp.push({ s, src, evs: o.evs, who: o.who, ops: o.ops, keep: o.keep, sf: o.sf }); say(R, '[효과] 이번 턴 동안의 예약 효과 등록'); ctx.done = true; return; }
      case 'nameSel': { const v = yield { who: s, kind: 'text', msg: '카드 이름을 지정하세요 (부분 일치)', max: 40 }; ctx.named = String(v || '').slice(0, 40); ctx.done = true; say(R, `[효과] 카드 이름 지정: ${ctx.named}`); return; }
      case 'hayIgn': { R.fl.hayIgn = R.fl.hayIgn || [0, 0]; R.fl.hayIgn[s] = 1; say(R, '[효과] 이번 턴 다음에 등장하는 캐릭터는 【疾風】 조건을 무시'); ctx.done = true; return; }
      case 'handTo': { const T = P; ctx.done = false;
        if (o.mode === 'draw') { const got = []; while (T.hand.length < o.n) { const x = pull(R, s); if (x == null) break; T.hand.push(x); got.push(x); } setReg(ctx, 'drawn', got); ctx.done = got.length > 0; say(R, `[효과] ${nm(s)} 손패가 ${o.n}장이 될 때까지 드로우`); return; }
        const k = T.hand.length - o.n; if (k <= 0) return; const ids = yield pickReq(s, `손패가 ${o.n}장이 되도록 ${k}장 리무브`, T.hand.slice(), k, k); T.hand = T.hand.filter(x => !ids.includes(x)); T.rem.push(...ids); setReg(ctx, 'removed', ids); ctx.done = true; say(R, `[효과] ${nm(s)} 손패 ${ids.length}장 리무브`); return; }
      case 'solve': setSolved(R, s); return;
      default: if (X.has(o.op)) return yield* X.run(R, s, src, o, ctx, it); if (!doOp._w) doOp._w = new Set(); if (!doOp._w.has(o.op)) { doOp._w.add(o.op); console.warn(`[fx] 미지원 효과 op '${o.op}' 건너뜀 (${D(R, src).n}) — 카드 DB를 재변환하세요`); } return; } }  // 사용자에게 수동 처리를 요구하지 않는다(DB 검증 test/check_db.js 가 0건임을 보증)
  function* runOps(R, s, src, ops, ctx, it) { for (const o of ops) { if (R.phase !== 'play') return; yield* doOp(R, s, src, o, ctx, it); } }

  // 코스트
  function canPayOne(R, s, src, k) { const P = R.P[s], c = R.cards[src], f = k.filter;
    switch (k.c) {
      case 'sleepSelf': return (c.st || 'a') !== 'a' ? '이 카드가 액티브 상태가 아닙니다' : '';
      case 'discard': return P.hand.filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '코스트로 리무브할 손패가 부족합니다' : '';
      case 'deckrem': return P.deck.length < k.n ? '코스트로 리무브할 덱이 부족합니다' : '';
      case 'selfBottom': case 'selfRem': case 'selfPa': return !P.field.includes(src) ? '현장의 캐릭터만 사용할 수 있습니다' : '';
      case 'sleepOther': return P.field.filter(x => x !== src && (R.cards[x].st || 'a') === 'a').length < k.n ? '코스트로 슬립시킬 다른 액티브 캐릭터가 부족합니다' : '';
      case 'flipEvid': return faceDown(R, s).length < k.n ? '표향으로 할 뒷면 증거가 부족합니다' : '';
      case 'fieldBottom': return [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '코스트로 덱 아래에 보낼 현장 캐릭터가 부족합니다' : '';
      case 'unset': return unsetPool(R, s, src, k).filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '이 캐릭터에 세트된 카드가 부족합니다' : '';
      case 'unstack': return (c.under || []).length < k.n ? '이 캐릭터 아래에 겹친 카드가 부족합니다' : '';
      case 'remBottom': return P.rem.filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '리무브 에리어에 코스트로 쓸 카드가 부족합니다' : '';
      case 'revealHand': return P.hand.filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '공개할 손패가 부족합니다' : '';
      case 'fileRem': return P.file.length < k.n ? 'FILE 에리어의 카드가 부족합니다' : '';
      case 'paRem': return P.pa.filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '파트너 에리어에 코스트로 쓸 카드가 부족합니다' : '';
      case 'sleepAny': return sleepPool(R, s, src, k).length < k.n ? '코스트로 슬립/스턴시킬 캐릭터가 부족합니다' : '';
      case 'fieldRem': return [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '코스트로 리무브할 현장 캐릭터가 부족합니다' : '';
      case 'stackCost': { const pool = k.from === 'hand' ? P.hand.filter(x => fOk(R, s, x, f, src, true)) : P.field.filter(x => x !== src && fOk(R, s, x, f, src, true));
        if (pool.length < k.n) return '겹칠 카드가 부족합니다'; if (k.onto === 'self') return P.field.includes(src) ? '' : '현장의 캐릭터만 사용할 수 있습니다'; return P.field.some(x => fOk(R, s, x, k.ontoF, src, true)) ? '' : '겹칠 대상 캐릭터가 없습니다'; }
      case 'either': return (k.alts || []).some(alt => alt.every(x => !canPayOne(R, s, src, x))) ? '' : '어느 코스트도 지불할 수 없습니다';
      case 'lpSelf': return A.lpOf(R, src) < Math.abs(k.v) ? 'LP가 부족합니다' : '';
      case 'handDeckTop': return P.hand.filter(x => fOk(R, s, x, f, src, true)).length < k.n ? '공개해 덱 위로 보낼 손패가 부족합니다' : '';
      case 'discardTo': return P.hand.length <= k.n ? '손패를 더 줄일 수 없습니다' : '';
      default: return X.hasCost(k.c) ? X.costCan(R, s, src, k) : ''; } }
  const sleepPool = (R, s, src, k) => { const cs = k.scope === 'any' ? [...ally(R, 0), ...ally(R, 1)] : ally(R, s);
    return cs.filter(x => (R.cards[x].st || 'a') === 'a' && ((k.orSelf && x === src) || fOk(R, s, x, k.filter, src, true))); };
  function canPay(R, s, src, ab) { for (const k of ab.cost || []) { const e = canPayOne(R, s, src, k); if (e) return e; } return ''; }
  function* pay(R, s, src, k, ctx) { const P = R.P[s], c = R.cards[src]; ctx = ctx || { cost: {} }; const co = ctx.cost = ctx.cost || {}, f = k.filter;
    if (k.c === 'sleepSelf') { c.st = 's'; bus(R, 'sleepEv', { s, ent: src, by: 'cost' }); }
    else if (k.c === 'discard') { const cand = P.hand.filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 손패 ${k.n}장을 리무브`, cand, k.n, k.n);
      P.hand = P.hand.filter(x => !ids.includes(x)); P.rem.push(...ids); co.disc = ids; co.lv = ids.length ? (+D(R, ids[0]).lv || 0) : 0; }
    else if (k.c === 'deckrem') { const got = []; const kn = k.per ? k.n * countOf(R, s, src, k.per) : k.n; for (let i = 0; i < kn && P.deck.length; i++) { const x = P.deck.pop(); P.rem.push(x); got.push(x); } co.rem = (co.rem || []).concat(got); chk(R, s); }
    else if (k.c === 'selfBottom') { moveOut(R, src, 'deckBottom'); }
    else if (k.c === 'selfRem') { rmChar(R, src, 'cost'); }
    else if (k.c === 'selfPa') { leave(R, src); P.pa.push(src); say(R, `${D(R, src).n}: 파트너 에리어로 이동`); }
    else if (k.c === 'sleepOther') { const cand = P.field.filter(x => x !== src && (R.cards[x].st || 'a') === 'a'); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 슬립시킬 다른 캐릭터 ${k.n}장`, cand, k.n, k.n); ids.forEach(x => { R.cards[x].st = 's'; bus(R, 'sleepEv', { s, ent: x, by: 'cost' }); }); }
    else if (k.c === 'flipEvid') { let n = k.n; if (k.var) { const mx = faceDown(R, s).length; const i = yield { who: s, kind: 'opt', msg: '표향으로 할 뒷면 증거의 수 (1장당 효과가 커집니다)', labels: Array.from({ length: mx }, (_, j) => `${j + 1}장`) }; n = Math.max(1, +i + 1); }
      const ids = yield* flipPick(R, s, s, n, '코스트'); co.flip = (co.flip || []).concat(ids); say(R, `코스트: 뒷면 증거 ${ids.length}장을 표향으로` + ids.map(x => ` (${D(R, x).n})`).join('')); }
    else if (k.c === 'fieldBottom') { const cand = [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 덱 아래로 보낼 현장의 캐릭터 ${k.n}장`, cand, k.n, k.n);
      ids.forEach(x => moveOut(R, x, 'deckBottom')); }
    else if (k.c === 'unset') { const cs = unsetPool(R, s, src, k).filter(x => fOk(R, s, x, f, src, true)); const ids = cs.length === k.n ? cs : yield pickReq(s, `코스트: 리무브할 세트 카드 ${k.n}장`, cs, k.n, k.n); ids.forEach(x => unsetOne(R, R.cards[x].fdOn != null ? R.cards[x].fdOn : R.cards[x].setOn != null ? R.cards[x].setOn : src, x)); }
    else if (k.c === 'unstack') { const under = c.under || [], ids = under.slice(0, k.n); c.under = under.slice(k.n); ids.forEach(x => R.P[R.cards[x].o].rem.push(x)); co.rem = (co.rem || []).concat(ids); say(R, `코스트: 겹쳐진 카드 ${ids.length}장을 리무브`); }
    else if (k.c === 'remBottom') { const cand = P.rem.filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 리무브 에리어에서 덱 아래로 보낼 카드 ${k.n}장`, cand, k.n, k.n, { reveal: 1 });
      const ord = k.order && ids.length > 1 ? yield pickReq(s, `덱 아래에 놓을 순서대로 클릭 (${ids.length}장)`, ids, ids.length, ids.length, { ordered: true }) : ids;
      P.rem = P.rem.filter(x => !ids.includes(x)); ord.forEach(x => P.deck.unshift(x)); remLeft(R, s, ids); }
    else if (k.c === 'revealHand') { const cand = P.hand.filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 공개할 손패 ${k.n}장 선택`, cand, k.n, k.n);
      yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}이(가) 손패를 공개: ${ids.map(x => D(R, x).n).join(', ')}`, ids, reveal: 1, by: s }; co.rev = (co.rev || []).concat(ids); co.lv = ids.length ? (+D(R, ids[0]).lv || 0) : co.lv; say(R, `코스트: 손패 ${ids.length}장 공개`); ids.forEach(x => bus(R, 'hrev', { s, ent: x, by: 'cost' })); }
    else if (k.c === 'fileRem') { const got = []; for (let i = 0; i < k.n && P.file.length; i++) { const x = P.file.pop(); R.cards[x].up = false; P.rem.push(x); got.push(x); } co.rem = (co.rem || []).concat(got); say(R, `코스트: FILE 에리어 ${got.length}장 리무브`); }
    else if (k.c === 'paRem') { const cand = P.pa.filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 파트너 에리어에서 리무브할 카드 ${k.n}장`, cand, k.n, k.n, { reveal: 1 });
      P.pa = P.pa.filter(x => !ids.includes(x)); P.rem.push(...ids); co.rem = (co.rem || []).concat(ids); say(R, `코스트: 파트너 에리어 ${ids.length}장 리무브`); }
    else if (k.c === 'sleepAny') { const cand = sleepPool(R, s, src, k); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: ${k.to === 'stun' ? '스턴' : '슬립'}시킬 캐릭터 ${k.n}장`, cand, k.n, k.n); ids.forEach(x => { const was = R.cards[x].st; R.cards[x].st = k.to === 'stun' ? 'x' : 's'; if ((was || 'a') === 'a') bus(R, 'sleepEv', { s, ent: x, by: 'cost' }); }); co.slept = (co.slept || []).concat(ids); }
    else if (k.c === 'fieldRem') { const cand = [...ally(R, 0), ...ally(R, 1)].filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 리무브할 현장 캐릭터 ${k.n}장`, cand, k.n, k.n); ids.forEach(x => rmChar(R, x, 'cost')); co.rem = (co.rem || []).concat(ids); }
    else if (k.c === 'stackCost') { const cand = k.from === 'hand' ? P.hand.filter(x => fOk(R, s, x, f, src, true)) : P.field.filter(x => x !== src && fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 겹칠 카드 ${k.n}장 선택`, cand, k.n, k.n, { reveal: k.from === 'hand' ? 1 : 0 });
      let holder = src; if (k.onto === 'pick') { const hc = P.field.filter(x => fOk(R, s, x, k.ontoF, src, true)); holder = hc.length === 1 ? hc[0] : (yield pickReq(s, '카드를 아래에 겹칠 캐릭터를 선택', hc, 1, 1))[0]; }
      if (k.from === 'hand') { yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}이(가) 손패를 공개: ${ids.map(x => D(R, x).n).join(', ')}`, ids, reveal: 1, by: s }; P.hand = P.hand.filter(x => !ids.includes(x)); } else ids.forEach(x => leave(R, x));
      const h = R.cards[holder]; (h.under = h.under || []).push(...ids); co.rev = (co.rev || []).concat(ids); say(R, `코스트: ${ids.length}장을 ${D(R, holder).n} 아래에 겹침`); if (k.from === 'hand') ids.forEach(x => bus(R, 'hrev', { s, ent: x, by: 'cost' })); }
    else if (k.c === 'either') { const ok = (k.alts || []).map((alt, i) => [alt, i]).filter(([alt]) => alt.every(x => !canPayOne(R, s, src, x))); const pick = ok.length === 1 ? 0 : yield { who: s, kind: 'opt', msg: '지불할 코스트를 고르세요', labels: ok.map(([, i]) => `코스트 ${i + 1}`) };
      for (const x of ok[pick][0]) yield* pay(R, s, src, x, ctx); }
    else if (k.c === 'handDeckTop') { const cand = P.hand.filter(x => fOk(R, s, x, f, src, true)); const ids = cand.length === k.n ? cand : yield pickReq(s, `코스트: 공개해 덱 위로 보낼 손패 ${k.n}장 선택`, cand, k.n, k.n, { reveal: 1 });
      yield { who: 1 - s, kind: 'ack', msg: `${nm(s)}이(가) 손패를 공개하고 덱 위로: ${ids.map(x => D(R, x).n).join(', ')}`, ids, reveal: 1, by: s }; P.hand = P.hand.filter(x => !ids.includes(x)); ids.forEach(x => P.deck.push(x)); co.rev = (co.rev || []).concat(ids); say(R, `코스트: 손패 ${ids.length}장을 공개하고 덱 위로`); ids.forEach(x => bus(R, 'hrev', { s, ent: x, by: 'cost' })); }
    else if (k.c === 'lpSelf') { c.lpm = (c.lpm || 0) + k.v; say(R, `코스트: ${D(R, src).n} LP${k.v}`); }
    else if (k.c === 'discardTo') { const n = P.hand.length - k.n; const ids = yield pickReq(s, `코스트: 손패가 ${k.n}장이 되도록 ${n}장 리무브`, P.hand.slice(), n, n); P.hand = P.hand.filter(x => !ids.includes(x)); P.rem.push(...ids); co.disc = (co.disc || []).concat(ids); }
    else if (X.hasCost(k.c)) yield* X.costPay(R, s, src, k, ctx); }

  function* killG(R, it) { const { atk, victim, s } = it; if (!onField(R, victim)) return; const rep = yield* replaceCheck(R, victim, s, 'contact');
    if (rep) { applyTo(R, s, atk, victim, rep); return; }
    rmChar(R, victim, 'contact', atk); say(R, '상대 캐릭터를 리무브!'); R.fl.kills = R.fl.kills || {}; R.fl.kills[atk] = true; fire(R, 'onkill', atk, { by: 'contact', victim }); fireAllyKill(R, s, atk, victim); }
  function* gen(R, it) { const { s, src } = it, ctx = { done: true, t: it.ctx || {}, cost: {}, src };
    if (it.kind === 'ab') { let altUsed = false;
      if (it.declared && (it.ab.cost || []).length) { const pv = altProv(R, s, src);
        if (pv.length && (canPay(R, s, src, it.ab) || (yield yn(s, `코스트를 지불하는 대신 ${pv.map(x => D(R, x).n).join(' / ')}을(를) 현장에서 리무브할까요?`)))) { const p = pv.length === 1 ? pv[0] : (yield pickReq(s, '코스트 대신 리무브할 캐릭터를 선택', pv, 1, 1))[0]; rmChar(R, p, 'cost'); say(R, `코스트 대신 ${D(R, p).n} 리무브`); altUsed = true; } }
      if (!altUsed) for (const k of it.ab.cost || []) if (it.declared) yield* pay(R, s, src, k, ctx);
      say(R, `▶ 효과 발동: ${D(R, src).n}` + (it.ab.lab ? ` — ${it.ab.lab}` : '')); ctx.done = true; yield* runOps(R, s, src, it.ab.ops, ctx, it); }
    else if (it.kind === 'kill') yield* killG(R, it);
    else if (it.kind === 'cb') it.fn();
    else if (it.kind === 'event') { say(R, `▶ 이벤트 효과: ${D(R, src).n}`);
      for (const ab of it.abs) { if (!condOk(R, s, src, ab, cx(ctx))) { say(R, '(조건 미충족 — 아무 일도 일어나지 않음)'); continue; } yield* runOps(R, s, src, ab.ops, ctx, it); }
      if (!ctx.moved && !R.cards[src].setOn && !R.P[s].rem.includes(src)) R.P[s].rem.push(src); }  // 해결 중 세트 대상이 떠나 이미 리무브된 경우 중복 방지
    else if (it.kind === 'flash') { const d = D(R, src), abs = (d.ab || []).filter(a => a.ic === 'flash' && !a.bang && condOk(R, s, src, a)); const c = R.cards[src];
      const yes = abs.length && (yield { who: s, kind: 'yn', msg: `${d.n}의 히라메키를 발동할까요?` });
      if (yes) { say(R, `▶ 히라메키 발동: ${d.n}`); for (const ab of abs) yield* runOps(R, s, src, ab.ops, ctx, it); }
      if (!ctx.moved) { c.up = false; R.P[s].rem.push(src); c.st = 'a'; } } }

  function step(R, it, ans) { let r; R.curS = it.s; try { r = it.g.next(ans); } catch (e) { say(R, '⚠ 효과 처리 오류: ' + e.message); R.eff = null; return; } finally { R.curS = null; }
    if (r.done) { R.eff = null; return; } R.eff = { it, req: r.value };
    const q = r.value; if (q && q.kind === 'ack' && q.reveal && q.by != null && q.ids && q.ids.length) (R.rv = R.rv || []).push({ by: q.by, ids: q.ids.slice(), msg: q.msg, src: it.src != null ? it.src : null, ack: q.who }); }  // v1.9.0: 명시적으로 '공개'하는 효과만 공개 이벤트를 만든다
  function pump(R) { let g = 0;
    while (!R.eff && (!R.sub || R.sub.type === 'contact') && R.phase === 'play' && R.q.length && g++ < 500) {
      let i = R.q.findIndex(x => x.first); if (i < 0) i = R.q.findIndex(x => x.s === R.turn && !x.last); if (i < 0) i = R.q.findIndex(x => !x.last); if (i < 0) i = 0; const it = R.q.splice(i, 1)[0]; it.g = gen(R, it); step(R, it); } }
  function answer(R, s, m) { const E = R.eff; if (!E || E.req.who !== s) return '지금 응답할 차례가 아닙니다'; const q = E.req; let v = m.v;
    if (q.kind === 'yn') v = !!v; else if (q.kind === 'ack') v = null;
    else if (q.kind === 'opt') { if (typeof v === 'string' && /^\d+$/.test(v)) v = +v; if (!Number.isInteger(v) || !(v >= 0 && v < q.labels.length)) return '잘못된 선택'; }   // null/배열/객체가 +v 로 0 번 선택지가 되지 않게 엄격히 검증
    else if (q.kind === 'optm') { v = Array.isArray(v) ? v.map(Number) : []; if (new Set(v).size !== v.length || v.some(x => !(x >= 0 && x < q.labels.length))) return '잘못된 선택'; if (v.length < q.min || v.length > q.max) return `${q.min}~${q.max}개를 선택하세요`; }
    else if (q.kind === 'text') { v = String(v == null ? '' : v).trim().slice(0, q.max || 40); if (!v) return '이름을 입력하세요'; }
    else if (q.kind === 'pick') { v = Array.isArray(v) ? v.map(Number) : []; if (new Set(v).size !== v.length) return '중복 선택';
      if (v.some(x => !q.sel.includes(x))) return '선택할 수 없는 카드가 있습니다'; if (v.length < q.min || v.length > q.max) return `${q.min === q.max ? q.min : q.min + '~' + q.max}장을 선택하세요`;
      if (q.dlv && new Set(v.map(x => lvOf(R, x))).size !== v.length) return '레벨이 서로 다른 카드를 선택하세요';
      if (q.distinct && new Set(v.map(x => D(R, x).n)).size !== v.length) return '카드 이름이 서로 다른 카드를 선택하세요';
      if (q.sumLv != null && v.reduce((t, x) => t + lvOf(R, x), 0) > q.sumLv) return `선택한 카드의 레벨 합계가 ${q.sumLv} 이하여야 합니다`; }
    R.eff = null; step(R, E.it, v); }

  // 선언 능력(【宣言】) 사용
  // 상태를 바꾸지 않는 사용 가능 검사 (클라이언트 행동 버튼 표시와 declare 가 같은 규칙을 쓴다)
  function declareCheck(R, s, id, i) { const c = R.cards[id]; if (!c || c.o !== s) return '내 카드가 아닙니다'; const P = R.P[s], ab = abList(R, id)[i];
    if (!ab || ab.ic !== 'declare') return '사용할 수 있는 능력이 아닙니다';
    if (!(P.field.includes(id) || P.kase === id || P.partner === id || (P.pa.includes(id) && ab.pa) || (P.hand.includes(id) && ab.fromHand) || (ab.fromUp && c.up && (P.evid.includes(id) || P.file.includes(id))))) return '현장/사건/파트너의 능력만 사용할 수 있습니다';
    if (!condOk(R, s, id, ab)) return '능력의 사용 조건을 만족하지 않습니다';
    if (ab.lim && ((c.u || {})[i] || 0) >= ab.lim) return '이번 턴에는 더 이상 사용할 수 없습니다';
    return altProv(R, s, id).length ? '' : canPay(R, s, id, ab); }
  // 「コスト(【スリープ】を含む)を支払う代わりにこのキャラを現場からリムーブすることで【宣言】能力を宣言できる」: 대체 코스트를 제공하는 내 현장 캐릭터 목록
  const altProv = (R, s, id) => !R.P[s].field.includes(id) ? [] : R.P[s].field.filter(h => h !== id && abList(R, h).some(a => a.ic === 'static' && a.pk === 'altdecl' && condOk(R, s, h, a) && (!a.tgt || fOk(R, s, id, a.tgt.filter, h, true))));
  const abInfo = (R, id) => abList(R, id).map((a, i) => ({ i, ic: a.ic, lab: a.lab || '', txt: a.txt || '' }));
  function declare(R, s, id, i) { const e = declareCheck(R, s, id, i); if (e) return e; const c = R.cards[id], ab = abList(R, id)[i];
    if (ab.lim) { c.u = c.u || {}; c.u[i] = (c.u[i] || 0) + 1; } R.q.push({ kind: 'ab', s, src: id, ab, ctx: {}, declared: 1 }); bus(R, 'declared', { s, ent: id }); }

  // 컷인
  const cutAbs = (R, s, id) => (D(R, id).ab || []).filter(a => a.ic === 'cutin');
  const disAbs = (R, id) => (D(R, id).ab || []).filter(a => a.ic === 'disguise');
  const disguiseOk = (R, s, id) => { const abs = disAbs(R, id); return !abs.length || abs.some(a => condOk(R, s, id, a)); };
  // pk 'evcase': 「この事件は指定されたイベントでのみ使用できる」 — 이벤트가 usecond(cond.cname)로 이 사건을 지정한 경우에만 사용할 수 있다
  const evcaseOk = (R, s, id) => D(R, id).type !== 'event' || !pk(R, s, 'evcase') || (D(R, id).ab || []).some(a => a.ic === 'usecond' && a.cond && a.cond.cname && D(R, R.P[s].kase).n.includes(a.cond.cname));
  const useOk = (R, s, id) => (D(R, id).ab || []).filter(a => a.ic === 'usecond').every(a => condOk(R, s, id, a)) && evcaseOk(R, s, id);
  const hasAbIc = (R, id, ic) => (D(R, id).ab || []).some(a => a.ic === ic);
  const ignoreColor = (R, s, id) => (D(R, id).ab || []).some(a => a.ic === 'ignorecolor' && condOk(R, s, id, a));   // 사건 색 무시(조건: 사건 이름/색/특징 등)
  const cutOk = (R, s, id, kwCut) => { const abs = cutAbs(R, s, id); return (abs.length ? abs.some(a => condOk(R, s, id, { ...a, cond: { ...a.cond, cin: undefined } })) : kwCut > 0) || handCutV(R, s, id) > 0; };
  // 손패의 카드가 받는 【컷인】 AP (예: 工藤新一 — 자신의 손패에 있는 【青】 카드는 「컷인 AP+1000」을 가진다). 여러 개면 가장 큰 값 하나만 쓴다
  const handCutV = (R, s, id) => { if (!R.P[s].hand.includes(id)) return 0; let v = 0; const cc = cols(D(R, id)); for (const t of pkVals(R, s, 'handcut')) { const [col, n] = String(t).split(':'); if (cc.includes(col)) v = Math.max(v, +n || 0); }
    { const P = R.P[s]; for (const sid of [...P.field, P.kase, P.partner, ...P.pa]) { if (sid == null) continue; const paS = P.pa.includes(sid);   // 필터형: static pk 'handcut' + v + tgt.filter (예: 手札にある【緑】の特徴[YAIBA]のキャラは「【カットイン】AP+2000」を持つ)
        for (const a of abList(R, sid)) if (a.ic === 'static' && a.pk === 'handcut' && a.v > 0 && !(paS && !a.pa) && condOk(R, s, sid, a) && fOk(R, s, id, a.tgt && a.tgt.filter, sid, true)) v = Math.max(v, a.v); } }
    return v; };
  function cutV(R, s, id, kwCut, my) { return Math.max(cutV0(R, s, id, kwCut, my), handCutV(R, s, id)); }
  function cutV0(R, s, id, kwCut, my) { const abs = cutAbs(R, s, id); if (!abs.length) return kwCut; const cx_ = { cin: my }; const v = abs.filter(a => condOk(R, s, id, a, cx_)).reduce((t, a) => t + (a.alt && condOk(R, s, id, { cond: a.alt.cond }, cx_) ? a.alt.v : (a.v || 0)) * (a.per ? countOf(R, s, id, a.per) : 1), 0); return v === 0 && !abs.some(a => a.v > 0) ? kwCut : v; }
  function cutOps(R, s, id, cin) { cutAbs(R, s, id).forEach(ab => { if (ab.ops.length && condOk(R, s, id, ab, { cin })) R.q.push({ kind: 'ab', s, src: id, ab, ctx: { cin } }); }); }

  // 클라이언트 표시용: 세트/임시로 받은 능력(d.ab 뒤에 붙는 것들)
  const grantedAb = (R, id) => { const n = R.cards[id] && (R.cards[id].blank || R.cards[id].lkiBlank) ? 0 : (D(R, id).ab || []).length; return abList(R, id).slice(n).map((a, k) => ({ i: n + k, ic: a.ic, lab: a.lab || '', txt: a.txt || '', lim: a.lim || 0 })); };
  const hasCut = (R, id) => cutAbs(R, 0, id).length > 0 || handCutV(R, R.cards[id].o, id) > 0;
  const X = require('./fx_ext')({ nameBanned, fieldMax, chosenCheck, useOk, A, D, say, shuf, pull, chk, gain, nm, fcount, cols, fOk, rf, countOf, condOk, regIds, setReg, pickReq, yn, onField, inPa, moveCards, applyG, applyTo, placeCards, inZone: inZoneFx, rmChar, leave, moveOut, release, unsetOne, takeOut, runOps, lvOf, traitsId, traitsOf, bus, fire, kwHas, enterSt, noteEnter, mrEnter, remLeft, ally, faceDown, flipEv, flipPick, evOpts, dynNum, regNumBy, cleanFilter, cleanCond, cleanOps, cleanAb, cleanCost, cx, str, num, opt, queueEvent, abList, setCards, canPayOne, pay, noTarget, fieldPa, setSolved, replaceCheck });
  FXX = X;
  // v1.11.0: own 미지정으로 남은 target/triggerSubject 필터를 모은다(검증용). 반환: [{ab, ctx, op}]
  function auditOwn(list) { const out = []; (Array.isArray(list) ? list : []).forEach((a, i) => { AUDIT = []; CUR_OP = ''; try { cleanAb([a]); } finally { const r = AUDIT; AUDIT = null; r.forEach(x => out.push({ ab: i, ctx: x.ctx, op: x.op })); } }); return out; }
  return { auditOwn, OWN_CTX, OP_CTX, noteEnter, carry, bus, pkVals, countOf, useOk, hasAbIc, ignoreColor, disguiseOk, disAbs, lvOf, enterSt, noAct, noTarget, fireAlly, fireAllyKill, fireAllyContact, fireMain, remLeft, release, hasCut, cutOk, cleanAb, fire, queueEvent, queueFlash, rmChar, leave, moveOut, mrEnter, isMR, winAlt, setSolved,
    flipEv, flipPick, evOpts, nameBanned, fieldMax, replaceAvail, pk, hasKwTk: kwHas, grantedAb, pump, answer, declare, declareCheck, abInfo, canPay, stat, cutV, cutOps, condOk, traitsOf, traitsId };
};
