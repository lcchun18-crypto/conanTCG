// 名探偵コナン TCG 룰 엔진 서버 (서버가 룰을 판정, 카드 텍스트 효과는 수동 도구로 처리)
const http = require('http'), fs = require('fs'), path = require('path');
const rooms = {}; let nid = 1;
const send = (w, o) => w && w.readyState === 1 && w.send(JSON.stringify(o));
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } };
const cl = (x, n = 2000) => String(x || '').slice(0, n);
const nm = s => s ? '게스트' : '호스트';
const mkP = () => ({ deck: [], hand: [], file: [], evid: [], rem: [], field: [], partner: null, pIn: false, kase: null, ready: false, pa: [], tr: false });
const mkR = code => ({ code, ws: [null, null], defs: {}, cards: {}, q: [], eff: null, ending: 0, P: [mkP(), mkP()], phase: 'setup', turn: 0, first: 0, n: 0, fl: {}, sub: null, tt: [[], []], actor: null, log: ['방이 만들어졌습니다.'] });
const say = (R, t) => R.log.push(t);
const D = (R, id) => R.defs[R.cards[id].d];
const tok = d => { const k = String(d.kw || '').toLowerCase(), n = re => { const m = re.exec(k); return m ? +m[1] : 0; };
  return { rapid: /rapid/.test(k), asC: /assault(?!-case)/.test(k), asE: /assault(?!-char)/.test(k), bullet: /bullet/.test(k),
    dis: /disguise/.test(k), mis: n(/misread\s*[:=]?\s*(\d+)/), cut: n(/cutin\s*[:=]?\s*(\d+)/) }; };
const ap = (R, id) => (R.cards[id].bAp != null ? R.cards[id].bAp : (+D(R, id).ap || 0)) + (R.cards[id].apm || 0) + (R.cards[id].cm || 0) + FX.stat(R, id).ap;
const lpOf = (R, id) => (R.cards[id].bLp != null ? R.cards[id].bLp : (+D(R, id).lp || 0)) + (R.cards[id].lpm || 0) + FX.stat(R, id).lp;
const tk = (R, id) => { let kw = (D(R, id).kw || '') + ' ' + (R.cards[id].tkw || '') + FX.stat(R, id).kw; for (const w of String(R.cards[id].lose || '').split(/\s+/).filter(Boolean)) kw = kw.replace(new RegExp(w + '\\s*[:=]?\\s*\\d*', 'ig'), ' '); return tok({ kw }); };
const cols = d => String(d.color || '').toLowerCase().split(/[\/,&\s]+/).filter(Boolean);
const okc = (R, s, d, id) => { if (id != null && FX.hasAbIc(R, id, 'ignorecolor')) return true; const cc = cols(D(R, R.P[s].kase)); return cols(d).every(x => cc.includes(x)); };
const fcount = (R, s) => R.P[s].file.length + (R.P[s].pIn ? 1 : 0);
const FX = require('./fx')({ D, say, shuf, pull, chk, gain, nm, fcount, cols, ap: (R, id) => ap(R, id), lpOf: (R, id) => lpOf(R, id) });
const win = (R, s, why) => { if (R.phase === 'over') return; [...R.q, ...(R.eff ? [R.eff.it] : [])].forEach(it => { if (it.kind === 'flash' || it.kind === 'event') R.P[it.s].rem.push(it.src); }); // 처리 중이던 카드는 리무브 에리어로
  R.phase = 'over'; R.winner = s; R.sub = null; R.eff = null; R.q = []; say(R, `🏆 ${nm(s)} 승리 — ${why}`); };

// 덱: 배열 끝이 맨 위
const top = (R, s) => R.P[s].deck.pop();
function chk(R, s) { const P = R.P[s]; if (R.phase !== 'play' || P.deck.length) return;
  if (!P.rem.length) return win(R, 1 - s, `${nm(s)} 리프레시 불가(리무브 에리어 0장)`);
  const old = P.rem; P.deck = P.rem; P.rem = []; shuf(P.deck); R.P[1 - s].tr = true; say(R, `${nm(s)} 리프레시! 상대가 증거 1장 획득`); gain(R, 1 - s, 1); FX.remLeft(R, s, old); }
function pull(R, s) { if (!R.P[s].deck.length) return null; const x = top(R, s); chk(R, s); return x; }
function gain(R, s, n, cx) { let got = 0; for (let i = 0; i < n && R.phase === 'play'; i++) { const x = pull(R, s); if (x != null) { R.cards[x].up = false; R.P[s].evid.push(x); got++; } } if (got) FX.bus(R, 'evgain', { s, by: 'effect', ...(cx || {}) }); }
const rmChar = (R, s, id, why, killer) => FX.rmChar(R, id, why, killer);

function startTurn(R) { const s = R.turn, P = R.P[s]; R.n++; R.fl = {}; R.actor = null; R.step = 'main'; Object.values(R.cards).forEach(c => { c.u = {}; });
  P.pIn = false; R.cards[P.partner].st = 'a';
  P.field.forEach(id => { const c = R.cards[id]; if (FX.hasKwTk(R, id, 'noauto')) return; c.st = c.st === 'x' ? 's' : 'a'; }); // 스턴은 액티브 대신 슬립(noauto 키워드는 오토 페이즈에 상태가 바뀌지 않음)
  let x = pull(R, s); if (x != null) P.hand.push(x);
  for (let i = 0; i < (R.n === 1 ? 1 : 2) && R.phase === 'play'; i++) { x = pull(R, s); if (x != null) { R.cards[x].up = false; P.file.push(x); } }
  say(R, `── ${nm(s)}의 턴 (#${R.n}) ──`); FX.fireMain(R, s); }

