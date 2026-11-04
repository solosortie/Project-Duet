// Unit tests for public/fill.js (pure code): areas, gaps, holes, taps on lines, size limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// public/fill.js is a plain browser script; run it with a stand-in for the page's global object.
const scope = {};
new Function('self', readFileSync(new URL('../public/fill.js', import.meta.url), 'utf8'))(scope);
const Fill = scope.Fill;
const W = 1000, H = 720;

function page() { return new Uint8ClampedArray(W * H * 4); }
function ring(img, cx, cy, r, width, gapDeg = 0, gapAt = 0) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (Math.abs(d - r) > width / 2) continue;
    if (gapDeg) { const a = (Math.atan2(y - cy, x - cx) * 180 / Math.PI - gapAt + 360) % 360; if (a < gapDeg) continue; }
    img[(y * W + x) * 4 + 3] = 255;
  }
}
function box(img, x0, y0, x1, y1, width, alpha = 255) {
  for (let y = y0 - width; y <= y1 + width; y++) for (let x = x0 - width; x <= x1 + width; x++) {
    const inside = x > x0 + width / 2 && x < x1 - width / 2 && y > y0 + width / 2 && y < y1 - width / 2;
    const outside = x < x0 - width / 2 || x > x1 + width / 2 || y < y0 - width / 2 || y > y1 + width / 2;
    if (!inside && !outside && x >= 0 && y >= 0 && x < W && y < H) img[(y * W + x) * 4 + 3] = alpha;
  }
}
const polyArea = (p) => { let s = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; s += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(s) / 2; };
const total = (loops) => loops.reduce((s, l) => s + polyArea(l), 0);

test('a closed ring fills its inside, close to the real area', () => {
  const img = page(); ring(img, 300, 300, 120, 6);
  const r = Fill.compute(img, W, H, 300, 300);
  assert.ok(!r.error, r.error);
  const expected = Math.PI * 117 * 117;
  assert.ok(Math.abs(r.area - expected) / expected < 0.08, `area ${r.area} vs ${expected}`);
  assert.equal(r.loops.length, 1);
  assert.ok(Math.abs(total(r.loops) - r.area) / r.area < 0.03, 'outline matches the region');
  assert.ok(r.loops[0].length / 2 < 400, 'outline is compact');
});

test('a small gap is closed, a wide one leaks and is refused', () => {
  const small = page(); ring(small, 300, 300, 120, 3, 1.6);      // about 3.4 units open
  assert.ok(!Fill.compute(small, W, H, 300, 300).error, 'gap up to 4 closes');
  const wide = page(); ring(wide, 300, 300, 120, 3, 8);          // about 17 units open
  assert.equal(Fill.compute(wide, W, H, 300, 300).error, 'leak');
});

test('light (highlighter-strength) lines still hold the fill in', () => {
  const img = page(); box(img, 200, 200, 500, 400, 12, 72);      // alpha 72 is about 28% ink
  const r = Fill.compute(img, W, H, 350, 300);
  assert.ok(!r.error, r.error);
  assert.ok(r.area > 280 * 180 && r.area < 300 * 200);
});

test('a shape inside a shape keeps its hole', () => {
  const img = page(); ring(img, 400, 360, 200, 6); ring(img, 400, 360, 80, 6);
  const r = Fill.compute(img, W, H, 400, 200);                   // between the rings
  assert.ok(!r.error, r.error);
  assert.equal(r.loops.length, 2, 'outer outline and the hole');
  const expected = Math.PI * (197 * 197 - 83 * 83);
  assert.ok(Math.abs(r.area - expected) / expected < 0.08);
});

test('a tap on a line uses the closed side; a tap deep inside a thick line is refused', () => {
  const img = page(); ring(img, 300, 300, 120, 6);
  const r = Fill.compute(img, W, H, 300 + 120, 300);
  assert.ok(!r.error, r.error);
  assert.ok(r.area < Math.PI * 120 * 120, 'chose the inside, not the open page');
  const thick = page(); box(thick, 100, 100, 900, 600, 60);
  assert.equal(Fill.compute(thick, W, H, 100, 350).error, 'line');
});

test('an empty page counts as a leak', () => {
  assert.equal(Fill.compute(page(), W, H, 500, 300).error, 'leak');
});

test('items follow the stored shape the server accepts', () => {
  const img = page(); ring(img, 300, 300, 120, 6);
  const { loops } = Fill.compute(img, W, H, 300, 300);
  const it = Fill.item('#594739', loops);
  assert.equal(it.tool, 'fill'); assert.equal(it.width, 1);
  assert.equal(it.loops.reduce((a, b) => a + b, 0), it.points.length);
  assert.ok(it.points.length <= Fill.MAX_POINTS && it.loops.length <= Fill.MAX_LOOPS);
  assert.ok(it.points.every((p) => Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= 720));
});

test('speed: a fill on a large area takes well under 150 ms', () => {
  const img = page(); ring(img, 500, 360, 300, 8);
  Fill.compute(img, W, H, 500, 360);                             // warm-up
  const t = performance.now(); const r = Fill.compute(img, W, H, 500, 360); const ms = performance.now() - t;
  assert.ok(!r.error); assert.ok(ms < 150, `${ms.toFixed(0)} ms`);
});
