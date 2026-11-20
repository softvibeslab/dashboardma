"""Dedicated Unix-socket mediator. Not started by import and never uses a Hermes gateway.
Operator owns this service and its manifest/key/state; the web app has no provider credentials.
"""
import argparse
import hashlib
import hmac
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import socketserver
import sqlite3
import threading
import time
import fcntl
import signal
import socket
import stat

spec=importlib.util.spec_from_file_location('native_probe',Path(__file__).with_name('v3-hermes-agent-probe.py'))
assert spec is not None and spec.loader is not None
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def binding_set_hash(bindings):
    keys=('actor','org','project','caseId','sourceHash')
    rows=sorted(json.dumps([b[k] for k in keys],ensure_ascii=False,separators=(',',':')).encode('utf-8') for b in bindings)
    return hashlib.sha256(b'['+b','.join(rows)+b']').hexdigest()

def scope_valid(value):
    return isinstance(value,dict) and set(value)=={'actor','org','project','caseId'} and all(isinstance(x,str) and 0<len(x.strip()) and len(x)<=200 and not re.search(r'[\x00-\x1f\x7f]',x) for x in value.values())

class Broker:
    def __init__(self,directory,manifest,real=False):
        self.directory=Path(directory)
        self.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        if self.directory.stat().st_mode&0o077: raise ValueError('state-permissions')
        def grant_valid(grant):
            return isinstance(grant,dict) and set(grant)=={'actor','org','project','caseId','sourceHash'} and scope_valid({k:grant[k] for k in ('actor','org','project','caseId')}) and isinstance(grant['sourceHash'],str) and re.fullmatch(r'[a-f0-9]{64}',grant['sourceHash'])
        if set(manifest)!={'grants','sources'} or not all(grant_valid(x) for x in manifest['grants']): raise ValueError('manifest-invalid')
        if len(manifest['sources'])>100: raise ValueError('manifest-limit')
        ids=set()
        for source in manifest['sources']:
            if set(source)!={'id','org','project','kind','ref','text'} or not all(isinstance(x,str) and x for x in source.values()) or source['kind'] not in ('repository','graphify','ecosystem') or len(source['text'])>8000 or source['id'] in ids: raise ValueError('source-invalid')
            valid_ref=re.fullmatch(r'[a-f0-9]{40}',source['ref']) or re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',source['ref']) or source['org']=='synthetic' and source['ref'].startswith('fixture-')
            if not valid_ref or re.search(r'-----BEGIN .*PRIVATE KEY|Bearer\s+[A-Za-z0-9_.-]{16,}|sk-[A-Za-z0-9_-]{20,}|(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*\S{8,}',source['text'],re.I): raise ValueError('source-sensitive-or-unversioned')
            ids.add(source['id'])
        self.manifest=json.loads(json.dumps(manifest));self.real=real;self.lock=threading.Lock()
        self.db=sqlite3.connect(str(self.directory/'agent.sqlite'),check_same_thread=False)
        os.chmod(self.directory/'agent.sqlite',0o600)
        self.db.executescript('CREATE TABLE IF NOT EXISTS jobs(scope TEXT,id TEXT,hash TEXT,status TEXT,result TEXT,at REAL,PRIMARY KEY(scope,id)); CREATE TABLE IF NOT EXISTS sessions(scope TEXT PRIMARY KEY,history TEXT,at REAL);')
        self.db.execute("UPDATE jobs SET status='interrupted-no-retry' WHERE status='running'");self.db.commit()
    def coverage(self):
        covered=0
        for grant in self.manifest['grants']:
            try:
                self.authorize({k:grant[k] for k in ('actor','org','project','caseId')},grant['sourceHash'])
                covered+=1
            except (PermissionError,ValueError): pass
        return {'sourceCount':len(self.manifest['sources']),'bindingCount':len(self.manifest['grants']),'coveredBindingCount':covered,'allProjectsIndexed':False}
    def context_ready(self):
        coverage=self.coverage()
        return coverage['bindingCount']>0 and coverage['coveredBindingCount']==coverage['bindingCount']
    def session_count(self):
        return self.db.execute('SELECT count(*) FROM sessions').fetchone()[0]
    def authorize(self,scope,source_hash):
        if not scope_valid(scope) or {**scope,'sourceHash':source_hash} not in self.manifest['grants']: raise PermissionError('scope-denied')
        sources=[{**s,'contentHash':hashlib.sha256(s['text'].encode()).hexdigest()} for s in self.manifest['sources'] if (s['org']==scope['org'] and s['project']==scope['project']) or (s['org']=='common' and s['project']=='ecosystem' and s['kind']=='ecosystem')]
        if not any(s['org']==scope['org'] and s['project']==scope['project'] for s in sources): raise PermissionError('project-not-indexed')
        if len(json.dumps(sources).encode())>24000: raise ValueError('context-limit')
        return sources
    def execute(self,request):
        if not isinstance(request,dict) or set(request)!={'executionId','scope','prompt','inputHash','sourceHash','purpose','contextKey','historyPolicy'}: raise ValueError('input-schema')
        sources=self.authorize(request['scope'],request['sourceHash'])
        if not isinstance(request['prompt'],str) or not request['prompt'] or len(request['prompt'].encode())>24000 or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}',request['executionId']) or not all(isinstance(request[k],str) and re.fullmatch('[a-f0-9]{64}',request[k]) for k in ('inputHash','sourceHash')): raise ValueError('input-invalid')
        if request['purpose'] not in ('summary','enrich','question') or request['historyPolicy']!=('none' if request['purpose']=='question' else 'scoped') or not isinstance(request['contextKey'],str) or not re.fullmatch(r'[a-f0-9]{64}',request['contextKey']): raise ValueError('input-invalid')
        if not self.lock.acquire(blocking=False): raise ValueError('broker-busy')
        try:
            key=digest([request['scope'],sources,request['sourceHash']]);fingerprint=digest(request)
            session_key=digest([key,request['purpose'],request['contextKey'],request['historyPolicy']])
            row=self.db.execute('SELECT hash,status,result FROM jobs WHERE scope=? AND id=?',(key,request['executionId'])).fetchone()
            if row:
                if row[0]!=fingerprint: raise ValueError('replay-conflict')
                if row[1]!='complete': raise ValueError('terminal-no-retry')
                return json.loads(row[2])
            # TTL/session cap, bounded durable job journal; never silently discard uncertain jobs.
            self.db.execute('DELETE FROM sessions WHERE at<?',(time.time()-86400,))
            if self.session_count()>=200 or self.db.execute('SELECT count(*) FROM jobs').fetchone()[0]>=2000: raise ValueError('capacity')
            history_row=self.db.execute('SELECT history FROM sessions WHERE scope=?',(session_key,)).fetchone()
            history=json.loads(history_row[0]) if history_row and request['historyPolicy']=='scoped' else []
            self.db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)',(key,request['executionId'],fingerprint,'running',None,time.time()));self.db.commit()
            try:
                result=native.run(real=self.real,payload={'sources':sources,'prompt':request['prompt'],'history':history})
                result.update({k:request[k] for k in ('executionId','inputHash','sourceHash')})
                result['sessionId']=session_key
                result.update({k:request[k] for k in ('purpose','contextKey','historyPolicy')})
                # Store only user/final text, never native raw trajectories or reasoning.
                history=(history+[{'role':'user','content':request['prompt']},{'role':'assistant','content':result['answer']}])[-8:]
                if len(json.dumps(history).encode())>48000: history=history[-2:]
                if request['historyPolicy']=='none': history=[]
                self.db.execute('INSERT OR REPLACE INTO sessions VALUES (?,?,?)',(session_key,json.dumps(history),time.time()))
                self.db.execute("UPDATE jobs SET status='complete',result=? WHERE scope=? AND id=?",(json.dumps(result),key,request['executionId']));self.db.commit()
                return result
            except Exception:
                self.db.execute("UPDATE jobs SET status='failed-no-retry' WHERE scope=? AND id=?",(key,request['executionId']));self.db.commit()
                raise ValueError('native-agent-failed') from None
        finally: self.lock.release()

