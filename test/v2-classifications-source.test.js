import test from 'node:test';
import assert from 'node:assert/strict';

test('Azure directory projection excludes operational data and preserves stable IDs and observed projects',async()=>{
 const module=await import('../src/onboarding-v2/classifications.js');
 assert.equal(typeof module.projectAzureDirectory,'function','Trusted snapshot projector must exist');
 const result=module.projectAzureDirectory({meta:{azureSync:{syncedAt:'2026-11-13T07:00:00Z'}},requirements:[{secret:'never export requirements'}],users:[
  {id:'local',name:'Local record',projects:['Test']},
  {syncSource:'azure-devops',azureIdentityKey:'azure-id-001',name:'Persona de prueba',email:'user@example.test',projects:['Test'],token:'should-not-export'},
  {syncSource:'azure-devops',azureIdentityKey:'azure-id-001',name:'Persona de prueba',email:'user@example.test',projects:['Other']}
 ]});
 assert.equal(result.source,'azure-devops-snapshot');assert.equal(result.users.length,1);
 assert.deepEqual(result.users[0],{id:'azure-id-001',name:'Persona de prueba',email:'user@example.test',projects:['Test','Other']});
 assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('token'));
 assert.throws(()=>module.projectAzureDirectory({users:[]}),/fecha/i);
});
