// V.acts(행동 버튼의 근거)가 실제 규칙과 일치하는지: 나온 행동은 서버가 받아들이고, 안 나온 행동은 서버가 거부한다.
const { S, game, give, act, ok, eq } = require('./helpers');
const { actsFor } = require('../server.js');
const d = (n, e = {}) => ({ n, type: 'char', color: 'red', lv: '0', ap: '1000', lp: '3', ...e });
const clone = R => JSON.parse(JSON.stringify(R)); let n = 0, bad = 0; const chk = (c, m) => { n++; if (!c) { bad++; console.log('✗', m); } };
for (let seed = 0; seed < 60; seed++) {
  const rnd = (() => { let x = seed * 7919 + 13; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const R = game({ a: d('A', { ab: [{ ic: 'declare', lab: 'X', lim: 1, ops: [{ op: 'draw', n: 1 }] }] }), b: d('B', { ap: '2000' }), r: d('R', { kw: 'rapid' }) }, ['a', 'b', 'r', 'a'], ['a', 'b', 'r']);
  const s = R.turn, o = 1 - s; const mk = (who, k) => { const id = give(R, who, k, 'field'); R.cards[id].st = rnd() < .6 ? 'a' : rnd() < .5 ? 's' : 'x'; R.cards[id].sum = rnd() < .4 ? 1 : 0; return id; };
  const mine = ['a', 'b', 'r'].filter(() => rnd() < .8).map(k => mk(s, k)); const opp = ['a', 'b'].filter(() => rnd() < .8).map(k => mk(o, k));
  if (rnd() < .5) R.P[o].evid.push(...R.P[o].deck.splice(0, 1)); if (rnd() < .3) R.P[s].pIn = true; if (rnd() < .3) R.cards[R.P[s].partner].st = 's';
  const acts = actsFor(R, s);
  for (const id of [...mine, R.P[s].partner]) { const list = acts[id] || []; const has = k => list.some(x => x.k === k), isP = id === R.P[s].partner;
    chk(!act(clone(R), s, { a: 'reason', who: isP ? 'p' : id }) === has('reason'), `seed ${seed} 추리 표시=${has('reason')} 서버=${act(clone(R), s, { a: 'reason', who: isP ? 'p' : id })}`);
    if (!isP) { { const e = act(clone(R), s, { a: "action", id, k: "case" }); chk(!e === has("actk"), `seed ${seed} 사건 액션 ${e} ${JSON.stringify(list)} st=${R.cards[id].st} sum=${R.cards[id].sum} oe=${R.P[o].evid.length}`); }; const tg = (list.find(x => x.k === 'actc') || { tg: [] }).tg;
      for (const t of R.P[o].field) chk(!act(clone(R), s, { a: 'action', id, k: 'char', tid: t }) === tg.includes(t), `seed ${seed} 캐릭터 액션 대상 ${t}`);
      chk(!act(clone(R), s, { a: 'ability', id, i: 0 }) === has('ab'), `seed ${seed} 능력`); }
    else chk(!act(clone(R), s, { a: 'assist' }) === has('assist'), `seed ${seed} 어시스트`); }
}
console.log(bad ? `${bad}건 실패` : `acts 일치 검사 ${n}건 통과`); process.exit(bad ? 1 : 0);