class UnixServer(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):
    daemon_threads=True
    allow_reuse_address=False

def _serve_locked(directory,manifest,key_file,real=False,socket_directory=None):
    directory=Path(directory)
    for file in (Path(manifest),Path(key_file)):
        if file.is_symlink() or file.stat().st_mode&0o077: raise ValueError('operator-file-permissions')
    key=Path(key_file).read_text().strip()
    if len(key)<32: raise ValueError('key-invalid')
    broker=Broker(directory,json.loads(Path(manifest).read_text()),real=real)
    # Actual no-inference OS/dispatch probe, not a configuration claim.
    audit=native.run(audit=True)
    if not all(audit['isolation'].values()): raise ValueError('isolation-unavailable')
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+key): return self.reply(403,{'error':'broker-auth'})
            if self.path not in ('/health','/execute'): return self.reply(404,{'error':'broker-route'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=48000: raise ValueError('input-limit')
                self.connection.settimeout(5)
                request=json.loads(self.rfile.read(length))
                if self.path=='/health':
                    if request!={}: raise ValueError('input-schema')
                    return self.reply(200,{'ready':broker.context_ready() and (not real or native.credential_ready()),'bindingsHash':binding_set_hash(broker.manifest['grants']),'runtime':'hermes-native-sealed-v1','allowedTools':['authorized_context'],'model':native.MODEL,'modelMode':'real-provider' if real else 'deterministic-fixture','isolation':audit['isolation'],'hermesCommit':native.HERMES_COMMIT,'schemas':['onboarding.documentary.bounded.v2','onboarding.questions.bounded.v1'],'purposes':['summary','enrich','question'],'contextPolicy':{'questionHistory':'none','maxOriginalRefs':8},'coverage':broker.coverage()})
                result=broker.execute(request);return self.reply(200,result)
            except PermissionError: return self.reply(403,{'error':'scope-denied'})
            except Exception as exc:
                code=str(exc)
                safe={'input-schema','input-invalid','input-limit','broker-busy','replay-conflict','terminal-no-retry','capacity','native-agent-failed'}
                return self.reply(503,{'error':code if code in safe else 'broker-failed'})
        def reply(self,status,body):
            data=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    socket_root=Path(socket_directory) if socket_directory else directory
    shared=socket_root!=directory
    info=socket_root.lstat()
    if socket_root.is_symlink() or not socket_root.is_absolute() or not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=(0o710 if shared else 0o700): raise ValueError('socket-directory-permissions')
    socket_path=socket_root/'agent.sock'
    # The caller holds an exclusive private state lock. Never replace a live or non-socket target.
    if socket_path.exists() or socket_path.is_symlink():
        if not stat.S_ISSOCK(socket_path.lstat().st_mode): raise ValueError('socket-target-invalid')
        with socket.socket(socket.AF_UNIX) as probe:
            probe.settimeout(.2)
            try: probe.connect(str(socket_path))
            except ConnectionRefusedError: socket_path.unlink()
            else: raise ValueError('socket-owner-active')
    old_umask=os.umask(0o077)
    try:
        with UnixServer(str(socket_path),Handler) as server:
            if shared: os.chown(socket_path,-1,info.st_gid)
            os.chmod(socket_path,0o660 if shared else 0o600)
            try: server.serve_forever()
            finally: socket_path.unlink(missing_ok=True)
    finally: os.umask(old_umask)

def serve(directory,manifest,key_file,real=False,socket_directory=None):
    directory=Path(directory)
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    if not directory.is_absolute() or directory.is_symlink() or directory.stat().st_uid!=os.getuid() or stat.S_IMODE(directory.stat().st_mode)!=0o700: raise ValueError('state-permissions')
    with os.fdopen(os.open(directory/'supervisor.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600),'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        def stop(signum,frame): raise SystemExit(0)
        previous=signal.signal(signal.SIGTERM,stop) if threading.current_thread() is threading.main_thread() else None
        try: _serve_locked(directory,manifest,key_file,real,socket_directory)
        finally:
            if previous is not None: signal.signal(signal.SIGTERM,previous)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True);parser.add_argument('--socket-directory');parser.add_argument('--manifest',required=True);parser.add_argument('--key-file',required=True);parser.add_argument('--real',action='store_true');args=parser.parse_args()
    serve(args.directory,args.manifest,args.key_file,real=args.real,socket_directory=args.socket_directory)
