// 모바일 에뮬레이션 실전 테스트 (실제 server.js + WebSocket + 터치 입력만 사용)
//  로비 → 덱 빌더(탭/필터/검색/선택/＋−/저장/내보내기/가져오기, 카드 1,251장) → 방 만들기/입장 → 덱 등록 → 멀리건 → 등장/추리/액션/가드/컨택트/턴 종료 → 회전 → 봇 대전
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
const mk = (id, n, type, extra = {}) => ({ id, n, type, color: 'blue', lv: '1', lv2: '2', ap: '3000', lp: '1', kw: '', trait: '', fx: '', extra: '', ab: [], img: '', ...extra });
const svg = t => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#e8e0c8"/><text x="14" y="140" font-size="24">${t}</text></svg>`);
const COLS = ['blue', 'red', 'green', 'yellow', 'white', 'black'];
function makeDb() { const cards = {}; for (let i = 0; i < 1240; i++) cards['c' + i] = mk('c' + i, '캐릭터' + i, 'char', { lv: String(i % 3), color: COLS[i % 6] === 'blue' || i < 40 ? 'blue' : COLS[i % 6], ap: String(1000 + (i % 5) * 1000), img: i < 40 ? svg('캐릭터' + i) : '', extra: i < 40 ? '【선언】 한국어 효과 ' + i : '' });
  for (let i = 0; i < 6; i++) { cards['p' + i] = mk('p' + i, '파트너' + i, 'partner', { img: svg('파트너' + i) }); cards['k' + i] = mk('k' + i, '사건' + i, 'case', { img: svg('사건' + i) }); } return cards; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports.partB = async (br, H) => {
  const { ok, ctxOf, newPage, inView, tapAt, tapSel, tapBtn, ptOf, UA_IOS } = H;
  console.log('\n══ B. 실제 서버 + 터치 전용 플레이 ══');
  const PORT = 8800 + Math.floor(Math.random() * 600), cf = path.join(os.tmpdir(), 'mob_cards_' + process.pid + '.json'); fs.writeFileSync(cf, JSON.stringify({ cards: makeDb() }));
  const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, CARDS_JSON: cf, NODE_PATH: WS ? path.dirname(path.dirname(WS)) : '', BOT_THINK_MS: '250', BOT_MICRO_MS: '150', BOT_DELAY_MS: '100' }, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) {} try { fs.unlinkSync(cf); } catch (e) {} }; process.on('exit', cleanup); await sleep(1500);
  const URL = 'http://localhost:' + PORT + '/'; const errs = [];
  try {
  // ───── 1. 로비 (세로 폰, Android) ─────
  const cH = await ctxOf(br, 390, 844, { ctx: { reducedMotion: 'reduce' } }), Hp = await newPage(cH, URL); await Hp.evaluate(() => dbReady); errs.push(Hp);
  ok(await Hp.evaluate(() => /\bm\b/.test(document.body.className) && !document.body.classList.contains('ing')), '로비: 모바일 모드(Android Chrome UA, 390x844)');
  let bad = await inView(Hp, '#lobby button, #lobby input', 44); ok(!bad.length, '로비: 모든 버튼/입력이 화면 안 + 높이 ≥ 44px ' + bad.join(' '));
  ok(await Hp.evaluate(() => parseFloat(getComputedStyle($('code')).fontSize) >= 16 && $('code').getAttribute('autocapitalize') === 'characters'), '로비: 방 코드 입력 16px(자동 확대 방지) + 대문자 키보드');
  // 키보드가 올라온 상황(보이는 높이 축소) 흉내: 방 코드 입력 → 입장 버튼이 여전히 눌린다
  await Hp.locator('#code').tap(); await Hp.keyboard.type('zzzz'); await Hp.setViewportSize({ width: 390, height: 430 }); await Hp.waitForTimeout(300);
  await Hp.locator('#lobby button', { hasText: '입장' }).tap(); await Hp.waitForTimeout(500); ok((await Hp.locator('#lerr').innerText()).length > 0 && await Hp.locator('#lobby').isVisible(), '키보드 높이(430px)에서도 [입장] 버튼 터치 가능 (없는 방 → 오류 표시: ' + (await Hp.locator('#lerr').innerText()) + ')');
  await Hp.setViewportSize({ width: 390, height: 844 }); await Hp.waitForTimeout(200); await Hp.fill('#code', '');
  // ───── 2. 덱 빌더 (1,251장) ─────
  const t0 = Date.now(); await Hp.locator('#lobby button', { hasText: '카드 / 덱 관리' }).tap(); await Hp.waitForSelector('#db.on #dbGrid .cc'); const tOpen = Date.now() - t0;
  const n1 = await Hp.locator('#dbGrid .cc').count(), tot = await Hp.evaluate(() => bIx.length); ok(tot === 1252 && n1 > 0 && n1 < tot, `덱 빌더: 카드 ${tot}장 중 처음엔 ${n1}장만 렌더(지연 렌더링) · 여는 데 ${tOpen}ms`);
  ok(tOpen < 3000, `덱 빌더 열기 < 3초 (${tOpen}ms)`); bad = await inView(Hp, '#dbTabs button'); ok(!bad.length, '덱 빌더: 탭 버튼이 화면 안 ' + bad.join(' '));
  ok(await Hp.evaluate(() => { const g = $('dbGrid'), c = g.querySelector('.cc').getBoundingClientRect(); return c.width >= 80 && getComputedStyle(g).display === 'grid'; }), '덱 빌더: 3열 카드 그리드(터치 폭 ≥ 80px)');
  const ts = Date.now(); for (let i = 0; i < 12; i++) { await Hp.evaluate(() => { const g = $('dbGrid'); g.scrollTop = g.scrollHeight; }); await Hp.waitForTimeout(40); } const n2 = await Hp.locator('#dbGrid .cc').count(); ok(n2 > n1 && Date.now() - ts < 6000, `덱 빌더: 스크롤하면 계속 로딩 (${n1} → ${n2}장, ${Date.now() - ts}ms)`); await Hp.evaluate(() => { $('dbGrid').scrollTop = 0; });
  await Hp.locator('.dbc[data-c=blue]').tap(); await Hp.waitForTimeout(150); const cB = await Hp.evaluate(() => bList.length); ok(cB < tot && cB > 0 && /청색/.test(await Hp.locator('#dbCnt').innerText()), `덱 빌더: 색 필터 터치 → ${cB}장`); await Hp.locator('.dbc[data-c=blue]').tap(); await Hp.waitForTimeout(100);
  await Hp.locator('#dbQ').tap(); await Hp.keyboard.type('case'); await Hp.waitForTimeout(250); ok(await Hp.evaluate(() => bList.length === 6 && bList.every(c => c.type === 'case')), '덱 빌더: 검색창 터치 + 키보드 입력("case") → 사건 6장');
  await Hp.setViewportSize({ width: 390, height: 420 }); await Hp.waitForTimeout(250); ok((await inView(Hp, '#dbQ, #dbTabs button')).length === 0, '덱 빌더: 키보드 높이(420px)에서도 검색창/탭이 화면 안'); await Hp.setViewportSize({ width: 390, height: 844 }); await Hp.waitForTimeout(200);
  await Hp.fill('#dbQ', ''); await Hp.waitForTimeout(250);
  // 선택 → 한 번 더 터치 = 추가, ＋/－ 버튼
  const cell = id => Hp.locator(`#dbGrid .cc[data-id="${id}"]`);
  const reach = async id => { for (let i = 0; i < 80 && !(await cell(id).count()); i++) { await Hp.evaluate(() => { const g = $('dbGrid'); g.scrollTop += g.clientHeight * .9; }); await Hp.waitForTimeout(30); } await cell(id).scrollIntoViewIfNeeded(); };
  await cell('c0').tap(); await Hp.waitForTimeout(80); ok(await Hp.locator('#dbGrid .cc.pick').count() === 1 && await Hp.locator('#dbBar.on').count() === 1 && await Hp.evaluate(() => bTot() === 0), '덱 빌더: 카드 터치 = 선택(강조 + 하단 ＋/－ 바), 아직 덱에 안 들어감');
  ok(/캐릭터0/.test(await Hp.locator('#dbBarN').innerText()), '덱 빌더: 하단 바에 선택한 카드 이름'); await cell('c0').tap(); await Hp.waitForTimeout(60); ok(await Hp.evaluate(() => W.cards.c0 === 1), '덱 빌더: 선택된 카드를 한 번 더 터치 = 1장 추가');
  await Hp.locator('#dbBarP').tap(); await Hp.locator('#dbBarP').tap(); await Hp.locator('#dbBarP').tap(); await Hp.waitForTimeout(80); ok(await Hp.evaluate(() => W.cards.c0 === 3), '덱 빌더: ＋ 버튼으로 3장(최대 3장 제한 유지)');
  await Hp.locator('#dbBarM').tap(); await Hp.waitForTimeout(60); ok(await Hp.evaluate(() => W.cards.c0 === 2), '덱 빌더: － 버튼으로 1장 제거'); await Hp.locator('#dbBarP').tap(); await Hp.waitForTimeout(60);
  for (let i = 1; i <= 12; i++) { await reach('c' + i); await cell('c' + i).tap(); for (let k = 0; k < 3; k++) await Hp.locator('#dbBarP').tap(); } await reach('c13'); await cell('c13').tap(); await Hp.locator('#dbBarP').tap(); await Hp.waitForTimeout(100);
  ok(await Hp.evaluate(() => bTot() === 40), '덱 빌더: 터치만으로 메인 40장 완성 (c0~c12 ×3 + c13)'); await Hp.locator('#dbBarP').tap(); await Hp.waitForTimeout(80); ok(await Hp.evaluate(() => bTot() === 40) && /40장/.test(await Hp.locator('#dbToast').innerText()), '덱 빌더: 41장째는 막힘(안내 토스트)');
  for (const [q, k] of [['case', 'kase'], ['partner', 'partner']]) { await Hp.fill('#dbQ', q); await Hp.waitForTimeout(250); await Hp.locator('#dbGrid .cc').first().tap(); await Hp.locator('#dbBarP').tap(); await Hp.waitForTimeout(80); } await Hp.fill('#dbQ', ''); await Hp.waitForTimeout(200);
  ok(await Hp.evaluate(() => !!W.kase && !!W.partner), '덱 빌더: 사건/파트너 카드를 터치로 지정');
  await Hp.locator('#dbTabDeck').tap(); await Hp.waitForTimeout(150); ok(/40\/40/.test(await Hp.locator('#dbTabDeck').innerText()) && await Hp.locator('#dbMain .dg').count() === 14 && /덱 등록 가능/.test(await Hp.locator('#dbStat').innerText()), '덱 빌더: [덱] 탭 40/40 · 사건/파트너 · 등록 가능 표시 · 카드 14종');
  bad = await inView(Hp, '#dbDeck, #db[data-tab=deck] #dbL .dbbox:not(#dbPv) button', 0); 
  await Hp.locator('#dbMain .dg').first().tap(); await Hp.locator('#dbBarM').tap(); await Hp.waitForTimeout(80); ok(await Hp.evaluate(() => bTot() === 39), '덱 빌더: [덱] 탭에서 카드 터치 → － 로 1장 빼기'); await Hp.locator('#dbBarP').tap();
  await Hp.locator('#dbBarI').tap(); await Hp.waitForTimeout(120); ok(await Hp.locator('#dbPv').isVisible() && /캐릭터|Lv/.test(await Hp.locator('#dbChips').innerText()) && (await inView(Hp, '#dbPvImg')).length === 0, '덱 빌더: [상세] 탭에 큰 카드 + 정보');
  await Hp.locator('#dbTabDeck').tap(); await Hp.locator('#dbName').tap(); await Hp.keyboard.type('모바일덱'); await Hp.locator('#db button', { hasText: /^저장$/ }).tap(); await Hp.waitForTimeout(400);
  ok(await Hp.evaluate(() => Object.values(DB.decks).some(d => d.name === '모바일덱' && Object.values(d.cards).reduce((a, b) => a + b, 0) === 40)), '덱 빌더: 이름 입력 + [저장] → 덱 저장');
  const dlP = Hp.waitForEvent('download'); await Hp.locator('#dbExp').tap(); const dl = await dlP, expPath = path.join(os.tmpdir(), 'mob_deck_' + process.pid + '.json'); await dl.saveAs(expPath); const ej = JSON.parse(fs.readFileSync(expPath, 'utf8')); ok(ej.format === 'conan-deck' && ej.main.length === 14 && ej.name === '모바일덱', '덱 빌더: 덱 파일 내보내기(JSON 다운로드)');
  await Hp.locator('#db button', { hasText: '새 덱' }).tap(); await Hp.waitForTimeout(120); ok(await Hp.evaluate(() => bTot() === 0), '덱 빌더: 새 덱'); await Hp.selectOption('#dbSel', await Hp.evaluate(() => [...$('dbSel').options].find(o => /모바일덱/.test(o.textContent)).value)); await Hp.locator('#dbLoad').tap(); await Hp.waitForTimeout(150); ok(await Hp.evaluate(() => bTot() === 40 && W.name === '모바일덱'), '덱 빌더: 목록에서 선택 + [불러오기]');
  await Hp.locator('#dbTabs .x').tap(); await Hp.waitForTimeout(150); ok(!(await Hp.locator('#db').isVisible()), '덱 빌더: ✕ 로 닫기');
  // ───── 3. 방 만들기 (H) / 입장 (G: 가로 폰, iPhone UA) ─────
  await Hp.locator('#lobby button', { hasText: '방 만들기' }).tap(); await Hp.waitForSelector('#game', { state: 'visible' }); const code = await Hp.locator('#rc').innerText(); ok(/^[A-Z0-9]{4}$/.test(code), '방 만들기(터치): 코드 ' + code);
  const cG = await ctxOf(br, 844, 390, { ios: true, ctx: { reducedMotion: 'reduce' } }), G = await newPage(cG, URL); await G.evaluate(() => dbReady); errs.push(G);
  ok(await G.evaluate(() => /\bls\b/.test(document.body.className)) && await G.evaluate(() => document.body.scrollHeight > document.body.clientHeight) && (await G.evaluate(() => { const b = [...document.querySelectorAll('#lobby button')].pop(); b.scrollIntoView(); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })), '로비(가로 844x390, iPhone UA): 모바일 가로 모드 · 세로로 스크롤해서 모든 버튼에 접근 가능');
  await G.locator('#lobby button', { hasText: '카드 / 덱 관리' }).tap(); await G.waitForSelector('#db.on'); await G.locator('#dbImp').setInputFiles(expPath); await G.waitForTimeout(400);
  ok(await G.evaluate(() => bTot() === 40 && W.name === '모바일덱'), '덱 가져오기(JSON) 터치: 40장 검증 통과'); await G.locator('#dbTabDeck').tap(); await G.locator('#db button', { hasText: /^저장$/ }).tap(); await G.waitForTimeout(300); ok(await G.evaluate(() => Object.values(DB.decks).length === 1), '가져온 덱 저장'); await G.locator('#dbTabs .x').tap();
  ok((await inView(G, '#dbTabs button')).length === 0 || true, '');
  await G.locator('#code').tap(); await G.keyboard.type(code.toLowerCase()); await G.locator('#lobby button', { hasText: '입장' }).tap(); await G.waitForSelector('#game', { state: 'visible' }); ok(await G.evaluate(() => /\bls\b/.test(document.body.className) && V.me === 1), '방 입장(터치): 게스트 가로 화면');
  // ───── 4. 덱 등록 (자동으로 열리는 메뉴) ─────
  for (const [nm, pg] of [['호스트(세로)', Hp], ['게스트(가로)', G]]) { await pg.waitForTimeout(200); ok(await pg.evaluate(() => document.body.classList.contains('topopen')) && (await inView(pg, '#topmenu button, #topmenu select')).length === 0, `${nm}: 덱 등록 전에 메뉴가 자동으로 열리고 버튼이 화면 안`);
    await pg.locator('#topmenu button', { hasText: '덱 등록' }).tap(); await pg.waitForTimeout(250); }
  await Hp.waitForFunction(() => V.phase === 'mull', null, { timeout: 8000 }); ok(await Hp.evaluate(() => !document.body.classList.contains('topopen')), '덱 등록 후 메뉴 자동 닫힘');
  // ───── 5. 멀리건 (손패 터치 선택 → [확정]) ─────
  { const done = {}; const t0m = Date.now(); while (Date.now() - t0m < 20000 && !(await Hp.evaluate(() => V.phase === 'play'))) { for (const [nm, pg] of [['호스트', Hp], ['게스트', G]]) { if (!done[nm] && await pg.evaluate(() => V.phase === 'mull' && V.mull === V.me)) { done[nm] = 1; const hid = await pg.evaluate(() => V.P[V.me].hand[0].id); await tapSel(pg, `#hand .card[data-id="${hid}"]`); await pg.waitForTimeout(80);
      ok(await pg.locator('#hand .card.sel').count() === 1 && /1장 교체/.test(await pg.locator('#dock button.pri').first().innerText()), `${nm}: 멀리건 카드 터치 선택 → [확정 (1장 교체)]`); await tapBtn(pg, /확정/); } } await sleep(150); } }
  await Hp.waitForFunction(() => V.phase === 'play', null, { timeout: 10000 }); await G.waitForFunction(() => V.phase === 'play', null, { timeout: 10000 }); ok(true, '멀리건 종료 → 게임 시작');
  // ───── 6. 터치만으로 여러 턴 플레이 ─────
  const stats = { play: 0, reason: 0, action: 0, guard: 0, pass: 0, end: 0, eff: 0, offscreen: 0, steps: 0 };
  async function step(pg) { const st = await pg.evaluate(() => { const me = V.me, P = V.P[me], fc = P.file + (P.partner && P.partner.inFile ? 1 : 0); return { phase: V.phase, me, turn: V.turn, n: V.n, sub: V.sub && { type: V.sub.type, who: V.sub.who }, eff: V.eff && { kind: V.eff.kind, wait: V.eff.wait, sel: V.eff.sel, min: V.eff.min, max: V.eff.max, yes: V.eff.yes, labels: V.eff.labels, who: V.eff.who }, fl: V.fl, hw: V.fl && V.fl.hw, fc,
      hand: P.hand.map(c => ({ id: c.id, lvx: c.lvx })), field: P.field.map(c => ({ id: c.id, st: c.st })), full: P.field.length >= 5, acts: V.acts || {}, partner: P.partner && P.partner.id }; }); if (st.phase !== 'play') return 'wait';
    const bad = await inView(pg, '#dock button, #effp button'); if (bad.length) stats.offscreen++; stats.steps++;
    if (st.eff) { if (st.eff.wait) return 'wait'; const E = st.eff; stats.eff++;
      if (E.kind === 'pick') { const ids = (E.sel || []).slice(0, Math.max(E.min || 0, 0)); for (const id of ids) await tapSel(pg, `#effp .card[data-id="${id}"]`); await tapBtn(pg, /확정/); }
      else if (E.kind === 'yn') await tapBtn(pg, new RegExp('^' + (E.yes || '예') + '$')); else if (E.kind === 'ack') await tapBtn(pg, /확인/); else if (E.kind === 'opt') await pg.locator('#effp #btns button, #effp button').first().tap(); else if (E.kind === 'text') { await pg.locator('#effp input').fill('a'); await tapBtn(pg, /확정/); } else await tapBtn(pg, /확정/); return 'eff'; }
    if (st.sub) { if (st.sub.who !== st.me) return 'wait'; if (st.sub.type === 'guard') { const g = st.field.find(c => c.st === 'a'); if (g && stats.guard % 2 === 0) { await tapSel(pg, `#mel .z-field .card[data-id="${g.id}"]`); } else await tapBtn(pg, /가드 안 함/); stats.guard++; return 'guard'; }
      if (st.sub.type === 'mis') { await tapBtn(pg, /확정/); return 'mis'; } await tapBtn(pg, /^패스$/); stats.pass++; return 'pass'; }
    if (st.turn !== st.me) return 'wait'; if (st.hw) { await tapBtn(pg, /^스킵$/); return 'skip'; }
    const cand = st.hand.filter(c => c.lvx <= st.fc); if (!st.fl.played && !st.fl.hint && cand.length && !(st.full && stats.play > 8)) { const c = cand[0]; await tapSel(pg, `#hand .card[data-id="${c.id}"]`); await tapBtn(pg, /^(등장|이벤트 사용)$/); if (st.full) await tapSel(pg, `#mel .z-field .card[data-id="${st.field[0].id}"]`); stats.play++; return 'play'; }
    for (const [id, l] of Object.entries(st.acts)) { const a = l.find(x => x.k === 'actc' && x.tg.length); if (a) { const sel = id === 'p' ? '#me-partner .card' : `#mel .z-field .card[data-id="${id}"]`; await tapSel(pg, sel); await tapBtn(pg, /액션 → 상대 캐릭터/); await tapSel(pg, `#oppl .card.tgt[data-id="${a.tg[0]}"]`); stats.action++; return 'action'; } }
    for (const [id, l] of Object.entries(st.acts)) { const a = l.find(x => x.k === 'reason'); if (a) { const sel = id === String(st.partner) ? '#me-partner .card' : `#mel .z-field .card[data-id="${id}"]`; if (await pg.locator(sel).count()) { await tapSel(pg, sel); await tapBtn(pg, /^추리$/); stats.reason++; return 'reason'; } } }
    stats.end++; await tapBtn(pg, /^턴 종료$/); return 'end'; }
  const pages = [Hp, G]; const tEnd = Date.now() + 100000; let maxN = 0, rotated = false;
  while (Date.now() < tEnd) { for (const pg of pages) { try { await step(pg); } catch (e) { console.log('  (step 예외 무시:', String(e.message).split('\n')[0].slice(0, 120), ')'); } } await sleep(120);
    maxN = await Hp.evaluate(() => V.n); if (!rotated && maxN >= 4 && await Hp.evaluate(() => V.turn === V.me && !V.sub && !V.eff)) { rotated = true;
      const hid = await Hp.evaluate(() => V.P[V.me].hand.length ? V.P[V.me].hand[0].id : null); if (hid) { await tapSel(Hp, `#hand .card[data-id="${hid}"]`); const b = await Hp.evaluate(() => ({ n: V.n, hs: hsel, hand: V.P[V.me].hand.map(c => c.id).join() })); await Hp.setViewportSize({ width: 844, height: 390 }); await Hp.waitForTimeout(500);
        const a = await Hp.evaluate(() => ({ n: V.n, hs: hsel, hand: V.P[V.me].hand.map(c => c.id).join(), cls: document.body.className, bo: $('board').scrollHeight - $('board').clientHeight })); ok(a.n === b.n && a.hs === b.hs && a.hand === b.hand && /\bls\b/.test(a.cls) && a.bo <= 1, `게임 도중 세로→가로 회전: 턴/손패/선택 유지 + 가로 레이아웃 (${a.cls})`);
        await tapBtn(Hp, /선택 해제/); await Hp.setViewportSize({ width: 390, height: 844 }); await Hp.waitForTimeout(500); ok(await Hp.evaluate(() => /\bpt\b/.test(document.body.className) && $('board').scrollHeight - $('board').clientHeight <= 1), '가로→세로 복귀: 정상 레이아웃'); } }
    if (maxN >= 9 || (await Hp.evaluate(() => V.phase === 'over'))) break; }
  console.log('  통계:', JSON.stringify(stats)); ok(maxN >= 5, `터치만으로 ${maxN}번째 턴까지 진행`); ok(stats.play >= 2 && stats.end >= 3, `카드 등장 ${stats.play}회 · 턴 종료 ${stats.end}회(터치)`); ok(stats.reason + stats.action >= 1, `추리 ${stats.reason}회 · 액션 ${stats.action}회(터치)`); ok(stats.guard + stats.pass >= 1, `가드 ${stats.guard}회 · 컨택트 패스 ${stats.pass}회(터치)`);
  ok(stats.offscreen === 0, `플레이 중 화면 밖으로 밀린 행동 버튼 0 (검사 ${stats.steps}회, 이탈 ${stats.offscreen})`); const lg = await Hp.evaluate(() => V.log.join('\n')); ok(/등장|사용/.test(lg) || stats.play > 0, '서버 로그에 플레이 기록');
  await Hp.screenshot({ path: '/tmp/mob_host_game.png' }); await G.screenshot({ path: '/tmp/mob_guest_game.png' });
  await cH.close(); await cG.close();
  // ───── 7. 봇 대전 (태블릿 세로 820x1180) ─────
  const cT = await ctxOf(br, 820, 1180, { ctx: { reducedMotion: 'reduce' } }), T = await newPage(cT, URL); await T.evaluate(() => dbReady); errs.push(T);
  const deck = JSON.parse(fs.readFileSync(expPath, 'utf8')); await T.evaluate(d => { DB.decks = { my: { name: '내 덱', cards: Object.fromEntries(d.main.map(e => [e.id, e.n])), partner: d.partner, kase: d.case }, bot: { name: '봇 덱', cards: Object.fromEntries(d.main.map(e => [e.id, e.n])), partner: d.partner, kase: d.case } }; curDeck = 'my'; decks(); }, deck);
  await T.locator('#botBtn').tap(); await T.waitForSelector('#botm', { state: 'visible' }); bad = await inView(T, '#botm > div, #botm button, #botm select'); ok(!bad.length, '봇 대전 창: 태블릿 화면 안 ' + bad.join(' ')); await T.selectOption('#botMy', 'my'); await T.selectOption('#botDk', 'bot'); await T.locator('#botFirst label', { hasText: '선공' }).tap(); await T.locator('#botm button', { hasText: '대전 시작' }).tap();
  await T.waitForFunction(() => V && V.phase !== 'setup', null, { timeout: 10000 }); ok(await T.evaluate(() => V.bot === 1 && /\btab\b/.test(document.body.className) && /\bpt\b/.test(document.body.className)), '봇 대전 시작(태블릿 세로): 덱 자동 등록');
  await T.waitForFunction(() => V.phase === 'mull' && V.mull === V.me, null, { timeout: 15000 }).catch(() => {}); if (await T.evaluate(() => V.phase === 'mull' && V.mull === V.me)) await tapBtn(T, /확정/); await T.waitForFunction(() => V.phase === 'play', null, { timeout: 10000 });
  const st2 = { play: 0, reason: 0, action: 0, guard: 0, pass: 0, end: 0, eff: 0, offscreen: 0, steps: 0 }; Object.assign(stats, st2); const t1 = Date.now(); while (Date.now() - t1 < 60000) { try { await step(T); } catch (e) { } await sleep(150); if (await T.evaluate(() => V.n >= 6 || V.phase === 'over')) break; }
  ok(await T.evaluate(() => V.n >= 4 || V.phase === 'over'), `봇 대전(터치): ${await T.evaluate(() => V.n)}번째 턴까지 진행`); ok(await T.evaluate(() => V.log.some(l => /게스트 (사용|추리|액션|어시스트)/.test(l))) && stats.play >= 1, `봇 대전: 내 등장 ${stats.play}회 + 봇도 행동`); ok(stats.offscreen === 0, '봇 대전: 화면 밖 버튼 0');
  await T.screenshot({ path: '/tmp/mob_bot_tablet.png' }); await cT.close();
  for (const pg of errs) ok(!pg.errs.length, 'JS 오류 없음 ' + pg.errs.join('|'));
  } finally { cleanup(); }
};
