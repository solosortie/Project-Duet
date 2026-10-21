CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, author TEXT NOT NULL, nonce TEXT NOT NULL, paper TEXT NOT NULL, text_size INTEGER NOT NULL, total INTEGER NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS drawing_chunks(upload TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, strokes INTEGER NOT NULL, PRIMARY KEY(upload,part));
CREATE INDEX IF NOT EXISTS notes_author_created ON notes(author,created);
