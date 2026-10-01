const { S, game, key, find, give, ok, eq, act, fill } = require('./helpers');
const T = []; const t = (n, f) => T.push([n, f]);
const ch = (n, extra = {}) => ({ n, type: 'char', color: 'red', lv: '0', ap: '3000', lp: '1', ...extra });
const cur = R => R.turn, opp = R => 1 - R.turn;

t('登場時: 카드 2장 드로우', () => { const R = game({ a: ch('A', { ab: [{ ic: 'onplay', ops: [{ op: 'draw', n: 2 }] }] }) }, ['a', 'a', 'a']); const s = cur(R);
  const id = give(R, s, 'a'); const h = R.P[s].hand.length; eq(act(R, s, { a: 'play', id }), undefined, 'play'); eq(R.P[s].hand.length, h - 1 + 2, 'hand'); eq(R.q.length, 0, 'queue'); });

t('덱 확인→선택→손패, 나머지 아래(순서 지정)', () => { const R = game({ a: ch('A', { ab: [{ ic: 'onplay', ops: [{ op: 'look', n: 3, max: 1, then: 'hand', rest: 'bottom' }] }] }), x: ch('X'), y: ch('Y'), z: ch('Z') }, ['a']); const s = cur(R);
  const id = give(R, s, 'a'); const x = give(R, s, 'x', 'deck'), y = give(R, s, 'y', 'deck'), z = give(R, s, 'z', 'deck'); R.P[s].deck.push(x, y, z); // 위: z,y,x
  act(R, s, { a: 'play', id }); ok(R.eff && R.eff.req.kind === 'pick', 'pick prompt'); eq(R.eff.req.ids.join(), [z, y, x].join(), 'top order');
  eq(act(R, s, { a: 'ans', v: [y] }), undefined, 'ans1'); ok(R.eff && R.eff.req.ordered, 'order prompt'); eq(act(R, s, { a: 'ans', v: [x, z] }), undefined, 'ans2');
  ok(R.P[s].hand.includes(y), 'y in hand'); eq(R.eff, null, 'done'); eq(R.P[s].deck[1], x, 'x lower'); eq(R.P[s].deck[0], z, 'z bottom'); });

t('질의 검증: 잘못된 선택 거부, 상대는 응답 불가', () => { const R = game({ a: ch('A', { ab: [{ ic: 'onplay', ops: [{ op: 'discard', n: 1 }] }] }) }, ['a']); const s = cur(R);
  const id = give(R, s, 'a'); act(R, s, { a: 'play', id }); ok(R.eff, 'prompt'); ok(act(R, 1 - s, { a: 'ans', v: [] }), 'opp blocked');
  ok(act(R, s, { a: 'ans', v: [] }), 'too few'); ok(act(R, s, { a: 'ans', v: [999999] }), 'bad id'); ok(act(R, s, { a: 'end' }), 'others blocked'); const h = R.P[s].hand[0];
  eq(act(R, s, { a: 'ans', v: [h] }), undefined, 'ok'); ok(R.P[s].rem.includes(h), 'removed'); });

t('그렇게 한 경우(if done): 손패 리무브 후 드로우, 거부하면 안 함', () => { const R = game({ a: ch('A', { ab: [{ ic: 'onplay', ops: [{ op: 'discard', n: 1, opt: true }, { op: 'if', c: 'done', ops: [{ op: 'draw', n: 2 }] }] }] }) }, ['a', 'a']); const s = cur(R);
  let id = give(R, s, 'a'); let h = R.P[s].hand.length; act(R, s, { a: 'play', id }); act(R, s, { a: 'ans', v: [] }); eq(R.P[s].hand.length, h - 1, 'declined -> no draw');
  R.fl = {}; id = give(R, s, 'a'); h = R.P[s].hand.length; act(R, s, { a: 'play', id }); act(R, s, { a: 'ans', v: [R.P[s].hand[0]] }); eq(R.P[s].hand.length, h - 1 - 1 + 2, 'accepted -> draw 2'); });

t('상시 AP+1000: 내 턴에만 아군에게 적용', () => { const R = game({ a: ch('A', { ab: [{ ic: 'static', cond: { turn: 'self' }, tgt: { sel: 'allies', notSelf: true }, ap: 1000 }] }), b: ch('B') }, ['a', 'b']); const s = cur(R);
  const a = give(R, s, 'a', 'field'), b = give(R, s, 'b', 'field'); eq(S.ap(R, b), 4000, 'b boosted'); eq(S.ap(R, a), 3000, 'a not boosted');
  R.turn = 1 - s; eq(S.ap(R, b), 3000, 'not my turn'); });

