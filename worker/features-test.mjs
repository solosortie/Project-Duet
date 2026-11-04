// Colours, fills and the one-request drawing endpoint, against a running `wrangler dev` (original room).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASS = process.env.DUET_TEST_PASSPHRASE || '229';
const RUN = Date.now().toString(36);

class Client {
  constructor() { this.jar = {}; }
  async req(path, body) {
    const h = { 'Content-Type': 'application/json' };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); if (pair.slice(i + 1)) this.jar[pair.slice(0, i)] = pair.slice(i + 1); }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  }
}
const note = (drawing, tag) => ({ nonce: `ft-${RUN}-${tag}`, text: '', paper: 'cream', drawing, format: 2, text_size: 40 });
const ink = (color) => ({ tool: 'ink', color, width: 4, points: [[10, 10], [40, 40], [80, 30]] });
const fill = (over = {}) => ({ tool: 'fill', color: '#2a7a7c', width: 1, points: [[10, 10], [100, 10], [100, 100], [10, 100]], loops: [4], ...over });
let c;

test('sign in', async () => {
  c = new Client();
  assert.equal((await c.req('/api/unlock', { passphrase: PASS })).status, 200);
  assert.equal((await c.req('/api/person', { person: 'aryan' })).status, 200);
});

test('any #rrggbb colour is accepted, anything else is refused', async () => {
  assert.equal((await c.req('/api/notes', note([ink('#c0443a')], 'hex'))).status, 201);
  for (const bad of ['#C0443A', '#c0443', '#c0443a1', 'red', 'rgb(1,2,3)', '#12345g', '']) {
    assert.equal((await c.req('/api/notes', note([ink(bad)], 'bad' + bad.length + bad.slice(1, 3)))).status, 400, bad);
  }
});

test('a fill is stored as closed loops, and malformed fills are refused', async () => {
  assert.equal((await c.req('/api/notes', note([fill()], 'fill'))).status, 201);
  const two = fill({ points: [[10, 10], [100, 10], [100, 100], [10, 100], [30, 30], [60, 30], [60, 60]], loops: [4, 3] });
  assert.equal((await c.req('/api/notes', note([two], 'fill2'))).status, 201, 'an outline with a hole');
  const bad = [fill({ loops: [3] }), fill({ loops: [] }), fill({ width: 2 }), fill({ color: 'erase' }), fill({ points: [[10, 10], [100, 10], [100, 721], [10, 100]] }),
    fill({ points: [[10, 10], [100, 10], [100.5, 100], [10, 100]] }), fill({ loops: [2, 2] }), fill({ points: Array.from({ length: 1501 }, (_, i) => [i % 1000, 5]), loops: [1501] })];
  for (let i = 0; i < bad.length; i++) assert.equal((await c.req('/api/notes', note([bad[i]], 'fb' + i))).status, 400, 'bad fill ' + i);
});

test('one request returns a whole saved drawing, and browsers may keep it', async () => {
  const id = randomBytes(32).toString('hex'), nonce = `ft-${RUN}-chunks`;
  const packed = { tool: 'fill', color: '#2f6b3a', width: 1, stride: 2, points: [10, 10, 100, 10, 100, 100, 10, 100], loops: [4] };
  const pen = { tool: 'ink', color: '#33466b', width: 4, stride: 2, points: [5, 5, 60, 60, 90, 20] };
  assert.equal((await c.req('/api/uploads', { upload: id, author: 'aryan', nonce, paper: 'rose', text_size: 40, total: 2 })).status, 200);
  assert.equal((await c.req('/api/uploads/chunk', { upload: id, author: 'aryan', part: 0, drawing: [pen] })).status, 200);
  assert.equal((await c.req('/api/uploads/chunk', { upload: id, author: 'aryan', part: 1, drawing: [packed] })).status, 200);
  assert.equal((await c.req(`/api/drawing/${id}`)).status, 404, 'not readable before it is committed');
  assert.equal((await c.req('/api/uploads/commit', { upload: id, author: 'aryan' })).status, 201);
  const whole = await c.req(`/api/drawing/${id}`);
  assert.equal(whole.status, 200);
  assert.match(whole.headers.get('cache-control'), /immutable/);
  assert.equal(whole.json.drawing.length, 2);
  assert.equal(whole.json.drawing[0].tool, 'ink'); assert.equal(whole.json.drawing[1].tool, 'fill'); assert.deepEqual(whole.json.drawing[1].loops, [4]);
  const part = await c.req(`/api/drawing/${id}/1`);
  assert.equal(part.status, 200); assert.equal(part.json.drawing[0].tool, 'fill');
  assert.equal((await new Client().req(`/api/drawing/${id}`)).status, 401, 'needs a session');
  assert.equal((await c.req('/api/drawing/not-a-real-id')).status, 400);
});
