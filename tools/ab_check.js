// 효과(ab) 엔진 검증: 입력(stdin) {cards:{id:ab[]}, base:{id:ab[]}} → 출력 [{id,where,msg}]
// fx.js 의 cleanAb(엔진이 실제로 쓰는 정리 함수)로 정리한 결과와 입력을 비교한다. 기존 DB 에서 이미 생기던 차이(긴 문자열 절단 등)는 base 와 비교해 무시한다.
const path = require('path'); const S = require(path.join(__dirname, '..', 'server.js')); const FX = S.FX;
let raw = ''; process.stdin.on('data', d => raw += d).on('end', () => {
  const inp = JSON.parse(raw), out = [];
  const diffs = (a, b, p, acc) => {
    if (a && typeof a === 'object' && !Array.isArray(a)) { if (!b || typeof b !== 'object' || Array.isArray(b)) { acc.push([p, 'type', a, b]); return; }
      for (const k of Object.keys(a)) { if (!(k in b)) acc.push([p + '.' + k, 'dropped', a[k], undefined]); else diffs(a[k], b[k], p + '.' + k, acc); } }
    else if (Array.isArray(a)) { if (!Array.isArray(b) || b.length !== a.length) { acc.push([p, 'len', a, b]); return; } a.forEach((x, i) => diffs(x, b[i], p + '[' + i + ']', acc)); }
    else if (a !== b) acc.push([p, 'value', a, b]); };
  const origAt = (ab, p) => { try { return eval('ab' + p.replace(/^ab/, '').replace(/\.([A-Za-z_]\w*)/g, '["$1"]')); } catch (e) { return undefined; } };
  const run = ab => { const cleaned = FX.cleanAb(ab), acc = []; ab.forEach((a, i) => { if (cleaned[i] === undefined) acc.push([`[${i}]`, 'dropped', a, undefined]); else diffs(a, cleaned[i], `[${i}]`, acc); }); if (ab.length > 10) acc.push(['', 'toomany', ab.length, 10]); return acc; };
  const sig = d => d[0] + '|' + d[1] + '|' + JSON.stringify(d[2]) + '|' + JSON.stringify(d[3]);
  for (const [id, ab] of Object.entries(inp.cards)) {
    if (!Array.isArray(ab)) { out.push({ id, where: 'Abilities 시트', msg: 'ab 형식이 배열이 아닙니다' }); continue; }
    let acc; try { acc = run(ab); } catch (e) { out.push({ id, where: 'Abilities/Ops 시트', msg: '효과 데이터를 해석할 수 없습니다: ' + e.message }); continue; }
    if (!acc.length) continue;
    const hasBase = !!(inp.base && inp.base[id]); const known = new Set(hasBase ? run(inp.base[id]).map(sig) : []);
    for (const d of acc) { if (known.has(sig(d))) continue;
      const m = /^\[(\d+)\](.*)$/.exec(d[0]) || [0, '?', d[0]]; const abi = m[1], rest = m[2];
      const where = `ab_index ${abi}` + (rest ? ' ' + rest.replace(/\[(\d+)\]/g, '[$1]') : '');
      let msg;
      if (/\.op$/.test(rest) && d[3] === 'manual') msg = `지원되지 않는 효과 primitive '${d[2]}' — 현재 엔진에 없는 효과입니다 (새 효과 로직은 코드 구현이 필요합니다)`;
      else if (rest === '.ic' && d[3] === 'manual') msg = `알 수 없는 trigger(ic) '${d[2]}'`;
      else if (d[1] === 'dropped') msg = `엔진이 인식하지 못하는 항목입니다: ${rest.split('.').pop() || rest} (철자/위치를 확인하세요, 값: ${JSON.stringify(d[2]).slice(0, 50)})`;
      else if (d[1] === 'toomany') msg = `능력(ab)은 카드당 10개까지만 사용됩니다 (${d[2]}개)`;
      else msg = `허용되지 않는 값입니다: ${JSON.stringify(d[2]).slice(0, 60)} (엔진이 ${JSON.stringify(d[3]) === undefined ? '무시' : JSON.stringify(d[3]).slice(0, 40) + ' 로 대체'}함)`;
      out.push({ id, where: 'Abilities/Ops 시트, ' + where, msg, level: (!hasBase && d[1] === 'value') ? 'WARN' : 'ERROR' }); } }
  process.stdout.write(JSON.stringify(out)); });
