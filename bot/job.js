// 결정 작업: (스냅샷 + 행동 기록) → live 상태를 리플레이로 재구성 → decide().  worker 스레드 / 메인 스레드 / 테스트가 같은 함수를 쓴다.
const SIM = require('./simulate.js');
const { decide } = require('./decide.js');
const { Searcher } = require('./search.js');
const { clone, applyMove, stateKey } = SIM;
const searchers = new Map(); // 방별 탐색기(전치표/평가 캐시 재사용)
function getSearcher(code, seed, specialist, seat, R) { let s = searchers.get(code); if (!s) { const policy = specialist ? require('./specialists/registry.js').policyFor(specialist, seat, R) : null; s = new Searcher({ seed, policy }); searchers.set(code, s); if (searchers.size > 6) searchers.delete(searchers.keys().next().value); } return s; }
function dropSearcher(code) { searchers.delete(code); }
function replay(base, acts) { const R = clone(base); for (const a of acts) { const e = applyMove(R, { seat: a.seat, m: a.m }, a.seed); if (e) throw new Error('replay: ' + e); } return R; }
function runJob(job) {
  const R = replay(job.base, job.acts || []);
  if (job.liveKey && stateKey(R) !== job.liveKey) return { err: 'replay mismatch' };
  const r = decide({ R, seat: job.seat, base: job.base, acts: job.acts || [], cfg: job.cfg }, getSearcher(job.code, job.cfg && job.cfg.seed, job.cfg && job.cfg.specialist, job.seat, R));
  return r;
}
module.exports = { runJob, replay, dropSearcher, getSearcher };
