import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('documentary_worker',Path(__file__).resolve().parents[1]/'scripts/stateless-codex-worker.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class DocumentaryWorkerTests(unittest.TestCase):
 def test_summary_schema_and_seed_are_bounded_and_purpose_fixed(self):
  p={'model':worker.MODEL,'schema':'onboarding.documentary.bounded.v2','purpose':'summary','policy':{'instructions':'fixed'},'snapshot':{'items':[]},'derivatives':{'seed':{'text':'SINTETICO teclado'},'reviewedSummary':None},'sourceRefs':{'AZ-1:title':{}}}
  request=worker.build_request(p)
  self.assertIn('businessNeed',request['text']['format']['schema']['required']);self.assertIn('SINTETICO teclado',request['input'][0]['content'][0]['text']);self.assertEqual(request['tools'],[])
  p['purpose']='arbitrary'
  with self.assertRaises(ValueError):worker.build_request(p)
