import test from 'node:test';
import assert from 'node:assert/strict';
import { stageMarkup } from '../public/dashboard/requirements/onboarding/app.js';

test('stage zero offers inline intake and the existing answer workspace before and after enrichment', () => {
  for (const versions of [[], [{ id: 'v1', version: 1 }]]) {
    const html = stageMarkup({ flow: { stage: 0, versionId: 'v1' }, context: { requirement: { id: 'REQ-1' }, versions } });
    assert.match(html, /data-onboarding-intake/);
    assert.match(html, /data-intake-form="context"/);
    assert.match(html, /type="file"[^>]*multiple/);
    assert.match(html, /data-intake-form="url"/);
    assert.match(html, /Enriquecer con Hermes/);
    assert.match(html, /id="requirement-answers"/);
    assert.doesNotMatch(html, /href="\/dashboard\/requirements"/);
    assert.match(html, /name="versionId"/);
    if (!versions.length) assert.match(html, /data-version-empty/);
  }
});
