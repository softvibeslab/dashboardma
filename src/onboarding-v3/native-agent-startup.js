import {lstat,readFile} from 'node:fs/promises';
import {HermesAgentEngine,nativeAgentTransport,scopeResolverFromBindings} from './hermes-agent-engine.js';
/** Startup-only switch: preserve the existing engine until a real native handshake
 * admits every purpose. Never retry a failed admitted turn through another model.
 */
export async function chooseStartupDocumentaryAI({existing,native=null,authorized=false}={}){
 if(!authorized)return {documentaryAI:existing,selection:'controlled-native-not-authorized'};
 try{
  if(native?.engine?.kind==='hermes-agent'&&(await Promise.all(['summary','enrich','question'].map(p=>native.available(p)))).every(Boolean))return {documentaryAI:native,selection:'native-ready'};
 }catch{}
 return {documentaryAI:existing,selection:'controlled-native-not-ready'};
}
async function privateText(file,maxBytes){
 if(typeof file!=='string'||!file.startsWith('/'))throw Error('native-private-file');
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.mode&0o077||info.size>maxBytes)throw Error('native-private-file');
 return readFile(file,'utf8');
}
export async function documentaryAIFromEnvironment(existing,env=process.env){
 if(env.V3_NATIVE_AGENT_AUTHORIZED!=='true')return chooseStartupDocumentaryAI({existing});
 try{
  const bindings=JSON.parse(await privateText(env.V3_NATIVE_AGENT_BINDINGS_FILE,96000)),key=(await privateText(env.V3_NATIVE_AGENT_KEY_FILE,4096)).trim();
  if(!Array.isArray(bindings)||bindings.length===0)throw Error('native-bindings-empty');
  const native=new HermesAgentEngine({transport:nativeAgentTransport({socketPath:env.V3_NATIVE_AGENT_SOCKET||'',key,authorized:true}),scopeResolver:scopeResolverFromBindings(bindings)});
  return chooseStartupDocumentaryAI({existing,native,authorized:true});
 }catch{return {documentaryAI:existing,selection:'controlled-native-configuration-invalid'};}
}
