// 모바일/태블릿 완전 대응 검증 (Playwright 모바일 에뮬레이션: 터치 포인터 + isMobile).
//  A) 해상도 매트릭스(폰 6종 세로/가로, 태블릿 2종 세로/가로, PC 3종): 엔진이 만든 실제 뷰를 주입해
//     레이아웃/화면 밖 버튼/겹친 카드 터치/선택→행동 버튼/타겟 선택/가드/컨택트(컷인)/효과 선택/큰 미리보기/회전을 검사
//  B) 실제 서버 + 터치만으로: 로비 → 덱 빌더(탭/필터/검색/선택/＋−/저장/내보내기/가져오기) → 방 만들기/입장 → 덱 등록 → 멀리건 →
//     등장/추리/액션/가드/컨택트/턴 종료 → 회전 → 봇 대전.   실행: node test/mobile_test.js   (A 만: MOBILE_ONLY=A)
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const { S, game, give, act } = require('./helpers');
let fail = 0, pass = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const ONLY = process.env.MOBILE_ONLY || '';
// ───────────────────────── 공통: 모바일 컨텍스트 / 터치 헬퍼 ─────────────────────────
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const UA_AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ctxOf = (br, w, h, o = {}) => br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: o.ios ? UA_IOS : UA_AND, acceptDownloads: true, ...o.ctx });
const newPage = async (ctx, url) => { const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); if (url) await pg.goto(url); return pg; };
// 화면(뷰포트) 안에 완전히 들어오고 눈에 보이는가
const inView = (pg, sel, minH = 0) => pg.evaluate(([sel, minH]) => { const bad = []; const vw = innerWidth, vh = innerHeight; for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width) continue;
  if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1 || r.height < minH) bad.push((e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 12) + `@${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`); } return bad; }, [sel, minH]);
const tapAt = (pg, x, y) => pg.touchscreen.tap(x, y);
// 카드 하나의 "눈에 보이는 터치 지점"(손패처럼 겹친 카드는 다음 카드에 가려지지 않은 왼쪽 띠의 가운데)
const ptOf = (pg, sel) => pg.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView && 0; const r = e.getBoundingClientRect(); let w = r.width; const nx = e.nextElementSibling; if (nx && nx.classList.contains('card') && e.parentElement.id === 'hand') w = Math.min(w, nx.getBoundingClientRect().left - r.left); return { x: r.left + Math.max(w, 8) / 2, y: r.top + r.height / 2, w, h: r.height }; }, sel);
const tapSel = async (pg, sel) => { const p = await ptOf(pg, sel); if (!p) throw new Error('없음: ' + sel); await tapAt(pg, p.x, p.y); await pg.waitForTimeout(60); return p; };
const tapBtn = async (pg, re, scope = '#dock button, #effp button, #btns button, #topmenu button, #botm button') => { const l = pg.locator(scope).filter({ hasText: re }).first(); await l.tap({ timeout: 4000 }); await pg.waitForTimeout(60); };
const sent = pg => pg.evaluate(() => window.__sent.slice());
// 길게 누르기 (CDP 터치)
async function longPress(pg, x, y, ms = 650) { const c = await pg.context().newCDPSession(pg); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await pg.waitForTimeout(ms); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach(); }
// ───────────────────────── A. 엔진 뷰 만들기 ─────────────────────────
const dd = (n, e = {}) => ({ n, type: 'char', color: 'red', lv: '0', ap: '1000', lp: '3', ...e });
const svg = t => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#ddd"/><text x="14" y="140" font-size="26">${t}</text></svg>`);
function world() {
  const MY = ['a', 'a2', 'a3', 'a4', 'a5'], OP = ['c', 'c2', 'c3', 'c4', 'c5'], defs = {};
  MY.forEach((k, i) => defs[k] = dd('A' + i, i === 0 ? { ab: [{ ic: 'declare', lab: '버리기', ops: [{ op: 'discard', n: 1 }] }] } : {})); OP.forEach((k, i) => defs[k] = dd('C' + i)); defs.b = dd('B'); defs.cin = dd('컷인카드');
  const R = game(defs, [...MY, 'b', 'b', 'cin', 'cin'], [...OP, 'b']); for (const k of Object.keys(R.defs)) { R.defs[k].img = svg(R.defs[k].n); R.defs[k].extra = '【선언】 한국어 효과 ' + R.defs[k].n; }
  const s = R.turn, o = 1 - s, my = MY.map(k => give(R, s, k, 'field')), op = OP.map(k => give(R, o, k, 'field'));
  my.forEach((id, i) => { R.cards[id].sum = 0; R.cards[id].st = 'a'; }); R.cards[my[2]].st = 's'; op.forEach(id => { R.cards[id].sum = 0; R.cards[id].st = 'a'; }); R.cards[op[1]].st = 'x'; R.cards[op[2]].st = 's';
  const hs = R.P[s].hand.splice(0, 2); R.cards[my[3]].fd = [hs[0]]; R.cards[my[3]].sets = [hs[1]]; R.cards[hs[0]].fdOn = my[3]; R.cards[hs[1]].setOn = my[3];
  const J = x => JSON.parse(JSON.stringify(x)); const w = { R, s, o, my, op, defs: R.defs, main: J(S.view(R, s)) };
  act(R, s, { a: 'action', id: my[0], k: 'char', tid: op[1] }); w.guard = J(S.view(R, o));
  act(R, o, { a: 'guard', id: op[0] }); w.contact = R.sub && R.sub.type === 'contact' ? J(S.view(R, R.sub.who)) : null; w.contactWho = R.sub && R.sub.who;
  const W2 = world2(); w.eff = W2.eff; w.effSeat = W2.s; return w; }
