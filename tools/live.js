const { chromium } = require('/workspace/wr_tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const [w,h] of [[1280,720],[1920,1080],[1366,768]]) {
 const ctx=await b.newContext({viewport:{width:w,height:h}}); const p=await ctx.newPage(); p.setDefaultTimeout(300000);
 const cdp=await ctx.newCDPSession(p); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 const e=[]; p.on('console',m=>{if(m.type()=='error'||m.type()=='warning')e.push(m.text())}); p.on('pageerror',x=>e.push('PAGEERR '+x.message));
 await p.goto(process.env.URL||'https://8vdpxdrv4c-dot.github.io/weather-sim/'); await p.waitForFunction('window.__ready===true',null,{timeout:120000}).catch(()=>e.push('not ready'));
 const info=await p.evaluate(()=>{const u=document.getElementById('ui'); const r=u&&u.getBoundingClientRect(); const top=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {exists:!!u, rect:r&&[r.x,r.y,r.width,r.height].map(Math.round), topEl: top&&(top.id||top.tagName), btns:document.querySelectorAll('#ui button').length}});
 if (w===1280) { const bb=await p.evaluate(()=>{const r=document.querySelector('button[data-w=rain]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}); await p.mouse.click(bb[0],bb[1]); await p.waitForTimeout(3000);
   info.cur = await p.evaluate(()=>document.querySelector('#ui button.on')?.dataset.w); await p.waitForTimeout(4000); }
 await p.screenshot({path:`/tmp/live_${w}.png`}); console.log(w,h,JSON.stringify(info),'errs:',JSON.stringify(e)); await ctx.close(); }
await b.close();})()