function start(R) { R.phase = 'mull'; R.first = Math.random() < .5 ? 0 : 1; R.mullSeat = R.first;
  R.P.forEach(P => { shuf(P.deck); for (let i = 0; i < 5; i++) P.hand.push(P.deck.pop()); });
  say(R, `선공: ${nm(R.first)}. 손패 교체(멀리건)는 1회 가능합니다.`); }

function ready(R, s, m) {
  if (R.phase !== 'setup') return '이미 게임이 시작되었습니다';
  const defs = {}, P = R.P[s], T = ['partner', 'char', 'event', 'case'];
  Object.entries(m.defs || {}).slice(0, 300).forEach(([id, d]) => { defs[id] = R.defs[s + ':' + id] = {
    n: cl(d.n, 80), type: T.includes(d.type) ? d.type : 'char', color: cl(d.color, 30), lv: cl(d.lv, 4), lv2: cl(d.lv2, 4), ap: cl(d.ap, 8),
    lp: cl(d.lp, 4), kw: cl(d.kw, 100), trait: cl(d.trait, 100), ab: FX.cleanAb(typeof d.ab === 'string' ? (() => { try { return JSON.parse(d.ab); } catch { return []; } })() : d.ab), fx: cl(d.fx), extra: cl(d.extra), img: String(d.img || '').startsWith('data:image/') ? d.img.slice(0, 200000) : '' }; });
  const L = m.list || [];
  if (L.length !== 40) return `덱은 정확히 40장이어야 합니다 (현재 ${L.length}장)`;
  for (const id of L) { const d = defs[id]; if (!d || !['char', 'event'].includes(d.type)) return '덱에는 캐릭터/이벤트 카드만 넣을 수 있습니다'; }
  const cc = {}; for (const id of L) { cc[id] = (cc[id] || 0) + 1; if (cc[id] > 3 && !(defs[id].ab || []).some(a => a.ic === 'deckfree')) return `같은 카드는 최대 3장 (${defs[id].n})`; }
  if (!defs[m.partner] || defs[m.partner].type !== 'partner') return '파트너 카드를 선택하세요';
  if (!defs[m.kase] || defs[m.kase].type !== 'case') return '사건 카드를 선택하세요';
  Object.values(R.cards).filter(c => c.o === s).forEach(c => delete R.cards[c.id]);
  const mkc = id => { const i = nid++; R.cards[i] = { id: i, o: s, d: s + ':' + id, st: 'a' }; return i; };
  P.deck = L.map(mkc); P.partner = mkc(m.partner); P.kase = mkc(m.kase); P.ready = true;
  say(R, `${nm(s)} 덱 등록 완료`);
  if (R.P[0].ready && R.P[1].ready) start(R); }

function doReason(R, s, who, mis) { const P = R.P[s];
  let lp = (who === 'p' ? +D(R, P.partner).lp || 0 : lpOf(R, who)) - mis;
  say(R, `추리! 증거 ${lp}장` + (mis ? ` (미스리드 -${mis})` : '')); if (lp > 0) gain(R, s, lp, { by: 'reason', ent: who === 'p' ? P.partner : who }); }

function contact(R, a, d) { const t = R.turn;
  const S = R.sub = { type: 'contact', atk: a, def: d, i: 0, pass: [], used: {} };
  S.order = ap(R, a) < ap(R, d) ? [t, 1 - t] : [1 - t, t]; S.who = S.order[0];
  FX.bus(R, 'contact', { s: R.cards[a].o, ent: a, tid: d }); FX.fire(R, 'oncontact', a, { k: 'atk', ent: d }); FX.fire(R, 'oncontact', d, { k: 'def', ent: a }); FX.fireAllyContact(R, R.cards[a].o, a); FX.fireAllyContact(R, R.cards[d].o, d);
  say(R, `컨택트! ${D(R, a).n}(AP ${ap(R, a)}) vs ${D(R, d).n}(AP ${ap(R, d)}) — ${nm(S.who)} 먼저 행동`); }
function endContact(R) { const S = R.sub, ao = R.cards[S.atk].o, dof = R.cards[S.def].o; R.sub = null;
  if (R.P[ao].field.includes(S.atk) && R.P[dof].field.includes(S.def)) { const A = ap(R, S.atk), B = ap(R, S.def);
    say(R, `AP 판정: ${A} vs ${B}`); if (A >= B) { if (FX.replaceAvail(R, S.def, ao, 'contact')) R.q.push({ kind: 'kill', s: ao, atk: S.atk, victim: S.def });
      else { rmChar(R, dof, S.def, 'contact', S.atk); say(R, '상대 캐릭터를 리무브!'); R.fl.kills = R.fl.kills || {}; R.fl.kills[S.atk] = true; FX.fire(R, 'onkill', S.atk, { by: 'contact', victim: S.def }); FX.fireAllyKill(R, ao, S.atk, S.def); } } else say(R, '아무 일도 일어나지 않음'); }
  R.fl.pkA = [{}, {}]; FX.bus(R, 'actend', { s: ao, ent: S.atk, k: 'char', tid: S.def });
  [S.atk, S.def].forEach(x => { if (R.cards[x]) R.cards[x].cm = 0; }); }
