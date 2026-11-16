---
name: 浮島日記 Floating Isle Diary
description: 孩子手帳裡的一頁：答案是一張張可以貼上去的貼紙
colors:
  ink-navy: "#2b3a55"
  notebook-paper: "#fbf6ea"
  card-paper: "#fdf9f0"
  sticker-white: "#ffffff"
  dot-grid-tan: "#ddd0b2"
  binding-coral: "#ef9f96"
  binding-hole: "#e6dcc6"
  binding-hole-rim: "#cfc2a4"
  washi-mustard: "#f2b84b"
  washi-lake: "#7fc4dc"
  stamp-green: "#2f8a5b"
  close-coral: "#f26b55"
  market-coral: "#c4473d"
  clear-slate: "#8fa3b3"
  listen-mist: "#dcedf4"
  subtitle-slate: "#4f5a6b"
  reward-berry: "#c2185b"
  warm-shadow: "#3b2f1e"
  scrim-night: "#10243a"
typography:
  dialogue:
    fontFamily: "Andika, Huninn, Segoe UI, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 1.2
  card-label:
    fontFamily: "Andika, Huninn, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
  button-label:
    fontFamily: "Andika, Huninn, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  title-tape:
    fontFamily: "Huninn, Noto Sans TC, Microsoft JhengHei, PingFang TC, sans-serif"
    fontSize: "22px"
    fontWeight: 400
  subtitle:
    fontFamily: "Huninn, Noto Sans TC, Microsoft JhengHei, PingFang TC, sans-serif"
    fontSize: "22px"
    fontWeight: 400
  card-caption:
    fontFamily: "Huninn, Noto Sans TC, Microsoft JhengHei, PingFang TC, sans-serif"
    fontSize: "20px"
    fontWeight: 400
rounded:
  page: "16px"
  card-inner: "20px"
  bubble: "26px"
  card-outer: "28px"
  button-max: "22px"
  round: "50%"
spacing:
  sticker-edge: "10px"
  button-edge: "5px"
  dot-grid: "30px"
  card-gap: "26px"
components:
  sticker-card:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.card-label}"
    rounded: "{rounded.card-outer}"
    padding: "10px"
    width: "196px"
    height: "214px"
  sticker-button-go:
    backgroundColor: "{colors.stamp-green}"
    textColor: "{colors.sticker-white}"
    typography: "{typography.button-label}"
    rounded: "{rounded.button-max}"
    padding: "5px"
    height: "66px"
  sticker-button-market:
    backgroundColor: "{colors.market-coral}"
    textColor: "{colors.sticker-white}"
    rounded: "{rounded.button-max}"
    padding: "5px"
    width: "140px"
    height: "70px"
  sticker-button-quiet:
    backgroundColor: "{colors.clear-slate}"
    textColor: "{colors.sticker-white}"
    typography: "{typography.button-label}"
    rounded: "{rounded.button-max}"
    padding: "5px"
    height: "56px"
  close-sticker:
    backgroundColor: "{colors.close-coral}"
    textColor: "{colors.sticker-white}"
    rounded: "{rounded.round}"
    size: "72px"
  listen-sticker:
    backgroundColor: "{colors.listen-mist}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.round}"
    size: "68px"
  ink-bubble:
    backgroundColor: "{colors.sticker-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.dialogue}"
    rounded: "{rounded.bubble}"
    padding: "16px 32px"
    width: "600px"
    height: "128px"
  washi-tape-title:
    backgroundColor: "{colors.washi-mustard}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.title-tape}"
    width: "200px"
    height: "36px"
  notebook-page:
    backgroundColor: "{colors.notebook-paper}"
    rounded: "{rounded.page}"
    width: "980px"
    height: "610px"
---

# Design System: 浮島日記 Floating Isle Diary

## Overview

**Creative North Star: "孩子的貼紙手帳"**

