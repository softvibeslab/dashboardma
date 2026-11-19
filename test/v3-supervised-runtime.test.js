import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SupervisedSocketRuntime} from '../src/onboarding-v3/supervised-runtime.js';
test('supervised runtime uses fixed private socket and requires complete isolation audit',async()=>{
 const d=await mkdtemp(path.join(os.tmpdir(),'v3-worker-test-'));const socketPath=path.join(d,'worker.sock');
 const seen=[];const server=net.createServer(s=>{const b=[];s.on('data',c=>b.push(c));s.on('end',()=>{const p=JSON.parse(Buffer.concat(b));seen.push(p);s.end(JSON.stringify(p.auditSandbox?{isolatedPython:true,noSite:true,hostMemoriesHidden:true,hermesCodeHidden:true,readOnlyAuth:true,credentialReady:true}:{output:{context:'synthetic',constraints:'review',questions:[]},usage:{output_tokens:8}}));});});
 await new Promise(r=>server.listen(socketPath,r));
 try{const runtime=new SupervisedSocketRuntime({socketPath,model:'gpt-6.1-sol'});assert.equal((await runtime.audit()).credentialReady,true);assert.deepEqual(await runtime.execute({model:'gpt-6.1-sol',policy:{timeoutMs:1000}}),{context:'synthetic',constraints:'review',questions:[]});assert.equal(seen.length,2);assert.equal(runtime.lastUsage.output_tokens,8);await assert.rejects(runtime.execute({model:'bad',policy:{timeoutMs:1000}}));}finally{await new Promise(r=>server.close(r));await rm(d,{recursive:true,force:true});}
});
test('supervised runtime fails closed without socket or readiness',async()=>{
 assert.throws(()=>new SupervisedSocketRuntime({socketPath:'relative',model:'gpt-6.1-sol'}));
 const runtime=new SupervisedSocketRuntime({socketPath:'/run/nonexistent-v3-worker.sock',model:'gpt-6.1-sol'});await assert.rejects(runtime.audit());
});
