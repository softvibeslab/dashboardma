import net from 'node:net';
// Only the dedicated non-root broker can access this root-owned socket.
// The socket-activated helper has one immutable bwrap ExecStart, never a shell.
export class SupervisedSocketRuntime {
 constructor({socketPath,model}){if(!socketPath?.startsWith('/')||model!=='gpt-6.1-sol')throw Error('worker-configuration');this.socketPath=socketPath;this.model=model;}
 async audit(){const value=await this.call({auditSandbox:true},3000);for(const key of ['isolatedPython','noSite','hostMemoriesHidden','hermesCodeHidden','readOnlyAuth','credentialReady'])if(value[key]!==true)throw Error('worker-isolation-unavailable');return value;}
 async execute(payload,signal){if(payload.model!==this.model)throw Error('worker-model');const value=await this.call(payload,Math.min(45000,payload.policy.timeoutMs),signal);if(!value.output||!value.usage)throw Error('worker-output');this.lastUsage=value.usage;return value.output;}
 call(payload,timeoutMs,signal){return new Promise((resolve,reject)=>{
  const socket=net.createConnection({path:this.socketPath,allowHalfOpen:true});const chunks=[];let size=0,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.destroy();error?reject(error):resolve(value);};
  const abort=()=>finish(Error('worker-aborted'));const timer=setTimeout(()=>finish(Error('worker-timeout')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  socket.on('connect',()=>socket.end(JSON.stringify(payload)));
  socket.on('data',c=>{size+=c.length;if(size>35000)finish(Error('worker-output-limit'));else chunks.push(c);});
  socket.on('error',e=>finish(e));socket.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks)));}catch{finish(Error('worker-failed'));}});
 });}
}