每一個畫面都是孩子手帳裡的一頁：米白點格紙、珊瑚色裝訂線、斜斜貼上的條紋紙膠帶；角色、物品和答案都是一張張有白色切割邊、深藍墨線、柔和落影的貼紙。孩子「選答案」的動作在這個世界裡就是「挑一張貼紙貼上去」，選對就蓋一個綠色圓章。拒絕一般兒童遊戲的圓角塑膠按鈕與漸層面板（使用者在 A／B 對照稿中選定 A，2026-11-17，要求「素材要精緻點」）。

畫面以 Phaser canvas 1280×720 為座標，等比縮放（`Phaser.Scale.FIT`、置中）。密度偏低：一頁只有一位說話者、一句英文、一排四張卡，大字、大目標，給在家自己用平板玩的國小學童。所有尺寸以 canvas px 記錄；在 iPad 1024×768 上約乘 0.8。

這套系統目前**只套用在市集視窗與全域共用元件**（`makeButton` 貼紙按鈕、`closeButton` 關閉貼紙）。草地、日記本、圖鑑、實驗站、邀請卡等其他視窗仍是舊的程式繪製風格，改版時以本文件為準，不要反過來以舊畫面為準。

**Key Characteristics:**
- 一切可點的東西都是貼紙：白色切割邊＋深藍墨線＋暖色柔和落影
- 紙張與紙膠帶是背景材質，不是按鈕
- 每張貼紙卡有不同的小角度（-2.5° 到 2.5°），像手貼上去
- 英文用 Andika、中文用粉圓（Huninn），兩者分工固定
- 對錯回饋同時用形狀、動作、聲音、文字，不只靠顏色

## Colors

暖米白紙張上的單一深藍墨線，加上兩段紙膠帶色和兩個語意色（綠＝對、珊瑚＝關閉／市集），整體低彩度、像紙上印刷。

### Primary
- **深藍墨線 Ink Navy** (`ink-navy`)：所有貼紙的輪廓線（canvas 3px、SVG 素材 4.5px）、英文對話與卡片英文、紙膠帶上的標題文字、眼睛。是唯一的線條色，也是最主要的文字色；在內頁紙上對比約 10.5:1。

### Secondary
- **印章綠 Stamp Green** (`stamp-green`)：選對時的「Yes!」圓章（雙圈：外圈實線、內圈虛線，-14°）與印章字、主要行動按鈕（例：「Here you are.」）。白字在綠底約 4.3:1，只用在 26px 以上的粗體字。
- **關閉珊瑚 Close Coral** (`close-coral`)：右上角關閉貼紙的圓心，白色粗叉（線寬 6）。
- **市集珊瑚 Market Coral** (`market-coral`)：工具列上的「市集」入口按鈕。

### Tertiary
- **芥末紙膠帶 Washi Mustard** (`washi-mustard`)：左上角標題膠帶（200 寬、-7°），上面寫畫面名稱。
- **湖水紙膠帶 Washi Lake** (`washi-lake`)：右上角裝飾膠帶（170 寬、6°），壓住頁角，不放字。

### Neutral
- **手帳內頁 Notebook Paper** (`notebook-paper`)：整頁的紙色。
- **卡片內紙 Card Paper** (`card-paper`)：貼紙卡墨線框內的底色，比內頁再亮一點。
- **貼紙白邊 Sticker White** (`sticker-white`)：切割邊、對話框底、按鈕字。
- **點格淡褐 Dot Grid Tan** (`dot-grid-tan`)：30px 間距、半徑 2 的點格，從裝訂線右側開始。
- **裝訂線珊瑚 Binding Coral** (`binding-coral`)：左側距頁緣 66px 的直線（3px）。
- **裝訂孔 Binding Hole / Rim** (`binding-hole`、`binding-hole-rim`)：距頁緣 32px、每 92px 一個的圓孔（半徑 9）。
- **字幕石板灰 Subtitle Slate** (`subtitle-slate`)：中文字幕、卡片中文標籤；在卡片紙上約 6.5:1。
- **聽一次霧藍 Listen Mist** (`listen-mist`)：重聽鈕的圓心。
- **安靜石板 Clear Slate** (`clear-slate`)：次要按鈕（例：「Clear」）。
- **獎勵莓紅 Reward Berry** (`reward-berry`)：「Thank you! 星砂 +4」浮字；在內頁紙上約 5.4:1。
- **暖影 Warm Shadow** (`warm-shadow`)：所有貼紙落影的顏色，透明度 0.10～0.18。
- **夜幕遮罩 Scrim Night** (`scrim-night`)：視窗開啟時蓋住小島的遮罩（透明度 0.55），也是內頁落影色。

