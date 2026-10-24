// 백녹이기기 self-play → 실제 게임 UI(index.html, 관전 화면=양쪽 손패 공개) 영상 녹화.
// 사용: node tools/wg_record.js [--seed N] [--first 0|1] [--out DIR] [--name white-green-selfplay-001] [--hold MS] [--vA 0.1 --vB 0.1]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i < 0 ? d : A[i + 1]; };
const seed = +arg('seed', 1), first = arg('first', null), out = path.resolve(arg('out', './out')), name = arg('name', 'white-green-selfplay-001'), hold = +arg('hold', 900);
const SP = require('../bot/whitegreen/selfplay.js'), RP = require('../bot/whitegreen/report.js');
fs.mkdirSync(out, { recursive: true });
const match = SP.playMatch({ seed, first: first == null ? undefined : +first, versionA: arg('vA'), versionB: arg('vB'), frames: true });
fs.writeFileSync(path.join(out, name + '.result.json'), JSON.stringify(match.result, null, 1));
fs.writeFileSync(path.join(out, name + '.decisions.json'), JSON.stringify(match.decisions, null, 1));
fs.writeFileSync(path.join(out, name + '.decision-log.md'), RP.md(match));
fs.writeFileSync(path.join(out, name + '.search-log.md'), '# 서치 이벤트 선택 기록\n\n' + match.decisions.filter(d => /^\[서치\]/.test(d.why || '')).map(d => `## #${d.n} · AI ${d.ai} · ${d.turn}턴\n\n${String(d.why).split('\n').map(l => '- ' + l).join('\n')}\n`).join('\n'));
console.log('경기 완료:', JSON.stringify({ winner: match.result.winner, turns: match.result.turns, decisions: match.result.decisions }));
if (arg('norec', null) != null) process.exit(0);
(async () => { const { chromium } = require('playwright'); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const vdir = path.join(out, '_vid'); fs.rmSync(vdir, { recursive: true, force: true });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: vdir, size: { width: 1280, height: 720 } } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(() => { try { window.__ws.onopen && window.__ws.onopen(); } catch (e) {} });
  await pg.evaluate(() => { const d = document.createElement('div'); d.id = 'wgcap'; d.style.cssText = 'position:fixed;right:12px;top:64px;width:330px;max-height:70vh;overflow:hidden;z-index:99999;background:#000c;color:#fff;border:2px solid #f2bd4b;border-radius:10px;padding:8px 14px;font:600 15px system-ui,sans-serif;pointer-events:none;text-align:left;display:none'; document.body.appendChild(d); });
  const defs = match.frames[0].defs; await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), defs);
  let k = 0; for (const f of match.frames.slice(1)) { await pg.evaluate(([v, cap]) => { window.__ws.onmessage({ data: v }); const c = document.getElementById('wgcap'); if (cap) { c.style.display = ''; c.innerHTML = `<span style="color:#f2bd4b">#${cap.n} AI ${cap.ai} (${cap.ai==='A'?'플레이어 1·호스트':'플레이어 2·게스트'})</span><br> · ${cap.text || ''}<br><span style="font-weight:400;font-size:12px;line-height:1.35;color:#cfe">${(cap.why || '').slice(0, 800).replace(/\n/g, '<br>')}</span>`; } else c.style.display = 'none'; }, [f.view, f.cap ? { ...f.cap, text: String(f.cap.text || '').replace(/[<>&]/g, ''), why: String(f.cap.why || '').replace(/[<>&]/g, '') } : null]); await pg.waitForTimeout(f.cap && /^\[서치\]/.test(String(f.cap.why || '')) ? hold * 4 : hold); k++; }
  await pg.waitForTimeout(2500); const vp = pg.video(); await ctx.close(); const webm = await vp.path(); await br.close();
  const mp4 = path.join(out, name + '.mp4'); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'veryfast', '-movflags', '+faststart', mp4]); fs.rmSync(vdir, { recursive: true, force: true });
  console.log('영상:', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB', '프레임', k, '페이지 오류', errs.length, errs.slice(0, 3).join('|')); process.exit(0); })();
