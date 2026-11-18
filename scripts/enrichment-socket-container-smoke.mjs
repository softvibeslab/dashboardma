// Verifies UID/GID 1000 can use a read-only socket mount; NO provider inference.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,chown,chmod,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {BoundedBroker,listenBroker} from '../src/onboarding-v2/hermes-broker-service.js';
import {HermesEnrichment} from '../src/onboarding-v2/hermes-enrichment.js';
import {initial} from '../src/onboarding-v2/model.js';
import {importProposal} from '../src/onboarding-v2/azure-proposal.js';
const image=process.argv[2];if(!/^dashboardma-onboarding-v2:[a-f0-9]{40}$/.test(image||''))throw Error('Exact locally available V2 image required');
const dir=await mkdtemp(path.join(process.env.TMPDIR,'v2-socket-container-')),journal=path.join(dir,'journal'),shared=path.join(dir,'socket');
await mkdir(journal,{mode:0o700});await mkdir(shared,{mode:0o710});await chown(shared,process.getuid(),1000);await chmod(shared,0o710);
const key=randomBytes(32).toString('hex'),model='synthetic-only';let calls=0;
const broker=await BoundedBroker.open({directory:journal,key,model,runtime:{execute:async()=>{calls++;return {context:'Synthetic container socket',constraints:'Not real inference',questions:[]};}}});
const server=await listenBroker({broker,socketPath:path.join(shared,'broker.sock'),socketDirectory:shared});
const actor={id:'synthetic',roles:['editor'],authenticated:true},state=importProposal(initial(),{root:{id:900002,rev:1,fields:{'System.Title':'Synthetic socket only'},comments:{items:[]}},children:[],warnings:[]},actor,{revision:0});
let payload;
await new HermesEnrichment({model,transport:async p=>{payload=p;return {context:'Capture only',constraints:'Synthetic only',questions:[]};}}).generate(state,actor,{revision:1,executionId:'synthetic-container-socket-01'});
const script=`import http from 'node:http';import {createHmac} from 'node:crypto';import {existsSync} from 'node:fs';import assert from 'node:assert/strict';const payload=${JSON.stringify(payload)},key=${JSON.stringify(key)};const body={payload,mac:createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex')};const request=body=>new Promise((resolve,reject)=>{const r=http.request({socketPath:'/run/broker/broker.sock',method:'POST',path:'/v1/onboarding/enrich',headers:{'content-type':'application/json'}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks))}));});r.on('error',reject);r.end(JSON.stringify(body));});const ok=await request(body),bad=await request({});assert.equal(ok.status,200);assert.equal(bad.status,401);assert.equal(ok.data.payload.output.context,'Synthetic container socket');assert.ok(!existsSync('/root/.hermes/auth.json'));console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),signedStatus:ok.status,unsignedStatus:bad.status,providerCredentialsMounted:false}));`;
try{
 const output=await new Promise((resolve,reject)=>{
  const child=spawn('docker',['run','--rm','-i','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--mount',`type=bind,source=${shared},target=/run/broker,readonly`,'--entrypoint','node',image,'--input-type=module'],{stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error('container-smoke-failed '+err)));child.stdin.end(script);
 });
 assert.equal(calls,1);const result={...JSON.parse(output),inference:'synthetic-runtime-only',socketReadOnlyMount:true,reportDirectory:dir};await writeFile(path.join(dir,'report.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));
}finally{await new Promise(r=>server.close(r));await broker.close();}
