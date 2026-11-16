// logic.js 規則檢查：node tools/sim/test_logic.js（全部通過才會印出 OK）
const assert = require('assert');
const L = require('../../game/logic.js');

// §1.1 ok：3 個以上選項、第一次就對、沒用提示
{
  const w = {};
  assert.strictEqual(L.answer(w, 'carrot', { day: 1, options: 2, firstTry: true, peeked: false }), 'none');
  assert.strictEqual(L.answer(w, 'carrot', { day: 1, options: 3, firstTry: true, peeked: true }), 'miss');
  assert.strictEqual(L.answer(w, 'carrot', { day: 1, options: 3, firstTry: false, peeked: false }), 'miss');
  assert.strictEqual(L.answer(w, 'carrot', { day: 1, options: 3, firstTry: true, peeked: false }), 'ok');
  assert.deepStrictEqual([w.carrot.ok, w.carrot.miss, w.carrot.days], [1, 2, 1]);
}
// §1.2 階段：ok≥2 且 days≥2 → 1；ok≥4 且 days≥3 → 2；連續 2 次 miss 退回
{
  const w = {}, ok = (day) => L.answer(w, 'x', { day, options: 3, firstTry: true, peeked: false });
  const miss = (day) => L.answer(w, 'x', { day, options: 3, firstTry: false, peeked: false });
  ok(1); ok(1); assert.strictEqual(L.stage(w, 'x'), 0, '同一天兩次 ok 不夠');
  ok(2); assert.strictEqual(L.stage(w, 'x'), 1);
  ok(2); assert.strictEqual(L.stage(w, 'x'), 1, 'days 還不到 3');
  ok(3); assert.strictEqual(L.stage(w, 'x'), 2);
  miss(4); assert.strictEqual(L.stage(w, 'x'), 2, '一次 miss 不退');
  miss(4); assert.strictEqual(L.stage(w, 'x'), 1, '連續兩次 miss 退一階');
  ok(5); assert.strictEqual(L.stage(w, 'x'), 1, '退回後要再答對兩次才回去');
  ok(5); assert.strictEqual(L.stage(w, 'x'), 2);
  assert.strictEqual(w.x.ok, 7, '給家長看的 ok 是累計值，不因退回而扣');
}
// 升階要求最近 5 題正確率 ≥ 60%：亂猜（對錯交替偏錯）累積再多 ok 也不升階
{
  const w = {}, q = (day, ok) => L.answer(w, 'g', { day, options: 3, firstTry: ok, peeked: false });
  for (let d = 1; d <= 30; d++) { q(d, true); q(d, false); q(d, false); }
  assert.ok(w.g.ok >= 4 && w.g.days >= 3);
  assert.strictEqual(L.stage(w, 'g'), 0, '正確率 33% 不升階');
  q(31, true); q(31, true); q(32, true);
  assert.strictEqual(L.stage(w, 'g'), 1, '最近 5 題 3 對 2 錯（60%）後升階');
}
// 排程器：不連續同字、新字當天上限、到期字優先
{
  const w = {};
  for (let i = 0; i < 200; i++) {
    const p = L.pick(w, ['a', 'b', 'c'], 1, 'a', Math.random);
    assert.notStrictEqual(p, 'a');
  }
  assert.strictEqual(L.pick(w, ['a'], 1, 'a'), 'a', '只有一個候選時可以重複');
  const sc = { n: 0 };
  L.asked(w, 'a', 5, sc); L.asked(w, 'b', 5, sc);
  let ws = L.weights(w, ['a', 'b', 'c'], 5, null, sc);
  assert.strictEqual(ws.find((x) => x.w === 'c').wt, 0, '還有字在複習期時不引入新字');
  assert.strictEqual(ws.find((x) => x.w === 'a').cat, 'wait', '剛出過，還沒隔夠');
  sc.n += 2;
  ws = L.weights(w, ['a', 'b', 'c'], 5, null, sc);
  assert.strictEqual(ws.find((x) => x.w === 'a').cat, 'due', '隔夠了就到期');
  for (let i = 0; i < 3; i++) L.asked(w, 'a', 6, sc);
  assert.notStrictEqual(L.weights(w, ['a'], 6, null, sc)[0].cat, 'due', '複習 3 次後離開複習期');
}
// §3.5 日記：答案來自當天，干擾項不能是當天也發生的事，選項 3 個
{
  for (let i = 0; i < 300; i++) {
    const d = L.diary({ weather: 'rainy', planted: ['carrot', 'bean'], picked: [], gave: [] },
      { weather: ['sunny', 'cloudy', 'rainy', 'windy'], plant: ['carrot', 'bean', 'rose'] });
    assert.strictEqual(d.options.length, 3);
    assert.ok(d.options.includes(d.answer));
    // 種了兩種時植物池只剩 1 個干擾項，湊不到 3 個選項，所以這天只會出天氣句
    assert.strictEqual(d.kind, 'weather');
  }
  const kinds = new Set();
  for (let i = 0; i < 300; i++) {
    const d = L.diary({ weather: 'sunny', planted: ['rose'], picked: ['carrot'], gave: ['carrot'] },
      { weather: ['sunny', 'cloudy', 'rainy', 'windy'], plant: ['carrot', 'bean', 'rose'] });
    kinds.add(d.kind);
    assert.ok(d.text.startsWith(d.before) && d.text.includes(d.answer));
  }
  assert.strictEqual(kinds.size, 4, '四種句型都會出現');
  const d = L.diary({ weather: 'sunny', planted: [], picked: [], gave: [], came: ['owl'] },
    { weather: ['sunny', 'cloudy'], plant: [], animal: ['owl', 'frog', 'duck'] }, () => 0.99);
  assert.strictEqual(d.text, 'An owl came to my island.');
}
// §4.13 電路列舉：所有缺口數（1～2）、所有零件擺法（每個零件最多用一次、可拿回）、開關開或關，
// 從任何狀態出發都能走到「燈亮」，而且燈亮的狀態一定是「全部導體＋開關打開」
{
  const TRAY = ['wire', 'lead', 'eraser', 'straw'];
  let states = 0;
  for (const n of [1, 2]) {
    // 列舉所有狀態：每個缺口是 null 或某個零件（不可重複）
    const all = [];
    const rec = (i, cur) => {
      if (i === n) { all.push(cur.slice()); return; }
      for (const m of [null].concat(TRAY)) { if (m && cur.includes(m)) continue; cur.push(m); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    for (const gaps of all) for (const sw of [false, true]) {
      states += 1;
      const lit = L.circuitLit(gaps, sw);
      assert.strictEqual(lit, sw && gaps.every((m) => m === 'wire' || m === 'lead'), '燈亮的條件');
      // 可達性：BFS，動作＝拿回零件、放入未用的零件、切換開關
      const key = (g, s) => g.join(',') + '|' + s;
      const seenS = new Set([key(gaps, sw)]); const queue = [[gaps, sw]]; let ok = false;
      while (queue.length) {
        const [g, s] = queue.shift();
        if (L.circuitLit(g, s)) { ok = true; break; }
        const next = [[g, !s]];
        g.forEach((m, i) => {
          if (m) { const h = g.slice(); h[i] = null; next.push([h, s]); }
          else TRAY.filter((t) => !g.includes(t)).forEach((t) => { const h = g.slice(); h[i] = t; next.push([h, s]); });
        });
        for (const [h, t] of next) { const k = key(h, t); if (!seenS.has(k)) { seenS.add(k); queue.push([h, t]); } }
      }
      assert.ok(ok, '沒有死局：' + key(gaps, sw));
      // 檢查模式指出的不通處，正好就是燈不亮的原因
      const chk = L.circuitCheck(gaps, sw);
      assert.strictEqual(chk.every(Boolean), lit);
    }
  }
  assert.ok(states > 0);
}
console.log('OK');
