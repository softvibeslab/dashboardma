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

    def test_question_native_fixture_excludes_even_poisoned_history(self):
        import importlib.util,tempfile,os
        spec=importlib.util.spec_from_file_location('question_broker',ROOT/'scripts/v3-hermes-agent-broker.py')
        assert spec is not None and spec.loader is not None
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        scope={'actor':'fixture-editor','org':'synthetic','project':'alpha','caseId':'case-1'}
        source={'id':'alpha-guide','org':'synthetic','project':'alpha','ref':'fixture-v1','kind':'repository','text':'Reviewed synthetic project guidance.'}
        prompt={'purpose':'question','sourceRefs':{'AZ-900001-r1:title':{'kind':'title'}},'derivatives':{'question':{'id':'Q-ENV','currentAnswer':'Human baseline'}}}
        request={'executionId':'native-fixture-question-01','scope':scope,'prompt':json.dumps(prompt),'inputHash':'a'*64,'sourceHash':'b'*64,'purpose':'question','contextKey':'c'*64,'historyPolicy':'none'}
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR','/root/.hermes/cache/scratch')) as directory:
            service=module.Broker(pathlib.Path(directory),{'grants':[{**scope,'sourceHash':'b'*64}],'sources':[source]},real=False)
            result=service.execute(request)
            self.assertEqual(result['historyMessages'],0)
            self.assertEqual(result['providerRequests'],0)
            self.assertEqual(result['tools'][0]['status'],'executed')
            output=json.loads(result['answer'])
            self.assertEqual(output['documentary']['sourceRefs'],['AZ-900001-r1:title'])
            self.assertIn('sintética',output['documentary']['answer'])
            self.assertEqual(output['contextCitations'],['alpha-guide'])
            service.db.execute('UPDATE sessions SET history=? WHERE scope=?',(json.dumps([{'role':'user','content':'UNSELECTED_OLD_SNAPSHOT_SENTINEL'},{'role':'assistant','content':'Excluded old answer'}]),result['sessionId']));service.db.commit()
            again=service.execute({**request,'executionId':'native-fixture-question-02'})
            self.assertEqual(again['historyMessages'],0)
            self.assertEqual(json.loads(service.db.execute('SELECT history FROM sessions WHERE scope=?',(again['sessionId'],)).fetchone()[0]),[])
            with self.assertRaisesRegex(ValueError,'input-invalid'):
                service.execute({**request,'historyPolicy':'scoped'})
            service.db.close()

    def test_supervised_socket_restart_and_separate_shared_directory(self):
        import tempfile,os,socket,subprocess,time,stat
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR','/root/.hermes/cache/scratch')) as raw:
            directory=pathlib.Path(raw);state=directory/'state';shared=directory/'socket';shared.mkdir(mode=0o710)
            scope={'actor':'fixture-editor','org':'synthetic','project':'alpha','caseId':'case-1','sourceHash':'b'*64}
            manifest=directory/'manifest.json';manifest.write_text(json.dumps({'grants':[scope],'sources':[{'id':'fixture-guide','org':'synthetic','project':'alpha','kind':'repository','ref':'fixture-v1','text':'Synthetic read-only context.'}]}));manifest.chmod(0o600)
            key=directory/'key';key.write_text('fixture-mediator-key-for-private-tests');key.chmod(0o600)
            path=shared/'agent.sock'
            command=['python3',str(ROOT/'scripts/v3-hermes-agent-broker.py'),'--directory',str(state),'--socket-directory',str(shared),'--manifest',str(manifest),'--key-file',str(key)]
            for restart in range(2):
                if restart:
                    stale=socket.socket(socket.AF_UNIX);stale.bind(str(path));stale.close()
                child=subprocess.Popen(command,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
                try:
                    ready=False
                    for _ in range(150):
                        if child.poll() is not None:break
                        try:
                            with socket.socket(socket.AF_UNIX) as client:
                                client.settimeout(.1);client.connect(str(path))
                            ready=True;break
                        except OSError:time.sleep(.05)
                    self.assertTrue(ready,child.stderr.read() if child.poll() is not None else 'socket readiness timeout')
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o660)
                    self.assertEqual(stat.S_IMODE(state.stat().st_mode),0o700)
                    self.assertEqual(stat.S_IMODE((state/'agent.sqlite').stat().st_mode),0o600)
                    duplicate=subprocess.run(command,capture_output=True,text=True,timeout=10)
                    self.assertNotEqual(duplicate.returncode,0)
                finally:
                    child.terminate();child.wait(timeout=10);child.stderr.close()
                self.assertFalse(path.exists(),'Graceful supervisor stop must remove its own socket')

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
            request={'executionId':'fixture-execution-0001','scope':scope,'prompt':'Synthetic: what is required?','inputHash':'a'*64,'sourceHash':'b'*64,'purpose':'enrich','contextKey':'d'*64,'historyPolicy':'scoped'}
            result=service.execute(request)
            self.assertEqual(result['runtime'],'hermes-native-sealed-v1')
            self.assertEqual(result['tools'][0]['status'],'executed')
            self.assertEqual(result,service.execute(request))
            with self.assertRaisesRegex(ValueError,'replay-conflict'):
                service.execute({**request,'contextKey':'e'*64})
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
            job_scope=service.db.execute('SELECT scope FROM jobs WHERE id=?',(request['executionId'],)).fetchone()[0]
            service.db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)',(job_scope,uncertain['executionId'],broker.digest(uncertain),'running',None,0))
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
