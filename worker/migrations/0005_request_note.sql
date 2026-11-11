-- An optional short note that the people who asked for a wall can leave for the owner while they wait.
ALTER TABLE rooms ADD COLUMN note TEXT;
ALTER TABLE rooms ADD COLUMN ticket TEXT;   -- a hash of the secret the dash keeps, so only the sender can add or change the note
