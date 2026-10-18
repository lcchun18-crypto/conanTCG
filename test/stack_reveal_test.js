// v1.17.29 id_0264 結成 少年探偵団 등 "겹치기": 겹친 카드를 양쪽이 볼 수 있다 — 효과 처리 중 공개 확인창(ack reveal), 로그에 카드명, 뷰의 ud(겹친 카드 목록), 카드 위 배지 + 상세창 목록
const path = require('path'), fs = require('fs'); const U = require('./mz_util'); const { G, real, dummy, field, give, req, ans, pump, FX } = U; const S = require('../server.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const ids0 = ['id_1176', 'id_1177', 'id_0491']; const defs = { on: real('id_0264', { color: 'blue' }) }; ids0.forEach(i => defs[i] = real(i, { color: 'blue' }));
const R = G(defs, [...ids0, 'on'], ['on']); const s = R.turn, P = R.P[s], o = 1 - s; const x = field(R, s, 'on'); const picks = ids0.map(k => give(R, s, k, 'rem'));
FX.fire(R, 'onplay', x, { by: 'hand' }); pump(R); let q = req(R); ok(q && q.kind === 'pick', '1 겹칠 카드 선택 요청'); ans(R, picks); pump(R); q = req(R);
ok(q && q.kind === 'ack' && q.reveal === 1 && q.by === s && q.ids.length === 3 && /겹친 카드 3장/.test(q.msg), '1 선택 후 공개 확인창(reveal) — 상대에게도 앞면 공개: ' + (q && q.msg)); ans(R, undefined); pump(R);
ok(R.log.some(l => /아래에 3장을 겹침: /.test(l) && /小嶋元太/.test(l)), '2 로그에 겹친 카드 이름: ' + R.log.filter(l => /겹침/.test(l)).join('|').slice(0, 120));
const vS = JSON.parse(JSON.stringify(S.view(R, s))), vO = JSON.parse(JSON.stringify(S.view(R, o))); const find = v => [...v.P[s].field, ...v.P[o].field].find(c => c.id === x);
ok(find(vS).under === 3 && find(vS).ud.length === 3, '3 내 뷰: 겹친 카드 목록(ud) 3장'); ok(find(vO).under === 3 && find(vO).ud.length === 3 && find(vO).ud.every(d => R.defs[d]), '3 상대 뷰에도 같은 목록 (공개 정보)');
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
(async () => { if (chromium) { const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)); const br = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [name, v] of [['내 화면', vS], ['상대 화면', vO]]) { const pg = await br.newPage({ viewport: { width: 1366, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(dd => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: dd }) }), R.defs); await pg.evaluate(vv => window.__ws.onmessage({ data: JSON.stringify(vv) }), v);
    const badge = await pg.locator('.udb').first().innerText().catch(() => ''); ok(/겹침 3/.test(badge), `4 ${name}: 카드 위 "겹침 3" 배지 (${badge})`);
    await pg.locator('.card:has(.udb)').first().hover(); await pg.waitForTimeout(150); const list = await pg.evaluate(() => [...document.querySelectorAll('#pv .udw .udc small')].map(e => e.textContent)); ok(list.length === 3 && list.some(t => /小嶋元太/.test(t)), `4 ${name}: 카드에 올리면 상세창에 겹쳐진 카드 3장 이름 (${list.join(', ')})`); ok(!errs.length, `4 ${name}: 페이지 오류 없음 ${errs.join('|')}`); await pg.close(); }
  await br.close(); } else console.log('SKIP: playwright 없음 (UI 검사 생략)');
  console.log(`\nstack_reveal_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
