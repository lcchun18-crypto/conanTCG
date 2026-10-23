// 전문 봇 전략 레지스트리: 전문 봇 파일의 `strategy: '<id>'` → 이 모듈. 같은 코드를 실제 게임(decide.js)과 self-play 가 함께 쓴다.
const T = { whitegreen: () => require('./whitegreen/index.js') };
const get = id => (T[id] ? T[id]() : null);
module.exports = { get, ids: () => Object.keys(T) };
