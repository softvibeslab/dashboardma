import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const initial = () => ({revision:0, phases:{1:{},2:{fronts:[]},3:{sections:[],criteria:[]},4:{findings:[]},5:{kind:'document',cases:[],defects:[]},6:{},7:{}},history:[],comments:[],decisions:[],receipts:[],audit:[]});
export const digest = s => hash(s.phases);
// Server-side allowlist: draft incompleteness is allowed, forged statuses and malformed shapes are not.
const shapes={
 1:{scalar:['title','owner','context','constraints'],lists:{sources:['id','kind','name','text','status'],questions:['id','question','owner','blocking','answer','rationale']}},
 2:{scalar:['catalogToken','catalogRevision','directorySyncedAt'],lists:{fronts:['id','deliverable','repository','owner','reviewer','discipline','area','dependencies','contract','confirmed','catalogFrontId','project','ownerName','reviewerName','selectionToken','confirmedBy','confirmedAt']}},
 3:{scalar:[],lists:{sections:['id','front','title','body'],criteria:['id','section','text','critical']}},
 4:{scalar:['reviewer','notes','humanReview','aiStatus'],lists:{findings:['id','section','description','severity','owner','status','resolution','exceptionApprover']}},
 5:{scalar:['kind','reviewer','plan','build','environment','reviewed'],lists:{cases:['id','criterion','risk','steps','expected','status','result','executor','evidence','reviewer'],defects:['id','case','description','owner','severity','status','evidence','decision']}},
 7:{scalar:['recipient','instructions'],lists:{}}
};
function validateDraft(phase,data){
 const schema=shapes[phase];const boolean=new Set(['blocking','critical','confirmed','humanReview','reviewed']);
 const scalar=(k,v)=>{if(boolean.has(k)){if(typeof v!=='boolean')throw Error(`estructura: ${k} requiere booleano.`);}else if(typeof v!=='string'||v.length>100000)throw Error(`estructura: ${k} requiere texto acotado.`);};
 for(const [k,v] of Object.entries(data)){
  if(schema.scalar.includes(k)){scalar(k,v);continue;}
  const fields=schema.lists[k];if(!fields)throw Error(`campo no permitido: ${k}`);
  if(!Array.isArray(v)||v.length>200)throw Error(`estructura de ${k} inválida.`);
  for(const row of v){if(!row||typeof row!=='object'||Array.isArray(row))throw Error(`estructura de ${k} inválida.`);
   for(const [field,value]of Object.entries(row)){if(!fields.includes(field))throw Error(`campo no permitido: ${field}`);if(field==='dependencies'){if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw Error('estructura de dependencias inválida.');}else scalar(field,value);}
  }
 }
 if(phase===4&&data.aiStatus&&data.aiStatus!=='not-run')throw Error('IA no ejecutada en V2: no se acepta declarar una ejecución.');
}
export function blockers(s,phase){
 const p=s.phases[phase]; const b=[];
 if(phase===1){
  if(!p.title?.trim()||!p.owner?.trim()||!p.context?.trim())b.push('Completa título, responsable y contexto.');
  const questions=p.questions||[],sources=p.sources||[];
  if(questions.some(q=>!q.id||!q.question||!q.owner||(q.blocking&&(!q.answer?.trim()||!q.rationale?.trim())))||new Set(questions.map(q=>q.id)).size!==questions.length)b.push('Resuelve preguntas bloqueantes con responsable y motivo; usa IDs únicos.');
  if(sources.some(x=>!x.id||!x.name||!['text','url','file','azure-reference'].includes(x.kind)||(x.kind==='text'&&!x.text?.trim()))||new Set(sources.map(x=>x.id)).size!==sources.length)b.push('Completa fuentes con IDs únicos, tipo, nombre y texto cuando corresponda.');
 }
 const fronts=s.phases[2].fronts||[], sections=s.phases[3].sections||[], criteria=s.phases[3].criteria||[];
 const unique=items=>new Set(items.map(x=>x.id)).size===items.length&&items.every(x=>typeof x.id==='string'&&/^[A-Za-z0-9_-]+$/.test(x.id));
 if(phase===2){
  if(!fronts.length||!unique(fronts))b.push('Añade frentes con IDs únicos.');
  if(fronts.some(f=>!['deliverable','repository','owner','reviewer','discipline','area'].every(k=>f[k])||f.owner===f.reviewer||f.confirmed!==true))b.push('Confirma entregable, repositorio, disciplina, área, responsable y revisor independiente de cada frente.');
  if(fronts.some(f=>(f.dependencies||[]).some(id=>id===f.id||!fronts.some(x=>x.id===id))))b.push('Corrige las dependencias de frentes.');
  const visiting=new Set(),done=new Set(); const cycle=id=>{if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id); const f=fronts.find(x=>x.id===id);if((f?.dependencies||[]).some(cycle))return true;visiting.delete(id);done.add(id);return false;};
  if(fronts.some(f=>cycle(f.id)))b.push('Elimina ciclos en las dependencias.');
 }
 if(phase===3){
  if(!sections.length||!unique(sections)||!sections.some(x=>x.front==='shared')||sections.some(x=>!x.title||!x.body||!(x.front==='shared'||fronts.some(f=>f.id===x.front))))b.push('Escribe especificación funcional compartida y secciones con IDs y frente válido.');
  if(fronts.some(f=>!sections.some(x=>x.front===f.id)))b.push('Cada frente necesita su especificación.');
  if(!criteria.length||!unique(criteria)||criteria.some(x=>!x.text||!sections.some(t=>t.id===x.section)))b.push('Vincula criterios únicos a secciones existentes.');
 }
 if(phase===4){
  if(!p.humanReview||!p.reviewer||p.reviewer===s.phases[1].owner)b.push('Registra revisión humana independiente.');
  if((p.findings||[]).some(f=>!sections.some(x=>x.id===f.section)))b.push('Vincula cada hallazgo a una sección existente.');
  if((p.findings||[]).some(f=>!f.id||!f.owner||!['critical','high','medium','low'].includes(f.severity)||!f.description||!['resolved','exception'].includes(f.status)||!f.resolution||(f.status==='exception'&&!f.exceptionApprover)))b.push('Resuelve hallazgos con owner, severidad y resolución; documenta aprobador de excepciones.');
  if(p.aiStatus&&p.aiStatus!=='not-run')b.push('La consistencia IA no está conectada en V2; no puede declararse ejecutada.');
 }
 if(phase===5){
  const cases=p.cases||[], defects=p.defects||[];
  if(!['document','mockup','contract','prototype','software'].includes(p.kind)||!p.plan||!p.reviewed||!p.reviewer||p.reviewer===s.phases[1].owner)b.push('Selecciona objeto y registra plan revisado independientemente.');
  if(!cases.length||!unique(cases)||cases.some(c=>!c.risk||!c.steps||!c.expected||!criteria.some(x=>x.id===c.criterion)))b.push('Cada caso necesita ID, criterio válido, riesgo, pasos y resultado esperado.');
  if(criteria.filter(c=>c.critical).some(c=>!cases.some(t=>t.criterion===c.id)))b.push('Cubre todos los criterios críticos.');
  if(p.kind!=='software'&&cases.some(c=>c.status!=='planned'))b.push('Antes del desarrollo solo se registra plan: no QA software ejecutado.');
  if(p.kind==='software'){
   if(!p.build||!p.environment)b.push('Software requiere build y entorno.');
   if(cases.some(c=>c.status!=='executed'||!c.evidence||!c.executor||!c.reviewer||c.executor===c.reviewer||!['passed','failed','blocked'].includes(c.result)))b.push('Registra ejecución, resultado, evidencia y revisor independiente (declaración humana, no ejecución automática).');
   if(criteria.filter(c=>c.critical).some(c=>!cases.some(t=>t.criterion===c.id&&t.result==='passed')))b.push('Todos los criterios críticos deben pasar.');
   if(cases.some(c=>c.result==='failed'&&!defects.some(d=>d.case===c.id)))b.push('Cada fallo necesita defecto enlazado.');
  }
  if(defects.some(d=>d.severity==='critical'&&d.status!=='resolved'))b.push('Los defectos críticos deben resolverse, no aceptarse como excepción.');
  if(defects.some(d=>!cases.some(c=>c.id===d.case)||!d.owner||!d.severity||!d.decision||(!['resolved','accepted'].includes(d.status))||!d.evidence))b.push('Resuelve o acepta explícitamente defectos con owner, severidad, evidencia y decisión.');
 }
 if(phase===6){for(const object of objects(s))if(currentDecision(s,object)?.decision!=='approve')b.push(`Solicita aprobación vigente de ${object}; devolución, cambio o ausencia bloquean entrega.`);}
 if(phase===7){if(!p.recipient||!p.instructions)b.push('Define destinatario e instrucciones de entrega.');}
 return b;
}
export const objects=s=>['spec','tests',...(s.phases[2].fronts||[]).map(f=>`front:${f.id}`)];
export function objectHash(s,object){
 if(!objects(s).includes(object))throw Error('Objeto desconocido.');
 return hash({object,epoch:s.epochs?.[object]||0,context:s.phases[1],fronts:s.phases[2],spec:s.phases[3],validation:s.phases[4],...(object==='tests'?{tests:s.phases[5]}:{})});
}
export function currentDecision(s,object){return s.decisions.filter(d=>d.object===object&&d.hash===objectHash(s,object)).at(-1);}
export function packageFor(s){
 const pending=[1,2,3,4,5,6,7].flatMap(p=>blockers(s,p));
 if(pending.length)throw Error(`Entrega bloqueada: ${pending.join(' ')}`);
 const files={
  'context.json':s.phases[1], 'fronts-and-dependencies.json':s.phases[2], 'specifications.json':s.phases[3],
  'validation.json':s.phases[4], 'test-plan-and-reports.json':s.phases[5], 'decisions.json':s.decisions,
  'comments.json':s.comments, 'history.json':s.history, 'audit.json':s.audit.filter(a=>a.type!=='receipt'),
  'approval-subjects.json':{epochs:s.epochs||{},phases:s.phases,objects:objects(s).map(object=>({object,hash:objectHash(s,object)}))},
  'megaprompt.md':`# ${s.phases[1].title}\n${s.phases[1].context}\n\n${(s.phases[3].sections||[]).map(x=>`## ${x.id}: ${x.title}\n${x.body}`).join('\n\n')}\n\nNo cerrar CP, desarrollar ni desplegar automáticamente. Seguir criterios y límites del paquete.`,
  'agent-limits.md':'Solo preparación de onboarding. No aprobación legal, cierre CP, acceso a repositorios, ejecución automática de QA ni autorización de producción. Las evidencias de software son declaraciones humanas enlazadas; no se descargan ni verifican externamente. IA no ejecutada en V2.'
 };
 const payload={schema:'mobilityapps.onboarding.v2',version:s.audit.filter(a=>a.type!=='receipt').at(-1)?.revision||s.revision,recipient:s.phases[7].recipient,instructions:s.phases[7].instructions,files,manifest:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(v)])),approvals:objects(s).map(o=>currentDecision(s,o))};
 // Receipt is an external acknowledgment of an immutable package, not part of its content.
 return {...payload,hash:hash(payload)};
}
export const frontIdentityMatches=(actor,front,field)=>Boolean(front?.catalogFrontId?actor.azureIdentityKey&&actor.azureIdentityKey===front[field]:actor.id===front?.[field]);
export function change(state,a,actor){
 if(!actor?.authenticated)throw Error('Se requiere identidad autenticada.');
 if(a.revision!==state.revision)throw Error('Conflicto de versión: recarga antes de guardar.');
 const s=structuredClone(state); const at=new Date().toISOString();
 if(a.type==='save'){
  if(!actor.roles.includes('editor'))throw Error('Rol editor requerido.');
  if(!Number.isInteger(a.phase)||a.phase<1||a.phase>7||a.phase===6||!a.data||Array.isArray(a.data)||typeof a.data!=='object')throw Error('Acción inválida.');
  const data=structuredClone(a.data);validateDraft(a.phase,data);
  s.epochs||={};
  for(const object of objects(s)){if(a.phase<=4||a.phase===5&&object==='tests')s.epochs[object]=(s.epochs[object]||0)+1;}
  const assignments=(p,v)=>p===1?{owner:v.owner}:p===2?(v.fronts||[]).map(f=>({id:f.id,owner:f.owner,reviewer:f.reviewer,catalogFrontId:f.catalogFrontId,project:f.project})):p===4||p===5?{reviewer:v.reviewer}:p===7?{recipient:v.recipient}:{};
  const previous=assignments(a.phase,s.phases[a.phase]);
  const existingAssignment=a.phase===2?(s.phases[2].fronts||[]).length: Object.values(previous).some(Boolean);
  if(existingAssignment&&hash(previous)!==hash(assignments(a.phase,data))&&!actor.roles.includes('coordinator'))throw Error('Solo el coordinador puede cambiar asignaciones existentes.');
  if(a.phase===4)data.humanReview=false;
  if(a.phase===5)data.reviewed=false;
  if(a.phase===1)data.sources=(data.sources||[]).map(v=>({...v,status:v.kind==='text'&&v.text?'extracted':'referenced'}));
  if(a.phase===2)data.fronts=(data.fronts||[]).map(f=>{const {confirmed,confirmedBy,confirmedAt,...rest}=f;const old=(s.phases[2].fronts||[]).find(x=>x.id===f.id);const {confirmed:previous,confirmedBy:priorBy,confirmedAt:priorAt,...prior}=old||{};const keep=!!previous&&hash(rest)===hash(prior);return {...rest,confirmed:keep,...(keep&&priorBy?{confirmedBy:priorBy,confirmedAt:priorAt}:{})};});
  s.history.push({revision:s.revision,phases:structuredClone(s.phases),hash:digest(s)});
  s.phases[a.phase]=data;
  if(a.phase<=3){s.phases[4].humanReview=false;s.phases[5].reviewed=false;}
  if(a.phase===4)s.phases[5].reviewed=false;
 }else if(a.type==='review'){
  if(![4,5].includes(a.phase)||actor.id!==s.phases[a.phase].reviewer||actor.id===s.phases[1].owner||!actor.roles.includes(a.phase===4?'reviewer':'qa'))throw Error('Solo revisor asignado independiente puede revisar.');
  const field=a.phase===4?'humanReview':'reviewed';s.phases[a.phase][field]=true;
  if([1,2,3,...(a.phase===5?[4]:[])].some(p=>blockers(s,p).length)||blockers(s,a.phase).length)throw Error('Resuelve los bloqueos antes de registrar revisión.');
 }else if(a.type==='confirm'){
  const f=(s.phases[2].fronts||[]).find(x=>x.id===a.front);
  if(!f||!frontIdentityMatches(actor,f,'owner')||!actor.roles.includes('editor'))throw Error('Solo el responsable asignado puede confirmar el frente.');
  f.confirmed=true;f.confirmedBy=actor.id;f.confirmedAt=at;
 }else if(a.type==='comment'){
  if(!actor.roles.some(r=>['editor','reviewer','qa'].includes(r))||!a.text?.trim()||!(a.section==='shared'||s.phases[3].sections.some(x=>x.id===a.section)))throw Error('Comentario o sección inválidos.');
  s.comments.push({section:a.section,text:a.text,actor:actor.id,version:s.revision,hash:digest(s),at});
 }else if(a.type==='decide'){
  if(a.hash!==objectHash(s,a.object))throw Error('El hash del objeto cambió; recarga.');
  const assigned=a.object==='spec'?s.phases[4].reviewer:a.object==='tests'?s.phases[5].reviewer:s.phases[2].fronts.find(f=>`front:${f.id}`===a.object)?.reviewer;
  const role=a.object==='tests'?'qa':'reviewer';
  const assignedFront=s.phases[2].fronts.find(f=>`front:${f.id}`===a.object);
  const matches=assignedFront?frontIdentityMatches(actor,assignedFront,'reviewer'):assigned===actor.id;
  if(!actor.roles.includes(role)||!matches||actor.id===s.phases[1].owner)throw Error('Se requiere rol y revisor asignado independiente.');
  if(!['approve','return'].includes(a.decision))throw Error('Decisión inválida.');
  if(a.decision==='return'&&!a.reason?.trim())throw Error('La devolución necesita motivo.');
  if(a.decision==='approve'&&[1,2,3,4,5].some(p=>blockers(s,p).length))throw Error('Resuelve bloqueos antes de aprobar.');
  s.decisions.push({object:a.object,hash:a.hash,decision:a.decision,reason:a.reason||'',actor:actor.id,role,mode:actor.mode||'authenticated',version:s.revision,at});
 }else if(a.type==='receipt'){
  const p=packageFor(s);
  if(p.hash!==a.hash)throw Error('El hash del paquete cambió.');
  if(p.recipient!==actor.id)throw Error('Solo el destinatario puede registrar recepción.');
  s.receipts.push({hash:p.hash,actor:actor.id,at,mode:actor.mode||'authenticated'});
 }else throw Error('Acción inválida.');
 s.revision++; s.audit.push({type:a.type,phase:a.phase,actor:actor.id,at,revision:s.revision});
 return s;
}
