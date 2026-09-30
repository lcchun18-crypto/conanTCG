// 무작위 효과가 달린 카드로 대전을 돌려 크래시/멈춤/카드 증발·복제를 검사한다.
const { S } = require('./helpers');
const SEED = +process.argv[3] || (Date.now() % 1e9); let _s = SEED; Math.random = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; // 재현 가능한 난수
const rnd = n => Math.random() * n | 0, pick = a => a[rnd(a.length)], chance = p => Math.random() < p;
const F = () => ({ lvMax0: 0, own: pick(['any', 'self', 'opp']), lvMax: chance(.3) ? pick([1, 2, 'file', 'used']) : null, apMax: chance(.2) ? 3000 : null, color: chance(.2) ? 'red' : '', st: chance(.2) ? pick(['a', 's', 'x', 'sx']) : '', notSelf: chance(.3) });
const op = d => { if (d > 1) return { op: 'draw', n: 1 };
  return pick([() => ({ op: 'draw', n: 1 + rnd(2), who: pick(['self', 'opp']), opt: chance(.3) }), () => ({ op: 'discard', n: 1 + rnd(2), who: pick(['self', 'opp']), opt: chance(.5), rand: chance(.2) }),
    () => ({ op: 'deckrem', n: 1 + rnd(3), who: pick(['self', 'opp']), opt: chance(.5) }), () => ({ op: 'gain', n: 1, who: pick(['self', 'opp']) }), () => ({ op: 'loseEvid', n: 1, who: pick(['self', 'opp']) }),
    () => ({ op: 'look', n: 1 + rnd(4), max: rnd(3), filter: F(), then: pick(['hand', 'field', 'fieldSleep', 'rem']), rest: pick(['bottom', 'shuffleBottom', 'top', 'rem', 'hand', 'keep']) }),
    () => ({ op: 'select', n: 1 + rnd(2), filter: F(), do: pick(['sleep', 'stun', 'active', 'remove', 'hand', 'deckBottom', 'deckTop', 'deckTopOrBottom', 'ap', 'lp', 'kw']), v: pick(['1000', '-1000', 'rapid', 'bullet']) }),
    () => ({ op: 'self', do: pick(['sleep', 'active', 'ap', 'hand', 'deckBottom', 'kw']), v: '1000', opt: chance(.3) }), () => ({ op: 'play', n: 1 + rnd(2), from: pick(['hand', 'rem']), filter: F(), asleep: chance(.3) }),
    () => ({ op: 'if', c: pick(['done', 'notdone']), ops: [op(d + 1)] }), () => ({ op: 'choose', opts: [{ lab: 'a', ops: [op(d + 1)] }, { lab: 'b', ops: [op(d + 1)] }] }),
    () => ({ op: 'manual', txt: 'x' }), () => ({ op: 'shuffle' }), () => ({ op: 'solve' }),
    () => ({ op: 'ent', do: pick(['active', 'sleep', 'ap', 'kw']), v: pick(['1000', 'rapid']) }), () => ({ op: 'reveal', name: pick(['C1', 'C3', 'zzz', '']), then: pick(['hand', 'rem']), rest: pick(['bottom', 'shuffleBottom', 'rem']), shuffle: chance(.5) }),
    () => ({ op: 'set' }), () => ({ op: 'if', c: 'played', name: pick(['', 'C2']), ops: [op(d + 1)] }),
    // ── sample100 에서 추가된 효과들
    () => ({ op: 'chooseMulti', max: 1 + rnd(3), opts: [{ lab: 'a', ops: [op(d + 1)] }, { lab: 'b', ops: [op(d + 1)] }, { lab: 'c', ops: [op(d + 1)] }] }),
    () => ({ op: 'ifc', cond: pick([{ handMax: 2 }, { trace: 'found' }, { fh: F(), fhN: 1 }, { fa: F() }, { paHas: F() }, { ftop: { who: pick(['self', 'opp']), type: pick(['char', 'event', '']) } }, { found: { filter: F() } }]), ops: [op(d + 1)] }),
    () => ({ op: 'optcost', cost: [pick([{ c: 'sleepSelf', n: 1 }, { c: 'discard', n: 1 }, { c: 'deckrem', n: 1 }])] }), () => ({ op: 'if', c: pick(['win', 'lose', 'picked', 'found', 'remHas', 'costHas']), filter: F(), ops: [op(d + 1)] }),
    () => ({ op: 'revealTop', n: 1 + rnd(2), filter: F(), hit: pick(['hand', 'rem']), miss: pick(['bottom', 'top', 'rem', 'hand']) }), () => ({ op: 'fetch', n: 1, from: pick(['rem', 'rempa']), filter: F() }),
    () => ({ op: 'fileToHand', n: 1 + rnd(2), opt: chance(.3) }), () => ({ op: 'investigate', n: 1 + rnd(2), named: chance(.2) }), () => ({ op: 'revealHand', who: pick(['self', 'opp']) }), () => ({ op: 'revealFile', who: pick(['self', 'opp']), n: 1 }),
    () => ({ op: 'stack', n: 1 + rnd(3), filter: F(), distinct: chance(.5) }), () => ({ op: 'unset', n: 1, scope: pick(['self', 'any']), fd: chance(.5), opt: chance(.3) }), () => ({ op: 'setDeck', n: 1, deck: pick(['self', 'opp']), to: pick(['self', 'played', 'pick']) }),
    () => ({ op: 'flip', n: 1 }), () => ({ op: 'moveSet', n: 1, filter: F(), toEmpty: chance(.5) }), () => ({ op: 'choose', opts: [{ lab: 'a', ops: [op(d + 1)] }, { lab: 'b', ops: [op(d + 1)] }] }), () => ({ op: 'flashFlipped', bang: chance(.5), filter: F() }), () => ({ op: 'rmAll', scope: pick(['all', 'contact']) }), () => ({ op: 'traitAll', trait: 'T1' }), () => ({ op: 'nohint' }), () => ({ op: 'rps' }), () => ({ op: 'pickPaid', who: pick(['self', 'opp']) }),
    () => ({ op: 'select', n: 1, filter: F(), do: pick(['remove', 'lv', 'active']), v: '-1', when: chance(.3) ? 'lpLeOwnMax' : undefined, acts: chance(.3) ? [{ do: 'ap', v: '-1000', per: 'flip' }] : undefined }),
    () => ({ op: 'play', n: 1, from: pick(['picked', 'handrem']), filter: F(), asleep: chance(.3) }), () => ({ op: 'ent', do: 'remove' }),
    () => ({ op: 'peek', n: 1 + rnd(4), reveal: chance(.5), deck: pick(['self', 'opp']), upto: chance(.3) }), () => ({ op: 'pick', from: pick(['seen', 'rem', 'pa', 'hand']), as: 'chosen', filter: F(), n: 1 + rnd(2), min: rnd(2) }),
    () => ({ op: 'mv', ref: pick(['chosen', 'seen', 'rest', 'revealed', 'last']), to: pick(['hand', 'deckBottom', 'deckTop', 'deckTopOrBottom', 'rem', 'field', 'pa']), order: pick(['asis', 'shuffle', 'any']), opt: chance(.3) }),
    () => ({ op: 'ref', ref: pick(['self', 'sel', 'played', 'seen', 'moved', 'last', 'ent']), acts: [pick([{ do: 'ap', v: '1000' }, { do: 'sleep' }, { do: 'kw', v: 'assault', until: pick(['turn', 'contact', 'oppEnd']) }, { do: 'apBase', v: '0' }])] }),
    () => ({ op: 'if', c: 'reg', ref: pick(['revealed', 'seen', 'chosen', 'moved']), filters: [F(), F()].slice(0, 1 + rnd(2)), all: chance(.3), distinct: pick(['', 'color', 'name']), ops: [op(d + 1)], else: chance(.5) ? [op(d + 1)] : undefined }),
    () => ({ op: 'delay', evs: [pick(['evrem', 'enter', 'act', 'sleepEv', 'turnEnd'])], who: pick(['', 'self', 'opp']), ops: [op(d + 1)] }), () => ({ op: 'turnPk', key: pick(['nocutin', 'nodisguise', 'noevent']), until: pick(['turn', 'action']) }), () => ({ op: 'hayIgn' }),
    () => ({ op: 'setDeck', n: 1, deck: pick(['self', 'opp', 'owner']), to: pick(['sel', 'pick']), filter: F() }),
    () => ({ op: 'selfEvid' }), () => ({ op: 'selfTo', to: pick(['pa', 'hand']) }), () => ({ op: 'flipDown', n: 1 + rnd(2) }), () => ({ op: 'select', all: true, filter: F(), do: pick(['sleep', 'active', 'ap']), v: '1000' }), () => ({ op: 'gain', n: 1, who: 'opp', opt: true })])(); };
