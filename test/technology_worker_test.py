"""Offline model-boundary tests: never resolves credentials or calls a model."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('tech_worker', Path(__file__).resolve().parents[1] / 'scripts/hermes-enrichment-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
SNAP = {'kind':'technology-suggestion','schemaVersion':1,'candidates':[{'email':'owner@example.test','assignmentIds':['ADO-1']}], 'selectedVersion':{'id':'V1'}}
def track(email='owner@example.test'):
    return {'technology':'Android','area':'Ventas','ownerEmail':email,'confidence':'medium' if email else 'low','rationale':'Asignación ADO-1 no demuestra especialidad; revisar.','evidenceIds':['ADO-1'] if email else []}
class TechnologyWorkerTest(unittest.TestCase):
    def test_malformed_suggestion_input_is_rejected_before_model_call(self):
        called=[]
        class Agent:
            def __init__(self,**kwargs):
                called.append(True);self.tools=[];self.valid_tool_names=set()
            def run_conversation(self,**kwargs):
                return {'completed':True,'final_response':json.dumps({'tracks':[track()]})}
        payload={'snapshot':{**SNAP,'candidates':'forged'},'skill':'trusted','route':{'model':'offline','provider':'offline'}}
        with patch.object(worker,'bootstrap'),patch.object(sys,'stdin',io.StringIO(json.dumps(payload))),patch.dict(sys.modules,{'run_agent':types.SimpleNamespace(AIAgent=Agent)}):
            with self.assertRaises(ValueError): worker.engine()
        self.assertEqual(called,[])

    def test_worker_rejects_invented_email_and_accepts_pending_without_candidates(self):
        for value in [{'tracks':[track('invented@example.test')]},{'tracks':[{**track(),'evidenceIds':['WRONG']}]},{'tracks':[{**track(),'confidence':'certain'}]},{'tracks':[None]},{'tracks':[track()],'approved':True}]:
            with self.subTest(value=value),self.assertRaises(ValueError):worker.validate_technology_suggestion(value,SNAP)
        pending=track('')
        self.assertEqual(worker.validate_technology_suggestion({'tracks':[pending]},{**SNAP,'candidates':[]}),[pending])

    def test_isolated_suggestion_mode_uses_real_agent_path_without_enrichment(self):
        calls=[]
        class Agent:
            def __init__(self,**kwargs):
                calls.append(kwargs); self.tools=[]; self.valid_tool_names=set()
            def run_conversation(self,**kwargs):
                calls[-1].update(conversation=kwargs)
                return {'completed':True,'final_response':json.dumps({'tracks':[track()]})}
        payload={'snapshot':SNAP,'skill':'trusted','route':{'model':'offline','provider':'offline'}}
        with patch.object(worker,'bootstrap'),patch.object(sys,'stdin',io.StringIO(json.dumps(payload))),patch.dict(sys.modules,{'run_agent':types.SimpleNamespace(AIAgent=Agent)}):
            result=worker.engine()
        self.assertEqual(result['kind'],'technology-suggestion')
        self.assertEqual(result['tracks'],[track()]); self.assertEqual(len(calls),1)
        for k in ['skip_context_files','skip_memory','skip_background_review']: self.assertTrue(calls[0][k])
        self.assertEqual(calls[0]['enabled_toolsets'],[])
        self.assertIsNone(calls[0]['conversation']['conversation_history'])
        self.assertIn('no demuestra',calls[0]['conversation']['system_message'])
if __name__=='__main__': unittest.main()