### Named Rules
**The One Ink Rule.** 輪廓線只有深藍墨線一種顏色。不要用黑色、灰色或物件本身的深色描邊；新素材的線條一律是墨線色。

**The Tape Is Paper Rule.** 紙膠帶只用芥末與湖水兩色、半透明（0.88）加白色斜紋；它是頁面材質，可以承載標題，但永遠不可點。

## Typography

**英文字型：** Andika（備援 Huninn、Segoe UI）
**中文字型：** 粉圓 Huninn（備援 Noto Sans TC、Microsoft JhengHei、PingFang TC、Heiti TC）

**Character:** Andika 是識字教學字型，a、g 是手寫形狀，I、l、1 好分辨，給剛學字母的孩子；粉圓圓潤、像手寫，讓中文跟貼紙世界同一個溫度。兩者經由 `index.html` 的 @font-face 從 `game/fonts/` 載入，遊戲啟動前用 `fontsReady` 等字型（最多 2.5 秒），避免 canvas 先用系統字畫出來。

### Hierarchy
- **Dialogue 對話**（Andika 700、46px，寬超過 560px 每次縮 2px，最小 34px）：居民說的那一句英文，墨線色，放在墨線對話框裡。
- **Card Label 卡片英文**（Andika 700、30px）：卡片上的英文字、印章的「Yes!」（印章綠、-14°）。
- **Button Label 按鈕字**（Andika 700、24～28px，白色）：英文按鈕；純 ASCII 標籤自動用 Andika，含中文則用粉圓。
- **Title 標題**（粉圓 400、22px，墨線色，跟著膠帶轉 -7°）：寫在芥末紙膠帶上的「市集 Market」。
- **Subtitle 中文字幕**（粉圓 400、22px，字幕石板灰）：對話框裡英文下方的中文，可在設定關閉。
- **Caption 卡片中文**（粉圓 400、20px，字幕石板灰；指路十字路口縮小的卡片用 30px 補償縮放）：只在第一次見到這個字時顯示。

### Named Rules
**The Two Hands Rule.** 英文永遠用 Andika，中文永遠用粉圓；不要用粉圓排英文句子，也不要用 Andika 排中文。

**The Shrink Not Wrap Rule.** 對話英文不換行：太長就從 46px 往下縮，最小 34px。比 34px 還長的句子要改短，不是再縮。

## Layout

所有視窗都是置中的手帳內頁：980×610 的頁面放在 (150, 64)，約占畫面 3/4，外面蓋夜幕遮罩。頁面內的固定格局：

- **左上：** 芥末膠帶標題壓住頁角；說話的居民貼紙（170×170）在裝訂線右側。
- **上方中段：** 墨線對話框（600×128），尾巴指向居民；重聽鈕在對話框右側（直徑約 68）。
- **右上：** 湖水膠帶＋關閉貼紙（在頁角外緣，(1122, 74)）。
- **下半部：** 4 張貼紙卡一排（196×214，中心距 222，間隔 26），角度依序 -2.5°、1.5°、-1°、2.5°。
- **卡片列下方：** 回饋浮字（「Thank you! 星砂 +4」）在 (640, 648)，不壓到卡片和字幕。

點格 30px 是頁面的節奏，但元件不強制對齊點格；手貼的不完美角度才是重點。平板 4:3 時 Phaser FIT 上下留白，畫面不重排。

## Elevation & Depth

深度全部來自「貼紙貼在紙上」：每張貼紙有白色切割邊，再往下偏移一層柔和暖影；沒有發光、沒有漸層面板、沒有浮起的卡片陰影。canvas 元件用兩層低透明度的圓角色塊模擬模糊（Phaser Graphics 沒有模糊），SVG 素材用真的高斯模糊。

