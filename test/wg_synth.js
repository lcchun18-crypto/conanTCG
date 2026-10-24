// 플래너 테스트용 합성 상황 빌더: 실제 경기 상태(R0)의 카드 풀을 써서 손패·현장·상대 현장·파트너 에리어·FILE·증거를 지정한 상태를 만든다 (좌석 1 기준)
const SIM = require('../bot/simulate.js'), PL = require('../bot/whitegreen/planner.js');
function mk(spec, R0) { const R = SIM.clone(R0), seat = 1, P = R.P[seat], O = R.P[0];
    const DEF = id => PL.DEF(R, id), reset = c => { c.st = 'a'; c.sum = 0; c.apm = c.cm = c.lpm = c.lvm = 0; c.tkw = ''; c.tab = []; c.fd = []; c.sets = []; c.up = false; };
    for (const Pz of [P, O]) { const all = [...Pz.hand, ...Pz.field, ...Pz.deck, ...Pz.rem, ...Pz.file, ...(Pz.pa || []), ...Pz.evid]; Pz.hand = []; Pz.field = []; Pz.rem = []; Pz.file = []; Pz.pa = []; Pz.deck = all; all.forEach(id => reset(R.cards[id])); Pz.pIn = false; R.cards[Pz.partner].st = 'a'; }
    const take = (Pz, def, st) => { const i = Pz.deck.findIndex(x => DEF(x) === def); if (i < 0) throw new Error('no ' + def); const id = Pz.deck.splice(i, 1)[0]; R.cards[id].st = st || 'a'; return id; };
    P.hand = spec.hand.map(d => take(P, d)); P.field = spec.field.map(([d, st]) => take(P, d, st)); O.field = spec.opp.map(([d, st]) => take(O, d, st));
    if (spec.pa) P.pa = spec.pa.map(d => take(P, d)); if (spec.rem) P.rem = spec.rem.map(d => take(P, d));
    if (Array.isArray(spec.file)) { for (const d of spec.file) P.file.push(take(P, d)); } else for (let i = 0; i < (spec.file || 8); i++) P.file.push(P.deck.pop());   // file 배열이면 아래→위 순서로 그 카드들을 FILE 에
    if (spec.oppPa) O.pa = spec.oppPa.map(d => take(O, d)); for (let i = 0; i < 6; i++) O.file.push(O.deck.pop()); for (let i = 0; i < 5; i++) O.hand.push(O.deck.pop());
    P.evid = []; O.evid = []; for (let i = 0; i < (spec.evid != null ? spec.evid : 2); i++) P.evid.push(P.deck.pop()); for (let i = 0; i < (spec.oevid != null ? spec.oevid : 2); i++) O.evid.push(O.deck.pop()); R.cards[P.kase].solved = spec.solved !== false; R.cards[O.kase].solved = true;
    if (spec.pIn) { P.pIn = true; R.cards[P.partner].st = 's'; }   // 이미 어시스트한 상태(파트너가 FILE 에)
    R.fl = {}; R.sub = null; R.eff = null; R.q = []; return { R, seat }; }

module.exports = { mk };
