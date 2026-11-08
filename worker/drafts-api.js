// Private drafts. Each person has their own shelf: a draft belongs to the person who saved it, and anyone else's
// request for it behaves as if it did not exist. Everything is also scoped by room_id.
//
// Saving a draft is one or more POSTs to /api/drafts, one chunk per request. The request that carries the last
// chunk also commits. The commit is a conditional UPDATE on rev, so the same person saving from two devices cannot
// silently overwrite their own newer version: the stale save gets a 409 and keeps its work (the client saves it as a copy).
import { validateNote } from './validate.js';
import { unpack } from './drawing-api.js';
import { reply } from './util.js';

const MAX_LIVE = 24;                 // drafts per person
const MAX_CHUNKS = 200;
const MAX_STROKES = 500;
const MAX_CHUNK_CHARS = 180000;      // same ceiling as note uploads
const MAX_THUMB = 24000;
const BIN_DAYS = 7;
const HEX32 = /^[a-f0-9]{32}$/;
const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;

const hex16 = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function draftMeta(row) {
  return {
    id: row.id, author: row.author, editor: row.editor, title: row.title, paper: row.paper,
    rev: row.rev, strokes: row.strokes, created: row.created, updated: row.updated, thumb: row.thumb,
  };
}

// Count and newest change of the live drafts: a few bytes that ride along with the note poll,
// so the Drafts button can update without a request of its own.
export async function draftStamp(env, roomId, me) {
  const r = await env.DB.prepare('SELECT count(*) n, max(updated) t FROM drafts WHERE room_id=? AND author=? AND deleted IS NULL').bind(roomId, me).first();
  return { n: (r && r.n) || 0, t: (r && r.t) || 0 };
}

async function housekeeping(env, roomId, now) {
  const binCut = now - BIN_DAYS * 86400, orphanCut = now - 86400;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM draft_chunks WHERE draft IN (SELECT id FROM drafts WHERE room_id=? AND deleted<?)').bind(roomId, binCut),
    env.DB.prepare('DELETE FROM drafts WHERE room_id=? AND deleted<?').bind(roomId, binCut),
    // chunks of a save that never committed (lost connection, closed tab), or that were replaced by a newer save
    env.DB.prepare('DELETE FROM draft_chunks WHERE created<? AND NOT EXISTS(SELECT 1 FROM drafts d WHERE d.id=draft_chunks.draft AND d.save_id=draft_chunks.save_id)').bind(orphanCut),
  ]);
}

