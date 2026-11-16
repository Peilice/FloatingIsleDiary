// 完整主線回歸測試：「認真玩的玩家」每題都答對，照規則種田、交付、蓋棲地、做實驗，記錄每個區域在第幾天開放。
// 用法：
//   1. 在 game/ 開本機伺服器，瀏覽器開 http://localhost:8080/?save=full&reset=1&fast=20 （不要加 unlock，才是測正常解鎖）
//   2. 按 Start 進入遊戲
//   3. 把這個檔案全部貼到 Console 執行，再執行 __agent.run(14000)（可重複執行；每次約推進 10 個遊戲日）
//   4. 看回傳的 milestones（各區開放日）與 errors（卡在視窗或程式錯誤）
// 推進時會暫時關掉畫面繪製，所以很快；遊戲時鐘照常走（不要依賴動畫 tween 計時來改遊戲狀態）
(() => {
  const HOME = { frog: 'pond', duck: 'pond', fish: 'pond', bird: 'tree', monkey: 'tree', cow: 'grass', horse: 'grass' };
  const PRICE = [0, 0, 0, 0, 8, 10, 12];
  const A = window.__agent = { log: [], milestones: {}, today: -1, todo: [], errors: [], modalFrames: 0, lastModal: null };
  const mark = (k, s) => { if (!A.milestones[k]) A.milestones[k] = s.day; };

  function solveModal(sc, s) {
    const m = sc.modal;
    if (m === 'map') { sc.pickIsle('meadow'); return; }   // 開始時的地圖：先去草地
    if (m === 'weather') { if (!sc.wq.done) sc.pickWeather(sc.wq.order.indexOf(sc.wq.answer)); return; }
    if (m === 'diary') { if (s.diaryQ && !s.diaryQ.done) sc.pickDiary(s.diaryQ.options.indexOf(s.diaryQ.answer)); else sc.goodNight(); return; }
    if (m === 'drill') {
      const q = sc.dr;
      if (q.done) { sc.closeModal(); return; }
      if (q.part === 'bag') { [0, 2, 3, 5, 6].forEach((i) => { if (!q.sel[i]) sc.toggleBag(i); }); sc.packBag(); return; }
      sc.pickDrill(q.order.indexOf(q.step)); return;
    }
    if (m === 'invite') { if (!sc.iq.done) sc.pickDay(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(sc.iq.wd)); return; }
    if (m === 'sound') { if (!sc.sq.done) sc.pickSound(sc.sq.order.indexOf(sc.sq.answer)); return; }
    if (m === 'build') { sc.pickBuild(sc.bmOrder.indexOf(HOME[s.visitor])); return; }
    if (m === 'market') {
      const o = sc.mo;
      if (!o || o.done) { if ((A.orders = (A.orders || 0) + 1) > 2) { sc.closeModal(); A.orders = 0; } return; }
      if (o.type === 'fruit') { sc.clearFruit(); for (let i = 0; i < o.n; i++) sc.addFruit(o.bin); sc.giveFruit(); }
      else sc.pickCloth(o.rack.indexOf(o.answer));
      return;
    }
    const done = () => sc.closeModal();
    if (m === 'tea') { const q = sc.tq; if (q.done) return done(); if (!q.water) sc.pourTea('hot'); else if (q.sugar <= 0.01) sc.serveTea(); return; }
    if (m === 'acid') { const q = sc.aq; if (q.round >= q.n) return done(); if (!q.done) sc.sortAcid(['sour', 'sweet', 'bitter'].indexOf(q.answer)); return; }
    if (m === 'magnet') { const q = sc.mq; if (q.done) return done(); q.items.forEach((it, i) => { sc.pickMag(i); sc.sortMag(it.iron); }); sc.checkMag(); return; }
    if (m === 'dig') { const q = sc.dq; if (q.round >= q.n) return done(); if (!q.done) sc.sortDig(['rock', 'sand', 'mud'].indexOf(q.answer)); return; }
    if (m === 'recycle') {
      const q = sc.rq; if (q.done) return done();
      if (q.mode === 'sort') { if (!q.itemDone) sc.sortTrash(['paper', 'bottle', 'garbage'].indexOf(q.item.bin)); }
      else sc.pickPolluter(q.order.indexOf(q.culprit));
      return;
    }
    if (m === 'light') { const q = sc.lq; if (q.round >= q.n) return done(); if (!q.found) sc.moveLamp(q.dir); return; }
    if (m === 'moon') { const q = sc.nq; if (q.done) return done(); for (let ph = 1; ph <= 4; ph++) if (!q.slots.includes(ph)) sc.placeMoon(q.order.indexOf(ph)); sc.checkMoon(); return; }
    if (m === 'push') {
      const q = sc.pq; if (q.round >= q.n) return done();
      if (!q.done) sc.pickPush([['push', 'left'], ['push', 'right'], ['pull', 'left'], ['pull', 'right']].findIndex(([v, d]) => v === q.verb && d === q.dir));
      return;
    }
    if (m === 'circuit') {
      const q = sc.cq; if (q.done) return done();
      if (q.step === 'on') { ['wire', 'lead'].slice(0, q.n).forEach((p, i) => { if (q.gaps[i] !== p) { if (q.gaps[i]) sc.tapGap(i); sc.pickPart(p); sc.tapGap(i); } }); if (!q.sw) sc.toggleSwitch(); }
      else if (q.sw) sc.toggleSwitch();
      return;
    }
    if (m === 'music') { if (sc.uq.done) return done(); sc.fixInstr(sc.uq.broken); return; }
    if (m === 'fog') { if (sc.fq.done) return done(); sc.fogMove(sc.fq.dir); return; }
    if (m === 'lab') {
      const q = sc.xq, k = sc.labKind;
      if (!q || q.done) return done();
      if (k === 'water') { [['heater', 'sun'], ['cold', 'high'], ['cup', 'under']].forEach(([p, sp]) => { if (q.place[sp] !== p) { if (q.place[sp]) sc.waterSpot(sp); sc.waterPart(p); sc.waterSpot(sp); } }); }
      else if (k === 'typhoon') { if (q.step === 1) sc.pickSymbol(q.order.indexOf('T')); else { q.prep.forEach((p, j) => { if (p.good && !q.sel[j]) sc.pickPrep(j); }); sc.prepDone(); } }
      else if (k === 'food') { if (!q.busy) sc.pickFood(q.order.findIndex((ai) => q.sc.good.includes(['grass', 'den', 'rabbits', 'cut'][ai]))); }
      else if (k === 'photo') sc.pickPhoto(q.pots.findIndex((p) => !p.covered));
      else if (k === 'spell') { const ch = q.w[q.pos]; sc.pickLetter(q.tiles.findIndex((t, i) => t === ch && !q.used[i])); }
      else if (k === 'pitch') sc.pickPipe(q.order.indexOf(q.need));
      else if (k === 'fossil') { if (q.picks.length < 3) { q.picks = []; [2, 1, 0].forEach((i) => sc.pickLayer(i)); } sc.checkLayers(); }
      return;
    }
    // 其他視窗（圖鑑、設定…）直接關
    sc.closeModal();
  }

  function farm(sc, s) {
    const wanted = Object.values(s.wishes).filter(Boolean);
    s.plots.forEach((p, i) => {
      if (p.plant && p.progress >= 1) { sc.tool = null; sc.onPlot(i); }
      if (!p.plant) {
        // 樹蔭（0、3）種紅蘿蔔；其他依願望需要或輪流
        const shade = i % 3 === 0;
        const k = shade ? 'carrot' : (wanted.find((w) => (s.inv[w] || 0) === 0) || ['bean', 'rose', 'carrot'][(s.day + i) % 3]);
        sc.tool = k; sc.onPlot(i);
      }
      if (p.plant && p.water < 0.3) { sc.tool = 'water'; sc.onPlot(i); }
    });
    sc.tool = null;
  }

  function wishes(sc, s) {
    ['rabbit', s.fwho].filter(Boolean).forEach((who) => {
      const want = s.wishes[who];
      if (want && (s.inv[want] || 0) > 0) { sc.held = want; sc.giveTo(who); sc.held = null; }
    });
  }

  function forest(sc, s) {
    if (!s.forestOpen) return;
    // 地都住滿了就買下一塊（玩家隨時可以點標價的地）
    if (s.lotsOpen < 7 && s.lots.slice(0, s.lotsOpen).every((l) => l.animal) && s.stardust >= PRICE[s.lotsOpen]) { sc.onLot(s.lotsOpen); sc.onLot(s.lotsOpen); }
    sc.zone = 'forest'; // 讓草叢倒數
    if (sc.bushReady) { sc.onBush(); return; }
    const v = s.visitor;
    if (v) {
      const home = HOME[v];
      const ready = s.lots.findIndex((l, i) => i < s.lotsOpen && l.hab === home && !l.animal);
      if (ready >= 0) { sc.onLot(ready); return; }
      const empty = s.lots.findIndex((l, i) => i < s.lotsOpen && !l.hab);
      if (empty >= 0 && s.stardust >= 4) { sc.onLot(empty); return; }
      if (empty < 0) {
        // 沒有空地：拆掉一塊空著但不合適的棲地，或買新地
        const wrong = s.lots.findIndex((l, i) => i < s.lotsOpen && l.hab && !l.animal);
        if (wrong >= 0) { sc.tool = 'shovel'; sc.onLot(wrong); sc.tool = null; return; }
        if (s.lotsOpen < 7 && s.stardust >= PRICE[s.lotsOpen]) { sc.onLot(s.lotsOpen); sc.onLot(s.lotsOpen); }
      }
    }
  }

  function planDay(sc, s) {
    A.today = s.day;
    A.todo = [];
    if (s.town) A.todo.push(() => sc.openMarket());
    if (s.beachOpen) ['tea', 'acid', 'magnet', 'dig', 'recycle'].forEach((k) => A.todo.push(() => sc.openStation(k)));
    if (s.caveOpen) ['light', 'moon', 'push'].forEach((k) => A.todo.push(() => sc.openCave(k)));
    if (s.lightOpen) ['circuit', 'music', 'fog'].forEach((k) => A.todo.push(() => sc.openLighthouse(k)));
    ['water', 'typhoon', 'food', 'photo', 'spell', 'pitch', 'fossil'].forEach((k) => A.todo.push(() => { const g = { water: 'weather', typhoon: 'weather', food: 'eco', photo: 'eco', spell: 'eco', pitch: 'geo', fossil: 'geo' }[k]; if (sc.groupOpen(g)) sc.openLab(k); }));
  }

  A.step = () => {
    const sc = __ci.scene, s = __ci.state;
    try {
      // 里程碑
      if (s.forestOpen) mark('池塘森林', s);
      if (s.town) mark('市集', s);
      if (s.beachOpen) mark('海灘', s);
      if (s.caveOpen) mark('洞穴', s);
      if (s.lightOpen) mark('燈塔', s);
      if (sc.groupOpen('weather')) mark('氣象站', s);
      if (sc.groupOpen('geo')) mark('地質洞窟', s);
      if (sc.groupOpen('eco')) mark('生態研究所', s);
      if (s.drillDay) mark('第一次演練', s);
      if (sc.modal) {
        // 卡在同一個視窗太久就記下來（可能是死局）
        A.modalFrames = sc.modal === A.lastModal ? A.modalFrames + 1 : 0;
        A.lastModal = sc.modal;
        if (A.modalFrames === 400) A.errors.push('day ' + s.day + ' 卡在視窗 ' + sc.modal + (sc.labKind ? '/' + sc.labKind : ''));
        if (A.modalFrames > 400) { sc.closeModal(); A.modalFrames = 0; }
        solveModal(sc, s);
        return;
      }
      A.lastModal = null; A.modalFrames = 0;
      if (A.today !== s.day) planDay(sc, s);
      farm(sc, s);
      wishes(sc, s);
      forest(sc, s);
      if (A.todo.length && s.t > 5) A.todo.shift()();
    } catch (e) { A.errors.push('day ' + s.day + ' ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')); }
  };

  // 推進遊戲（不畫畫面）：frames 格，每 3 格讓玩家行動一次
  A.run = (frames) => {
    const g = __ci.scene.game;
    const rr = g.renderer.render; g.renderer.render = () => {};
    let t = g.loop.now || performance.now();
    try {
      for (let i = 0; i < frames; i++) {
        t += 16.67; g.loop.now = t; g.step(t, 16.67);
        if (i % 3 === 0) A.step();
      }
    } catch (e) { A.errors.push('step ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')); }
    g.renderer.render = rr;
    const s = __ci.state;
    return { day: s.day, stardust: s.stardust, lots: s.lots.filter((l) => l.animal).length + '/' + s.lotsOpen, lib: __ci.scene.libCount(), harvested: s.harvested, gave: s.gaveTotal, caveDone: s.caveDone, lightDone: s.lightDone, milestones: A.milestones, errors: A.errors.slice(-5) };
  };
})();
'agent ready';
