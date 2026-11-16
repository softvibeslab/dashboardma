import test from 'node:test';
import assert from 'node:assert/strict';

test('first-level children are capped at ten without recursive traversal',async()=>{
 const {AzureIntake}=await import('../src/onboarding-v2/azure-intake.js');let itemsRead=0;
 const client=new AzureIntake({token:'synthetic',allowedIds:[1],fetcher:async url=>{const u=new URL(url);if(u.pathname.endsWith('/comments'))return Response.json({comments:[]});itemsRead++;const id=Number(u.pathname.split('/').at(-1));return Response.json({id,rev:1,fields:{'System.TeamProject':'agileNestCorp'},relations:Array.from({length:id===1?11:1},(_,n)=>({rel:'System.LinkTypes.Hierarchy-Forward',url:`https://dev.azure.com/MobileappsAmerica/agileNestCorp/_apis/wit/workitems/${id===1?n+2:999}`}))});}});
 const snapshot=await client.read(1);assert.equal(snapshot.children.length,10);assert.equal(itemsRead,11);assert.ok(snapshot.warnings.some(w=>w.includes('truncados')));assert.ok(!snapshot.children.some(c=>c.id===999));
});

test('security boundaries reject redirects, cross-org URLs, oversized bodies and mismatched projects',async()=>{
 const {AzureIntake}=await import('../src/onboarding-v2/azure-intake.js');const client=new AzureIntake({token:'never-return-me',allowedIds:[1],fetcher:async()=>new Response('sensitive Azure failure',{status:302,headers:{location:'https://evil.test/'}})});
 for(const u of ['http://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/a','https://dev.azure.com.evil.test/MobileappsAmerica/_apis/wit/attachments/a','https://dev.azure.com/OtherOrg/_apis/wit/attachments/a','https://user:pass@dev.azure.com/MobileappsAmerica/_apis/wit/attachments/a','https://127.0.0.1/MobileappsAmerica/_apis/wit/attachments/a','https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/a#x'])assert.equal(client.safeUrl(u),null);
 await assert.rejects(()=>client.read(1),e=>e.status===502&&!e.message.includes('sensitive'));
 client.fetcher=async()=>new Response('x'.repeat(1024*1024+1));await assert.rejects(()=>client.read(1),/límite/);
 client.fetcher=async()=>Response.json({id:1,rev:1,fields:{'System.TeamProject':'OtherProject'}});await assert.rejects(()=>client.read(1),/proyecto/);
});

test('unsupported attachments remain metadata-only, attachment failures explicit and comment continuation bounded',async()=>{
 const {AzureIntake}=await import('../src/onboarding-v2/azure-intake.js');let downloads=0;
 const client=new AzureIntake({token:'synthetic',allowedIds:[1],fetcher:async url=>{const u=new URL(url);
 if(u.pathname.includes('/attachments/')){downloads++;return new Response('x'.repeat(256*1024+1));}
 if(u.pathname.endsWith('/comments'))return Response.json({comments:[],continuationToken:'repeated'});
 return Response.json({id:1,rev:2,fields:{'System.TeamProject':'agileNestCorp'},relations:[{rel:'AttachedFile',url:'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/a',attributes:{name:'file.pdf'}},{rel:'AttachedFile',url:'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/b',attributes:{name:'file.txt'}}]});}});
 const s=await client.read(1);assert.equal(downloads,1);assert.equal(s.root.attachments[0].status,'metadata-only');assert.equal(s.root.attachments[1].status,'failed');assert.equal(s.root.comments.status,'partial');
});

test('Azure child project GUID references are canonicalized to configured project, partial failures are explicit',async()=>{
 const {AzureIntake}=await import('../src/onboarding-v2/azure-intake.js');const calls=[];
 const client=new AzureIntake({token:'synthetic',allowedIds:[1],fetcher:async url=>{calls.push(String(url));const u=new URL(url);if(u.pathname.endsWith('/comments'))return new Response('private error contains secret',{status:500});if(u.pathname.endsWith('/2'))return new Response('',{status:404});return Response.json({id:1,rev:1,fields:{'System.TeamProject':'agileNestCorp'},relations:[{rel:'System.LinkTypes.Hierarchy-Forward',url:'https://dev.azure.com/MobileappsAmerica/00000000-0000-0000-0000-000000000001/_apis/wit/workItems/2'}]});}});
 const s=await client.read(1);assert.equal(s.children.length,1);assert.equal(s.children[0].status,'failed');assert.equal(s.root.comments.status,'partial');assert.ok(!JSON.stringify(s).includes('private error'));assert.ok(calls.some(u=>u.includes('/agileNestCorp/_apis/wit/workitems/2')));
});

test('Azure read-only intake reads full fields, paginated comments, bounded children and safe text attachments',async()=>{
 let mod;try{mod=await import('../src/onboarding-v2/azure-intake.js');}catch{assert.fail('Azure intake connector missing');}
 const calls=[];
 const fetcher=async(url,opts)=>{calls.push({url:String(url),opts});const u=new URL(url);let data;
 if(u.pathname.includes('/attachments/'))return new Response('evidence text',{headers:{'content-type':'text/plain'}});
 if(u.pathname.endsWith('/comments'))data=u.searchParams.has('continuationToken')?{comments:[{id:2,version:2,text:'second'}]}:{comments:[{id:1,version:1,text:'first'}],continuationToken:'next'};
 else {const id=Number(u.pathname.split('/').at(-1));data={id,rev:15,fields:{'System.TeamProject':'agileNestCorp','System.Title':'Reported issue','System.Description':'Original description','Custom.Example':'complete'},relations:id===3134?[{rel:'System.LinkTypes.Hierarchy-Forward',url:'https://dev.azure.com/MobileappsAmerica/agileNestCorp/_apis/wit/workItems/3135'},{rel:'AttachedFile',url:'https://dev.azure.com/MobileappsAmerica/_apis/wit/attachments/abc',attributes:{name:'safe.txt'}},{rel:'AttachedFile',url:'https://evil.test/file',attributes:{name:'bad.txt'}}]:[]};}
 return Response.json(data);
 };
 const client=new mod.AzureIntake({token:'synthetic-secret',allowedIds:[3134],fetcher});
 const snapshot=await client.read(3134);
 assert.equal(snapshot.root.fields['Custom.Example'],'complete');assert.equal(snapshot.root.rev,15);
 assert.equal(snapshot.root.comments.items.length,2);assert.equal(snapshot.root.comments.sourceRevision,15);assert.match(snapshot.root.comments.url,/workitems\/3134\/comments/);assert.equal(snapshot.children.length,1);
 assert.equal(snapshot.root.attachments[0].text,'evidence text');assert.equal(snapshot.root.attachments[1].status,'metadata-only');
 assert.ok(snapshot.root.fetchedAt);assert.ok(snapshot.root.comments.fetchedAt);
 assert.ok(calls.every(c=>new URL(c.url).hostname==='dev.azure.com'&&c.opts.redirect==='error'&&c.opts.method==='GET'));
 assert.ok(!JSON.stringify(snapshot).includes('synthetic-secret'));
 await assert.rejects(()=>client.read(3135),/permitido/);
 await assert.rejects(()=>client.read('3134x'),/ID/);
});
