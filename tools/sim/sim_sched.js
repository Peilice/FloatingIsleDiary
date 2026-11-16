// 願望排程器 100 天模擬（機制規劃.md §1.3、§7）
// 用法：node tools/sim/sim_sched.js
// 檢查：新字引入後，接下來 WINDOW 次出題內至少再出現 REVIEWS 次（M3 起改用出題次數計算）；
//       弱字比熟字更常出現；每天新字不超過 2 個；不連續同字。舊的「3 天內 3 次」也一起列出供比較
const L = require('../../game/logic.js');
const WINDOW = 12;

function rngOf(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 模擬玩家：每個字有難度，答對機率隨提示階段提高（階段 2 沒有圖，比較難，但字也比較熟）
function run({ wishesPerDay, days = 100, pool = 40, unlockEvery = 5, unlockN = 4, seed = 1 }) {
  const rng = rngOf(seed);
  const words = {};
  const all = Array.from({ length: pool }, (_, i) => 'w' + i);
  const diff = {}; all.forEach((w) => { diff[w] = 0.15 + rng() * 0.5; });
  let cands = all.slice(0, 3);
  let last = null, repeats = 0, maxNew = 0;
  const sched = { n: 0 };
  const seq = []; // 全域出題順序
  const askLog = {}; // word -> [day...]
  const catCount = { weak: 0, known: 0 }, catAsk = { weak: 0, known: 0 };

  for (let day = 1; day <= days; day++) {
    if (day % unlockEvery === 0) cands = all.slice(0, Math.min(pool, cands.length + unlockN));
    for (let k = 0; k < wishesPerDay; k++) {
      // 統計：出題前各分類的候選數（用來算「每個弱字/熟字平均被抽中的機率」）
      const ws = L.weights(words, cands, day, last, sched);
      ws.forEach((x) => { if (catCount[x.cat] != null) catCount[x.cat] += 1; });
      const w = L.pick(words, cands, day, last, rng, sched);
      const cat = ws.find((x) => x.w === w).cat;
      if (catAsk[cat] != null) catAsk[cat] += 1;
      if (w === last && cands.length > 1) repeats += 1;
      const idx = sched.n;
      L.asked(words, w, day, sched);
      seq.push(w);
      (askLog[w] = askLog[w] || []).push({ day, idx });
      last = w;
      const st = L.stage(words, w);
      const p = Math.min(0.97, 1 - diff[w] + 0.1 * st + 0.04 * words[w].ok);
      L.answer(words, w, { day, options: 3, firstTry: rng() < p, peeked: false });
    }
    maxNew = Math.max(maxNew, Object.values(words).filter((o) => o.intro === day).length);
  }
  // 新字 3 天內的出題次數（只算引入日在模擬結束前 2 天以前的字）
  const introduced = Object.keys(words).filter((w) => words[w].intro != null && words[w].intro <= days - 2);
  const within = introduced.map((w) => askLog[w].filter((a) => a.day - words[w].intro <= 2).length);
  const hit = within.filter((n) => n >= 3).length;
  // 以出題次數計：引入那次之後的 WINDOW 次出題中，這個字又出現幾次
  const byAsk = introduced.filter((w) => askLog[w][0].idx + WINDOW < sched.n).map((w) => {
    const i0 = askLog[w][0].idx;
    return askLog[w].filter((a) => a.idx > i0 && a.idx <= i0 + WINDOW).length;
  });
  const hitAsk = byAsk.filter((n) => n >= L.REVIEWS).length;
  const never = cands.filter((w) => !askLog[w]).length;
  return {
    每天願望: wishesPerDay,
    引入字數: introduced.length,
    ['之後' + WINDOW + '題內≥' + L.REVIEWS + '次']: (hitAsk / Math.max(1, byAsk.length) * 100).toFixed(0) + '%',
    '舊:3天內≥3次': (hit / introduced.length * 100).toFixed(0) + '%',
    弱字每次中選率: (catAsk.weak / Math.max(1, catCount.weak) * 100).toFixed(1) + '%',
    熟字每次中選率: (catAsk.known / Math.max(1, catCount.known) * 100).toFixed(1) + '%',
    單日最多新字: maxNew,
    連續同字: repeats,
    從未出題: never,
  };
}

const rows = [];
for (const wpd of [1, 2, 3, 4, 6, 8]) {
  // 多個種子取第一個做代表，另外確認不同種子結果相近
  rows.push(run({ wishesPerDay: wpd, seed: 7 }));
}
console.table(rows);

// M1／M2 實際情況：只有 3 種植物，候選只有 3 個字
console.log('只有 3 個候選字（目前遊戲內容）：');
console.table([1, 2, 4].map((wpd) => run({ wishesPerDay: wpd, pool: 3, unlockEvery: 1000, seed: 3 })));
