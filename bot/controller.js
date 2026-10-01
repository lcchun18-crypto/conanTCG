// 봇 컨트롤러: 방(room)에 붙어 봇 좌석의 "결정할 차례"마다 행동을 고르고, 사람과 똑같은 dispatch(→ act) 경로로 실행한다.
// 봇은 게임 상태를 직접 바꾸지 않는다. 엔진이 허용한 행동(genMoves → 엔진 검증)만 실행한다.
const path = require('path');
const SIM = require('./simulate.js');
const { Tracker } = require('./track.js');
const { runJob, dropSearcher } = require('./job.js');
const { describe, DEFAULTS } = require('./decide.js');
const { S, who, cloneable, clone, genMoves, stateKey } = SIM;
const { D } = S;

const num = (v, d) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
const VERSION = (() => { try { return require('../package.json').version; } catch (e) { return null; } })();
const cfgFromEnv = () => { const think = num(process.env.BOT_THINK_MS, DEFAULTS.timeMs); return { timeMs: think, microMs: Math.min(num(process.env.BOT_MICRO_MS, 1500), think), maxNodes: DEFAULTS.maxNodes, delayMs: num(process.env.BOT_DELAY_MS, 650) }; };

// ── worker 풀 (1개). 만들 수 없으면(예: 제한된 환경) 메인 스레드에서 같은 함수를 실행한다.
let W = null, wSeq = 1; const waiting = new Map(); let workerOff = process.env.BOT_NO_WORKER === '1';
function getWorker() {
  if (workerOff) return null; if (W) return W;
  try { const { Worker } = require('worker_threads'); W = new Worker(path.join(__dirname, 'worker.js'));
    W.on('message', m => { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); m.error ? w.rej(new Error(m.error)) : w.res(m.res); });
    W.on('error', e => { console.error('bot worker error:', e && e.message); for (const w of waiting.values()) w.rej(e); waiting.clear(); W = null; });
    W.on('exit', () => { W = null; }); W.unref(); return W; } catch (e) { workerOff = true; console.error('bot worker 사용 불가 → 메인 스레드 실행:', e.message); return null; }
}
function runAsync(job) {
  const w = getWorker();
  if (!w) return new Promise(res => setImmediate(() => res(runJob({ ...job, cfg: { ...job.cfg, timeMs: Math.min(job.cfg.timeMs, 1500) } }))));
  return new Promise((res, rej) => { const id = wSeq++; waiting.set(id, { res, rej }); w.postMessage({ id, job }); });
}
const slim = defs => { const o = {}; for (const [k, d] of Object.entries(defs)) { const { img, fx, extra, ...rest } = d; o[k] = rest; } return o; };

function summary(R) {
  const n = id => { const d = D(R, id); return d.n; };
  return { turn: R.n, turnSeat: R.turn, phase: R.phase, first: R.first, P: [0, 1].map(s => { const P = R.P[s]; return { hand: P.hand.map(n), field: P.field.map(id => `${n(id)}(${R.cards[id].st || 'a'}, AP${S.ap(R, id)}, LP${S.lpOf(R, id)})`), evid: P.evid.length, file: P.file.length, fileCount: S.fcount(R, s), deck: P.deck.length, rem: P.rem.length, partner: `${n(P.partner)}(${R.cards[P.partner].st}${P.pIn ? ', FILE' : ''})`, kase: n(P.kase) + (R.cards[P.kase].solved ? ' [해결편]' : '') }; }) };
}

