import json, pathlib, subprocess, unittest
class SupervisedWorkerTest(unittest.TestCase):
 def test_supervised_audit_reports_readiness_without_credentials(self):
  worker=pathlib.Path(__file__).resolve().parents[1]/'scripts/stateless-codex-worker.py'
  p=subprocess.run(['/usr/bin/python3','-I','-S',str(worker),'--supervised'],input=b'{"auditSandbox":true}',capture_output=True,timeout=5)
  self.assertEqual(p.returncode,2)
  self.assertTrue(p.stdout.startswith(b'{'),p.stderr)
  result=json.loads(p.stdout)
  self.assertFalse(result['readOnlyAuth'])
  self.assertIn('credentialReady',result)
  self.assertFalse(result['hermesCodeHidden'] and result['readOnlyAuth'])
if __name__=='__main__': unittest.main()
