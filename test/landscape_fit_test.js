process.chdir('/mnt/user-data/outputs/conan-sim');
const U=require('/mnt/user-data/outputs/conan-sim/test/mz_util');const {G,dummy,field,hand,act,S}=U;let chromium;for(const m of ['playwright','/opt/node-tools/node_modules/playwright']){try{({chromium}=require(m));break}catch(e){}}
const defs={k:{n:'K',type:'case',color:'red',lv:'2',lv2:'3'},p:{n:'P',type:'partner',color:'red',lp:'1'}};for(let i=0;i<5;i++)defs['c'+i]=dummy('캐릭'+i,{color:'red',ap:'3000',lp:'1'});for(let i=0;i<6;i++)defs['h'+i]=dummy('손패'+i,{color:'red',lv:'0',ap:'2000',lp:'1'});defs.e=dummy('상대',{color:'red'});defs.long=U.real('id_0438',{color:'red'});
const K=Object.keys(defs).filter(k=>!['k','p'].includes(k));const R=G(defs,K,K,{p:defs.p,k:defs.k});const s=R.turn;const c0=field(R,s,'long');field(R,s,'c1');field(R,s,'c2');
field(R,1-s,'e');for(let i=0;i<6;i++)hand(R,s,'h'+i);
(async()=>{const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [w,h,m] of [[832,384,1],[780,310,1],[1913,898,0],[1280,520,0],[1000,450,0]]){
 const ctx=await br.newContext(m?{viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:w,height:h}});const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.addInitScript(()=>{window.__sent=[];window.WebSocket=class{constructor(){this.readyState=1;window.__ws=this}send(d){window.__sent.push(JSON.parse(d))}close(){}}});
 await pg.goto('file:///mnt/user-data/outputs/conan-sim/index.html');await pg.evaluate(x=>window.__ws.onmessage({data:JSON.stringify(x)}),{t:'defs',defs:R.defs});await pg.evaluate(x=>window.__ws.onmessage({data:JSON.stringify(x)}),JSON.parse(JSON.stringify(S.view(R,s))));await pg.waitForTimeout(300);
 // select a field char
 const sel=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#board .card')].find(x=>x.closest('#myField, .mine, #zf1')|| false);return !!c});
 await pg.evaluate(()=>{const cs=[...document.querySelectorAll('.card')].filter(x=>x.getBoundingClientRect().height>0);const mine=cs.filter(x=>x.getBoundingClientRect().top>innerHeight/2);const fc=cs.filter(x=>x.closest('.z-field')&&x.getBoundingClientRect().top>innerHeight/2);(fc[0]||mine[0]||cs[0]).click()});await pg.waitForTimeout(250);
 const info=await pg.evaluate(()=>{const a=document.getElementById('act');const bs=[...(a?a.querySelectorAll('button'):[])].map(b=>{const r=b.getBoundingClientRect();return{t:b.textContent.trim(),top:Math.round(r.top),bot:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)}});return{vw:innerWidth,vh:innerHeight,sh:document.documentElement.scrollHeight,bodyOv:getComputedStyle(document.body).overflow,bodyH:document.body.getBoundingClientRect().height,act:a?{top:Math.round(a.getBoundingClientRect().top),bot:Math.round(a.getBoundingClientRect().bottom)}:null,bs,cw:getComputedStyle(document.documentElement).getPropertyValue('--cw')}});
 console.log(w+'x'+h,info.bs.length?'':'NO BUTTONS');if(!info.bs.length||info.bs.some(b=>b.bot>info.vh||b.top<0||b.r>info.vw)){console.log('FAIL 버튼이 화면 밖',JSON.stringify(info));process.exitCode=1}await pg.screenshot({path:`/tmp/lf_${w}x${h}.png`});await ctx.close();}
await br.close()})();
