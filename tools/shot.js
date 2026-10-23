const { chromium } = require('/workspace/wr_tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({
   executablePath: process.env.CHROME || '/usr/bin/google-chrome',
   args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
 });
 const p=await b.newPage({viewport:{width:1280,height:720}}); p.setDefaultTimeout(300000);
 const errs=[]; p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
 const base=process.env.URL||'http://localhost:8943/';
 await p.goto(base+'?shot=1');
 await p.waitForFunction('window.__ready===true',null,{timeout:240000});
 const list=(process.argv[2]||'spring,summer,autumn,winter').split(',');
 for(const w of list){
   await p.evaluate(w=>window.setWeather(w,true),w);
   await p.evaluate((w)=>{ window.simulate(w==='winter'||w==='spring'?8:5); },w);
   await p.screenshot({path:`/workspace/weather-v3/screenshots/${w}.png`});
   console.log('shot',w);
 }
 console.log('ERRS:\n'+errs.join('\n')); await b.close();
})();