const cond = () => chance(.4) ? { cstate: chance(.15) ? pick(['kase', 'solve']) : undefined, bond: chance(.05) ? 'C1' : undefined, ctrait: chance(.05) ? 'X' : undefined, killed: chance(.05), swapName: chance(.05) ? 'C2' : undefined, turn: pick(['self', 'opp']), fileMin: chance(.2) ? 2 : 0, pcolor: chance(.1) ? 'red' : '', fieldMin: chance(.2) ? 3 : 0, selfSt: chance(.15) ? pick(['a', 's']) : undefined,
  via: chance(.2) ? [{ type: 'char', lvMin: 1 }, { type: 'event', lvMin: 0 }] : undefined } : {};
const ab = ty => { const ic = ty === 'event' ? pick(['event', 'cutin', 'flash']) : pick(['onplay', 'onremoved', 'flash', 'declare', 'static', 'cutin', 'onact', 'oncontact', 'onreason', 'onend', 'ondisguise', 'onplay', 'onsolve', 'onmain', 'onallyremoved', 'onallykill', 'onallycontact', 'onremleave', 'replace', 'mr', 'onhint', 'onkill', 'onally', 'onally', 'enter', 'hand', 'grant']);
  const a = { ic, cond: cond(), lim: chance(.3) ? 1 : 0, ops: Array.from({ length: 1 + rnd(3) }, () => op(0)) };
  if (ic === 'static') Object.assign(a, { tgt: { sel: pick(['self', 'allies', 'opp', 'all']), filter: F(), notSelf: chance(.3) }, ap: pick([1000, -1000, 2000]), lp: pick([0, 1, -1]), kw: pick(['', 'rapid', 'bullet', 'untarget', 'noact']) });
  if (ic === 'cutin') a.v = pick([1000, 2000, 3000]);
  if (ic === 'onally') { a.ef = F(); a.on = { by: pick(['effect', 'hand', undefined]) }; }
  if (ic === 'replace') { a.rep = { to: pick(['hand', 'deckBottom', 'rem']) }; a.ef = F(); a.cost = [pick([{ c: 'selfRem', n: 1 }, { c: 'discard', n: 1 }])]; } if (chance(.1)) a.pa = true;
  if (ic === 'winalt') a.ops = [];
  if (ic === 'enter') a.st = 's'; if (ic === 'hand') a.lv = rnd(4);
  if (ic === 'grant') a.g = { ic: pick(['oncontact', 'onact', 'declare', 'onplay']), ops: [op(1)], on: { k: pick(['atk', 'def', 'char']) } };
  if (ic === 'declare') a.cost = [pick([{ c: 'sleepSelf' }, { c: 'discard', n: 1 }, { c: 'deckrem', n: 2 }, { c: 'selfBottom' }, { c: 'sleepOther', n: 1 }, { c: 'flipEvid', n: 1 + rnd(2), var: chance(.3) }, { c: 'fieldBottom', n: 1 }, { c: 'selfRem', n: 1 }, { c: 'selfPa', n: 1 }, { c: 'unset', n: 1 }, { c: 'unstack', n: 1 }, { c: 'remBottom', n: 1 }])];
  return a; };
