// Locked walls end to end, against `wrangler dev` (needs ADMIN_PASSPHRASE=test-admin-pass in .dev.vars).
// What matters most: after a note, a drawing or a draft is saved, the database holds no readable trace of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Vault } from './vault-helper.mjs';
import { sealRoomBody } from './vault-helper.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN = process.env.DUET_TEST_ADMIN || 'test-admin-pass';
const RUN = Date.now().toString(36).slice(-5);
const MARK = 'SECRET-MARKER-' + RUN;
const sh = (sql, json = false) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', ...(json ? ['--json'] : []), '--command', sql], { stdio: 'pipe', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const rows = (sql) => { const out = sh(sql, true); return JSON.parse(out.slice(out.indexOf('[')))[0].results; };
const sha = (s) => createHash('sha256').update(s).digest('hex');

class Client {
  constructor(room, ip) { this.jar = {}; this.room = room; this.ip = ip; }
  async req(path, body, headers = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (this.room) h['X-Duet-Room'] = this.room;
    if (this.ip) h['CF-Connecting-IP'] = this.ip;
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); const [k, v] = [pair.slice(0, i), pair.slice(i + 1)]; if (v === '' || /max-age=0/i.test(c)) delete this.jar[k]; else this.jar[k] = v; }
    let json = null; try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  }
}
const admin = new Client(null, '198.51.100.201');
const PASS = 'abc';                         // a three-character passcode is allowed; the key still never leaves the browser
const SLUG = `lock-${RUN}`, OLD = `old-${RUN}`;
const stroke = (text) => ({ tool: 'text', color: '#333', width: 1, size: 40, w: 400, h: 60, text, points: [[10, 10]] });
let keys, a, b, roomId;

test('setup: sign in as owner, clean slate', async () => {
  sh('DELETE FROM attempts');
  assert.equal((await admin.req('/api/admin/login', { passphrase: ADMIN })).status, 200);
});

test('a request carries a salt and a proof, never the passcode, and is refused without them', async () => {
  const c = new Client(null, '203.0.113.201');
  const plain = await c.req('/api/rooms', { names: ['Mira', 'Jo'], animals: ['cat', 'deer'], slug: SLUG, passphrase: PASS, timezone: 'UTC' });
  assert.equal(plain.status, 400, 'a readable passcode is not accepted');
  const body = await sealRoomBody({ names: ['Mira', 'Jo'], animals: ['cat', 'deer'], slug: SLUG, passphrase: PASS, timezone: 'UTC' });
  assert.equal(JSON.stringify(body).includes(PASS + '"'), false);
  assert.equal((await c.req('/api/rooms', body)).status, 201);
  const row = rows(`SELECT vault, salt, pass_hash FROM rooms WHERE slug='${SLUG}'`)[0];
  assert.equal(row.vault, 1);
  assert.equal(row.pass_hash, sha(`${row.salt}:${body.vault.proof}`), 'only a hash of the proof is stored');
  assert.equal((await admin.req('/api/admin/decide', { slug: SLUG, status: 'live' })).status, 200);
  roomId = rows(`SELECT id FROM rooms WHERE slug='${SLUG}'`)[0].id;
});

test('a locked wall opens with a proof; a wrong proof or the readable passcode does not', async () => {
  a = new Client(SLUG, '203.0.113.202');
  const info = (await a.req('/api/vault')).json;
  assert.equal(info.vault, 1); assert.match(info.salt, /^[a-f0-9]{32}$/);
  keys = await Vault.derive(PASS, info.salt);
  assert.equal((await a.req('/api/unlock', { proof: 'f'.repeat(64) })).status, 401);
  assert.equal((await a.req('/api/unlock', { passphrase: PASS })).status, 401);
  assert.equal((await a.req('/api/unlock', { proof: keys.proof })).status, 200);
  assert.equal((await a.req('/api/person', { person: 'aryan' })).status, 200);
  b = new Client(SLUG, '203.0.113.203');
  assert.equal((await b.req('/api/unlock', { proof: keys.proof })).status, 200);
  assert.equal((await b.req('/api/person', { person: 'chat' })).status, 200);
});

