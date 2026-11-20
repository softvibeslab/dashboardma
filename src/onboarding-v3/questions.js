import {hash,digest,objects} from '../onboarding-v2/model.js';
import {failure} from '../onboarding-v2/hermes-enrichment.js';
import {sensitive} from '../onboarding-v2/documentary-contract.js';
const fail=(status,code)=>{throw failure(status,code);};
export const questionHash=(s,q)=>hash({question:q.question,blocking:q.blocking,source:s.azureIntakes?.at(-1)?.sourceHash||null,sources:s.phases[1].sources||[]});
export function questionView(s,users=[]){return (s.phases[1].questions||[]).map(q=>{
 const record=s.questionRecords?.[q.id]||{},qh=questionHash(s,q),versions=record.versions||[];
 const last=versions.at(-1),matches=last&&last.text===q.answer&&last.rationale===q.rationale&&last.questionHash===qh;
 const answerHash=hash({text:q.answer||'',rationale:q.rationale||'',questionHash:qh});
 const version=matches?last.version:0;
 const decision=(record.decisions||[]).findLast(d=>d.answerHash===answerHash&&d.questionHash===qh&&d.version===version&&d.assignmentHash===hash(record.assignment||{}));
 const assignment=record.assignment||{};
 const responder=users.find(u=>u.id===assignment.responder&&u.roles.includes('editor'));
 const reviewer=users.find(u=>u.id===assignment.reviewer&&u.roles.includes('reviewer')&&u.id!==assignment.responder);
 const status=decision?.type==='approve'&&responder&&reviewer?'approved':decision?.type==='return'?'returned':matches?last.status:q.answer?.trim()?'draft':'pending';
 return {...q,category:record.category||'product',area:record.area||'',suggestedRole:record.suggestedRole||'Pendiente de clasificación humana',assignment,assignmentStatus:responder?'confirmed':'pending',reviewerAvailable:Boolean(reviewer),questionHash:qh,answerHash,version,status,approval:status==='approved'?decision:null,versions:structuredClone(versions),decisions:structuredClone(record.decisions||[]),suggestions:structuredClone(record.suggestions||[])};
});}
export function questionBlockers(s,users){return questionView(s,users).filter(q=>q.blocking&&q.status!=='approved').map(q=>`${q.id}: respuesta y aprobación individual vigentes pendientes${q.reviewerAvailable?'':'; sin revisor independiente autorizado'}.`);}
export function questionChange(state,actor,a,users){
 if(!actor?.authenticated)fail(401,'unauthenticated');if(a.revision!==state.revision)fail(409,'stale-revision');
 const before=questionView(state,users).find(q=>q.id===a.id);if(!before)fail(404,'question');
 const s=structuredClone(state),q=s.phases[1].questions.find(q=>q.id===a.id);s.questionRecords||={};const r=s.questionRecords[q.id]||={versions:[],decisions:[],suggestions:[]};
 const at=new Date().toISOString();
 const fields={assign:['responder','reviewer','category','area','suggestedRole'],answer:['text','rationale','status'],approve:['answerHash','questionHash','version'],return:['answerHash','questionHash','version','reason'],discard:['executionId']};
 if(!fields[a.type]||Object.keys(a).some(k=>!['type','id','revision',...fields[a.type]].includes(k)))fail(400,'question-input');
 if(a.type==='assign'){
  if(!actor.roles.includes('coordinator'))fail(403,'forbidden');
  if(!users.some(u=>u.id===a.responder&&u.roles.includes('editor')))fail(400,'responder-identity');
  if(a.reviewer&&(!users.some(u=>u.id===a.reviewer&&u.roles.includes('reviewer'))||a.reviewer===a.responder))fail(400,'independent-reviewer');
  if(a.category&&!['technical','product','commercial'].includes(a.category))fail(400,'category');
  for(const k of ['area','suggestedRole'])if(a[k]!==undefined&&(typeof a[k]!=='string'||a[k].length>200))fail(400,'classification');
  r.assignment={responder:a.responder,reviewer:a.reviewer||'',actor:actor.id,at};for(const k of ['category','area','suggestedRole'])if(a[k]!==undefined)r[k]=a[k];
 }else if(a.type==='answer'){
  if(!actor.roles.includes('editor')||(r.assignment?.responder&&r.assignment.responder!==actor.id))fail(403,'forbidden-responder');
  if(typeof a.text!=='string'||a.text.length>8000||typeof a.rationale!=='string'||a.rationale.length>4000||!['draft','ready-review'].includes(a.status)||sensitive([a.text,a.rationale]))fail(400,'answer-input');
  if(a.status==='ready-review'&&(!a.text.trim()||!a.rationale.trim()||!r.assignment?.responder))fail(409,'answer-not-ready');
  q.answer=a.text;q.rationale=a.rationale;const qh=questionHash(s,q);r.versions.push({version:(r.versions.at(-1)?.version||0)+1,text:a.text,rationale:a.rationale,status:a.status,questionHash:qh,answerHash:hash({text:a.text,rationale:a.rationale,questionHash:qh}),sourceHash:s.azureIntakes?.at(-1)?.sourceHash||null,actor:actor.id,at});
 }else if(a.type==='discard'){
  if(!actor.roles.includes('editor')||r.assignment?.responder&&r.assignment.responder!==actor.id)fail(403,'forbidden');const suggestion=r.suggestions.find(x=>x.executionId===a.executionId);if(!suggestion)fail(404,'suggestion');suggestion.discarded={actor:actor.id,at};
 }else{
  if(!actor.roles.includes('reviewer')||r.assignment?.reviewer!==actor.id||r.assignment?.responder===actor.id)fail(403,'forbidden-reviewer');
  if(before.status!=='ready-review'||a.answerHash!==before.answerHash||a.questionHash!==before.questionHash||a.version!==before.version||!before.version)fail(409,'exact-version');
  if(a.type==='return'&&(typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>2000))fail(400,'return-reason');
  r.decisions.push({type:a.type,answerHash:a.answerHash,questionHash:a.questionHash,version:a.version,assignmentHash:hash(r.assignment),actor:actor.id,roles:['reviewer'],at,...(a.type==='return'?{reason:a.reason}:{})});
 }
 // Exact question authorization above is independent of phase-wide editor permissions.
 s.history.push({revision:state.revision,phases:structuredClone(state.phases),hash:digest(state)});
 s.epochs||={};for(const object of objects(s))s.epochs[object]=(s.epochs[object]||0)+1;
 s.phases[4].humanReview=false;s.phases[5].reviewed=false;s.revision++;
 s.audit.push({type:'question.'+a.type,actor:actor.id,revision:s.revision,at});return s;
}
