// Test-only harness: actual Unix mediator + bwrap/AIAgent/tools, deterministic model.
// No credential/protocol attestation is forged; production transport still rejects fixtures.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {HermesAgentEngine,nativeAgentTransport,scopeResolverFromBindings} from '../src/onboarding-v3/hermes-agent-engine.js';
export async function nativeQuestionHarness(state){
 const directory=await mkdtemp((process.env.TMPDIR||'/root/.hermes/cache/scratch')+'/native-question-fixture-');
 const key=randomBytes(32).toString('hex'),scope={actor:'fixture-editor',org:'synthetic',project:'alpha',caseId:'workitem-900001'},grant={...scope,sourceHash:state.azureIntakes.at(-1).sourceHash};
 await writeFile(directory+'/manifest.json',JSON.stringify({grants:[grant],sources:[{id:'alpha-guide',org:'synthetic',project:'alpha',kind:'repository',ref:'fixture-v1',text:'Synthetic library guidance: human review is required; no live QA is established.'}]}),{mode:0o600});
 await writeFile(directory+'/key',key,{mode:0o600});
 const child=spawn('python3',['scripts/v3-hermes-agent-broker.py','--directory',directory,'--manifest',directory+'/manifest.json','--key-file',directory+'/key'],{stdio:['ignore','ignore','pipe']});let diagnostics='';child.stderr.on('data',x=>diagnostics+=x);
 const close=async()=>{child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));await rm(directory,{recursive:true,force:true});};
 try{
  let ready=false;for(let i=0;i<150;i++){try{await stat(directory+'/agent.sock');ready=true;break;}catch{if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,diagnostics);
  const wire=nativeAgentTransport({socketPath:directory+'/agent.sock',key,authorized:true}),requests=[],results=[];
  const transport=async(payload,signal)=>{requests.push(structuredClone(payload));const value=await wire(payload,signal);assert.equal(value.modelMode,'deterministic-fixture');assert.equal(value.providerRequests,0);results.push(value);return value;};
  transport.synthetic=true;
  transport.health=async purpose=>{const value=await wire.describe();return value.ready===true&&value.modelMode==='deterministic-fixture'&&value.purposes.includes(purpose)&&value.allowedTools.join(',')==='authorized_context';};
  const service=new HermesAgentEngine({transport,scopeResolver:scopeResolverFromBindings([grant])});
  return {directory,service,requests,results,close,wire};
 }catch(error){await close();throw error;}
}