test('readable notes are refused on a locked wall; a sealed note is stored and read back', async () => {
  const plain = await a.req('/api/notes', { author: 'aryan', text: '', drawing: [stroke(MARK)], paper: 'cream', nonce: 'plain-' + RUN + '0000', format: 2, text_size: 40 });
  assert.equal(plain.status, 400);
  const sealed = await Vault.seal(keys, { fmt: 2, text: '', drawing: [stroke(MARK)] }, 'aryan');
  const post = { author: 'aryan', paper: 'rose', nonce: 'sealed-' + RUN + '00', format: 5, text_size: 40, sealed };
  const first = await a.req('/api/notes', post);
  assert.equal(first.status, 201);
  assert.equal((await a.req('/api/notes', post)).status, 201, 'a retry of the same note is accepted');
  assert.equal((await a.req('/api/notes', post)).json.note.id, first.json.note.id, 'and is the same note');
  const other = await a.req('/api/notes', { ...post, sealed: await Vault.seal(keys, { fmt: 2, text: 'x', drawing: [] }, 'aryan') });
  assert.equal(other.status, 409); assert.equal(other.json.code, 'draft_changed');
  assert.equal((await a.req('/api/notes', { ...post, sealed: 'not sealed' })).status, 400);
  const list = (await b.req('/api/notes')).json.notes;
  assert.equal(list.length, 1); assert.equal(list[0].format, 5);
  const opened = await Vault.open(keys, list[0].text, list[0].author);
  assert.equal(opened.drawing[0].text, MARK, 'the other person opens it with the same passcode');
  await assert.rejects(Vault.open(keys, list[0].text, 'chat'), 'a note cannot be passed off as the other person\'s');
  const raw = JSON.stringify(rows(`SELECT text, drawing, nonce FROM notes WHERE room_id=${roomId}`));
  assert.equal(raw.includes(MARK), false, 'the database holds no readable trace of the note');
});

test('a large drawing is sealed in pieces, stored as pieces, and reassembled', async () => {
  const big = []; for (let i = 0; i < 60; i++) big.push({ tool: 'ink', color: '#111', width: 3, points: Array.from({ length: 400 }, (_, j) => [i * 3 + j % 7, j * 1.5]) });
  big.push(stroke(MARK));
  const sealed = await Vault.seal(keys, { fmt: 2, text: '', drawing: big.map((s) => (s.tool === 'text' ? { tool: 'text', color: s.color, width: s.width, size: s.size, w: s.w, h: s.h, text: s.text, stride: 2, points: [10, 10] } : { tool: s.tool, color: s.color, width: s.width, stride: 2, points: s.points.flat() })) }, 'aryan');
  const parts = Vault.pieces(sealed);
  assert.ok(parts.length >= 2, 'it needed more than one piece: ' + sealed.length);
  const upload = sha(sealed), nonce = 'chunked-' + RUN + '00';
  const base = { upload, author: 'aryan' };
  assert.equal((await a.req('/api/uploads', { ...base, nonce, paper: 'sage', text_size: 40, total: parts.length })).status, 400, 'a plain upload is refused on a locked wall');
  assert.equal((await a.req('/api/uploads', { ...base, nonce, paper: 'sage', text_size: 40, total: parts.length, sealed: true })).status, 200);
  for (let i = 0; i < parts.length; i++) assert.equal((await a.req('/api/uploads/chunk', { ...base, part: i, sealed: parts[i] })).status, 200);
  assert.equal((await a.req('/api/uploads/chunk', { ...base, part: 0, sealed: parts[0].slice(0, -1) + 'A' })).status, 409, 'a piece cannot change once stored');
  const done = await a.req('/api/uploads/commit', base);
  assert.equal(done.status, 201); assert.equal(done.json.note.format, 6);
  const whole = await b.req('/api/drawing/' + upload);
  assert.equal(whole.status, 200); assert.equal(whole.json.drawing.join(''), sealed);
  const back = await Vault.open(keys, whole.json.drawing.join(''), 'aryan');
  assert.equal(back.drawing[back.drawing.length - 1].text, MARK);
  const raw = JSON.stringify(rows(`SELECT data FROM drawing_chunks WHERE upload='${upload}'`));
  assert.equal(raw.includes(MARK), false);
});

