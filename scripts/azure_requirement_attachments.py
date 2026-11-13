"""Read-only Azure attachment metadata, with fixed origin and no redirects."""
import base64
from datetime import datetime, timezone
import json
import os
import re
import urllib.request
import urllib.parse


def project_azure_attachments(body, work_item):
    if body.get('id') != work_item['id'] or body.get('fields', {}).get('System.TeamProject', '').casefold() != work_item['project'].casefold():
        raise ValueError('Work item scope mismatch')
    items = []
    seen = set()
    for relation in body.get('relations', []):
        if relation.get('rel') != 'AttachedFile':
            continue
        url = urllib.parse.urlsplit(relation.get('url', ''))
        segments = urllib.parse.unquote(url.path).strip('/').split('/')
        attachment_id = segments[-1] if segments else ''
        if (url.scheme != 'https' or url.hostname != 'dev.azure.com' or url.username or url.password
                or not segments or segments[0] != 'MobileappsAmerica'
                or segments[-4:-1] != ['_apis', 'wit', 'attachments']
                or not re.fullmatch(r'[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}', attachment_id)):
            raise ValueError('Attachment URL outside allowlist')
        if attachment_id in seen:
            continue
        seen.add(attachment_id)
        attributes = relation.get('attributes') or {}
        name = str(attributes.get('name') or 'Adjunto')[:250]
        canonical = 'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/' + attachment_id
        query = urllib.parse.urlencode({'fileName': name, 'download': 'true', 'api-version': '7.1'})
        size = attributes.get('resourceSize')
        items.append({'name': name, 'url': canonical + '?' + query, 'size': size if type(size) is int and size >= 0 else None})
    return {'kind': 'azure-attachments', 'items': items[:100], 'total': len(items), 'truncated': len(items) > 100, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'toolsCount': 0}


def fetch_azure_attachments(work_item):
    if (work_item.get('organization') != 'MobileappsAmerica'
            or type(work_item.get('id')) is not int or not 0 < work_item['id'] < 2147483648
            or not isinstance(work_item.get('project'), str) or not 1 <= len(work_item['project']) <= 200):
        raise ValueError('Invalid Azure scope')
    from hermes_cli.env_loader import load_hermes_dotenv
    load_hermes_dotenv()
    pat = os.environ.get('AZURE_DEVOPS_EXT_PAT')
    if not pat:
        raise ValueError('Azure read credential unavailable')
    url = 'https://dev.azure.com/MobileappsAmerica/' + urllib.parse.quote(work_item['project'], safe='') + '/_apis/wit/workitems/' + str(work_item['id']) + '?$expand=relations&api-version=7.1'
    authorization = 'Basic ' + base64.b64encode((':' + pat).encode()).decode()
    request = urllib.request.Request(url, headers={'Authorization': authorization, 'Accept': 'application/json'}, method='GET')

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    with urllib.request.build_opener(NoRedirect).open(request, timeout=25) as response:
        if 'application/json' not in response.headers.get('Content-Type', ''):
            raise ValueError('Unexpected Azure response')
        raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('Azure response too large')
        return project_azure_attachments(json.loads(raw), work_item)
