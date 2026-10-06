// v1.17.0 플레이 로그 카드 이름 hover → 우측 카드 상세 패널 (카드 ID 기반, 기존 pv/_pv 재사용)
//  A) 서버: 로그 줄마다 카드 이름의 위치 + 카드 정의 키(V.lr)가 저장됨 — 같은 이름의 다른 카드도 ID 로 구분
//  B) 브라우저(실제 서버 + 2 플레이어): 로그의 카드 이름만 .lgc, hover → #pv 가 정확한 카드로 바뀜, 일반 문장은 영향 없음
const path = require('path'), fs = require('fs');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
// ── A) 서버 단위
{ const H = require('./helpers'); const { S, game, give, act } = H;
  const base = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
  const R = game({ ...base, a: { n: '동명', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1' }, b: { n: '동명', type: 'char', color: 'blue', lv: '0', ap: '2000', lp: '1' }, c: { n: '다른이름', type: 'char', color: 'blue', lv: '0', ap: '3000', lp: '1' } }, ['a', 'b', 'c'], ['a']);
  const s = R.turn, o = 1 - s, ia = give(R, s, 'a', 'hand'), ic = give(R, s, 'c', 'hand'), ib = give(R, o, 'b', 'hand');
  const play = (w, id) => { const e = act(R, w, { a: 'play', id }); if (e) throw new Error(e); };
  play(s, ia); { const e = act(R, s, { a: 'end' }); if (e) throw new Error(e); } play(o, ib); { const e = act(R, o, { a: 'end' }); if (e) throw new Error(e); } play(s, ic);
  const V = S.view(R, s), n = V.log.length;
  ok(Array.isArray(V.lr) && V.lr.length === n, `V.lr 은 V.log 와 같은 길이 (${n})`);
  const idx = V.log.map((l, i) => /사용: 동명/.test(l) ? i : -1).filter(i => i >= 0);
  ok(idx.length === 2, '동명 카드 2장 사용 로그가 2줄');
  const ref = i => V.lr[i] && V.lr[i][0];
  ok(ref(idx[0]) && ref(idx[1]) && ref(idx[0])[2] === R.cards[ia].d && ref(idx[1])[2] === R.cards[ib].d && R.cards[ia].d !== R.cards[ib].d, `같은 이름 '동명' 이어도 줄마다 서로 다른 정의 키(${ref(idx[0]) && ref(idx[0])[2]} / ${ref(idx[1]) && ref(idx[1])[2]})`);
  ok(idx.every(i => V.log[i].slice(ref(i)[0], ref(i)[1]) === '동명' && ref(i)[1] === V.log[i].length), '저장된 범위 = 카드 이름 글자 그대로 (문장 전체가 아님)');
  const ci = V.log.findIndex(l => /사용: 다른이름/.test(l)); ok(ci >= 0 && V.lr[ci][0][2] === R.cards[ic].d, '다른 이름 카드도 자기 정의 키로 저장');
  const plain = V.log.findIndex(l => /── .*의 턴/.test(l)); ok(plain >= 0 && V.lr[plain] === 0, '카드 이름이 없는 일반 로그 줄에는 링크 정보 없음');
  const spec = S.view(R, 'spec'); ok(Array.isArray(spec.lr) && spec.lr.length === spec.log.length, '관전자 상태에도 같은 로그 링크 정보');
  ok(JSON.stringify(V.lr).indexOf('_lp') < 0 && !('_lp' in S.view(R, s)), '내부 예약 필드는 클라이언트에 나가지 않음'); }
// ── B) 브라우저
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP(브라우저): playwright 또는 ws 없음'); console.log(`\nlog_hover_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); }
const { spawn } = require('child_process'); const PORT = 9300 + Math.floor(Math.random() * 500);
const cf = path.join(require('os').tmpdir(), 'loghov_cards_' + process.pid + '.json');
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, CARDS_JSON: cf, NODE_PATH: path.dirname(path.dirname(WS)) }, stdio: 'ignore' }); process.on('exit', () => srv.kill());
const mk = (id, n, type, extra = {}) => ({ id, n, type, color: 'blue', lv: '0', lv2: '2', ap: '3000', lp: '1', kw: '', trait: '', fx: '', extra: '', ab: [], img: '', ...extra });
const cards = { p: mk('p', '파트너', 'partner'), k: mk('k', '사건', 'case', { lv: '1' }) };
for (let i = 0; i < 7; i++) cards['dup' + i] = mk('dup' + i, '동명이인', 'char', { ap: String(1000 + i * 1000), extra: '효과 텍스트 ' + i });
for (let i = 0; i < 12; i++) cards['c' + i] = mk('c' + i, '캐릭터' + i, 'char');
const cs = {}; for (let i = 0; i < 7; i++) cs['dup' + i] = 3; for (let i = 0; i < 12; i++) cs['c' + i] = i < 7 ? 2 : 1;   // 21 + 14 + 5 = 40
const deck = { name: '덱', cards: cs, partner: 'p', kase: 'k' }; fs.writeFileSync(cf, JSON.stringify({ cards })); process.on('exit', () => { try { fs.unlinkSync(cf); } catch (e) {} });
(async () => { await new Promise(r => setTimeout(r, 1200)); const br = await chromium.launch({ ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
  const mkp = async () => { const pg = await br.newPage({ viewport: { width: 1600, height: 950 } }); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); await pg.goto('http://localhost:' + PORT + '/'); await pg.evaluate(() => dbReady); await pg.evaluate(d => { DB.decks = { d }; curDeck = 'd'; decks(); }, deck); return pg; };
  const A = await mkp(), B = await mkp();
  await A.getByText('방 만들기').click(); await A.waitForSelector('#game', { state: 'visible' }); const code = await A.locator('#rc').innerText();
  await B.fill('#code', code); await B.getByText('입장 (게스트)').click(); await B.waitForSelector('#game', { state: 'visible' });
  await A.getByRole('button', { name: '덱 등록' }).click(); await B.getByRole('button', { name: '덱 등록' }).click(); await A.waitForTimeout(600);
  for (let r = 0; r < 2; r++) for (const pg of [A, B]) { const t = await pg.locator('#msg').innerText(); if (/교체할 손패/.test(t)) await pg.getByRole('button', { name: /확정/ }).click(); await pg.waitForTimeout(400); }
  await A.waitForTimeout(700);
  const T = (await A.locator('#turnb.me').count()) ? A : B;
  const O = T === A ? B : A;
  const handDefs = async pg => pg.evaluate(() => [...document.querySelectorAll('#hand .card')].map((e, i) => ({ i, id: e._pv && String(e._pv[1].d).replace(/^\d+:/, ''), n: e._pv && e._pv[0].n })));
  const playDup = async pg => { const hd = (await handDefs(pg)).filter(x => x.n === '동명이인'); if (!hd.length) return null; await pg.locator('#hand .card').nth(hd[0].i).click(); await pg.getByRole('button', { name: /등장/ }).first().click(); await pg.waitForTimeout(600); return hd[0].id; };
  const played = []; const p1 = await playDup(T); if (p1) played.push(p1);
  await T.getByRole('button', { name: /턴 종료/ }).click(); await O.waitForTimeout(800);
  const p2 = await playDup(O); if (p2) played.push(p2); await O.waitForTimeout(400);
  ok(played.length === 2, `서로 다른 플레이어가 동명이인 카드를 1장씩 사용 (${played.join(', ')})`);
  for (const pg of [A, B]) {
    const who = pg === T ? '내 화면' : '상대 화면';
    const spans = await pg.locator('#log .lgc').evaluateAll(l => l.map(e => ({ t: e.textContent, d: e.dataset.d, parent: e.parentElement.textContent })));
    ok(spans.length >= played.length && spans.every(s => s.t === '동명이인' || /^캐릭터\d+$/.test(s.t)), `${who}: 로그의 카드 이름만 .lgc (${spans.map(s => s.t).join(', ')})`);
    ok(spans.every(s => s.parent.length > s.t.length), `${who}: .lgc 는 문장 전체가 아니라 이름 부분만`);
    ok(await pg.locator('#log div:not(:has(.lgc))').count() > 0 && await pg.locator('#log div:not(:has(.lgc))').evaluateAll(l => l.every(e => !e.querySelector('.lgc'))), `${who}: 카드 이름이 없는 일반 로그 줄은 링크 없음`);
    const cur = await pg.evaluate(() => getComputedStyle(document.querySelector('#log .lgc')).cursor); ok(cur === 'pointer', `${who}: 카드 이름 cursor: pointer`);
    // hover → 상세 패널
    const dupSpans = pg.locator('#log .lgc', { hasText: '동명이인' }); const nDup = await dupSpans.count(); const seen = [];
    for (let j = 0; j < nDup; j++) { await pg.locator('#hand .card').first().hover(); await dupSpans.nth(j).hover(); await pg.waitForTimeout(150);
      seen.push(await pg.evaluate(() => ({ cid: (document.querySelector('#pv .cid') || {}).textContent || '', nm: (document.querySelector('#pv .nm b') || {}).textContent || '', fx: (document.querySelector('#pv .fx') || {}).textContent || '', ap: (/AP (\d+)/.exec(document.querySelector('#pv .meta').textContent) || [])[1] }))); }
    ok(nDup >= 1 && seen.every(x => x.nm === '동명이인'), `${who}: 로그 이름 hover → 우측 상세 패널에 해당 카드 표시 (${seen.map(x => x.cid).join(' | ')})`);
    if (nDup >= 2) { ok(seen[0].cid !== seen[1].cid && seen[0].fx !== seen[1].fx && seen[0].ap !== seen[1].ap, `${who}: 같은 이름 카드 2장도 ID 로 구분되어 서로 다른 카드 표시 (${seen[0].cid}/${seen[1].cid}, AP ${seen[0].ap}/${seen[1].ap})`);
      ok(seen.every((x, j) => x.cid.endsWith(played[j])), `${who}: 사용한 순서대로 ${played.join(' → ')} 로 표시`); }
    // 일반 로그 문장 hover → 상세 패널 변화 없음
    await pg.locator('#hand .card').first().hover(); await pg.waitForTimeout(100); const before = await pg.locator('#pv').innerHTML();
    await pg.locator('#log div:not(:has(.lgc))').first().hover(); await pg.waitForTimeout(150); ok(await pg.locator('#pv').innerHTML() === before, `${who}: 일반 로그 문장 hover 는 상세 패널을 바꾸지 않음`);
    // 로그 이름 hover 후 보드 카드 hover 도 기존대로 동작 (공통 pv 사용)
    await dupSpans.first().hover(); await pg.locator('#hand .card').first().hover(); await pg.waitForTimeout(150);
    const hn = await pg.evaluate(() => { const e = document.querySelector('#hand .card'); return e._pv[0].n; }); ok((await pg.locator('#pv .nm b').innerText()) === hn, `${who}: 로그 hover 뒤 손패 hover 도 정상 (공통 preview 와 충돌 없음)`);
  }
  // 클릭은 아무 일도 하지 않음 (게임 액션 영향 없음)
  const st0 = await O.evaluate(() => JSON.stringify({ n: V.log.length, f: V.me != null ? 1 : 0 })); await O.locator('#log .lgc').first().click(); await O.waitForTimeout(300);
  ok(await O.evaluate(() => JSON.stringify({ n: V.log.length, f: V.me != null ? 1 : 0 })) === st0 && await O.locator('.card.sel').count() === 0 && (await O.locator('#turnb.me').count()) === 1, '로그 카드 이름 클릭: 게임 상태/선택에 영향 없음');
  // 터치 기기(isMobile/hasTouch): 관전자 화면에서 로그의 카드 이름을 탭 → 보드/손패 탭과 같은 pv 로 해당 카드 표시 (이 버전은 터치도 PC 레이아웃)
  { const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const M = await ctx.newPage(); M.errs = []; M.on('pageerror', e => M.errs.push(e.message));
    await M.goto('http://localhost:' + PORT + '/'); await M.evaluate(() => dbReady); await M.fill('#scode', code); await M.click('#specBtn'); await M.waitForSelector('#game', { state: 'visible' }); await M.waitForTimeout(600);
    await M.evaluate(() => { document.body.classList.add('logopen'); });
    const sp = M.locator('#log .lgc', { hasText: '동명이인' }); const nM = await sp.count(); ok(nM >= 1, `모바일 관전 화면 로그에도 카드 이름 링크 ${nM}개`);
    if (nM >= 1) { const want = await sp.first().getAttribute('data-d'); await sp.first().tap(); await M.waitForTimeout(400);
      const got = await M.evaluate(() => ({ cid: (document.querySelector('#pv .cid') || {}).textContent || '', nm: (document.querySelector('#pv .nm b') || {}).textContent || '' }));
      ok(got.nm === '동명이인' && got.cid.endsWith(String(want).replace(/^\d+:/, '')), `터치 기기: 로그 카드 이름을 탭하면 기존 preview(우측 상세)가 해당 카드로 표시 (기대 ${want}, 실제 ${JSON.stringify(got)})`); }
    ok(!M.errs.length, '모바일 브라우저 오류 없음 ' + M.errs.join('|')); }
  ok([A, B].every(p => !p.errs.length), '브라우저 오류 없음 ' + [A, B].flatMap(p => p.errs).join('|'));
  await br.close(); console.log(`\nlog_hover_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })().catch(e => { console.error(e); process.exit(2); });
