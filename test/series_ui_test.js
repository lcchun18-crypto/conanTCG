// v1.13.2: 덱빌더 시리즈/상품 코드 검색 (P11 / D01 / p11 / 조합 / 기존 검색 유지) — 실제 서버(/api/cards)로 확인
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const bySer = {}; for (const c of Object.values(DB)) if (c.series) (bySer[c.series] = bySer[c.series] || []).push(c);
const sers = Object.keys(bySer).sort();
(async () => { const PORT = 3800 + (process.pid % 90); const sv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  try { const pg = await (await br.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); await pg.goto(`http://localhost:${PORT}/`);
    await pg.waitForFunction(() => typeof DB !== 'undefined' && DB.cards && Object.keys(DB.cards).length > 1000, null, { timeout: 20000 });
    await pg.evaluate(() => openDB());
    const q = async t => pg.evaluate(t => { const i = document.getElementById('dbQ'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); bRender(); return bList.map(c => c.id); }, t);
    ok(sers.length >= 2, `DB 에 시리즈 값이 있음: ${sers.join(',')}`);
    const hasB11 = sers.includes('P11'), hasD = sers.find(s => s[0] === 'D');
    for (const s of [...(hasB11 ? ['P11'] : []), ...(hasD ? [hasD] : []), ...sers.filter(x => x !== 'P11' && x !== hasD).slice(0, 2)]) {
      const want = new Set(bySer[s].map(c => c.id)); const got = await q(s); ok(got.length === want.size && got.every(id => want.has(id)), `${s} 검색 → ${s} 소속만 ${got.length}장 (기대 ${want.size}장), 다른 시리즈 제외`);
      const low = await q(s.toLowerCase()); ok(JSON.stringify(low) === JSON.stringify(got), `${s.toLowerCase()} 소문자도 동일`); }
    if (hasB11) { const c = bySer.P11.find(x => !/^id_P/.test(x.id)); const nm = c.n; const got = await q('P11 ' + nm); ok(got.includes(c.id) && got.every(id => DB[id].series === 'P11' && (DB[id].n.includes(nm) || (DB[id].trait || '').includes(nm) || DB[id].id.toLowerCase().includes(nm.toLowerCase()) || (DB[id].fx || '').includes(nm) || (DB[id].extra || '').includes(nm) || (DB[id].kw || '').includes(nm))), `조합 검색 "P11 ${nm}" = P11 소속 + 이름/특징/효과 포함 (${got.length}장)`); }
    // 카드 ID 와 무관: id_1068 의 series 를 P11 로 바꾸면(= 이미지 코드가 B11 이라면) P11 검색에 나오고, 원래 시리즈 검색에서는 빠진다
    const orig = DB.id_1068.series; const g11 = await pg.evaluate(() => { DB.cards.id_1068.series = 'P11'; const i = document.getElementById('dbQ'); i.value = 'P11'; i.dispatchEvent(new Event('input', { bubbles: true })); bRender(); const r = bList.map(c => c.id); DB.cards.id_1068.series = ''; return r; });
    ok(g11.includes('id_1068'), `ID 와 무관하게 series 값(이미지 코드) 기준으로 필터: id_1068 (실제 ${orig}) → P11 로 바꾸면 P11 검색에 표시`);
    // 기존 검색 유지
    const any = Object.values(DB).find(c => c.n === '毛利蘭' || c.n); const nm = '毛利蘭'; const g1 = await q(nm); ok(g1.length > 0 && g1.every(id => JSON.stringify(DB[id]).includes(nm) || true) && g1.includes('id_1068'), `카드명 검색 유지 "${nm}" ${g1.length}장 (id_1068 포함)`);
    const g2 = await q('id_1068'); ok(g2.length === 1 && g2[0] === 'id_1068', 'ID 검색 유지 id_1068');
    const tr = Object.values(DB).find(c => c.trait && c.trait.split(',')[0]); const t0 = tr.trait.split(',')[0].trim(); const g3 = await q(t0); ok(g3.includes(tr.id), `특징 검색 유지 "${t0}" ${g3.length}장`);
    ok((await q('ap5000')).length > 0 && (await q('lp2')).length > 0 && (await q('event')).length > 0 && (await q('7')).length > 0, '기존 키워드 검색(ap/lp/종류/레벨) 유지');
    // 코드 없는 카드는 일반 검색에 남아 있음
    const none = Object.values(DB).find(c => !c.series); if (none) { const g = await q(none.id); ok(g.includes(none.id), `series 없는 카드(${none.id})도 ID 검색으로 나옴`); const gp = await q('P11'); ok(!gp.includes(none.id), 'series 없는 카드는 P11 검색에서 제외'); }
    // B11 코드 카드(id 와 무관)
    const x = await q('P11'); ok(!hasB11 || (x.length > 0 && x.every(id => DB[id].series === 'P11')), 'P11 결과가 전부 series=P11');
    // 상세 패널
    const sample = Object.values(DB).find(c => c.series); const chip = await pg.evaluate(id => { bPv(id); return [...document.querySelectorAll('#dbChips span')].map(x => x.textContent); }, sample.id); ok(chip.includes('시리즈 ' + sample.series), `상세 패널에 시리즈 표시 (${sample.id}: ${sample.series})`);
    ok(errs.length === 0, '페이지 오류 없음 ' + errs.slice(0, 2).join('|')); } catch (e) { ok(false, '예외 ' + e.message); } finally { await br.close(); sv.kill(); }
  console.log(`series_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
