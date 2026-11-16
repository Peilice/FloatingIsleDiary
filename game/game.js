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

  // 海灘（M4）：在草地左邊一個畫面寬；收成 5 次、圖鑑 5 項後開放（§5）
  const BOFF = -1280;
  const BEACH_HARVEST = 5, BEACH_LIB = 5;
  const STATION_PAID = 2;   // 每個實驗站每天前幾回合給星砂
  const BEACH = [
    { k: 'tea',     x: 220,  en: 'Tea',     zh: '甜茶',     icon: 'tea',     color: 0xef6c00 },
    { k: 'acid',    x: 430,  en: 'Juice',   zh: '紫色花汁', icon: 'flask',   color: 0x8e24aa },
    { k: 'magnet',  x: 640,  en: 'Magnet',  zh: '磁鐵',     icon: 'magnet',  color: 0xc62828 },
    { k: 'dig',     x: 850,  en: 'Dig',     zh: '挖挖看',   icon: 'shovel',  color: 0x6d4c2f },
    { k: 'recycle', x: 1060, en: 'Recycle', zh: '回收',     icon: 'recycle', color: 0x2e7d32 },
  ];
  // 紫色花汁（紫甘藍汁之類的指示劑）：酸性變粉紅、中性維持紫色、鹼性變綠（§4.8）
  const TASTES = ['sour', 'sweet', 'bitter'];
  const TASTE_COLOR = { sour: 0xf48fb1, sweet: 0x9575cd, bitter: 0x81c784 };
  // 磁鐵只吸含鐵的東西；metal 標出「是金屬但不會被吸」的（銅幣、鋁罐），用來打破迷思（§4.12）
  const MAG_ITEMS = [
    { k: 'nail',   en: 'nail',       zh: '鐵釘',   iron: true,  metal: true },
    { k: 'clip',   en: 'paper clip', zh: '迴紋針', iron: true,  metal: true },
    { k: 'screw',  en: 'screw',      zh: '螺絲',   iron: true,  metal: true },
    { k: 'coin',   en: 'coin',       zh: '銅幣',   iron: false, metal: true },
    { k: 'can',    en: 'can',        zh: '鋁罐',   iron: false, metal: true },
    { k: 'eraser', en: 'eraser',     zh: '橡皮擦', iron: false, metal: false },
    { k: 'pencil', en: 'pencil',     zh: '鉛筆',   iron: false, metal: false },
    { k: 'marble', en: 'marble',     zh: '玻璃珠', iron: false, metal: false },
  ];
  const SOILS = ['rock', 'sand', 'mud'];
  // 答錯後的提示只描述特徵、不說出答案
  const SOIL_HINT = { rock: 'It is hard and big. 它硬硬的、一大塊', sand: 'It is small and dry. 它一粒一粒、乾乾的', mud: 'It is wet and soft. 它濕濕軟軟的' };

  // 洞穴（M4）：在海灘左邊。§5 原定「圖鑑 20 項」解鎖，但目前圖鑑只有 14 項，先暫定 12 項，圖鑑擴充後改回
  const COFF = -2560;
  const CAVE_LIB = 12;
  const CAVE = [
    { k: 'light', x: 330, en: 'Light', zh: '找植物', color: 0xf9a825 },
    { k: 'moon',  x: 640, en: 'Moon',  zh: '月亮',   color: 0x3949ab },
    { k: 'push',  x: 950, en: 'Push',  zh: '推與拉', color: 0x6d4c41 },
  ];
  const LIGHT_DIRS = ['left', 'right', 'far', 'near'];
  const LIGHT_ZH = { left: '左', right: '右', far: '遠處', near: '近處' };
  const PUSH_CARDS = [{ verb: 'push', dir: 'left' }, { verb: 'push', dir: 'right' }, { verb: 'pull', dir: 'left' }, { verb: 'pull', dir: 'right' }];

  // 燈塔（M4）：在洞穴左邊。§5 原定「修好 3 個設施」，目前還沒有設施系統，先改成「完成洞穴實驗 3 回合」
  const LOFF = -3840;
  const LIGHT_NEED = 3;
  const LIGHTHOUSE = [
    { k: 'circuit', x: 260, en: 'Circuit', zh: '電路',     icon: 'bulb',  color: 0xf57f17 },
    { k: 'music',   x: 520, en: 'Music',   zh: '修樂器',   icon: 'bell',  color: 0x8e24aa },
    { k: 'fog',     x: 780, en: 'Fog',     zh: '霧中找朋友', icon: 'waves', color: 0x546e7a },
  ];
  // 電路板：一個方形迴路，左邊電池、上面燈泡、下面開關，缺口在右邊和左下
  const CIRC = { loop: { x0: 300, y0: 250, x1: 800, y1: 530 }, bulb: { x: 550, y: 250 }, batt: { x: 300, y: 390 }, sw: { x: 550, y: 530 }, gaps: [{ x: 800, y: 390 }, { x: 425, y: 530 }] };
  const CIRC_PARTS = ['wire', 'lead', 'eraser', 'straw'];
  const CIRC_ZH = { wire: '銅線', lead: '鉛筆芯', eraser: '橡皮擦', straw: '吸管' };
  const INSTR = ['bell', 'drum', 'guitar', 'piano'];
  const INSTR_SOUND = { bell: 'Ding!', drum: 'Boom!', guitar: 'Strum!', piano: 'Plink!' };
  const FOG_DIRS = ['left', 'front', 'right'];

  // 防災（M5，§4.16）：每第 7 天是演練日。防災包 8 選 5（順序打散，避免干擾項固定在最後）
  const BAG_ITEMS = [
    { k: 'water',      en: 'water',         zh: '水',     good: true },
    { k: 'toy',        en: 'toy',           zh: '玩具',   good: false },
    { k: 'flashlight', en: 'flashlight',    zh: '手電筒', good: true },
    { k: 'food',       en: 'food',          zh: '食物',   good: true },
    { k: 'candy',      en: 'candy',         zh: '糖果',   good: false },
    { k: 'radio',      en: 'radio',         zh: '收音機', good: true },
    { k: 'firstaid',   en: 'first aid kit', zh: '急救包', good: true },
    { k: 'blanket',    en: 'blanket',       zh: '毯子',   good: true },
  ];
  // 演練口令：drop、cover 在單字表裡記 ok；hold 不在，只顯示
  const DRILL = [
    { k: 'drop',  word: 'drop',  say: 'Drop!',    zh: '趴下！' },
    { k: 'cover', word: 'cover', say: 'Cover!',   zh: '掩護！躲到桌子下、護住頭' },
    { k: 'hold',  word: null,    say: 'Hold on!', zh: '穩住！抓住桌腳' },
  ];
  // 環境（M5，§4.18）：分類桶與東西（依台灣的分類：面紙、口香糖是一般垃圾）
  const BINS3 = ['paper', 'bottle', 'garbage'];
  const BIN_COLOR = { paper: 0x1e88e5, bottle: 0x43a047, garbage: 0x757575 };
  const BIN_ZH = { paper: '紙類', bottle: '瓶罐', garbage: '一般垃圾' };
  const TRASH = [
    { k: 'newspaper', zh: '報紙',       bin: 'paper' },
    { k: 'paperbox',  zh: '紙盒',       bin: 'paper' },
    { k: 'pbottle',   zh: '寶特瓶',     bin: 'bottle' },
    { k: 'gbottle',   zh: '玻璃瓶',     bin: 'bottle' },
    { k: 'tissue',    zh: '用過的面紙', bin: 'garbage' },
    { k: 'gum',       zh: '口香糖',     bin: 'garbage' },
  ];
  const TRASH_HINT = { paper: '想想看它是用什麼做的？', bottle: '想想看它是用什麼做的？', garbage: '想想看它能不能回收再用？' };
  // 池塘汙染：三個可能的汙染源，只有一個真的有髒水流進池塘
  const POLLUTERS = [{ k: 'pipe', zh: '排水管' }, { k: 'trashpile', zh: '垃圾堆' }, { k: 'oilboat', zh: '小船' }];
  const POLL_POS = [{ x: 360, y: 320 }, { x: 640, y: 290 }, { x: 920, y: 320 }];

  // 研究島（M6 延伸層）：在池塘森林右邊。三組各自的解鎖條件見 groupOpen（§5；生態研究所原定圖鑑 40 項，圖鑑目前只有 14 項，暫定全部 14 項）
  const ROFF = 2560;
  const GEO_NEED = 3;
  const RGROUPS = [
    { k: 'weather', zh: '氣象站',     x0: 130, x1: 410,  color: 0x1e88e5 },
    { k: 'eco',     zh: '生態研究所', x0: 450, x1: 870,  color: 0x43a047 },
    { k: 'geo',     zh: '地質洞窟',   x0: 910, x1: 1180, color: 0x8d6e63 },
  ];
  const RLABS = [
    { k: 'water',   g: 'weather', x: 200,  en: 'Rain',     zh: '水循環' },
    { k: 'typhoon', g: 'weather', x: 340,  en: 'Typhoon',  zh: '颱風' },
    { k: 'food',    g: 'eco',     x: 520,  en: 'Food',     zh: '食物鏈' },
    { k: 'photo',   g: 'eco',     x: 660,  en: 'Sunlight', zh: '光合作用' },
    { k: 'spell',   g: 'eco',     x: 800,  en: 'Spell',    zh: '拼字' },
    { k: 'pitch',   g: 'geo',     x: 980,  en: 'Pitch',    zh: '音調' },
    { k: 'fossil',  g: 'geo',     x: 1110, en: 'Fossil',   zh: '化石' },
  ];
  const WC_SPOTS = [{ k: 'sun', x: 330, y: 420 }, { k: 'high', x: 800, y: 300 }, { k: 'under', x: 800, y: 460 }];
  const WC_PARTS = [{ k: 'heater', zh: '加熱面' }, { k: 'cold', zh: '冷凝板' }, { k: 'cup', zh: '集水槽' }];
  const PREP = [
    { k: 'boat', zh: '把小船綁好', good: true }, { k: 'pots', zh: '把花盆收進屋裡', good: true },
    { k: 'kite', zh: '去放風箏', good: false }, { k: 'swim', zh: '去海邊游泳', good: false },
  ];
  // 食物鏈（§4.20 承載量模型）：草的平衡＝面積×10、兔＝草÷10、狐＝兔÷4，每天往平衡靠近一格，至少保留 1 隻（不會滅絕）
  const FOOD_CASES = [
    { say: 'Too many rabbits! The grass is gone.', zh: '兔子太多了！草都被吃光了，怎麼辦？', start: { A: 3, G: 4, R: 9, F: 1 }, good: ['grass', 'den'] },
    { say: 'The foxes are hungry. There are few rabbits.', zh: '狐狸肚子餓，兔子太少了，怎麼辦？', start: { A: 2, G: 20, R: 1, F: 3 }, good: ['grass'] },
  ];
  const FOOD_ACTS = [
    { k: 'grass',   zh: '多種一些草',   apply: (e) => { e.A += 2; }, why: '' },
    { k: 'den',     zh: '蓋一個狐狸窩', apply: (e) => { e.F += 1; e.R = Math.max(1, e.R - 3); }, why: '兔子已經太少，再多狐狸，牠們更沒東西吃。' },
    { k: 'rabbits', zh: '再放更多兔子', apply: (e) => { e.R += 3; }, why: '兔子更多，草更不夠吃。' },
    { k: 'cut',     zh: '把草割掉',     apply: (e) => { e.A = Math.max(1, e.A - 1); e.G = Math.max(0, e.G - 5); }, why: '草變少，兔子和狐狸都更沒東西吃。' },
  ];
  function foodStep(e) {
    const gt = e.A * 10; e.G += Math.max(-5, Math.min(5, gt - e.G));
    const rt = Math.max(1, Math.floor(e.G / 10)); e.R += Math.sign(rt - e.R);
    const ft = Math.max(1, Math.floor(e.R / 4)); e.F += Math.sign(ft - e.F);
  }
  // 拼字（§4.24）：180 個拼寫字裡、遊戲中有圖可畫的字
  const SPELL = ['bean', 'sunny', 'cloudy', 'rainy', 'windy', 'fish', 'bird', 'apple', 'grape', 'banana', 'hat', 'coat', 'rock', 'mud', 'moon', 'star', 'bell', 'drum', 'paper', 'bottle', 'water', 'tree', 'grass', 'lamp', 'box', 'rain'];

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
      harvested: 0, beachOpen: false, caveOpen: false, caveDone: 0, lightOpen: false,
      bagReady: false, drillDay: 0, lightDone: 0,
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
    // M4 前沒有記錄收成次數：用背包裡的作物＋送出去的願望估計（寧可少算，不憑空給）。
    // 用 harvestedV 標記是否轉換過（新存檔的預設值 0 會讓「沒有這個欄位」的判斷失效）
    if (s.harvestedV !== 1) {
      const est = PLANT_KEYS.reduce((a, k) => a + (s.inv[k] || 0), 0) + (s.gaveTotal || 0);
      s.harvested = Math.max(s.harvested || 0, est);
      s.harvestedV = 1;
    }
    while (s.lots.length < LOT_X.length) s.lots.push({ hab: null, animal: null }); // 森林擴建前的存檔
    if (params.get('unlock')) { s.forestOpen = true; s.beachOpen = true; s.caveOpen = true; s.lightOpen = true; } // 偵錯：直接開放所有區域
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
      case 'tea':
        g.fillStyle(0xeceff1, 1); g.fillRoundedRect(-18, -14, 36, 34, 8);
        g.lineStyle(4, 0x90a4ae, 1); g.beginPath(); g.arc(20, 2, 8, -Math.PI / 2, Math.PI / 2, false); g.strokePath();
        g.fillStyle(0xd38b3c, 1); g.fillRect(-14, -8, 28, 24);
        g.lineStyle(3, 0xbdbdbd, 1); [-6, 4].forEach((x) => g.lineBetween(x, -20, x + 3, -30));
        break;
      case 'flask':
        g.fillStyle(0xeceff1, 1); g.fillRect(-6, -26, 12, 16); g.fillTriangle(-6, -12, 6, -12, 22, 22); g.fillTriangle(-6, -12, -22, 22, 22, 22);
        g.fillStyle(0x9575cd, 1); g.fillTriangle(-16, 10, 16, 10, 20, 20); g.fillTriangle(-16, 10, -20, 20, 20, 20);
        break;
      case 'magnet':
        g.lineStyle(12, 0xc62828, 1); g.beginPath(); g.arc(0, -4, 16, Math.PI, 0, false); g.strokePath();
        g.lineBetween(-16, -4, -16, 14); g.lineBetween(16, -4, 16, 14);
        g.fillStyle(0xeceff1, 1); g.fillRect(-22, 10, 12, 10); g.fillRect(10, 10, 12, 10);
        break;
      case 'lamp':
        g.fillStyle(0xfff59d, 0.5); g.fillCircle(0, -8, 20);
        g.fillStyle(0xffd54a, 1); g.fillCircle(0, -8, 11);
        g.fillStyle(0x795548, 1); g.fillRect(-3, 2, 6, 18); g.fillRoundedRect(-14, 18, 28, 6, 3);
        g.fillStyle(0x8d6e63, 1); g.fillTriangle(-14, -14, 14, -14, 0, -26);
        break;
      case 'box':
        g.fillStyle(0xa1887f, 1); g.fillRect(-20, -20, 40, 40);
        g.lineStyle(3, 0x6d4c41, 1); g.strokeRect(-20, -20, 40, 40); g.lineBetween(-20, -20, 20, 20); g.lineBetween(20, -20, -20, 20);
        break;
      case 'bulb':
        g.fillStyle(0xffeb3b, 1); g.fillCircle(0, -6, 16); g.fillStyle(0x90a4ae, 1); g.fillRect(-8, 8, 16, 12);
        g.lineStyle(2, 0xf9a825, 1); g.lineBetween(-5, -6, 0, 2); g.lineBetween(5, -6, 0, 2);
        break;
      case 'bell': drawInstr(g, 'bell'); break;
      case 'waves':
        g.lineStyle(4, 0x546e7a, 1);
        [8, 16, 24].forEach((r) => { g.beginPath(); g.arc(-10, 0, r, -0.7, 0.7, false); g.strokePath(); });
        g.fillStyle(0x546e7a, 1); g.fillCircle(-14, 0, 5);
        break;
      case 'recycle':
        g.lineStyle(5, 0x2e7d32, 1);
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 3, b = a + 2 * Math.PI / 3 - 0.5; g.beginPath(); g.arc(0, 0, 18, a + 0.25, b, false); g.strokePath();
          g.fillStyle(0x2e7d32, 1); g.fillTriangle(Math.cos(b) * 18 - 6, Math.sin(b) * 18 - 6, Math.cos(b) * 18 + 6, Math.sin(b) * 18 + 6, Math.cos(b + 0.4) * 18, Math.sin(b + 0.4) * 18); }
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

  // 月相：ph 0 新月 … 4 滿月（右邊先亮，北半球漸盈的樣子）。用「右半圓＋明暗交界線」畫亮的部分
  function drawMoon(g, ph) {
    g.clear();
    const r = 26, k = ph / 4;
    g.fillStyle(0x37474f, 1); g.fillCircle(0, 0, r);
    g.lineStyle(2, 0x90a4ae, 1); g.strokeCircle(0, 0, r);
    if (ph === 0) return;
    const pts = [];
    for (let a = -90; a <= 90; a += 10) { const t = a * Math.PI / 180; pts.push(new Phaser.Geom.Point(r * Math.cos(t), r * Math.sin(t))); }
    for (let a = 90; a >= -90; a -= 10) { const t = a * Math.PI / 180; pts.push(new Phaser.Geom.Point(r * Math.cos(t) * (1 - 2 * k), r * Math.sin(t))); }
    g.fillStyle(0xfff59d, 1); g.fillPoints(pts, true);
  }

  // 推與拉的卡片：推＝人在箱子後面用手推；拉＝人在前面用繩子拖。只有圖，沒有字
  function drawPushCard(g, verb, dir) {
    g.clear();
    const s = dir === 'left' ? -1 : 1;           // 箱子要移動的方向
    const behind = verb === 'push';              // 推：人在箱子後面（和移動方向相反那側）
    const boxX = behind ? s * 22 : -s * 26, manX = behind ? -s * 30 : s * 40;
    g.fillStyle(0xa1887f, 1); g.fillRect(boxX - 22, -18, 44, 44);
    g.lineStyle(3, 0x6d4c41, 1); g.strokeRect(boxX - 22, -18, 44, 44);
    // 人
    g.fillStyle(0xf2994a, 1); g.fillCircle(manX, -24, 10);
    g.lineStyle(5, 0x5c6bc0, 1); g.lineBetween(manX, -14, manX - s * 4, 12);
    g.lineBetween(manX - s * 4, 12, manX - s * 12, 28); g.lineBetween(manX - s * 4, 12, manX + s * 6, 28);
    if (behind) { g.lineStyle(4, 0xf2994a, 1); g.lineBetween(manX, -8, boxX - s * 22, -4); }
    else {
      // 拉：深咖啡色的粗繩子，人往前傾
      g.lineStyle(5, 0x4e342e, 1); g.lineBetween(manX - s * 6, -4, boxX + s * 22, 2);
      g.fillStyle(0x4e342e, 1); g.fillCircle(boxX + s * 22, 2, 4);
      g.lineStyle(4, 0xf2994a, 1); g.lineBetween(manX, -8, manX - s * 6, -4);
    }
    // 箭頭：箱子移動的方向
    g.fillStyle(0x43a047, 1); g.fillRect(-26, 46, 52, 8); g.fillTriangle(s * 26, 38, s * 26, 62, s * 42, 50);
  }

  // 電路零件
  function drawPart(g, k) {
    g.clear();
    if (k === 'wire') { g.lineStyle(6, 0xd2691e, 1); g.beginPath(); g.arc(0, 0, 14, Math.PI, 0, false); g.strokePath(); g.lineBetween(-26, 0, -14, 0); g.lineBetween(14, 0, 26, 0); }
    else if (k === 'lead') { g.fillStyle(0x424242, 1); g.fillRect(-26, -4, 52, 8); g.fillStyle(0x757575, 1); g.fillRect(-26, -4, 52, 3); }
    else if (k === 'eraser') { g.fillStyle(0xf8bbd0, 1); g.fillRoundedRect(-22, -11, 44, 22, 5); g.fillStyle(0x64b5f6, 1); g.fillRect(-22, -11, 15, 22); }
    else { g.fillStyle(0x81d4fa, 1); g.fillRect(-26, -5, 52, 10); g.fillStyle(0xffffff, 0.6); g.fillRect(-26, -5, 52, 3); g.fillStyle(0xe57373, 1); g.fillRect(-6, -5, 4, 10); g.fillRect(8, -5, 4, 10); }
  }
  // 樂器
  function drawInstr(g, k) {
    g.clear();
    if (k === 'bell') { g.fillStyle(0xffca28, 1); g.fillTriangle(-20, 16, 20, 16, 0, -22); g.fillCircle(0, -10, 14); g.fillRect(-22, 12, 44, 6); g.fillStyle(0x8d6e63, 1); g.fillCircle(0, 22, 5); g.fillRect(-3, -30, 6, 8); }
    else if (k === 'drum') { g.fillStyle(0xe53935, 1); g.fillRect(-24, -10, 48, 30); g.fillStyle(0xeceff1, 1); g.fillEllipse(0, -10, 48, 16); g.lineStyle(2, 0xffffff, 1); g.lineBetween(-24, -4, 24, 20); g.lineBetween(24, -4, -24, 20); g.lineStyle(3, 0x6d4c41, 1); g.lineBetween(14, -26, 4, -14); }
    else if (k === 'guitar') { g.fillStyle(0xa1887f, 1); g.fillCircle(-4, 10, 16); g.fillCircle(6, -4, 12); g.fillStyle(0x5d4037, 1); g.fillCircle(-2, 6, 5); g.fillRect(8, -34, 6, 30); g.lineStyle(1, 0xffffff, 1); g.lineBetween(11, -32, -4, 18); }
    else { g.fillStyle(0x37474f, 1); g.fillRoundedRect(-28, -16, 56, 34, 4); g.fillStyle(0xffffff, 1); for (let i = 0; i < 6; i++) g.fillRect(-25 + i * 9, -2, 8, 18); g.fillStyle(0x212121, 1); [0, 1, 3, 4].forEach((i) => g.fillRect(-19 + i * 9, -2, 5, 10)); }
  }

  // 防災包的東西
  function drawBagItem(g, k) {
    g.clear();
    switch (k) {
      case 'water': g.fillStyle(0x81d4fa, 1); g.fillRoundedRect(-10, -16, 20, 34, 6); g.fillStyle(0x1e88e5, 1); g.fillRect(-6, -22, 12, 7); break;
      case 'flashlight': g.fillStyle(0x546e7a, 1); g.fillRect(-18, -6, 26, 12); g.fillTriangle(8, -10, 8, 10, 18, 0); g.fillStyle(0xfff59d, 0.8); g.fillTriangle(18, 0, 30, -12, 30, 12); break;
      case 'food': g.fillStyle(0xbdbdbd, 1); g.fillRoundedRect(-14, -14, 28, 30, 4); g.fillStyle(0xff7043, 1); g.fillRect(-14, -4, 28, 12); break;
      case 'radio': g.fillStyle(0x6d4c41, 1); g.fillRoundedRect(-20, -10, 40, 26, 5); g.fillStyle(0xeceff1, 1); g.fillCircle(-8, 3, 7); g.fillRect(4, -4, 12, 4); g.lineStyle(2, 0x424242, 1); g.lineBetween(10, -10, 20, -24); break;
      case 'firstaid': g.fillStyle(0xffffff, 1); g.fillRoundedRect(-18, -14, 36, 28, 5); g.lineStyle(2, 0xbdbdbd, 1); g.strokeRoundedRect(-18, -14, 36, 28, 5); g.fillStyle(0xe53935, 1); g.fillRect(-3, -10, 6, 20); g.fillRect(-10, -3, 20, 6); break;
      case 'blanket': g.fillStyle(0x7986cb, 1); g.fillRoundedRect(-20, -12, 40, 26, 6); g.fillStyle(0x9fa8da, 1); g.fillRect(-20, -2, 40, 5); break;
      case 'toy': g.fillStyle(0xa1887f, 1); g.fillCircle(-9, -12, 6); g.fillCircle(9, -12, 6); g.fillCircle(0, -4, 12); g.fillEllipse(0, 14, 22, 18); g.fillStyle(0x333333, 1); g.fillCircle(-4, -6, 1.8); g.fillCircle(4, -6, 1.8); break;
      default: g.fillStyle(0xf06292, 1); g.fillEllipse(0, 0, 22, 14); g.fillTriangle(-11, 0, -20, -8, -20, 8); g.fillTriangle(11, 0, 20, -8, 20, 8);
    }
  }
  // 演練動作：只有圖、沒有字
  function drawDrill(g, k) {
    g.clear();
    const desk = () => { g.fillStyle(0x8d6e63, 1); g.fillRect(-34, -16, 68, 8); g.fillRect(-30, -8, 6, 34); g.fillRect(24, -8, 6, 34); };
    g.fillStyle(0xbcaaa4, 1); g.fillRect(-40, 26, 80, 4);
    if (k === 'drop') {
      // 趴下：人跪低、手撐地
      g.fillStyle(0xf2994a, 1); g.fillCircle(-14, 2, 8);
      g.lineStyle(5, 0x5c6bc0, 1); g.lineBetween(-8, 8, 14, 12); g.lineBetween(14, 12, 14, 26); g.lineBetween(-8, 8, -12, 26);
      g.fillStyle(0xffffff, 0.9); g.fillTriangle(-30, -30, -20, -30, -25, -18);
    } else if (k === 'cover') {
      // 掩護：在桌子下，雙手護頭
      desk();
      g.fillStyle(0xf2994a, 1); g.fillCircle(-4, 4, 8);
      g.lineStyle(4, 0xf2994a, 1); g.lineBetween(-12, 2, -4, -4); g.lineBetween(4, 2, -4, -4);
      g.lineStyle(5, 0x5c6bc0, 1); g.lineBetween(-2, 12, 10, 24); g.lineBetween(-6, 12, -12, 24);
    } else {
      // 穩住：在桌子下，一手抓住桌腳
      desk();
      g.fillStyle(0xf2994a, 1); g.fillCircle(-4, 8, 8);
      g.lineStyle(4, 0xf2994a, 1); g.lineBetween(2, 10, 24, 6);
      g.fillStyle(0xf2994a, 1); g.fillCircle(25, 6, 4);
      g.lineStyle(5, 0x5c6bc0, 1); g.lineBetween(-4, 16, 6, 26); g.lineBetween(-8, 16, -16, 26);
    }
  }
  // 回收的東西
  function drawTrash(g, k) {
    g.clear();
    switch (k) {
      case 'newspaper': g.fillStyle(0xeceff1, 1); g.fillRect(-20, -16, 40, 32); g.lineStyle(2, 0x90a4ae, 1); [-8, -2, 4, 10].forEach((y) => g.lineBetween(-16, y, 16, y)); g.fillStyle(0x90a4ae, 1); g.fillRect(-16, -13, 14, 3); break;
      case 'paperbox': g.fillStyle(0xd7a35a, 1); g.fillRect(-18, -12, 36, 28); g.fillStyle(0xbf8a40, 1); g.fillTriangle(-18, -12, 18, -12, 0, -22); break;
      case 'pbottle': g.fillStyle(0xb3e5fc, 0.9); g.fillRoundedRect(-9, -14, 18, 32, 6); g.fillRect(-5, -20, 10, 7); g.fillStyle(0x1e88e5, 1); g.fillRect(-5, -24, 10, 4); g.fillRect(-9, 0, 18, 6); break;
      case 'gbottle': g.fillStyle(0x43a047, 0.85); g.fillRoundedRect(-9, -10, 18, 28, 5); g.fillRect(-4, -22, 8, 13); g.fillStyle(0xffffff, 0.4); g.fillRect(-6, -6, 3, 18); break;
      case 'tissue': g.fillStyle(0xffffff, 1); g.fillCircle(-6, 0, 10); g.fillCircle(6, 2, 9); g.fillCircle(0, -6, 8); g.lineStyle(1.5, 0xbdbdbd, 1); g.strokeCircle(-6, 0, 10); break;
      default: g.fillStyle(0xf48fb1, 1); g.fillEllipse(0, 0, 26, 18); g.fillStyle(0xf8bbd0, 1); g.fillEllipse(-4, -3, 10, 6);
    }
  }
  // 池塘汙染的嫌疑者
  function drawPolluter(g, k) {
    g.clear();
    if (k === 'pipe') { g.fillStyle(0x78909c, 1); g.fillRect(-26, -10, 40, 16); g.fillRect(12, -14, 10, 24); g.fillStyle(0x546e7a, 1); g.fillRect(-26, -10, 40, 4); }
    else if (k === 'trashpile') { g.fillStyle(0x616161, 1); g.fillCircle(-10, 6, 12); g.fillCircle(8, 4, 13); g.fillCircle(0, -6, 10); g.fillStyle(0xffca28, 1); g.fillRect(-4, -2, 8, 8); }
    else { g.fillStyle(0x8d6e63, 1); g.fillTriangle(-26, -2, 26, -2, 18, 12); g.fillTriangle(-26, -2, -18, 12, 18, 12); g.fillStyle(0xeceff1, 1); g.fillTriangle(0, -2, 0, -28, 16, -6); }
  }

  // 研究島的圖
  function waterPart(g, k) {
    g.clear();
    if (k === 'heater') { g.fillStyle(0x37474f, 1); g.fillRoundedRect(-36, -8, 72, 16, 4); g.fillStyle(0x4fc3f7, 0.7); g.fillRect(-30, -6, 60, 6); }
    else if (k === 'cold') { g.fillStyle(0xb0bec5, 1); g.fillRect(-40, -6, 80, 12); g.fillStyle(0xffffff, 0.7); g.fillRect(-40, -6, 80, 3); }
    else { g.fillStyle(0x90caf9, 1); g.fillRoundedRect(-18, -12, 36, 26, 6); g.fillStyle(0x1e88e5, 1); g.fillRect(-14, 4, 28, 6); }
  }
  function mapSymbol(g, sym) {
    g.clear();
    if (sym === 'T') {
      g.lineStyle(6, 0xe53935, 1); g.strokeCircle(0, 0, 18);
      g.beginPath(); g.arc(-10, -18, 18, -0.2, 1.4, false); g.strokePath(); g.beginPath(); g.arc(10, 18, 18, Math.PI - 0.2, Math.PI + 1.4, false); g.strokePath();
    } else {
      const c = sym === 'H' ? 0x1e88e5 : 0xe53935;
      g.lineStyle(4, c, 1); g.strokeCircle(0, 0, 30);
      g.lineStyle(6, c, 1);
      if (sym === 'H') { g.lineBetween(-10, -14, -10, 14); g.lineBetween(10, -14, 10, 14); g.lineBetween(-10, 0, 10, 0); }
      else { g.lineBetween(-8, -14, -8, 14); g.lineBetween(-8, 14, 10, 14); }
    }
  }
  function prepIcon(g, k) {
    g.clear();
    if (k === 'boat') { drawPolluter(g, 'oilboat'); g.lineStyle(3, 0x6d4c41, 1); g.lineBetween(-26, 4, -40, 20); }
    else if (k === 'pots') { g.fillStyle(0xbf6c3a, 1); g.fillRect(-14, 0, 28, 20); g.fillStyle(0xe53956, 1); g.fillCircle(0, -10, 9); g.fillStyle(0x6d4c41, 1); g.fillRect(-30, -24, 6, 48); g.fillTriangle(-34, -24, -20, -24, -27, -34); }
    else if (k === 'kite') { g.fillStyle(0xff7043, 1); g.fillTriangle(0, -26, -16, 0, 16, 0); g.fillTriangle(0, 22, -16, 0, 16, 0); g.lineStyle(2, 0x424242, 1); g.lineBetween(0, 22, 12, 34); }
    else { g.fillStyle(0x4fc3f7, 1); g.fillRect(-30, 6, 60, 12); g.fillStyle(0xf2994a, 1); g.fillCircle(0, 0, 8); g.lineStyle(4, 0xf2994a, 1); g.lineBetween(-14, 2, 14, 2); }
  }
  function foxIcon(g) {
    g.clear();
    g.fillStyle(0xf2994a, 1); g.fillTriangle(-16, -12, -6, -26, -2, -10); g.fillTriangle(16, -12, 6, -26, 2, -10); g.fillCircle(0, 0, 14);
    g.fillStyle(0xfff4e6, 1); g.fillEllipse(0, 6, 18, 10); g.fillStyle(0x333333, 1); g.fillCircle(-5, -2, 2); g.fillCircle(5, -2, 2); g.fillCircle(0, 6, 2.5);
  }
  function fossilIcon(g, i) {
    if (i === 0) { g.lineStyle(3, 0x5d4037, 1); g.beginPath(); g.arc(-120, 0, 16, Math.PI, 0, false); g.strokePath(); for (let k = -2; k <= 2; k++) g.lineBetween(-120, 0, -120 + k * 7, -14); }
    else if (i === 1) { g.lineStyle(3, 0xefebe9, 1); g.lineBetween(-140, 0, -100, 0); for (let k = 0; k < 5; k++) g.lineBetween(-134 + k * 8, -8, -134 + k * 8, 8); g.fillStyle(0xefebe9, 1); g.fillTriangle(-100, 0, -88, -8, -88, 8); }
    else { g.fillStyle(0x4e342e, 1); g.fillEllipse(-120, 0, 30, 40); g.lineStyle(2, 0xbcaaa4, 1); for (let k = -12; k <= 12; k += 6) g.lineBetween(-133, k, -107, k); }
  }
  function labIcon(g, k) {
    g.clear();
    if (k === 'water') drawIcon(g, 'rainy');
    else if (k === 'typhoon') { mapSymbol(g, 'T'); g.setScale(0.8 * g.scaleX); }
    else if (k === 'food') foxIcon(g);
    else if (k === 'photo') drawIcon(g, 'sun');
    else if (k === 'spell') { g.fillStyle(0x00897b, 1); [-18, 0, 18].forEach((x) => g.fillRoundedRect(x - 8, -8, 16, 16, 3)); }
    else if (k === 'pitch') { g.fillStyle(0x8d6e63, 1); g.fillRoundedRect(-14, -18, 8, 30, 3); g.fillRoundedRect(4, -6, 8, 18, 3); }
    else { g.fillStyle(0x8d6e63, 1); g.fillRect(-24, -14, 48, 10); g.fillStyle(0xbcaaa4, 1); g.fillRect(-24, -4, 48, 10); g.fillStyle(0x5d4037, 1); g.fillRect(-24, 6, 48, 10); }
  }
  function spellIcon(g, w) {
    g.clear();
    if (['rock', 'mud'].includes(w)) drawSoil(g, w, 1);
    else if (w === 'moon') drawMoon(g, 4);
    else if (w === 'star') { g.fillStyle(0xffd54a, 1); const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 20; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r)); } g.fillPoints(pts, true); }
    else if (['bell', 'drum'].includes(w)) drawInstr(g, w);
    else if (w === 'paper') drawTrash(g, 'newspaper');
    else if (w === 'bottle') drawTrash(g, 'pbottle');
    else if (w === 'water') drawBagItem(g, 'water');
    else if (w === 'rain') drawIcon(g, 'rainy');
    else drawIcon(g, w);
  }

  // 磁鐵站的東西
  function drawMagItem(g, k) {
    g.clear();
    switch (k) {
      case 'nail': g.fillStyle(0x78909c, 1); g.fillRect(-3, -20, 6, 34); g.fillRect(-10, -22, 20, 5); g.fillTriangle(-3, 14, 3, 14, 0, 22); break;
      case 'clip': g.lineStyle(3, 0x90a4ae, 1); g.strokeRoundedRect(-10, -20, 20, 40, 9); g.strokeRoundedRect(-5, -12, 10, 26, 5); break;
      case 'screw': g.fillStyle(0x78909c, 1); g.fillRect(-4, -14, 8, 30); g.fillRect(-11, -20, 22, 7);
        g.lineStyle(2, 0x546e7a, 1); for (let y = -10; y < 14; y += 5) g.lineBetween(-5, y, 5, y + 3); break;
      case 'coin': g.fillStyle(0xc27c4e, 1); g.fillCircle(0, 0, 18); g.lineStyle(3, 0x9c5a33, 1); g.strokeCircle(0, 0, 13); break;
      case 'can': g.fillStyle(0xcfd8dc, 1); g.fillRoundedRect(-13, -20, 26, 40, 6); g.fillStyle(0xe53935, 1); g.fillRect(-13, -6, 26, 12); break;
      case 'eraser': g.fillStyle(0xf8bbd0, 1); g.fillRoundedRect(-20, -10, 40, 20, 5); g.fillStyle(0x64b5f6, 1); g.fillRect(-20, -10, 14, 20); break;
      case 'pencil': g.fillStyle(0xfdd835, 1); g.fillRect(-20, -5, 32, 10); g.fillStyle(0xf3d2b3, 1); g.fillTriangle(12, -5, 12, 5, 22, 0);
        g.fillStyle(0x333333, 1); g.fillTriangle(19, -1.5, 19, 1.5, 22, 0); g.fillStyle(0xf48fb1, 1); g.fillRect(-24, -5, 4, 10); break;
      default: g.fillStyle(0x81d4fa, 0.85); g.fillCircle(0, 0, 15); g.fillStyle(0xffffff, 0.7); g.fillCircle(-5, -5, 4);
    }
  }
  // 石頭、沙子、泥巴；amount 是堆的多寡（0～1），樣本用 1
  function drawSoil(g, k, amount) {
    g.clear();
    if (amount <= 0) { g.lineStyle(2, 0xbcaaa4, 1); g.strokeEllipse(0, 14, 60, 16); return; }
    const sc = 0.5 + amount * 0.5;
    if (k === 'rock') {
      g.fillStyle(0x90a4ae, 1); g.fillPoints([[-26, 14], [-22, -8], [-6, -20], [14, -16], [26, 0], [22, 16]].map(([x, y]) => new Phaser.Geom.Point(x * sc, y * sc + 6)), true);
      g.fillStyle(0xb0bec5, 1); g.fillTriangle(-10 * sc, -12 * sc + 6, 6 * sc, -12 * sc + 6, -4 * sc, 0 * sc + 6);
    } else if (k === 'sand') {
      g.fillStyle(0xe8cf8f, 1); g.fillEllipse(0, 10, 64 * sc, 30 * sc);
      g.fillStyle(0xc9a85f, 1); for (let i = 0; i < 14; i++) g.fillCircle(((i * 37) % 50 - 25) * sc, (((i * 17) % 18) - 2) * sc + 6, 1.8);
    } else {
      g.fillStyle(0x6d4c2f, 1); g.fillEllipse(0, 10, 60 * sc, 30 * sc); g.fillCircle(-12 * sc, 2, 10 * sc); g.fillCircle(10 * sc, 0, 12 * sc);
      g.fillStyle(0xffffff, 0.35); g.fillEllipse(6 * sc, -2, 12 * sc, 5 * sc);
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
      this.stats = { wish: {}, weather: { q: 0, first: 0 }, diary: { q: 0, first: 0 }, habitat: { q: 0, first: 0 }, sound: { q: 0, first: 0 }, fruit: { q: 0, first: 0 }, clothes: { q: 0, first: 0 }, invite: { q: 0, first: 0 }, tea: { q: 0, first: 0 }, acid: { q: 0, first: 0 }, magnet: { q: 0, first: 0 }, dig: { q: 0, first: 0 }, light: { q: 0, first: 0 }, moon: { q: 0, first: 0 }, push: { q: 0, first: 0 }, circuit: { q: 0, first: 0 }, music: { q: 0, first: 0 }, fog: { q: 0, first: 0 }, bag: { q: 0, first: 0 }, drill: { q: 0, first: 0 }, recycle: { q: 0, first: 0 }, pond: { q: 0, first: 0 },
        water: { q: 0, first: 0 }, typhoon: { q: 0, first: 0 }, prep: { q: 0, first: 0 }, food: { q: 0, first: 0 }, photo: { q: 0, first: 0 }, spell: { q: 0, first: 0 }, pitch: { q: 0, first: 0 }, fossil: { q: 0, first: 0 }, harvest: 0, days: 0, planted: 0 };
      this.raindrops = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 300 }));
      this.windLines = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: 60 + Math.random() * 420, v: 900 + Math.random() * 500, l: 60 + Math.random() * 100 }));

      this.skyG = this.add.graphics().setDepth(0);
      this.buildSun();
      this.buildClouds();
      // 雨和風畫在三個區域的圖層之上（區域圖層的深度是 4）
      this.fxG = this.add.graphics().setDepth(5);
      // 這之間建立的是「世界」物件（跟著相機平移）；其餘都是固定在畫面上的介面。
      // 每個區域的物件另外記下來，之後放進各自的圖層，只畫目前所在的區域（Graphics 每格都會重畫，畫面外的也一樣）
      const before = new Set(this.children.list);
      const zoneObjs = {};
      const grab = (z, fn) => { const b = new Set(this.children.list); fn(); zoneObjs[z] = this.children.list.filter((o) => !b.has(o)); };
      grab('meadow', () => { this.buildIsland(); this.buildPlots(); this.buildRabbit(); this.buildPip(); });
      grab('forest', () => this.buildForest());
      grab('beach', () => this.buildBeach());
      grab('cave', () => this.buildCave());
      grab('lighthouse', () => this.buildLighthouse());
      grab('research', () => this.buildResearch());
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
      this.buildTea();
      this.buildAcid();
      this.buildMagnet();
      this.buildDig();
      this.buildLight();
      this.buildMoon();
      this.buildPush();
      this.buildCircuit();
      this.buildMusic();
      this.buildFog();
      this.buildDrill();
      this.buildRecycle();
      this.buildLab();
      this.buildNav();
      const fix = (o) => { if (o.setScrollFactor) o.setScrollFactor(0); if (o.list) o.list.forEach(fix); };
      this.children.list.forEach((o) => { if (!world.has(o)) fix(o); });
      // 區域圖層：圖層隱藏時不會改到物件自己的 visible，不影響原本各自的顯示邏輯
      this.zoneLayers = {};
      Object.keys(zoneObjs).forEach((z) => {
        const layer = this.add.layer().setDepth(4);
        zoneObjs[z].forEach((o) => layer.add(o));
        this.zoneLayers[z] = layer;
      });
      this.showZones([this.zone]);

      this.applyWeatherLook();
      this.refreshAll();
      // 讀檔後接上當天的流程：一天走完在寫日記、早上還沒回答天氣、或剛開始
      if (this.s.t >= DAY_LEN) this.openDiary();
      else if (this.needWeatherQ()) this.openWeatherQ();
      else if (this.s.t < 3) this.showBanner();
      this.ensureWish('rabbit', 800);
      this.ensureForestWish(1500);
      this.checkTown();
      this.checkBeach();
      this.checkCave();
      this.checkLight();
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
      [this.lib, this.bookBox, this.setBox, this.bmBox, this.mkBox, this.ivBox, this.teaBox, this.acBoxBox, this.mgBox, this.dgBox, this.ltBox, this.mnBox, this.puBoxBox, this.ciBox, this.muBox, this.fgBox, this.drBox, this.rcBox, this.rxBox].forEach((c) => c.setVisible(false));
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
      this.s.harvested = (this.s.harvested || 0) + 1;
      p.plant = null; p.progress = 0;
      L.seen(this.s.words, key, this.s.day);
      speak(key);
      this.floatText(o.x, o.y - 70, '+1 ' + key, '#e65100');
      this.sparkle(o.x, o.y - 40);
      this.markDone('pick');
      this.checkBeach();
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
      // 草地 ← 海灘；海灘 → 草地
      this.navB = makeButton(this, 54, 400, 92, 92, 0xf2b84b, '', 0, () => this.goZone('beach')).setDepth(40);
      this.navB.add(txt(this, 0, -14, '←', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navBLabel = txt(this, 0, 22, '', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
      this.navB.add(this.navBLabel);
      this.navMB = makeButton(this, 1226, 400, 92, 92, 0x6bbf59, '', 0, () => this.goZone('meadow')).setDepth(40);
      this.navMB.add(txt(this, 0, -14, '→', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navMB.add(txt(this, 0, 22, '草地', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      // 海灘 ← 洞穴；洞穴 → 海灘
      this.navC = makeButton(this, 54, 400, 92, 92, 0x6d6475, '', 0, () => this.goZone('cave')).setDepth(40);
      this.navC.add(txt(this, 0, -14, '←', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navCLabel = txt(this, 0, 22, '', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
      this.navC.add(this.navCLabel);
      this.navBC = makeButton(this, 1226, 400, 92, 92, 0xf2b84b, '', 0, () => this.goZone('beach')).setDepth(40);
      this.navBC.add(txt(this, 0, -14, '→', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navBC.add(txt(this, 0, 22, '海灘', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      // 洞穴 ← 燈塔；燈塔 → 洞穴
      this.navL = makeButton(this, 54, 400, 92, 92, 0xe53935, '', 0, () => this.goZone('lighthouse')).setDepth(40);
      this.navL.add(txt(this, 0, -14, '←', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navLLabel = txt(this, 0, 22, '', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
      this.navL.add(this.navLLabel);
      this.navCL = makeButton(this, 1226, 400, 92, 92, 0x6d6475, '', 0, () => this.goZone('cave')).setDepth(40);
      this.navCL.add(txt(this, 0, -14, '→', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navCL.add(txt(this, 0, 22, '洞穴', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      // 森林 → 研究島（放在右上，避開訪客）；研究島 ← 森林
      this.navR = makeButton(this, 1226, 250, 92, 92, 0x00897b, '', 0, () => this.goZone('research')).setDepth(40);
      this.navR.add(txt(this, 0, -14, '→', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navR.add(txt(this, 0, 22, '研究島', 16, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navFR = makeButton(this, 54, 400, 92, 92, 0x43a047, '', 0, () => this.goZone('forest')).setDepth(40);
      this.navFR.add(txt(this, 0, -14, '←', 36, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      this.navFR.add(txt(this, 0, 22, '森林', 18, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    }

    checkLight() {
      const s = this.s;
      if (s.lightOpen || !s.caveOpen || (s.caveDone || 0) < LIGHT_NEED) return;
      s.lightOpen = true;
      if (this.zone === 'cave') this.floatText(180, 320, 'New place!', '#e53935', true);
      if (this.navL) this.renderNav();
    }

    checkCave() {
      const s = this.s;
      if (s.caveOpen || !s.beachOpen || this.libCount() < CAVE_LIB) return;
      s.caveOpen = true;
      if (this.zone === 'beach') this.floatText(180, 320, 'New place!', '#5e35b1', true);
      this.renderNav();
    }

    libCount() { return Object.keys(this.s.lib).filter((k) => this.s.lib[k]).length; }

    checkBeach() {
      const s = this.s;
      if (s.beachOpen || (s.harvested || 0) < BEACH_HARVEST || this.libCount() < BEACH_LIB) return;
      s.beachOpen = true;
      this.floatText(180, 320, 'New place!', '#e65100', true);
      if (this.navB) this.tweens.add({ targets: this.navB, scale: 1.2, yoyo: true, repeat: 5, duration: 300 });
      this.renderNav();
    }

    renderNav() {
      const s = this.s;
      this.navF.setVisible(this.zone === 'meadow');
      this.navF.setAlpha(s.forestOpen ? 1 : 0.55);
      this.navFLabel.setText(s.forestOpen ? '森林' : Math.min(s.gaveTotal || 0, FOREST_NEED) + '/' + FOREST_NEED);
      this.navM.setVisible(this.zone === 'forest');
      this.navB.setVisible(this.zone === 'meadow');
      this.navB.setAlpha(s.beachOpen ? 1 : 0.55);
      this.navBLabel.setText(s.beachOpen ? '海灘' : '收成 ' + Math.min(s.harvested || 0, BEACH_HARVEST) + '/' + BEACH_HARVEST);
      this.navMB.setVisible(this.zone === 'beach');
      this.navC.setVisible(this.zone === 'beach');
      this.navC.setAlpha(s.caveOpen ? 1 : 0.55);
      this.navCLabel.setText(s.caveOpen ? '洞穴' : '圖鑑 ' + Math.min(this.libCount(), CAVE_LIB) + '/' + CAVE_LIB);
      this.navBC.setVisible(this.zone === 'cave');
      this.navL.setVisible(this.zone === 'cave');
      this.navL.setAlpha(s.lightOpen ? 1 : 0.55);
      this.navLLabel.setText(s.lightOpen ? '燈塔' : '實驗 ' + Math.min(s.caveDone || 0, LIGHT_NEED) + '/' + LIGHT_NEED);
      this.navCL.setVisible(this.zone === 'lighthouse');
      this.navR.setVisible(this.zone === 'forest');
      this.navR.setAlpha(this.researchOpen() ? 1 : 0.55);
      this.navFR.setVisible(this.zone === 'research');
      if (this.mkBtn) this.mkBtn.setVisible(!!s.town);
    }

    goZone(z) {
      if (this.paused() || this.zone === z) return;
      if (z === 'forest' && !this.s.forestOpen) {
        this.floatText(1130, 330, '再完成 ' + (FOREST_NEED - (this.s.gaveTotal || 0)) + ' 個願望', '#2f5d34', true);
        return;
      }
      if (z === 'beach' && !this.s.beachOpen) {
        const need = [];
        if ((this.s.harvested || 0) < BEACH_HARVEST) need.push('收成 ' + (BEACH_HARVEST - (this.s.harvested || 0)) + ' 次');
        if (this.libCount() < BEACH_LIB) need.push('圖鑑 ' + (BEACH_LIB - this.libCount()) + ' 項');
        this.floatText(260, 330, '再' + need.join('、'), '#e65100', true);
        return;
      }
      if (z === 'research' && !this.researchOpen()) {
        this.floatText(1060, 200, '延伸區：' + this.groupNeed('weather'), '#00695c', true);
        return;
      }
      if (z === 'lighthouse' && !this.s.lightOpen) {
        this.floatText(260, 330, '洞穴實驗再完成 ' + (LIGHT_NEED - (this.s.caveDone || 0)) + ' 回合', '#e53935', true);
        return;
      }
      if (z === 'cave' && !this.s.caveOpen) {
        this.floatText(260, 330, '圖鑑再 ' + (CAVE_LIB - this.libCount()) + ' 項', '#5e35b1', true);
        return;
      }
      const from = this.zone;
      this.zone = z;
      // 平移時兩個區域都要畫，結束後只留目前的區域
      this.showZones([from, z]);
      this.tweens.add({ targets: this.cameras.main, scrollX: { forest: OFF, beach: BOFF, cave: COFF, lighthouse: LOFF, research: ROFF }[z] || 0, duration: BOT ? 1 : 600, ease: 'Sine.easeInOut',
        onComplete: () => { if (this.zone === z) this.showZones([z]); } });
      this.renderNav();
      if (z === 'forest' && this.s.visitor) this.time.delayedCall(700, () => this.sayVisitor());
    }

    showZones(zs) { Object.keys(this.zoneLayers).forEach((k) => this.zoneLayers[k].setVisible(zs.includes(k))); }

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
      this.time.delayedCall(BOT ? 50 : 1400, () => { if (this.modal === 'market' && this.mo === o) this.newOrder(); });
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
      // 演練日：早上播報後開始演練（同一天不再發派對邀請）
      const drill = this.isDrillDay() && s.drillDay !== s.day;
      if (drill) this.time.delayedCall(BOT ? 20 : 3800, () => { if (!this.paused() && s.drillDay !== s.day) this.openDrill(); });
      // 辦派對那天不發新邀請，避免兩件事擠在同一個早上
      if (s.town && !s.party && !partyToday && !drill && s.day - (s.lastInvite || 0) >= 3) {
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

    // ---------- 海灘（M4：§4.7 溶解、§4.8 酸鹼、§4.12 磁鐵、§4.15 土石） ----------
    buildBeach() {
      const X = BOFF + 640;
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(X, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(X, 720, 700, 120);
      g.fillStyle(0xe8cf8f, 1); g.fillEllipse(X, 560, 1060, 300);
      g.fillStyle(0xf1dca6, 1); g.fillEllipse(X, 545, 940, 250);
      // 貝殼與海星（裝飾）
      g.fillStyle(0xffccbc, 1); g.fillCircle(X - 470, 590, 9); g.fillCircle(X + 120, 600, 7); g.fillCircle(X + 455, 585, 8);
      g.fillStyle(0xff8a65, 1);
      [[X - 120, 598], [X + 330, 602]].forEach(([x, y]) => { for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; g.fillTriangle(x, y, x + Math.cos(a - 0.3) * 6, y + Math.sin(a - 0.3) * 6, x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.fillTriangle(x, y, x + Math.cos(a + 0.3) * 6, y + Math.sin(a + 0.3) * 6, x + Math.cos(a) * 14, y + Math.sin(a) * 14); } });
      // 四個實驗站
      this.beachStations = BEACH.map((st, i) => {
        const x = BOFF + st.x, y = 520;
        const c = this.add.container(x, y).setDepth(9);
        const sg = this.add.graphics();
        sg.fillStyle(0x000000, 0.12); sg.fillEllipse(0, 52, 150, 30);
        sg.fillStyle(0xa1887f, 1); sg.fillRoundedRect(-62, -10, 124, 62, 10);
        sg.fillStyle(0x8d6e63, 1); sg.fillRect(-62, -10, 124, 10);
        sg.fillStyle(st.color, 1); sg.fillRoundedRect(-70, -120, 140, 40, 12);
        const icon = makeIcon(this, st.icon, 0, -40, 1.5);
        const label = txt(this, 0, -100, st.en, 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 74, st.zh, 18, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
        c.add([sg, icon, label, zh]);
        const zone = this.add.zone(x, y - 20, 170, 200).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.openStation(st.k));
        return c;
      });
    }

    openStation(k) {
      if (this.paused()) return;
      this.held = null; this.tool = null; this.redrawTools();
      if (k === 'tea') this.openTea();
      else if (k === 'acid') this.openAcid();
      else if (k === 'magnet') this.openMagnet();
      else if (k === 'recycle') this.openRecycle();
      else this.openDig();
    }

    // 共用：實驗站的對話列（客人圖示＋英文句＋中文）
    talkRow(c, y) {
      const who = makeIcon(this, 'rabbit', 250, y + 50, 1.8);
      const bub = this.add.graphics(); drawBubble(bub, 320, y, 620, 100, 350);
      const say = txt(this, 342, y + 16, '', 30, '#27384a', { fontStyle: 'bold' });
      const zh = txt(this, 342, y + 60, '', 20, '#6b7c8c');
      c.add([who, bub, say, zh]);
      const lis = this.add.container(1010, y + 50);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 30);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 0.9)]);
      lis.setSize(66, 66).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => speak(say.text));
      c.add(lis);
      return { who, say, zh };
    }

    // 實驗站開著時時間暫停，為了不讓星砂可以無限刷：每站每天只有前 STATION_PAID 回合給星砂，之後照樣能玩
    stationDone(key, reward, msg) {
      const s = this.s;
      if (CAVE.some((c) => c.k === key)) { s.caveDone = (s.caveDone || 0) + 1; this.checkLight(); }
      if (LIGHTHOUSE.some((c) => c.k === key)) s.lightDone = (s.lightDone || 0) + 1;
      if (!s.paid || s.paid.day !== s.day) s.paid = { day: s.day };
      const n = s.paid[key] || 0;
      if (n < STATION_PAID) {
        s.paid[key] = n + 1;
        s.stardust += reward;
        this.floatText(640, 330, msg + '  +' + reward + ' ★', '#d81b60', true);
      } else {
        this.floatText(640, 330, msg + (this.subs() ? '  今天的星砂拿完了，明天再來' : ''), '#d81b60', true);
      }
      this.refreshAll();
    }

    // --- 甜茶（§4.7）：選熱水或冷水；熱水糖很快溶化，冷水要攪很多下 ---
    buildTea() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Tea 甜茶', 28, '#bf360c', { fontStyle: 'bold' }).setOrigin(0.5));
      this.teaTalk = this.talkRow(c, 130);
      this.teaPots = ['hot', 'cold'].map((k, i) => {
        const p = this.add.container(340, 330 + i * 160);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-95, -65, 190, 130, 20);
        bg.lineStyle(4, k === 'hot' ? 0xef5350 : 0x42a5f5, 1); bg.strokeRoundedRect(-95, -65, 190, 130, 20);
        const pot = this.add.graphics({ x: -30, y: 0 });
        pot.fillStyle(k === 'hot' ? 0xef5350 : 0x42a5f5, 1); pot.fillRoundedRect(-26, -22, 52, 46, 12); pot.fillTriangle(24, -10, 44, -24, 26, 6);
        pot.lineStyle(4, 0x555555, 1); pot.beginPath(); pot.arc(-28, 0, 12, Math.PI * 0.5, Math.PI * 1.5, false); pot.strokePath();
        if (k === 'hot') { pot.lineStyle(3, 0xbdbdbd, 1); [-10, 0, 10].forEach((x) => pot.lineBetween(x, -30, x + 4, -44)); }
        else { pot.fillStyle(0xe1f5fe, 1); pot.fillRect(-12, -36, 12, 12); pot.fillRect(4, -40, 12, 12); }
        const en = txt(this, 45, -12, k, 30, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 45, 24, '', 18, '#6b7c8c').setOrigin(0.5);
        p.add([bg, pot, en, zh]);
        p.setSize(190, 130).setInteractive({ useHandCursor: true });
        p.on('pointerdown', () => this.pourTea(k));
        c.add(p);
        return { p, zh, k };
      });
      this.teaCup = this.add.graphics({ x: 640, y: 420 });
      this.teaMsg = txt(this, 640, 615, '', 24, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.teaCup, this.teaMsg]);
      this.teaStir = makeButton(this, 930, 370, 200, 70, 0x8d6e63, 'Stir 攪拌', 24, () => this.stirTea());
      this.teaServe = makeButton(this, 930, 480, 200, 70, 0x43a047, 'Serve 端出去', 24, () => this.serveTea());
      c.add([this.teaStir, this.teaServe]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.teaBox = c;
    }

    openTea() {
      this.modal = 'tea';
      const who = L.shuffle(['rabbit'].concat(this.residents()))[0];
      this.tq = { who, water: null, sugar: 1, stirs: 0, tries: 0, recorded: false, done: false };
      ['sweet', 'tea'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.teaBox.setVisible(true);
      this.renderTea();
      this.time.delayedCall(250, () => speak('I want sweet tea.'));
    }

    renderTea() {
      const q = this.tq, zh = this.subs();
      drawIcon(this.teaTalk.who, q.who);
      this.teaTalk.say.setText('I want sweet tea.');
      this.teaTalk.zh.setText(zh ? '我想要甜甜的茶。' : '');
      this.teaPots.forEach((p) => p.zh.setText(zh && L.stage(this.s.words, p.k) === 0 ? zhOf(p.k) : ''));
      const g = this.teaCup; g.clear();
      g.fillStyle(0xeceff1, 1); g.fillRoundedRect(-80, -90, 160, 180, 18);
      g.lineStyle(6, 0x90a4ae, 1); g.strokeRoundedRect(-80, -90, 160, 180, 18);
      g.beginPath(); g.arc(88, 0, 26, -Math.PI / 2, Math.PI / 2, false); g.strokePath();
      if (q.water) {
        g.fillStyle(q.water === 'hot' ? 0xd38b3c : 0xe0b07a, 0.9); g.fillRoundedRect(-74, -60, 148, 144, 14);
        if (q.water === 'hot') { g.lineStyle(4, 0xbdbdbd, 1); [-30, 0, 30].forEach((x) => g.lineBetween(x, -100, x + 8, -130)); }
        else { g.fillStyle(0xe1f5fe, 0.9); g.fillRect(-50, -56, 24, 24); g.fillRect(20, -52, 24, 24); }
      }
      // 還沒溶化的糖：沉在杯底的方糖
      const cubes = Math.ceil(q.sugar * 3 - 0.01);
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < cubes; i++) g.fillRect(-48 + i * 34, 52, 26, 26);
      this.teaMsg.setText(q.done ? '' : (!q.water ? 'Pick hot or cold water. 選熱水或冷水' : (q.sugar > 0.01 ? 'The sugar is at the bottom. 糖還沉在杯底' : 'The sugar is gone! 糖溶化了')));
    }

    pourTea(k) {
      const q = this.tq;
      if (this.modal !== 'tea' || q.done) return;
      speak(k);
      if (!q.water) {
        // 第一次選的水就是這題的決策：選熱水算對（只有 2 個選項，不算單字 ok，只記科學統計）
        this.stats.tea.q += 1; if (k === 'hot') this.stats.tea.first += 1;
        if (!q.recorded) { L.answer(this.s.words, 'hot', { day: this.s.day, options: 2, firstTry: k === 'hot', peeked: false }); q.recorded = true; }
        q.water = k;
      } else if (k === 'hot') {
        q.water = 'hot'; // 補救：倒熱水進去
      }
      this.renderTea();
      if (q.water === 'hot' && q.sugar > 0) {
        this.tweens.addCounter({ from: q.sugar, to: 0, duration: BOT ? 10 : 1200, onUpdate: (tw) => { q.sugar = tw.getValue(); this.renderTea(); }, onComplete: () => { q.sugar = 0; this.renderTea(); } });
      }
    }

    stirTea() {
      const q = this.tq;
      if (this.modal !== 'tea' || q.done || !q.water) return;
      q.stirs += 1;
      // 冷水要攪 4 下才溶完，熱水一攪就好
      q.sugar = q.water === 'hot' ? 0 : Math.max(0, q.sugar - 0.25);
      this.tweens.add({ targets: this.teaCup, angle: 6, yoyo: true, repeat: 1, duration: 80, onComplete: () => this.teaCup.setAngle(0) });
      this.renderTea();
    }

    serveTea() {
      const q = this.tq;
      if (this.modal !== 'tea' || q.done) return;
      if (!q.water) { this.tweens.add({ targets: this.teaPots.map((p) => p.p), scale: 1.08, yoyo: true, duration: 140 }); return; }
      if (q.sugar > 0.01) {
        q.tries += 1;
        this.tweens.add({ targets: this.teaTalk.who, angle: 10, yoyo: true, repeat: 2, duration: 90, onComplete: () => this.teaTalk.who.setAngle(0) });
        speak('It is not sweet.');
        this.teaMsg.setText('It is not sweet. 不甜！可以再攪拌，或加熱水');
        return;
      }
      q.done = true;
      speak('Yummy! Thank you!');
      this.renderTea();
      this.stationDone('tea', 3, 'Yummy!');
      // 延遲換下一位客人前，先確認還是同一回合（玩家可能已經關掉又重開）
      this.time.delayedCall(BOT ? 30 : 1300, () => { if (this.modal === 'tea' && this.tq === q) this.openTea(); });
    }

    // --- 紫色花汁（§4.8）：滴下去看顏色，粉紅＝酸、紫＝甜、綠＝苦 ---
    buildAcid() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Flower Juice 紫色花汁', 28, '#6a1b9a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.acTalk = this.talkRow(c, 130);
      this.acCup = this.add.graphics({ x: 360, y: 400 });
      this.acQ = txt(this, 360, 400, '?', 54, '#90a4ae', { fontStyle: 'bold' }).setOrigin(0.5);
      this.acDrop = makeButton(this, 360, 560, 260, 64, 0x8e24aa, 'Add purple juice', 22, () => this.dropAcid());
      this.acKey = this.add.container(640, 300);
      const kg = this.add.graphics();
      [[0xf48fb1, 'sour'], [0x9575cd, 'sweet'], [0x81c784, 'bitter']].forEach(([col, w], i) => {
        kg.fillStyle(col, 1); kg.fillCircle(-110 + i * 110, 0, 16);
        this.acKey.add(txt(this, -110 + i * 110, 30, w, 18, '#6b7c8c').setOrigin(0.5));
      });
      this.acKey.addAt(kg, 0);
      this.acMsg = txt(this, 640, 615, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      this.acProg = txt(this, 985, 98, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.acCup, this.acQ, this.acDrop, this.acKey, this.acMsg, this.acProg]);
      this.acBoxes = TASTES.map((w, i) => {
        const b = this.add.container(640 + i * 150, 460);
        const bg = this.add.graphics();
        bg.fillStyle(0xd7b98e, 1); bg.fillRoundedRect(-65, -60, 130, 120, 16);
        bg.fillStyle(0xbf9a68, 1); bg.fillRect(-65, -60, 130, 20);
        const en = txt(this, 0, 4, w, 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 38, '', 18, '#5d4037').setOrigin(0.5);
        b.add([bg, en, zh]);
        b.setSize(130, 120).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.sortAcid(i));
        c.add(b);
        return { b, zh, x: b.x, w };
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.acBoxBox = c;
    }

    openAcid() {
      this.modal = 'acid';
      this.aq = { who: L.shuffle(['rabbit'].concat(this.residents()))[0], round: 0, n: 3 };
      this.acBoxBox.setVisible(true);
      this.nextCup();
    }

    nextCup() {
      const q = this.aq;
      q.answer = TASTES[Math.floor(Math.random() * TASTES.length)];
      q.tested = false; q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.done = false;
      this.renderAcid();
      this.time.delayedCall(250, () => speak('Is it sour, sweet, or bitter?'));
    }

    renderAcid() {
      const q = this.aq, zh = this.subs(), st = L.stage(this.s.words, q.answer);
      drawIcon(this.acTalk.who, q.who);
      this.acTalk.say.setText('Is it sour, sweet, or bitter?');
      this.acTalk.zh.setText(zh ? '它是酸的、甜的，還是苦的？' : '');
      const g = this.acCup; g.clear();
      g.fillStyle(0xeceff1, 1); g.fillRoundedRect(-70, -90, 140, 170, 16);
      g.lineStyle(5, 0x90a4ae, 1); g.strokeRoundedRect(-70, -90, 140, 170, 16);
      g.fillStyle(q.tested ? TASTE_COLOR[q.answer] : 0xe3f2fd, 1); g.fillRoundedRect(-64, -50, 128, 124, 12);
      this.acQ.setVisible(!q.tested);
      this.acDrop.setVisible(!q.tested);
      // 顏色對照：剛開始（答案字還在階段 0）或答錯後才顯示，熟了就要自己記
      this.acKey.setVisible(st === 0 || q.reveal);
      this.acBoxes.forEach((b) => {
        b.zh.setText(zh && (st === 0 || q.reveal) ? zhOf(b.w) : '');
        b.b.setAlpha(q.wrong[b.w] ? 0.35 : 1);
      });
      this.acProg.setText((q.round + 1) + ' / ' + q.n);
      this.acMsg.setText(q.tested ? '' : 'Add purple juice and look at the color. 滴紫色花汁看看顏色');
    }

    dropAcid() {
      const q = this.aq;
      if (this.modal !== 'acid' || q.tested) return;
      q.tested = true;
      speak('Look at the color!');
      this.renderAcid();
    }

    sortAcid(i) {
      const s = this.s, q = this.aq, w = TASTES[i], b = this.acBoxes[i];
      if (this.modal !== 'acid' || q.done || q.wrong[w]) return;
      const right = w === q.answer;
      if (q.tries === 0) { this.stats.acid.q += 1; if (right) this.stats.acid.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.answer, { day: s.day, options: TASTES.length, firstTry: right, peeked: false }); q.recorded = true; }
      speak(w);
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[w] = true;
        if (!q.tested) q.tested = true; // 放錯就幫忙滴花汁，讓玩家看到顏色
        this.tweens.add({ targets: b.b, x: b.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => b.b.setX(b.x) });
        this.renderAcid();
        this.acMsg.setText('Oh no! Look at the color. 看看顏色再試一次');
        return;
      }
      q.done = true;
      this.tweens.add({ targets: b.b, scale: 1.1, yoyo: true, duration: 160 });
      q.round += 1;
      if (q.round >= q.n) {
        this.stationDone('acid', 3, 'Great!');
        this.time.delayedCall(BOT ? 30 : 1200, () => { if (this.modal === 'acid' && this.aq === q) this.openAcid(); });
      } else {
        this.time.delayedCall(BOT ? 30 : 700, () => { if (this.modal === 'acid' && this.aq === q && q.done) this.nextCup(); });
      }
    }

    // --- 磁鐵（§4.12）：先猜會不會被吸，再用磁鐵驗證；銅幣、鋁罐是「不會被吸的金屬」 ---
    buildMagnet() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Magnet 磁鐵', 28, '#c62828', { fontStyle: 'bold' }).setOrigin(0.5));
      this.mgTitle = txt(this, 640, 150, 'Will the magnet pull it?', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.mgZh = txt(this, 640, 190, '', 20, '#6b7c8c').setOrigin(0.5);
      this.mgMsg = txt(this, 640, 470, '', 22, '#6d4c2f', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
      c.add([this.mgTitle, this.mgZh, this.mgMsg]);
      this.mgCards = [0, 1, 2, 3, 4].map((i) => {
        const card = this.add.container(330 + i * 155, 300);
        const bg = this.add.graphics();
        const icon = this.add.graphics({ y: -12 }).setScale(1.5);
        const name = txt(this, 0, 42, '', 18, '#6b7c8c').setOrigin(0.5);
        const tag = txt(this, 0, -66, '', 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
        card.add([bg, icon, name, tag]);
        card.setSize(140, 130).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickMag(i));
        c.add(card);
        return { card, bg, icon, name, tag, y: card.y };
      });
      this.mgYes = makeButton(this, 470, 545, 240, 72, 0x43a047, 'Yes 會被吸', 24, () => this.sortMag(true));
      this.mgNo = makeButton(this, 760, 545, 240, 72, 0x78909c, 'No 不會', 24, () => this.sortMag(false));
      this.mgCheck = makeButton(this, 1000, 545, 170, 72, 0xc62828, 'Check 驗證', 24, () => this.checkMag());
      c.add([this.mgYes, this.mgNo, this.mgCheck]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.mgBox = c;
    }

    openMagnet() {
      this.modal = 'magnet';
      // 每回合 5 樣：至少 2 樣會被吸、至少 1 樣是不會被吸的金屬（打破迷思）
      const yes = L.shuffle(MAG_ITEMS.filter((m) => m.iron)), noMetal = L.shuffle(MAG_ITEMS.filter((m) => !m.iron && m.metal)), other = L.shuffle(MAG_ITEMS.filter((m) => !m.iron && !m.metal));
      const items = L.shuffle([yes[0], yes[1], noMetal[0], other[0], L.shuffle([yes[2], noMetal[1], other[1]])[0]]);
      this.mq = { items, guess: items.map(() => null), sel: 0, checked: false, rounds: 0, firstDone: false, done: false };
      L.seen(this.s.words, 'magnet', this.s.day);
      this.mgBox.setVisible(true);
      this.renderMagnet();
      this.time.delayedCall(250, () => speak('Will the magnet pull it?'));
    }

    renderMagnet() {
      const q = this.mq;
      this.mgZh.setText(this.subs() ? '磁鐵會吸住它嗎？先猜，再用磁鐵試試看' : '');
      this.mgCards.forEach((c, i) => {
        const it = q.items[i], gs = q.guess[i];
        c.bg.clear();
        const ring = i === q.sel && !q.done ? 0xff9800 : (gs === true ? 0x43a047 : gs === false ? 0x78909c : 0xd7ccc8);
        c.bg.fillStyle(0xffffff, 1); c.bg.fillRoundedRect(-70, -65, 140, 130, 18);
        c.bg.lineStyle(i === q.sel && !q.done ? 6 : 4, ring, 1); c.bg.strokeRoundedRect(-70, -65, 140, 130, 18);
        if (gs !== null) { c.bg.fillStyle(ring, 1); c.bg.fillRoundedRect(-44, -80, 88, 28, 14); }
        drawMagItem(c.icon, it.k);
        c.name.setText(it.zh);
        c.tag.setText(gs === true ? 'Yes' : gs === false ? 'No' : '');
        if (q.checked) {
          const ok = gs === it.iron;
          c.bg.lineStyle(6, ok ? 0x43a047 : 0xe53935, 1); c.bg.strokeRoundedRect(-70, -65, 140, 130, 18);
        }
      });
      const all = q.guess.every((g) => g !== null);
      this.mgCheck.setAlpha(all ? 1 : 0.45);
      if (!q.checked) this.mgMsg.setText(all ? 'Now check with the magnet! 用磁鐵試試看' : 'Tap a thing, then Yes or No. 先點東西，再選 Yes 或 No');
    }

    pickMag(i) {
      const q = this.mq;
      if (this.modal !== 'magnet' || q.done) return;
      q.sel = i;
      speak(q.items[i].en);
      this.renderMagnet();
    }

    sortMag(yes) {
      const q = this.mq;
      if (this.modal !== 'magnet' || q.done) return;
      q.guess[q.sel] = yes;
      q.checked = false;
      // 自動跳到下一個還沒猜的
      const next = q.guess.findIndex((g) => g === null);
      if (next >= 0) q.sel = next;
      this.renderMagnet();
    }

    checkMag() {
      const s = this.s, q = this.mq;
      if (this.modal !== 'magnet' || q.done || !q.guess.every((g) => g !== null)) return;
      q.checked = true;
      // 驗證前的第一次猜測才算數（2 選 1：只記科學統計）
      if (!q.firstDone) {
        q.items.forEach((it, i) => { this.stats.magnet.q += 1; if (q.guess[i] === it.iron) this.stats.magnet.first += 1; });
        q.firstDone = true;
      }
      // 被吸的東西跳一下
      this.mgCards.forEach((c, i) => { if (q.items[i].iron) this.tweens.add({ targets: c.card, y: c.y - 30, yoyo: true, duration: 220 }); });
      speak('Magnet!');
      const wrong = q.items.filter((it, i) => q.guess[i] !== it.iron);
      if (!wrong.length) {
        q.done = true;
        this.mgMsg.setText('All right! Iron is pulled by the magnet. 都對了！磁鐵會吸鐵');
        this.renderMagnet();
        this.stationDone('magnet', 3, 'Great!');
        this.time.delayedCall(BOT ? 30 : 1600, () => { if (this.modal === 'magnet' && this.mq === q) this.openMagnet(); });
        return;
      }
      const myth = wrong.some((it) => it.metal && !it.iron);
      this.mgMsg.setText(myth ? 'Not all metal is pulled! 不是所有金屬都會被吸，紅框的再改改看' : 'Look at the red ones and try again. 紅框的再改改看');
      this.renderMagnet();
      this.mgMsg.setText(this.mgMsg.text);
    }

    // --- 挖掘分類（§4.15）：挖到的東西放進 rock、sand、mud ---
    buildDig() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Dig 挖挖看', 28, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5));
      this.dgTitle = txt(this, 640, 150, 'Rock, sand, or mud?', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dgZh = txt(this, 640, 190, '', 20, '#6b7c8c').setOrigin(0.5);
      this.dgSample = this.add.graphics({ x: 640, y: 300 }).setScale(1.6);
      this.dgHint = txt(this, 640, 380, '', 20, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dgProg = txt(this, 985, 98, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.dgTitle, this.dgZh, this.dgSample, this.dgHint, this.dgProg]);
      this.dgPiles = SOILS.map((w, i) => {
        const b = this.add.container(640 + (i - 1) * 230, 510);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-95, -70, 190, 140, 18);
        bg.lineStyle(4, 0xbcaaa4, 1); bg.strokeRoundedRect(-95, -70, 190, 140, 18);
        const pile = this.add.graphics({ y: -16 }).setScale(1.1);
        const en = txt(this, 0, 34, w, 28, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 60, '', 16, '#6b7c8c').setOrigin(0.5);
        b.add([bg, pile, en, zh]);
        b.setSize(190, 140).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.sortDig(i));
        c.add(b);
        return { b, pile, zh, x: b.x, w };
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.dgBox = c;
    }

    openDig() {
      this.modal = 'dig';
      this.dq = { round: 0, n: 5, count: { rock: 0, sand: 0, mud: 0 } };
      this.dgBox.setVisible(true);
      this.nextDig();
    }

    nextDig() {
      const q = this.dq;
      q.answer = SOILS[Math.floor(Math.random() * SOILS.length)];
      q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.done = false;
      this.renderDig();
      this.time.delayedCall(200, () => speak('Rock, sand, or mud?'));
    }

    renderDig() {
      const q = this.dq, zh = this.subs(), st = L.stage(this.s.words, q.answer);
      this.dgZh.setText(zh ? '是石頭、沙子，還是泥巴？' : '');
      drawSoil(this.dgSample, q.answer, 1);
      this.dgHint.setText(q.reveal && !q.done ? SOIL_HINT[q.answer] : '');
      this.dgPiles.forEach((p) => {
        drawSoil(p.pile, p.w, Math.min(3, q.count[p.w]) / 3);
        p.zh.setText(zh && (st === 0 || q.reveal) ? zhOf(p.w) : '');
        p.b.setAlpha(q.wrong[p.w] ? 0.35 : 1);
      });
      this.dgProg.setText(Math.min(q.round + 1, q.n) + ' / ' + q.n);
    }

    sortDig(i) {
      const s = this.s, q = this.dq, w = SOILS[i], p = this.dgPiles[i];
      if (this.modal !== 'dig' || q.done || q.wrong[w]) return;
      const right = w === q.answer;
      if (q.tries === 0) { this.stats.dig.q += 1; if (right) this.stats.dig.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.answer, { day: s.day, options: SOILS.length, firstTry: right, peeked: false }); q.recorded = true; }
      speak(w);
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[w] = true;
        this.tweens.add({ targets: p.b, x: p.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => p.b.setX(p.x) });
        this.renderDig();
        return;
      }
      q.done = true;
      q.count[w] += 1;
      q.round += 1;
      this.renderDig();
      if (q.round >= q.n) {
        this.stationDone('dig', 3, 'Great digging!');
        this.time.delayedCall(BOT ? 30 : 1200, () => { if (this.modal === 'dig' && this.dq === q) this.openDig(); });
      } else {
        this.time.delayedCall(BOT ? 30 : 600, () => { if (this.modal === 'dig' && this.dq === q && q.done) this.nextDig(); });
      }
    }

    // ---------- 洞穴（M4：§4.9 光、§4.10 月亮、§4.14 力） ----------
    buildCave() {
      const X = COFF + 640;
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(X, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(X, 720, 700, 120);
      g.fillStyle(0x8d8796, 1); g.fillEllipse(X, 560, 1060, 300);
      g.fillStyle(0x9e98a8, 1); g.fillEllipse(X, 545, 940, 250);
      // 後方的岩壁和洞口
      g.fillStyle(0x6d6475, 1); g.fillEllipse(X, 430, 860, 230);
      g.fillStyle(0x2b2633, 1); g.fillEllipse(X, 460, 300, 170);
      g.fillStyle(0x6d6475, 1); [[-120, 360], [-40, 352], [40, 356], [120, 362]].forEach(([dx, y]) => g.fillTriangle(X + dx - 18, y, X + dx + 18, y, X + dx, y + 46));
      this.caveStations = CAVE.map((st) => {
        const x = COFF + st.x, y = 500;
        const c = this.add.container(x, y).setDepth(9);
        const sg = this.add.graphics();
        sg.fillStyle(0x000000, 0.15); sg.fillEllipse(0, 52, 150, 30);
        sg.fillStyle(0x5d4037, 1); sg.fillRoundedRect(-62, -10, 124, 62, 10);
        sg.fillStyle(st.color, 1); sg.fillRoundedRect(-70, -120, 140, 40, 12);
        const icon = this.add.graphics({ y: -40 }).setScale(1.5);
        if (st.k === 'moon') drawMoon(icon, 2); else if (st.k === 'push') drawIcon(icon, 'box'); else drawIcon(icon, 'lamp');
        c.add([sg, icon, txt(this, 0, -100, st.en, 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5), txt(this, 0, 74, st.zh, 18, '#ffffff', { fontStyle: 'bold', stroke: '#4a4458', strokeThickness: 4 }).setOrigin(0.5)]);
        const zone = this.add.zone(x, y - 20, 170, 200).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.openCave(st.k));
        return c;
      });
    }

    openCave(k) {
      if (this.paused()) return;
      this.held = null; this.tool = null; this.redrawTools();
      if (k === 'light') this.openLight(); else if (k === 'moon') this.openMoon(); else this.openPush();
    }

    // --- 光（§4.9）：洞裡很暗，看不到植物；照指令 Move the lamp to the left. 移動燈，照到植物才會出現 ---
    buildLight() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0x1f2633);
      c.add(txt(this, 640, 98, 'Light 光', 28, '#ffd54a', { fontStyle: 'bold' }).setOrigin(0.5));
      const bub = this.add.graphics(); drawBubble(bub, 330, 125, 620, 96, 360);
      this.ltSay = txt(this, 352, 140, '', 30, '#27384a', { fontStyle: 'bold' });
      this.ltZh = txt(this, 352, 182, '', 20, '#6b7c8c');
      c.add([bub, this.ltSay, this.ltZh, makeIcon(this, 'lamp', 260, 172, 1.4)]);
      const lis = this.add.container(1010, 172);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 30);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 0.9)]);
      lis.setSize(66, 66).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => { if (this.lq) speak(this.lq.text); });
      c.add(lis);
      this.ltField = this.add.graphics();
      this.ltPlant = this.add.graphics().setScale(1.2);
      this.ltLamp = makeIcon(this, 'lamp', 0, 0, 0.85);
      c.add([this.ltField, this.ltPlant, this.ltLamp]);
      // 四個方向鍵：只有箭頭，沒有字（要讀懂指令才知道往哪）
      this.ltKeys = LIGHT_DIRS.map((d, i) => {
        const pos = { left: [820, 560], right: [980, 560], far: [900, 490], near: [900, 600] }[d];
        const b = makeButton(this, pos[0], pos[1], 76, 60, 0x5c6bc0, { left: '←', right: '→', far: '↑', near: '↓' }[d], 30, () => this.moveLamp(d));
        c.add(b);
        return b;
      });
      this.ltMsg = txt(this, 470, 615, '', 22, '#ffd54a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.ltProg = txt(this, 985, 98, '', 22, '#cfd8dc').setOrigin(0.5);
      c.add([this.ltMsg, this.ltProg]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.ltBox = c;
    }

    // 格子：5 欄（左右）× 2 排（far 在上、near 在下）
    lightCell(col, row) { return { x: 300 + col * 110, y: row === 0 ? 300 : 440 }; }

    openLight() {
      this.modal = 'light';
      this.lq = { round: 0, n: 2 };
      this.ltBox.setVisible(true);
      this.newLightRound();
    }

    newLightRound() {
      const q = this.lq;
      let lamp, plant;
      do {
        lamp = { col: Math.floor(Math.random() * 5), row: Math.floor(Math.random() * 2) };
        plant = { col: Math.floor(Math.random() * 5), row: Math.floor(Math.random() * 2) };
      } while (Math.abs(lamp.col - plant.col) + Math.abs(lamp.row - plant.row) < 2);
      Object.assign(q, { lamp, plant, found: false });
      L.seen(this.s.words, 'lamp', this.s.day);
      this.nextLightStep();
    }

    // 下一個指令：從還需要走的方向裡挑一個
    nextLightStep() {
      const q = this.lq, need = [];
      if (q.plant.col < q.lamp.col) need.push('left');
      if (q.plant.col > q.lamp.col) need.push('right');
      if (q.plant.row < q.lamp.row) need.push('far');
      if (q.plant.row > q.lamp.row) need.push('near');
      q.dir = need[Math.floor(Math.random() * need.length)];
      q.text = q.dir === 'left' || q.dir === 'right' ? 'Move the lamp to the ' + q.dir + '.' : 'Move the lamp ' + q.dir + (q.dir === 'near' ? 'er' : 'ther') + '.';
      q.tries = 0; q.recorded = false; q.reveal = false;
      this.renderLight();
      this.time.delayedCall(200, () => speak(q.text));
    }

    renderLight() {
      const q = this.lq, st = L.stage(this.s.words, q.dir || 'left');
      this.ltSay.setText(q.found ? 'You found the plant!' : q.text);
      this.ltZh.setText(this.subs() && (q.found || st === 0 || q.reveal) ? (q.found ? '找到植物了！' : '把燈往' + LIGHT_ZH[q.dir] + '移。') : '');
      const g = this.ltField; g.clear();
      for (let r = 0; r < 2; r++) for (let col = 0; col < 5; col++) {
        const p = this.lightCell(col, r);
        g.fillStyle(0x2b3445, 1); g.fillRoundedRect(p.x - 50, p.y - 55, 100, 110, 14);
      }
      // 燈照到的那一格是亮的
      const lp = this.lightCell(q.lamp.col, q.lamp.row);
      g.fillStyle(0xfff59d, 0.85); g.fillRoundedRect(lp.x - 50, lp.y - 55, 100, 110, 14);
      this.ltLamp.setPosition(lp.x - 30, lp.y - 30);
      const pp = this.lightCell(q.plant.col, q.plant.row);
      const lit = q.lamp.col === q.plant.col && q.lamp.row === q.plant.row;
      this.ltPlant.setPosition(pp.x, pp.y + 34).setVisible(lit);
      if (lit) drawPlant(this.ltPlant, 'rose', 1, false);
      this.ltProg.setText(Math.min(q.round + 1, q.n) + ' / ' + q.n);
      this.ltMsg.setText(q.found ? '' : 'Where is the plant? It is too dark. 太暗了，聽指令移動燈');
    }

    moveLamp(d) {
      const s = this.s, q = this.lq;
      if (this.modal !== 'light' || q.found) return;
      const right = d === q.dir;
      if (q.tries === 0) { this.stats.light.q += 1; if (right) this.stats.light.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.dir, { day: s.day, options: LIGHT_DIRS.length, firstTry: right, peeked: false }); q.recorded = true; }
      const nl = { col: q.lamp.col + (d === 'left' ? -1 : d === 'right' ? 1 : 0), row: q.lamp.row + (d === 'far' ? -1 : d === 'near' ? 1 : 0) };
      if (nl.col < 0 || nl.col > 4 || nl.row < 0 || nl.row > 1) {
        // 走到邊了：燈晃一下，不會卡住
        this.tweens.add({ targets: this.ltLamp, angle: 12, yoyo: true, repeat: 2, duration: 70, onComplete: () => this.ltLamp.setAngle(0) });
      } else {
        q.lamp = nl;
      }
      if (q.lamp.col === q.plant.col && q.lamp.row === q.plant.row) {
        q.found = true;
        this.renderLight();
        speak('You found the plant!');
        q.round += 1;
        const cur = q;
        if (q.round >= q.n) {
          this.stationDone('light', 3, 'Bright!');
          this.time.delayedCall(BOT ? 30 : 1500, () => { if (this.modal === 'light' && this.lq === cur) this.openLight(); });
        } else {
          this.time.delayedCall(BOT ? 30 : 1300, () => { if (this.modal === 'light' && this.lq === cur && cur.found) this.newLightRound(); });
        }
        return;
      }
      if (right) { this.nextLightStep(); return; }
      // 走錯：重新規劃下一步，並露出中文
      q.tries += 1;
      this.nextLightStep();
      q.tries = 1; q.recorded = true; q.reveal = true;
      this.renderLight();
    }

    // --- 月亮（§4.10）：第一張固定新月，把其餘排成盈虧順序到滿月 ---
    buildMoon() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0x1a237e);
      c.add(txt(this, 640, 98, 'Moon 月亮', 28, '#fff59d', { fontStyle: 'bold' }).setOrigin(0.5));
      this.mnTitle = txt(this, 640, 150, 'Put the moons in order.', 32, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
      this.mnZh = txt(this, 640, 190, '', 20, '#c5cae9').setOrigin(0.5);
      this.mnMsg = txt(this, 640, 600, '', 22, '#fff59d', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.mnTitle, this.mnZh, this.mnMsg]);
      // 上排：5 個排好的位置；下排：4 張打散的卡片
      this.mnSlots = [0, 1, 2, 3, 4].map((i) => {
        const x = 640 + (i - 2) * 150, y = 300;
        const bg = this.add.graphics({ x, y });
        const m = this.add.graphics({ x, y }).setScale(1.4);
        c.add([bg, m]);
        const z = this.add.container(x, y); z.setSize(130, 130).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => this.unplaceMoon(i));
        c.add(z);
        return { bg, m, x, y };
      });
      this.mnCards = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 150, 460);
        const bg = this.add.graphics();
        bg.fillStyle(0x283593, 1); bg.fillRoundedRect(-62, -62, 124, 124, 16);
        const m = this.add.graphics().setScale(1.4);
        card.add([bg, m]);
        card.setSize(124, 124).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.placeMoon(i));
        c.add(card);
        return { card, m };
      });
      this.mnCheck = makeButton(this, 960, 600, 170, 64, 0xffb300, 'Check 檢查', 22, () => this.checkMoon());
      c.add(this.mnCheck);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.mnBox = c;
    }

    openMoon() {
      this.modal = 'moon';
      // 相位 0 新月 → 4 滿月；卡片是 1～4 打散
      this.nq = { order: L.shuffle([1, 2, 3, 4]), slots: [0, null, null, null, null], used: {}, checks: 0, done: false, bad: {} };
      ['moon', 'night'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.mnBox.setVisible(true);
      this.renderMoon();
      this.time.delayedCall(200, () => speak('Put the moons in order.'));
    }

    renderMoon() {
      const q = this.nq;
      this.mnZh.setText(this.subs() ? '照月亮的變化排好：從看不見的新月，到圓圓的滿月' : '');
      this.mnSlots.forEach((sl, i) => {
        sl.bg.clear();
        sl.bg.lineStyle(4, q.bad[i] ? 0xef5350 : (i === 0 ? 0xfff59d : 0x7986cb), 1); sl.bg.strokeRoundedRect(-62, -62, 124, 124, 16);
        sl.m.clear(); if (q.slots[i] != null) drawMoon(sl.m, q.slots[i]);
      });
      this.mnCards.forEach((c, i) => {
        const ph = q.order[i];
        c.card.setVisible(!q.used[ph]);
        drawMoon(c.m, ph);
      });
      const full = q.slots.every((x) => x != null);
      this.mnCheck.setAlpha(full ? 1 : 0.45);
      if (!q.done) this.mnMsg.setText(full ? 'Check it! 檢查看看' : 'Tap the cards in order. 依序點卡片排上去；點上面的可以拿回來');
    }

    placeMoon(i) {
      const q = this.nq;
      if (this.modal !== 'moon' || q.done) return;
      const ph = q.order[i], slot = q.slots.indexOf(null);
      if (slot < 0 || q.used[ph]) return;
      q.slots[slot] = ph; q.used[ph] = true; q.bad = {};
      this.renderMoon();
    }

    unplaceMoon(i) {
      const q = this.nq;
      if (this.modal !== 'moon' || q.done || i === 0 || q.slots[i] == null) return;
      q.used[q.slots[i]] = false; q.slots[i] = null; q.bad = {};
      this.renderMoon();
    }

    checkMoon() {
      const q = this.nq;
      if (this.modal !== 'moon' || q.done || !q.slots.every((x) => x != null)) return;
      const right = q.slots.every((ph, i) => ph === i);
      if (q.checks === 0) { this.stats.moon.q += 1; if (right) this.stats.moon.first += 1; }
      q.checks += 1;
      if (right) {
        q.done = true;
        speak('Great! The moon gets bigger and bigger.');
        this.mnMsg.setText('The moon gets bigger. 月亮一天天變圓了！');
        this.renderMoon();
        this.stationDone('moon', 3, 'Great!');
        const cur = q;
        this.time.delayedCall(BOT ? 30 : 1800, () => { if (this.modal === 'moon' && this.nq === cur) this.openMoon(); });
        return;
      }
      // 排錯的不收：標紅框並放回下排，可以重排
      q.slots.forEach((ph, i) => { if (i > 0 && ph !== i) { q.bad[i] = true; q.used[ph] = false; q.slots[i] = null; } });
      speak('Try again.');
      this.renderMoon();
      this.mnMsg.setText('Red ones are not right. 紅框的位置不對，再排排看');
    }

    // --- 推與拉（§4.14）：Push the box to the left. 從 4 張只有圖的卡片選 ---
    buildPush() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Push and Pull 推與拉', 28, '#5d4037', { fontStyle: 'bold' }).setOrigin(0.5));
      const bub = this.add.graphics(); drawBubble(bub, 330, 125, 620, 96, 360);
      this.puSay = txt(this, 352, 140, '', 30, '#27384a', { fontStyle: 'bold' });
      this.puZh = txt(this, 352, 182, '', 20, '#6b7c8c');
      c.add([bub, this.puSay, this.puZh, makeIcon(this, 'box', 260, 172, 1.4)]);
      const lis = this.add.container(1010, 172);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 30);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 0.9)]);
      lis.setSize(66, 66).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => { if (this.pq) speak(this.pq.text); });
      c.add(lis);
      // 地面上的箱子（選完後會往選的方向移動）
      this.puGround = this.add.graphics(); this.puGround.fillStyle(0xbcaaa4, 1); this.puGround.fillRect(260, 330, 760, 8);
      this.puBox = makeIcon(this, 'box', 640, 296, 1.6);
      c.add([this.puGround, this.puBox]);
      this.puCards = PUSH_CARDS.map((pc, i) => {
        const card = this.add.container(640 + (i - 1.5) * 190, 470);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-85, -85, 170, 170, 20);
        bg.lineStyle(4, 0xbcaaa4, 1); bg.strokeRoundedRect(-85, -85, 170, 170, 20);
        const pic = this.add.graphics().setScale(1.3); drawPushCard(pic, pc.verb, pc.dir);
        card.add([bg, pic]);
        card.setSize(170, 170).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickPush(i));
        c.add(card);
        return { card, x: card.x };
      });
      this.puMsg = txt(this, 640, 600, '', 22, '#5d4037', { fontStyle: 'bold' }).setOrigin(0.5);
      this.puProg = txt(this, 985, 98, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.puMsg, this.puProg]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.puBoxBox = c;
    }

    openPush() {
      this.modal = 'push';
      this.pq = { round: 0, n: 4 };
      this.puBoxBox.setVisible(true);
      this.nextPush();
    }

    nextPush() {
      const q = this.pq;
      const pc = PUSH_CARDS[Math.floor(Math.random() * PUSH_CARDS.length)];
      Object.assign(q, { verb: pc.verb, dir: pc.dir, text: (pc.verb === 'push' ? 'Push' : 'Pull') + ' the box to the ' + pc.dir + '.', tries: 0, recorded: false, reveal: false, wrong: {}, done: false });
      this.puBox.setX(640);
      this.renderPush();
      this.time.delayedCall(200, () => speak(q.text));
    }

    renderPush() {
      const q = this.pq, st = L.stage(this.s.words, q.verb);
      this.puSay.setText(q.text);
      this.puZh.setText(this.subs() && (st === 0 || q.reveal) ? (q.verb === 'push' ? '把箱子往' : '把箱子往') + (q.dir === 'left' ? '左' : '右') + (q.verb === 'push' ? '推。' : '拉。') : '');
      this.puCards.forEach((c, i) => c.card.setAlpha(q.wrong[i] ? 0.35 : 1));
      this.puProg.setText(Math.min(q.round + 1, q.n) + ' / ' + q.n);
      this.puMsg.setText(q.done ? '' : 'Which picture? 哪一張圖才對？');
    }

    pickPush(i) {
      const s = this.s, q = this.pq, pc = PUSH_CARDS[i], c = this.puCards[i];
      if (this.modal !== 'push' || q.done || q.wrong[i]) return;
      const right = pc.verb === q.verb && pc.dir === q.dir;
      if (q.tries === 0) { this.stats.push.q += 1; if (right) this.stats.push.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.verb, { day: s.day, options: PUSH_CARDS.length, firstTry: right, peeked: false }); q.recorded = true; }
      // 箱子照選的那張移動（選錯也看得到結果）
      const dx = pc.dir === 'left' ? -160 : 160;
      this.tweens.add({ targets: this.puBox, x: 640 + dx, duration: BOT ? 1 : 500, yoyo: !right, hold: 200 });
      speak(pc.verb + '!');
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[i] = true;
        this.renderPush();
        this.puMsg.setText(pc.dir !== q.dir ? 'The box went the other way. 箱子跑錯方向了' : (q.verb === 'push' ? 'That is pull. 那是拉喔' : 'That is push. 那是推喔'));
        return;
      }
      q.done = true;
      q.round += 1;
      this.renderPush();
      const cur = q;
      if (q.round >= q.n) {
        this.stationDone('push', 3, 'Strong!');
        this.time.delayedCall(BOT ? 30 : 1400, () => { if (this.modal === 'push' && this.pq === cur) this.openPush(); });
      } else {
        this.time.delayedCall(BOT ? 30 : 900, () => { if (this.modal === 'push' && this.pq === cur && cur.done) this.nextPush(); });
      }
    }

    // ---------- 燈塔（M4：§4.13 電路、§4.11 聲音） ----------
    buildLighthouse() {
      const X = LOFF + 640;
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(X, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(X, 720, 700, 120);
      g.fillStyle(0x8fbf7a, 1); g.fillEllipse(X, 560, 1060, 300);
      g.fillStyle(0x9ccb86, 1); g.fillEllipse(X, 545, 940, 250);
      // 後方的燈塔（紅白條紋）
      const tx = X + 360;
      g.fillStyle(0xffffff, 1); g.fillTriangle(tx - 40, 440, tx + 40, 440, tx + 26, 230); g.fillTriangle(tx - 40, 440, tx - 26, 230, tx + 26, 230);
      g.fillStyle(0xe53935, 1); g.fillRect(tx - 34, 380, 68, 30); g.fillRect(tx - 30, 310, 60, 28);
      g.fillStyle(0x37474f, 1); g.fillRect(tx - 32, 200, 64, 32);
      g.fillStyle(0xfff59d, 1); g.fillRect(tx - 24, 206, 48, 20);
      g.fillStyle(0xe53935, 1); g.fillTriangle(tx - 36, 202, tx + 36, 202, tx, 172);
      LIGHTHOUSE.forEach((st) => {
        const x = LOFF + st.x, y = 500;
        const c = this.add.container(x, y).setDepth(9);
        const sg = this.add.graphics();
        sg.fillStyle(0x000000, 0.12); sg.fillEllipse(0, 52, 150, 30);
        sg.fillStyle(0x8d6e63, 1); sg.fillRoundedRect(-62, -10, 124, 62, 10);
        sg.fillStyle(st.color, 1); sg.fillRoundedRect(-70, -120, 140, 40, 12);
        const icon = makeIcon(this, st.icon, 0, -40, 1.5);
        c.add([sg, icon, txt(this, 0, -100, st.en, 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5), txt(this, 0, 74, st.zh, 18, '#ffffff', { fontStyle: 'bold', stroke: '#4e6b41', strokeThickness: 4 }).setOrigin(0.5)]);
        const zone = this.add.zone(x, y - 20, 170, 200).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.openLighthouse(st.k));
      });
    }

    openLighthouse(k) {
      if (this.paused()) return;
      this.held = null; this.tool = null; this.redrawTools();
      if (k === 'circuit') this.openCircuit(); else if (k === 'music') this.openMusic(); else this.openFog();
    }

    // --- 電路（§4.13）：缺口補上導體、打開開關，燈才會亮；有檢查模式 ---
    buildCircuit() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Circuit 電路', 28, '#f57f17', { fontStyle: 'bold' }).setOrigin(0.5));
      const bub = this.add.graphics(); drawBubble(bub, 250, 125, 560, 80, 300);
      this.ciSay = txt(this, 272, 136, '', 30, '#27384a', { fontStyle: 'bold' });
      this.ciZh = txt(this, 272, 174, '', 18, '#6b7c8c');
      c.add([bub, this.ciSay, this.ciZh]);
      this.ciWire = this.add.graphics();
      this.ciBulb = this.add.graphics({ x: CIRC.bulb.x, y: CIRC.bulb.y });
      this.ciBatt = this.add.graphics({ x: CIRC.batt.x, y: CIRC.batt.y });
      c.add([this.ciWire, this.ciBatt, this.ciBulb]);
      // 開關：點一下切換
      this.ciSw = this.add.container(CIRC.sw.x, CIRC.sw.y);
      this.ciSwG = this.add.graphics();
      this.ciSwT = txt(this, 0, 34, '', 18, '#6b7c8c').setOrigin(0.5);
      this.ciSw.add([this.ciSwG, this.ciSwT]);
      this.ciSw.setSize(110, 80).setInteractive({ useHandCursor: true });
      this.ciSw.on('pointerdown', () => this.toggleSwitch());
      c.add(this.ciSw);
      // 缺口：點一下放入選好的零件，或把已放的零件拿回
      this.ciGaps = CIRC.gaps.map((p, i) => {
        const z = this.add.container(p.x, p.y);
        const bg = this.add.graphics(); const m = this.add.graphics().setScale(1.1);
        z.add([bg, m]);
        z.setSize(100, 80).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => this.tapGap(i));
        c.add(z);
        return { z, bg, m };
      });
      this.ciTray = CIRC_PARTS.map((k, i) => {
        const b = this.add.container(980, 260 + i * 92);
        const bg = this.add.graphics();
        const m = this.add.graphics({ x: -40 }).setScale(1.1);
        drawPart(m, k);
        const zh = txt(this, 18, 0, CIRC_ZH[k], 18, '#5d4037', { fontStyle: 'bold' }).setOrigin(0, 0.5);
        b.add([bg, m, zh]);
        b.setSize(200, 80).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.pickPart(k));
        c.add(b);
        return { b, bg, k };
      });
      this.ciCheck = makeButton(this, 560, 610, 190, 56, 0x5c6bc0, 'Check 檢查', 22, () => this.checkCircuit());
      this.ciMsg = txt(this, 560, 568, '', 20, '#c62828', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.ciCheck, this.ciMsg]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.ciBox = c;
    }

    openCircuit() {
      this.modal = 'circuit';
      const n = this.cq && this.cq.n === 1 && this.cq.done ? 2 : 1; // 第一回合 1 個缺口，下一回合 2 個
      this.cq = { n, gaps: Array(n).fill(null), sw: false, sel: null, step: 'on', check: false, firstFill: Array(n).fill(true), done: false };
      L.seen(this.s.words, 'lamp', this.s.day);
      this.ciBox.setVisible(true);
      this.renderCircuit();
      this.time.delayedCall(200, () => speak('Turn on the lamp.'));
    }

    renderCircuit() {
      const q = this.cq, lit = L.circuitLit(q.gaps, q.sw);
      this.ciSay.setText(q.done ? 'Good job!' : (q.step === 'on' ? 'Turn on the lamp.' : 'Turn off the lamp.'));
      this.ciZh.setText(this.subs() ? (q.done ? '做得好！' : (q.step === 'on' ? '把燈打開。' : '把燈關掉。')) : '');
      // 導線（迴路的四邊），檢查模式時不通的那段標紅
      const chk = L.circuitCheck(q.gaps, q.sw);
      const w = this.ciWire; w.clear();
      w.lineStyle(6, lit ? 0xffb300 : 0x78909c, 1);
      const { x0, y0, x1, y1 } = CIRC.loop;
      w.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (lit) { w.lineStyle(14, 0xffe082, 0.35); w.strokeRect(x0, y0, x1 - x0, y1 - y0); }
      // 電池、燈泡
      const b = this.ciBatt; b.clear();
      b.fillStyle(0x455a64, 1); b.fillRoundedRect(-22, -40, 44, 80, 8); b.fillStyle(0xffca28, 1); b.fillRoundedRect(-22, -40, 44, 30, 8);
      b.fillStyle(0x90a4ae, 1); b.fillRect(-8, -48, 16, 8);
      const u = this.ciBulb; u.clear();
      if (lit) { u.fillStyle(0xfff59d, 0.6); u.fillCircle(0, -6, 40); }
      u.fillStyle(lit ? 0xffeb3b : 0xeceff1, 1); u.fillCircle(0, -6, 24);
      u.lineStyle(3, 0x90a4ae, 1); u.strokeCircle(0, -6, 24);
      u.fillStyle(0x90a4ae, 1); u.fillRect(-12, 14, 24, 14);
      // 開關
      const sg = this.ciSwG; sg.clear();
      sg.fillStyle(0xffffff, 1); sg.fillRoundedRect(-50, -24, 100, 48, 12);
      sg.lineStyle(4, q.check && !q.sw ? 0xe53935 : 0x90a4ae, 1); sg.strokeRoundedRect(-50, -24, 100, 48, 12);
      sg.fillStyle(0x546e7a, 1); sg.fillCircle(-30, 0, 6); sg.fillCircle(30, 0, 6);
      sg.lineStyle(6, 0x546e7a, 1);
      if (q.sw) sg.lineBetween(-30, 0, 30, 0); else sg.lineBetween(-30, 0, 22, -20);
      this.ciSwT.setText(q.sw ? 'on' : 'off');
      // 缺口
      this.ciGaps.forEach((gp, i) => {
        const has = i < q.n;
        gp.z.setVisible(has);
        if (!has) return;
        const m = q.gaps[i];
        gp.bg.clear();
        gp.bg.fillStyle(0xfffaf0, 1); gp.bg.fillRoundedRect(-48, -36, 96, 72, 12);
        gp.bg.lineStyle(4, q.check ? (chk[i] ? 0x43a047 : 0xe53935) : 0xffb74d, 1); gp.bg.strokeRoundedRect(-48, -36, 96, 72, 12);
        gp.m.clear(); if (m) drawPart(gp.m, m);
      });
      this.ciTray.forEach((t) => {
        const used = q.gaps.includes(t.k);
        t.bg.clear();
        t.bg.fillStyle(0xffffff, 1); t.bg.fillRoundedRect(-100, -38, 200, 76, 14);
        t.bg.lineStyle(q.sel === t.k ? 5 : 3, q.sel === t.k ? 0xff9800 : 0xd7ccc8, 1); t.bg.strokeRoundedRect(-100, -38, 200, 76, 14);
        t.b.setAlpha(used ? 0.35 : 1);
      });
      if (!q.check) this.ciMsg.setText('');
    }

    pickPart(k) {
      const q = this.cq;
      if (this.modal !== 'circuit' || q.done || q.gaps.includes(k)) return;
      q.sel = q.sel === k ? null : k;
      this.renderCircuit();
    }

    tapGap(i) {
      const q = this.cq;
      if (this.modal !== 'circuit' || q.done || i >= q.n) return;
      if (q.gaps[i]) { q.gaps[i] = null; q.check = false; this.renderCircuit(); return; }
      if (!q.sel) { this.ciMsg.setText('Pick a part first. 先選右邊的零件'); return; }
      // 每個缺口第一次放的零件：是不是導體（科學統計）
      if (q.firstFill[i]) { this.stats.circuit.q += 1; if (L.CONDUCTOR[q.sel]) this.stats.circuit.first += 1; q.firstFill[i] = false; }
      q.gaps[i] = q.sel; q.sel = null; q.check = false;
      this.afterCircuit();
    }

    toggleSwitch() {
      const q = this.cq;
      if (this.modal !== 'circuit' || q.done) return;
      q.sw = !q.sw; q.check = false;
      speak(q.sw ? 'on' : 'off');
      this.afterCircuit();
    }

    afterCircuit() {
      const q = this.cq, lit = L.circuitLit(q.gaps, q.sw);
      if (q.step === 'on' && lit) { q.step = 'off'; speak('The lamp is on! Now turn off the lamp.'); }
      else if (q.step === 'off' && !q.sw && q.gaps.every((m) => m && L.CONDUCTOR[m])) {
        q.done = true; speak('Good job!');
        this.stationDone('circuit', 3, 'Good job!');
        const cur = q;
        this.time.delayedCall(BOT ? 30 : 1600, () => { if (this.modal === 'circuit' && this.cq === cur) this.openCircuit(); });
      }
      this.renderCircuit();
    }

    checkCircuit() {
      const q = this.cq;
      if (this.modal !== 'circuit' || q.done) return;
      q.check = true;
      const chk = L.circuitCheck(q.gaps, q.sw);
      const bad = [];
      q.gaps.forEach((m, i) => { if (!chk[i]) bad.push(m ? CIRC_ZH[m] + '不導電' : '缺口是空的'); });
      if (!q.sw) bad.push('開關沒打開');
      this.renderCircuit();
      this.ciMsg.setText(bad.length ? bad.join('、') : 'All good! 都通了');
    }

    // --- 修樂器（§4.11 B）：點樂器聽聽看，正常的會振動；找出卡住不振動的那個 ---
    buildMusic() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Music 樂器', 28, '#6a1b9a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.muTitle = txt(this, 640, 150, 'Which one is broken?', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.muZh = txt(this, 640, 190, '', 20, '#6b7c8c').setOrigin(0.5);
      this.muMsg = txt(this, 640, 610, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.muTitle, this.muZh, this.muMsg]);
      this.muItems = INSTR.map((k, i) => {
        const x = 640 + (i - 1.5) * 200;
        const b = this.add.container(x, 360);
        const bg = this.add.graphics(); bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-85, -95, 170, 190, 20);
        bg.lineStyle(3, 0xd1c4e9, 1); bg.strokeRoundedRect(-85, -95, 170, 190, 20);
        const ic = this.add.graphics({ y: -20 }).setScale(1.6); drawInstr(ic, k);
        const waves = this.add.graphics({ y: -20 });
        const nm = txt(this, 0, 52, k, 26, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const snd = txt(this, 0, -82, '', 22, '#e65100', { fontStyle: 'bold' }).setOrigin(0.5);
        b.add([bg, ic, waves, nm, snd]);
        b.setSize(170, 190).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.playInstr(i));
        const fix = makeButton(this, x, 515, 150, 56, 0x8e24aa, 'Fix 修理', 22, () => this.fixInstr(i));
        c.add([b, fix]);
        return { b, ic, waves, snd, fix, x };
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.muBox = c;
    }

    openMusic() {
      this.modal = 'music';
      this.uq = { broken: Math.floor(Math.random() * INSTR.length), tried: {}, tries: 0, done: false, wrong: {} };
      INSTR.forEach((k) => L.seen(this.s.words, k, this.s.day));
      this.muBox.setVisible(true);
      this.renderMusic();
      this.time.delayedCall(200, () => speak('Which one is broken?'));
    }

    renderMusic() {
      const q = this.uq;
      this.muZh.setText(this.subs() ? '哪一個壞了？點樂器聽聽看、看看它有沒有振動' : '');
      this.muItems.forEach((it, i) => { it.b.setAlpha(q.wrong[i] ? 0.4 : 1); it.fix.setAlpha(q.wrong[i] ? 0.4 : 1); });
      if (!q.done) this.muMsg.setText('Tap to play. Sound comes from shaking. 聲音來自振動');
    }

    playInstr(i) {
      const q = this.uq, it = this.muItems[i];
      if (this.modal !== 'music') return;
      q.tried[i] = true;
      const broken = i === q.broken && !q.done;
      it.waves.clear();
      if (broken) {
        // 卡住了：不振動、沒有聲音
        it.snd.setText('...');
        this.time.delayedCall(700, () => it.snd.setText(''));
        return;
      }
      speak(INSTR_SOUND[INSTR[i]]);
      it.snd.setText(INSTR_SOUND[INSTR[i]]);
      it.waves.lineStyle(3, 0xff9800, 0.9);
      [34, 46].forEach((r) => { it.waves.beginPath(); it.waves.arc(0, 0, r, -0.6, 0.6, false); it.waves.strokePath(); it.waves.beginPath(); it.waves.arc(0, 0, r, Math.PI - 0.6, Math.PI + 0.6, false); it.waves.strokePath(); });
      this.tweens.add({ targets: it.ic, x: 4, yoyo: true, repeat: 5, duration: 40, onComplete: () => { it.ic.setX(0); it.waves.clear(); it.snd.setText(''); } });
    }

    fixInstr(i) {
      const q = this.uq, it = this.muItems[i];
      if (this.modal !== 'music' || q.done || q.wrong[i]) return;
      const right = i === q.broken;
      if (q.tries === 0) { this.stats.music.q += 1; if (right) this.stats.music.first += 1; }
      if (!right) {
        q.tries += 1; q.wrong[i] = true;
        this.tweens.add({ targets: it.b, x: it.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => it.b.setX(it.x) });
        this.muMsg.setText('It is not broken. Tap it to hear. 它沒壞，點點看會不會振動');
        this.renderMusic();
        return;
      }
      q.done = true;
      speak('You fixed the ' + INSTR[i] + '!');
      this.muMsg.setText('Fixed! Now it can shake. 修好了！它又能振動了');
      this.renderMusic();
      this.time.delayedCall(300, () => this.playInstr(i));
      this.stationDone('music', 3, 'Fixed!');
      const cur = q;
      this.time.delayedCall(BOT ? 30 : 1800, () => { if (this.modal === 'music' && this.uq === cur) this.openMusic(); });
    }

    // --- 霧中找動物（§4.11 A）：看波紋、聽聲音往哪邊走；走對會 louder，走錯會 quieter ---
    buildFog() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xcfd8dc);
      c.add(txt(this, 640, 98, 'Fog 霧中找朋友', 28, '#37474f', { fontStyle: 'bold' }).setOrigin(0.5));
      this.fgTitle = txt(this, 640, 150, '', 30, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.fgZh = txt(this, 640, 188, '', 20, '#546e7a').setOrigin(0.5);
      this.fgField = this.add.graphics();
      this.fgWaves = this.add.graphics();
      this.fgFriend = this.add.graphics({ x: 640, y: 330 }).setScale(1.6);
      this.fgMe = makeIcon(this, 'rabbit', 640, 500, 1.4);
      this.fgFeed = txt(this, 640, 420, '', 30, '#e65100', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.fgTitle, this.fgZh, this.fgField, this.fgWaves, this.fgFriend, this.fgMe, this.fgFeed]);
      this.fgKeys = FOG_DIRS.map((d, i) => {
        const b = makeButton(this, 640 + (i - 1) * 150, 600, 120, 60, 0x546e7a, { left: '←', front: '↑', right: '→' }[d], 32, () => this.fogMove(d));
        c.add(b);
        return b;
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.fgBox = c;
    }

    openFog() {
      this.modal = 'fog';
      const who = L.shuffle(SOUND_KEYS)[0];
      this.fq = { who, dist: 3, dir: FOG_DIRS[Math.floor(Math.random() * 3)], firstStep: true, done: false, feed: '' };
      ['loud', 'quiet'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.fgBox.setVisible(true);
      this.renderFog();
      this.time.delayedCall(250, () => this.fogCall());
    }

    fogCall() { if (this.fq && !this.fq.done) { const t = ANIMALS[this.fq.who].sound; speak(t); } }

    renderFog() {
      const q = this.fq;
      this.fgTitle.setText(q.done ? 'You found ' + art(q.who) + '!' : 'Where is your friend?');
      this.fgZh.setText(this.subs() ? (q.done ? '找到了！' : '霧好濃，看波紋、聽聲音，往聲音那邊走') : '');
      const f = this.fgField; f.clear();
      f.fillStyle(0xeceff1, 0.9); f.fillRoundedRect(250, 220, 780, 330, 24);
      // 波紋：從朋友那邊傳來，越近越大、越多圈（靜音也能玩）
      const w = this.fgWaves; w.clear();
      if (!q.done) {
        const cx = { left: 330, front: 640, right: 950 }[q.dir], cy = q.dir === 'front' ? 250 : 330;
        const rings = 4 - q.dist;
        w.lineStyle(4, 0x5c6bc0, 0.4 + 0.15 * rings);
        for (let r = 0; r <= rings; r++) w.strokeCircle(cx, cy, 18 + r * 16);
      }
      this.fgFriend.setVisible(q.done);
      if (q.done) drawIcon(this.fgFriend, q.who);
      this.fgFeed.setText(q.feed);
    }

    fogMove(d) {
      const q = this.fq;
      if (this.modal !== 'fog' || q.done) return;
      const right = d === q.dir;
      // 每一步的第一次選擇算統計（3 選 1，記科學統計：看波紋／聽聲音判斷方向）
      if (q.firstStep) { this.stats.fog.q += 1; if (right) this.stats.fog.first += 1; }
      if (right) {
        q.dist -= 1; q.firstStep = true;
        q.feed = q.dist > 0 ? 'It is louder!' : '';
        if (q.dist > 0) q.dir = FOG_DIRS[Math.floor(Math.random() * 3)]; // 路會轉彎
      } else {
        q.dist = Math.min(4, q.dist + 1); q.firstStep = false;
        q.feed = 'It is quieter.';
      }
      if (q.feed) speak(q.feed);
      if (q.dist <= 0) {
        q.done = true;
        speak('You found ' + art(q.who) + '!');
        this.renderFog();
        this.stationDone('fog', 3, 'Found!');
        const cur = q;
        this.time.delayedCall(BOT ? 30 : 1800, () => { if (this.modal === 'fog' && this.fq === cur) this.openFog(); });
        return;
      }
      this.renderFog();
      this.time.delayedCall(BOT ? 10 : 900, () => this.fogCall());
    }

    // ---------- 演練日（§4.16）：每第 7 天；A 準備防災包、B 演練 Drop! Cover! Hold on! ----------
    isDrillDay(d) { return (d || this.s.day) % 7 === 0; }

    buildDrill() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfff8e1);
      c.add(txt(this, 640, 98, 'Drill Day 防災演練日', 28, '#e65100', { fontStyle: 'bold' }).setOrigin(0.5));
      this.drSay = txt(this, 640, 150, '', 32, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.drZh = txt(this, 640, 190, '', 20, '#6b7c8c').setOrigin(0.5);
      this.drMsg = txt(this, 640, 612, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.drSay, this.drZh, this.drMsg]);
      // A：防災包，8 樣東西 2 排
      this.bagCards = BAG_ITEMS.map((it, i) => {
        const card = this.add.container(355 + (i % 4) * 190, 300 + Math.floor(i / 4) * 150);
        const bg = this.add.graphics();
        const icon = this.add.graphics({ y: -14 }).setScale(1.4); drawBagItem(icon, it.k);
        const name = txt(this, 0, 44, it.en, 20, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 66, it.zh, 16, '#6b7c8c').setOrigin(0.5);
        card.add([bg, icon, name, zh]);
        card.setSize(170, 136).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.toggleBag(i));
        c.add(card);
        return { card, bg, x: card.x };
      });
      this.bagPack = makeButton(this, 640, 560, 220, 60, 0xe65100, 'Pack 裝好了', 24, () => this.packBag());
      c.add(this.bagPack);
      // B：演練，3 張只有圖的動作卡
      this.drCards = DRILL.map((d, i) => {
        const card = this.add.container(640 + (i - 1) * 230, 390);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-100, -110, 200, 220, 22);
        bg.lineStyle(4, 0xffcc80, 1); bg.strokeRoundedRect(-100, -110, 200, 220, 22);
        const pic = this.add.graphics().setScale(1.5);
        card.add([bg, pic]);
        card.setSize(200, 220).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickDrill(i));
        c.add(card);
        return { card, pic, x: card.x };
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.drBox = c;
    }

    openDrill() {
      const s = this.s;
      this.modal = 'drill';
      this.dr = { part: s.bagReady ? 'drill' : 'bag', sel: {}, bagTries: 0, step: 0, tries: 0, recorded: false, reveal: false, wrong: {}, order: L.shuffle([0, 1, 2]), done: false };
      ['earthquake', 'safe', 'flashlight', 'bag'].forEach((w) => L.seen(s.words, w, s.day));
      this.drBox.setVisible(true);
      // 輕微搖晃，提示「演練開始」（不放真實災難畫面）
      if (!BOT) this.cameras.main.shake(400, 0.004);
      this.renderDrill();
      this.time.delayedCall(300, () => speak(this.dr.part === 'bag' ? 'It is Drill Day. Pack your safety bag.' : 'It is Drill Day. ' + DRILL[0].say));
    }

    renderDrill() {
      const q = this.dr, bag = q.part === 'bag', zh = this.subs();
      this.bagCards.forEach((b, i) => {
        b.card.setVisible(bag);
        b.bg.clear();
        const on = !!q.sel[i];
        b.bg.fillStyle(on ? 0xfff3e0 : 0xffffff, 1); b.bg.fillRoundedRect(-85, -68, 170, 136, 18);
        b.bg.lineStyle(on ? 6 : 3, on ? 0xff9800 : 0xd7ccc8, 1); b.bg.strokeRoundedRect(-85, -68, 170, 136, 18);
      });
      this.bagPack.setVisible(bag);
      // 卡片位置每次打亂，不能靠「從左點到右」
      this.drCards.forEach((c, i) => { c.card.setVisible(!bag && !q.done); c.card.setAlpha(q.wrong[i] ? 0.35 : 1); drawDrill(c.pic, DRILL[q.order[i]].k); });
      if (bag) {
        const n = Object.values(q.sel).filter(Boolean).length;
        this.drSay.setText('Pack your safety bag.');
        this.drZh.setText(zh ? '準備防災包：選 5 樣地震時用得到的東西' : '');
        this.bagPack.setAlpha(n === 5 ? 1 : 0.45);
        if (!this.drMsg.text || this.drMsg.text.indexOf('5') >= 0) this.drMsg.setText(n + ' / 5');
      } else if (q.done) {
        this.drSay.setText('You are safe!');
        this.drZh.setText(zh ? '你很安全！演練完成' : '');
      } else {
        const d = DRILL[q.step];
        const st = d.word ? L.stage(this.s.words, d.word) : 0;
        this.drSay.setText(d.say);
        this.drZh.setText(zh && (st === 0 || q.reveal) ? d.zh : '');
        this.drMsg.setText((q.step + 1) + ' / 3');
      }
    }

    toggleBag(i) {
      const q = this.dr;
      if (this.modal !== 'drill' || q.part !== 'bag') return;
      const n = Object.values(q.sel).filter(Boolean).length;
      if (!q.sel[i] && n >= 5) { this.tweens.add({ targets: this.bagPack, scale: 1.08, yoyo: true, duration: 120 }); return; }
      q.sel[i] = !q.sel[i];
      speak(BAG_ITEMS[i].en);
      this.drMsg.setText('');
      this.renderDrill();
    }

    packBag() {
      const s = this.s, q = this.dr;
      if (this.modal !== 'drill' || q.part !== 'bag') return;
      const picked = BAG_ITEMS.filter((it, i) => q.sel[i]);
      if (picked.length !== 5) return;
      const bad = picked.filter((it) => !it.good);
      if (q.bagTries === 0) { this.stats.bag.q += 1; if (!bad.length) this.stats.bag.first += 1; }
      q.bagTries += 1;
      if (bad.length) {
        // 選錯不扣東西：說明為什麼用不到，換掉再裝
        BAG_ITEMS.forEach((it, i) => { if (q.sel[i] && !it.good) this.tweens.add({ targets: this.bagCards[i].card, x: this.bagCards[i].x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => this.bagCards[i].card.setX(this.bagCards[i].x) }); });
        this.drMsg.setText(bad.map((it) => it.zh).join('、') + '在地震時用不到，換成別的吧');
        speak('Try again.');
        return;
      }
      s.bagReady = true;
      speak('Your bag is ready!');
      q.part = 'drill';
      this.drMsg.setText('');
      this.renderDrill();
      this.time.delayedCall(BOT ? 10 : 900, () => speak(DRILL[0].say));
    }

    pickDrill(i) {
      const s = this.s, q = this.dr, d = DRILL[q.step], c = this.drCards[i];
      if (this.modal !== 'drill' || q.part !== 'drill' || q.done || q.wrong[i]) return;
      const right = q.order[i] === q.step;
      if (q.tries === 0) { this.stats.drill.q += 1; if (right) this.stats.drill.first += 1; }
      if (!q.recorded && d.word) { L.answer(s.words, d.word, { day: s.day, options: DRILL.length, firstTry: right, peeked: false }); }
      q.recorded = true;
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[i] = true;
        this.tweens.add({ targets: c.card, x: c.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        speak('Try again. ' + d.say);
        this.renderDrill();
        return;
      }
      this.tweens.add({ targets: c.card, scale: 1.08, yoyo: true, duration: 150 });
      q.step += 1; q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.order = L.shuffle([0, 1, 2]);
      if (q.step >= DRILL.length) {
        q.done = true;
        s.drillDay = s.day;
        speak('You are safe! Great job!');
        this.renderDrill();
        this.drMsg.setText(s.bagReady ? 'Your bag is ready, too! 防災包也準備好了' : '');
        s.stardust += 5;
        this.floatText(640, 330, 'Safe!  +5 ★', '#e65100', true);
        this.refreshAll();
        return;
      }
      this.renderDrill();
      this.time.delayedCall(BOT ? 10 : 500, () => speak(DRILL[q.step].say));
    }

    // ---------- 回收站（§4.18）：A 垃圾分類、B 找出池塘汙染的來源 ----------
    buildRecycle() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xf1f8e9);
      c.add(txt(this, 640, 98, 'Recycle 回收與環境', 28, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5));
      this.rcSay = txt(this, 640, 150, '', 30, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rcZh = txt(this, 640, 188, '', 20, '#6b7c8c').setOrigin(0.5);
      this.rcMsg = txt(this, 640, 612, '', 22, '#33691e', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rcProg = txt(this, 985, 98, '', 22, '#6b7c8c').setOrigin(0.5);
      c.add([this.rcSay, this.rcZh, this.rcMsg, this.rcProg]);
      // A：分類
      this.rcItem = this.add.graphics({ x: 640, y: 290 }).setScale(1.8);
      this.rcItemName = txt(this, 640, 350, '', 20, '#6b7c8c').setOrigin(0.5);
      c.add([this.rcItem, this.rcItemName]);
      this.rcBins = BINS3.map((w, i) => {
        const b = this.add.container(640 + (i - 1) * 230, 490);
        const bg = this.add.graphics();
        bg.fillStyle(BIN_COLOR[w], 1); bg.fillRoundedRect(-90, -70, 180, 140, 18);
        bg.fillStyle(0x000000, 0.15); bg.fillRect(-90, -70, 180, 22);
        const en = txt(this, 0, 6, w, 30, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 42, '', 18, '#ffffff').setOrigin(0.5);
        b.add([bg, en, zh]);
        b.setSize(180, 140).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.sortTrash(i));
        c.add(b);
        return { b, zh, x: b.x, w };
      });
      // B：池塘與三個可能的汙染源
      this.rcPond = this.add.graphics();
      c.add(this.rcPond);
      this.rcSus = POLLUTERS.map((p, i) => {
        const z = this.add.container(POLL_POS[i].x, POLL_POS[i].y);
        const g = this.add.graphics().setScale(1.4); drawPolluter(g, p.k);
        const nm = txt(this, 0, 50, p.zh, 18, '#33691e', { fontStyle: 'bold' }).setOrigin(0.5);
        z.add([g, nm]);
        z.setSize(140, 130).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => this.pickPolluter(i));
        c.add(z);
        return { z, x: z.x };
      });
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.rcBox = c;
    }

    openRecycle() {
      this.modal = 'recycle';
      // 分類回合和池塘回合輪流
      const mode = this.rq && this.rq.mode === 'sort' && this.rq.done ? 'pond' : 'sort';
      this.rq = { mode, round: 0, n: 5, done: false };
      ['recycle', 'clean', 'dirty', 'garbage'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.rcBox.setVisible(true);
      if (mode === 'sort') this.nextTrash(); else this.newPond();
    }

    nextTrash() {
      const q = this.rq;
      q.item = TRASH[Math.floor(Math.random() * TRASH.length)];
      q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.itemDone = false;
      this.renderRecycle();
      this.time.delayedCall(200, () => speak('Where does it go?'));
    }

    newPond() {
      const q = this.rq;
      q.culprit = Math.floor(Math.random() * POLLUTERS.length);
      q.order = L.shuffle([0, 1, 2]);
      q.tries = 0; q.wrong = {}; q.clean = false;
      this.renderRecycle();
      this.time.delayedCall(200, () => speak('The pond is dirty. What makes it dirty?'));
    }

    renderRecycle() {
      const q = this.rq, zh = this.subs(), sort = q.mode === 'sort';
      this.rcItem.setVisible(sort); this.rcItemName.setVisible(sort);
      this.rcBins.forEach((b) => b.b.setVisible(sort));
      this.rcSus.forEach((x) => x.z.setVisible(!sort));
      this.rcPond.clear();
      this.rcProg.setText(sort ? Math.min(q.round + 1, q.n) + ' / ' + q.n : '');
      if (sort) {
        const st = L.stage(this.s.words, q.item.bin);
        this.rcSay.setText('Where does it go?');
        this.rcZh.setText(zh ? '它要丟到哪一桶？' : '');
        drawTrash(this.rcItem, q.item.k);
        this.rcItemName.setText(q.item.zh);
        this.rcBins.forEach((b) => { b.zh.setText(zh && (st === 0 || q.reveal) ? BIN_ZH[b.w] : ''); b.b.setAlpha(q.wrong[b.w] ? 0.35 : 1); });
        if (!q.itemDone) this.rcMsg.setText(q.reveal ? TRASH_HINT[q.item.bin] : '');
        return;
      }
      // 池塘：汙染時是灰褐色；從真正的汙染源有一道髒水流向池塘
      const p = this.rcPond;
      p.fillStyle(q.clean ? 0x4fc3f7 : 0x8d8a6a, 1); p.fillEllipse(640, 470, 360, 130);
      if (q.clean) { p.fillStyle(0xff8a3d, 1); [[590, 470], [690, 455]].forEach(([x, y]) => { p.fillEllipse(x, y, 34, 16); p.fillTriangle(x + 14, y, x + 26, y - 8, x + 26, y + 8); }); }
      else {
        const src = POLL_POS[q.order.indexOf(q.culprit)];
        p.lineStyle(10, 0x6d6a4a, 0.8); p.lineBetween(src.x, src.y + 40, 640 + (src.x - 640) * 0.35, 430);
      }
      this.rcSus.forEach((x, i) => {
        const k = q.order[i];
        x.z.setPosition(POLL_POS[i].x, POLL_POS[i].y);
        drawPolluter(x.z.list[0], POLLUTERS[k].k);
        x.z.list[1].setText(POLLUTERS[k].zh);
        x.z.setAlpha(q.wrong[i] ? 0.35 : (q.clean && k === q.culprit ? 0.2 : 1));
      });
      this.rcSay.setText(q.clean ? 'The pond is clean!' : 'The pond is dirty.');
      this.rcZh.setText(zh ? (q.clean ? '池塘變乾淨了，魚回來了！' : '池塘變髒了，是哪一個造成的？找出來移走') : '');
      if (!q.clean && !q.tries) this.rcMsg.setText('Look where the dirty water comes from. 看看髒水從哪裡流過來');
    }

    sortTrash(i) {
      const s = this.s, q = this.rq, w = BINS3[i], b = this.rcBins[i];
      if (this.modal !== 'recycle' || q.mode !== 'sort' || q.itemDone || q.wrong[w]) return;
      const right = w === q.item.bin;
      if (q.tries === 0) { this.stats.recycle.q += 1; if (right) this.stats.recycle.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.item.bin, { day: s.day, options: BINS3.length, firstTry: right, peeked: false }); q.recorded = true; }
      speak(w);
      if (!right) {
        // 放錯：東西回到桌上（不扣東西），露出中文與提示
        q.tries += 1; q.reveal = true; q.wrong[w] = true;
        this.tweens.add({ targets: b.b, x: b.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => b.b.setX(b.x) });
        this.renderRecycle();
        return;
      }
      q.itemDone = true; q.round += 1;
      this.tweens.add({ targets: b.b, scale: 1.08, yoyo: true, duration: 150 });
      this.rcMsg.setText('Good! 丟對了');
      const cur = q;
      if (q.round >= q.n) {
        q.done = true;
        this.stationDone('recycle', 3, 'Clean island!');
        this.time.delayedCall(BOT ? 30 : 1400, () => { if (this.modal === 'recycle' && this.rq === cur) this.openRecycle(); });
      } else {
        this.time.delayedCall(BOT ? 30 : 700, () => { if (this.modal === 'recycle' && this.rq === cur) this.nextTrash(); });
      }
    }

    pickPolluter(i) {
      const q = this.rq, x = this.rcSus[i];
      if (this.modal !== 'recycle' || q.mode !== 'pond' || q.clean || q.wrong[i]) return;
      const right = q.order[i] === q.culprit;
      if (q.tries === 0) { this.stats.pond.q += 1; if (right) this.stats.pond.first += 1; }
      if (!right) {
        q.tries += 1; q.wrong[i] = true;
        this.tweens.add({ targets: x.z, x: x.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => x.z.setX(x.x) });
        this.rcMsg.setText('Not this one. Follow the dirty water. 不是它，跟著髒水找找看');
        this.renderRecycle();
        return;
      }
      q.clean = true; q.done = true;
      speak('The pond is clean! The fish are back.');
      this.renderRecycle();
      this.rcMsg.setText('You moved it away. 移走之後，池塘乾淨了');
      this.stationDone('recycle', 3, 'Clean pond!');
      const cur = q;
      this.time.delayedCall(BOT ? 30 : 1800, () => { if (this.modal === 'recycle' && this.rq === cur) this.openRecycle(); });
    }

    // ---------- 研究島（M6 延伸層，5～6 年級）：氣象站、生態研究所、地質洞窟 ----------
    groupOpen(gk) {
      const s = this.s;
      if (gk === 'weather') return !!(s.forestOpen && s.beachOpen && s.caveOpen && s.lightOpen);
      if (gk === 'geo') return !!(s.lightOpen && (s.lightDone || 0) >= GEO_NEED);
      return this.libCount() >= LIB.length;
    }
    groupNeed(gk) {
      if (gk === 'weather') return '要先開放草地、海灘、森林、洞穴、燈塔 5 區';
      if (gk === 'geo') return '燈塔實驗再完成 ' + Math.max(0, GEO_NEED - (this.s.lightDone || 0)) + ' 回合';
      return '圖鑑還差 ' + Math.max(0, LIB.length - this.libCount()) + ' 項';
    }
    researchOpen() { return RGROUPS.some((g) => this.groupOpen(g.k)); }

    buildResearch() {
      const X = ROFF + 640;
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(X, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(X, 720, 700, 120);
      g.fillStyle(0x80cbc4, 1); g.fillEllipse(X, 560, 1060, 300);
      g.fillStyle(0x8fd3cc, 1); g.fillEllipse(X, 545, 940, 250);
      // 三組的底板與名稱
      RGROUPS.forEach((gr) => {
        g.fillStyle(gr.color, 0.25); g.fillRoundedRect(ROFF + gr.x0, 360, gr.x1 - gr.x0, 220, 24);
        txt(this, ROFF + (gr.x0 + gr.x1) / 2, 380, gr.zh, 22, '#ffffff', { fontStyle: 'bold', stroke: '#37474f', strokeThickness: 5 }).setOrigin(0.5).setDepth(8);
      });
      this.rsSigns = RLABS.map((st) => {
        const x = ROFF + st.x, y = 500;
        const c = this.add.container(x, y).setDepth(9);
        const sg = this.add.graphics();
        sg.fillStyle(0x000000, 0.12); sg.fillEllipse(0, 48, 120, 24);
        sg.fillStyle(0xeceff1, 1); sg.fillRoundedRect(-58, -62, 116, 104, 14);
        sg.lineStyle(4, RGROUPS.find((g2) => g2.k === st.g).color, 1); sg.strokeRoundedRect(-58, -62, 116, 104, 14);
        const icon = this.add.graphics({ y: -18 }).setScale(1.2); labIcon(icon, st.k);
        const en = txt(this, 0, 24, st.en, 17, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 62, st.zh, 15, '#ffffff', { fontStyle: 'bold', stroke: '#37474f', strokeThickness: 4 }).setOrigin(0.5);
        const lock = txt(this, 0, -18, '', 30, '#78909c', { fontStyle: 'bold' }).setOrigin(0.5);
        c.add([sg, icon, en, zh, lock]);
        const zone = this.add.zone(x, y - 10, 130, 140).setDepth(20).setInteractive();
        zone.on('pointerdown', () => this.openLab(st.k));
        return { c, icon, lock, st };
      });
    }

    renderResearch() {
      if (!this.rsSigns) return;
      this.rsSigns.forEach((r) => {
        const open = this.groupOpen(r.st.g);
        r.c.setAlpha(open ? 1 : 0.5);
        r.icon.setVisible(open);
        r.lock.setText(open ? '' : '?');
      });
    }

    // 共用的實驗室視窗：外框固定，內容每次打開時重建
    buildLab() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfafafa);
      this.rxTitle = txt(this, 640, 98, '', 28, '#00695c', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rxSay = txt(this, 640, 148, '', 28, '#27384a', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
      this.rxZh = txt(this, 640, 186, '', 19, '#6b7c8c').setOrigin(0.5);
      this.rxMsg = txt(this, 640, 615, '', 21, '#33691e', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rxContent = this.add.container(0, 0);
      c.add([this.rxTitle, this.rxSay, this.rxZh, this.rxMsg, this.rxContent]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.rxBox = c;
    }

    // 加進實驗室內容：新建的物件也要固定在畫面上（scrollFactor 0），點擊才會對
    rx(o) { const fix = (x) => { if (x.setScrollFactor) x.setScrollFactor(0); if (x.list) x.list.forEach(fix); }; fix(o); this.rxContent.add(o); return o; }
    rxButton(x, y, w, h, color, label, size, fn) { return this.rx(makeButton(this, x, y, w, h, color, label, size, fn)); }
    rxCard(x, y, w, h, draw, fn) {
      const card = this.add.container(x, y);
      const bg = this.add.graphics(); bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
      bg.lineStyle(4, 0xb2dfdb, 1); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      card.add(bg);
      draw(card);
      card.setSize(w, h).setInteractive({ useHandCursor: true });
      card.on('pointerdown', fn);
      this.rx(card);
      card.bg = bg; card.x0 = x;
      return card;
    }
    rxShake(o) { this.tweens.add({ targets: o, x: o.x0 + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => o.setX(o.x0) }); }
    rxSet(say, zh, msg) { this.rxSay.setText(say); this.rxZh.setText(this.subs() ? zh : ''); if (msg !== undefined) this.rxMsg.setText(msg); }

    openLab(k) {
      if (this.paused()) return;
      const st = RLABS.find((x) => x.k === k);
      if (!this.groupOpen(st.g)) { this.floatText(ROFF + st.x - this.cameras.main.scrollX, 360, this.groupNeed(st.g), '#37474f', true); return; }
      this.held = null; this.tool = null; this.redrawTools();
      this.modal = 'lab';
      this.labKind = k;
      this.rxContent.removeAll(true);
      this.rxMsg.setText('');
      this.rxTitle.setText(st.en + ' ' + st.zh);
      this.rxBox.setVisible(true);
      this['lab_' + k]();
    }

    labDone(key, msg) {
      this.stationDone(key, 3, msg);
      const k = this.labKind;
      this.time.delayedCall(BOT ? 30 : 1800, () => { if (this.modal === 'lab' && this.labKind === k) this.openLab(k); });
    }

    // --- 水循環（§4.19）：加熱面放太陽下、冷凝板放高處陰涼、集水槽放冷凝板下面 ---
    lab_water() {
      const q = this.xq = { place: {}, sel: null, tested: false, done: false };
      ['sun', 'cloud', 'rain', 'steam'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.rxSet('Make rain! Put the parts in the right places.', '做出雨：把三個零件放到對的位置', 'Tap a part, then a place. 先點零件，再點位置');
      const scene = this.add.graphics();
      scene.fillStyle(0xfff59d, 1); scene.fillCircle(330, 250, 28);
      scene.fillStyle(0x78909c, 0.25); scene.fillRect(700, 225, 200, 130);
      scene.fillStyle(0x8d6e63, 1); scene.fillRect(260, 520, 700, 10);
      this.rx(scene);
      this.rx(txt(this, 330, 360, 'sunny 晒得到太陽', 16, '#f57f17').setOrigin(0.5));
      this.rx(txt(this, 800, 240, 'high and shady 高處陰涼', 16, '#455a64').setOrigin(0.5));
      this.rx(txt(this, 800, 510, 'under 下方', 16, '#455a64').setOrigin(0.5));
      q.spotObjs = WC_SPOTS.map((sp) => this.rxCard(sp.x, sp.y, 130, 80, () => {}, () => this.waterSpot(sp.k)));
      q.partObjs = WC_PARTS.map((p, i) => this.rxCard(560, 260 + i * 100, 150, 80, (card) => {
        const g = this.add.graphics(); waterPart(g, p.k); card.add(g);
        card.add(txt(this, 0, 30, p.zh, 16, '#455a64').setOrigin(0.5));
      }, () => this.waterPart(p.k)));
      q.fx = this.rx(this.add.graphics());
      this.waterRender();
    }

    waterRender() {
      const q = this.xq;
      q.partObjs.forEach((o, i) => { const k = WC_PARTS[i].k; o.setAlpha(Object.values(q.place).includes(k) ? 0.35 : 1); o.bg.lineStyle(5, q.sel === k ? 0xff9800 : 0xb2dfdb, 1); o.bg.strokeRoundedRect(-75, -40, 150, 80, 18); });
      q.spotObjs.forEach((o, i) => {
        const k = q.place[WC_SPOTS[i].k];
        if (o.part) { o.part.destroy(); o.part = null; }
        if (k) { const g = this.add.graphics(); waterPart(g, k); g.setScrollFactor(0); o.add(g); o.part = g; }
      });
    }

    waterPart(k) {
      const q = this.xq;
      if (q.done || Object.values(q.place).includes(k)) return;
      q.sel = q.sel === k ? null : k;
      this.waterRender();
    }

    waterSpot(spot) {
      const q = this.xq;
      if (q.done) return;
      if (q.place[spot]) { delete q.place[spot]; q.fx.clear(); this.waterRender(); return; }
      if (!q.sel) return;
      q.place[spot] = q.sel; q.sel = null;
      this.waterRender();
      if (Object.keys(q.place).length === 3) this.waterTest();
    }

    waterTest() {
      const q = this.xq, p = q.place, fx = q.fx;
      const right = p.sun === 'heater' && p.high === 'cold' && p.under === 'cup';
      if (!q.tested) { this.stats.water.q += 1; if (right) this.stats.water.first += 1; q.tested = true; }
      fx.clear();
      // 線索：加熱面在太陽下才有水氣（上升的箭頭）
      const hs = WC_SPOTS.find((s2) => p[s2.k] === 'heater');
      if (hs.k === 'sun') { fx.lineStyle(4, 0x90caf9, 0.9); [-20, 0, 20].forEach((d) => { fx.lineBetween(hs.x + d, hs.y - 40, hs.x + d + 40, hs.y - 120); }); }
      if (right) {
        q.done = true;
        fx.fillStyle(0xeceff1, 1); fx.fillCircle(780, 330, 26); fx.fillCircle(812, 320, 30); fx.fillCircle(842, 332, 24);
        fx.lineStyle(4, 0x1e88e5, 1); [790, 810, 830].forEach((x) => fx.lineBetween(x, 360, x - 4, 420));
        this.rxSet('It rains into the cup!', '水氣上升、遇冷變成水滴，落進集水槽了！', 'Evaporate → condense → rain. 蒸發 → 凝結 → 降雨');
        speak('It rains into the cup!');
        this.labDone('water', 'Rain!');
        return;
      }
      let why;
      if (p.sun !== 'heater') why = 'No vapor. 加熱面要晒到太陽，水才會蒸發';
      else if (p.high !== 'cold') why = 'The vapor does not turn into water. 冷凝板要在高處、陰涼的地方';
      else why = 'The drops miss the cup. 集水槽要放在冷凝板下面';
      this.rxMsg.setText(why + '（點位置可以拿回零件）');
      speak('Try again.');
    }

    // --- 天氣圖與颱風（§4.25）：認出颱風符號，再選 2 件颱風前要做的事 ---
    lab_typhoon() {
      const q = this.xq = { step: 1, tries: 0, recorded: false, sel: {}, prepTries: 0, done: false, order: L.shuffle(['H', 'L', 'T']) };
      this.rxSet('Which one is a typhoon?', '天氣圖上哪一個是颱風？', '');
      q.cards = q.order.map((sym, i) => this.rxCard(470 + i * 170, 380, 140, 150, (card) => { const g = this.add.graphics(); mapSymbol(g, sym); card.add(g); }, () => this.pickSymbol(i)));
      this.time.delayedCall(200, () => speak('Which one is a typhoon?'));
    }

    pickSymbol(i) {
      const q = this.xq;
      if (q.step !== 1 || q.done) return;
      const right = q.order[i] === 'T';
      if (!q.recorded) { L.answer(this.s.words, 'typhoon', { day: this.s.day, options: 3, firstTry: right, peeked: false }); q.recorded = true; this.stats.typhoon.q += 1; if (right) this.stats.typhoon.first += 1; }
      if (!right) { this.rxShake(q.cards[i]); q.cards[i].setAlpha(0.35); this.rxMsg.setText(q.order[i] === 'H' ? 'H is high pressure. H 是高氣壓' : 'L is low pressure. L 是低氣壓'); return; }
      q.step = 2;
      this.rxContent.removeAll(true);
      this.rxSet('A typhoon is coming! Pick 2 things to do.', '颱風要來了！選 2 件該做的事', '');
      q.prep = L.shuffle(PREP.slice());
      q.pcards = q.prep.map((p, j) => this.rxCard(340 + j * 200, 380, 180, 170, (card) => {
        const g = this.add.graphics({ y: -20 }).setScale(1.3); prepIcon(g, p.k); card.add(g);
        card.add(txt(this, 0, 50, p.zh, 18, '#37474f', { fontStyle: 'bold', align: 'center', wordWrap: { width: 160 } }).setOrigin(0.5));
      }, () => this.pickPrep(j)));
      this.rxButton(640, 560, 200, 56, 0x00897b, 'Done 完成', 22, () => this.prepDone());
      speak('A typhoon is coming!');
    }

    pickPrep(j) {
      const q = this.xq;
      if (q.step !== 2 || q.done) return;
      const n = Object.values(q.sel).filter(Boolean).length;
      if (!q.sel[j] && n >= 2) return;
      q.sel[j] = !q.sel[j];
      const c = q.pcards[j];
      c.bg.lineStyle(6, q.sel[j] ? 0xff9800 : 0xb2dfdb, 1); c.bg.strokeRoundedRect(-90, -85, 180, 170, 18);
    }

    prepDone() {
      const q = this.xq;
      if (q.step !== 2 || q.done) return;
      const picked = q.prep.filter((p, j) => q.sel[j]);
      if (picked.length !== 2) { this.rxMsg.setText('Pick 2. 選 2 件'); return; }
      const ok = picked.every((p) => p.good);
      if (q.prepTries === 0) { this.stats.prep.q += 1; if (ok) this.stats.prep.first += 1; }
      q.prepTries += 1;
      if (!ok) { this.rxMsg.setText(picked.filter((p) => !p.good).map((p) => p.zh).join('、') + '：颱風天很危險，換一個'); speak('That is dangerous.'); return; }
      q.done = true;
      this.rxSet('Safe! The island is ready.', '準備好了，小島很安全！', '');
      speak('Safe! The island is ready.');
      this.labDone('typhoon', 'Ready!');
    }

    // --- 食物鏈（§4.20）：承載量模型，每天向平衡值靠近，不會滅絕 ---
    lab_food() {
      const sc = FOOD_CASES[Math.floor(Math.random() * FOOD_CASES.length)];
      const q = this.xq = { sc, eco: Object.assign({}, sc.start), tries: 0, done: false, order: L.shuffle(FOOD_ACTS.map((a, i) => i)), busy: false };
      this.rxSet(sc.say, sc.zh, '');
      q.board = this.rx(this.add.graphics());
      q.nums = ['grass', 'rabbit', 'fox'].map((k, i) => this.rx(txt(this, 520, 250 + i * 70, '', 26, '#27384a', { fontStyle: 'bold' }).setOrigin(0, 0.5)));
      q.icons = ['grass', 'rabbit', 'fox'].map((k, i) => { const g = this.add.graphics({ x: 330, y: 250 + i * 70 }); if (k === 'fox') foxIcon(g); else drawIcon(g, k); return this.rx(g); });
      q.dayT = this.rx(txt(this, 820, 220, '', 20, '#6b7c8c').setOrigin(0.5));
      q.cards = q.order.map((ai, j) => this.rxCard(340 + j * 200, 500, 180, 110, (card) => {
        card.add(txt(this, 0, 0, FOOD_ACTS[ai].zh, 20, '#37474f', { fontStyle: 'bold', align: 'center', wordWrap: { width: 160 } }).setOrigin(0.5));
      }, () => this.pickFood(j)));
      this.foodRender(null);
      this.time.delayedCall(200, () => speak(sc.say));
    }

    foodRender(prev) {
      const q = this.xq, e = q.eco;
      const arrow = (k) => (!prev ? '' : (e[k] > prev[k] ? '  ↑ 變多' : e[k] < prev[k] ? '  ↓ 變少' : '  － 穩定'));
      q.nums[0].setText('grass 草 ' + e.G + arrow('G'));
      q.nums[1].setText('rabbits 兔 ' + e.R + arrow('R'));
      q.nums[2].setText('foxes 狐 ' + e.F + arrow('F'));
      const b = q.board; b.clear();
      b.fillStyle(0xc5e1a5, 1); b.fillRoundedRect(270, 215, 560, 210, 18);
      b.fillStyle(0x7cb342, 1); b.fillRect(290, 235, Math.min(520, e.G * 8), 10);
    }

    pickFood(j) {
      const q = this.xq;
      if (q.done || q.busy) return;
      const ai = q.order[j], act = FOOD_ACTS[ai], right = q.sc.good.includes(act.k);
      if (q.tries === 0) { this.stats.food.q += 1; if (right) this.stats.food.first += 1; }
      if (!right) { q.tries += 1; this.rxShake(q.cards[j]); q.cards[j].setAlpha(0.35); }
      // 套用動作後模擬 5 天，讓玩家看到結果（就算選錯也會慢慢回到平衡，不會滅絕）
      q.busy = true;
      act.apply(q.eco);
      let day = 0;
      const tick = () => {
        const prev = Object.assign({}, q.eco);
        foodStep(q.eco); day += 1;
        q.dayT.setText('Day +' + day);
        this.foodRender(prev);
        if (day < 5) this.time.delayedCall(BOT ? 1 : 450, tick);
        else {
          q.busy = false;
          if (right) {
            q.done = true;
            this.rxSet('The island is in balance!', '草、兔子、狐狸都穩定下來了！', '');
            speak('The island is in balance!');
            this.labDone('food', 'Balance!');
          } else {
            this.rxMsg.setText(act.why + ' 再想想別的辦法');
            q.eco = Object.assign({}, q.sc.start);
            this.foodRender(null);
          }
        }
      };
      this.time.delayedCall(BOT ? 1 : 300, tick);
    }

    // --- 光合作用（§4.21）：一株蓋起來、一株晒太陽，預測哪株長得好 ---
    lab_photo() {
      const q = this.xq = { coverLeft: Math.random() < 0.5, tries: 0, done: false };
      this.rxSet('Which plant will grow well?', '一株蓋住、一株晒太陽，哪一株會長得好？', 'Make a guess, then wait 3 days. 先猜，再等 3 天看看');
      q.pots = [0, 1].map((i) => this.rxCard(500 + i * 280, 400, 220, 260, (card) => {
        const covered = (i === 0) === q.coverLeft;
        const g = this.add.graphics({ y: 60 }); drawPlant(g, 'bean', 0.45, false); card.add(g); card.plant = g;
        const pot = this.add.graphics(); pot.fillStyle(0xbf6c3a, 1); pot.fillRect(-36, 60, 72, 50); card.add(pot);
        if (covered) { const cov = this.add.graphics(); cov.fillStyle(0x37474f, 0.92); cov.fillRoundedRect(-60, -80, 120, 140, 16); card.add(cov); card.cov = cov; }
        else { const sun = this.add.graphics(); sun.fillStyle(0xffd54a, 1); sun.fillCircle(70, -90, 16); card.add(sun); }
        card.add(txt(this, 0, 122, covered ? '蓋起來' : '晒太陽', 18, '#37474f', { fontStyle: 'bold' }).setOrigin(0.5));
        card.covered = covered;
      }, () => this.pickPhoto(i)));
    }

    pickPhoto(i) {
      const q = this.xq;
      if (q.done) return;
      const c = q.pots[i], right = !c.covered;
      if (q.tries === 0) { this.stats.photo.q += 1; if (right) this.stats.photo.first += 1; }
      q.tries += 1;
      q.done = true;
      // 3 天後：晒太陽的長大變綠，蓋起來的又細又黃
      q.pots.forEach((p) => { if (p.cov) p.cov.setAlpha(0.15); drawPlant(p.plant, 'bean', p.covered ? 0.3 : 1, p.covered); });
      this.rxSet('3 days later...', '3 天後……', right ? 'Yes! Plants need light to make food. 植物要有光才能製造養分' : 'Look! The plant in the sun grows well. 晒太陽的那株長得好：植物要有光才能製造養分');
      speak(right ? 'Yes! Plants need light.' : 'Look! Plants need light.');
      this.labDone('photo', 'Sunlight!');
    }

    // --- 拼字（§4.24）：只出 180 個拼寫字裡、玩家看過的字；可以跳過 ---
    lab_spell() {
      const seenW = SPELL.filter((w) => (this.s.words[w] || {}).seen > 0);
      const pool = seenW.length >= 3 ? seenW : SPELL;
      const w = pool[Math.floor(Math.random() * pool.length)];
      const extra = 'abcdefghijklmnoprstuwy'.split('').filter((ch) => !w.includes(ch));
      const tiles = L.shuffle(w.split('').concat(L.shuffle(extra).slice(0, 2)));
      const q = this.xq = { w, tiles, used: {}, pos: 0, mistakes: 0, done: false };
      this.rxSet('Spell the word.', '拼出這個字：' + (zhOf(w) || ''), 'Tap the letters in order. 依序點字母；拼錯的會彈回去');
      const pic = this.add.graphics({ x: 640, y: 250 }).setScale(1.5); spellIcon(pic, w); this.rx(pic);
      q.slots = w.split('').map((ch, i) => this.rx(txt(this, 640 + (i - (w.length - 1) / 2) * 56, 350, '_', 44, '#27384a', { fontStyle: 'bold' }).setOrigin(0.5)));
      q.tileObjs = tiles.map((ch, i) => this.rxCard(640 + (i - (tiles.length - 1) / 2) * 76, 470, 64, 72, (card) => card.add(txt(this, 0, 0, ch, 34, '#00695c', { fontStyle: 'bold' }).setOrigin(0.5)), () => this.pickLetter(i)));
      this.rxButton(1000, 560, 150, 52, 0x90a4ae, 'Skip 跳過', 20, () => { if (!q.done) { q.done = true; this.openLab('spell'); } });
      this.rxButton(280, 560, 70, 52, 0x4fc3f7, '♪', 26, () => speak(w));
      this.time.delayedCall(200, () => speak(w));
    }

    pickLetter(i) {
      const q = this.xq;
      if (q.done || q.used[i]) return;
      const ch = q.tiles[i], c = q.tileObjs[i];
      if (ch !== q.w[q.pos]) { q.mistakes += 1; this.rxShake(c); return; }
      q.used[i] = true; c.setAlpha(0.3);
      q.slots[q.pos].setText(ch);
      q.pos += 1;
      if (q.pos < q.w.length) return;
      q.done = true;
      this.stats.spell.q += 1; if (!q.mistakes) this.stats.spell.first += 1;
      L.answer(this.s.words, q.w, { day: this.s.day, options: 26, firstTry: q.mistakes === 0, peeked: false });
      speak(q.w + '!');
      this.rxSet('Great spelling!', '拼對了！', '');
      this.labDone('spell', 'Great!');
    }

    // --- 音調（§4.22）：短的管子聲音高（叫小鳥）、長的管子聲音低（叫牛） ---
    lab_pitch() {
      const target = Math.random() < 0.5 ? 'bird' : 'cow';
      const q = this.xq = { target, need: target === 'bird' ? 'high' : 'low', tries: 0, done: false, order: L.shuffle(['high', 'low']) };
      ['high', 'low'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.rxSet('Call the ' + target + '! Pick a pipe.', '吹哪一根管子能叫來' + ANIMALS[target].zh + '？（小鳥喜歡高音，牛喜歡低音）', '');
      const pic = this.add.graphics({ x: 640, y: 250 }).setScale(1.5); drawIcon(pic, target); this.rx(pic);
      q.cards = q.order.map((p, i) => this.rxCard(520 + i * 240, 440, 200, 200, (card) => {
        const g = this.add.graphics(); const len = p === 'high' ? 50 : 130;
        g.fillStyle(0x8d6e63, 1); g.fillRoundedRect(-14, 60 - len, 28, len, 8); g.fillStyle(0x3e2723, 1); g.fillCircle(0, 70 - len, 5);
        card.add(g); card.add(txt(this, 0, 80, p === 'high' ? '短管子' : '長管子', 18, '#37474f', { fontStyle: 'bold' }).setOrigin(0.5));
      }, () => this.pickPipe(i)));
      this.time.delayedCall(200, () => speak('Call the ' + target + '!'));
    }

    pickPipe(i) {
      const q = this.xq;
      if (q.done) return;
      const p = q.order[i], right = p === q.need;
      if (q.tries === 0) { this.stats.pitch.q += 1; if (right) this.stats.pitch.first += 1; }
      speak(p === 'high' ? 'Toot!' : 'Boooo!');
      if (!right) { q.tries += 1; this.rxShake(q.cards[i]); this.rxMsg.setText((p === 'high' ? 'That is a high sound. 那是高音' : 'That is a low sound. 那是低音') + '，' + ANIMALS[q.target].zh + '沒有來'); return; }
      q.done = true;
      this.rxSet('Here comes the ' + q.target + '!', ANIMALS[q.target].zh + '來了！', p === 'high' ? 'Short pipe → high sound. 管子短，聲音高' : 'Long pipe → low sound. 管子長，聲音低');
      this.labDone('pitch', 'Hello!');
    }

    // --- 化石與地層（§4.23）：越下面的地層越古老，從最古老排到最新 ---
    lab_fossil() {
      const q = this.xq = { picks: [], checks: 0, done: false };
      ['fossil', 'rock'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      this.rxSet('Tap the layers from oldest to newest.', '從最古老的地層，點到最新的地層', 'Which layer is the oldest? 哪一層最古老？');
      q.layers = [0, 1, 2].map((i) => {
        const y = 270 + i * 95;   // i=0 最上面（最新），i=2 最下面（最古老）
        return this.rxCard(560, y, 520, 90, (card) => {
          const g = this.add.graphics(); g.fillStyle([0xd7ccc8, 0xbcaaa4, 0x8d6e63][i], 1); g.fillRect(-256, -41, 512, 82);
          fossilIcon(g, i); card.add(g);
          card.num = txt(this, 220, 0, '', 34, '#ffffff', { fontStyle: 'bold', stroke: '#3e2723', strokeThickness: 5 }).setOrigin(0.5); card.add(card.num);
        }, () => this.pickLayer(i));
      });
      this.rxButton(960, 560, 160, 52, 0x8d6e63, 'Check 檢查', 20, () => this.checkLayers());
    }

    pickLayer(i) {
      const q = this.xq;
      if (q.done) return;
      const at = q.picks.indexOf(i);
      if (at >= 0) q.picks.splice(at, 1); else if (q.picks.length < 3) q.picks.push(i);
      q.layers.forEach((l, j) => { const n = q.picks.indexOf(j); l.num.setText(n >= 0 ? String(n + 1) : ''); });
    }

    checkLayers() {
      const q = this.xq;
      if (q.done || q.picks.length < 3) return;
      const right = q.picks.join() === '2,1,0';
      if (q.checks === 0) { this.stats.fossil.q += 1; if (right) this.stats.fossil.first += 1; }
      q.checks += 1;
      if (!right) { this.rxMsg.setText('Hint: the bottom layer is the oldest. 提示：越下面的地層越早形成'); q.picks = []; q.layers.forEach((l) => l.num.setText('')); speak('Try again.'); return; }
      q.done = true;
      this.rxSet('Right! The bottom layer is the oldest.', '對了！越下面的地層越古老', '');
      speak('Right! The bottom layer is the oldest.');
      this.labDone('fossil', 'Great!');
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
      if (this.navC) this.checkCave();
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
      this.renderResearch();
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
      if (this.modal === 'lab') {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        const q = this.xq, R = (n) => Math.floor(Math.random() * n);
        if (!q || q.done) return;
        const k = this.labKind;
        if (k === 'water') { if (Math.random() < 0.5) this.waterPart(WC_PARTS[R(3)].k); else this.waterSpot(WC_SPOTS[R(3)].k); }
        else if (k === 'typhoon') { if (q.step === 1) this.pickSymbol(R(3)); else if (Math.random() < 0.7) this.pickPrep(R(4)); else this.prepDone(); }
        else if (k === 'food') this.pickFood(R(4));
        else if (k === 'photo') this.pickPhoto(R(2));
        else if (k === 'spell') this.pickLetter(R(q.tiles.length));
        else if (k === 'pitch') this.pickPipe(R(2));
        else { if (Math.random() < 0.75) this.pickLayer(R(3)); else this.checkLayers(); }
        return;
      }
      if (this.modal === 'drill') {
        const q = this.dr;
        if (q.done || Math.random() < 0.02) { this.closeModal(); return; }
        if (q.part === 'bag') { if (Math.random() < 0.8) this.toggleBag(Math.floor(Math.random() * 8)); else this.packBag(); }
        else this.pickDrill(Math.floor(Math.random() * 3));
        return;
      }
      if (this.modal === 'recycle') {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        if (this.rq.mode === 'sort') this.sortTrash(Math.floor(Math.random() * 3)); else this.pickPolluter(Math.floor(Math.random() * 3));
        return;
      }
      if (['circuit', 'music', 'fog'].includes(this.modal)) {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        const r = Math.random();
        if (this.modal === 'circuit') { if (r < 0.35) this.pickPart(CIRC_PARTS[Math.floor(Math.random() * 4)]); else if (r < 0.7) this.tapGap(Math.floor(Math.random() * 2)); else if (r < 0.9) this.toggleSwitch(); else this.checkCircuit(); }
        else if (this.modal === 'music') { if (r < 0.6) this.playInstr(Math.floor(Math.random() * 4)); else this.fixInstr(Math.floor(Math.random() * 4)); }
        else this.fogMove(FOG_DIRS[Math.floor(Math.random() * 3)]);
        return;
      }
      if (['light', 'moon', 'push'].includes(this.modal)) {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        if (this.modal === 'light') this.moveLamp(LIGHT_DIRS[Math.floor(Math.random() * 4)]);
        else if (this.modal === 'moon') { if (Math.random() < 0.7) this.placeMoon(Math.floor(Math.random() * 4)); else if (Math.random() < 0.5) this.unplaceMoon(1 + Math.floor(Math.random() * 4)); else this.checkMoon(); }
        else this.pickPush(Math.floor(Math.random() * 4));
        return;
      }
      if (['tea', 'acid', 'magnet', 'dig'].includes(this.modal)) {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        const r = Math.random();
        if (this.modal === 'tea') { if (r < 0.35) this.pourTea(r < 0.175 ? 'hot' : 'cold'); else if (r < 0.7) this.stirTea(); else this.serveTea(); }
        else if (this.modal === 'acid') { if (r < 0.3) this.dropAcid(); else this.sortAcid(Math.floor(Math.random() * 3)); }
        else if (this.modal === 'magnet') { if (r < 0.35) this.pickMag(Math.floor(Math.random() * 5)); else if (r < 0.85) this.sortMag(Math.random() < 0.5); else this.checkMag(); }
        else this.sortDig(Math.floor(Math.random() * 3));
        return;
      }
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
      if (this.zone === 'research') {
        RLABS.forEach((b) => acts.push(() => this.openLab(b.k)));
        acts.push(() => this.goZone('forest'));
      } else if (this.zone === 'lighthouse') {
        LIGHTHOUSE.forEach((b) => acts.push(() => this.openLighthouse(b.k)));
        acts.push(() => this.goZone('cave'));
      } else if (this.zone === 'cave') {
        CAVE.forEach((b) => acts.push(() => this.openCave(b.k)));
        acts.push(() => this.goZone('beach'));
        acts.push(() => this.goZone('lighthouse'));
      } else if (this.zone === 'beach') {
        BEACH.forEach((b) => acts.push(() => this.openStation(b.k)));
        acts.push(() => this.goZone('meadow'));
        acts.push(() => this.goZone('cave'));
      } else if (this.zone === 'meadow') {
        acts.push(() => this.goZone('beach'));
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
        acts.push(() => this.goZone('research'));
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
        甜茶第一次選熱水: pct(this.stats.tea),
        酸甜苦第一次就對: pct(this.stats.acid),
        磁鐵猜對的件數: pct(this.stats.magnet),
        土石第一次就對: pct(this.stats.dig),
        燈的方向第一次就對: pct(this.stats.light),
        月相第一次排對: pct(this.stats.moon),
        推拉第一次就對: pct(this.stats.push),
        電路缺口第一次放導體: pct(this.stats.circuit),
        樂器第一次就修對: pct(this.stats.music),
        霧中每步第一次走對: pct(this.stats.fog),
        防災包第一次全對: pct(this.stats.bag),
        演練口令第一次就對: pct(this.stats.drill),
        回收分類第一次就對: pct(this.stats.recycle),
        汙染源第一次就對: pct(this.stats.pond),
        水循環第一次放對: pct(this.stats.water),
        颱風符號第一次就對: pct(this.stats.typhoon),
        颱風準備第一次全對: pct(this.stats.prep),
        食物鏈第一次選對: pct(this.stats.food),
        光合作用預測對: pct(this.stats.photo),
        拼字零失誤: pct(this.stats.spell),
        音調第一次就對: pct(this.stats.pitch),
        地層第一次排對: pct(this.stats.fossil),
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
      this.dayText.setText('Day ' + s.day + '  ' + weekday(s.day) + (this.isDrillDay() ? '  Drill Day' : ''));

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
