"""Chunked vector persistence and shared Kolkata day boundaries."""
import json, time, math, re
COLORS={'#594739','#a65f4c','#66745a','#bc8b3d','#728b98','erase'}

def streaks(rows,now):
    today=int((now+19800)//86400);result={}
    for person in ('aryan','chat'):
        days={int(row['day']) for row in rows if row['author']==person}
        completed=today in days;day=today if completed else today-1;count=0
        while day in days: count+=1;day-=1
        result[person]={'count':count,'today':completed}
    return {'now':now*1000,'timezone':'Asia/Kolkata','day':today,'streaks':result,'lastDays':{p:max((int(r['day']) for r in rows if r['author']==p),default=None) for p in ('aryan','chat')}}

def packed_valid(items):
    if not isinstance(items,list) or not 1<=len(items)<=40:return False
    for s in items:
        if not isinstance(s,dict) or s.get('tool') not in ('pencil','ink','marker','erase') or s.get('color') not in COLORS or type(s.get('width')) is not int or not 1<=s['width']<=28:return False
        stride=s.get('stride');pts=s.get('points')
        if type(stride) is not int or stride not in (2,3) or not isinstance(pts,list) or not stride<=len(pts)<=4000*stride or len(pts)%stride:return False
        for i,v in enumerate(pts):
            if stride==3 and i%3==2 and v is None:continue
            limit=1 if stride==3 and i%3==2 else 1000
            if type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=limit:return False
    return True

def post_upload(path,data,person,db):
    if not person:return 403,{'error':'Choose your name first.'}
    if data.get('author')!=person:return 409,{'error':'Your identity changed. Close this draft and choose your name again.'}
    upload=data.get('upload','')
    if not isinstance(upload,str) or not re.fullmatch('[a-f0-9]{64}',upload):return 400,{'error':'Invalid drawing upload.'}
    with db() as c:
        row=c.execute('SELECT * FROM uploads WHERE id=?',(upload,)).fetchone()
        if path=='/api/uploads':
            nonce=data.get('nonce');paper=data.get('paper');size=data.get('text_size');total=data.get('total')
            if not isinstance(nonce,str) or not 8<=len(nonce)<=80 or paper not in ('cream','rose','sage','blue') or size not in (32,40,52) or type(total) is not int or not 1<=total<=500:return 400,{'error':'Invalid drawing upload.'}
            if row and (row['author'],row['nonce'],row['paper'],row['text_size'],row['total'])!=(person,nonce,paper,size,total):return 409,{'error':'This upload differs from the saved draft.'}
            stale="SELECT u.id FROM uploads u WHERE u.author=? AND u.created<? AND NOT EXISTS(SELECT 1 FROM notes n WHERE n.format=4 AND json_extract(n.drawing,'$.upload')=u.id)"
            c.execute('DELETE FROM drawing_chunks WHERE upload IN ('+stale+')',(person,time.time()-7*86400))
            c.execute('DELETE FROM uploads WHERE id IN ('+stale+')',(person,time.time()-7*86400))
            c.execute('INSERT OR IGNORE INTO uploads VALUES(?,?,?,?,?,?,?)',(upload,person,nonce,paper,size,total,time.time()))
            return 200,{'ok':True}
        if not row or row['author']!=person:return 404,{'error':'Drawing upload not found.'}
        if path=='/api/uploads/chunk':
            part=data.get('part');drawing=data.get('drawing')
            if type(part) is not int or not 0<=part<row['total'] or not packed_valid(drawing):return 400,{'error':'Invalid drawing segment.'}
            packed=json.dumps(drawing,separators=(',',':'))
            if len(packed)>180000:return 413,{'error':'Drawing segment is too large.'}
            previous=c.execute('SELECT data FROM drawing_chunks WHERE upload=? AND part=?',(upload,part)).fetchone()
            if previous and previous['data']!=packed:return 409,{'error':'Drawing segment changed. Your draft is kept.'}
            c.execute('INSERT OR IGNORE INTO drawing_chunks VALUES(?,?,?,?)',(upload,part,packed,len(drawing)))
            return 200,{'ok':True}
        if path!='/api/uploads/commit':return 404,{'error':'Not found.'}
        counts=c.execute('SELECT count(*) n, sum(strokes) strokes FROM drawing_chunks WHERE upload=?',(upload,)).fetchone()
        if counts['n']!=row['total'] or not 1<=counts['strokes']<=500:return 400,{'error':'Drawing is incomplete. Try saving again; your draft is kept.'}
        manifest={'upload':upload,'chunks':row['total']};previous=c.execute('SELECT * FROM notes WHERE nonce=?',(row['nonce'],)).fetchone()
        if previous and previous['author']!=person:return 409,{'error':'This draft belongs to the other person.'}
        if previous and (previous['format']!=4 or json.loads(previous['drawing'])!=manifest):
            old=dict(previous);old['drawing']=json.loads(old['drawing']);return 409,{'code':'draft_changed','note':old,'error':'The earlier version was saved. Stick again to save these changes as a new note.'}
        c.execute('INSERT OR IGNORE INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size) VALUES(?,?,?,?,?,?,?,?,?)',(row['nonce'],person,'chat' if person=='aryan' else 'aryan','',json.dumps(manifest),row['paper'],time.time(),4,row['text_size']))
        saved=dict(c.execute('SELECT * FROM notes WHERE nonce=?',(row['nonce'],)).fetchone());saved['drawing']=json.loads(saved['drawing'])
        if saved['format']!=4 or saved['drawing']!=manifest:return 409,{'code':'draft_changed','note':saved,'error':'The earlier version was saved. Stick again to save these changes as a new note.'}
        return 201,{'ok':True,'note':saved}
