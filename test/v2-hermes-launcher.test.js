import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
test('standalone broker launcher is authenticated Unix-only and cleans ownership without inference',{timeout:5000},async()=>{
 const dir=await mkdtemp(path.join(process.env.TMPDIR,'broker-launch-'));
 const file=path.join(dir,'config.json'),socketPath=path.join(dir,'broker.sock');
 await writeFile(file,JSON.stringify({directory:dir,key:'synthetic-client-key-longer-than-32-chars',model:'gpt-6.1-sol',authorized:true}),{mode:0o600});
 const child=spawn(process.execPath,['scripts/onboarding-enrichment-broker.mjs',file],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 try{
  for(let i=0;i<100;i++){if(output.includes('broker-ready'))break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(output.includes('broker-ready'),output);
  assert.equal((await stat(socketPath)).mode&0o777,0o600);
  const status=await new Promise((resolve,reject)=>{const req=http.request({socketPath,method:'POST',path:'/v1/onboarding/enrich',headers:{'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{}');});
  assert.equal(status,401);
  assert.ok(!output.includes('synthetic-client-key'));
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await rm(dir,{force:true,recursive:true});}
});
