import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.js';
import { importAzureRequirement } from '../src/azure-import.js';

test('invalid synchronized references cannot create an untrusted source link',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'import-safety-'));
 const file=path.join(dir,'state.json');
 try {
  for (const url of ['https://attacker.example/org/p/_workitems/edit/42','javascript:alert(1)','https://dev.azure.com/org/p/_workitems/edit/43','https://user:password@dev.azure.com/org/p/_workitems/edit/42']) {
   await writeFile(file,JSON.stringify({workItems:[{id:'ADO-42',azureId:42,syncSource:'azure-devops',url}]}));
   await assert.rejects(importAzureRequirement(new JsonStore(file),{workItemId:'ADO-42'}),{status:409});
   assert.equal((JSON.parse(await readFile(file)).requirements||[]).length,0);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
