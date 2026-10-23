// v1.28.0: 채팅은 게임 상태와 독립 — 이번 턴 다시시작/게임 다시하기/게임 종료 후에도 유지되고 번호(id)도 이어진다
const U = require('./mz_util'); const { G, dummy, fillFile, S } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const R = G({ a: dummy('A', { color: 'yellow' }) }, ['a'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); R.rng = 12345;
R.chat = [{ id: 1, w: 0, n: '플레이어 1', nk: 0, t: '턴 시작 전' }]; R.chatSeq = 1; R.specSeq = 2; S.snapTake(R);
ok(R.snap && R.snap.data && !('chat' in R.snap.data) && !('chatSeq' in R.snap.data), '1 턴 시작 스냅샷에 채팅이 들어 있지 않음');
R.chat.push({ id: 2, w: 1, n: '플레이어 2', nk: 0, t: '턴 진행 중' }); R.chatSeq = 2;
const e = S.turnRestart(R, R.turn); ok(!e, '2 이번 턴 다시시작 성공 (' + (e || 'ok') + ')');
ok(R.chat.length === 2 && R.chat[1].t === '턴 진행 중' && R.chatSeq === 2, '3 다시시작 뒤에도 채팅 2건이 그대로 (턴 도중에 쓴 메시지 포함)');
R.phase = 'over'; R.winner = 0; const code = R.code; S.resetRoom(R, 0);
ok(R.chat && R.chat.length === 2 && R.chat[0].t === '턴 시작 전' && R.chatSeq === 2 && R.specSeq === 2, '4 게임 종료 후 다시하기(방 초기화)에도 채팅·번호 유지 (' + (R.chat || []).length + '건)');
ok(S.view(R, 0).chat.length === 2, '5 화면(view)에도 그대로 전달됨');
console.log(`\nchat_persist_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
