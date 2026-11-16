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

// 蘋果：同一個外形換顏色
function apple(c) {
  return [
    P('M120 78 Q150 54 178 78 Q204 106 194 150 Q182 198 144 202 Q130 204 120 196 Q110 204 96 202 Q58 198 46 150 Q36 106 62 78 Q90 54 120 78Z', G(c), ink()),
    P('M120 80 Q118 60 126 44', 'none', `stroke="${INK}" stroke-width="10" stroke-linecap="round"`),
    P('M120 80 Q118 60 126 44', 'none', `stroke="#7a4f2a" stroke-width="5" stroke-linecap="round"`),
    P('M128 56 Q150 34 176 44 Q160 70 128 56Z', G('#5aa83f'), ink(3.5)),
    shine(80, 104, 14, 24, 20), C(92, 140, 4, '#ffffff', 'opacity=".5"'),
  ];
}
// 葡萄：一串圓粒（上寬下窄）
function grape(c) {
  const rows = [[4, 88], [3, 122], [2, 154], [1, 184]];
  const out = [P('M120 72 Q122 52 134 40', 'none', `stroke="${INK}" stroke-width="10" stroke-linecap="round"`),
    P('M120 72 Q122 52 134 40', 'none', `stroke="#6d4a2a" stroke-width="5" stroke-linecap="round"`),
    P('M128 60 Q162 36 188 56 Q162 78 128 60Z', G('#5aa83f'), ink(3.5))];
  rows.forEach(([n, y]) => {
    for (let i = 0; i < n; i++) {
      const x = 120 + (i - (n - 1) / 2) * 36;
      out.push(C(x, y, 20, G(c), ink(3.6)), C(x - 7, y - 7, 4.5, '#ffffff', 'opacity=".6"'));
    }
  });
  return out;
}
// 建築：牆、屋頂、門窗（地點貼紙共用）
const R = (x, y, w, h, fill, o = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${o}/>`;
const RR = (x, y, w, h, r, fill, o = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${o}/>`;
function windowPane(x, y, w = 26, h = 26) {
  return RR(x, y, w, h, 4, '#bfe6f6', ink(3)) + P(`M${x + w / 2} ${y} L${x + w / 2} ${y + h} M${x} ${y + h / 2} L${x + w} ${y + h / 2}`, 'none', ink(2.5))
    + P(`M${x + 4} ${y + 9} L${x + 9} ${y + 4}`, 'none', 'stroke="#ffffff" stroke-width="3" stroke-linecap="round"');
}
const ground = () => E(120, 204, 96, 14, '#8bc66a', ink(3.5));

// 人物（職業）：同一個小朋友的頭身，靠衣服、帽子、道具分辨
function person(o) {
  const skin = '#f6c9a0', hair = o.hair || '#5b3a26';
  return [
    // 身體（制服）
    P('M60 214 Q60 150 120 146 Q180 150 180 214Z', G(o.coat), ink()),
    o.inner ? P('M104 148 L120 182 L136 148Z', o.inner, ink(3)) : '',
    // 頭
    E(120, 100, 46, 48, G(skin), ink()),
    P('M74 96 Q72 52 120 50 Q168 52 166 96 Q150 74 120 74 Q90 74 74 96Z', G(hair), ink(3.5)),
    eye(102, 104, 6.5), eye(138, 104, 6.5), cheek(92, 122, 7), cheek(148, 122, 7), smile(120, 126, 7),
    o.extra || '',
  ].join('');
}

// 場景小卡（季節、時段、湖海山路）：圓角方框當背景
function scene(sky, inner) {
  return [`<clipPath id="sc"><rect x="30" y="34" width="180" height="172" rx="26"/></clipPath>`,
    RR(30, 34, 180, 172, 26, sky, ink()), `<g clip-path="url(#sc)">`, ...inner, `</g>`, RR(30, 34, 180, 172, 26, 'none', ink())];
}
function sunRays(cx, cy, r, c = '#ffb300') {
  let d = '';
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; d += `M${(cx + Math.cos(a) * (r + 6)).toFixed(1)} ${(cy + Math.sin(a) * (r + 6)).toFixed(1)} L${(cx + Math.cos(a) * (r + 16)).toFixed(1)} ${(cy + Math.sin(a) * (r + 16)).toFixed(1)} `; }
  return P(d, 'none', `stroke="${c}" stroke-width="6" stroke-linecap="round"`) + C(cx, cy, r, G('#ffd54a'), ink(3.5));
}
function flower(x, y, c, r = 9) {
  let o = '';
  for (let i = 0; i < 5; i++) { const a = i * 1.2566 - Math.PI / 2; o += C(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, c, ink(2.4)); }
  return o + C(x, y, r * 0.55, '#fff3b0', ink(2.4));
}
// 氣球（顏色訂單）
function balloon(c) {
  return [
    P('M120 170 Q112 190 124 204 Q134 216 124 230', 'none', `stroke="${INK}" stroke-width="3" stroke-linecap="round"`),
    P('M120 30 Q176 30 180 92 Q182 146 120 172 Q58 146 60 92 Q64 30 120 30Z', G(c), ink()),
    P('M110 170 L130 170 L124 182 L116 182Z', G(c), ink(3)),
    c === '#ffffff' ? '' : E(94, 74, 12, 22, '#ffffff', 'opacity=".45" transform="rotate(20 94 74)"'),
  ];
}

