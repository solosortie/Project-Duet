-- Locked walls: notes, drawings and drafts are encrypted in the browser with a key made from the passcode.
-- vault=1 means the wall's login is a derived proof (never the passcode) and the server only stores sealed data.
ALTER TABLE rooms ADD COLUMN vault INTEGER NOT NULL DEFAULT 0;
-- sealed=1: the chunks of this upload are opaque ciphertext pieces. replace=1: it re-seals an older plain note.
ALTER TABLE uploads ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN replace INTEGER NOT NULL DEFAULT 0;
