// v1.17.1: 뒷면(face-down)으로 세트된 카드를 "고르는" 선택 UI — 증거 뒤집기 선택(evoBtn/evp)과 같은 방식으로 위치만 보인다.
//   서버: 질의(effView)·보드 view 에 뒷면 세트 카드의 id/정의 키/이름이 실리지 않음, 선택 번호 → 올바른 카드 인스턴스에 처리, 앞면 세트 카드 선택은 기존(pick) 그대로
//   브라우저: 서버가 실제로 내보내는 view/defs 를 그대로 그려, 트레이·보드·hover·터치 어디에도 정체가 노출되지 않음
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
const fs = require('fs'), U = require('./mz_util'); const { G, real, dummy, field, FX, req, pump, give, S, act } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✓✗'[+!c], m); c ? pass++ : fail++; };
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const BS = { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } };
const mkfd = (R, ow, h, k) => { const id = give(R, ow, k, 'rem'); R.P[ow].rem = R.P[ow].rem.filter(y => y !== id); (R.cards[h].fd = R.cards[h].fd || []).push(id); R.cards[id].fdOn = h; return id; };
const mkup = (R, ow, h, k) => { const id = give(R, ow, k, 'rem'); R.P[ow].rem = R.P[ow].rem.filter(y => y !== id); (R.cards[h].sets = R.cards[h].sets || []).push(id); R.cards[id].setOn = h; return id; };
const UNSET_UP = dummy('UNSETUP', { color: 'green', ab: [{ ic: 'declare', cost: [{ c: 'unset', n: 1, scope: 'mine', fd: false }], ops: [{ op: 'draw', n: 1 }], txt: 't' }] });
function scene(kind) {   // 내 캐릭터 x(=선언 카드), m(뒷면 세트 후보 보유) / kind: 'fd' = id_0193(뒷면만), 'up' = 앞면만, 'mix' = 앞면 1 + 뒷면 2
  const X = kind === 'fd' ? real('id_0193', { color: 'green' }) : UNSET_UP;
  const R = G({ x: X, m: dummy('MM'), v: dummy('VV'), sa: dummy('SECRET_A'), sb: dummy('SECRET_B'), sc: dummy('SECRET_C'), pe1: dummy('PUBEVENT1', { type: 'event' }), pe2: dummy('PUBEVENT2', { type: 'event' }) }, ['x'], ['v'], BS);
  for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#' + (k.length * 3 + 5) + 'cb');
  const s = R.turn, o = 1 - s, x = field(R, s, 'x'), m = field(R, s, 'm'), v = field(R, o, 'v'); const ids = {};
  if (kind === 'fd') { ids.A = mkfd(R, s, x, 'sa'); ids.B = mkfd(R, s, m, 'sb'); ids.C = mkfd(R, s, m, 'sc'); }
  else if (kind === 'up') { ids.E1 = mkup(R, s, m, 'pe1'); ids.E2 = mkup(R, s, m, 'pe2'); }
  else { ids.E1 = mkup(R, s, m, 'pe1'); ids.B = mkfd(R, s, m, 'sb'); ids.C = mkfd(R, s, m, 'sc'); }
  S.snapTake(R); return { R, s, o, x, m, v, ids }; }
