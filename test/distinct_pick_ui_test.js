// v1.17.24 클라이언트: 이름이 서로 달라야 하는 선택(distinct)에서 같은 이름 카드를 고르면 바로 안내하고 선택하지 않는다 (확정 후 서버 오류로 전부 풀리던 문제)
const fs = require('fs'); const src = fs.readFileSync(__dirname + '/../index.html', 'utf8'); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const m = src.match(/function effPick\(id\)\{[\s\S]*?\n(?=function effUI)/); ok(!!m, 'effPick 소스 추출');
const mk = E => { const err = { textContent: '' }; const env = { V: { eff: E }, esel: [], $: () => err, A() {}, render() {}, DEFS: { a: { n: '吉田歩美' }, b: { n: '吉田歩美' }, c: { n: '円谷光彦' }, d: { n: '小嶋元太' } } };
  const f = new Function('env', `with(env){${m[0]}; return {pick:effPick, get sel(){return esel}}}`); return { ...f(env), err, env }; };
const E = { kind: 'pick', max: 5, min: 0, distinct: true, cards: [{ id: 1, d: 'a' }, { id: 2, d: 'b' }, { id: 3, d: 'c' }, { id: 4, d: 'd' }] };
{ const t = mk(E); t.pick(1); t.pick(3); t.pick(2); ok(JSON.stringify(t.env.esel) === '[1,3]' && /吉田歩美/.test(t.err.textContent), '같은 이름(吉田歩美) 두 번째는 선택되지 않고 안내: ' + t.err.textContent); t.pick(4); ok(t.env.esel.length === 3 && t.err.textContent === '', '다른 이름은 정상 선택(안내 문구 지움)'); t.pick(1); ok(t.env.esel.length === 2, '선택 해제 가능'); t.pick(2); ok(t.env.esel.includes(2), '해제 후 같은 이름의 다른 카드로 바꿔 선택 가능'); }
{ const t = mk({ ...E, distinct: false }); t.pick(1); t.pick(2); ok(t.env.esel.length === 2, 'distinct 가 아니면 같은 이름도 선택 가능'); }
console.log(`\ndistinct_pick_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
