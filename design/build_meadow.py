"""Draws the meadow: three flowers (orchid, tulip in two colours, lavender) and the tileable hills and grass behind them.
They follow the existing meadow flowers: moss stroke (#607449, 2 wide, round caps), flat leaf fill (#829660), a small warm palette.
Run: python3 design/build_meadow.py   (no dependencies)"""
import math, os, random
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
MOSS, LEAF = '#607449', '#829660'
def save(name, svg): open(os.path.join(OUT, name + '.svg'), 'w').write(svg)
def head(w, h, extra=''): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" stroke="{MOSS}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"{extra}>'

# ---------- flowers ----------
def tulip(name, back, front, ink):
    save(name, head(60, 100) +
     '<path d="M30 98Q33 70 30 46"/>'
     f'<path d="M31 95Q7 85 9 50Q31 64 31 95Z" fill="{LEAF}"/><path d="M31 90Q53 80 51 55Q36 66 31 90Z" fill="{LEAF}"/>'
     f'<g stroke="{ink}" stroke-width="1.6"><path d="M16 20Q13 45 30 49Q28 28 16 20Z" fill="{back}"/><path d="M44 20Q47 45 30 49Q32 28 44 20Z" fill="{back}"/>'
     f'<path d="M23 12Q20 40 30 49Q40 40 37 12Q30 24 23 12Z" fill="{front}"/><path d="M30 24Q29 36 30 46" stroke-width="1" opacity=".6"/></g></svg>')
tulip('flower-tulip', '#c98a77', '#d9a08c', '#a65f4c')
tulip('flower-tulip-honey', '#dcae5f', '#ecc984', '#b9893c')

def lavender():
    rnd = random.Random(5)
    stems = [(30, 98, 31, 70, 29, 20, 8), (27, 98, 23, 72, 16, 34, 6), (33, 98, 38, 70, 45, 30, 6)]
    g = ''
    for x0, y0, cx, cy, x1, y1, n in stems:
        g += f'<path d="M{x0} {y0}Q{cx} {cy} {x1} {y1}"/>'
    buds = ''
    for x0, y0, cx, cy, x1, y1, n in stems:
        for i in range(n):
            t = 1 - i / (n + 1) * .68                       # up the top part of the stem
            bx = (1-t)**2*x0 + 2*(1-t)*t*cx + t*t*x1; by = (1-t)**2*y0 + 2*(1-t)*t*cy + t*t*y1
            for side in (-1, 1):
                buds += f'<ellipse cx="{bx+side*2.7+rnd.uniform(-.3,.3):.1f}" cy="{by-1.2:.1f}" rx="1.9" ry="3.3" transform="rotate({side*(22+rnd.uniform(-6,6)):.0f} {bx:.1f} {by:.1f})"/>'
        buds += f'<ellipse cx="{x1}" cy="{y1-3}" rx="1.7" ry="3.6"/>'
    leaves = f'<path d="M29 98Q12 86 8 66Q22 80 29 98Z" fill="{LEAF}"/><path d="M31 98Q47 88 52 70Q38 82 31 98Z" fill="{LEAF}"/><path d="M30 98Q27 80 22 66Q32 80 30 98Z" fill="{LEAF}"/>'
    save('flower-lavender', head(60, 100) + g + leaves + f'<g fill="#b8abd0" stroke="#7d6f9e" stroke-width=".9">{buds}</g></svg>')
lavender()

def orchid():
    def blossom(cx, cy, s, rot):
        P = '#a9c1d9'; I = '#5d7894'
        parts = (f'<ellipse cx="0" cy="-10" rx="5" ry="8.5"/>'                       # top sepal
                 f'<ellipse cx="-9.5" cy="-1" rx="10" ry="7.5" transform="rotate(-12 -9.5 -1)"/><ellipse cx="9.5" cy="-1" rx="10" ry="7.5" transform="rotate(12 9.5 -1)"/>'   # broad side petals
                 f'<ellipse cx="-5" cy="8.5" rx="3.6" ry="8" transform="rotate(26 -5 8.5)"/><ellipse cx="5" cy="8.5" rx="3.6" ry="8" transform="rotate(-26 5 8.5)"/>')   # lower sepals
        return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})" fill="{P}" stroke="{I}" stroke-width="{1.3/s:.2f}">{parts}'
                f'<ellipse cx="0" cy="2.5" rx="3.6" ry="4.6" fill="#fbf7ee" stroke="#6f87a0" stroke-width="{1/s:.2f}"/><circle cx="0" cy="-1.5" r="1.6" fill="#dba654" stroke="none"/></g>')
    bud = lambda x, y, r: f'<circle cx="{x}" cy="{y}" r="{r}" fill="#c4d4e4" stroke="#5d7894" stroke-width="1.1"/>'
    save('flower-orchid', head(80, 100) +
     '<path d="M30 98Q32 68 40 48Q47 28 62 20Q70 15 73 9"/>'
     f'<path d="M30 98Q6 92 4 72Q24 76 30 98Z" fill="{LEAF}"/><path d="M31 98Q58 94 64 78Q42 78 31 98Z" fill="{LEAF}"/>'
     + bud(70, 13, 2.2) + bud(73, 8, 1.6) + blossom(41, 47, .95, -8) + blossom(58, 27, .8, 12) + '</svg>')
