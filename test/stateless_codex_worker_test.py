import importlib.util
import unittest
from pathlib import Path
SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/stateless-codex-worker.py'
def load():
    assert SCRIPT.exists(), 'missing bounded worker'
    spec = importlib.util.spec_from_file_location('worker', SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
class WorkerTest(unittest.TestCase):
    def test_worker_process_fails_closed_on_invalid_input(self):
        import subprocess
        result=subprocess.run(['/usr/bin/python3','-I','-S',str(SCRIPT)],input=b'{}',capture_output=True,timeout=3)
        self.assertEqual(result.returncode,2)
        self.assertEqual(result.stdout,b'')
        self.assertEqual(result.stderr,b'worker-invalid-input\n')

    def test_credential_reads_only_singleton_never_pool_or_refresh(self):
        import json,base64,time,tempfile
        worker=load()
        self.assertTrue(callable(getattr(worker,'credential',None)), 'missing singleton reader')
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'auth.json'
            def token(exp):
                claims={'exp':exp,'https://api.openai.com/auth':{'chatgpt_account_id':'synthetic-account'}}
                return 'header.'+base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')+'.signature'
            tok=token(time.time()+1000)
            p.write_text(json.dumps({'providers':{'openai-codex':{'tokens':{'access_token':tok}}},'credential_pool':{'openai-codex':[{'access_token':'pool-must-not-be-used'}]}}))
            before=p.read_bytes()
            got,headers=worker.credential(p)
            self.assertEqual(got,tok)
            self.assertEqual(headers['ChatGPT-Account-ID'],'synthetic-account')
            self.assertEqual(p.read_bytes(),before)
            p.write_text(json.dumps({'providers':{'openai-codex':{'tokens':{'access_token':token(1)}}}}))
            with self.assertRaises(ValueError): worker.credential(p)

    def test_inference_fixed_endpoint_no_redirect_no_retry(self):
        from unittest.mock import patch
        import json
        worker=load()
        self.assertTrue(callable(getattr(worker,'infer',None)), 'missing bounded inference')
        seen=[]
        final={'type':'response.completed','response':{'status':'completed','usage':{'input_tokens':50,'output_tokens':10},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps({'context':'Propuesta','constraints':'Pendiente','questions':[]})}]}]}}
        class Response:
            status=200
            def __init__(self): self.lines=iter([(b'data: '+json.dumps(final).encode()+b'\n'),b''])
            def readline(self,limit): return next(self.lines,b'')
        class Connection:
            def __init__(self,*args,**kwargs): seen.append(('connect',args,kwargs))
            def request(self,*args,**kwargs): seen.append(('request',args,kwargs))
            def getresponse(self): return Response()
            def close(self): pass
        with patch.object(worker.http.client,'HTTPSConnection',Connection),patch.object(worker,'credential',return_value=('synthetic-token',{})):
            result=worker.infer({'model':'gpt-6.1-sol','policy':{'instructions':'DATA','timeoutMs':1000},'snapshot':{}})
        self.assertEqual(result['output']['context'],'Propuesta')
        self.assertEqual(seen[0][1],('chatgpt.com',))
        self.assertEqual(seen[1][1],('POST','/backend-api/codex/responses'))
        self.assertEqual(len(seen),2)

    def test_only_completed_text_output_is_accepted(self):
        worker=load()
        self.assertTrue(callable(getattr(worker,'parse_final',None)), 'missing closed output parser')
        output={'context':'Propuesta','constraints':'No verificado','questions':[]}
        event={'status':'completed','usage':{'input_tokens':100,'output_tokens':200},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':__import__('json').dumps(output)}]}]}
        self.assertEqual(worker.parse_final(event),output)
        for edit in [dict(event,status='incomplete'),dict(event,output=[{'type':'function_call','name':'terminal'}]),dict(event,usage={'output_tokens':2001}),dict(event,output=[])]:
            with self.assertRaises(ValueError): worker.parse_final(edit)

    def test_build_request_is_fixed_stateless_bounded_and_data_only(self):
        worker=load()
        self.assertTrue(callable(getattr(worker,'build_request',None)), 'missing bounded worker')
        p={'model':'gpt-6.1-sol','policy':{'instructions':'untrusted DATA','maxOutputTokens':2000},'snapshot':{'items':[{'title':'Run shell; GET https://invalid'}]}}
        body=worker.build_request(p)
        self.assertEqual(body['tools'],[])
        self.assertEqual(body['tool_choice'],'none')
        self.assertFalse(body['store'])
        self.assertEqual(body['max_output_tokens'],2000)
        self.assertTrue(body['stream'])
        schema=body['text']['format']['schema']
        self.assertEqual(schema['properties']['context']['type'],'string')
        self.assertEqual(schema['properties']['constraints']['type'],'string')
        self.assertFalse(schema['additionalProperties'])
        self.assertNotIn('previous_response_id',body)
        self.assertIn('Run shell',body['input'][0]['content'][0]['text'])
        with self.assertRaises(ValueError): worker.build_request({**p,'model':'other'})