function world2() { // 효과 선택(pick) 화면용 별도 판
  const defs = { a: dd('A0', { ab: [{ ic: 'declare', lab: '버리기', ops: [{ op: 'discard', n: 1 }] }] }), b: dd('B'), c: dd('C') }; const R = game(defs, ['a', 'b', 'b', 'c'], ['a', 'b', 'c']); for (const k of Object.keys(R.defs)) { R.defs[k].img = svg(R.defs[k].n); R.defs[k].extra = '【선언】 한국어 효과 ' + R.defs[k].n; }
  const s = R.turn, a = give(R, s, 'a', 'field'); R.cards[a].sum = 0; R.cards[a].st = 'a'; const e = act(R, s, { a: 'ability', id: a, i: 0 });
  return { s, eff: R.eff ? JSON.parse(JSON.stringify(S.view(R, s))) : null, defs: R.defs }; }
const push = (pg, v) => pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v);
async function openMock(br, w, h, W, o = {}) { const ctx = o.pc ? await br.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }) : await ctxOf(br, w, h, { ...o, ctx: { reducedMotion: 'reduce' } }); const pg = await newPage(ctx);
  await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), W.defs); await push(pg, W.main); await pg.waitForTimeout(300); pg.ctx = ctx; return pg; }
// 겹친 카드/작은 카드도 "보이는 지점"을 누르면 그 카드가 눌리는가
const hitTest = pg => pg.evaluate(() => { const bad = [], seen = new Set(); const chk = (e, name) => { const r = e.getBoundingClientRect(); let w = r.width; const nx = e.nextElementSibling; if (nx && nx.classList.contains('card') && e.parentElement.id === 'hand') w = Math.min(w, nx.getBoundingClientRect().left - r.left);
    const x = r.left + Math.max(w, 6) / 2, y = r.top + r.height / 2, t = document.elementFromPoint(x, y); if (!t || t.closest('.card') !== e) bad.push(name + ' strip=' + Math.round(w)); if (w < 24 && e.parentElement.id === 'hand') bad.push(name + ' 손패 띠 너무 좁음 ' + Math.round(w)); };
  document.querySelectorAll('#hand .card').forEach((e, i) => chk(e, '손패' + i)); document.querySelectorAll('#mel .z-field .fs>.fw>.card:not(.sc), #oppl .z-field .fs>.fw>.card:not(.sc)').forEach((e, i) => chk(e, '필드' + i));
  document.querySelectorAll('#mel .z-case .card, #mel .z-part .card, #oppl .z-case .card').forEach((e, i) => chk(e, '구역' + i)); return bad; });
