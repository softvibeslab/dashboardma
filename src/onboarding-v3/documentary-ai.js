import {hash,change} from '../onboarding-v2/model.js';
import {assertGeneration,failure,applyEnrichment} from '../onboarding-v2/hermes-enrichment.js';
import {sensitive,instructions,refsFor,validateDocumentaryOutput} from '../onboarding-v2/documentary-contract.js';
export const projectSnapshot=snapshot=>({items:[snapshot.root,...(snapshot.children||[]).filter(c=>c.fields)].map(item=>({id:item.id,revision:item.rev,title:String(item.fields?.['System.Title']||''),description:String(item.fields?.['System.Description']||''),acceptanceCriteria:String(item.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria']||''),comments:(item.comments?.items||[]).map(c=>({id:c.id,version:c.version,text:String(c.text||'')})),attachments:(item.attachments||[]).map(a=>({name:String(a.name||''),status:a.status,...(a.status==='extracted'?{text:String(a.text||'')}:{})}))}))});
export const sourceRefs=snapshot=>refsFor(projectSnapshot(snapshot));
export const currentSeed=state=>{const source=state.azureIntakes?.at(-1);return state.seedVersions?.findLast(s=>s.sourceHash===source?.sourceHash)||{text:'',version:0,hash:hash(''),sourceHash:source?.sourceHash};};
export const currentSummary=state=>state.aiSummaries?.findLast(s=>s.sourceHash===state.azureIntakes?.at(-1)?.sourceHash);
function changed(state,actor,type){const next=change(state,{type:'save',phase:1,revision:state.revision,data:structuredClone(state.phases[1])},actor);next.audit.at(-1).type=type;return next;}
function authorized(state,actor,input){if(!actor?.authenticated||!actor.roles?.some(r=>['editor','coordinator'].includes(r)))throw failure(403,'forbidden');if(input.revision!==state.revision)throw failure(409,'stale-revision');const source=state.azureIntakes?.at(-1);if(!source||hash(source.snapshot)!==source.sourceHash)throw failure(409,'source-integrity');return source;}
export function saveSeed(state,actor,input){
 const source=authorized(state,actor,input);if(Object.keys(input).some(k=>!['revision','text'].includes(k))||typeof input.text!=='string'||input.text.length>4000)throw failure(400,'seed-input');if(sensitive(input.text))throw failure(400,'sensitive-input');
 const next=changed(state,actor,'ai.seed.save');next.seedVersions||=[];next.seedVersions.push({text:input.text,version:next.revision,hash:hash(input.text),sourceHash:source.sourceHash,azureRevision:source.snapshot.root.rev,actor:actor.id,at:new Date().toISOString(),kind:'human-guidance-not-azure-evidence'});return next;
}
export function reviewSummary(state,actor,input){
 authorized(state,actor,input);const summary=currentSummary(state);if(!summary||summary.version!==input.version||summary.outputHash!==input.outputHash)throw failure(409,'summary-version');const next=changed(state,actor,'ai.summary.review');next.summaryReviews||=[];next.summaryReviews.push({version:summary.version,outputHash:summary.outputHash,sourceHash:summary.sourceHash,actor:actor.id,at:new Date().toISOString(),revision:next.revision,scope:'context-only-not-approval'});return next;
}
export function derivatives(state,includeSummary=false){
 const seed=currentSeed(state),summary=currentSummary(state);
 const reviewed=summary&&state.summaryReviews?.some(r=>r.version===summary.version&&r.outputHash===summary.outputHash&&r.sourceHash===summary.sourceHash);
 if(includeSummary&&!reviewed)throw failure(409,'summary-not-reviewed');
 return {seed:{text:seed.text,version:seed.version,hash:seed.hash,kind:'human-guidance-not-evidence'},reviewedSummary:includeSummary?{version:summary.version,outputHash:summary.outputHash,sourceHash:summary.sourceHash,output:summary.output,kind:'reviewed-ai-proposal-not-independent-evidence'}:null};
}
export class DocumentaryAI{
 constructor({transport,model='',timeoutMs=45000}={}){this.transport=transport;this.model=model;this.timeoutMs=Math.min(45000,Math.max(1,timeoutMs));this.active=false;}
 configured(){return typeof this.transport==='function'&&Boolean(this.model);}
 async available(){return this.configured()&&(this.transport.health?await this.transport.health('onboarding.documentary.bounded.v2'):true);}
 preview(state,{purpose='enrich',includeSummary=false}={}){if(!['summary','enrich'].includes(purpose))throw failure(400,'purpose');const source=state.azureIntakes?.at(-1);if(!source)throw failure(409,'source-integrity');const snapshot=projectSnapshot(source.snapshot);return {schema:'onboarding.documentary.bounded.v2',purpose,sourceHash:source.sourceHash,azureRevision:source.snapshot.root.rev,snapshot,sourceRefs:refsFor(snapshot),derivatives:derivatives(state,purpose==='enrich'&&includeSummary)};}
 async generate(state,actor,input){
 assertGeneration(state,actor,input);if(!this.configured())throw failure(503,'not-configured');if(this.active)throw failure(429,'busy');
 const {azureRevision,...preview}=this.preview(state,input);const request={...preview,executionId:input.executionId,model:this.model,policy:{tools:'none',maxInputBytes:48000,maxInputTokens:48000,maxOutputTokens:2000,maxOutputBytes:32000,timeoutMs:this.timeoutMs,retry:false,instructions:instructions(input.purpose)}};
 if(sensitive(request))throw failure(400,'sensitive-input');const inputHash=hash(request),payload={...request,inputHash};if(Buffer.byteLength(JSON.stringify(payload))>48000)throw failure(413,'input-limit');
 this.active=true;let timer;const controller=new AbortController();try{
 const raw=await Promise.race([this.transport(payload,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure(504,'timeout'));},this.timeoutMs);})]);
 const output=validateDocumentaryOutput(raw,input.purpose,request.sourceRefs);
 return {revision:state.revision,executionId:input.executionId,purpose:input.purpose,actor:actor.id,model:this.model,at:new Date().toISOString(),sourceHash:request.sourceHash,azureRevision,inputHash,outputHash:hash(output),derivativesHash:hash(request.derivatives),derivatives:request.derivatives,sourceRefs:request.sourceRefs,status:'real',runtime:'stateless-llm-inference-v1',output};
 }catch(e){if(e.code)throw e;throw failure(502,'broker-failed');}finally{clearTimeout(timer);this.active=false;}
 }
}
export function applyDocumentary(state,result,actor){
 const source=assertGeneration(state,actor,result);if(result.actor!==actor.id||source.sourceHash!==result.sourceHash||result.status!=='real'||hash(result.output)!==result.outputHash)throw failure(409,'output-integrity');
 if(hash(derivatives(state,Boolean(result.derivatives.reviewedSummary)))!==result.derivativesHash)throw failure(409,'stale-derivatives');
 validateDocumentaryOutput(result.output,result.purpose,sourceRefs(source.snapshot));
 if(result.purpose==='summary'){const next=changed(state,actor,'ai.summary.generate');next.aiSummaries||=[];next.aiSummaries.push({...result,version:next.revision,status:'generated-pending-review'});return next;}
 const compatible={...result,output:{context:result.output.context+'\n\nCriterios propuestos (no Azure):\n'+result.output.criteria.map(x=>x.text+' ['+x.sourceRefs.join(', ')+']').join('\n'),constraints:result.output.constraints+'\nLimitaciones:\n'+result.output.limitations.map(x=>x.text+' ['+x.sourceRefs.join(', ')+']').join('\n'),questions:result.output.questions.map(x=>x.text+' ['+x.sourceRefs.join(', ')+']')}};compatible.outputHash=hash(compatible.output);
 const next=applyEnrichment(state,compatible,actor);next.hermesEnrichments.at(-1).documentaryResult=structuredClone(result);return next;
}
