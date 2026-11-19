import {hash,blockers,change,currentDecision,objects,objectHash,packageFor} from '../onboarding-v2/model.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
// The existing documentary reviewer assignment/role is reused; this is not CP approval.
export const contextHash=s=>hash({context:s.phases[1],sourceHash:s.azureIntakes?.at(-1)?.sourceHash||null,reviewer:s.phases[4].reviewer||null,epoch:s.audit.filter(a=>a.type==='save'&&a.phase===1||a.type==='azure.import'||a.type==='hermes.enrich').at(-1)?.revision||0});
const inputHash=s=>hash({contextHash:contextHash(s),fronts:s.phases[2]});
export function continuityView(s){
 const h=contextHash(s),review=s.contextReviews?.filter(r=>r.hash===h).at(-1),draft=s.specDrafts?.at(-1);
 const approved=currentDecision(s,'spec')?.decision==='approve';
 const current=Boolean(review&&(approved||draft&&draft.inputHash===inputHash(s)&&draft.specHash===hash(s.phases[3])));
 const pending=[1,2,3,4,5,6,7].flatMap(phase=>blockers(s,phase).map(text=>({phase,text})));
 if(!review)pending.unshift({phase:1,text:'Revisión humana de contexto vigente pendiente.'});
 if(!current)pending.push({phase:3,text:'Procedencia del borrador SPEC pendiente u obsoleta; contenido manual preservado.'});
 if(JSON.stringify(s.phases[3]).includes('PENDIENTE'))pending.push({phase:3,text:'Completa los campos PENDIENTE del borrador antes de entrega.'});
 return {contextHash:h,review:{status:review?'Revisado':'Pendiente',record:review||null},contextBlockers:blockers(s,1),spec:{status:approved?'Revisado':draft&&draft.specHash===hash(s.phases[3])?'Generado':s.phases[3].sections?.length?'Propuesto':'Pendiente',current,record:draft||null},handoff:{ready:pending.length===0,pending,objects:objects(s).map(object=>({object,hash:objectHash(s,object),decision:currentDecision(s,object)||null})),development:'not-executed'}};
}
export function continuityPackage(s){
 const v=continuityView(s);if(!v.handoff.ready)fail(409,'Entrega CP3 pendiente: '+v.handoff.pending.map(p=>p.text).join(' '));
 const base=packageFor(s),{hash:oldHash,...payload}=base;
 const provenance={contextHash:v.contextHash,review:v.review.record,spec:v.spec.record,sourceHash:s.azureIntakes?.at(-1)?.sourceHash||null,development:'not-executed'};
 payload.schema='mobilityapps.onboarding.v3';payload.files={...payload.files,'provenance.json':provenance};payload.manifest={...payload.manifest,'provenance.json':hash(provenance)};
 return {...payload,hash:hash(payload)};
}
export function continuityChange(state,a,actor){
 if(!actor?.authenticated)fail(401,'Identidad autenticada requerida.');
 if(a.revision!==state.revision)fail(409,'Conflicto de versión: recarga antes de continuar.');
 if(a.type==='receipt'){
  const p=continuityPackage(state);if(a.hash!==p.hash)fail(409,'El hash del paquete cambió.');
  const s=change(state,{...a,hash:packageFor(state).hash},actor);s.receipts.at(-1).hash=p.hash;return s;
 }
 if(a.type==='prepare-spec'){
  if(!actor.roles.includes('editor'))fail(403,'Rol editor requerido.');
  const v=continuityView(state);if(!v.review.record||v.contextBlockers.length)fail(409,'Revisión humana vigente del contexto y respuestas bloqueantes requerida.');
  if(currentDecision(state,'spec')?.decision==='approve')fail(409,'SPEC aprobada: no se permite reemplazar su texto.');
  if((state.phases[3].sections?.length||state.phases[3].criteria?.length)&&a.confirmReplace!==true)fail(409,'Confirma reemplazar el borrador manual; se conserva el historial.');
  const p=state.phases[1],source=state.azureIntakes?.at(-1);
  const trace=`BORRADOR · plantilla determinista, sin inferencia ni aprobación.\nFuente: ${source?.sourceHash||'manual'} · Azure rev ${source?.snapshot?.root?.rev||'PENDIENTE'}\nContexto: ${v.contextHash} · versión revisada ${v.review.record.version}\nRevisor: ${v.review.record.actor} · ${v.review.record.at}`;
  const decisions=(p.questions||[]).map(q=>`${q.id} · ${q.question}\nRespuesta: ${q.answer||'PENDIENTE'}\nMotivo/fuente: ${q.rationale||'PENDIENTE'} · Responsable: ${q.owner||'PENDIENTE'}${q.blocking?' · Bloqueante':''}`).join('\n\n')||'PENDIENTE: registrar decisiones y preguntas.';
  const topics=[['alcance','Alcance',`${p.context||'PENDIENTE'}\nFuera de alcance / límites: ${p.constraints||'PENDIENTE'}`],['reglas','Reglas y decisiones',decisions],['actores','Actores','PENDIENTE: actores de negocio y responsabilidades (no inferidos de RBAC).'],['flujos','Flujos','PENDIENTE: pasos, entradas y salidas.'],['estados','Estados','PENDIENTE: estados y transiciones.'],['excepciones','Excepciones','PENDIENTE: errores y recuperación.'],['datos','Datos','PENDIENTE: esquema, validaciones y retención.'],['permisos','Permisos','PENDIENTE: permisos de la solución; roles de onboarding no los sustituyen.'],['integraciones','Integraciones','PENDIENTE: contratos y dependencias externas.'],['criterios','Criterios','PENDIENTE: criterios verificables, IDs y vínculo a decisiones.'],['pruebas','Pruebas y QA','PENDIENTE: riesgos, casos y evidencia prevista; software no ejecutado.']];
  const sections=topics.map(([id,title,body])=>({id:'SPEC-'+id,front:'shared',title,body:trace+'\n\n'+body}));
  for(const f of state.phases[2].fronts||[])sections.push({id:'SPEC-front-'+f.id,front:f.id,title:f.deliverable||f.id,body:trace+'\n\nPENDIENTE: especificación por frente.\nContrato de referencia: '+(f.contract||'PENDIENTE')});
  const s=change(state,{type:'save',phase:3,revision:state.revision,data:{sections,criteria:[]}},actor);
  s.specDrafts||=[];s.specDrafts.push({generation:'deterministic-template',version:s.revision,contextHash:v.contextHash,inputHash:inputHash(state),specHash:hash(s.phases[3]),sourceHash:source?.sourceHash||null,review:structuredClone(v.review.record),questions:structuredClone(p.questions||[]),decisions:structuredClone(state.decisions),actor:actor.id,at:s.audit.at(-1).at});
  s.audit.at(-1).type='prepare-spec';return s;
 }
 if(a.type!=='review-context')fail(400,'Acción de continuidad inválida.');
 if(!actor.roles.includes('reviewer')||actor.id!==state.phases[4].reviewer||actor.id===state.phases[1].owner)fail(403,'Se requiere el revisor documental asignado e independiente; coordinador no concede aprobación.');
 if(a.hash!==contextHash(state))fail(409,'El hash de contexto cambió; recarga.');
 if(blockers(state,1).length)fail(409,'Resuelve las preguntas y bloqueos de contexto antes de revisar.');
 const s=structuredClone(state),at=new Date().toISOString();s.contextReviews||=[];
 s.contextReviews.push({hash:a.hash,version:s.revision,actor:actor.id,role:'reviewer',mode:actor.mode||'authenticated',at});
 s.revision++;s.audit.push({type:a.type,actor:actor.id,revision:s.revision,at});return s;
}