function cont(R, s, m) { const S = R.sub, P = R.P[s];
  if (m.a === 'pass') S.pass[S.i === 2 ? 0 : S.i] = 1;
  else if (m.a === 'cin' || m.a === 'dis') {
    if (S.used[s]) return '컨택트당 1회(1장)만 행동할 수 있습니다';
    const id = m.id; if (!P.hand.includes(id)) return '손패에 없는 카드';
    const d = D(R, id), t = tok(d), k = R.cards[S.atk].o === s ? 'atk' : 'def', my = S[k];
    if (m.a === 'cin') { if (FX.pk(R, 1 - s, 'nocutin')) return '카드 효과로 인해 컷인을 사용할 수 없습니다'; if (!FX.cutOk(R, s, id, t.cut)) return '컷인을 가진 카드가 아니거나 지금은 사용할 수 없는 컷인입니다'; const v = FX.cutV(R, s, id, t.cut, my); R.cards[my].cm = (R.cards[my].cm || 0) + v;
      P.hand = P.hand.filter(x => x !== id); P.rem.push(id); say(R, `컷인! ${d.n} → AP+${v}`); FX.cutOps(R, s, id, my); FX.bus(R, 'cutin', { s, ent: id, tid: my }); }
    else { if (FX.pk(R, 1 - s, 'nodisguise')) return '카드 효과로 인해 변장을 사용할 수 없습니다'; if ((!t.dis && !FX.disAbs(R, id).length) || d.type !== 'char') return '변장을 가진 캐릭터가 아닙니다'; if (!FX.disguiseOk(R, s, id)) return '변장 조건(사건/FILE 등)을 만족하지 않습니다'; if (!P.field.includes(my)) return '컨택트 중인 내 캐릭터가 현장에 없어 변장할 수 없습니다'; const o = R.cards[my], n = R.cards[id];
      FX.release(R, my); P.field[P.field.indexOf(my)] = id; P.hand = P.hand.filter(x => x !== id);
      Object.assign(n, { st: o.st, apm: o.apm, cm: o.cm, lpm: o.lpm, sum: o.sum }); Object.assign(o, { st: 'a', apm: 0, cm: 0, lpm: 0, sum: 0 });
      if (FX.isMR(R, my) && R.turn !== s) { P.pa.push(my); say(R, `${D(R, my).n}: 상대 턴에 현장을 떠나 파트너 에리어로 이동`); } else P.deck.unshift(my); S[k] = id; say(R, `변장! ${d.n}(으)로 교체 (원래 캐릭터는 덱 아래)`); FX.mrEnter(R, s, id); if (!FX.pk(R, 1 - s, 'nodisev')) FX.fire(R, 'ondisguise', id, { swapped: my }); FX.bus(R, 'disguise', { s, ent: id, tid: id, swapped: my }); }
    S.used[s] = 1;
  } else return '컷인/변장/패스 중 선택하세요';
  S.i++; if (S.i === 2 && !(S.pass[0] && !S.pass[1])) S.i = 3;
  if (S.i >= 3) return endContact(R); S.who = S.order[S.i === 2 ? 0 : S.i]; }
function guard(R, gid) { const S = R.sub, t = R.turn, O = R.P[1 - t];
  if (gid != null) return contact(R, S.atk, gid);
  if (S.tk === 'char') return contact(R, S.atk, S.tid);
  R.actor = S.atk; R.sub = null; const x = O.evid.pop(); if (x != null) { say(R, '사건 액션 성공: 상대 증거 1장 리무브'); const up = R.cards[x].up; R.cards[x].up = false;
    if ((D(R, x).ab || []).some(a => a.ic === 'flash' && !a.bang) && !FX.pk(R, t, 'noflash')) FX.queueFlash(R, 1 - t, x); else O.rem.push(x); FX.bus(R, 'evrem', { s: 1 - t, by: 'action', ent: S.atk, cz: t }); } gain(R, t, 1, { by: 'action', k: 'case', ent: S.atk }); R.fl.pkA = [{}, {}]; FX.bus(R, 'actend', { s: t, ent: S.atk, k: 'case' }); }
function subact(R, s, m) { const S = R.sub, P = R.P[s];
  if (s !== S.who) return '상대의 응답을 기다리는 중입니다';
  if (S.type === 'mis') { if (m.a !== 'mis') return '미스리드를 선택하세요'; let t = 0;
    (m.ids || []).filter(x => S.ms.includes(x)).forEach(x => { R.cards[x].st = 's'; t += tk(R, x).mis; FX.bus(R, 'sleepEv', { s: R.cards[x].o, ent: x, by: 'mis' }); FX.bus(R, 'mis', { s: R.cards[x].o, ent: x, by: 'mis' }); });
    R.sub = null; return doReason(R, R.turn, S.rs, t); }
  if (S.type === 'guard') { if (m.a !== 'guard') return '가드 여부를 선택하세요';
    { const mg = mustGuard(R, s); if (mg.length && !mg.includes(m.id)) return '「必ずガードする」 능력을 가진 캐릭터로 반드시 가드해야 합니다'; }
    if (m.id != null) { const g = R.cards[m.id]; if (!g || !P.field.includes(m.id) || (g.st !== 'a' && !(g.st === 's' && FX.hasKwTk(R, m.id, 'sleepguard')))) return '액티브 캐릭터만 가드할 수 있습니다'; if (FX.hasKwTk(R, m.id, 'cantguard')) return '이 캐릭터는 가드할 수 없습니다'; g.st = 's'; say(R, '가드!'); FX.bus(R, 'sleepEv', { s, ent: m.id, by: 'action' }); FX.bus(R, 'guard', { s, ent: m.id, tid: S.atk, dst: S.def, k: S.tk }); }
    return guard(R, m.id); }
  return cont(R, s, m); }

