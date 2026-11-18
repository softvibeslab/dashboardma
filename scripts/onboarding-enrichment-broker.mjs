// Dedicated HOST broker. Never run inside the dashboard container or gateway.
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {BoundedBroker,StatelessCodexRuntime,listenBroker} from '../src/onboarding-v2/hermes-broker-service.js';
let broker,server;
try{
 const config=process.argv[2];
 if(!config||!path.isAbsolute(config))throw Error('configuration');
 const info=await lstat(config);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>4096)throw Error('configuration');
 const options=JSON.parse(await readFile(config,'utf8'));
 if(!['authorized,directory,key,model','authorized,directory,key,model,socketDirectory'].includes(Object.keys(options).sort().join(','))||options.authorized!==true)throw Error('configuration');
 const runtime=new StatelessCodexRuntime({authorized:options.authorized,model:options.model});
 broker=await BoundedBroker.open({...options,runtime});
 server=await listenBroker({broker,socketDirectory:options.socketDirectory||options.directory,socketPath:path.join(options.socketDirectory||options.directory,'broker.sock')});
 let stopping=false;
 const stop=async()=>{
  if(stopping)return;stopping=true;
  // Existing inference completes under its own <=45s deadline; no fresh connections.
  await new Promise(r=>server.close(r));
  while(broker.active)await new Promise(r=>setTimeout(r,20));
  await broker.close();process.exit(0);
 };
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
 console.log('broker-ready stateless-llm Unix-only');
}catch{
 if(server)await new Promise(r=>server.close(r));
 if(broker&&!broker.active)await broker.close();
 console.error('broker-start-failed');process.exitCode=2;
}
