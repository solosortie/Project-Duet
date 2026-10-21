#!/usr/bin/env python3
"""Turn notes from a Python-server SQLite database into SQL for Cloudflare D1.

    python3 worker/export_notes.py data/duet.sqlite3 import.sql
    npx wrangler d1 execute duet --remote --file import.sql

Run the import ONCE into an empty database. Sessions are not copied (everyone signs in again).
D1 limits one SQL statement to 100 KB, so large drawings are written in chunks.
"""
import sqlite3, sys
CHUNK = 40000
q = lambda v: 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
def main(src, out):
    c = sqlite3.connect(src); c.row_factory = sqlite3.Row
    cols = {r[1] for r in c.execute('PRAGMA table_info(notes)')}
    rows = c.execute('SELECT * FROM notes ORDER BY id').fetchall()
    with open(out, 'w', encoding='utf-8') as f:
        for r in rows:
            d = r['drawing'] or '[]'
            fmt = r['format'] if 'format' in cols else 1
            size = r['text_size'] if 'text_size' in cols else 40
            f.write(f"INSERT INTO notes(id,nonce,author,recipient,text,drawing,paper,created,format,text_size) VALUES({int(r['id'])},{q(r['nonce'])},{q(r['author'])},{q(r['recipient'])},{q(r['text'])},{q(d[:CHUNK])},{q(r['paper'])},{r['created']!r},{int(fmt)},{int(size)});\n")
            for i in range(CHUNK, len(d), CHUNK):
                f.write(f"UPDATE notes SET drawing=drawing||{q(d[i:i+CHUNK])} WHERE id={int(r['id'])};\n")
        tables={x[0] for x in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'uploads' in tables:
            for u in c.execute("SELECT u.* FROM uploads u JOIN notes n ON n.nonce=u.nonce AND n.format=4 AND json_extract(n.drawing,'$.upload')=u.id"):
                f.write("INSERT INTO uploads(id,author,nonce,paper,text_size,total,created) VALUES("+','.join(q(u[k]) for k in ('id','author','nonce','paper','text_size','total','created'))+");\n")
                for part in c.execute('SELECT * FROM drawing_chunks WHERE upload=? ORDER BY part',(u['id'],)):
                    text=part['data'];f.write("INSERT INTO drawing_chunks(upload,part,data,strokes) VALUES("+','.join([q(u['id']),str(part['part']),q(text[:CHUNK]),str(part['strokes'])])+");\n")
                    for i in range(CHUNK,len(text),CHUNK):f.write("UPDATE drawing_chunks SET data=data||"+q(text[i:i+CHUNK])+" WHERE upload="+q(u['id'])+" AND part="+str(part['part'])+";\n")
    c.close()
    print(f'{len(rows)} notes written to {out}')
if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(*sys.argv[1:])
