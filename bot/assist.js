'use strict';
// v1.17.20: 범용 Expert 는 매 턴 무조건 어시스트 후 가장 높은 코스트를 낸다(next). 아래는 v1.17.19 설명.
// v1.17.19 — Expert 전개 보조(연습용): 이번 턴 "낼 수 있는 최고 코스트 캐릭터"가 손패에 없어도, AI 소유 카드가 다른 구역(덱/리무브/증거/파트너 에리어/FILE/상대 구역)에 있으면 손패로 가져와 항상 베스트 전개를 보여 준다.
//  · 평소 Expert(규칙 봇) 방에서만 켜진다(연습 스크립트·전문 봇 제외). 끄기: 방 생성 옵션 assist:false / 환경변수 BOT_ASSIST=0
//  · 카드를 만들거나 복제하지 않는다 — 한 카드는 항상 한 구역에만 있다. 가져온 뒤의 행동(어떤 카드를 낼지)은 평소 Expert 가 정한다.
//  · 손패 사용 기회가 남아 있는 메인 결정(아직 카드 사용/넥스트 힌트 전)에서만, 엔진이 허용하는 카드(색·FILE·사용 제한)만 가져온다.
const TAG = '[ASSIST] ';
const lib = () => require('../server.js');
const ZN = { hand: '손패', deck: '덱', rem: '리무브', evid: '증거', file: 'FILE', pa: '파트너 에리어' };
const ORDER = ['deck', 'rem', 'evid', 'pa', 'file'];   // 같은 코스트면 FILE 에 영향이 적은 구역부터

// 낼 수 있는 캐릭터: 사건 색·레벨(FILE)·엔진 사용 조건. extra = 지금 어시스트하면 늘어나는 FILE 장수
function scan(ctl, extra) {
  const R = ctl.R, seat = ctl.seat, L = lib(), P = R.P[seat], T = require('./training.js');
  const lvOf = id => L.FX.lvOf(R, id), isChar = id => L.D(R, id).type === 'char', fc = L.fcount(R, seat) + extra;
  const playable = (id, afterFileLoss) => isChar(id) && L.okc(R, seat, L.D(R, id), id) && lvOf(id) <= fc - (afterFileLoss ? 1 : 0) && !L.playCheck(R, seat, id);
  let handBest = -1; for (const id of P.hand) if (playable(id, false)) handBest = Math.max(handBest, lvOf(id));
  const cands = T.ownedCards(R, seat).filter(c => !(c.seat === seat && c.zone === 'hand') && playable(c.id, c.seat === seat && c.zone === 'file') && lvOf(c.id) > handBest);
  return { R, seat, L, P, T, lvOf, fc, handBest, cands };
}
// 손패에 최고 코스트가 없으면 다른 구역에서 손패로 가져온다. 가져왔으면 true
function fetch(ctl, d) {
  const R = ctl.R, seat = ctl.seat;
  if (R.turn !== seat || R.phase !== 'play' || !d || d.kind !== 'main' || R.fl.played || R.fl.hint || R.eff || R.sub) return null;
  const { L, P, T, lvOf, fc, handBest, cands } = scan(ctl, 0);
  if (!cands.length) return null;
  const best = Math.max(...cands.map(c => lvOf(c.id))), top = cands.filter(c => lvOf(c.id) === best);
  const rank = c => (c.seat === seat ? ORDER.indexOf(c.zone) : 9);
  top.sort((a, b) => rank(a) - rank(b) || (+L.D(R, b.id).ap || 0) - (+L.D(R, a.id).ap || 0) || a.id - b.id);
  const c = top[0], name = L.D(R, c.id).n;
  T.detach(R, c.id); R.cards[c.id].up = false; P.hand.push(c.id); ctl.sysDirty();
  R.log.push(TAG + `최고 코스트 ${best} 전개를 위해 ${name} 을(를) ${ZN[c.zone]}${c.seat === seat ? '' : '(상대 구역)'}에서 손패로 가져왔습니다 (FILE ${fc}장, 손패 최고 ${handBest < 0 ? '없음' : handBest + '코스트'})`);
  (ctl.assistEvents = ctl.assistEvents || []).push({ n: R.n, id: c.id, from: c.zone, lv: best });
  return true;
}
// v1.17.20: 항상 "어시스트 → 최고 코스트 카드 사용". 반환: { mv:{seat,m}, desc } (컨트롤러가 그대로 실행) 또는 null(평소 Expert)
function next(ctl, d) {
  const R = ctl.R, seat = ctl.seat;
  if (R.turn !== seat || R.phase !== 'play' || !d || d.kind !== 'main' || R.fl.played || R.fl.hint || R.eff || R.sub) return null;
  const P = R.P[seat], pc = R.cards[P.partner];
  if (!P.pIn && pc && pc.st === 'a') {   // 1) 무조건 어시스트 (어시스트 후에 낼 수 있는 캐릭터가 하나라도 있을 때)
    const s = scan(ctl, 1); if (s.handBest < 0 && !s.cands.length) return null;
    R.log.push(TAG + `어시스트 후 최고 코스트 전개: FILE ${s.fc - 1}장 → ${s.fc}장`);
    return { mv: { seat, m: { t: 'act', a: 'assist' } }, desc: '어시스트(항상 어시스트 후 최고 코스트 전개)' };
  }
  fetch(ctl, d);   // 2) 손패에 없으면 다른 구역에서 가져오기
  // 3) 낼 수 있는 가장 높은 코스트를 항상 낸다 (같은 코스트면 평소 Expert 규칙의 우선순위)
  const RB = require('./rulebot.js'), moves = require('./simulate.js').genMoves(R, () => 0);
  const bp = RB.bestPlay(R, seat, moves); if (!bp || !bp.direct) return null;
  R.log.push(TAG + `낼 수 있는 최고 코스트 ${lib().FX.lvOf(R, bp.id)} 카드를 사용합니다`);
  return { mv: bp.mv, desc: `최고 코스트 ${lib().FX.lvOf(R, bp.id)} 사용(항상 최고 코스트)` };
}
module.exports = { next, fetch };