test('drafts on a locked wall are sealed: strokes, title and preview picture', async () => {
  const id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  const piece = await Vault.seal(keys, { drawing: [stroke(MARK)] }, 'draft');
  const title = await Vault.seal(keys, { t: 'Title ' + MARK }, 'draft-title'), thumb = await Vault.seal(keys, { t: 'data:image/jpeg;base64,' + Buffer.from(MARK).toString('base64') }, 'draft-thumb');
  const save = Array.from({ length: 16 }, () => '0a').join('');
  const head = { id, save, part: 0, total: 1, base: 0, nonce: 'draft-' + RUN + '000', paper: 'cream' };
  assert.equal((await a.req('/api/drafts', { ...head, title: 'Plain title', drawing: [{ tool: 'ink', color: '#111', width: 3, stride: 2, points: [1, 1, 2, 2] }] })).status, 400, 'readable strokes are refused');
  const saved = await a.req('/api/drafts', { ...head, title, thumb, drawing: [], sealed: piece, strokes: 1 });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const list = (await a.req('/api/drafts')).json.drafts;
  assert.equal(list.length, 1); assert.equal((await Vault.open(keys, list[0].title, 'draft-title')).t, 'Title ' + MARK);
  const one = (await a.req('/api/drafts/' + id)).json.draft;
  assert.equal((await Vault.open(keys, one.drawing.join(''), 'draft')).drawing[0].text, MARK);
  const raw = JSON.stringify([rows('SELECT title, thumb FROM drafts'), rows('SELECT data FROM draft_chunks')]);
  assert.equal(raw.includes(MARK), false); assert.equal(raw.includes(Buffer.from(MARK).toString('base64')), false);
});

