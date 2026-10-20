// Integration tests against a running `wrangler dev` (default http://127.0.0.1:8787).
// Start it first:  npm run db:local && npm run dev     then:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASS = process.env.DUET_TEST_PASSPHRASE || '229';
const RUN = Date.now().toString(36);
const d1 = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', '--command', sql], { stdio: 'pipe' });

class Client {
  constructor() { this.jar = {}; }
  async req(path, body, headers = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';').map((s) => s.trim());
      const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (attrs.some((a) => /^max-age=0$/i.test(a)) || v === '') delete this.jar[k]; else this.jar[k] = v;
      this.lastSetCookie = c;
    }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers, text };
  }
}
async function login(person) {
  const c = new Client();
  assert.equal((await c.req('/api/unlock', { passphrase: PASS })).status, 200);
  assert.equal((await c.req('/api/person', { person })).status, 200);
  return c;
}
const stroke = (o = {}) => ({ color: '#594739', width: 4, points: [[10, 20], [30, 40]], ...o });
const note = (o = {}) => ({ nonce: `n-${RUN}-${Math.random().toString(36).slice(2, 8)}`, text: 'hello', paper: 'cream', drawing: [], ...o });

test('setup: clear rate-limit state', () => { d1('DELETE FROM attempts'); });

test('health, static files, security headers, private files', async () => {
  const c = new Client();
  assert.deepEqual((await c.req('/healthz')).json, { ok: true });
  const home = await fetch(BASE + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Project Duet/);
  assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/config.json', '/server.py', '/worker/index.js', '/wrangler.jsonc', '/package.json', '/test_server.py']) {
    assert.equal((await fetch(BASE + p)).status, 404, `${p} must not be served`);
  }
});

test('authentication, cookie flags, origin check, logout', async () => {
  const c = new Client();
  assert.equal((await c.req('/api/notes')).status, 401);
  assert.equal((await c.req('/api/unlock', { passphrase: 'wrong' })).status, 401);
  assert.equal((await c.req('/api/unlock', { passphrase: PASS }, { Origin: 'https://wrong.example' })).status, 403);
  const ok = await c.req('/api/unlock', { passphrase: PASS });
  assert.equal(ok.status, 200);
  assert.match(c.lastSetCookie, /HttpOnly/); assert.match(c.lastSetCookie, /SameSite=Strict/); assert.match(c.lastSetCookie, /Max-Age=2592000/);
  assert.equal((await c.req('/api/session')).json.person, null);
  assert.equal((await c.req('/api/notes')).status, 200);
  assert.equal((await c.req('/api/person', { person: 'nobody' })).status, 400);
  await c.req('/api/person', { person: 'aryan' });
  assert.equal((await c.req('/api/session')).json.person, 'aryan');
  assert.equal((await c.req('/api/logout', {})).status, 200);
  assert.equal((await c.req('/api/notes')).status, 401);
  assert.equal((await c.req('/api/notes', 'not json')).status, 400);
  assert.equal((await c.req('/api/notes', '[1,2]')).status, 400);
});

test('posting without choosing a name is refused', async () => {
  const c = new Client(); await c.req('/api/unlock', { passphrase: PASS });
  assert.equal((await c.req('/api/notes', note())).status, 403);
});

test('shared storage, routing, retry is idempotent, drawing round-trips', async () => {
  const a = await login('aryan'), b = await login('chat');
  const n = note({ text: 'hello <script>', paper: 'sage', drawing: [stroke()] });
  const first = await a.req('/api/notes', n);
  assert.equal(first.status, 201);
  assert.equal((await a.req('/api/notes', n)).json.note.id, first.json.note.id);
  const rows = (await b.req('/api/notes')).json.notes.filter((x) => x.nonce === n.nonce);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipient, 'chat');
  assert.deepEqual(rows[0].drawing, n.drawing);
  const back = note({ text: 'hi back' });
  assert.equal((await b.req('/api/notes', back)).status, 201);
  assert.equal((await a.req('/api/notes')).json.notes.find((x) => x.nonce === back.nonce).recipient, 'aryan');
});

test('invalid drawings and cursors', async () => {
  const a = await login('aryan');
  assert.equal((await a.req('/api/notes', note({ text: '', drawing: [stroke({ color: 'evil' })] }))).status, 400);
  assert.equal((await a.req('/api/notes?before=bad')).status, 400);
  assert.equal((await a.req('/api/notes?after=-3')).status, 400);
  assert.equal((await a.req('/api/notes?before=999999999999999999999999')).status, 400);
  assert.deepEqual((await a.req('/api/notes?before=1')).json.notes, []);
});

test('pressure brushes, conflicts, validation', async () => {
  const a = await login('aryan'), b = await login('chat');
  const n = note({ text: 'A sketch', paper: 'blue', format: 2, text_size: 52, drawing: [
    stroke({ tool: 'ink', color: '#728b98', width: 17, points: [[20, 20, 0.2], [40, 60, 0.9]] }),
    stroke({ tool: 'marker', color: '#bc8b3d', width: 28, points: [[80, 80], [160, 90]] })] });
  const r = await a.req('/api/notes', n);
  assert.equal(r.status, 201); assert.ok(r.json.note.id > 0);
  assert.deepEqual(r.json.note.drawing, n.drawing); assert.equal(r.json.note.text_size, 52);
  assert.equal((await a.req('/api/notes', n)).json.note.id, r.json.note.id);
  const changed = await a.req('/api/notes', { ...n, text: 'changed after an uncertain retry' });
  assert.equal(changed.status, 409); assert.equal(changed.json.code, 'draft_changed'); assert.equal(changed.json.note.id, r.json.note.id);
  assert.equal((await b.req('/api/notes', n)).status, 409);
  for (const width of [-1, 29, 1.5, '4']) {
    assert.equal((await a.req('/api/notes', note({ drawing: [stroke({ tool: 'pencil', width, points: [[10, 10]] })] }))).status, 400, `width ${width}`);
  }
  assert.equal((await a.req('/api/notes', note({ drawing: [stroke({ tool: 'ink', points: [[10, 10, 2]] })] }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ drawing: [stroke({ tool: 'laser' })] }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ drawing: [stroke({ points: [] })] }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ drawing: [stroke({ points: [[1001, 5]] })] }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ paper: 'neon' }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ nonce: 'short' }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ format: 9 }))).status, 400);
});