### Shadow Vocabulary
- **貼紙卡落影**（暖影 0.10，下移 5px＋再一層 0.10 下移 9px）：貼紙卡。
- **按鈕／圓貼紙落影**（暖影 0.16～0.18，下移 6px）：貼紙按鈕、關閉貼紙、重聽鈕。
- **對話框落影**（暖影 0.10，右 2px 下 6px）。
- **內頁落影**（夜幕 0.12 下移 7px＋0.16 下移 14px）：整頁浮在遮罩上。
- **SVG 素材落影**（feGaussianBlur stdDeviation 4、dy 6、#3b2f1e 透明度 0.3）。

### Named Rules
**The Paper Shadow Rule.** 落影一律是暖褐（或頁面的夜幕色）、向下、柔和低透明度；不要用黑色硬邊偏移陰影，也不要向上或向四周發光。

## Shapes

圓角都偏大且一致，像用剪刀沿圖形剪下：內頁 16px、貼紙卡外緣 28px／墨線框 20px（白邊 10px）、對話框 26px、按鈕半徑取 min(高/2, 22px)、白邊 5px。關閉鈕與重聽鈕是正圓貼紙（白邊 8px）。紙膠帶是唯一的直角長方形，兩端不圓角，保持「撕下來的膠帶」感。墨線一律 3px（canvas）／4.5px（SVG，素材縮小約一半後視覺接近），線端與轉角都是圓頭。

## Components

### 貼紙按鈕（`makeButton`，全域）
像從貼紙本撕下來的一塊色塊。
- **Shape:** 圓角 min(高/2, 22px)，外白邊 5px，內側色塊有 3px 墨線框。
- **Colors:** 主要行動用印章綠；入口用市集珊瑚；次要用安靜石板。字一律白色粗體。
- **States:** 目前沒有 hover／按下狀態（觸控為主）；被鼓勵按下時用縮放 1.15 來回提示。

### 關閉貼紙（`closeButton`，全域）
- 白色圓貼紙（半徑 36）＋關閉珊瑚圓心（半徑 28、墨線框）＋白色粗叉，下移 6px 的暖影；點擊範圍 70×70。放在內頁右上角外緣。

### 貼紙卡（`drawStickerCard`）
答案本身。孩子要「挑一張貼上去」的就是它。
- **Corner Style:** 外 28px、內 20px。
- **Background:** 白色切割邊 10px，內部卡片紙（水果籃等可傳入其他紙色）。
- **Border:** 內側 3px 墨線。
- **Content:** 中央放貼紙素材（158×158）或程式繪製的圖，下方英文卡片字或中文字幕。
- **Tilt:** 每張不同的小角度，指路模式縮成 0.56 並擺正。

### 墨線對話框（`inkBubble`）
- 白底、26px 圓角、3px 墨線框，尾巴是一個斜三角，兩條外側邊也描墨線，指向說話者。

### 紙膠帶（`washiTape`）
- 高 36px，顏色透明度 0.88，每 22px 一道白色斜紋（0.32），底部 4px 的淡影。可旋轉；標題膠帶上可寫 22px 粉圓墨線字。

### 手帳內頁（`notebookPage`）
- 米白紙、點格、裝訂線、裝訂孔，依尺寸烘焙成一張貼圖（`nb-寬x高`）重複使用，不每幀重畫。

### Yes! 印章
- `art/stamp.svg`：印章綠雙圈（外 10px 實線、內 3.5px 虛線 7/7），-14°，用雜訊濾鏡做出斑駁油墨，**沒有**貼紙白邊。顯示 120×120，蓋在對的卡片右上角。「Yes!」由遊戲用 Andika 30px 疊上去（SVG 當圖片讀不到網頁字型）。

### 重聽鈕
- 白色圓貼紙（半徑 34）＋聽一次霧藍圓心（半徑 26、墨線框）＋喇叭圖；點擊範圍 70×70。