test('an older wall is locked the first time it is opened, and its old notes are sealed in place', async () => {
  const salt = 'legacy' + RUN, hash = sha(`${salt}:oldpass`), now = Math.floor(Date.now() / 1000);
  sh(`INSERT INTO rooms(slug,status,dynamic,name_a,name_b,animal_a,animal_b,tz,salt,pass_hash,ip_hash,created,ticket,vault) VALUES('${OLD}','live','friends','Mira','Jo','cat','deer','UTC','${salt}','${hash}','x',${now},'t',0)`);
  const rid = rows(`SELECT id FROM rooms WHERE slug='${OLD}'`)[0].id;
  const up = sha('legacy-upload-' + RUN);
  sh(`INSERT INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size,room_id) VALUES('${rid}:n-text-${RUN}','aryan','chat','Hello ${MARK}','[]','cream',${now},1,40,${rid}),`
    + `('${rid}:n-draw-${RUN}','chat','aryan','','[{"tool":"ink","color":"#111","width":3,"points":[[1,1],[2,2],[3,3]]},{"tool":"text","color":"#111","width":1,"size":40,"w":300,"h":50,"text":"${MARK}","points":[[5,5]]}]','rose',${now},2,40,${rid}),`
    + `('${rid}:n-chunk-${RUN}','aryan','chat','','{"upload":"${up}","chunks":1}','sage',${now},4,40,${rid})`);
  sh(`INSERT INTO uploads(id,author,nonce,paper,text_size,total,created,room_id) VALUES('${up}','aryan','n-chunk-${RUN}','sage',40,1,${now},${rid});`
    + `INSERT INTO drawing_chunks VALUES('${up}',0,'[{"tool":"text","color":"#111","width":1,"size":40,"w":300,"h":50,"text":"${MARK}","stride":2,"points":[5,5]}]',1)`);
  const c = new Client(OLD, '203.0.113.210');
  assert.equal((await c.req('/api/vault')).json.vault, 0);
  assert.equal((await c.req('/api/unlock', { passphrase: 'oldpass' })).status, 200, 'opened the old way once');
  assert.equal((await c.req('/api/person', { person: 'aryan' })).status, 200);
  const newSalt = Vault.newSalt(), k = await Vault.derive('oldpass', newSalt);
  assert.equal((await c.req('/api/vault/upgrade', { salt: newSalt, proof: k.proof })).status, 200);
  const again = await c.req('/api/vault/upgrade', { salt: Vault.newSalt(), proof: k.proof });
  assert.equal(again.status, 409); assert.equal(again.json.salt, newSalt, 'a second upgrade is refused and told the winning salt');
  assert.equal((await c.req('/api/notes', { author: 'aryan', text: 'hi', drawing: [], paper: 'cream', nonce: 'late-' + RUN + '0000', format: 1, text_size: 40 })).status, 400, 'once locked, readable notes are refused');
  const fresh = new Client(OLD, '203.0.113.211');
  assert.equal((await fresh.req('/api/unlock', { passphrase: 'oldpass' })).status, 401, 'the old way no longer works');
  assert.equal((await fresh.req('/api/unlock', { proof: k.proof })).status, 200);
  assert.equal((await fresh.req('/api/person', { person: 'chat' })).status, 200);
  // the browser seals each old note in place
  const list = (await c.req('/api/notes')).json.notes;
  assert.equal(list.length, 3);
  for (const n of list) {
    const plainText = n.format === 1 ? n.text : '';
    const drawing = n.format === 2 ? n.drawing : n.format === 4 ? [{ tool: 'text', color: '#111', width: 1, size: 40, w: 300, h: 50, text: MARK, stride: 2, points: [5, 5] }] : [];
    const sealed = await Vault.seal(k, { fmt: n.format === 4 ? 2 : n.format, text: plainText, drawing }, n.author);
    const r = await c.req('/api/notes', { author: n.author, nonce: n.nonce, paper: n.paper, text_size: 40, format: 5, sealed, replace: true });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.note.format, 5);
    assert.equal((await c.req('/api/notes', { author: n.author, nonce: n.nonce, paper: n.paper, text_size: 40, format: 5, sealed: await Vault.seal(k, { fmt: 1, text: 'other' }, n.author), replace: true })).status, 409, 'sealed notes are not replaced again');
  }
  const after = JSON.stringify([rows(`SELECT text, drawing FROM notes WHERE room_id=${rid}`), rows(`SELECT data FROM drawing_chunks WHERE upload='${up}'`)]);
  assert.equal(after.includes(MARK), false, 'no readable trace of the old notes is left');
  assert.equal(rows(`SELECT count(*) n FROM drawing_chunks WHERE upload='${up}'`)[0].n, 0, 'the old readable chunks are gone');
  const sealedList = (await fresh.req('/api/notes')).json.notes;
  assert.deepEqual(sealedList.map((n) => n.format), [5, 5, 5]);
  const opened = await Promise.all(sealedList.map((n) => Vault.open(k, n.text, n.author)));
  assert.ok(opened.some((o) => o.text === 'Hello ' + MARK), 'and the other person can still read the text note');
  assert.equal(opened.filter((o) => o.drawing.some((d) => d.text === MARK)).length, 2, 'and both old drawings');
});

test('cleanup', () => { sh(`DELETE FROM attempts; DELETE FROM notes WHERE room_id<>1; DELETE FROM uploads WHERE room_id<>1; DELETE FROM drawing_chunks WHERE upload NOT IN (SELECT id FROM uploads); DELETE FROM drafts WHERE room_id<>1; DELETE FROM draft_chunks WHERE draft NOT IN (SELECT id FROM drafts); DELETE FROM sessions WHERE room_id<>1; DELETE FROM rooms WHERE id<>1`); });
