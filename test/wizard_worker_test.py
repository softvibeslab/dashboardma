"""Offline wizard contract and isolated model boundary tests (no provider calls)."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'hermes-enrichment-worker.py'
spec = importlib.util.spec_from_file_location('wizard_worker', SCRIPT)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

HEADINGS = ('Alcance', 'Reglas', 'Datos', 'Integraciones', 'Seguridad',
            'Criterios', 'Pruebas', 'Dependencias', 'Pendientes')


def snapshot(count=2):
    return {'schemaVersion': 1, 'kind': 'wizard-specs', 'wizard': {
        'tracks': [{'id': f'track-{i}', 'technology': 'Android', 'area': f'Area {i}',
                    'ownerEmail': 'owner@example.invalid'} for i in range(count)],
        'versionId': 'v1', 'version': {'id': 'v1', 'summary': 'Fuente enriquecida'}},
        'approvedAnswers': []}


def response(count=2):
    content = '\n'.join(f'## {heading}\nPENDIENTE — responsable: owner@example.invalid.'
                        for heading in HEADINGS)
    return {'specs': [{'trackId': f'track-{i}', 'title': f'Especificación {i}',
                       'content': content} for i in range(count)]}


class WizardValidatorTests(unittest.TestCase):
    def test_valid_specs_preserve_exact_ids_and_content(self):
        value = response()
        self.assertEqual(worker.validate_wizard_specs(value, snapshot()), value['specs'])

    def test_rejects_invalid_result_schema_types_and_ids(self):
        invalid = [None, [], {}, {'specs': None}, {'specs': {}}, {'specs': []},
                   {'specs': response()['specs'], 'kind': 'wizard-specs'}]
        for specs in ([None], [False], [response()['specs'][0]],
                      response(3)['specs'], [response()['specs'][0]] * 2):
            invalid.append({'specs': specs})
        for field, values in {'trackId': [None, 0, True, [], 'extra', ' track-0'],
                              'title': [None, 0, True, [], '', '  ', 'x' * 301],
                              'content': [None, 0, True, [], '', '  ', 'x' * 6501]}.items():
            for bad in values:
                value = response()
                value['specs'][0][field] = bad
                invalid.append(value)
        for remove in ('trackId', 'title', 'content'):
            value = response()
            del value['specs'][0][remove]
            invalid.append(value)
        value = response()
        value['specs'][0]['approval'] = True
        invalid.append(value)
        for value in invalid:
            with self.subTest(value=str(value)[:100]), self.assertRaises(ValueError):
                worker.validate_wizard_specs(value, snapshot())

    def test_rejects_invalid_input_kind_schema_tracks_and_ids(self):
        invalid = [None, [], {}, {'kind': 'chat', 'schemaVersion': 1},
                   {**snapshot(), 'kind': 'chat'}, {**snapshot(), 'schemaVersion': True},
                   {**snapshot(), 'schemaVersion': 2}, {**snapshot(), 'wizard': None}]
        for tracks in (None, {}, [], snapshot(9)['wizard']['tracks'], [None],
                       [{'id': None}], [{'id': True}], [{'id': []}], [{'id': ''}],
                       [{'id': '  '}], [{'id': 'same'}, {'id': 'same'}]):
            value = snapshot()
            value['wizard']['tracks'] = tracks
            invalid.append(value)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                worker.validate_wizard_specs(response(), value)

    def test_requires_explicit_headings_in_each_content(self):
        for heading in HEADINGS:
            value = response()
            value['specs'][0]['content'] = value['specs'][0]['content'].replace(
                f'## {heading}\n', f'El texto menciona {heading} pero no es una sección.\n')
            with self.subTest(heading=heading), self.assertRaises(ValueError):
                worker.validate_wizard_specs(value, snapshot())

    def test_limits_accept_boundaries_but_reject_utf8_total_overflow(self):
        value = response(8)
        for item in value['specs']:
            item['title'] = 'x' * 300
            item['content'] += 'x' * (6500 - len(item['content']))
        self.assertEqual(worker.validate_wizard_specs(value, snapshot(8)), value['specs'])
        for item in value['specs']:
            item['content'] = item['content'].replace('x', '😀')
        with self.assertRaises(ValueError):
            worker.validate_wizard_specs(value, snapshot(8))

    def test_spec_order_need_not_match_track_order(self):
        value = response()
        value['specs'].reverse()
        self.assertEqual(worker.validate_wizard_specs(value, snapshot()), value['specs'])


class WizardEngineTests(unittest.TestCase):
    def run_engine(self, snap, replies, *, tools=False, incomplete=False):
        self.calls = []
        calls = self.calls

        class Agent:
            def __init__(self, **kwargs):
                self.tools = ['forbidden'] if tools else []
                self.valid_tool_names = set(self.tools)
                calls.append({'options': kwargs})

            def run_conversation(self, **kwargs):
                calls[-1]['conversation'] = kwargs
                return {'completed': not incomplete, 'final_response': json.dumps(replies[len(calls) - 1])}

        payload = {'route': {'model': 'offline-test-model', 'provider': 'offline-test-provider'},
                   'snapshot': snap, 'skill': 'Trusted method fixture'}
        with patch.object(worker, 'bootstrap'), patch.object(sys, 'stdin', io.StringIO(json.dumps(payload))), \
                patch.dict(sys.modules, {'run_agent': types.SimpleNamespace(AIAgent=Agent)}):
            return worker.engine()

    def test_wizard_single_pass_preserves_tool_free_fresh_guards(self):
        value = response()
        result = self.run_engine(snapshot(), [value])
        self.assertEqual(result, {'kind': 'wizard-specs', 'specs': value['specs'],
                                 'model': 'offline-test-model', 'provider': 'offline-test-provider', 'toolsCount': 0})
        self.assertEqual(len(self.calls), 1)
        options = self.calls[0]['options']
        self.assertEqual(options['max_tokens'], 12000)
        self.assertEqual(options['enabled_toolsets'], [])
        for name in ('skip_context_files', 'skip_memory', 'skip_background_review', 'quiet_mode'):
            self.assertIs(options[name], True)
        for name in ('load_soul_identity', 'save_trajectories', 'verbose_logging', 'checkpoints_enabled'):
            self.assertIs(options[name], False)
        self.assertIsNone(options['session_db'])
        self.assertEqual(options['fallback_model'], {})
        self.assertGreater(options['run_budget_seconds'], 0)
        self.assertLessEqual(options['run_budget_seconds'], 285)
        self.assertIsNone(self.calls[0]['conversation']['conversation_history'])
        self.assertIn('wizard', self.calls[0]['conversation']['user_message'])
        self.assertTrue(self.calls[0]['conversation']['system_message'].startswith(worker.WIZARD_POLICY))

    def test_wizard_rejects_invalid_input_before_model(self):
        with self.assertRaises(ValueError):
            self.run_engine(snapshot(0), [response()])
        self.assertEqual(self.calls, [])

    def test_wizard_rejects_invalid_model_output_without_retry_or_fabrication(self):
        with self.assertRaises(ValueError):
            self.run_engine(snapshot(), [{'specs': []}])
        self.assertEqual(len(self.calls), 1)

    def test_existing_tool_and_completion_invariants_still_apply(self):
        for options in ({'tools': True}, {'incomplete': True}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.run_engine(snapshot(), [response()], **options)

    def test_chat_and_default_keep_existing_modes(self):
        self.assertEqual(self.run_engine({'kind': 'chat'}, [{'answer': 'Respuesta'}])['answer'], 'Respuesta')
        self.assertEqual(self.calls[0]['options']['max_tokens'], 2000)
        self.assertTrue(self.calls[0]['conversation']['system_message'].startswith(worker.CHAT_POLICY))
        result = self.run_engine({'kind': 'enrichment'}, [{'summary': 'Borrador'}, {'findings': ['Pendiente']}])
        self.assertEqual(result['draft'], {'summary': 'Borrador'})
        self.assertEqual([call['options']['max_tokens'] for call in self.calls], [7000, 1800])

    def test_spanish_policy_includes_sections_traceability_and_honesty(self):
        policy = worker.WIZARD_POLICY
        for heading in HEADINGS:
            self.assertIn('## ' + heading, policy)
        for term in ('tecnología', 'área', 'wizard.version', 'approvedAnswers', 'ownerEmail',
                     'PENDIENTE', 'responsable', 'plan de pruebas', '2500', '6500',
                     '300', 'NO CONFIABLE', 'repositorios', 'aprobaciones',
                     'ejecutadas', 'sin herramientas', 'no leídos', 'SOLO JSON'):
            self.assertIn(term, policy)


if __name__ == '__main__':
    unittest.main()
