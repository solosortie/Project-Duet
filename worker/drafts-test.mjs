// Private drafts against a running `wrangler dev` (original room).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASS = process.env.DUET_TEST_PASSPHRASE || '229';
const hex = () => randomBytes(16).toString('hex');

class Client {
  constructor() { this.jar = {}; }
  async req(path, body) {
    const h = { 'Content-Type': 'application/json' };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); if (pair.slice(i + 1)) this.jar[pair.slice(0, i)] = pair.slice(i + 1); }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  }
}
const pen = (n = 1, color = '#594739') => Array.from({ length: n }, (_, i) => ({ tool: 'ink', color, width: 4, stride: 2, points: [5 + i, 5, 60, 60 + i, 90, 20] }));
const save = (id, o = {}) => ({ id, save: hex(), part: 0, total: 1, base: 0, nonce: hex(), paper: 'cream', title: '', drawing: pen(), ...o });
let a, b;

test('sign in as both people', async () => {
  a = new Client(); b = new Client();
  for (const [c, p] of [[a, 'aryan'], [b, 'chat']]) {
    assert.equal((await c.req('/api/unlock', { passphrase: PASS })).status, 200);
    assert.equal((await c.req('/api/person', { person: p })).status, 200);
  }
  // start from empty shelves so the per-person cap never depends on earlier runs
  for (const c of [a, b]) for (const d of (await c.req('/api/drafts')).json.drafts) await c.req('/api/drafts/delete', { id: d.id, stuck: true });
});

