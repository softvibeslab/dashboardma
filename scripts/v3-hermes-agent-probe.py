"""Synthetic-only proof of native Hermes + sealed tool dispatch, not a live broker.
No client data, gateway changes, profile mutation, credential copying, or deployment.
--real permits at most two fixed-provider requests for the synthetic fixture.
"""
import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time

RUNTIME=Path('/usr/local/lib/hermes-agent')
ROOT=Path(__file__).resolve().parents[1]
MODEL='gpt-6.1-sol'
HERMES_COMMIT='ae2a81ccc00e9b7c06301523e5bb09608397149c'
SOURCE={'id':'fixture-alpha-guide','org':'synthetic','project':'alpha','kind':'repository','ref':'fixture-v1','text':'The synthetic Alpha release must pass human review before publishing. This fixture contains no client data.'}
SOURCE['contentHash']=hashlib.sha256(SOURCE['text'].encode()).hexdigest()
PROMPT='Synthetic fixture only. Call authorized_context, then return JSON with answer and citations (source ID, project, ref). What is required before publishing Alpha? Explicitly state coverage is limited to indexed authorized excerpts.'

def snapshot(target):
    # Only tracked runtime Python and non-operational package resources; no .env,
    # memories, graph indexes, AGENTS, profiles, secrets, caches or repository metadata.
    names=subprocess.check_output(['git','-C',str(RUNTIME),'ls-tree','-r','--name-only','-z',HERMES_COMMIT]).decode().split('\0')
    packages={'agent','tools','hermes_cli','utils','hermes_agent','hermes_platform','providers','gateway','pm','plugins','cron','locales'}
    import io
    import tarfile
    selected=[]
    for name in names:
        p=Path(name)
        if not name or p.suffix not in {'.py','.json','.yaml','.txt','.jinja2'}: continue
        if len(p.parts)>1 and p.parts[0] not in packages: continue
        if any(part.startswith('.') or part in {'tests','fixtures'} for part in p.parts): continue
        selected.append(name)
    archive=subprocess.check_output(['git','-C',str(RUNTIME),'archive',HERMES_COMMIT,'--',*selected])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar:
            if not member.isfile(): continue
            dst=target/member.name;dst.parent.mkdir(parents=True,exist_ok=True)
            with tar.extractfile(member) as src, dst.open('wb') as out:
                shutil.copyfileobj(src,out)

def provider_credential():
    auth=json.loads(Path('/root/.hermes/auth.json').read_text())
    token=auth['providers']['openai-codex']['tokens']['access_token']
    claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'='*(-len(token.split('.')[1])%4)))
    if claims.get('exp',0)<time.time()+90: raise ValueError('credential-expired')
    return token,claims.get('https://api.openai.com/auth',{}).get('chatgpt_account_id')

def credential_ready():
    try:
        provider_credential()
        return True
    except Exception:
        return False

def provider(body,timeout: float=35):
    deadline=time.monotonic()+timeout
    if body.get('model')!=MODEL: raise ValueError('model-denied')
    if [t.get('function',{}).get('name') for t in body.get('tools',[])]!=['authorized_context']: raise ValueError('schema-denied')
    inputs=[]
    instructions=[]
    for msg in body['messages']:
        role=msg['role']
        if role in ('system','developer'): instructions.append(msg['content']); continue
        if role=='tool':
            inputs.append({'type':'function_call_output','call_id':msg['tool_call_id'],'output':msg['content']}); continue
        if msg.get('content'): inputs.append({'role':role,'content':msg['content']})
        for tc in msg.get('tool_calls',[]):
            inputs.append({'type':'function_call','call_id':tc['id'],'name':tc['function']['name'],'arguments':tc['function']['arguments']})
    # No user-controlled URL, tools, model, credentials, headers, method or endpoint.
    if len(json.dumps(body).encode())>120000: raise ValueError('provider-input-limit')
    context_tool={'type':'function','name':'authorized_context','description':'Retrieve only server-authorized project and common Ecosystem excerpts.','parameters':{'type':'object','properties':{},'required':[],'additionalProperties':False}}
    request={'model':MODEL,'instructions':'\n'.join(instructions),'input':inputs,'tools':[context_tool],'store':False,'stream':True,'reasoning':{'effort':'low'},'max_output_tokens':1400}
    token,account=provider_credential()
    headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'text/event-stream','originator':'hermes-agent','User-Agent':'DashboardMA-SyntheticHermesProbe/1.0'}
    if account: headers['ChatGPT-Account-ID']=account
    conn=http.client.HTTPSConnection('chatgpt.com',timeout=timeout)
    try:
        conn.request('POST','/backend-api/codex/responses',body=json.dumps(request).encode(),headers=headers)
        response=conn.getresponse()
        if response.status!=200: raise ValueError('provider-status-'+str(response.status))
        total=0
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0: raise ValueError('provider-deadline')
            if conn.sock is not None: conn.sock.settimeout(remaining)
            line=response.readline(65537);total+=len(line)
            if not line or len(line)>65536 or total>262144: raise ValueError('provider-stream-limit')
            if not line.startswith(b'data: '): continue
            data=json.loads(line[6:])
            if data.get('type') in ('error','response.failed','response.incomplete'): raise ValueError('provider-failed')
            if data.get('type')=='response.completed':
                final=data['response']; break
    finally: conn.close()
    text=[];calls=[]
    for item in final.get('output',[]):
        if item.get('type')=='function_call':
            calls.append({'id':item['call_id'],'type':'function','function':{'name':item['name'],'arguments':item['arguments']}})
        if item.get('type')=='message':
            text.extend(c['text'] for c in item.get('content',[]) if c.get('type')=='output_text')
    usage=final.get('usage',{})
    if final.get('status')!='completed' or not isinstance(usage.get('output_tokens'),int) or usage['output_tokens']>1400 or len(''.join(text).encode())>32000:
        raise ValueError('provider-incomplete-or-output-limit')
    return completion(''.join(text),calls,response_id=final['id'],created=final.get('created_at',0)),{k:usage[k] for k in ('input_tokens','output_tokens','total_tokens') if k in usage}

