const { chromium } = require('/workspace/wr_tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:320,height:320}}); const e=[]; p.on('pageerror',x=>e.push(x.message)); p.on('console',m=>{if(m.type()=='error')e.push(m.text())});
await p.goto('http://localhost:8941/?shot=1'); await p.waitForFunction('window.__ready===true'); await p.addStyleTag({content:'#ui,#hint,#title{display:none!important}'});
const acts=(process.env.ACTS||'idle').split(',');
for(const act of acts){ for(let i=0;i<5;i++) for(const [ai,ang] of [[0,0],[1,0.9],[2,-1.4]]){
  await p.evaluate(([i,ang,act])=>{ const {kids,camera,controls}=__dbg; setWeather(act==='rain'?'rain':'sunny',true);
    kids.forEach((k,j)=>{ kidAct(j, act==='rain'?'idle':act); }); simulate(act==='lie'?8:3);
    const k=kids[i]; const hp=new THREE_V(); k.userData.head.getWorldPosition(hp);
    const fwd=k.rotation.y+ang; const look=k.userData.w.lie>0.5; 
    controls.enabled=false;
    if(look){ camera.position.set(hp.x+Math.sin(fwd)*0.6, hp.y+2.0, hp.z+Math.cos(fwd)*0.6);} else camera.position.set(hp.x+Math.sin(fwd)*2.2, hp.y+0.05, hp.z+Math.cos(fwd)*2.2);
    camera.lookAt(hp); camera.fov=35; camera.updateProjectionMatrix(); __dbg.renderer.render(__dbg.scene,camera); },[i,ang,act]).catch(x=>e.push(x.message));
  await p.screenshot({path:`/tmp/face_${act}_${i}_${ai}.png`}); } }
console.log('errs',JSON.stringify(e)); await b.close();})();
