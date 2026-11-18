import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const key='synthetic-only-broker-key-000000000000000000000000';
test('Unix broker transport sends signed bounded contract, rejects wrong binding and response size',async()=>{
 const {brokerTransport}=await import('../src/onboarding-v2/hermes-broker.js');const dir=await mkdtemp(path.join(process.env.TMPDIR,'v2-broker-')),socketPath=path.join(dir,'broker.sock');let mode='good';
 const request={executionId:'synthetic-execution-0001',inputHash:'input',sourceHash:'source',model:'synthetic',policy:{tools:'none'}};
 const server=http.createServer(async(req,res)=>{assert.equal(req.url,'/v1/onboarding/enrich');const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.mac,createHmac('sha256',key).update(JSON.stringify(body.payload)).digest('hex'));
 const payload={schema:'onboarding.hermes.result.v1',runtime:'stateless-llm-inference-v1',executionId:request.executionId,inputHash:'input',sourceHash:'source',model:'synthetic',toolsExecuted:mode==='binding'?1:0,output:{context:'Synthetic',constraints:'Unknown',questions:[]}};
 res.end(mode==='oversized'?'x'.repeat(40001):JSON.stringify({payload,mac:createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex')}));});await new Promise(r=>server.listen(socketPath,r));
 try{const call=brokerTransport({socketPath,key,approved:true});assert.equal((await call(request,new AbortController().signal)).context,'Synthetic');mode='binding';await assert.rejects(()=>call(request,new AbortController().signal),e=>e.code==='broker-binding');mode='oversized';await assert.rejects(()=>call(request,new AbortController().signal));}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('specialized broker accepts only MAC-authenticated bound output; no generic proxy fallback',async()=>{
 const {brokerTransport}=await import('../src/onboarding-v2/hermes-broker.js');
 const request={executionId:'synthetic-execution-0001',inputHash:'input',sourceHash:'source',model:'synthetic',policy:{timeoutMs:50}};
 let sent;
 const transport=brokerTransport({socketPath:'/private/broker.sock',key,approved:true,exchange:async(body,signal)=>{sent=body;assert.ok(signal);const payload={schema:'onboarding.hermes.result.v1',runtime:'stateless-llm-inference-v1',executionId:request.executionId,inputHash:'input',sourceHash:'source',model:'synthetic',toolsExecuted:0,output:{context:'proposal',constraints:'unknown',questions:[]}};return {payload,mac:createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex')};}});
 assert.deepEqual(await transport(request,new AbortController().signal),{context:'proposal',constraints:'unknown',questions:[]});assert.ok(sent.mac);assert.equal(sent.payload.executionId,request.executionId);
 assert.equal(brokerTransport({socketPath:'/private/broker.sock',key}),undefined);
 const tampered=brokerTransport({socketPath:'/private/broker.sock',key,approved:true,exchange:async()=>({payload:{},mac:'0'.repeat(64)})});await assert.rejects(()=>tampered(request,new AbortController().signal));
});
