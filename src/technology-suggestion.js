import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { redact } from './enrichment.js';
const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const active = run => ['queued', 'running'].includes(run?.status);
const sanitize = v => Array.isArray(v) ? v.map(sanitize) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,v])=>[k,sanitize(v)])) : typeof v === 'string' ? redact(v,12000) : v;
const approved = q => q.answerStatus === 'approved' && q.answer && q.answerHistory?.at(-1)?.action === 'approve' && q.answerHistory.at(-1).hash === crypto.createHash('sha256').update(q.answer).digest('hex');
export function validTechnologyTracks(tracks, candidates) {
 return Array.isArray(tracks) && tracks.length >= 1 && tracks.length <= 8 && tracks.every(t => {
  const candidate = candidates.find(c=>c.email === t?.ownerEmail);
  return t && Object.keys(t).sort().join() === ['technology','area','ownerEmail','confidence','rationale','evidenceIds'].sort().join()
   && ['technology','area','rationale'].every(k=>typeof t[k] === 'string' && t[k].trim() && t[k].length <= (k === 'rationale' ? 1500 : 100))
   && ['low','medium','high'].includes(t.confidence) && Array.isArray(t.evidenceIds) && t.evidenceIds.length <= 20
   && (t.ownerEmail === '' ? t.evidenceIds.length === 0 && t.confidence === 'low' : candidate && t.evidenceIds.length > 0 && t.evidenceIds.every(id=>candidate.assignmentIds.includes(id)));
 }) && new Set(tracks.map(t=>`${t.technology.toLowerCase()}\0${t.area.toLowerCase()}`)).size === tracks.length;
}
export class TechnologySuggestion {
 constructor(wizard, workspace) { this.wizard=wizard; this.workspace=workspace; this.state=wizard.state; }
 async context(requirementId, state) {
  const {data,requirement,versions}=await this.wizard.context(requirementId);
  const flow=state.flows.find(f=>f.id===requirementId) || this.wizard.initial(requirementId,versions);
  const version=data.requirementVersions.find(v=>v.id===flow.versionId && v.requirementId===requirementId);
  const candidates=data.users.filter(u=>u.syncSource==='azure-devops' && u.azureIdentityKey && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email || '') && u.projects?.includes(requirement.project)).map(u=>({email:u.email,team: u.projects.length===1 ? redact(u.team,150) : 'Proyecto compartido; equipo específico pendiente', assignmentIds:data.workItems.filter(w=>w.syncSource==='azure-devops' && w.project===requirement.project && w.assignedUserId===u.id).map(w=>w.id).sort().slice(0,20),evidence:'Usuario sincronizado en el proyecto; asignación no demuestra especialidad ni disponibilidad.'})).sort((a,b)=>a.email.localeCompare(b.email));
  for (const candidate of candidates) candidate.assignments = candidate.assignmentIds.map(id => {
   const item = data.workItems.find(w => w.id === id && w.syncSource === 'azure-devops' && w.project === requirement.project);
   return { id, project: requirement.project, title: redact(item?.title,500), type: redact(item?.type,100), evidence: 'Asignación sincronizada; pertinencia y especialidad requieren revisión humana.' };
  });
  if(candidates.length>100) throw fail(413,'Más de cien candidatos del proyecto; acota el alcance antes de consultar.');
  const questions=data.requirementQuestions.filter(q=>q.requirementId===requirementId && q.versionId===flow.versionId);
  const snapshot={schemaVersion:1,kind:'technology-suggestion',requirement:{id:requirement.id,title:redact(requirement.title,500),description:redact(requirement.description),project:requirement.project}, selectedVersion:sanitize(version || null),approvedAnswers:questions.filter(approved).map(q=>({id:q.id,question:redact(q.question),answer:redact(q.answer),revision:q.answerRevision,hash:q.answerHistory.at(-1).hash})),candidates,evidenceBoundary:'Solo versión seleccionada y respuestas aprobadas. Sin inspección de repositorios ni URLs; asignaciones Azure no prueban habilidades. Propuesta pendiente de corrección y guardado humano.'};
  const fingerprint=hash({requirement,version,questions,sources:data.requirementSources.filter(s=>s.requirementId===requirementId),candidates,stage:flow.stage,revision:flow.revision});
  return {flow,version,candidates,snapshot,hash:fingerprint};
 }
 async reconcileAll() {
  const state=await this.state.read();
  for(const id of new Set((state.technologyJobs || []).filter(active).map(j=>j.requirementId))) await this.view(id);
 }
 async refresh(state,requirementId,current) {
  for(const run of (state.technologyJobs || []).filter(j=>j.requirementId===requirementId && active(j))) {
   const result=await this.workspace.outcome(run);
   if(!result) continue;
   if ((await this.context(requirementId,state)).hash !== run.contextHash) { Object.assign(run,{status:'stale',error:'El contexto cambió durante la lectura del resultado. Consulta de nuevo.'}); continue; }
   const bytes=await readFile(path.join(this.workspace.directory,`${run.id}.request.json`)).catch(()=>null);
   if(result.status!=='completed' || result.kind!=='technology-suggestion' || result.toolsCount!==0 || !bytes || hash(bytes)!==run.inputHash || result.inputHash!==run.inputHash || !validTechnologyTracks(result.tracks,current.candidates)) Object.assign(run,{status:'failed',error:'Hermes no produjo una propuesta válida con responsables autorizados. Reintento explícito requerido.'});
   else Object.assign(run,{status:'completed',tracks:sanitize(result.tracks),model:redact(result.model,150),toolsCount:0});
  }
 }
 response(state,id,c) {
  const run=(state.technologyJobs || []).filter(j=>j.requirementId===id).at(-1);
  const stale=run && run.contextHash!==c.hash;
  return {run:run ? {id:run.id,status:stale?'stale':run.status,error:stale?'El contexto cambió. Consulta de nuevo.':run.error,model:run.model,inputHash:run.inputHash}:null,tracks:!stale && run?.status==='completed'?run.tracks:[],candidates:c.candidates,context:{hash:c.hash,versionId:c.flow.versionId,expectedRevision:c.flow.revision,stage:c.flow.stage},label:'PROPUESTO · requiere revisión, corrección y guardado explícito; no asigna roles ni firma.'};
 }
 async view(id) {
  return this.state.transaction(async state=>{const c=await this.context(id,state);await this.refresh(state,id,c);return this.response(state,id,c);});
 }
 async queue(id,payload,actor) {
  if(!payload || typeof payload!=='object' || Array.isArray(payload)) throw fail(400,'Se esperaba un objeto JSON.');
  await this.workspace.assertReady(); await this.reconcileAll();
  return this.state.transaction(async state=>{
   const c=await this.context(id,state);
   if(c.flow.stage!==1 || !c.version || c.version.demo===true || payload.versionId!==c.flow.versionId || payload.expectedRevision!==c.flow.revision || !Number.isSafeInteger(payload.expectedRevision) || payload.contextHash!==c.hash) throw fail(409,'La etapa, versión o contexto cambió. Guarda la versión seleccionada y vuelve a consultar.');
   state.technologyJobs ||= [];
   const pending = state.technologyJobs.find(j=>j.requirementId===id && active(j));
   if (pending && pending.contextHash !== c.hash) throw fail(409,'La consulta anterior quedó desactualizada; espera a que el worker termine antes de volver a consultar.');
   if (pending) return this.response(state,id,c);
   const day=new Date().toISOString().slice(0,10);
   const usage=(state.meta.technologyUsage ||= {});
   const today=(usage[day] ||= {total:0,actors:{}});
   const owner=hash(String(actor.id));
   if(state.technologyJobs.filter(active).length>=5 || today.total>=40 || (today.actors[owner] || 0)>=10) throw fail(429,'Capacidad o cuota diaria de consultas agotada. Espera antes de consultar a Hermes.');
   // Keep only our terminal metadata; never delete shared worker files here.
   if(state.technologyJobs.length>=1000) throw fail(429,'Límite de retención de consultas alcanzado.');
   const run={id:`ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,requirementId:id,status:'queued',createdAt:new Date().toISOString(),contextHash:c.hash};
   const snapshot={...c.snapshot,contextHash:c.hash,versionId:c.flow.versionId,expectedRevision:c.flow.revision,runId:run.id,createdAt:run.createdAt};
   run.inputHash=hash(snapshot);
   if((await this.context(id,state)).hash!==c.hash) throw fail(409,'El contexto cambió durante la consulta.');
   await this.workspace.publish(snapshot);
   state.technologyJobs.push(run);today.total++;today.actors[owner]=(today.actors[owner] || 0)+1;
   for(const d of Object.keys(usage).sort().slice(0,-3)) delete usage[d];
   return this.response(state,id,c);
  });
 }
}
