/* Fill: finds the area a tap sits in and returns its outline as closed loops of integer points.
   The outline is stored with the note (a "fill" item), so every device draws the same shape and no
   pixels are re-read when a note is shown. Any pixel with a little ink is a wall, and gaps of up to
   4 units are closed so a nearly finished shape still holds. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fill = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WALL_ALPHA = 24;      // about 9% ink counts as a wall, so a light highlighter line still holds the colour back
  const CLOSE = 2;            // walls grow by 2 units each side before filling: gaps up to 4 units close
  const LEAK = 0.55;          // an area larger than this share of the page means the shape was open
  const MAX_POINTS = 1500, MAX_LOOPS = 24;

  function grow(wall, W, H, r) {
    const a = new Uint8Array(W * H), out = new Uint8Array(W * H), pre = new Int32Array(Math.max(W, H) + 1);
    for (let y = 0; y < H; y++) {
      pre[0] = 0;
      for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + wall[y * W + x];
      for (let x = 0; x < W; x++) a[y * W + x] = pre[Math.min(W, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0;
    }
    for (let x = 0; x < W; x++) {
      pre[0] = 0;
      for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + a[y * W + x];
      for (let y = 0; y < H; y++) out[y * W + x] = pre[Math.min(H, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0;
    }
    return out;
  }

  function flood(wall, W, H, sx, sy) {   // scanline flood over pixels that are not walls
    const seen = new Uint8Array(W * H), stack = [sx, sy];
    let area = 0;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (wall[y * W + x] || seen[y * W + x]) continue;
      let l = x, r = x;
      while (l > 0 && !wall[y * W + l - 1] && !seen[y * W + l - 1]) l--;
      while (r < W - 1 && !wall[y * W + r + 1] && !seen[y * W + r + 1]) r++;
      for (let i = l; i <= r; i++) seen[y * W + i] = 1;
      area += r - l + 1;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue;
        let run = false;
        for (let i = l; i <= r; i++) {
          const free = !wall[ny * W + i] && !seen[ny * W + i];
          if (free && !run) { stack.push(i, ny); run = true; } else if (!free) run = false;
        }
      }
    }
    return { seen, area };
  }

  function trace(seen, W, H) {   // edges between region and non-region pixels, joined into closed loops
    const V = W + 1, from = [], to = [], out = new Map();
    const add = (ax, ay, bx, by) => {
      const a = ay * V + ax, e = from.length;
      from.push(a); to.push(by * V + bx);
      const list = out.get(a);
      if (list) list.push(e); else out.set(a, [e]);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!seen[y * W + x]) continue;
        if (y === 0 || !seen[(y - 1) * W + x]) add(x, y, x + 1, y);
        if (x === W - 1 || !seen[y * W + x + 1]) add(x + 1, y, x + 1, y + 1);
        if (y === H - 1 || !seen[(y + 1) * W + x]) add(x + 1, y + 1, x, y + 1);
        if (x === 0 || !seen[y * W + x - 1]) add(x, y + 1, x, y);
      }
    }
    const used = new Uint8Array(from.length), loops = [];
    for (let e0 = 0; e0 < from.length; e0++) {
      if (used[e0]) continue;
      const loop = [];
      let e = e0;
      for (;;) {
        used[e] = 1;
        loop.push(from[e] % V, Math.floor(from[e] / V));
        const next = (out.get(to[e]) || []).find((n) => !used[n]);
        if (next === undefined) break;
        e = next;
      }
      loops.push(loop);
    }
    return loops;
  }

  function area2(p) { let s = 0; for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; s += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(s) / 2; }

  function dedupe(p) {   // drop points that lie on a straight run
    const n = p.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const cross = (p[i * 2] - p[a * 2]) * (p[b * 2 + 1] - p[i * 2 + 1]) - (p[i * 2 + 1] - p[a * 2 + 1]) * (p[b * 2] - p[i * 2]);
      if (cross !== 0) out.push(p[i * 2], p[i * 2 + 1]);
    }
    return out;
  }

  function rdp(p, lo, hi, tol, keep) {
    let far = -1, best = tol;
    const ax = p[lo * 2], ay = p[lo * 2 + 1], bx = p[hi * 2], by = p[hi * 2 + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = lo + 1; i < hi; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far < 0) return;
    keep[far] = 1;
    rdp(p, lo, far, tol, keep); rdp(p, far, hi, tol, keep);
  }

  function simplify(p, tol) {   // closed loop: split at the point farthest from the first
    const n = p.length / 2;
    if (n < 4) return p;
    let far = 0, best = -1;
    for (let i = 1; i < n; i++) { const d = Math.hypot(p[i * 2] - p[0], p[i * 2 + 1] - p[1]); if (d > best) { best = d; far = i; } }
    const open = [], keep = new Uint8Array(n + 1);
    for (let i = 0; i < n; i++) open.push(p[i * 2], p[i * 2 + 1]);
    open.push(p[0], p[1]);
    keep[0] = keep[far] = keep[n] = 1;
    rdp(open, 0, far, tol, keep); rdp(open, far, n, tol, keep);
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(open[i * 2], open[i * 2 + 1]);
    return out;
  }

  /* rgba: the page's ImageData.data (W*H*4). Returns {loops, area} or {error: 'line' | 'leak' | 'small' | 'complex'}. */
  function compute(rgba, W, H, x, y) {
    x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y)));
    const raw = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) raw[i] = rgba[i * 4 + 3] >= WALL_ALPHA ? 1 : 0;
    const wall = grow(raw, W, H, CLOSE);
    // Starting pixels: the tap itself, or when it landed on a line, the open pixels just beside it.
    const starts = [];
    if (!wall[y * W + x]) starts.push([x, y]);
    else {
      let first = 0;   // look a few units past the nearest open pixel, so both sides of a thin line are found
      for (let r = 1; r <= 8 && (!first || r <= first + 3); r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && !wall[ny * W + nx]) { starts.push([nx, ny]); if (!first) first = r; }
        }
      }
      if (!starts.length) return { error: 'line' };
    }
    // Try each side of a line once (at most four floods); keep the smallest closed area, which is the one meant.
    let best = null, sawLeak = false;
    const floods = [];
    for (const [sx, sy] of starts) {
      if (floods.some((f) => f.seen[sy * W + sx])) continue;   // already inside an area we measured
      if (floods.length >= 4) break;
      const r = flood(wall, W, H, sx, sy);
      floods.push(r);
      if (r.area > LEAK * W * H) { sawLeak = true; continue; }
      if (r.area < 20) continue;
      if (!best || r.area < best.area) best = r;
    }
    if (!best) return { error: sawLeak ? 'leak' : 'small' };
    const { seen, area } = best;
    const traced = trace(seen, W, H).map(dedupe);
    for (const tol of [1, 1.6, 2.4, 3.4, 5]) {
      let loops = traced.map((l) => simplify(l, tol)).filter((l) => l.length >= 6 && area2(l) >= 6);
      loops.sort((a, b) => area2(b) - area2(a));
      loops = loops.slice(0, MAX_LOOPS);
      if (loops.reduce((s, l) => s + l.length / 2, 0) <= MAX_POINTS) return { loops, area };
    }
    return { error: 'complex' };
  }

  function item(color, loops) {   // the stored fill item
    const points = [], counts = [];
    for (const l of loops) { counts.push(l.length / 2); for (let i = 0; i < l.length; i += 2) points.push([l[i], l[i + 1]]); }
    return { tool: 'fill', color, width: 1, points, loops: counts };
  }

  return { compute, item, WALL_ALPHA, CLOSE, LEAK, MAX_POINTS, MAX_LOOPS };
});
