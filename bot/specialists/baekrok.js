// 백녹이기기 — 백/녹 전용 AI (사용자 확정 덱 고정). 전략: bot/whitegreen (WhiteGreenStrategy).
// 덱은 사용자가 확정한 목록 그대로이며 자동 보정하지 않습니다 (메인 40장: id_0214×3 id_0876×3 id_0308×3 id_0123×3 id_1096×3 id_0205×2 id_1097×3 id_0188×2 id_0688×3 id_0873×3 id_1098×3 id_1153×3 id_0130×3 id_0564×3 / 사건 id_1156 / 파트너 id_P085).
module.exports = {
  id: 'baekrok',
  name: '백녹이기기',
  desc: '백/녹 전용 AI (WG-AI v0.15) — 확정 덱 고정, 전용 전략 WhiteGreenStrategy',
  deckFile: 'decks/baekrok.json',
  strategy: 'whitegreen',
  profile: {},
};
