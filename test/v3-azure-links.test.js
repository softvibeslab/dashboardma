import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createV3Server} from '../src/onboarding-v3/server.js';
import {AzureIntake} from '../src/onboarding-v2/azure-intake.js';
import {hash} from '../src/onboarding-v2/model.js';
import {renderAzureIntake} from '../public/onboarding-v3/advanced.js';
import {azureLink,resultIdentity} from '../public/onboarding-v3/azure-links.js';
import {renderImportedContext} from '../public/onboarding-v3/imported-context.js';
import {snapshotUrl,v3AzureLinks} from '../src/onboarding-v3/azure-links.js';
const canonical='https://dev.azure.com/MobileappsAmerica/agileNestCorp/_workitems/edit/2796';
const fixtureSnapshot=()=>({organization:'https://dev.azure.com/MobileappsAmerica',project:'agileNestCorp',root:{id:2796,rev:4,webUrl:canonical,fields:{'System.TeamProject':'agileNestCorp'}},children:[]});
test('V3 advanced source link is visible outside collapsed snapshot details',()=>{
 const intake={version:1,sourceHash:'synthetic',snapshot:fixtureSnapshot()};
 const html=renderAzureIntake({integrations:{azureIntake:true},actor:{roles:['editor']},azureLinks:{synthetic:canonical},state:{azureIntakes:[intake]}});
 assert.ok(html.indexOf('href="'+canonical+'"')>=0&&html.indexOf('href="'+canonical+'"')<html.indexOf('<details>'));
});
test('V3 link renderers reject malicious URL, scope or ID mismatch and escape title',async()=>{
 const item={id:2796,project:'agileNestCorp',webUrl:canonical,title:'<img src=x onerror=alert(1)>"'};
 assert.match(resultIdentity(item),/&lt;img/);assert.doesNotMatch(resultIdentity(item),/<img/);
 assert.match(azureLink(item),/target="_blank" rel="noopener noreferrer"/);
 for(const webUrl of ['javascript:alert(1)','https://evil.test/2796',canonical.replace('MobileappsAmerica','OtherOrg'),canonical.replace('agileNestCorp','OtherProject'),canonical.replace('2796','3134'),canonical+'?x=1',canonical+'#x',' '+canonical,canonical+'" onclick="alert(1)']){
  assert.equal(azureLink({...item,webUrl}),'');assert.doesNotMatch(renderImportedContext({version:1,snapshot:{...fixtureSnapshot(),root:{...fixtureSnapshot().root,webUrl}}}).summary,/<a /);
 }
 assert.equal(azureLink({...item,project:'OtherProject'}),'');assert.equal(azureLink({...item,id:'2796'}),'');
 for(const snapshot of [{...fixtureSnapshot(),organization:'https://evil.test'},{...fixtureSnapshot(),project:'OtherProject'},{...fixtureSnapshot(),root:{...fixtureSnapshot().root,fields:{'System.TeamProject':'OtherProject'}}}]){
  assert.equal(snapshotUrl(snapshot),null);assert.doesNotMatch(renderImportedContext({version:1,snapshot},canonical).summary,/<a /);
  await assert.rejects(v3AzureLinks({read:async()=>snapshot}).read(2796),/proyecto/);
 }
});
test('V3 search and explicit import retain canonical source URL, version, hash and audit without Azure writes',async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'v3-links-'));const calls=[];
 const azureIntake=new AzureIntake({token:'synthetic',importPolicy:'project',allowedProject:'agileNestCorp',fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({path:u.pathname,method:options.method});
  if(u.pathname.endsWith('/wiql'))return Response.json({workItems:[{id:2796}]});
  const item={id:2796,rev:4,url:'javascript:alert(1)',_links:{html:{href:'https://evil.test/2796'}},fields:{'System.TeamProject':'agileNestCorp','System.Title':'Synthetic <title>','System.WorkItemType':'User Story','System.State':'New'},relations:[]};
  if(u.pathname.endsWith('/workitems'))return Response.json({value:[item]});
  if(u.pathname.endsWith('/comments'))return Response.json({comments:[]});
  return Response.json(item);
 }});
 const server=createV3Server({authMode:'local-review',dataFile:path.join(dir,'state.json'),staffingRequired:false,users:[{id:'fixture',roles:['editor'],token:'synthetic-link-test-token'}],azureIntake});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/dashboard/onboarding-v3';let cookie='';
 const req=(route,data,headers={})=>fetch(base+route,{method:data?'POST':'GET',headers:{cookie,origin,'content-type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});
 try{
  assert.equal((await req('/api/azure/search?q=2796')).status,401);
  cookie=(await req('/api/login',{token:'synthetic-link-test-token'})).headers.get('set-cookie').split(';')[0];
  const search=await (await req('/api/azure/search?q=2796')).json();assert.equal(search.items[0].webUrl,canonical);
  assert.equal((await (await req('/api/state')).json()).state.revision,0,'Search does not import');
  assert.equal((await req('/api/azure/import',{id:2796,revision:0},{origin:'https://evil.test'})).status,403);
  const imported=await (await req('/api/azure/import',{id:2796,revision:0})).json();
  assert.equal(imported.state.revision,1);const intake=imported.state.azureIntakes[0];
  assert.equal(intake.snapshot.root.webUrl,canonical);assert.equal(intake.sourceHash,hash(intake.snapshot));assert.equal(intake.version,1);
  assert.equal(imported.state.phases[1].sources[0].text,canonical);assert.equal(imported.state.audit.at(-1).type,'azure.import');
  assert.equal((await req('/api/azure/import',{id:2796,revision:1})).status,409,'Replacement needs explicit confirmation');
  const before=await readFile(path.join(dir,'state.json'),'utf8');const reloaded=await (await req('/api/state')).json();
  assert.equal(reloaded.azureLinks[intake.sourceHash],canonical);assert.equal(await readFile(path.join(dir,'state.json'),'utf8'),before,'GET never migrates state');
  // A pre-link snapshot receives only a derived presentation URL; its original/hash stays intact.
  const legacy=structuredClone(reloaded.state);delete legacy.azureIntakes[0].snapshot.root.webUrl;legacy.azureIntakes[0].sourceHash=hash(legacy.azureIntakes[0].snapshot);
  await writeFile(path.join(dir,'state.json'),JSON.stringify(legacy));const legacyBytes=await readFile(path.join(dir,'state.json'),'utf8');
  const oldView=await (await req('/api/state')).json();assert.equal(oldView.azureLinks[legacy.azureIntakes[0].sourceHash],canonical);
  assert.match(renderImportedContext(oldView.state.azureIntakes[0],oldView.azureLinks[legacy.azureIntakes[0].sourceHash]).summary,/Abrir en Azure/);
  assert.equal(await readFile(path.join(dir,'state.json'),'utf8'),legacyBytes);assert.deepEqual(oldView.state,legacy);
  assert.equal((await (await req('/api/azure/search?q=Synthetic')).json()).items[0].webUrl,canonical,'Title search retained');
  assert.ok(calls.every(c=>c.method==='GET'||c.method==='POST'&&c.path.endsWith('/wiql')),'Only read endpoints');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