t('히라메키: 사건 액션이 통과하면 상대가 발동 여부를 선택', () => { const R = game({ f: ch('F2', { ab: [{ ic: 'flash', ops: [{ op: 'draw', n: 1 }] }] }), atk: ch('Atk', { lp: '1' }) }, ['atk'], ['f']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'atk', 'field'); R.cards[a].sum = 0; const f = give(R, o, 'f', 'evid'); const h = R.P[o].hand.length;
  eq(act(R, s, { a: 'action', id: a, k: 'case' }), undefined, 'action'); eq(act(R, o, { a: 'guard', id: null }), undefined, 'no guard');
  ok(R.eff && R.eff.req.who === o && R.eff.req.kind === 'yn', 'flash prompt to defender'); ok(R.P[o].rem.includes(f) === false, 'card not yet in rem');
  eq(act(R, o, { a: 'ans', v: true }), undefined, 'yes'); eq(R.P[o].hand.length, h + 1, 'drew'); ok(R.P[o].rem.includes(f), 'now in rem'); });

t('히라메키 거부', () => { const R = game({ f: ch('F2', { ab: [{ ic: 'flash', ops: [{ op: 'draw', n: 1 }] }] }), atk: ch('Atk') }, ['atk'], ['f']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'atk', 'field'); R.cards[a].sum = 0; give(R, o, 'f', 'evid'); const h = R.P[o].hand.length; act(R, s, { a: 'action', id: a, k: 'case' }); act(R, o, { a: 'guard', id: null }); act(R, o, { a: 'ans', v: false }); eq(R.P[o].hand.length, h, 'no draw'); });

t('現場リムーブ時: 컨택트로 리무브되면 발동, 조건(상대 턴) 확인', () => { const R = game({ v: ch('V', { ap: '1000', ab: [{ ic: 'onremoved', cond: { turn: 'opp' }, ops: [{ op: 'draw', n: 1 }] }] }), atk: ch('Atk', { ap: '5000' }) }, ['atk'], ['v']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'atk', 'field'); R.cards[a].sum = 0; const v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; const h = R.P[o].hand.length;
  act(R, s, { a: 'action', id: a, k: 'char', tid: v }); act(R, o, { a: 'guard', id: null }); let g = 0; while (R.sub && g++ < 6) act(R, R.sub.who, { a: 'pass' });
  ok(R.P[o].rem.includes(v), 'removed'); eq(R.P[o].hand.length, h + 1, 'triggered'); });

t('宣言 능력: 코스트(슬립+손패) 지불, 대상 선택, 턴 1회 제한', () => { const R = game({ d: ch('D', { ab: [{ ic: 'declare', lim: 1, cost: [{ c: 'sleepSelf' }, { c: 'discard', n: 1 }], ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'sleep' }] }] }), e: ch('E') }, ['d'], ['e']); const s = cur(R), o = 1 - s;
  const d = give(R, s, 'd', 'field'); R.cards[d].sum = 0; const e = give(R, o, 'e', 'field'); ok(act(R, s, { a: 'ability', id: d, i: 0 }) === undefined, 'declare');
  ok(R.eff && R.eff.req.kind === 'pick', 'cost pick'); act(R, s, { a: 'ans', v: [R.P[s].hand[0]] }); ok(R.eff && R.eff.req.ids.includes(e), 'target pick'); act(R, s, { a: 'ans', v: [e] });
  eq(R.cards[e].st, 's', 'target slept'); eq(R.cards[d].st, 's', 'self slept'); R.cards[d].st = 'a'; ok(act(R, s, { a: 'ability', id: d, i: 0 }), 'second use blocked'); });

t('宣言: 코스트 지불 불가면 거부(상태 변화 없음)', () => { const R = game({ d: ch('D', { ab: [{ ic: 'declare', cost: [{ c: 'deckrem', n: 3 }], ops: [{ op: 'draw', n: 1 }] }] }) }, ['d']); const s = cur(R);
  const d = give(R, s, 'd', 'field'); R.P[s].deck.length = 2; ok(act(R, s, { a: 'ability', id: d, i: 0 }), 'blocked'); eq(R.q.length, 0, 'no queue'); });

t('컷인: 자기 턴 AP+3000 / 상대 턴 AP+1000 조건 분기', () => { const R = game({ c: ch('C', { type: 'event', ab: [{ ic: 'cutin', cond: { turn: 'self' }, v: 3000 }, { ic: 'cutin', cond: { turn: 'opp' }, v: 1000 }] }), atk: ch('Atk', { ap: '2000' }), df: ch('Df', { ap: '4000' }) }, ['atk', 'c'], ['df']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'atk', 'field'); R.cards[a].sum = 0; const d = give(R, o, 'df', 'field'); R.cards[d].st = 's'; const c = give(R, s, 'c');
  act(R, s, { a: 'action', id: a, k: 'char', tid: d }); act(R, o, { a: 'guard', id: null }); ok(R.sub && R.sub.type === 'contact', 'contact'); if (R.sub.who !== s) act(R, R.sub.who, { a: 'pass' });
  eq(act(R, s, { a: 'cin', id: c }), undefined, 'cutin'); eq(S.ap(R, a), 5000, 'AP+3000 (my turn)'); });