function loc(R, id) { for (const s of [0, 1]) { const P = R.P[s]; if (P.partner === id) return { s, z: 'partner' };
  for (const z of ['hand', 'field', 'rem', 'deck', 'file', 'evid']) if (P[z].includes(id)) return { s, z }; } }
function fx(R, s, m) { const P = R.P[s], n = Math.max(1, Math.min(+m.n || 1, 20)), c = R.cards[m.id];
  switch (m.op) {
    case 'draw': for (let i = 0; i < n; i++) { const x = pull(R, s); if (x != null) P.hand.push(x); } say(R, `[효과] ${nm(s)} ${n}장 드로우`); break;
    case 'rem': { let k = 0; for (let i = 0; i < n && P.deck.length; i++) { P.rem.push(top(R, s)); k++; } chk(R, s); say(R, `[효과] 덱 위 ${k}장 리무브`); break; }
    case 'gain': gain(R, s, n); say(R, `[효과] ${nm(s)} 증거 ${n}장 획득`); break;
    case 'lose': { const t = m.side ? 1 - s : s, T = R.P[t]; let k = 0; for (let i = 0; i < n && T.evid.length; i++) { T.rem.push(T.evid.pop()); k++; } say(R, `[효과] ${nm(t)} 증거 ${k}장 리무브`); break; }
    case 'shuf': shuf(P.deck); say(R, '[효과] 덱 셔플'); break;
    case 'peek': (R.peek = R.peek || {})[s] = P.deck.slice(-n).reverse().map(x => co(R, x)); break;
    case 'st': case 'apm': case 'lpm': { const L = c && loc(R, m.id); if (!L || !['field', 'partner'].includes(L.z)) return '필드/파트너 카드만 대상입니다';
      if (m.op === 'st') c.st = (m.v === 'a' && c.st === 'x') ? 's' : m.v; else c[m.op] = (c[m.op] || 0) + (+m.v || 0);
      say(R, `[효과] ${D(R, m.id).n}: ${m.op} ${m.v}`); break; }
    case 'mv': { const L = c && loc(R, m.id); if (!L || L.z === 'partner') return '이동할 수 없는 카드입니다';
      if (L.s !== s && !(L.z === 'field' && m.to === 'rem')) return '상대 카드는 필드 캐릭터를 리무브하는 것만 가능합니다';
      const T = R.P[L.s]; if (m.to === 'field' && T.field.length >= 5) return '현장이 가득 찼습니다';
      T[L.z] = T[L.z].filter(x => x !== m.id);
      if (m.to === 'deckTop') T.deck.push(m.id); else if (m.to === 'deckBottom') T.deck.unshift(m.id);
      else if (['hand', 'rem', 'file', 'evid', 'field'].includes(m.to)) T[m.to].push(m.id); else { T[L.z].push(m.id); return '알 수 없는 이동'; }
      c.st = 'a'; c.apm = c.cm = c.lpm = 0; c.sum = m.to === 'field' ? 1 : 0; chk(R, L.s);
      say(R, `[효과] ${nm(L.s)} 카드 이동 → ${m.to}` + (['rem', 'field'].includes(m.to) ? ` (${D(R, m.id).n})` : '')); break; }
    default: return '알 수 없는 효과 도구'; } }

function doEnd(R) { const s = R.turn; R.ending = 0; Object.values(R.cards).forEach(c => { c.apm = 0; c.lpm = 0; c.cm = 0; c.lvm = 0; c.tab = []; c.tkw = ''; c.sum = 0; }); R.tt = [[], []]; R.actor = null; FX.carry(R, s);
  say(R, `${nm(s)} 턴 종료`); R.turn = 1 - s; startTurn(R); }
