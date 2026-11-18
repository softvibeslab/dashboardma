import http from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {failure} from './hermes-enrichment.js';
const sign=(key,payload)=>createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');
// Dedicated Unix socket only. Never talks to provider APIs, CLI, gateway, or auth pools.
export function brokerTransport({socketPath='',key='',approved=false,exchange}={}){
 if(!approved||!socketPath.startsWith('/')||key.length<32)return undefined;
 const call=exchange||((body,signal)=>new Promise((resolve,reject)=>{
 const req=http.request({socketPath,path:'/v1/onboarding/enrich',method:'POST',signal,headers:{'content-type':'application/json'}},res=>{
 let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>40000){res.destroy();reject(failure(502,'broker-output-limit'));}else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{try{if(res.statusCode!==200)throw failure(502,'broker-status');resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(failure(502,'broker-response'));}});
 });req.on('error',reject);req.end(JSON.stringify(body));
 }));
 return async(request,signal)=>{
 const envelope=await call({payload:request,mac:sign(key,request)},signal);
 const {payload,mac}=envelope||{};
 if(!payload||typeof mac!=='string'||!/^[a-f0-9]{64}$/.test(mac)||!timingSafeEqual(Buffer.from(mac),Buffer.from(sign(key,payload))))throw failure(502,'broker-auth');
 if(payload.schema!=='onboarding.hermes.result.v1'||payload.runtime!=='stateless-llm-inference-v1'||payload.executionId!==request.executionId||payload.inputHash!==request.inputHash||payload.sourceHash!==request.sourceHash||payload.model!==request.model||payload.toolsExecuted!==0)throw failure(502,'broker-binding');
 return payload.output;
 };
}
