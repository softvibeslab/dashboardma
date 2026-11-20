"""Security contract for the isolated native Hermes worker (no model requests)."""
import json
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
class NativeBoundaryTest(unittest.TestCase):
    def test_os_isolation_and_dispatch_denials(self):
        proc = subprocess.run(['python3', str(ROOT/'scripts/v3-hermes-agent-probe.py'), '--audit'], capture_output=True, text=True, timeout=45)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        value = json.loads(proc.stdout)
        self.assertTrue(all(value['isolation'].values()))
        self.assertEqual(value['allowedTools'], ['authorized_context'])
        self.assertEqual(value['blockedTools'], ['terminal','read_file','write_file','execute_code','memory','session_search','delegate_task','web_search','skill_manage','tool_call'])

    def test_provider_adapter_preserves_upstream_ids_and_rebuilds_tool_schema(self):
        import importlib.util
        from unittest.mock import patch,MagicMock
        spec=importlib.util.spec_from_file_location('probe_fixture',ROOT/'scripts/v3-hermes-agent-probe.py')
        assert spec is not None and spec.loader is not None
        probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
        final={'id':'resp-fixture-transport','created_at':123,'status':'completed','usage':{'input_tokens':10,'output_tokens':5,'total_tokens':15},'output':[{'type':'function_call','call_id':'call-fixture-transport','name':'authorized_context','arguments':'{}'}]}
        conn=MagicMock();response=conn.getresponse.return_value;response.status=200
        response.readline.return_value=b'data: '+json.dumps({'type':'response.completed','response':final}).encode()+b'\n'
        payload={'model':'gpt-6.1-sol','messages':[{'role':'user','content':'Synthetic transport fixture'}],'tools':[{'function':{'name':'authorized_context','type':'web_search','description':'untrusted schema override'}}]}
        with patch.object(probe,'provider_credential',return_value=('fixture-token',None)),patch.object(probe.http.client,'HTTPSConnection',return_value=conn) as network:
            completion,usage=probe.provider(payload)
        self.assertEqual(completion['id'],final['id'])
        self.assertEqual(completion['created'],123)
        self.assertEqual(completion['choices'][0]['message']['tool_calls'][0]['id'],'call-fixture-transport')
        self.assertEqual(usage,final['usage'])
        sent=json.loads(conn.request.call_args.kwargs['body'])
        self.assertEqual(sent['tools'][0]['type'],'function')
        self.assertEqual(sent['tools'][0]['name'],'authorized_context')
        self.assertEqual(sent['tools'][0]['parameters']['properties'],{})
        self.assertEqual(network.call_args.args[0],'chatgpt.com')
        self.assertEqual(conn.request.call_args.args[:2],('POST','/backend-api/codex/responses'))

    def test_native_session_replay_and_cross_project_denial(self):
        import importlib.util
        import tempfile
        import os
        spec=importlib.util.spec_from_file_location('broker',ROOT/'scripts/v3-hermes-agent-broker.py')
        self.assertIsNotNone(spec)
        broker=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(broker)
        scope={'actor':'fixture-actor','org':'synthetic','project':'alpha','caseId':'case-1'}
        source={'id':'alpha-guide','org':'synthetic','project':'alpha','ref':'fixture-v1','kind':'repository','text':'Human review required.'}
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR','/root/.hermes/cache/scratch')) as directory:
            service=broker.Broker(pathlib.Path(directory),{'grants':[{**scope,'sourceHash':'b'*64}],'sources':[source]},real=False)
            request={'executionId':'fixture-execution-0001','scope':scope,'prompt':'Synthetic: what is required?','inputHash':'a'*64,'sourceHash':'b'*64}
            result=service.execute(request)
            self.assertEqual(result['runtime'],'hermes-native-sealed-v1')
            self.assertEqual(result['tools'][0]['status'],'executed')
            self.assertEqual(result,service.execute(request))
            self.assertEqual(service.session_count(),1)
            with self.assertRaisesRegex(ValueError,'replay-conflict'):
                service.execute({**request,'prompt':'different'})
            with self.assertRaisesRegex(PermissionError,'scope-denied'):
                service.execute({**request,'scope':{**scope,'project':'beta'}})
            for field in ('actor','org','caseId'):
                with self.assertRaisesRegex(PermissionError,'scope-denied'):
                    service.execute({**request,'scope':{**scope,field:'unauthorized'}})
            with self.assertRaisesRegex(PermissionError,'scope-denied'):
                service.execute({**request,'sourceHash':'c'*64})
            # Reopen the same private store: replay returns the same result without inference.
            uncertain={**request,'executionId':'fixture-uncertain-0001'}
            service.db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)',(result['sessionId'],uncertain['executionId'],broker.digest(uncertain),'running',None,0))
            service.db.commit()
            service.db.close()
            restarted=broker.Broker(pathlib.Path(directory),{'grants':[{**scope,'sourceHash':'b'*64}],'sources':[source]},real=False)
            self.assertEqual(result,restarted.execute(request))
            with self.assertRaisesRegex(ValueError,'terminal-no-retry'):
                restarted.execute(uncertain)
            stored=json.loads(restarted.db.execute('SELECT history FROM sessions').fetchone()[0])
            self.assertEqual([m['role'] for m in stored],['user','assistant'])
            self.assertEqual(set(stored[1]),{'role','content'})
            restarted.db.close()

if __name__ == '__main__':
    unittest.main()
