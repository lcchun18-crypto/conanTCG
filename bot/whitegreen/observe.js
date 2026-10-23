// WhiteGreenStrategy 의 "관측 상태" — AI 본인이 실제로 알 수 있는 정보만 남긴 복사본을 만든다 (룰 엔진 우회/치팅 금지).
//   · 내 덱의 "순서": 모른다 (구성은 안다) → 내 덱 카드들의 정의를 서로 섞는다
//   · 상대의 비공개 구역(손패·덱·FILE·뒷면 증거·뒷면 세트): 내용을 모른다 → 실제 정의 대신, 상대가 이미 공개한 카드(필드·리무브·앞면 증거 등)에서 "그럴듯한 대역"을 뽑아 채운다
//     (상대 덱 리스트/손패를 AI 가 알 수 없으므로 실제 구성을 그대로 섞어 쓰는 것도 하지 않는다. 장수는 공개 정보라 그대로)
//   · 공개 구역(필드·리무브·앞면 증거·사건·파트너)과 내 손패/FILE/증거는 그대로
//   · 엔진 난수 상태(R.rng)도 새로 뽑아, 시뮬레이션이 실제 미래의 셔플을 재현하지 못하게 한다
// 복사본은 R.cards 만 새로 만들고 나머지는 live 와 같은 객체를 공유한다(읽기 전용으로만 사용; 시뮬레이션은 SIM.clone 이 다시 깊은 복제를 한다).
// 전략은 이 관측 상태에서만 판단하고, 실제 행동은 id 만 같으면 되므로 live 상태에 그대로 적용된다.
const SIM = require('../simulate.js');
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 상대 쪽에서 AI 가 정의를 "모르는" 카드 id 들
function hiddenOppIds(R, seat) {
  const P = R.P[1 - seat], ids = [...P.hand, ...P.deck, ...P.file, ...P.evid.filter(x => !R.cards[x].up)];
  for (const f of P.field) for (const x of (R.cards[f].fd || [])) ids.push(x);   // 뒷면으로 세트된 카드
  return [...new Set(ids)].filter(x => R.cards[x]);
}
// 상대가 이미 공개한 카드의 정의들 (필드·리무브·앞면 증거·세트 공개·사건/파트너) — 숨은 카드의 대역 후보
function publicOppDefs(R, seat) {
  const P = R.P[1 - seat], ids = [...P.field, ...P.rem, ...P.evid.filter(x => R.cards[x].up), ...(P.sets || [])].filter(x => R.cards[x]);
  const ds = ids.map(x => R.cards[x].d).filter(k => { const d = R.defs[k]; return d && (d.type === 'char' || d.type === 'event'); });
  return ds;
}
function observe(R, seat, seed) {
  const rnd = SIM.mulberry32((seed >>> 0) || 1), cards = {};
  for (const k of Object.keys(R.cards)) cards[k] = { ...R.cards[k] };
  const mine = R.P[seat].deck.filter(x => cards[x]), md = shuffle(mine.map(x => cards[x].d), rnd); mine.forEach((x, i) => { cards[x].d = md[i]; });   // 내 덱 순서 지움
  const hid = hiddenOppIds(R, seat); let pool = publicOppDefs(R, seat); if (!pool.length) pool = mine.map(x => R.cards[x].d).filter(k => R.defs[k] && R.defs[k].type === 'char');   // 공개된 게 없으면 내 덱의 캐릭터를 일반적인 대역으로
  if (pool.length) hid.forEach(x => { cards[x].d = pool[Math.floor(rnd() * pool.length)]; });
  const O = Object.assign(Object.create(Object.getPrototypeOf(R)), R, { cards, rng: (rnd() * 4294967296) >>> 0 }); O.__observed = seat; return O;
}
// 감사용(테스트): AI 가 관측 상태에서 "상대 숨은 칸의 실제 정의" 나 "내 덱 순서" 를 볼 수 있는지 — live 와 비교
const hiddenOf = (R, seat) => ({ oppHidden: hiddenOppIds(R, seat).map(x => [x, R.cards[x].d]), myDeckOrder: R.P[seat].deck.map(x => R.cards[x].d) });
module.exports = { observe, hiddenOppIds, publicOppDefs, hiddenOf, shuffle };
