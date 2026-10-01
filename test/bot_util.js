// 봇 테스트 공통: 카드 DB 에서 합법 덱 만들기 / 게임 시작 / 시드 고정
const fs = require('fs'), path = require('path');
const S = require('../server.js');
const { mulberry32, withRng } = require('../bot/simulate.js');
const DBP = process.env.BOT_TEST_DB || path.join(__dirname, '../data/cards.json');
let _db = null; const db = () => _db || (_db = JSON.parse(fs.readFileSync(DBP, 'utf8')).cards);
const setDb = o => { _db = o; };
const cols = c => String(c.color || '').toLowerCase().split(/[\/,&\s]+/).filter(Boolean);
// 사건 색에 맞는 40장 덱을 시드로 만든다 (같은 카드 최대 3장, deckfree 는 제한 없음). 카드 DB 가 작아도 합법 덱이 나오도록 색이 맞는 카드로 채운다.
function makeDeck(seed, opt = {}) {
  const C = db(), rnd = mulberry32(seed * 2654435761 >>> 0), all = Object.values(C), cases = all.filter(c => c.type === 'case'), parts = all.filter(c => c.type === 'partner');
  const pick = a => a[rnd() * a.length | 0];
  for (let tries = 0; tries < 50; tries++) {
    const k = opt.kase ? C[opt.kase] : pick(cases), kc = cols(k), pool = all.filter(c => ['char', 'event'].includes(c.type) && cols(c).every(x => kc.includes(x)));
    if (pool.length < 14) continue; const ch = pool.filter(c => c.type === 'char'), ev = pool.filter(c => c.type === 'event'), cnt = {}, list = [];
    const add = c => { const free = Array.isArray(c.ab) && c.ab.some(a => a.ic === 'deckfree'); if ((cnt[c.id] || 0) >= 3 && !free) return false; cnt[c.id] = (cnt[c.id] || 0) + 1; list.push(c.id); return true; };
    let guard = 0; const evN = Math.min(ev.length ? 6 + (rnd() * 4 | 0) : 0, 12);
    while (list.length < evN && ev.length && guard++ < 400) add(pick(ev));
    while (list.length < 40 && guard++ < 4000) add(pick(ch.length ? ch : pool));
    if (list.length !== 40) continue;
    const mp = parts.filter(p => cols(p).every(x => kc.includes(x))), pp = opt.partner ? C[opt.partner] : pick(mp.length ? mp : parts);
    return { list, partner: pp.id, kase: k.id };
  }
  throw new Error('덱을 만들 수 없습니다(카드 DB 가 너무 작음)');
}
// R 생성 + 두 덱 등록 (+ 선공 지정). 멀리건은 호출자가 처리.
function newGame(seed, deckA, deckB, o = {}) {
  const C = db(), R = S.mkR('T' + seed); if (o.first != null) R.firstPref = o.first;
  withRng(seed, () => { [deckA, deckB].forEach((d, s) => { const defs = {}; for (const id of [...new Set(d.list), d.partner, d.kase]) defs[id] = C[id];
    const e = S.ready(R, s, { defs, list: d.list, partner: d.partner, kase: d.kase }); if (e) throw new Error('ready: ' + e); }); });
  return R;
}
module.exports = { S, db, setDb, makeDeck, newGame, withRng, mulberry32, cols };
