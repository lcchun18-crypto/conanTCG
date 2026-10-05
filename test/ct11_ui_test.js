// v1.13.0: CT-P11 신규 88장 — 실제 서버(/api/cards)에서 로드 → 덱 빌더 검색/추가/상세, 이미지 로드, 특징·KO 텍스트 표시
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const NEW = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ct11_ids.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const PORT = 3900 + (process.pid % 90); const sv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}); let code = 0;
  try { const pg = await (await br.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); await pg.goto(`http://localhost:${PORT}/`);
    await pg.waitForFunction(() => typeof DB !== 'undefined' && DB.cards && Object.keys(DB.cards).length > 1000, null, { timeout: 20000 });
    const n = await pg.evaluate(() => Object.keys(DB.cards).length); ok(n === 1339, `클라이언트 DB ${n}장`);
    const r = await pg.evaluate(async ids => { openDB(); const out = { miss: [], noimg: [], badimg: [], bpv: [], find: [], add: [] };
      const loadImg = u => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = u; });
      for (const id of ids) { const c = DB.cards[id]; if (!c) { out.miss.push(id); continue; } if (!c.img) { out.noimg.push(id); continue; } if (!(await loadImg(c.img))) out.badimg.push(id);
        try { bPv(id); const chips = [...document.querySelectorAll('#dbChips span')].map(x => x.textContent); const tr = String(c.trait || '').split(',').map(x => x.trim()).filter(Boolean); if (!tr.every(t => chips.includes(t)) || !chips.some(x => x.includes(id))) out.bpv.push(id); } catch (e) { out.bpv.push(id + ':' + e.message); }
        try { const q = document.getElementById('dbQ'); q.value = c.n; q.dispatchEvent(new Event('input', { bubbles: true })); bRender(); if (!bList.some(x => x.id === id)) out.find.push(id); } catch (e) { out.find.push(id + ':' + e.message); } }
      return out; }, NEW);
    ok(!r.miss.length, '88장 모두 클라이언트 DB 에 존재 ' + r.miss.join(',')); ok(!r.noimg.length, '이미지 경로 있음 ' + r.noimg.join(',')); ok(!r.badimg.length, '이미지 실제 로드 ' + r.badimg.join(','));
    ok(!r.bpv.length, '덱 빌더 상세 패널(특징 badge/카드 ID) ' + r.bpv.slice(0, 5).join(',')); ok(!r.find.length, '덱 빌더 이름 검색으로 찾힘 ' + r.find.slice(0, 5).join(','));
    const add = await pg.evaluate(ids => { const bad = []; for (const id of ids) { const c = DB.cards[id]; bNew(); try { bAdd(id); } catch (e) { bad.push(id + ':' + e.message); continue; } const got = c.type === 'case' ? W.kase === id : c.type === 'partner' ? W.partner === id : W.cards[id] === 1; if (!got) bad.push(id); } return bad; }, NEW);
    ok(!add.length, '덱 빌더에 88장 각각 추가(캐릭터/이벤트=덱, 사건/파트너=슬롯) ' + add.slice(0, 4).join(','));
    ok(errs.length === 0, '페이지 오류 없음 ' + errs.slice(0, 2).join('|')); } catch (e) { ok(false, '예외 ' + e.message); } finally { await br.close(); sv.kill(); }
  console.log(`ct11_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
