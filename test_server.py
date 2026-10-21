"""Integration tests against an isolated, temporary SQLite database."""
import unittest, tempfile, subprocess, os, sys, time, json, urllib.request, urllib.error, http.cookiejar, socket, sqlite3
from pathlib import Path
class DuetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        # Start with the first release's schema to verify the in-place upgrade.
        with sqlite3.connect(Path(cls.tmp.name)/'duet.sqlite3') as c:
            c.execute('CREATE TABLE notes(id INTEGER PRIMARY KEY AUTOINCREMENT, nonce TEXT UNIQUE, author TEXT, recipient TEXT, text TEXT, drawing TEXT, paper TEXT, created REAL)')
            c.execute('INSERT INTO notes(nonce,author,recipient,text,drawing,paper,created) VALUES(?,?,?,?,?,?,?)',('migration-fixture','aryan','chat','An existing note','[]','cream',1))
        c.close()
        with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        cls.url=f'http://127.0.0.1:{port}'
        cls.proc=subprocess.Popen(([sys.executable,'-m','gunicorn','--bind',f'127.0.0.1:{port}','--workers','1','--threads','4','server:application'] if os.environ.get('DUET_TEST_WSGI') else [sys.executable,str(Path(__file__).with_name('server.py'))]),env={**os.environ,'PORT':str(port),'DUET_DATA':cls.tmp.name,'DUET_PASSPHRASE':'test-phrase'},stdout=subprocess.DEVNULL)
        for _ in range(50):
            try: urllib.request.urlopen(cls.url); break
            except OSError: time.sleep(.05)
    @classmethod
    def tearDownClass(cls): cls.proc.terminate(); cls.proc.wait(); cls.tmp.cleanup()
    def client(self): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self,c,path,data=None,headers=None):
        r=urllib.request.Request(self.url+path,data=json.dumps(data).encode() if data is not None else None,headers=headers or {'Content-Type':'application/json'})
        try:
            with c.open(r) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as e:
            with e: return e.code,json.load(e)
    def login(self,person):
        c=self.client();self.assertEqual(self.request(c,'/api/unlock',{'passphrase':'test-phrase'})[0],200);self.assertEqual(self.request(c,'/api/person',{'person':person})[0],200);return c
    def test_authentication_and_origin(self):
        c=self.client();self.assertEqual(self.request(c,'/api/notes')[0],401)
        self.assertEqual(self.request(c,'/api/unlock',{'passphrase':'wrong'})[0],401)
        self.assertEqual(self.request(c,'/api/unlock',{'passphrase':'test-phrase'},{'Origin':'https://wrong.example'})[0],403)
        c=self.login('aryan');self.assertEqual(self.request(c,'/api/logout',{})[0],200);self.assertEqual(self.request(c,'/api/notes')[0],401)
    def test_shared_storage_routing_and_retry(self):
        a=self.login('aryan');b=self.login('chat')
        note={'nonce':'unique-test-note','recipient':'aryan','text':'hello <script>','paper':'sage','drawing':[{'color':'#594739','width':4,'points':[[10,20],[30,40]]}]}
        self.assertEqual(self.request(a,'/api/notes',note)[0],201);self.assertEqual(self.request(a,'/api/notes',note)[0],201)
        rows=self.request(b,'/api/notes')[1]['notes']; matching=[n for n in rows if n['nonce']==note['nonce']]
        self.assertEqual(len(matching),1);self.assertEqual(matching[0]['recipient'],'chat');self.assertEqual(matching[0]['drawing'],note['drawing'])
        note.update(nonce='unique-chat-note',text='hi back');self.assertEqual(self.request(b,'/api/notes',note)[0],201)
        self.assertEqual(self.request(a,'/api/notes')[1]['notes'][0]['recipient'],'aryan')
    def test_invalid_drawing_and_pagination(self):
        a=self.login('aryan');note={'nonce':'invalid-note','text':'','drawing':[{'color':'evil','width':4,'points':[]}], 'paper':'cream'}
        self.assertEqual(self.request(a,'/api/notes',note)[0],400)
        self.assertEqual(self.request(a,'/api/notes?before=bad')[0],400)
        self.assertEqual(self.request(a,'/api/notes?before=1')[1]['notes'],[])
    def test_new_brush_format_and_confirmed_save(self):
        a=self.login('aryan');b=self.login('chat')
        note={'nonce':'v2-pressure-brush','text':'A sketch','paper':'blue','format':2,'text_size':52,
              'drawing':[{'tool':'ink','color':'#728b98','width':17,'points':[[20,20,.2],[40,60,.9]]},
                         {'tool':'marker','color':'#bc8b3d','width':28,'points':[[80,80],[160,90]]}]}
        status,result=self.request(a,'/api/notes',note)
        self.assertEqual(status,201);self.assertGreater(result['note']['id'],0)
        self.assertEqual(result['note']['drawing'],note['drawing']);self.assertEqual(result['note']['text_size'],52)
        self.assertEqual(self.request(a,'/api/notes',note)[1]['note']['id'],result['note']['id'])
        changed={**note,'text':'changed after an uncertain retry'}
        self.assertEqual(self.request(a,'/api/notes',changed)[0],409)
        self.assertEqual(self.request(b,'/api/notes',note)[0],409)
        for value in (-1,29,1.5,'4'):
            bad={**note,'nonce':'invalid-width-'+str(value),'drawing':[{'tool':'pencil','color':'#594739','width':value,'points':[[10,10]]}]}
            self.assertEqual(self.request(a,'/api/notes',bad)[0],400)
        bad={**note,'nonce':'invalid-pressure','drawing':[{'tool':'ink','color':'#594739','width':4,'points':[[10,10,2]]}]}
        self.assertEqual(self.request(a,'/api/notes',bad)[0],400)
    def test_sqlite_persistence_and_legacy_format(self):
        import sqlite3
        a=self.login('chat');note={'nonce':'persistent-legacy-note','text':'Legacy note','paper':'cream','drawing':[]}
        result=self.request(a,'/api/notes',note)[1]['note']
        with sqlite3.connect(Path(self.tmp.name)/'duet.sqlite3') as connection:
            row=connection.execute('SELECT text,format FROM notes WHERE id=?',(result['id'],)).fetchone()
        connection.close()
        self.assertEqual(row,('Legacy note',1))
        with sqlite3.connect(Path(self.tmp.name)/'duet.sqlite3') as connection:
            migrated=connection.execute('SELECT text,format,text_size FROM notes WHERE nonce=?',('migration-fixture',)).fetchone()
        connection.close()
        self.assertEqual(migrated,('An existing note',1,40))
        self.assertEqual(self.request(a,'/api/notes?before=999999999999999999999999')[0],400)
    def test_note_word_limit_and_separate_format(self):
        client=self.login('aryan')
        note={'nonce':'note-mode-test','format':3,'text_size':40,'text':'word '*200,'paper':'cream','drawing':[]}
        status,result=self.request(client,'/api/notes',note)
        self.assertEqual(status,201);self.assertEqual(result['note']['format'],3)
        self.assertEqual(result['note']['drawing'],[])
        self.assertEqual(self.request(client,'/api/notes',{**note,'nonce':'too-many-words','text':'word '*201})[0],400)
        self.assertEqual(self.request(client,'/api/notes',{**note,'nonce':'too-many-letters','text':'x'*3001})[0],400)
        self.assertEqual(self.request(client,'/api/notes',{**note,'nonce':'empty-note-mode','text':'  '})[0],400)
        self.assertEqual(self.request(client,'/api/notes',{**note,'nonce':'mixed-note-mode','drawing':[{'color':'#594739','width':4,'points':[[2,2]]}]})[0],400)
    def test_incremental_catchup_and_identity_conflict(self):
        a=self.login('aryan')
        latest=self.request(a,'/api/notes')[1]['notes']
        cursor=max([n['id'] for n in latest],default=0)
        expected=[]
        for i in range(45):
            status,result=self.request(a,'/api/notes',{'nonce':f'catchup-{i}','author':'aryan','format':3,'text':f'Catchup {i}','drawing':[],'paper':'cream'})
            self.assertEqual(status,201);expected.append(result['note']['id'])
        first=self.request(a,f'/api/notes?after={cursor}')[1]
        self.assertTrue(first['more']);self.assertEqual(len(first['notes']),40)
        second=self.request(a,f"/api/notes?after={first['notes'][-1]['id']}")[1]
        self.assertFalse(second['more'])
        self.assertEqual([n['id'] for n in first['notes']+second['notes']],expected)
        self.assertEqual(self.request(a,f'/api/notes?after={expected[-1]}')[1]['notes'],[])
        self.request(a,'/api/person',{'person':'chat'})
        self.assertEqual(self.request(a,'/api/notes',{'nonce':'changed-identity','author':'aryan','text':'Keep my draft','drawing':[],'paper':'cream'})[0],409)
    def test_backup_and_restore(self):
        from backup import snapshot, restore, verify
        with tempfile.TemporaryDirectory() as folder:
            source=Path(self.tmp.name)/'duet.sqlite3'
            saved=snapshot(source,Path(folder)/'snapshots')
            count=verify(saved)
            self.assertGreater(count,0)
            target=Path(folder)/'restored.sqlite3'
            self.assertEqual(restore(saved,target),count)
            self.assertEqual(verify(target),count)
            self.assertEqual(restore(saved,target),count)
            self.assertTrue(list(Path(folder).glob('*.before-restore-*')))
    def test_expired_session(self):
        client=self.login('aryan')
        with sqlite3.connect(Path(self.tmp.name)/'duet.sqlite3') as c: c.execute('UPDATE sessions SET expires=0')
        c.close()
        self.assertEqual(self.request(client,'/api/notes')[0],401)
    def test_chunked_drawing_recovery_and_publication(self):
        a=self.login('aryan');b=self.login('chat');upload='a'*64
        parts=[[{'tool':'ink','color':'#594739','width':17,'stride':3,'points':[v for i in range(4000) for v in (i%1000,(i*3)%720,.5)]}]*2 for _ in range(9)]
        self.assertGreater(len(json.dumps(parts)),600000)
        meta={'upload':upload,'author':'aryan','nonce':'large-chunked-test','paper':'sage','text_size':40,'total':len(parts)}
        self.assertEqual(self.request(a,'/api/uploads',meta)[0],200)
        self.assertEqual(self.request(a,'/api/uploads/commit',{'upload':upload,'author':'aryan'})[0],400)
        for i,part in enumerate(parts):
            payload={'upload':upload,'author':'aryan','part':i,'drawing':part}
            self.assertEqual(self.request(a,'/api/uploads/chunk',payload)[0],200)
            self.assertEqual(self.request(a,'/api/uploads/chunk',payload)[0],200)
        self.assertEqual(self.request(b,'/api/drawing/'+upload+'/0')[0],404)
        changed={'upload':upload,'author':'aryan','part':0,'drawing':[dict(parts[0][0],width=18)]}
        self.assertEqual(self.request(a,'/api/uploads/chunk',changed)[0],409)
        self.assertEqual(self.request(b,'/api/uploads/commit',{'upload':upload,'author':'chat'})[0],404)
        status,result=self.request(a,'/api/uploads/commit',{'upload':upload,'author':'aryan'})
        self.assertEqual(status,201);self.assertEqual(result['note']['format'],4)
        self.assertEqual(self.request(a,'/api/uploads/commit',{'upload':upload,'author':'aryan'})[1]['note']['id'],result['note']['id'])
        for i,part in enumerate(parts):self.assertEqual(self.request(b,f'/api/drawing/{upload}/{i}')[1]['drawing'],part)
        state=self.request(a,'/api/state')[1];self.assertTrue(state['streaks']['aryan']['today']);self.assertGreater(state['streaks']['aryan']['count'],0)
        from worker.export_notes import main as export_notes
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'import.sql';export_notes(Path(self.tmp.name)/'duet.sqlite3',out)
            with sqlite3.connect(Path(folder)/'imported.sqlite3') as c:
                for migration in sorted(Path('worker/migrations').glob('*.sql')):c.executescript(migration.read_text())
                c.executescript(out.read_text());self.assertEqual(c.execute('SELECT count(*) FROM drawing_chunks WHERE upload=?',(upload,)).fetchone()[0],len(parts))
            c.close()

    def test_shared_time_and_streak_boundaries(self):
        from drawing_api import streaks
        now=100*86400-19800
        rows=[{'author':'aryan','day':d} for d in (97,98,99)]
        self.assertEqual(streaks(rows,now)['streaks']['aryan'],{'count':3,'today':False})
        self.assertEqual(streaks(rows,now+86400)['streaks']['aryan']['count'],0)
        rows += [{'author':'aryan','day':100}]*2
        self.assertEqual(streaks(rows,now)['streaks']['aryan'],{'count':4,'today':True})
        self.assertEqual(streaks(rows,now-1)['day'],99)
        self.assertEqual(self.request(self.client(),'/api/time')[1]['timezone'],'Asia/Kolkata')
    def test_private_files_not_served(self):
        c=self.client();self.assertEqual(self.request(c,'/config.json')[0],404);self.assertEqual(self.request(c,'/server.py')[0],404);self.assertEqual(self.request(c,'/../server.py')[0],404)
if __name__=='__main__': unittest.main()
