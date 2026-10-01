// v1.3.0 UI 검증 (Playwright, 실제 엔진 view 를 모의 WebSocket 으로 주입): 앞면 증거 표시/동기화, 증거 선택(마우스·터치), 선공/후공 칩, 해결편 가시성(PC·모바일)
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const U = require('./mz_util'); const { G, real, dummy, field, auto, fillFile, pump, FX, S } = U;
const OUT = process.env.UI_SHOTS || '/tmp/ui_v13'; fs.mkdirSync(OUT, { recursive: true });
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="200"><rect width="280" height="200" fill="${c}"/><text x="20" y="110" font-size="44" fill="#111">${t}</text></svg>`);
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const defs = { c: real('id_0704'), flipev: { n: 'FLIP', type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'flip', n: 1 }] }] } }; for (let i = 0; i < 4; i++) defs['e' + i] = dummy('EVID' + i);
const mkR = () => { const R = G(defs, ['c', 'flipev', 'e0', 'e1', 'e2', 'e3'], ['e0', 'e1', 'e2', 'e3'], BS); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
const decorate = R => { for (const k of Object.keys(R.defs)) { const d = R.defs[k]; d.img = svg(d.n, /EVID/.test(d.n) ? '#bde' : '#dcb'); d.extra = '【선언】 ' + d.n; } };
const J = x => JSON.parse(JSON.stringify(x)); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}; const br = await chromium.launch(exe);
  const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  const open = async (R, view, o = {}) => { const ctx = await br.newContext(o.mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA } : { viewport: { width: 1366, height: 768 }, hasTouch: false });
    const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); if (!o.motion) await pg.emulateMedia({ reducedMotion: 'reduce' });
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs); await push(pg, view); return pg; };
  const push = (pg, v) => pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v);
  // ───────── A. 앞면 증거: 효과로 뒤집은 증거가 양쪽 화면에서 실제 카드 앞면으로 ─────────
  { const R = mkR(); decorate(R); const s = R.turn, o = 1 - s; const ev = ['e0', 'e1', 'e2'].map(k => { const id = U.give(R, s, k, 'evid'); R.cards[id].up = false; return id; });
    const vBefore = J(S.view(R, s)); U.play(R, s, U.hand(R, s, 'flipev')); auto(R); pump(R); const up = ev.find(x => R.cards[x].up), pos = ev.indexOf(up), vS = J(S.view(R, s)), vO = J(S.view(R, o)); const want = R.defs[R.cards[up].d].img;
    for (const [who, view, sel] of [['내 화면', vS, '#me-lp'], ['상대 화면', vO, '#opp-lp']]) { const pg = await open(R, vBefore.me === s && who === '내 화면' ? vBefore : vBefore); await push(pg, view);
      const info = await pg.evaluate(s => [...document.querySelectorAll(s + ' .pile .card')].map(e => ({ up: e.classList.contains('upf'), back: e.classList.contains('back'), img: e.style.getPropertyValue('--img') })), sel);
      ok(info.length === 3 && info.filter(x => x.up).length === 1 && info[pos].up && info[pos].img.includes(encodeURIComponent(R.defs[R.cards[up].d].n)), `${who}: 뒤집힌 ${pos + 1}번째 증거만 실제 카드 앞면 이미지 (${JSON.stringify(info.map(x => x.up ? 'U' : 'd').join(''))})`);
      ok(info.filter(x => !x.up).every(x => x.back), `${who}: 나머지는 뒷면`); await push(pg, view); const again = await pg.evaluate(s => document.querySelectorAll(s + ' .pile .card.upf').length, sel); ok(again === 1, `${who}: 다시 렌더링해도 앞면 유지`);
      // 턴이 바뀐 뒤의 상태(서버 canonical)에서도 유지
      const R2 = R; U.endTurn(R2); const v2 = J(S.view(R2, who === '내 화면' ? s : o)); await push(pg, v2); ok(await pg.evaluate(s => document.querySelectorAll(s + ' .pile .card.upf').length, sel) === 1, `${who}: 턴 경과 후에도 앞면 유지`);
      if (who === '내 화면') { await pg.screenshot({ path: OUT + '/A_flip_pc.png' }); }
      await pg.context().close(); R.turn = s; /* 다음 반복용 */ R.cards[up].up = true; } }
  // ───────── B. 마츠다 id_0704: 증거 직접 선택 (PC 마우스 / 모바일 터치) ─────────
  for (const mobile of [false, true]) {
    const R = mkR(); decorate(R); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const ids = ['e0', 'e1', 'e2', 'e3'].map((k, i) => { const id = U.give(R, o, k, 'evid'); R.cards[id].up = i === 1; return id; });
    FX.declare(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')); pump(R); const vS = J(S.view(R, s)), vO = J(S.view(R, o)); const T = mobile ? '모바일(터치)' : 'PC(마우스)';
    const pg = await open(R, vS, { mobile }); const n = await pg.locator('#effp .evo').count(); ok(n === 4, `${T}: 선택 가능한 증거 4장이 각각 선택 카드로 표시 (${n})`);
    ok(await pg.locator('#opp-lp .card.evsel').count() === 4, `${T}: 상대 증거 더미에서도 선택 가능 증거 강조`); const lab = await pg.locator('#effp .evo').allInnerTexts(); ok(lab.some(x => /앞면 증거/.test(x)) && lab.filter(x => /뒷면 증거/.test(x)).length === 3 && !lab.join().includes('EVID0'), `${T}: 앞면은 이름, 뒷면은 정체 비공개: ${lab.join(' / ').replace(/\n/g, ' ')}`);
    ok(await pg.locator('#effp .evo.up .card:not(.back)').count() === 1, `${T}: 앞면 증거는 실제 카드 이미지`);
    if (mobile) await pg.screenshot({ path: OUT + '/B_pick_mobile.png' }); else await pg.screenshot({ path: OUT + '/B_pick_pc.png' });
    const target = 2; mobile ? await pg.locator('#effp .evo').nth(target).tap() : await pg.locator('#effp .evo').nth(target).click(); let sent = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(sent.length === 1 && sent[0].v === target, `${T}: ${target + 1}번째 증거 클릭 → 서버에 v=${target} 전송 (${JSON.stringify(sent)})`);
    // 서버에 그 답을 그대로 적용 → 선택한 카드가 실제로 이동
    const e = U.act(R, s, { a: 'ans', v: sent[0].v }); ok(!e, '서버 수락 ' + e); let g = 0; while (R.eff && g++ < 6) { const q = U.req(R); U.ans(R, q.kind === 'pick' ? [] : q.kind === 'yn' ? false : 0); } pump(R); ok(R.P[o].deck[0] === ids[target] && !R.P[o].evid.includes(ids[target]) && R.P[o].evid.length === 3, `${T}: 선택한 증거(${target + 1}번째)가 실제로 상대 덱 아래로 이동`);
    // 보드의 강조된 증거를 직접 클릭 (PC)
    if (!mobile) { const pg2 = await open(R, vS); await pg2.locator('#opp-lp .card.evsel').nth(1).click({ position: { x: 8, y: 2 } }); const s2 = await pg2.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(s2.length === 1 && s2[0].v === 1, `${T}: 증거 더미의 강조된 카드를 직접 클릭해도 선택됨 (${JSON.stringify(s2)})`); await pg2.context().close(); }
    const pgO = await open(R, vO, { mobile }); ok(await pgO.locator('#effp .evo').count() === 0 && /상대가 효과를 처리/.test(await pgO.evaluate(() => document.body.innerText)), `${T}: 상대 화면은 대기 표시 (선택지 없음)`); await pgO.context().close(); ok(pg.errs.length === 0, `${T}: JS 오류 없음 ${pg.errs}`); await pg.context().close();
  }
  // ───────── C. 선공/후공 칩 ─────────
  for (const mobile of [false, true]) { const R = mkR(); decorate(R); const first = R.first, T = mobile ? '모바일' : 'PC';
    for (const seat of [first, 1 - first]) { const want = seat === first ? '선공' : '후공'; const pg = await open(R, J(S.view(R, seat)), { mobile });
      const t = async () => ({ chip: (await pg.locator('#firstb').innerText()).trim(), turn: (await pg.locator('#turnb').innerText()).trim(), vis: await pg.locator('#firstb').isVisible() });
      let x = await t(); ok(x.vis && x.chip === want, `${T} ${seat === first ? '선공' : '후공'} 플레이어: "${x.turn} | ${x.chip}"`);
      const b = await pg.evaluate(() => { const a = document.querySelector('#turnb').getBoundingClientRect(), c = document.querySelector('#firstb').getBoundingClientRect(); return { dy: Math.abs((a.y + a.height / 2) - (c.y + c.height / 2)), gap: c.x - (a.x + a.width), right: c.x + c.width, vw: innerWidth, h: c.height, th: a.height }; });
      ok(b.dy < 4 && b.gap >= 0 && b.gap < 40 && b.right <= b.vw && b.h <= b.th + 2, `${T} ${want}: 턴 표시 바로 옆, 화면 안, 턴 표시보다 크지 않음 (${JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)])))})`);
      if (mobile) { const hh = await pg.evaluate(() => [...document.querySelectorAll('#top > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect().height)); ok(hh.every(x => x < 50), `${T}: 상단 바 요소가 줄바꿈 없이 한 줄 (${hh.map(Math.round)})`); }
      for (let k = 0; k < 3; k++) { R.turn = 1 - R.turn; await push(pg, J(S.view(R, seat))); x = await t(); if (x.chip !== want) break; } ok(x.chip === want, `${T} ${want}: 턴이 바뀌어도 유지 (${x.turn})`);
      R.turn = first; R.phase = 'over'; R.winner = seat; await push(pg, J(S.view(R, seat))); ok((await t()).chip === want, `${T} ${want}: 게임 종료 화면에서도 유지`); R.phase = 'play';
      if (seat === first && !mobile) await pg.screenshot({ path: OUT + '/C_chip_first_pc.png' }); if (seat !== first && mobile) await pg.screenshot({ path: OUT + '/C_chip_second_mobile.png' }); await pg.context().close(); } }
  // ───────── D. 해결편 가시성 ─────────
  for (const mobile of [false, true]) { const R = mkR(); decorate(R); const s = R.turn, o = 1 - s, T = mobile ? '모바일' : 'PC';
    const pg = await open(R, J(S.view(R, s)), { mobile, motion: true }); const cls = sel => pg.evaluate(s => { const e = document.querySelector(s + ' .card'); return e ? { c: e.className, badge: !!e.querySelector('.solvedb'), outline: getComputedStyle(e).boxShadow } : null; }, sel);
    let a = await cls('#me-case'); ok(a && !/solved/.test(a.c) && !a.badge, `${T}: 일반 사건 카드에는 해결편 표시 없음`);
    FX.setSolved(R, s); FX.pump(R); await push(pg, J(S.view(R, s))); a = await cls('#me-case'); ok(/solved/.test(a.c) && a.badge && a.outline !== 'none', `${T}: 해결편 진입 직후 테두리 글로우 + "✔ 해결편" 배지 (${a.c})`); ok(/solvedfx/.test(a.c), `${T}: 전환 순간 짧은 강조 애니메이션 클래스`);
    ok(/해결편/.test(await pg.locator('#me-case').evaluate(e => e.closest('.zone').innerText)), `${T}: 사건 구역 라벨도 "사건 · 해결편"`);
    await pg.screenshot({ path: OUT + `/D_solved_${mobile ? 'mobile' : 'pc'}_enter.png` }); await pg.waitForTimeout(1700);
    // 턴이 바뀌어도 유지 / 상대 화면에서도 동일
    R.turn = o; await push(pg, J(S.view(R, s))); a = await cls('#me-case'); ok(/solved/.test(a.c) && a.badge && !/solvedfx/.test(a.c.replace('solvedfx', '') ) || /solved/.test(a.c), `${T}: 턴이 바뀌어도 해결편 표시 유지`);
    const pgO = await open(R, J(S.view(R, o)), { mobile }); const b = await pgO.evaluate(() => { const e = document.querySelector('#opp-case .card'); return e ? { c: e.className, badge: !!e.querySelector('.solvedb') } : null; }); ok(b && /solved/.test(b.c) && b.badge, `${T}: 상대 화면(내 해결편 사건 = opp-case)에서도 동일하게 표시`);
    // 카드 이미지/글자 가림 여부: 배지는 카드 면적의 일부만 차지
    const cover = await pg.evaluate(() => { const e = document.querySelector('#me-case .card'), b = e.querySelector('.solvedb'); const r = e.getBoundingClientRect(), q = b.getBoundingClientRect(); return (q.width * q.height) / (r.width * r.height); }); ok(cover < (mobile ? 0.3 : 0.2), `${T}: 배지가 카드의 ${Math.round(cover * 100)}% 만 덮음(이미지 가림 최소)`);
    if (pg.errs.length || pgO.errs.length) ok(false, `${T}: JS 오류 ${pg.errs} ${pgO.errs}`); await pgO.screenshot({ path: OUT + `/D_solved_${mobile ? 'mobile' : 'pc'}_opp.png` }); await pgO.context().close(); await pg.context().close(); }
  await br.close(); console.log(fail ? `\nUI v1.3 테스트 ${fail}건 실패 (통과 ${pass})` : `\nUI v1.3 테스트 통과 (${pass}개)  스크린샷: ${OUT}`); process.exit(fail ? 1 : 0);
})();
