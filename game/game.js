/* 浮島日記 Floating Isle Diary — M2 核心修正：鏟子、選取交付、ok 與排程器、天氣圖示、日記、教學改檢查完成
 * 全部美術以程式繪製，語音暫用瀏覽器內建 speechSynthesis（正式版改為預錄音檔）。
 * 單字紀錄、排程器、選項與日記句子在 logic.js（與 Node 模擬共用）。
 * 偵錯：?fast=1 為 4 倍速（也可 ?fast=20）、?reset=1 清除存檔、?bot=1 亂點機器人（忽略測試，用另一個存檔）。 */
(() => {
  const W = 1280, H = 720;
  const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif';
  const params = new URLSearchParams(location.search);
  const FAST = Number(params.get('fast')) || 0;
  const SPEED = FAST > 1 ? FAST : (FAST ? 4 : 1);
  const BOT = !!params.get('bot');
  // 內部 key 是舊暫定名，刻意不改，避免玩家存檔消失；機器人用另一個存檔，不會蓋掉真的進度
  // ?save=名稱 使用另一個存檔（測試用，不會動到正式進度）
  const SAVE_KEY = BOT ? 'cloudisland-bot' : (params.get('save') ? 'cloudisland-' + params.get('save').replace(/\W/g, '') : 'cloudisland-v1');
  const DAY_LEN = 60; // 一天幾秒
  // ?reset=1 先清存檔再開始。要在舊頁面 pagehide 存檔之後才清，所以放在新頁面載入時執行
  if (params.get('reset') || BOT) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
    if (params.get('reset')) {
      params.delete('reset');
      const q = params.toString();
      try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '')); } catch (e) { /* 忽略 */ }
    }
  }
  const WORDS = window.WORDS || {};
  const L = window.Logic;
  const zhOf = (w) => (WORDS[w.toLowerCase()] || {}).zh || '';

  // ---------- 資料 ----------
  const WEATHER = {
    // 數值由 sim_m1 模擬決定（見 機制規劃.md §2）
    sunny:  { light: 1.0,  dry: 0.010, rain: 0,    sky: [0x6dc0f2, 0xd9f1ff], phrase: 'It is sunny today.',  zh: '今天是晴天' },
    cloudy: { light: 0.4,  dry: 0.006, rain: 0,    sky: [0x93a3b1, 0xd2dae0], phrase: 'It is cloudy today.', zh: '今天是多雲' },
    rainy:  { light: 0.15, dry: 0,     rain: 0.08, sky: [0x56646f, 0x9aa8b4], phrase: 'It is rainy today.',  zh: '今天在下雨' },
    windy:  { light: 0.8,  dry: 0.015, rain: 0,    sky: [0x86d4e6, 0xe2f6fb], phrase: 'It is windy today.',  zh: '今天有風' },
  };
  const WEATHER_KEYS = Object.keys(WEATHER);
  const WEATHER_PICK = [['sunny', 0.4], ['cloudy', 0.25], ['rainy', 0.25], ['windy', 0.1]];

  const PLANTS = {
    carrot: { need: 0.3, secs: 75, part: 'root',  partZh: '根',   art: 'a carrot', fact: '我們吃的紅蘿蔔是它的「根」，長在土裡。' },
    bean:   { need: 0.5, secs: 110, part: 'seed',  partZh: '種子', art: 'a bean',   fact: '我們吃的豆子是它的「種子」，種下去又能長出新的豆子。' },
    rose:   { need: 0.7, secs: 150, part: 'flower',partZh: '花',   art: 'a rose',   fact: '玫瑰需要很多陽光才會開花，躲在樹蔭下長得慢。' },
  };
  const PLANT_KEYS = Object.keys(PLANTS);

  // 池塘森林的動物（§4.5、§4.6）：home 要蓋的棲地、clue 句子裡決定棲地的關鍵字（記在這個字的 ok/miss）、
  // sound 叫聲（畫面上同時顯示文字，靜音也能玩）、hint 聽錯時的提示、likes 住下來後會想要的東西
  const ANIMALS = {
    frog:   { zh: '青蛙', home: 'pond',  clue: 'water', say: 'I like water.',     sayZh: '我喜歡水。',   sound: 'Ribbit!',  hint: 'It lives in a pond.', likes: ['rose'],           fact: '青蛙小時候是住在水裡的蝌蚪，長大後住在池塘邊。' },
    duck:   { zh: '鴨子', home: 'pond',  clue: 'swim',  say: 'I can swim.',       sayZh: '我會游泳。',   sound: 'Quack!',   hint: 'It lives in a pond.', likes: ['bean', 'rose'],   fact: '鴨子的腳有蹼，像槳一樣幫牠划水。' },
    fish:   { zh: '魚',   home: 'pond',  clue: 'water', say: 'I live in water.',  sayZh: '我住在水裡。', sound: null,       hint: '',                    likes: [],                 fact: '魚用鰓呼吸水裡的氧氣，離開水就不能活。' },
    bird:   { zh: '鳥',   home: 'tree',  clue: 'tree',  say: 'I live in a tree.', sayZh: '我住在樹上。', sound: 'Tweet!',   hint: 'It lives in a tree.', likes: ['bean'],           fact: '鳥有翅膀和羽毛，常在樹上用樹枝築巢。' },
    monkey: { zh: '猴子', home: 'tree',  clue: 'climb', say: 'I can climb.',      sayZh: '我會爬樹。',   sound: 'Ooh ooh ah ah!', hint: 'It lives in a tree.', likes: ['bean', 'carrot'], fact: '猴子的手腳都能抓握，很適合在樹上爬來爬去。' },
    cow:    { zh: '牛',   home: 'grass', clue: 'grass', say: 'I eat grass.',      sayZh: '我吃草。',     sound: 'Moo!',     hint: 'It eats grass.',      likes: ['carrot', 'bean'], fact: '牛吃草，會把吞下去的草再吐回嘴裡慢慢嚼。' },
    horse:  { zh: '馬',   home: 'grass', clue: 'grass', say: 'I like grass.',     sayZh: '我喜歡草。',   sound: 'Neigh!',   hint: 'It eats grass.',      likes: ['carrot'],         fact: '馬吃草，腿又長又有力，可以跑得很快。' },
  };
  const ANIMAL_KEYS = Object.keys(ANIMALS);
  const SOUND_KEYS = ANIMAL_KEYS.filter((k) => ANIMALS[k].sound);
  const HABITATS = { pond: { zh: '池塘' }, tree: { zh: '樹' }, grass: { zh: '草地' } };
  const HAB_KEYS = Object.keys(HABITATS);
  const OFF = 1280;             // 池塘森林在草地右邊一個畫面寬的位置，切換區域時相機平移
  // 森林空地排成一排；前 LOTS_START 塊一開始就能用，之後依序用星砂擴建（§3.4），價格見 LOT_PRICE
  const LOT_X = [270, 390, 510, 630, 750, 870, 990];
  const LOTS_START = 4;
  const LOT_PRICE = [0, 0, 0, 0, 8, 10, 12];
  const LOT_Y = 540;
  const VISITOR = { x: 1130, y: 470 };
  const HAB_COST = 4;           // 蓋棲地花的星砂；用鏟子拆掉退一半
  const FOREST_NEED = 5;        // 完成幾個願望後解鎖池塘森林（§5）
  const art = (w) => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;

  // 市集與日曆（§4.4、§4.17）：森林住進 TOWN_NEED 隻動物（加上兔子就是第 3 位居民，§5）後開放
  const TOWN_NEED = 2;
  const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekday = (d) => WEEK[(d - 1) % 7];           // 第 1 天是星期一
  const NUMS = ['one', 'two', 'three', 'four', 'five'];
  const COLORS = { red: 0xe53935, green: 0x7cb342, yellow: 0xfdd835, purple: 0x8e24aa };
  const BINS = [['apple', 'red'], ['apple', 'green'], ['apple', 'yellow'], ['grape', 'purple'], ['grape', 'green'], ['banana', 'yellow']];
  const PLURAL = { apple: 'apples', grape: 'grapes', banana: 'bananas' };
  // 衣物訂單：句子只說天氣，玩家要想到該穿什麼（用 What do I need? 而不是 I need a ...，避免冠詞 an 洩漏答案）
  const NEEDS = [
    { word: 'sunny', say: 'It is sunny.', zh: '出太陽了。', ok: 'hat' },
    { word: 'hot',   say: 'It is hot.',   zh: '好熱。',     ok: 'hat' },
    { word: 'rainy', say: 'It is rainy.', zh: '下雨了。',   ok: 'rain' },
    { word: 'cold',  say: 'It is cold.',  zh: '好冷。',     ok: 'coat' },
  ];

  const LIB = [
    { k: 'carrot', en: 'carrot', zh: '紅蘿蔔', kind: 'plant' },
    { k: 'bean',   en: 'bean',   zh: '豆子',   kind: 'plant' },
    { k: 'rose',   en: 'rose',   zh: '玫瑰',   kind: 'plant' },
    { k: 'sunny',  en: 'sunny',  zh: '晴天',   kind: 'weather', fact: '晴天陽光充足，植物長得快，水也乾得快。' },
    { k: 'cloudy', en: 'cloudy', zh: '多雲',   kind: 'weather', fact: '多雲時陽光變少，需要很多陽光的植物會長得慢。' },
    { k: 'rainy',  en: 'rainy',  zh: '下雨',   kind: 'weather', fact: '下雨時植物會得到水，不用自己澆，但陽光很少。' },
    { k: 'windy',  en: 'windy',  zh: '有風',   kind: 'weather', fact: '空氣流動就會產生風，風會讓土壤的水分乾得更快。' },
  ];
  ANIMAL_KEYS.forEach((k) => LIB.push({ k, en: k, zh: ANIMALS[k].zh, kind: 'animal', fact: ANIMALS[k].fact }));
  const LIB_PER_PAGE = 8;

  const TOOL_KEYS = ['carrot', 'bean', 'rose', 'water', 'shovel'];
  const TOOL_X = { carrot: 100, bean: 206, rose: 312, water: 418, shovel: 524 };
  const BAG_X = { carrot: 730, bean: 862, rose: 994 };
  const PLOT_X = [430, 600, 770];
  const PLOT_Y = [430, 550];
  const RABBIT = { x: 1020, y: 500 };
  const PIP = { x: 130, y: 500 };
  const TUT = ['seed', 'plant', 'water', 'grow', 'pick', 'give'];
  const wishSentence = (k) => 'I want ' + PLANTS[k].art + '.';

  // ---------- 存檔 ----------
  function emptyEvents() { return { planted: [], picked: [], gave: [], came: [], party: [] }; }
  function defaultState() {
    return {
      v: 2, day: 1, t: 0, weather: 'sunny', stardust: 0,
      inv: { carrot: 0, bean: 0, rose: 0 },
      plots: Array.from({ length: 6 }, () => ({ plant: null, progress: 0, water: 0.3 })),
      words: {}, lib: { sunny: true }, tut: 0, done: {}, muted: false,
      wishes: {}, fwho: null, lastWish: null, sched: { n: 0 }, gaveTotal: 0,
      forestOpen: false, lots: LOT_X.map(() => ({ hab: null, animal: null })), lotsOpen: LOTS_START, visitor: null,
      town: false, party: null, lastInvite: 0,
      subs: true, // 中文字幕：英文句子下方的中文翻譯（設定裡可關）
      ev: emptyEvents(), askedDay: 0, diary: [], diaryQ: null,
    };
  }
  // M1 存檔（v1）轉 v2：M1 的 ok 是「看到」不是「答對」，歸零；教學進度轉成完成旗標
  function migrate(s) {
    if (s.v === 1) {
      const words = {};
      Object.keys(s.words || {}).forEach((w) => { words[w] = { seen: (s.words[w] || {}).seen || 0 }; });
      s.words = words;
      const t = s.tut || 0;
      s.done = {};
      TUT.forEach((k, i) => { if (i < Math.min(t, 6)) s.done[k] = true; });
      if (t >= 6) s.tut = 7;
      s.v = 2;
    }
    return s;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = migrate(JSON.parse(raw));
        if (s && s.v === 2) return upgrade(Object.assign(defaultState(), s));
      }
    } catch (e) { /* 無法讀取就用新存檔 */ }
    return upgrade(defaultState());
  }
  // M2 → M3：兔子的願望搬進 wishes；舊事件補上 came
  function upgrade(s) {
    if ('wish' in s) { if (s.wish) s.wishes.rabbit = s.wish; delete s.wish; }
    if (!s.ev.came) s.ev.came = [];
    if (!s.ev.party) s.ev.party = [];
    while (s.lots.length < LOT_X.length) s.lots.push({ hab: null, animal: null }); // 森林擴建前的存檔
    if (params.get('unlock')) s.forestOpen = true; // 偵錯：直接開放池塘森林
    return s;
  }
  function saveState(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }

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
      case 'shovel':
        g.lineStyle(6, 0x8d6e4a, 1); g.lineBetween(0, -30, 0, 4);
        g.lineStyle(5, 0x6d4c2f, 1); g.lineBetween(-9, -30, 9, -30);
        g.fillStyle(0x90a4ae, 1); g.fillRoundedRect(-12, 2, 24, 16, 4); g.fillTriangle(-12, 16, 12, 16, 0, 30);
        g.fillStyle(0xffffff, 0.35); g.fillRect(-7, 5, 4, 14);
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
      case 'speaker':
        g.fillStyle(0x27384a, 1); g.fillRect(-14, -6, 8, 12); g.fillTriangle(-6, -6, 6, -16, 6, 16); g.fillTriangle(-6, 6, 6, 16, -6, -6);
        g.lineStyle(3, 0x27384a, 1); g.beginPath(); g.arc(8, 0, 9, -0.9, 0.9, false); g.strokePath();
        break;
      case 'lens':
        g.lineStyle(5, 0x27384a, 1); g.strokeCircle(-4, -4, 11); g.lineBetween(4, 4, 15, 15);
        break;
      case 'moon':
        g.fillStyle(0xffd54a, 1); g.fillCircle(0, 0, 16);
        g.fillStyle(0x3d5a80, 1); g.fillCircle(8, -6, 14);
        break;
      case 'frog':
        g.fillStyle(0x4caf50, 1); g.fillEllipse(0, 8, 46, 30); g.fillCircle(-11, -8, 9); g.fillCircle(11, -8, 9);
        g.fillStyle(0xffffff, 1); g.fillCircle(-11, -9, 6); g.fillCircle(11, -9, 6);
        g.fillStyle(0x222222, 1); g.fillCircle(-11, -9, 3); g.fillCircle(11, -9, 3);
        g.lineStyle(2, 0x2e7d32, 1); g.beginPath(); g.arc(0, 6, 10, 0.3, Math.PI - 0.3, false); g.strokePath();
        g.fillStyle(0x388e3c, 1); g.fillEllipse(-20, 20, 14, 7); g.fillEllipse(20, 20, 14, 7);
        break;
      case 'duck':
        g.fillStyle(0xffd54a, 1); g.fillEllipse(-4, 10, 44, 28); g.fillCircle(12, -10, 12);
        g.fillStyle(0xffb300, 1); g.fillEllipse(-8, 8, 22, 12);
        g.fillStyle(0xff8a1f, 1); g.fillTriangle(22, -12, 34, -8, 22, -5);
        g.fillStyle(0x222222, 1); g.fillCircle(15, -13, 2.5);
        break;
      case 'fish':
        g.fillStyle(0xff8a3d, 1); g.fillEllipse(-4, 0, 40, 22); g.fillTriangle(12, 0, 26, -12, 26, 12);
        g.fillStyle(0xffb27a, 1); g.fillTriangle(-6, -10, 4, -10, 0, -17);
        g.fillStyle(0x222222, 1); g.fillCircle(-14, -3, 2.5);
        break;
      case 'bird':
        g.fillStyle(0x4fa3e0, 1); g.fillCircle(0, 4, 16); g.fillCircle(10, -10, 10);
        g.fillStyle(0x2f7fc0, 1); g.fillEllipse(-4, 6, 20, 10);
        g.fillStyle(0xffb300, 1); g.fillTriangle(18, -12, 28, -9, 18, -6);
        g.fillStyle(0x222222, 1); g.fillCircle(12, -12, 2.5);
        g.lineStyle(2, 0xff8f00, 1); g.lineBetween(-4, 18, -6, 26); g.lineBetween(4, 18, 6, 26);
        break;
      case 'monkey':
        g.fillStyle(0x8d5a3b, 1); g.fillCircle(-20, -4, 8); g.fillCircle(20, -4, 8); g.fillCircle(0, 0, 20);
        g.fillStyle(0xf3d2b3, 1); g.fillEllipse(0, 6, 26, 18); g.fillCircle(-7, -5, 6); g.fillCircle(7, -5, 6);
        g.fillStyle(0x222222, 1); g.fillCircle(-7, -5, 2.5); g.fillCircle(7, -5, 2.5);
        g.lineStyle(2, 0x6d4c41, 1); g.beginPath(); g.arc(0, 8, 6, 0.2, Math.PI - 0.2, false); g.strokePath();
        break;
      case 'cow':
        g.fillStyle(0xd7ccc8, 1); g.fillTriangle(-16, -18, -24, -30, -10, -20); g.fillTriangle(16, -18, 24, -30, 10, -20);
        g.fillStyle(0xeeeeee, 1); g.fillEllipse(-24, -8, 14, 8); g.fillEllipse(24, -8, 14, 8); g.fillRoundedRect(-18, -20, 36, 38, 12);
        g.fillStyle(0x333333, 1); g.fillEllipse(8, -12, 14, 10);
        g.fillStyle(0xf4b6c2, 1); g.fillEllipse(0, 14, 30, 16);
        g.fillStyle(0x333333, 1); g.fillCircle(-5, 14, 2.5); g.fillCircle(5, 14, 2.5); g.fillCircle(-8, -2, 2.5); g.fillCircle(8, -2, 2.5);
        break;
      case 'horse':
        g.fillStyle(0x8d6e4a, 1); g.fillEllipse(0, 2, 30, 50);
        g.fillTriangle(-12, -18, -8, -34, -2, -20); g.fillTriangle(12, -18, 8, -34, 2, -20);
        g.fillStyle(0x4e342e, 1); g.fillRect(-4, -28, 8, 24);
        g.fillStyle(0xbca487, 1); g.fillEllipse(0, 18, 24, 16);
        g.fillStyle(0x222222, 1); g.fillCircle(-8, -6, 2.5); g.fillCircle(8, -6, 2.5); g.fillCircle(-4, 20, 2); g.fillCircle(4, 20, 2);
        break;
      case 'pond':
        g.fillStyle(0x6d8b4e, 1); g.fillEllipse(0, 8, 64, 30);
        g.fillStyle(0x4a90d9, 1); g.fillEllipse(0, 7, 56, 24);
        g.fillStyle(0x8cc4f0, 1); g.fillEllipse(-8, 4, 20, 6);
        g.fillStyle(0x43a047, 1); g.fillCircle(14, 10, 6);
        break;
      case 'tree':
        g.fillStyle(0x7b5230, 1); g.fillRect(-5, -2, 10, 22);
        g.fillStyle(0x2e8b3a, 1); g.fillCircle(0, -14, 16); g.fillCircle(-12, -4, 11); g.fillCircle(12, -4, 11);
        g.fillStyle(0x3aa34a, 1); g.fillCircle(-3, -18, 9);
        break;
      case 'grass':
        g.fillStyle(0x7cb342, 1); g.fillEllipse(0, 16, 60, 14);
        g.fillStyle(0x558b2f, 1);
        for (let i = -4; i <= 4; i++) g.fillTriangle(i * 7 - 3, 16, i * 7 + 3, 16, i * 7 + (i % 2 ? 2 : -2), -4 - Math.abs(i % 3) * 4);
        g.fillStyle(0xfff176, 1); g.fillCircle(-16, 4, 3); g.fillCircle(12, 0, 3);
        break;
      case 'bush':
        g.fillStyle(0x2f7d3b, 1); g.fillCircle(-14, 4, 14); g.fillCircle(14, 4, 14); g.fillCircle(0, -6, 17);
        g.fillStyle(0x3d9a4a, 1); g.fillCircle(-5, -10, 8);
        break;
      case 'rabbit':
        g.fillStyle(0xf3efe9, 1); g.fillEllipse(-8, -22, 10, 30); g.fillEllipse(8, -22, 10, 30); g.fillCircle(0, 4, 18);
        g.fillStyle(0xf4b6c2, 1); g.fillEllipse(-8, -22, 4, 20); g.fillEllipse(8, -22, 4, 20);
        g.fillStyle(0x333333, 1); g.fillCircle(-6, 2, 2.5); g.fillCircle(6, 2, 2.5);
        g.fillStyle(0xf08aa0, 1); g.fillTriangle(-3, 8, 3, 8, 0, 11);
        break;
      case 'hat':
        g.fillStyle(0xd7a35a, 1); g.fillEllipse(0, 8, 56, 16); g.fillRoundedRect(-16, -14, 32, 22, 8);
        g.fillStyle(0xc62828, 1); g.fillRect(-16, 0, 32, 5);
        break;
      case 'coat':
        g.fillStyle(0x8d6e63, 1); g.fillRoundedRect(-16, -18, 32, 42, 6);
        g.fillTriangle(-16, -18, -28, 14, -16, 14); g.fillTriangle(16, -18, 28, 14, 16, 14);
        g.fillStyle(0x5d4037, 1); g.fillTriangle(-8, -18, 8, -18, 0, -6);
        g.fillStyle(0xffe082, 1); g.fillCircle(0, 2, 2.5); g.fillCircle(0, 12, 2.5);
        break;
      case 'umbrella':
        g.fillStyle(0x5c6bc0, 1); g.slice(0, 0, 26, Math.PI, 0, false); g.fillPath();
        g.lineStyle(3, 0x424242, 1); g.lineBetween(0, 0, 0, 22);
        g.beginPath(); g.arc(-5, 22, 5, 0, Math.PI, false); g.strokePath();
        break;
      case 'raincoat':
        g.fillStyle(0xfdd835, 1); g.fillCircle(0, -16, 11); g.fillRoundedRect(-16, -10, 32, 36, 6);
        g.fillTriangle(-16, -10, -26, 18, -16, 18); g.fillTriangle(16, -10, 26, 18, 16, 18);
        g.fillStyle(0xf9a825, 1); g.fillCircle(0, -14, 6); g.fillRect(-1, -4, 2, 28);
        break;
      case 'shoes':
        g.fillStyle(0x1e88e5, 1); g.fillRoundedRect(-26, -2, 24, 14, 6); g.fillRoundedRect(-20, -10, 12, 12, 4);
        g.fillRoundedRect(2, -2, 24, 14, 6); g.fillRoundedRect(8, -10, 12, 12, 4);
        g.fillStyle(0xffffff, 1); g.fillRect(-26, 9, 24, 3); g.fillRect(2, 9, 24, 3);
        break;
      case 'apple': drawFruit(g, 'apple', 'red'); break;
      case 'grape': drawFruit(g, 'grape', 'purple'); break;
      case 'banana': drawFruit(g, 'banana', 'yellow'); break;
      default:
        g.fillStyle(0x999999, 1); g.fillCircle(0, 0, 10);
    }
  }
  // 水果：同一種水果有不同顏色（市集訂單要同時看數量、顏色、品項）
  function drawFruit(g, item, color) {
    g.clear();
    const c = COLORS[color];
    if (item === 'apple') {
      g.fillStyle(c, 1); g.fillCircle(-6, 3, 13); g.fillCircle(6, 3, 13);
      g.fillStyle(0x6d4c2f, 1); g.fillRect(-1, -16, 3, 9);
      g.fillStyle(0x43a047, 1); g.fillEllipse(7, -13, 11, 5);
      g.fillStyle(0xffffff, 0.35); g.fillCircle(-9, -2, 4);
    } else if (item === 'grape') {
      g.fillStyle(c, 1); [[-8, -6], [0, -6], [8, -6], [-4, 3], [4, 3], [0, 12]].forEach(([x, y]) => g.fillCircle(x, y, 6.5));
      g.fillStyle(0x6d4c2f, 1); g.fillRect(-1, -18, 3, 7);
    } else {
      g.lineStyle(11, c, 1); g.beginPath(); g.arc(0, -20, 26, 0.3 * Math.PI, 0.8 * Math.PI, false); g.strokePath();
      g.fillStyle(0x6d4c2f, 1); g.fillCircle(Math.cos(0.3 * Math.PI) * 26, -20 + Math.sin(0.3 * Math.PI) * 26, 3);
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

  // 圓角按鈕：回傳 container，bg 可以重畫
  function makeButton(scene, x, y, w, h, color, label, size, onTap) {
    const c = scene.add.container(x, y);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.15); bg.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, h / 2);
    bg.fillStyle(color, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);
    if (label) c.add(txt(scene, 0, 0, label, size || 28, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', onTap);
    return c;
  }

  // ---------- 標題畫面 ----------
  class Title extends Phaser.Scene {
    constructor() { super('Title'); }
    create() {
      if (BOT) { this.scene.start('Island'); return; }
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
      if (this.s.tut === 6) this.s.tut = 7; // 上次停在「Great job!」就直接結束教學
      muted = BOT || !!this.s.muted;
      this.tool = null;      // 手上的工具：種子、澆水壺、鏟子
      this.held = null;      // 從背包拿出來、準備交給居民的物品
      this.modal = null;     // 'weather' | 'diary' | 'book' | 'lib' | 'settings' | 'build' | 'sound'，開著時時間暫停
      this.zone = 'meadow';  // 'meadow' 草地 | 'forest' 池塘森林
      this.wishTimers = {};
      this.wqs = {};         // 每位居民目前這個願望的作答狀態
      this.vq = { tries: 0, peeked: false, reveal: false, recorded: false };
      this.bushT = 8; this.bushReady = false;
      this.tutShown = -1;
      this.stats = { wish: {}, weather: { q: 0, first: 0 }, diary: { q: 0, first: 0 }, habitat: { q: 0, first: 0 }, sound: { q: 0, first: 0 }, fruit: { q: 0, first: 0 }, clothes: { q: 0, first: 0 }, invite: { q: 0, first: 0 }, harvest: 0, days: 0, planted: 0 };
      this.raindrops = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 300 }));
      this.windLines = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: 60 + Math.random() * 420, v: 900 + Math.random() * 500, l: 60 + Math.random() * 100 }));

      this.skyG = this.add.graphics().setDepth(0);
      this.buildSun();
      this.buildClouds();
      this.fxG = this.add.graphics().setDepth(5);
      // 這之間建立的是「世界」物件（跟著相機平移）；其餘都是固定在畫面上的介面
      const before = new Set(this.children.list);
      this.buildIsland();
      this.buildPlots();
      this.buildRabbit();
      this.buildPip();
      this.buildForest();
      const world = new Set(this.children.list.filter((o) => !before.has(o)));
      this.buildToolbar();
      this.buildHud();
      this.buildBanner();
      this.buildLibrary();
      this.buildWeatherQ();
      this.buildDiary();
      this.buildBook();
      this.buildSettings();
      this.buildBuildMenu();
      this.buildSoundQ();
      this.buildMarket();
      this.buildInvite();
      this.buildNav();
      const fix = (o) => { if (o.setScrollFactor) o.setScrollFactor(0); if (o.list) o.list.forEach(fix); };
      this.children.list.forEach((o) => { if (!world.has(o)) fix(o); });

      this.applyWeatherLook();
      this.refreshAll();
      // 讀檔後接上當天的流程：一天走完在寫日記、早上還沒回答天氣、或剛開始
      if (this.s.t >= DAY_LEN) this.openDiary();
      else if (this.needWeatherQ()) this.openWeatherQ();
      else if (this.s.t < 3) this.showBanner();
      this.ensureWish('rabbit', 800);
      this.ensureForestWish(1500);
      this.checkTown();
      this.renderForest();
      this.renderNav();

      this.time.addEvent({ delay: 5000, loop: true, callback: () => saveState(this.s) });
      window.addEventListener('pagehide', () => saveState(this.s));
      document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(this.s); });
      window.__ci = { scene: this, state: this.s, stats: this.stats, report: () => this.report() };
      if (BOT) this.time.addEvent({ delay: 120, loop: true, callback: () => this.botStep() });
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
      zone.on('pointerdown', () => this.giveTo('rabbit'));
      this.rabbit = c;
      this.tweens.add({ targets: c, y: RABBIT.y - 6, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

      // 點氣泡：重聽句子；在階段 1、2 會露出隱藏的圖或中文，算一次提示（peek）
      this.rabbitWish = this.makeWishBubble(RABBIT.x - 120, RABBIT.y - 290, () => this.onBubble('rabbit'));
    }

    // 居民的願望氣泡：圖＋英文句＋中文，點氣泡呼叫 onTap
    makeWishBubble(x, y, onTap) {
      const c = this.add.container(x, y).setDepth(15);
      const g = this.add.graphics();
      const icon = this.add.graphics({ x: 62, y: 62 });
      const en = txt(this, 118, 26, '', 26, '#27384a', { fontStyle: 'bold' });
      const zh = txt(this, 118, 78, '', 20, '#6b7c8c');
      c.add([g, icon, en, zh]);
      const zone = this.add.zone(x + 150, y + 55, 340, 120).setDepth(22).setInteractive();
      zone.on('pointerdown', onTap);
      return { c, g, icon, en, zh, zone };
    }

    // ---------- 池塘森林（§4.5 棲地、§4.6 叫聲） ----------
    buildForest() {
      const X = OFF + 640;
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(X, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(X, 720, 700, 120);
      g.fillStyle(0x5aa64a, 1); g.fillEllipse(X, 560, 1060, 300);
      g.fillStyle(0x66b556, 1); g.fillEllipse(X, 540, 940, 250);
      const t = this.add.graphics().setDepth(4);
      [[260, 410], [390, 392], [700, 400], [1010, 395], [1120, 410]].forEach(([x, y]) => {
        t.fillStyle(0x6b4a2b, 1); t.fillRect(OFF + x - 8, y, 16, 34);
        t.fillStyle(0x2f7d3b, 1); t.fillCircle(OFF + x, y - 10, 38);
        t.fillStyle(0x3d9a4a, 1); t.fillCircle(OFF + x - 10, y - 20, 24);
      });

      this.lotObjs = LOT_X.map((lx, i) => {
        const x = OFF + lx, y = LOT_Y;
        const base = this.add.graphics({ x, y }).setDepth(6);
        const hab = this.add.graphics({ x, y: y - 8 }).setDepth(7).setScale(1.6);
        const animal = this.add.graphics({ x, y: y - 46 }).setDepth(9).setScale(1.3);
        const price = txt(this, x, y + 2, '', 22, '#ffffff', { fontStyle: 'bold', stroke: '#6d4c2f', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(8);
        const zone = this.add.zone(x, y - 20, 112, 150).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.onLot(i));
        return { x, y, base, hab, animal, price, zone };
      });

      // 來訪的動物與牠說的話
      this.visitorG = this.add.graphics({ x: OFF + VISITOR.x, y: VISITOR.y }).setDepth(10).setScale(1.8);
      this.tweens.add({ targets: this.visitorG, y: VISITOR.y - 8, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      this.visitorBubble = this.add.container(OFF + VISITOR.x - 400, VISITOR.y - 335).setDepth(15);
      const vg = this.add.graphics(); drawBubble(vg, 0, 0, 420, 108, 400);
      this.visitorEn = txt(this, 22, 16, '', 26, '#27384a', { fontStyle: 'bold' });
      this.visitorZh = txt(this, 22, 64, '', 20, '#6b7c8c');
      this.visitorBubble.add([vg, this.visitorEn, this.visitorZh]);
      const vb = this.add.zone(OFF + VISITOR.x - 190, VISITOR.y - 281, 420, 108).setDepth(22).setInteractive();
      vb.on('pointerdown', () => this.onVisitor(true));
      const vz = this.add.zone(OFF + VISITOR.x + 10, VISITOR.y - 10, 170, 190).setDepth(21).setInteractive();
      vz.on('pointerdown', () => this.onVisitor(false));

      // 會發出叫聲的草叢
      this.bushG = this.add.graphics({ x: OFF + 150, y: 480 }).setDepth(8).setScale(2.4);
      drawIcon(this.bushG, 'bush');
      this.bushNote = txt(this, OFF + 150, 390, '?', 44, '#ffffff', { fontStyle: 'bold', stroke: '#2f5d34', strokeThickness: 6 }).setOrigin(0.5).setDepth(16).setVisible(false);
      this.tweens.add({ targets: this.bushNote, y: 375, yoyo: true, repeat: -1, duration: 500 });
      const bz = this.add.zone(OFF + 145, 470, 130, 150).setDepth(20).setInteractive();
      bz.on('pointerdown', () => this.onBush());

      // 森林裡同時只有一位居民提出願望，氣泡跟著那位居民移動
      this.forestWish = this.makeWishBubble(OFF + LOT_X[0] - 120, LOT_Y - 330, () => this.onBubble(this.s.fwho));
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

      this.arrow = this.add.graphics().setDepth(35);
      this.arrow.fillStyle(0xff5252, 1); this.arrow.fillTriangle(-16, -28, 16, -28, 0, 0);
      this.arrow.setVisible(false);
      this.tweens.add({ targets: this.arrow, scale: 1.25, yoyo: true, repeat: -1, duration: 450 });
    }

    buildToolbar() {
      const bar = this.add.graphics().setDepth(30);
      bar.fillStyle(0xffffff, 0.8); bar.fillRoundedRect(30, 616, 1220, 92, 26);
      bar.lineStyle(3, 0xcfd8e0, 1); bar.lineBetween(612, 630, 612, 694);
      this.tools = {};
      TOOL_KEYS.forEach((k) => {
        const c = this.add.container(TOOL_X[k], 662).setDepth(31);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k, 0, -8, k === 'shovel' ? 0.9 : 1.1);
        const label = txt(this, 0, 28, k, 20, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        c.add([bg, icon, label]);
        c.setSize(100, 84).setInteractive({ useHandCursor: true });
        c.on('pointerdown', () => this.selectTool(k));
        this.tools[k] = { c, bg, k };
      });
      // 背包：先點物品拿在手上，再點居民交給牠（不顯示英文名稱，靠願望句子判斷）
      txt(this, 640, 662, '背包', 20, '#6b7c8c').setOrigin(0.5).setDepth(31);
      this.bag = {};
      PLANT_KEYS.forEach((k) => {
        const x = BAG_X[k];
        const c = this.add.container(x, 662).setDepth(31);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k, -22, 0, 0.95);
        const n = txt(this, 14, 0, 'x0', 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0, 0.5);
        c.add([bg, icon, n]);
        c.setSize(122, 80).setInteractive({ useHandCursor: true });
        c.on('pointerdown', () => this.selectBag(k));
        this.bag[k] = { c, bg, icon, n, k };
      });
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

      const hudBtn = (x, label, onTap) => {
        const b = this.add.container(x, 48).setDepth(40);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 0.9); g.fillRoundedRect(-60, -30, 120, 60, 30);
        b.add([g, txt(this, 0, 0, label, 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5)]);
        b.setSize(120, 60).setInteractive({ useHandCursor: true });
        b.on('pointerdown', onTap);
        return b;
      };
      hudBtn(84, '圖鑑', () => this.openLibrary());
      hudBtn(214, '日記', () => this.openBook());

      // 靜音
      const mb = this.add.container(320, 48).setDepth(40);
      this.muteG = this.add.graphics();
      mb.add(this.muteG);
      mb.setSize(60, 60).setInteractive({ useHandCursor: true });
      mb.on('pointerdown', () => this.setMuted(!muted));
      this.drawMute();

      // 設定（齒輪）
      const sb = this.add.container(398, 48).setDepth(40);
      const sg = this.add.graphics();
      sg.fillStyle(0xffffff, 0.9); sg.fillCircle(0, 0, 30);
      sg.fillStyle(0x27384a, 1);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; sg.fillCircle(Math.cos(a) * 14, Math.sin(a) * 14, 5); }
      sg.fillCircle(0, 0, 14);
      sg.fillStyle(0xffffff, 1); sg.fillCircle(0, 0, 6);
      sb.add(sg);
      sb.setSize(60, 60).setInteractive({ useHandCursor: true });
      sb.on('pointerdown', () => this.openSettings());

      // 日進度
      this.dayBar = this.add.graphics().setDepth(40);
      this.dayText = txt(this, 640, 20, '', 24, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(41);
      this.dayIcon = makeIcon(this, 'sun', 640, 70, 0.8).setDepth(42);
      this.dayWeatherIcon = makeIcon(this, 'sunny', 780, 36, 0.7).setDepth(42);
    }

    setMuted(on) {
      muted = on; this.s.muted = on;
      if (on) { try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ } }
      this.drawMute();
      if (this.setRows) this.renderSettings();
    }

    // 中文字幕是否開啟（只影響英文句子的中文翻譯；圖鑑的中文說明是科學內容，不受影響）
    subs() { return this.s.subs !== false; }

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

    // 共用的彈出視窗底：半透明遮罩（擋住下面的點擊）＋面板
    modalBase(depth, x, y, w, h, color) {
      const c = this.add.container(0, 0).setDepth(depth).setVisible(false);
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10243a, 0.55).setInteractive());
      const panel = this.add.graphics();
      panel.fillStyle(0x000000, 0.15); panel.fillRoundedRect(x + 4, y + 8, w, h, 36);
      panel.fillStyle(color, 1); panel.fillRoundedRect(x, y, w, h, 36);
      c.add(panel);
      return c;
    }

    closeButton(c, x, y, onTap) {
      const close = this.add.container(x, y);
      const cg = this.add.graphics();
      cg.fillStyle(0xff7043, 1); cg.fillCircle(0, 0, 30);
      cg.lineStyle(6, 0xffffff, 1); cg.lineBetween(-11, -11, 11, 11); cg.lineBetween(-11, 11, 11, -11);
      close.add(cg); close.setSize(70, 70).setInteractive({ useHandCursor: true });
      close.on('pointerdown', onTap);
      c.add(close);
      return close;
    }

    buildLibrary() {
      const c = this.modalBase(100, 120, 50, 1040, 620, 0xfff8ec);
      c.add(txt(this, 640, 92, '圖鑑 Book', 40, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.libPage = 0;
      this.libCards = [];
      for (let i = 0; i < LIB_PER_PAGE; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 260 + col * 255, y = 206 + row * 172;
        const card = this.add.container(x, y);
        const bg = this.add.graphics();
        const icon = makeIcon(this, 'sunny', 0, -10, 1.5);
        const name = txt(this, 0, 62, '', 24, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        card.add([bg, icon, name]);
        card.setSize(220, 168).setInteractive({ useHandCursor: true });
        const slot = { e: null, card, bg, icon, name };
        card.on('pointerdown', () => { if (slot.e) this.pickCard(slot.e); });
        c.add(card);
        this.libCards.push(slot);
      }
      const pages = Math.ceil(LIB.length / LIB_PER_PAGE);
      this.libPrev = makeButton(this, 860, 92, 64, 56, 0x90a4ae, '◀', 24, () => { this.libPage = (this.libPage + pages - 1) % pages; this.refreshLibrary(); });
      this.libNext = makeButton(this, 1000, 92, 64, 56, 0x90a4ae, '▶', 24, () => { this.libPage = (this.libPage + 1) % pages; this.refreshLibrary(); });
      this.libPageText = txt(this, 930, 92, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.libPrev, this.libNext, this.libPageText]);
      this.libDetailEn = txt(this, 640, 510, '', 36, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.libDetailZh = txt(this, 640, 548, '', 24, '#6b7c8c', { wordWrap: { width: 860 }, align: 'center' }).setOrigin(0.5, 0);
      c.add([this.libDetailEn, this.libDetailZh]);
      this.closeButton(c, 1100, 90, () => this.closeModal());
      this.lib = c;
    }

    // 早上的天氣題（§4.3）：居民問 How is the weather?，從 4 張卡片選今天的天氣
    buildWeatherQ() {
      const c = this.modalBase(80, 230, 120, 820, 470, 0xfffdf6);
      this.wqTitle = txt(this, 640, 190, 'How is the weather?', 44, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.wqZh = txt(this, 640, 240, '今天天氣怎麼樣？', 24, '#6b7c8c').setOrigin(0.5);
      c.add([this.wqTitle, this.wqZh]);
      // 重聽（不算提示）
      const lis = this.add.container(990, 190);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 32);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 1)]);
      lis.setSize(70, 70).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => speak('How is the weather?'));
      c.add(lis);
      // 放大鏡：階段 2 才出現，露出圖示，算一次提示
      this.wqLens = this.add.container(290, 190);
      const pg = this.add.graphics(); pg.fillStyle(0xfff3e0, 1); pg.fillCircle(0, 0, 32);
      this.wqLens.add([pg, makeIcon(this, 'lens', 0, 0, 1)]);
      this.wqLens.setSize(70, 70).setInteractive({ useHandCursor: true });
      this.wqLens.on('pointerdown', () => { this.wq.peeked = true; this.wq.reveal = true; this.renderWeatherQ(); });
      c.add(this.wqLens);
      this.wqCards = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 186, 420);
        const bg = this.add.graphics();
        const icon = makeIcon(this, 'sunny', 0, -38, 1.7);
        const en = txt(this, 0, 42, '', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 78, '', 20, '#6b7c8c').setOrigin(0.5);
        card.add([bg, icon, en, zh]);
        card.setSize(170, 210).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickWeather(i));
        c.add(card);
        return { card, bg, icon, en, zh, x: card.x };
      });
      this.wqBox = c;
    }

    // 日記（§3.5）：一天結束時寫一句，從 3 個詞選一個填空
    buildDiary() {
      const c = this.modalBase(80, 190, 110, 900, 500, 0xfffaf0);
      const lines = this.add.graphics();
      lines.lineStyle(2, 0xd7e6f2, 1);
      for (let y = 250; y <= 560; y += 52) lines.lineBetween(240, y, 1040, y);
      lines.lineStyle(3, 0xf2b8b8, 1); lines.lineBetween(290, 130, 290, 590);
      c.add(lines);
      this.dyTitle = txt(this, 640, 168, '', 36, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dyBefore = txt(this, 0, 300, '', 46, '#27384a').setOrigin(0, 0.5);
      this.dyBlank = txt(this, 0, 300, '', 46, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5, 0.5);
      this.dyAfter = txt(this, 0, 300, '', 46, '#27384a').setOrigin(0, 0.5);
      this.dyLine = this.add.graphics();
      this.dyHint = makeIcon(this, 'sunny', 640, 380, 1.4).setVisible(false);
      c.add([this.dyTitle, this.dyBefore, this.dyBlank, this.dyAfter, this.dyLine, this.dyHint]);
      this.dyOpts = [0, 1, 2].map((i) => {
        const b = this.add.container(640 + (i - 1) * 250, 480);
        const bg = this.add.graphics();
        const en = txt(this, 0, -8, '', 34, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 26, '', 18, '#6b7c8c').setOrigin(0.5);
        b.add([bg, en, zh]);
        b.setSize(220, 96).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.pickDiary(i));
        c.add(b);
        return { b, bg, en, zh, x: b.x };
      });
      this.dyNight = makeButton(this, 640, 560, 300, 80, 0x3d5a80, '', 0, () => this.goodNight());
      this.dyNight.add(makeIcon(this, 'moon', -96, 0, 1));
      this.dyNight.add(txt(this, 18, 0, 'Good night', 32, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      c.add(this.dyNight);
      this.dyBox = c;
    }

    // 日記本：可以翻回前面的頁面
    buildBook() {
      const c = this.modalBase(90, 160, 60, 960, 600, 0xfffaf0);
      c.add(txt(this, 640, 110, '日記本 Diary', 40, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.bookRows = [0, 1, 2, 3, 4].map((i) => {
        const y = 200 + i * 78;
        const row = this.add.container(640, y);
        const bg = this.add.graphics(); bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-420, -32, 840, 64, 18);
        const icon = makeIcon(this, 'sunny', -380, 0, 0.9);
        const day = txt(this, -330, 0, '', 22, '#6b7c8c').setOrigin(0, 0.5);
        const t = txt(this, -230, 0, '', 30, '#27384a').setOrigin(0, 0.5);
        row.add([bg, icon, day, t]);
        row.setSize(840, 64).setInteractive({ useHandCursor: true });
        row.on('pointerdown', () => { if (row.entry) speak(row.entry.text); });
        c.add(row);
        return { row, icon, day, t };
      });
      this.bookEmpty = txt(this, 640, 330, '還沒有日記。過完一天就會寫下第一頁。', 26, '#6b7c8c').setOrigin(0.5);
      this.bookPageText = txt(this, 640, 612, '', 22, '#6b7c8c').setOrigin(0.5);
      this.bookPrev = makeButton(this, 300, 612, 120, 60, 0x90a4ae, '◀', 28, () => { this.bookPage -= 1; this.renderBook(); });
      this.bookNext = makeButton(this, 980, 612, 120, 60, 0x90a4ae, '▶', 28, () => { this.bookPage += 1; this.renderBook(); });
      c.add([this.bookEmpty, this.bookPageText, this.bookPrev, this.bookNext]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.bookBox = c;
    }

    // 設定：中文字幕、聲音（開著時時間暫停，§3.1）
    buildSettings() {
      const c = this.modalBase(95, 340, 150, 600, 400, 0xfffaf0);
      c.add(txt(this, 640, 205, '設定 Settings', 40, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5));
      const rows = [
        { key: 'subs', label: '中文字幕', sub: '英文句子下方顯示中文', get: () => this.subs(), set: (v) => { this.s.subs = v; this.applySubs(); } },
        { key: 'sound', label: '聲音', sub: '唸出英文', get: () => !muted, set: (v) => this.setMuted(!v) },
      ];
      this.setRows = rows.map((r, i) => {
        const y = 300 + i * 110;
        c.add(txt(this, 400, y - 14, r.label, 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0, 0.5));
        c.add(txt(this, 400, y + 24, r.sub, 20, '#6b7c8c').setOrigin(0, 0.5));
        const sw = this.add.container(820, y);
        const g = this.add.graphics();
        const state = txt(this, 0, 0, '', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
        sw.add([g, state]);
        sw.setSize(130, 64).setInteractive({ useHandCursor: true });
        sw.on('pointerdown', () => { r.set(!r.get()); this.renderSettings(); });
        c.add(sw);
        return Object.assign({ g, state }, r);
      });
      this.closeButton(c, 905, 185, () => this.closeModal());
      this.setBox = c;
      this.renderSettings();
    }

    renderSettings() {
      this.setRows.forEach((r) => {
        const on = r.get();
        r.g.clear();
        r.g.fillStyle(on ? 0x43a047 : 0xb0bec5, 1); r.g.fillRoundedRect(-65, -32, 130, 64, 32);
        r.g.fillStyle(0xffffff, 1); r.g.fillCircle(on ? 33 : -33, 0, 25);
        r.state.setText(on ? '開' : '關').setX(on ? -22 : 22);
      });
    }

    openSettings() {
      if (this.modal) return;
      this.modal = 'settings';
      this.renderSettings();
      this.setBox.setVisible(true);
    }

    // 切換字幕後，把畫面上所有中文翻譯重畫一次
    applySubs() {
      this.refreshWish();
      this.renderForest();
      const t = this.tutShown; this.tutShown = -2; this.showPip(t);
      const s = this.s;
      this.bannerZh.setText(this.subs() && L.stage(s.words, s.weather) === 0 ? WEATHER[s.weather].zh : '');
    }

    // --- 彈出視窗與暫停 ---
    paused() { return !!this.modal; }
    closeModal() {
      [this.lib, this.bookBox, this.setBox, this.bmBox, this.mkBox, this.ivBox].forEach((c) => c.setVisible(false));
      this.modal = null;
    }
    openLibrary() {
      if (this.modal) return;
      this.modal = 'lib';
      this.lib.setVisible(true);
      this.libDetailEn.setText('Tap a card'); this.libDetailZh.setText('點一張卡片來聽聽看');
      this.refreshLibrary();
    }
    openBook() {
      if (this.modal) return;
      this.modal = 'book';
      this.bookPage = Math.max(0, Math.ceil(this.s.diary.length / 5) - 1);
      this.bookBox.setVisible(true);
      this.renderBook();
    }
    renderBook() {
      const d = this.s.diary, pages = Math.max(1, Math.ceil(d.length / 5));
      this.bookPage = Phaser.Math.Clamp(this.bookPage, 0, pages - 1);
      this.bookRows.forEach((r, i) => {
        const e = d[this.bookPage * 5 + i];
        r.row.entry = e || null;
        r.row.setVisible(!!e);
        if (e) { drawIcon(r.icon, e.weather); r.day.setText('Day ' + e.day); r.t.setText(e.text); }
      });
      this.bookEmpty.setVisible(!d.length);
      this.bookPageText.setText(d.length ? (this.bookPage + 1) + ' / ' + pages : '');
      this.bookPrev.setVisible(this.bookPage > 0);
      this.bookNext.setVisible(this.bookPage < pages - 1);
    }

    // --- 工具與背包 ---
    selectTool(k) {
      if (this.paused()) return;
      this.tool = this.tool === k ? null : k;
      this.held = null;
      this.redrawTools();
      if (k === 'water') speak('water');
      else if (k === 'shovel') speak('shovel');
      else { speak(k + ' seed'); L.seen(this.s.words, 'seed', this.s.day); }
      if (this.tool && PLANTS[this.tool]) this.markDone('seed');
    }

    selectBag(k) {
      if (this.paused()) return;
      if ((this.s.inv[k] || 0) <= 0) {
        // 沒有這個東西：輕輕搖一下，不做任何事
        this.tweens.add({ targets: this.bag[k].c, x: BAG_X[k] + 6, yoyo: true, repeat: 2, duration: 50, onComplete: () => this.bag[k].c.setX(BAG_X[k]) });
        return;
      }
      this.held = this.held === k ? null : k;
      this.tool = null;
      if (this.held) speak(k);
      this.redrawTools();
    }

    onPlot(i) {
      if (this.paused()) return;
      const p = this.s.plots[i];
      const o = this.plotObjs[i];
      if (p.plant && p.progress >= 1) { this.harvest(i); return; }
      if (this.tool === 'water') {
        p.water = Math.min(1, p.water + 0.6);
        this.splash(o.x, o.y - 60);
        speak('water');
        if (p.plant) this.markDone('water');
        this.refreshAll();
        return;
      }
      if (this.tool === 'shovel') {
        // 鏟子（§3.2）：挖掉還沒成熟的植物，種子回到種子袋，地塊恢復空地
        if (!p.plant) return;
        const k = p.plant;
        p.plant = null; p.progress = 0;
        this.floatText(o.x, o.y - 70, k + ' seed', '#6d4c2f');
        speak(k + ' seed');
        this.refreshAll();
        return;
      }
      if (this.tool && PLANTS[this.tool] && !p.plant) {
        const k = this.tool;
        p.plant = k; p.progress = 0;
        this.s.lib[k] = true;
        this.s.ev.planted.push(k);
        this.stats.planted += 1;
        L.seen(this.s.words, k, this.s.day);
        speak(k);
        this.floatText(o.x, o.y - 70, 'plant!', '#2e7d32');
        this.markDone('plant');
        this.ensureWish('rabbit', 1500);
        this.ensureForestWish(2500);
        this.refreshAll();
      }
    }

    harvest(i) {
      const p = this.s.plots[i], o = this.plotObjs[i];
      const key = p.plant;
      this.s.inv[key] = (this.s.inv[key] || 0) + 1;
      this.s.stardust += 1;
      this.s.ev.picked.push(key);
      this.stats.harvest += 1;
      p.plant = null; p.progress = 0;
      L.seen(this.s.words, key, this.s.day);
      speak(key);
      this.floatText(o.x, o.y - 70, '+1 ' + key, '#e65100');
      this.sparkle(o.x, o.y - 40);
      this.markDone('pick');
      this.refreshAll();
    }

    // --- 居民與願望（§3.3）：每位居民各自有願望；森林裡同時只有一位居民提出願望 ---
    likes(who) { return who === 'rabbit' ? PLANT_KEYS : ANIMALS[who].likes; }
    wishQ(who) { return this.wqs[who] || (this.wqs[who] = { tries: 0, peeked: false, reveal: false, recorded: false }); }
    residents() { return this.s.lots.filter((l) => l.animal).map((l) => l.animal); }
    zoneOf(who) { return who === 'rabbit' ? 'meadow' : 'forest'; }
    posOf(who) {
      if (who === 'rabbit') return { x: RABBIT.x, y: RABBIT.y };
      const i = this.s.lots.findIndex((l) => l.animal === who);
      return { x: OFF + LOT_X[Math.max(0, i)], y: LOT_Y - 40 };
    }
    bodyOf(who) {
      if (who === 'rabbit') return this.rabbit;
      const i = this.s.lots.findIndex((l) => l.animal === who);
      return i >= 0 ? this.lotObjs[i].animal : null;
    }

    // 排一個新願望；正在開視窗時延後
    ensureWish(who, delay) {
      if (!who || this.s.wishes[who] || this.wishTimers[who]) return;
      this.wishTimers[who] = this.time.delayedCall(delay, () => {
        this.wishTimers[who] = null;
        if (this.paused()) { this.ensureWish(who, 1000); return; }
        this.newWish(who);
      });
    }

    newWish(who) {
      const s = this.s;
      // 候選只放「做得到的」：種過的作物，而且是這位居民會想要的
      const cands = this.likes(who).filter((k) => s.lib[k]);
      if (!cands.length) return false;
      const w = L.pick(s.words, cands, s.day, s.lastWish, Math.random, s.sched);
      s.wishes[who] = w; s.lastWish = w;
      L.asked(s.words, w, s.day, s.sched);
      this.wqs[who] = null;
      this.refreshWish();
      if (this.zoneOf(who) === this.zone) speak(wishSentence(w));
      return true;
    }

    // 森林：從住下來、而且有想要的東西的居民裡挑一位
    ensureForestWish(delay) {
      const s = this.s;
      if ((s.fwho && s.wishes[s.fwho]) || this.forestTimer) return;
      this.forestTimer = this.time.delayedCall(delay, () => {
        this.forestTimer = null;
        if (this.paused()) { this.ensureForestWish(1000); return; }
        const res = this.residents().filter((a) => ANIMALS[a].likes.some((k) => s.lib[k]));
        if (!res.length) return;
        const pool = res.length > 1 ? res.filter((a) => a !== s.fwho) : res;
        s.fwho = pool[Math.floor(Math.random() * pool.length)];
        this.newWish(s.fwho);
      });
    }

    onBubble(who) {
      const want = who && this.s.wishes[who];
      if (this.paused() || !want) return;
      speak(wishSentence(want));
      const q = this.wishQ(who);
      if (L.stage(this.s.words, want) >= 1 && !q.reveal) { q.reveal = true; q.peeked = true; this.refreshWish(); }
    }

    // 把手上的東西交給居民（§3.3）
    giveTo(who) {
      if (this.paused()) return;
      const s = this.s, want = s.wishes[who], p = this.posOf(who), body = this.bodyOf(who);
      if (!want) { speak(who === 'rabbit' ? 'Hello!' : 'Hello! I am ' + art(who) + '.'); return; }
      if (!this.held) {
        // 手上沒東西：重聽願望（不算提示），背包閃一下提醒要先拿東西
        speak(wishSentence(want));
        PLANT_KEYS.forEach((k) => this.tweens.add({ targets: this.bag[k].c, scale: 1.12, yoyo: true, duration: 160 }));
        return;
      }
      const item = this.held;
      const kinds = PLANT_KEYS.filter((k) => (s.inv[k] || 0) > 0).length; // 玩家當下的選項數
      const q = this.wishQ(who);
      if (q.tries === 0) {
        const st = this.stats.wish[kinds] || (this.stats.wish[kinds] = { q: 0, first: 0 });
        st.q += 1; if (item === want) st.first += 1;
      }
      if (item === want) {
        s.inv[item] -= 1;
        s.stardust += 5;
        if (!q.recorded) L.answer(s.words, want, { day: s.day, options: kinds, firstTry: q.tries === 0, peeked: q.peeked });
        L.seen(s.words, 'thank', s.day);
        s.ev.gave.push(item);
        s.gaveTotal = (s.gaveTotal || 0) + 1;
        this.floatText(p.x, p.y - 140, 'Thank you!', '#d81b60');
        this.hearts(p.x, p.y);
        speak('Thank you!');
        if (body) this.tweens.add({ targets: body, y: body.y - 40, yoyo: true, duration: 220, repeat: 1 });
        if (!s.inv[item]) this.held = null;
        if (who === 'rabbit') this.markDone('give');
        s.wishes[who] = null; this.wqs[who] = null;
        if (who === 'rabbit') this.ensureWish('rabbit', 2600);
        else { this.ensureForestWish(3000); }
        this.checkUnlock();
        this.refreshAll();
      } else {
        // 選錯：搖頭、物品留在手上、句子再唸一次並露出圖。不扣任何東西
        q.tries += 1;
        if (!q.recorded) { L.answer(s.words, want, { day: s.day, options: kinds, firstTry: false, peeked: q.peeked }); q.recorded = true; }
        q.reveal = true;
        if (body) this.tweens.add({ targets: body, angle: 8, yoyo: true, repeat: 2, duration: 90, onComplete: () => body.setAngle(0) });
        this.floatText(p.x, p.y - 140, 'No, thanks.', '#5c6bc0');
        speak('No, thanks. ' + wishSentence(want));
        this.refreshWish();
      }
    }

    // --- 區域切換與解鎖（§5） ---
    buildNav() {
      this.navF = makeButton(this, 1226, 400, 92, 92, 0x43a047, '', 0, () => this.goZone('forest')).setDepth(40);
      this.navF.add(txt(this, 0, -14, '→', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navFLabel = txt(this, 0, 22, '', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
      this.navF.add(this.navFLabel);
      this.navM = makeButton(this, 54, 400, 92, 92, 0x8d6e4a, '', 0, () => this.goZone('meadow')).setDepth(40);
      this.navM.add(txt(this, 0, -14, '←', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navM.add(txt(this, 0, 22, '草地', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    }

    renderNav() {
      const s = this.s;
      this.navF.setVisible(this.zone === 'meadow');
      this.navF.setAlpha(s.forestOpen ? 1 : 0.55);
      this.navFLabel.setText(s.forestOpen ? '森林' : Math.min(s.gaveTotal || 0, FOREST_NEED) + '/' + FOREST_NEED);
      this.navM.setVisible(this.zone === 'forest');
      if (this.mkBtn) this.mkBtn.setVisible(!!s.town);
    }

    goZone(z) {
      if (this.paused() || this.zone === z) return;
      if (z === 'forest' && !this.s.forestOpen) {
        this.floatText(1130, 330, '再完成 ' + (FOREST_NEED - (this.s.gaveTotal || 0)) + ' 個願望', '#2f5d34', true);
        return;
      }
      this.zone = z;
      this.tweens.add({ targets: this.cameras.main, scrollX: z === 'forest' ? OFF : 0, duration: BOT ? 1 : 600, ease: 'Sine.easeInOut' });
      this.renderNav();
      if (z === 'forest' && this.s.visitor) this.time.delayedCall(700, () => this.sayVisitor());
    }

    checkUnlock() {
      const s = this.s;
      if (s.forestOpen || (s.gaveTotal || 0) < FOREST_NEED) return;
      s.forestOpen = true;
      this.floatText(1100, 320, 'New place!', '#2e7d32', true);
      this.tweens.add({ targets: this.navF, scale: 1.2, yoyo: true, repeat: 5, duration: 300 });
      this.renderNav();
    }

    // --- 訪客與棲地（§4.5） ---
    scheduleVisitor(delay) {
      const s = this.s;
      if (this.visitorTimer || s.visitor || !s.forestOpen) return;
      if (!this.freeLot()) return;
      if (!ANIMAL_KEYS.some((a) => !this.residents().includes(a))) return;
      this.visitorTimer = this.time.delayedCall(delay, () => {
        this.visitorTimer = null;
        if (this.paused()) { this.scheduleVisitor(1000); return; }
        this.nextVisitor();
      });
    }

    nextVisitor() {
      const s = this.s;
      if (s.visitor || !this.freeLot()) return;
      const left = ANIMAL_KEYS.filter((a) => !this.residents().includes(a));
      if (!left.length) return;
      s.visitor = left[Math.floor(Math.random() * left.length)];
      this.vq = { tries: 0, peeked: false, reveal: false, recorded: false };
      L.seen(s.words, s.visitor, s.day);
      this.renderForest();
      if (this.zone === 'forest') this.sayVisitor();
    }

    sayVisitor() {
      const v = this.s.visitor;
      if (v) speak('Hello! I am ' + art(v) + '. ' + ANIMALS[v].say);
    }

    // 點訪客：重聽（不算提示）；點氣泡在階段 1、2 會露出中文，算一次提示
    onVisitor(bubble) {
      const v = this.s.visitor;
      if (this.paused() || !v) return;
      this.sayVisitor();
      if (bubble && L.stage(this.s.words, ANIMALS[v].clue) >= 1 && !this.vq.reveal) {
        this.vq.reveal = true; this.vq.peeked = true; this.renderForest();
      }
    }

    freeLot() { return this.s.lots.some((l, i) => i < this.s.lotsOpen && !l.animal); }

    // 擴建：點下一塊可以買的地一次會顯示價格，3 秒內再點一次才買下（避免誤觸）
    buyLot(i) {
      const s = this.s, o = this.lotObjs[i], price = LOT_PRICE[i];
      if (i !== s.lotsOpen) return;
      if (this.buyArm !== i) {
        this.buyArm = i;
        this.time.delayedCall(3000, () => { if (this.buyArm === i) this.buyArm = null; });
        this.floatText(o.x, o.y - 90, s.stardust >= price ? '再點一次買下 ★' + price : '需要 ★' + price, s.stardust >= price ? '#2e7d32' : '#e65100');
        return;
      }
      this.buyArm = null;
      if (s.stardust < price) { this.floatText(o.x, o.y - 90, '需要 ★' + price, '#e65100'); return; }
      s.stardust -= price;
      s.lotsOpen += 1;
      this.sparkle(o.x, o.y - 20);
      speak('A new place!');
      this.scheduleVisitor(2500);
      this.refreshAll();
    }

    onLot(i) {
      if (this.paused()) return;
      const s = this.s, lot = s.lots[i], o = this.lotObjs[i];
      if (i >= s.lotsOpen) { this.buyLot(i); return; }
      if (lot.animal) {
        if (this.held || s.wishes[lot.animal]) { this.giveTo(lot.animal); return; }
        const A = ANIMALS[lot.animal];
        speak((A.sound ? A.sound + ' ' : '') + 'I am ' + art(lot.animal) + '.');
        this.tweens.add({ targets: o.animal, y: o.y - 70, yoyo: true, duration: 160 });
        return;
      }
      if (this.tool === 'shovel') {
        // 拆掉沒有住人的棲地，退回一半星砂
        if (!lot.hab) return;
        lot.hab = null;
        const back = Math.floor(HAB_COST / 2);
        s.stardust += back;
        this.floatText(o.x, o.y - 90, '+' + back + ' ★', '#e65100');
        this.refreshAll();
        return;
      }
      if (!s.visitor) {
        if (!lot.hab) this.floatText(o.x, o.y - 90, 'Wait for a friend.', '#2f5d34');
        return;
      }
      if (!lot.hab) { this.openBuild(i); return; }
      this.offer(i);
    }

    buildBuildMenu() {
      const c = this.modalBase(80, 250, 120, 780, 480, 0xfffdf6);
      this.bmSay = txt(this, 640, 180, '', 34, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.bmSayZh = txt(this, 640, 222, '', 22, '#6b7c8c').setOrigin(0.5);
      this.bmTitle = txt(this, 640, 268, 'Build a home.　每個 ★' + HAB_COST, 24, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.bmSay, this.bmSayZh, this.bmTitle]);
      this.bmCards = [0, 1, 2].map((i) => {
        const card = this.add.container(640 + (i - 1) * 220, 430);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-95, -110, 190, 220, 24);
        bg.lineStyle(4, 0xa5d6a7, 1); bg.strokeRoundedRect(-95, -110, 190, 220, 24);
        const icon = makeIcon(this, 'pond', 0, -30, 2);
        const en = txt(this, 0, 52, '', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 86, '', 20, '#6b7c8c').setOrigin(0.5);
        card.add([bg, icon, en, zh]);
        card.setSize(190, 220).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickBuild(i));
        c.add(card);
        return { card, icon, en, zh, x: card.x };
      });
      this.closeButton(c, 995, 155, () => this.closeModal());
      this.bmBox = c;
    }

    openBuild(i) {
      this.modal = 'build';
      this.buildLot = i;
      this.bmOrder = L.shuffle(HAB_KEYS);
      this.renderBuild();
      this.bmBox.setVisible(true);
      this.sayVisitor();
    }

    renderBuild() {
      const v = this.s.visitor, A = ANIMALS[v];
      const st = L.stage(this.s.words, A.clue);
      this.bmSay.setText(A.say);
      this.bmSayZh.setText(this.subs() && (st === 0 || this.vq.reveal) ? A.sayZh : '');
      this.bmCards.forEach((c, i) => {
        const k = this.bmOrder[i];
        drawIcon(c.icon, k);
        c.en.setText(k);
        c.zh.setText(this.subs() ? HABITATS[k].zh : '');
      });
    }

    pickBuild(i) {
      if (this.modal !== 'build') return;
      const s = this.s, k = this.bmOrder[i], c = this.bmCards[i];
      if (s.stardust < HAB_COST) {
        // 星砂不夠：不會卡死，收成和完成願望都能賺星砂
        this.tweens.add({ targets: c.card, x: c.x + 10, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        this.floatText(c.x, 300, '需要 ★' + HAB_COST, '#e65100', true);
        return;
      }
      s.stardust -= HAB_COST;
      s.lots[this.buildLot].hab = k;
      speak(k);
      this.closeModal();
      this.offer(this.buildLot);
    }

    // 把棲地給訪客：對了就住下來，錯了牠不會來（但也不會離開）
    offer(i) {
      const s = this.s, lot = s.lots[i], v = s.visitor, A = ANIMALS[v], q = this.vq, o = this.lotObjs[i];
      const right = A.home === lot.hab;
      if (q.tries === 0) { this.stats.habitat.q += 1; if (right) this.stats.habitat.first += 1; }
      if (right) {
        if (!q.recorded) L.answer(s.words, A.clue, { day: s.day, options: HAB_KEYS.length, firstTry: q.tries === 0, peeked: q.peeked });
        lot.animal = v; s.visitor = null;
        s.lib[v] = true;
        s.ev.came.push(v);
        s.stardust += 3;
        this.hearts(o.x, o.y - 20);
        this.floatText(o.x, o.y - 150, 'Thank you!', '#d81b60');
        speak('Thank you! I love my new home.');
        this.refreshLibrary();
        this.scheduleVisitor(6000);
        this.ensureForestWish(4000);
        this.checkTown();
      } else {
        q.tries += 1;
        if (!q.recorded) { L.answer(s.words, A.clue, { day: s.day, options: HAB_KEYS.length, firstTry: false, peeked: q.peeked }); q.recorded = true; }
        q.reveal = true;
        this.tweens.add({ targets: this.visitorG, angle: 10, yoyo: true, repeat: 2, duration: 90, onComplete: () => this.visitorG.setAngle(0) });
        this.floatText(OFF + VISITOR.x, VISITOR.y - 120, 'No, thanks.', '#5c6bc0');
        speak('No, thanks. ' + A.say);
      }
      this.refreshAll();
    }

    renderForest() {
      const s = this.s;
      this.lotObjs.forEach((o, i) => {
        const lot = s.lots[i];
        const open = i < s.lotsOpen, next = i === s.lotsOpen;
        o.base.clear();
        o.zone.input.enabled = open || next;
        o.price.setText(next ? '+\n★' + LOT_PRICE[i] : '');
        if (!open && !next) { o.hab.clear(); o.animal.clear(); return; }
        o.base.fillStyle(0x000000, 0.1); o.base.fillEllipse(0, 12, 112, 44);
        if (next) {
          o.base.lineStyle(3, 0x8d6e4a, 0.8); o.base.strokeEllipse(0, 6, 104, 38);
          o.base.fillStyle(0xc5b38f, 0.5); o.base.fillEllipse(0, 6, 104, 38);
          o.hab.clear(); o.animal.clear();
          return;
        }
        o.base.fillStyle(lot.hab ? 0x8bc34a : 0xa1887f, 1); o.base.fillEllipse(0, 6, 104, 38);
        if (!lot.hab && s.visitor) { o.base.lineStyle(4, 0xffffff, 0.9); o.base.strokeEllipse(0, 6, 112, 46); }
        if (lot.hab) drawIcon(o.hab, lot.hab); else o.hab.clear();
        if (lot.animal) drawIcon(o.animal, lot.animal); else o.animal.clear();
      });
      const v = s.visitor;
      this.visitorG.setVisible(!!v);
      this.visitorBubble.setVisible(!!v);
      if (v) {
        const A = ANIMALS[v];
        drawIcon(this.visitorG, v);
        const st = L.stage(s.words, A.clue);
        this.visitorEn.setText('I am ' + art(v) + '. ' + A.say);
        this.visitorZh.setText(this.subs() && (st === 0 || this.vq.reveal) ? '我是' + A.zh + '，' + A.sayZh : '');
      }
    }

    // --- 叫聲（§4.6）：草叢搖動時點它，聽（也看）叫聲，選出是誰 ---
    soundCands() { return this.residents().filter((a) => ANIMALS[a].sound); }

    tickBush(dt) {
      if (this.bushReady || !this.soundCands().length) return;
      this.bushT -= dt;
      if (this.bushT <= 0) { this.bushReady = true; this.bushNote.setVisible(true); }
    }

    onBush() {
      if (this.paused()) return;
      if (!this.bushReady) { this.tweens.add({ targets: this.bushG, scale: 2.6, yoyo: true, duration: 120 }); return; }
      this.openSound();
    }

    buildSoundQ() {
      const c = this.modalBase(80, 230, 100, 820, 520, 0xfffdf6);
      c.add(makeIcon(this, 'bush', 340, 200, 2.2));
      const sb = this.add.graphics(); drawBubble(sb, 420, 140, 360, 96, 440);
      sb.setAngle(0);
      c.add(sb);
      this.sqSound = txt(this, 600, 188, '', 40, '#e65100', { fontStyle: 'bold' }).setOrigin(0.5);
      this.sqTitle = txt(this, 640, 290, 'Who is it?', 36, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.sqZh = txt(this, 640, 326, '是誰的叫聲？', 20, '#6b7c8c').setOrigin(0.5);
      this.sqHint = txt(this, 640, 590, '', 24, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.sqSound, this.sqTitle, this.sqZh, this.sqHint]);
      const lis = this.add.container(990, 190);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 32);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 1)]);
      lis.setSize(70, 70).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => this.playSound());
      c.add(lis);
      this.sqLens = this.add.container(990, 290);
      const pg = this.add.graphics(); pg.fillStyle(0xfff3e0, 1); pg.fillCircle(0, 0, 32);
      this.sqLens.add([pg, makeIcon(this, 'lens', 0, 0, 1)]);
      this.sqLens.setSize(70, 70).setInteractive({ useHandCursor: true });
      this.sqLens.on('pointerdown', () => { this.sq.peeked = true; this.sq.reveal = true; this.renderSound(); });
      c.add(this.sqLens);
      this.sqCards = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 186, 455);
        const bg = this.add.graphics();
        const icon = makeIcon(this, 'frog', 0, -30, 1.7);
        const en = txt(this, 0, 44, '', 30, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 76, '', 20, '#6b7c8c').setOrigin(0.5);
        card.add([bg, icon, en, zh]);
        card.setSize(170, 200).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickSound(i));
        c.add(card);
        return { card, bg, icon, en, zh, x: card.x };
      });
      this.sqBox = c;
    }

    openSound() {
      const cands = this.soundCands();
      const ans = cands[Math.floor(Math.random() * cands.length)];
      this.modal = 'sound';
      this.sq = { answer: ans, order: L.options(ans, SOUND_KEYS, 4), tries: 0, peeked: false, reveal: false, recorded: false, wrong: {} };
      this.sqBox.setVisible(true);
      this.renderSound();
      this.time.delayedCall(250, () => this.playSound());
    }

    playSound() { if (this.sq) { const t = ANIMALS[this.sq.answer].sound; speak(t + ' ' + t); } }

    renderSound() {
      const q = this.sq;
      const st = L.stage(this.s.words, q.answer); // 依正確答案的階段決定所有卡片怎麼顯示
      const showIcon = st < 2 || q.reveal;
      const zh = st === 0 && this.subs();
      this.sqSound.setText(ANIMALS[q.answer].sound + ' ' + ANIMALS[q.answer].sound);
      this.sqZh.setVisible(this.subs());
      this.sqLens.setVisible(st >= 2 && !q.reveal);
      this.sqHint.setText(q.tries > 0 && !q.done ? ANIMALS[q.answer].hint : '');
      this.sqCards.forEach((c, i) => {
        const k = q.order[i];
        c.bg.clear();
        c.bg.fillStyle(0xffffff, 1); c.bg.fillRoundedRect(-85, -100, 170, 200, 24);
        c.bg.lineStyle(4, 0xffcc80, 1); c.bg.strokeRoundedRect(-85, -100, 170, 200, 24);
        c.icon.setVisible(showIcon); drawIcon(c.icon, k);
        c.en.setText(k).setY(showIcon ? 44 : 0);
        c.zh.setText(zh ? ANIMALS[k].zh : '').setY(showIcon ? 76 : 34);
        c.card.setAlpha(q.wrong[k] ? 0.35 : 1);
      });
    }

    pickSound(i) {
      if (this.modal !== 'sound') return;
      const q = this.sq, k = q.order[i], c = this.sqCards[i];
      if (q.wrong[k] || q.done) return;
      if (q.tries === 0) { this.stats.sound.q += 1; if (k === q.answer) this.stats.sound.first += 1; }
      if (k === q.answer) {
        q.done = true;
        if (!q.recorded) L.answer(this.s.words, k, { day: this.s.day, options: q.order.length, firstTry: q.tries === 0, peeked: q.peeked });
        this.s.stardust += 2;
        c.bg.lineStyle(6, 0x43a047, 1); c.bg.strokeRoundedRect(-85, -100, 170, 200, 24);
        this.tweens.add({ targets: c.card, scale: 1.12, yoyo: true, duration: 200 });
        speak('Yes! It is ' + art(k) + '.');
        this.time.delayedCall(BOT ? 50 : 1000, () => {
          this.sqBox.setVisible(false);
          this.modal = null;
          this.bushReady = false; this.bushNote.setVisible(false); this.bushT = 25;
          this.floatText(OFF + 150, 380, '+2 ★', '#e65100');
          this.renderSound();
          this.refreshAll();
        });
      } else {
        // 選錯：再播一次，並給一句提示（牠住在哪裡）
        q.tries += 1;
        q.wrong[k] = true;
        if (!q.recorded) { L.answer(this.s.words, q.answer, { day: this.s.day, options: q.order.length, firstTry: false, peeked: q.peeked }); q.recorded = true; }
        this.tweens.add({ targets: c.card, x: c.x + 10, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        this.renderSound();
        this.playSound();
      }
    }

    // --- 市集（§4.17 數量＋顏色＋品項、§4.4 衣物與天氣） ---
    checkTown() {
      const s = this.s;
      if (s.town || this.residents().length < TOWN_NEED) return;
      s.town = true;
      this.floatText(1150, 580, 'Market is open!', '#c62828', true);
      this.tweens.add({ targets: this.mkBtn, scale: 1.15, yoyo: true, repeat: 5, duration: 300 });
      this.renderNav();
    }

    buildMarket() {
      // 工具列右側的市集按鈕（開放後才出現）
      this.mkBtn = makeButton(this, 1165, 662, 140, 70, 0xe57373, '市集', 26, () => this.openMarket()).setDepth(31);

      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Market 市集', 28, '#c62828', { fontStyle: 'bold' }).setOrigin(0.5));
      this.mkWho = makeIcon(this, 'rabbit', 260, 210, 2);
      const bub = this.add.graphics(); drawBubble(bub, 330, 140, 600, 110, 360);
      this.mkSay = txt(this, 352, 158, '', 32, '#27384a', { fontStyle: 'bold' });
      this.mkZh = txt(this, 352, 206, '', 20, '#6b7c8c');
      c.add([this.mkWho, bub, this.mkSay, this.mkZh]);
      const lis = this.add.container(990, 195);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 32);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 1)]);
      lis.setSize(70, 70).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => { if (this.mo) speak(this.mo.text); });
      c.add(lis);

      // 水果：6 籃，點幾下放幾個；換一籃就重新開始
      this.mkBins = BINS.map(([item, color], i) => {
        const b = this.add.container(310 + (i % 3) * 165, 345 + Math.floor(i / 3) * 125);
        const bg = this.add.graphics();
        bg.fillStyle(0xd7b98e, 1); bg.fillRoundedRect(-72, -52, 144, 104, 18);
        bg.fillStyle(0xbf9a68, 1); bg.fillRoundedRect(-72, 20, 144, 32, 12);
        const g = this.add.graphics({ y: -6 }).setScale(1.5); drawFruit(g, item, color);
        b.add([bg, g]);
        b.setSize(144, 104).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.addFruit(i));
        c.add(b);
        return b;
      });
      this.mkBasket = this.add.container(905, 365);
      const bk = this.add.graphics();
      bk.fillStyle(0xffffff, 1); bk.fillRoundedRect(-125, -75, 250, 150, 20);
      bk.lineStyle(4, 0xbf9a68, 1); bk.strokeRoundedRect(-125, -75, 250, 150, 20);
      this.mkBasketG = [0, 1, 2, 3, 4].map(() => this.add.graphics({ y: -4 }).setScale(1.1).setVisible(false));
      this.mkBasketN = txt(this, 0, 48, '', 22, '#6b7c8c').setOrigin(0.5);
      this.mkBasket.add([bk].concat(this.mkBasketG, [this.mkBasketN, txt(this, 0, -58, 'Basket 籃子', 18, '#8d6e4a').setOrigin(0.5)]));
      this.mkClear = makeButton(this, 835, 490, 110, 54, 0x90a4ae, 'Clear', 22, () => this.clearFruit());
      this.mkGive = makeButton(this, 905, 565, 250, 64, 0x43a047, 'Here you are.', 24, () => this.giveFruit());
      c.add([this.mkBasket, this.mkClear, this.mkGive]);

      // 衣物：4 張卡片，點一張就交出去
      this.mkClothes = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 190, 435);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-85, -100, 170, 200, 24);
        bg.lineStyle(4, 0xef9a9a, 1); bg.strokeRoundedRect(-85, -100, 170, 200, 24);
        const icon = makeIcon(this, 'hat', 0, -28, 1.8);
        const en = txt(this, 0, 48, '', 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 80, '', 20, '#6b7c8c').setOrigin(0.5);
        card.add([bg, icon, en, zh]);
        card.setSize(170, 200).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickCloth(i));
        c.add(card);
        return { card, icon, en, zh, x: card.x };
      });
      this.mkHint = this.add.graphics({ x: 330, y: 615 });
      this.mkHintT = txt(this, 360, 615, '', 24, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0, 0.5);
      c.add([this.mkHint, this.mkHintT]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.mkBox = c;
    }

    openMarket() {
      if (this.paused() || !this.s.town) return;
      this.modal = 'market';
      this.held = null; this.tool = null; this.redrawTools();
      this.mkBox.setVisible(true);
      if (!this.mo || this.mo.done) this.newOrder(); else { this.renderMarket(); speak(this.mo.text); }
    }

    newOrder() {
      const s = this.s;
      const who = L.shuffle(['rabbit'].concat(this.residents()))[0];
      let o;
      if (Math.random() < 0.5) {
        const bin = Math.floor(Math.random() * BINS.length), n = 1 + Math.floor(Math.random() * NUMS.length);
        const [item, color] = BINS[bin];
        const num = NUMS[n - 1];
        o = { type: 'fruit', who, bin, n, words: [num, color, item],
          text: num.charAt(0).toUpperCase() + num.slice(1) + ' ' + color + ' ' + (n > 1 ? PLURAL[item] : item) + ', please.',
          zh: n + ' 個' + zhOf(color).replace(/色$/, '') + '色的' + zhOf(item) + '，謝謝。', basket: { bin: null, n: 0 } };
      } else {
        const need = NEEDS[Math.floor(Math.random() * NEEDS.length)];
        // 台灣晴天也常撐傘遮陽，所以晴天、熱的題目不放 umbrella，避免出現兩個說得通的答案
        const rainItem = need.ok === 'hat' ? 'raincoat' : (Math.random() < 0.5 ? 'umbrella' : 'raincoat');
        const rack = L.shuffle(['hat', 'coat', rainItem, 'shoes']);
        const answer = need.ok === 'rain' ? rack.find((k) => k === 'umbrella' || k === 'raincoat') : need.ok;
        o = { type: 'clothes', who, need, rack, answer, words: [need.word], text: need.say + ' What do I need?', zh: need.zh + '我需要什麼？', wrong: {} };
      }
      Object.assign(o, { tries: 0, recorded: false, reveal: false, done: false });
      o.words.forEach((w) => L.seen(s.words, w, s.day));
      this.mo = o;
      this.renderMarket();
      this.time.delayedCall(250, () => speak(o.text));
    }

    renderMarket() {
      const o = this.mo;
      if (!o) return;
      drawIcon(this.mkWho, o.who);
      const st = Math.min.apply(null, o.words.map((w) => L.stage(this.s.words, w)));
      this.mkSay.setText(o.text);
      this.mkZh.setText(this.subs() && (st === 0 || o.reveal) ? o.zh : '');
      const fruit = o.type === 'fruit';
      this.mkBins.forEach((b) => b.setVisible(fruit));
      [this.mkBasket, this.mkClear, this.mkGive].forEach((x) => x.setVisible(fruit));
      this.mkClothes.forEach((c, i) => {
        c.card.setVisible(!fruit);
        if (fruit) return;
        const k = o.rack[i];
        drawIcon(c.icon, k);
        c.en.setText(k);
        c.zh.setText(this.subs() && st === 0 ? zhOf(k) : '');
        c.card.setAlpha(o.wrong[k] ? 0.35 : 1);
      });
      if (fruit) {
        // 籃子裡的水果：最多 5 個排一排（先建好 5 個圖，依數量顯示）
        const b = o.basket, step = 44, x0 = -((b.n - 1) * step) / 2;
        this.mkBasketG.forEach((g, i) => {
          g.setVisible(b.bin != null && i < b.n);
          if (b.bin != null && i < b.n) { g.setX(x0 + i * step); drawFruit(g, BINS[b.bin][0], BINS[b.bin][1]); }
        });
        this.mkBasketN.setText(b.n ? 'x ' + b.n : '');
      }
      // 答錯後的提示：要的東西的小圖（水果另外標數量）
      this.mkHint.clear(); this.mkHintT.setText('');
      if (o.reveal && !o.done) {
        if (fruit) { drawFruit(this.mkHint, BINS[o.bin][0], BINS[o.bin][1]); this.mkHintT.setText('x ' + o.n); }
        else { drawIcon(this.mkHint, o.need.word === 'cold' ? 'coat' : (o.need.ok === 'rain' ? 'rainy' : 'sunny')); }
      }
    }

    addFruit(i) {
      const o = this.mo;
      if (this.modal !== 'market' || !o || o.done || o.type !== 'fruit') return;
      const b = o.basket;
      if (b.bin !== i) { b.bin = i; b.n = 0; }
      if (b.n < 5) b.n += 1;
      speak(NUMS[b.n - 1]);
      this.renderMarket();
    }

    clearFruit() {
      if (!this.mo || this.mo.type !== 'fruit') return;
      this.mo.basket = { bin: null, n: 0 };
      this.renderMarket();
    }

    giveFruit() {
      const s = this.s, o = this.mo;
      if (this.modal !== 'market' || !o || o.done || o.type !== 'fruit') return;
      const b = o.basket;
      if (b.bin == null) { this.tweens.add({ targets: this.mkBasket, scale: 1.08, yoyo: true, duration: 120 }); return; }
      const [item, color] = BINS[b.bin], [wi, wc] = BINS[o.bin];
      const okN = b.n === o.n, okC = color === wc, okI = item === wi, all = okN && okC && okI;
      if (o.tries === 0) { this.stats.fruit.q += 1; if (all) this.stats.fruit.first += 1; }
      if (!o.recorded) {
        // 三個部分各自記錄：數量 5 選 1、顏色 4 選 1、品項 3 選 1
        L.answer(s.words, o.words[0], { day: s.day, options: NUMS.length, firstTry: okN, peeked: false });
        L.answer(s.words, o.words[1], { day: s.day, options: Object.keys(COLORS).length, firstTry: okC, peeked: false });
        L.answer(s.words, o.words[2], { day: s.day, options: Object.keys(PLURAL).length, firstTry: okI, peeked: false });
        o.recorded = true;
      }
      if (all) { this.orderDone(); return; }
      o.tries += 1; o.reveal = true;
      o.basket = { bin: null, n: 0 };
      this.tweens.add({ targets: this.mkWho, angle: 10, yoyo: true, repeat: 2, duration: 90, onComplete: () => this.mkWho.setAngle(0) });
      speak('No, thank you. ' + o.text);
      this.renderMarket();
    }

    pickCloth(i) {
      const s = this.s, o = this.mo;
      if (this.modal !== 'market' || !o || o.done || o.type !== 'clothes') return;
      const k = o.rack[i], c = this.mkClothes[i];
      if (o.wrong[k]) return;
      const right = k === o.answer;
      if (o.tries === 0) { this.stats.clothes.q += 1; if (right) this.stats.clothes.first += 1; }
      if (!o.recorded) { L.answer(s.words, o.need.word, { day: s.day, options: o.rack.length, firstTry: right, peeked: false }); o.recorded = true; }
      L.seen(s.words, k, s.day);
      if (right) { speak(k + '! Thank you!'); this.orderDone(); return; }
      o.tries += 1; o.reveal = true; o.wrong[k] = true;
      this.tweens.add({ targets: c.card, x: c.x + 10, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
      speak('No, thank you. ' + o.text);
      this.renderMarket();
    }

    orderDone() {
      const o = this.mo;
      o.done = true;
      this.s.stardust += 4;
      if (o.type === 'fruit') speak('Thank you!');
      this.floatText(640, 300, 'Thank you!  +4 ★', '#d81b60', true);
      this.tweens.add({ targets: this.mkWho, y: this.mkWho.y - 30, yoyo: true, duration: 200 });
      this.refreshAll();
      this.time.delayedCall(BOT ? 50 : 1400, () => { if (this.modal === 'market') this.newOrder(); });
    }

    // --- 日曆（§4.17）：居民邀請 Come to my party on Friday!，選出那一天；到了那天就有派對 ---
    buildInvite() {
      const c = this.modalBase(80, 130, 110, 1020, 470, 0xfffaf0);
      this.ivWho = makeIcon(this, 'rabbit', 230, 220, 2);
      const bub = this.add.graphics(); drawBubble(bub, 300, 150, 620, 110, 330);
      this.ivSay = txt(this, 322, 168, '', 32, '#27384a', { fontStyle: 'bold' });
      this.ivZh = txt(this, 322, 216, '', 20, '#6b7c8c');
      this.ivToday = txt(this, 640, 312, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.ivWho, bub, this.ivSay, this.ivZh, this.ivToday]);
      const lis = this.add.container(1060, 205);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 32);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 1)]);
      lis.setSize(70, 70).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => { if (this.iq) speak(this.iq.text); });
      c.add(lis);
      this.ivCards = WEEK.map((d, i) => {
        const card = this.add.container(640 + (i - 3) * 134, 440);
        const bg = this.add.graphics();
        const en = txt(this, 0, -10, d, 20, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 22, '', 18, '#6b7c8c').setOrigin(0.5);
        card.add([bg, en, zh]);
        card.setSize(124, 120).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickDay(i));
        c.add(card);
        return { card, bg, en, zh, x: card.x };
      });
      this.closeButton(c, 1125, 135, () => this.closeModal());
      this.ivBox = c;
    }

    // 每天早上（天氣播報後）：今天有派對就舉辦；沒有約的話，隔幾天會有居民來邀請
    morningEvents() {
      const s = this.s;
      let partyToday = false;
      if (s.party && s.party.day <= s.day) {
        if (s.party.day === s.day) {
          partyToday = true;
          const wd = weekday(s.day);
          s.stardust += 5;
          s.ev.party.push(wd);
          this.time.delayedCall(BOT ? 10 : 3600, () => {
            this.floatText(640, 330, 'It is ' + wd + '. Party time!  +5 ★', '#8e24aa', true);
            speak('It is ' + wd + '. Party time!');
            this.refreshAll();
          });
        }
        s.party = null;
      }
      // 辦派對那天不發新邀請，避免兩件事擠在同一個早上
      if (s.town && !s.party && !partyToday && s.day - (s.lastInvite || 0) >= 3) {
        this.time.delayedCall(BOT ? 20 : 4200, () => { if (!this.paused() && !s.party) this.openInvite(); });
      }
    }

    openInvite() {
      const s = this.s;
      const target = s.day + 2 + Math.floor(Math.random() * 4); // 2～5 天後
      const who = L.shuffle(['rabbit'].concat(this.residents()))[0];
      const wd = weekday(target);
      this.iq = { target, who, wd, text: 'Come to my party on ' + wd + '!', zh: zhOf(wd) + '來我的派對！', tries: 0, recorded: false, reveal: false, done: false, wrong: {} };
      s.lastInvite = s.day;
      L.seen(s.words, 'party', s.day);
      this.modal = 'invite';
      this.ivBox.setVisible(true);
      this.renderInvite();
      this.time.delayedCall(250, () => speak(this.iq.text));
    }

    renderInvite() {
      const q = this.iq, st = L.stage(this.s.words, q.wd);
      drawIcon(this.ivWho, q.who);
      this.ivSay.setText(q.text);
      this.ivZh.setText(this.subs() && (st === 0 || q.reveal) ? q.zh : '');
      this.ivToday.setText('Today is ' + weekday(this.s.day) + '.' + (this.subs() ? '　今天是' + zhOf(weekday(this.s.day)) : ''));
      this.ivCards.forEach((c, i) => {
        const d = WEEK[i], today = d === weekday(this.s.day);
        c.bg.clear();
        c.bg.fillStyle(today ? 0xfff3e0 : 0xffffff, 1); c.bg.fillRoundedRect(-62, -60, 124, 120, 18);
        c.bg.lineStyle(4, today ? 0xffb74d : 0xce93d8, 1); c.bg.strokeRoundedRect(-62, -60, 124, 120, 18);
        c.zh.setText(this.subs() && (st === 0 || q.reveal) ? zhOf(d) : '');
        c.card.setAlpha(q.wrong[d] ? 0.35 : 1);
      });
    }

    pickDay(i) {
      const s = this.s, q = this.iq, d = WEEK[i], c = this.ivCards[i];
      if (this.modal !== 'invite' || !q || q.done || q.wrong[d]) return;
      const right = d === q.wd;
      if (q.tries === 0) { this.stats.invite.q += 1; if (right) this.stats.invite.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.wd, { day: s.day, options: WEEK.length, firstTry: right, peeked: false }); q.recorded = true; }
      speak(d);
      if (right) {
        q.done = true;
        s.party = { day: q.target, who: q.who };
        c.bg.lineStyle(6, 0x43a047, 1); c.bg.strokeRoundedRect(-62, -60, 124, 120, 18);
        this.time.delayedCall(BOT ? 20 : 900, () => {
          this.ivBox.setVisible(false); this.modal = null;
          this.floatText(640, 330, 'See you on ' + q.wd + '!', '#8e24aa', true);
          speak('See you on ' + q.wd + '!');
        });
        return;
      }
      q.tries += 1; q.reveal = true; q.wrong[d] = true;
      this.tweens.add({ targets: c.card, x: c.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
      this.time.delayedCall(500, () => speak(q.text));
      this.renderInvite();
    }

    // --- 天氣題 ---
    needWeatherQ() { return this.s.day >= 2 && this.s.askedDay !== this.s.day; }

    openWeatherQ() {
      this.modal = 'weather';
      this.wq = { answer: this.s.weather, order: L.shuffle(WEATHER_KEYS), tries: 0, peeked: false, reveal: false, recorded: false, wrong: {} };
      this.wqBox.setVisible(true);
      this.renderWeatherQ();
      this.time.delayedCall(300, () => speak('How is the weather?'));
    }

    renderWeatherQ() {
      const q = this.wq;
      const st = L.stage(this.s.words, q.answer); // 依正確答案的階段決定所有卡片怎麼顯示，避免從顯示方式猜答案
      const showIcon = st < 2 || q.reveal;
      const zh = st === 0 && this.subs();
      this.wqZh.setVisible(zh);
      this.wqLens.setVisible(st >= 2 && !q.reveal);
      this.wqCards.forEach((c, i) => {
        const k = q.order[i];
        c.bg.clear();
        c.bg.fillStyle(0xffffff, 1); c.bg.fillRoundedRect(-85, -105, 170, 210, 24);
        c.bg.lineStyle(4, 0xb3d4ef, 1); c.bg.strokeRoundedRect(-85, -105, 170, 210, 24);
        c.icon.setVisible(showIcon); drawIcon(c.icon, k);
        c.en.setText(k).setY(showIcon ? 42 : 0);
        c.zh.setText(zh ? LIB.find((e) => e.k === k).zh : '').setY(showIcon ? 78 : 36);
        c.card.setAlpha(q.wrong[k] ? 0.35 : 1);
      });
    }

    pickWeather(i) {
      if (this.modal !== 'weather') return;
      const q = this.wq, k = q.order[i], c = this.wqCards[i];
      if (q.wrong[k] || q.done) return;
      if (q.tries === 0) { this.stats.weather.q += 1; if (k === q.answer) this.stats.weather.first += 1; }
      if (k === q.answer) {
        q.done = true;
        if (!q.recorded) L.answer(this.s.words, k, { day: this.s.day, options: 4, firstTry: q.tries === 0, peeked: q.peeked });
        this.s.askedDay = this.s.day;
        c.bg.lineStyle(6, 0x43a047, 1); c.bg.strokeRoundedRect(-85, -105, 170, 210, 24);
        this.tweens.add({ targets: c.card, scale: 1.12, yoyo: true, duration: 200 });
        speak(k);
        this.time.delayedCall(BOT ? 50 : 800, () => {
          this.wqBox.setVisible(false);
          this.modal = null;
          this.showBanner();
          this.refreshAll();
        });
      } else {
        q.tries += 1;
        q.wrong[k] = true;
        if (!q.recorded) { L.answer(this.s.words, q.answer, { day: this.s.day, options: 4, firstTry: false, peeked: q.peeked }); q.recorded = true; }
        this.tweens.add({ targets: c.card, x: c.x + 10, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        speak(k + '? How is the weather?');
        this.renderWeatherQ();
      }
    }

    // --- 日記 ---
    openDiary() {
      const s = this.s;
      s.t = DAY_LEN;
      this.modal = 'diary';
      this.held = null; this.tool = null; this.redrawTools();
      if (!s.diaryQ || s.diaryQ.day !== s.day) {
        const q = L.diary(Object.assign({ weather: s.weather }, s.ev), { weather: WEATHER_KEYS, plant: PLANT_KEYS, animal: ANIMAL_KEYS, weekday: WEEK });
        s.diaryQ = Object.assign(q, { day: s.day, tries: 0, recorded: false, done: false, wrong: {} });
      }
      this.dyBox.setVisible(true);
      this.renderDiary();
      if (!s.diaryQ.done) this.time.delayedCall(300, () => speak('My diary. Day ' + s.day + '.'));
    }

    renderDiary() {
      const q = this.s.diaryQ;
      const st = L.stage(this.s.words, q.answer);
      this.dyTitle.setText('Day ' + q.day + '　My Diary 日記');
      // 句子三段排版：前半、空格、後半，整句置中
      this.dyBefore.setText(q.before);
      this.dyAfter.setText(q.after);
      this.dyBlank.setText(q.done ? q.answer : '');
      const blankW = 210;
      const total = this.dyBefore.width + blankW + this.dyAfter.width;
      const x0 = 640 - total / 2;
      this.dyBefore.setX(x0);
      this.dyBlank.setX(x0 + this.dyBefore.width + blankW / 2);
      this.dyAfter.setX(x0 + this.dyBefore.width + blankW);
      this.dyLine.clear(); this.dyLine.lineStyle(4, q.done ? 0x43a047 : 0x27384a, 1);
      this.dyLine.lineBetween(x0 + this.dyBefore.width + 8, 328, x0 + this.dyBefore.width + blankW - 8, 328);
      // 選錯才露出當天的小圖提示
      this.dyHint.setVisible(q.tries > 0 && !q.done);
      if (q.tries > 0) { drawIcon(this.dyHint, q.answer); this.dyHint.setX(x0 + this.dyBefore.width + blankW / 2); }
      this.dyOpts.forEach((o, i) => {
        const w = q.options[i];
        o.b.setVisible(!q.done);
        o.bg.clear();
        o.bg.fillStyle(0xffffff, 1); o.bg.fillRoundedRect(-110, -48, 220, 96, 24);
        o.bg.lineStyle(4, 0xffc46b, 1); o.bg.strokeRoundedRect(-110, -48, 220, 96, 24);
        const zh = st === 0 && this.subs();
        o.en.setText(w).setY(zh ? -10 : 0);
        o.zh.setText(zh ? zhOf(w) : '');
        o.b.setAlpha(q.wrong[w] ? 0.35 : 1);
      });
      this.dyNight.setVisible(q.done);
    }

    pickDiary(i) {
      const s = this.s, q = s.diaryQ;
      if (this.modal !== 'diary' || !q || q.done) return;
      const w = q.options[i];
      if (q.wrong[w]) return;
      if (q.tries === 0) { this.stats.diary.q += 1; if (w === q.answer) this.stats.diary.first += 1; }
      if (w === q.answer) {
        q.done = true;
        if (!q.recorded) L.answer(s.words, w, { day: s.day, options: q.options.length, firstTry: q.tries === 0, peeked: false });
        s.diary.push({ day: q.day, text: q.text, weather: s.weather });
        speak(q.text);
      } else {
        q.tries += 1;
        q.wrong[w] = true;
        if (!q.recorded) { L.answer(s.words, q.answer, { day: s.day, options: q.options.length, firstTry: false, peeked: false }); q.recorded = true; }
        const o = this.dyOpts[i];
        this.tweens.add({ targets: o.b, x: o.x + 10, yoyo: true, repeat: 2, duration: 60, onComplete: () => o.b.setX(o.x) });
        speak(w);
      }
      this.renderDiary();
    }

    goodNight() {
      if (this.modal !== 'diary' || !this.s.diaryQ || !this.s.diaryQ.done) return;
      this.dyBox.setVisible(false);
      this.modal = null;
      this.s.diaryQ = null;
      this.stats.days += 1;
      if (BOT && this.stats.days % 10 === 0) console.log('[bot]', JSON.stringify(this.report()));
      this.nextDay();
    }

    // --- 圖鑑 ---
    pickCard(e) {
      if (!this.s.lib[e.k]) {
        this.libDetailEn.setText('?');
        this.libDetailZh.setText(e.kind === 'animal' ? '還沒遇到。完成居民的願望，去池塘森林幫牠蓋一個家' : '還沒發現，試試看種下它或等到那種天氣');
        return;
      }
      speak(e.en);
      L.seen(this.s.words, e.en, this.s.day);
      this.libDetailEn.setText(e.en);
      if (e.kind === 'plant') {
        const p = PLANTS[e.k];
        this.libDetailZh.setText(e.zh + '　我們用到的部位：' + p.part + '（' + p.partZh + '）\n' + p.fact);
      } else {
        this.libDetailZh.setText(e.zh + '\n' + e.fact);
      }
    }

    // --- 教學：檢查「是否已完成該步」，不檢查種了什麼 ---
    tutLines() {
      return [
        { en: 'Tap a seed.',            zh: '點一下任何一種種子' },
        { en: 'Plant it here.',         zh: '再點一塊空地，把它種下去' },
        { en: 'Water it.',              zh: '點澆水壺，再點你種的植物' },
        { en: 'Wait. It will grow.',    zh: '等一等，它會長大。看看太陽和雨' },
        { en: 'Pick it!',               zh: '點長大的植物，把它摘下來' },
        { en: 'Give it to the rabbit.', zh: '先點背包裡的東西，再點兔子' },
        { en: 'Great job!',             zh: '做得好！' },
      ];
    }

    // 完成某一步：前面的步驟也一起算完成（例如下雨幫忙澆了水，直接摘到東西）
    markDone(key) {
      const idx = TUT.indexOf(key);
      for (let i = 0; i <= idx; i++) this.s.done[TUT[i]] = true;
      this.refreshTut();
    }

    refreshTut() {
      const s = this.s;
      if (s.tut >= 7) return this.showPip(-1);
      if (s.tut === 6) return this.showPip(6);
      const idx = TUT.findIndex((k) => !s.done[k]);
      if (idx === -1) {
        s.tut = 6;
        this.showPip(6);
        this.time.delayedCall(4500, () => { s.tut = 7; this.showPip(-1); });
        return;
      }
      s.tut = idx;
      this.showPip(idx);
    }

    showPip(t) {
      if (t === this.tutShown) return;
      this.tutShown = t;
      if (t < 0) { this.pipBubble.setVisible(false); this.arrow.setVisible(false); return; }
      const line = this.tutLines()[t];
      this.pipBubble.setVisible(true);
      const zh = this.subs();
      this.pipEn.setText(line.en); this.pipZh.setText(zh ? line.zh : '');
      const w = Math.max(this.pipEn.width, this.pipZh.width) + 36;
      this.pipG.clear(); drawBubble(this.pipG, 0, zh ? 0 : 36, w, zh ? 96 : 60, 30);
      this.pipEn.setY(zh ? 16 : 50);
      if (!this.modal) speak(line.en);
    }

    // 箭頭位置每幀計算，跟著玩家目前的狀態走
    tutTarget() {
      const s = this.s;
      if (s.tut >= 6 || this.modal || this.zone !== 'meadow') return null;
      const plots = s.plots;
      switch (TUT[s.tut]) {
        case 'seed': return { x: TOOL_X.bean, y: 585 };
        case 'plant': {
          if (!this.tool || !PLANTS[this.tool]) return { x: TOOL_X.bean, y: 585 };
          const i = [1, 2, 4, 5, 0, 3].find((j) => !plots[j].plant);
          return i == null ? null : { x: this.plotObjs[i].x, y: this.plotObjs[i].y - 100 };
        }
        case 'water': {
          if (this.tool !== 'water') return { x: TOOL_X.water, y: 585 };
          const i = plots.findIndex((p) => p.plant);
          return i < 0 ? null : { x: this.plotObjs[i].x, y: this.plotObjs[i].y - 110 };
        }
        case 'pick': {
          const i = plots.findIndex((p) => p.plant && p.progress >= 1);
          return i < 0 ? null : { x: this.plotObjs[i].x, y: this.plotObjs[i].y - 130 };
        }
        case 'give':
          if (!s.wishes.rabbit) return null;
          return this.held ? { x: RABBIT.x, y: RABBIT.y - 130 } : { x: BAG_X.bean, y: 585 };
        default: return null;
      }
    }

    // --- 天氣與日 ---
    nextDay() {
      const s = this.s;
      s.day += 1; s.t = 0;
      s.ev = emptyEvents();
      let pick = s.weather;
      let guard = 0;
      while (pick === s.weather && guard++ < 20) {
        const r = Math.random(); let acc = 0;
        for (const [k, w] of WEATHER_PICK) { acc += w; if (r <= acc) { pick = k; break; } }
      }
      s.weather = pick;
      this.applyWeatherLook();
      if (this.needWeatherQ()) this.openWeatherQ(); else this.showBanner();
      saveState(s);
    }

    showBanner() {
      const s = this.s, w = WEATHER[s.weather];
      s.lib[s.weather] = true;
      L.seen(s.words, s.weather, s.day);
      this.bannerDay.setText('Day ' + s.day + '  ' + weekday(s.day));
      this.bannerEn.setText(w.phrase);
      this.bannerZh.setText(this.subs() && L.stage(s.words, s.weather) === 0 ? w.zh : '');
      drawIcon(this.bannerIcon, s.weather);
      speak(w.phrase);
      this.tweens.killTweensOf(this.banner);
      this.banner.setAlpha(0).setY(230);
      this.tweens.add({ targets: this.banner, alpha: 1, y: 250, duration: 350 });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 3200, duration: 600 });
      this.refreshLibrary();
      this.applyWeatherLook();
      this.morningEvents();
    }

    applyWeatherLook() {
      const key = this.s.weather, w = WEATHER[key];
      const g = this.skyG; g.clear();
      g.fillGradientStyle(w.sky[0], w.sky[0], w.sky[1], w.sky[1], 1); g.fillRect(0, 0, W, H);
      this.sunG.setVisible(key === 'sunny' || key === 'windy');
      this.sunG.setAlpha(key === 'sunny' ? 1 : 0.8);
      if (key === 'sunny') this.drawClouds(0xffffff, 0.55);
      else if (key === 'cloudy') this.drawClouds(0xcfd6dc, 1);
      else if (key === 'rainy') this.drawClouds(0x7d8b97, 1);
      else this.drawClouds(0xffffff, 0.8);
      drawIcon(this.dayWeatherIcon, key);
      // 早上的天氣題還沒回答前，不在上方直接顯示天氣圖示
      this.dayWeatherIcon.setVisible(!this.needWeatherQ());
    }

    // --- 重繪 ---
    redrawTools() {
      Object.values(this.tools).forEach((t) => {
        const on = this.tool === t.k;
        t.bg.clear();
        t.bg.fillStyle(on ? 0xffe082 : 0xf1f5f9, 1); t.bg.fillRoundedRect(-50, -42, 100, 84, 18);
        if (on) { t.bg.lineStyle(4, 0xff9800, 1); t.bg.strokeRoundedRect(-50, -42, 100, 84, 18); }
      });
      Object.values(this.bag).forEach((b) => {
        const on = this.held === b.k;
        const n = this.s.inv[b.k] || 0;
        b.bg.clear();
        b.bg.fillStyle(on ? 0xffe082 : 0xf6f8fa, 1); b.bg.fillRoundedRect(-61, -40, 122, 80, 18);
        if (on) { b.bg.lineStyle(4, 0xff9800, 1); b.bg.strokeRoundedRect(-61, -40, 122, 80, 18); }
        b.n.setText('x' + n);
        b.c.setAlpha(n > 0 ? 1 : 0.45);
      });
    }

    refreshWish() {
      this.drawWish(this.rabbitWish, this.s.wishes.rabbit, this.wishQ('rabbit'));
      const who = this.s.fwho, fw = who && this.s.wishes[who];
      if (fw) {
        const p = this.posOf(who);
        this.forestWish.c.setPosition(p.x - 120, p.y - 250);
        this.forestWish.zone.setPosition(p.x + 30, p.y - 195);
      }
      this.drawWish(this.forestWish, fw, fw ? this.wishQ(who) : null);
    }

    drawWish(b, item, q) {
      b.c.setVisible(!!item);
      if (b.zone.input) b.zone.input.enabled = !!item;
      if (!item) return;
      const st = L.stage(this.s.words, item);
      const showPic = st < 2 || q.reveal;
      const showZh = this.subs() && (st === 0 || q.reveal);
      b.g.clear(); drawBubble(b.g, 0, 0, 340, 126, 120);
      b.icon.setVisible(showPic);
      if (showPic) drawIcon(b.icon, item);
      b.en.setX(showPic ? 118 : 24).setText(wishSentence(item));
      b.zh.setX(showPic ? 118 : 24).setText(showZh ? '我想要' + zhOf(item) : '');
    }

    refreshLibrary() {
      const pages = Math.ceil(LIB.length / LIB_PER_PAGE);
      this.libPageText.setText((this.libPage + 1) + ' / ' + pages);
      this.libCards.forEach((slot, i) => {
        const e = LIB[this.libPage * LIB_PER_PAGE + i];
        slot.e = e || null;
        slot.card.setVisible(!!e);
        if (!e) return;
        const { bg, icon, name } = slot;
        drawIcon(icon, e.k);
        const got = !!this.s.lib[e.k];
        bg.clear();
        bg.fillStyle(got ? 0xffffff : 0xe3dccf, 1); bg.fillRoundedRect(-110, -84, 220, 168, 22);
        bg.lineStyle(3, got ? 0xffc46b : 0xcfc6b5, 1); bg.strokeRoundedRect(-110, -84, 220, 168, 22);
        icon.setVisible(got); name.setText(got ? e.en : '?');
        name.setColor(got ? '#27384a' : '#9a917f');
      });
    }

    refreshAll() {
      this.dustText.setText(String(this.s.stardust));
      this.refreshWish();
      this.renderForest();
      this.renderNav();
      this.refreshTut();
      this.redrawTools();
    }

    // --- 忽略測試：亂點機器人（?bot=1） ---
    // 不看英文、不管科學，每 0.12 秒在目前能點的東西裡隨機點一個
    botStep() {
      const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
      if (this.modal === 'weather') { if (!this.wq.done) this.pickWeather(Math.floor(Math.random() * 4)); return; }
      if (this.modal === 'diary') {
        if (this.s.diaryQ && this.s.diaryQ.done) this.goodNight(); else this.pickDiary(Math.floor(Math.random() * 3));
        return;
      }
      if (this.modal === 'build') {
        // 建造選單：三張卡片加上關閉鈕，隨機點一個（星砂不夠時只會關閉）
        const r = Math.floor(Math.random() * 4);
        if (r === 3 || this.s.stardust < HAB_COST) this.closeModal(); else this.pickBuild(r);
        return;
      }
      if (this.modal === 'sound') { if (!this.sq.done) this.pickSound(Math.floor(Math.random() * 4)); return; }
      if (this.modal === 'invite') { if (!this.iq.done) this.pickDay(Math.floor(Math.random() * 7)); return; }
      if (this.modal === 'market') {
        const o = this.mo;
        if (!o || o.done) { if (Math.random() < 0.05) this.closeModal(); return; }
        if (Math.random() < 0.03) { this.closeModal(); return; }
        if (o.type === 'fruit') { if (Math.random() < 0.7) this.addFruit(Math.floor(Math.random() * BINS.length)); else this.giveFruit(); }
        else this.pickCloth(Math.floor(Math.random() * 4));
        return;
      }
      if (this.modal) { this.closeModal(); return; }
      // 只點目前畫面上看得到的東西
      const acts = [];
      TOOL_KEYS.forEach((k) => acts.push(() => this.selectTool(k)));
      PLANT_KEYS.forEach((k) => acts.push(() => this.selectBag(k)));
      if (this.s.town) acts.push(() => this.openMarket());
      if (this.zone === 'meadow') {
        for (let i = 0; i < 6; i++) acts.push(() => this.onPlot(i));
        acts.push(() => this.giveTo('rabbit'));
        acts.push(() => this.onBubble('rabbit'));
        acts.push(() => this.goZone('forest'));
      } else {
        for (let i = 0; i <= Math.min(this.s.lotsOpen, LOT_X.length - 1); i++) acts.push(() => this.onLot(i));
        acts.push(() => this.onVisitor(false));
        acts.push(() => this.onVisitor(true));
        acts.push(() => this.onBush());
        acts.push(() => this.onBubble(this.s.fwho));
        acts.push(() => this.goZone('meadow'));
      }
      pickOne(acts)();
    }

    report() {
      const pct = (o) => (o.q ? Math.round(o.first / o.q * 100) + '%（' + o.first + '/' + o.q + '）' : '—');
      const wish = {};
      Object.keys(this.stats.wish).forEach((n) => { wish[n + '種可選'] = pct(this.stats.wish[n]); });
      return {
        天數: this.stats.days,
        天氣題第一次就對: pct(this.stats.weather),
        日記第一次就對: pct(this.stats.diary),
        交付第一次就對: wish,
        棲地第一次就對: pct(this.stats.habitat),
        叫聲第一次就對: pct(this.stats.sound),
        住下來的動物: this.residents().length,
        開放的空地: this.s.lotsOpen,
        水果訂單全對: pct(this.stats.fruit),
        衣物第一次就對: pct(this.stats.clothes),
        星期第一次就對: pct(this.stats.invite),
        每天收成: this.stats.days ? (this.stats.harvest / this.stats.days).toFixed(2) : '—',
        每天種下: this.stats.days ? (this.stats.planted / this.stats.days).toFixed(2) : '—',
      };
    }

    // --- 特效 ---
    // fixed：座標是畫面座標（介面上的提示），不跟著相機平移
    floatText(x, y, str, color, fixed) {
      const t = txt(this, x, y, str, 30, color, { fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(fixed ? 120 : 50);
      if (fixed) t.setScrollFactor(0);
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
    hearts(x, y) {
      for (let i = 0; i < 5; i++) {
        const d = this.add.graphics({ x: x + Phaser.Math.Between(-50, 50), y: y - 90 }).setDepth(50);
        d.fillStyle(0xf06292, 1); d.fillCircle(-6, -4, 7); d.fillCircle(6, -4, 7); d.fillTriangle(-13, -1, 13, -1, 0, 14);
        this.tweens.add({ targets: d, y: d.y - 90, alpha: 0, duration: 1200, delay: i * 120, onComplete: () => d.destroy() });
      }
    }

    // --- 主迴圈 ---
    update(time, delta) {
      const dt = Math.min(delta, 100) / 1000 * SPEED;
      const s = this.s, w = WEATHER[s.weather];
      const tSec = time / 1000;
      const running = !this.paused();

      if (running) {
        s.t += dt;
        if (s.t >= DAY_LEN) this.openDiary();
      }

      // 日進度條
      const frac = Math.min(1, s.t / DAY_LEN);
      this.dayBar.clear();
      this.dayBar.fillStyle(0xffffff, 0.75); this.dayBar.fillRoundedRect(490, 62, 300, 16, 8);
      this.dayBar.fillStyle(0xffc107, 1); this.dayBar.fillRoundedRect(490, 62, Math.max(16, 300 * frac), 16, 8);
      this.dayIcon.setX(490 + 300 * frac);
      this.dayText.setText('Day ' + s.day + '  ' + weekday(s.day));

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
        if (running) {
          p.water = Phaser.Math.Clamp(p.water - w.dry * dt + w.rain * dt, 0, 1);
          if (p.plant && p.water >= 0.2 && p.progress < 1) {
            const pl = PLANTS[p.plant];
            // 光照不足時長得比較慢，而不是完全停住（避免卡死）
            const rate = Math.min(1, light / pl.need);
            p.progress = Math.min(1, p.progress + rate * dt / pl.secs);
            if (p.progress >= 1) this.markDone('grow');
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

      // 池塘森林：草叢倒數（只在森林裡、時間有在走時倒數），以及安排下一位訪客
      if (running && this.zone === 'forest') this.tickBush(dt);
      this.bushG.rotation = this.bushReady ? Math.sin(tSec * 14) * 0.09 : 0;
      if (s.forestOpen && !s.visitor && !this.visitorTimer) this.scheduleVisitor(4000);

      // 教學箭頭
      const tg = this.tutTarget();
      this.arrow.setVisible(!!tg);
      if (tg) this.arrow.setPosition(tg.x, tg.y);
    }
  }

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
