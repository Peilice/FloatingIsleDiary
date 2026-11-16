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
// 排程器：不連續同字、新字當天上限、到期字優先
{
  const w = {};
  for (let i = 0; i < 200; i++) {
    const p = L.pick(w, ['a', 'b', 'c'], 1, 'a', Math.random);
    assert.notStrictEqual(p, 'a');
  }
  assert.strictEqual(L.pick(w, ['a'], 1, 'a'), 'a', '只有一個候選時可以重複');
  L.asked(w, 'a', 5); L.asked(w, 'b', 5);
  const ws = L.weights(w, ['a', 'b', 'c'], 5, null);
  assert.strictEqual(ws.find((x) => x.w === 'c').wt, 0, '有到期字或已引入 2 個新字時不引入新字');
  assert.strictEqual(ws.find((x) => x.w === 'a').cat, 'due');
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
}
console.log('OK');