test('a draft is listed and opened by its author only', async () => {
  const id = hex();
  const r = await a.req('/api/drafts', save(id, { title: '  rainy   window ', paper: 'rose' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.draft.rev, 1); assert.equal(r.json.draft.title, 'rainy window'); assert.equal(r.json.draft.author, 'aryan');
  assert.ok((await a.req('/api/drafts')).json.drafts.some((d) => d.id === id));
  assert.equal((await b.req('/api/drafts')).json.drafts.some((d) => d.id === id), false, 'not on the other shelf');
  assert.equal((await b.req('/api/drafts/' + id)).status, 404, 'the other person cannot open it');
  const open = await a.req('/api/drafts/' + id);
  assert.equal(open.status, 200); assert.equal(open.json.draft.drawing.length, 1); assert.equal(open.json.draft.paper, 'rose');
  assert.equal(open.json.draft.drawing[0].points.length, 6);
});

test('the other person cannot save over, copy, bin or restore it', async () => {
  const id = hex();
  await a.req('/api/drafts', save(id));
  assert.equal((await b.req('/api/drafts', save(id, { base: 1, drawing: pen(4) }))).status, 400);
  assert.equal((await b.req('/api/drafts/copy', { id })).status, 404);
  await b.req('/api/drafts/delete', { id }); await b.req('/api/drafts/delete', { id, stuck: true });
  assert.equal((await a.req('/api/drafts/' + id)).json.draft.drawing.length, 1, 'untouched');
  assert.equal((await b.req('/api/drafts/restore', { id })).status, 404);
});

test('saving again bumps the revision and replaces the strokes', async () => {
  const id = hex();
  assert.equal((await a.req('/api/drafts', save(id))).status, 200);
  const r = await a.req('/api/drafts', save(id, { base: 1, drawing: pen(3), title: 'two' }));
  assert.equal(r.status, 200); assert.equal(r.json.draft.rev, 2); assert.equal(r.json.draft.strokes, 3);
  assert.equal((await a.req('/api/drafts/' + id)).json.draft.drawing.length, 3);
});

test('a stale save (another device) is refused with the current version, and a repeated save is harmless', async () => {
  const id = hex();
  const first = save(id);
  assert.equal((await a.req('/api/drafts', first)).status, 200);
  assert.equal((await a.req('/api/drafts', first)).json.draft.rev, 1, 'same save twice is a no-op');
  assert.equal((await a.req('/api/drafts', save(id, { base: 1, drawing: pen(2) }))).status, 200);
  const stale = await a.req('/api/drafts', save(id, { base: 1, drawing: pen(5) }));
  assert.equal(stale.status, 409); assert.equal(stale.json.code, 'draft_conflict'); assert.equal(stale.json.draft.rev, 2);
  assert.equal((await a.req('/api/drafts/' + id)).json.draft.drawing.length, 2, 'the newer version is untouched');
});

test('large drafts upload in parts and only the last part commits', async () => {
  const id = hex(), s = hex(), common = { id, save: s, total: 3, base: 0, nonce: hex(), paper: 'sage' };
  assert.equal((await a.req('/api/drafts', { ...common, part: 0, drawing: pen(2) })).status, 200);
  assert.equal((await a.req('/api/drafts/' + id)).status, 404, 'not visible before the commit');
  assert.equal((await a.req('/api/drafts', { ...common, part: 2, drawing: pen(1) })).status, 400, 'a missing part is refused');
  assert.equal((await a.req('/api/drafts', { ...common, part: 1, drawing: pen(2) })).status, 200, 'the missing part can arrive late');
  assert.equal((await a.req('/api/drafts', { ...common, part: 2, drawing: pen(1) })).status, 200, 'and the commit then goes through');
});

test('multi-part commit succeeds when complete', async () => {
  const id = hex(), s = hex(), common = { id, save: s, total: 2, base: 0, nonce: hex(), paper: 'blue' };
  assert.equal((await a.req('/api/drafts', { ...common, part: 0, drawing: pen(2) })).status, 200);
  const done = await a.req('/api/drafts', { ...common, part: 1, drawing: pen(3) });
  assert.equal(done.status, 200); assert.equal(done.json.draft.strokes, 5);
  assert.equal((await a.req('/api/drafts/' + id)).json.draft.drawing.length, 5);
});

test('invalid strokes, empty pages and bad ids are refused', async () => {
  assert.equal((await a.req('/api/drafts', save(hex(), { drawing: [{ ...pen()[0], color: 'red' }] }))).status, 400);
  assert.equal((await a.req('/api/drafts', save(hex(), { drawing: [] }))).status, 400);
  assert.equal((await a.req('/api/drafts', save('nope'))).status, 400);
  assert.equal((await a.req('/api/drafts', save(hex(), { paper: 'neon' }))).status, 400);
  assert.equal((await a.req('/api/drafts', save(hex(), { base: 4 }))).status, 409);
});

test('copy, bin, restore and stuck', async () => {
  const id = hex();
  await a.req('/api/drafts', save(id, { title: 'cat' }));
  const copy = await a.req('/api/drafts/copy', { id });
  assert.equal(copy.status, 201); assert.equal(copy.json.draft.title, 'cat (copy)'); assert.equal(copy.json.draft.author, 'aryan');
  assert.equal((await a.req('/api/drafts/' + copy.json.draft.id)).json.draft.drawing.length, 1);
  assert.equal((await a.req('/api/drafts/delete', { id })).status, 200);
  assert.equal((await a.req('/api/drafts/' + id)).status, 404);
  assert.ok((await a.req('/api/drafts?deleted=1')).json.drafts.some((d) => d.id === id));
  assert.equal((await b.req('/api/drafts?deleted=1')).json.drafts.some((d) => d.id === id), false);
  assert.equal((await a.req('/api/drafts', save(id, { base: 1 }))).json.code, 'draft_deleted');
  assert.equal((await a.req('/api/drafts/restore', { id })).status, 200);
  assert.equal((await a.req('/api/drafts/' + id)).status, 200);
  await a.req('/api/drafts/delete', { id, stuck: true });
  assert.equal((await a.req('/api/drafts?deleted=1')).json.drafts.some((d) => d.id === id), false, 'stuck drafts are gone for good');
});

test('the note poll carries only your own drafts stamp', async () => {
  const c = new Client();
  assert.equal((await c.req('/api/unlock', { passphrase: PASS })).status, 200);
  assert.equal((await c.req('/api/person', { person: 'chat' })).status, 200);
  const before = (await c.req('/api/notes?after=999999999')).json.drafts;
  await a.req('/api/drafts', save(hex()));
  const poll = await a.req('/api/notes?after=999999999');
  assert.ok(poll.json.drafts.n >= 1); assert.ok(poll.json.drafts.t > 0);
  assert.deepEqual((await c.req('/api/notes?after=999999999')).json.drafts, before, 'the other person\'s stamp does not move');
});

test('drafts are not reachable without a session', async () => {
  const c = new Client();
  assert.equal((await c.req('/api/drafts')).status, 401);
  assert.equal((await c.req('/api/drafts', save(hex()))).status, 401);
});