class BotCtl {
  constructor(R, seat, deps) {
    this.R = R; this.seat = seat; this.deps = deps; this.tr = new Tracker(); this.cfg = cfgFromEnv(); this.log = []; this.busy = false; this.stopped = false; this.illegal = 0; this.plan = null; this.decisions = 0; this.startedAt = Date.now();
    this.slimDefs = null; this.slimN = -1;
  }
  apply(seat, m, actFn) { return this.tr.apply(this.R, seat, m, actFn); }
  drop() { dropSearcher(this.R.code); if (W) { try { W.postMessage({ type: 'drop', code: this.R.code }); } catch (e) {} } } // 탐색 캐시(메모리) 반환
  stop() { this.stopped = true; this.drop(); }
  tick() {
    if (this.stopped || this.busy) return; const R = this.R; if (R.phase === 'over') { if (!this.dropped) { this.dropped = true; this.drop(); } return; } if (R.phase === 'setup') return;
    const d = who(R); if (!d || d.seat !== this.seat) return;
    this.busy = true; const t0 = Date.now(); const go = () => this.run(t0).catch(e => { console.error('bot error:', e && e.stack || e); this.fallback('error: ' + (e && e.message)); }).finally(() => { this.busy = false; if (!this.stopped) setImmediate(() => this.tick()); });
    setTimeout(go, 30);
  }
  // 계획 재사용: 지난번 탐색이 고른 "턴 전체 행동열"의 다음 행동 — 현재 상태가 탐색이 예측한 상태와 같을 때만
  planned(R, d) {
    if (!this.plan || d.kind !== 'main') return null;
    // v1.6.0: 리살이 가능해 보이는 상태(해결편 + 액티브 파트너 + 증거 상한 ≥ 필요)면 지난 계획을 재사용하지 말고 매번 리살 solver 부터 다시 돌린다 (탐색 계획은 리살 기회를 놓칠 수 있다)
    if (this.cfg.specialist && process.env.BOT_TACTICS !== '0') { try { const LT = require('./tactics/lethal.js'), rep = LT.report(R, this.seat); if (rep.state === 'ok' && LT.potential(R, this.seat) >= rep.need) { this.plan = null; return null; } } catch (e) {} }
    const p = this.plan; const key = stateKey(R);
    const i = p.steps.findIndex((s, k) => k >= p.next - 1 && s.key === key); if (i < 0) { this.plan = null; return null; }
    const nx = p.steps[i + 1]; if (!nx) { this.plan = null; return null; } p.next = i + 2;
    const legal = genMoves(R, () => 0).find(m => JSON.stringify(m.m) === JSON.stringify(nx.mv.m)); return legal ? { mv: legal, info: { planned: true, ms: 0, kind: d.kind } } : null;
  }
  snapshotIfNeeded() { if (!this.tr.base && cloneable(this.R)) { this.tr.base = clone(this.R); this.tr.acts = []; } }
  async run(t0) {
    const R = this.R; if (this.stopped || R.phase === 'over') return; const d = who(R); if (!d || d.seat !== this.seat) return;
    const ver = this.tr.ver, sum = summary(R), snap = d.kind === 'main' ? require('./snapshot.js').snapshot(R) : undefined;; /* snap: 실전 피드백 → 회귀 테스트 재현용(게임 종료 후 로그로만 공개) */  let res = this.planned(R, d);
    if (!res) {
      this.snapshotIfNeeded(); if (!this.tr.base) throw new Error('no base snapshot');
      if (this.slimN !== Object.keys(R.defs).length) { this.slimDefs = slim(R.defs); this.slimN = Object.keys(R.defs).length; }
      const job = { base: { ...this.tr.base, defs: this.slimDefs }, acts: this.tr.acts, seat: this.seat, code: R.code, liveKey: stateKey(R), cfg: { ...this.cfg, seed: (Date.now() & 0xffff) + this.decisions } };
      res = await runAsync(job);
      if (res.err) { // 재구성 불일치 등: 메인 스레드에서 "현재 live 상태" 기준 즉시 결정(짧은 예산)
        const { decide } = require('./decide.js'); res = decide({ R, seat: this.seat, base: this.tr.base, acts: this.tr.acts, cfg: { ...this.cfg, timeMs: 500, microMs: 500 } }); if (res.err) { this.fallback(res.err); return; } res.info.note = 'replay-fallback'; }
      if (res.info && res.info.plan && d.kind === 'main') this.plan = { steps: [{ key: stateKey(R) }, ...res.info.plan], next: 1 };
    }
    if (this.stopped || ver !== this.tr.ver || R.phase === 'over') return; // 생각하는 동안 상태가 바뀌었으면(사람의 수동 효과 도구 등) 결과를 버리고 다시 결정
    const wait = this.cfg.delayMs - (Date.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (this.stopped || ver !== this.tr.ver || R.phase === 'over') return;
    const mv = res.mv, e = this.deps.dispatch(R, mv.seat, mv.m);
    this.decisions++;
    this.log.push({ n: this.decisions, at: new Date().toISOString(), state: sum, snap, kind: d.kind, chosen: { desc: describe(R, mv), move: mv.m }, top: (res.info.top || []), search: { ms: res.info.ms, nodes: res.info.nodes, iterations: res.info.iters, value: res.info.value, win: res.info.win, forced: res.info.forced, planned: res.info.planned, fallback: res.info.fallback, exact: res.info.exact, reply: res.info.reply, line: res.info.lineDesc, overrides: res.info.overrides },
      explain: res.info.explain || undefined, tactics: res.info.tactics || undefined, mulligan: res.info.mulligan || undefined, error: e || undefined });   // v1.5.0: explain = 후보별 판단 요소 분해(증거 템포·보드·FILE·리살 거리·상대 위협·Action Economy·포메이션·손패) + 시퀀스
    if (e) { this.illegal++; this.fallback('illegal: ' + e); }
    this.deps.bc(R);
  }
  fallback(why) { // 엔진이 거부한 경우(이론상 없음): 합법 후보를 차례로 시도. 집계/기록에 남긴다.
    const R = this.R; this.plan = null; if (R.phase === 'over') return; const d = who(R); if (!d || d.seat !== this.seat) return;
    for (const mv of genMoves(R, () => 0)) { if (!this.deps.dispatch(R, mv.seat, mv.m)) { this.log.push({ n: ++this.decisions, at: new Date().toISOString(), kind: d.kind, fallback: why, chosen: { desc: describe(R, mv), move: mv.m } }); this.deps.bc(R); return; } }
    this.log.push({ n: ++this.decisions, kind: d.kind, fallback: why, stuck: true });
  }
  logMsg() {
    const R = this.R; if (R.phase !== 'over') return { t: 'botlog', err: '게임이 끝난 뒤에만 AI 기록을 내려받을 수 있습니다 (진행 중 숨겨진 정보 보호)' };
    let knowledge = null; try { const id = this.cfg.specialist; if (id) { const k = require('./specialists/registry.js').policyFor(id, this.seat, R).knowledge; if (k) knowledge = { side: k.side, archetype: k.archetype, env: k.env, applied: k.applied, skipped: k.skipped, features: k.features, priors: k.priors, prunes: k.prunes, fileFloor: k.fileFloor, preserveDeduction: k.preserveDeduction }; } } catch (e) { knowledge = { error: String(e && e.message || e) }; }
    return { t: 'botlog', log: { bot: 'EXPERT', version: VERSION, botName: this.name || 'BOT / EXPERT', specialist: this.specialist || null, room: R.code, winner: R.winner, botSeat: this.seat, turns: R.n, thinkMs: this.cfg.timeMs, illegalAttempts: this.illegal, knowledge, decisions: this.log } };
  }
}

function createRoom({ rooms, mkR, ready, dispatch, loadCards, say, cl, ws, m, send, bc }) {
  const DB = loadCards().cards, legacy = m.bot === 'classic', specId = m.bot && m.bot !== 'expert' && !legacy ? String(m.bot) : null; let bd = m.botDeck || {}, botName = 'BOT / EXPERT';
  if (specId) { const r = require('./specialists/registry.js').botDeck(specId, DB); bd = r.deck; botName = r.spec.name; } // 전문 봇: 등록된 고정 덱 (클라이언트가 보낸 덱은 무시), 검증 실패 시 이유를 담은 오류
  const cards = bd.cards || {}, list = [];
  for (const [id, n] of Object.entries(cards)) { if (!DB[id]) throw new Error('카드 DB에 없는 카드: ' + id); for (let i = 0; i < Math.max(0, Math.min(+n || 0, 40)); i++) list.push(id); }
  if (!DB[bd.partner] || !DB[bd.kase]) throw new Error('봇 덱의 파트너/사건 카드가 올바르지 않습니다');
  let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[c]);
  const R = rooms[c] = mkR(c); R.ws[0] = ws; R.firstPref = m.first === 'first' ? 0 : m.first === 'second' ? 1 : undefined;
  const fake = { readyState: 1, bot: true, send() {}, close() {} }; R.ws[1] = fake;
  const defs = {}; for (const id of [...new Set(list), bd.partner, bd.kase]) defs[id] = DB[id];
  const ctl = new BotCtl(R, 1, { dispatch, bc }); R.bot = ctl; ctl.name = botName; ctl.specialist = specId; if (specId) ctl.cfg.specialist = specId; else if (!legacy) ctl.cfg.specialist = 'pro';   // v1.2.0: 범용 Expert 는 PRO 전략 정책(bot/pro.js)을 쓴다. 'classic' 은 이전 방식
  const e = dispatch(R, 1, { t: 'ready', defs, list, partner: bd.partner, kase: bd.kase }); if (e) { delete rooms[c]; throw new Error('봇 덱이 규칙에 맞지 않습니다: ' + e); }
  say(R, '🤖 ' + botName + ' 와의 대전입니다. 내 덱을 등록하면 시작합니다.'); return R;
}
module.exports = { createRoom, BotCtl, summary, cfgFromEnv };
