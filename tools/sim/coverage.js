// 單字覆蓋的靜態統計：主動字在 game.js 裡以字串（可能被出題／記錄）出現、只出現在句子裡、或完全沒出現
global.window = {};
require(__dirname + '/../../game/words.js');
const W = window.WORDS;
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../game/game.js', 'utf8') + fs.readFileSync(__dirname + '/../../game/logic.js', 'utf8');
const act = Object.keys(W).filter((k) => W[k].mode === 'active');
const lit = new Set();
for (const m of src.matchAll(/'([a-z]+)'/g)) lit.add(m[1]);
const none = [], textOnly = [];
for (const k of act) {
  if (lit.has(k)) continue;
  (new RegExp('\\b' + k + '\\b', 'i').test(src) ? textOnly : none).push(k);
}
console.log('active', act.length, '以字串出現', act.length - none.length - textOnly.length);
console.log('完全沒出現', none.length, none.join(' '));
console.log('只在句子裡', textOnly.length, textOnly.join(' '));