const cleanTitle = (t) => (typeof t === 'string' ? t.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

async function liveCount(env, roomId, me) {
  const r = await env.DB.prepare('SELECT count(*) n FROM drafts WHERE room_id=? AND author=? AND deleted IS NULL').bind(roomId, me).first();
  return r.n;
}

async function readRow(env, id, roomId, me) {
  const row = await env.DB.prepare('SELECT * FROM drafts WHERE id=?').bind(id).first();
  return row && row.room_id === roomId && row.author === me ? row : null;
}

// ---- GET ----
export async function draftsGet(url, session, env) {
  const rid = session.room_id, me = session.person, now = Date.now() / 1000;
  if (url.pathname === '/api/drafts') {
    const bin = url.searchParams.get('deleted') === '1';
    const sql = bin
      ? 'SELECT * FROM drafts WHERE room_id=? AND author=? AND deleted IS NOT NULL AND deleted>? ORDER BY deleted DESC LIMIT 24'
      : 'SELECT * FROM drafts WHERE room_id=? AND author=? AND deleted IS NULL AND ?>=0 ORDER BY updated DESC LIMIT 24';
    const { results } = await env.DB.prepare(sql).bind(rid, me, bin ? now - BIN_DAYS * 86400 : 0).all();
    const stamp = await draftStamp(env, rid, me);
    return reply(200, { drafts: results.map((r) => ({ ...draftMeta(r), deleted: r.deleted })), stamp, now });
  }
  const id = url.pathname.slice('/api/drafts/'.length);
  if (!HEX32.test(id)) return reply(400, { error: 'Invalid draft.' });
  const row = await readRow(env, id, rid, me);
  if (!row || row.deleted) return reply(404, { error: 'That draft is gone.' });
  const { results } = await env.DB.prepare('SELECT data FROM draft_chunks WHERE draft=? AND save_id=? ORDER BY part').bind(id, row.save_id).all();
  if (results.length !== row.total) return reply(503, { error: 'This draft is not readable right now. Try again.' });
  const meta = JSON.stringify({ ...draftMeta(row), thumb: undefined, nonce: row.nonce });
  return reply(200, `{"draft":${meta.slice(0, -1)},"drawing":[${results.map((r) => r.data.slice(1, -1)).filter(Boolean).join(',')}]}}`);
}

// ---- POST ----
export async function draftsPost(path, data, session, env) {
  const rid = session.room_id, me = session.person, now = Date.now() / 1000;
  if (!me) return reply(403, { error: 'Choose your name first.' });
  const id = data.id;
  if (typeof id !== 'string' || !HEX32.test(id)) return reply(400, { error: 'Invalid draft.' });

  if (path === '/api/drafts/delete') {
    const row = await readRow(env, id, rid, me);
    if (!row) return reply(200, { ok: true });
    if (data.stuck === true || data.forever === true) {   // it became a note, or was deleted for good: nothing to keep
      await env.DB.batch([env.DB.prepare('DELETE FROM draft_chunks WHERE draft=?').bind(id), env.DB.prepare('DELETE FROM drafts WHERE id=?').bind(id)]);
    } else {
      await env.DB.prepare('UPDATE drafts SET deleted=?, updated=? WHERE id=? AND deleted IS NULL').bind(now, now, id).run();
    }
    return reply(200, { ok: true });
  }

  if (path === '/api/drafts/restore') {
    const row = await readRow(env, id, rid, me);
    if (!row || !row.deleted) return reply(404, { error: 'That draft is gone.' });
    if (await liveCount(env, rid, me) >= MAX_LIVE) return reply(409, { error: 'The shelf is full. Delete another draft first.' });
    await env.DB.prepare('UPDATE drafts SET deleted=NULL, updated=? WHERE id=?').bind(now, id).run();
    return reply(200, { ok: true });
  }

  if (path === '/api/drafts/copy') {
    const row = await readRow(env, id, rid, me);
    if (!row || row.deleted) return reply(404, { error: 'That draft is gone.' });
    if (await liveCount(env, rid, me) >= MAX_LIVE) return reply(409, { error: 'The shelf is full. Delete a draft to make room.' });
    const newId = hex16(), saveId = hex16(), nonce = hex16();
    const title = cleanTitle(row.title ? `${row.title} (copy)` : '');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO draft_chunks(draft,save_id,part,data,strokes,created) SELECT ?,?,part,data,strokes,? FROM draft_chunks WHERE draft=? AND save_id=?').bind(newId, saveId, now, id, row.save_id),
      env.DB.prepare('INSERT INTO drafts(id,room_id,author,editor,title,paper,nonce,rev,save_id,total,strokes,thumb,created,updated) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)')
        .bind(newId, rid, me, me, title, row.paper, nonce, saveId, row.total, row.strokes, row.thumb, now, now),
    ]);
    const made = await readRow(env, newId, rid, me);
    return reply(201, { draft: draftMeta(made) });
  }

  if (path !== '/api/drafts') return reply(404, { error: 'Not found.' });
  return saveChunk(data, id, me, rid, env, now);
}

