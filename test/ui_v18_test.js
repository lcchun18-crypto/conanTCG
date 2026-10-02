// v1.8.1 UI 검증: 효과 선택을 플레이 화면에서 직접 + 어시스트 파트너 순서 (구 v1.7.0 헤더:  (Playwright + 모의 WebSocket): ① 행동 버튼 스타일 통일 ② 효과 팝업의 카드 이미지/이름 ③ 카드 ID 표시(상세 패널) ④ 증거 직접 선택 팝업 ⑤ 승패 중앙 배너
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const U = require('./mz_util'); const { G, real, dummy, field, fillFile, pump, FX, S } = U;
const OUT = process.env.UI_SHOTS || '/tmp/ui_v17'; fs.mkdirSync(OUT, { recursive: true });
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const defs = { c: dummy('FIELDCHAR', { color: 'yellow', ap: '3000', lv: '0', extra: '【턴①】 테스트 능력', ab: [{ ic: 'main', ops: [{ op: 'draw', n: 1 }] }] }), ask: { n: 'ASKCARD', type: 'event', color: 'yellow', lv: '0', extra: '뒷면 증거를 앞면으로 할 수 있다', ab: [{ ic: 'event', ops: [{ op: 'flip', n: 1, opt: true }] }] }, pick: { n: 'PICKCARD', type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'flip', n: 1 }] }] } };
for (let i = 0; i < 4; i++) defs['e' + i] = dummy('EVID' + i, { color: 'yellow' });
const mkR = () => { const R = G(defs, ['c', 'ask', 'pick', 'e0', 'e1', 'e2', 'e3'], ['e0', 'e1', 'e2', 'e3'], BS); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
const decorate = R => { for (const k of Object.keys(R.defs)) { const d = R.defs[k]; d.img = svg(d.n, '#dcb'); if (!d.extra) d.extra = d.n; } };
const J = x => JSON.parse(JSON.stringify(x)); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}; const br = await chromium.launch(exe);
  const open = async (R, view, o = {}) => { const ctx = await br.newContext(o.mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } });
    const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); await pg.emulateMedia({ reducedMotion: 'reduce' });
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs); await push(pg, view); return pg; };
  const push = (pg, v) => pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v);
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC';
    const R = mkR(); decorate(R); const s = R.turn; field(R, s, 'c'); const v0 = J(S.view(R, s)); const hand = v0.P[s].hand, fld = v0.P[s].field;
    // ① 최대 1장: 필드 캐릭터 클릭 즉시 처리
    { const v = J(v0); v.eff = { kind: 'pick', msg: '대상 캐릭터를 최대 1장 선택', min: 0, max: 1, cards: fld, sel: fld.map(c => c.id), src: 'P', srcD: fld[0].d }; const pg = await open(R, v, { mobile });
      ok(await pg.locator('.card.epk').count() === fld.length, `${T}: 선택 가능한 필드 캐릭터 강조`); ok(await pg.locator('#etray .card').count() === 0, `${T}: 별도 선택 팝업/트레이 없음`);
      ok(/선택 안 함/.test(await pg.locator('#btns').innerText()), `${T}: 최대 1장·최소 0 → '선택 안 함' 버튼`);
      await pg.locator(`.card.epk[data-id="${fld[0].id}"]`).first().click({ force: true }); const sent = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(sent.length === 1 && sent[0].v[0] === fld[0].id, `${T}: 클릭 즉시 응답 ${JSON.stringify(sent)}`); await pg.context().close(); }
    // ② 손패에서 2장 선택 → 확정
    { const v = J(v0); const hs = hand.slice(0, 3); v.eff = { kind: 'pick', msg: '버릴 손패 2장', min: 2, max: 2, cards: hs, sel: hs.map(c => c.id), src: 'P', srcD: hs[0].d }; const pg = await open(R, v, { mobile });
      ok(await pg.locator('#hand .card.epk').count() === 3, `${T}: 손패 카드가 선택 가능으로 강조`);  if (!mobile) await pg.screenshot({ path: OUT + '/pick_hand.png' });
      await pg.locator(`#hand .card[data-id="${hs[0].id}"]`).click({ force: true }); ok(/1\/2/.test(await pg.locator('#btns button').first().innerText()), `${T}: 손패 클릭 → 선택 1/2`);
      await pg.locator(`#hand .card[data-id="${hs[2].id}"]`).click({ force: true }); ok(await pg.locator('#hand .card.sel').count() === 2, `${T}: 2장 선택 표시`);
      await pg.locator('#btns button').first().click(); const sent = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(sent.length === 1 && sent[0].v.length === 2 && sent[0].v.includes(hs[0].id) && sent[0].v.includes(hs[2].id), `${T}: 확정 → ${JSON.stringify(sent)}`); await pg.context().close(); }
    // ③ 화면에 없는 카드(덱 위 공개 등)만 트레이에 표시
    { const v = J(v0); const ex = { ...hand[0], id: 99001 }; v.eff = { kind: 'pick', msg: '공개된 카드 중 선택', min: 1, max: 1, cards: [ex], sel: [99001], src: 'P', srcD: ex.d }; const pg = await open(R, v, { mobile });
      ok(await pg.locator('#etray .card.epk').count() === 1, `${T}: 보이지 않는 카드는 선택 트레이에 표시`); await pg.locator('#etray .card.epk').click({ force: true }); const sent = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(sent.length === 1 && sent[0].v[0] === 99001, `${T}: 트레이 카드 클릭 응답`); await pg.context().close(); }
    // ④ 어시스트: 파트너가 FILE 줄 맨 위(앞)에 보임
    { const v = J(v0); v.P[s].partner.inFile = true; v.P[s].partner.st = 's'; const pg = await open(R, v, { mobile });
      const z = await pg.evaluate(() => { const f = document.querySelector('#me-file .fp'); if (!f) return null; const zs = [...document.querySelectorAll('#me-file .card.fl')].filter(x => x !== f).map(x => +x.style.zIndex); return { p: +f.style.zIndex, max: Math.max(0, ...zs) }; });
      ok(z && z.p > z.max, `${T}: 어시스트 파트너가 FILE 카드들보다 앞 (z ${z && z.p} > ${z && z.max})`); if (!mobile) await pg.screenshot({ path: OUT + '/assist_partner.png' }); await pg.context().close(); }
  }
  console.log(`\nui_v18_test: ${pass} 통과, ${fail} 실패`); await br.close(); process.exit(fail ? 1 : 0);
})();
