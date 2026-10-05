// v1.12.7: 카드 상세(게임 우측 패널 #pv, 덱 빌더 #dbCardName)에 카드명 텍스트 — 실제 cards.json 의 n 값, 이미지 바로 아래·칩 위, 긴 이름 줄바꿈
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
const longest = Object.values(DB).filter(c => c.n).sort((a, b) => b.n.length - a.n.length)[0];
const cases = [['毛利蘭(id_1068)', DB.id_1068], ['가장 긴 이름', longest], ['사건 카드', Object.values(DB).find(c => c.type === 'case')]];
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  ok(cases.every(x => x[1]), 'fixture: ' + cases.map(x => x[0] + '=' + x[1].id + '(' + x[1].n.length + '자)').join(', '));
  const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
  const R = G({ a: dummy('A', { color: 'yellow' }) }, ['a'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); S.snapTake(R);
  const img = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="#357"/></svg>');
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC';
    const pg = await (await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } })).newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
    await pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: m }) }), R.defs); await pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), JSON.parse(JSON.stringify(S.view(R, R.turn))));
    for (const [label, c] of cases) { const f = { n: c.n, type: c.type, color: c.color || 'blue', lv: c.lv || '', lv2: c.lv2 || '', ap: c.ap || '', lp: c.lp || '', trait: c.trait || '', fx: c.fx || '', extra: c.extra || '', img, id: c.id };
      const g = await pg.evaluate(f => { pv(f, null); const p = document.getElementById('pv'), nm = p.querySelector('.nm'), im = p.querySelector('img'), mt = p.querySelector('.meta'); const kids = [...p.children]; return { txt: nm && nm.textContent, order: kids.indexOf(im) < kids.indexOf(nm) && kids.indexOf(nm) < kids.indexOf(mt), over: nm ? nm.scrollWidth > nm.clientWidth + 1 : true, pOver: p.scrollWidth > p.clientWidth + 1 }; }, f);
      ok(g.txt === '카드명: ' + c.n, `${T} 게임 패널 [${label}] "${g.txt}"`); ok(g.order, `  이미지 → 카드명 → 칩 순서`); ok(!g.over && !g.pOver, `  가로로 넘치지 않고 줄바꿈 (이름 ${c.n.length}자)`);
      const b = await pg.evaluate(([id, card]) => { DB.cards = { [id]: card }; bPv(id); const nm = document.getElementById('dbCardName'), ch = document.getElementById('dbChips'); return { txt: nm.textContent, order: !!(nm.compareDocumentPosition(ch) & Node.DOCUMENT_POSITION_FOLLOWING), over: nm.scrollWidth > nm.clientWidth + 1 }; }, [c.id, { id: c.id, n: c.n, type: c.type, color: c.color, lv: c.lv, ap: c.ap, lp: c.lp, trait: c.trait, fx: c.fx, extra: c.extra }]);
      ok(b.txt === '카드명: ' + c.n && b.order && !b.over, `${T} 덱 빌더 [${label}] "${b.txt}" (칩 위, 넘침 없음)`); }
    // 카드명이 없어도 깨지지 않음 (이미지 없는 카드: noimg 와 함께)
    ok(await pg.evaluate(() => { try { pv({ n: 'X', type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1' }, null); return document.querySelector('#pv .nm').textContent === '카드명: X'; } catch (e) { return false; } }), `${T}: 이미지 없는 카드도 카드명 표시`);
    ok(pg.errs.length === 0, `${T}: JS 오류 없음 ${pg.errs.join('|')}`); await pg.context().close(); }
  await br.close(); console.log(fail ? `\n실패 ${fail}` : `\n카드명 표시 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0); })();
