"""Bold Duet Hand for the onboarding pages: every letter in the heavy stroke (lowercase included) plus the
punctuation the original lacks. Build only: pip install fonttools. Output: public/assets/duet-hand-bold.ttf
The original duet-hand.ttf (used by the app itself) is left untouched."""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from pathlib import Path
import math, random, re, sys
LOWER_R = float(sys.argv[1]) if len(sys.argv) > 1 else 40
UPPER_R = float(sys.argv[2]) if len(sys.argv) > 2 else 42
src = (Path(__file__).parent / 'build_font.py').read_text()
start = src.index('letters={'); end = src.index('fb=FontBuilder')
ns = {}; exec(src[start:end], ns); letters = ns['letters']
# extra marks, same 0-100 centerline grid (y up); drawn to match the existing hand
letters.update({
    "'": [[(41, 97), (37, 78)]], '\u2019': [[(43, 97), (36, 74)]], '\u2018': [[(40, 97), (46, 76)]],
    '"': [[(30, 97), (27, 79)], [(52, 97), (49, 79)]], '\u201c': [[(28, 97), (34, 77)], [(50, 97), (56, 77)]], '\u201d': [[(32, 97), (25, 75)], [(54, 97), (47, 75)]],
    ',': [[(40, 8), (38, -4), (29, -17)]], ';': [[(38, 68), (39, 71)], [(40, 8), (38, -4), (29, -17)]],
    '!': [[(40, 98), (39, 33)], [(39, 2), (40, 5)]],
    '(': [[(54, 100), (32, 80), (23, 48), (32, 16), (54, -4)]], ')': [[(26, 100), (48, 80), (57, 48), (48, 16), (26, -4)]],
    '/': [[(62, 100), (10, -2)]], '+': [[(12, 50), (66, 52)], [(39, 78), (40, 24)]],
    '&': [[(72, 8), (33, 55), (30, 82), (43, 98), (57, 85), (50, 64), (14, 33), (12, 14), (30, 2), (52, 7), (74, 40)]],
    '\u2026': [[(8, 1), (9, 4)], [(36, 1), (37, 4)], [(64, 1), (65, 4)]], '\u00b7': [[(38, 40), (39, 43)]],
})
ADV = {'.': 330, ',': 340, ';': 340, ':': 340, '!': 340, "'": 300, '\u2019': 300, '\u2018': 300, '"': 520, '\u201c': 520, '\u201d': 520,
       '(': 450, ')': 450, '/': 560, '+': 700, '&': 800, '\u2026': 980, '\u00b7': 330, '-': 560, '?': 700}
order = ['.notdef', 'space'] + ['uni%04X' % ord(c) for c in letters]
fb = FontBuilder(1000, isTTF=True); fb.setupGlyphOrder(order)
glyphs = {}; metrics = {}; cmap = {32: 'space', 0xA0: 'space'}
for name in order:
    pen = TTGlyphPen(None)
    if name not in ('.notdef', 'space'):
        ch = chr(int(name[3:], 16)); rng = random.Random(ord(ch))
        radius = UPPER_R if ch.isupper() else LOWER_R   # one stroke weight for every glyph, so capitals do not stand out
        for path in letters[ch]:
            pts = [(x * 7 + 55 + rng.uniform(-2, 2), y * 7 + 100 + rng.uniform(-2, 2)) for x, y in path]
            for x, y in pts:
                ring = [(round(x + radius * math.cos(i * math.tau / 12)), round(y + radius * math.sin(i * math.tau / 12))) for i in range(12)]
                pen.moveTo(ring[0]); [pen.lineTo(p) for p in ring[1:]]; pen.closePath()
            for (x, y), (u, v) in zip(pts, pts[1:]):
                length = math.hypot(u - x, v - y)
                if not length: continue
                dx = -(v - y) / length * radius; dy = (u - x) / length * radius
                pen.moveTo((round(x - dx), round(y - dy))); pen.lineTo((round(u - dx), round(v - dy))); pen.lineTo((round(u + dx), round(v + dy))); pen.lineTo((round(x + dx), round(y + dy))); pen.closePath()
        cmap[ord(ch)] = name
        adv = ADV.get(ch, 380 if ch in 'il' else 420 if ch == 'j' else 580 if ch in 'tfr' else 700 if ch.islower() else 730)
    else:
        adv = 320
    glyphs[name] = pen.glyph(); metrics[name] = (adv, 25)
fb.setupGlyf(glyphs); fb.setupHorizontalMetrics(metrics); fb.setupHorizontalHeader(ascent=900, descent=-260); fb.setupCharacterMap(cmap)
fb.setupNameTable({'familyName': 'Duet Hand Bold', 'styleName': 'Regular', 'uniqueFontIdentifier': 'DuetHandBold-1', 'fullName': 'Duet Hand Bold Regular', 'psName': 'DuetHandBold-Regular'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-260, usWinAscent=900, usWinDescent=260); fb.setupPost(); fb.setupMaxp()
fb.save(Path(__file__).resolve().parents[1] / 'public/assets/duet-hand-bold.ttf')
print('glyphs:', len(cmap))
