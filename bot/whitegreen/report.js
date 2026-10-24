// Decision Log → 마크다운 (Korean). 판단 근거(why)·후보·상태를 사람이 읽을 수 있게 정리한다.
const KIND = { mulligan: '멀리건', mull: '멀리건', main: '메인', play: '카드 사용', assist: '조수', hint: '다음 힌트', 'hint-skip': '힌트 생략', declare: '선언 사용', removeTarget: '제거 대상', effect: '효과 처리', attack: '공격', 'evidence-attack': '증거 공격', reason: '추리', solve: '사건 해결', end: '턴 종료', guard: '방어', cutin: '끼어들기', 'cutin-pass': '끼어들기 패스', disguise: '변장', misread: '오독' };
const cardsTxt = a => (a || []).map(c => typeof c === 'string' ? c : (c.n || c.name || c.id)).join(', ') || '-';
const fv = v => Array.isArray(v) ? '[' + v.map(x => x && typeof x === 'object' ? (x.name || JSON.stringify(x)) + (x.lv != null ? '(Lv' + x.lv + ')' : '') : x).join(', ') + ']' : v && typeof v === 'object' ? JSON.stringify(v) : v;
function side(s) { if (!s) return '-'; return `FILE ${s.file ?? '-'}${s.pIn && typeof s.file === 'number' ? `+파트너(=${s.file + 1})` : ''} · 손패 ${Array.isArray(s.hand) ? s.hand.length : s.handCount ?? '-'} · 필드[${cardsTxt(s.field)}] · 증거 ${Array.isArray(s.evidence) ? s.evidence.length : s.evidence ?? '-'} · 덱 ${s.deck ?? '-'}`; }
function md(match) { const r = match.result, o = [];
  o.push(`# 백녹이기기 self-play Decision Log`, '', `- AI A: ${r.aiVersions.A} / AI B: ${r.aiVersions.B}`, `- 선공: AI ${r.first} · 승자: ${r.winner ? 'AI ' + r.winner : '미종료'}${r.unfinished ? ' (' + r.unfinished + ')' : ''} · 총 ${r.turns}턴 · 결정 ${r.decisions}회`,
    `- 최종 증거 A ${r.finalEvidence.A} / B ${r.finalEvidence.B} · 최종 FILE A ${r.finalFile.A} / B ${r.finalFile.B}`, `- seed ${r.seed} · 불법수 대체 ${r.illegalFallbacks}회`, '');
  let turn = -1;
  for (const d of match.decisions) { if (d.turn !== turn) { turn = d.turn; o.push(`## 턴 ${turn}`, ''); }
    const st = d.state || {};
    o.push(`### #${d.n} AI ${d.ai} — ${KIND[d.decisionKind] || d.decisionKind || d.kind}`, `- 선택: **${d.chosen}**`, `- 이유: ${d.why || '-'}${d.rule ? ' _(' + d.rule + ')_' : ''}`);
    { const cs = d.candidates && (d.candidates.shown || d.candidates); if (Array.isArray(cs) && cs.length) o.push(`- 후보(${d.candidates.total || cs.length}): ` + cs.slice(0, 8).map(c => (c.chosen ? '★' : '') + (typeof c === 'string' ? c : c.desc || c.text || JSON.stringify(c))).join(' / ') + (cs.length > 8 ? ' …' : '')); }
    if (d.factors && Object.keys(d.factors).length) o.push(`- 요인: ` + Object.entries(d.factors).map(([k, v]) => `${k}=${fv(v)}`).join(', '));
    o.push(`- 내 상태: ${side(st.me)}`, `- 상대 상태: ${side(st.opp)}`);
    if (st.me && st.me.hand && Array.isArray(st.me.hand)) o.push(`- 내 손패: ${cardsTxt(st.me.hand)}`);
    if (d.notes && d.notes.length) o.push(`- 메모: ${[].concat(d.notes).join(' / ')}`);
    o.push(''); }
  return o.join('\n'); }
module.exports = { md };
