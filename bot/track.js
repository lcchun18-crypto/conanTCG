// 라이브 게임에서 "마지막 복제 가능 시점의 스냅샷 + 그 뒤의 행동(시드 포함)"을 기록한다.
// 효과 처리 중(제너레이터가 살아 있어 복제 불가)에도 이 기록을 리플레이해서 탐색용 상태를 안전하게 재구성하기 위함.
const { clone, cloneable, withRng } = require('./simulate.js');
class Tracker {
  constructor() { this.base = null; this.acts = []; this.ver = 0; }
  // actFn(R, seat, m) → 엔진의 act (사람/봇 공통). 시드를 기록해 리플레이가 같은 결과(셔플 포함)를 내도록 한다.
  apply(R, seat, m, actFn) {
    if (cloneable(R)) { this.base = clone(R); this.acts = []; }
    const seed = (Math.random() * 4294967296) >>> 0; const e = withRng(seed, () => actFn(R, seat, m));
    if (!e) this.acts.push({ seat, m, seed }); this.ver++; return e;
  }
}
module.exports = { Tracker };