### 貼紙素材（`tools/art/stickers.js` → `game/art/*.svg`）
- **規格：** 240×240 viewBox；墨線 #2b3a55、粗 4.5、圓頭圓角；每個色塊用徑向漸層（中心 0.36/0.3、半徑 0.85，亮 42%→原色→暗 18%）；白色高光橢圓（0.45）；眼睛是深墨線色＋兩個反光點；腮紅 #f48fa6 透明度 0.55。
- **貼紙濾鏡：** feMorphology dilate radius 9 做白色切割邊，再加模糊落影（dy 6）。印章例外（見上）。
- **載入：** 遊戲以 320×320 點陣化（`load.svg`），顯示 158～170px。
- **新增流程：** 在 `ART` 加一個回傳 SVG 片段的函式（不含外框與濾鏡）→ `node tools/art/stickers.js` 重新輸出全部 SVG 和 `index.json` → 把名稱加進 `game.js` 的 `ART_KEYS` → 在使用處以 `'st-' + 名稱` 取貼圖，並保留 `textures.exists` 檢查與程式繪製的備援。

### 回饋狀態
答錯不懲罰，只說明再讓孩子重選；每個狀態都同時有形狀／動作、聲音、文字，色弱或轉成灰階也看得出來（已在 grayscale 截圖驗證）。
- **選對：** 印章從 1.8 倍縮回 1 倍並淡入（260ms，Back.easeOut）、唸出答案與道謝、居民向上跳 30px、卡片列下方浮出「Thank you! 星砂 +4」（當天星砂拿完改顯示「今天的星砂拿完了」），1.4 秒後換下一單。
- **選錯：** 那張卡變淡到 0.35 並鎖住不能再點、左右搖 3 下（每下 60ms）、語音「No.」後重唸題目、中文字幕在此時出現（字幕開啟時）。
- **觸控尺寸：** 卡片 196×214、按鈕高 56～70、關閉與重聽 70×70（canvas px）；在 iPad 1024×768 換算卡片約 157×171、最小按鈕約 45 CSS px。新元件點擊範圍不小於 56 canvas px。

## Do's and Don'ts

### Do:
- **Do** 讓每個可點的東西都是貼紙：白色切割邊、3px 深藍墨線、向下的暖色柔和落影。
- **Do** 把答案做成一排貼紙卡，每張給不同的小角度（-2.5°～2.5°）。
- **Do** 英文用 Andika、中文用粉圓；對話英文 46px 起、最小 34px。
- **Do** 選對用印章＋動作＋語音，選錯用變淡＋搖動＋語音＋中文字幕，不只靠顏色。
- **Do** 新圖片用 `tools/art/stickers.js` 的同一套規格產生，不手畫不同線寬或不同墨色的素材。
- **Do** 中文字幕與卡片中文用字幕石板灰，維持 4.5:1 以上的對比。

### Don't:
- **Don't** 用一般兒童遊戲的圓角塑膠按鈕或漸層面板（使用者在 A／B 對照稿中否決的方向）。
- **Don't** 用黑色或硬邊偏移陰影；落影永遠是暖褐、柔和、向下。
- **Don't** 讓紙膠帶變成按鈕，或增加第三種膠帶色。
- **Don't** 把英文對話換行或縮到 34px 以下；改寫句子。
- **Don't** 把印章做成貼紙白邊，或把「Yes!」烘進 SVG（SVG 讀不到網頁字型）。

## 已知待辦（不屬於系統規則）

- 市集訂單裡，動物園、水果、衣物已經是貼紙素材；其他 14 種（指路、職業、學校用品、季節、食物、數字、身體、動作、感覺、時段、地點、物品、顏色、月份）的圖仍是程式繪製，放進貼紙卡框。
- iPad Safari 尚未實機驗證（貼紙已改成預先輸出的 PNG，不再依賴瀏覽器的 SVG 濾鏡；仍需確認字型與效能）。
- 草地、日記本、圖鑑、實驗站、邀請卡、設定等畫面尚未改版，仍是舊視覺。