function act(R, s, m) { const e = act0(R, s, m); if (!e) { FX.pump(R); if (R.ending && !R.eff && !R.q.length && !R.sub && R.phase === 'play') doEnd(R); } return e; }
function act0(R, s, m) { const P = R.P[s], O = R.P[1 - s];
  if (R.phase === 'over') return '게임이 끝났습니다';
  if (m.a === 'resign') return void win(R, 1 - s, `${nm(s)} 항복`);
  if (R.phase === 'setup') return '상대를 기다리는 중입니다';
  if (R.phase === 'mull') { if (s !== R.mullSeat || m.a !== 'mull') return '내 멀리건 차례가 아닙니다';
    const ids = (m.ids || []).filter(x => P.hand.includes(x)); P.hand = P.hand.filter(x => !ids.includes(x));
    P.deck.push(...ids); shuf(P.deck); ids.forEach(() => P.hand.push(top(R, s))); say(R, `${nm(s)} 멀리건: ${ids.length}장 교체`);
    if (s === R.first) R.mullSeat = 1 - s; else { R.phase = 'play'; R.turn = R.first; R.n = 0; say(R, '게임 시작!'); startTurn(R); } return; }
  if (m.a === 'ans') return FX.answer(R, s, m);
  if (R.eff || R.ending) return '효과 처리 중입니다. 먼저 표시된 선택을 완료하세요.';
  if (m.a === 'peekclose') { if (R.peek) delete R.peek[s]; return; }
  if (m.a === 'fx') return fx(R, s, m);
  R.peek = null;
  if (R.sub) return subact(R, s, m);
  if (s !== R.turn) return '상대의 턴입니다';
  if (R.fl.hw && !['play', 'skip'].includes(m.a)) return '넥스트 힌트로 얻은 사용 기회를 먼저 처리하세요 (카드 사용 또는 스킵)';
  const pc = R.cards[P.partner];
  switch (m.a) {
    case 'play': { const id = m.id; if (!P.hand.includes(id)) return '손패에 없는 카드입니다'; const d = D(R, id);
      if (!R.fl.hw && (R.fl.played || R.fl.hint)) return R.fl.hint ? '이번 턴에 넥스트 힌트를 했으므로 손패 사용은 불가' : '손패 사용은 턴에 1회입니다';
      const lvUsed = FX.lvOf(R, id); if (lvUsed > fcount(R, s)) return `레벨 ${lvUsed}: FILE 에리어 카드가 부족합니다 (현재 ${fcount(R, s)}장)`;
      if (d.type !== 'char' && FX.pk(R, s, 'noevent')) return '카드 효과로 인해 이번 턴에는 이벤트를 사용할 수 없습니다'; if (!okc(R, s, d, id)) return '내 사건과 색이 맞지 않습니다'; if (!FX.useOk(R, s, id)) return '이 카드의 사용 조건을 만족하지 않습니다'; { const ot = FX.pkVals(R, s, 'onlytrait'); if (d.type === 'char' && ot.length && !ot.every(tr => FX.traitsId(R, id).includes(tr))) return `${ot.join('/')} 특징의 카드만 손패에서 사용할 수 있습니다`; }
      if (d.type === 'char') { if (P.field.length >= 5) { if (!P.field.includes(m.rep)) return '현장이 가득 참 — 스위치할 캐릭터를 선택하세요'; rmChar(R, s, m.rep, 'switch'); say(R, '스위치!'); }
        P.field.push(id); const c = R.cards[id]; c.st = FX.enterSt(R, id); c.sum = 1; c.apm = c.cm = c.lpm = c.lvm = 0; c.tkw = ''; c.tab = []; c.bAp = c.bLp = null; c.lose = ''; FX.mrEnter(R, s, id); FX.noteEnter(R, s, id); }
      const viaHint = !!R.fl.hw; P.hand = P.hand.filter(x => x !== id); say(R, `${nm(s)} 사용: ${d.n}`);
      if (d.type === 'char') { FX.fire(R, 'onplay', id, { by: 'hand' }); FX.fireAlly(R, s, id, { by: 'hand' }); FX.bus(R, 'enter', { s, ent: id, by: viaHint ? 'hint' : 'hand' }); }
      else { if (!(d.ab && d.ab.length) && d.fx) say(R, '(효과 데이터가 없는 이벤트 — 효과 도구로 수동 처리)'); FX.queueEvent(R, s, id); FX.bus(R, 'useev', { s, ent: id, by: viaHint ? 'hint' : 'hand' }); }
      if (viaHint) [P.partner, ...P.field].forEach(x => FX.fire(R, 'onhint', x, { by: 'hint', lv: lvUsed, used: id }));
      if (R.fl.hw) R.fl.hw = 0; else R.fl.played = 1; return; }
    case 'skip': R.fl.hw = 0; return;
    case 'hint': if (R.fl.nh) return '이번 턴에는 넥스트 힌트를 할 수 없습니다 (카드 효과)'; if (!P.file.length) return 'FILE 에리어에 카드가 없습니다'; P.hand.push(P.file.pop()); R.fl.hint = 1; R.fl.hw = 1; say(R, `${nm(s)} 넥스트 힌트`); FX.bus(R, 'fileHand', { s, by: 'hint' }); FX.bus(R, 'hint', { s, by: 'hint' }); return;
    case 'assist': if (P.pIn || pc.st !== 'a') return '액티브 파트너만 어시스트할 수 있습니다'; pc.st = 's'; P.pIn = true; say(R, `${nm(s)} 어시스트! (FILE ${fcount(R, s)}장)`);
      if (fcount(R, s) >= 7 && !R.cards[P.kase].solved) FX.setSolved(R, s); return;
    case 'solve': { if (!R.cards[P.kase].solved) return '사건이 해결편이 아닙니다'; if (P.pIn || pc.st !== 'a') return '파트너가 액티브가 아닙니다';
      const need = +(s === R.first ? D(R, P.kase).lv : D(R, P.kase).lv2) || 0; if (P.evid.length < need) return `증거 부족 (${P.evid.length}/${need})`;
      const alt = FX.winAlt(R, s); if (alt) { for (let i = 0; i < need; i++) { const x = P.evid.pop(); R.cards[x].up = false; P.rem.push(x); } say(R, `증거 은닉! 증거 ${need}장을 리무브`); pc.st = 's'; return win(R, s, '상대는 게임에 패배합니다(증거 은닉)'); }
      pc.st = 's'; return win(R, s, '사건 해결!'); }
    case 'reason': { const who = m.who;
      if (who === 'p') { if (P.pIn || pc.st !== 'a') return '액티브 파트너만 추리할 수 있습니다'; pc.st = 's'; }
      else { const c = R.cards[who]; if (!c || !P.field.includes(who) || c.st !== 'a') return '액티브 캐릭터만 추리할 수 있습니다'; if (FX.hasKwTk(R, who, 'cantreason')) return '이 캐릭터는 추리할 수 없습니다';
        if (c.sum && !tk(R, who).rapid) return '등장한 턴(명승 상태)에는 추리할 수 없습니다 (신속 필요)'; c.st = 's'; FX.bus(R, 'sleepEv', { s, ent: who, by: 'reason' }); }
      say(R, `${nm(s)} 추리 선언`); if (who !== 'p') FX.fire(R, 'onreason', who); FX.bus(R, 'reason', { s, ent: who === 'p' ? P.partner : who }); const ms = O.field.filter(x => R.cards[x].st === 'a' && tk(R, x).mis > 0);
      const go = () => { if (ms.length) R.sub = { type: 'mis', who: 1 - s, rs: who, ms }; else doReason(R, s, who, 0); };
      if (R.q.length || R.eff) R.q.push({ kind: 'cb', s, last: true, fn: go }); else go(); return; }
    case 'action': { const c = R.cards[m.id]; if (!c || !P.field.includes(m.id) || c.st !== 'a') return '액티브 캐릭터만 액션할 수 있습니다';
      const t = tk(R, m.id), k = m.k; if (FX.hasKwTk(R, m.id, 'cantact')) return '이 캐릭터는 액션할 수 없습니다';
      if (c.sum && !(t.rapid || (k === 'char' ? t.asC : t.asE))) return '등장한 턴(명승 상태)에는 액션할 수 없습니다 (신속/돌격 필요)';
      { const md = mustDesig(R, s, m.id); if (md.length && !(k === 'char' && md.includes(m.tid))) return '「必ず指定する」 능력을 가진 캐릭터를 지정해야 합니다'; }
      if (k === 'char') { const tc = R.cards[m.tid]; if (!tc || !O.field.includes(m.tid) || (tc.st === 'a' && !FX.hasKwTk(R, m.id, 'actactive'))) return '슬립/스턴 상태의 상대 캐릭터만 대상입니다'; if (FX.noAct(R, m.tid)) return '카드 효과로 인해 이 캐릭터는 액션의 대상으로 지정할 수 없습니다'; }
      else if (k !== 'case' || !O.evid.length) return '증거가 1장도 없는 사건은 지정할 수 없습니다';
      else if (FX.hasKwTk(R, m.id, 'nocase')) return '이 캐릭터는 사건을 지정해 액션할 수 없습니다';
      c.st = 's'; FX.bus(R, 'sleepEv', { s, ent: m.id, by: 'action' }); R.fl.acted = R.fl.acted || {}; R.fl.acted[m.id] = R.fl.acted[m.id] && R.fl.acted[m.id] !== k ? 'both' : k; FX.fire(R, 'onact', m.id, { k }); FX.bus(R, 'act', { s, ent: m.id, tid: k === 'char' ? m.tid : null, k }); R.sub = { type: 'guard', who: 1 - s, atk: m.id, tk: k, tid: m.tid }; say(R, `${nm(s)} 액션: ${D(R, m.id).n} → ${k === 'char' ? D(R, m.tid).n : '상대 사건'}`);
      if (t.bullet) { say(R, '불릿: 가드 불가'); return guard(R, null); } return; }
    case 'end': R.ending = 1; P.field.forEach(id => FX.fire(R, 'onend', id)); O.field.forEach(id => FX.fire(R, 'onend', id, { gonly: 1 })); FX.bus(R, 'turnEnd', { s }); return;
    case 'ability': return FX.declare(R, s, m.id, +m.i);
    default: return '알 수 없는 행동'; } }

