import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
test('offline context validator checks exact bindings, every project coverage, ambiguity and private files without inference',async()=>{
 const directory=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/native-context-plan-'),binding={actor:'entra:tenant:fixture-oid',org:'synthetic',project:'alpha',caseId:'fixture-case',sourceHash:'a'.repeat(64)},source={id:'fixture-index',org:'synthetic',project:'alpha',kind:'repository',ref:'fixture-v1',text:'Synthetic authorized project context.'},manifest={grants:[binding],sources:[source]};
 const write=async(bindings=[binding])=>{await writeFile(directory+'/manifest.json',JSON.stringify(manifest),{mode:0o600});await writeFile(directory+'/bindings.json',JSON.stringify(bindings),{mode:0o600});};
 const run=()=>{const p=spawnSync('python3',['scripts/v3-native-agent-context-validate.py','--manifest',directory+'/manifest.json','--bindings',directory+'/bindings.json'],{encoding:'utf8'});assert.equal(p.stderr,'');const result=JSON.parse(p.stdout);assert.equal(result.providerRequests,0);assert.equal(result.runtimeReadinessVerified,false);assert.ok(!p.stdout.includes('fixture-oid'));assert.ok(!p.stdout.includes(source.text));return {code:p.status,result};};
 try{
  await write();let r=run();assert.equal(r.code,0);assert.equal(r.result.contextPlanValid,true);assert.equal(r.result.coverage.coveredBindingCount,1);assert.equal(r.result.coverage.allProjectsIndexed,false);
  manifest.sources=[];await write();r=run();assert.equal(r.code,3);assert.equal(r.result.gate,'unindexed-or-over-budget-bindings');
  manifest.sources=[source];await write([{...binding,actor:'different-fixture'}]);r=run();assert.equal(r.code,3);assert.equal(r.result.gate,'bindings-mismatch');
  await write([binding,binding]);r=run();assert.equal(r.code,3);assert.equal(r.result.gate,'bindings-ambiguous');
  await write();await chmod(directory+'/manifest.json',0o644);r=run();assert.equal(r.code,3);assert.equal(r.result.gate,'operator-file-permissions-or-size');
 }finally{await rm(directory,{recursive:true,force:true});}
});