orchid()

# ---------- hills and ground: every tile repeats seamlessly across 1440 wide ----------
W = 1440
def ridge(base, waves, x):          # integer wave counts over the tile, so the right edge meets the left
    return base + sum(a * math.sin(2 * math.pi * k * x / W + ph) for a, k, ph in waves)
def path_for(base, waves, H, step=20):
    pts = [(x, ridge(base, waves, x)) for x in range(0, W + 1, step)]
    d = f'M{pts[0][0]} {pts[0][1]:.1f}'
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        d += f'Q{x0} {y0:.1f} {(x0+x1)/2:.1f} {(y0+y1)/2:.1f}'
    return d + f'T{W} {pts[-1][1]:.1f}V{H}H0Z', pts
def tufts(waves, base, count, seed, color, drop=1.5, size=(5, 9)):
    rnd = random.Random(seed); out = ''
    for _ in range(count):
        x = rnd.uniform(10, W - 10); y = ridge(base, waves, x) + drop; h = rnd.uniform(*size)
        out += f'm{x:.0f} {y:.0f}-{rnd.uniform(1,3):.1f}-{h:.0f}m{rnd.uniform(1,3):.1f} {h:.0f}-{rnd.uniform(-1,1):.1f}-{h*1.1:.0f}m{rnd.uniform(1,3):.1f} {h*1.1:.0f}{rnd.uniform(1,3):.1f}-{h*.8:.0f}'
        out = out.replace('m'+f'{x:.0f}', f'M{x:.0f}', 1) if False else out
    return out
def tuft_paths(waves, base, count, seed, size=(5, 9)):
    rnd = random.Random(seed); d = ''
    for _ in range(count):
        x = rnd.uniform(10, W - 10); y = ridge(base, waves, x) + 1.5; h = rnd.uniform(*size)
        d += f'M{x:.0f} {y:.0f}l{-rnd.uniform(1.5,3):.1f} {-h:.0f}M{x:.0f} {y:.0f}l{rnd.uniform(-.5,.8):.1f} {-h*1.15:.0f}M{x:.0f} {y:.0f}l{rnd.uniform(1.5,3.2):.1f} {-h*.85:.0f}'
    return d
HH = 220
far_w = [(14, 2, .6), (8, 3, 2.1), (4, 5, 4.0)]; mid_w = [(16, 2, 2.4), (9, 3, 5.0), (4, 6, 1.0)]; near_w = [(12, 2, 4.4), (8, 3, .3), (3, 7, 2.2)]
fd, _ = path_for(92, far_w, HH); md, _ = path_for(118, mid_w, HH); nd, _ = path_for(150, near_w, HH)
save('hills-far', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HH}"><path d="{fd}" fill="#c3d0a8"/></svg>')
save('hills-mid', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HH}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="{md}" fill="#abbc8e"/>'
     f'<path d="{tuft_paths(mid_w, 118, 46, 3)}" stroke="#889e6e" stroke-width="1.5" opacity=".8"/></svg>')
pebbles = ''.join(f'<ellipse cx="{x:.0f}" cy="{ridge(150, near_w, x)+rnd:.0f}" rx="{r:.1f}" ry="{r*.55:.1f}"/>' for x, rnd, r in ((random.Random(9).uniform(30, W-30), random.Random(i).uniform(14, 40), random.Random(i+50).uniform(2, 4.5)) for i in range(16)))
save('hills-near', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HH}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="{nd}" fill="#93a97a"/>'
     f'<path d="{tuft_paths(near_w, 150, 60, 4, (6, 11))}" stroke="#6f8559" stroke-width="1.7" opacity=".85"/></svg>')

# entry ground: grass that fades down into deeper green, with scattered blades; the old brown soil is gone
GH = 160
gd, _ = path_for(10, [(3, 3, .5), (2, 2, 2.0)], GH, 20)
rnd = random.Random(12); blades = ''
for _ in range(70):
    x = rnd.uniform(6, W - 6); y = rnd.uniform(22, GH - 8); h = rnd.uniform(5, 9)
    blades += f'M{x:.0f} {y:.0f}l{-rnd.uniform(1,2.5):.1f} {-h:.0f}M{x:.0f} {y:.0f}l{rnd.uniform(1,2.5):.1f} {-h*.9:.0f}'
save('ground', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {GH}" fill="none" stroke-linecap="round"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a97a"/><stop offset="1" stop-color="#788a5b"/></linearGradient></defs>'
     f'<path d="{gd}" fill="url(#g)"/><path d="{blades}" stroke="#657a4d" stroke-width="1.5" opacity=".55"/></svg>')
print('ok')