// 지금 이 좌석이 각 카드로 "실제로 할 수 있는" 행동 목록 (act0 의 검사와 같은 조건, 상태를 바꾸지 않음). 클라이언트 행동 버튼의 유일한 근거.
// 「必ず指定する」(mustdesig): 상대 현장에 지정 가능한 mustdesig 캐릭터가 있으면 액션은 그 캐릭터 중 하나를 지정해야 한다
const mustDesig = (R, s, atk) => R.P[1 - s].field.filter(x => FX.hasKwTk(R, x, 'mustdesig') && (R.cards[x].st !== 'a' || FX.hasKwTk(R, atk, 'actactive')) && !FX.noAct(R, x));
// 「ガードできる場合、必ずガードする」(mustguard): 가드 가능한 mustguard 캐릭터가 있으면 반드시 그 캐릭터 중 하나로 가드해야 한다
const mustGuard = (R, s) => R.P[s].field.filter(x => FX.hasKwTk(R, x, 'mustguard') && (R.cards[x].st === 'a' || (R.cards[x].st === 's' && FX.hasKwTk(R, x, 'sleepguard'))) && !FX.hasKwTk(R, x, 'cantguard'));
function actsFor(R, s) { const out = {}; if (R.phase !== 'play' || R.turn !== s || R.sub || R.eff || R.ending || R.fl.hw) return out;
  const P = R.P[s], O = R.P[1 - s], pc = R.cards[P.partner]; const add = (id, a) => { (out[id] = out[id] || []).push(a); };
  const abs = id => FX.abInfo(R, id).filter(a => a.ic === 'declare' && !FX.declareCheck(R, s, id, a.i)).forEach(a => add(id, { k: 'ab', i: a.i, lab: a.lab || (a.txt || '').slice(0, 24) || ('#' + (a.i + 1)) }));
  if (P.partner && pc) { if (!P.pIn && pc.st === 'a') { add(P.partner, { k: 'reason' }); add(P.partner, { k: 'assist' }); }
    if (R.cards[P.kase] && R.cards[P.kase].solved && !P.pIn && pc.st === 'a') { const need = +(s === R.first ? D(R, P.kase).lv : D(R, P.kase).lv2) || 0; if (P.evid.length >= need) add(P.partner, { k: 'solve' }); }
    abs(P.partner); }
  for (const id of P.field) { const c = R.cards[id], t = tk(R, id);
    if (c.st === 'a') { if (!c.sum || t.rapid) add(id, { k: 'reason' });
      if (!c.sum || t.rapid || t.asC) { const tg = O.field.filter(x => { const tc = R.cards[x]; return (tc.st !== 'a' || FX.hasKwTk(R, id, 'actactive')) && !FX.noAct(R, x); }); if (tg.length && !FX.hasKwTk(R, id, 'cantact')) add(id, { k: 'actc', tg: mustDesig(R, s, id).length ? mustDesig(R, s, id) : tg }); }
      if ((!c.sum || t.rapid || t.asE) && !mustDesig(R, s, id).length && O.evid.length && !FX.hasKwTk(R, id, 'nocase') && !FX.hasKwTk(R, id, 'cantact')) add(id, { k: 'actk' }); }
    abs(id); }
  if (P.kase) abs(P.kase); P.pa.forEach(abs); return out; }
