-- Private drafts: saved canvases that belong to the person who saved them (author), so they can pick them up later.
-- A draft's strokes live in draft_chunks (same packed format as note uploads). Each save writes a new
-- chunk set under a fresh save_id and flips drafts.save_id to it in one conditional UPDATE, so a half-finished
-- save can never replace a good one. rev is the optimistic-concurrency counter.
CREATE TABLE IF NOT EXISTS drafts(
  id TEXT PRIMARY KEY,
  room_id INTEGER NOT NULL DEFAULT 1,
  author TEXT NOT NULL,                  -- who started it
  editor TEXT NOT NULL,                  -- who saved it last
  title TEXT NOT NULL DEFAULT '',
  paper TEXT NOT NULL,
  nonce TEXT NOT NULL,                   -- becomes the note's nonce when the draft is stuck, so sticking is retry-safe
  rev INTEGER NOT NULL DEFAULT 0,
  save_id TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  strokes INTEGER NOT NULL DEFAULT 0,
  thumb TEXT NOT NULL DEFAULT '',        -- small JPEG data URL for the drafts shelf
  created REAL NOT NULL,
  updated REAL NOT NULL,
  deleted REAL                           -- NULL while live; set when put in the bin (kept 7 days)
);
CREATE TABLE IF NOT EXISTS draft_chunks(
  draft TEXT NOT NULL, save_id TEXT NOT NULL, part INTEGER NOT NULL,
  data TEXT NOT NULL, strokes INTEGER NOT NULL, created REAL NOT NULL,
  PRIMARY KEY(draft, save_id, part)
);
CREATE INDEX IF NOT EXISTS drafts_room ON drafts(room_id, deleted, updated);
CREATE INDEX IF NOT EXISTS draft_chunks_created ON draft_chunks(created);
