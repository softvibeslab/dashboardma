import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';

test('store transactions commit complete enrichment artifacts and serialize concurrent mutations', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ma-store-'));
  const file = path.join(dir, 'state.json');
  await writeFile(file, '{}');
  const store = new JsonStore(file);
  try {
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.transaction(async (data) => {
      const count = data.meta.count || 0;
      await new Promise((resolve) => setTimeout(resolve, 2));
      data.meta.count = count + 1;
      data.activities.push({ id: `ACT-${i}`, message: 'test' });
    })));
    assert.equal((await store.read()).meta.count, 12);
    assert.equal((await store.list('activities')).length, 12);
    await assert.rejects(store.transaction((data) => { data.meta.count = 99; throw new Error('abort'); }));
    assert.equal((await store.read()).meta.count, 12);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
