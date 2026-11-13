"""Azure attachment metadata adapter tests with synthetic fixtures only."""
import importlib.util
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('workspace_worker', Path(__file__).resolve().parents[1] / 'scripts' / 'hermes-enrichment-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class AzureAttachmentTests(unittest.TestCase):
    def test_only_attached_files_are_projected_into_canonical_safe_links(self):
        work_item = {'organization': 'MobileappsAmerica', 'project': 'mobileApps', 'id': 42}
        body = {'id': 42, 'fields': {'System.TeamProject': 'mobileApps'}, 'relations': [
            {'rel': 'AttachedFile', 'url': 'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'attributes': {'name': 'nota técnica.pdf', 'resourceSize': 123}},
            {'rel': 'Hyperlink', 'url': 'https://example.com/ignored'},
        ]}
        result = worker.project_azure_attachments(body, work_item)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['name'], 'nota técnica.pdf')
        self.assertIn('download=true', result['items'][0]['url'])
        self.assertEqual(result['total'], 1)
        self.assertFalse(result['truncated'])

    def test_foreign_urls_and_wrong_project_are_rejected(self):
        work_item = {'organization': 'MobileappsAmerica', 'project': 'mobileApps', 'id': 42}
        for body in (
            {'id': 42, 'fields': {'System.TeamProject': 'Other'}, 'relations': []},
            {'id': 42, 'fields': {'System.TeamProject': 'mobileApps'}, 'relations': [{'rel': 'AttachedFile', 'url': 'https://attacker.example/file'}]},
        ):
            with self.assertRaises(ValueError):
                worker.project_azure_attachments(body, work_item)

    def test_large_attachment_list_reports_truncation_and_total(self):
        work_item = {'organization': 'MobileappsAmerica', 'project': 'mobileApps', 'id': 42}
        body = {'id': 42, 'fields': {'System.TeamProject': 'mobileApps'}, 'relations': [
            {'rel': 'AttachedFile', 'url': 'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/' + str(uuid.UUID(int=index + 1)), 'attributes': {'name': f'file-{index}.txt'}} for index in range(105)
        ]}
        result = worker.project_azure_attachments(body, work_item)
        self.assertEqual(len(result['items']), 100)
        self.assertEqual(result['total'], 105)
        self.assertTrue(result['truncated'])

    def test_disallowed_organization_never_reaches_network(self):
        with self.assertRaises(ValueError):
            worker.fetch_azure_attachments({'organization': 'Other', 'project': 'mobileApps', 'id': 42})


if __name__ == '__main__':
    unittest.main()