async function saveChunk(data, id, me, rid, env, now) {
  const { save, part, total, base, nonce } = data;
  const paper = data.paper;
  if (typeof save !== 'string' || !HEX32.test(save) || !Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || part < 0 || part >= total
    || !Number.isInteger(base) || base < 0 || typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 80
    || !Array.isArray(data.drawing) || data.drawing.length > 40) return reply(400, { error: 'Invalid draft.' });

  const row = await env.DB.prepare('SELECT * FROM drafts WHERE id=?').bind(id).first();
  if (row && (row.room_id !== rid || row.author !== me)) return reply(400, { error: 'Invalid draft.' });

  // Checks that depend on the current state come first, so a stale save is refused before it writes anything.
  if (row && row.deleted) return reply(409, { code: 'draft_deleted', error: 'This draft was deleted. Your version is kept here.' });
  if (!row && base !== 0) return reply(409, { code: 'draft_gone', error: 'This draft is gone. Your version is kept here.' });
  if (row && row.save_id === save) return reply(200, { ok: true, draft: draftMeta(row) });   // the same save arriving twice
  if (row && row.rev !== base) return reply(409, { code: 'draft_conflict', draft: draftMeta(row), error: 'A newer version of this draft was saved elsewhere.' });

  // Validate this chunk exactly as note chunks are validated.
  const strokes = data.drawing.map(unpack);
  const check = validateNote({ nonce: `draft-${id}`.slice(0, 40), format: 2, drawing: strokes, paper, text_size: 40 }, me);
  if (!check.note && !(data.drawing.length === 0 && ['cream', 'rose', 'sage', 'blue'].includes(paper))) return reply(400, { error: 'This drawing could not be saved.' });
  const packed = JSON.stringify(data.drawing);
  if (packed.length > MAX_CHUNK_CHARS) return reply(413, { error: 'Part of this drawing is too large.' });
  await env.DB.prepare('INSERT OR REPLACE INTO draft_chunks(draft,save_id,part,data,strokes,created) VALUES(?,?,?,?,?,?)').bind(id, save, part, packed, data.drawing.length, now).run();
  if (part !== total - 1) return reply(200, { ok: true });

  // Last chunk: commit.
  const counts = await env.DB.prepare('SELECT count(*) n, sum(strokes) s FROM draft_chunks WHERE draft=? AND save_id=?').bind(id, save).first();
  if (counts.n !== total || !(counts.s >= 1) || counts.s > MAX_STROKES) {
    return reply(400, { error: counts.s > MAX_STROKES ? 'This page is too full to save.' : 'The save was incomplete. Try again; your changes are kept.' });
  }
  const title = cleanTitle(data.title);
  const thumb = typeof data.thumb === 'string' && data.thumb.length <= MAX_THUMB && THUMB.test(data.thumb) ? data.thumb : null;
  if (!row && await liveCount(env, rid, me) >= MAX_LIVE) {
    await env.DB.prepare('DELETE FROM draft_chunks WHERE draft=? AND save_id=?').bind(id, save).run();
    return reply(409, { code: 'shelf_full', error: 'The shelf is full. Delete a draft to save another.' });
  }
  let changes;
  if (!row) {
    const r = await env.DB.prepare('INSERT OR IGNORE INTO drafts(id,room_id,author,editor,title,paper,nonce,rev,save_id,total,strokes,thumb,created,updated) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)')
      .bind(id, rid, me, me, title, paper, nonce, save, total, counts.s, thumb || '', now, now).run();
    changes = r.meta.changes;
  } else {
    const r = await env.DB.prepare('UPDATE drafts SET editor=?, title=?, paper=?, nonce=?, rev=rev+1, save_id=?, total=?, strokes=?, thumb=COALESCE(?,thumb), updated=? WHERE id=? AND rev=? AND deleted IS NULL')
      .bind(me, title, paper, nonce, save, total, counts.s, thumb, now, id, base).run();
    changes = r.meta.changes;
  }
  if (!changes) {   // somebody else committed between the check above and now
    await env.DB.prepare('DELETE FROM draft_chunks WHERE draft=? AND save_id=?').bind(id, save).run();
    const cur = await readRow(env, id, rid, me);
    return reply(409, { code: 'draft_conflict', draft: cur ? draftMeta(cur) : null, error: 'A newer version of this draft was saved elsewhere.' });
  }
  await env.DB.prepare('DELETE FROM draft_chunks WHERE draft=? AND save_id!=?').bind(id, save).run();
  await housekeeping(env, rid, now).catch(() => {});
  const saved = await readRow(env, id, rid, me);
  return reply(200, { ok: true, draft: draftMeta(saved) });
}
