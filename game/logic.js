/* 浮島日記：純邏輯（單字紀錄、ok 判定、提示階段、排程器、選項、日記句子）
 * 不依賴 Phaser，瀏覽器（window.Logic）與 Node 模擬（require）共用同一份。
 * 規則依據：docs/機制規劃.md §1.1～§1.3、§3.3、§3.5 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Logic = m;
})(typeof self !== 'undefined' ? self : this, function () {
  // 進入各階段的門檻（§1.2）：階段 1 要 ok≥2 且 days≥2，階段 2 要 ok≥4 且 days≥3
  const STAGE_UP = [null, { pts: 2, days: 2 }, { pts: 4, days: 3 }];
  const NEW_PER_DAY = 2;
  // 升階另外要求最近 RECENT 題的正確率至少 ACC（M2 忽略測試發現：只看累計 ok，長期亂猜也會升階），
  // 而且整體答對不少於答錯（最終測試發現：作答上百次的字，亂猜也會碰上「最近 5 題對 3 題」的運氣）
  const RECENT = 5, ACC = 0.6;
  // 新字的複習：引入後還要再出 REVIEWS 次，兩次之間至少隔 GAP 次別的出題（以出題次數計，不以遊戲日計）
  const REVIEWS = 3, GAP = 2;

  // ---------- 單字紀錄 ----------
  // seen 曝光次數（只統計）、ok 答對、miss 答錯或用提示、days 有 ok 的不同天數、last 最近出現日
  // pts 階段用的進度點（回退時會扣，ok 本身是給家長看的累計值不扣）
  // streak 連續 miss、rec 最近幾題的結果（1 對 0 錯）、intro 第一次被排程的日子
  // n 被排程出題的總次數、at 最近一次出題時的全域出題序號
  function stat(words, w) {
    const o = words[w] || (words[w] = {});
    if (o.seen == null) o.seen = 0;
    if (o.ok == null) o.ok = 0;
    if (o.miss == null) o.miss = 0;
    if (o.days == null) o.days = 0;
    if (o.pts == null) o.pts = 0;
    if (o.streak == null) o.streak = 0;
    if (o.stage == null) o.stage = 0;
    if (o.intro === undefined) o.intro = null;
    if (!o.rec) o.rec = [];
    if (o.n == null) o.n = 0;
    return o;
  }

  function seen(words, w, day) {
    const o = stat(words, w);
    o.seen += 1;
    if (day != null) o.last = day;
  }

  function stage(words, w) { return stat(words, w).stage; }

  function accuracy(o) { return o.rec.length ? o.rec.reduce((a, b) => a + b, 0) / o.rec.length : 0; }
  function remember(o, v) { o.rec.push(v); if (o.rec.length > RECENT) o.rec.shift(); }

  /* 一題結束時呼叫一次（不是每次點選都呼叫）。
   * options：玩家當下可選的選項數；firstTry：第一次選就對；peeked：用過會露出答案的提示。
   * 回傳 'ok' | 'miss' | 'none'（答對但選項不足 3 個，不算 ok 也不算 miss） */
  function answer(words, w, q) {
    const o = stat(words, w);
    o.last = q.day;
    if (q.firstTry && !q.peeked) {
      if (q.options < 3) return 'none';
      o.ok += 1;
      o.pts += 1;
      if (o.lastOk !== q.day) { o.days += 1; o.lastOk = q.day; }
      o.streak = 0;
      remember(o, 1);
      while (o.stage < 2 && o.pts >= STAGE_UP[o.stage + 1].pts && o.days >= STAGE_UP[o.stage + 1].days && accuracy(o) >= ACC && o.ok >= o.miss) o.stage += 1;
      return 'ok';
    }
    o.miss += 1;
    remember(o, 0);
    o.streak += 1;
    if (o.streak >= 2) {
      // 連續 2 次 miss 退回前一階段，進度點降到該階段的入口，要再答對才回得去
      o.stage = Math.max(0, o.stage - 1);
      o.pts = Math.min(o.pts, o.stage === 0 ? 0 : STAGE_UP[o.stage].pts);
      o.streak = 0;
    }
    return 'miss';
  }

  // ---------- 排程器（§1.3） ----------
  // sched：{ n }，全域出題序號，存在存檔裡，每出一題加一
  function newToday(words, day) {
    let n = 0;
    for (const k in words) if (words[k] && words[k].intro === day) n += 1;
    return n;
  }

  // 每個候選字的抽取權重；也輸出分類方便模擬檢查
  function weights(words, cands, day, last, sched) {
    const now = (sched && sched.n) || 0;
    const ws = cands.map((w) => {
      const o = words[w];
      let cat, wt;
      if (!o || o.intro == null) { cat = 'new'; wt = 2; }
      else if (o.n < 1 + REVIEWS) {
        // 還在複習期：隔夠了就到期（權重最高），還沒隔夠就先等（低權重，沒別的字可選時才出）
        if (now - o.at > GAP) { cat = 'due'; wt = 5; } else { cat = 'wait'; wt = 0.5; }
      }
      else if (o.ok >= 4 && o.days >= 3) { cat = 'known'; wt = 0.3; }
      else if (o.miss >= o.ok || o.ok < 2) { cat = 'weak'; wt = 3; }
      else { cat = 'normal'; wt = 1; }
      return { w, cat, wt };
    });
    // 新字的引入速度配合實際出題量：還有字在複習期就先不引入新字（sim_sched.js 的結果）
    const pending = ws.some((x) => x.cat === 'due' || x.cat === 'wait');
    const fresh = newToday(words, day) < NEW_PER_DAY && !pending;
    ws.forEach((x) => {
      if (x.cat === 'new' && !fresh) x.wt = 0;
      if (x.w === last && cands.length > 1) x.wt = 0;
    });
    // 有到期的複習字就優先出它：字一多，權重 5 會被一大群弱字（權重 3）稀釋（sim_sched.js 的結果）。
    // 複習期最多再 REVIEWS 次、且同時只有少數字在複習期，所以其他字只會暫停幾題
    if (ws.some((x) => x.cat === 'due' && x.wt > 0)) ws.forEach((x) => { if (x.cat !== 'due') x.wt = 0; });
    return ws;
  }

  function pick(words, cands, day, last, rng, sched) {
    rng = rng || Math.random;
    if (!cands.length) return null;
    const ws = weights(words, cands, day, last, sched);
    const sum = ws.reduce((a, b) => a + b.wt, 0);
    if (sum <= 0) {
      // 只剩暫時不引入的新字：仍要給一個願望，優先不重複
      const pool = cands.filter((w) => w !== last);
      return (pool.length ? pool : cands)[Math.floor(rng() * (pool.length || cands.length))];
    }
    let r = rng() * sum;
    for (const x of ws) { r -= x.wt; if (x.wt > 0 && r < 0) return x.w; }
    return ws.filter((x) => x.wt > 0).pop().w;
  }

  // 排程器選中並真的出題時呼叫
  function asked(words, w, day, sched) {
    const o = stat(words, w);
    if (o.intro == null) o.intro = day;
    o.n += 1;
    o.at = sched ? sched.n : 0;
    if (sched) sched.n += 1;
  }

  // ---------- 選項 ----------
  function shuffle(a, rng) {
    rng = rng || Math.random;
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  }
  // answer 加上最多 n-1 個干擾項；exclude 是「同樣正確」的字，不能當干擾項
  function options(answerWord, pool, n, rng, exclude) {
    const bad = new Set([answerWord].concat(exclude || []));
    const others = shuffle(pool.filter((w) => !bad.has(w)), rng).slice(0, n - 1);
    return shuffle([answerWord].concat(others), rng);
  }

  // ---------- 日記（§3.5） ----------
  const an = (w) => (/^[aeiou]/.test(w) ? 'an ' : 'a ');
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const DIARY = [
    { kind: 'weather', wt: 1, list: (ev) => [ev.weather], pool: 'weather', make: (w) => ['Today it was ', '.'] },
    { kind: 'planted', wt: 2, list: (ev) => ev.planted, pool: 'plant', make: (w) => ['I planted ' + an(w), '.'] },
    { kind: 'picked',  wt: 2, list: (ev) => ev.picked,  pool: 'plant', make: (w) => ['I picked ' + an(w), '.'] },
    { kind: 'gave',    wt: 2, list: (ev) => ev.gave,    pool: 'plant', make: (w) => ['I gave ' + an(w), ' to my friend.'] },
    { kind: 'came',    wt: 3, list: (ev) => ev.came || [], pool: 'animal', make: (w) => [cap(an(w)), ' came to my island.'] },
    { kind: 'party',   wt: 4, list: (ev) => ev.party || [], pool: 'weekday', make: (w) => ['I went to a party on ', '.'] },
  ];
  /* ev：{ weather, planted[], picked[], gave[], came[] }，pools：{ weather[], plant[], animal[] }
   * 只選「至少湊得出 3 個選項」的句型；當天種了兩種時，另一種不能當干擾項 */
  function diary(ev, pools, rng) {
    rng = rng || Math.random;
    const usable = DIARY.map((t) => {
      const list = Array.from(new Set(t.list(ev).filter(Boolean)));
      const room = (pools[t.pool] || []).filter((w) => list.indexOf(w) < 0).length;
      return { t, list, ok: list.length > 0 && room >= 2 };
    }).filter((x) => x.ok);
    const sum = usable.reduce((a, x) => a + x.t.wt, 0);
    let r = rng() * sum, chosen = usable[usable.length - 1];
    for (const x of usable) { r -= x.t.wt; if (r < 0) { chosen = x; break; } }
    const answerWord = chosen.list[Math.floor(rng() * chosen.list.length)];
    const [before, after] = chosen.t.make(answerWord);
    return {
      kind: chosen.t.kind, answer: answerWord, before, after,
      options: options(answerWord, pools[chosen.t.pool], 3, rng, chosen.list),
      text: before + answerWord + after,
    };
  }

  // ---------- 電路（§4.13） ----------
  // 單一迴路：電池、燈泡、開關、缺口串在一起；每個缺口都放了導體、開關打開，燈才會亮
  const CONDUCTOR = { wire: true, lead: true, eraser: false, straw: false };
  function circuitLit(gaps, switchOn) { return !!switchOn && gaps.every((m) => m != null && CONDUCTOR[m]); }
  // 檢查模式：回傳每一段是否通（缺口逐一，最後是開關）
  function circuitCheck(gaps, switchOn) { return gaps.map((m) => m != null && !!CONDUCTOR[m]).concat([!!switchOn]); }

  return { CONDUCTOR, circuitLit, circuitCheck, stat, seen, stage, accuracy, answer, weights, pick, asked, shuffle, options, diary, NEW_PER_DAY, REVIEWS, GAP };
});