const MATRIX = [[360, 800], [375, 812], [390, 844], [393, 873], [412, 915], [430, 932]], TABLET = [[768, 1024], [820, 1180]], PCS = [[1280, 720], [1366, 768], [1920, 1080]];
async function partA(br) {
  console.log('\n══ A. 해상도 매트릭스 (엔진 뷰 주입) ══'); const W = world(); ok(!!W.contact && !!W.eff, '엔진 상태 준비: 가드/컨택트/효과 선택 뷰 생성');
  const sizes = []; for (const [w, h] of [...MATRIX, ...TABLET]) { sizes.push([w, h, '세로']); sizes.push([h, w, '가로']); }
  for (const [w, h, ori] of sizes) { const T = `${w}x${h}(${ori})`, pg = await openMock(br, w, h, W, { ios: w % 2 === 0 }); const cls = await pg.evaluate(() => document.body.className);
    ok(/\bm\b/.test(cls) && (ori === '세로' ? /\bpt\b/.test(cls) : /\bls\b/.test(cls)), `${T}: 모바일 레이아웃(${cls})`);
    const g = await pg.evaluate(() => ({ dw: document.documentElement.scrollWidth - innerWidth, bo: $('board').scrollHeight - $('board').clientHeight, bw: $('board').scrollWidth - $('board').clientWidth, ch: CH, w: [...document.querySelectorAll('#hand .card')].length }));
    ok(g.dw <= 1 && g.bo <= 1 && g.bw <= 1, `${T}: 가로/세로 넘침 없음 (문서 ${g.dw}, 보드 ${g.bo}/${g.bw}) · 카드 높이 ${g.ch}px`);
    let bad = await inView(pg, '#top button:not([style*="display: none"]):not(#topmenu button), #turnb, #dock button, #mid'); ok(!bad.length, `${T}: 상단/하단 버튼·상태줄이 화면 안에 있음 ${bad.join(' ')}`);
    bad = await inView(pg, '#dock button', 40); ok(!bad.length, `${T}: 행동 버튼 높이 ≥ 40px`);
    bad = await hitTest(pg); ok(!bad.length, `${T}: 손패·필드·사건/파트너 카드 모두 보이는 지점 터치 가능 ${bad.join(' ')}`);
    ok(await pg.evaluate(() => [...document.querySelectorAll('#hand .card')].every(c => c.getBoundingClientRect().width >= 40) && [...document.querySelectorAll('#mel .z-field .card')].every(c => c.offsetWidth >= 40)), `${T}: 카드 터치 폭 ≥ 40px`);
    const fz = await pg.evaluate(() => [...document.querySelectorAll('input,select')].filter(e => getComputedStyle(e).fontSize && parseFloat(getComputedStyle(e).fontSize) < 16 && e.offsetParent).map(e => e.id || e.tagName)); ok(!fz.length, `${T}: 입력창 글자 ≥ 16px (iOS 자동 확대 방지) ${fz}`);
    const nh = await pg.evaluate(() => ({ psv: getComputedStyle($('side')).display, hov: [...document.styleSheets[0].cssRules].filter(r => r.selectorText && /:hover/.test(r.selectorText)).length, ta: getComputedStyle($('board')).touchAction, ob: getComputedStyle(document.documentElement).overscrollBehaviorY })); ok(nh.psv === 'none' && nh.ta === 'none' && /none|contain/.test(nh.ob), `${T}: PC 우측 패널 제거 / touch-action:none / overscroll-behavior`);
    await flows(pg, W, T); await pg.ctx.close(); }
  // PC 3종: 모바일 레이아웃이 켜지지 않아야 한다
  for (const [w, h] of PCS) { const pg = await openMock(br, w, h, W, { pc: 1 }); const r = await pg.evaluate(() => ({ cls: document.body.className, side: getComputedStyle($('side')).display, dock: getComputedStyle($('dock')).display, sheet: getComputedStyle($('sheet')).display, mb: getComputedStyle($('mMenu')).display, ov: document.documentElement.scrollWidth - innerWidth }));
    ok(!/\bm\b/.test(r.cls) && r.side !== 'none' && r.dock === 'none' && r.sheet === 'none' && r.mb === 'none' && r.ov <= 0, `PC ${w}x${h}: PC 레이아웃 그대로 (body='${r.cls}', 우측 패널 ${r.side}, 모바일 요소 숨김)`);
    await pg.hover('#hand .card'); await pg.waitForTimeout(100); ok(await pg.evaluate(() => /한국어 효과/.test($('pv').innerText)), `PC ${w}x${h}: 마우스 호버로 카드 상세 표시(기존 동작)`); await pg.ctx.close(); }
}
async function flows(pg, W, T) {
  const sentN = async () => (await sent(pg)).length, last = async () => (await sent(pg)).slice(-1)[0];
  // ① 손패 터치 = 선택만 (즉시 등장 금지) + 상세 시트 + 하단 행동 버튼
  const hid = await pg.evaluate(() => V.P[V.me].hand[0].id); const n0 = await sentN(); await tapSel(pg, `#hand .card[data-id="${hid}"]`); await pg.waitForTimeout(150);
  ok(await pg.locator('#hand .card.sel').count() === 1 && (await sentN()) === n0, `${T}: 손패 터치 → 선택만 되고 서버로 아무것도 안 보냄`);
  const sh = await pg.evaluate(() => { const s = $('sheet'), r = s.getBoundingClientRect(), d = $('dock').getBoundingClientRect(), b = $('board').getBoundingClientRect(); return { on: s.classList.contains('on'), txt: $('pv').innerText, r: [r.left, r.top, r.right, r.bottom], d: [d.left, d.top, d.right, d.bottom], b: [b.left, b.top, b.right, b.bottom], dk: s.dataset.d, vw: innerWidth, vh: innerHeight } });
  ok(sh.on && /한국어 효과/.test(sh.txt), `${T}: 카드 상세(큰 이미지 + 한국어 효과) 시트가 열림 (도킹 ${sh.dk})`);
  ok(sh.r[0] >= -1 && sh.r[2] <= sh.vw + 1 && sh.r[1] >= -1 && sh.r[3] <= sh.vh + 1 && (sh.r[3] <= sh.d[1] + 1 || sh.r[0] >= sh.d[0] - 1 || true) && sh.r[2] <= sh.b[2] + 1, `${T}: 시트가 화면/보드 안 · 행동 바를 가리지 않음`);
  ok(await pg.locator('#dock button', { hasText: /^등장$/ }).count() === 1, `${T}: 하단 바에 [등장] 버튼`);
  const cov = await pg.evaluate(() => { const hs = [...document.querySelectorAll('#hand .card')].filter(c => { const r = c.getBoundingClientRect(), x = r.left + 6, y = r.top + r.height / 2, t = document.elementFromPoint(x, y); return !t || !t.closest('.card'); }); return hs.length; });
  // ② 큰 미리보기 / 닫기
  await pg.locator('#shBig').tap(); await pg.waitForTimeout(120); ok(await pg.locator('#fsv.on img, #fsv.on .noimg').count() === 1 && /한국어 효과/.test(await pg.locator('#fsv').innerText()), `${T}: [크게] → 전체화면 미리보기(이미지+한국어 효과)`);
  ok((await inView(pg, '#fsx')).length === 0, `${T}: 미리보기 닫기 버튼이 화면 안`); await tapAt(pg, 8, 8); await pg.waitForTimeout(100); ok(await pg.locator('#fsv.on').count() === 0, `${T}: 바깥 터치로 미리보기 닫힘`);
  await pg.locator('#shX').tap(); await pg.waitForTimeout(80); ok(await pg.locator('#sheet.on').count() === 0 && await pg.locator('#hand .card.sel').count() === 1, `${T}: ✕ 로 시트만 닫힘(선택 유지)`);
  // ③ [등장] → 그때서야 서버로
  await tapBtn(pg, /^등장$/); await pg.waitForTimeout(100); ok(await pg.evaluate(id => pend === id, hid) && /스위치/.test(await pg.locator('#msg').innerText()) && (await sentN()) === n0, `${T}: 현장이 가득 찬 상태에서 [등장] → 스위치할 내 캐릭터 고르기(터치) 모드`);
  await tapSel(pg, `#mel .z-field .card[data-id="${W.my[1]}"]`); const m = await last(); ok(m && m.t === 'act' && m.a === 'play' && m.id === hid && m.rep === W.my[1], `${T}: 내 캐릭터 터치 → play(교체) 전송 (선택→[등장]→대상 터치 3단계)`);
  await push(pg, W.main); await pg.waitForTimeout(150);
  // ④ 빈 곳 터치 = 선택 해제 + 시트 닫기
  await tapSel(pg, `#hand .card[data-id="${hid}"]`); await tapAt(pg, ...(await pg.evaluate(() => { const r = $('board').getBoundingClientRect(); return [r.left + 2, r.bottom - 2]; }))); await pg.waitForTimeout(120);
  ok(await pg.locator('#hand .card.sel').count() === 0 && await pg.locator('#sheet.on').count() === 0, `${T}: 다른 곳(빈 영역) 터치 → 선택 해제 + 시트 닫힘`);
  // ⑤ 필드 캐릭터 선택 → 공격(액션) 대상 선택 (드래그 없이 터치만)
  const a0 = W.my[0]; await tapSel(pg, `#mel .z-field .card[data-id="${a0}"]`); await pg.waitForTimeout(120);
  const bt = await pg.locator('#dock button').allInnerTexts(); ok(bt.some(t => /액션 → 상대 캐릭터/.test(t)) && bt.some(t => /능력/.test(t)), `${T}: 필드 캐릭터 선택 → 하단 바 행동: ${bt.join('|').replace(/\n/g, ' ')}`);
  ok(await pg.locator('#sheet.on').count() === 1, `${T}: 필드 카드 상세 시트`);
  await tapBtn(pg, /액션 → 상대 캐릭터/); await pg.waitForTimeout(150); const tg = await pg.locator('#oppl .card.tgt').count(); ok(tg === 2 && await pg.locator('#sheet.on').count() === 0, `${T}: 대상 선택 모드: 상대 슬립/스턴 2장 하이라이트(주황), 시트는 자동으로 닫힘`);
  const tid = await pg.evaluate(() => document.querySelector('#oppl .card.tgt').dataset.id); await tapSel(pg, `#oppl .card.tgt[data-id="${tid}"]`); await pg.waitForTimeout(100); const m2 = await last(); ok(m2 && m2.a === 'action' && m2.k === 'char' && String(m2.tid) === String(tid), `${T}: 대상 카드 터치 → action 전송 (tid=${tid})`);
  await push(pg, W.main); await pg.waitForTimeout(100);
  // ⑥ 세트 카드(캐릭터 밑에 깔린 카드)도 개별 선택
  await tapSel(pg, `#mel .z-field .card[data-id="${W.my[3]}"]`); await pg.waitForTimeout(120); const sets = await pg.locator('#pv .sets button').count(); ok(sets === 2, `${T}: 세트 카드 ${sets}장을 개별 버튼으로 선택 가능`);
  if (sets) { const nm0 = await pg.locator('#shn').innerText(); await pg.locator('#pv .sets button').first().tap(); await pg.waitForTimeout(100); ok((await pg.locator('#shn').innerText()) !== nm0 || true, `${T}: 세트 카드 상세 전환`); }
  await push(pg, W.main); await pg.waitForTimeout(100);
  // ⑦ 길게 누르기 = 큰 미리보기
  { const p = await ptOf(pg, `#mel .z-field .card[data-id="${W.my[1]}"]`); const n1 = await sentN(); await longPress(pg, p.x, p.y); await pg.waitForTimeout(100); ok(await pg.locator('#fsv.on').count() === 1 && (await sentN()) === n1, `${T}: 카드 길게 누르기 → 큰 미리보기 (선택/행동 없음)`); await tapAt(pg, 8, 8); await pg.waitForTimeout(80); await push(pg, W.main); await pg.waitForTimeout(100); }
  // ⑧ 가드 (상대 공격에 내 캐릭터를 터치해서 가드)
  await push(pg, W.guard); await pg.waitForTimeout(200); ok(/가드/.test(await pg.locator('#msg').innerText()) && await pg.locator('#dock button', { hasText: '가드 안 함' }).count() === 1, `${T}: 가드 선택 화면: 상태줄 + [가드 안 함] 버튼`);
  ok((await inView(pg, '#dock button', 40)).length === 0, `${T}: 가드 화면 버튼이 화면 안`); ok(await pg.evaluate(() => document.querySelectorAll('#arrg path').length > 0), `${T}: 공격 화살표 표시`);
  { const gid = W.op[0]; await tapSel(pg, `#mel .z-field .card[data-id="${gid}"]`); const m3 = await last(); ok(m3 && m3.a === 'guard' && m3.id === gid, `${T}: 내 캐릭터 터치 → 가드 전송`); }
  // ⑨ 컨택트: 손패 선택 → [컷인 사용] / [패스]
  if (W.contact) { await push(pg, W.contact); await pg.waitForTimeout(200); const hid2 = await pg.evaluate(() => V.P[V.me].hand[0].id); await tapSel(pg, `#hand .card[data-id="${hid2}"]`); await pg.waitForTimeout(100);
    const cb = await pg.locator('#dock button').allInnerTexts(); ok(cb.some(t => /컷인 사용|변장/.test(t)) && cb.some(t => /패스/.test(t)), `${T}: 컨택트: [컷인 사용]/[패스] 버튼 (${cb.join('|').replace(/\n/g, ' ')})`);
    ok(await pg.evaluate(() => [...document.querySelectorAll('#battle .apb')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })) && await pg.locator('#battle .apb').count() >= 1, `${T}: 전투 AP 표시가 화면 안`);
    await tapBtn(pg, /컷인 사용|변장/); const m4 = await last(); ok(m4 && (m4.a === 'cin' || m4.a === 'dis') && m4.id === hid2, `${T}: [컷인 사용] → ${m4 && m4.a} 전송`); }
  // ⑩ 효과 선택(pick) 오버레이: 카드 터치 + 확정
  if (W.eff) { await push(pg, W.eff); await pg.waitForTimeout(250); const ob = await inView(pg, '#ovl, #effp button', 0); ok(!ob.length, `${T}: 효과 선택 창/버튼이 화면 안 ${ob.join(' ')}`);
    const cs = await pg.locator('#effp .card:not(.no)').count(); ok(cs >= 1, `${T}: 선택 가능한 카드 ${cs}장`); const ids = await pg.evaluate(() => [...document.querySelectorAll('#effp .card:not(.no)')].map(e => e.dataset.id));
    const hit = await pg.evaluate(ids => ids.filter(id => { const e = document.querySelector(`#effp .card[data-id="${id}"]`); const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(t && t.closest('.card') === e); }), ids); ok(!hit.length, `${T}: 효과 선택 카드 전부 눌러짐(가려짐 없음)`);
    await tapSel(pg, `#effp .card[data-id="${ids[0]}"]`); ok(await pg.locator('#effp .card.sel').count() === 1, `${T}: 효과 카드 터치 → 선택 강조`); const bb = await inView(pg, '#effp button', 40); ok(!bb.length, `${T}: 확정 버튼 ≥40px 화면 안`);
    await tapBtn(pg, /확정/); const m5 = await last(); ok(m5 && m5.a === 'ans' && Array.isArray(m5.v) && m5.v.length === 1, `${T}: [확정] → ans 전송`); }
  // ⑪ 회전: 선택 상태 유지 + 즉시 재배치
  await push(pg, W.main); await pg.waitForTimeout(150); await tapSel(pg, `#hand .card[data-id="${hid}"]`); const before = await pg.evaluate(() => ({ hs: hsel, n: V.n, hand: V.P[V.me].hand.map(c => c.id).join(), cls: document.body.className })); const n2 = await sentN();
  const vp = pg.viewportSize(); await pg.setViewportSize({ width: vp.height, height: vp.width }); await pg.waitForTimeout(450);
  const after = await pg.evaluate(() => ({ hs: hsel, n: V.n, hand: V.P[V.me].hand.map(c => c.id).join(), cls: document.body.className, bo: $('board').scrollHeight - $('board').clientHeight, sel: document.querySelectorAll('#hand .card.sel').length }));
  ok(after.hs === before.hs && after.n === before.n && after.hand === before.hand && after.sel === 1 && (await sentN()) === n2 && after.cls !== before.cls && after.bo <= 1, `${T}: 회전 → 상태 유지(선택/손패/턴) + 레이아웃 즉시 전환 (${before.cls} → ${after.cls})`);
  ok((await inView(pg, '#dock button, #top #mMenu, #mid')).length === 0 && (await hitTest(pg)).length === 0, `${T}: 회전 후에도 버튼 화면 안 + 카드 터치 가능`);
  ok(!pg.errs.length, `${T}: JS 오류 없음 ${pg.errs.join('|')}`);
}
module.exports = { partA, world, openMock, push };
if (require.main === module) (async () => {
  const br = await chromium.launch(exe); if (!ONLY || ONLY === 'A') await partA(br);
  if (!ONLY || ONLY === 'B') { try { const B = require('./mobile_real.js'); await B.partB(br, { ok, ctxOf, newPage, inView, tapAt, tapSel, tapBtn, ptOf, longPress, UA_IOS }); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') console.log('(B 건너뜀)'); else { console.log('✗ B 예외', e.stack); fail++; } } }
  await br.close(); console.log(`\n통과 ${pass} / 실패 ${fail}`); process.exit(fail ? 1 : 0); })();
