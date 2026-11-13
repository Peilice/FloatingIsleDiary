// 食物鏈：草 G、兔 R、狐 F，每天一步。有「保底」規則：任一物種低於 floor 時，隔天由遷入補回
function sim(P,days,floor){
  let G=120,R=6,F=2; const hist=[]; let extinct=0, rescues=0;
  for(let d=0;d<days;d++){
    const eatG=P.c1*R*G/(G+P.h1);                 // 兔吃草
    const eatR=P.c2*F*R/(R+P.h2);                 // 狐吃兔
    const G2=G+P.rg*G*(1-G/P.K)-eatG;
    const R2=R+P.e1*eatG-P.dr*R-eatR;
    const F2=F+P.e2*eatR-P.df*F;
    G=Math.max(0,G2);R=Math.max(0,R2);F=Math.max(0,F2);
    if(floor){ if(R<floor.R){R=floor.R;rescues++} if(F<floor.F){F=floor.F;rescues++} if(G<floor.G){G=floor.G;rescues++} }
    if(R<0.5||F<0.2||G<1) extinct++;
    hist.push([G,R,F]);
  }
  const last=hist.slice(-60);
  const rng=i=>{const v=last.map(x=>x[i]);return [Math.min(...v).toFixed(1),Math.max(...v).toFixed(1)]};
  return {extinctDays:extinct,rescues,G:rng(0),R:rng(1),F:rng(2)};
}
const base={rg:.30,K:200,c1:1.0,h1:40,e1:.25,dr:.05,c2:.9,h2:8,e2:.20,df:.08};
const variants={
 '基準':base,
 '兔吃草較少(c1=.7)':{...base,c1:.7},
 '狐較弱(c2=.6,df=.1)':{...base,c2:.6,df:.1},
 '草長快(rg=.4)+兔多死亡(dr=.08)':{...base,rg:.4,dr:.08},
 '較穩定組合':{...base,c1:.7,rg:.35,c2:.6,df:.1,e2:.25,dr:.07,h2:6},
};
for(const [name,P] of Object.entries(variants)){
  console.log(name,'無保底',JSON.stringify(sim(P,300,null)),'\n    有保底',JSON.stringify(sim(P,300,{G:5,R:2,F:1})));
}