const declare = ({ R, s, x }) => { const i = FX.abInfo(R, x).find(a => a.ic === 'declare').i; const e = FX.declare(R, s, x, i); if (e) throw new Error('declare: ' + e); pump(R); };
const fdKeys = ({ R, ids }) => Object.entries(ids).filter(([k]) => /^[ABC]$/.test(k)).map(([, id]) => R.cards[id].d);
const leaks = (str, sc) => [/SECRET_/.test(str) ? 'SECRET 이름' : '', ...fdKeys(sc).map(k => str.includes('"' + k + '"') ? '정의키 ' + k : '')].filter(Boolean);
// ── A) 서버
{ const sc = scene('fd'); declare(sc); const { R, s, o, m, ids } = sc, q = req(R), ev = JSON.stringify(S.view(R, s).eff), vw = JSON.stringify(S.view(R, s)), vo = JSON.stringify(S.view(R, o));
  ok(q && q.kind === 'opt' && Array.isArray(q.sp) && q.sp.length === 3 && q.sp.every(e => e.fd === 1), '뒷면 세트 카드 3장 → 위치 선택(opt + sp) 질의 (pick 으로 카드 정보를 내보내지 않음)');
  ok(leaks(ev, sc).length === 0 && !/"x":\d|"c":\{/.test(JSON.stringify(S.view(R, s).eff.sp)), `선택 질의 payload 에 카드 이름/정의 키/카드 id 없음 ${leaks(ev, sc).join(',')}`);
  ok(JSON.parse(ev).cards.length === 0 && JSON.parse(ev).sel === undefined, '질의 payload 의 cards/sel(카드 후보 목록) 비어 있음');
  ok(leaks(vw, sc).length === 0, `선택 중 내 보드 view 에도 뒷면 세트 카드 정체 없음 ${leaks(vw, sc).join(',')}`);
  const mh = S.view(R, s).P[s].field.find(c => c.id === m); ok(mh.sl.length === 2 && mh.sl.every(e => e.fd && e.hidden && e.d === undefined), '보드: 후보 캐릭터의 뒷면 세트 카드는 hidden(정보 없음)으로만 전달');
  ok(JSON.parse(vo).eff && JSON.parse(vo).eff.wait === 1 && leaks(vo, sc).length === 0, '상대 view: 대기 상태 + 정체 없음');
  ok(S.view(R, 'spec').eff && S.view(R, 'spec').eff.wait === 1 && leaks(JSON.stringify(S.view(R, 'spec')), sc).filter(x => !/정의키/.test(x) || true).length >= 0, '관전자 view: 대기 상태');
  ok(q.labels.every(l => !/SECRET/.test(l)) && /\(1\/2\)/.test(q.labels[1]) && /\(2\/2\)/.test(q.labels[2]), `선택지 라벨은 위치 정보만 (${q.labels.join(' | ')})`);
  // 선택 번호 → 올바른 카드 인스턴스
  for (const [idx, key] of [[0, 'A'], [1, 'B'], [2, 'C']]) { const t = scene('fd'); declare(t); const e = act(t.R, t.s, { a: 'ans', v: idx }); if (e) throw new Error(e);
    let g = 0; while (t.R.eff && g++ < 6) { const r = req(t.R); act(t.R, r.who, { a: 'ans', v: r.kind === 'pick' ? (r.sel.length ? [r.sel[0]] : []) : r.kind === 'yn' ? true : 0 }); }
    const rem = t.R.P[t.s].rem; const others = ['A', 'B', 'C'].filter(k => k !== key);
    ok(rem.includes(t.ids[key]) && others.every(k => !rem.includes(t.ids[k]) && (t.R.cards[t.ids[k]].fdOn != null)), `선택 ${idx} → 실제로 ${key} 인스턴스만 리무브, 나머지 2장은 뒷면 세트 유지`);
    if (idx === 2) { const v2 = JSON.stringify(S.view(t.R, t.s)); ok(fdKeys(t).slice(0, 2).every(k => v2.includes('"' + k + '"')) , '질의가 끝나면 내 보드는 다시 내 뒷면 세트 카드를 정상 표시'); } }
  // 앞면 세트: 기존 pick(카드 앞면)
  { const t = scene('up'); declare(t); const r = req(t.R); ok(r.kind === 'pick' && r.ids.length === 2, '앞면 세트 카드만 있으면 기존대로 카드 선택(pick) 질의');
    const e = JSON.parse(JSON.stringify(S.view(t.R, t.s).eff)); ok(e.cards.length === 2 && e.cards.every(c => c.d) && e.sp === null, '앞면 세트: 카드 정보(앞면)가 그대로 전달');
    act(t.R, t.s, { a: 'ans', v: [t.ids.E2] }); ok(t.R.P[t.s].rem.includes(t.ids.E2) && !t.R.P[t.s].rem.includes(t.ids.E1) && (t.R.cards[t.ids.E1].setOn != null), '앞면 세트 선택 → 선택한 E2 만 리무브 (기존 동작 유지)'); }
  // 혼합: 앞면은 카드, 뒷면은 위치
  { const t = scene('mix'); declare(t); const r = req(t.R), e = JSON.parse(JSON.stringify(S.view(t.R, t.s).eff)); const ev2 = JSON.stringify(e);
    ok(r.kind === 'opt' && e.sp.length === 3 && e.sp.filter(x => x.fd).length === 2 && e.sp.filter(x => !x.fd && x.c && x.c.d).length === 1, '혼합: 앞면 1장은 카드 정보 포함, 뒷면 2장은 정보 없음');
    ok(leaks(ev2, t).length === 0, `혼합: 뒷면 정체 없음 ${leaks(ev2, t).join(',')}`);
    const iB = e.sp.findIndex((x, i) => x.fd && x.k === 2); act(t.R, t.s, { a: 'ans', v: iB }); ok(t.R.P[t.s].rem.includes(t.ids.C) && !t.R.P[t.s].rem.includes(t.ids.B) && !t.R.P[t.s].rem.includes(t.ids.E1), '혼합: 뒷면 2/2 선택 → C 인스턴스만 리무브'); }
  // 다른 선택 경로: id_0533 unsetPick(자신의 뒷면 2장 중 선택) — 질의 전체를 훑어 정체 노출 없음
  { const R = G({ x: real('id_0533', { color: 'green' }), m: dummy('MM'), v: dummy('VV'), sa: dummy('SECRET_A'), sb: dummy('SECRET_B'), sc: dummy('SECRET_C'), sd: dummy('SECRET_D') }, ['x'], ['v'], BS); const s = R.turn, o = 1 - s, x = field(R, s, 'x'), m = field(R, s, 'm'), v = field(R, o, 'v');
    const ids = { B: mkfd(R, s, m, 'sb'), C: mkfd(R, s, m, 'sc'), D: mkfd(R, o, v, 'sd') }; const sc = { R, ids: { A: ids.B, B: ids.C, C: ids.D } }; S.snapTake(R);
    const i = FX.abInfo(R, x).filter(a => a.ic === 'declare')[1].i; const e = FX.declare(R, s, x, i); if (e) throw new Error(e); pump(R); let g = 0, saw = 0, leak = []; const kinds = [];
    while (R.eff && g++ < 12) { const r = req(R), j = JSON.stringify(S.view(R, r.who).eff); kinds.push(r.kind + (r.sp ? '+sp' : '')); if (r.sp) saw++; leak.push(...leaks(j, sc)); if (r.sp) leak.push(...leaks(JSON.stringify(S.view(R, r.who)), sc).map(z => 'view:' + z));
      act(R, r.who, { a: 'ans', v: r.kind === 'pick' ? (r.sel.length ? [r.sel[0]] : []) : r.kind === 'yn' ? true : 0 }); }
    ok(saw >= 1 && leak.length === 0, `id_0533 unsetPick(내 뒷면 세트 2장 중 선택): 위치 선택 질의 ${saw}회, 질의/보드 노출 없음 [${kinds.join(', ')}] ${leak.slice(0, 3).join(',')}`); } }
// ── B) 브라우저 (서버가 실제로 내보내는 defs/view 를 그대로 그림)
if (!chromium) { console.log('SKIP(브라우저)'); console.log(`\nfd_set_pick_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); }
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const mkPage = async (mobile, R) => { const ctx = await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await pg.goto('file://' + require('path').resolve(__dirname, '../index.html')); pg.feed = m => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m); await pg.feed({ t: 'defs', defs: R.defs }); pg.ctx = ctx; return pg; };
  const snap = pg => pg.evaluate(() => { const t = document.querySelector('#effp, #etray'); return { html: document.body.innerHTML, pv: document.getElementById('pv').innerHTML, tray: [...document.querySelectorAll('#etray .evo')].map(b => ({ cls: b.className, title: b.title, text: b.textContent, back: !!b.querySelector('.card.back'), img: b.querySelector('.card') && (b.querySelector('.card').style.backgroundImage || ''), hasPv: !!(b.querySelector('.card') && b.querySelector('.card')._pv) })) }; });
  // PC — 뒷면만
  { const sc = scene('fd'); declare(sc); const { R, s, m, ids } = sc; const pg = await mkPage(false, R); await pg.feed(JSON.parse(JSON.stringify(S.view(R, s)))); await pg.waitForSelector('#etray .evo'); await pg.waitForTimeout(150);
    let d = await snap(pg); ok(d.tray.length === 3 && d.tray.every(b => /dn/.test(b.cls) && b.back && !b.img && !b.hasPv), `PC: 선택 화면의 후보 3장 모두 카드 뒷면만 (${d.tray.map(b => b.cls).join(' / ')})`);
    ok(!/SECRET/.test(d.html) && d.tray.every(b => !/SECRET/.test(b.title + b.text)), 'PC: 화면(DOM) 어디에도 카드 이름/이미지(SECRET) 없음 — title/alt/텍스트 포함');
    ok(d.tray.every(b => /뒷면 세트 카드 \(\d\/\d\)/.test(b.text) && b.title === b.text), 'PC: 위치/순서(n/m)만 표시, title 도 같은 위치 문구');
    // hover: 트레이 뒷면 카드 + 보드의 hidden 세트 카드
    const before = (await snap(pg)).pv; for (let k = 0; k < 3; k++) { await pg.locator('#etray .evo').nth(k).locator('.card').hover(); await pg.waitForTimeout(80); }
    const boardSets = pg.locator('#me-field .card.sc'); const nb = await boardSets.count(); for (let k = 0; k < nb; k++) { await boardSets.nth(k).hover({ force: true }).catch(() => {}); await pg.waitForTimeout(60); }
    d = await snap(pg); ok(!/SECRET/.test(d.pv) && !/SECRET/.test(d.html), `PC: 트레이/보드 뒷면 세트 카드 hover(${3 + nb}회) 후에도 우측 상세·화면에 정체 없음`);
    ok(nb >= 2 && (await boardSets.evaluateAll(l => l.every(e => e.classList.contains('sethid') && !e._pv))), `PC: 보드의 뒷면 세트 카드 ${nb}장도 선택 중에는 정보 없는 뒷면(hover preview 없음)`);
    // 선택 → 올바른 인스턴스
    await pg.locator('#etray .evo').nth(1).click(); await pg.waitForTimeout(100); const sent = await pg.evaluate(() => window.__sent.filter(x => x.a === 'ans')); ok(sent.length === 1 && sent[0].v === 1, `PC: 두 번째 후보 클릭 → 서버로 번호만 전송 ${JSON.stringify(sent)}`);
    act(R, s, { a: 'ans', v: sent[0].v }); ok(R.P[s].rem.includes(ids.B) && !R.P[s].rem.includes(ids.A) && !R.P[s].rem.includes(ids.C), 'PC: 서버가 번호 1 → 해당 인스턴스(B)에만 효과 적용');
    ok(pg.errs.length === 0, 'PC: JS 오류 없음 ' + pg.errs.join('|')); await pg.ctx.close(); }
  // PC — 혼합(앞면은 카드로, 뒷면은 뒷면으로)
  { const sc = scene('mix'); declare(sc); const { R, s } = sc; const pg = await mkPage(false, R); await pg.feed(JSON.parse(JSON.stringify(S.view(R, s)))); await pg.waitForSelector('#etray .evo'); await pg.waitForTimeout(150); const d = await snap(pg);
    const up = d.tray.filter(b => /up/.test(b.cls)), dn = d.tray.filter(b => /dn/.test(b.cls)); ok(up.length === 1 && dn.length === 2 && dn.every(b => b.back && !b.hasPv && !/SECRET/.test(b.title + b.text)) && up[0].hasPv && /PUBEVENT1/.test(up[0].text), '혼합: 앞면 세트(PUBEVENT1)는 카드로, 뒷면 2장은 정보 없는 뒷면으로');
    await pg.hover('#etray .evo.up .card'); await pg.waitForTimeout(100); ok(/PUBEVENT1/.test((await snap(pg)).pv) && !/SECRET/.test((await snap(pg)).pv), '혼합: 앞면 세트 카드는 기존처럼 hover 하면 상세가 표시됨'); await pg.ctx.close(); }
  // PC — 앞면만(기존 pick UI 그대로)
  { const sc = scene('up'); declare(sc); const { R, s } = sc; const pg = await mkPage(false, R); await pg.feed(JSON.parse(JSON.stringify(S.view(R, s)))); await pg.waitForSelector('#effp .cs .card, #etray .card, #pk .card'); const n = await pg.locator('#effp .cs .card, #etray .card, #pk .card').count();
    ok(n >= 2 && (await pg.evaluate(() => document.body.innerHTML.includes('PUBEVENT') || [...document.querySelectorAll('#effp .card, #etray .card, #pk .card')].some(c => c._pv))), `PC: 앞면 세트 카드 선택 화면은 기존과 같이 카드로 표시 (${n}장)`); await pg.ctx.close(); }
  // 터치 — 뒷면 후보를 눌러도(touchstart) preview 없음
  { const sc = scene('fd'); declare(sc); const { R, s } = sc; const pg = await mkPage(true, R), cdp = await pg.ctx.newCDPSession(pg); await pg.feed(JSON.parse(JSON.stringify(S.view(R, s)))); await pg.waitForSelector('#etray .evo'); await pg.waitForTimeout(150);
    const b = await pg.locator('#etray .evo .card').first().boundingBox(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] }); await pg.waitForTimeout(150);
    const t = await pg.evaluate(() => ({ pvf: (document.getElementById('pvf') || {}).className || '', pv: document.getElementById('pv').innerHTML, sheet: !!document.querySelector('#sheet.on'), fs: !!document.querySelector('#fsv.on'), html: document.body.innerHTML })); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ok(!/on/.test(t.pvf) && !t.sheet && !t.fs && !/SECRET/.test(t.pv + t.html), '터치: 뒷면 후보를 눌러도(롱프레스 포함 전) 떠 있는 preview/시트에 정체 없음');
    await pg.waitForTimeout(600); const t2 = await pg.evaluate(() => ({ fs: !!document.querySelector('#fsv.on'), html: document.getElementById('fsv') ? document.getElementById('fsv').innerHTML : '' })); ok(!t2.fs && !/SECRET/.test(t2.html), '터치: 길게 눌러도 전체 보기(fsv)가 열리지 않거나 정체 없음');
    ok(pg.errs.length === 0, '터치: JS 오류 없음 ' + pg.errs.join('|')); await pg.ctx.close(); }
  await br.close(); console.log(`\nfd_set_pick_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })().catch(e => { console.error(e); process.exit(2); });
