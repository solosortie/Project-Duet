"""Draws the cloud sprites (public/assets/cloud-1..6.svg) in the project's illustration style:
a soft hand-wobbled outline (warm grey-brown, 1.8 wide), a flat warm-white fill, a barely-there underside, and a few faint marks.
Run: python3 design/build_clouds.py   (no dependencies)"""
import math, random, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
INK, FILL, SHADE = '#8d7a66', '#fffdf6', '#f1eadb'
# each cloud: (name, [(cx, cy, rx, ry), ...]) first shape is the flat base; marks are (x, y, length) short inked dashes
CLOUDS = [
 ('cloud-1', [(200,128,170,26),(110,100,52,38),(180,84,64,48),(262,98,56,40),(330,112,40,28)], [(150,66,22),(228,78,18),(300,96,14)]),
 ('cloud-2', [(150,124,120,24),(80,104,44,34),(130,76,58,50),(200,92,56,42),(240,112,36,26)], [(104,62,20),(176,76,16)]),
 ('cloud-3', [(200,122,150,22),(120,98,46,34),(168,72,50,46),(244,88,48,38),(300,108,34,24)], [(142,56,20),(262,74,16),(110,84,12)]),
 ('cloud-4', [(100,98,80,18),(60,82,34,26),(100,62,38,34),(142,80,30,22)], [(84,48,14),(52,70,10)]),
 ('cloud-5', [(230,70,200,14),(130,60,46,18),(230,50,56,22),(320,62,42,16)], [(214,38,22),(120,50,14)]),
 ('cloud-6', [(140,120,115,22),(70,98,38,30),(110,72,46,40),(170,80,42,34),(210,104,30,22)], [(94,52,18),(160,66,14),(60,86,10)]),
]
def blob(rnd, cx, cy, rx, ry, amp=.045, n=14):
    pts = []
    for i in range(n):
        t = i / n * math.tau
        k = 1 + rnd.uniform(-amp, amp)
        pts.append((cx + math.cos(t) * rx * k, cy + math.sin(t) * ry * k))
    mid = lambda a, b: ((a[0]+b[0])/2, (a[1]+b[1])/2)
    m0 = mid(pts[-1], pts[0]); d = f'M{m0[0]:.1f} {m0[1]:.1f}'
    for i in range(n):
        q = mid(pts[i], pts[(i+1) % n]); d += f'Q{pts[i][0]:.1f} {pts[i][1]:.1f} {q[0]:.1f} {q[1]:.1f}'
    return d + 'Z'
for seed, (name, shapes, marks) in enumerate(CLOUDS, 1):
    rnd = random.Random(seed * 17)
    paths = [blob(rnd, *s) for s in shapes]
    xs = [s[0]-s[2] for s in shapes]; xe = [s[0]+s[2] for s in shapes]; ys = [s[1]-s[3] for s in shapes]; ye = [s[1]+s[3] for s in shapes]
    x0, y0, x1, y1 = min(xs)-8, min(ys)-8, max(xe)+8, max(ye)+8
    shapes_svg = ''.join(f'<path d="{d}"/>' for d in paths)
    mk = ''.join(f'<path d="M{x} {y}q{l*.45:.1f} -{l*.28:.1f} {l:.1f} -{l*.1:.1f}"/>' for x, y, l in marks)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} {y0:.0f} {x1-x0:.0f} {y1-y0:.0f}" fill="none" stroke-linecap="round" stroke-linejoin="round">'
           f'<defs><clipPath id="u">{shapes_svg}</clipPath></defs>'
           f'<g fill="{FILL}" stroke="{INK}" stroke-width="3.6">{shapes_svg}</g>'      # outline (inner half is covered next)
           f'<g fill="{FILL}">{shapes_svg}</g>'
           f'<g clip-path="url(#u)"><rect x="{x0:.0f}" y="{y0:.0f}" width="{x1-x0:.0f}" height="{y1-y0:.0f}" fill="{SHADE}"/><g transform="translate(0 -9)" fill="{FILL}">{shapes_svg}</g></g>'
           f'<g stroke="{INK}" stroke-width="2" opacity=".22">{mk}</g></svg>')
    open(os.path.join(OUT, name + '.svg'), 'w').write(svg)
    print(name, len(svg), 'bytes')
