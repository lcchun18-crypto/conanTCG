// 탐색 전용 worker 스레드: 메인 이벤트 루프(다른 방, WebSocket ping, health check)를 막지 않고 길게 생각한다.
const { parentPort } = require('worker_threads');
const { runJob, dropSearcher } = require('./job.js');
parentPort.on('message', msg => {
  if (msg.type === 'drop') return dropSearcher(msg.code);
  try { parentPort.postMessage({ id: msg.id, res: runJob(msg.job) }); } catch (e) { parentPort.postMessage({ id: msg.id, error: String(e && e.stack || e) }); }
});
