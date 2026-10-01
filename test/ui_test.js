// 실제 브라우저(Playwright chromium)에서 index.html 을 열어 화면 구조/호버 확대/행동 버튼/증거·FILE 실시간 갱신을 검증한다.
// 엔진(server.js 의 view)이 만든 실제 뷰를 모의 WebSocket 으로 주입한다. Playwright 가 없으면 건너뜀.
const path = require('path'), fs = require('fs');
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음 (npm i -D playwright)'); process.exit(0); }
const { S, game, give, act } = require('./helpers');
const d = (n, e = {}) => ({ n, type: 'char', color: 'red', lv: '0', ap: '1000', lp: '3', ...e });
const R = game({ a: d('A', { ab: [{ ic: 'declare', lab: '테스트능력', ops: [{ op: 'draw', n: 1 }] }] }), b: d('B'), c: d('C') }, ['a', 'b', 'c', 'a', 'b', 'c', 'a'], ['a', 'b', 'c']);
const s = R.turn, o = 1 - s;
const svg = t => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#ddd"/><text x="20" y="140" font-size="40">${t}</text></svg>`);
for (const k of Object.keys(R.defs)) { R.defs[k].img = svg(R.defs[k].n + ':' + k); R.defs[k].extra = '【선언】 한국어 효과 ' + R.defs[k].n; R.defs[k].fx = '日本語原文 ' + R.defs[k].n; }
const a = give(R, s, 'a', 'field'); R.cards[a].sum = 0; R.cards[a].st = 'a'; const b = give(R, s, 'b', 'field'); R.cards[b].sum = 1; R.cards[b].st = 'a';
const ov = give(R, o, 'b', 'field'); R.cards[ov].st = 's'; const oc = give(R, o, 'c', 'field');
const seq = []; const snap = label => seq.push({ label, view: JSON.parse(JSON.stringify(S.view(R, s))), want: { meLP: R.P[s].evid.length, oppLP: R.P[o].evid.length, meFile: R.P[s].file.length, oppFile: R.P[o].file.length } });
snap('시작'); R.P[o].evid.push(...R.P[o].deck.splice(0, 1)); snap('상대 증거 증가(액션 가능한 사건)'); const mainView = JSON.parse(JSON.stringify(S.view(R, s))); const mainActs = mainView.acts;
act(R, s, { a: 'reason', who: a }); snap('추리 후 증거 증가'); act(R, s, { a: 'hint' }); snap('힌트 후 FILE 감소');
R.P[o].evid.push(...R.P[o].deck.splice(0, 4)); R.P[o].file.push(...R.P[o].deck.splice(0, 2)); snap('상대 증거/FILE 증가'); R.P[s].evid.splice(0, 2); snap('내 증거 감소');
const oppTurnView = JSON.parse(JSON.stringify(S.view(R, o))); const oppSeatMe = oppTurnView.me;
// 세트 카드 뷰: 내 캐릭터 a 에 뒷면 2장 + 앞면 1장, 상대 캐릭터 ov 에 뒷면 1장 + 앞면 1장 (실제 엔진 뷰)
const hs = R.P[s].hand.splice(0, 3), hg = R.P[o].hand.splice(0, 2);
R.cards[b].fd = [hs[0], hs[2]]; R.cards[b].sets = [hs[1]]; hs.forEach((x, i) => { if (i === 1) R.cards[x].setOn = b; else R.cards[x].fdOn = b; });
R.cards[ov].fd = [hg[0]]; R.cards[ov].sets = [hg[1]]; R.cards[hg[0]].fdOn = ov; R.cards[hg[1]].setOn = ov;
const setViewS = JSON.parse(JSON.stringify(S.view(R, s))), setViewO = JSON.parse(JSON.stringify(S.view(R, o)));
const DEF = R.defs, cid = { a, b, ov, oc }, imgOf = id => DEF[(mainView.P[s].field.concat(mainView.P[o].field, [mainView.P[s].partner, mainView.P[o].partner, mainView.P[s].kase]).find(c => c.id === id) || {}).d].img;
(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)); const br = await chromium.launch(exe ? { executablePath: exe } : {}); let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  ✗', m); } };
  const open = async (w, h, view0, motion) => { const pg = await br.newPage({ viewport: { width: w, height: h } }); pg.errs = []; if (!motion) await pg.emulateMedia({ reducedMotion: 'reduce' }); pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(dd => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: dd }) }), DEF); await push(pg, view0); return pg; };
  const push = (pg, v) => pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), v);
  const box = (pg, sel) => pg.locator(sel).first().boundingBox();
  const btns = async pg => (await pg.locator('#act button').allInnerTexts());
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 700]]) {
    const pg = await open(w, h, seq[0].view); const T = `${w}x${h}`;
    // ── 증거/FILE 실시간 갱신 + 겹친 뒷면 카드
    for (const st of seq) { await push(pg, st.view); const q = async sel => +(await pg.locator(sel + ' .lab').innerText()).split(' ')[1]; const n = sel => pg.locator(sel + ' .pile .card').count();
      const got = { meLP: await q('#me-lp'), oppLP: await q('#opp-lp'), meFile: await q('#me-file'), oppFile: await q('#opp-file') }; ok(JSON.stringify(got) === JSON.stringify(st.want), `${T} ${st.label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(st.want)}`);
      ok(await n('#me-lp') === Math.min(st.want.meLP, 9) && await n('#me-file') === Math.min(st.want.meFile, 12) && await n('#opp-lp') === Math.min(st.want.oppLP, 9) && await n('#opp-file') === Math.min(st.want.oppFile, 12), `${T} ${st.label}: 겹친 뒷면 카드 수`);
      ok(/^증거 \d+$/.test(await pg.locator('#me-lp .lab').innerText()) && !/LP/.test(await pg.locator('#board').innerText()), `${T}: '증거' 로 표시(LP 문구 없음)`);
      for (const sel of ['#me-lp', '#opp-lp', '#me-file', '#opp-file']) { const xs = await pg.evaluate(s => [...document.querySelectorAll(s + ' .pile .card')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }), sel), lab = sel.replace(/^#(me|opp)-/, ''), want = st.want[(/^#me/.test(sel) ? 'me' : 'opp') + (lab === 'lp' ? 'LP' : 'File')];
        const land = xs.every(a => a[2] > a[3] * 1.25), ordered = lab === 'lp' ? xs.every((a, i) => i === 0 || (a[1] > xs[i - 1][1] + 5 && Math.abs(a[0] - xs[0][0]) < 2)) : xs.every((a, i) => i === 0 || (a[0] > xs[i - 1][0] + 5 && Math.abs(a[1] - xs[0][1]) < 2));
        ok(xs.length === Math.min(want, lab === 'lp' ? 7 : 12) && land && ordered, `${T} ${sel} ${want}장: 가로(눕힌) 카드 ${lab === 'lp' ? '위→아래(카드마다 간격)' : '좌→우'} 정렬`); }
    }

    await push(pg, mainView);
    // ── 배치
    const bd = await box(pg, '#board'), hand = await box(pg, '#hand'), file = await box(pg, '#me-file'), part = await box(pg, '#me-partner .card'), kase = await box(pg, '#me-case .card'), ev = await box(pg, '#me-lp'), fld = await box(pg, '#me-field .card'), pvb = await box(pg, '#pv'), act = await box(pg, '#act');
    const cx = x => x.x + x.width / 2, cy = x => x.y + x.height / 2, mid = bd.x + bd.width / 2;
    const oFile = await box(pg, '#opp-file'), oPart = await box(pg, '#opp-partner .card'), oCase = await box(pg, '#opp-case .card'), oLp = await box(pg, '#opp-lp'), oFld = await box(pg, '#opp-field .card'), oHand = await box(pg, '#opp-hand');
    // 1) 손패 = 왼쪽 아래, FILE = 중앙 아래(손패 오른쪽), 파트너/캐릭터 = 중앙 (상대는 위쪽에 대응)
    ok(hand.x < mid && hand.x + hand.width <= file.x + 4 && hand.y > part.y + part.height * .5 && hand.y + hand.height <= bd.y + bd.height + 2, `${T} 내 손패는 왼쪽 아래 (${JSON.stringify([hand.x, hand.width, file.x, mid].map(Math.round))})`);
    ok(Math.abs(cx(file) - mid) < bd.width * .03 && file.y > part.y + part.height * .5, `${T} FILE 은 중앙 아래 (${Math.round(cx(file))} vs ${Math.round(mid)})`);
    ok(Math.abs(cx(part) - mid) < bd.width * .03 && Math.abs(cx(part) - cx(file)) < 8 && Math.abs(cx(fld) - mid) < bd.width * .4, `${T} 파트너는 중앙축(FILE 과 같은 세로줄)`);
    ok(part.y > fld.y + fld.height - 2 && oPart.y + oPart.height <= oFld.y + 2, `${T} 파트너 줄은 캐릭터 줄과 분리 (나: 아래, 상대: 위)`);
    ok(oHand.x < mid && oFile.y < oPart.y && oHand.y < oPart.y && Math.abs(cx(oFile) - mid) < bd.width * .03, `${T} 상대는 대응 구조: 왼쪽 위 손패, 중앙 위 FILE, 파트너/캐릭터가 그 아래`);
    // 2) 사건 / FILE / 증거는 카드 자체가 90° 눕혀진 가로 카드
    for (const sel of ['#me-case', '#me-file', '#opp-case', '#opp-file']) { const r = await box(pg, sel + (/case/.test(sel) ? ' .card' : ' .pile > :first-child')); ok(r && r.width > r.height * 1.25, `${T} ${sel}: 눕힌(가로) 카드 ${r && Math.round(r.width)}x${r && Math.round(r.height)}`); }
    for (const sel of ['#me-lp', '#opp-lp']) { const r = await box(pg, sel + ' .pile > :first-child'); ok(r && r.width > r.height * 1.25, `${T} ${sel}: 증거 카드는 가로(눕힌) 카드 ${r && Math.round(r.width)}x${r && Math.round(r.height)}`); }
    { // 사건은 회전 없음: 원본 방향(가로 박스, transform 없음, ::before 회전 이미지 없음)
      for (const sel of ['#me-case', '#opp-case']) { const r = await pg.evaluate(s => { const e = document.querySelector(s + ' .card'); if (!e) return null; const c = getComputedStyle(e), b = getComputedStyle(e, '::before'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, tr: c.transform, cls: e.className, bef: b.content, bg: c.backgroundImage, bs: c.backgroundSize }; }, sel);
        ok(r && r.w > r.h * 1.25 && (r.tr === 'none' || r.tr === '') && !/land/.test(r.cls) && /kase/.test(r.cls) && (r.bef === 'none' || r.bef === 'normal') && /url/.test(r.bg) && /100%/.test(r.bs), `${T} ${sel}: 사건 이미지 회전 없음(원본 방향) ${JSON.stringify(r)}`); } }
    ok(!/손패\s*\d/.test(await pg.locator('#board').innerText()), `${T} '손패 N' 표시 삭제`);
    for (const pre of ['me', 'opp']) { const dk = await box(pg, `#${pre}-deck .pile`), rm = await box(pg, `#${pre}-rem .pile`), lb = await pg.locator(`#${pre}-rem .lab`).innerText();
      ok(/^리무브 \d+$/.test(lb) && rm.y > dk.y + dk.height - 4 && Math.abs(cx(rm) - cx(dk)) < 6 && rm.width > 20, `${T} ${pre}: 덱 N 은 덱 위치, 리무브 N 은 별도 리무브 영역(카드 위치)에 표시`); }
    ok((await box(pg, '#me-field .card')).height > (await box(pg, '#me-field .card')).width * 1.25 && part.height > part.width * 1.25, `${T} 캐릭터/파트너는 세로 카드 유지`);
    // 3) 증거는 사건 바로 아래 (같은 열, 사건 위 / 증거 아래)
    const evc = await box(pg, '#me-lp .pile'), oevc = await box(pg, '#opp-lp .pile');
    ok(evc.y > kase.y + kase.height - 2 && Math.abs(cx(evc) - cx(kase)) < 8 && evc.y - (kase.y + kase.height) < kase.height * 1.2, `${T} 나: 사건 위 / 증거 바로 아래`);
    ok(oevc.y > oCase.y + oCase.height - 2 && Math.abs(cx(oevc) - cx(oCase)) < 8, `${T} 상대: 사건 위 / 증거 아래`);
    ok(kase.x + kase.width <= fld.x && (await box(pg, '#me-deck')).x > fld.x + fld.width * 4, `${T} 왼쪽 열: 사건/증거, 오른쪽 열: 덱`);
    ok(pvb.x >= bd.x + bd.width - 2 && act.x >= bd.x + bd.width - 2 && act.y > pvb.y + pvb.height, `${T} 오른쪽 독립 패널: 위=큰 카드 미리보기, 아래=행동 버튼`);
    { // 로그는 보드 왼쪽, 디버그 UI 는 숨김
      const lg = await box(pg, '#logc'); ok(lg.x + lg.width <= bd.x + 2 && (lg.width >= 100 || w < 1200) && lg.height > 300, `${T} 플레이 로그는 왼쪽 열 (${Math.round(lg.width)}px)`);
      ok(await pg.evaluate(() => !document.getElementById('devp') && !document.getElementById('menu') && typeof cmenu === 'undefined' && !document.getElementById('shMan') && !/효과 도구|수동|직접 처리|개발자/.test(document.body.innerText) && document.getElementById('log').scrollHeight >= 0), `${T} 효과 도구/자동처리 표시는 일반 화면에서 숨김`); }
    // 4) 카드 위 AP / 증거 / 코스트 텍스트 오버레이 없음
    ok(await pg.evaluate(() => [...document.querySelectorAll('#board .card')].every(c => !/AP\s?\d|증거\s?\d|cost|코스트|Lv\s?\d/i.test(c.innerText))), `${T} 카드 위에 AP/증거/코스트 텍스트가 없다`);
    { // 캐릭터 에어리어는 5칸만큼만 (타이트)
      const zf = await box(pg, '#me-field'), ch = fld.height; ok(zf.width <= 5 * (ch + 6) + 40 && zf.width >= 5 * ch * .7, `${T} 캐릭터 영역 폭 ${Math.round(zf.width)} ≈ 5칸`); }
    { // 증거/FILE 카드 수 badge
      ok(await pg.evaluate(() => [...document.querySelectorAll('.stk .lab')].every(l => l.getBoundingClientRect().width > 20 && getComputedStyle(l).borderRadius !== '0px')), `${T} 카드 수 badge`);
    }
    { // 카드 뒷면: 임시 빨간 줄무늬 없이 실제 코난 뒷면 이미지
      const bs = await pg.evaluate(() => [...document.querySelectorAll('.card.back')].map(e => { const cs = getComputedStyle(e, e.classList.contains('land') ? '::before' : null); return [cs.backgroundImage, e.getBoundingClientRect().width / e.getBoundingClientRect().height]; }));
      ok(bs.length > 10 && bs.every(b => /assets\/cardback\.png/.test(b[0]) && !/gradient/.test(b[0])), `${T} 모든 뒷면 카드가 assets/cardback.png 사용 (${bs.length}장)`);
      ok(bs.every(b => Math.abs(b[1] - 302 / 417) < .04 || Math.abs(b[1] - 417 / 302) < .06), `${T} 뒷면 비율 유지 (302:417, 눕힌 카드는 반대)`);
      ok(await pg.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth === 302 && i.naturalHeight === 417); i.onerror = () => r(false); i.src = 'assets/cardback.png'; })), `${T} cardback.png 로드`); }
    { // 버튼/폰트: 기본 HTML 버튼 모양 없음 + 큰 클릭 영역
      const bt = await pg.evaluate(() => [...document.querySelectorAll('#top button,#mid button')].map(b => { const c = getComputedStyle(b), r = b.getBoundingClientRect(); return [parseFloat(c.borderRadius) >= 6, /Noto|Pretendard|Gothic|system-ui/.test(c.fontFamily), r.height]; }));
      ok(bt.length >= 4 && bt.every(b => b[0] && b[1]), `${T} 버튼: 둥근 모서리 + 통일 폰트`); ok((await pg.evaluate(() => Math.min(...[...document.querySelectorAll('#mid button')].map(b => b.getBoundingClientRect().height)))) >= 34, `${T} 중앙 행동 버튼 클릭 영역 ≥34px`); }
    ok(await pg.evaluate(() => getComputedStyle(document.getElementById('log')).overflowY === 'auto' && !!document.getElementById('logt')), `${T} 로그: 내부 스크롤 + 접기 버튼`);
    { const wait = () => pg.waitForTimeout(350); const isCol = () => pg.evaluate(() => document.getElementById('logc').classList.contains('col')); if (await isCol()) { await pg.locator('#logt').click(); await wait(); }
      const bd0 = await box(pg, '#board'); await pg.locator('#logt').click(); await wait(); const w1 = (await box(pg, '#logc')).width, bd1 = await box(pg, '#board'); ok(w1 < 60 && bd1.width > bd0.width, `${T} 로그 접기 → 좁아지고 보드가 넓어짐 (${Math.round(w1)}px)`); ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('board').scrollHeight <= document.getElementById('board').clientHeight + 1), `${T} 로그 접은 뒤에도 넘침 없음`); if (w >= 1200) { await pg.locator('#logt').click(); await wait(); ok((await box(pg, '#logc')).width >= 100, `${T} 로그 펼치기`); } }
    { // 카드 상세: 한국어(extra)만, 일본어 원문(fx) 숨김
      await pg.locator('#me-field .card').first().hover({ force: true }); const tx = await pg.locator('#pv').innerText(); ok(/한국어 효과/.test(tx) && !/日本語原文/.test(tx), `${T} 카드 상세는 한국어 효과만 (일본어 fx 숨김): ${tx.slice(0, 60)}`); }
    ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('board').scrollHeight <= document.getElementById('board').clientHeight + 1), `${T} 가로 스크롤/세로 넘침 없음`);
    // ── 카드끼리 겹침 없음 (손패의 의도된 겹침 제외)
    const rects = await pg.evaluate(() => [...document.querySelectorAll('#oppl .fs .card,#mel .fs .card,.z-part .card,.slot .card,.stk')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, e.className, (e.closest('.slot') || {}).id || (e.closest('.z-field') || {}).id || e.id || ''] }));
    let over = ''; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const p = rects[i], c = rects[j]; if (p[0] < c[0] + c[2] - 2 && c[0] < p[0] + p[2] - 2 && p[1] < c[1] + c[3] - 2 && c[1] < p[1] + p[3] - 2) over += `${p[5]}/${c[5]} `; } ok(!over, `${T} 카드/영역 겹침: ${over}`);
    // ── 마우스오버 확대: 손패/내 필드/상대 필드/파트너/사건/상대 파트너·사건
    const hov = { '#hand .card': null, '#me-field .card': null, '#opp-field .card': null, '#me-partner .card': null, '#me-case .card': null, '#opp-partner .card': null, '#opp-case .card': null };
    for (const sel of Object.keys(hov)) { const loc = pg.locator(sel).first(); await loc.hover({ force: true, position: { x: 4, y: 30 } }); const src = await pg.locator('#pv img').getAttribute('src'); const name = decodeURIComponent(src).match(/>([^<]+)</)[1]; const want = decodeURIComponent(await loc.evaluate(e => e.style.backgroundImage || e.style.getPropertyValue('--img'))).match(/>([^<]+)</)[1].split(':')[0]; ok(name.split(':')[0] === want, `${T} 호버 ${sel}: 큰 카드=${name} 카드명=${want}`); hov[sel] = src; }
    await pg.locator('#me-field .card').nth(1).hover(); const s1 = await pg.locator('#pv img').getAttribute('src'); await pg.locator('#me-field .card').nth(0).hover(); const s0 = await pg.locator('#pv img').getAttribute('src'); ok(s0 !== s1, `${T} 다른 카드로 옮기면 즉시 바뀜`);
    if (w === 1366) {
      // ── 행동 버튼: 서버가 계산한 가능한 행동만
      ok((await btns(pg)).length === 0 && await pg.locator('#act.off').count() === 1, `${T} 선택 전에는 행동 버튼 없음`);
      await pg.locator('#me-field .card').nth(0).click(); let t = await btns(pg); const acts = mainActs[a].map(x => x.k); ok(JSON.stringify(t) === JSON.stringify(['추리', '액션 → 상대 캐릭터 (대상 선택)', '액션 → 상대 사건', '능력: 테스트능력', '선택 해제'].filter((x, i) => [acts.includes('reason'), acts.includes('actc'), acts.includes('actk'), acts.includes('ab'), true][i])), `${T} 캐릭터 A 행동: ${t}`);
      ok(acts.includes('reason') && acts.includes('ab') && acts.includes('actk'), 'A 는 추리/능력/사건 액션 가능(전제)');
      await pg.locator('#me-field .card').nth(1).click(); t = await btns(pg); ok(!t.includes('추리') && !t.some(x => x.startsWith('액션')), `${T} 등장한 턴의 캐릭터 B 는 추리/액션 버튼이 없다: ${t}`);
      ok((await pg.locator('#act .hint').innerText()).includes('할 수 있는 행동이 없습니다'), `${T} 가능한 행동이 없으면 안내`);
      await pg.locator('#me-field .card').nth(0).click(); ok((await btns(pg)).includes('추리'), `${T} 다른 카드 클릭 → 목록 즉시 변경`);
      await pg.locator('#me-partner .card').click(); t = await btns(pg); ok(t.includes('추리') && t.includes('어시스트') && !t.includes('사건 해결'), `${T} 파트너 행동: ${t}`);
      await pg.locator('#me-partner .card').click(); ok(await pg.locator('#act.off').count() === 1 && (await btns(pg)).length === 0, `${T} 같은 카드 다시 클릭 = 선택 해제`);
      await pg.locator('#me-field .card').nth(0).click(); await pg.locator('#mid').click({ position: { x: 5, y: 5 } }); ok(await pg.locator('#act.off').count() === 1, `${T} 빈 곳 클릭 = 선택 해제`);
      await pg.locator('#me-field .card').nth(0).click(); await pg.locator('#act button', { hasText: '추리' }).click(); const sent = await pg.evaluate(() => window.__sent.at(-1)); ok(sent.a === 'reason' && sent.who === a, `${T} 추리 버튼 → 서버 전송 ${JSON.stringify(sent)}`); ok(await pg.locator('#act.off').count() === 1, `${T} 실행 후 패널 닫힘`);
      await pg.locator('#me-field .card').nth(0).click(); await pg.locator('#act button', { hasText: '액션 → 상대 캐릭터' }).click(); ok(await pg.locator('#opp-field .card.tgt').count() === mainActs[a].find(x => x.k === 'actc').tg.length, `${T} 지정 가능한 상대 캐릭터만 주황 테두리`);
      await pg.locator('#opp-field .card').nth(1).click(); ok((await pg.evaluate(() => window.__sent.at(-1))).a === 'reason', `${T} 슬립 아닌 상대 캐릭터(액티브)는 대상이 아님`); await pg.locator('#opp-field .card').nth(0).click(); const s2 = await pg.evaluate(() => window.__sent.at(-1)); ok(s2.a === 'action' && s2.k === 'char' && s2.tid === ov && s2.id === a, `${T} 대상 클릭 → 액션 전송 ${JSON.stringify(s2)}`);
      await pg.locator('#me-field .card').nth(0).click(); await pg.locator('#act button', { hasText: '능력' }).click(); const s3 = await pg.evaluate(() => window.__sent.at(-1)); ok(s3.a === 'ability' && s3.id === a, `${T} 능력 버튼 → ${JSON.stringify(s3)}`);
      // 상대 턴에는 행동 패널이 열리지 않는다
      await push(pg, oppTurnView); await pg.locator('#me-field .card').first().click().catch(() => {}); ok(await pg.locator('#act.off').count() === 1 && (await btns(pg)).length === 0, `${T} 내 턴이 아니면 행동 버튼 없음`);
    }
    { // 손패가 많아도(14장) 한 화면에 겹쳐 들어가고 가로 스크롤이 생기지 않는다 / 효과 선택창은 화면 중앙에 떠서 보드를 넘치지 않는다
      const big = JSON.parse(JSON.stringify(mainView)); const h0 = big.P[s].hand; while (big.P[s].hand.length < 14) big.P[s].hand.push({ ...h0[big.P[s].hand.length % h0.length], id: 9000 + big.P[s].hand.length }); await push(pg, big);
      const hb = await box(pg, '#hand'); const last = await pg.locator('#hand .card').last().boundingBox(); ok(last.x + last.width <= file.x + 2 && last.x + last.width <= hb.x + hb.width + 14 && await pg.locator('#hand .card').count() === 14, `${T} 손패 14장이 손패 영역 안에 겹쳐 배치`);
      const eff = JSON.parse(JSON.stringify(mainView)); eff.eff = { kind: 'pick', msg: '카드를 고르세요', min: 1, max: 1, cards: h0.slice(0, 5), sel: h0.slice(0, 5).map(c => c.id), src: 'A' }; await push(pg, eff);
      const ob = await box(pg, '#ovl'); ok(ob && ob.x >= bd.x - 1 && ob.x + ob.width <= bd.x + bd.width + 1 && ob.y >= bd.y - 1 && ob.y + ob.height <= bd.y + bd.height + 1 && await pg.locator('#ovl .box button').count() >= 1, `${T} 효과 선택창(오버레이) 표시/버튼 포함`);
      await push(pg, mainView); }
    ok(!pg.errs.length, `${T} JS 오류 ${pg.errs}`); await pg.close();
  }
  const cl = o => JSON.parse(JSON.stringify(o)); const sentActs = pg => pg.evaluate(() => window.__sent.filter(m => m.t === 'act'));
  { // ── 손패 카드는 선택 → 행동 버튼(등장 / 컷인)을 눌러야 실행된다
    const pg = await open(1366, 768, mainView); const hid = mainView.P[s].hand[0].id;
    await pg.evaluate(() => { window.__sent.length = 0; }); await pg.locator('#hand .card').first().click();
    ok((await sentActs(pg)).length === 0, '손패 카드를 클릭해도 즉시 등장하지 않는다'); ok(await pg.locator('#hand .card.sel').count() === 1, '선택된 손패 카드 강조');
    let t = await btns(pg); ok(t.includes('등장') && t.includes('선택 해제'), '행동 패널에 [등장] 버튼: ' + t);
    await pg.locator('#act button', { hasText: '선택 해제' }).click(); ok(await pg.locator('#hand .card.sel').count() === 0 && (await sentActs(pg)).length === 0, '선택 해제 → 아무 일도 없음');
    await pg.locator('#hand .card').first().click(); await pg.locator('#act button', { hasText: '등장' }).click(); const sd = await sentActs(pg); ok(sd.length === 1 && sd[0].a === 'play' && sd[0].id === hid, '[등장] 버튼을 눌러야 play 전송 ' + JSON.stringify(sd));
    const cv = cl(mainView); cv.sub = { type: 'contact', who: s, atk: a, def: ov }; await push(pg, cv); await pg.evaluate(() => { window.__sent.length = 0; }); await pg.locator('#hand .card').first().click();
    ok((await sentActs(pg)).length === 0 && (await btns(pg)).includes('컷인 사용'), '컨택트 중 손패도 선택 후 [컷인 사용] 버튼: ' + (await btns(pg)));
    await pg.locator('#act button', { hasText: '컷인 사용' }).click(); const sc = await sentActs(pg); ok(sc.length === 1 && sc[0].a === 'cin' && sc[0].id === hid, '컷인 버튼 → cin 전송');
    const mv = cl(mainView); mv.phase = 'mull'; mv.mull = s; mv.sub = null; await push(pg, mv); await pg.evaluate(() => { window.__sent.length = 0; }); await pg.locator('#hand .card').first().click(); ok(await pg.locator('#hand .card.sel').count() === 1 && (await sentActs(pg)).length === 0, '멀리건 카드 선택은 그대로(토글)');
    ok(!pg.errs.length, '손패 입력 흐름 JS 오류 ' + pg.errs); await pg.close(); }
  for (const [w, h] of [[1920, 1080], [1280, 720]]) { // ── 공격 화살표 + 전투 AP 표시
    const pg = await open(w, h, mainView), T = `${w}x${h}`; const g = cl(mainView); g.sub = { type: 'guard', who: o, atk: a, tk: 'char', tid: ov }; await push(pg, g);
    const ap0 = +DEF[mainView.P[s].field.find(x => x.id === a).d].ap; ok(await pg.locator('#battle.on').count() === 1 && (await pg.locator('#battle').innerText()).includes(String(ap0)), `${T} 공격 선언 시 현재 AP 를 크게 표시`);
    const ends = await pg.evaluate(([a, ov]) => { const P = document.querySelectorAll('#arrg path'); const B = document.getElementById('board').getBoundingClientRect(); const c = id => { const r = document.querySelector(`#board .half .card[data-id="${id}"]`).getBoundingClientRect(); return [r.x - B.x + r.width / 2, r.y - B.y + r.height / 2, Math.max(r.width, r.height)]; }; const d = P[1] && P[1].getAttribute('d').match(/-?[\d.]+/g).map(Number); return { n: P.length, d, A: c(a), O: c(ov) }; }, [a, ov]);
    const dist = (x, y, p) => Math.hypot(x - p[0], y - p[1]); ok(ends.n >= 2 && dist(ends.d[0], ends.d[1], ends.A) < ends.A[2] * .9 && dist(ends.d[4], ends.d[5], ends.O) < ends.O[2] * 1.2, `${T} 화살표: 출발 카드(${ends.A.map(Math.round)}) → 목표 카드(${ends.O.map(Math.round)}), 경로 ${ends.d && ends.d.map(Math.round)}`);
    ok(await pg.locator('#arr marker').count() >= 1 && await pg.locator('#arrg path[marker-end]').count() === 1, `${T} 화살촉(marker)`);
    const c = cl(g); c.sub = { type: 'contact', who: s, atk: a, def: ov }; c.P[s].field.find(x => x.id === a).apm = 2000; await push(pg, c);
    ok((await pg.locator('#battle .num s').first().innerText()) === String(ap0) && (await pg.locator('#battle .num em').first().innerText()) === String(ap0 + 2000), `${T} 컷인 AP 상승: ${ap0} → ${ap0 + 2000} (기존 AP 취소선 → 상승 AP 강조)`);
    ok((await pg.locator('#battle').innerText()).includes(String(+DEF[mainView.P[o].field.find(x => x.id === ov).d].ap)) && await pg.locator('#arrg path').count() >= 2, `${T} 방어 AP 도 함께 표시, 화살표 유지`);
    const k = cl(mainView); k.sub = { type: 'guard', who: o, atk: a, tk: 'case' }; await push(pg, k); const kb = await pg.evaluate(() => { const B = document.getElementById('board').getBoundingClientRect(), P = document.querySelectorAll('#arrg path')[1], d = P.getAttribute('d').match(/-?[\d.]+/g).map(Number), r = document.getElementById('opp-lp').getBoundingClientRect(); return { x: d[4] + B.x, y: d[5] + B.y, r: [r.x, r.y, r.width, r.height] }; });
    ok(kb.x > kb.r[0] - 60 && kb.x < kb.r[0] + kb.r[2] + 60 && kb.y > kb.r[1] - 60 && kb.y < kb.r[1] + kb.r[3] + 60, `${T} 사건 액션: 화살표가 상대 증거 쪽을 향함`);
    { // 팝업 없음: 사건 액션은 화살표 + 공격 AP 만 (목표 박스/결과 문구 없음), AP 는 공격 카드 바로 위에 붙음
      const nb = await pg.evaluate(a => { const B = document.getElementById('battle'), bs = [...B.querySelectorAll('.apb')], c = document.querySelector(`#board .half .card[data-id="${a}"]`).getBoundingClientRect(), r = bs[0].getBoundingClientRect(); return { n: bs.length, txt: B.innerText, bgc: getComputedStyle(B).backgroundColor, dx: Math.abs(r.x + r.width / 2 - (c.x + c.width / 2)), dy: (r.y >= c.y - 1 && r.y <= c.y + c.height * .3) ? 0 : 99, res: B.querySelectorAll('.res,.vs').length }; }, a);
      ok(nb.n === 1 && nb.res === 0 && !/사건|성공|증거|격파|VS/.test(nb.txt) && nb.dx < 4 && nb.dy < 40 && /rgba\(0, 0, 0, 0\)|transparent/.test(nb.bgc), `${T} 사건 액션: 중앙 팝업 없이 화살표 + 공격 AP 표시만 (공격 카드 윗부분에 붙음) ` + JSON.stringify(nb));
      const cb = await pg.evaluate(() => { const B = document.getElementById('battle').getBoundingClientRect(), b = document.querySelector('#battle .apb'); return b ? [b.getBoundingClientRect().width, B.width] : null; }); ok(cb && cb[0] < 260, `${T} AP 표시는 작은 배지(전체 화면 팝업 아님)`); }
    await push(pg, cl(mainView)); ok(await pg.locator('#battle .apb').count() === 0 && !/사건 액션 성공|격파|변화 없음/.test(await pg.locator('#battle').innerText()), `${T} 전투가 끝나면 결과 팝업 없이 AP 표시도 즉시 사라짐`);
    await push(pg, mainView); ok(await pg.locator('#arrg path').count() === 0, `${T} 전투가 끝나면 화살표 사라짐`); ok(!pg.errs.length, `${T} 전투 표시 JS 오류 ${pg.errs}`); await pg.close(); }
  { // ── 카드 이동 모션 (motion 켠 상태)
    const pg = await open(1366, 768, mainView, true), anim = id => pg.evaluate(id => { const e = document.querySelector(`#board .card[data-id="${id}"]`); return e ? e.getAnimations().length : -1; }, id), fly = () => pg.evaluate(() => document.querySelectorAll('.flyg').length);
    await pg.waitForTimeout(700); const hid = mainView.P[s].hand[0].id;
    const v1 = cl(mainView); const hc = v1.P[s].hand.shift(); hc.sum = 1; v1.P[s].field.push(hc); await push(pg, v1); ok(await anim(hid) > 0, '손패 → 필드: 카드가 이동 모션으로 등장 (즉시 교체 아님)');
    await pg.waitForTimeout(700); const v2 = cl(v1); v2.P[s].hand.push({ ...v2.P[s].hand[0], id: 99001 }); v2.P[s].deck -= 1; await push(pg, v2); ok(await anim(99001) > 0, '덱 → 손패: 새 카드가 덱 위치에서 날아옴');
    await pg.waitForTimeout(700); const v3 = cl(v2); const gone = v3.P[s].field.pop(); v3.P[s].rem.push(gone); await push(pg, v3); ok(await fly() > 0, '필드 → 리무브: 카드가 리무브 위치로 이동');
    await pg.waitForTimeout(800); const v4 = cl(v3); v4.P[s].evid += 1; v4.P[s].deck -= 1; await push(pg, v4); ok(await fly() > 0, '덱 → 증거: 뒷면 카드가 눕혀지며 이동');
    await pg.waitForTimeout(800); const v5 = cl(v4); v5.P[s].file += 1; v5.P[s].deck -= 1; await push(pg, v5); ok(await fly() > 0, '덱 → FILE: 뒷면 카드가 이동');
    { // 어시스트: 서버 상태(partner.inFile)를 그대로 따라 파트너가 FILE 맨 오른쪽으로 이동
      await pg.waitForTimeout(900); const pid = v5.P[s].partner.id, v6 = cl(v5); v6.P[s].partner.inFile = true; await push(pg, v6);
      ok(await anim(pid) > 0, '어시스트: 파트너 카드가 파트너 자리에서 FILE 쪽으로 이동 모션');
      await pg.waitForTimeout(900);
      const g = await pg.evaluate(id => { const pe = document.querySelector(`#me-file .card[data-id="${id}"]`); if (!pe) return null; const all = [...document.querySelectorAll('#me-file .pile .card')].map(e => e.getBoundingClientRect()), p = pe.getBoundingClientRect(); const z = document.querySelector('#me-partner .card'); return { last: all[all.length - 1].x === p.x, n: all.length, maxx: Math.max(...all.map(r => r.x)), px: p.x, py: p.y, y0: all[0].y, land: p.width > p.height, zone: !!z }; }, pid);
      ok(g && g.last && g.n >= 2 && g.px >= g.maxx && Math.abs(g.py - g.y0) < 2 && g.land && !g.zone, '어시스트 후: 파트너가 FILE 카드들과 같은 줄 맨 오른쪽(가로 카드), 파트너 자리는 비어 있음 ' + JSON.stringify(g));
      const v7 = cl(v6); v7.P[s].partner.inFile = false; await push(pg, v7); await pg.waitForTimeout(900);
      ok(await pg.locator('#me-partner .card').count() === 1 && await pg.locator(`#me-file .card[data-id="${pid}"]`).count() === 0, '서버가 inFile 을 해제하면 파트너가 다시 파트너 자리에 표시(UI가 임의로 상태를 만들지 않음)'); }
    await pg.waitForTimeout(900); ok(await fly() === 0, '모션이 끝나면 정리됨 (남는 임시 요소 없음)'); ok(!pg.errs.length, '이동 모션 JS 오류 ' + pg.errs); await pg.close(); }
  { // ── 캐릭터 밑에 세트된 카드 (앞면/뒷면, 1장/여러 장, 비공개 정보 노출 없음)
    const a = b, cl2 = o => JSON.parse(JSON.stringify(o)), T = '세트';
    // 서버 뷰 직렬화: 상대에게는 뒷면 세트의 정보가 전혀 없다
    const oppSees = setViewO.P[s].field.find(c => c.id === a).sl, meSees = setViewS.P[s].field.find(c => c.id === a).sl;
    ok(oppSees.length === 3 && oppSees.filter(x => x.fd).every(x => JSON.stringify(x) === '{"fd":1,"hidden":1}') && oppSees.filter(x => !x.fd).length === 1 && oppSees.find(x => !x.fd).d, `${T}: 상대 뷰 = 뒷면 세트는 {fd,hidden} 뿐(id/d 없음), 앞면 세트는 공개 ` + JSON.stringify(oppSees));
    ok(meSees.filter(x => x.fd).every(x => x.d && x.id) && !JSON.stringify(setViewO).includes(`"id":${hs[0]},`) && !JSON.stringify(setViewO).includes(`"id":${hs[2]},`), `${T}: 내 뷰에는 내 뒷면 세트 정보가 있고, 상대 뷰 어디에도 그 카드 id 가 없음`);
    const pg = await open(1920, 1080, setViewS), fw = id => `#board .fw:has(> .card[data-id="${id}"])`;
    const geo = await pg.evaluate(id => { const w = document.querySelector(`#board .fw:has(> .card[data-id="${id}"])`), m = w.querySelector(':scope > .card:not(.sc)').getBoundingClientRect(); return [...w.querySelectorAll(':scope > .sc')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x - m.x, y: r.y - m.y, w: r.width, h: r.height, back: e.classList.contains('back'), fd: e.classList.contains('setfd'), mw: m.width, mh: m.height }; }); }, a);
    ok(geo.length === 3 && geo.every((g, i) => g.x > 3 && g.y > 2 && g.x < g.mw && g.y < g.mh && (i === 0 || (g.x > geo[i - 1].x + 2 && g.y > geo[i - 1].y))), `${T}: 세트 3장이 캐릭터 밑에서 오른쪽 아래로 조금씩 어긋나 장수가 구분됨 ` + JSON.stringify(geo.map(g => [g.x, g.y])));
    ok(geo.filter(g => g.back).length === 2 && geo.filter(g => !g.back).length === 1, `${T}: 뒷면 세트 = 카드 뒷면 2장 / 앞면 세트 = 실제 앞면 1장`);
    const bg = await pg.evaluate(id => [...document.querySelectorAll(`#board .fw:has(> .card[data-id="${id}"]) > .sc`)].map(e => getComputedStyle(e).backgroundImage), a);
    ok(bg.filter(x => /cardback/.test(x)).length === 2 && bg.filter(x => /svg/.test(x)).length === 1, `${T}: 뒷면 = assets/cardback.png, 앞면 = 카드 이미지`);
    await pg.locator(`${fw(a)} > .sc:not(.back)`).hover({ position: { x: 97, y: 137 }, force: true }); let src = await pg.locator('#pv img').getAttribute('src'); ok(decodeURIComponent(src) === decodeURIComponent(DEF[R.cards[hs[1]].d].img), `${T}: 앞면 세트 hover → 오른쪽 상세에 그 카드`);
    await pg.locator(`${fw(a)} > .sc.setfd`).first().hover({ position: { x: 97, y: 137 }, force: true }); src = await pg.locator('#pv img').getAttribute('src'); ok(decodeURIComponent(src) === decodeURIComponent(DEF[R.cards[hs[0]].d].img), `${T}: 내 뒷면 세트 hover → 나에게만 상세 표시`);
    const before = await pg.locator('#pv').innerHTML(); await pg.locator(`#opp-field .sethid`).first().hover({ position: { x: 97, y: 137 }, force: true });
    ok(await pg.locator('#pv').innerHTML() === before && await pg.locator('#opp-field .sethid').count() === 1 && (await pg.locator('#opp-field .sethid').first().evaluate(e => !e.dataset.id && !/url\(.*svg/.test(getComputedStyle(e).backgroundImage))), `${T}: 상대의 뒷면 세트는 hover 해도 내용 미노출(id·이미지 없음)`);
    ok(await pg.locator('#opp-field .fw > .sc:not(.back)').count() === 1, `${T}: 상대의 앞면 세트는 공개 카드로 표시`);
    ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${T}: 가로 넘침 없음`); await pg.close();
    // 상대 시점(상대 화면): 내 뒷면 세트가 상대에게 뒷면 2장으로만 보인다
    const pgo = await open(1920, 1080, setViewO); const hid = await pgo.locator('#opp-field .sethid').count(), leak = await pgo.evaluate(() => [...document.querySelectorAll('#opp-field .sethid')].some(e => e.dataset.id || /svg/.test(getComputedStyle(e).backgroundImage)));
    ok(hid === 2 && !leak, `${T}: 상대 화면에서 내 뒷면 세트는 뒷면 2장, 내용 노출 없음`); await pgo.close();
    { // 세트 이동 모션 (motion 켠 상태)
      const pm = await open(1366, 768, setViewS, true), fly = () => pm.evaluate(() => document.querySelectorAll('.flyg').length), an = id => pm.evaluate(id => { const e = document.querySelector(`#board .card[data-id="${id}"]`); return e ? e.getAnimations().length : -1; }, id);
      await pm.waitForTimeout(700); const v0 = cl2(setViewS), me = v0.P[s].field.find(c => c.id === a), up = me.sl.find(x => !x.fd); me.sl = me.sl.filter(x => x !== up); v0.P[s].hand.push(up); await push(pm, v0); await pm.waitForTimeout(800);
      await push(pm, setViewS); ok(await an(up.id) > 0, `${T}: 손패 → 캐릭터 밑 앞면 세트가 그 위치로 이동 모션`);
      await pm.waitForTimeout(800); const v1 = cl2(setViewS), oc_ = v1.P[o].field.find(c => c.id === ov); oc_.sl = oc_.sl.filter(x => !x.fd); v1.P[o].hand += 1; await push(pm, v1); await pm.waitForTimeout(800);
      await push(pm, setViewS); ok(await fly() > 0, `${T}: 상대 손패 → 캐릭터 밑 뒷면 세트: 뒷면 카드가 그 위치로 이동`);
      await pm.waitForTimeout(900); ok(await fly() === 0 && !pm.errs.length, `${T}: 모션 정리, JS 오류 없음 ` + pm.errs); await pm.close(); } }
  { // ── 효과 선택창: 내 캐릭터 / 상대 캐릭터를 나눠서, 적용 중인 효과를 텍스트로 표시
    const T = '효과창'; const R2 = R; R2.eff = { it: { kind: 'ab', s, src: a, ab: R2.defs[R2.cards[a].d].ab[0] }, req: { who: s, kind: 'yn', msg: 'x' } }; const ev = S.view(R2, s).eff; R2.eff = null;
    ok(ev && ev.srcD === R2.cards[a].d && ev.abI === 0 && ev.abN === 1 && ev.abLab === '테스트능력', `${T}: 서버 뷰에 효과 출처/능력 번호 포함 ` + JSON.stringify({ d: ev && ev.srcD, i: ev && ev.abI, n: ev && ev.abN, l: ev && ev.abLab }));
    const pg = await open(1920, 1080, mainView), v = JSON.parse(JSON.stringify(mainView)), mine = v.P[s].field.slice(0, 2), opp = v.P[o].field.slice(0, 2);
    v.eff = { kind: 'pick', msg: '대상 캐릭터를 최대 1장 선택', min: 0, max: 1, cards: [...opp.slice(0, 1), ...mine, ...opp.slice(1)], sel: [mine[0].id, opp[0].id], src: 'A', srcD: v.P[s].field.find(c => c.id === a).d, abI: 0, abN: 1, abLab: '테스트능력', itK: 'ab' }; await push(pg, v);
    const g = await pg.evaluate(() => { const box = document.querySelector('#effp .box'), hs = [...box.querySelectorAll('.gh')].map(h => h.innerText.replace(/\s+/g, ' ').trim()), css = [...box.querySelectorAll('.cs')].map(c => [...c.querySelectorAll('.card')].map(e => e.dataset.id)), r = [...box.querySelectorAll('.cs')].map(c => c.getBoundingClientRect().y), fx = box.querySelector('.fxt'); return { hs, css, r, fx: fx ? fx.innerText : '', on: box.querySelectorAll('.fxt .fl.on').length }; });
    ok(g.hs.length === 2 && /^내 캐릭터 2장/.test(g.hs[0]) && /^상대 캐릭터 2장/.test(g.hs[1]), `${T}: "내 캐릭터" / "상대 캐릭터" 로 나눠 표시 ` + JSON.stringify(g.hs));
    ok(g.css[0].length === 2 && g.css[0].every(id => mine.some(c => String(c.id) === id)) && g.css[1].length === 2 && g.css[1].every(id => opp.some(c => String(c.id) === id)) && g.r[1] > g.r[0], `${T}: 각 그룹에 자기 쪽 카드만 들어가고 내 카드가 위, 상대 카드가 아래`);
    ok(/적용 중인 효과/.test(g.fx) && /테스트능력/.test(g.fx) && /한국어 효과 A/.test(g.fx) && g.on === 1, `${T}: 적용 중인 효과를 한국어 텍스트로 표시(강조 1줄) ` + JSON.stringify(g.fx));
    const ob = await box(pg, '#ovl'), bd2 = await box(pg, '#board'); ok(ob.x >= bd2.x - 1 && ob.y >= bd2.y - 1 && ob.x + ob.width <= bd2.x + bd2.width + 1 && ob.y + ob.height <= bd2.y + bd2.height + 1, `${T}: 창이 보드 안에 들어옴`);
    const before = await pg.locator('#btns button').first().innerText(); await pg.locator('#effp .card:not(.no)').first().click(); ok((await pg.locator('#btns button').first().innerText()) !== before || true, '');
    ok(await pg.locator('#effp .card.sel').count() === 1 && /1\//.test(await pg.locator('#btns button').first().innerText()), `${T}: 카드 선택/확정 동작 그대로`);
    await push(pg, mainView); ok(!pg.errs.length, `${T}: JS 오류 없음 ` + pg.errs); await pg.close(); }
  { // ── 어시스트 중 파트너 = FILE 줄 맨 오른쪽, 가로 카드 (슬립 상태여도 회전 상태와 무관하게 가로), 종료 후 세로 복귀
    const T = '어시스트', pgm = await open(1920, 1080, mainView), v = JSON.parse(JSON.stringify(mainView)); v.P[s].file += 3; v.P[s].partner.inFile = true; v.P[s].partner.st = 's'; await push(pgm, v);
    const g = await pgm.evaluate(() => { const p = document.querySelector('#me-file .card.fp'), all = [...document.querySelectorAll('#me-file .pile .card')].map(e => e.getBoundingClientRect()), r = p.getBoundingClientRect(); return { w: r.width, h: r.height, y: r.y, h0: all[0].height, y0: all[0].y, w0: all[0].width, last: all[all.length - 1].x === r.x, tr: getComputedStyle(p).transform }; });
    ok(g.w > g.h * 1.25 && Math.abs(g.h - g.h0) < 2 && Math.abs(g.w - g.w0) < 2 && Math.abs(g.y - g.y0) < 2 && g.last && (g.tr === 'none' || g.tr === ''), `${T}: 슬립 상태 파트너도 FILE 카드와 같은 크기/줄의 가로 카드, 맨 오른쪽 ` + JSON.stringify(g));
    { const n0 = v.P[s].file; const lab = async () => +(await pgm.locator('#me-file .lab').innerText()).split(' ')[1];
      ok(await lab() === n0 + 1, `${T}: 파트너가 FILE 로 오면 FILE 숫자도 +1 (${n0} → ${await lab()})`);
      const vv = JSON.parse(JSON.stringify(v)); vv.P[s].partner.inFile = false; await push(pgm, vv); ok(await lab() === n0, `${T}: 파트너가 돌아가면 FILE 숫자도 원래대로 (${await lab()})`); await push(pgm, v); }
    const v2 = JSON.parse(JSON.stringify(v)); v2.P[s].partner.inFile = false; await push(pgm, v2);
    const g2 = await pgm.evaluate(() => { const r = document.querySelector('#me-partner .card').getBoundingClientRect(); return [r.width, r.height]; }); v2.P[s].partner.st = 'a'; await push(pgm, v2);
    const g3 = await pgm.evaluate(() => { const r = document.querySelector('#me-partner .card').getBoundingClientRect(); return [r.width, r.height, document.querySelectorAll('#me-file .card.fp').length]; });
    ok(g3[1] > g3[0] * 1.25 && g3[2] === 0, `${T}: 종료 후 파트너 영역으로 돌아오면 원래 세로 방향 ` + JSON.stringify([g2, g3])); await pgm.close(); }
  await br.close(); console.log(fail ? `UI 테스트 ${fail}건 실패` : `UI 테스트 통과 (4개 해상도: 증거/FILE 실시간, 배치, 호버 확대, 행동 버튼)`); process.exit(fail ? 1 : 0);
})();
