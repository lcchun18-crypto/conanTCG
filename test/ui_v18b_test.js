// v1.8.2: 효과로 AP/LP/레벨이 변한 캐릭터에 변화 표시 (Playwright)
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const U = require('./mz_util'); const { G, dummy, field, fillFile, S } = U; const OUT = process.env.UI_SHOTS || '/tmp/ui_v18'; fs.mkdirSync(OUT, { recursive: true });
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const defs = { a: dummy('UPCHAR', { color: 'yellow', ap: '3000', lp: '2', lv: '2' }), b: dummy('DOWNCHAR', { color: 'yellow', ap: '4000', lp: '2', lv: '3' }), n: dummy('PLAIN', { color: 'yellow', ap: '2000', lp: '1', lv: '1' }) };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => {
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC';
    const R = G(defs, ['a', 'b', 'n'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#dcb');
    const s = R.turn, a = field(R, s, 'a'), b = field(R, s, 'b'), n = field(R, s, 'n'), oc = field(R, 1 - s, 'a'); R.cards[oc].lvm = -1; R.cards[a].apm = 1000; R.cards[a].lpm = 1; R.cards[a].lvm = -1; R.cards[b].apm = -2000; R.cards[b].lpm = -1;
    const v = JSON.parse(JSON.stringify(S.view(R, s)));
    const ctx = await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs); await pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v);
    const g = id => pg.evaluate(id => { const e = document.querySelector(`#me-field [data-id="${id}"]`); return e ? { mods: [...e.querySelectorAll('.mods i')].map(x => x.textContent), up: e.classList.contains('mup'), dn: e.classList.contains('mdn') } : null; }, id);
    const A = await g(a), B = await g(b), N = await g(n);
    { const O = await pg.evaluate(id => { const e = document.querySelector(`#opp-field [data-id="${id}"]`) || document.querySelector(`[data-id="${id}"]`); return e ? [...e.querySelectorAll('.mods i')].map(x => x.textContent) : null; }, oc); ok(O && O.join() === 'Lv ▼1', `${T}: 상대 캐릭터의 레벨 감소도 표시 (${O})`); }
    ok(A && A.mods.join('|') === 'AP ▲1000|Lv ▼1|LP ▲1' && A.up && A.dn, `${T}: 상승 캐릭터 표시 ${A && A.mods}`); ok(B && B.mods.join('|') === 'AP ▼2000|LP ▼1' && B.dn && !B.up, `${T}: 하락 캐릭터 표시 ${B && B.mods}`); ok(N && N.mods.length === 0 && !N.up && !N.dn, `${T}: 변화 없는 캐릭터는 표시 없음`);
    { const v2 = JSON.parse(JSON.stringify(v)); v2.P[s].field.find(c => c.id === b).bl = 1; await pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v2);
      const bk = await pg.evaluate(id => { const e = document.querySelector(`#me-field [data-id="${id}"]`); const t = e && e.querySelector('.blkb'); return { cls: e && e.classList.contains('blk'), txt: t && t.textContent, other: !!document.querySelector(`#me-field [data-id="${id}"]`) && [...document.querySelectorAll('#me-field .card')].filter(x => x.querySelector('.blkb')).length }; }, b);
      ok(bk.cls && /효과 무효/.test(bk.txt || '') && bk.other === 1, `${T}: 효과 무효 대상 카드에 표시 (${bk.txt})`); if (!mobile) await pg.screenshot({ path: OUT + '/blank.png' });
      await pg.evaluate(() => document.querySelector('#me-field .card.blk').onmouseenter && document.querySelector('#me-field .card.blk').onmouseenter()); ok(/효과 무효/.test(await pg.evaluate(() => document.getElementById('pv').innerText)) || mobile, `${T}: 상세 패널에도 효과 무효 표시`);
      // 로비/게임 오류 메시지 분리
      await pg.evaluate(() => window.__ws.onmessage({ data: JSON.stringify({ t: 'err', msg: '레벨 6: FILE 에리어 카드가 부족합니다' }) })); const e1 = await pg.evaluate(() => ({ l: document.getElementById('lerr').textContent, g: document.getElementById('err').textContent }));
      ok(e1.l === '' && /FILE/.test(e1.g), `${T}: 게임 중 오류는 게임 화면에만 (로비 ${JSON.stringify(e1.l)})`);
      await pg.evaluate(() => toLobby()); const e2 = await pg.evaluate(() => ({ l: document.getElementById('lerr').textContent, vis: getComputedStyle(document.getElementById('lobby')).display !== 'none' })); ok(e2.vis && e2.l === '', `${T}: 로비로 돌아오면 이전 게임 오류가 보이지 않음`);
      await pg.evaluate(() => window.__ws.onmessage({ data: JSON.stringify({ t: 'err', msg: '방을 찾을 수 없습니다' }) })); ok(/방을/.test(await pg.evaluate(() => document.getElementById('lerr').textContent)), `${T}: 로비 오류는 로비에 표시`); }
    { await pg.evaluate(id => { const e = document.querySelector(`[data-id="${id}"]`); e.onmouseenter && e.onmouseenter(); }, oc); const chip = await pg.evaluate(() => [...document.querySelectorAll('#pv .chipm')].map(x => x.innerText.replace(/\s+/g, ' ')).find(t => /^Lv/.test(t))); ok(/Lv 1 \(-1\)/.test(chip || ''), `${T}: 상세 패널 Lv 칩에 변화 표시 (${chip})`); }
    if (!mobile) await pg.screenshot({ path: OUT + '/mods.png' }); ok(!pg.errs.length, `${T}: JS 오류 없음 ${pg.errs}`); await ctx.close(); }
  console.log(`ui_v18b_test: ${pass} 통과, ${fail} 실패`); await br.close(); process.exit(fail ? 1 : 0); })();
