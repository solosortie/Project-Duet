-- Cached streak result per room. It is recomputed only when a new note arrives or the day changes,
-- so reading it costs two tiny lookups however many notes a room holds.
CREATE TABLE IF NOT EXISTS room_state(room_id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL, day INTEGER NOT NULL, streaks TEXT NOT NULL);