// 캐릭터에 세트된 카드(sl): 앞면 세트 = 공개 정보 전체, 뒷면(fd) 세트 = 본인에게만 카드 정보, 상대에게는 뒷면(정보 없음). (표시용 직렬화만, 게임 규칙 무관)
const withSets = (R, id, owner, viewer) => { const c = R.cards[id], v = co(R, id), fd = c.fd || [], st = c.sets || [];
  if (fd.length || st.length) v.sl = [...fd.map(y => owner === viewer ? { ...co(R, y), fd: 1 } : { fd: 1, hidden: 1 }), ...st.map(y => co(R, y))]; return v; };
const co = (R, id) => { const c = R.cards[id], d = D(R, id); return { id, d: c.d, st: c.st || 'a', apm: ap(R, id) - (+d.ap || 0), lpm: lpOf(R, id) - (+d.lp || 0), sum: c.sum ? 1 : 0, set: (c.sets || []).length + (c.fd || []).length, under: (c.under || []).length, up: c.up ? 1 : 0, lvx: FX.lvOf(R, id), u: c.u || {}, kw: (c.tkw || '').trim(), ga: FX.grantedAb(R, id) }; };
function effView(R, s) { const E = R.eff; if (!E) return null; const q = E.req;
  if (q.who !== s) return { wait: 1, msg: '상대가 효과를 처리하는 중입니다…' };
  return { kind: q.kind, msg: q.msg, min: q.min, max: q.max, ordered: q.ordered, distinct: q.distinct, labels: q.labels, yes: q.yes, no: q.no, reveal: q.reveal, cards: (q.ids || []).map(x => co(R, x)), sel: q.sel, src: E.it.src != null ? D(R, E.it.src).n : '', srcD: E.it.src != null && R.cards[E.it.src] ? R.cards[E.it.src].d : '', abI: E.it.src != null && E.it.ab ? (D(R, E.it.src).ab || []).indexOf(E.it.ab) : -1, abN: E.it.src != null ? (D(R, E.it.src).ab || []).length : 0, abLab: (E.it.ab && E.it.ab.lab) || '', itK: E.it.kind || '' }; }
function view(R, s) { const V = { t: 'v', me: s, code: R.code, phase: R.phase, turn: R.turn, n: R.n, first: R.first, mull: R.mullSeat, winner: R.winner,
    acts: actsFor(R, s), fl: R.fl, log: R.log.slice(-60), eff: effView(R, s), peek: R.peek && R.peek[s], both: R.ws.every(Boolean),
    sub: R.sub && { type: R.sub.type, who: R.sub.who, atk: R.sub.atk, def: R.sub.def, tk: R.sub.tk, tid: R.sub.tid, ms: R.sub.ms }, P: [] };
  for (const i of [0, 1]) { const P = R.P[i], o = i === s, show = o || R.phase === 'play' || R.phase === 'over';
    V.P.push({ ready: P.ready, deck: P.deck.length, hand: o ? P.hand.map(x => co(R, x)) : P.hand.length, file: P.file.length, evid: P.evid.length,
      rem: P.rem.map(x => co(R, x)), field: P.field.map(x => withSets(R, x, i, s)), pa: P.pa.map(x => co(R, x)), tr: P.tr ? 1 : 0, evUp: P.evid.filter(x => R.cards[x].up).map(x => co(R, x)), fileUp: P.file.filter(x => R.cards[x].up).map(x => co(R, x)),
      partner: P.partner ? (show ? { ...co(R, P.partner), inFile: P.pIn } : { hidden: 1 }) : null,
      kase: P.kase ? (show ? { ...co(R, P.kase), solved: !!R.cards[P.kase].solved } : { hidden: 1 }) : null }); }
  return V; }
const bc = R => R.ws.forEach((w, i) => send(w, view(R, i)));

