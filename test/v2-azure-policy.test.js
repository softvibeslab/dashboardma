import test from 'node:test';
import assert from 'node:assert/strict';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';
import {createV2Server} from '../src/onboarding-v2/server.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const fields={'System.TeamProject':'agileNestCorp','System.Title':'Synthetic project item','System.WorkItemType':'User Story','System.State':'New'};
const source=async url=>{const u=new URL(url);if(u.pathname.endsWith('/wiql'))return Response.json({workItems:[{id:18}]});if(u.pathname.endsWith('/workitems'))return Response.json({value:[{id:18,fields}]});if(u.pathname.endsWith('/comments'))return Response.json({comments:[]});return Response.json({id:18,rev:2,fields,relations:[]});};
test('explicit authorized project policy permits search and import beyond ID allowlist',async()=>{
 const client=new AzureIntake({token:'synthetic',allowedIds:[17],importPolicy:'project',allowedProject:'agileNestCorp',fetcher:source});
 assert.equal(client.configured(),true);
 assert.equal((await client.search('Synthetic')).items[0].importAllowed,true);
 assert.equal((await client.read(18)).root.id,18);
});

test('runtime policy factory requires exact explicit approved project and fails closed',async()=>{
 const {azureIntakeFromEnv}=await import('../src/onboarding-v2/azure-intake.js');
 const client=azureIntakeFromEnv({V2_AZURE_PAT:'synthetic',V2_AZURE_IMPORT_POLICY:'project',V2_AZURE_ALLOWED_PROJECT:'agileNestCorp',V2_AZURE_ALLOWED_IDS:'17'});
 assert.equal(client.canImport(18),true);
 for(const config of [{},{V2_AZURE_IMPORT_POLICY:'project'},{V2_AZURE_IMPORT_POLICY:'project',V2_AZURE_ALLOWED_PROJECT:'other'},{V2_AZURE_IMPORT_POLICY:'all',V2_AZURE_ALLOWED_IDS:'17'}]){
  const denied=azureIntakeFromEnv({V2_AZURE_PAT:'synthetic',...config});assert.equal(denied.configured(),false);assert.equal(denied.canImport(18),false);
 }
 const ids=azureIntakeFromEnv({V2_AZURE_PAT:'synthetic',V2_AZURE_ALLOWED_IDS:'17,invalid,18x'});assert.equal(ids.canImport(17),true);assert.equal(ids.canImport(18),false);
});

test('project policy validates search metadata and every root/child project before use',async()=>{
 let mode='search',comments=0;
 const client=new AzureIntake({token:'synthetic',importPolicy:'project',allowedProject:'agileNestCorp',fetcher:async url=>{
  const u=new URL(url);if(u.pathname.endsWith('/wiql'))return Response.json({workItems:[{id:18}]});
  if(u.pathname.endsWith('/workitems'))return Response.json({value:[{id:18,fields:{...fields,'System.TeamProject':'other'}}]});
  if(u.pathname.endsWith('/comments')){comments++;return Response.json({comments:[]});}
  const id=Number(u.pathname.split('/').at(-1));return Response.json({id,rev:1,fields:{...fields,'System.TeamProject':mode==='root'||id===19?'other':'agileNestCorp'},relations:id===18?[{rel:'System.LinkTypes.Hierarchy-Forward',url:'https://dev.azure.com/MobileappsAmerica/agileNestCorp/_apis/wit/workitems/19'}]:[]});
 }});
 await assert.rejects(()=>client.search('Synthetic'),e=>e.status===502);
 mode='root';await assert.rejects(()=>client.read(18),e=>e.status===502);assert.equal(comments,0);
 mode='child';const result=await client.read(18);assert.equal(result.children[0].status,'failed');assert.equal(result.children[0].fields,undefined);assert.equal(comments,1);
});

test('project import HTTP enforces editor/coordinator, keeps source failure atomic and never changes staffing',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'azure-policy-http-'));const file=path.join(dir,'state.json');let mode='ok',calls=0;
 const connector=new AzureIntake({token:'synthetic',allowedIds:[3134],importPolicy:'project',allowedProject:'agileNestCorp',fetcher:async(url,opts)=>{
  calls++;assert.ok(['GET','POST'].includes(opts.method));if(mode==='fail')return new Response('private-upstream-body',{status:500});
  if(mode==='wrong'&&!String(url).includes('/comments'))return Response.json({id:18,rev:2,fields:{...fields,'System.TeamProject':'wrong'},relations:[]});
  return source(url);
 }});
 const users=['editor','coordinator','viewer'].map(role=>({id:role,token:'synthetic-'+role,roles:[role]}));const server=createV2Server({dataFile:file,users,azureIntake:connector});const socket=path.join(dir,'server.sock');await new Promise(r=>server.listen(socket,r));
 const req=(route,body,cookie='')=>new Promise((resolve,reject)=>{const r=http.request({socketPath:socket,path:route,method:body?'POST':'GET',headers:{host:'localhost',origin:'http://localhost',cookie,'content-type':'application/json'}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});
 try{
  for(const route of ['/api/azure/search?q=Synthetic','/api/azure/import'])assert.equal((await req(route,route.endsWith('import')?{id:18,revision:0}:undefined)).status,401);
  const viewer=(await req('/api/login',{token:'synthetic-viewer'})).cookie;
  assert.equal((await req('/api/azure/search?q=Synthetic',undefined,viewer)).status,403);assert.equal((await req('/api/azure/import',{id:18,revision:0},viewer)).status,403);assert.equal(calls,0);
  const editor=(await req('/api/login',{token:'synthetic-editor'})).cookie;
  mode='wrong';assert.equal((await req('/api/azure/import',{id:18,revision:0},editor)).status,502);await assert.rejects(()=>readFile(file),{code:'ENOENT'});
  mode='fail';const failure=await req('/api/azure/import',{id:18,revision:0},editor);assert.equal(failure.status,502);assert.ok(!JSON.stringify(failure).includes('private-upstream-body'));await assert.rejects(()=>readFile(file),{code:'ENOENT'});
  mode='ok';const search=await req('/api/azure/search?q=Synthetic',undefined,editor);assert.equal(search.status,200);assert.equal(search.data.items[0].importAllowed,true);await assert.rejects(()=>readFile(file),{code:'ENOENT'});
  const imported=await req('/api/azure/import',{id:18,revision:0},editor);assert.equal(imported.status,200);assert.equal(imported.data.state.azureIntakes[0].snapshot.root.id,18);assert.equal(imported.data.state.revision,1);assert.deepEqual(imported.data.state.phases[2].fronts,[]);
  const original=await readFile(file,'utf8');mode='fail';assert.equal((await req('/api/azure/import',{id:18,revision:1,confirmReplace:true},editor)).status,502);assert.equal(await readFile(file,'utf8'),original);
  const coordinator=(await req('/api/login',{token:'synthetic-coordinator'})).cookie;mode='ok';assert.equal((await req('/api/azure/import',{id:18,revision:1,confirmReplace:true},coordinator)).status,200);
  assert.equal((await req('/api/azure/publish',{id:18},editor)).status,404);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
