"""字型子集：只保留遊戲用得到的字，輸出 woff2 到 game/fonts/

用法：python -I tools/fonts/subset.py <原始字型資料夾>
原始字型（OFL 授權，從 github.com/google/fonts 下載）：
  ofl/huninn/Huninn-Regular.ttf、ofl/andika/Andika-Regular.ttf、ofl/andika/Andika-Bold.ttf
新增中文字（改了 game.js 或 words.js）之後要重跑一次。
"""
import os
import sys
from fontTools import subset

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'game', 'fonts')
os.makedirs(OUT, exist_ok=True)

text = ''
for f in ['game/game.js', 'game/words.js', 'game/logic.js', 'game/index.html']:
    text += open(os.path.join(ROOT, f), encoding='utf-8').read()

ascii_chars = ''.join(chr(c) for c in range(0x20, 0x7f))
# 中文：程式裡出現的所有非 ASCII 字（含全形標點）＋ASCII，讓粉圓也能排數字與英文
cjk = ''.join(sorted(set(ch for ch in text if ord(ch) > 0x7f)))
latin_extra = '’‘“”…–—·éèàáçñüö'


def make(src, out, chars):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(os.path.join(SRC, src), opts)
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(font)
    path = os.path.join(OUT, out)
    subset.save_font(font, path, opts)
    print(out, os.path.getsize(path), 'bytes')


make('Huninn-Regular.ttf', 'Huninn-subset.woff2', ascii_chars + cjk)
make('Andika-Regular.ttf', 'Andika-Regular.woff2', ascii_chars + latin_extra)
make('Andika-Bold.ttf', 'Andika-Bold.woff2', ascii_chars + latin_extra)
print('中文字數', len(cjk))
