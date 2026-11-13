/* 浮島日記 Floating Isle Diary — M1 原型：草地、天氣、種植、1 位居民、圖鑑
 * 全部美術以程式繪製，語音暫用瀏覽器內建 speechSynthesis（正式版改為預錄音檔）。
 * 偵錯：網址加 ?fast=1 可 4 倍速。 */
(() => {
  const W = 1280, H = 720;
  const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif';
  const SAVE_KEY = 'cloudisland-v1';
  const params = new URLSearchParams(location.search);
  const SPEED = params.get('fast') ? 4 : 1;
  const DAY_LEN = 60; // 一天幾秒
  // ?reset=1 先清存檔再開始。要在舊頁面 pagehide 存檔之後才清，所以放在新頁面載入時執行
  if (params.get('reset')) {
    try { localStorage.removeItem('cloudisland-v1'); } catch (e) { /* 忽略 */ }
    try { history.replaceState(null, '', location.pathname + (SPEED > 1 ? '?fast=1' : '')); } catch (e) { /* 忽略 */ }
  }
  const WORDS = window.WORDS || {};
  const zhOf = (w) => (WORDS[w.toLowerCase()] || {}).zh || '';

  // ---------- 資料 ----------
  const WEATHER = {
    // 數值由 sim_m1 模擬決定（見 機制規劃.md §2）
    sunny:  { light: 1.0,  dry: 0.010, rain: 0,    sky: [0x6dc0f2, 0xd9f1ff], phrase: 'It is sunny today.',  zh: '今天是晴天' },
    cloudy: { light: 0.4,  dry: 0.006, rain: 0,    sky: [0x93a3b1, 0xd2dae0], phrase: 'It is cloudy today.', zh: '今天是多雲' },
    rainy:  { light: 0.15, dry: 0,     rain: 0.08, sky: [0x56646f, 0x9aa8b4], phrase: 'It is rainy today.',  zh: '今天在下雨' },
    windy:  { light: 0.8,  dry: 0.015, rain: 0,    sky: [0x86d4e6, 0xe2f6fb], phrase: 'It is windy today.',  zh: '今天有風' },
  };
  const WEATHER_PICK = [['sunny', 0.4], ['cloudy', 0.25], ['rainy', 0.25], ['windy', 0.1]];

  const PLANTS = {
    carrot: { need: 0.3, secs: 75, part: 'root',  partZh: '根',   art: 'a carrot', fact: '我們吃的紅蘿蔔是它的「根」，長在土裡。' },
    bean:   { need: 0.5, secs: 110, part: 'seed',  partZh: '種子', art: 'a bean',   fact: '我們吃的豆子是它的「種子」，種下去又能長出新的豆子。' },
    rose:   { need: 0.7, secs: 150, part: 'flower',partZh: '花',   art: 'a rose',   fact: '玫瑰需要很多陽光才會開花，躲在樹蔭下長得慢。' },
  };

  const LIB = [
    { k: 'carrot', en: 'carrot', zh: '紅蘿蔔', kind: 'plant' },
    { k: 'bean',   en: 'bean',   zh: '豆子',   kind: 'plant' },
    { k: 'rose',   en: 'rose',   zh: '玫瑰',   kind: 'plant' },
    { k: 'sunny',  en: 'sunny',  zh: '晴天',   kind: 'weather', fact: '晴天陽光充足，植物長得快，水也乾得快。' },
    { k: 'cloudy', en: 'cloudy', zh: '多雲',   kind: 'weather', fact: '多雲時陽光變少，需要很多陽光的植物會長得慢。' },
    { k: 'rainy',  en: 'rainy',  zh: '下雨',   kind: 'weather', fact: '下雨時植物會得到水，不用自己澆，但陽光很少。' },
    { k: 'windy',  en: 'windy',  zh: '有風',   kind: 'weather', fact: '空氣流動就會產生風，風會讓土壤的水分乾得更快。' },
  ];

  const TOOL_X = { carrot: 120, bean: 240, rose: 360, water: 480 };
  const PLOT_X = [430, 600, 770];
  const PLOT_Y = [430, 550];
  const RABBIT = { x: 1020, y: 500 };
  const PIP = { x: 130, y: 500 };

  // ---------- 存檔 ----------
  function defaultState() {
    return {
      v: 1, day: 1, t: 0, weather: 'sunny', stardust: 0,
      inv: { carrot: 0, bean: 0, rose: 0 },
      plots: Array.from({ length: 6 }, () => ({ plant: null, progress: 0, water: 0.3 })),
      words: {}, lib: { sunny: true }, tut: 0, wish: 'carrot', muted: false,
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.v === 1) return Object.assign(defaultState(), s);
      }
    } catch (e) { /* 無法讀取就用新存檔 */ }
    return defaultState();
  }
  function saveState(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }

  // ---------- 單字追蹤（背景記錄，不顯示給玩家） ----------
  function wstat(s, w) { return (s.words[w] = s.words[w] || { seen: 0, ok: 0 }); }
  // 提示階段：0 圖＋英文＋中文，1 圖＋英文，2 只有英文與語音
  function wstage(s, w) { const o = wstat(s, w).ok; return o < 2 ? 0 : (o < 4 ? 1 : 2); }

  // ---------- 語音（占位：之後換成 audio/xxx.mp3） ----------
  let muted = false;
  function speak(text) {
    if (muted) return;
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.85;
      window.speechSynthesis.speak(u);
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 繪圖輔助 ----------
  function txt(scene, x, y, str, size, color, extra) {
    return scene.add.text(x, y, str, Object.assign({
      fontFamily: FONT, fontSize: size + 'px', color: color || '#27384a', resolution: 2,
    }, extra || {}));
  }

  function drawIcon(g, key) {
    g.clear();
    switch (key) {
      case 'carrot':
        g.fillStyle(0x4caf50, 1);
        g.fillTriangle(-3, -12, -9, -30, 2, -12); g.fillTriangle(0, -12, 2, -33, 6, -12); g.fillTriangle(2, -12, 12, -28, 8, -12);
        g.fillStyle(0xff8a1f, 1); g.fillTriangle(-13, -13, 13, -13, 0, 26);
        g.lineStyle(2, 0xd96a00, 1); g.lineBetween(-7, -4, 0, -4); g.lineBetween(1, 6, 7, 6); g.lineBetween(-4, 12, 1, 12);
        break;
      case 'bean':
        g.fillStyle(0x3f9e44, 1); g.fillEllipse(0, 0, 50, 20);
        g.fillStyle(0x8bd17c, 1); g.fillCircle(-14, 0, 6); g.fillCircle(0, 0, 6); g.fillCircle(14, 0, 6);
        break;
      case 'rose':
        g.lineStyle(4, 0x2e7d32, 1); g.lineBetween(0, 6, 0, 28);
        g.fillStyle(0x43a047, 1); g.fillEllipse(-9, 20, 14, 7); g.fillEllipse(9, 16, 14, 7);
        g.fillStyle(0xe53956, 1); g.fillCircle(0, -6, 14);
        g.fillStyle(0xb71c3c, 1); g.fillCircle(0, -6, 8); g.fillStyle(0xe53956, 1); g.fillCircle(2, -7, 4);
        break;
      case 'water':
        g.fillStyle(0x4a90d9, 1); g.fillRoundedRect(-20, -10, 34, 28, 7);
        g.lineStyle(6, 0x4a90d9, 1); g.lineBetween(12, -2, 28, -16);
        g.lineStyle(4, 0x3a78c2, 1); g.beginPath(); g.arc(-20, 4, 10, Math.PI * 0.5, Math.PI * 1.5, false); g.strokePath();
        g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(-15, -6, 8, 18, 3);
        break;
      case 'drop':
        g.fillStyle(0x3b8de0, 1); g.fillTriangle(0, -18, -10, 2, 10, 2); g.fillCircle(0, 4, 10);
        g.fillStyle(0xffffff, 0.5); g.fillCircle(-4, 4, 3);
        break;
      case 'sun':
        g.lineStyle(3, 0xffb300, 1);
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.lineBetween(Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * 22, Math.sin(a) * 22); }
        g.fillStyle(0xffd54a, 1); g.fillCircle(0, 0, 11);
        break;
      case 'sunny': drawIcon(g, 'sun'); break;
      case 'cloudy':
        g.fillStyle(0xb7c3cd, 1); g.fillCircle(-12, 2, 12); g.fillCircle(2, -6, 15); g.fillCircle(15, 2, 11); g.fillRoundedRect(-24, 2, 50, 12, 6);
        break;
      case 'rainy':
        g.fillStyle(0x8393a0, 1); g.fillCircle(-12, -6, 11); g.fillCircle(2, -13, 14); g.fillCircle(15, -6, 10); g.fillRoundedRect(-23, -6, 48, 11, 5);
        g.lineStyle(3, 0x3b8de0, 1); g.lineBetween(-12, 10, -16, 20); g.lineBetween(0, 10, -4, 20); g.lineBetween(12, 10, 8, 20);
        break;
      case 'windy':
        g.lineStyle(4, 0x5aa9c4, 1);
        g.lineBetween(-22, -8, 14, -8); g.lineBetween(-14, 2, 22, 2); g.lineBetween(-22, 12, 8, 12);
        g.lineStyle(4, 0x5aa9c4, 1); g.beginPath(); g.arc(14, -13, 5, Math.PI * 0.5, Math.PI * 2, false); g.strokePath();
        break;
      default:
        g.fillStyle(0x999999, 1); g.fillCircle(0, 0, 10);
    }
  }
  function makeIcon(scene, key, x, y, scale) {
    const g = scene.add.graphics({ x, y });
    drawIcon(g, key);
    g.setScale(scale || 1);
    return g;
  }

  function drawPlant(g, type, p, wilt) {
    g.clear();
    const leaf = wilt ? 0xb5a43c : 0x43a047;
    const stemC = wilt ? 0x9c8d2f : 0x2e7d32;
    if (p < 0.12) {
      g.fillStyle(0x6d4c2f, 1); g.fillEllipse(0, -4, 22, 12);
      return;
    }
    if (p < 0.4) {
      g.lineStyle(4, stemC, 1); g.lineBetween(0, 0, 0, -18);
      g.fillStyle(leaf, 1); g.fillEllipse(-9, -20, 16, 8); g.fillEllipse(9, -20, 16, 8);
      return;
    }
    const k = Math.min(1, (p - 0.4) / 0.6);
    if (type === 'carrot') {
      g.lineStyle(3, leaf, 1);
      const h = 22 + k * 22;
      for (let i = -3; i <= 3; i++) g.lineBetween(0, -2, i * 7, -h - Math.abs(i) * -3);
      g.fillStyle(leaf, 1); for (let i = -3; i <= 3; i++) g.fillCircle(i * 7, -h + Math.abs(i) * 3, 5);
      if (p >= 1) { g.fillStyle(0xff8a1f, 1); g.fillEllipse(0, -2, 26, 14); g.fillStyle(0xd96a00, 1); g.fillEllipse(0, -2, 12, 6); }
    } else if (type === 'bean') {
      const h = 24 + k * 36;
      g.lineStyle(4, stemC, 1); g.lineBetween(0, 0, 0, -h);
      g.fillStyle(leaf, 1);
      g.fillEllipse(-11, -h * 0.45, 18, 9); g.fillEllipse(11, -h * 0.7, 18, 9); g.fillEllipse(-10, -h * 0.9, 16, 8);
      if (p >= 0.7) {
        g.fillStyle(0x3f9e44, 1); g.fillEllipse(-16, -h * 0.3, 8, 20); g.fillEllipse(16, -h * 0.5, 8, 20);
        if (p >= 1) { g.fillEllipse(-6, -h * 0.2, 8, 22); g.fillStyle(0x8bd17c, 1); g.fillCircle(-16, -h * 0.3, 2); g.fillCircle(16, -h * 0.5, 2); }
      }
    } else {
      const h = 26 + k * 40;
      g.lineStyle(5, stemC, 1); g.lineBetween(0, 0, 0, -h);
      g.fillStyle(leaf, 1); g.fillEllipse(-12, -h * 0.4, 20, 9); g.fillEllipse(12, -h * 0.6, 20, 9);
      if (p >= 0.8 && p < 1) { g.fillStyle(0xc2294a, 1); g.fillCircle(0, -h - 4, 8); }
      if (p >= 1) {
        g.fillStyle(wilt ? 0xb98a8a : 0xe53956, 1); g.fillCircle(0, -h - 6, 17);
        g.fillStyle(wilt ? 0x9a6f6f : 0xb71c3c, 1); g.fillCircle(0, -h - 6, 10);
        g.fillStyle(wilt ? 0xb98a8a : 0xe53956, 1); g.fillCircle(3, -h - 8, 5);
      }
    }
  }

  function drawBubble(g, x, y, w, h, tailX) {
    g.fillStyle(0x000000, 0.12); g.fillRoundedRect(x + 3, y + 4, w, h, 18);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(x, y, w, h, 18);
    g.fillTriangle(tailX - 12, y + h - 2, tailX + 12, y + h - 2, tailX, y + h + 18);
  }

  // ---------- 標題畫面 ----------
  class Title extends Phaser.Scene {
    constructor() { super('Title'); }
    create() {
      const g = this.add.graphics();
      g.fillGradientStyle(0x6dc0f2, 0x6dc0f2, 0xd9f1ff, 0xd9f1ff, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0xffffff, 0.9);
      [[200, 150, 1], [900, 110, 1.3], [1100, 260, 0.8], [520, 250, 0.9]].forEach(([x, y, s]) => {
        g.fillCircle(x, y, 34 * s); g.fillCircle(x + 38 * s, y - 14 * s, 42 * s); g.fillCircle(x + 80 * s, y, 32 * s); g.fillRoundedRect(x - 34 * s, y, 148 * s, 34 * s, 17 * s);
      });
      g.fillStyle(0x6bbf59, 1); g.fillEllipse(640, 600, 760, 220);
      g.fillStyle(0x8d6e4a, 1); g.fillEllipse(640, 660, 560, 120);
      const t1 = txt(this, W / 2, 190, 'Floating Isle Diary', 80, '#27527a', { fontStyle: 'bold' }).setOrigin(0.5);
      txt(this, W / 2, 275, '浮島日記', 44, '#27527a').setOrigin(0.5);
      this.tweens.add({ targets: t1, y: 200, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });

      const btn = this.add.container(W / 2, 430);
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.15); bg.fillRoundedRect(-140, -44, 280, 100, 50);
      bg.fillStyle(0xff9f43, 1); bg.fillRoundedRect(-140, -50, 280, 100, 50);
      btn.add([bg, txt(this, 0, 0, 'Start', 52, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5)]);
      btn.setSize(280, 100).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: btn, scale: 1.06, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      const go = () => { speak('hello'); this.scene.start('Island'); };
      btn.on('pointerdown', go);
      txt(this, W / 2, 520, '點一下開始', 24, '#27527a').setOrigin(0.5);
    }
  }

  // ---------- 島嶼主畫面 ----------
  class Island extends Phaser.Scene {
    constructor() { super('Island'); }

    create() {
      this.s = loadState();
      muted = !!this.s.muted;
      this.tool = null;
      this.peek = false;
      this.libOpen = false;
      this.raindrops = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 300 }));
      this.windLines = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: 60 + Math.random() * 420, v: 900 + Math.random() * 500, l: 60 + Math.random() * 100 }));
      this.lastWeatherDrawn = null;

      this.skyG = this.add.graphics().setDepth(0);
      this.buildSun();
      this.buildClouds();
      this.fxG = this.add.graphics().setDepth(5);
      this.buildIsland();
      this.buildPlots();
      this.buildRabbit();
      this.buildPip();
      this.buildToolbar();
      this.buildHud();
      this.buildBanner();
      this.buildLibrary();

      this.applyWeatherLook(true);
      this.refreshAll();
      this.showBanner();
      this.time.addEvent({ delay: 5000, loop: true, callback: () => saveState(this.s) });
      window.addEventListener('pagehide', () => saveState(this.s));
      document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(this.s); });
      window.__ci = { scene: this, state: this.s };
    }

    // --- 建構 ---
    buildSun() {
      this.sunG = this.add.graphics({ x: 1110, y: 130 }).setDepth(1);
      this.sunG.lineStyle(6, 0xffc107, 1);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; this.sunG.lineBetween(Math.cos(a) * 52, Math.sin(a) * 52, Math.cos(a) * 72, Math.sin(a) * 72); }
      this.sunG.fillStyle(0xffd54a, 1); this.sunG.fillCircle(0, 0, 44);
      this.tweens.add({ targets: this.sunG, angle: 360, duration: 24000, repeat: -1 });
    }

    buildClouds() {
      this.clouds = [];
      const defs = [[180, 130, 1.0, 14], [560, 80, 1.3, 9], [900, 200, 0.9, 18], [1200, 70, 1.1, 12], [380, 270, 0.8, 20]];
      defs.forEach(([x, y, s, v]) => {
        const g = this.add.graphics({ x, y }).setDepth(2);
        this.clouds.push({ g, s, v });
      });
    }

    drawClouds(color, alpha) {
      this.clouds.forEach((c) => {
        c.g.clear();
        c.g.fillStyle(color, 1);
        const s = c.s;
        c.g.fillCircle(0, 0, 34 * s); c.g.fillCircle(40 * s, -14 * s, 44 * s); c.g.fillCircle(84 * s, 0, 32 * s);
        c.g.fillRoundedRect(-34 * s, 0, 152 * s, 34 * s, 17 * s);
        c.g.setAlpha(alpha);
      });
    }

    buildIsland() {
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(640, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(640, 720, 700, 120);
      g.fillStyle(0x6bbf59, 1); g.fillEllipse(640, 560, 1060, 300);
      g.fillStyle(0x7ccb69, 1); g.fillEllipse(640, 540, 940, 250);
      // 樹與樹蔭
      this.shadeG = this.add.graphics().setDepth(4);
      this.shadeG.fillStyle(0x1b5e20, 0.28); this.shadeG.fillEllipse(400, 490, 230, 200);
      const tree = this.add.graphics({ x: 250, y: 470 }).setDepth(7);
      tree.fillStyle(0x7b5230, 1); tree.fillRoundedRect(-18, -90, 36, 100, 8);
      tree.fillStyle(0x2e8b3a, 1); tree.fillCircle(0, -150, 80); tree.fillCircle(-62, -112, 56); tree.fillCircle(62, -112, 56);
      tree.fillStyle(0x3aa34a, 1); tree.fillCircle(-10, -165, 50);
      txt(this, 250, 500, '樹蔭 shade', 18, '#1b5e20').setOrigin(0.5).setDepth(8).setAlpha(0.0);
    }

    buildPlots() {
      this.plotObjs = [];
      for (let i = 0; i < 6; i++) {
        const x = PLOT_X[i % 3], y = PLOT_Y[Math.floor(i / 3)];
        const soil = this.add.graphics({ x, y }).setDepth(6);
        const plant = this.add.graphics({ x, y: y + 8 }).setDepth(9);
        const hint = this.add.container(x + 62, y - 64).setDepth(12).setVisible(false).setScale(0.85);
        const hg = this.add.graphics(); hint.add(hg);
        const zone = this.add.zone(x, y - 30, 150, 110).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.onPlot(i));
        const o = { x, y, soil, plant, hint, hg, zone, sig: '', hintKind: '' };
        this.plotObjs.push(o);
        this.tweens.add({ targets: hint, y: y - 74, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
      }
    }

    buildRabbit() {
      const c = this.add.container(RABBIT.x, RABBIT.y).setDepth(10);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.12); g.fillEllipse(0, 52, 120, 26);
      g.fillStyle(0xf3efe9, 1); g.fillEllipse(0, 14, 96, 84);
      g.fillStyle(0xf3efe9, 1); g.fillEllipse(-18, -78, 26, 84); g.fillEllipse(18, -78, 26, 84);
      g.fillStyle(0xf4b6c2, 1); g.fillEllipse(-18, -78, 12, 60); g.fillEllipse(18, -78, 12, 60);
      g.fillStyle(0xf3efe9, 1); g.fillCircle(0, -26, 44);
      g.fillStyle(0x333333, 1); g.fillCircle(-15, -30, 5); g.fillCircle(15, -30, 5);
      g.fillStyle(0xf08aa0, 1); g.fillTriangle(-6, -18, 6, -18, 0, -10);
      g.lineStyle(2, 0x555555, 1); g.lineBetween(0, -10, 0, -4);
      g.fillStyle(0xf3efe9, 1); g.fillCircle(-46, 32, 12); g.fillCircle(46, 32, 12);
      c.add(g);
      c.setSize(150, 190);
      const zone = this.add.zone(RABBIT.x, RABBIT.y - 20, 190, 230).setDepth(21).setInteractive();
      zone.on('pointerdown', () => this.onRabbit());
      this.rabbit = c;
      this.rabbitIdle = this.tweens.add({ targets: c, y: RABBIT.y - 6, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

      this.wish = this.add.container(RABBIT.x - 120, RABBIT.y - 290).setDepth(15);
      this.wishG = this.add.graphics();
      this.wishIcon = this.add.graphics({ x: 62, y: 62 });
      this.wishEn = txt(this, 118, 26, '', 26, '#27384a', { fontStyle: 'bold' });
      this.wishZh = txt(this, 118, 78, '', 20, '#6b7c8c');
      this.wish.add([this.wishG, this.wishIcon, this.wishEn, this.wishZh]);
      const bz = this.add.zone(RABBIT.x + 30, RABBIT.y - 235, 340, 120).setDepth(22).setInteractive();
      bz.on('pointerdown', () => this.onRabbit());
    }

    buildPip() {
      const c = this.add.container(PIP.x, PIP.y).setDepth(10);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.12); g.fillEllipse(0, 52, 100, 22);
      g.fillStyle(0xf2994a, 1); g.fillEllipse(0, 16, 80, 70);
      g.fillStyle(0xfff4e6, 1); g.fillEllipse(0, 28, 44, 40);
      g.fillStyle(0xf2994a, 1); g.fillCircle(0, -24, 40);
      g.fillTriangle(-38, -34, -22, -74, -8, -40); g.fillTriangle(38, -34, 22, -74, 8, -40);
      g.fillStyle(0x7a3b0a, 1); g.fillTriangle(-32, -40, -22, -64, -14, -42); g.fillTriangle(32, -40, 22, -64, 14, -42);
      g.fillStyle(0xfff4e6, 1); g.fillEllipse(0, -12, 46, 26);
      g.fillStyle(0x333333, 1); g.fillCircle(-14, -28, 5); g.fillCircle(14, -28, 5); g.fillCircle(0, -16, 5);
      g.fillStyle(0xf2994a, 1); g.fillEllipse(58, 40, 70, 28);
      g.fillStyle(0xfff4e6, 1); g.fillCircle(80, 40, 12);
      c.add(g);
      this.pip = c;
      this.tweens.add({ targets: c, y: PIP.y - 8, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });

      this.pipBubble = this.add.container(PIP.x + 70, PIP.y - 190).setDepth(16);
      this.pipG = this.add.graphics();
      this.pipEn = txt(this, 18, 16, '', 30, '#27384a', { fontStyle: 'bold' });
      this.pipZh = txt(this, 18, 58, '', 20, '#6b7c8c');
      this.pipBubble.add([this.pipG, this.pipEn, this.pipZh]);

      this.arrow = this.add.graphics().setDepth(30);
      this.arrow.fillStyle(0xff5252, 1); this.arrow.fillTriangle(-16, -28, 16, -28, 0, 0);
      this.arrow.setVisible(false);
      this.arrowTween = this.tweens.add({ targets: this.arrow, scale: 1.25, yoyo: true, repeat: -1, duration: 450 });
    }

    buildToolbar() {
      const bar = this.add.graphics().setDepth(30);
      bar.fillStyle(0xffffff, 0.8); bar.fillRoundedRect(30, 616, 1220, 92, 26);
      this.tools = {};
      ['carrot', 'bean', 'rose', 'water'].forEach((k) => {
        const x = TOOL_X[k];
        const c = this.add.container(x, 662).setDepth(31);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k === 'water' ? 'water' : k, 0, -8, 1.1);
        const label = txt(this, 0, 28, k === 'water' ? 'water' : k, 20, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const sub = txt(this, 0, 28, '', 14, '#6b7c8c').setOrigin(0.5).setVisible(false);
        c.add([bg, icon, label, sub]);
        c.setSize(104, 84).setInteractive({ useHandCursor: true });
        c.on('pointerdown', () => this.selectTool(k));
        this.tools[k] = { c, bg, label, k };
      });
      txt(this, 640, 662, '取得', 18, '#6b7c8c').setOrigin(0.5).setDepth(31).setVisible(false);
      // 背包
      this.invText = {};
      [['carrot', 800], ['bean', 930], ['rose', 1060]].forEach(([k, x]) => {
        makeIcon(this, k, x, 660, 0.9).setDepth(31);
        this.invText[k] = txt(this, x + 34, 660, 'x0', 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(31);
      });
      this.redrawTools();
    }

    buildHud() {
      // 星砂
      this.dustBg = this.add.graphics().setDepth(40);
      this.dustBg.fillStyle(0xffffff, 0.85); this.dustBg.fillRoundedRect(1090, 20, 170, 56, 28);
      this.dustStar = this.add.graphics({ x: 1124, y: 48 }).setDepth(41);
      this.dustStar.fillStyle(0xffc107, 1);
      const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r)); }
      this.dustStar.fillPoints(pts, true);
      this.dustText = txt(this, 1150, 48, '0', 30, '#27384a', { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(41);

      // 圖鑑按鈕
      const lb = this.add.container(90, 48).setDepth(40);
      const lg = this.add.graphics();
      lg.fillStyle(0xffffff, 0.9); lg.fillRoundedRect(-70, -30, 140, 60, 30);
      lb.add([lg, txt(this, 0, 0, '圖鑑', 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5)]);
      lb.setSize(140, 60).setInteractive({ useHandCursor: true });
      lb.on('pointerdown', () => this.toggleLibrary(true));
      this.libBtn = lb;

      // 靜音
      const mb = this.add.container(222, 48).setDepth(40);
      this.muteG = this.add.graphics();
      mb.add(this.muteG);
      mb.setSize(60, 60).setInteractive({ useHandCursor: true });
      mb.on('pointerdown', () => { muted = !muted; this.s.muted = muted; if (muted) { try { window.speechSynthesis.cancel(); } catch (e) {} } this.drawMute(); });
      this.drawMute();

      // 日進度
      this.dayBar = this.add.graphics().setDepth(40);
      this.dayText = txt(this, 640, 20, '', 24, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(41);
      this.dayIcon = makeIcon(this, 'sun', 640, 70, 0.8).setDepth(42);
      this.dayWeatherIcon = makeIcon(this, 'sunny', 780, 36, 0.7).setDepth(42);
    }

    drawMute() {
      const g = this.muteG; g.clear();
      g.fillStyle(0xffffff, 0.9); g.fillCircle(0, 0, 30);
      g.fillStyle(0x27384a, 1); g.fillRect(-14, -6, 8, 12); g.fillTriangle(-6, -6, 6, -16, 6, 16); g.fillTriangle(-6, 6, 6, 16, -6, -6);
      if (muted) { g.lineStyle(4, 0xe53935, 1); g.lineBetween(-20, 20, 20, -20); }
      else { g.lineStyle(3, 0x27384a, 1); g.beginPath(); g.arc(8, 0, 9, -0.9, 0.9, false); g.strokePath(); }
    }

    buildBanner() {
      this.banner = this.add.container(W / 2, 250).setDepth(60).setAlpha(0);
      this.bannerG = this.add.graphics();
      this.bannerDay = txt(this, 0, -62, '', 28, '#6b7c8c').setOrigin(0.5);
      this.bannerEn = txt(this, 0, -8, '', 52, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.bannerZh = txt(this, 0, 52, '', 26, '#6b7c8c').setOrigin(0.5);
      this.bannerIcon = makeIcon(this, 'sunny', -300, -4, 1.6);
      this.banner.add([this.bannerG, this.bannerDay, this.bannerEn, this.bannerZh, this.bannerIcon]);
      this.bannerG.fillStyle(0xffffff, 0.94); this.bannerG.fillRoundedRect(-380, -100, 760, 200, 36);
    }

    buildLibrary() {
      const c = this.add.container(0, 0).setDepth(100).setVisible(false);
      const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x10243a, 0.55).setInteractive();
      c.add(dim);
      const panel = this.add.graphics();
      panel.fillStyle(0xfff8ec, 1); panel.fillRoundedRect(120, 50, 1040, 620, 36);
      c.add(panel);
      c.add(txt(this, 640, 92, '圖鑑 Book', 40, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.libCards = [];
      LIB.forEach((e, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 260 + col * 255, y = 206 + row * 172;
        const card = this.add.container(x, y);
        const bg = this.add.graphics();
        const icon = makeIcon(this, e.k, 0, -10, 1.5);
        const name = txt(this, 0, 62, '', 24, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        card.add([bg, icon, name]);
        card.setSize(220, 168).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickCard(e));
        c.add(card);
        this.libCards.push({ e, card, bg, icon, name });
      });
      this.libDetailEn = txt(this, 640, 510, '', 36, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.libDetailZh = txt(this, 640, 552, '', 24, '#6b7c8c', { wordWrap: { width: 900 }, align: 'center' }).setOrigin(0.5, 0);
      c.add([this.libDetailEn, this.libDetailZh]);
      const close = this.add.container(1100, 90);
      const cg = this.add.graphics();
      cg.fillStyle(0xff7043, 1); cg.fillCircle(0, 0, 30);
      cg.lineStyle(6, 0xffffff, 1); cg.lineBetween(-11, -11, 11, 11); cg.lineBetween(-11, 11, 11, -11);
      close.add(cg); close.setSize(70, 70).setInteractive({ useHandCursor: true });
      close.on('pointerdown', () => this.toggleLibrary(false));
      c.add(close);
      this.lib = c;
    }

    // --- 互動 ---
    selectTool(k) {
      this.tool = this.tool === k ? null : k;
      this.redrawTools();
      speak(k === 'water' ? 'water' : k + ' seed');
      this.touchWord(k === 'water' ? 'water' : 'seed');
      if (this.tool === k) {
        if (this.s.tut === 0 && k === 'carrot') this.tutNext(0);
        if (this.s.tut === 2 && k === 'water') { /* 等到真的澆水再前進 */ }
      }
    }

    onPlot(i) {
      if (this.libOpen) return;
      const p = this.s.plots[i];
      const o = this.plotObjs[i];
      if (p.plant && p.progress >= 1) { this.harvest(i); return; }
      if (this.tool === 'water') {
        p.water = Math.min(1, p.water + 0.6);
        this.splash(o.x, o.y - 60);
        speak('water');
        if (p.plant && this.s.tut === 2) this.tutNext(2);
        this.refreshAll();
        return;
      }
      if (this.tool && this.tool !== 'water' && !p.plant) {
        p.plant = this.tool; p.progress = 0;
        this.s.lib[this.tool] = true;
        this.touchWord(this.tool);
        speak(this.tool);
        this.floatText(o.x, o.y - 70, 'plant!', '#2e7d32');
        if (this.s.tut === 1) this.tutNext(1);
        this.refreshAll();
        return;
      }
    }

    harvest(i) {
      const p = this.s.plots[i], o = this.plotObjs[i];
      const key = p.plant;
      this.s.inv[key] = (this.s.inv[key] || 0) + 1;
      this.s.stardust += 1;
      p.plant = null; p.progress = 0;
      this.touchWord(key);
      speak(key);
      this.floatText(o.x, o.y - 70, '+1 ' + key, '#e65100');
      this.sparkle(o.x, o.y - 40);
      if (this.s.tut === 4) this.tutNext(4);
      this.refreshAll();
    }

    onRabbit() {
      if (this.libOpen) return;
      const item = this.s.wish;
      const sentence = 'I want ' + PLANTS[item].art + '.';
      if ((this.s.inv[item] || 0) > 0) {
        this.s.inv[item] -= 1;
        this.s.stardust += 5;
        wstat(this.s, item).ok += 1;
        wstat(this.s, 'thank').ok += 1;
        this.floatText(RABBIT.x, RABBIT.y - 140, 'Thank you!', '#d81b60');
        this.hearts();
        speak('Thank you!');
        this.tweens.add({ targets: this.rabbit, y: RABBIT.y - 50, yoyo: true, duration: 220, repeat: 1 });
        if (this.s.tut === 5) this.tutNext(5);
        this.s.wish = null; this.refreshWish();
        this.time.delayedCall(2600, () => { this.s.wish = this.pickWish(item); this.peek = false; this.refreshWish(); speak('I want ' + PLANTS[this.s.wish].art + '.'); });
        this.refreshAll();
      } else {
        speak(sentence);
        wstat(this.s, item).seen += 1;
        this.peek = true; this.refreshWish();
        this.time.delayedCall(3500, () => { this.peek = false; this.refreshWish(); });
      }
    }

    pickWish(last) {
      let c = Object.keys(PLANTS).filter((k) => this.s.lib[k] && k !== last);
      if (!c.length) c = Object.keys(PLANTS).filter((k) => k !== last);
      return Phaser.Utils.Array.GetRandom(c);
    }

    touchWord(w) { wstat(this.s, w).seen += 1; }

    toggleLibrary(on) {
      this.libOpen = on;
      this.lib.setVisible(on);
      if (on) {
        this.libDetailEn.setText('Tap a card'); this.libDetailZh.setText('點一張卡片來聽聽看');
        this.refreshLibrary();
      }
    }

    pickCard(e) {
      if (!this.s.lib[e.k]) { this.libDetailEn.setText('?'); this.libDetailZh.setText('還沒發現，試試看種下它或等到那種天氣'); return; }
      speak(e.en);
      this.touchWord(e.en);
      this.libDetailEn.setText(e.en);
      if (e.kind === 'plant') {
        const p = PLANTS[e.k];
        this.libDetailZh.setText(e.zh + '　我們用到的部位：' + p.part + '（' + p.partZh + '）\n' + p.fact);
      } else {
        this.libDetailZh.setText(e.zh + '\n' + e.fact);
      }
    }

    // --- 教學 ---
    tutLines() {
      return [
        { en: 'Tap the seed.',          zh: '點一下紅蘿蔔種子',   target: () => ({ x: TOOL_X.carrot, y: 585 }) },
        { en: 'Plant it here.',         zh: '種在這個位置',        target: () => ({ x: PLOT_X[1], y: PLOT_Y[0] - 100 }) },
        { en: 'Water it.',              zh: '點澆水壺，再點它',    target: () => ({ x: TOOL_X.water, y: 585 }) },
        { en: 'Wait. It will grow.',    zh: '等一等，它會長大。看看太陽和雨', target: null },
        { en: 'Pick the carrot!',       zh: '摘下紅蘿蔔',         target: () => { const i = this.s.plots.findIndex((p) => p.plant && p.progress >= 1); const o = this.plotObjs[Math.max(0, i)]; return { x: o.x, y: o.y - 130 }; } },
        { en: 'Give it to the rabbit.', zh: '把它給兔子',         target: () => ({ x: RABBIT.x, y: RABBIT.y - 130 }) },
        { en: 'Great job!',             zh: '做得好！',            target: null },
      ];
    }

    tutNext(from) {
      if (this.s.tut !== from) return;
      this.s.tut = from + 1;
      this.refreshPip();
      if (this.s.tut === 6) this.time.delayedCall(4500, () => { this.s.tut = 7; this.refreshPip(); });
    }

    refreshPip() {
      const lines = this.tutLines();
      const t = this.s.tut;
      if (t >= lines.length) { this.pipBubble.setVisible(false); this.arrow.setVisible(false); return; }
      const L = lines[t];
      this.pipBubble.setVisible(true);
      this.pipEn.setText(L.en); this.pipZh.setText(L.zh);
      const w = Math.max(this.pipEn.width, this.pipZh.width) + 36;
      this.pipG.clear(); drawBubble(this.pipG, 0, 0, w, 96, 30);
      speak(L.en);
      const tg = L.target ? L.target() : null;
      if (tg) { this.arrow.setVisible(true).setPosition(tg.x, tg.y); } else { this.arrow.setVisible(false); }
    }

    // --- 天氣與日 ---
    nextDay() {
      const s = this.s;
      s.day += 1; s.t = 0;
      let pick = s.weather;
      let guard = 0;
      while (pick === s.weather && guard++ < 20) {
        let r = Math.random(), acc = 0;
        for (const [k, w] of WEATHER_PICK) { acc += w; if (r <= acc) { pick = k; break; } }
      }
      s.weather = pick;
      this.applyWeatherLook(false);
      this.showBanner();
    }

    showBanner() {
      const s = this.s, w = WEATHER[s.weather];
      s.lib[s.weather] = true;
      this.touchWord(WEATHER_KEYWORD[s.weather]);
      const wk = WEATHER_KEYWORD[s.weather];
      this.bannerDay.setText('Day ' + s.day);
      this.bannerEn.setText(w.phrase);
      this.bannerZh.setText(wstage(s, wk) === 0 ? w.zh : '');
      drawIcon(this.bannerIcon, s.weather);
      speak(w.phrase);
      this.tweens.killTweensOf(this.banner);
      this.banner.setAlpha(0).setY(230);
      this.tweens.add({ targets: this.banner, alpha: 1, y: 250, duration: 350 });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 3200, duration: 600 });
      wstat(s, wk).ok += 1;
      this.refreshLibrary();
    }

    applyWeatherLook(initial) {
      const key = this.s.weather, w = WEATHER[key];
      const g = this.skyG; g.clear();
      g.fillGradientStyle(w.sky[0], w.sky[0], w.sky[1], w.sky[1], 1); g.fillRect(0, 0, W, H);
      this.sunG.setVisible(key === 'sunny' || key === 'windy');
      this.sunG.setAlpha(key === 'sunny' ? 1 : 0.8);
      if (key === 'sunny') this.drawClouds(0xffffff, 0.55);
      else if (key === 'cloudy') this.drawClouds(0xcfd6dc, 1);
      else if (key === 'rainy') this.drawClouds(0x7d8b97, 1);
      else this.drawClouds(0xffffff, 0.8);
      this.lastWeatherDrawn = key;
      drawIcon(this.dayWeatherIcon, key);
    }

    // --- 重繪 ---
    redrawTools() {
      Object.values(this.tools).forEach((t) => {
        const on = this.tool === t.k;
        t.bg.clear();
        t.bg.fillStyle(on ? 0xffe082 : 0xf1f5f9, 1); t.bg.fillRoundedRect(-52, -42, 104, 84, 18);
        if (on) { t.bg.lineStyle(4, 0xff9800, 1); t.bg.strokeRoundedRect(-52, -42, 104, 84, 18); }
      });
    }

    refreshWish() {
      const item = this.s.wish;
      this.wish.setVisible(!!item);
      if (!item) return;
      const st = wstage(this.s, item);
      const showPic = st < 2 || this.peek;
      const showZh = st === 0 || this.peek;
      this.wishG.clear(); drawBubble(this.wishG, 0, 0, 340, 126, 120);
      this.wishIcon.setVisible(showPic);
      if (showPic) drawIcon(this.wishIcon, item);
      this.wishEn.setX(showPic ? 118 : 24).setText('I want ' + PLANTS[item].art + '.');
      this.wishZh.setX(showPic ? 118 : 24).setText(showZh ? '我想要' + zhOf(item) : '');
    }

    refreshLibrary() {
      this.libCards.forEach(({ e, bg, icon, name }) => {
        const got = !!this.s.lib[e.k];
        bg.clear();
        bg.fillStyle(got ? 0xffffff : 0xe3dccf, 1); bg.fillRoundedRect(-110, -84, 220, 168, 22);
        bg.lineStyle(3, got ? 0xffc46b : 0xcfc6b5, 1); bg.strokeRoundedRect(-110, -84, 220, 168, 22);
        icon.setVisible(got); name.setText(got ? e.en : '?');
        if (!got) name.setColor('#9a917f'); else name.setColor('#27384a');
      });
    }

    refreshAll() {
      const s = this.s;
      this.dustText.setText(String(s.stardust));
      Object.keys(this.invText).forEach((k) => this.invText[k].setText('x' + (s.inv[k] || 0)));
      this.refreshWish();
      this.refreshPip();
      this.redrawTools();
    }

    // --- 特效 ---
    floatText(x, y, str, color) {
      const t = txt(this, x, y, str, 30, color, { fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
    }
    splash(x, y) {
      for (let i = 0; i < 8; i++) {
        const d = this.add.graphics({ x: x + Phaser.Math.Between(-30, 30), y }).setDepth(50);
        d.fillStyle(0x3b8de0, 1); d.fillCircle(0, 0, 5);
        this.tweens.add({ targets: d, y: y + Phaser.Math.Between(40, 90), alpha: 0, duration: 520, onComplete: () => d.destroy() });
      }
    }
    sparkle(x, y) {
      for (let i = 0; i < 10; i++) {
        const d = this.add.graphics({ x, y }).setDepth(50);
        d.fillStyle(0xffd54a, 1); d.fillCircle(0, 0, 5);
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 50;
        this.tweens.add({ targets: d, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, duration: 650, onComplete: () => d.destroy() });
      }
    }
    hearts() {
      for (let i = 0; i < 5; i++) {
        const d = this.add.graphics({ x: RABBIT.x + Phaser.Math.Between(-50, 50), y: RABBIT.y - 90 }).setDepth(50);
        d.fillStyle(0xf06292, 1); d.fillCircle(-6, -4, 7); d.fillCircle(6, -4, 7); d.fillTriangle(-13, -1, 13, -1, 0, 14);
        this.tweens.add({ targets: d, y: d.y - 90, alpha: 0, duration: 1200, delay: i * 120, onComplete: () => d.destroy() });
      }
    }

    // --- 主迴圈 ---
    update(time, delta) {
      const dt = Math.min(delta, 100) / 1000 * SPEED;
      const s = this.s, w = WEATHER[s.weather];
      const tSec = time / 1000;

      if (!this.libOpen) {
        s.t += dt;
        if (s.t >= DAY_LEN) this.nextDay();
      }

      // 日進度條
      const frac = Math.min(1, s.t / DAY_LEN);
      this.dayBar.clear();
      this.dayBar.fillStyle(0xffffff, 0.75); this.dayBar.fillRoundedRect(490, 62, 300, 16, 8);
      this.dayBar.fillStyle(0xffc107, 1); this.dayBar.fillRoundedRect(490, 62, Math.max(16, 300 * frac), 16, 8);
      this.dayIcon.setX(490 + 300 * frac);
      this.dayText.setText('Day ' + s.day);

      // 雲飄動
      this.clouds.forEach((c) => { c.g.x += c.v * dt * (s.weather === 'windy' ? 6 : 1); if (c.g.x > W + 200) c.g.x = -300; });

      // 特效：雨、風
      const fx = this.fxG; fx.clear();
      if (s.weather === 'rainy') {
        fx.lineStyle(3, 0x4a90d9, 0.75);
        this.raindrops.forEach((d) => {
          d.y += d.v * dt; d.x -= 80 * dt;
          if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 100); }
          fx.lineBetween(d.x, d.y, d.x - 6, d.y + 26);
        });
      } else if (s.weather === 'windy') {
        fx.lineStyle(3, 0xffffff, 0.7);
        this.windLines.forEach((l) => {
          l.x += l.v * dt;
          if (l.x > W + 100) { l.x = -l.l; l.y = 60 + Math.random() * 420; }
          fx.lineBetween(l.x, l.y, l.x - l.l, l.y);
        });
      }

      // 地塊
      for (let i = 0; i < 6; i++) {
        const p = s.plots[i], o = this.plotObjs[i];
        const shaded = (i % 3) === 0;
        const light = w.light * (shaded ? 0.5 : 1);
        if (!this.libOpen) {
          p.water = Phaser.Math.Clamp(p.water - w.dry * dt + w.rain * dt, 0, 1);
          if (p.plant) {
            const pl = PLANTS[p.plant];
            if (p.water >= 0.2 && p.progress < 1) {
              const before = p.progress;
              // 光照不足時長得比較慢，而不是完全停住（避免卡死）
              const rate = Math.min(1, light / pl.need);
              p.progress = Math.min(1, p.progress + rate * dt / pl.secs);
              if (before < 1 && p.progress >= 1 && s.tut === 3) this.tutNext(3);
            }
          }
        }
        // 土壤顏色隨含水量
        const wet = Math.round(p.water * 10);
        const sig = [p.plant, Math.floor(p.progress * 50), p.water < 0.08, wet].join('|');
        if (sig !== o.sig) {
          o.sig = sig;
          const g = o.soil; g.clear();
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(150, 112, 70), new Phaser.Display.Color(86, 58, 34), 10, wet);
          g.fillStyle(0x000000, 0.12); g.fillEllipse(0, 14, 150, 62);
          g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1); g.fillEllipse(0, 6, 140, 56);
          if (p.plant) drawPlant(o.plant, p.plant, p.progress, p.water < 0.08); else o.plant.clear();
        }
        // 輕輕搖擺
        o.plant.rotation = Math.sin(tSec * (s.weather === 'windy' ? 4 : 1.5) + i) * (s.weather === 'windy' ? 0.1 : 0.03);

        // 提示泡泡
        let kind = '';
        if (p.plant && p.progress < 1) {
          if (p.water < 0.2) kind = 'drop';
          else if (light < PLANTS[p.plant].need) kind = 'sun';
        } else if (p.plant && p.progress >= 1) kind = 'ready';
        if (kind !== o.hintKind) {
          o.hintKind = kind;
          o.hg.clear();
          o.hint.setVisible(!!kind);
          if (kind === 'drop') { drawIcon(o.hg, 'drop'); }
          else if (kind === 'sun') { drawIcon(o.hg, 'sun'); o.hg.setAlpha(0.55); }
          else if (kind === 'ready') {
            o.hg.fillStyle(0xffd54a, 1);
            const pts = []; for (let k = 0; k < 10; k++) { const r = k % 2 ? 9 : 20; const a = -Math.PI / 2 + k * Math.PI / 5; pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r)); }
            o.hg.fillPoints(pts, true);
          }
          if (kind !== 'sun') o.hg.setAlpha(1);
        }
      }

      // 樹蔭顯示固定，不需更新
      if (this.arrow.visible && this.s.tut === 4) {
        const i = s.plots.findIndex((p) => p.plant && p.progress >= 1);
        if (i >= 0) this.arrow.setPosition(this.plotObjs[i].x, this.plotObjs[i].y - 130);
      }
    }
  }

  const WEATHER_KEYWORD = { sunny: 'sunny', cloudy: 'cloudy', rainy: 'rainy', windy: 'windy' };

  new Phaser.Game({
    type: Phaser.AUTO,
    width: W, height: H,
    parent: 'game',
    backgroundColor: '#cfe9ff',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [Title, Island],
  });
})();
