const DAY=60;
const WEATHER={sunny:{light:1,dry:.02,rain:0},cloudy:{light:.4,dry:.012,rain:0},rainy:{light:.15,dry:0,rain:.08},windy:{light:.8,dry:.03,rain:0}};
const PICK=[['sunny',.4],['cloudy',.25],['rainy',.25],['windy',.1]];
function next(prev){let p=prev,g=0;while(p===prev&&g++<50){let r=Math.random(),a=0;for(const [k,w] of PICK){a+=w;if(r<=a){p=k;break}}}return p}
const SETS={
 '目前(離散門檻,秒數20/24/30)':{need:{carrot:.3,bean:.5,rose:.7},secs:{carrot:20,bean:24,rose:30},model:'gate'},
 '候選A(連續速率,秒數 90/150/210)':{need:{carrot:.3,bean:.5,rose:.7},secs:{carrot:90,bean:150,rose:210},model:'rate'},
 '候選B(連續速率,秒數 120/180/240)':{need:{carrot:.3,bean:.5,rose:.7},secs:{carrot:120,bean:180,rose:240},model:'rate'},
};
function run(set,plant,shaded,strat,startW){
  const S=SETS[set]; let w=startW, water=.9, prog=0;
  for(let d=1;d<=80;d++){
    for(let s=0;s<DAY;s++){
      const W=WEATHER[w], light=W.light*(shaded?.5:1);
      water=Math.max(0,Math.min(1,water-W.dry+W.rain));
      if(strat==='diligent'&&water<.25) water=Math.min(1,water+.6);
      let rate=0;
      if(water>=.2){ if(S.model==='gate') rate=light>=S.need[plant]?1:0; else rate=Math.min(1,light/S.need[plant]); }
      prog=Math.min(1,prog+rate/S.secs[plant]);
    }
    if(prog>=1) return d;
    w=next(w);
  }
  return Infinity;
}
const rows=[];
for(const set of Object.keys(SETS)) for(const plant of ['carrot','bean','rose']) for(const shaded of [false,true]) for(const strat of ['diligent','lazy']){
  const res=[];const N=3000;
  for(let i=0;i<N;i++){const sw=PICK[Math.floor(Math.random()*4)][0];res.push(run(set,plant,shaded,strat,sw))}
  const fin=res.filter(isFinite).sort((a,b)=>a-b);
  rows.push({set:set.slice(0,6),plant,shaded:shaded?'樹蔭':'向陽',strat:strat==='diligent'?'勤澆':'只澆一次',mean:fin.length?+(fin.reduce((a,b)=>a+b,0)/fin.length).toFixed(1):'卡死',p90:fin.length?fin[Math.floor(fin.length*.9)]:'-',stuck:+((N-fin.length)/N*100).toFixed(0)});
}
console.table(rows);
