"""Deterministic worker boundary tests; model execution is tested separately."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'hermes-enrichment-worker.py'
spec = importlib.util.spec_from_file_location('enrichment_worker', SCRIPT)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def test_strict_object_json_and_code_fences(self):
        self.assertEqual(worker.parse_json('```json\n{"status":"draft"}\n```'), {'status': 'draft'})
        for invalid in ('[]', 'not JSON', '{"ok":true} extra'):
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                worker.parse_json(invalid)

    def test_atomic_result_does_not_follow_predictable_temporary_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            victim = root / 'victim.txt'
            victim.write_text('unchanged', encoding='utf-8')
            target = root / 'result.json'
            (root / 'result.json.tmp').symlink_to(victim)
            worker.atomic_json(target, {'status': 'draft'})
            self.assertEqual(victim.read_text(encoding='utf-8'), 'unchanged')
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), {'status': 'draft'})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_interrupted_claim_never_retries_model_automatically(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = root / 'ENR-ABCDEF123456.request.json'
            request.write_text('{}', encoding='utf-8')
            (root / 'ENR-ABCDEF123456.status.json').write_text('{}', encoding='utf-8')
            with patch.object(worker, 'resolve_route', side_effect=AssertionError('Must not call model')):
                worker.process_job(request, '/unused')
            self.assertEqual(json.loads((root / 'ENR-ABCDEF123456.result.json').read_text(encoding='utf-8'))['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
