"""Stateless direct LLM protocol. NOT Hermes agent execution.
No Hermes imports, tool dispatch, plugins, hooks, subprocess or context loader.
"""
import json
import base64
import http.client
import time
from pathlib import Path

def credential(auth_path=Path('/root/.hermes/auth.json')):
    # Read existing singleton in the credential-owning HOST worker only.
    # No rotation, refresh, copying, pool fallback or profile mutations.
    with auth_path.open('rb') as handle:
        raw=handle.read(1048577)
    if len(raw)>1048576: raise ValueError('worker-auth-limit')
    token=json.loads(raw)['providers']['openai-codex']['tokens']['access_token']
    segment=token.split('.')[1]
    claims=json.loads(base64.urlsafe_b64decode(segment+'='*(-len(segment)%4)))
    if claims.get('exp',0)<time.time()+60: raise ValueError('worker-auth-expired')
    auth=claims.get('https://api.openai.com/auth',{})
    headers={}
    if auth.get('chatgpt_account_id'): headers['ChatGPT-Account-ID']=auth['chatgpt_account_id']
    residency=auth.get('chatgpt_data_residency') or auth.get('chatgpt_compute_residency')
    if residency: headers['x-openai-internal-codex-residency']=residency
    return token,headers

def infer(payload):
    body=build_request(payload)
    token,account_headers=credential()
    conn=http.client.HTTPSConnection('chatgpt.com',timeout=min(40,payload['policy']['timeoutMs']/1000))
    try:
        conn.request('POST','/backend-api/codex/responses',body=json.dumps(body,ensure_ascii=False).encode(),headers={
            'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'text/event-stream',
            'User-Agent':'DashboardMA-StatelessLLM/1.0','originator':'hermes-agent',**account_headers})
        response=conn.getresponse()
        if response.status!=200: raise ValueError('worker-upstream-status-'+str(response.status))
        size=0
        while True:
            line=response.readline(65537)
            size+=len(line)
            if len(line)>65536 or size>262144: raise ValueError('worker-stream-limit')
            if not line: raise ValueError('worker-stream-incomplete')
            if not line.startswith(b'data: '): continue
            data=json.loads(line[6:])
            if data.get('type') in ('error','response.failed','response.incomplete'): raise ValueError('worker-upstream-failed')
            if data.get('type')=='response.completed':
                final=data['response']
                return {'output':parse_final(final),'usage':final.get('usage',{})}
    finally:
        conn.close()

MODEL = 'gpt-6.1-sol'

def build_request(payload):
    if payload.get('model') != MODEL:
        raise ValueError('worker-model')
    body = {
        'model': MODEL, 'instructions': payload['policy']['instructions'],
        'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': json.dumps(payload['snapshot'], ensure_ascii=False)}]}],
        'tools': [], 'tool_choice': 'none', 'store': False, 'stream': True,
        'max_output_tokens': 2000, 'reasoning': {'effort': 'low'},
        'text': {'format': {'type': 'json_schema', 'name': 'onboarding_enrichment', 'strict': True, 'schema': {
            'type': 'object', 'additionalProperties': False,
            'properties': {'context': {'type': 'string'}, 'constraints': {'type': 'string'}, 'questions': {'type': 'array', 'items': {'type': 'string'}}},
            'required': ['context','constraints','questions'],
        }}},
    }
    # Conservative byte upper bound, not a claim of exact tokenizer accounting.
    if len(json.dumps(body, ensure_ascii=False).encode()) + 2048 > 48000:
        raise ValueError('worker-context-limit')
    return body

def parse_final(response):
    usage = response.get('usage') or {}
    if response.get('status') != 'completed' or not isinstance(usage.get('output_tokens'), int) or usage['output_tokens'] > 2000:
        raise ValueError('worker-incomplete')
    text = []
    for item in response.get('output', []):
        if item.get('type') == 'reasoning':
            continue
        if item.get('type') != 'message' or item.get('role') != 'assistant':
            raise ValueError('worker-nontext')
        for content in item.get('content', []):
            if content.get('type') != 'output_text':
                raise ValueError('worker-nontext')
            text.append(content['text'])
    raw = ''.join(text)
    if not raw or len(raw.encode()) > 32000:
        raise ValueError('worker-output-limit')
    return json.loads(raw)

def audit_sandbox(check_credential=False):
    import sys
    mounts=Path('/proc/self/mountinfo').read_text().splitlines()
    audit={'isolatedPython':bool(sys.flags.isolated),'noSite':bool(sys.flags.no_site),
           'hostMemoriesHidden':not Path('/root/.hermes/memories').exists() and not Path('/root/.hermes/config.yaml').exists(),
           'hermesCodeHidden':not Path('/usr/local/lib/hermes-agent').exists(),
           'readOnlyAuth':any(line.split()[4]=='/root/.hermes/auth.json' and 'ro' in line.split()[5].split(',') for line in mounts)}
    if check_credential:
        try:
            credential()
            audit['credentialReady']=True
        except Exception:
            audit['credentialReady']=False
    return audit

def main():
    import resource
    import signal
    import sys
    # Applied before reading untrusted stdin or credentials. Supervisor also SIGKILLs.
    for limit,value in [(resource.RLIMIT_CPU,10),(resource.RLIMIT_AS,256*1024*1024),(resource.RLIMIT_NOFILE,32),(resource.RLIMIT_FSIZE,0),(resource.RLIMIT_CORE,0)]:
        resource.setrlimit(limit,(value,value))
    signal.alarm(44)
    if sys.argv[1:]==['--audit-sandbox']:
        audit=audit_sandbox()
        print(json.dumps(audit))
        return 0 if all(audit.values()) else 2
    try:
        raw=sys.stdin.buffer.read(48001)
        if len(raw)>48000: raise ValueError()
        payload=json.loads(raw)
        if sys.argv[1:]==['--supervised'] and payload=={'auditSandbox':True}:
            audit=audit_sandbox(check_credential=True)
            print(json.dumps(audit))
            return 0 if all(audit.values()) else 2
        if sys.argv[1:]==['--supervised'] and not all(audit_sandbox(check_credential=True).values()):
            raise ValueError()
        if payload.get('schema')!='onboarding.hermes.bounded.v1' or payload.get('model')!=MODEL:
            raise ValueError()
        build_request(payload)
    except Exception:
        print('worker-invalid-input',file=sys.stderr)
        return 2
    try:
        result=infer(payload)
        print(json.dumps(result,ensure_ascii=False))
        return 0
    except Exception as error:
        code=str(error)
        import re
        print(code if re.fullmatch(r'worker-[a-z0-9-]+',code) else 'worker-inference-failed',file=sys.stderr)
        return 2

if __name__=='__main__':
    raise SystemExit(main())
