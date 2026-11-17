/* 浮島日記 Floating Isle Diary — M2 核心修正：鏟子、選取交付、ok 與排程器、天氣圖示、日記、教學改檢查完成
 * 全部美術以程式繪製，語音暫用瀏覽器內建 speechSynthesis（正式版改為預錄音檔）。
 * 單字紀錄、排程器、選項與日記句子在 logic.js（與 Node 模擬共用）。
 * 偵錯：?fast=1 為 4 倍速（也可 ?fast=20）、?reset=1 清除存檔、?bot=1 亂點機器人（忽略測試，用另一個存檔）。 */
(() => {
  const W = 1280, H = 720;
  const FONT = '"Huninn","Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif';
  // 英文用 Andika：識字教學字型，a、g 是手寫形狀，I、l、1 好分辨
  const FONT_EN = '"Andika","Huninn","Segoe UI",sans-serif';
  // 手帳貼紙風（DESIGN：PRODUCT.md、.impeccable/briefs/market.md）
  const INK = 0x2b3a55;             // 墨線
  const PAPER = 0xfbf6ea;           // 手帳內頁
  // 貼紙素材（tools/art/stickers.js 產生，放在 game/art/）
  const ART_KEYS = window.ART_KEYS || [];   // game/art/index.js（tools/art/stickers.js 產生）
  const fruitArt = (item, color) => 'st-' + (item === 'banana' ? 'banana' : item + '-' + color);
  const params = new URLSearchParams(location.search);
  const FAST = Number(params.get('fast')) || 0;
  const SPEED = FAST > 1 ? FAST : (FAST ? 4 : 1);
  const BOT = !!params.get('bot');
  // ?mute=1 測試時完全不出聲（不改存檔裡的聲音設定）
  const MUTE = !!params.get('mute');
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
    // 以下用星砂買種子（price）才能種
    corn:   { need: 0.6, secs: 120, part: 'seed',  partZh: '種子', art: 'some corn', price: 20, fact: '我們吃的玉米粒是它的「種子」，一株玉米需要很多陽光。' },
    potato: { need: 0.4, secs: 100, part: 'stem',  partZh: '莖',   art: 'a potato',  price: 35, fact: '馬鈴薯長在土裡，但我們吃的是它的「莖」（塊莖），不是根喔。' },
    grape:  { need: 0.7, secs: 140, part: 'fruit', partZh: '果實', art: 'a grape',   price: 50, fact: '葡萄是它的「果實」，長在會攀爬的藤蔓上。' },
  };
  const PLANT_KEYS = Object.keys(PLANTS);

  // 池塘森林的動物（§4.5、§4.6）：home 要蓋的棲地、clue 句子裡決定棲地的關鍵字（記在這個字的 ok/miss）、
  // sound 叫聲（畫面上同時顯示文字，靜音也能玩）、hint 聽錯時的提示、likes 住下來後會想要的東西
  const ANIMALS = {
    frog:   { zh: '青蛙', home: 'pond',  clue: 'water', say: 'I like water.',     sayZh: '我喜歡水。',   sound: 'Ribbit!',  hint: 'It lives in a pond.', likes: ['rose'],           fact: '青蛙小時候是住在水裡的蝌蚪，長大後住在池塘邊。' },
    duck:   { zh: '鴨子', home: 'pond',  clue: 'swim',  say: 'I can swim.',       sayZh: '我會游泳。',   sound: 'Quack!',   hint: 'It lives in a pond.', likes: ['bean', 'rose', 'corn'], fact: '鴨子的腳有蹼，像槳一樣幫牠划水。' },
    fish:   { zh: '魚',   home: 'pond',  clue: 'water', say: 'I live in water.',  sayZh: '我住在水裡。', sound: null,       hint: '',                    likes: [],                 fact: '魚用鰓呼吸水裡的氧氣，離開水就不能活。' },
    bird:   { zh: '鳥',   home: 'tree',  clue: 'tree',  say: 'I live in a tree.', sayZh: '我住在樹上。', sound: 'Tweet!',   hint: 'It lives in a tree.', likes: ['bean', 'corn', 'grape'], fact: '鳥有翅膀和羽毛，常在樹上用樹枝築巢。' },
    monkey: { zh: '猴子', home: 'tree',  clue: 'climb', say: 'I can climb.',      sayZh: '我會爬樹。',   sound: 'Ooh ooh ah ah!', hint: 'It lives in a tree.', likes: ['bean', 'carrot', 'grape'], fact: '猴子的手腳都能抓握，很適合在樹上爬來爬去。' },
    cow:    { zh: '牛',   home: 'grass', clue: 'grass', say: 'I eat grass.',      sayZh: '我吃草。',     sound: 'Moo!',     hint: 'It eats grass.',      likes: ['carrot', 'bean', 'corn', 'potato'], fact: '牛吃草，會把吞下去的草再吐回嘴裡慢慢嚼。' },
    horse:  { zh: '馬',   home: 'grass', clue: 'grass', say: 'I like grass.',     sayZh: '我喜歡草。',   sound: 'Neigh!',   hint: 'It eats grass.',      likes: ['carrot', 'corn'], fact: '馬吃草，腿又長又有力，可以跑得很快。' },
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
  const STATION_PAID = 5;   // 所有實驗站合計，每天前幾回合給星砂（經濟調整：原本每站各 2 回合 ×3，18 站全開後一天可拿 108）
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
  const CAVE_LIB = 20;     // §5：圖鑑 20 項（圖鑑擴充到 23 項後改回原定值）
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
  const LIGHT_NEED = 3;     // 修好幾個設施後開放燈塔（§5）
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
  // 長期經營的生態園：現在的數量對應哪一種情況（FOOD_CASES 的索引），-1 表示平衡
  function ecoProblem(e) {
    const rt = Math.max(1, Math.floor(e.G / 10));
    if (e.R >= rt + 3) return 0;
    const ft = Math.max(1, Math.floor(e.R / 4));
    if (e.F >= ft + 2) return 1;
    return -1;
  }
  const ECO_MAX_A = 6;   // 草地最多擴到 6 塊
  const ECO_EVENTS = [
    { k: 'rabbits', zh: '外地的兔子跑來了', apply: (e) => { e.R += 6; } },
    { k: 'foxes',   zh: '山上的狐狸搬來了', apply: (e) => { e.F += 3; } },
  ];
  // 拼字（§4.24）：180 個拼寫字裡、遊戲中有圖可畫的字
  const SPELL = ['bean', 'sunny', 'cloudy', 'rainy', 'windy', 'fish', 'bird', 'apple', 'grape', 'banana', 'hat', 'coat', 'rock', 'mud', 'moon', 'star', 'bell', 'drum', 'paper', 'bottle', 'water', 'tree', 'grass', 'lamp', 'box', 'rain'];

  // 家長端的課綱清單：keys 是 touch() 記錄的機制
  const CURRICULUM = [
    { name: '植物生長與部位', codes: 'INb-Ⅱ-6、INa-Ⅱ-7、INe-Ⅱ-11', keys: ['plant'] },
    { name: '天氣與觀測', codes: 'INd-Ⅱ-4、INd-Ⅱ-6、INd-Ⅱ-7', keys: ['weather'] },
    { name: '衣物與天氣', codes: 'INf-Ⅱ-4', keys: ['clothes'] },
    { name: '動物與棲地', codes: 'INc-Ⅱ-8、INb-Ⅱ-5、INb-Ⅱ-7', keys: ['habitat', 'classify'] },
    { name: '聲音與振動', codes: 'INe-Ⅱ-5、INe-Ⅱ-10', keys: ['sound', 'music', 'fog'] },
    { name: '溶解與溫度', codes: 'INe-Ⅱ-2、INe-Ⅱ-3', keys: ['tea'] },
    { name: '酸鹼與變色', codes: 'INe-Ⅱ-4', keys: ['acid'] },
    { name: '光與方位', codes: 'INe-Ⅱ-6、INa-Ⅱ-6', keys: ['light'] },
    { name: '月亮盈虧', codes: 'INc-Ⅱ-10、INc-Ⅱ-7', keys: ['moon'] },
    { name: '磁鐵', codes: 'INe-Ⅱ-7', keys: ['magnet'] },
    { name: '電路與導體', codes: 'INe-Ⅱ-8、INe-Ⅱ-9', keys: ['circuit'] },
    { name: '力與運動', codes: 'INc-Ⅱ-3、INd-Ⅱ-8', keys: ['push'] },
    { name: '岩石砂土', codes: 'INc-Ⅱ-9、INd-Ⅱ-5', keys: ['dig'] },
    { name: '地震防災', codes: 'INf-Ⅱ-6', keys: ['drill'] },
    { name: '環境與回收', codes: 'INf-Ⅱ-5、INf-Ⅱ-7、INg-Ⅱ-1～3', keys: ['recycle'] },
    { name: '水循環', codes: 'INd-Ⅲ-11、INd-Ⅲ-12、INc-Ⅲ-12', keys: ['water'] },
    { name: '天氣圖與颱風', codes: 'INd-Ⅲ-7、INf-Ⅲ-5', keys: ['typhoon'] },
    { name: '食物鏈', codes: 'INa-Ⅲ-10、INc-Ⅲ-9、INe-Ⅲ-12', keys: ['food'] },
    { name: '光合作用', codes: 'INa-Ⅲ-9', keys: ['photo'] },
    { name: '音調', codes: 'INe-Ⅲ-6', keys: ['pitch'] },
    { name: '化石與地層', codes: 'INc-Ⅲ-11、INd-Ⅲ-8～10', keys: ['fossil'] },
    { name: '英語：生活對話（市集、日曆）', codes: '英語 B-Ⅱ-1、C-Ⅱ-2、D-Ⅱ-1', keys: ['market', 'calendar'] },
    { name: '英語：家人、地點、節慶、職業、學校用品、月份', codes: '英語 B-Ⅱ-1、C-Ⅱ-2', keys: ['family', 'way', 'festival', 'job', 'school', 'month'] },
    { name: '英語：顏色、食物、季節、數字、動物、身體', codes: '英語 B-Ⅱ-1', keys: ['color', 'meal', 'season', 'count', 'zoo', 'body'] },
    { name: '英語：動作、感覺、時段、地點、物品', codes: '英語 B-Ⅱ-1', keys: ['act', 'feel', 'time', 'spot', 'thing'] },
    { name: '英語：句子回顧（日記）', codes: '英語 Ae-Ⅲ-12、B-Ⅲ-1、Ad-Ⅲ-11', keys: ['diary'] },
    { name: '英語：拼寫', codes: '英語 4-Ⅲ-3、Ac-Ⅲ-9', keys: ['spell'] },
  ];

  // 設施（§3.4「星砂換設施」；§5 燈塔解鎖＝修好 3 個設施）。修理要選對材料（物質類單字），修好有小好處
  const MATERIALS = ['wood', 'stone', 'metal', 'glass'];
  const FAC = {
    well:   { zone: 'meadow', x: 1150,        y: 560, w: 110, en: 'well',   zh: '水井', price: 30, mat: 'stone', perk: '澆一次水的量變多' },
    bridge: { zone: 'forest', x: OFF + 640,   y: 405, w: 150, en: 'bridge', zh: '小橋', price: 40, mat: 'wood',  perk: '森林的訪客來得比較快' },
    dock:   { zone: 'beach',  x: BOFF + 1200, y: 575, w: 100, en: 'dock',   zh: '碼頭', price: 50, mat: 'wood',  perk: '市集每天多 1 單給星砂' },
    stairs: { zone: 'cave',   x: COFF + 1150, y: 545, w: 110, en: 'stairs', zh: '樓梯', price: 60, mat: 'stone', perk: '燈塔就在前面' },
  };
  const FAC_KEYS = Object.keys(FAC);

  // 裝飾（遊戲企劃「圖鑑完成度換取外觀和家具」）：圖鑑達到 lib 項才能買，擺在草地固定位置，只是好看
  const DECOR = [
    { k: 'flowerbed', zh: '花圃',   en: 'flowers',  lib: 8,  price: 20, x: 320,  y: 594 },
    { k: 'fence',     zh: '籬笆',   en: 'fence',    lib: 10, price: 25, x: 600,  y: 392 },
    { k: 'bench',     zh: '長椅',   en: 'bench',    lib: 14, price: 35, x: 880,  y: 600 },
    { k: 'lamppost',  zh: '路燈',   en: 'lamp',     lib: 17, price: 45, x: 330,  y: 470 },
    { k: 'flag',      zh: '旗子',   en: 'flag',     lib: 20, price: 55, x: 870,  y: 430 },
    { k: 'fountain',  zh: '噴水池', en: 'fountain', lib: 23, price: 80, x: 190,  y: 582 },
  ];

  // 指路（§4.17）：市集的第三種訂單 Where is the zoo?，十字路口四個方向各有一個地點
  const PLACES = ['zoo', 'park', 'library', 'hospital', 'school', 'store'];
  // 市集的「找人／找東西」訂單（§4.17）：和指路共用 4 張圖卡，ok 記在問的那個字（4 選 1）
  const JOBS = ['doctor', 'nurse', 'police', 'driver', 'teacher', 'farmer', 'cook', 'student'];
  const SCHOOL = ['book', 'pen', 'pencil', 'ruler', 'eraser', 'bag', 'desk', 'chair'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const BALLOON = { red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, yellow: 0xfdd835, orange: 0xfb8c00, purple: 0x8e24aa, pink: 0xf48fb1, black: 0x212121, white: 0xffffff, brown: 0x6d4c41, gray: 0x9e9e9e };
  const FOODS = ['lemon', 'rice', 'bread', 'egg', 'milk', 'soup'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const COUNT = ['six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const ZOO = ['dog', 'pig', 'chicken', 'elephant', 'lion', 'tiger', 'bear', 'panda', 'snake', 'deer', 'dolphin', 'whale'];
  const BODY = ['head', 'eye', 'ear', 'nose', 'mouth', 'arm', 'hand', 'leg', 'foot'];
  const ACTS = { run: 'running', walk: 'walking', jump: 'jumping', sit: 'sitting', stand: 'standing', sleep: 'sleeping', read: 'reading', write: 'writing', sing: 'singing', dance: 'dancing', wash: 'washing', drink: 'drinking', kick: 'kicking', throw: 'throwing' };
  const FEELS = ['happy', 'sad', 'tired', 'thirsty', 'hungry'];
  const DAYTIME = ['morning', 'afternoon', 'evening', 'night'];
  const SPOTS = ['lake', 'sea', 'mountain', 'road', 'kitchen', 'bedroom', 'classroom', 'farm'];
  const THINGS = ['robot', 'clock', 'fan', 'computer', 'bike', 'ball', 'rope', 'flute', 'mirror', 'shirt', 'pants', 'dress'];
  const PICK_ORDERS = {
    way:    { list: PLACES, draw: (g, k) => drawPlace(g, k), say: (k) => 'Where is the ' + k + '?', zh: (k) => zhOf(k) + '在哪裡？', thanks: (k) => 'This is the ' + k + '. Thank you!' },
    job:    { list: JOBS, draw: (g, k) => drawJob(g, k), say: (k) => 'Who is the ' + (k === 'police' ? 'police officer' : k) + '?', zh: (k) => '哪一位是' + zhOf(k) + '？', thanks: () => 'Thank you for your help!' },
    school: { list: SCHOOL, draw: (g, k) => drawSchool(g, k), say: (k) => 'I need ' + (k === 'eraser' ? 'an ' : 'a ') + k + ' for school.', zh: (k) => '上學要用' + zhOf(k) + '，是哪一個？', thanks: () => 'Thank you! I am ready for school.' },
    color:  { list: Object.keys(BALLOON), art: (k) => 'balloon-' + k, draw: (g, k) => drawBalloon(g, k), say: (k) => 'Which balloon is ' + k + '?', zh: (k) => '哪一顆氣球是' + zhOf(k) + '？', thanks: (k) => 'Yes, it is ' + k + '. Thank you!' },
    meal:   { list: FOODS, draw: (g, k) => drawFood(g, k), say: (k) => 'Can I have the ' + k + ', please?', zh: (k) => '可以給我' + zhOf(k) + '嗎？', thanks: () => 'Yummy! Thank you!' },
    season: { list: SEASONS, draw: (g, k) => drawSeason(g, k), say: (k) => 'Which one is ' + k + '?', zh: (k) => '哪一張是' + zhOf(k) + '？', thanks: (k) => 'I like ' + k + '! Thank you!' },
    count:  { list: COUNT, art: (k) => 'stars-' + (COUNT.indexOf(k) + 6), draw: (g, k) => drawStars(g, COUNT.indexOf(k) + 6), say: (k) => 'Find ' + k + ' stars.', zh: (k) => '找出 ' + (COUNT.indexOf(k) + 6) + ' 顆星星', thanks: (k) => cap(k) + ' stars. Thank you!' },
    zoo:    { list: ZOO, draw: (g, k) => drawZoo(g, k), say: (k) => 'Where is the ' + k + '?', zh: (k) => zhOf(k) + '在哪裡？', thanks: (k) => 'I see the ' + k + '! Thank you!' },
    body:   { list: BODY, art: (k) => 'body-' + k, draw: (g, k) => drawBody(g, k), say: (k) => 'Point to the ' + k + '.', zh: (k) => '指出' + zhOf(k) + '。', thanks: () => 'Good job!' },
    act:    { list: Object.keys(ACTS), art: (k) => 'act-' + k, draw: (g, k) => drawAct(g, k), say: (k) => 'Who is ' + ACTS[k] + '?', zh: (k) => '誰在' + zhOf(k) + '？', thanks: () => 'Yes! Thank you!' },
    feel:   { list: FEELS, art: (k) => 'feel-' + k, draw: (g, k) => drawFeel(g, k), say: (k) => 'Who is ' + k + '?', zh: (k) => '誰覺得' + zhOf(k) + '？', thanks: () => 'Yes! Thank you!' },
    time:   { list: DAYTIME, draw: (g, k) => drawDaytime(g, k), say: (k) => 'Which one is ' + (k === 'night' ? 'night' : 'the ' + k) + '?', zh: (k) => '哪一張是' + zhOf(k) + '？', thanks: () => 'Yes! Thank you!' },
    spot:   { list: SPOTS, draw: (g, k) => drawSpot(g, k), say: (k) => 'Which one is the ' + k + '?', zh: (k) => '哪一張是' + zhOf(k) + '？', thanks: () => 'Yes! Thank you!' },
    thing:  { list: THINGS, draw: (g, k) => drawThing(g, k), say: (k) => (k === 'pants' ? 'Where are the pants?' : 'Where is the ' + k + '?'), zh: (k) => zhOf(k) + '在哪裡？', thanks: () => 'There it is! Thank you!' },
    month:  { list: MONTHS, art: () => 'calendar', draw: (g) => drawMonth(g), label: (k) => cap(k), say: (k) => 'My birthday is in ' + cap(k) + '.', zh: (k) => '我的生日在' + zhOf(k) + '，是哪一頁？', thanks: (k) => 'Yes! ' + cap(k) + '. Thank you!' },
  };
  // 家人（§4.17）：每週六 Family Day，從 4 位家人裡選出問的那一位
  const FAMILY = ['grandfather', 'grandmother', 'father', 'mother', 'brother', 'sister', 'baby'];
  // 節慶（§4.17）：每 30 天一輪，第 10 天萬聖節、第 20 天兔子生日、第 30 天聖誕節
  const FESTIVALS = { 10: { k: 'Halloween', zh: '萬聖節', pic: 'pumpkin' }, 20: { k: 'birthday', zh: '生日', pic: 'cake' }, 0: { k: 'Christmas', zh: '聖誕節', pic: 'xtree' } };
  const festivalOf = (d) => FESTIVALS[d % 30] || null;

  // 各機制的延伸題（§4.7、4.9、4.12、4.13、4.14、4.15、4.22、4.23、4.25）：掛在原本的站，每 3 回合有 1 回合
  // 同一站有好幾種延伸題時（陣列），依序輪流
  const EXTRAS = {
    tea:     { lab: 'ice',     title: 'Ice 冰塊' },
    magnet:  { lab: 'poles',   title: 'Magnet Boat 磁鐵推船' },
    dig:     { lab: 'wall',    title: 'Rain Wall 擋牆' },
    light:   { lab: 'shadow',  title: 'Shadow 影子' },
    push:    { lab: 'mill',    title: 'Wind and Water 風車與水車' },
    circuit: { lab: 'series',  title: 'Two Lamps 兩盞燈' },
    pitch:   { lab: 'noise',   title: 'Noise 隔音牆' },
    fossil:  [{ lab: 'mineral', title: 'Minerals 礦物' }, { lab: 'levee', title: 'River Bend 河流彎道' }],
    typhoon: { lab: 'storm',   title: 'Typhoon Day 颱風天' },
  };

  // 地圖（主畫面）：6 座島左右的順序和實際位置一致（燈塔在最左、研究島在最右）
  const MAP = [
    { z: 'lighthouse', x: 170,  y: 430, en: 'Lighthouse', zh: '燈塔',     color: 0x9ccb86, icon: 'bulb' },
    { z: 'cave',       x: 370,  y: 320, en: 'Cave',       zh: '洞穴',     color: 0x9e98a8, icon: 'moon' },
    { z: 'beach',      x: 545,  y: 470, en: 'Beach',      zh: '海灘',     color: 0xf1dca6, icon: 'tea' },
    { z: 'meadow',     x: 735,  y: 320, en: 'Meadow',     zh: '草地',     color: 0x7ccb69, icon: 'carrot' },
    { z: 'forest',     x: 925,  y: 470, en: 'Pond Forest', zh: '池塘森林', color: 0x5aa64a, icon: 'frog' },
    { z: 'research',   x: 1110, y: 320, en: 'Research',   zh: '研究島',   color: 0x8fd3cc, icon: 'flask' },
  ];

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
    { k: 'corn',   en: 'corn',   zh: '玉米',   kind: 'plant' },
    { k: 'potato', en: 'potato', zh: '馬鈴薯', kind: 'plant' },
    { k: 'grape',  en: 'grape',  zh: '葡萄',   kind: 'plant' },
    { k: 'sunny',  en: 'sunny',  zh: '晴天',   kind: 'weather', fact: '晴天陽光充足，植物長得快，水也乾得快。' },
    { k: 'cloudy', en: 'cloudy', zh: '多雲',   kind: 'weather', fact: '多雲時陽光變少，需要很多陽光的植物會長得慢。' },
    { k: 'rainy',  en: 'rainy',  zh: '下雨',   kind: 'weather', fact: '下雨時植物會得到水，不用自己澆，但陽光很少。' },
    { k: 'windy',  en: 'windy',  zh: '有風',   kind: 'weather', fact: '空氣流動就會產生風，風會讓土壤的水分乾得更快。' },
  ];
  ANIMAL_KEYS.forEach((k) => LIB.push({ k, en: k, zh: ANIMALS[k].zh, kind: 'animal', fact: ANIMALS[k].fact }));
  // 特定條件才會出現的發現（遊戲企劃「稀有項需特定條件組合」）；hint 是還沒發現時的提示
  [
    { k: 'butterfly', en: 'butterfly', zh: '蝴蝶', kind: 'bug', fact: '蝴蝶用長長的口器吸花蜜，晴天花開的時候最常出現。', hint: '晴天的時候，看看開花的玫瑰' },
    { k: 'bee',       en: 'bee',       zh: '蜜蜂', kind: 'bug', fact: '蜜蜂在花和花之間飛，幫植物傳花粉，才會結出果實和種子。', hint: '玉米或葡萄長大的時候，看看它們附近' },
    { k: 'ant',       en: 'ant',       zh: '螞蟻', kind: 'bug', fact: '螞蟻會把找到的食物搬回巢裡，和同伴一起分享。', hint: '多雲的日子，看看長好的紅蘿蔔' },
    { k: 'rainbow',   en: 'rainbow',   zh: '彩虹', kind: 'sky', fact: '雨停後空氣裡有很多小水滴，陽光穿過水滴就會分出七種顏色。', hint: '下雨之後放晴的早上，看看天空' },
    { k: 'moon',      en: 'moon',      zh: '月亮', kind: 'thing', fact: '月亮自己不會發光，我們看到的是它反射的太陽光；每天看起來的形狀都不一樣。', hint: '去洞穴把月亮排排看' },
    { k: 'magnet',    en: 'magnet',    zh: '磁鐵', kind: 'thing', fact: '磁鐵會吸住鐵做的東西，但銅和鋁做的東西吸不住。', hint: '去海灘試試磁鐵' },
  ].forEach((e) => LIB.push(e));
  const LIB_PER_PAGE = 8;
  // 圖鑑篩選（遊戲企劃「動物外形與分類」）：依特徵篩選，自然形成分類活動。猴子用四肢攀爬，手腳不好分，不放進腳的分類
  const LIB_FILTERS = [
    { k: 'all',   en: 'All',          zh: '全部',     has: () => true },
    { k: 'fly',   en: 'It can fly.',  zh: '會飛',     list: ['bird', 'duck', 'butterfly', 'bee'] },
    { k: 'swim',  en: 'It can swim.', zh: '會游泳',   list: ['frog', 'duck', 'fish'] },
    { k: 'six',   en: 'Six legs',     zh: '6 隻腳',   list: ['butterfly', 'bee', 'ant'] },
    { k: 'four',  en: 'Four legs',    zh: '4 隻腳',   list: ['frog', 'cow', 'horse'] },
    { k: 'two',   en: 'Two legs',     zh: '2 隻腳',   list: ['bird', 'duck'] },
    { k: 'zero',  en: 'No legs',      zh: '沒有腳',   list: ['fish'] },
    { k: 'plant', en: 'Plants',       zh: '植物',     has: (e) => e.kind === 'plant' },
    { k: 'sky',   en: 'Weather and sky', zh: '天氣和天空', has: (e) => e.kind === 'weather' || e.kind === 'sky' },
  ];

  // 工具列：種子袋（點了選種子、買種子）、澆水壺、鏟子；背包依作物順序排，只顯示有種子的作物
  const TOOL_KEYS = ['seeds', 'water', 'shovel'];
  const TOOL_X = { seeds: 100, water: 206, shovel: 312 };
  const BAG_X = { carrot: 470, bean: 562, rose: 654, corn: 746, potato: 838, grape: 930 };
  const START_SEEDS = ['carrot', 'bean', 'rose'];
  const MARKET_PAID = 2;    // 市集每天前幾單給星砂
  const STATION_REWARD = 2; // 實驗站一回合給的星砂
  const PLOT_X = [430, 600, 770];
  const PLOT_Y = [430, 550];
  const RABBIT = { x: 1020, y: 500 };
  const PIP = { x: 130, y: 500 };
  const TUT = ['seed', 'plant', 'water', 'grow', 'pick', 'give'];
  // §4.2 植物各部位：願望也可能是「要某個部位」，玩家要知道哪種作物是那個部位
  const PARTS = {
    root:   { zh: '根',   say: 'a root' },
    seed:   { zh: '種子', say: 'some seeds' },
    flower: { zh: '花',   say: 'a flower' },
    fruit:  { zh: '果實', say: 'a fruit' },
    stem:   { zh: '莖',   say: 'a stem' },
  };
  const wishSentence = (k) => 'I want ' + (PARTS[k] ? PARTS[k].say : PLANTS[k].art) + '.';
  // 這個物品能不能滿足這個願望：同一種作物，或是願望要的部位
  const wishMatches = (want, item) => want === item || (!!PARTS[want] && PLANTS[item] && PLANTS[item].part === want);

  // ---------- 存檔 ----------
  function emptyEvents() { return { planted: [], picked: [], gave: [], came: [], party: [] }; }
  function defaultState() {
    return {
      v: 2, day: 1, t: 0, weather: 'sunny', stardust: 0,
      inv: { carrot: 0, bean: 0, rose: 0, corn: 0, potato: 0, grape: 0 }, seeds: START_SEEDS.slice(),
      plots: Array.from({ length: 6 }, () => ({ plant: null, progress: 0, water: 0.3 })),
      words: {}, lib: { sunny: true }, tut: 0, done: {}, muted: false,
      wishes: {}, fwho: null, lastWish: null, sched: { n: 0 }, gaveTotal: 0,
      forestOpen: false, lots: LOT_X.map(() => ({ hab: null, animal: null })), lotsOpen: LOTS_START, visitor: null,
      town: false, party: null, lastInvite: 0,
      harvested: 0, beachOpen: false, caveOpen: false, caveDone: 0, lightOpen: false,
      bagReady: false, drillDay: 0, lightDone: 0, fixed: {}, crack: null, decor: {}, famDay: 0, festDay: 0,
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
    if (!s.seeds) s.seeds = START_SEEDS.slice();
    Object.keys(PLANTS).forEach((k) => { if (s.inv[k] == null) s.inv[k] = 0; });
    // M4 前沒有記錄收成次數：用背包裡的作物＋送出去的願望估計（寧可少算，不憑空給）。
    // 用 harvestedV 標記是否轉換過（新存檔的預設值 0 會讓「沒有這個欄位」的判斷失效）
    if (s.harvestedV !== 1) {
      const est = PLANT_KEYS.reduce((a, k) => a + (s.inv[k] || 0), 0) + (s.gaveTotal || 0);
      s.harvested = Math.max(s.harvested || 0, est);
      s.harvestedV = 1;
    }
    while (s.lots.length < LOT_X.length) s.lots.push({ hab: null, animal: null }); // 森林擴建前的存檔
    // 家長端的「接觸過的機制」：舊存檔從已有的資料推算（只算看得出來玩過的）
    if (!s.touched) {
      const t = s.touched = {};
      if ((s.harvested || 0) > 0 || (s.gaveTotal || 0) > 0) t.plant = 1;
      if ((s.askedDay || 0) > 0) t.weather = 1;
      if (s.lots && s.lots.some((l) => l.animal)) t.habitat = 1;
      if (s.diary && s.diary.length) t.diary = 1;
      if (s.party || (s.lastInvite || 0) > 0) t.calendar = 1;
      if ((s.drillDay || 0) > 0) t.drill = 1;
      if (s.paid) Object.keys(s.paid).forEach((k) => { if (k !== 'day' && k[0] !== '_') t[k] = 1; });
    }
    if (params.get('unlock')) { s.forestOpen = true; s.beachOpen = true; s.caveOpen = true; s.lightOpen = true; } // 偵錯：直接開放所有區域
    return s;
  }
  function saveState(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }

  // ---------- 語音（占位：之後換成 audio/xxx.mp3） ----------
  let muted = false;
  function speak(text) {
    if (muted || MUTE) return;
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
      fontFamily: FONT, fontSize: size + 'px', color: color || '#2b3a55', resolution: 2,
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
      case 'corn':
        g.fillStyle(0x7cb342, 1); g.fillTriangle(-4, 22, -18, -6, 0, 10); g.fillTriangle(4, 22, 18, -6, 0, 10);
        g.fillStyle(0xfdd835, 1); g.fillEllipse(0, -4, 16, 40);
        g.fillStyle(0xf9a825, 1); for (let y = -18; y <= 10; y += 7) { g.fillCircle(-3, y, 2); g.fillCircle(3, y + 3, 2); }
        break;
      case 'potato':
        g.fillStyle(0xc8a165, 1); g.fillEllipse(0, 2, 40, 28);
        g.fillStyle(0x8d6e4a, 1); g.fillCircle(-8, -2, 2); g.fillCircle(6, 4, 2); g.fillCircle(10, -5, 1.5);
        break;
      case 'butterfly':
        g.fillStyle(0xba68c8, 1); g.fillEllipse(-11, -6, 20, 16); g.fillEllipse(11, -6, 20, 16);
        g.fillStyle(0xf48fb1, 1); g.fillEllipse(-9, 8, 14, 12); g.fillEllipse(9, 8, 14, 12);
        g.fillStyle(0x4e342e, 1); g.fillEllipse(0, 2, 5, 22); g.lineStyle(2, 0x4e342e, 1); g.lineBetween(0, -8, -6, -18); g.lineBetween(0, -8, 6, -18);
        break;
      case 'bee':
        g.fillStyle(0xe3f2fd, 0.9); g.fillEllipse(-6, -12, 14, 12); g.fillEllipse(6, -12, 14, 12);
        g.fillStyle(0xfdd835, 1); g.fillEllipse(0, 2, 30, 20);
        g.fillStyle(0x3e2723, 1); g.fillRect(-4, -8, 5, 20); g.fillRect(6, -6, 4, 16); g.fillCircle(-14, 0, 5);
        break;
      case 'ant':
        g.fillStyle(0x3e2723, 1); g.fillCircle(-12, 0, 5); g.fillCircle(-2, 0, 4); g.fillEllipse(10, 0, 14, 10);
        g.lineStyle(2, 0x3e2723, 1); [-6, 0, 6].forEach((x) => { g.lineBetween(x - 2, 0, x - 6, 9); g.lineBetween(x - 2, 0, x + 2, 9); }); g.lineBetween(-15, -3, -20, -10);
        break;
      case 'rainbow':
        [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5, 0x5e35b1].forEach((c, i) => { g.lineStyle(4, c, 0.9); g.beginPath(); g.arc(0, 14, 36 - i * 4, Math.PI, 0, false); g.strokePath(); });
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

  // 植物部位的示意圖（不畫出是哪一種作物）
  function drawPartIcon(g, part) {
    g.clear();
    if (part === 'root') { g.lineStyle(4, 0x8d6e4a, 1); g.lineBetween(0, -20, 0, 6); g.lineBetween(0, 0, -12, 18); g.lineBetween(0, 2, 12, 20); g.lineBetween(-6, 10, -16, 10); g.lineBetween(6, 12, 16, 14); g.fillStyle(0x7cb342, 1); g.fillEllipse(0, -22, 18, 6); }
    else if (part === 'seed') { g.fillStyle(0x8d6e4a, 1); [[-10, -4], [4, -8], [10, 6], [-4, 8]].forEach(([x, y]) => g.fillEllipse(x, y, 10, 7)); }
    else if (part === 'flower') { g.fillStyle(0xf48fb1, 1); for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; g.fillCircle(Math.cos(a) * 10, -6 + Math.sin(a) * 10, 7); } g.fillStyle(0xffd54a, 1); g.fillCircle(0, -6, 6); g.lineStyle(3, 0x43a047, 1); g.lineBetween(0, 4, 0, 24); }
    else if (part === 'fruit') { g.fillStyle(0xff7043, 1); g.fillCircle(0, 4, 15); g.fillStyle(0x43a047, 1); g.fillEllipse(6, -12, 12, 6); g.fillStyle(0xffffff, 0.35); g.fillCircle(-5, -1, 4); }
    else { g.lineStyle(6, 0x558b2f, 1); g.lineBetween(0, 24, 0, -22); g.fillStyle(0x7cb342, 1); g.fillEllipse(-9, -4, 14, 6); g.fillEllipse(9, -14, 14, 6); }
  }

  // 地點（指路用）：只有圖，靠英文判斷是哪裡
  function drawPlace(g, k) {
    g.clear();
    const house = (c, roof) => { g.fillStyle(c, 1); g.fillRect(-26, -10, 52, 34); g.fillStyle(roof, 1); g.fillTriangle(-32, -10, 32, -10, 0, -32); g.fillStyle(0x6d4c41, 1); g.fillRect(-6, 8, 12, 16); };
    if (k === 'zoo') { g.lineStyle(3, 0x8d6e63, 1); for (let x = -28; x <= 28; x += 8) g.lineBetween(x, -8, x, 22); g.lineBetween(-30, -6, 30, -6); g.fillStyle(0xfdd835, 1); g.fillCircle(-8, 6, 9); g.fillStyle(0x8d6e63, 1); g.fillCircle(-12, 0, 3); g.fillCircle(-4, 0, 3); g.fillStyle(0x9e9e9e, 1); g.fillEllipse(14, 10, 18, 14); g.fillRect(20, 2, 4, 14); }
    else if (k === 'park') { g.fillStyle(0x7cb342, 1); g.fillEllipse(0, 16, 64, 16); g.fillStyle(0x6d4c41, 1); g.fillRect(-18, -4, 6, 20); g.fillStyle(0x2e8b3a, 1); g.fillCircle(-15, -14, 14); g.fillStyle(0x8d6e63, 1); g.fillRect(4, 6, 26, 5); g.fillRect(6, 10, 3, 8); g.fillRect(25, 10, 3, 8); }
    else if (k === 'library') { house(0xbcaaa4, 0x5d4037); [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835].forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(-22 + i * 6, -4, 5, 12); }); }
    else if (k === 'hospital') { house(0xffffff, 0x90a4ae); g.fillStyle(0xe53935, 1); g.fillRect(-4, -26, 8, 16); g.fillRect(-10, -21, 20, 6); }
    else if (k === 'school') { house(0xffcc80, 0xe65100); g.fillStyle(0x6d4c41, 1); g.fillRect(-1, -46, 2, 16); g.fillStyle(0xfdd835, 1); g.fillCircle(0, -24, 5); g.fillStyle(0x1e88e5, 1); g.fillTriangle(1, -46, 1, -38, 12, -42); }
    else { house(0xe0f7fa, 0x00897b); g.fillStyle(0xef5350, 1); for (let i = 0; i < 4; i++) g.fillRect(-26 + i * 13, -12, 7, 6); g.fillStyle(0xffffff, 1); for (let i = 0; i < 4; i++) g.fillRect(-19 + i * 13, -12, 6, 6); }
  }
  // 家人：兔子造型，靠配件分辨（祖父母灰毛戴眼鏡、爸爸領帶、媽媽蝴蝶結、哥哥帽子、妹妹髮帶、寶寶奶嘴）
  // 職業：同一個人形，靠衣服顏色和配件分辨
  function drawJob(g, k) {
    g.clear();
    const coat = { doctor: 0xffffff, nurse: 0xf8bbd0, police: 0x1a237e, driver: 0x546e7a, teacher: 0x8e24aa, farmer: 0x689f38, cook: 0xffffff, student: 0xffb300 }[k];
    g.fillStyle(coat, 1); g.fillRoundedRect(-16, -2, 32, 30, 6);
    g.lineStyle(2, 0x90a4ae, 1); g.strokeRoundedRect(-16, -2, 32, 30, 6);
    g.fillStyle(0xffcc99, 1); g.fillCircle(0, -14, 12);
    g.fillStyle(0x333333, 1); g.fillCircle(-4, -15, 1.6); g.fillCircle(4, -15, 1.6);
    if (k === 'doctor') { g.lineStyle(2, 0x37474f, 1); g.beginPath(); g.arc(0, 4, 9, 0, Math.PI, false); g.strokePath(); g.fillStyle(0x90a4ae, 1); g.fillCircle(0, 14, 3); }
    else if (k === 'nurse') { g.fillStyle(0xffffff, 1); g.fillRect(-10, -32, 20, 8); g.fillStyle(0xe53935, 1); g.fillRect(-1.5, -31, 3, 6); g.fillRect(-4, -29.5, 8, 3); }
    else if (k === 'police') { g.fillStyle(0x1a237e, 1); g.fillRect(-13, -30, 26, 6); g.fillRect(-9, -36, 18, 7); g.fillStyle(0xffd54a, 1); g.fillCircle(0, -32, 2.5); g.fillCircle(-8, 8, 3); }
    else if (k === 'driver') { g.lineStyle(4, 0x37474f, 1); g.strokeCircle(26, 12, 11); g.lineBetween(26, 1, 26, 23); g.fillStyle(0x546e7a, 1); g.fillRect(-12, -30, 24, 5); }
    else if (k === 'teacher') { g.fillStyle(0x2e7d32, 1); g.fillRect(-48, -30, 26, 20); g.lineStyle(1, 0xffffff, 1); g.lineBetween(-44, -24, -28, -24); g.lineBetween(-44, -18, -32, -18); g.lineStyle(2, 0x6d4c41, 1); g.lineBetween(-16, 4, -24, -10); }
    else if (k === 'farmer') { g.fillStyle(0xfdd835, 1); g.fillEllipse(0, -26, 36, 8); g.fillRect(-9, -34, 18, 9); g.lineStyle(2, 0x6d4c41, 1); g.lineBetween(24, -16, 24, 28); g.lineBetween(20, -16, 28, -16); g.lineBetween(20, -16, 20, -24); g.lineBetween(28, -16, 28, -24); }
    else if (k === 'cook') { g.fillStyle(0xffffff, 1); g.fillCircle(-6, -34, 7); g.fillCircle(6, -34, 7); g.fillCircle(0, -38, 7); g.fillRect(-9, -32, 18, 6); g.lineStyle(1, 0xbdbdbd, 1); g.strokeRect(-9, -32, 18, 6); g.fillStyle(0x9e9e9e, 1); g.fillCircle(24, 10, 6); g.fillRect(28, 8, 12, 3); }
    else if (k === 'student') { g.fillStyle(0xe53935, 1); g.fillRoundedRect(14, -2, 14, 24, 4); g.fillStyle(0x5d4037, 1); g.fillRect(-12, -27, 24, 6); }
  }
  // 學校用品
  function drawSchool(g, k) {
    g.clear();
    if (k === 'book') { g.fillStyle(0x1e88e5, 1); g.fillRect(-24, -18, 22, 32); g.fillStyle(0x43a047, 1); g.fillRect(2, -18, 22, 32); g.fillStyle(0xffffff, 1); g.fillRect(-2, -18, 4, 32); }
    else if (k === 'pen') { g.fillStyle(0x1e88e5, 1); g.fillRect(-28, -4, 46, 8); g.fillStyle(0x0d47a1, 1); g.fillRect(-28, -6, 12, 12); g.fillStyle(0x90a4ae, 1); g.fillTriangle(18, -4, 18, 4, 30, 0); }
    else if (k === 'pencil') { g.fillStyle(0xfdd835, 1); g.fillRect(-28, -5, 44, 10); g.fillStyle(0xf48fb1, 1); g.fillRect(-34, -5, 7, 10); g.fillStyle(0xffcc99, 1); g.fillTriangle(16, -5, 16, 5, 28, 0); g.fillStyle(0x333333, 1); g.fillTriangle(24, -1.6, 24, 1.6, 28, 0); }
    else if (k === 'ruler') { g.fillStyle(0xffe082, 1); g.fillRect(-36, -8, 72, 16); g.lineStyle(1, 0x6d4c41, 1); for (let x = -32; x <= 32; x += 8) g.lineBetween(x, -8, x, x % 16 === 0 ? 2 : -2); }
    else if (k === 'eraser') { g.fillStyle(0xf48fb1, 1); g.fillRoundedRect(-18, -8, 22, 18, 3); g.fillStyle(0x4fc3f7, 1); g.fillRoundedRect(2, -8, 16, 18, 3); }
    else if (k === 'bag') { g.fillStyle(0xe53935, 1); g.fillRoundedRect(-20, -14, 40, 38, 8); g.lineStyle(4, 0xb71c1c, 1); g.beginPath(); g.arc(0, -14, 10, Math.PI, 0, false); g.strokePath(); g.fillStyle(0xffcdd2, 1); g.fillRect(-12, 2, 24, 10); }
    else if (k === 'desk') { g.fillStyle(0xa1887f, 1); g.fillRect(-34, -12, 68, 8); g.fillStyle(0x6d4c41, 1); g.fillRect(-30, -4, 6, 30); g.fillRect(24, -4, 6, 30); g.fillStyle(0x8d6e63, 1); g.fillRect(-24, -4, 22, 12); }
    else if (k === 'chair') { g.fillStyle(0x6d4c41, 1); g.fillRect(-14, -26, 6, 50); g.fillRect(-14, -26, 26, 6); g.fillRect(-14, 0, 30, 6); g.fillRect(10, 0, 6, 24); g.fillRect(-14, -14, 26, 4); }
  }
  // 氣球（顏色訂單）
  function drawBalloon(g, k) {
    g.clear();
    g.lineStyle(2, 0x78909c, 1); g.lineBetween(0, 10, 2, 26);
    g.fillStyle(BALLOON[k], 1); g.fillEllipse(0, -10, 34, 40);
    g.lineStyle(2, 0x90a4ae, 1); g.strokeEllipse(0, -10, 34, 40);
    g.fillStyle(BALLOON[k], 1); g.fillTriangle(-4, 12, 4, 12, 0, 7);
    g.fillStyle(0xffffff, k === 'white' ? 0 : 0.45); g.fillEllipse(-7, -18, 8, 12);
  }
  // 食物
  function drawFood(g, k) {
    g.clear();
    const bowl = (c) => { g.fillStyle(c, 1); g.fillEllipse(0, 0, 56, 14); g.fillStyle(0xeceff1, 1); g.beginPath(); g.arc(0, 0, 28, 0, Math.PI, false); g.fillPath(); g.lineStyle(2, 0x90a4ae, 1); g.beginPath(); g.arc(0, 0, 28, 0, Math.PI, false); g.strokePath(); };
    if (k === 'lemon') { g.fillStyle(0xfdd835, 1); g.fillEllipse(0, 0, 50, 34); g.fillTriangle(22, -6, 22, 6, 32, 0); g.fillTriangle(-22, -6, -22, 6, -32, 0); g.fillStyle(0x7cb342, 1); g.fillEllipse(8, -18, 14, 7); }
    else if (k === 'rice') { bowl(0xffffff); g.fillStyle(0xffffff, 1); g.fillEllipse(0, -6, 50, 22); g.fillStyle(0xe0e0e0, 1); [[-12, -8], [0, -12], [12, -6], [-4, -2], [8, -14]].forEach(([x, y]) => g.fillEllipse(x, y, 5, 3)); }
    else if (k === 'bread') { g.fillStyle(0xd7a35b, 1); g.fillRoundedRect(-30, -14, 60, 32, 12); g.fillStyle(0xf3d6a1, 1); g.fillRoundedRect(-24, -8, 48, 20, 8); g.lineStyle(2, 0xb07a35, 1); [-12, 0, 12].forEach((x) => g.lineBetween(x - 4, -14, x + 4, -6)); }
    else if (k === 'egg') { g.fillStyle(0xfff8e1, 1); g.fillEllipse(0, 2, 32, 42); g.lineStyle(2, 0xd7ccc8, 1); g.strokeEllipse(0, 2, 32, 42); }
    else if (k === 'milk') { g.fillStyle(0xffffff, 1); g.fillRect(-16, -18, 32, 42); g.fillTriangle(-16, -18, 16, -18, 0, -32); g.lineStyle(2, 0x90a4ae, 1); g.strokeRect(-16, -18, 32, 42); g.fillStyle(0x1e88e5, 1); g.fillRect(-16, 0, 32, 10); }
    else if (k === 'soup') { bowl(0xff8a65); g.lineStyle(2, 0xb0bec5, 1); [-10, 0, 10].forEach((x) => { g.beginPath(); g.moveTo(x, -6); g.lineTo(x - 4, -16); g.lineTo(x + 2, -26); g.strokePath(); }); }
  }
  // 季節：春天開花、夏天大太陽和海、秋天落葉、冬天雪人
  function drawSeason(g, k) {
    g.clear();
    if (k === 'spring') { g.fillStyle(0x7cb342, 1); g.fillRect(-36, 10, 72, 14); [[-20, 0, 0xf48fb1], [0, -6, 0xfdd835], [20, 0, 0xce93d8]].forEach(([x, y, c]) => { g.lineStyle(2, 0x388e3c, 1); g.lineBetween(x, y, x, 12); g.fillStyle(c, 1); [0, 1, 2, 3, 4].forEach((i) => { const a = i * 1.2566; g.fillCircle(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5); }); g.fillStyle(0xffffff, 1); g.fillCircle(x, y, 3); }); }
    else if (k === 'summer') { g.fillStyle(0x4fc3f7, 1); g.fillRect(-36, 6, 72, 18); g.fillStyle(0xffd54a, 1); g.fillCircle(0, -14, 14); g.lineStyle(3, 0xffb300, 1); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.lineBetween(Math.cos(a) * 18, -14 + Math.sin(a) * 18, Math.cos(a) * 24, -14 + Math.sin(a) * 24); } }
    else if (k === 'autumn') { g.fillStyle(0x6d4c41, 1); g.fillRect(-4, -6, 8, 30); g.fillStyle(0xef6c00, 1); g.fillCircle(0, -16, 18); [[-24, 4], [20, 10], [-14, 18], [28, -4]].forEach(([x, y], i) => { g.fillStyle(i % 2 ? 0xfdd835 : 0xd84315, 1); g.fillEllipse(x, y, 10, 6); }); }
    else { g.fillStyle(0xffffff, 1); g.fillCircle(0, 10, 16); g.fillCircle(0, -14, 11); g.lineStyle(2, 0xb0bec5, 1); g.strokeCircle(0, 10, 16); g.strokeCircle(0, -14, 11); g.fillStyle(0xfb8c00, 1); g.fillTriangle(0, -14, 0, -10, 9, -12); g.fillStyle(0x37474f, 1); g.fillCircle(-4, -17, 1.6); g.fillCircle(4, -17, 1.6); g.fillStyle(0x90caf9, 1); [[-30, -20], [26, -24], [-24, 6], [30, 8]].forEach(([x, y]) => g.fillCircle(x, y, 2.5)); }
  }
  // 數星星：每排 4 顆
  function drawStars(g, n) {
    g.clear();
    g.fillStyle(0xffc107, 1);
    const rows = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 4), c = i % 4, x = -24 + c * 16, y = -24 + r * 16 + (3 - rows) * 8;
      const pts = [];
      for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5, rad = j % 2 ? 3 : 7; pts.push({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad }); }
      g.fillPoints(pts, true);
    }
  }
  // 動物園的動物（頭像或全身的簡單圖）
  function drawZoo(g, k) {
    g.clear();
    const eyes = (y, dx, c) => { g.fillStyle(c || 0x212121, 1); g.fillCircle(-dx, y, 2.2); g.fillCircle(dx, y, 2.2); };
    if (k === 'dog') { g.fillStyle(0xbcaaa4, 1); g.fillCircle(0, 0, 18); g.fillStyle(0x6d4c41, 1); g.fillEllipse(-18, 2, 10, 24); g.fillEllipse(18, 2, 10, 24); eyes(-4, 7); g.fillStyle(0x212121, 1); g.fillEllipse(0, 7, 9, 6); }
    else if (k === 'pig') { g.fillStyle(0xf8bbd0, 1); g.fillCircle(0, 0, 19); g.fillTriangle(-16, -12, -6, -16, -14, -26); g.fillTriangle(16, -12, 6, -16, 14, -26); g.fillStyle(0xf48fb1, 1); g.fillEllipse(0, 6, 16, 11); g.fillStyle(0xad1457, 1); g.fillCircle(-3, 6, 1.8); g.fillCircle(3, 6, 1.8); eyes(-6, 7); }
    else if (k === 'chicken') { g.fillStyle(0xffffff, 1); g.fillEllipse(0, 8, 36, 30); g.fillCircle(10, -12, 11); g.lineStyle(1, 0xbdbdbd, 1); g.strokeEllipse(0, 8, 36, 30); g.fillStyle(0xe53935, 1); g.fillCircle(8, -24, 4); g.fillCircle(13, -23, 4); g.fillStyle(0xffb300, 1); g.fillTriangle(20, -12, 20, -8, 27, -10); g.fillStyle(0x212121, 1); g.fillCircle(13, -14, 2); }
    else if (k === 'elephant') { g.fillStyle(0x90a4ae, 1); g.fillEllipse(-18, -2, 22, 30); g.fillEllipse(18, -2, 22, 30); g.fillStyle(0xb0bec5, 1); g.fillCircle(0, -2, 15); g.fillRect(-4, 6, 8, 20); eyes(-6, 6); }
    else if (k === 'lion') { g.fillStyle(0xef6c00, 1); g.fillCircle(0, 0, 22); g.fillStyle(0xffca28, 1); g.fillCircle(0, 0, 14); eyes(-3, 5); g.fillStyle(0x6d4c41, 1); g.fillTriangle(-3, 4, 3, 4, 0, 7); }
    else if (k === 'tiger') { g.fillStyle(0xfb8c00, 1); g.fillCircle(0, 0, 18); g.fillCircle(-14, -14, 6); g.fillCircle(14, -14, 6); g.lineStyle(3, 0x212121, 1); g.lineBetween(-4, -17, -2, -10); g.lineBetween(4, -17, 2, -10); g.lineBetween(-18, -2, -10, 0); g.lineBetween(18, -2, 10, 0); g.fillStyle(0xffffff, 1); g.fillEllipse(0, 8, 16, 10); eyes(-4, 6); }
    else if (k === 'bear') { g.fillStyle(0x6d4c41, 1); g.fillCircle(-14, -14, 7); g.fillCircle(14, -14, 7); g.fillCircle(0, 0, 18); g.fillStyle(0xbcaaa4, 1); g.fillEllipse(0, 6, 14, 10); eyes(-4, 7); g.fillStyle(0x212121, 1); g.fillCircle(0, 4, 2.5); }
    else if (k === 'panda') { g.fillStyle(0x212121, 1); g.fillCircle(-14, -14, 7); g.fillCircle(14, -14, 7); g.fillStyle(0xffffff, 1); g.fillCircle(0, 0, 18); g.lineStyle(1, 0xbdbdbd, 1); g.strokeCircle(0, 0, 18); g.fillStyle(0x212121, 1); g.fillEllipse(-7, -3, 8, 10); g.fillEllipse(7, -3, 8, 10); g.fillCircle(0, 7, 2.5); eyes(-3, 7, 0xffffff); }
    else if (k === 'snake') { g.lineStyle(8, 0x43a047, 1); g.beginPath(); g.moveTo(-30, 14); g.lineTo(-18, 2); g.lineTo(-6, 14); g.lineTo(6, 2); g.lineTo(18, 14); g.strokePath(); g.fillStyle(0x43a047, 1); g.fillCircle(24, 6, 8); g.fillStyle(0x212121, 1); g.fillCircle(26, 4, 1.6); g.lineStyle(1.5, 0xe53935, 1); g.lineBetween(31, 7, 37, 8); }
    else if (k === 'deer') { g.lineStyle(3, 0x5d4037, 1); g.lineBetween(-8, -14, -14, -30); g.lineBetween(-12, -24, -20, -26); g.lineBetween(8, -14, 14, -30); g.lineBetween(12, -24, 20, -26); g.fillStyle(0xa1887f, 1); g.fillEllipse(0, 0, 28, 34); g.fillStyle(0xffffff, 1); [[-6, 6], [6, 8], [0, -6]].forEach(([x, y]) => g.fillCircle(x, y, 2)); eyes(-4, 6); }
    else if (k === 'dolphin') { g.fillStyle(0x4fc3f7, 0.5); g.fillRect(-36, 14, 72, 10); g.fillStyle(0x78909c, 1); g.fillEllipse(0, 0, 54, 20); g.fillTriangle(-2, -8, 8, -8, 0, -20); g.fillTriangle(-26, 0, -36, -10, -36, 10); g.fillTriangle(24, -2, 36, 2, 24, 4); g.fillStyle(0x212121, 1); g.fillCircle(14, -3, 1.8); }
    else if (k === 'whale') { g.fillStyle(0x1565c0, 1); g.fillEllipse(-2, 4, 62, 34); g.fillTriangle(-28, 2, -38, -10, -38, 14); g.fillStyle(0x90caf9, 1); g.fillEllipse(2, 14, 44, 10); g.lineStyle(2, 0x4fc3f7, 1); g.lineBetween(4, -14, 0, -28); g.lineBetween(4, -14, 10, -26); g.fillStyle(0xffffff, 1); g.fillCircle(18, -2, 2.5); }
  }
  // 身體部位：同一個小朋友，紅圈圈出一個部位
  function drawBody(g, k) {
    g.clear();
    g.fillStyle(0xffcc99, 1);
    g.fillEllipse(-15, -26, 6, 9); g.fillEllipse(15, -26, 6, 9);   // ear
    g.fillCircle(0, -26, 13);                                       // head
    g.fillStyle(0x4fc3f7, 1); g.fillRoundedRect(-11, -12, 22, 20, 4);
    g.lineStyle(5, 0xffcc99, 1); g.lineBetween(-11, -8, -22, 4); g.lineBetween(11, -8, 22, 4);   // arm
    g.fillStyle(0xffcc99, 1); g.fillCircle(-23, 6, 4); g.fillCircle(23, 6, 4);                 // hand
    g.lineStyle(5, 0x5d4037, 1); g.lineBetween(-5, 8, -6, 24); g.lineBetween(5, 8, 6, 24);     // leg
    g.fillStyle(0x37474f, 1); g.fillEllipse(-8, 26, 10, 5); g.fillEllipse(8, 26, 10, 5);       // foot
    g.fillStyle(0x212121, 1); g.fillCircle(-5, -28, 1.8); g.fillCircle(5, -28, 1.8);           // eye
    g.fillStyle(0xe57373, 1); g.fillCircle(0, -24, 1.8);                                       // nose
    g.lineStyle(1.5, 0xc62828, 1); g.beginPath(); g.arc(0, -21, 4, 0.3, Math.PI - 0.3, false); g.strokePath(); // mouth
    const spot = { head: [0, -26, 17], eye: [5, -28, 5], ear: [15, -26, 7], nose: [0, -24, 4], mouth: [0, -19, 5], arm: [-17, -2, 8], hand: [-23, 6, 6], leg: [6, 16, 8], foot: [8, 26, 7] }[k];
    g.lineStyle(2.5, 0xe53935, 1); g.strokeCircle(spot[0], spot[1], spot[2]);
  }
  // 動作：火柴人，pts 是 [頭, 肩, 臀, 左手, 右手, 左腳, 右腳]，手腳可以有關節（陣列）
  function stick(g, o) {
    const c = o.c || 0x37474f;
    g.lineStyle(4, c, 1);
    const seg = (a, list) => { let p = a; list.forEach((q) => { g.lineBetween(p[0], p[1], q[0], q[1]); p = q; }); };
    seg(o.sh, [o.hip]);
    o.arms.forEach((a) => seg(o.sh, a));
    o.legs.forEach((l) => seg(o.hip, l));
    g.fillStyle(0xffcc99, 1); g.fillCircle(o.head[0], o.head[1], 8);
    g.lineStyle(2, c, 1); g.strokeCircle(o.head[0], o.head[1], 8);
  }
  function note(g, x, y) { g.fillStyle(0x7e57c2, 1); g.fillCircle(x, y, 3); g.lineStyle(2, 0x7e57c2, 1); g.lineBetween(x + 3, y, x + 3, y - 10); g.lineBetween(x + 3, y - 10, x + 7, y - 7); }
  function drawAct(g, k) {
    g.clear();
    const std = { head: [0, -26], sh: [0, -16], hip: [0, 4], arms: [[[-10, -2]], [[10, -2]]], legs: [[[-6, 22]], [[6, 22]]] };
    const P = (o) => stick(g, Object.assign({}, std, o));
    if (k === 'stand') P({});
    else if (k === 'walk') { P({ arms: [[[-8, -2]], [[8, -4]]], legs: [[[-4, 13], [-9, 22]], [[5, 13], [9, 22]]] }); g.fillStyle(0x90a4ae, 1); g.fillEllipse(-26, 23, 7, 4); g.fillEllipse(-38, 21, 7, 4); }
    else if (k === 'run') { P({ head: [6, -24], sh: [4, -14], hip: [-2, 4], arms: [[[-10, -18], [-16, -10]], [[14, -6], [20, -14]]], legs: [[[-14, 10], [-22, 6]], [[8, 12], [6, 24]]] }); g.lineStyle(2, 0x90a4ae, 1); [-14, -6, 2].forEach((y) => g.lineBetween(-36, y, -24, y)); }
    else if (k === 'jump') { P({ head: [0, -32], sh: [0, -22], hip: [0, -4], arms: [[[-12, -36]], [[12, -36]]], legs: [[[-8, 4], [-6, 12]], [[8, 4], [6, 12]]] }); g.fillStyle(0x000000, 0.15); g.fillEllipse(0, 26, 30, 6); }
    else if (k === 'sit') { g.fillStyle(0x8d6e63, 1); g.fillRect(-14, 6, 26, 5); g.fillRect(-14, -12, 5, 36); g.fillRect(8, 6, 4, 18); P({ head: [-2, -24], sh: [-2, -14], hip: [-2, 4], arms: [[[8, 0]], [[10, -2]]], legs: [[[14, 4], [16, 22]], [[16, 6], [18, 22]]] }); }
    else if (k === 'sleep') { g.fillStyle(0x90caf9, 1); g.fillRect(-36, 4, 72, 14); g.fillStyle(0x8d6e63, 1); g.fillRect(-38, -6, 5, 28); g.fillRect(34, 4, 4, 18); g.fillStyle(0xffffff, 1); g.fillEllipse(-24, 0, 20, 10); g.fillStyle(0xffcc99, 1); g.fillCircle(-22, -4, 8); g.fillStyle(0x7986cb, 1); g.fillRect(-14, -4, 46, 10); g.lineStyle(2, 0x5c6bc0, 1); [[-6, -24], [4, -32]].forEach(([x, y]) => { g.lineBetween(x, y, x + 7, y); g.lineBetween(x + 7, y, x, y + 7); g.lineBetween(x, y + 7, x + 7, y + 7); }); }
    else if (k === 'read') { P({ arms: [[[-6, -4], [4, -10]], [[8, -4], [12, -10]]] }); g.fillStyle(0x1e88e5, 1); g.fillRect(2, -20, 16, 14); g.fillStyle(0xffffff, 1); g.fillRect(9, -20, 2, 14); }
    else if (k === 'write') { g.fillStyle(0xa1887f, 1); g.fillRect(4, 0, 34, 5); g.fillRect(32, 5, 4, 18); g.fillStyle(0xffffff, 1); g.fillRect(10, -4, 18, 4); P({ head: [-10, -24], sh: [-10, -14], hip: [-10, 4], arms: [[[0, -6], [14, -6]]], legs: [[[-14, 22]], [[-6, 22]]] }); g.lineStyle(3, 0xfdd835, 1); g.lineBetween(14, -6, 20, -16); }
    else if (k === 'sing') { P({ arms: [[[-12, -10]], [[12, -10]]] }); note(g, 18, -30); note(g, 28, -20); }
    else if (k === 'dance') { P({ arms: [[[-14, -30]], [[14, -6], [20, 0]]], legs: [[[-6, 22]], [[12, 12], [20, 16]]] }); note(g, -26, -24); note(g, 28, -28); }
    else if (k === 'wash') { g.fillStyle(0x90a4ae, 1); g.fillRect(4, -36, 22, 5); g.fillRect(21, -36, 5, 10); P({ head: [-14, -24], sh: [-14, -14], hip: [-14, 4], arms: [[[0, -8], [18, -10]], [[0, -4], [20, -6]]], legs: [[[-18, 22]], [[-10, 22]]] }); g.fillStyle(0x4fc3f7, 1); [[23, -22], [21, -18]].forEach(([x, y]) => g.fillCircle(x, y, 2)); g.lineStyle(1.5, 0x81d4fa, 1); [[14, -16], [28, -12], [26, -2]].forEach(([x, y]) => g.strokeCircle(x, y, 3)); }
    else if (k === 'drink') { P({ arms: [[[-10, -2]], [[10, -12], [6, -24]]] }); g.fillStyle(0xe1f5fe, 1); g.fillRect(4, -32, 9, 12); g.lineStyle(1.5, 0x4fc3f7, 1); g.strokeRect(4, -32, 9, 12); }
    else if (k === 'kick') { P({ head: [-8, -26], sh: [-8, -16], hip: [-8, 4], arms: [[[-20, -8]], [[4, -8]]], legs: [[[-10, 22]], [[6, 10], [14, 10]]] }); g.fillStyle(0xffffff, 1); g.fillCircle(24, 10, 7); g.lineStyle(1.5, 0x37474f, 1); g.strokeCircle(24, 10, 7); }
    else if (k === 'throw') { P({ head: [-6, -24], sh: [-6, -14], hip: [-6, 4], arms: [[[-16, -4]], [[2, -26], [8, -32]]] }); g.fillStyle(0xe53935, 1); g.fillCircle(26, -30, 6); g.lineStyle(1.5, 0xb0bec5, 1); g.lineBetween(12, -32, 18, -31); }
  }
  // 感覺：臉的表情加一個小提示
  function drawFeel(g, k) {
    g.clear();
    g.fillStyle(0xffe0b2, 1); g.fillCircle(-6, 0, 22); g.lineStyle(2, 0xffb74d, 1); g.strokeCircle(-6, 0, 22);
    g.fillStyle(0x37474f, 1); g.lineStyle(2.5, 0x37474f, 1);
    const smile = (up) => { g.beginPath(); if (up) g.arc(-6, 4, 9, 0.2, Math.PI - 0.2, false); else g.arc(-6, 16, 9, Math.PI + 0.3, -0.3, false); g.strokePath(); };
    if (k === 'tired') { g.lineBetween(-16, -4, -10, -4); g.lineBetween(-2, -4, 4, -4); g.fillStyle(0x37474f, 1); g.fillEllipse(-6, 10, 8, 10); g.lineStyle(2, 0x5c6bc0, 1); [[18, -24], [26, -32]].forEach(([x, y]) => { g.lineBetween(x, y, x + 6, y); g.lineBetween(x + 6, y, x, y + 6); g.lineBetween(x, y + 6, x + 6, y + 6); }); }
    else { g.fillCircle(-13, -5, 2.5); g.fillCircle(1, -5, 2.5); }
    if (k === 'happy') { smile(true); g.fillStyle(0xf48fb1, 0.6); g.fillCircle(-20, 4, 4); g.fillCircle(8, 4, 4); }
    if (k === 'sad') { smile(false); g.fillStyle(0x4fc3f7, 1); g.fillEllipse(-14, 4, 4, 7); }
    if (k === 'thirsty') { g.lineBetween(-12, 10, 0, 10); g.fillStyle(0xe57373, 1); g.fillEllipse(-6, 14, 6, 6); g.fillStyle(0xe1f5fe, 1); g.fillRect(20, -18, 14, 20); g.lineStyle(2, 0x4fc3f7, 1); g.strokeRect(20, -18, 14, 20); g.fillStyle(0x4fc3f7, 1); g.fillRect(21, -8, 12, 9); }
    if (k === 'hungry') { g.strokeCircle(-6, 10, 4); g.fillStyle(0xffffff, 1); g.fillCircle(28, -14, 13); g.lineStyle(1, 0xbdbdbd, 1); g.strokeCircle(28, -14, 13); g.fillStyle(0xbf6c3a, 1); g.fillEllipse(28, -14, 16, 10); g.fillStyle(0xffffff, 1); g.fillCircle(17, 4, 3); g.fillCircle(13, 10, 2); }
  }
  // 時段：太陽的位置和天空的顏色
  function drawDaytime(g, k) {
    g.clear();
    const sky = { morning: 0xb3e5fc, afternoon: 0x4fc3f7, evening: 0xffab91, night: 0x1a237e }[k];
    g.fillStyle(sky, 1); g.fillRect(-40, -34, 80, 50);
    g.fillStyle(0x7cb342, 1); g.fillRect(-40, 10, 80, 12);
    if (k === 'morning') { g.fillStyle(0xffd54a, 1); g.fillCircle(-24, 6, 10); g.fillStyle(0x7cb342, 1); g.fillRect(-40, 10, 80, 12); g.lineStyle(2, 0xffb300, 1); [[-24, -10], [-36, -4], [-12, -4]].forEach(([x, y]) => g.lineBetween(-24 + (x + 24) * 0.6, 6 + (y - 6) * 0.6, x, y)); }
    else if (k === 'afternoon') { g.fillStyle(0xffd54a, 1); g.fillCircle(8, -22, 10); }
    else if (k === 'evening') { g.fillStyle(0xff7043, 1); g.fillCircle(24, 8, 11); g.fillStyle(0x7cb342, 1); g.fillRect(-40, 10, 80, 12); }
    else { g.fillStyle(0xfff9c4, 1); g.fillCircle(18, -20, 9); g.fillStyle(0x1a237e, 1); g.fillCircle(23, -23, 8); g.fillStyle(0xffffff, 1); [[-28, -26], [-14, -16], [-30, -6], [0, -28]].forEach(([x, y]) => g.fillCircle(x, y, 1.6)); g.fillStyle(0x33691e, 1); g.fillRect(-40, 10, 80, 12); }
  }
  // 地點
  function drawSpot(g, k) {
    g.clear();
    if (k === 'lake') { g.fillStyle(0x7cb342, 1); g.fillRect(-40, -20, 80, 44); g.fillStyle(0x4fc3f7, 1); g.fillEllipse(0, 6, 54, 24); g.fillStyle(0x2e7d32, 1); [[-30, -10], [30, -12], [-34, 14], [32, 14]].forEach(([x, y]) => g.fillTriangle(x - 7, y + 8, x + 7, y + 8, x, y - 10)); }
    else if (k === 'sea') { g.fillStyle(0xb3e5fc, 1); g.fillRect(-40, -30, 80, 24); g.fillStyle(0x1e88e5, 1); g.fillRect(-40, -6, 80, 30); g.lineStyle(2, 0xffffff, 1); [[-30, 4], [-6, 12], [18, 2]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, Math.PI, 0, false); g.strokePath(); }); g.fillStyle(0x8d6e63, 1); g.fillTriangle(10, -10, 30, -10, 26, -4); g.fillStyle(0xffffff, 1); g.fillTriangle(20, -11, 20, -26, 30, -11); }
    else if (k === 'mountain') { g.fillStyle(0x78909c, 1); g.fillTriangle(-40, 22, 6, 22, -16, -24); g.fillStyle(0x607d8b, 1); g.fillTriangle(-10, 22, 40, 22, 16, -32); g.fillStyle(0xffffff, 1); g.fillTriangle(10, -20, 22, -20, 16, -32); g.fillTriangle(-21, -14, -11, -14, -16, -24); }
    else if (k === 'road') { g.fillStyle(0x7cb342, 1); g.fillRect(-40, -30, 80, 54); g.fillStyle(0x757575, 1); g.fillTriangle(-34, 24, 34, 24, 4, -30); g.fillTriangle(-34, 24, 4, -30, -4, -30); g.fillStyle(0xffffff, 1); [[0, 14], [1, -2], [2, -16]].forEach(([x, y], i) => g.fillRect(x - 2, y, 4, 8 - i * 2)); }
    else if (k === 'kitchen') { g.fillStyle(0xeceff1, 1); g.fillRect(-36, -6, 72, 30); g.fillStyle(0x37474f, 1); g.fillCircle(-18, -6, 8); g.fillCircle(14, -6, 8); g.fillStyle(0x9e9e9e, 1); g.fillRect(-28, -22, 22, 14); g.fillRect(-32, -22, 30, 4); g.fillStyle(0xbdbdbd, 1); g.fillRect(-24, 4, 48, 14); g.lineStyle(2, 0xb0bec5, 1); [-12, -18, -24].forEach((y, i) => g.lineBetween(-18 + i * 2, y - 6, -16 + i * 2, y - 12)); }
    else if (k === 'bedroom') { g.fillStyle(0xfff3e0, 1); g.fillRect(-40, -30, 80, 54); g.fillStyle(0x8d6e63, 1); g.fillRect(-34, -4, 6, 26); g.fillRect(28, 6, 4, 16); g.fillStyle(0xf48fb1, 1); g.fillRect(-28, 4, 60, 12); g.fillStyle(0xffffff, 1); g.fillEllipse(-18, 0, 18, 8); g.fillStyle(0x90caf9, 1); g.fillRect(14, -24, 18, 14); g.lineStyle(2, 0xffffff, 1); g.lineBetween(23, -24, 23, -10); }
    else if (k === 'classroom') { g.fillStyle(0x2e7d32, 1); g.fillRect(-30, -32, 60, 26); g.lineStyle(2, 0x6d4c41, 1); g.strokeRect(-30, -32, 60, 26); g.lineStyle(1.5, 0xffffff, 1); g.lineBetween(-22, -24, -2, -24); g.lineBetween(-22, -16, 8, -16); g.fillStyle(0xa1887f, 1); [[-24, 10], [0, 10], [24, 10]].forEach(([x, y]) => { g.fillRect(x - 9, y, 18, 4); g.fillRect(x - 7, y + 4, 3, 10); g.fillRect(x + 4, y + 4, 3, 10); }); }
    else if (k === 'farm') { g.fillStyle(0x7cb342, 1); g.fillRect(-40, 6, 80, 18); g.fillStyle(0xc62828, 1); g.fillRect(-30, -14, 30, 26); g.fillTriangle(-34, -14, 4, -14, -15, -32); g.fillStyle(0xffffff, 1); g.fillRect(-20, -2, 10, 14); g.lineStyle(2, 0x8d6e63, 1); g.lineBetween(8, 6, 38, 6); g.lineBetween(8, 14, 38, 14); [10, 20, 30].forEach((x) => g.lineBetween(x, 2, x, 20)); }
  }
  // 物品
  function drawThing(g, k) {
    g.clear();
    if (k === 'robot') { g.fillStyle(0x90a4ae, 1); g.fillRect(-14, -30, 28, 20); g.fillRect(-18, -8, 36, 26); g.fillRect(-28, -6, 8, 18); g.fillRect(20, -6, 8, 18); g.fillRect(-12, 18, 8, 8); g.fillRect(4, 18, 8, 8); g.fillStyle(0x4fc3f7, 1); g.fillCircle(-6, -20, 4); g.fillCircle(6, -20, 4); g.lineStyle(2, 0x607d8b, 1); g.lineBetween(0, -30, 0, -38); g.fillStyle(0xe53935, 1); g.fillCircle(0, -38, 3); }
    else if (k === 'clock') { g.fillStyle(0xffffff, 1); g.fillCircle(0, -4, 24); g.lineStyle(3, 0x8d6e63, 1); g.strokeCircle(0, -4, 24); g.lineStyle(3, 0x37474f, 1); g.lineBetween(0, -4, 0, -20); g.lineBetween(0, -4, 12, -4); g.fillStyle(0x37474f, 1); [0, 1, 2, 3].forEach((i) => { const a = i * Math.PI / 2; g.fillCircle(Math.cos(a) * 19, -4 + Math.sin(a) * 19, 2); }); }
    else if (k === 'fan') { g.lineStyle(3, 0x78909c, 1); g.lineBetween(0, -4, 0, 20); g.fillStyle(0x78909c, 1); g.fillEllipse(0, 22, 30, 8); g.lineStyle(2, 0xb0bec5, 1); g.strokeCircle(0, -14, 20); g.fillStyle(0x4fc3f7, 1); [0, 1, 2].forEach((i) => { const a = i * 2.094; g.fillEllipse(Math.cos(a) * 9, -14 + Math.sin(a) * 9, 14, 8); }); g.fillStyle(0x607d8b, 1); g.fillCircle(0, -14, 4); }
    else if (k === 'computer') { g.fillStyle(0x37474f, 1); g.fillRoundedRect(-28, -30, 56, 38, 4); g.fillStyle(0x81d4fa, 1); g.fillRect(-23, -25, 46, 28); g.fillStyle(0x546e7a, 1); g.fillRect(-4, 8, 8, 8); g.fillRect(-16, 15, 32, 4); g.fillStyle(0x9e9e9e, 1); g.fillRect(-26, 21, 52, 6); }
    else if (k === 'bike') { g.lineStyle(3, 0x37474f, 1); g.strokeCircle(-20, 10, 12); g.strokeCircle(20, 10, 12); g.lineStyle(3, 0xe53935, 1); g.lineBetween(-20, 10, -4, -8); g.lineBetween(-4, -8, 14, -8); g.lineBetween(14, -8, 20, 10); g.lineBetween(-4, -8, 2, 10); g.lineBetween(2, 10, -20, 10); g.lineBetween(14, -8, 12, -18); g.lineStyle(3, 0x37474f, 1); g.lineBetween(-10, -14, 0, -14); g.lineBetween(8, -18, 18, -18); }
    else if (k === 'ball') { g.fillStyle(0xffffff, 1); g.fillCircle(0, -2, 22); g.lineStyle(2, 0x37474f, 1); g.strokeCircle(0, -2, 22); g.fillStyle(0x37474f, 1); g.fillCircle(0, -2, 7); [0, 1, 2, 3, 4].forEach((i) => { const a = -Math.PI / 2 + i * 1.2566; g.fillCircle(Math.cos(a) * 17, -2 + Math.sin(a) * 17, 4); }); }
    else if (k === 'rope') { g.lineStyle(4, 0xa1887f, 1); g.strokeCircle(-6, 0, 18); g.strokeCircle(-6, 0, 11); g.lineBetween(12, 0, 34, 16); g.lineStyle(1.5, 0x6d4c41, 1); for (let a = 0; a < 6.28; a += 0.6) g.lineBetween(-6 + Math.cos(a) * 16, Math.sin(a) * 16, -6 + Math.cos(a + 0.3) * 20, Math.sin(a + 0.3) * 20); }
    else if (k === 'flute') { g.fillStyle(0xbdbdbd, 1); g.fillRect(-36, -4, 72, 9); g.lineStyle(1, 0x757575, 1); g.strokeRect(-36, -4, 72, 9); g.fillStyle(0x424242, 1); [-24, -10, 2, 12, 22].forEach((x) => g.fillCircle(x, 0.5, 2.5)); }
    else if (k === 'mirror') { g.fillStyle(0x8d6e63, 1); g.fillEllipse(0, -6, 40, 52); g.fillRect(-3, 18, 6, 10); g.fillStyle(0xe1f5fe, 1); g.fillEllipse(0, -6, 30, 42); g.lineStyle(3, 0xffffff, 0.9); g.lineBetween(-8, -18, 2, -26); g.lineBetween(-8, -10, 6, -20); }
    else if (k === 'shirt') { g.fillStyle(0x42a5f5, 1); g.fillRect(-16, -18, 32, 40); g.fillTriangle(-16, -18, -32, -4, -24, 4); g.fillTriangle(16, -18, 32, -4, 24, 4); g.fillRect(-28, -8, 12, 10); g.fillRect(16, -8, 12, 10); g.fillStyle(0xffffff, 1); g.fillTriangle(-6, -18, 6, -18, 0, -10); g.fillCircle(0, -2, 1.5); g.fillCircle(0, 6, 1.5); g.fillCircle(0, 14, 1.5); }
    else if (k === 'pants') { g.fillStyle(0x3949ab, 1); g.fillRect(-18, -24, 36, 10); g.fillTriangle(-18, -14, 0, -14, -14, 26); g.fillTriangle(-18, -14, -14, 26, -24, 26); g.fillTriangle(18, -14, 0, -14, 14, 26); g.fillTriangle(18, -14, 14, 26, 24, 26); g.fillRect(-20, -14, 40, 6); }
    else if (k === 'dress') { g.fillStyle(0xec407a, 1); g.fillRect(-10, -26, 20, 16); g.fillTriangle(-10, -10, 10, -10, 0, -10); g.fillTriangle(-28, 24, 28, 24, 0, -12); g.fillRect(-10, -12, 20, 4); g.lineStyle(3, 0xec407a, 1); g.lineBetween(-8, -26, -10, -34); g.lineBetween(8, -26, 10, -34); g.fillStyle(0xffffff, 1); g.fillRect(-12, -10, 24, 3); }
  }
  // 月曆頁（上面的月份名稱是另外放的文字）
  function drawMonth(g) {
    g.clear();
    g.fillStyle(0xffffff, 1); g.fillRect(-34, -30, 68, 54); g.lineStyle(2, 0xb0bec5, 1); g.strokeRect(-34, -30, 68, 54);
    g.fillStyle(0xe53935, 1); g.fillRect(-34, -30, 68, 12);
    g.fillStyle(0xcfd8dc, 1); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) g.fillRect(-28 + c * 10, 4 + r * 7, 6, 4);
  }
  function drawFamily(g, k) {
    g.clear();
    const old = k === 'grandfather' || k === 'grandmother';
    const size = k === 'baby' ? 0.55 : (k === 'brother' || k === 'sister' ? 0.8 : 1);
    const fur = old ? 0xbdbdbd : 0xf3efe9;
    const sz = (v) => v * size;
    g.fillStyle(fur, 1); g.fillEllipse(sz(-8), sz(-44), sz(10), sz(30)); g.fillEllipse(sz(8), sz(-44), sz(10), sz(30));
    g.fillEllipse(0, sz(18), sz(40), sz(40)); g.fillCircle(0, sz(-14), sz(18));
    g.fillStyle(0x333333, 1); g.fillCircle(sz(-6), sz(-16), 2); g.fillCircle(sz(6), sz(-16), 2);
    if (old) { g.lineStyle(2, 0x5d4037, 1); g.strokeCircle(sz(-6), sz(-16), 5); g.strokeCircle(sz(6), sz(-16), 5); g.lineBetween(sz(-1), sz(-16), sz(1), sz(-16)); }
    if (k === 'grandfather') { g.fillStyle(0xeeeeee, 1); g.fillEllipse(0, sz(-6), sz(18), sz(6)); g.lineStyle(3, 0x6d4c41, 1); g.lineBetween(sz(22), sz(4), sz(22), sz(38)); }
    if (k === 'grandmother') { g.fillStyle(0x9e9e9e, 1); g.fillCircle(0, sz(-32), sz(7)); g.fillStyle(0xce93d8, 1); g.fillTriangle(sz(-20), sz(4), sz(20), sz(4), 0, sz(26)); }
    if (k === 'father') { g.fillStyle(0x1e88e5, 1); g.fillTriangle(sz(-4), sz(2), sz(4), sz(2), 0, sz(26)); }
    if (k === 'mother') { g.fillStyle(0xe91e63, 1); g.fillTriangle(sz(-14), sz(-34), sz(-2), sz(-28), sz(-14), sz(-22)); g.fillTriangle(sz(10), sz(-34), sz(-2), sz(-28), sz(10), sz(-22)); }
    if (k === 'brother') { g.fillStyle(0x43a047, 1); g.fillRoundedRect(sz(-18), sz(-36), sz(36), sz(10), 3); g.fillRect(sz(4), sz(-30), sz(20), sz(5)); }
    if (k === 'sister') { g.fillStyle(0xffca28, 1); g.fillRect(sz(-18), sz(-32), sz(36), sz(5)); g.fillStyle(0xf48fb1, 1); g.fillTriangle(sz(-18), sz(30), sz(18), sz(30), 0, sz(8)); }
    if (k === 'baby') { g.fillStyle(0x4fc3f7, 1); g.fillCircle(0, sz(-6), 5); g.fillRect(-1, sz(-10), 2, 4); }
  }
  // 節慶的圖
  function drawFestival(g, pic) {
    g.clear();
    if (pic === 'pumpkin') { g.fillStyle(0xfb8c00, 1); g.fillEllipse(-10, 6, 26, 30); g.fillEllipse(10, 6, 26, 30); g.fillEllipse(0, 6, 26, 32); g.fillStyle(0x43a047, 1); g.fillRect(-2, -16, 5, 9); g.fillStyle(0x3e2723, 1); g.fillTriangle(-12, 0, -4, 0, -8, -6); g.fillTriangle(4, 0, 12, 0, 8, -6); g.fillTriangle(-10, 12, 10, 12, 0, 18); }
    else if (pic === 'cake') { g.fillStyle(0xf8bbd0, 1); g.fillRect(-24, 0, 48, 22); g.fillStyle(0xffffff, 1); g.fillRect(-24, -2, 48, 6); g.fillStyle(0x4fc3f7, 1); [-12, 0, 12].forEach((x) => g.fillRect(x - 2, -16, 4, 14)); g.fillStyle(0xffca28, 1); [-12, 0, 12].forEach((x) => g.fillCircle(x, -18, 3)); }
    else { g.fillStyle(0x2e7d32, 1); g.fillTriangle(-22, 16, 22, 16, 0, -4); g.fillTriangle(-18, 2, 18, 2, 0, -18); g.fillTriangle(-12, -10, 12, -10, 0, -30); g.fillStyle(0x6d4c41, 1); g.fillRect(-4, 16, 8, 8); g.fillStyle(0xffd54a, 1); g.fillCircle(0, -32, 4); g.fillStyle(0xe53935, 1); g.fillCircle(-8, 6, 3); g.fillCircle(9, -6, 3); }
  }

  // 裝飾
  function drawDecor(g, k) {
    g.clear();
    if (k === 'flowerbed') { g.fillStyle(0x8d6e4a, 1); g.fillEllipse(0, 6, 90, 22); [[-30, 0xe53956], [-12, 0xffd54a], [6, 0xba68c8], [24, 0xff8a65]].forEach(([x, c]) => { g.fillStyle(0x43a047, 1); g.fillRect(x - 1, -10, 3, 12); g.fillStyle(c, 1); g.fillCircle(x, -12, 6); }); }
    else if (k === 'fence') { g.fillStyle(0xd7ccc8, 1); for (let i = -4; i <= 4; i++) { g.fillRect(i * 24 - 4, -24, 8, 30); g.fillTriangle(i * 24 - 4, -24, i * 24 + 4, -24, i * 24, -30); } g.fillRect(-100, -18, 200, 5); g.fillRect(-100, -6, 200, 5); }
    else if (k === 'bench') { g.fillStyle(0x8d6e63, 1); g.fillRect(-36, -14, 72, 8); g.fillRect(-36, -2, 72, 6); g.fillStyle(0x5d4037, 1); g.fillRect(-32, 4, 5, 14); g.fillRect(27, 4, 5, 14); }
    else if (k === 'lamppost') { g.fillStyle(0x455a64, 1); g.fillRect(-3, -60, 6, 66); g.fillRect(-12, 4, 24, 6); g.fillStyle(0xfff59d, 1); g.fillCircle(0, -66, 10); g.fillStyle(0xfff59d, 0.25); g.fillCircle(0, -66, 22); }
    else if (k === 'flag') { g.fillStyle(0x6d4c41, 1); g.fillRect(-2, -70, 4, 76); g.fillStyle(0xff7043, 1); g.fillTriangle(2, -70, 2, -46, 40, -58); g.fillStyle(0xffd54a, 1); g.fillCircle(18, -58, 5); }
    else { g.fillStyle(0x90a4ae, 1); g.fillEllipse(0, 6, 80, 24); g.fillStyle(0x4fc3f7, 1); g.fillEllipse(0, 2, 66, 16); g.fillStyle(0x90a4ae, 1); g.fillRect(-5, -26, 10, 28); g.fillStyle(0x81d4fa, 0.8); g.fillCircle(-10, -30, 6); g.fillCircle(10, -30, 6); g.fillCircle(0, -36, 7); }
  }

  // 設施：fixed 修好、crack 有裂痕；壞掉的是灰色、缺了幾塊
  function drawFacility(g, k, fixed, crack) {
    g.clear();
    const c1 = fixed ? null : 0x9e9e9e;
    if (k === 'well') {
      g.fillStyle(c1 || 0x90a4ae, 1); g.fillRoundedRect(-30, -10, 60, 34, 8);
      g.fillStyle(0x4fc3f7, fixed ? 1 : 0.3); g.fillEllipse(0, -10, 50, 12);
      if (fixed) { g.fillStyle(0x8d6e63, 1); g.fillRect(-28, -54, 6, 44); g.fillRect(22, -54, 6, 44); g.fillStyle(0xc62828, 1); g.fillTriangle(-38, -52, 38, -52, 0, -78); }
      else { g.fillStyle(0x757575, 1); g.fillRect(-28, -30, 6, 20); g.fillRect(20, -22, 10, 6); }
    } else if (k === 'bridge') {
      g.fillStyle(0x4fc3f7, 0.6); g.fillEllipse(0, 18, 150, 24);
      g.fillStyle(c1 || 0xa1887f, 1);
      for (let i = -3; i <= 3; i++) { if (!fixed && (i === 0 || i === 1)) continue; g.fillRect(i * 18 - 8, -6 + Math.abs(i) * 3, 16, 14); }
      g.lineStyle(4, c1 || 0x6d4c41, 1); g.lineBetween(-64, 6, -64, -18); g.lineBetween(64, 6, 64, -18);
      if (fixed) { g.beginPath(); g.arc(0, 60, 82, -2.3, -0.85, false); g.strokePath(); }
    } else if (k === 'dock') {
      g.fillStyle(0x4fc3f7, 0.6); g.fillRect(-50, 10, 100, 30);
      g.fillStyle(c1 || 0x6d4c41, 1); [-36, 0, 36].forEach((x) => g.fillRect(x - 4, -4, 8, 40));
      g.fillStyle(c1 || 0xa1887f, 1);
      for (let i = 0; i < 5; i++) { if (!fixed && i === 2) continue; g.fillRect(-48 + i * 20, -10, 18, 10); }
    } else {
      g.fillStyle(c1 || 0x9e98a8, 1);
      for (let i = 0; i < 4; i++) { if (!fixed && i === 2) continue; g.fillRect(-40 + i * 18, 20 - i * 16, 80 - i * 18, 16); }
      if (fixed) { g.fillStyle(0xffd54a, 1); g.fillCircle(30, -50, 8); }
    }
    if (crack) { g.lineStyle(3, 0x3e2723, 1); g.lineBetween(-14, -16, -4, -2); g.lineBetween(-4, -2, -12, 8); g.lineBetween(-12, 8, -2, 20); }
  }
  // 材料
  function drawMaterial(g, m) {
    g.clear();
    if (m === 'wood') { g.fillStyle(0xa1887f, 1); g.fillRoundedRect(-24, -10, 48, 20, 8); g.fillStyle(0x8d6e63, 1); g.fillEllipse(-24, 0, 12, 20); g.lineStyle(2, 0x6d4c41, 1); g.strokeEllipse(-24, 0, 6, 10); }
    else if (m === 'stone') drawSoil(g, 'rock', 1);
    else if (m === 'metal') { g.fillStyle(0xb0bec5, 1); g.fillRect(-24, -8, 48, 16); g.fillStyle(0xeceff1, 1); g.fillRect(-24, -8, 48, 4); g.fillStyle(0x78909c, 1); g.fillRect(-24, 4, 48, 4); }
    else { g.fillStyle(0xb3e5fc, 0.7); g.fillRect(-20, -18, 40, 36); g.lineStyle(2, 0x81d4fa, 1); g.strokeRect(-20, -18, 40, 36); g.lineStyle(2, 0xffffff, 0.9); g.lineBetween(-12, -10, -4, -16); }
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
    } else if (type === 'corn') {
      // 玉米：高高的莖，成熟時長出黃色玉米
      const h = 30 + k * 50;
      g.lineStyle(5, stemC, 1); g.lineBetween(0, 0, 0, -h);
      g.fillStyle(leaf, 1); g.fillTriangle(0, -h * 0.4, -22, -h * 0.55, -2, -h * 0.5); g.fillTriangle(0, -h * 0.65, 22, -h * 0.8, 2, -h * 0.75);
      if (p >= 1) { g.fillStyle(0xfdd835, 1); g.fillEllipse(8, -h * 0.5, 10, 26); }
    } else if (type === 'potato') {
      // 馬鈴薯：矮矮的一叢葉子，成熟時土上露出馬鈴薯
      const h = 18 + k * 18;
      g.fillStyle(leaf, 1); for (let i = -2; i <= 2; i++) g.fillEllipse(i * 9, -h + Math.abs(i) * 5, 14, 10);
      g.lineStyle(3, stemC, 1); g.lineBetween(0, 0, 0, -h + 4);
      if (p >= 1) { g.fillStyle(0xc8a165, 1); g.fillEllipse(-12, -2, 20, 12); g.fillEllipse(12, 0, 18, 11); }
    } else if (type === 'grape') {
      // 葡萄：攀爬的藤蔓，成熟時掛著一串紫色葡萄
      const h = 26 + k * 40;
      g.lineStyle(4, 0x6d4c41, 1); g.lineBetween(0, 0, 0, -h); g.lineBetween(0, -h, 20, -h - 6);
      g.fillStyle(leaf, 1); g.fillEllipse(-12, -h * 0.5, 18, 12); g.fillEllipse(14, -h * 0.75, 18, 12);
      if (p >= 1) { g.fillStyle(0x8e24aa, 1); [[14, -h + 8], [20, -h + 8], [17, -h + 14], [11, -h + 14], [16, -h + 20]].forEach(([x, y]) => g.fillCircle(x, y, 4)); }
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

  // 對話框（手帳風）：白底、墨線、暖色落影，尾巴朝下
  function drawBubble(g, x, y, w, h, tailX) {
    const r = Math.min(22, h / 2);
    g.fillStyle(0x3b2f1e, 0.10); g.fillRoundedRect(x + 2, y + 6, w, h, r);
    g.fillStyle(0xffffff, 1); g.lineStyle(3, INK, 1);
    g.fillRoundedRect(x, y, w, h, r); g.strokeRoundedRect(x, y, w, h, r);
    g.fillTriangle(tailX - 13, y + h - 3, tailX + 13, y + h - 3, tailX, y + h + 18);
    g.lineBetween(tailX - 13, y + h, tailX, y + h + 18); g.lineBetween(tailX, y + h + 18, tailX + 13, y + h);
  }
  // 貼紙小塊（HUD 按鈕、工具格）：白色切割邊＋墨線框＋柔和落影，以 (0,0) 為中心
  function stickerPill(g, w, h, fill, r, lift) {
    r = r == null ? Math.min(h / 2, 22) : r;
    g.fillStyle(0x3b2f1e, 0.16); g.fillRoundedRect(-w / 2, -h / 2 + (lift ? 9 : 5), w, h, r);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(fill, 1); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, Math.max(4, r - 5));
    g.lineStyle(3, INK, 1); g.strokeRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, Math.max(4, r - 5));
  }
  // 視窗裡的卡片（取代舊的白底淡色框）：白色切割邊＋卡片紙＋墨線；
  // ring 是原本的描邊色，只有鮮明的顏色（選到的橘、冷熱的紅藍、對錯的綠紅）才畫成外圈，淡色裝飾框一律換成墨線
  function paperCard(g, x, y, w, h, r, fill, ring) {
    const lum = (c) => (c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11;
    const sat = (c) => { const a = [c >> 16 & 255, c >> 8 & 255, c & 255]; const mx = Math.max(...a); return mx ? (mx - Math.min(...a)) / mx : 0; };
    const strong = ring != null && lum(ring) < 175 && sat(ring) > 0.35;
    const e = 5, ir = Math.max(4, r - 4);
    g.fillStyle(0x3b2f1e, 0.12); g.fillRoundedRect(x, y + 5, w, h, r);
    g.fillStyle(strong ? ring : 0xffffff, 1); g.fillRoundedRect(x, y, w, h, r);
    g.fillStyle(fill === 0xffffff ? 0xfdf9f0 : fill, 1); g.fillRoundedRect(x + e, y + e, w - e * 2, h - e * 2, ir);
    g.lineStyle(3, INK, 1); g.strokeRoundedRect(x + e, y + e, w - e * 2, h - e * 2, ir);
  }
  function stickerDisc(g, r, fill) {
    g.fillStyle(0x3b2f1e, 0.16); g.fillCircle(0, 5, r);
    g.fillStyle(0xffffff, 1); g.fillCircle(0, 0, r);
    g.fillStyle(fill, 1); g.fillCircle(0, 0, r - 6);
    g.lineStyle(3, INK, 1); g.strokeCircle(0, 0, r - 6);
  }
  // 一團圓形組成的形狀（雲、樹冠）加墨線：先畫放大一圈的墨色，再畫本體
  function inkBlob(g, circles, rects, fill, w) {
    w = w == null ? 3 : w;
    g.fillStyle(INK, 1);
    circles.forEach(([x, y, r]) => g.fillCircle(x, y, r + w));
    (rects || []).forEach(([x, y, rw, rh, rr]) => g.fillRoundedRect(x - w, y - w, rw + w * 2, rh + w * 2, rr + w));
    g.fillStyle(fill, 1);
    circles.forEach(([x, y, r]) => g.fillCircle(x, y, r));
    (rects || []).forEach(([x, y, rw, rh, rr]) => g.fillRoundedRect(x, y, rw, rh, rr));
  }

  // 貼紙卡：白色切割邊＋柔和落影＋內頁紙＋墨線（手帳貼紙風）
  function drawStickerCard(g, w, h, fill) {
    g.clear();
    g.fillStyle(0x3b2f1e, 0.10); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 9, w, h, 28);
    g.fillStyle(0x3b2f1e, 0.10); g.fillRoundedRect(-w / 2 + 1, -h / 2 + 5, w, h, 28);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 28);
    g.fillStyle(fill == null ? 0xfdf9f0 : fill, 1); g.fillRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 20);
    g.lineStyle(3, INK, 1); g.strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 20);
  }
  // 紙膠帶：半透明色條＋白色斜紋
  function washiTape(scene, x, y, w, color, angle) {
    const t = scene.add.graphics({ x, y }).setAngle(angle);
    t.fillStyle(color, 0.88); t.fillRect(-w / 2, -18, w, 36);
    t.fillStyle(0xffffff, 0.32);
    for (let i = -w / 2 + 6; i < w / 2 - 6; i += 22) t.fillTriangle(i, -18, i + 10, -18, i - 4, 18);
    t.fillStyle(0x000000, 0.06); t.fillRect(-w / 2, 14, w, 4);
    return t;
  }
  // 手帳內頁：米白紙、淡褐點格、珊瑚色裝訂線
  function notebookPage(scene, x0, y0, w, h) {
    const key = 'nb-' + w + 'x' + h;
    if (!scene.textures.exists(key)) {
      const x = 0, y = 0;
      const g = scene.make.graphics({ add: false });
    g.fillStyle(0x10243a, 0.16); g.fillRoundedRect(x + 4, y + 14, w, h, 16);
    g.fillStyle(0x10243a, 0.12); g.fillRoundedRect(x + 2, y + 7, w, h, 16);
    g.fillStyle(PAPER, 1); g.fillRoundedRect(x, y, w, h, 16);
    g.fillStyle(0xddd0b2, 1);
    for (let yy = y + 30; yy < y + h - 12; yy += 30) for (let xx = x + 90; xx < x + w - 12; xx += 30) g.fillCircle(xx, yy, 2);
    g.lineStyle(3, 0xef9f96, 1); g.lineBetween(x + 66, y + 4, x + 66, y + h - 4);
    g.fillStyle(0xe6dcc6, 1); for (let yy = y + 60; yy < y + h - 30; yy += 92) g.fillCircle(x + 32, yy, 9);
    g.lineStyle(2, 0xcfc2a4, 1); for (let yy = y + 60; yy < y + h - 30; yy += 92) g.strokeCircle(x + 32, yy, 9);
      g.generateTexture(key, w + 6, h + 16);
      g.destroy();
    }
    return scene.add.image(x0, y0, key).setOrigin(0);
  }
  // 手寫感的對話框：圓角框＋尾巴，墨線
  function inkBubble(g, x, y, w, h, tailX) {
    g.clear();
    g.fillStyle(0x3b2f1e, 0.10); g.fillRoundedRect(x + 2, y + 6, w, h, 26);
    g.fillStyle(0xffffff, 1); g.lineStyle(3, INK, 1);
    g.fillRoundedRect(x, y, w, h, 26); g.strokeRoundedRect(x, y, w, h, 26);
    g.fillTriangle(tailX, y + h - 22, tailX, y + h + 6, tailX - 34, y + h + 26);
    g.lineBetween(tailX, y + h + 4, tailX - 34, y + h + 26); g.lineBetween(tailX - 34, y + h + 26, tailX - 22, y + h - 2);
  }

  // 圓角按鈕：回傳 container，bg 可以重畫
  function makeButton(scene, x, y, w, h, color, label, size, onTap) {
    const c = scene.add.container(x, y);
    const bg = scene.add.graphics();
    // 貼紙按鈕：白色切割邊、墨線、柔和落影
    const r = Math.min(h / 2, 22);
    bg.fillStyle(0x3b2f1e, 0.16); bg.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
    bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.fillStyle(color, 1); bg.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, Math.max(4, r - 5));
    bg.lineStyle(3, INK, 1); bg.strokeRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, Math.max(4, r - 5));
    c.add(bg);
    const en = label && /^[ -~]+$/.test(label);
    if (label) c.add(txt(scene, 0, 0, label, size || 28, '#ffffff', { fontStyle: 'bold', fontFamily: en ? FONT_EN : FONT }).setOrigin(0.5));
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
    preload() {
      // 貼紙是 tools/art/stickers.js 預先輸出的 320px PNG（2 倍解析度），顯示時縮小
      ART_KEYS.forEach((k) => this.load.image('st-' + k, 'art/' + k + '.png'));
    }

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
        water: { q: 0, first: 0 }, typhoon: { q: 0, first: 0 }, fix: { q: 0, first: 0 }, way: { q: 0, first: 0 }, family: { q: 0, first: 0 }, festival: { q: 0, first: 0 }, prep: { q: 0, first: 0 }, food: { q: 0, first: 0 }, photo: { q: 0, first: 0 }, spell: { q: 0, first: 0 }, pitch: { q: 0, first: 0 }, fossil: { q: 0, first: 0 }, harvest: 0, days: 0, planted: 0 };
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
      grab('meadow', () => { this.buildIsland(); this.buildPlots(); this.buildRabbit(); this.buildPip(); this.buildFacility('well'); this.buildCritter(); this.buildDecorObjs(); });
      grab('forest', () => { this.buildForest(); this.buildFacility('bridge'); });
      grab('beach', () => { this.buildBeach(); this.buildFacility('dock'); });
      grab('cave', () => { this.buildCave(); this.buildFacility('stairs'); });
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
      this.buildParent();
      this.buildMap();
      this.buildSeeds();
      this.buildFix();
      this.buildDecorShop();
      this.buildPick();
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
      // 按「開始」後先出現地圖（主畫面），選好島才開始當天的流程（日記、天氣題、播報）
      if (BOT) this.startDayFlow();
      else { this.pendingDay = true; this.openMap(); }
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
      this.dailyGift();
      if (BOT) this.time.addEvent({ delay: 120, loop: true, callback: () => this.botStep() });
    }

    // --- 建構 ---
    buildSun() {
      this.sunG = this.add.graphics({ x: 1110, y: 130 }).setDepth(1);
      // 手帳風：光芒和太陽都有墨線
      for (const [w, c] of [[11, INK], [6, 0xffc107]]) {
        this.sunG.lineStyle(w, c, 1);
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; this.sunG.lineBetween(Math.cos(a) * 54, Math.sin(a) * 54, Math.cos(a) * 72, Math.sin(a) * 72); }
      }
      this.sunG.fillStyle(0xffd54a, 1); this.sunG.fillCircle(0, 0, 44);
      this.sunG.lineStyle(3, INK, 1); this.sunG.strokeCircle(0, 0, 44);
      this.sunG.fillStyle(0xfff3b0, 0.8); this.sunG.fillEllipse(-14, -16, 22, 12);
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
        const s = c.s;
        // 剪紙雲：墨線外框（透明度只用來區分天氣，晴天也不要太淡，否則墨線會糊掉）
        inkBlob(c.g, [[0, 0, 34 * s], [40 * s, -14 * s, 44 * s], [84 * s, 0, 32 * s]], [[-34 * s, 0, 152 * s, 34 * s, 17 * s]], color);
        c.g.setAlpha(Math.max(0.8, alpha));
      });
    }

    buildIsland() {
      const g = this.add.graphics().setDepth(3);
      g.lineStyle(3, INK, 1);
      g.fillStyle(0x7a5a3a, 1); g.fillEllipse(640, 690, 1020, 200); g.strokeEllipse(640, 690, 1020, 200);
      g.fillStyle(0x6b4e31, 1); g.fillEllipse(640, 720, 700, 120);
      g.fillStyle(0x6bbf59, 1); g.fillEllipse(640, 560, 1060, 300); g.strokeEllipse(640, 560, 1060, 300);
      g.fillStyle(0x7ccb69, 1); g.fillEllipse(640, 540, 940, 250);
      // 草地上幾撮小草（墨線短筆畫）
      g.lineStyle(3, 0x3f8f3a, 1);
      [[170, 560], [300, 650], [880, 640], [1080, 600], [960, 470], [520, 640]].forEach(([x, y]) => { g.lineBetween(x, y, x - 6, y - 14); g.lineBetween(x, y, x + 2, y - 18); g.lineBetween(x, y, x + 9, y - 12); });
      // 樹與樹蔭
      this.shadeG = this.add.graphics().setDepth(4);
      this.shadeG.fillStyle(0x1b5e20, 0.28); this.shadeG.fillEllipse(400, 490, 230, 200);
      const tree = this.add.graphics({ x: 250, y: 470 }).setDepth(7);
      tree.fillStyle(0x7b5230, 1); tree.fillRoundedRect(-18, -90, 36, 100, 8);
      tree.lineStyle(3, INK, 1); tree.strokeRoundedRect(-18, -90, 36, 100, 8);
      inkBlob(tree, [[0, -150, 80], [-62, -112, 56], [62, -112, 56]], null, 0x2e8b3a);
      tree.fillStyle(0x3aa34a, 1); tree.fillCircle(-10, -165, 50);
      tree.fillStyle(0xffffff, 0.25); tree.fillEllipse(-34, -186, 34, 18);
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
      // 全身貼紙（tools/art/stickers.js 的 rabbit-body），腳下一圈地面落影讓它站在草地上
      g.fillStyle(0x3b2f1e, 0.16); g.fillEllipse(0, 56, 130, 26);
      c.add([g, this.add.image(0, -30, 'st-rabbit-body').setDisplaySize(200, 200)]);
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
      const en = txt(this, 118, 26, '', 26, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN });
      const zh = txt(this, 118, 78, '', 20, '#4f5a6b');
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
      this.visitorEn = txt(this, 22, 16, '', 26, '#2b3a55', { fontStyle: 'bold' });
      this.visitorZh = txt(this, 22, 64, '', 20, '#4f5a6b');
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
      // Pip 小狐狸的全身貼紙（tools/art/stickers.js 的 pip）
      g.fillStyle(0x3b2f1e, 0.16); g.fillEllipse(6, 56, 120, 24);
      c.add([g, this.add.image(8, -18, 'st-pip').setDisplaySize(176, 176)]);
      this.pip = c;
      this.tweens.add({ targets: c, y: PIP.y - 8, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });

      this.pipBubble = this.add.container(PIP.x + 70, PIP.y - 190).setDepth(16);
      this.pipG = this.add.graphics();
      this.pipEn = txt(this, 18, 16, '', 30, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN });
      this.pipZh = txt(this, 18, 58, '', 20, '#4f5a6b');
      this.pipBubble.add([this.pipG, this.pipEn, this.pipZh]);

      this.arrow = this.add.graphics().setDepth(35);
      this.arrow.fillStyle(0xf26b55, 1); this.arrow.fillTriangle(-17, -30, 17, -30, 0, 0);
      this.arrow.lineStyle(3, INK, 1); this.arrow.strokeTriangle(-17, -30, 17, -30, 0, 0);
      this.arrow.setVisible(false);
      this.tweens.add({ targets: this.arrow, scale: 1.25, yoyo: true, repeat: -1, duration: 450 });
    }

    buildToolbar() {
      const bar = this.add.graphics().setDepth(30);
      // 手帳的一條紙：米白紙、點格、墨線框，左右兩端貼紙膠帶
      bar.fillStyle(0x3b2f1e, 0.14); bar.fillRoundedRect(30, 622, 1220, 92, 16);
      bar.fillStyle(PAPER, 1); bar.fillRoundedRect(30, 614, 1220, 92, 16);
      bar.fillStyle(0xddd0b2, 1); for (let x = 60; x < 1240; x += 30) for (let y = 630; y < 700; y += 30) bar.fillCircle(x, y, 2);
      bar.lineStyle(3, INK, 1); bar.strokeRoundedRect(30, 614, 1220, 92, 16);
      bar.lineStyle(3, 0xef9f96, 1); bar.lineBetween(370, 626, 370, 694);
      washiTape(this, 32, 618, 80, 0x7fc4dc, -38).setDepth(32);
      washiTape(this, 1248, 618, 80, 0xf2b84b, 38).setDepth(32);
      this.tools = {};
      TOOL_KEYS.forEach((k) => {
        const c = this.add.container(TOOL_X[k], 662).setDepth(31);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k === 'seeds' ? 'carrot' : k, 0, -8, k === 'shovel' ? 0.9 : 1.1);
        const label = txt(this, 0, 28, k, 20, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0.5);
        c.add([bg, icon, label]);
        c.setSize(100, 84).setInteractive({ useHandCursor: true });
        c.on('pointerdown', () => this.selectTool(k));
        this.tools[k] = { c, bg, k, icon, label };
      });
      // 背包：先點物品拿在手上，再點居民交給牠（不顯示英文名稱，靠願望句子判斷）
      txt(this, 400, 662, '背包', 18, '#4f5a6b').setOrigin(0.5).setDepth(31);
      this.bag = {};
      PLANT_KEYS.forEach((k) => {
        const x = BAG_X[k];
        const c = this.add.container(x, 662).setDepth(31);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k, -18, 0, 0.8);
        const n = txt(this, 6, 0, 'x0', 22, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0, 0.5);
        c.add([bg, icon, n]);
        c.setSize(90, 80).setInteractive({ useHandCursor: true });
        c.on('pointerdown', () => this.selectBag(k));
        this.bag[k] = { c, bg, icon, n, k };
      });
    }

    buildHud() {
      // 星砂
      this.dustBg = this.add.graphics().setDepth(40);
      this.dustBg.setPosition(1175, 46); stickerPill(this.dustBg, 170, 62, 0xfdf9f0);
      this.dustStar = this.add.graphics({ x: 1124, y: 46 }).setDepth(41);
      this.dustStar.fillStyle(0xffc83a, 1); this.dustStar.lineStyle(2.5, INK, 1);
      const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 18; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r)); }
      this.dustStar.fillPoints(pts, true); this.dustStar.strokePoints(pts, true);
      this.dustText = txt(this, 1150, 46, '0', 30, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0, 0.5).setDepth(41);

      const hudBtn = (x, label, onTap, w) => {
        w = w || 120;
        const b = this.add.container(x, 48).setDepth(40);
        const g = this.add.graphics();
        stickerPill(g, w, 62, 0xfdf9f0);
        b.add([g, txt(this, 0, 0, label, w < 120 ? 24 : 27, '#2b3a55').setOrigin(0.5)]);
        b.setSize(w, 60).setInteractive({ useHandCursor: true });
        b.on('pointerdown', onTap);
        return b;
      };
      hudBtn(84, '圖鑑', () => this.openLibrary());
      hudBtn(214, '日記', () => this.openBook());
      hudBtn(918, '地圖', () => this.openMap(), 96);
      hudBtn(1024, '裝飾', () => this.openDecor(), 96);

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
      stickerDisc(sg, 31, 0xfdf9f0);
      sg.fillStyle(INK, 1);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; sg.fillCircle(Math.cos(a) * 14, Math.sin(a) * 14, 5); }
      sg.fillCircle(0, 0, 14);
      sg.fillStyle(0xfdf9f0, 1); sg.fillCircle(0, 0, 6);
      sb.add(sg);
      sb.setSize(60, 60).setInteractive({ useHandCursor: true });
      // 點一下：設定；長按 3 秒：家長端（§3.6）
      sb.on('pointerdown', () => {
        if (this.gearTimer) this.gearTimer.remove();
        this.gearLong = false;
        this.gearTimer = this.time.delayedCall(3000, () => { this.gearLong = true; this.gearTimer = null; this.openParentGate(); });
      });
      const up = () => {
        if (!this.gearTimer) return;
        this.gearTimer.remove(); this.gearTimer = null;
        if (!this.gearLong) this.openSettings();
      };
      sb.on('pointerup', up);
      sb.on('pointerout', () => { if (this.gearTimer) { this.gearTimer.remove(); this.gearTimer = null; } });

      // 日進度
      washiTape(this, 640, 36, 330, 0xf2b84b, -1.5).setDepth(39);
      this.dayBar = this.add.graphics().setDepth(40);
      this.dayText = txt(this, 640, 35, '', 24, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0.5).setAngle(-1.5).setDepth(41);
      this.dayIcon = makeIcon(this, 'sun', 640, 70, 0.8).setDepth(42);
      // 天氣圖示放在日期列右邊；演練日的日期文字比較長（Day 28  Sunday  Drill Day），要留空間
      this.dayWeatherIcon = makeIcon(this, 'sunny', 828, 36, 0.7).setDepth(42);
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
      stickerDisc(g, 31, 0xdcedf4);
      g.fillStyle(INK, 1); g.fillRect(-14, -6, 8, 12); g.fillTriangle(-6, -6, 6, -16, 6, 16); g.fillTriangle(-6, 6, 6, 16, -6, -6);
      if (muted) { g.lineStyle(4, 0xe53935, 1); g.lineBetween(-20, 20, 20, -20); }
      else { g.lineStyle(3, INK, 1); g.beginPath(); g.arc(8, 0, 9, -0.9, 0.9, false); g.strokePath(); }
    }

    buildBanner() {
      this.banner = this.add.container(W / 2, 250).setDepth(60).setAlpha(0);
      this.bannerG = this.add.graphics();
      this.bannerDay = txt(this, 0, -62, '', 26, '#4f5a6b', { fontFamily: FONT_EN }).setOrigin(0.5);
      this.bannerEn = txt(this, 0, -8, '', 52, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0.5);
      this.bannerZh = txt(this, 0, 52, '', 24, '#4f5a6b').setOrigin(0.5);
      this.bannerIcon = makeIcon(this, 'sunny', -300, -4, 1.6);
      // 手帳的一小張紙：白色切割邊、墨線、兩角貼紙膠帶
      this.banner.add([this.bannerG, washiTape(this, -330, -96, 150, 0xf2b84b, -12), washiTape(this, 330, -96, 130, 0x7fc4dc, 10),
        this.bannerDay, this.bannerEn, this.bannerZh, this.bannerIcon]);
      stickerPill(this.bannerG, 760, 200, 0xfdf9f0, 28, true);
    }

    // 共用的彈出視窗底：半透明遮罩（擋住下面的點擊）＋面板
    modalBase(depth, x, y, w, h, color) {
      const c = this.add.container(0, 0).setDepth(depth).setVisible(false);
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10243a, 0.55).setInteractive());
      // 手帳內頁：白色切割邊＋墨線框＋點格紙，烘焙成貼圖（同尺寸同顏色共用），左上角斜貼一段紙膠帶（右上是關閉鈕、下方常有按鈕，都不貼）
      // 淺色頁一律換成手帳紙色；深色頁（洞穴、夜空）保留原本的顏色，點格改成淡白色
      const dark = ((color >> 16 & 255) * 0.3 + (color >> 8 & 255) * 0.59 + (color & 255) * 0.11) < 140;
      const fill = dark ? color : 0xfdf9f0;
      const key = 'mb-' + w + 'x' + h + '-' + fill.toString(16);
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0x10243a, 0.16); g.fillRoundedRect(4, 14, w, h, 30);
        g.fillStyle(0x10243a, 0.12); g.fillRoundedRect(2, 7, w, h, 30);
        g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, w, h, 30);
        g.fillStyle(fill, 1); g.fillRoundedRect(10, 10, w - 20, h - 20, 22);
        g.fillStyle(dark ? 0xffffff : 0xddd0b2, dark ? 0.10 : 0.7);
        for (let yy = 40; yy < h - 20; yy += 30) for (let xx = 40; xx < w - 20; xx += 30) g.fillCircle(xx, yy, 2);
        g.lineStyle(3, INK, 1); g.strokeRoundedRect(10, 10, w - 20, h - 20, 22);
        g.generateTexture(key, w + 6, h + 16);
        g.destroy();
      }
      c.add(this.add.image(x, y, key).setOrigin(0));
      c.add(washiTape(this, x + 34, y + 20, 120, 0xf2b84b, -38));
      return c;
    }

    closeButton(c, x, y, onTap) {
      const close = this.add.container(x, y);
      const cg = this.add.graphics();
      cg.fillStyle(0x3b2f1e, 0.18); cg.fillCircle(0, 6, 36);
      cg.fillStyle(0xffffff, 1); cg.fillCircle(0, 0, 36);
      cg.fillStyle(0xf26b55, 1); cg.fillCircle(0, 0, 28); cg.lineStyle(3, INK, 1); cg.strokeCircle(0, 0, 28);
      cg.lineStyle(6, 0xffffff, 1); cg.lineBetween(-10, -10, 10, 10); cg.lineBetween(-10, 10, 10, -10);
      close.add(cg); close.setSize(70, 70).setInteractive({ useHandCursor: true });
      close.on('pointerdown', onTap);
      c.add(close);
      return close;
    }

    buildLibrary() {
      const c = this.modalBase(100, 120, 50, 1040, 620, 0xfff8ec);
      c.add(txt(this, 640, 92, '圖鑑 Book', 40, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5));
      this.libPage = 0;
      this.libCards = [];
      for (let i = 0; i < LIB_PER_PAGE; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 260 + col * 255, y = 206 + row * 172;
        const card = this.add.container(x, y);
        const bg = this.add.graphics();
        const icon = makeIcon(this, 'sunny', 0, -10, 1.5);
        const img = this.add.image(0, -12, 'st-panda').setDisplaySize(112, 112).setVisible(false);   // 有貼紙的項目（動物）用貼紙
        const name = txt(this, 0, 58, '', 24, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0.5);
        card.add([bg, icon, img, name]);
        card.setAngle([-1.5, 1, -0.5, 1.5, 1, -1.5, 1.5, -1][i % 8]);
        card.setSize(220, 168).setInteractive({ useHandCursor: true });
        const slot = { e: null, card, bg, icon, img, name };
        card.on('pointerdown', () => { if (slot.e) this.pickCard(slot.e); });
        c.add(card);
        this.libCards.push(slot);
      }
      const pages = () => Math.max(1, Math.ceil(this.libList().length / LIB_PER_PAGE));
      this.libPrev = makeButton(this, 860, 92, 64, 56, 0x90a4ae, '◀', 24, () => { this.libPage = (this.libPage + pages() - 1) % pages(); this.refreshLibrary(); });
      this.libNext = makeButton(this, 1000, 92, 64, 56, 0x90a4ae, '▶', 24, () => { this.libPage = (this.libPage + 1) % pages(); this.refreshLibrary(); });
      // 篩選鈕：點一下換下一種分類
      this.libFilter = 0;
      this.libFilterBtn = makeButton(this, 300, 92, 220, 56, 0x26a69a, '篩選', 20, () => {
        this.libFilter = (this.libFilter + 1) % LIB_FILTERS.length; this.libPage = 0;
        const f = LIB_FILTERS[this.libFilter];
        if (f.k !== 'all') { speak(f.en); this.touch('classify'); this.libDetailEn.setText(f.en); this.libDetailZh.setText(f.zh + '的有這些'); }
        this.refreshLibrary();
      });
      this.libFilterBtn.label = this.libFilterBtn.list.find((o) => o.type === 'Text');
      c.add(this.libFilterBtn);
      this.libPageText = txt(this, 930, 92, '', 22, '#4f5a6b').setOrigin(0.5);
      c.add([this.libPrev, this.libNext, this.libPageText]);
      this.libDetailEn = txt(this, 640, 510, '', 36, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.libDetailZh = txt(this, 640, 548, '', 24, '#4f5a6b', { wordWrap: { width: 860 }, align: 'center' }).setOrigin(0.5, 0);
      c.add([this.libDetailEn, this.libDetailZh]);
      this.closeButton(c, 1100, 90, () => this.closeModal());
      this.lib = c;
    }

    // 早上的天氣題（§4.3）：居民問 How is the weather?，從 4 張卡片選今天的天氣
    buildWeatherQ() {
      const c = this.modalBase(80, 230, 120, 820, 470, 0xfffdf6);
      this.wqTitle = txt(this, 640, 190, 'How is the weather?', 44, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.wqZh = txt(this, 640, 240, '今天天氣怎麼樣？', 24, '#4f5a6b').setOrigin(0.5);
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
        const en = txt(this, 0, 42, '', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 78, '', 20, '#4f5a6b').setOrigin(0.5);
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
      this.dyTitle = txt(this, 640, 168, '', 36, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dyBefore = txt(this, 0, 300, '', 46, '#2b3a55').setOrigin(0, 0.5);
      this.dyBlank = txt(this, 0, 300, '', 46, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5, 0.5);
      this.dyAfter = txt(this, 0, 300, '', 46, '#2b3a55').setOrigin(0, 0.5);
      this.dyLine = this.add.graphics();
      this.dyHint = makeIcon(this, 'sunny', 640, 380, 1.4).setVisible(false);
      c.add([this.dyTitle, this.dyBefore, this.dyBlank, this.dyAfter, this.dyLine, this.dyHint]);
      this.dyOpts = [0, 1, 2].map((i) => {
        const b = this.add.container(640 + (i - 1) * 250, 480);
        const bg = this.add.graphics();
        const en = txt(this, 0, -8, '', 34, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 26, '', 18, '#4f5a6b').setOrigin(0.5);
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
      c.add(txt(this, 640, 110, '日記本 Diary', 40, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5));
      this.bookRows = [0, 1, 2, 3, 4].map((i) => {
        const y = 200 + i * 78;
        const row = this.add.container(640, y);
        const bg = this.add.graphics(); bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-420, -32, 840, 64, 18);
        const icon = makeIcon(this, 'sunny', -380, 0, 0.9);
        const day = txt(this, -330, 0, '', 22, '#4f5a6b').setOrigin(0, 0.5);
        const t = txt(this, -230, 0, '', 30, '#2b3a55').setOrigin(0, 0.5);
        row.add([bg, icon, day, t]);
        row.setSize(840, 64).setInteractive({ useHandCursor: true });
        row.on('pointerdown', () => { if (row.entry) speak(row.entry.text); });
        c.add(row);
        return { row, icon, day, t };
      });
      this.bookEmpty = txt(this, 640, 330, '還沒有日記。過完一天就會寫下第一頁。', 26, '#4f5a6b').setOrigin(0.5);
      this.bookPageText = txt(this, 640, 612, '', 22, '#4f5a6b').setOrigin(0.5);
      this.bookPrev = makeButton(this, 300, 612, 120, 60, 0x90a4ae, '◀', 28, () => { this.bookPage -= 1; this.renderBook(); });
      this.bookNext = makeButton(this, 980, 612, 120, 60, 0x90a4ae, '▶', 28, () => { this.bookPage += 1; this.renderBook(); });
      c.add([this.bookEmpty, this.bookPageText, this.bookPrev, this.bookNext]);
      this.closeButton(c, 1080, 100, () => this.closeModal());
      this.bookBox = c;
    }

    // 設定：中文字幕、聲音（開著時時間暫停，§3.1）
    buildSettings() {
      const c = this.modalBase(95, 340, 150, 600, 400, 0xfffaf0);
      c.add(txt(this, 640, 205, '設定 Settings', 40, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5));
      const rows = [
        { key: 'subs', label: '中文字幕', sub: '英文句子下方顯示中文', get: () => this.subs(), set: (v) => { this.s.subs = v; this.applySubs(); } },
        { key: 'sound', label: '聲音', sub: '唸出英文', get: () => !muted, set: (v) => this.setMuted(!v) },
      ];
      this.setRows = rows.map((r, i) => {
        const y = 300 + i * 110;
        c.add(txt(this, 400, y - 14, r.label, 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0, 0.5));
        c.add(txt(this, 400, y + 24, r.sub, 20, '#4f5a6b').setOrigin(0, 0.5));
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
      if (this.modal === 'map') return;
      if (this.sdBox) this.sdBox.setVisible(false);
      [this.lib, this.bookBox, this.setBox, this.bmBox, this.mkBox, this.ivBox, this.teaBox, this.acBoxBox, this.mgBox, this.dgBox, this.ltBox, this.mnBox, this.puBoxBox, this.ciBox, this.muBox, this.fgBox, this.drBox, this.rcBox, this.rxBox, this.paBox, this.fxBox, this.dcBox, this.pkBox].forEach((c) => c.setVisible(false));
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
      if (k === 'seeds') { this.openSeeds(); return; }
      if (PLANTS[k] && !this.s.seeds.includes(k)) return;
      this.tool = this.tool === k ? null : k;
      this.held = null;
      this.redrawTools();
      if (k === 'water') speak('water');
      else if (k === 'shovel') speak('shovel');
      else { speak(k + ' seed'); L.seen(this.s.words, 'seed', this.s.day); }
      if (this.tool && PLANTS[this.tool]) this.markDone('seed');
    }

    // ---------- 種子袋：選要種的種子；還沒有的可以用星砂買（點兩下確認） ----------
    buildSeeds() {
      const c = this.add.container(0, 0).setDepth(85).setVisible(false);
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10243a, 0.35).setInteractive().on('pointerdown', () => this.closeSeeds()));
      const g = this.add.graphics();
      // 手帳的一張小紙：白色切割邊＋墨線，標題寫在芥末紙膠帶上
      g.setPosition(550, 491); stickerPill(g, 800, 222, 0xfdf9f0, 24, true);
      c.add([g, washiTape(this, 260, 386, 190, 0xf2b84b, -4), txt(this, 260, 385, '種子袋 Seeds', 20, '#2b3a55').setOrigin(0.5).setAngle(-4)]);
      this.sdMsg = txt(this, 880, 398, '', 18, '#c62828', { fontStyle: 'bold' }).setOrigin(1, 0);
      c.add(this.sdMsg);
      this.sdCards = PLANT_KEYS.map((k, i) => {
        const card = this.add.container(220 + i * 126, 506);
        const bg = this.add.graphics();
        const icon = makeIcon(this, k, 0, -22, 1.1);
        const name = txt(this, 0, 28, k, 20, '#2b3a55', { fontStyle: 'bold', fontFamily: FONT_EN }).setOrigin(0.5);
        const price = txt(this, 0, 52, '', 18, '#c2185b', { fontStyle: 'bold' }).setOrigin(0.5);
        card.add([bg, icon, name, price]);
        card.setSize(114, 150).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickSeed(k));
        c.add(card);
        return { card, bg, icon, price, k };
      });
      this.closeButton(c, 930, 380, () => this.closeSeeds());
      this.sdBox = c;
    }

    openSeeds() {
      if (this.modal) return;
      this.modal = 'seeds';
      this.buyArmSeed = null;
      this.sdMsg.setText('');
      this.renderSeeds();
      this.sdBox.setVisible(true);
    }

    closeSeeds() { this.sdBox.setVisible(false); if (this.modal === 'seeds') this.modal = null; }

    renderSeeds() {
      const s = this.s;
      this.sdCards.forEach((c) => {
        const own = s.seeds.includes(c.k), on = this.tool === c.k;
        c.bg.clear(); stickerPill(c.bg, 114, 150, own ? (on ? 0xffd77a : 0xfdf9f0) : 0xebe3d1, 18, on);
        c.card.setY(on ? 500 : 506);
        c.icon.setAlpha(own ? 1 : 0.45);
        c.price.setText(own ? (this.subs() ? zhOf(c.k) : '') : '★' + PLANTS[c.k].price);
        c.price.setColor(own ? '#4f5a6b' : '#c2185b');
      });
    }

    pickSeed(k) {
      const s = this.s;
      if (this.modal !== 'seeds') return;
      if (s.seeds.includes(k)) {
        this.closeSeeds();
        this.tool = null;
        this.selectTool(k);
        return;
      }
      // 還沒有這種種子：第一次點顯示價格，3 秒內再點一次才買
      const price = PLANTS[k].price;
      if (this.buyArmSeed !== k) {
        this.buyArmSeed = k;
        this.time.delayedCall(3000, () => { if (this.buyArmSeed === k) { this.buyArmSeed = null; this.sdMsg.setText(''); } });
        this.sdMsg.setText(s.stardust >= price ? '再點一次買下 ' + zhOf(k) + ' 種子 ★' + price : '星砂不夠，需要 ★' + price);
        speak(k + ' seeds');
        return;
      }
      this.buyArmSeed = null;
      if (s.stardust < price) { this.sdMsg.setText('星砂不夠，需要 ★' + price); return; }
      s.stardust -= price;
      s.seeds.push(k);
      this.discover(k);
      L.seen(s.words, k, s.day);
      this.sdMsg.setText('買到了！New seeds: ' + k);
      speak('New seeds! ' + k);
      this.renderSeeds();
      this.refreshLibrary();
      this.refreshAll();
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
        p.water = Math.min(1, p.water + (this.s.fixed.well ? 0.9 : 0.6)); // 水井修好：澆一次水的量變多
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
      if (this.tool && PLANTS[this.tool] && this.s.seeds.includes(this.tool) && !p.plant) {
        const k = this.tool;
        p.plant = k; p.progress = 0;
        this.discover(k);
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
      this.touch('plant');
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
      // 候選只放「做得到的」：種過的作物，而且是這位居民會想要的；
      // 教學結束後再加上這些作物的部位（§4.2：I want a root.），部位字和作物名一起交給排程器
      const crops = this.likes(who).filter((k) => s.lib[k]);
      const parts = s.tut >= 7 ? Array.from(new Set(crops.map((k) => PLANTS[k].part))) : [];
      const cands = crops.concat(parts);
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
        st.q += 1; if (wishMatches(want, item)) st.first += 1;
      }
      if (wishMatches(want, item)) {
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
      if (s.lightOpen || !s.caveOpen || this.fixedCount() < LIGHT_NEED) return;
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

    // 草地上偶爾出現的小生物／彩虹：條件符合時出現，點了就記入圖鑑
    buildCritter() {
      this.critG = this.add.graphics().setDepth(18).setVisible(false);
      this.critZone = this.add.zone(0, 0, 90, 80).setDepth(23).setInteractive();
      this.critZone.input.enabled = false;
      this.critZone.on('pointerdown', () => this.tapCritter());
      this.critT = 4; this.critter = null;
    }

    // 找一塊長到一定程度的作物（開花、快成熟時；只看「成熟」的話，作物一熟就被收成，小生物幾乎不會出現）
    critterSpot(plants, min) {
      const i = this.s.plots.findIndex((p) => plants.includes(p.plant) && p.progress >= (min || 0.6));
      return i < 0 ? null : { x: this.plotObjs[i].x + 30, y: this.plotObjs[i].y - 90 };
    }

    tickCritter(dt) {
      const s = this.s;
      if (this.critter) {
        this.critter.life -= dt;
        if (this.critter.life <= 0) this.hideCritter();
        return;
      }
      this.critT -= dt;
      if (this.critT > 0) return;
      this.critT = 6;
      const opts = [];
      if (s.weather === 'sunny') { const p = this.critterSpot(['rose'], 0.8); if (p) opts.push(['butterfly', p]); }
      if (s.weather !== 'rainy') { const p = this.critterSpot(['corn', 'grape'], 0.6); if (p) opts.push(['bee', p]); }
      if (s.weather === 'cloudy') { const p = this.critterSpot(['carrot'], 0.6); if (p) opts.push(['ant', { x: p.x - 30, y: p.y + 60 }]); }
      if (s.weather === 'sunny' && s.prevWeather === 'rainy' && s.t < 40) opts.push(['rainbow', { x: 820, y: 230 }]);
      if (!opts.length) return;
      // 還沒發現的優先出現
      const fresh = opts.filter(([k]) => !s.lib[k]);
      const [k, p] = (fresh.length ? fresh : opts)[Math.floor(Math.random() * (fresh.length || opts.length))];
      this.critter = { k, x: p.x, y: p.y, life: 20 };
      drawIcon(this.critG, k);
      this.critG.setPosition(p.x, p.y).setScale(k === 'rainbow' ? 2.2 : 1.1).setVisible(true);
      this.critZone.setPosition(p.x, p.y).setSize(k === 'rainbow' ? 200 : 90, k === 'rainbow' ? 110 : 80);
      this.critZone.input.enabled = true;
    }

    hideCritter() {
      this.critter = null;
      this.critG.setVisible(false);
      this.critZone.input.enabled = false;
      this.critT = 12;
    }

    tapCritter() {
      if (this.paused() || !this.critter) return;
      const k = this.critter.k;
      speak(k === 'rainbow' ? 'A rainbow!' : 'A ' + k + '!');
      this.discover(k);
      this.hideCritter();
    }

    // 圖鑑新發現：記入圖鑑並給 ★3（§3.4）；已經發現過就不做事
    discover(k) {
      const s = this.s;
      if (s.lib[k]) return false;
      s.lib[k] = true;
      s.stardust += 3;
      const e = LIB.find((x) => x.k === k);
      this.floatText(640, 120, 'New! ' + (e ? e.en : k) + (this.subs() && e ? ' ' + e.zh : '') + '  圖鑑 +1  +3 ★', '#6a1b9a', true);
      if (this.libCards) this.refreshLibrary();
      if (this.dustText) this.dustText.setText(String(s.stardust));
      return true;
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
      this.navLLabel.setText(s.lightOpen ? '燈塔' : '設施 ' + Math.min(this.fixedCount(), LIGHT_NEED) + '/' + LIGHT_NEED);
      this.navCL.setVisible(this.zone === 'lighthouse');
      this.navR.setVisible(this.zone === 'forest');
      this.navR.setAlpha(this.researchOpen() ? 1 : 0.55);
      this.navFR.setVisible(this.zone === 'research');
      if (this.mkBtn) this.mkBtn.setVisible(!!s.town);
    }

    goZone(z) {
      if (this.paused() || this.zone === z) return;
      const why = this.lockReason(z);
      if (why) { this.floatText(z === 'forest' || z === 'research' ? 1060 : 260, z === 'research' ? 200 : 330, why, '#37474f', true); return; }
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

    // 還不能去這座島的原因（可以去就回傳 null）；地圖和左右箭頭共用
    lockReason(z) {
      const s = this.s;
      if (z === 'meadow') return null;
      if (z === 'forest') return s.forestOpen ? null : '再完成 ' + Math.max(0, FOREST_NEED - (s.gaveTotal || 0)) + ' 個願望';
      if (z === 'beach') {
        if (s.beachOpen) return null;
        const need = [];
        if ((s.harvested || 0) < BEACH_HARVEST) need.push('收成 ' + (BEACH_HARVEST - (s.harvested || 0)) + ' 次');
        if (this.libCount() < BEACH_LIB) need.push('圖鑑 ' + (BEACH_LIB - this.libCount()) + ' 項');
        return '再' + need.join('、');
      }
      if (z === 'cave') return s.caveOpen ? null : (!s.beachOpen ? '先開放海灘' : '圖鑑再 ' + Math.max(0, CAVE_LIB - this.libCount()) + ' 項');
      if (z === 'lighthouse') return s.lightOpen ? null : (!s.caveOpen ? '先開放洞穴' : '再修好 ' + Math.max(0, LIGHT_NEED - this.fixedCount()) + ' 個設施（★ 修理）');
      return this.researchOpen() ? null : '要先開放其他 5 座島';
    }

    // 直接跳到某座島（從地圖選島時，不做平移動畫）
    jumpZone(z) {
      this.zone = z;
      this.cameras.main.scrollX = { forest: OFF, beach: BOFF, cave: COFF, lighthouse: LOFF, research: ROFF }[z] || 0;
      this.showZones([z]);
      this.renderNav();
      this.refreshAll();
      if (z === 'forest' && this.s.visitor) this.time.delayedCall(500, () => this.sayVisitor());
    }

    // 當天的流程：一天走完在寫日記、早上還沒回答天氣、或剛開始
    startDayFlow() {
      if (this.s.t >= DAY_LEN) this.openDiary();
      else if (this.needWeatherQ()) this.openWeatherQ();
      else if (this.s.t < 3) this.showBanner();
    }

    // ---------- 地圖（主畫面）：6 座島，點了就過去；還沒開放的變淡並寫出還差什麼 ----------
    buildMap() {
      const c = this.add.container(0, 0).setDepth(140).setVisible(false);
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x6dc0f2, 0x6dc0f2, 0xd9f1ff, 0xd9f1ff, 1); bg.fillRect(0, 0, W, H);
      bg.fillStyle(0xffffff, 0.8);
      [[120, 120, 0.8], [980, 110, 1], [600, 640, 0.7], [1150, 620, 0.6]].forEach(([x, y, k]) => { bg.fillCircle(x, y, 30 * k); bg.fillCircle(x + 34 * k, y - 12 * k, 38 * k); bg.fillCircle(x + 70 * k, y, 28 * k); });
      c.add(bg);
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setInteractive()); // 擋住下面的點擊
      c.add(txt(this, W / 2, 62, 'Where do you want to go?', 38, '#27527a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.mapZh = txt(this, W / 2, 108, '要去哪一座島？', 24, '#27527a').setOrigin(0.5);
      this.mapDay = txt(this, 60, 30, '', 22, '#27527a', { fontStyle: 'bold' });
      this.mapDust = txt(this, W - 60, 30, '', 22, '#27527a', { fontStyle: 'bold' }).setOrigin(1, 0);
      c.add([this.mapZh, this.mapDay, this.mapDust]);
      this.mapIsles = MAP.map((m) => {
        const isle = this.add.container(m.x, m.y);
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.08); g.fillEllipse(0, 70, 170, 26);
        g.fillStyle(0x7a5a3a, 1); g.fillEllipse(0, 34, 170, 56); g.fillTriangle(-60, 40, 60, 40, 0, 88);
        g.fillStyle(m.color, 1); g.fillEllipse(0, 18, 190, 64);
        const icon = this.add.graphics({ y: -10 }).setScale(1.6);
        if (m.icon === 'moon') drawMoon(icon, 2); else drawIcon(icon, m.icon);
        const name = txt(this, 0, 104, m.en + ' ' + m.zh, 22, '#2b3a55', { fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5);
        const need = txt(this, 0, 134, '', 17, '#455a64', { stroke: '#ffffff', strokeThickness: 4, align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5, 0);
        const here = txt(this, 0, -66, '', 18, '#e65100', { fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5);
        isle.add([g, icon, name, need, here]);
        isle.setSize(210, 200).setInteractive({ useHandCursor: true });
        isle.on('pointerdown', () => this.pickIsle(m.z));
        c.add(isle);
        this.tweens.add({ targets: isle, y: m.y - 8, yoyo: true, repeat: -1, duration: 1400 + Math.random() * 600, ease: 'Sine.easeInOut' });
        return { isle, icon, need, here, m };
      });
      this.mapBox = c;
    }

    openMap() {
      if (this.modal && this.modal !== 'map') return;
      this.modal = 'map';
      this.held = null; this.tool = null; this.redrawTools();
      const s = this.s;
      this.mapZh.setVisible(this.subs());
      this.mapDay.setText('Day ' + s.day + '  ' + weekday(s.day));
      this.mapDust.setText('★ ' + s.stardust);
      this.mapIsles.forEach((it) => {
        const why = this.lockReason(it.m.z);
        it.isle.setAlpha(why ? 0.5 : 1);
        it.need.setText(why || '');
        it.here.setText(it.m.z === this.zone && !this.pendingDay ? 'You are here.' : '');
      });
      this.mapBox.setVisible(true);
      if (this.pendingDay) speak('Where do you want to go?');
    }

    pickIsle(z) {
      if (this.modal !== 'map') return;
      const it = this.mapIsles.find((x) => x.m.z === z);
      const why = this.lockReason(z);
      if (why) {
        // 還沒開放：島晃一下，再說一次還差什麼
        this.tweens.add({ targets: it.isle, angle: 4, yoyo: true, repeat: 2, duration: 70, onComplete: () => it.isle.setAngle(0) });
        this.floatText(it.m.x, it.m.y - 90, why, '#c62828', true);
        return;
      }
      speak(it.m.en);
      this.mapBox.setVisible(false);
      this.modal = null;
      this.jumpZone(z);
      if (this.pendingDay) { this.pendingDay = false; this.startDayFlow(); }
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
      if (s.fixed.bridge) delay = Math.round(delay / 2); // 小橋修好：訪客來得比較快
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
      this.bmSay = txt(this, 640, 180, '', 34, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.bmSayZh = txt(this, 640, 222, '', 22, '#4f5a6b').setOrigin(0.5);
      this.bmTitle = txt(this, 640, 268, 'Build a home.　每個 ★' + HAB_COST, 24, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.bmSay, this.bmSayZh, this.bmTitle]);
      this.bmCards = [0, 1, 2].map((i) => {
        const card = this.add.container(640 + (i - 1) * 220, 430);
        const bg = this.add.graphics();
        paperCard(bg, -95, -110, 190, 220, 24, 0xffffff, 0xa5d6a7);
        const icon = makeIcon(this, 'pond', 0, -30, 2);
        const en = txt(this, 0, 52, '', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 86, '', 20, '#4f5a6b').setOrigin(0.5);
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
        this.touch('habitat');
        this.discover(v);
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
      this.sqTitle = txt(this, 640, 290, 'Who is it?', 36, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.sqZh = txt(this, 640, 326, '是誰的叫聲？', 20, '#4f5a6b').setOrigin(0.5);
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
        const en = txt(this, 0, 44, '', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 76, '', 20, '#4f5a6b').setOrigin(0.5);
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
        paperCard(c.bg, -85, -100, 170, 200, 24, 0xffffff, 0xffcc80);
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
        this.touch('sound');
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
      this.mkBtn = makeButton(this, 1165, 662, 140, 70, 0xc4473d, '市集', 26, () => this.openMarket()).setDepth(31);

      // 手帳貼紙風：市集是一頁手帳，訂單的答案是可以貼上去的貼紙
      const c = this.add.container(0, 0).setDepth(80).setVisible(false);
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x10243a, 0.55).setInteractive());
      c.add(notebookPage(this, 150, 64, 980, 610));
      c.add([washiTape(this, 262, 74, 200, 0xf2b84b, -7), washiTape(this, 1030, 74, 170, 0x7fc4dc, 6)]);
      c.add(txt(this, 262, 74, '市集 Market', 22, '#2b3a55').setOrigin(0.5).setAngle(-7));
      this.mkWho = makeIcon(this, 'rabbit', 285, 222, 2).setVisible(false);
      this.mkWhoImg = this.add.image(285, 222, 'st-rabbit').setDisplaySize(170, 170);
      const bub = this.add.graphics(); inkBubble(bub, 392, 150, 600, 128, 412);
      this.mkSay = txt(this, 424, 166, '', 46, '#2b3a55', { fontFamily: FONT_EN, fontStyle: 'bold' });
      this.mkZh = txt(this, 426, 230, '', 22, '#4f5a6b');
      c.add([this.mkWho, this.mkWhoImg, bub, this.mkSay, this.mkZh]);
      const lis = this.add.container(1060, 214);
      const lg = this.add.graphics();
      lg.fillStyle(0x3b2f1e, 0.16); lg.fillCircle(0, 5, 34); lg.fillStyle(0xffffff, 1); lg.fillCircle(0, 0, 34);
      lg.fillStyle(0xdcedf4, 1); lg.fillCircle(0, 0, 26); lg.lineStyle(3, INK, 1); lg.strokeCircle(0, 0, 26);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 0.9)]);
      lis.setSize(70, 70).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => { if (this.mo) speak(this.mo.text); });
      c.add(lis);

      // 水果：6 籃，點幾下放幾個；換一籃就重新開始
      this.mkBins = BINS.map(([item, color], i) => {
        const b = this.add.container(320 + (i % 3) * 170, 392 + Math.floor(i / 3) * 140).setAngle([-2, 1.5, -1, 1, -1.5, 2][i]);
        const bg = this.add.graphics(); drawStickerCard(bg, 156, 124, 0xf3e3c4);
        bg.fillStyle(0xdcc49b, 1); bg.fillRoundedRect(-68, 18, 136, 34, { tl: 0, tr: 0, bl: 18, br: 18 });
        bg.lineStyle(3, INK, 1); bg.lineBetween(-68, 18, 68, 18);
        const g = this.add.graphics({ y: -6 }).setScale(1.5); drawFruit(g, item, color);
        const art = fruitArt(item, color), has = this.textures.exists(art);
        g.setVisible(!has);
        b.add([bg, g]);
        if (has) b.add(this.add.image(0, -8, art).setDisplaySize(96, 96));
        b.setSize(144, 104).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.addFruit(i));
        c.add(b);
        return b;
      });
      this.mkBasket = this.add.container(915, 395).setAngle(1.5);
      const bk = this.add.graphics(); drawStickerCard(bk, 270, 170);
      this.mkBasketG = [0, 1, 2, 3, 4].map(() => this.add.graphics({ y: -4 }).setScale(1.1).setVisible(false));
      this.mkBasketI = [0, 1, 2, 3, 4].map(() => this.add.image(0, -4, 'st-apple-red').setDisplaySize(54, 54).setVisible(false));
      this.mkBasketN = txt(this, 0, 48, '', 24, '#6b7686', { fontFamily: FONT_EN, fontStyle: 'bold' }).setOrigin(0.5);
      this.mkBasket.add([bk].concat(this.mkBasketG, this.mkBasketI, [this.mkBasketN, txt(this, 0, -58, 'Basket 籃子', 20, '#a0573a').setOrigin(0.5)]));
      this.mkClear = makeButton(this, 830, 524, 120, 56, 0x8fa3b3, 'Clear', 24, () => this.clearFruit());
      this.mkGive = makeButton(this, 930, 604, 270, 66, 0x2f8a5b, 'Here you are.', 26, () => this.giveFruit());
      c.add([this.mkBasket, this.mkClear, this.mkGive]);

      // 衣物：4 張卡片，點一張就交出去
      this.mkClothes = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 210, 470).setAngle([-2.5, 1.5, -1, 2.5][i]);
        const bg = this.add.graphics(); drawStickerCard(bg, 180, 214);
        const icon = makeIcon(this, 'hat', 0, -28, 1.8);
        const img = this.add.image(0, -30, 'st-hat').setDisplaySize(124, 124).setVisible(false);
        const en = txt(this, 0, 48, '', 30, '#2b3a55', { fontFamily: FONT_EN, fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 80, '', 20, '#4f5a6b').setOrigin(0.5);
        card.add([bg, icon, img, en, zh]);
        card.setSize(180, 214).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickCloth(i));
        c.add(card);
        return { card, icon, img, en, zh, x: card.x };
      });
      // 指路：十字路口＋四個方向的地點卡片（上、左、右、下）
      this.mkRoad = this.add.graphics();
      this.mkRoad.fillStyle(0xbdbdbd, 1); this.mkRoad.fillRect(610, 290, 60, 300); this.mkRoad.fillRect(420, 410, 440, 60);
      this.mkRoad.fillStyle(0xffffff, 1); for (let y = 300; y < 580; y += 30) this.mkRoad.fillRect(637, y, 6, 14); for (let x = 430; x < 850; x += 30) this.mkRoad.fillRect(x, 437, 14, 6);
      c.add(this.mkRoad);
      this.mkWay = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640, 470);
        const bg = this.add.graphics(); drawStickerCard(bg, 196, 214);
        const pic = this.add.graphics({ y: -14 }).setScale(1.7);
        const img = this.add.image(0, -10, 'st-panda').setDisplaySize(158, 158).setVisible(false);
        const zh = txt(this, 0, 76, '', 20, '#4f5a6b').setOrigin(0.5);
        const en = txt(this, 0, -14, '', 30, '#2b3a55', { fontFamily: FONT_EN, fontStyle: 'bold' }).setOrigin(0.5);
        const stamp = this.add.container(46, -62).setVisible(false);
        stamp.add([this.add.image(0, 0, 'st-stamp').setDisplaySize(120, 120),
          txt(this, 0, 2, 'Yes!', 30, '#2f8a5b', { fontFamily: FONT_EN, fontStyle: 'bold' }).setOrigin(0.5).setAngle(-14)]);
        card.add([bg, pic, img, zh, en, stamp]);
        card.setSize(196, 214).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickWay(i));
        c.add(card);
        return { card, pic, img, zh, en, stamp, x: 640, tilt: [-2.5, 1.5, -1, 2.5][i] };
      });
      this.mkHint = this.add.graphics({ x: 330, y: 615 });
      this.mkHintT = txt(this, 360, 615, '', 24, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0, 0.5);
      c.add([this.mkHint, this.mkHintT]);
      this.closeButton(c, 1122, 74, () => this.closeModal());
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
      // 權重：水果 3、衣物 2、指路 1.2、職業 1、學校用品 1、月份 0.8（月份屬延伸層，研究島開放後才有）
      // 單字補充（顏色、食物、季節、數字、動物園、身體）各 0.6
      const kinds = [['fruit', 3], ['clothes', 2], ['way', 1.2], ['job', 1], ['school', 1],
        ['color', 0.6], ['meal', 0.6], ['season', 0.6], ['count', 0.6], ['zoo', 0.6], ['body', 0.6],
        ['act', 0.6], ['feel', 0.5], ['time', 0.5], ['spot', 0.5], ['thing', 0.6]].concat(this.researchOpen() ? [['month', 0.8]] : []);
      let r = Math.random() * kinds.reduce((a, k) => a + k[1], 0), kind = 'fruit';
      for (const [k, w] of kinds) { if (r < w) { kind = k; break; } r -= w; }
      if (PICK_ORDERS[kind]) {
        // 指路、找人、找學校用品、找月份：4 張圖卡選 1 張
        const P = PICK_ORDERS[kind];
        const spots = L.shuffle(P.list).slice(0, 4);
        const answer = spots[Math.floor(Math.random() * 4)];
        o = { type: kind, pick: true, who, spots, answer, words: [answer], text: P.say(answer), zh: P.zh(answer), wrong: {} };
      } else if (kind === 'fruit') {
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
      const whoTex = 'st-' + o.who, hasWho = this.textures.exists(whoTex);
      this.mkWho.setVisible(!hasWho); this.mkWhoImg.setVisible(hasWho);
      if (hasWho) this.mkWhoImg.setTexture(whoTex).setDisplaySize(170, 170);
      const st = Math.min.apply(null, o.words.map((w) => L.stage(this.s.words, w)));
      this.mkSay.setText(o.text);
      for (let fs = 46; fs >= 34; fs -= 2) { this.mkSay.setFontSize(fs); if (this.mkSay.width <= 560) break; }
      this.mkZh.setText(this.subs() && (st === 0 || o.reveal) ? o.zh : '');
      const fruit = o.type === 'fruit', way = !!o.pick;
      this.mkBins.forEach((b) => b.setVisible(fruit));
      [this.mkBasket, this.mkClear, this.mkGive].forEach((x) => x.setVisible(fruit));
      this.mkRoad.setVisible(o.type === 'way');
      const road = o.type === 'way';
      this.mkWay.forEach((c, i) => {
        c.card.setVisible(way);
        if (!way) return;
        const P = PICK_ORDERS[o.type], k = o.spots[i];
        // 指路：縮小排在十字路口的四個方向；其他：4 張貼紙排一排
        const pos = road ? [[640, 330], [452, 450], [828, 450], [640, 572]][i] : [640 + (i - 1.5) * 222, 470];
        c.x = pos[0]; c.card.setPosition(pos[0], pos[1]).setScale(road ? 0.56 : 1).setAngle(road ? 0 : c.tilt);
        const tex = 'st-' + (P.art ? P.art(k) : k), useImg = this.textures.exists(tex);   // 有貼紙就用貼紙，還沒畫的用程式繪圖
        c.img.setVisible(useImg); c.pic.setVisible(!useImg);
        if (useImg) c.img.setTexture(tex).setDisplaySize(158, 158);
        // 身體部位的小人比較細，放大一點才看得清楚五官
        c.pic.setScale(o.type === 'body' ? 2.2 : road ? 1.9 : 1.7).setY(o.type === 'body' ? -4 : -14);
        P.draw(c.pic, k);
        c.en.setText(P.label ? P.label(k) : '');
        // 月曆貼紙的空白區比較窄：September 之類的長字縮小字級，放在紅色頁首下方
        c.en.setY(useImg ? -2 : -14);
        for (let fs = 30; fs >= 20; fs -= 2) { c.en.setFontSize(fs); if (!useImg || c.en.width <= 124) break; }
        c.zh.setFontSize(road ? 30 : 20);
        c.zh.setText(this.subs() && st === 0 && o.type !== 'body' ? (o.type === 'color' ? zhOf(k).split('；')[0] : zhOf(k)) : '');   // 顏色題的 orange 只寫「橘色」
        c.stamp.setVisible(!!o.done && k === o.answer);
        c.card.setAlpha(o.wrong[k] ? 0.35 : 1);
      });
      this.mkClothes.forEach((c, i) => {
        c.card.setVisible(!fruit && !way);
        if (fruit || way) return;
        const k = o.rack[i];
        drawIcon(c.icon, k);
        const has = this.textures.exists('st-' + k);
        c.icon.setVisible(!has); c.img.setVisible(has);
        if (has) c.img.setTexture('st-' + k).setDisplaySize(124, 124);
        c.en.setText(k);
        c.zh.setText(this.subs() && st === 0 ? zhOf(k) : '');
        c.card.setAlpha(o.wrong[k] ? 0.35 : 1);
      });
      if (fruit) {
        // 籃子裡的水果：最多 5 個排一排（先建好 5 個圖，依數量顯示）
        const b = o.basket, step = 44, x0 = -((b.n - 1) * step) / 2;
        const art = b.bin != null && fruitArt(BINS[b.bin][0], BINS[b.bin][1]), has = art && this.textures.exists(art);
        this.mkBasketG.forEach((g, i) => {
          const on = b.bin != null && i < b.n;
          g.setVisible(on && !has);
          if (on && !has) { g.setX(x0 + i * step); drawFruit(g, BINS[b.bin][0], BINS[b.bin][1]); }
          const im = this.mkBasketI[i];
          im.setVisible(on && has);
          if (on && has) im.setTexture(art).setDisplaySize(54, 54).setX(x0 + i * step);
        });
        this.mkBasketN.setText(b.n ? 'x ' + b.n : '');
      }
      // 答錯後的提示：要的東西的小圖（水果另外標數量）
      this.mkHint.clear(); this.mkHintT.setText('');
      if (o.reveal && !o.done) {
        if (fruit) { drawFruit(this.mkHint, BINS[o.bin][0], BINS[o.bin][1]); this.mkHintT.setText('x ' + o.n); }
        else if (o.type === 'clothes') { drawIcon(this.mkHint, o.need.word === 'cold' ? 'coat' : (o.need.ok === 'rain' ? 'rainy' : 'sunny')); }
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
      this.tweens.add({ targets: [this.mkWho, this.mkWhoImg], angle: 10, yoyo: true, repeat: 2, duration: 90, onComplete: () => { this.mkWho.setAngle(0); this.mkWhoImg.setAngle(0); } });
      speak('No, thank you. ' + o.text);
      this.renderMarket();
    }

    pickWay(i) {
      const s = this.s, o = this.mo;
      if (this.modal !== 'market' || !o || o.done || !o.pick) return;
      const k = o.spots[i], c = this.mkWay[i];
      if (o.wrong[k]) return;
      const right = k === o.answer;
      const st = this.stats[o.type] || (this.stats[o.type] = { q: 0, first: 0 });
      if (o.tries === 0) { st.q += 1; if (right) st.first += 1; }
      if (!o.recorded) { L.answer(s.words, o.answer, { day: s.day, options: 4, firstTry: right, peeked: false }); o.recorded = true; }
      speak(k);
      if (right) {
        speak(PICK_ORDERS[o.type].thanks(k));
        c.stamp.setVisible(true).setAlpha(0).setScale(1.8);
        this.tweens.add({ targets: c.stamp, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
        this.orderDone();
        return;
      }
      o.tries += 1; o.reveal = true; o.wrong[k] = true;
      this.tweens.add({ targets: c.card, x: c.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
      speak('No. ' + o.text);
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
      this.touch(o.type === 'fruit' ? 'market' : o.type);
      // 市集每天只有前 MARKET_PAID 單給星砂（原本沒有上限，可以一直刷）
      const s = this.s;
      if (!s.mkPaid || s.mkPaid.day !== s.day) s.mkPaid = { day: s.day, n: 0 };
      const paid = s.mkPaid.n < MARKET_PAID + (s.fixed.dock ? 1 : 0); // 碼頭修好：每天多 1 單
      if (paid) { s.mkPaid.n += 1; s.stardust += 4; }
      if (o.type === 'fruit') speak('Thank you!');
      this.floatText(640, 648, paid ? 'Thank you!  星砂 +4' : 'Thank you!' + (this.subs() ? '  今天的星砂拿完了' : ''), '#c2185b', true);
      this.tweens.add({ targets: [this.mkWho, this.mkWhoImg], y: '-=30', yoyo: true, duration: 200 });
      this.refreshAll();
      this.time.delayedCall(BOT ? 50 : 1400, () => { if (this.modal === 'market' && this.mo === o) this.newOrder(); });
    }

    // --- 日曆（§4.17）：居民邀請 Come to my party on Friday!，選出那一天；到了那天就有派對 ---
    buildInvite() {
      const c = this.modalBase(80, 130, 110, 1020, 470, 0xfffaf0);
      this.ivWho = makeIcon(this, 'rabbit', 230, 220, 2);
      const bub = this.add.graphics(); drawBubble(bub, 300, 150, 620, 110, 330);
      this.ivSay = txt(this, 322, 168, '', 32, '#2b3a55', { fontStyle: 'bold' });
      this.ivZh = txt(this, 322, 216, '', 20, '#4f5a6b');
      this.ivToday = txt(this, 640, 312, '', 22, '#4f5a6b').setOrigin(0.5);
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
        const en = txt(this, 0, -10, d, 20, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 22, '', 18, '#4f5a6b').setOrigin(0.5);
        card.add([bg, en, zh]);
        card.setSize(124, 120).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickDay(i));
        c.add(card);
        return { card, bg, en, zh, x: card.x };
      });
      this.closeButton(c, 1125, 135, () => this.closeModal());
      this.ivBox = c;
    }

    // 過 delay 毫秒後執行 fn；玩家正開著視窗就每秒再試一次，直到當天結束（避免演練、邀請整天被跳過）
    whenFree(delay, fn) {
      const day = this.s.day;
      const go = () => {
        if (this.s.day !== day) return;
        if (this.paused()) { this.time.delayedCall(BOT ? 20 : 1000, go); return; }
        fn();
      };
      this.time.delayedCall(delay, go);
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
      // 節慶與家人日（§4.17）：節慶優先；週六是家人日
      const fest = festivalOf(s.day);
      if (fest && s.festDay !== s.day) this.whenFree(BOT ? 20 : 3600, () => { if (s.festDay !== s.day) this.openFestival(fest); });
      else if (s.day % 7 === 6 && s.town && s.famDay !== s.day) this.whenFree(BOT ? 20 : 3600, () => { if (s.famDay !== s.day) this.openFamily(); });
      // 演練日：早上播報後開始演練（同一天不再發派對邀請）
      const drill = this.isDrillDay() && s.drillDay !== s.day;
      if (drill) this.whenFree(BOT ? 20 : 3800, () => { if (s.drillDay !== s.day) this.openDrill(); });
      // 辦派對那天不發新邀請，避免兩件事擠在同一個早上
      if (s.town && !s.party && !partyToday && !drill && s.day - (s.lastInvite || 0) >= 3) {
        this.whenFree(BOT ? 20 : 4200, () => { if (!s.party) this.openInvite(); });
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
        paperCard(c.bg, -62, -60, 124, 120, 18, today ? 0xfff3e0 : 0xffffff, today ? 0xffb74d : 0xce93d8);
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
        this.touch('calendar');
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
      if (this.extraTurn(k)) return;
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
      const say = txt(this, 342, y + 16, '', 30, '#2b3a55', { fontStyle: 'bold' });
      const zh = txt(this, 342, y + 60, '', 20, '#4f5a6b');
      c.add([who, bub, say, zh]);
      const lis = this.add.container(1010, y + 50);
      const lg = this.add.graphics(); lg.fillStyle(0xe3f2fd, 1); lg.fillCircle(0, 0, 30);
      lis.add([lg, makeIcon(this, 'speaker', 2, 0, 0.9)]);
      lis.setSize(66, 66).setInteractive({ useHandCursor: true });
      lis.on('pointerdown', () => speak(say.text));
      c.add(lis);
      return { who, say, zh };
    }

    // 實驗站開著時時間暫停，為了不讓星砂可以無限刷：所有實驗站合計每天只有前 STATION_PAID 回合給星砂，之後照樣能玩
    stationDone(key, reward, msg) {
      const s = this.s;
      reward = STATION_REWARD;
      if (key === 'moon' || key === 'magnet') this.discover(key);
      this.touch(key);
      if (CAVE.some((c) => c.k === key)) { s.caveDone = (s.caveDone || 0) + 1; this.checkLight(); }
      if (LIGHTHOUSE.some((c) => c.k === key)) s.lightDone = (s.lightDone || 0) + 1;
      if (!s.paid || s.paid.day !== s.day) s.paid = { day: s.day };
      s.paid[key] = (s.paid[key] || 0) + 1;   // 各站完成次數（家長端推算用）
      const n = s.paid._total || 0;
      if (n < STATION_PAID) {
        s.paid._total = n + 1;
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
        paperCard(bg, -95, -65, 190, 130, 20, 0xffffff, k === 'hot' ? 0xef5350 : 0x42a5f5);
        const pot = this.add.graphics({ x: -30, y: 0 });
        pot.fillStyle(k === 'hot' ? 0xef5350 : 0x42a5f5, 1); pot.fillRoundedRect(-26, -22, 52, 46, 12); pot.fillTriangle(24, -10, 44, -24, 26, 6);
        pot.lineStyle(4, 0x555555, 1); pot.beginPath(); pot.arc(-28, 0, 12, Math.PI * 0.5, Math.PI * 1.5, false); pot.strokePath();
        if (k === 'hot') { pot.lineStyle(3, 0xbdbdbd, 1); [-10, 0, 10].forEach((x) => pot.lineBetween(x, -30, x + 4, -44)); }
        else { pot.fillStyle(0xe1f5fe, 1); pot.fillRect(-12, -36, 12, 12); pot.fillRect(4, -40, 12, 12); }
        const en = txt(this, 45, -12, k, 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 45, 24, '', 18, '#4f5a6b').setOrigin(0.5);
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
      // 熱水裡的糖約 1.2 秒溶完：用遊戲時鐘（time event）而不是動畫計時，狀態才不會受畫面更新速度影響
      if (q.water === 'hot' && q.sugar > 0 && !q.melting) {
        q.melting = true;
        const step = q.sugar / 12;
        this.time.addEvent({ delay: BOT ? 1 : 100, repeat: 11, callback: () => {
          q.sugar = Math.max(0, q.sugar - step);
          if (q.sugar < 0.001) q.sugar = 0;
          if (this.tq === q) this.renderTea();
        } });
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
        this.acKey.add(txt(this, -110 + i * 110, 30, w, 18, '#4f5a6b').setOrigin(0.5));
      });
      this.acKey.addAt(kg, 0);
      this.acMsg = txt(this, 640, 615, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      this.acProg = txt(this, 985, 98, '', 22, '#4f5a6b').setOrigin(0.5);
      c.add([this.acCup, this.acQ, this.acDrop, this.acKey, this.acMsg, this.acProg]);
      this.acBoxes = TASTES.map((w, i) => {
        const b = this.add.container(640 + i * 150, 460);
        const bg = this.add.graphics();
        bg.fillStyle(0xd7b98e, 1); bg.fillRoundedRect(-65, -60, 130, 120, 16);
        bg.fillStyle(0xbf9a68, 1); bg.fillRect(-65, -60, 130, 20);
        const en = txt(this, 0, 4, w, 28, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
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
      this.mgTitle = txt(this, 640, 150, 'Will the magnet pull it?', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.mgZh = txt(this, 640, 190, '', 20, '#4f5a6b').setOrigin(0.5);
      this.mgMsg = txt(this, 640, 470, '', 22, '#6d4c2f', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
      c.add([this.mgTitle, this.mgZh, this.mgMsg]);
      this.mgCards = [0, 1, 2, 3, 4].map((i) => {
        const card = this.add.container(330 + i * 155, 300);
        const bg = this.add.graphics();
        const icon = this.add.graphics({ y: -12 }).setScale(1.5);
        const name = txt(this, 0, 42, '', 18, '#4f5a6b').setOrigin(0.5);
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
      this.dgTitle = txt(this, 640, 150, 'Rock, sand, or mud?', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dgZh = txt(this, 640, 190, '', 20, '#4f5a6b').setOrigin(0.5);
      this.dgSample = this.add.graphics({ x: 640, y: 300 }).setScale(1.6);
      this.dgHint = txt(this, 640, 380, '', 20, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      this.dgProg = txt(this, 985, 98, '', 22, '#4f5a6b').setOrigin(0.5);
      c.add([this.dgTitle, this.dgZh, this.dgSample, this.dgHint, this.dgProg]);
      this.dgPiles = SOILS.map((w, i) => {
        const b = this.add.container(640 + (i - 1) * 230, 510);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-95, -70, 190, 140, 18);
        bg.lineStyle(4, 0xbcaaa4, 1); bg.strokeRoundedRect(-95, -70, 190, 140, 18);
        const pile = this.add.graphics({ y: -16 }).setScale(1.1);
        const en = txt(this, 0, 34, w, 28, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 60, '', 16, '#4f5a6b').setOrigin(0.5);
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
      if (this.extraTurn(k)) return;
      if (k === 'light') this.openLight(); else if (k === 'moon') this.openMoon(); else this.openPush();
    }

    // --- 光（§4.9）：洞裡很暗，看不到植物；照指令 Move the lamp to the left. 移動燈，照到植物才會出現 ---
    buildLight() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0x1f2633);
      c.add(txt(this, 640, 98, 'Light 光', 28, '#ffd54a', { fontStyle: 'bold' }).setOrigin(0.5));
      const bub = this.add.graphics(); drawBubble(bub, 330, 125, 620, 96, 360);
      this.ltSay = txt(this, 352, 140, '', 30, '#2b3a55', { fontStyle: 'bold' });
      this.ltZh = txt(this, 352, 182, '', 20, '#4f5a6b');
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
      this.puSay = txt(this, 352, 140, '', 30, '#2b3a55', { fontStyle: 'bold' });
      this.puZh = txt(this, 352, 182, '', 20, '#4f5a6b');
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
      this.puProg = txt(this, 985, 98, '', 22, '#4f5a6b').setOrigin(0.5);
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
      if (this.extraTurn(k)) return;
      if (k === 'circuit') this.openCircuit(); else if (k === 'music') this.openMusic(); else this.openFog();
    }

    // --- 電路（§4.13）：缺口補上導體、打開開關，燈才會亮；有檢查模式 ---
    buildCircuit() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xfffaf0);
      c.add(txt(this, 640, 98, 'Circuit 電路', 28, '#f57f17', { fontStyle: 'bold' }).setOrigin(0.5));
      const bub = this.add.graphics(); drawBubble(bub, 250, 125, 560, 80, 300);
      this.ciSay = txt(this, 272, 136, '', 30, '#2b3a55', { fontStyle: 'bold' });
      this.ciZh = txt(this, 272, 174, '', 18, '#4f5a6b');
      c.add([bub, this.ciSay, this.ciZh]);
      this.ciWire = this.add.graphics();
      this.ciBulb = this.add.graphics({ x: CIRC.bulb.x, y: CIRC.bulb.y });
      this.ciBatt = this.add.graphics({ x: CIRC.batt.x, y: CIRC.batt.y });
      c.add([this.ciWire, this.ciBatt, this.ciBulb]);
      // 開關：點一下切換
      this.ciSw = this.add.container(CIRC.sw.x, CIRC.sw.y);
      this.ciSwG = this.add.graphics();
      this.ciSwT = txt(this, 0, 34, '', 18, '#4f5a6b').setOrigin(0.5);
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
      paperCard(sg, -50, -24, 100, 48, 12, 0xffffff, q.check && !q.sw ? 0xe53935 : 0x90a4ae);
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
        paperCard(gp.bg, -48, -36, 96, 72, 12, 0xfffaf0, q.check ? (chk[i] ? 0x43a047 : 0xe53935) : 0xffb74d);
        gp.m.clear(); if (m) drawPart(gp.m, m);
      });
      this.ciTray.forEach((t) => {
        const used = q.gaps.includes(t.k);
        t.bg.clear();
        paperCard(t.bg, -100, -38, 200, 76, 14, 0xffffff, q.sel === t.k ? 0xff9800 : 0xd7ccc8);
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
      this.muTitle = txt(this, 640, 150, 'Which one is broken?', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.muZh = txt(this, 640, 190, '', 20, '#4f5a6b').setOrigin(0.5);
      this.muMsg = txt(this, 640, 610, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.muTitle, this.muZh, this.muMsg]);
      this.muItems = INSTR.map((k, i) => {
        const x = 640 + (i - 1.5) * 200;
        const b = this.add.container(x, 360);
        const bg = this.add.graphics(); paperCard(bg, -85, -95, 170, 190, 20, 0xffffff, 0xd1c4e9);
        const ic = this.add.graphics({ y: -20 }).setScale(1.6); drawInstr(ic, k);
        const waves = this.add.graphics({ y: -20 });
        const nm = txt(this, 0, 52, k, 26, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
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
      this.fgTitle = txt(this, 640, 150, '', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
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
      this.drSay = txt(this, 640, 150, '', 32, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.drZh = txt(this, 640, 190, '', 20, '#4f5a6b').setOrigin(0.5);
      this.drMsg = txt(this, 640, 612, '', 22, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.drSay, this.drZh, this.drMsg]);
      // A：防災包，8 樣東西 2 排
      this.bagCards = BAG_ITEMS.map((it, i) => {
        const card = this.add.container(355 + (i % 4) * 190, 300 + Math.floor(i / 4) * 150);
        const bg = this.add.graphics();
        const icon = this.add.graphics({ y: -14 }).setScale(1.4); drawBagItem(icon, it.k);
        const name = txt(this, 0, 44, it.en, 20, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 66, it.zh, 16, '#4f5a6b').setOrigin(0.5);
        card.add([bg, icon, name, zh]);
        card.setSize(170, 136).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.toggleBag(i));
        c.add(card);
        return { card, bg, x: card.x };
      });
      this.bagPack = makeButton(this, 560, 560, 220, 60, 0xe65100, 'Pack 裝好了', 24, () => this.packBag());
      // 先不準備：直接演練（防災包沒準備好，演練後設施的裂痕要等明天才能修）
      this.bagSkip = makeButton(this, 800, 560, 200, 60, 0x90a4ae, 'Skip 先不準備', 22, () => this.skipBag());
      c.add([this.bagPack, this.bagSkip]);
      // B：演練，3 張只有圖的動作卡
      this.drCards = DRILL.map((d, i) => {
        const card = this.add.container(640 + (i - 1) * 230, 390);
        const bg = this.add.graphics();
        paperCard(bg, -100, -110, 200, 220, 22, 0xffffff, 0xffcc80);
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
        paperCard(b.bg, -85, -68, 170, 136, 18, on ? 0xfff3e0 : 0xffffff, on ? 0xff9800 : 0xd7ccc8);
      });
      this.bagPack.setVisible(bag);
      this.bagSkip.setVisible(bag);
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

    skipBag() {
      const q = this.dr;
      if (this.modal !== 'drill' || q.part !== 'bag') return;
      q.part = 'drill';
      this.drMsg.setText('');
      this.renderDrill();
      this.time.delayedCall(BOT ? 10 : 600, () => { if (this.dr === q && !q.done) speak(DRILL[0].say); });
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
        this.touch('drill');
        speak('You are safe! Great job!');
        this.renderDrill();
        const crack = this.crackAfterDrill();
        this.drMsg.setText((s.bagReady ? '防災包也準備好了。' : '') + crack);
        s.stardust += 5;
        this.floatText(640, 330, 'Safe!  +5 ★', '#e65100', true);
        this.refreshAll();
        return;
      }
      this.renderDrill();
      // 先把要唸的句子存起來：0.5 秒內玩家可能又答了下一題
      const say = DRILL[q.step].say;
      this.time.delayedCall(BOT ? 10 : 500, () => { if (this.dr === q && !q.done) speak(say); });
    }

    // ---------- 回收站（§4.18）：A 垃圾分類、B 找出池塘汙染的來源 ----------
    buildRecycle() {
      const c = this.modalBase(80, 170, 70, 940, 590, 0xf1f8e9);
      c.add(txt(this, 640, 98, 'Recycle 回收與環境', 28, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5));
      this.rcSay = txt(this, 640, 150, '', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rcZh = txt(this, 640, 188, '', 20, '#4f5a6b').setOrigin(0.5);
      this.rcMsg = txt(this, 640, 612, '', 22, '#33691e', { fontStyle: 'bold' }).setOrigin(0.5);
      this.rcProg = txt(this, 985, 98, '', 22, '#4f5a6b').setOrigin(0.5);
      c.add([this.rcSay, this.rcZh, this.rcMsg, this.rcProg]);
      // A：分類
      this.rcItem = this.add.graphics({ x: 640, y: 290 }).setScale(1.8);
      this.rcItemName = txt(this, 640, 350, '', 20, '#4f5a6b').setOrigin(0.5);
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

    // ---------- 各機制的延伸題：掛在原本的實驗站，每 3 回合有 1 回合換成延伸題，共用實驗室視窗 ----------
    // 回傳 true 表示這次開的是延伸題
    extraTurn(k) {
      const ex = EXTRAS[k];
      if (!ex) return false;
      const s = this.s;
      s.alt = s.alt || {};
      s.alt[k] = (s.alt[k] || 0) + 1;
      if (s.alt[k] % 3 !== 0) return false;
      const list = [].concat(ex), e = list[(s.alt[k] / 3 - 1) % list.length];
      this.openExtra(e.lab, k, e.title);
      return true;
    }

    openExtra(lab, station, title) {
      this.held = null; this.tool = null; this.redrawTools();
      this.modal = 'lab';
      this.labKind = lab;
      this.labStation = station;
      this.rxContent.removeAll(true);
      this.rxMsg.setText('');
      this.rxTitle.setText(title);
      this.rxBox.setVisible(true);
      this['lab_' + lab]();
    }

    // 共用的選擇題流程：qs = [{ say, zh, opts: [{ draw(g), label }], answer, why, after, scene(g), word }]
    // 一題一題來，選錯卡片變淡並說明原因，選對進下一題；全部答完算完成一回合
    runQuiz(statKey, qs, doneMsg) {
      const q = this.xq = { qs, i: 0, done: false };
      const stat = this.stats[statKey] || (this.stats[statKey] = { q: 0, first: 0 });
      const show = () => {
        this.rxContent.removeAll(true);
        const cur = qs[q.i];
        cur.tries = 0; cur.wrong = {}; cur.ok = false;
        q.wait = false;
        this.rxSet(cur.say, cur.zh, cur.hint || '');
        if (cur.scene) { const g = this.rx(this.add.graphics()); cur.scene(g); }
        const n = cur.opts.length, w = n > 3 ? 180 : 200;
        cur.cards = cur.opts.map((o, j) => this.rxCard(640 + (j - (n - 1) / 2) * (w + 20), cur.y || 470, w, 160, (card) => {
          const g = this.add.graphics({ y: -16 }); o.draw(g); card.add(g);
          card.add(txt(this, 0, 58, o.label, 18, '#37474f', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5));
        }, () => pick(j)));
        this.time.delayedCall(200, () => { if (this.xq === q && !cur.ok) speak(cur.say); });
      };
      const pick = (j) => {
        const cur = qs[q.i];
        // 答對後到下一題出現前（約 1.6 秒）舊卡片還在畫面上：這段時間的點擊不算
        if (this.modal !== 'lab' || this.xq !== q || q.done || q.wait || !cur || !cur.wrong || cur.ok || cur.wrong[j]) return;
        const right = j === cur.answer;
        if (cur.tries === 0) {
          stat.q += 1; if (right) stat.first += 1;
          if (cur.word) L.answer(this.s.words, cur.word, { day: this.s.day, options: cur.opts.length, firstTry: right, peeked: false });
        }
        if (!right) {
          cur.tries += 1; cur.wrong[j] = true;
          const c = cur.cards[j]; c.setAlpha(0.35); this.rxShake(c);
          this.rxMsg.setText(cur.why || 'Try again. 再想想看');
          speak('Try again.');
          return;
        }
        cur.ok = true;
        speak(cur.yes || 'Yes!');
        this.rxMsg.setText(cur.after || 'Yes! 對了');
        if (cur.result) { const g = this.rx(this.add.graphics()); cur.result(g); }
        q.i += 1;
        q.wait = true;
        if (q.i < qs.length) this.time.delayedCall(BOT ? 20 : 1600, () => { if (this.xq === q && this.modal === 'lab') show(); });
        else { q.done = true; this.labDone(this.labStation || statKey, doneMsg); }
      };
      q.pickAt = pick;                     // 機器人與回歸測試用
      q.cur = () => qs[q.i];
      show();
    }

    // --- §4.7 冰塊：放哪裡最晚融化、最早融化 ---
    lab_ice() {
      ['ice', 'hot', 'cold'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const cube = (g, x, y) => { g.fillStyle(0xe1f5fe, 1); g.fillRect(x - 12, y - 12, 24, 24); g.lineStyle(2, 0x81d4fa, 1); g.strokeRect(x - 12, y - 12, 24, 24); };
      const opts = [
        { draw: (g) => { g.fillStyle(0xffd54a, 1); g.fillCircle(-26, -26, 14); g.lineStyle(3, 0xffb300, 1); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.lineBetween(-26 + Math.cos(a) * 18, -26 + Math.sin(a) * 18, -26 + Math.cos(a) * 24, -26 + Math.sin(a) * 24); } cube(g, 10, 14); }, label: '晒太陽 in the sun' },
        { draw: (g) => { g.fillStyle(0x6d4c41, 1); g.fillRect(-30, -20, 8, 40); g.fillStyle(0x2e8b3a, 1); g.fillCircle(-26, -30, 22); g.fillStyle(0x1b5e20, 0.25); g.fillEllipse(6, 22, 70, 18); cube(g, 10, 12); }, label: '樹蔭下 in the shade' },
        { draw: (g) => { g.fillStyle(0x1e88e5, 1); g.fillRoundedRect(-34, -16, 68, 44, 6); g.fillStyle(0xffffff, 1); g.fillRect(-34, -22, 68, 10); cube(g, 0, 6); }, label: '保冷箱 in a cooler' },
      ];
      this.runQuiz('ice', [
        { say: 'Where will the ice melt last?', zh: '冰塊放在哪裡，會最晚融化？', opts, answer: 2, why: '想想哪裡最不會被熱到。保冷箱可以擋住外面的熱', after: 'The cooler keeps the heat out. 保冷箱擋住外面的熱，冰最慢融化' },
        { say: 'Where will the ice melt first?', zh: '冰塊放在哪裡，會最早融化？', opts, answer: 0, why: '想想哪裡最熱', after: 'The sun is hot! 太陽的熱讓冰融化得最快' },
        this.pondQ(),
      ], 'Cool!');
    }

    // 冷天池塘結冰（§4.7）：很冷的晚上，池塘的水會變成什麼？3 選 1，記在 ice
    pondQ() {
      L.seen(this.s.words, 'steam', this.s.day);
      const pond = (g, c) => { g.fillStyle(0x8d6e63, 1); g.fillEllipse(0, 10, 120, 50); g.fillStyle(c, 1); g.fillEllipse(0, 6, 104, 38); };
      const opts = L.shuffle([
        { k: 'ice', label: 'ice 冰', draw: (g) => { pond(g, 0xe1f5fe); g.lineStyle(2, 0x90caf9, 1); g.lineBetween(-30, 0, -6, 12); g.lineBetween(-6, 12, 14, 2); g.lineBetween(14, 2, 34, 14); } },
        { k: 'steam', label: 'steam 水蒸氣', draw: (g) => { pond(g, 0x64b5f6); g.lineStyle(3, 0xffffff, 0.9); [-20, 0, 20].forEach((x) => { g.beginPath(); g.moveTo(x, -6); g.lineTo(x - 6, -20); g.lineTo(x + 4, -32); g.lineTo(x - 4, -46); g.strokePath(); }); } },
        { k: 'water', label: 'water 還是水', draw: (g) => { pond(g, 0x42a5f5); g.lineStyle(2, 0xbbdefb, 1); g.strokeEllipse(-14, 6, 30, 10); g.strokeEllipse(18, 10, 22, 8); } },
      ]);
      const scene = (g) => {
        g.fillStyle(0x1a237e, 1); g.fillRoundedRect(500, 250, 280, 120, 16);
        g.fillStyle(0xfff9c4, 1); g.fillCircle(560, 290, 18); g.fillStyle(0x1a237e, 1); g.fillCircle(570, 284, 16);
        g.fillStyle(0xffffff, 1); [[620, 280], [660, 300], [700, 270], [740, 310], [690, 340]].forEach(([x, y]) => g.fillCircle(x, y, 3));
      };
      return { say: 'It is very cold tonight. What will the pond water become?', zh: '今晚非常冷，池塘的水會變成什麼？', scene, opts, answer: opts.findIndex((o) => o.k === 'ice'), word: 'ice', y: 500,
        why: '很冷的時候，水會變硬；加熱時才會冒水蒸氣', after: 'Water turns into ice when it is very cold. 很冷的時候，水會結成冰' };
    }

    // --- §4.12 磁鐵推船：一樣的極互相推開，不一樣的極互相吸引 ---
    lab_poles() {
      ['magnet', 'push', 'pull'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const boat = Math.random() < 0.5 ? 'N' : 'S';
      const other = boat === 'N' ? 'S' : 'N';
      const color = (p) => (p === 'N' ? 0xe53935 : 0x1e88e5);
      const scene = (g) => {
        g.fillStyle(0x4fc3f7, 0.6); g.fillRect(420, 280, 440, 70);
        g.fillStyle(0x8d6e63, 1); g.fillTriangle(560, 300, 720, 300, 700, 330); g.fillTriangle(560, 300, 580, 330, 700, 330);
        // 船上的磁鐵：面向左邊（玩家這邊）的是 boat 極
        g.fillStyle(color(boat), 1); g.fillRect(560, 282, 40, 18); g.fillStyle(color(other), 1); g.fillRect(600, 282, 40, 18);
        g.fillStyle(0xffffff, 1); g.fillCircle(580, 291, 7); g.fillStyle(0x27384a, 1);
        const lbl = (p, x) => { g.lineStyle(2, 0x27384a, 1); if (p === 'N') { g.lineBetween(x - 4, 296, x - 4, 286); g.lineBetween(x - 4, 286, x + 4, 296); g.lineBetween(x + 4, 296, x + 4, 286); } else { g.beginPath(); g.arc(x, 288, 3, 0, Math.PI * 1.5, false); g.strokePath(); g.beginPath(); g.arc(x, 294, 3, Math.PI, Math.PI * 2.5, false); g.strokePath(); } };
        lbl(boat, 580);
      };
      const card = (p) => ({ draw: (g) => { g.fillStyle(color(p === 'N' ? 'S' : 'N'), 1); g.fillRect(-40, -12, 40, 24); g.fillStyle(color(p), 1); g.fillRect(0, -12, 40, 24); g.fillStyle(0xffffff, 1); g.fillCircle(24, 0, 9); }, label: (p === 'N' ? '紅色 N 極' : '藍色 S 極') + '朝向船' });
      const opts = [card('N'), card('S')];
      this.runQuiz('poles', [
        { say: 'Push the boat away!', zh: '把船推開！要用哪一極朝向船上的磁鐵？', scene, opts, answer: boat === 'N' ? 0 : 1, why: '一樣的極會互相推開', after: 'Same poles push. 一樣的極互相推開，船開走了！' },
        { say: 'Pull the boat to you!', zh: '把船拉過來！要用哪一極朝向船上的磁鐵？', scene, opts, answer: boat === 'N' ? 1 : 0, why: '不一樣的極會互相吸引', after: 'Different poles pull. 不一樣的極互相吸引，船過來了！' },
      ], 'Great!');
    }

    // --- §4.15 擋牆：大雨後水流會沖走沙地，牆要擋在水流過來的路上 ---
    lab_wall() {
      ['rain', 'sand', 'rock'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const left = Math.random() < 0.5;            // 水流往左下或右下
      const sandX = left ? 430 : 850;
      const spots = L.shuffle([
        { x: left ? 535 : 745, y: 360, good: true },  // 在水流的路上、沙地上方
        { x: left ? 805 : 475, y: 360, good: false }, // 另一邊，沒有水流過
        { x: 640, y: 262, good: false },              // 山頂，雨還沒聚成水流
      ]);
      const names = ['A', 'B', 'C'];
      const scene = (g) => {
        g.fillStyle(0x8d6e63, 1); g.fillTriangle(420, 440, 860, 440, 640, 245);
        g.fillStyle(0x78909c, 1); g.fillCircle(560, 225, 16); g.fillCircle(588, 218, 20); g.fillCircle(616, 225, 16);
        g.lineStyle(2, 0x1e88e5, 1); [568, 588, 608].forEach((x) => g.lineBetween(x, 244, x - 4, 256));
        g.fillStyle(0xe8cf8f, 1); g.fillEllipse(sandX, 450, 150, 36);
        // 水流路徑（箭頭）
        g.lineStyle(6, 0x4fc3f7, 0.9);
        const pts = left ? [[640, 270], [590, 320], [540, 380], [470, 440]] : [[640, 270], [690, 320], [740, 380], [810, 440]];
        for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        spots.forEach((p, i) => { g.lineStyle(3, 0xffffff, 1); g.strokeRect(p.x - 26, p.y - 14, 52, 28); });
        this.rx(txt(this, sandX, 452, '沙地', 16, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5));
        spots.forEach((p, i) => this.rx(txt(this, p.x, p.y, names[i], 20, '#ffffff', { fontStyle: 'bold', stroke: '#2b3a55', strokeThickness: 4 }).setOrigin(0.5)));
      };
      const opts = spots.map((p, i) => ({ draw: (g) => { g.fillStyle(0x9e9e9e, 1); g.fillRect(-30, -6, 60, 16); g.lineStyle(2, 0x616161, 1); for (let x = -30; x < 30; x += 12) g.strokeRect(x, -6, 12, 8); }, label: '蓋在 ' + names[i] }));
      this.runQuiz('wall', [
        { say: 'Heavy rain is coming! Where should we build the wall?', zh: '大雨要來了！擋牆要蓋在哪裡，才能保護沙地？', scene, opts, answer: spots.findIndex((p) => p.good), y: 560,
          why: '看看藍色的水會流到哪裡；牆要擋在水流過來的路上', after: 'The water goes around. 水被擋住，沙地沒有被沖走！' },
      ], 'Safe sand!');
    }

    // --- §4.9 影子：影子在物體背對光的那一邊 ---
    lab_shadow() {
      ['shadow', 'light', 'left', 'right'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const mk = (lampLeft) => {
        const scene = (g) => {
          g.fillStyle(0x37474f, 1); g.fillRect(380, 360, 520, 8);
          g.fillStyle(0x8d6e63, 1); g.fillRect(610, 270, 60, 90);
          const lx = lampLeft ? 440 : 840;
          g.fillStyle(0xfff59d, 0.5); g.fillCircle(lx, 270, 30); g.fillStyle(0xffd54a, 1); g.fillCircle(lx, 270, 16);
          g.fillStyle(0x455a64, 1); g.fillRect(lx - 3, 286, 6, 74);
        };
        const pic = (side) => (g) => { g.fillStyle(0x37474f, 1); g.fillRect(-50, 22, 100, 4); g.fillStyle(0x8d6e63, 1); g.fillRect(-12, -20, 24, 42);
          g.fillStyle(0x000000, 0.55); if (side === 'top') g.fillRect(-12, -30, 24, 10); else g.fillRect(side === 'left' ? -46 : 12, 14, 34, 8); };
        return { say: 'Where is the shadow?', zh: '燈在' + (lampLeft ? '左' : '右') + '邊，影子在哪裡？', scene,
          opts: [{ draw: pic('left'), label: '左邊 left' }, { draw: pic('right'), label: '右邊 right' }, { draw: pic('top'), label: '上面 on top' }],
          answer: lampLeft ? 1 : 0, why: '光被物體擋住的地方才會有影子：在物體背對燈的那一邊', after: 'The shadow is on the other side. 影子在背對燈的那一邊', y: 500 };
      };
      const first = Math.random() < 0.5;
      this.runQuiz('shadow', [mk(first), mk(!first)], 'Bright!');
    }

    // --- §4.14 風車與水車：風車要放在風大的地方，水車要放在有流水的地方 ---
    lab_mill() {
      ['wind', 'windy', 'water'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const hill = (g) => { g.fillStyle(0x7cb342, 1); g.fillTriangle(-50, 30, 50, 30, 0, -24); g.lineStyle(3, 0xffffff, 0.9); g.lineBetween(-40, -30, -10, -30); g.lineBetween(-30, -20, 4, -20); };
      const house = (g) => { g.fillStyle(0xffcc80, 1); g.fillRect(-30, -6, 60, 36); g.fillStyle(0xe65100, 1); g.fillTriangle(-38, -6, 38, -6, 0, -32); };
      const tree = (g) => { g.fillStyle(0x6d4c41, 1); g.fillRect(-5, -6, 10, 36); g.fillStyle(0x2e8b3a, 1); g.fillCircle(0, -18, 24); };
      const river = (g) => { g.fillStyle(0x4fc3f7, 1); g.fillRect(-50, 0, 100, 24); g.lineStyle(3, 0xffffff, 0.9); g.lineBetween(-36, 10, -16, 10); g.lineBetween(4, 16, 24, 16); };
      const garden = (g) => { g.fillStyle(0x8d6e4a, 1); g.fillEllipse(0, 18, 90, 20); [-24, 0, 24].forEach((x) => { g.fillStyle(0x43a047, 1); g.fillRect(x - 1, -4, 3, 20); g.fillStyle(0xe53956, 1); g.fillCircle(x, -6, 6); }); };
      this.runQuiz('mill', [
        { say: 'Where should the windmill go?', zh: '風車要放在哪裡才會轉？', opts: L.shuffle([{ draw: hill, label: '風大的山頂', k: 1 }, { draw: house, label: '屋子裡', k: 0 }, { draw: tree, label: '大樹下', k: 0 }]),
          why: '風車要有風吹才會轉', after: 'The wind turns the windmill. 風推動風車轉動' },
        { say: 'Where should the waterwheel go?', zh: '水車要放在哪裡才會轉？', opts: L.shuffle([{ draw: river, label: '流動的河邊', k: 1 }, { draw: hill, label: '山頂', k: 0 }, { draw: garden, label: '花園', k: 0 }]),
          why: '水車要有流動的水推才會轉', after: 'The water turns the wheel. 流水推動水車轉動' },
      ].map((q) => Object.assign(q, { answer: q.opts.findIndex((o) => o.k) })), 'Strong!');
    }

    // --- §4.13 串聯與並聯：並聯時兩盞燈比較亮，壞一盞另一盞還會亮 ---
    lab_series() {
      ['lamp', 'light'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const bulb = (g, x, y, on) => { g.fillStyle(on === 2 ? 0xffeb3b : (on === 1 ? 0xfff59d : 0xeceff1), 1); g.fillCircle(x, y, 9); g.lineStyle(2, 0x90a4ae, 1); g.strokeCircle(x, y, 9); };
      const series = (bright) => (g) => { g.lineStyle(3, 0x78909c, 1); g.strokeRect(-56, -26, 112, 52); g.fillStyle(0x455a64, 1); g.fillRect(-62, -10, 12, 20); bulb(g, -10, -26, bright); bulb(g, 24, -26, bright); };
      const parallel = (bright) => (g) => { g.lineStyle(3, 0x78909c, 1); g.strokeRect(-56, -30, 112, 60); g.lineBetween(-56, 0, 56, 0); g.fillStyle(0x455a64, 1); g.fillRect(-62, -10, 12, 20); bulb(g, 10, -30, bright); bulb(g, 10, 0, bright); };
      this.runQuiz('series', [
        { say: 'Which way makes both lamps brighter?', zh: '哪一種接法，兩盞燈比較亮？', opts: [{ draw: series(1), label: '一條路（串聯）' }, { draw: parallel(2), label: '兩條路（並聯）' }], answer: 1,
          why: '串聯時兩盞燈要分同一條路的電，比較暗', after: 'Each lamp gets its own path. 並聯時每盞燈各有一條路，比較亮' },
        { say: 'One lamp breaks. Which way keeps the other lamp on?', zh: '有一盞燈壞了，哪一種接法另一盞還會亮？', opts: [{ draw: series(0), label: '一條路（串聯）' }, { draw: parallel(2), label: '兩條路（並聯）' }], answer: 1,
          why: '串聯只有一條路，一盞壞了整條就斷了', after: 'The other path still works. 並聯還有另一條路，燈還會亮' },
      ], 'Bright!');
    }

    // --- §4.22 隔音牆：牆要擋在聲音傳過去的路上；厚牆擋得比較多 ---
    lab_noise() {
      ['noise', 'noisy', 'quiet'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const spots = [{ x: 390, label: 'A' }, { x: 640, label: 'B' }, { x: 890, label: 'C' }];
      const scene = (g) => {
        g.fillStyle(0x8fbf7a, 1); g.fillRect(320, 360, 640, 10);
        // 左：吵的機器；右：房子
        g.fillStyle(0x78909c, 1); g.fillRect(450, 300, 70, 60); g.fillStyle(0x455a64, 1); g.fillCircle(470, 330, 10); g.fillCircle(500, 330, 10);
        g.lineStyle(3, 0xe53935, 0.8); [24, 38].forEach((r) => { g.beginPath(); g.arc(520, 320, r, -0.7, 0.7, false); g.strokePath(); });
        g.fillStyle(0xffcc80, 1); g.fillRect(760, 300, 80, 60); g.fillStyle(0xe65100, 1); g.fillTriangle(750, 300, 850, 300, 800, 266);
        spots.forEach((p) => { g.lineStyle(3, 0x27384a, 0.6); g.strokeRect(p.x - 10, 280, 20, 80); });
        spots.forEach((p) => this.rx(txt(this, p.x, 262, p.label, 20, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5)));
        this.rx(txt(this, 485, 380, '吵的機器', 16, '#455a64').setOrigin(0.5)); this.rx(txt(this, 800, 380, '房子', 16, '#455a64').setOrigin(0.5));
      };
      const wallCard = (lbl) => ({ draw: (g) => { g.fillStyle(0x9e9e9e, 1); g.fillRect(-8, -26, 16, 52); }, label: '蓋在 ' + lbl });
      this.runQuiz('noise', [
        { say: 'It is too noisy! Where should the wall go?', zh: '太吵了！隔音牆要蓋在哪裡，房子才會安靜？', scene, opts: spots.map((p) => wallCard(p.label)), answer: 1, y: 500,
          why: '牆要擋在聲音從機器傳到房子的路上', after: 'The wall blocks the noise. 牆擋住了聲音，房子安靜了' },
        { say: 'Which wall blocks more noise?', zh: '哪一種牆擋住的聲音比較多？', opts: [{ draw: (g) => { g.fillStyle(0xd7ccc8, 1); g.fillRect(-4, -30, 8, 60); }, label: '薄木板' }, { draw: (g) => { g.fillStyle(0x9e9e9e, 1); g.fillRect(-22, -30, 44, 60); g.lineStyle(2, 0x616161, 1); for (let y = -30; y < 30; y += 12) g.lineBetween(-22, y, 22, y); }, label: '厚厚的磚牆' }], answer: 1,
          why: '想想哪一種比較不容易讓聲音穿過去', after: 'A thick wall is quieter. 厚牆擋住比較多聲音' },
      ], 'Quiet!');
    }

    // --- §4.23 礦物與用途 ---
    lab_mineral() {
      const ms = [
        { k: 'sand',     label: '沙（石英）',   draw: (g) => drawSoil(g, 'sand', 1) },
        { k: 'iron',     label: '鐵礦',         draw: (g) => { g.fillStyle(0x6d4c41, 1); g.fillCircle(-6, 4, 14); g.fillCircle(8, 0, 12); g.fillStyle(0xb0bec5, 1); g.fillCircle(2, -2, 4); g.fillCircle(-8, 8, 3); } },
        { k: 'salt',     label: '鹽（岩鹽）',   draw: (g) => { g.fillStyle(0xffffff, 1); [[-10, 6], [6, 8], [0, -6], [12, -4]].forEach(([x, y]) => g.fillRect(x - 6, y - 6, 12, 12)); g.lineStyle(1, 0xbdbdbd, 1); g.strokeRect(-16, 0, 12, 12); } },
        { k: 'graphite', label: '石墨',         draw: (g) => { g.fillStyle(0x424242, 1); g.fillRoundedRect(-18, -10, 36, 22, 6); g.fillStyle(0x757575, 1); g.fillRect(-12, -6, 20, 4); } },
      ];
      const uses = L.shuffle([
        { say: 'Which one do we use to make glass?', zh: '做玻璃要用哪一種？', ans: 'sand', after: 'Glass is made from sand. 玻璃是用沙（石英）燒成的' },
        { say: 'Which one is in a pencil?', zh: '鉛筆芯是用哪一種做的？', ans: 'graphite', after: 'Pencil lead is graphite. 鉛筆芯其實是石墨，不是鉛' },
        { say: 'Which one do we use to make nails?', zh: '鐵釘是用哪一種做的？', ans: 'iron', after: 'Nails are made of iron. 鐵礦煉成鐵，才能做鐵釘' },
        { say: 'Which one do we put in food?', zh: '煮菜時會加哪一種？', ans: 'salt', after: 'We put salt in food. 鹽也是一種礦物' },
      ]).slice(0, 2);
      L.seen(this.s.words, 'mineral', this.s.day);
      this.runQuiz('mineral', uses.map((u) => {
        const opts = L.shuffle(ms);
        return { say: u.say, zh: u.zh, opts, answer: opts.findIndex((m) => m.k === u.ans), word: u.ans === 'graphite' ? null : u.ans, why: '想想看它的特性：透明的、黑黑滑滑的、硬硬的、鹹鹹的', after: u.after };
      }), 'Great!');
    }

    // --- §4.23 河流彎道：彎道外側水流最快、沖刷最強，堤防蓋在那裡；內側水流慢，沙子堆積 ---
    lab_levee() {
      ['river', 'house', 'sand'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const flip = Math.random() < 0.5;
      const X = (x) => (flip ? 1280 - x : x);
      const pts = [[480, 240], [590, 262], [680, 300], [720, 350], [680, 400], [590, 438], [480, 460]].map(([x, y]) => [X(x), y]);
      const spots = L.shuffle([
        { k: 'out', x: X(790), y: 350 },   // 彎道外側，房子就在旁邊
        { k: 'in', x: X(610), y: 350 },    // 彎道內側
        { k: 'up', x: X(420), y: 290 },    // 上游直直的地方
      ]);
      const names = ['A', 'B', 'C'];
      const scene = (g) => {
        g.fillStyle(0xa5d6a7, 1); g.fillRoundedRect(380, 228, 520, 250, 20);
        g.lineStyle(30, 0x4fc3f7, 1);
        for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        g.fillStyle(0x4fc3f7, 1); pts.forEach(([x, y]) => g.fillCircle(x, y, 15));
        // 水流方向的小箭頭
        g.fillStyle(0xffffff, 1);
        [1, 3, 5].forEach((i) => {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          g.fillTriangle(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, cx + Math.cos(a + 2.4) * 8, cy + Math.sin(a + 2.4) * 8, cx + Math.cos(a - 2.4) * 8, cy + Math.sin(a - 2.4) * 8);
        });
        // 彎道外側的房子
        const hx = X(860);
        g.fillStyle(0xffcc80, 1); g.fillRect(hx - 22, 336, 44, 34); g.fillStyle(0xd84315, 1); g.fillTriangle(hx - 28, 338, hx + 28, 338, hx, 312);
        spots.forEach((p) => { g.lineStyle(3, 0xffffff, 1); g.strokeRect(p.x - 22, p.y - 16, 44, 32); g.fillStyle(0x37474f, 0.35); g.fillRect(p.x - 22, p.y - 16, 44, 32); });
        spots.forEach((p, i) => this.rx(txt(this, p.x, p.y, names[i], 20, '#ffffff', { fontStyle: 'bold', stroke: '#2b3a55', strokeThickness: 4 }).setOrigin(0.5)));
      };
      const card = (draw) => spots.map((p, i) => ({ draw, label: '在 ' + names[i] }));
      const wall = (g) => { g.fillStyle(0x9e9e9e, 1); g.fillRect(-30, -6, 60, 16); g.lineStyle(2, 0x616161, 1); for (let x = -30; x < 30; x += 12) g.strokeRect(x, -6, 12, 8); };
      const sandPile = (g) => { g.fillStyle(0xe8cf8f, 1); g.fillEllipse(0, 6, 70, 26); g.fillStyle(0xd7b56d, 1); g.fillCircle(-12, 4, 3); g.fillCircle(10, 8, 3); };
      this.runQuiz('levee', [
        { say: 'The river turns here. Where should we build the wall?', zh: '河流在這裡轉彎。大水來時，堤防要蓋在哪裡才能保護房子？', scene, opts: card(wall), answer: spots.findIndex((p) => p.k === 'out'), y: 570,
          why: '河流轉彎時，水會衝向彎道的外側', after: 'The water is fast on the outside. 彎道外側水流最快、沖得最兇，堤防擋住了大水' },
        { say: 'Where will the sand stay?', zh: '河水帶來的沙子，會在哪裡慢慢堆起來？', scene, opts: card(sandPile), answer: spots.findIndex((p) => p.k === 'in'), y: 570,
          why: '水流慢的地方，沙子才停得下來', after: 'The water is slow on the inside. 彎道內側水流慢，沙子堆成小沙灘' },
      ], 'Safe house!');
    }

    // --- §4.25 颱風天：颱風來前先修好有裂縫的設施；颱風來時待在屋子裡最安全 ---
    lab_storm() {
      ['typhoon', 'safe', 'house', 'wind'].forEach((w) => L.seen(this.s.words, w, this.s.day));
      const fix = L.shuffle([
        { k: 'crack', label: '有裂縫的橋', draw: (g) => { g.fillStyle(0x8d6e63, 1); g.fillRect(-50, -6, 100, 14); g.fillRect(-46, 8, 8, 26); g.fillRect(38, 8, 8, 26); g.fillStyle(0xffffff, 1); g.fillTriangle(-8, -6, 6, -6, -2, 8); g.lineStyle(3, 0x3e2723, 1); g.lineBetween(-8, -6, -2, 8); g.lineBetween(6, -6, -2, 8); } },
        { k: 'well', label: '好好的水井', draw: (g) => { g.fillStyle(0x9e9e9e, 1); g.fillRect(-26, -4, 52, 36); g.fillStyle(0x6d4c41, 1); g.fillRect(-30, -36, 6, 34); g.fillRect(24, -36, 6, 34); g.fillRect(-32, -40, 64, 8); } },
        { k: 'kite', label: '天上的風箏', draw: (g) => { prepIcon(g, 'kite'); } },
      ]);
      const where = L.shuffle([
        { k: 'house', label: '屋子裡 in the house', draw: (g) => { g.fillStyle(0xffcc80, 1); g.fillRect(-28, -6, 56, 40); g.fillStyle(0xd84315, 1); g.fillTriangle(-36, -4, 36, -4, 0, -36); g.fillStyle(0x6d4c41, 1); g.fillRect(-8, 12, 16, 22); } },
        { k: 'beach', label: '海邊 on the beach', draw: (g) => { g.fillStyle(0xe8cf8f, 1); g.fillRect(-40, 14, 80, 20); g.fillStyle(0x4fc3f7, 1); g.fillRect(-40, -10, 80, 24); g.lineStyle(3, 0xffffff, 1); g.lineBetween(-30, -2, -10, -8); g.lineBetween(4, -2, 24, -8); } },
        { k: 'tree', label: '大樹下 under a tree', draw: (g) => { g.fillStyle(0x6d4c41, 1); g.fillRect(-6, -4, 12, 38); g.fillStyle(0x2e8b3a, 1); g.fillCircle(0, -18, 28); } },
      ]);
      const cloud = (g) => {
        g.fillStyle(0x546e7a, 1); g.fillCircle(600, 280, 30); g.fillCircle(640, 268, 38); g.fillCircle(682, 280, 30);
        g.lineStyle(3, 0x1e88e5, 1); [590, 620, 650, 680].forEach((x) => g.lineBetween(x, 316, x - 8, 340));
        g.lineStyle(4, 0xb0bec5, 1); g.lineBetween(720, 300, 800, 290); g.lineBetween(720, 320, 790, 318);
      };
      this.runQuiz('storm', [
        { say: 'A typhoon is coming. What should we fix first?', zh: '颱風要來了！要先修好哪一個？', scene: cloud, opts: fix, answer: fix.findIndex((o) => o.k === 'crack'), y: 480,
          why: '強風大雨會把有裂縫的地方弄得更壞', after: 'Fix it before the typhoon comes. 颱風來之前先補好裂縫，橋就不會被吹壞' },
        { say: 'The wind is very strong. Where is safe?', zh: '風好大！颱風來的時候，待在哪裡最安全？', scene: cloud, opts: where, answer: where.findIndex((o) => o.k === 'house'), y: 480,
          why: '海邊有大浪，大樹可能被吹倒', after: 'Stay in the house. 颱風天待在屋子裡最安全' },
      ], 'Safe!');
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
        const en = txt(this, 0, 24, st.en, 17, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
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
      this.rxSay = txt(this, 640, 148, '', 28, '#2b3a55', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
      this.rxZh = txt(this, 640, 186, '', 19, '#4f5a6b').setOrigin(0.5);
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
      const bg = this.add.graphics(); paperCard(bg, -w / 2, -h / 2, w, h, 18, 0xffffff, 0xb2dfdb);
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
      if (this.extraTurn(k)) return;
      this.modal = 'lab';
      this.labKind = k;
      this.labStation = null;
      this.rxContent.removeAll(true);
      this.rxMsg.setText('');
      this.rxTitle.setText(st.en + ' ' + st.zh);
      this.rxBox.setVisible(true);
      this['lab_' + k]();
    }

    labDone(key, msg) {
      this.stationDone(key, 3, msg);
      const k = this.labKind, extra = !!this.labStation;
      this.time.delayedCall(BOT ? 30 : 1800, () => {
        if (this.modal !== 'lab' || this.labKind !== k) return;
        if (extra) this.closeModal(); else this.openLab(k);
      });
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

    // 生態園每天的變化（§4.20 長期經營）：第一次打開食物鏈站之後才開始
    ecoDay() {
      const e = this.s.eco;
      if (!e) return;
      foodStep(e);
      e.ev = null;
      if (ecoProblem(e) < 0) {
        e.calm = (e.calm || 0) + 1;
        if (e.calm >= 3 && Math.random() < 0.35) {
          const ev = ECO_EVENTS[Math.floor(Math.random() * ECO_EVENTS.length)];
          ev.apply(e); e.ev = ev.k; e.calm = 0;
        }
      } else e.calm = 0;
      if (ecoProblem(e) < 0) { e.okDays = (e.okDays || 0) + 1; e.fixed = false; }
    }

    // --- 食物鏈（§4.20）：承載量模型，每天向平衡值靠近，不會滅絕 ---
    // 生態園有狀況時處理自己的生態園（選對的處置會留下來）；平衡時拿練習題來做
    lab_food() {
      const s = this.s;
      if (!s.eco) s.eco = { A: 3, G: 30, R: 3, F: 1, okDays: 0, calm: 0, ev: null };
      const prob = ecoProblem(s.eco);
      const live = prob >= 0 && !s.eco.fixed;
      const sc = live ? Object.assign({}, FOOD_CASES[prob], { start: Object.assign({}, s.eco) }) : FOOD_CASES[Math.floor(Math.random() * FOOD_CASES.length)];
      const q = this.xq = { sc, live, eco: Object.assign({}, sc.start), tries: 0, done: false, order: L.shuffle(FOOD_ACTS.map((a, i) => i)), busy: false };
      const ev = live && ECO_EVENTS.find((x) => x.k === s.eco.ev);
      this.rxSet(sc.say, (ev ? ev.zh + '！' : '') + sc.zh,
        live ? '這是你的生態園，選的辦法會留下來'
          : prob >= 0 ? '你的生態園正在慢慢恢復，先來做練習題'
          : '你的生態園今天很平衡（平衡 ' + (s.eco.okDays || 0) + ' 天），來做練習題');
      q.board = this.rx(this.add.graphics());
      q.nums = ['grass', 'rabbit', 'fox'].map((k, i) => this.rx(txt(this, 520, 250 + i * 70, '', 26, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0, 0.5)));
      q.icons = ['grass', 'rabbit', 'fox'].map((k, i) => { const g = this.add.graphics({ x: 330, y: 250 + i * 70 }); if (k === 'fox') foxIcon(g); else drawIcon(g, k); return this.rx(g); });
      q.dayT = this.rx(txt(this, 820, 220, q.live ? 'My island 我的生態園' : 'Practice 練習', 18, '#4f5a6b').setOrigin(0.5));
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
            if (q.live) {
              const e = this.s.eco;
              act.apply(e); e.A = Math.min(ECO_MAX_A, e.A); e.ev = null; e.fixed = true;
            }
            this.rxSet('The island is in balance!', '草、兔子、狐狸都穩定下來了！', q.live ? '你的生態園之後每天會照這樣慢慢變好' : '');
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
      q.slots = w.split('').map((ch, i) => this.rx(txt(this, 640 + (i - (w.length - 1) / 2) * 56, 350, '_', 44, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5)));
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

    // ---------- 家長端（§3.6）：長按設定 3 秒＋兩位數加法；資料只存本機 ----------
    touch(key) { const t = this.s.touched || (this.s.touched = {}); t[key] = (t[key] || 0) + 1; }

    buildParent() {
      const c = this.modalBase(110, 120, 40, 1040, 640, 0xffffff);
      this.paTitle = txt(this, 640, 78, '家長端', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add(this.paTitle);
      this.paContent = this.add.container(0, 0);
      c.add(this.paContent);
      this.closeButton(c, 1130, 80, () => this.closeModal());
      this.paBox = c;
    }

    // 加進家長端內容，固定在畫面上
    pa(o) { const fix = (x) => { if (x.setScrollFactor) x.setScrollFactor(0); if (x.list) x.list.forEach(fix); }; fix(o); this.paContent.add(o); return o; }
    paText(x, y, str, size, color, extra) { return this.pa(txt(this, x, y, str, size, color || '#2b3a55', extra)); }

    // 長按設定 3 秒才會進來；先出一題兩位數加法，用數字鍵輸入（不是選擇題，孩子亂猜進不來）
    openParentGate() {
      if (this.modal && this.modal !== 'settings') return;
      [this.setBox].forEach((b) => b.setVisible(false));
      this.modal = 'parent';
      const a = 12 + Math.floor(Math.random() * 30), b = 11 + Math.floor(Math.random() * 30);
      this.pg = { a, b, input: '' };
      this.paContent.removeAll(true);
      this.paTitle.setText('家長確認');
      this.paBox.setVisible(true);
      this.paText(640, 160, '請家長回答：' + a + ' + ' + b + ' = ?', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.pgShow = this.paText(640, 220, '', 40, '#1e88e5', { fontStyle: 'bold' }).setOrigin(0.5);
      this.pgMsg = this.paText(640, 600, '', 20, '#c62828').setOrigin(0.5);
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'OK'].forEach((k, i) => {
        const x = 520 + (i % 3) * 120, y = 300 + Math.floor(i / 3) * 74;
        this.pa(makeButton(this, x, y, 104, 60, k === 'OK' ? 0x43a047 : 0x90a4ae, k, 26, () => this.gateKey(k)));
      });
    }

    gateKey(k) {
      const g = this.pg;
      if (k === '←') g.input = g.input.slice(0, -1);
      else if (k === 'OK') {
        if (Number(g.input) === g.a + g.b) { this.openParent('summary'); return; }
        this.pgMsg.setText('答案不對，請再試一次'); g.input = '';
      } else if (g.input.length < 3) g.input += k;
      this.pgShow.setText(g.input);
    }

    openParent(tab) {
      this.modal = 'parent';
      this.paTab = tab;
      this.paContent.removeAll(true);
      this.paTitle.setText('家長端');
      this.paBox.setVisible(true);
      const tabs = [['summary', '總覽'], ['words', '單字'], ['curr', '課綱'], ['reset', '重設']];
      tabs.forEach(([k, label], i) => this.pa(makeButton(this, 300 + i * 160, 130, 140, 50, k === tab ? 0x1e88e5 : 0xb0bec5, label, 22, () => this.openParent(k))));
      this['parent_' + tab]();
    }

    parent_summary() {
      const s = this.s, min = Math.round((s.playSec || 0) / 60);
      const zones = [['草地', true], ['池塘森林', s.forestOpen], ['海灘', s.beachOpen], ['洞穴', s.caveOpen], ['燈塔', s.lightOpen], ['研究島', this.researchOpen()]];
      const words = Object.keys(s.words).filter((w) => (s.words[w].ok || 0) + (s.words[w].miss || 0) > 0);
      const okSum = words.reduce((a, w) => a + s.words[w].ok, 0), missSum = words.reduce((a, w) => a + s.words[w].miss, 0);
      const lines = [
        '遊玩時間：約 ' + min + ' 分鐘（遊戲內第 ' + s.day + ' 天）',
        '開放的區域：' + zones.filter((z) => z[1]).map((z) => z[0]).join('、'),
        '作答過的單字：' + words.length + ' 個（答對 ' + okSum + ' 次、答錯或用提示 ' + missSum + ' 次）',
        '提示已淡出的字：階段 1 有 ' + words.filter((w) => s.words[w].stage === 1).length + ' 個、階段 2 有 ' + words.filter((w) => s.words[w].stage === 2).length + ' 個',
        '日記：' + s.diary.length + ' 頁　圖鑑：' + this.libCount() + ' / ' + LIB.length + ' 項　星砂：' + s.stardust,
        '',
        '說明：「答對」只算有 3 個以上選項、第一次就選對、沒用提示的情況。',
        '只有 2 個選項的科學題（例如熱水或冷水）不算進單字答對。',
        '所有資料只存在這台裝置的瀏覽器裡。',
      ];
      lines.forEach((l, i) => this.paText(200, 200 + i * 44, l, 22, i >= 6 ? '#4f5a6b' : '#2b3a55'));
    }

    parent_words() {
      const s = this.s;
      const list = Object.keys(s.words).filter((w) => (s.words[w].ok || 0) + (s.words[w].miss || 0) > 0)
        .sort((a, b) => (s.words[b].miss - s.words[b].ok) - (s.words[a].miss - s.words[a].ok));
      const per = 9, pages = Math.max(1, Math.ceil(list.length / per));
      this.paWordPage = Math.min(this.paWordPage || 0, pages - 1);
      const head = ['單字', '中文', '答對', '答錯', '天數', '階段'], xs = [200, 360, 560, 660, 760, 860];
      head.forEach((h, i) => this.paText(xs[i], 190, h, 20, '#4f5a6b', { fontStyle: 'bold' }));
      if (!list.length) this.paText(200, 240, '還沒有作答紀錄。', 22);
      list.slice(this.paWordPage * per, this.paWordPage * per + per).forEach((w, r) => {
        const o = s.words[w], y = 232 + r * 40;
        [w, zhOf(w), o.ok, o.miss, o.days, ['圖＋英＋中', '圖＋英', '只有英文'][o.stage]].forEach((v, i) => this.paText(xs[i], y, String(v), 20, i === 3 && o.miss > o.ok ? '#c62828' : '#2b3a55'));
      });
      this.paText(640, 610, '排序：答錯比答對多的字排前面　' + (this.paWordPage + 1) + ' / ' + pages, 18, '#4f5a6b').setOrigin(0.5);
      if (pages > 1) {
        this.pa(makeButton(this, 300, 610, 90, 44, 0x90a4ae, '◀', 22, () => { this.paWordPage = (this.paWordPage + pages - 1) % pages; this.openParent('words'); }));
        this.pa(makeButton(this, 980, 610, 90, 44, 0x90a4ae, '▶', 22, () => { this.paWordPage = (this.paWordPage + 1) % pages; this.openParent('words'); }));
      }
    }

    parent_curr() {
      const t = this.s.touched || {};
      const rows = CURRICULUM.map((c) => ({ c, on: c.keys.some((k) => t[k]) }));
      const done = rows.filter((r) => r.on).length;
      this.paText(200, 190, '接觸過的課綱條目：' + done + ' / ' + rows.length + '（✓ 表示玩過對應的機制）', 20, '#4f5a6b');
      rows.forEach((r, i) => {
        const col = i < 13 ? 0 : 1, row = i % 13;
        this.paText(200 + col * 480, 228 + row * 29, (r.on ? '✓ ' : '・ ') + r.c.name + '：' + r.c.codes, 16, r.on ? '#2e7d32' : '#9e9e9e');
      });
    }

    parent_reset() {
      this.paText(640, 230, '重設會刪除這台裝置上的所有進度（島嶼、單字紀錄、日記）。', 22).setOrigin(0.5);
      this.paText(640, 270, '這個動作無法復原。', 22, '#c62828', { fontStyle: 'bold' }).setOrigin(0.5);
      this.paResetArm = false;
      const b = this.pa(makeButton(this, 640, 380, 300, 70, 0xc62828, '重設進度', 26, () => {
        if (!this.paResetArm) { this.paResetArm = true; this.paResetMsg.setText('確定嗎？5 秒內再按一次就會重設'); this.time.delayedCall(5000, () => { this.paResetArm = false; if (this.paResetMsg.active) this.paResetMsg.setText(''); }); return; }
        // 用網址參數重設：在新頁面載入時才清除，避免舊頁面關閉時把存檔寫回去
        const q = new URLSearchParams(location.search); q.set('reset', '1');
        location.search = q.toString();
      }));
      this.paResetMsg = this.paText(640, 450, '', 22, '#c62828').setOrigin(0.5);
      return b;
    }

    // ---------- 家人日與節慶：共用一個選圖視窗（題目＋最多 4 張圖卡） ----------
    buildPick() {
      const c = this.modalBase(80, 200, 100, 880, 520, 0xfffaf0);
      this.pkTitle = txt(this, 640, 140, '', 28, '#6a1b9a', { fontStyle: 'bold' }).setOrigin(0.5);
      this.pkSay = txt(this, 640, 190, '', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.pkZh = txt(this, 640, 228, '', 20, '#4f5a6b').setOrigin(0.5);
      this.pkMsg = txt(this, 640, 585, '', 20, '#2e7d32', { fontStyle: 'bold' }).setOrigin(0.5);
      this.pkProg = txt(this, 960, 140, '', 20, '#4f5a6b').setOrigin(0.5);
      c.add([this.pkTitle, this.pkSay, this.pkZh, this.pkMsg, this.pkProg]);
      this.pkCards = [0, 1, 2, 3].map((i) => {
        const card = this.add.container(640 + (i - 1.5) * 190, 400);
        const bg = this.add.graphics(); bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-82, -110, 164, 220, 20); bg.lineStyle(4, 0xce93d8, 1); bg.strokeRoundedRect(-82, -110, 164, 220, 20);
        const pic = this.add.graphics({ y: -10 }).setScale(1.6);
        const zh = txt(this, 0, 90, '', 18, '#4f5a6b').setOrigin(0.5);
        card.add([bg, pic, zh]);
        card.setSize(164, 220).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickPick(i));
        c.add(card);
        return { card, pic, zh, x: card.x };
      });
      this.closeButton(c, 1055, 135, () => this.closeModal());
      this.pkBox = c;
    }

    // 家人日：一位居民帶家人來，問 3 題 Where is my grandmother?
    openFamily() {
      const s = this.s;
      const who = L.shuffle(['rabbit'].concat(this.residents()))[0];
      this.modal = 'pick';
      this.pk = { kind: 'family', who, round: 0, n: 3, done: false };
      this.pkBox.setVisible(true);
      this.nextFamily();
    }

    nextFamily() {
      const q = this.pk;
      q.opts = L.shuffle(FAMILY).slice(0, 4);
      q.answer = q.opts[Math.floor(Math.random() * 4)];
      q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.itemDone = false;
      q.say = 'Where is my ' + q.answer + '?';
      q.zh = '我的' + zhOf(q.answer) + '在哪裡？';
      this.renderPick();
      this.time.delayedCall(200, () => speak(q.say));
    }

    // 節慶：Which one is for Christmas?
    openFestival(fest) {
      this.modal = 'pick';
      const pics = L.shuffle(Object.values(FESTIVALS));
      this.pk = { kind: 'festival', fest, round: 0, n: 1, done: false, opts: pics.map((f) => f.k), pics };
      const q = this.pk;
      q.answer = fest.k; q.tries = 0; q.recorded = false; q.reveal = false; q.wrong = {}; q.itemDone = false;
      q.say = 'Today is ' + (fest.k === 'birthday' ? "Rabbit's birthday" : fest.k) + '! Which one is for ' + (fest.k === 'birthday' ? 'a birthday' : fest.k) + '?';
      q.zh = '今天是' + (fest.k === 'birthday' ? '兔子的生日' : fest.zh) + '！哪一個是' + fest.zh + '用的？';
      this.pkBox.setVisible(true);
      this.renderPick();
      this.time.delayedCall(200, () => speak(q.say));
    }

    renderPick() {
      const q = this.pk, zh = this.subs(), st = L.stage(this.s.words, q.answer);
      this.pkTitle.setText(q.kind === 'family' ? 'Family Day 家人日' : (q.fest.zh + ' ' + (q.fest.k === 'birthday' ? 'Birthday' : q.fest.k)));
      this.pkSay.setText(q.say);
      this.pkZh.setText(zh && (st === 0 || q.reveal) ? q.zh : '');
      this.pkProg.setText(q.n > 1 ? Math.min(q.round + 1, q.n) + ' / ' + q.n : '');
      this.pkCards.forEach((c, i) => {
        const k = q.opts[i];
        c.card.setVisible(!!k);
        if (!k) return;
        if (q.kind === 'family') drawFamily(c.pic, k); else drawFestival(c.pic, q.pics[i].pic);
        c.zh.setText(zh && st === 0 && q.kind === 'family' ? zhOf(k) : '');
        c.card.setAlpha(q.wrong[k] ? 0.35 : 1);
      });
      // 節慶只有 3 張：置中
      const n = q.opts.length;
      this.pkCards.forEach((c, i) => { c.x = 640 + (i - (n - 1) / 2) * 190; c.card.setX(c.x); });
    }

    pickPick(i) {
      const s = this.s, q = this.pk;
      if (this.modal !== 'pick' || !q || q.done || q.itemDone) return;
      const k = q.opts[i], c = this.pkCards[i];
      if (!k || q.wrong[k]) return;
      const right = k === q.answer, stat = this.stats[q.kind];
      if (q.tries === 0) { stat.q += 1; if (right) stat.first += 1; }
      if (!q.recorded) { L.answer(s.words, q.answer, { day: s.day, options: q.opts.length, firstTry: right, peeked: false }); q.recorded = true; }
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[k] = true;
        this.tweens.add({ targets: c.card, x: c.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        speak('No. ' + q.say);
        this.renderPick();
        return;
      }
      q.itemDone = true;
      this.tweens.add({ targets: c.card, scale: 1.08, yoyo: true, duration: 150 });
      q.round += 1;
      if (q.kind === 'family' && q.round < q.n) {
        speak('Yes! This is my ' + k + '.');
        this.pkMsg.setText('Yes! 對了');
        const cur = q;
        this.time.delayedCall(BOT ? 20 : 900, () => { if (this.pk === cur && this.modal === 'pick') { this.pkMsg.setText(''); this.nextFamily(); } });
        return;
      }
      q.done = true;
      this.touch(q.kind);
      if (q.kind === 'family') { s.famDay = s.day; speak('Thank you! Nice to meet my family.'); this.pkMsg.setText('謝謝你認識我的家人！ +3 ★'); s.stardust += 3; }
      else { s.festDay = s.day; L.seen(s.words, 'gift', s.day); speak('Happy ' + (q.fest.k === 'birthday' ? 'birthday' : q.fest.k) + '! Here is a gift.'); this.pkMsg.setText('收到一份禮物！ +5 ★'); s.stardust += 5; }
      this.refreshAll();
      const cur = q;
      this.time.delayedCall(BOT ? 20 : 1600, () => { if (this.pk === cur && this.modal === 'pick') this.closeModal(); });
    }

    // ---------- 裝飾：圖鑑達到項數後用星砂買，擺在草地上 ----------
    buildDecorObjs() {
      this.decorObjs = {};
      DECOR.forEach((d) => { this.decorObjs[d.k] = this.add.graphics({ x: d.x, y: d.y }).setDepth(d.k === 'fence' ? 5 : 8).setVisible(false); drawDecor(this.decorObjs[d.k], d.k); });
    }

    renderDecor() { if (this.decorObjs) DECOR.forEach((d) => this.decorObjs[d.k].setVisible(!!this.s.decor[d.k])); }

    buildDecorShop() {
      const c = this.modalBase(80, 200, 90, 880, 540, 0xfffaf0);
      c.add(txt(this, 640, 128, 'Decor 裝飾', 30, '#6a1b9a', { fontStyle: 'bold' }).setOrigin(0.5));
      this.dcSub = txt(this, 640, 170, '', 19, '#4f5a6b').setOrigin(0.5);
      this.dcMsg = txt(this, 640, 600, '', 20, '#c62828', { fontStyle: 'bold' }).setOrigin(0.5);
      c.add([this.dcSub, this.dcMsg]);
      this.dcCards = DECOR.map((d, i) => {
        const card = this.add.container(370 + (i % 3) * 270, 280 + Math.floor(i / 3) * 190);
        const bg = this.add.graphics();
        const pic = this.add.graphics({ y: -6 }).setScale(0.9); drawDecor(pic, d.k);
        const name = txt(this, 0, 42, d.zh + ' ' + d.en, 20, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const info = txt(this, 0, 68, '', 17, '#e65100', { fontStyle: 'bold' }).setOrigin(0.5);
        card.add([bg, pic, name, info]);
        card.setSize(240, 170).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.buyDecor(d.k));
        c.add(card);
        return { card, bg, info, d };
      });
      this.closeButton(c, 1050, 120, () => this.closeModal());
      this.dcBox = c;
    }

    openDecor() {
      if (this.paused()) return;
      this.modal = 'decor';
      this.dcArm = null;
      this.dcMsg.setText('');
      this.renderDecorShop();
      this.dcBox.setVisible(true);
    }

    renderDecorShop() {
      const s = this.s, n = this.libCount();
      this.dcSub.setText('圖鑑越完整，能買的裝飾越多（目前圖鑑 ' + n + ' / ' + LIB.length + ' 項，★ ' + s.stardust + '）');
      this.dcCards.forEach((c) => {
        const own = !!s.decor[c.d.k], open = n >= c.d.lib;
        c.bg.clear();
        paperCard(c.bg, -120, -85, 240, 170, 18, own ? 0xe8f5e9 : (open ? 0xffffff : 0xeeeeee), own ? 0x66bb6a : 0xd7ccc8);
        c.card.setAlpha(open || own ? 1 : 0.5);
        c.info.setText(own ? '已經擺在草地上' : (open ? '★' + c.d.price : '圖鑑 ' + c.d.lib + ' 項才能買'));
        c.info.setColor(own ? '#2e7d32' : (open ? '#e65100' : '#757575'));
      });
    }

    buyDecor(k) {
      const s = this.s, d = DECOR.find((x) => x.k === k);
      if (this.modal !== 'decor' || s.decor[k]) return;
      if (this.libCount() < d.lib) { this.dcMsg.setText('圖鑑要 ' + d.lib + ' 項才能買' + d.zh); return; }
      // 點一下顯示價格，3 秒內再點一次才買
      if (this.dcArm !== k) {
        this.dcArm = k;
        this.time.delayedCall(3000, () => { if (this.dcArm === k) { this.dcArm = null; if (this.dcMsg.active) this.dcMsg.setText(''); } });
        this.dcMsg.setText(s.stardust >= d.price ? '再點一次買下' + d.zh + ' ★' + d.price : '星砂不夠，需要 ★' + d.price);
        return;
      }
      this.dcArm = null;
      if (s.stardust < d.price) { this.dcMsg.setText('星砂不夠，需要 ★' + d.price); return; }
      s.stardust -= d.price;
      s.decor[k] = true;
      this.touch('decor');
      speak('It looks nice!');
      this.dcMsg.setText(d.zh + '擺好了！回草地看看');
      this.renderDecorShop();
      this.refreshAll();
    }

    // ---------- 設施修理（§3.4、§5）：花星砂修好壞掉的設施，修理時要選對材料 ----------
    fixedCount() { return FAC_KEYS.filter((k) => this.s.fixed[k]).length; }

    buildFacility(k) {
      const f = FAC[k];
      const g = this.add.graphics({ x: f.x, y: f.y }).setDepth(8);
      const sign = txt(this, f.x, f.y - 74, '', 18, '#c62828', { fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(16);
      const zone = this.add.zone(f.x, f.y - 20, f.w || 120, 110).setDepth(20).setInteractive();
      zone.on('pointerdown', () => this.openFix(k));
      (this.facObjs = this.facObjs || {})[k] = { g, sign };
    }

    renderFacilities() {
      if (!this.facObjs) return;
      const s = this.s;
      FAC_KEYS.forEach((k) => {
        const o = this.facObjs[k], fixed = !!s.fixed[k], crack = s.crack && s.crack.k === k;
        drawFacility(o.g, k, fixed, crack);
        o.sign.setText(!fixed ? '! ★' + FAC[k].price : (crack ? '!' : ''));
      });
    }

    buildFix() {
      const c = this.modalBase(80, 230, 110, 820, 500, 0xfffaf0);
      this.fxTitle = txt(this, 640, 140, '', 28, '#6d4c2f', { fontStyle: 'bold' }).setOrigin(0.5);
      this.fxSay = txt(this, 640, 190, '', 30, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
      this.fxZh = txt(this, 640, 228, '', 20, '#4f5a6b').setOrigin(0.5);
      this.fxPic = this.add.graphics({ x: 640, y: 300 }).setScale(1.2);
      this.fxMsg = txt(this, 640, 575, '', 20, '#c62828', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
      c.add([this.fxTitle, this.fxSay, this.fxZh, this.fxPic, this.fxMsg]);
      this.fxCards = MATERIALS.map((m, i) => {
        const card = this.add.container(640 + (i - 1.5) * 170, 460);
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-72, -70, 144, 140, 18);
        bg.lineStyle(4, 0xbcaaa4, 1); bg.strokeRoundedRect(-72, -70, 144, 140, 18);
        const pic = this.add.graphics({ y: -16 }).setScale(1.3); drawMaterial(pic, m);
        const en = txt(this, 0, 38, m, 24, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
        const zh = txt(this, 0, 60, '', 16, '#4f5a6b').setOrigin(0.5);
        card.add([bg, pic, en, zh]);
        card.setSize(144, 140).setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.pickMaterial(i));
        c.add(card);
        return { card, zh, x: card.x };
      });
      this.closeButton(c, 1020, 140, () => this.closeModal());
      this.fxBox = c;
    }

    openFix(k) {
      if (this.paused()) return;
      const s = this.s, f = FAC[k];
      const crack = s.crack && s.crack.k === k;
      if (s.fixed[k] && !crack) { speak('The ' + f.en + ' is fine.'); this.floatText(f.x, f.y - 100, f.zh + '好好的！' + f.perk, '#2e7d32'); return; }
      if (crack && s.day < s.crack.ready) {
        // 防災包沒準備好：演練後的裂痕要等到明天才能修（只是變慢，沒有損失）
        this.floatText(f.x, f.y - 100, '防災包沒準備好，修理要等到明天', '#c62828');
        return;
      }
      if (!crack && s.stardust < f.price) { this.floatText(f.x, f.y - 100, '修理需要 ★' + f.price, '#c62828'); return; }
      this.held = null; this.tool = null; this.redrawTools();
      this.modal = 'fix';
      this.fq2 = { k, crack, tries: 0, recorded: false, reveal: false, wrong: {}, done: false };
      L.seen(s.words, f.mat, s.day);
      this.fxBox.setVisible(true);
      this.renderFix();
      this.time.delayedCall(200, () => speak(this.fq2.say));
    }

    renderFix() {
      const q = this.fq2, f = FAC[q.k], st = L.stage(this.s.words, f.mat), zh = this.subs();
      q.say = 'Fix the ' + f.en + '! We need ' + f.mat + '.';
      this.fxTitle.setText((q.crack ? 'Crack! ' : 'Fix it! ') + f.zh + (q.crack ? '有裂痕' : '壞掉了') + (q.crack ? '' : '　★' + f.price));
      this.fxSay.setText(q.say);
      this.fxZh.setText(zh && (st === 0 || q.reveal) ? '修好' + f.zh + '！我們需要' + zhOf(f.mat) + '。' : '');
      drawFacility(this.fxPic, q.k, false, false);
      this.fxCards.forEach((c, i) => {
        const m = MATERIALS[i];
        c.zh.setText(zh && st === 0 ? zhOf(m) : '');
        c.card.setAlpha(q.wrong[m] ? 0.35 : 1);
      });
      if (!q.done) this.fxMsg.setText(q.crack ? '修裂痕不用星砂' : '選對材料才會付錢修理（選錯不扣星砂）');
    }

    pickMaterial(i) {
      const s = this.s, q = this.fq2;
      if (this.modal !== 'fix' || !q || q.done) return;
      const m = MATERIALS[i], f = FAC[q.k], c = this.fxCards[i];
      if (q.wrong[m]) return;
      const right = m === f.mat;
      if (q.tries === 0) { this.stats.fix.q += 1; if (right) this.stats.fix.first += 1; }
      if (!q.recorded) { L.answer(s.words, f.mat, { day: s.day, options: MATERIALS.length, firstTry: right, peeked: false }); q.recorded = true; }
      speak(m);
      if (!right) {
        q.tries += 1; q.reveal = true; q.wrong[m] = true;
        this.tweens.add({ targets: c.card, x: c.x + 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => c.card.setX(c.x) });
        this.renderFix();
        this.fxMsg.setText('Not ' + m + '. 不是這個材料，再聽一次');
        return;
      }
      if (!q.crack) {
        if (s.stardust < f.price) { this.fxMsg.setText('修理需要 ★' + f.price); return; }
        s.stardust -= f.price;
        s.fixed[q.k] = true;
      } else {
        s.crack = null;
      }
      q.done = true;
      this.touch('fix');
      speak('Great! The ' + f.en + ' is fixed!');
      this.fxMsg.setText(q.crack ? '裂痕修好了！' : '修好了！' + f.perk);
      this.renderFacilities();
      this.checkLight();
      this.refreshAll();
      const cur = q;
      this.time.delayedCall(BOT ? 30 : 1300, () => { if (this.modal === 'fix' && this.fq2 === cur) this.closeModal(); });
    }

    // 演練後，已修好的設施裡隨機一個出現裂痕（防災包準備好就能當天修，沒準備要等明天）
    crackAfterDrill() {
      const s = this.s;
      const fixed = FAC_KEYS.filter((k) => s.fixed[k]);
      if (!fixed.length || s.crack) return '';
      const k = fixed[Math.floor(Math.random() * fixed.length)];
      s.crack = { k, ready: s.bagReady ? s.day : s.day + 1 };
      this.renderFacilities();
      return FAC[k].zh + '有一點裂痕。' + (s.bagReady ? '防災包準備好了，今天就能修。' : '防災包沒準備好，要等明天才能修。');
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
        drawStickerCard(c.bg, 170, 210);
        c.card.setAngle([-2.5, 1.5, -1, 2.5][i]);
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
        this.touch('weather');
        c.bg.lineStyle(6, 0x2f8a5b, 1); c.bg.strokeRoundedRect(-75, -95, 150, 190, 20);
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
        const q = L.diary(Object.assign({ weather: s.weather }, s.ev), { weather: WEATHER_KEYS, plant: s.seeds, animal: ANIMAL_KEYS, weekday: WEEK });
        s.diaryQ = Object.assign(q, { day: s.day, tries: 0, recorded: false, done: false, wrong: {} });
        // 延伸層（§3.5）：研究島開放後，日記的空格改成拼字：答案的字母打散，再加 2 個不在字裡的字母
        if (this.researchOpen() && /^[a-z]{3,8}$/.test(q.answer)) {
          const extra = L.shuffle('abcdefghijklmnopqrstuvwxyz'.split('').filter((ch) => !q.answer.includes(ch))).slice(0, 2);
          q.spell = { got: '', tiles: L.shuffle(q.answer.split('').concat(extra)), used: {} };
        }
      }
      if (!this.dyTiles) {
        this.dyTiles = [];
        for (let j = 0; j < 10; j++) {
          const b = this.add.container(0, 480);
          const bg = this.add.graphics(); paperCard(bg, -36, -38, 72, 76, 14, 0xffffff, 0xffc46b);
          const t = txt(this, 0, 0, '', 40, '#2b3a55', { fontStyle: 'bold' }).setOrigin(0.5);
          b.add([bg, t]);
          b.setSize(72, 76).setInteractive({ useHandCursor: true });
          b.on('pointerdown', () => this.pickTile(j));
          this.dyBox.add(b);
          this.dyTiles.push({ b, t });
        }
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
      const sp = q.spell && !q.done ? q.spell : null;
      this.dyBlank.setText(q.done ? q.answer : sp ? sp.got + '_'.repeat(q.answer.length - sp.got.length) : '');
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
      this.dyTiles.forEach((tl, j) => {
        const on = !!sp && j < sp.tiles.length;
        tl.b.setVisible(on);
        if (!on) return;
        tl.b.setX(640 + (j - (sp.tiles.length - 1) / 2) * 86);
        tl.t.setText(sp.tiles[j]);
        tl.b.setAlpha(sp.used[j] ? 0.25 : 1);
      });
      this.dyOpts.forEach((o, i) => {
        const w = q.options[i];
        o.b.setVisible(!q.done && !q.spell);
        o.bg.clear();
        paperCard(o.bg, -110, -48, 220, 96, 24, 0xffffff, 0xffc46b);
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
        this.diaryDone(q.options.length);
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

    diaryDone(nOpts) {
      const s = this.s, q = s.diaryQ;
      q.done = true;
      if (!q.recorded) L.answer(s.words, q.answer, { day: s.day, options: nOpts, firstTry: q.tries === 0, peeked: false });
      s.diary.push({ day: q.day, text: q.text, weather: s.weather });
      this.touch('diary');
      speak(q.text);
    }

    // 拼字日記：照順序點字母；點錯的字母不會放進去，第一次點錯就算這題沒有一次對
    pickTile(j) {
      const s = this.s, q = s.diaryQ;
      if (this.modal !== 'diary' || !q || q.done || !q.spell) return;
      const sp = q.spell;
      if (sp.used[j]) return;
      const ch = sp.tiles[j], need = q.answer[sp.got.length];
      if (ch === need) {
        sp.used[j] = true; sp.got += ch;
        if (sp.got === q.answer) {
          if (q.tries === 0) { this.stats.diary.q += 1; this.stats.diary.first += 1; }
          this.diaryDone(sp.tiles.length);
        }
      } else {
        if (q.tries === 0) this.stats.diary.q += 1;
        q.tries += 1;
        if (!q.recorded) { L.answer(s.words, q.answer, { day: s.day, options: sp.tiles.length, firstTry: false, peeked: false }); q.recorded = true; }
        const tl = this.dyTiles[j];
        this.tweens.add({ targets: tl.b, angle: 8, yoyo: true, repeat: 2, duration: 60, onComplete: () => tl.b.setAngle(0) });
        speak('Try again.');
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
        this.libDetailZh.setText(e.hint || (e.kind === 'animal' ? '還沒遇到。完成居民的願望，去池塘森林幫牠蓋一個家' : (PLANTS[e.k] && PLANTS[e.k].price ? '用星砂在種子袋買種子' : '還沒發現，試試看種下它或等到那種天氣')));
        return;
      }
      speak(e.en);
      L.seen(this.s.words, e.en, this.s.day);
      this.libDetailEn.setText(e.en);
      if (e.kind === 'plant') {
        const p = PLANTS[e.k];
        this.libDetailZh.setText(e.zh + '　我們用到的部位：' + p.part + '（' + p.partZh + '）\n' + p.fact);
      } else {
        this.libDetailZh.setText(e.zh + '\n' + (e.fact || ''));
      }
    }

    // --- 教學：檢查「是否已完成該步」，不檢查種了什麼 ---
    tutLines() {
      return [
        { en: 'Tap the seeds.',         zh: '點種子袋，選一種種子' },
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
        case 'seed': return { x: TOOL_X.seeds, y: 585 };
        case 'plant': {
          if (!this.tool || !PLANTS[this.tool]) return { x: TOOL_X.seeds, y: 585 };
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
          return this.held ? { x: RABBIT.x, y: RABBIT.y - 130 } : { x: BAG_X[PLANT_KEYS.find((k) => (s.inv[k] || 0) > 0) || 'carrot'], y: 585 };
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
      s.prevWeather = s.weather;
      s.weather = pick;
      this.ecoDay();
      this.applyWeatherLook();
      if (this.needWeatherQ()) this.openWeatherQ(); else this.showBanner();
      saveState(s);
    }

    showBanner() {
      const s = this.s, w = WEATHER[s.weather];
      this.discover(s.weather);
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
        // 種子袋：手上拿著種子時亮起來，並顯示那種種子的圖
        const on = t.k === 'seeds' ? !!PLANTS[this.tool] : this.tool === t.k;
        if (t.k === 'seeds') { drawIcon(t.icon, PLANTS[this.tool] ? this.tool : 'carrot'); t.label.setText(PLANTS[this.tool] ? this.tool : 'seeds'); }
        t.bg.clear();
        stickerPill(t.bg, 104, 88, on ? 0xffd77a : 0xfdf9f0, 20, on);
        t.c.setY(on ? 656 : 662).setAngle(on ? -3 : 0);
      });
      Object.values(this.bag).forEach((b) => {
        const on = this.held === b.k;
        const n = this.s.inv[b.k] || 0;
        b.c.setVisible(this.s.seeds.includes(b.k));
        b.bg.clear();
        stickerPill(b.bg, 94, 82, on ? 0xffd77a : 0xfdf9f0, 18, on);
        b.c.setY(on ? 656 : 662).setAngle(on ? 3 : 0);
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
      // 部位願望只畫部位本身（不畫作物，避免直接給答案）
      if (showPic) { if (PARTS[item]) drawPartIcon(b.icon, item); else drawIcon(b.icon, item); }
      b.en.setX(showPic ? 118 : 24).setText(wishSentence(item));
      b.zh.setX(showPic ? 118 : 24).setText(showZh ? '我想要' + (PARTS[item] ? PARTS[item].zh : zhOf(item)) : '');
    }

    libList() {
      const f = LIB_FILTERS[this.libFilter || 0];
      return LIB.filter((e) => (f.list ? f.list.includes(e.k) : f.has(e)));
    }

    refreshLibrary() {
      if (this.navC) this.checkCave();
      const list = this.libList();
      const pages = Math.max(1, Math.ceil(list.length / LIB_PER_PAGE));
      if (this.libPage >= pages) this.libPage = 0;
      this.libPageText.setText((this.libPage + 1) + ' / ' + pages);
      const f = LIB_FILTERS[this.libFilter || 0];
      if (this.libFilterBtn) this.libFilterBtn.label.setText('篩選：' + f.zh + (f.k === 'all' ? '' : '（' + list.length + '）'));
      this.libCards.forEach((slot, i) => {
        const e = list[this.libPage * LIB_PER_PAGE + i];
        slot.e = e || null;
        slot.card.setVisible(!!e);
        if (!e) return;
        const { bg, icon, img, name } = slot;
        drawIcon(icon, e.k);
        const got = !!this.s.lib[e.k];
        // 收集到的是一張貼紙卡；還沒收集的是空著的淡色格子（等著貼）
        drawStickerCard(bg, 220, 168, got ? 0xfdf9f0 : 0xebe3d1);
        bg.setAlpha(got ? 1 : 0.7);
        const tex = 'st-' + e.k, has = got && this.textures.exists(tex);
        icon.setVisible(got && !has); img.setVisible(has);
        if (has) img.setTexture(tex).setDisplaySize(112, 112);
        name.setText(got ? e.en : '?');
        name.setColor(got ? '#2b3a55' : '#9a917f');
      });
    }

    refreshAll() {
      this.dustText.setText(String(this.s.stardust));
      this.refreshWish();
      this.renderForest();
      this.renderNav();
      this.renderResearch();
      this.renderFacilities();
      this.renderDecor();
      this.refreshTut();
      this.redrawTools();
    }

    // --- 忽略測試：亂點機器人（?bot=1） ---
    // 不看英文、不管科學，每 0.12 秒在目前能點的東西裡隨機點一個
    botStep() {
      const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
      if (this.modal === 'weather') { if (!this.wq.done) this.pickWeather(Math.floor(Math.random() * 4)); return; }
      if (this.modal === 'diary') {
        const dq = this.s.diaryQ;
        if (dq && dq.done) this.goodNight(); else if (dq && dq.spell) this.pickTile(Math.floor(Math.random() * dq.spell.tiles.length)); else this.pickDiary(Math.floor(Math.random() * 3));
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
      if (this.modal === 'pick') { if (this.pk.done || Math.random() < 0.03) this.closeModal(); else this.pickPick(Math.floor(Math.random() * this.pk.opts.length)); return; }
      if (this.modal === 'decor') { if (Math.random() < 0.2) this.closeModal(); else this.buyDecor(DECOR[Math.floor(Math.random() * DECOR.length)].k); return; }
      if (this.modal === 'fix') { if (Math.random() < 0.1) this.closeModal(); else this.pickMaterial(Math.floor(Math.random() * MATERIALS.length)); return; }
      if (this.modal === 'seeds') {
        const r = Math.random();
        if (r < 0.15) this.closeSeeds(); else this.pickSeed(PLANT_KEYS[Math.floor(Math.random() * PLANT_KEYS.length)]);
        return;
      }
      if (this.modal === 'lab') {
        if (Math.random() < 0.03) { this.closeModal(); return; }
        const q = this.xq, R = (n) => Math.floor(Math.random() * n);
        if (!q || q.done) return;
        if (q.pickAt) { q.pickAt(R(q.cur().opts.length)); return; }
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
        else if (o.pick) this.pickWay(Math.floor(Math.random() * 4));
        else this.pickCloth(Math.floor(Math.random() * 4));
        return;
      }
      if (this.modal) { this.closeModal(); return; }
      // 只點目前畫面上看得到的東西
      const acts = [];
      TOOL_KEYS.forEach((k) => acts.push(() => this.selectTool(k)));
      PLANT_KEYS.forEach((k) => acts.push(() => this.selectBag(k)));
      if (this.s.town) acts.push(() => this.openMarket());
      FAC_KEYS.filter((k) => FAC[k].zone === this.zone).forEach((k) => acts.push(() => this.openFix(k)));
      if (this.zone === 'meadow' && this.critter) acts.push(() => this.tapCritter());
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
    // 每日小驚喜（遊戲企劃「每日登入」）：每個真實日期第一次打開，右上角出現禮物盒，點開得到星砂或一個收成物。
    // 沒有連續登入的獎勵，也不會因為中斷而失去什麼
    dailyGift() {
      const s = this.s, d = new Date();
      const today = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      if (s.giftDate === today || s.day < 2) return;   // 第 1 天還在教學，先不打擾
      const box = this.add.container(1200, 150).setScrollFactor(0).setDepth(60);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.15); g.fillEllipse(0, 30, 60, 12);
      g.fillStyle(0xe53935, 1); g.fillRoundedRect(-26, -10, 52, 38, 6);
      g.fillStyle(0xef5350, 1); g.fillRoundedRect(-30, -20, 60, 14, 5);
      g.fillStyle(0xffd54a, 1); g.fillRect(-5, -20, 10, 48);
      g.fillEllipse(-10, -26, 18, 10); g.fillEllipse(10, -26, 18, 10);
      box.add([g, txt(this, 0, 46, 'Gift 禮物', 16, '#ffffff', { fontStyle: 'bold', stroke: '#37474f', strokeThickness: 4 }).setOrigin(0.5)]);
      box.setSize(80, 90).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: box, angle: 6, yoyo: true, repeat: -1, duration: 380, ease: 'Sine.easeInOut' });
      box.on('pointerdown', () => {
        if (this.modal) return;
        s.giftDate = today;
        const crops = s.seeds.filter((k) => PLANTS[k]);
        let msg;
        if (Math.random() < 0.6 || !crops.length) { s.stardust += 3; msg = 'A gift for you!  +3 ★'; }
        else { const k = crops[Math.floor(Math.random() * crops.length)]; s.inv[k] = (s.inv[k] || 0) + 1; msg = 'A gift for you!  +1 ' + k; L.seen(s.words, k, s.day); }
        speak('A gift for you!');
        this.floatText(1120, 220, msg, '#d81b60', true);
        this.tweens.killTweensOf(box);
        this.tweens.add({ targets: box, scale: 1.4, alpha: 0, duration: 400, onComplete: () => box.destroy() });
        this.refreshAll();
        saveState(s);
      });
      this.giftBox = box;
    }

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
      s.playSec = (s.playSec || 0) + Math.min(delta, 100) / 1000;

      if (running) {
        s.t += dt;
        if (s.t >= DAY_LEN) this.openDiary();
      }

      // 日進度條
      const frac = Math.min(1, s.t / DAY_LEN);
      this.dayBar.clear();
      this.dayBar.fillStyle(0xfdf9f0, 1); this.dayBar.fillRoundedRect(490, 64, 300, 14, 7);
      this.dayBar.fillStyle(0x7fc4dc, 1); this.dayBar.fillRoundedRect(490, 64, Math.max(14, 300 * frac), 14, 7);
      this.dayBar.lineStyle(2.5, INK, 1); this.dayBar.strokeRoundedRect(490, 64, 300, 14, 7);
      this.dayIcon.setX(490 + 300 * frac);
      const fest = festivalOf(s.day);
      const dayLabel = 'Day ' + s.day + '  ' + weekday(s.day) + (fest ? '  ' + fest.k.charAt(0).toUpperCase() + fest.k.slice(1) : (this.isDrillDay() ? '  Drill Day' : (s.day % 7 === 6 && s.town ? '  Family Day' : '')));
      if (this.dayText.text !== dayLabel) { this.dayText.setText(dayLabel); this.dayText.setFontSize(dayLabel.length > 22 ? 19 : 24); }

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
          g.fillStyle(0x3b2f1e, 0.14); g.fillEllipse(0, 14, 150, 62);
          g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1); g.fillEllipse(0, 6, 140, 56);
          g.lineStyle(3, INK, 1); g.strokeEllipse(0, 6, 140, 56);
          g.lineStyle(2, 0x3b2f1e, 0.25); g.lineBetween(-40, 0, -14, 0); g.lineBetween(10, 12, 38, 12);
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

      // 草地：小生物（時間有在走時才倒數；小生物也會輕輕飄動）
      if (running) this.tickCritter(dt);
      if (this.critter) this.critG.setY(this.critter.y + Math.sin(tSec * 4) * 4);
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

  const fontsReady = (document.fonts && document.fonts.load)
    ? Promise.race([
      Promise.all([['20px Huninn', '浮島日記市集圖鑑在哪裡貓熊星砂今天'], ['bold 20px Andika', 'Where is the panda?'], ['20px Andika', 'abg Il1']]
        .map(([f, t]) => document.fonts.load(f, t).catch(() => null))),
      new Promise((r) => setTimeout(r, 2500)),
    ])
    : Promise.resolve();
  fontsReady.then(() => new Phaser.Game({
    type: Phaser.AUTO,
    width: W, height: H,
    parent: 'game',
    backgroundColor: '#cfe9ff',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [Title, Island],
  }));
})();
