#!/usr/bin/env python3
"""Project Duet — dependency-free local/server deployment."""
import os, json, sqlite3, secrets, hashlib, hmac, time, mimetypes, io
from email.message import Message
from http import HTTPStatus
from pathlib import Path
from contextlib import contextmanager
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs
ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('DUET_DATA', ROOT / 'data')); DATA.mkdir(parents=True, exist_ok=True)
PHRASE = os.environ.get('DUET_PASSPHRASE')
PHRASE_HASH = hashlib.sha256(PHRASE.encode()).hexdigest() if PHRASE else json.loads((ROOT / 'config.json').read_text())['passphrase_sha256']
SECURE = os.environ.get('DUET_SECURE_COOKIE') == '1'
@contextmanager
def db():
    c = sqlite3.connect(DATA / 'duet.sqlite3', timeout=15); c.row_factory = sqlite3.Row
    try:
        with c: yield c
    finally: c.close()
with db() as c:
    c.executescript('''PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, person TEXT, expires REAL);
    CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT, nonce TEXT UNIQUE, author TEXT, recipient TEXT, text TEXT, drawing TEXT, paper TEXT, created REAL);
    CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY, count INTEGER, until REAL);''')
    columns = {r[1] for r in c.execute('PRAGMA table_info(notes)')}
    if 'format' not in columns: c.execute('ALTER TABLE notes ADD COLUMN format INTEGER NOT NULL DEFAULT 1')
    if 'text_size' not in columns: c.execute('ALTER TABLE notes ADD COLUMN text_size INTEGER NOT NULL DEFAULT 40')