// ── 카드 DB: 프로젝트 안의 data/cards.json (상대경로) 이 유일한 원본. 접속한 모든 브라우저에 /api/cards 로 제공한다.
const zlib = require('zlib');
const CARDS_PATH = process.env.CARDS_JSON ? path.resolve(process.env.CARDS_JSON) : path.join(__dirname, 'data', 'cards.json');
let _cards = { key: null, body: null, gz: null, etag: null, count: 0 };
function validateCards(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('최상위가 객체가 아닙니다');
  const c = j.cards; if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error("'cards' 객체가 없습니다");
  const ids = Object.keys(c); if (!ids.length) throw new Error('카드가 0장입니다');
  for (const id of ids) { const d = c[id]; if (!d || typeof d !== 'object' || typeof d.n !== 'string' || !d.type) throw new Error('카드 형식 오류: ' + id); }
  return ids.length;
}
// 파일이 바뀌면(add_new_cards.py 실행 후) 서버 재시작 없이 다음 요청에서 다시 읽는다. 실패하면 예외 → 호출한 쪽이 오류 응답.
function loadCards() {
  const st = fs.statSync(CARDS_PATH), key = st.mtimeMs + ':' + st.size;
  if (_cards.key === key && _cards.body) return _cards;
  const raw = fs.readFileSync(CARDS_PATH, 'utf8'), j = JSON.parse(raw), n = validateCards(j);
  const body = Buffer.from(JSON.stringify({ cards: j.cards }), 'utf8');
  _cards = { key, body, gz: zlib.gzipSync(body), etag: '"' + require('crypto').createHash('md5').update(body).digest('hex') + '"', count: n };
  return _cards;
}
function serveCards(q, r) {
  let c; try { c = loadCards(); } catch (e) {
    const why = e.code === 'ENOENT' ? 'data/cards.json 파일이 없습니다' : e.message;
    console.error('카드 DB 오류:', why); _cards = { key: null, body: null };
    r.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return r.end(JSON.stringify({ error: '카드 DB를 불러올 수 없습니다.', detail: why }));
  }
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': c.etag, 'Vary': 'Accept-Encoding', 'X-Card-Count': String(c.count) };
  if (q.headers['if-none-match'] === c.etag) { r.writeHead(304, h); return r.end(); }
  const gz = /\bgzip\b/.test(q.headers['accept-encoding'] || ''); if (gz) h['Content-Encoding'] = 'gzip';
  r.writeHead(200, h); r.end(q.method === 'HEAD' ? undefined : gz ? c.gz : c.body);
}

function main() {
  const { WebSocketServer } = require('ws');
  // UI 정적 자산(카드 뒷면 등): /assets/<파일명> 만 제공 (게임 로직과 무관)
  const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  const server = http.createServer((q, r) => {
    // Render 등 호스팅의 health check: 게임 상태와 무관, 항상 OK
    if ((q.url || '').split('?')[0] === '/health') { r.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end(q.method === 'HEAD' ? undefined : 'OK'); }
    if ((q.url || '').split('?')[0] === '/api/cards') return serveCards(q, r);
    const m = /^\/assets\/([\w.-]+)$/.exec((q.url || '').split('?')[0]);
    if (m && MIME[path.extname(m[1]).toLowerCase()]) return fs.readFile(path.join(__dirname, 'assets', m[1]), (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(m[1]).toLowerCase()], 'Cache-Control': 'public, max-age=86400' }); r.end(d); });
    fs.readFile(path.join(__dirname, 'index.html'), (e, d) => { if (e) { r.writeHead(500); return r.end('index.html 을 읽을 수 없습니다'); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); r.end(d); }); });
  const wss = new WebSocketServer({ server, maxPayload: 30e6 });
  wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); ws.on('error', () => {}); }); // 유휴 연결 유지용 ping (프록시가 조용한 WebSocket 을 끊는 것을 방지)
  wss.on('connection', ws => ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create') { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[c]);
      const R = rooms[c] = mkR(c); R.ws[0] = ws; ws.R = R; ws.seat = 0; return bc(R); }
    if (m.t === 'join') { const R = rooms[cl(m.code, 8).toUpperCase().trim()];
      if (!R) return send(ws, { t: 'err', msg: '없는 방 코드입니다.' }); if (R.ws[1]) return send(ws, { t: 'err', msg: '방이 가득 찼습니다.' });
      R.ws[1] = ws; ws.R = R; ws.seat = 1; say(R, '게스트가 입장했습니다.'); send(ws, { t: 'defs', defs: R.defs }); return bc(R); }
    const R = ws.R; if (!R) return; let e;
    if (m.t === 'ready') { e = ready(R, ws.seat, m); if (!e) R.ws.forEach(w => send(w, { t: 'defs', defs: R.defs })); }
    else if (m.t === 'act') e = act(R, ws.seat, m);
    if (e) send(ws, { t: 'err', msg: e }); bc(R); }).on('close', () => { const R = ws.R; if (!R) return; R.ws[ws.seat] = null;
      if (R.phase === 'play' || R.phase === 'mull') { R.phase = 'over'; R.winner = 1 - ws.seat; say(R, '상대가 나가서 게임이 종료되었습니다.'); }
      bc(R); if (!R.ws[0] && !R.ws[1]) delete rooms[R.code]; }));
  const hb = setInterval(() => { wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; try { w.ping(); } catch (e) {} }); }, +process.env.WS_PING_MS || 25000); hb.unref();
  process.on('uncaughtException', e => console.error('uncaught:', e && e.stack || e));
  const stop = () => { clearInterval(hb); wss.clients.forEach(w => w.close()); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  // Render 가 주는 PORT 를 사용, 없으면 3000. 주소를 지정하지 않으므로 모든 네트워크 인터페이스(외부 접속 포함)에서 받는다.
  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => console.log(`listening on port ${PORT}`));
}
if (require.main === module) main(); else module.exports = { actsFor, mkR, ready, act, view, FX, ap, lpOf, tk, loadCards, validateCards };