// 一隻球鞋
function shoe(x, y) {
  const t = (d) => d.replace(/(-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g, (m, a, _, b) => (Number(a) + x) + ' ' + (Number(b) + y));
  return [
    P(t('M6 40 Q4 10 30 6 L56 4 Q66 26 96 30 Q120 34 122 52 L122 62 L6 62Z'), G('#3d7fd6'), ink()),
    P(t('M2 58 L126 58 Q126 76 110 76 L14 76 Q2 76 2 58Z'), '#ffffff', ink()),
    P(t('M44 22 L66 34 M40 32 L62 42 M36 42 L56 50'), 'none', `stroke="#ffffff" stroke-width="4" stroke-linecap="round"`),
    P(t('M18 18 Q30 12 44 12'), 'none', `stroke="${light('#3d7fd6', 0.5)}" stroke-width="5" stroke-linecap="round"`),
  ].join('');
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
  // ---- 水果（市集水果訂單：BINS 的 6 種）----
  'apple-red': () => apple('#e8443a'),
  'apple-green': () => apple('#8cc63f'),
  'apple-yellow': () => apple('#f5cf3a'),
  'grape-purple': () => grape('#8e4fb5'),
  'grape-green': () => grape('#a4cf55'),
  banana: () => [
    P('M64 70 Q40 140 96 186 Q150 214 196 176 Q150 186 118 156 Q84 124 84 72Z', G('#eebb2c'), ink()),
    P('M60 64 L84 72 L80 56Z', '#6d5233', ink(3)),
    P('M80 66 Q66 140 120 176 Q166 200 206 162 Q206 152 196 150 Q160 176 126 150 Q96 120 100 70Z', G('#f8d84e'), ink()),
    P('M96 64 L100 74 L82 70Z', '#6d5233', ink(3)),
    P('M206 162 L214 160 L208 150Z', '#6d5233', ink(3)),
    P('M98 92 Q96 136 132 160', 'none', `stroke="${light('#f8d84e', 0.6)}" stroke-width="6" stroke-linecap="round"`),
  ],
  // ---- 衣物（市集衣物訂單）----
  hat: () => [
    E(120, 150, 100, 34, G('#e9c46a'), ink()),
    P('M66 146 Q66 72 120 70 Q174 72 174 146 Q120 160 66 146Z', G('#f0cf7c'), ink()),
    P('M68 126 Q120 142 172 126 L172 144 Q120 158 68 144Z', G('#e5484d'), ink(3.5)),
    P('M80 110 Q120 116 160 110', 'none', `stroke="${dark('#f0cf7c', 0.15)}" stroke-width="2.5" stroke-linecap="round"`),
    shine(98, 96, 14, 7),
  ],
  coat: () => [
    P('M74 70 L40 100 L30 186 L62 190 L72 120 Z', G('#3f8fb5'), ink()),
    P('M166 70 L200 100 L210 186 L178 190 L168 120 Z', G('#3f8fb5'), ink()),
    P('M74 68 Q120 56 166 68 L176 206 Q120 216 64 206Z', G('#4aa0c6'), ink()),
    P('M98 62 L120 96 L142 62 Q132 58 120 60 Q108 58 98 62Z', '#f6efe1', ink(3.5)),
    P('M120 96 L120 208', 'none', ink(3.5)),
    C(108, 122, 5.5, '#f6d36b', ink(2.5)), C(108, 150, 5.5, '#f6d36b', ink(2.5)), C(108, 178, 5.5, '#f6d36b', ink(2.5)),
    P('M136 150 L160 150 L160 172 L136 172Z', G('#3f8fb5'), ink(3)),
    shine(92, 92, 10, 18, 0),
  ],
  umbrella: () => [
    P('M120 120 L120 196 Q120 214 138 214 Q154 214 154 198', 'none', `stroke="${INK}" stroke-width="11" stroke-linecap="round"`),
    P('M120 120 L120 196 Q120 214 138 214 Q154 214 154 198', 'none', `stroke="#8a5a36" stroke-width="5" stroke-linecap="round"`),
    P('M24 126 Q30 46 120 40 Q210 46 216 126 Q200 112 184 126 Q168 112 152 126 Q136 112 120 126 Q104 112 88 126 Q72 112 56 126 Q40 112 24 126Z', G('#e8443a'), ink()),
    P('M120 40 Q96 80 88 126 Q104 112 120 126 Q136 112 152 126 Q144 80 120 40Z', G('#fff6ee'), ink(3.5)),
    C(120, 36, 6, '#8a5a36', ink(3)), shine(70, 74, 16, 8),
  ],
  raincoat: () => [
    P('M84 50 Q120 24 156 50 Q172 70 168 96 L72 96 Q68 70 84 50Z', G('#f6c43a'), ink()),
    P('M92 96 Q120 64 148 96Z', '#fdf1c7', ink(3)),
    P('M72 92 L36 122 L30 192 L60 196 L72 136Z', G('#f2b52c'), ink()),
    P('M168 92 L204 122 L210 192 L180 196 L168 136Z', G('#f2b52c'), ink()),
    P('M72 92 Q120 104 168 92 L182 210 Q120 222 58 210Z', G('#f8cd45'), ink()),
    P('M120 104 L120 214', 'none', ink(3.5)),
    C(108, 132, 5, '#ffffff', ink(2.5)), C(108, 160, 5, '#ffffff', ink(2.5)), C(108, 188, 5, '#ffffff', ink(2.5)),
    P('M180 60 Q174 72 180 78 Q186 72 180 60Z', '#5ab4e6', ink(2)), P('M200 84 Q194 96 200 102 Q206 96 200 84Z', '#5ab4e6', ink(2)),
    shine(96, 130, 9, 20, 0),
  ],
  shoes: () => [
    shoe(36, 104), shoe(108, 132),
  ],
  // ---- 地點（市集指路訂單）----
  zoo: () => [
    ground(),
    R(46, 92, 16, 112, G('#8d6e4a'), ink()), R(178, 92, 16, 112, G('#8d6e4a'), ink()),
    P('M62 112 L178 112 M62 150 L178 150', 'none', ink(4)),
    ...[78, 98, 118, 138, 158].map((x) => R(x, 112, 6, 92, '#a9805a', ink(2.5))),
    RR(52, 56, 136, 44, 12, G('#5aa83f'), ink()),
    C(96, 78, 13, G('#ffd36b'), ink(3)), C(92, 75, 2.5, INK), C(100, 75, 2.5, INK),
    E(146, 80, 16, 12, G('#a9bdcc'), ink(3)), C(142, 77, 2.5, INK),
  ],
  park: () => [
    ground(),
    R(70, 120, 14, 80, G('#8a5a36'), ink()), C(77, 96, 40, G('#5aa83f'), ink()), C(62, 82, 14, '#ffffff', 'opacity=".25"'),
    RR(112, 150, 92, 12, 4, G('#d98c4a'), ink(3.5)), RR(112, 168, 92, 10, 4, G('#d98c4a'), ink(3.5)),
    R(118, 176, 8, 24, '#6d4c34', ink(2.5)), R(190, 176, 8, 24, '#6d4c34', ink(2.5)),
    ...[[134, 196, '#f48fb1'], [156, 198, '#fdd835'], [178, 196, '#ce93d8']].map(([x, y, c]) => C(x, y, 7, c, ink(2.5)) + C(x, y, 2.5, '#fff6d0')),
  ],
  library: () => [
    ground(),
    P('M36 92 L120 46 L204 92Z', G('#c4473d'), ink()),
    R(50, 92, 140, 108, G('#f6e3c4'), ink()),
    ...[66, 98, 130, 162].map((x) => R(x, 104, 12, 84, '#ffffff', ink(2.5))),
    RR(98, 138, 44, 62, 6, '#8a5a36', ink(3)),
    RR(86, 60, 68, 26, 6, '#ffffff', ink(3)),
    P('M98 66 L118 70 L118 82 L98 78Z', '#3d7fd6', ink(2)), P('M142 66 L122 70 L122 82 L142 78Z', '#43a047', ink(2)),
  ],
  hospital: () => [
    ground(),
    R(50, 66, 140, 134, G('#f7fbff'), ink()),
    R(42, 58, 156, 16, G('#7fc4dc'), ink(3.5)),
    RR(98, 84, 44, 44, 8, '#ffffff', ink(3)), R(114, 90, 12, 32, '#e5484d'), R(104, 100, 32, 12, '#e5484d'),
    windowPane(62, 92), windowPane(152, 92),
    RR(100, 150, 40, 50, 6, G('#7fc4dc'), ink(3)), P('M120 150 L120 200', 'none', ink(2.5)),
    windowPane(62, 146), windowPane(152, 146),
  ],
  school: () => [
    ground(),
    P('M120 30 L120 64', 'none', ink(4)), P('M122 32 L150 40 L122 48Z', '#e5484d', ink(3)),
    P('M56 98 L120 58 L184 98Z', G('#e8852c'), ink()),
    R(60, 98, 120, 102, G('#ffe6a8'), ink()),
    C(120, 84, 13, '#ffffff', ink(3)), P('M120 84 L120 76 M120 84 L126 88', 'none', ink(2.5)),
    windowPane(72, 112), windowPane(142, 112),
    RR(102, 146, 36, 54, 6, '#8a5a36', ink(3)), C(130, 174, 3, '#f6d36b'),
    R(24, 142, 36, 58, G('#ffe6a8'), ink(3.5)), R(180, 142, 36, 58, G('#ffe6a8'), ink(3.5)),
  ],
  store: () => [
    ground(),
    R(50, 96, 140, 104, G('#fff3df'), ink()),
    P('M40 70 L200 70 L196 104 L44 104Z', '#ffffff', ink()),
    ...[0, 1, 2, 3].map((i) => P(`M${44 + i * 40} 70 L${64 + i * 40} 70 L${62 + i * 40} 104 L${46 + i * 40} 104Z`, '#e5484d')),
    P('M40 70 L200 70 L196 104 L44 104Z', 'none', ink()),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => C(48 + i * 20.5, 106, 10, i % 2 ? '#ffffff' : '#e5484d', ink(2.5))),
    RR(62, 130, 56, 46, 6, '#bfe6f6', ink(3)), C(78, 154, 7, '#e8443a', ink(2)), C(98, 158, 7, '#f6c43a', ink(2)),
    RR(132, 130, 44, 70, 6, '#3d7fd6', ink(3)), C(166, 168, 3, '#f6d36b'),
  ],
  // ---- 職業（市集「Who is the doctor?」）----
  doctor: () => [person({ coat: '#f7fbff', inner: '#7fc4dc', extra:
    P('M96 160 Q96 196 120 196 Q144 196 144 160', 'none', ink(4)) + C(120, 198, 7, '#b0bec5', ink(3)) + R(146, 168, 18, 6, '#7fc4dc', ink(2)) }) ],
  nurse: () => [person({ coat: '#f8bccb', inner: '#ffffff', hair: '#7a4a2a', extra:
    RR(94, 44, 52, 20, 6, '#ffffff', ink(3)) + R(116, 47, 8, 14, '#e5484d') + R(113, 50, 14, 8, '#e5484d') }) ],
  police: () => [person({ coat: '#2f4a8a', inner: '#bfe6f6', extra:
    P('M70 76 Q72 42 120 40 Q168 42 170 76Z', G('#2f4a8a'), ink()) + RR(66, 72, 108, 12, 6, '#1d2f5c', ink(3))
    + P('M120 46 L128 58 L120 68 L112 58Z', '#f6d36b', ink(2.5)) + P('M84 176 L92 168 L100 176 L92 186Z', '#f6d36b', ink(2.5)) }) ],
  driver: () => [person({ coat: '#5d7f99', inner: '#ffffff', extra:
    RR(78, 50, 84, 18, 8, G('#5d7f99'), ink(3)) + RR(74, 64, 60, 8, 4, '#3b5468', ink(2.5))
    + C(178, 184, 26, 'none', `stroke="${INK}" stroke-width="10"`) + C(178, 184, 26, 'none', 'stroke="#455a64" stroke-width="5"') + C(178, 184, 6, '#455a64', ink(2.5)) }) ],
  teacher: () => [person({ coat: '#8e4fb5', inner: '#ffffff', hair: '#3a2a20', extra:
    RR(10, 40, 56, 44, 4, G('#2e7d4f'), ink(3.5)) + P('M20 54 L54 54 M20 66 L46 66', 'none', 'stroke="#ffffff" stroke-width="3" stroke-linecap="round"')
    + P('M70 170 L42 92', 'none', `stroke="${INK}" stroke-width="7" stroke-linecap="round"`) + P('M70 170 L42 92', 'none', 'stroke="#d9a066" stroke-width="3" stroke-linecap="round"')
    + C(102, 104, 11, 'none', ink(2.5)) + C(138, 104, 11, 'none', ink(2.5)) + P('M113 104 L127 104', 'none', ink(2.5)) }) ],
  farmer: () => [person({ coat: '#6fa33c', inner: '#3d7fd6', extra:
    E(120, 62, 70, 14, G('#f0cf7c'), ink(3.5)) + P('M88 60 Q90 34 120 32 Q150 34 152 60Z', G('#f0cf7c'), ink(3.5)) + R(88, 52, 64, 8, '#c4473d')
    + P('M196 98 L196 214', 'none', `stroke="${INK}" stroke-width="9" stroke-linecap="round"`) + P('M196 98 L196 214', 'none', 'stroke="#a9805a" stroke-width="4" stroke-linecap="round"')
    + P('M182 84 L182 100 L210 100 L210 84 M196 84 L196 100', 'none', ink(4)) }) ],
  cook: () => [person({ coat: '#ffffff', inner: '#e5484d', extra:
    C(104, 38, 18, '#ffffff', ink(3)) + C(136, 38, 18, '#ffffff', ink(3)) + C(120, 28, 20, '#ffffff', ink(3)) + R(92, 46, 56, 20, '#ffffff', ink(3))
    + E(186, 186, 24, 10, '#90a4ae', ink(3)) + P('M210 186 L232 180', 'none', ink(5)) }) ],
  student: () => [person({ coat: '#f6c43a', inner: '#ffffff', extra:
    RR(150, 152, 40, 56, 8, G('#e5484d'), ink(3)) + P('M150 162 Q136 156 136 176', 'none', ink(4)) + R(160, 176, 20, 10, '#ffcdd2', ink(2)) }) ],
  // ---- 學校用品（市集「I need a ruler for school.」）----
  book: () => [
    P('M30 70 Q76 56 120 76 L120 196 Q76 176 30 190Z', G('#3d7fd6'), ink()),
    P('M210 70 Q164 56 120 76 L120 196 Q164 176 210 190Z', G('#43a047'), ink()),
    P('M40 78 Q78 66 114 84 L114 188 Q78 172 40 182Z', '#ffffff', ink(2.5)),
    P('M200 78 Q162 66 126 84 L126 188 Q162 172 200 182Z', '#ffffff', ink(2.5)),
    P('M52 100 L102 108 M52 120 L102 128 M52 140 L92 146 M138 108 L188 100 M138 128 L188 120 M148 146 L188 140', 'none', 'stroke="#b0bec5" stroke-width="3" stroke-linecap="round"'),
  ],
  pen: () => [
    `<g transform="rotate(-35 120 120)">`,
    RR(54, 104, 132, 32, 12, G('#3d7fd6'), ink()), RR(40, 100, 40, 40, 10, G('#2a5ca8'), ink()),
    R(70, 92, 44, 8, '#b0bec5', ink(2.5)), P('M186 104 L214 120 L186 136Z', G('#cfd8dc'), ink()), C(214, 120, 3, INK),
    `</g>`,
  ],
  pencil: () => [
    `<g transform="rotate(-35 120 120)">`,
    R(56, 100, 124, 40, G('#f6c43a'), ink()), P('M56 113 L180 113 M56 127 L180 127', 'none', `stroke="${dark('#f6c43a', 0.2)}" stroke-width="2.5"`),
    RR(28, 100, 30, 40, 8, G('#f48fb1'), ink()), R(52, 98, 12, 44, '#b0bec5', ink(3)),
    P('M180 100 L214 120 L180 140Z', G('#f3d2a2'), ink()), P('M204 114 L214 120 L204 126Z', INK),
    `</g>`,
  ],
  ruler: () => [
    `<g transform="rotate(-18 120 120)">`,
    RR(20, 92, 200, 56, 8, G('#ffe08a'), ink()),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => P(`M${34 + i * 14.5} 92 L${34 + i * 14.5} ${i % 2 ? 106 : 116}`, 'none', ink(2.5))),
    `</g>`,
  ],
  eraser: () => [
    `<g transform="rotate(-12 120 120)">`,
    P('M50 96 L150 96 L150 168 L50 168Z', G('#f8a5bd'), ink()),
    P('M150 96 L196 96 L196 168 L150 168Z', G('#5ab4e6'), ink()),
    P('M60 108 L100 108', 'none', 'stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".6"'),
    `</g>`,
  ],
  bag: () => [
    P('M84 72 Q84 38 120 38 Q156 38 156 72', 'none', `stroke="${INK}" stroke-width="14" stroke-linecap="round"`),
    P('M84 72 Q84 38 120 38 Q156 38 156 72', 'none', 'stroke="#b33b33" stroke-width="7" stroke-linecap="round"'),
    RR(52, 64, 136, 150, 30, G('#e5484d'), ink()),
    RR(70, 132, 100, 62, 16, G('#ef6a5e'), ink(3.5)), R(104, 150, 32, 10, '#ffcdd2', ink(2.5)),
    P('M58 100 Q120 116 182 100', 'none', ink(3.5)), shine(84, 88, 12, 6),
  ],
  desk: () => [
    RR(28, 84, 184, 26, 6, G('#c8935f'), ink()),
    R(42, 110, 16, 96, G('#8a5a36'), ink()), R(182, 110, 16, 96, G('#8a5a36'), ink()),
    RR(66, 110, 90, 40, 4, G('#b07a4a'), ink(3.5)), RR(98, 124, 26, 8, 4, '#f6d36b', ink(2)),
    R(150, 64, 40, 22, '#3d7fd6', ink(3)), R(156, 56, 30, 10, '#ffffff', ink(2.5)),
  ],
  chair: () => [
    RR(70, 36, 100, 70, 12, G('#e8852c'), ink()),
    R(78, 104, 12, 48, G('#8a5a36'), ink(3.5)), R(150, 104, 12, 48, G('#8a5a36'), ink(3.5)),
    RR(60, 146, 120, 22, 8, G('#e8852c'), ink()),
    R(68, 168, 12, 44, G('#8a5a36'), ink(3.5)), R(160, 168, 12, 44, G('#8a5a36'), ink(3.5)),
  ],
  // ---- 季節 ----
  spring: () => scene('#d8f0ff', [R(30, 150, 180, 60, '#8bc66a', ink(3)), C(66, 62, 16, '#ffffff', 'opacity=".8"'), C(84, 58, 20, '#ffffff', 'opacity=".8"'),
    P('M80 150 L80 112 M120 150 L120 100 M160 150 L160 116', 'none', 'stroke="#3f8f3a" stroke-width="5" stroke-linecap="round"'),
    flower(80, 108, '#f48fb1'), flower(120, 96, '#fdd835', 11), flower(160, 112, '#ce93d8'),
    P('M150 70 Q160 60 170 70 Q160 66 150 70Z M170 70 Q180 60 190 70', 'none', ink(3))]),
  summer: () => scene('#7fd0f5', [R(30, 136, 180, 40, '#3d9be0', ink(3)), R(30, 170, 180, 40, '#f3dca0', ink(3)), sunRays(150, 82, 22),
    P('M44 150 Q56 142 68 150 Q80 158 92 150', 'none', 'stroke="#ffffff" stroke-width="4" stroke-linecap="round"'),
    P('M70 190 L70 140', 'none', ink(4)), P('M40 146 Q70 116 100 146Z', G('#e5484d'), ink(3)), P('M70 120 L70 146', 'none', ink(2))]),
  autumn: () => scene('#ffe7c2', [R(30, 168, 180, 40, '#d9b26a', ink(3)), R(112, 104, 16, 70, G('#8a5a36'), ink(3.5)),
    C(120, 92, 40, G('#ef7d2c'), ink()), C(98, 80, 14, '#f6c43a', 'opacity=".6"'),
    ...[[56, 118, '#d84315', 20], [176, 140, '#f6c43a', -30], [70, 170, '#ef7d2c', 40], [168, 182, '#d84315', 10]].map(([x, y, c, r]) =>
      P(`M${x} ${y - 10} Q${x + 10} ${y} ${x} ${y + 10} Q${x - 10} ${y} ${x} ${y - 10}Z`, c, ink(2.4) + ` transform="rotate(${r} ${x} ${y})"`))]),
  winter: () => scene('#cfe3f5', [R(30, 160, 180, 50, '#ffffff', ink(3)),
    C(120, 150, 34, G('#ffffff'), ink()), C(120, 100, 24, G('#ffffff'), ink()), eye(112, 96, 4), eye(128, 96, 4),
    P('M120 104 L140 108 L120 110Z', '#f08a3a', ink(2)), R(96, 116, 48, 10, '#e5484d', ink(2.5)), P('M134 120 L142 140 L132 140Z', '#e5484d', ink(2)),
    ...[[50, 60], [180, 70], [64, 120], [184, 128], [150, 50], [90, 56]].map(([x, y]) => C(x, y, 4.5, '#ffffff', ink(1.6)))]),
  // ---- 時段 ----
  morning: () => scene('#bfe6f6', [C(78, 160, 24, G('#ffd54a'), ink(3.5)), P('M78 122 L78 110 M50 134 L42 126 M106 134 L114 126', 'none', 'stroke="#ffb300" stroke-width="6" stroke-linecap="round"'), R(30, 160, 180, 50, '#8bc66a', ink(3)), C(160, 76, 14, '#ffffff', 'opacity=".9"'), C(176, 72, 18, '#ffffff', 'opacity=".9"')]),
  afternoon: () => scene('#6fc6f2', [sunRays(120, 80, 24), R(30, 160, 180, 50, '#8bc66a', ink(3))]),
  evening: () => scene('#ffb08a', [R(30, 30, 180, 70, '#ff9a76'), C(160, 160, 26, G('#ff7043'), ink(3.5)), R(30, 160, 180, 50, '#6fa83c', ink(3)), C(70, 70, 3, '#ffffff', 'opacity=".7"')]),
  night: () => scene('#1f2f6b', [C(150, 82, 24, '#fff3b0', ink(3)), C(162, 74, 22, '#1f2f6b'), ...[[60, 60], [90, 100], [70, 130], [184, 140], [120, 56]].map(([x, y]) => C(x, y, 3.5, '#ffffff')), R(30, 166, 180, 44, '#33582a', ink(3))]),
  // ---- 地點（看圖認地方）----
  lake: () => scene('#d8f0ff', [R(30, 96, 180, 120, '#8bc66a'), E(120, 156, 70, 30, G('#4fb0e6'), ink(3.5)), P('M96 154 Q106 148 116 154 M128 162 Q138 156 148 162', 'none', 'stroke="#ffffff" stroke-width="3" stroke-linecap="round"'),
    ...[[52, 116], [188, 120], [60, 196]].map(([x, y]) => P(`M${x - 14} ${y + 14} L${x} ${y - 20} L${x + 14} ${y + 14}Z`, G('#3f8f3a'), ink(3)))]),
  sea: () => scene('#bfe6f6', [R(30, 116, 180, 100, G('#2f86d6'), ink(3)), ...[[54, 140], [110, 168], [160, 136], [70, 192]].map(([x, y]) => P(`M${x} ${y} Q${x + 10} ${y - 10} ${x + 20} ${y} Q${x + 30} ${y - 10} ${x + 40} ${y}`, 'none', 'stroke="#ffffff" stroke-width="4" stroke-linecap="round"')),
    P('M130 112 L178 112 L170 124 L138 124Z', G('#8a5a36'), ink(3)), P('M152 112 L152 70 L178 108Z', '#ffffff', ink(3)), sunRays(66, 70, 14)]),
  mountain: () => scene('#d8f0ff', [P('M20 210 L90 80 L160 210Z', G('#78909c'), ink()), P('M90 210 L160 60 L230 210Z', G('#607d8b'), ink()),
    P('M146 90 L160 60 L174 90 L166 84 L160 92 L152 84Z', '#ffffff', ink(3)), P('M78 102 L90 80 L102 102 L94 98 L90 104 L86 98Z', '#ffffff', ink(3)), R(30, 196, 180, 14, '#8bc66a', ink(3))]),
  road: () => scene('#d8f0ff', [R(30, 110, 180, 100, '#8bc66a'), P('M40 210 L108 110 L132 110 L200 210Z', G('#7d8b96'), ink(3.5)),
    P('M120 120 L120 134 M120 150 L120 170 M120 186 L120 208', 'none', 'stroke="#ffffff" stroke-width="5" stroke-linecap="round"'), C(60, 90, 16, '#ffffff', 'opacity=".8"'), C(76, 86, 20, '#ffffff', 'opacity=".8"')]),
  kitchen: () => scene('#fff3df', [R(30, 140, 180, 70, G('#ffffff'), ink(3)), C(80, 140, 14, '#455a64', ink(3)), C(150, 140, 14, '#455a64', ink(3)),
    RR(52, 92, 56, 44, 8, G('#b0bec5'), ink(3)), R(44, 88, 72, 8, '#90a4ae', ink(2.5)), P('M66 82 Q62 70 70 60 M86 82 Q82 70 90 60', 'none', 'stroke="#90a4ae" stroke-width="3" stroke-linecap="round"'),
    RR(60, 160, 120, 34, 6, '#ffe08a', ink(2.5)), C(120, 177, 4, '#8a5a36')]),
  bedroom: () => scene('#fde8ef', [RR(150, 56, 40, 40, 6, '#bfe6f6', ink(3)), P('M170 56 L170 96', 'none', ink(2.5)),
    R(44, 112, 12, 84, G('#8a5a36'), ink(3)), RR(56, 136, 140, 40, 8, G('#f48fb1'), ink(3.5)), RR(62, 122, 44, 22, 10, '#ffffff', ink(3)), R(186, 150, 10, 46, G('#8a5a36'), ink(3))]),
  classroom: () => scene('#fff8e6', [RR(52, 50, 136, 70, 6, G('#2e7d4f'), ink(3.5)), P('M66 70 L130 70 M66 90 L110 90', 'none', 'stroke="#ffffff" stroke-width="4" stroke-linecap="round"'),
    ...[60, 104, 148].map((x) => RR(x, 150, 34, 10, 3, G('#c8935f'), ink(2.5)) + R(x + 4, 160, 6, 28, '#8a5a36', ink(2)) + R(x + 24, 160, 6, 28, '#8a5a36', ink(2)))]),
  farm: () => scene('#d8f0ff', [R(30, 160, 180, 50, '#8bc66a', ink(3)), R(52, 104, 72, 72, G('#c4473d'), ink(3.5)), P('M44 108 L88 72 L132 108Z', G('#a63a31'), ink(3.5)),
    RR(74, 140, 28, 36, 3, '#ffffff', ink(2.5)), P('M74 140 L102 176 M102 140 L74 176', 'none', ink(2)),
    P('M136 150 L204 150 M136 166 L204 166', 'none', 'stroke="#8a5a36" stroke-width="5" stroke-linecap="round"'), ...[146, 170, 194].map((x) => R(x - 3, 142, 6, 34, '#a9805a', ink(2)))]),
  // ---- 食物 ----
  lemon: () => [P('M40 124 Q40 72 120 70 Q200 72 200 124 Q200 176 120 178 Q40 176 40 124Z', G('#f6d83a'), ink()), P('M32 124 L44 116 L44 132Z M208 124 L196 116 L196 132Z', G('#f6d83a'), ink(3)), P('M128 68 Q150 46 176 54 Q160 76 128 68Z', G('#5aa83f'), ink(3.5)), shine(84, 98, 18, 10)],
  rice: () => [E(120, 120, 82, 24, '#ffffff', ink()), ...[[90, 112], [110, 104], [130, 110], [150, 116], [100, 124], [140, 124], [120, 118]].map(([x, y]) => E(x, y, 6, 4, '#f3efe6', ink(1.5))),
    P('M38 122 Q42 196 120 200 Q198 196 202 122Z', G('#e8f1f8'), ink()), P('M60 150 Q120 168 180 150', 'none', 'stroke="#7fc4dc" stroke-width="6" stroke-linecap="round"'),
    P('M150 40 L196 110 M170 36 L206 104', 'none', ink(5)), P('M150 40 L196 110 M170 36 L206 104', 'none', 'stroke="#c8935f" stroke-width="2.5" stroke-linecap="round"')],
  bread: () => [P('M34 150 Q30 80 120 78 Q210 80 206 150 Q206 186 120 188 Q34 186 34 150Z', G('#d9a05a'), ink()), P('M50 150 Q50 100 120 98 Q190 100 190 150 Q186 172 120 172 Q54 172 50 150Z', '#f6dcac', ink(3)),
    P('M80 90 Q92 104 86 118 M120 84 Q132 100 126 114 M160 90 Q172 104 166 118', 'none', `stroke="${dark('#d9a05a', 0.2)}" stroke-width="4" stroke-linecap="round"`)],
  egg: () => [P('M120 36 Q178 40 184 128 Q186 198 120 200 Q54 198 56 128 Q62 40 120 36Z', G('#fff6e8'), ink()), shine(96, 84, 14, 26, 15)],
  milk: () => [P('M76 70 L120 36 L164 70Z', G('#e8f1f8'), ink()), R(76, 70, 88, 130, G('#ffffff'), ink()), R(76, 112, 88, 46, '#3d7fd6', ink(3)), R(108, 24, 24, 14, '#3d7fd6', ink(2.5)), C(104, 135, 9, '#ffffff', 'opacity=".9"'), E(140, 135, 12, 8, '#ffffff', 'opacity=".9"')],   // 不寫 MILK，避免字直接洩漏答案
  soup: () => [P('M40 112 Q44 196 120 198 Q196 196 200 112Z', G('#f6efe1'), ink()), E(120, 112, 80, 20, G('#f08a4a'), ink()), C(96, 110, 7, '#8bc66a', ink(1.6)), C(134, 114, 6, '#f6d36b', ink(1.6)),
    P('M90 84 Q80 66 92 50 M120 82 Q110 62 124 44 M150 84 Q140 66 152 50', 'none', 'stroke="#b0bec5" stroke-width="5" stroke-linecap="round"')],
  // ---- 物品 ----
  robot: () => [P('M120 42 L120 26', 'none', ink(4)), C(120, 22, 7, '#e5484d', ink(3)), RR(76, 42, 88, 66, 14, G('#a9bdcc'), ink()), C(102, 74, 11, '#7fd0f5', ink(3)), C(138, 74, 11, '#7fd0f5', ink(3)), RR(104, 92, 32, 8, 3, '#455a64'),
    RR(64, 114, 112, 76, 14, G('#90a4ae'), ink()), C(120, 146, 12, '#f6c43a', ink(3)), RR(38, 120, 24, 56, 10, G('#a9bdcc'), ink(3.5)), RR(178, 120, 24, 56, 10, G('#a9bdcc'), ink(3.5)), RR(84, 190, 24, 22, 6, '#607d8b', ink(3)), RR(132, 190, 24, 22, 6, '#607d8b', ink(3))],
  clock: () => [C(120, 124, 82, G('#e8852c'), ink()), C(120, 124, 66, '#ffffff', ink(3.5)), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => { const a = i * Math.PI / 6; return C(120 + Math.cos(a) * 54, 124 + Math.sin(a) * 54, i % 3 ? 2.5 : 4.5, INK); }),
    P('M120 124 L120 80 M120 124 L150 124', 'none', ink(6)), C(120, 124, 6, '#e5484d', ink(2))],
  fan: () => [P('M120 128 L120 196', 'none', ink(10)), P('M120 128 L120 196', 'none', 'stroke="#90a4ae" stroke-width="5"'), E(120, 200, 50, 14, G('#78909c'), ink()),
    C(120, 98, 68, '#ffffff', ink()), ...[0, 1, 2].map((i) => `<ellipse cx="120" cy="66" rx="18" ry="30" fill="${'#7fc4dc'}" ${ink(3)} transform="rotate(${i * 120} 120 98)"/>`), C(120, 98, 11, '#607d8b', ink(3)),
    P('M70 58 L170 58 M56 98 L184 98 M70 138 L170 138', 'none', 'stroke="#cfd8dc" stroke-width="2" opacity=".7"')],
  computer: () => [RR(40, 44, 160, 110, 12, G('#455a64'), ink()), RR(52, 56, 136, 86, 6, G('#7fd0f5'), ink(2.5)), P('M70 80 L120 80 M70 100 L150 100 M70 120 L110 120', 'none', 'stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".8"'),
    R(108, 154, 24, 22, '#607d8b', ink(3)), RR(70, 176, 100, 12, 6, '#607d8b', ink(3)), RR(48, 196, 144, 18, 6, '#cfd8dc', ink(3))],
  bike: () => [C(64, 156, 40, 'none', `stroke="${INK}" stroke-width="10"`), C(176, 156, 40, 'none', `stroke="${INK}" stroke-width="10"`), C(64, 156, 40, 'none', 'stroke="#455a64" stroke-width="5"'), C(176, 156, 40, 'none', 'stroke="#455a64" stroke-width="5"'),
    P('M64 156 L104 100 L164 100 L176 156 M104 100 L120 156 L64 156 M164 100 L158 76 M120 156 L164 100', 'none', `stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"`),
    P('M64 156 L104 100 L164 100 L176 156 M104 100 L120 156 L64 156 M164 100 L158 76 M120 156 L164 100', 'none', 'stroke="#e5484d" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"'),
    RR(84, 84, 36, 12, 6, '#455a64', ink(2.5)), RR(144, 66, 34, 10, 5, '#455a64', ink(2.5)), C(120, 156, 8, '#90a4ae', ink(2.5))],
  ball: () => [C(120, 122, 80, G('#ffffff'), ink()), P('M120 82 L148 102 L138 134 L102 134 L92 102Z', INK),
    ...[[120, 46, 120, 82], [190, 104, 148, 102], [166, 186, 138, 134], [74, 186, 102, 134], [50, 104, 92, 102]].map(([a, b, c, d]) => P(`M${a} ${b} L${c} ${d}`, 'none', ink(3.5))), shine(92, 84, 14, 8)],
  rope: () => [C(110, 120, 66, 'none', `stroke="${INK}" stroke-width="22"`), C(110, 120, 66, 'none', 'stroke="#c8935f" stroke-width="15"'), C(110, 120, 66, 'none', 'stroke="#8a5a36" stroke-width="4" stroke-dasharray="6 9"'),
    C(110, 120, 38, 'none', `stroke="${INK}" stroke-width="20"`), C(110, 120, 38, 'none', 'stroke="#d9a76a" stroke-width="13"'),
    P('M170 150 Q200 180 214 210', 'none', `stroke="${INK}" stroke-width="20" stroke-linecap="round"`), P('M170 150 Q200 180 214 210', 'none', 'stroke="#c8935f" stroke-width="13" stroke-linecap="round"')],
  flute: () => [`<g transform="rotate(-25 120 120)">`, RR(20, 104, 200, 32, 14, G('#cfd8dc'), ink()), ...[64, 92, 120, 148, 176].map((x) => C(x, 120, 6.5, '#37474f', ink(2))), R(40, 104, 10, 32, '#90a4ae'), `</g>`],
  mirror: () => [R(112, 172, 16, 40, G('#8a5a36'), ink(3.5)), E(120, 100, 64, 80, G('#c8935f'), ink()), E(120, 100, 50, 66, G('#d6f1fb'), ink(3)),
    P('M92 76 L118 52 M92 100 L132 62', 'none', 'stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".8"')],
  shirt: () => [P('M84 44 L40 72 L56 114 L76 106 L76 204 L164 204 L164 106 L184 114 L200 72 L156 44 Q140 64 120 64 Q100 64 84 44Z', G('#4aa0c6'), ink()),
    P('M84 44 L104 74 L120 64 L136 74 L156 44 Q140 56 120 56 Q100 56 84 44Z', '#ffffff', ink(3)), C(120, 104, 4, '#ffffff', ink(2)), C(120, 134, 4, '#ffffff', ink(2)), C(120, 164, 4, '#ffffff', ink(2)), P('M120 70 L120 204', 'none', ink(2.5))],
  pants: () => [P('M64 44 L176 44 L184 210 L136 210 L120 104 L104 210 L56 210Z', G('#3949ab'), ink()), R(64, 44, 112, 22, '#2c3a8c', ink(3)), C(120, 55, 4, '#f6d36b', ink(2)),
    P('M80 80 Q92 88 104 80', 'none', 'stroke="#7986cb" stroke-width="3" stroke-linecap="round"')],
  dress: () => [P('M96 36 L104 72 M144 36 L136 72', 'none', ink(5)), P('M96 70 L144 70 L148 104 L92 104Z', G('#ec5f8f'), ink()),
    P('M92 104 L148 104 L196 204 Q120 218 44 204Z', G('#f27ba3'), ink()), R(92, 98, 56, 12, '#ffffff', ink(2.5)),
    ...[[90, 150], [130, 140], [150, 180], [100, 186]].map(([x, y]) => C(x, y, 5, '#ffffff', 'opacity=".75"'))],
  // ---- 顏色（氣球）----
  'balloon-red': () => balloon('#e8443a'), 'balloon-blue': () => balloon('#3d7fd6'), 'balloon-green': () => balloon('#4caf50'),
  'balloon-yellow': () => balloon('#f6d83a'), 'balloon-orange': () => balloon('#f08a2a'), 'balloon-purple': () => balloon('#8e4fb5'),
  'balloon-pink': () => balloon('#f48fb1'), 'balloon-black': () => balloon('#2b2f36'), 'balloon-white': () => balloon('#ffffff'),
  'balloon-brown': () => balloon('#8a5a36'), 'balloon-gray': () => balloon('#9aa5ad'),
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

const { Resvg } = require('@resvg/resvg-js');   // cd tools/art && npm install
const svgDir = path.join(__dirname, 'svg');
const out = path.join(__dirname, '..', '..', 'game', 'art');
fs.mkdirSync(svgDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
Object.keys(ART).forEach((k) => {
  const svg = svgFor(k);
  fs.writeFileSync(path.join(svgDir, k + '.svg'), svg);
  // 2 倍解析度：顯示約 160px，點陣 320px
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render().asPng();
  fs.writeFileSync(path.join(out, k + '.png'), png);
});
// 遊戲讀這份清單載入貼紙（index.html 在 game.js 之前載入）
fs.writeFileSync(path.join(out, 'index.js'), '// 由 tools/art/stickers.js 產生，請勿手動修改\nwindow.ART_KEYS = ' + JSON.stringify(Object.keys(ART)) + ';\n');
console.log('wrote', Object.keys(ART).length, 'stickers (svg → tools/art/svg, png → game/art)');
