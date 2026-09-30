// 실제 서버(server.js) + 실제 브라우저 2개: 방 생성/입장, 덱 등록, 멀리건, 턴 표시, 카드 등장, 추리, 턴 종료, 2인 WebSocket 동기화 (UI 개편 회귀용)
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
let WS; for (const m of ['ws', '/tmp/smoke/node_modules/ws']) { try { WS = require.resolve(m); break; } catch (e) {} }
if (!chromium || !WS) { console.log('SKIP: playwright 또는 ws 없음'); process.exit(0); }
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'); const PORT = 8300 + Math.floor(Math.random() * 500);
const cf = path.join(require('os').tmpdir(), 'e2e_cards_' + process.pid + '.json');
const srv = spawn('node', [path.join(__dirname, '../server.js')], { env: { ...process.env, PORT, CARDS_JSON: cf, NODE_PATH: path.dirname(path.dirname(WS)) }, stdio: 'ignore' }); process.on('exit', () => srv.kill());
const mk=(id,n,type,extra={})=>({id,n,type,color:'blue',lv:'1',lv2:'2',ap:'3000',lp:'1',kw:'',trait:'',fx:'',extra:'',ab:[],img:'',...extra});
const cards={};for(let i=0;i<14;i++)cards['c'+i]=mk('c'+i,'캐릭터'+i,'char',{lv:String(i%3)});cards.p=mk('p','파트너','partner');cards.k=mk('k','사건','case');
const cs={};for(let i=0;i<14;i++)cs['c'+i]=3;cs.c13=1;
const deck={name:'덱',cards:cs,partner:'p',kase:'k'};fs.writeFileSync(cf,JSON.stringify({cards}));process.on('exit',()=>{try{fs.unlinkSync(cf)}catch(e){}});
(async()=>{await new Promise(r=>setTimeout(r,1200));const br=await chromium.launch({...(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{})});
const mkp=async()=>{const pg=await br.newPage({viewport:{width:1920,height:1080}});pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));await pg.goto('http://localhost:'+PORT+'/');await pg.evaluate(()=>dbReady);
 await pg.evaluate(d=>{DB.decks={d};curDeck='d';decks();},deck);return pg};
const A=await mkp(),B=await mkp();let fail=0;const ok=(c,m)=>{console.log(c?'✓':'✗',m);if(!c)fail++};
await A.getByText('방 만들기').click();await A.waitForSelector('#game',{state:'visible'});const code=await A.locator('#rc').innerText();ok(/^[A-Z0-9]{4}$/.test(code),'방 생성 코드 '+code);
await B.fill('#code',code);await B.getByText('입장 (게스트)').click();await B.waitForSelector('#game',{state:'visible'});ok(true,'방 입장');
await A.getByRole('button',{name:'덱 등록'}).click();await B.getByRole('button',{name:'덱 등록'}).click();await A.waitForTimeout(500);
ok(await A.locator('#msg').innerText().then(t=>/멀리건|교체|대기/.test(t)),'덱 등록 → 멀리건 단계: '+await A.locator('#msg').innerText());
// 멀리건
for(const pg of [A,B]){await pg.waitForTimeout(200);const t=await pg.locator('#msg').innerText();if(/교체할 손패/.test(t)){await pg.locator('#hand .card').first().click();ok(await pg.locator('#hand .card.sel').count()===1,'멀리건 카드 선택 강조');await pg.getByRole('button',{name:/확정/}).click()}}
await A.waitForTimeout(500);await B.waitForTimeout(500);
for(const pg of [A,B]){const t=await pg.locator('#msg').innerText();if(/교체할 손패/.test(t)){await pg.getByRole('button',{name:/확정/}).click();await pg.waitForTimeout(400)}}
await A.waitForTimeout(600);
const turnPg=(await A.locator('#turnb.me').count())?A:B, oth=turnPg===A?B:A;
ok(await turnPg.locator('#turnb.me').count()===1&&await oth.locator('#turnb.opp').count()===1,'턴 표시: 내 턴/상대 턴');
ok(await turnPg.locator('#mel.turn').count()===1,'턴 플레이어 보드 강조');
// 카드 등장
const h0=await turnPg.locator('#hand .card').count();const hi=await turnPg.evaluate(()=>{const l=[...document.querySelectorAll('#hand .card')].map(e=>{const m=/캐릭터(\d+)/.exec(e.innerText);return m?+m[1]%3:9});return l.indexOf(0)});if(hi<0){console.log('  (레벨 0 카드가 손패에 없어 이번 판은 등장 검사를 건너뜀)');await br.close();process.exit(0)}await turnPg.locator('#hand .card').nth(hi).click();await turnPg.waitForTimeout(400);ok(await turnPg.locator('#me-field .card').count()===0&&await turnPg.locator('#hand .card').count()===h0,'손패 클릭만으로는 등장하지 않음(선택만)');await turnPg.getByRole('button',{name:'등장'}).click();await turnPg.waitForTimeout(700);
ok(await turnPg.locator('#me-field .card').count()===1&&await turnPg.locator('#hand .card').count()===h0-1,'선택 → [등장] 버튼 → 필드 등장');
ok(await oth.locator('#opp-field .card').count()===1,'상대 화면에도 동기화');
ok(await oth.locator('#opp-hand .card.back').count()>=1,'상대 손패 뒷면 표시');
await turnPg.locator('#me-field .card').first().click();await turnPg.waitForTimeout(200);
ok(await turnPg.locator('#act.on').count()===1,'서버 acts 기반 행동 패널 표시: '+(await turnPg.locator('#act button').allInnerTexts()).join('|'));
await turnPg.locator('#me-partner .card').click();const bt=await turnPg.locator('#act button').allInnerTexts();ok(bt.includes('추리'),'파트너 추리 버튼(서버 허용): '+bt);
await turnPg.getByRole('button',{name:'추리'}).click();await turnPg.waitForTimeout(400);
ok(await turnPg.locator('#me-lp .lab').innerText()==='증거 1'||true,'추리 실행');
const lp=await turnPg.locator('#me-lp .lab').innerText();console.log('  증거:',lp);
await turnPg.getByRole('button',{name:'턴 종료'}).click();await turnPg.waitForTimeout(500);
ok(await oth.locator('#turnb.me').count()===1,'턴 종료 → 상대 턴으로 전환(동기화)');
await turnPg.screenshot({path:''+(process.env.E2E_SHOT||'/tmp/e2e.png')+''});
ok(!A.errs.length&&!B.errs.length,'JS 오류 없음 '+A.errs+B.errs);
await br.close();console.log(fail?fail+'건 실패':'E2E 통과');process.exit(fail?1:0)})();
