#!/usr/bin/env python3
"""Consistent SQLite snapshots; never copy a live database file directly."""
import argparse, os, sqlite3, time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

def verify(path):
    with closing(sqlite3.connect(f'{Path(path).resolve().as_uri()}?mode=ro',uri=True)) as c:
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('Backup integrity check failed')
        columns={r[1] for r in c.execute('PRAGMA table_info(notes)')}
        if not {'id','text','drawing','recipient'}.issubset(columns): raise ValueError('Not a Project Duet database')
        return c.execute('SELECT count(*) FROM notes').fetchone()[0]

def snapshot(source,directory,keep=30):
    source=Path(source);directory=Path(directory)
    if not source.is_file(): raise FileNotFoundError('Database has not been created yet')
    directory.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path=directory/f'duet-{stamp}.sqlite3';temp=path.with_suffix('.partial')
    try:
        with closing(sqlite3.connect(source)) as src,closing(sqlite3.connect(temp)) as dst:
            src.backup(dst);dst.execute("PRAGMA journal_mode=DELETE")
        count=verify(temp);os.chmod(temp,0o600);os.replace(temp,path)
        for old in sorted(directory.glob('duet-*.sqlite3'),reverse=True)[max(1,keep):]: old.unlink()
        print(f'Backup verified: {path.name}, {count} notes',flush=True)
        return path
    finally:
        if temp.exists(): temp.unlink()

def restore(backup,target):
    count=verify(backup);target=Path(target)
    if Path(str(target)+'-wal').exists() or Path(str(target)+'-shm').exists(): raise RuntimeError('Stop every server process before restoring; SQLite sidecar files are still present.')
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix('.restoring')
    with closing(sqlite3.connect(f'{Path(backup).resolve().as_uri()}?mode=ro',uri=True)) as src,closing(sqlite3.connect(temp)) as dst:
        src.backup(dst);dst.execute("PRAGMA journal_mode=DELETE")
    verify(temp)
    if target.exists(): target.rename(target.with_name(target.name+'.before-restore-'+str(time.time_ns())))
    os.replace(temp,target);os.chmod(target,0o600)
    return count

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',default=os.environ.get('DUET_DATA','data')+'/duet.sqlite3');parser.add_argument('--directory',default='backups');parser.add_argument('--keep',type=int,default=30);parser.add_argument('--loop',action='store_true');parser.add_argument('--restore');parser.add_argument('--server-stopped',action='store_true');args=parser.parse_args()
    if args.restore:
        if not args.server_stopped: parser.error('Stop the server, then supply --server-stopped to confirm it is offline.')
        print(f'Restored {restore(args.restore,args.source)} notes');return
    while True:
        delay=86400
        try: snapshot(args.source,args.directory,args.keep)
        except Exception as error:
            print(f'Backup failed: {error}',flush=True)
            if not args.loop: raise
            delay=60
        if not args.loop: break
        time.sleep(delay)
if __name__=='__main__': main()
