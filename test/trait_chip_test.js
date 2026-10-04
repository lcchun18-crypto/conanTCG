// v1.12.4: 카드 상세(게임 우측 패널 #pv, 덱 빌더 #dbChips)에 특징(trait) badge — 1개 / 여러 개 / 없음. 실제 cards.json 의 trait 만 사용
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
const tr = c => String(c.trait || '').split(',').map(x => x.trim()).filter(Boolean);
const pick = n => Object.values(DB).find(c => c.type === 'char' && (n === 0 ? tr(c).length === 0 : n === 1 ? tr(c).length === 1 : tr(c).length >= 3));
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const cases = [['특징 1개', pick(1)], ['특징 여러 개', pick(3)], ['특징 없음', pick(0) || Object.values(DB).find(c => c.type === 'case')]]; ok(cases.every(x => x[1]), 'fixture: 실제 카드 ' + cases.map(x => x[0] + '=' + x[1].id).join(', '));
  const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
  const R = G({ a: dummy('A', { color: 'yellow' }) }, ['a'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); S.snapTake(R);
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC';
    const pg = await (await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } })).newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); const defs = { ...R.defs }; for (const [, c] of cases) defs['t_' + c.id] = { n: c.n, type: c.type, color: c.color || 'blue', lv: c.lv || '', ap: c.ap || '', lp: c.lp || '', kw: c.kw || '', trait: c.trait || '', fx: c.fx || '', extra: c.extra || '', ab: [] };
    await pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: m }) }), defs); await pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), JSON.parse(JSON.stringify(S.view(R, R.turn))));
    for (const [label, c] of cases) { const want = tr(c);
      // 게임 우측 상세 패널
      const g = await pg.evaluate(([id, f]) => { try { pv(f, null); } catch (e) { return { err: String(e) }; } const ch = [...document.querySelectorAll('#pv .meta .chipm')]; return { tr: ch.filter(x => x.classList.contains('tr')).map(x => x.textContent), all: ch.map(x => x.textContent), idLast: ch.length && ch[ch.length - 1].classList.contains('cid'), wrap: getComputedStyle(document.querySelector('#pv .meta')).flexWrap }; }, [c.id, { ...defs['t_' + c.id], id: c.id }]);
      ok(!g.err && JSON.stringify(g.tr) === JSON.stringify(want) && g.idLast && g.wrap === 'wrap', `${T} 게임 패널 [${label}] 특징 badge ${JSON.stringify(g.tr)} = ${JSON.stringify(want)}, 카드 ID 가 마지막, 줄바꿈 ${g.wrap}`);
      // 덱 빌더 상세
      const b = await pg.evaluate(([id, card]) => { DB.cards = { [id]: card }; try { bPv(id); } catch (e) { return { err: String(e) }; } const sp = [...document.querySelectorAll('#dbChips span')].map(x => x.textContent); return { sp, wrap: getComputedStyle(document.getElementById('dbChips')).flexWrap }; }, [c.id, { id: c.id, n: c.n, type: c.type, color: c.color, lv: c.lv, ap: c.ap, lp: c.lp, trait: c.trait, fx: c.fx, extra: c.extra }]);
      const shown = !b.err && want.every(t => b.sp.includes(t)) && b.sp[b.sp.length - 1] === '카드 ID: ' + c.id && b.sp.length === (b.sp.filter(x => !want.includes(x)).length + want.length) && b.wrap === 'wrap';
      ok(shown && (want.length || !b.sp.some(x => /특징/.test(x))), `${T} 덱 빌더 [${label}] ${JSON.stringify(b.sp)} (특징 ${want.length}개, 빈 "특징:" 문구 없음)`); }
    ok(pg.errs.length === 0, `${T}: JS 오류 없음 ${pg.errs.join('|')}`); await pg.context().close(); }
  await br.close(); console.log(fail ? `\n실패 ${fail}` : `\n특징 badge 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0); })();