const mkdefs = () => { const defs = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } }; const list = [];
  for (let i = 0; i < 14; i++) { const ty = i % 5 === 4 ? 'event' : 'char'; defs['c' + i] = { n: 'C' + i, type: ty, color: 'red', lv: String(i % 4), ap: String(2000 + 1000 * (i % 5)), lp: String(i % 3),
    kw: ['', 'rapid', 'assault', 'bullet', 'misread1 cutin2000', 'disguise'][i % 6], trait: 'T' + (i % 3), ab: Array.from({ length: rnd(3) }, () => ab(ty)) };
    for (let j = 0; j < 3 && list.length < 40; j++) list.push('c' + i); } return { defs, list }; };
const zones = ['deck', 'hand', 'file', 'evid', 'rem', 'field', 'pa'];
function conserve(R) { if (R.eff || R.q.length) return; R._dbg = R.phase; for (const o of [0, 1]) { const seen = new Map(); zones.forEach(z => R.P[o][z].forEach(id => { if (seen.has(id)) throw new Error(`중복 카드 ${id}: ${seen.get(id)} & ${z}`); seen.set(id, z); if (R.cards[id].o !== o) throw new Error('소유자 불일치'); }));
  [...R.P[o].field, ...R.P[o].pa].forEach(id => { for (const k of ['sets', 'fd', 'under']) (R.cards[id][k] || []).forEach(x => { if (seen.has(x)) throw new Error(`${k} 카드 중복 ${x}: ${seen.get(x)}`); if (R.cards[x].o !== o) throw new Error(k + ' 소유자'); seen.set(x, k); }); });
  if (R.P[o].pa.filter(x => S.FX.isMR(R, x)).length + R.P[o].field.filter(x => S.FX.isMR(R, x)).length > 1) throw new Error('MR 이 2장 이상 (현장+파트너 에리어): ' + [...R.P[o].field.map(x => 'F' + R.defs[R.cards[x].d].n), ...R.P[o].pa.map(x => 'P' + R.defs[R.cards[x].d].n)]);
  if (seen.size !== 40) throw new Error(`카드 수 ${seen.size} (P${o})`); if (R.P[o].field.length > 5) throw new Error('현장 초과'); } }
