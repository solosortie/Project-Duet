-- Rooms (one per duet). Room 1 is the original personal room and stays untouched.
CREATE TABLE IF NOT EXISTS rooms(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | live | declined
  dynamic TEXT NOT NULL DEFAULT 'partners',
  name_a TEXT NOT NULL, name_b TEXT NOT NULL,
  animal_a TEXT NOT NULL, animal_b TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC',
  salt TEXT, pass_hash TEXT,                   -- NULL for room 1: it keeps using the DUET_PASSPHRASE settings
  ip_hash TEXT,
  created REAL NOT NULL, decided REAL
);
INSERT OR IGNORE INTO rooms(id,slug,status,dynamic,name_a,name_b,animal_a,animal_b,tz,created)
  VALUES(1,'home','live','partners','Aryan Chan','ChatChan','cat','deer','Asia/Kolkata',strftime('%s','now'));
ALTER TABLE notes ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE uploads ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS notes_room_id ON notes(room_id,id);
CREATE INDEX IF NOT EXISTS notes_room_author_created ON notes(room_id,author,created);
CREATE INDEX IF NOT EXISTS rooms_status ON rooms(status,created);