class Routes:
    def log_message(self, fmt, *args): pass
    def send(self, status, data, cookie=None):
        body=json.dumps(data).encode(); self.send_response(status)
        self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
        if cookie: self.send_header('Set-Cookie',cookie)
        self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def session(self):
        cookies=SimpleCookie()
        try: cookies.load(self.headers.get('Cookie',''))
        except Exception: return None
        token=cookies.get('duet'); token=hashlib.sha256(token.value.encode()).hexdigest() if token else ''
        with db() as c: row=c.execute('SELECT * FROM sessions WHERE token=? AND expires>?',(token,time.time())).fetchone()
        return row
    def do_GET(self):
        p=urlparse(self.path)
        if p.path=='/healthz': return self.send(200,{'ok':True})
        if p.path.startswith('/api/'):
            s=self.session()
            if not s: return self.send(401,{'error':'Please enter the passphrase.'})
            if p.path=='/api/session': return self.send(200,{'person':s['person']})
            if p.path=='/api/notes':
                q=parse_qs(p.query)
                try:
                    incremental='after' in q
                    cursor=int(q.get('after' if incremental else 'before',[0 if incremental else 2**63-1])[0])
                except ValueError: return self.send(400,{'error':'Invalid cursor.'})
                if not (0 if incremental else 1)<=cursor<=2**63-1: return self.send(400,{'error':'Invalid cursor.'})
                with db() as c:
                    rows=c.execute('SELECT * FROM notes WHERE id>? ORDER BY id ASC LIMIT 41' if incremental else 'SELECT * FROM notes WHERE id<? ORDER BY id DESC LIMIT 41',(cursor,)).fetchall()
                result=[dict(r) for r in rows[:40]]
                for r in result: r['drawing']=json.loads(r['drawing'])
                return self.send(200,{'notes':result,'more':len(rows)>40})
            return self.send(404,{'error':'Not found.'})
        path=ROOT/'public'/('index.html' if p.path=='/' else p.path.lstrip('/'))
        if not path.resolve().is_relative_to((ROOT/'public').resolve()) or not path.is_file(): return self.send(404,{'error':'Not found.'})
        body=path.read_bytes(); self.send_response(200)
        self.send_header('Cache-Control','no-cache')
        self.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'): return self.send(403,{'error':'Origin rejected.'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>600000: return self.send(413,{'error':'This drawing is too large.'})
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict): raise ValueError()
        except (ValueError, json.JSONDecodeError): return self.send(400,{'error':'Invalid request.'})
        path=urlparse(self.path).path
        if path=='/api/unlock':
            ip=self.client_address[0]; now=time.time()
            with db() as c:
                r=c.execute('SELECT * FROM attempts WHERE ip=?',(ip,)).fetchone()
                if r and r['until']>now and r['count']>=10: return self.send(429,{'error':'Too many tries. Come back in ten minutes.'})
                if not hmac.compare_digest(hashlib.sha256(str(data.get('passphrase','')).encode()).hexdigest(),PHRASE_HASH):
                    count=r['count']+1 if r and r['until']>now else 1
                    c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(ip,count,now+600))
                    return self.send(401,{'error':'That’s not quite it. Try again.'})
                c.execute('DELETE FROM attempts WHERE ip=?',(ip,))
                c.execute('DELETE FROM sessions WHERE expires<?',(now,))
                token=secrets.token_urlsafe(32); c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),None,now+30*86400))
            return self.send(200,{'ok':True},'duet='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'+('; Secure' if SECURE else ''))
        s=self.session()
        if not s: return self.send(401,{'error':'Please enter the passphrase.'})
        if path=='/api/person':
            if data.get('person') not in ('aryan','chat'): return self.send(400,{'error':'Choose a person.'})
            with db() as c: c.execute('UPDATE sessions SET person=? WHERE token=?',(data['person'],s['token']))
            return self.send(200,{'ok':True})
        if path=='/api/logout':
            with db() as c: c.execute('DELETE FROM sessions WHERE token=?',(s['token'],))
            return self.send(200,{'ok':True},'duet=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict')
        if path=='/api/notes':
            if not s['person']: return self.send(403,{'error':'Choose your name first.'})
            if data.get('author',s['person'])!=s['person']: return self.send(409,{'error':'Your identity changed in another tab. Close this draft and choose your name again; the draft is kept.'})
            text=data.get('text',''); drawing=data.get('drawing',[]); paper=data.get('paper','cream'); nonce=data.get('nonce','')
            valid=isinstance(text,str) and len(text)<=3000 and isinstance(drawing,list) and len(drawing)<=500 and paper in ('cream','rose','sage','blue') and isinstance(nonce,str) and 8<=len(nonce)<=80
            note_format=data.get('format',1); text_size=data.get('text_size',40)
            valid=valid and type(note_format) is int and note_format in (1,2,3) and type(text_size) is int and text_size in (32,40,52)
            if note_format==3:
                valid=valid and len(text.split())<=200 and not drawing and bool(text.strip())
            if valid:
                for stroke in drawing:
                    if not isinstance(stroke,dict) or stroke.get('color') not in ('#594739','#a65f4c','#66745a','#bc8b3d','#728b98','erase') or type(stroke.get('width')) is not int or not 1<=stroke['width']<=28 or stroke.get('tool','ink') not in ('pencil','ink','marker','erase') or not isinstance(stroke.get('points'),list) or not 1<=len(stroke['points'])<=4000: valid=False; break
                    for point in stroke['points']:
                        if not isinstance(point,list) or len(point) not in (2,3) or not all(type(v) in (int,float) and 0<=v<=1000 for v in point[:2]) or (len(point)==3 and (type(point[2]) not in (int,float) or not 0<=point[2]<=1)): valid=False; break
            if not valid or (not text.strip() and not drawing): return self.send(400,{'error':'Add a little writing or a drawing.'})
            recipient='chat' if s['person']=='aryan' else 'aryan'
            with db() as c:
                previous=c.execute('SELECT * FROM notes WHERE nonce=?',(nonce,)).fetchone()
                if previous and previous['author']!=s['person']: return self.send(409,{'error':'This draft belongs to the other person.'})
                if previous and (previous['text']!=text.strip() or json.loads(previous['drawing'])!=drawing or previous['paper']!=paper or previous['format']!=note_format or previous['text_size']!=text_size):
                    earlier=dict(previous); earlier['drawing']=json.loads(earlier['drawing'])
                    return self.send(409,{'code':'draft_changed','note':earlier,'error':'The earlier version was already saved. Your changes are kept here; stick again to save them as a new note.'})
                c.execute('INSERT OR IGNORE INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size) VALUES(?,?,?,?,?,?,?,?,?)',(nonce,s['person'],recipient,text.strip(),json.dumps(drawing),paper,time.time(),note_format,text_size))
                saved=dict(c.execute('SELECT * FROM notes WHERE nonce=?',(nonce,)).fetchone())
                saved['drawing']=json.loads(saved['drawing'])
            return self.send(201,{'ok':True,'note':saved})
        self.send(404,{'error':'Not found.'})
class Handler(Routes, BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(20)

class WSGIRequest(Routes):
    def __init__(self,environ):
        self.path=environ.get('PATH_INFO','/')+('?' + environ['QUERY_STRING'] if environ.get('QUERY_STRING') else '')
        self.client_address=(environ.get('REMOTE_ADDR','127.0.0.1'),0)
        self.headers=Message()
        for key,value in environ.items():
            if key.startswith('HTTP_'): self.headers[key[5:].replace('_','-')]=value
        self.headers['Content-Length']=environ.get('CONTENT_LENGTH') or '0'
        self.rfile=environ['wsgi.input']; self.wfile=io.BytesIO(); self.response_headers=[]; self.status=200
    def send_response(self,status): self.status=status
    def send_header(self,key,value): self.response_headers.append((key,str(value)))
    def end_headers(self): pass

def application(environ,start_response):
    request=WSGIRequest(environ)
    try:
        method=environ.get('REQUEST_METHOD','GET')
        if method=='GET': request.do_GET()
        elif method=='POST': request.do_POST()
        else: request.send(405,{'error':'Method not allowed.'})
    except (sqlite3.Error,OSError):
        request.wfile=io.BytesIO();request.response_headers=[]
        request.send(503,{'error':'Storage is temporarily unavailable. Your draft is kept; try again.'})
    start_response(f'{request.status} {HTTPStatus(request.status).phrase}',request.response_headers)
    return [request.wfile.getvalue()]

if __name__=='__main__':
    host=os.environ.get('DUET_HOST','127.0.0.1'); port=int(os.environ.get('PORT','8000'))
    print(f'Project Duet: http://{host}:{port}',flush=True)
    try: ThreadingHTTPServer((host,port),Handler).serve_forever()
    except KeyboardInterrupt: pass