test('written notes: word and character limits', async () => {
  const a = await login('aryan');
  const base = { format: 3, text_size: 40, paper: 'cream', drawing: [] };
  const ok = await a.req('/api/notes', note({ ...base, text: 'word '.repeat(200) }));
  assert.equal(ok.status, 201); assert.equal(ok.json.note.format, 3); assert.deepEqual(ok.json.note.drawing, []);
  assert.equal((await a.req('/api/notes', note({ ...base, text: 'word '.repeat(201) }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ ...base, text: 'x'.repeat(3001) }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ ...base, text: '  ' }))).status, 400);
  assert.equal((await a.req('/api/notes', note({ ...base, drawing: [stroke()] }))).status, 400);
});

test('incremental catch-up beyond 40 notes and identity conflict', async () => {
  const a = await login('aryan');
  const latest = (await a.req('/api/notes')).json.notes;
  const cursor = Math.max(0, ...latest.map((x) => x.id));
  const expected = [];
  for (let i = 0; i < 45; i++) {
    const r = await a.req('/api/notes', note({ format: 3, text: `Catchup ${i}`, author: 'aryan' }));
    assert.equal(r.status, 201); expected.push(r.json.note.id);
  }
  const first = (await a.req(`/api/notes?after=${cursor}`)).json;
  assert.equal(first.more, true); assert.equal(first.notes.length, 40);
  const second = (await a.req(`/api/notes?after=${first.notes.at(-1).id}`)).json;
  assert.equal(second.more, false);
  assert.deepEqual([...first.notes, ...second.notes].map((x) => x.id), expected);
  assert.deepEqual((await a.req(`/api/notes?after=${expected.at(-1)}`)).json.notes, []);
  const older = (await a.req('/api/notes')).json;
  assert.equal(older.notes.length, 40); assert.equal(older.more, true);
  await a.req('/api/person', { person: 'chat' });
  assert.equal((await a.req('/api/notes', note({ author: 'aryan' }))).status, 409);
});

test('legacy rows (python-style JSON, default columns) are served', async () => {
  const nonce = `legacy-${RUN}`;
  d1(`INSERT INTO notes(nonce,author,recipient,text,drawing,paper,created) VALUES('${nonce}','aryan','chat','An existing note','[{"color": "#594739", "width": 4, "points": [[10, 20]]}]','cream',1)`);
  const a = await login('chat');
  const row = (await a.req('/api/notes')).json.notes.find((x) => x.nonce === nonce);
  assert.ok(row); assert.equal(row.format, 1); assert.equal(row.text_size, 40);
  assert.deepEqual(row.drawing, [{ color: '#594739', width: 4, points: [[10, 20]] }]);
});

test('large drawings: up to the 250 KB cap saves, above it is refused cleanly', async () => {
  const a = await login('aryan');
  const pts = Array.from({ length: 4000 }, (_, i) => [+(i % 997 + 0.123).toFixed(3), +((i * 7) % 991 + 0.456).toFixed(3), 0.512]);
  const make = (strokes) => note({ text: 'big', format: 2, drawing: Array.from({ length: strokes }, () => stroke({ tool: 'ink', points: pts })) });
  const ok = make(2), bytes = JSON.stringify(ok).length; assert.ok(bytes < 250000, `payload ${bytes}`);
  const t0 = performance.now(); const r = await a.req('/api/notes', ok); const ms = Math.round(performance.now() - t0);
  assert.equal(r.status, 201); assert.equal(r.json.note.drawing.length, 2);
  console.log(`  ${bytes} byte drawing saved in ${ms} ms round trip`);
  assert.equal((await a.req('/api/notes', make(3))).status, 413);
  assert.equal((await a.req('/api/notes', { ...ok, nonce: `x-${RUN}-over`, pad: 'x'.repeat(700000) })).status, 413);
});

test('expired sessions are rejected', async () => {
  const c = await login('aryan');
  d1('UPDATE sessions SET expires=0');
  assert.equal((await c.req('/api/notes')).status, 401);
});

test('wrong-passphrase rate limit (per IP) blocks even the right phrase', async () => {
  const h = { 'CF-Connecting-IP': '203.0.113.77' };
  const c = new Client();
  for (let i = 0; i < 10; i++) assert.equal((await c.req('/api/unlock', { passphrase: 'nope' }, h)).status, 401);
  assert.equal((await c.req('/api/unlock', { passphrase: 'nope' }, h)).status, 429);
  assert.equal((await c.req('/api/unlock', { passphrase: PASS }, h)).status, 429);
  assert.equal((await c.req('/api/unlock', { passphrase: PASS }, { 'CF-Connecting-IP': '203.0.113.78' })).status, 200);
  d1('DELETE FROM attempts');
});