def completion(text='',calls=None,response_id='fixture-completion',created=0):
    message={'role':'assistant','content':text or None}
    if calls: message['tool_calls']=calls
    return {'id':response_id,'object':'chat.completion','created':created,'model':MODEL,'choices':[{'index':0,'message':message,'finish_reason':'tool_calls' if calls else 'stop'}]}

def run(audit=False,real=False,payload=None,fixture_reply=None,attack=False):
    scratch=Path(os.environ.get('TMPDIR','/root/.hermes/cache/scratch'));scratch.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='v3-native-hermes-',dir=scratch) as directory:
        directory=Path(directory);code=directory/'runtime';code.mkdir();snapshot(code)
        args=['/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--ro-bind','/usr','/usr','--tmpfs','/usr/local','--ro-bind','/usr/local/share/uv/python','/usr/local/share/uv/python','--ro-bind',str(RUNTIME/'venv'),'/venv','--ro-bind',str(code),'/runtime','--ro-bind',str(ROOT/'scripts/v3-hermes-agent-worker.py'),'/worker.py','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/empty','--dir','/home/agent','--clearenv']
        for k,v in {'HOME':'/home/agent','HERMES_HOME':'/home/agent/hermes','PATH':'/venv/bin:/usr/bin:/bin','LANG':'C.UTF-8','HERMES_SAFE_MODE':'1','HERMES_IGNORE_USER_CONFIG':'1','HERMES_IGNORE_RULES':'1','PYTHONDONTWRITEBYTECODE':'1','TERMINAL_CWD':'/empty','TMPDIR':'/tmp'}.items(): args+=['--setenv',k,v]
        args+=['--chdir','/empty','--','/venv/bin/python','-I','/worker.py']
        with (directory/'worker.log').open('w+') as err:
            p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True)
            usage=[];calls=0;deadline=time.monotonic()+40
            assert p.stdin is not None and p.stdout is not None
            wire=json.dumps({'audit':audit,**(payload or {'sources':[SOURCE],'prompt':PROMPT})},ensure_ascii=False)+'\n'
            if len(wire.encode())>120000:
                p.kill();p.wait();p.stdin.close();p.stdout.close()
                raise ValueError('worker-input-limit')
            try:
                p.stdin.write(wire);p.stdin.flush()
                while True:
                    remaining=deadline-time.monotonic()
                    if remaining<=0 or not select.select([p.stdout],[],[],remaining)[0]:
                        err.seek(0)
                        raise ValueError('worker-timeout: '+err.read()[-5000:])
                    line=p.stdout.readline(262145)
                    if not line:
                        err.seek(0); diagnostic=err.read()[-8000:]
                        raise ValueError('worker-exit: '+diagnostic)
                    if len(line)>262144: raise ValueError('worker-output-limit')
                    event=json.loads(line)
                    if event['type']=='result':
                        p.stdin.close();p.wait(timeout=5)
                        event.pop('type');event.update({'model':MODEL,'modelMode':'real-provider' if real else 'deterministic-fixture','inferenceRequests':calls,'providerRequests':calls if real else 0,'usage':usage,'hermesCommit':HERMES_COMMIT})
                        return event
                    if event['type']!='inference' or calls>=2: raise ValueError('inference-budget')
                    calls+=1
                    if real:
                        answer,stats=provider(event['body'],timeout=min(35,max(1,deadline-time.monotonic())));usage.append(stats)
                    elif calls==1:
                        answer=completion(calls=[{'id':'call-fixture-context','type':'function','function':{'name':'terminal' if attack else 'authorized_context','arguments':'{}'}}])
                    else:
                        answer=completion(json.dumps(fixture_reply or {'answer':'Human review is required. Coverage limited to authorized excerpts.','citations':[{'id':SOURCE['id'],'project':'alpha','ref':'fixture-v1'}]}))
                    p.stdin.write(json.dumps(answer)+'\n');p.stdin.flush()
            finally:
                if p.poll() is None: p.kill();p.wait()
                if not p.stdin.closed: p.stdin.close()
                p.stdout.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--audit',action='store_true');parser.add_argument('--real',action='store_true');args=parser.parse_args()
    print(json.dumps(run(audit=args.audit,real=args.real),ensure_ascii=False,indent=2))
