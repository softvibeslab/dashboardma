import {lstat,readFile} from 'node:fs/promises';
import {HermesAgentEngine,nativeAgentTransport,scopeResolverFromBindings,bindingSetHash} from './hermes-agent-engine.js';
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
 if(env.V3_NATIVE_AGENT_AUTHORIZED!=='true')return {...await chooseStartupDocumentaryAI({existing}),gate:'native-not-opted-in'};
 try{
  for(const [name,gate] of [['V3_NATIVE_AGENT_BINDINGS_FILE','native-bindings-unconfigured'],['V3_NATIVE_AGENT_KEY_FILE','native-key-unconfigured'],['V3_NATIVE_AGENT_SOCKET','native-socket-unconfigured']])if(!env[name])return {documentaryAI:existing,selection:'controlled-native-configuration-invalid',gate};
  const bindings=JSON.parse(await privateText(env.V3_NATIVE_AGENT_BINDINGS_FILE,96000)),key=(await privateText(env.V3_NATIVE_AGENT_KEY_FILE,4096)).trim();
  if(!Array.isArray(bindings)||bindings.length===0)return {documentaryAI:existing,selection:'controlled-native-configuration-invalid',gate:'native-bindings-empty'};
  const native=new HermesAgentEngine({transport:nativeAgentTransport({socketPath:env.V3_NATIVE_AGENT_SOCKET,key,authorized:true,expectedBindingsHash:bindingSetHash(bindings)}),scopeResolver:scopeResolverFromBindings(bindings)});
  const result=await chooseStartupDocumentaryAI({existing,native,authorized:true});
  return {...result,gate:result.selection==='native-ready'?'native-ready':'native-binding-or-capability-not-ready'};
 }catch{return {documentaryAI:existing,selection:'controlled-native-configuration-invalid',gate:'native-private-configuration-unreadable-or-invalid'};}
}