function answer(R) { const E = R.eff, q = E.req, s = q.who; let v;
  if (q.kind === 'yn') v = chance(.5); else if (q.kind === 'ack') v = null; else if (q.kind === 'text') v = pick(['C1', 'zzz', '']); else if (q.kind === 'optm') v = q.labels.map((_, i) => i).filter(() => chance(.5)).slice(0, q.max); else if (q.kind === 'opt') v = rnd(q.labels.length);
  else { const n = q.min + rnd(q.max - q.min + 1); const c = q.sel.slice().sort(() => Math.random() - .5); v = q.ordered ? q.ids.slice().sort(() => Math.random() - .5) : c.slice(0, n); }
  return S.act(R, s, { a: 'ans', v }); }
function move(R) { const P = R.P; let s, m;
  if (R.eff) return answer(R);
  if (R.phase === 'mull') return S.act(R, R.mullSeat, { a: 'mull', ids: P[R.mullSeat].hand.slice(0, rnd(3)) });
  if (R.sub) { const B = R.sub; s = B.who; const Fd = P[s].field;
    if (B.type === 'mis') m = { a: 'mis', ids: B.ms.filter(() => chance(.5)) };
    else if (B.type === 'guard') { const a = Fd.filter(x => R.cards[x].st === 'a'); m = { a: 'guard', id: a.length && chance(.6) ? a[0] : null }; }
    else { const h = P[s].hand; m = chance(.5) ? { a: 'pass' } : { a: chance(.5) ? 'cin' : 'dis', id: h[rnd(h.length)] }; } }
  else { s = R.turn; const Fd = P[s].field, O = P[1 - s].field, h = P[s].hand;
    if (R.fl.hw) m = chance(.5) ? { a: 'skip' } : { a: 'play', id: h[rnd(h.length)], rep: Fd[0] };
    else { const r = Math.random(), a = Fd[rnd(Fd.length)], all = [...Fd, P[s].kase, P[s].partner].filter(x => x != null);
      m = r < .1 ? { a: 'hint' } : r < .2 ? { a: 'assist' } : r < .27 ? { a: 'solve' } : r < .4 ? { a: 'play', id: h[rnd(h.length)], rep: Fd[0] } : r < .5 ? { a: 'reason', who: chance(.3) ? 'p' : a }
        : r < .6 ? { a: 'action', id: a, k: chance(.5) ? 'char' : 'case', tid: O[0] } : r < .78 ? { a: 'ability', id: pick(all), i: rnd(3) } : { a: 'end' }; } }
  return S.act(R, s, m); }
let games = 0, ends = {}, errs = {}, effs = { prompts: 0 }, actC = {}; const N = +process.argv[2] || 300;
for (let g = 0; g < N; g++) { const { defs, list } = mkdefs(), R = S.mkR('T');
  for (const s of [0, 1]) { const e = S.ready(R, s, { defs, list, partner: 'p', kase: 'k' }); if (e) throw new Error(e); }
  let st = 0, hist = [];
  try { while (R.phase !== 'over' && st++ < 4000) { const wasEff = !!R.eff; if (wasEff) effs.prompts++; const e = move(R); if (e) errs[e] = (errs[e] || 0) + 1; conserve(R); S.view(R, 0); S.view(R, 1);
      if (R.eff) { const E = R.eff.req; if (E.kind === 'pick' && (!E.sel || E.min > E.max || E.sel.length < E.min)) throw new Error('불가능한 질의: ' + JSON.stringify({ k: E.kind, min: E.min, max: E.max, sel: E.sel && E.sel.length })); } } }
  catch (e) { console.log('시드', SEED, '예외 (게임 ' + g + ')', e.stack.split('\n').slice(0, 4).join('\n'), '\nphase=', R.phase, '\n로그:', R.log.slice(-8).join(' | ')); process.exit(1); }
  games++; const k = R.phase === 'over' ? (R.log[R.log.length - 1].split('—')[1] || '').trim() : 'timeout'; ends[k] = (ends[k] || 0) + 1; }
console.log(JSON.stringify({ games, ends, prompts: effs.prompts }, null, 1));
const top = Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 5); console.log('가장 많은 거부 사유(정상 동작):', top.map(x => x.join(' ×')).join(' | '));
