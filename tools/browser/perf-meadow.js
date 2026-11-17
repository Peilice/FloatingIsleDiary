// 草地主畫面每格時間：node tools/browser/shot.js tools/browser/perf-meadow.js（需先開遊戲伺服器）
// 2026-11-17 參考值（桌機無頭 Chrome）：美術改版前 median 約 16 ms；手帳風未烘焙約 42 ms；烘焙後約 10 ms
await go('http://localhost:8080/?save=perf&unlock=1&reset=1');
await go('http://localhost:8080/?save=perf&unlock=1');
await click(640, 410); await wait(1500);
await click(735, 300); await wait(900);
await js(`(()=>{const sc=__ci.scene, s=sc.s; while(sc.modal){ try{sc.closeModal()}catch(e){} sc.modal=null; } sc.banner && sc.banner.setAlpha(0);
  const kinds=['carrot','bean','rose','corn','potato','grape']; s.plots.forEach((p,i)=>{ p.plant=kinds[i]; p.progress=0.9; p.water=0.6; }); return 1})()`);
await wait(1000);
// 量 300 格：每格 game.step 的 CPU 時間（含繪製）
log(await js(`(()=>{ const g=__ci.scene.game; const ts=[]; let t=g.loop.now||performance.now();
  for(let i=0;i<300;i++){ const a=performance.now(); t+=16.67; g.loop.now=t; g.step(t,16.67); ts.push(performance.now()-a); }
  ts.sort((a,b)=>a-b); return 'median ' + ts[150].toFixed(2) + ' ms, p90 ' + ts[270].toFixed(2) + ' ms'; })()`));
