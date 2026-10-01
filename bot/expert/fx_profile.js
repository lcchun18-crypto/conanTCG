// 카드 효과 JSON(ab) → "어느 영역에 영향을 주는가" 프로필 (Expert Knowledge Layer 용, 카드 이름/ID 를 모른다).
// 엔진이 정리한(cleanAb) 효과 구조만 본다: select(do: remove/sleep/…), rmAll, gain, draw, play … 를 영역(zone)으로 분류한다.
//   zone: board(내 캐릭터 전개) removal(상대 캐릭터 제거) disable(상대 캐릭터 슬립/스턴) evid(내 증거) oppEvid(상대 증거 감소)
//         hand(내 손패 획득) oppHand(상대 손패 감소) fileUp(내 FILE 증가) fileDown(내 FILE 사용) oppFile(상대 FILE 감소)
'use strict';
const REM_DO = new Set(['remove', 'deckBottom', 'deckTop', 'deckTopOrBottom', 'hand']);
const DIS_DO = new Set(['sleep', 'stun']);
const BOARD_OPS = new Set(['play', 'playSelf', 'playSplit', 'playSeen']);
const EVID_OPS = new Set(['gain', 'selfEvid', 'charToEvid', 'setToEvid', 'deckToEvid']);
const HAND_OPS = new Set(['draw', 'fetch', 'pick', 'handTo', 'investigate', 'invest2', 'dig', 'reasonDraw']);
const ZONES = ['board', 'removal', 'disable', 'evid', 'oppEvid', 'hand', 'oppHand', 'fileUp', 'fileDown', 'oppFile'];
const cache = new WeakMap();

function walk(o, f) {
  if (Array.isArray(o)) { for (const x of o) walk(x, f); return; }
  if (!o || typeof o !== 'object') return;
  if (typeof o.op === 'string') f(o);
  for (const k in o) if (k !== 'filter' && k !== 'cond') walk(o[k], f);
}
const zero = () => ({ board: 0, removal: 0, disable: 0, evid: 0, oppEvid: 0, hand: 0, oppHand: 0, fileUp: 0, fileDown: 0, oppFile: 0, mass: 0 });

// 효과 하나(ability)의 영역 프로필
function abZones(a) {
  const z = zero();
  walk(a && a.ops, o => {
    const op = o.op, who = o.who || 'self', n = +o.n || 1;
    if (op === 'select') {
      const own = (o.filter && o.filter.own) || 'any';
      if (own === 'self') return;
      const k = o.all ? 5 : n;
      if (REM_DO.has(o.do)) { z.removal += k; if (k >= 2) z.mass = Math.max(z.mass, k); }
      else if (DIS_DO.has(o.do)) z.disable += k;
    } else if (op === 'rmAll') { if (o.scope === 'contact') z.removal += 1; else { z.removal += 5; z.mass = 5; } }
    else if (op === 'rhand' || op === 'contact') z.removal += 1;
    else if (BOARD_OPS.has(op)) z.board += n;
    else if (op === 'mv' && o.to === 'field') z.board += 1;
    else if (EVID_OPS.has(op)) { if (who !== 'opp') z.evid += n; }
    else if (op === 'loseEvid' || op === 'evidToDeck') { if (who === 'opp') z.oppEvid += n; }
    else if (HAND_OPS.has(op)) { if (who !== 'opp') z.hand += n; }
    else if (op === 'fileToHand') { z.hand += n; z.fileDown += n; }
    else if (op === 'discard') { if (who === 'opp') z.oppHand += n; }
    else if (op === 'fileRemTop') { if (who === 'opp') z.oppFile += n; else z.fileDown += n; }
    else if (op === 'deckToFile') { if (who !== 'opp') z.fileUp += n; }
  });
  return z;
}
const countZones = (z, withBoard) => (withBoard || z.board > 0 ? 1 : 0) + (z.removal > 0 ? 1 : 0) + (z.disable > 0 && !z.removal ? 0.5 : 0) + (z.evid > 0 ? 1 : 0) + (z.oppEvid > 0 ? 1 : 0) + (z.hand > 0 ? 1 : 0) + (z.oppHand > 0 ? 1 : 0) + (z.oppFile > 0 ? 1 : 0);
function merge(a, b) { const o = { ...a }; for (const k of ZONES) o[k] += b[k]; o.mass = Math.max(a.mass, b.mass); return o; }

// 카드 정의 하나의 프로필 (캐시)
function card(d) {
  let p = cache.get(d); if (p) return p;
  const abs = Array.isArray(d.ab) ? d.ab : [];
  let onplay = zero(), event = zero(), any = zero(); const declare = {}; let fileMin = 0, disguiseFileMin = 0, oppFieldMin = 0, cutV = 0, mass = 0;
  abs.forEach((a, i) => {
    const z = abZones(a); any = merge(any, z); mass = Math.max(mass, z.mass);
    if (a.ic === 'onplay' || a.ic === 'enter') onplay = merge(onplay, z);
    else if (a.ic === 'event') event = merge(event, z);
    else if (a.ic === 'declare') declare[i] = z;
    const c = a.cond || {};
    if (+c.fileMin > 0) { if (a.ic === 'disguise') disguiseFileMin = Math.max(disguiseFileMin, +c.fileMin); else fileMin = Math.max(fileMin, +c.fileMin); }
    for (const x of Array.isArray(c.cnt) ? c.cnt : []) if (x && (x.src === 'oppField') && (x.op === 'ge' || x.op === 'gt')) oppFieldMin = Math.max(oppFieldMin, (+x.n || 0) + (x.op === 'gt' ? 1 : 0));
    if (a.ic === 'cutin') cutV = Math.max(cutV, +a.v || 0);
  });
  p = { onplay, event, declare, any, mass, fileMin, disguiseFileMin, oppFieldMin, cutV };
  cache.set(d, p); return p;
}
// 손패에서 "사용"했을 때 예상 영역 (캐릭터는 등장 자체가 board)
function playZones(d) { const p = card(d); return d.type === 'char' ? { z: p.onplay, zones: countZones(p.onplay, true) } : { z: p.event, zones: countZones(p.event, false) }; }
function abilityZones(d, i) { const p = card(d), z = p.declare[i] || zero(); return { z, zones: countZones(z, false) }; }
module.exports = { card, abZones, playZones, abilityZones, countZones, ZONES };
