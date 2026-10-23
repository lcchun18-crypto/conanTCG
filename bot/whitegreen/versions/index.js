// 전략 버전 레지스트리. 새 버전: versions/v0_2.js 를 만들고 아래에 등록. 기본 버전은 LATEST (환경변수 WG_VERSION 으로 덮어쓰기 가능).
const V = {};
for (const m of [require('./v0_1.js'), require('./v0_2.js'), require('./v0_3.js'), require('./v0_4.js'), require('./v0_5.js'), require('./v0_6.js'), require('./v0_7.js'), require('./v0_8.js'), require('./v0_9.js'), require('./v0_10.js'), require('./v0_11.js'), require('./v0_12.js'), require('./v0_13.js'), require('./v0_14.js'), require('./v0_15.js')]) V[m.id] = m;
const LATEST = '0.15';
const get = id => V[id || process.env.WG_VERSION || LATEST] || null;
const list = () => Object.values(V).map(v => ({ id: v.id, label: v.label, notes: v.notes }));
module.exports = { get, list, LATEST, V };
