// v1.7.0 UI 검증 (Playwright + 모의 WebSocket): ① 행동 버튼 스타일 통일 ② 효과 팝업의 카드 이미지/이름 ③ 카드 ID 표시(상세 패널) ④ 증거 직접 선택 팝업 ⑤ 승패 중앙 배너
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
    // ① 행동 버튼 통일: 내 캐릭터 선택 → 행동 버튼 전부 동일한 노랑 배경 + 어두운 글씨
    { const R = mkR(); decorate(R); const s = R.turn; const c = field(R, s, 'c'); const pg = await open(R, J(S.view(R, s)), { mobile });
      await pg.locator(`#me-field [data-id="${c}"], [data-id="${c}"]`).first().click({ force: true }); await pg.waitForTimeout(150);
      const bs = await pg.evaluate(() => [...document.querySelectorAll('#act button')].map(b => { const cs = getComputedStyle(b); return { t: b.textContent, bg: cs.backgroundImage, color: cs.color, border: cs.borderTopColor }; }));
      ok(bs.length >= 2, `${T}: 행동 버튼이 여러 개 표시 (${bs.map(b => b.t).join(' / ')})`);
      ok(bs.every(b => b.bg === bs[0].bg && b.color === bs[0].color && b.border === bs[0].border), `${T}: 모든 행동 버튼의 배경/글씨/테두리가 동일`);
      ok(/255, 209, 103|225, 159, 38/.test(bs[0].bg) && /^rgb\(43, 27, 0\)/.test(bs[0].color), `${T}: 노란 배경 + 검은 글씨 (${bs[0].color})`);
      // ③ 카드 ID: 상세 패널(PC: 오른쪽, 모바일: 길게 누름 대신 hover/탭 함수 직접 호출)
      await pg.evaluate(id => { const el = document.querySelector(`[data-id="${id}"]`); el && el.onmouseenter && el.onmouseenter(); }, c); const chip = await pg.evaluate(() => { const e = document.querySelector('#pv .chipm.cid'); return e ? e.textContent : null; });
      const ex = R.cards[c].d.replace(/^\d+:/, ''); if (!mobile) ok(!!chip && chip.includes('카드 ID: ') && chip.includes(ex), `${T}: 카드 상세에 카드 ID 표시 (${chip})`);
      if (!mobile) await pg.screenshot({ path: OUT + '/1_actions_ids_pc.png' }); await pg.context().close(); }
    // ② 효과 발동 팝업: 카드 이미지 + 카드명 + 질문 + 효과 설명 + 예/아니오
    { const R = mkR(); decorate(R); const s = R.turn; for (const k of ['e0', 'e1']) { const id = U.give(R, s, k, 'evid'); R.cards[id].up = false; } U.play(R, s, U.hand(R, s, 'ask')); const v = J(S.view(R, s)); ok(v.eff && v.eff.kind === 'yn', `${T}: yn 팝업 상태`);
      const pg = await open(R, v, { mobile }); const info = await pg.evaluate(() => { const b = document.querySelector('#effp .box'); const im = b && b.querySelector('img.fxi'); return { img: im ? im.getAttribute('src') : null, w: im ? im.getBoundingClientRect().width : 0, title: b && b.querySelector('.fxm>b').textContent, q: b && b.querySelector('.fxq').textContent, fx: !!(b && b.querySelector('.fxt')), btns: [...document.querySelectorAll('#effp #btns button')].map(x => x.textContent) }; });
      ok(info.img && info.img.includes('ASKCARD') && info.w > 60, `${T}: 팝업에 카드 이미지 (${Math.round(info.w)}px)`); ok(/ASKCARD/.test(info.title), `${T}: 카드명 표시 (${info.title})`); ok(/표향|앞면|뒷면/.test(info.q), `${T}: 발동 여부 질문 (${info.q})`);
      ok(info.fx, `${T}: 적용 중인 효과 설명`); ok(info.btns.join() === '예,아니오', `${T}: 예 / 아니오 버튼 유지 (${info.btns})`); await pg.screenshot({ path: OUT + `/2_popup_${mobile ? 'm' : 'pc'}.png` }); await pg.context().close(); }
    // ④ 증거 직접 선택
    { const R = mkR(); decorate(R); const s = R.turn; const ids = ['e0', 'e1', 'e2'].map(k => { const id = U.give(R, s, k, 'evid'); R.cards[id].up = false; return id; }); U.play(R, s, U.hand(R, s, 'pick')); const v = J(S.view(R, s)); ok(v.eff && v.eff.evp && v.eff.evp.pos.length === 3, `${T}: 증거 선택 상태 (3장)`);
      const pg = await open(R, v, { mobile }); ok(await pg.locator('#effp .evo').count() === 3, `${T}: 선택 가능한 증거 3개가 클릭 가능한 카드로 표시`); ok(await pg.locator('#me-lp .card.evsel').count() === 3, `${T}: 내 증거 더미에서 선택 가능 증거 하이라이트`);
      mobile ? await pg.locator('#effp .evo').nth(1).tap() : await pg.locator('#effp .evo').nth(1).click(); const sent = await pg.evaluate(() => window.__sent.filter(m => m.a === 'ans')); ok(sent.length === 1 && sent[0].v === 1, `${T}: 클릭한 증거(2번째)가 서버로 전달`);
      U.ans(R, 1); pump(R); ok(R.cards[ids[1]].up && !R.cards[ids[0]].up && !R.cards[ids[2]].up, `${T}: 서버가 고른 증거만 앞면 처리`); if (!mobile) await pg.screenshot({ path: OUT + '/4_evpick_pc.png' }); await pg.context().close(); } }
  // ⑤ 승패 배너 (+ 상대 시점)
  for (const w of [true, false]) { const R = mkR(); decorate(R); const s = R.turn; R.phase = 'over'; R.winner = w ? s : 1 - s; const pg = await open(R, J(S.view(R, s)));
    const b = await pg.evaluate(() => { const e = document.getElementById('endb'), r = e.querySelector('.eb').getBoundingClientRect(), t = e.querySelector('.et'); return { on: e.classList.contains('on'), lose: e.classList.contains('lose'), txt: t.textContent, fs: parseFloat(getComputedStyle(t).fontSize), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), W: innerWidth, H: innerHeight }; });
    ok(b.on && b.lose === !w && (w ? /승리/.test(b.txt) : /패배/.test(b.txt)), `${w ? '승리' : '패배'} 배너 표시 (${b.txt})`); ok(b.fs >= 48 && Math.abs(b.cx - b.W / 2) < 6 && Math.abs(b.cy - b.H / 2) < 40, `${w ? '승리' : '패배'} 배너가 화면 중앙에 크게 (글자 ${Math.round(b.fs)}px, 중심 ${b.cx},${b.cy} / ${b.W}x${b.H})`);
    await pg.screenshot({ path: OUT + `/5_${w ? 'win' : 'lose'}.png` }); await pg.click('#endb .eclose'); ok(await pg.evaluate(() => !document.getElementById('endb').classList.contains('on')), '닫기 버튼으로 배너 닫힘'); await pg.context().close(); }
  // ③ 덱 빌더 카드 상세에도 ID — 기존 deck UI 테스트가 있는 전역 함수 직접 확인
  { const R = mkR(); const pg = await open(R, J(S.view(R, R.turn))); const t = await pg.evaluate(() => { DB.cards = { id_9999: { id: 'id_9999', n: 'X', type: 'char', color: 'red', lv: '1', ap: '1000', lp: '1' } }; bPv('id_9999'); return document.getElementById('dbChips').textContent; }); ok(/카드 ID: id_9999/.test(t), `덱 빌더 카드 상세에 카드 ID (${t})`); await pg.context().close(); }
  // ⑥ 봇 대전 시작 시 로딩 표시: 시작 직후 표시 → 게임 상태(v)를 받으면 사라짐, 오류 시에도 사라짐
  { const R = mkR(); const pg = await open(R, J(S.view(R, R.turn))); await pg.evaluate(() => { document.getElementById('game').style.display = 'none'; document.getElementById('lobby').style.display = ''; });
    await pg.evaluate(() => { DB.cards = { id_1: { id: 'id_1', n: 'x', type: 'char' } }; DB.decks = { d1: { name: 'd', cards: { id_1: 40 }, partner: 'id_1', kase: 'id_1' } }; botStart({ my: 'd1', dk: 'd1', bot: 'expert', first: 'random' }); });
    const shown = await pg.evaluate(() => ({ on: document.getElementById('ldg').classList.contains('on'), sent: window.__sent.some(m => m.t === 'createBot'), txt: document.getElementById('ldg').textContent }));
    ok(shown.on && shown.sent && /준비하는 중/.test(shown.txt), '봇 대전 시작 직후 로딩 표시 (' + shown.txt.slice(0, 20) + ')');
    await push(pg, J(S.view(R, R.turn))); ok(await pg.evaluate(() => !document.getElementById('ldg').classList.contains('on')), '게임 화면 수신 후 로딩 표시 사라짐');
    await pg.evaluate(() => loading(true)); await pg.evaluate(() => window.__ws.onmessage({ data: JSON.stringify({ t: 'err', msg: 'x' }) })); ok(await pg.evaluate(() => !document.getElementById('ldg').classList.contains('on')), '오류 수신 시에도 로딩 표시 사라짐'); await pg.screenshot({ path: OUT + '/6_loading.png' }); await pg.context().close(); }
  // ⑦ 리무브 에리어(내/상대): 마우스를 올리면 오른쪽 상세에 맨 위 카드가 표시
  for (const side of ['me', 'opp']) { const R = mkR(); decorate(R); const s = R.turn, o = 1 - s; const x = U.give(R, side === 'me' ? s : o, 'e0', 'rem'); const pg = await open(R, J(S.view(R, s)));
    await pg.locator(`#${side}-rem`).hover({ force: true }); const t = await pg.evaluate(() => { const i = document.querySelector('#pv img'); return i ? decodeURIComponent(i.getAttribute('src')) : ''; }); ok(/EVID0/.test(t), `${side === 'me' ? '내' : '상대'} 리무브 에리어 호버 → 상세에 카드 표시`);
    await pg.mouse.move(5, 5); await pg.locator(`#${side}-rem .pile .card`).hover({ force: true }); ok(/EVID0/.test(await pg.evaluate(() => { const i = document.querySelector('#pv img'); return i ? decodeURIComponent(i.getAttribute('src')) : ''; })), `${side === 'me' ? '내' : '상대'} 리무브 맨 위 카드 호버`); await pg.context().close(); }
  await br.close(); console.log(`\nui_v17_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
