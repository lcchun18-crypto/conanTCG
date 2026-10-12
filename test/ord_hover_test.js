// v1.17.12 발동 순서 선택창: 효과 버튼은 한글, 마우스 오버 시 오른쪽 상세에 해당 카드 + 해당 효과 줄 하이라이트
process.chdir(__dirname + '/..');
const U = require('./mz_util'); const { G, field, hand, S, req } = U; const H = require('./helpers'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break } catch (e) { } }
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const trig = (name, extra, txt) => ({ n: name, type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1', extra, ab: [{ ic: 'ontrig', evs: ['enter'], ops: [{ op: 'draw', n: 1 }], txt }] });
const defs = { k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' }, h: { n: '등장', type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1' }, X: trig('가나', '【자신 턴 중】【턴①】캐릭터가 등장했을 때, 카드를 1장 뽑는다.', '【自分ターン中】キャラが登場したとき、カードを1枚引く。'), Y: trig('다라', '【자신 턴 중】등장 시 카드를 1장 뽑는다.', '【自分ターン中】登場時カードを1枚引く。') };
const R = G(defs, [], [], { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: defs.k }); const s = R.turn; field(R, s, 'X'); field(R, s, 'Y'); const hh = hand(R, s, 'h'); R.P[s].file.push(...U.filler(R, s, 2));
const e = U.act(R, s, { a: 'play', id: hh }); const q = req(R);
ok(q && q.kind === 'opt' && q.ord && q.ord.length === 2, '서버: 발동 순서 질의에 ord(카드/효과 위치) 포함: ' + JSON.stringify(q && q.ord) + ' ' + (e || ''));
const v = JSON.parse(JSON.stringify(S.view(R, s))); ok(v.eff && v.eff.ord && v.eff.ord.length === 2 && v.eff.ord.every(o => o.d && o.c && o.c.id != null), 'view: eff.ord 직렬화');
(async () => { const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await br.newPage({ viewport: { width: 1400, height: 800 } });
  await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this } send() { } close() { } } });
  await pg.goto('file://' + process.cwd() + '/index.html'); await pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify(x) }), { t: 'defs', defs: R.defs }); await pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify(x) }), v); await pg.waitForTimeout(400);
  const btn = await pg.evaluate(() => [...document.querySelectorAll('#btns button.ordb')].map(b => b.textContent)); ok(btn.length === 2 && btn.every(t => !/[぀-ヿ]/.test(t)), '효과 버튼이 한글: ' + JSON.stringify(btn));
  const hi = await pg.evaluate(() => document.querySelector('#pv .fx mark.hl') && document.querySelector('#pv .fx mark.hl').textContent); ok(!!hi, '첫 효과 기본 하이라이트: ' + hi);
  const names = []; for (let i = 0; i < 2; i++) { await pg.locator('#btns button.ordb').nth(i).hover(); await pg.waitForTimeout(100); names.push(await pg.evaluate(() => ({ n: document.querySelector('#pv .nm b').textContent, hl: (document.querySelector('#pv .fx mark.hl') || {}).textContent }))); }
  ok(names.some(o => o.n === '가나' && /캐릭터가 등장했을 때/.test(o.hl)) && names.some(o => o.n === '다라' && /등장 시 카드/.test(o.hl) && !/캐릭터가 등장했을 때/.test(o.hl)), '오버 시 해당 카드 + 해당 효과 줄만 하이라이트: ' + JSON.stringify(names));
  await pg.screenshot({ path: '/tmp/ord.png' }); await br.close(); console.log(`\nord_hover_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0) })();
