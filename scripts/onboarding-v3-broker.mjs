// Dedicated credential-free non-root supervisor client; never a Hermes agent.
import {readFile,lstat} from 'node:fs/promises';import path from 'node:path';
import {BoundedBroker,listenBroker} from '../src/onboarding-v2/hermes-broker-service.js';
import {SupervisedSocketRuntime} from '../src/onboarding-v3/supervised-runtime.js';
let broker,server;
try{
 const file=process.argv[2];if(!file||!path.isAbsolute(file))throw Error('config');const info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>4096)throw Error('config');
 const options=JSON.parse(await readFile(file,'utf8'));
 if(Object.keys(options).sort().join(',')!=='authorized,directory,key,model,socketDirectory,workerSocket'||options.authorized!==true)throw Error('config');
 const runtime=new SupervisedSocketRuntime({socketPath:options.workerSocket,model:options.model});await runtime.audit();
 broker=await BoundedBroker.open({...options,runtime});server=await listenBroker({broker,socketDirectory:options.socketDirectory,socketPath:path.join(options.socketDirectory,'broker.sock')});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await new Promise(r=>server.close(r));while(broker.active)await new Promise(r=>setTimeout(r,20));await broker.close();process.exit(0);};
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());console.log('v3-broker-ready isolated-stateless-llm no-provider-credentials');
}catch{if(server)await new Promise(r=>server.close(r));if(broker&&!broker.active)await broker.close();console.error('v3-broker-start-failed');process.exitCode=2;}
