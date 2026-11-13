// 模擬 M1 生長模型（與 game.js 參數一致），以 1 秒為步長
const DAY=60;
const WEATHER={sunny:{light:1,dry:.02,rain:0},cloudy:{light:.4,dry:.012,rain:0},rainy:{light:.15,dry:0,rain:.08},windy:{light:.8,dry:.03,rain:0}};
const PICK=[['sunny',.4],['cloudy',.25],['rainy',.25],['windy',.1]];
const PLANTS={carrot:{need:.3,secs:20},bean:{need:.5,secs:24},rose:{need:.7,secs:30}};
function next(prev){let p=prev,g=0;while(p===prev&&g++<50){let r=Math.random(),a=0;for(const [k,w] of PICK){a+=w;if(r<=a){p=k;break}}}return p}
function run(plant,shaded,strategy,maxDays=60){
  const P=PLANTS[plant]; let w='sunny', water=.9, prog=0; // 種下時澆過一次(0.3+0.6)
  let zeroStreak=0,maxZero=0;
  for(let d=1;d<=maxDays;d++){
    let grew=0;
    for(let s=0;s<DAY;s++){
      const W=WEATHER[w], light=W.light*(shaded?.5:1);
      water=Math.max(0,Math.min(1,water-W.dry+W.rain));
      if(strategy==='diligent'&&water<.25) water=Math.min(1,water+.6); // 勤勞：快乾就澆
      if(water>=.2&&light>=P.need&&prog<1){prog=Math.min(1,prog+1/P.secs);grew+=1/P.secs}
    }
    if(grew===0){zeroStreak++;maxZero=Math.max(maxZero,zeroStreak)}else zeroStreak=0;
    if(prog>=1) return {days:d,maxZero};
    w=next(w);
  }
  return {days:Infinity,maxZero};
}
const out=[];
for(const plant of Object.keys(PLANTS)) for(const shaded of [false,true]) for(const strat of ['diligent','lazy']){
  const N=3000, res=[]; let zs=[];
  for(let i=0;i<N;i++){const r=run(plant,shaded,strat);res.push(r.days);zs.push(r.maxZero)}
  const fin=res.filter(x=>isFinite(x)).sort((a,b)=>a-b);
  const stuck=(N-fin.length)/N;
  const mean=fin.length?(fin.reduce((a,b)=>a+b,0)/fin.length):NaN;
  const p90=fin.length?fin[Math.floor(fin.length*.9)]:NaN;
  const maxz=Math.max(...zs);
  out.push({plant,shaded,strat,mean:+mean.toFixed(2),p90,max:fin.length?fin[fin.length-1]:'-',stuck:+(stuck*100).toFixed(1),worstZeroStreakDays:maxz});
}
console.table(out);
// 天氣統計：連續無生長天(對 carrot 不遮蔭)
let streak=0,max=0,w='sunny',tot=0;
for(let d=0;d<200000;d++){ if(WEATHER[w].light<.3){streak++;max=Math.max(max,streak)}else streak=0; w=next(w); }
console.log('最長連續「光照低於0.3」天數(隨機 20 萬天):',max);
// 平均每天可用光照
let L=0;w='sunny';for(let d=0;d<200000;d++){L+=WEATHER[w].light;w=next(w)}console.log('平均光照',(L/200000).toFixed(3));
