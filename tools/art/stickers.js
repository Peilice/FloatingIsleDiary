// 貼紙素材產生器：node tools/art/stickers.js → game/art/*.svg
// 每張貼紙共用同一套規格：240×240、深藍墨線、立體漸層、白色切割邊（feMorphology 擴邊）、柔和落影
// 新增素材：在 ART 裡加一個函式，回傳 SVG 內容（不含外框與濾鏡）
const fs = require('fs');
const path = require('path');

const INK = '#2b3a55';
const SW = 4.5; // 墨線粗細

// 顏色工具：亮一點、暗一點
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}
const light = (h, t = 0.35) => mix(h, '#ffffff', t);
const dark = (h, t = 0.22) => mix(h, '#1d2238', t);

// 每個檔案自己的漸層清單
let grads = [];
function G(base) {
  const id = 'g' + grads.length;
  grads.push(`<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${light(base, 0.42)}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${dark(base, 0.18)}"/></radialGradient>`);
  return `url(#${id})`;
}
const ink = (w = SW) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const E = (cx, cy, rx, ry, fill, o = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${o}/>`;
const C = (cx, cy, r, fill, o = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${o}/>`;
const P = (d, fill, o = '') => `<path d="${d}" fill="${fill}" ${o}/>`;
// 眼睛：深色＋兩個反光點
const eye = (x, y, r = 8) => E(x, y, r * 0.86, r, INK) + C(x - r * 0.3, y - r * 0.38, r * 0.34, '#fff') + C(x + r * 0.28, y + r * 0.3, r * 0.14, '#fff');
const cheek = (x, y, r = 9) => E(x, y, r, r * 0.62, '#f48fa6', 'opacity=".55"');
const smile = (x, y, w = 9) => P(`M${x - w} ${y} Q${x - w / 2} ${y + w * 0.7} ${x} ${y} Q${x + w / 2} ${y + w * 0.7} ${x + w} ${y}`, 'none', ink(3.4));
const shine = (x, y, rx, ry, rot = -30) => E(x, y, rx, ry, '#ffffff', `opacity=".45" transform="rotate(${rot} ${x} ${y})"`);
// 一圈凸起（獅子鬃毛、雲）
function bumps(cx, cy, r, n, br) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    else {
      const am = a - Math.PI / n, mx = cx + Math.cos(am) * (r + br), my = cy + Math.sin(am) * (r + br);
      d += ` Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  return d + 'Z';
}

const ART = {
  panda: () => [
    C(66, 64, 24, G('#2f333b'), ink()), C(174, 64, 24, G('#2f333b'), ink()),
    E(120, 126, 78, 70, G('#fbfaf5'), ink()),
    E(88, 118, 19, 25, '#2f333b', 'transform="rotate(28 88 118)"'), E(152, 118, 19, 25, '#2f333b', 'transform="rotate(-28 152 118)"'),
    C(90, 116, 7, '#fff'), C(150, 116, 7, '#fff'), C(91, 117, 4, INK), C(149, 117, 4, INK), C(89, 114, 1.6, '#fff'), C(147, 114, 1.6, '#fff'),
    E(120, 146, 13, 9, '#2f333b'), shine(116, 143, 4, 2, 0), smile(120, 160, 9),
    cheek(76, 154), cheek(164, 154), shine(84, 80, 18, 9),
  ],
  lion: () => [
    P(bumps(120, 122, 82, 14, 14), G('#e8852c'), ink()),
    E(120, 126, 62, 58, G('#ffd36b'), ink()),
    C(72, 74, 15, G('#ffd36b'), ink()), C(168, 74, 15, G('#ffd36b'), ink()), C(72, 75, 7, '#e8852c'), C(168, 75, 7, '#e8852c'),
    E(120, 126, 60, 56, G('#ffd36b')),
    eye(98, 116, 8), eye(142, 116, 8),
    E(106, 152, 16, 13, '#fff6e0', ink(3)), E(134, 152, 16, 13, '#fff6e0', ink(3)),
    P('M110 136 Q120 131 130 136 Q126 146 120 148 Q114 146 110 136Z', '#7a4a2a', ink(3)),
    C(100, 152, 1.8, INK), C(106, 158, 1.8, INK), C(140, 152, 1.8, INK), C(134, 158, 1.8, INK),
    cheek(82, 140, 8), cheek(158, 140, 8), shine(92, 94, 16, 8),
  ],
  tiger: () => [
    C(66, 70, 20, G('#f39233'), ink()), C(174, 70, 20, G('#f39233'), ink()), C(66, 72, 9, '#fff3e0'), C(174, 72, 9, '#fff3e0'),
    E(120, 128, 80, 68, G('#f39233'), ink()),
    P('M120 66 L112 84 L120 80 L128 84Z', INK), P('M100 70 L102 88', 'none', ink(5)), P('M140 70 L138 88', 'none', ink(5)),
    P('M44 120 L66 124 L48 132', 'none', ink(5)), P('M196 120 L174 124 L192 132', 'none', ink(5)),
    P('M46 146 L66 144', 'none', ink(4.5)), P('M194 146 L174 144', 'none', ink(4.5)),
    E(120, 156, 40, 30, '#fff8ec', ink(3)),
    eye(96, 118, 8.5), eye(144, 118, 8.5),
    P('M111 142 Q120 137 129 142 Q125 151 120 152 Q115 151 111 142Z', '#f06b8a', ink(3)),
    P('M120 152 L120 160', 'none', ink(3)), smile(120, 162, 9), shine(90, 92, 16, 8),
  ],
  bear: () => [
    C(64, 68, 24, G('#9a6a43'), ink()), C(176, 68, 24, G('#9a6a43'), ink()), C(64, 70, 12, '#d9b48c'), C(176, 70, 12, '#d9b48c'),
    E(120, 128, 76, 70, G('#9a6a43'), ink()),
    E(120, 152, 32, 25, G('#e2c39d'), ink(3)),
    eye(94, 118, 8.5), eye(146, 118, 8.5),
    E(120, 142, 12, 9, INK), shine(116, 139, 4, 2, 0), smile(120, 158, 8),
    cheek(76, 146), cheek(164, 146), shine(88, 88, 18, 9),
  ],
  dog: () => [
    E(52, 128, 22, 50, G('#7a5236'), ink() + ' transform="rotate(16 52 128)"'), E(188, 128, 22, 50, G('#7a5236'), ink() + ' transform="rotate(-16 188 128)"'),
    E(120, 120, 68, 66, G('#e0bd92'), ink()),
    E(146, 104, 20, 17, '#a9774f', 'opacity=".75"'),
    E(120, 152, 36, 28, '#fbeedd', ink(3)),
    eye(96, 112, 8.5), eye(144, 112, 8.5),
    E(120, 140, 13, 10, INK), shine(115, 137, 4, 2, 0),
    P('M120 150 L120 158', 'none', ink(3)), P('M106 158 Q120 168 134 158', 'none', ink(3.4)),
    P('M114 162 Q120 182 128 163Z', '#f06b8a', ink(3)),
    cheek(80, 138), cheek(160, 138), shine(92, 80, 18, 9),
  ],
  pig: () => [
    P('M60 92 L54 50 L94 72Z', G('#f6a9bd'), ink()), P('M180 92 L186 50 L146 72Z', G('#f6a9bd'), ink()),
    E(120, 126, 78, 68, G('#f9c0cd'), ink()),
    E(120, 144, 30, 22, G('#f39bb2'), ink(3.5)), E(110, 144, 5, 7.5, '#b5466a'), E(130, 144, 5, 7.5, '#b5466a'),
    eye(90, 112, 8), eye(150, 112, 8),
    smile(120, 172, 8), cheek(74, 140), cheek(166, 140), shine(88, 88, 18, 9),
  ],
  chicken: () => [
    P('M102 206 L102 220 M92 222 L112 222 M138 206 L138 220 M128 222 L148 222', 'none', `stroke="#f29b2e" stroke-width="6" stroke-linecap="round"`),
    P('M70 150 Q60 96 104 70 Q150 50 168 92 Q190 130 178 168 Q162 210 118 208 Q78 204 70 150Z', G('#fffaf2'), ink()),
    P('M120 66 Q114 44 128 46 Q132 34 144 42 Q156 38 154 54 Q160 64 148 70Z', G('#ef4b4b'), ink(3.5)),
    P('M168 98 L196 108 L168 116Z', G('#ffb62e'), ink(3.5)),
    P('M162 118 Q172 134 160 140 Q150 130 156 118Z', G('#ef4b4b'), ink(3)),
    eye(148, 96, 7.5),
    P('M88 150 Q108 128 132 150 Q112 172 88 150Z', G('#f2e8d8'), ink(3.5)),
    cheek(150, 116, 7), shine(100, 92, 16, 9),
  ],
  elephant: () => [
    E(56, 118, 46, 56, G('#8fa6b8'), ink()), E(184, 118, 46, 56, G('#8fa6b8'), ink()),
    E(56, 120, 28, 36, '#f4b9c6', 'opacity=".8"'), E(184, 120, 28, 36, '#f4b9c6', 'opacity=".8"'),
    E(120, 108, 58, 56, G('#a9bdcc'), ink()),
    P('M104 140 Q100 190 122 206 Q142 216 146 198 Q134 196 130 184 Q126 164 136 140Z', G('#a9bdcc'), ink()),
    P('M110 168 L130 168 M108 182 L128 184', 'none', `stroke="${dark('#a9bdcc', 0.3)}" stroke-width="2.6" stroke-linecap="round"`),
    eye(96, 104, 8), eye(144, 104, 8), cheek(86, 128), cheek(154, 128), shine(98, 78, 16, 8),
  ],
  snake: () => [
    P('M50 190 Q30 160 60 146 Q110 128 150 150 Q190 170 196 140 Q200 112 168 108', 'none', `stroke="${INK}" stroke-width="34" stroke-linecap="round"`),
    P('M50 190 Q30 160 60 146 Q110 128 150 150 Q190 170 196 140 Q200 112 168 108', 'none', `stroke="#56b45a" stroke-width="25" stroke-linecap="round"`),
    P('M50 190 Q30 160 60 146 Q110 128 150 150 Q190 170 196 140', 'none', `stroke="#c9e88f" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"`),
    E(150, 92, 40, 32, G('#56b45a'), ink()),
    eye(138, 84, 7.5), eye(166, 84, 7.5),
    P('M150 116 L150 132 M150 132 L142 140 M150 132 L158 140', 'none', `stroke="#e5484d" stroke-width="3.6" stroke-linecap="round"`),
    smile(152, 104, 9), cheek(128, 100, 6), cheek(176, 100, 6), shine(140, 72, 12, 6),
  ],
  deer: () => [
    P('M86 70 Q70 40 78 22 M80 46 Q62 40 56 28 M154 70 Q170 40 162 22 M160 46 Q178 40 184 28', 'none', `stroke="${INK}" stroke-width="13" stroke-linecap="round"`),
    P('M86 70 Q70 40 78 22 M80 46 Q62 40 56 28 M154 70 Q170 40 162 22 M160 46 Q178 40 184 28', 'none', `stroke="#8a5a36" stroke-width="6" stroke-linecap="round"`),
    E(62, 92, 26, 14, G('#c89464'), ink() + ' transform="rotate(-24 62 92)"'), E(178, 92, 26, 14, G('#c89464'), ink() + ' transform="rotate(24 178 92)"'),
    P('M76 96 Q78 66 120 64 Q162 66 164 96 Q166 150 140 182 Q120 200 100 182 Q74 150 76 96Z', G('#c89464'), ink()),
    E(120, 170, 26, 22, '#f6e6d2', ink(3)), E(120, 160, 11, 8, INK), shine(116, 158, 3.5, 2, 0),
    C(100, 90, 4, '#fff6e8'), C(140, 92, 4, '#fff6e8'), C(120, 80, 3.5, '#fff6e8'),
    eye(100, 118, 8), eye(140, 118, 8), cheek(92, 140, 7), cheek(148, 140, 7), shine(96, 82, 12, 6),
  ],
  dolphin: () => [
    P('M30 196 Q60 184 90 196 Q120 208 150 196 Q180 184 210 196', 'none', `stroke="#4fb7e6" stroke-width="7" stroke-linecap="round"`),
    P('M30 126 Q44 80 112 72 Q160 66 184 92 Q192 100 220 106 Q226 116 212 120 Q194 124 182 128 Q160 162 106 164 Q66 164 48 150 L20 168 L28 140 L12 122 Z', G('#7fb2d6'), ink()),
    P('M116 74 Q122 46 144 38 Q140 60 148 76Z', G('#7fb2d6'), ink()),
    P('M70 146 Q110 156 160 140 Q140 162 100 160 Q78 158 70 146Z', '#e7f3fb'),
    P('M108 126 Q118 148 138 140 Q124 134 118 124Z', G('#6a9cc2'), ink(3.2)),
    eye(172, 102, 7.5), smile(202, 118, 6), cheek(166, 122, 6), shine(110, 88, 22, 8, -10),
  ],
  whale: () => [
    P('M120 48 Q114 30 102 26 M120 48 Q126 30 138 26 M120 48 L120 22', 'none', `stroke="#6cc7ee" stroke-width="6" stroke-linecap="round"`),
    P('M24 132 Q22 66 104 62 Q186 60 200 120 L226 98 Q232 128 214 146 L226 168 Q206 166 194 156 Q176 196 108 196 Q28 196 24 132Z', G('#2f7fc7'), ink()),
    P('M44 160 Q90 186 170 168 Q150 192 108 192 Q60 192 44 160Z', '#d6ecfa', ink(3)),
    P('M70 178 L74 168 M92 184 L94 172 M116 186 L116 174 M140 184 L138 172', 'none', `stroke="#9cc9e8" stroke-width="3" stroke-linecap="round"`),
    eye(70, 120, 8.5), smile(58, 146, 8), cheek(90, 140, 9), shine(84, 84, 30, 10, -8),
  ],
  rabbit: () => [
    E(92, 54, 20, 50, G('#fffdf8'), ink() + ' transform="rotate(-8 92 54)"'), E(148, 54, 20, 50, G('#fffdf8'), ink() + ' transform="rotate(8 148 54)"'),
    E(92, 58, 9, 34, '#f8bccb', 'transform="rotate(-8 92 58)"'), E(148, 58, 9, 34, '#f8bccb', 'transform="rotate(8 148 58)"'),
    E(120, 146, 70, 64, G('#fffdf8'), ink()),
    eye(96, 136, 8.5), eye(144, 136, 8.5),
    P('M112 156 Q120 150 128 156 Q124 164 120 164 Q116 164 112 156Z', '#f17d9a', ink(2.6)),
    P('M120 164 L120 170', 'none', ink(3)), smile(120, 172, 8),
    cheek(80, 162, 10), cheek(160, 162, 10), shine(90, 110, 18, 9),
  ],
  frog: () => [
    C(80, 80, 30, G('#6cc35a'), ink()), C(160, 80, 30, G('#6cc35a'), ink()),
    E(120, 138, 86, 62, G('#6cc35a'), ink()),
    C(80, 80, 18, '#fff', ink(3)), C(160, 80, 18, '#fff', ink(3)), eye(82, 82, 9), eye(158, 82, 9),
    E(120, 160, 46, 26, '#c9eda6', 'opacity=".75"'),
    P('M78 140 Q120 178 162 140', 'none', ink(4)), cheek(66, 140, 10), cheek(174, 140, 10), shine(100, 112, 22, 8, -10),
  ],
  duck: () => [
    P('M50 170 Q44 120 96 112 Q100 76 130 64 Q170 56 180 96 Q186 126 160 140 Q206 140 200 174 Q190 210 124 210 Q60 210 50 170Z', G('#ffd84a'), ink()),
    P('M176 98 Q214 96 220 110 Q208 124 172 118Z', G('#ff9a2e'), ink(3.5)),
    eye(150, 92, 8), cheek(152, 116, 8),
    P('M78 164 Q104 140 140 166 Q110 186 78 164Z', G('#f6c42d'), ink(3.5)), shine(120, 82, 14, 8),
  ],
  fish: () => [
    P('M30 126 L8 92 Q12 126 8 160Z', G('#f4823a'), ink()),
    P('M30 126 Q60 64 140 66 Q206 70 222 126 Q206 184 140 186 Q60 188 30 126Z', G('#f8994a'), ink()),
    P('M110 68 Q130 36 168 50 Q160 64 160 72Z', G('#f4823a'), ink(3.5)),
    P('M90 110 Q100 126 90 142 M114 104 Q126 126 114 148 M138 104 Q150 126 138 148', 'none', `stroke="${dark('#f8994a', 0.25)}" stroke-width="3" stroke-linecap="round"`),
    eye(178, 112, 9), smile(200, 140, 6), cheek(172, 142, 7), shine(130, 84, 26, 8, -6),
  ],
  bird: () => [
    P('M40 132 L14 116 L22 146Z', G('#3d8fd8'), ink()),
    E(118, 128, 82, 74, G('#5aa9ec'), ink()),
    E(120, 160, 50, 34, '#e6f3fd', 'opacity=".9"'),
    P('M74 126 Q100 104 132 128 Q108 162 74 126Z', G('#3d8fd8'), ink(3.5)),
    P('M186 116 L216 126 L186 136Z', G('#ffb02e'), ink(3.5)),
    eye(164, 110, 8.5), cheek(160, 136, 8), shine(98, 84, 22, 9),
  ],
  monkey: () => [
    C(52, 120, 26, G('#e9b98e'), ink()), C(188, 120, 26, G('#e9b98e'), ink()),
    E(120, 116, 78, 74, G('#8c5a37'), ink()),
    P('M66 120 Q66 76 104 82 Q120 92 136 82 Q174 76 174 120 Q174 182 120 184 Q66 182 66 120Z', G('#f1caa0'), ink(3.5)),
    eye(100, 116, 8.5), eye(140, 116, 8.5),
    E(112, 144, 3, 4, INK), E(128, 144, 3, 4, INK), P('M96 158 Q120 178 144 158', 'none', ink(3.6)),
    cheek(86, 146), cheek(154, 146), shine(94, 72, 18, 8),
  ],
  cow: () => [
    P('M72 74 Q60 46 70 36 Q80 50 88 70Z', G('#f1e3b8'), ink(3.5)), P('M168 74 Q180 46 170 36 Q160 50 152 70Z', G('#f1e3b8'), ink(3.5)),
    E(48, 98, 26, 13, G('#fbf8f2'), ink() + ' transform="rotate(-18 48 98)"'), E(192, 98, 26, 13, G('#fbf8f2'), ink() + ' transform="rotate(18 192 98)"'),
    P('M66 92 Q64 60 120 58 Q176 60 174 92 Q178 140 160 164 L80 164 Q62 140 66 92Z', G('#fbf8f2'), ink()),
    P('M70 92 Q84 70 106 76 Q102 100 80 104Z', '#3a3f4a'), P('M150 70 Q176 76 172 104 Q154 100 150 70Z', '#3a3f4a'),
    eye(98, 112, 8), eye(142, 112, 8),
    E(120, 166, 58, 34, G('#f7b3c2'), ink()), E(102, 166, 7, 9, '#b5466a'), E(138, 166, 7, 9, '#b5466a'),
    smile(120, 186, 8), shine(96, 72, 16, 7),
  ],
  horse: () => [
    P('M82 66 L76 30 L104 52Z', G('#a86c3e'), ink()), P('M158 66 L164 30 L136 52Z', G('#a86c3e'), ink()),
    P('M74 92 Q76 52 120 50 Q164 52 166 92 Q170 150 152 190 Q120 212 88 190 Q70 150 74 92Z', G('#b97844'), ink()),
    P('M98 54 Q120 36 142 54 Q138 74 120 66 Q104 76 98 54Z', '#4a3326', ink(3)),
    E(120, 178, 36, 26, G('#e8c39a'), ink(3.5)), E(108, 178, 5, 7, INK), E(132, 178, 5, 7, INK),
    eye(96, 108, 8.5), eye(144, 108, 8.5), cheek(90, 140, 8), cheek(150, 140, 8), shine(98, 78, 14, 7),
  ],
  fox: () => [
    P('M64 96 L52 30 L106 68Z', G('#f08a3a'), ink()), P('M176 96 L188 30 L134 68Z', G('#f08a3a'), ink()),
    P('M66 86 L60 46 L94 70Z', '#3b2f2a'), P('M174 86 L180 46 L146 70Z', '#3b2f2a'),
    P('M54 104 Q60 62 120 60 Q180 62 186 104 Q192 150 150 178 Q120 196 90 178 Q48 150 54 104Z', G('#f08a3a'), ink()),
    P('M70 128 Q92 120 110 140 Q120 152 130 140 Q148 120 170 128 Q164 166 120 182 Q76 166 70 128Z', '#fff7ee'),
    eye(96, 118, 8.5), eye(144, 118, 8.5),
    E(120, 150, 10, 7.5, INK), shine(116, 148, 3.5, 2, 0), smile(120, 162, 7),
    cheek(82, 146, 8), cheek(158, 146, 8), shine(92, 82, 18, 8),
  ],
  // 印章：選對時蓋在卡片上
  stamp: () => [
    `<g transform="rotate(-14 120 120)">`,
    C(120, 120, 86, 'none', `stroke="#2f8a5b" stroke-width="10"`),
    C(120, 120, 70, 'none', `stroke="#2f8a5b" stroke-width="3.5" stroke-dasharray="7 7"`),
    // 「Yes!」由遊戲用 Andika 疊上去（SVG 當成圖片時讀不到網頁字型）
    `</g>`,
  ],
};

// 印章不加貼紙白邊，改成有點斑駁的油墨
const PLAIN = { stamp: true };

function svgFor(name) {
  grads = [];
  const body = ART[name]().join('\n    ');
  const sticker = `<filter id="sticker" x="-12%" y="-12%" width="124%" height="130%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="9" result="d"/>
      <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="w"/>
      <feGaussianBlur in="d" stdDeviation="4" result="b"/><feOffset in="b" dy="6" result="o"/>
      <feFlood flood-color="#3b2f1e" flood-opacity=".3"/><feComposite in2="o" operator="in" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  const worn = `<filter id="worn"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/>
      <feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.35" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    ${grads.join('\n    ')}
    ${PLAIN[name] ? worn : sticker}
  </defs>
  <g filter="url(#${PLAIN[name] ? 'worn' : 'sticker'})">
    ${body}
  </g>
</svg>
`;
}

const out = path.join(__dirname, '..', '..', 'game', 'art');
fs.mkdirSync(out, { recursive: true });
Object.keys(ART).forEach((k) => fs.writeFileSync(path.join(out, k + '.svg'), svgFor(k)));
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(Object.keys(ART)) + '\n');
console.log('wrote', Object.keys(ART).length, 'stickers to', out);