t('미지원 op: 사용자에게 수동 처리를 요구하지 않고 건너뛰며 나머지 효과는 진행', () => { const R = game({ m: ch('M', { ab: [{ ic: 'onplay', ops: [{ op: 'manual', txt: '複雑な効果' }, { op: 'draw', n: 1 }] }] }) }, ['m']); const s = cur(R);
  const id = give(R, s, 'm'); const h = R.P[s].hand.length; act(R, s, { a: 'play', id }); ok(!R.log.some(l => /수동/.test(l)), '수동 문구 없음'); eq(R.P[s].hand.length, h, 'drew after skip'); });

t('이벤트: 효과 해결 동안 리무브 에리어에 없고, 해결 후 이동', () => { const R = game({ ev: { n: 'Ev', type: 'event', color: 'red', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'discard', n: 1 }] }] } }, ['ev']); const s = cur(R);
  const id = give(R, s, 'ev'); act(R, s, { a: 'play', id }); ok(R.eff, 'prompt'); ok(!R.P[s].rem.includes(id), 'not in rem yet'); act(R, s, { a: 'ans', v: [R.P[s].hand[0]] }); ok(R.P[s].rem.includes(id), 'in rem after'); });

t('효과로 등장: 현장이 가득 차면 스위치 선택, 색 제한 없음', () => { const R = game({ pl: ch('Pl', { ab: [{ ic: 'onplay', ops: [{ op: 'play', from: 'hand', n: 1, filter: { lvMax: 'file' } }] }] }), blue: ch('Bl', { color: 'blue', lv: '0' }) }, ['pl', 'blue']); const s = cur(R);
  for (let i = 0; i < 4; i++) give(R, s, 'f' + i, 'field'); const id = give(R, s, 'pl'); const b = give(R, s, 'blue'); act(R, s, { a: 'play', id }); // field now 5 (4+pl)
  ok(R.eff && R.eff.req.kind === 'pick', 'choose char'); act(R, s, { a: 'ans', v: [b] }); ok(R.eff && /스위치/.test(R.eff.req.msg), 'switch prompt'); const rep = R.eff.req.ids[0]; act(R, s, { a: 'ans', v: [rep] });
  ok(R.P[s].field.includes(b), 'blue played (no color limit)'); eq(R.P[s].field.length, 5, 'still 5'); ok(R.P[s].rem.includes(rep), 'switched out'); });

t('입력 정화: 악성/이상 ab 데이터로 크래시하지 않음', () => { const bad = [null, 5, { ic: 'x', ops: 'zz' }, { ic: 'onplay', ops: [{ op: 'drop table' }, { op: 'draw', n: 1e9 }, null, { op: 'select', filter: { lvMax: {} } }] }, { ic: 'static', tgt: 5, ap: 'a' }];
  const R = game({ a: ch('A', { ab: bad }) }, ['a']); const s = cur(R); const id = give(R, s, 'a'); act(R, s, { a: 'play', id }); let g = 0; while (R.eff && g++ < 5) act(R, s, { a: 'ans', v: [] }); ok(true, ''); });

t('키워드/변장/미스리드 회귀', () => { const R = game({ m: ch('M', { kw: 'misread2' }), a: ch('A', { lp: '3' }) }, ['a'], ['m']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'a', 'field'); R.cards[a].sum = 0; give(R, o, 'm', 'field'); act(R, s, { a: 'reason', who: a }); ok(R.sub && R.sub.type === 'mis', 'misread prompt'); const m = find(R, o, 'm', 'field');
  const e0 = R.P[s].evid.length; act(R, o, { a: 'mis', ids: [m] }); eq(R.P[s].evid.length, e0 + 1, 'LP3-2=1'); });

t('회귀: 컨택트 중 캐릭터가 현장을 떠나면 변장 불가(카드 중복 방지)', () => { const R = game({ atk: ch('Atk', { ap: '5000' }), df: ch('Df', { ap: '1000' }), dg: ch('Dg', { kw: 'disguise', ap: '1000' }) }); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'atk', 'field'); R.cards[a].sum = 0; const d = give(R, o, 'df', 'field'); R.cards[d].st = 's'; const dg = give(R, o, 'dg');
  act(R, s, { a: 'action', id: a, k: 'char', tid: d }); act(R, o, { a: 'guard', id: null }); ok(R.sub && R.sub.type === 'contact', 'contact');
  R.P[o].field = R.P[o].field.filter(x => x !== d); R.P[o].deck.unshift(d); // 효과로 덱 아래로 이동한 상황
  const who = R.sub.who === o ? o : (act(R, R.sub.who, { a: 'pass' }), R.sub.who); const before = R.P[o].deck.filter(x => x === d).length;
  const e = act(R, R.sub.who === o ? o : R.sub.who, { a: 'dis', id: dg }); if (R.sub && R.sub.who === o) ok(e, 'disguise blocked'); eq(R.P[o].deck.filter(x => x === d).length, before, 'no duplicate in deck'); });

let bad = 0; for (const [n, f] of T) { try { f(); console.log('✓', n); } catch (e) { bad++; console.log('✗', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } }
console.log(bad ? `\n${bad}개 실패` : `\n전체 ${T.length}개 통과`); process.exit(bad ? 1 : 0);
