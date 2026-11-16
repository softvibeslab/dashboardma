const $=id=>document.getElementById(id);
const apiBase=new URL('.',import.meta.url).pathname.replace(/\/$/,'');
let config={authMode:'local-review'};
const modeLabel=()=>config.authMode==='sso'?'sesión corporativa · RBAC V2':'revisión local';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=x=>JSON.stringify(x,null,2);
const titles=['','Enriquecimiento','Tecnologías y áreas','Especificaciones','Validación documental','Pruebas y preparación QA','Aprobaciones','Entrega estructurada'];
const purpose=['','Define el contexto, las fuentes y las decisiones pendientes. Las referencias no implican lectura ni extracción automática.','Separa disciplina técnica de área de negocio. Cada frente es un entregable con repositorio, dependencias y responsables propios.','Redacta una especificación funcional compartida y una sección por frente. Los criterios mantienen IDs para conectar revisión y pruebas.','Comprueba estructura y trazabilidad con reglas del servidor. Registra hallazgos y solicita revisión humana independiente; la IA no se ha ejecutado.','Elige qué se evalúa. Antes del desarrollo entrega un plan revisado, no un reporte de QA software ejecutado.','Cada decisión corresponde a un objeto y hash exactos. Las devoluciones requieren motivo. Los cambios hacen caducar aprobaciones dependientes.','Entrega un paquete JSON con archivos lógicos, manifiesto SHA-256 y límites explícitos. La recepción no cierra CP ni autoriza desarrollo o despliegue.'];
export function phaseSaveData(stage,data,staffing){return stage===2&&staffing?.required?{...data,catalogToken:staffing.token}:data;}
export function canConfirmFront(actor,front,staffing,phaseData){
 if(front?.catalogFrontId&&staffing?.required&&phaseData?.catalogToken!==staffing.token)return false;
 const identity=front?.catalogFrontId?actor.azureIdentityKey:actor.id;
 return Boolean(actor.roles.includes('editor')&&identity&&front?.owner===identity);
}
export function canDecideObject(actor,object,phases,staffing){
 const front=phases[2].fronts.find(f=>`front:${f.id}`===object);
 if(front?.catalogFrontId&&staffing?.required&&phases[2].catalogToken!==staffing.token)return false;
 const reviewer=object==='spec'?phases[4].reviewer:object==='tests'?phases[5].reviewer:front?.reviewer;
 const identity=front?.catalogFrontId?actor.azureIdentityKey:actor.id;
 return Boolean(identity&&identity===reviewer&&actor.roles.includes(object==='tests'?'qa':'reviewer'));
}
export function changeStaffingScope(front,field,value,staffing){
 const changed={...front,[field]:value,owner:'',reviewer:'',confirmed:false};
 changed.discipline=staffing?.fronts?.find(f=>f.id===changed.catalogFrontId)?.name||'';
 return changed;
}
export function staffingCandidates(staffing,front,field){
 if(!staffing?.required||!staffing.fronts?.some(f=>f.id===front.catalogFrontId)||!staffing.projects?.includes(front.project))return [];
 const role=field==='owner'?'developer':'reviewer';
 return (staffing.candidates||[]).filter(c=>c.frontId===front.catalogFrontId&&c.project===front.project&&c.roles?.includes(role)&&(field!=='reviewer'||c.userId!==front.owner));
}
let view,phase=Number(globalThis.sessionStorage?.getItem('v2-phase')||1),draft,dirty=false,busy=false;
if(phase<1||phase>7)phase=1;
const text=(key,label,type='text',extra={})=>({key,label,type,...extra});
const schemas={
1:{fields:[text('title','Título del requerimiento'),text('owner','Responsable general','identity'),text('context','Contexto, objetivo y alcance','textarea'),text('constraints','Límites y fuera de alcance','textarea')],lists:{sources:{title:'Fuentes',fields:[text('id','ID de fuente'),text('kind','Tipo','select',{options:['text','url','file','azure-reference']}),text('name','Nombre o referencia'),text('text','Texto disponible (TXT / MD / CSV pegado)','textarea')]},questions:{title:'Preguntas y decisiones',fields:[text('id','ID de decisión'),text('question','Pregunta o decisión','textarea'),text('owner','Responsable de resolver','identity'),text('blocking','Bloqueante','checkbox'),text('answer','Respuesta / decisión tomada','textarea'),text('rationale','Motivo y fuente','textarea')]}}},
2:{fields:[],lists:{fronts:{title:'Frentes de entrega',fields:[text('id','ID del frente'),text('deliverable','Entregable'),text('repository','Repositorio (referencia, no leído)'),text('owner','Responsable','identity'),text('reviewer','Revisor independiente','identity'),text('discipline','Disciplina / tecnología'),text('area','Área de negocio'),text('dependencies','IDs de dependencias separados por coma','csv'),text('contract','Contrato e interfaces entre frentes','textarea')]}}},
3:{fields:[],lists:{sections:{title:'Secciones e índice de especificación',fields:[text('id','ID de sección'),text('front','Frente o shared (funcional compartida)'),text('title','Título de sección'),text('body','Contenido funcional / técnico / contrato','textarea')]},criteria:{title:'Criterios de aceptación trazables',fields:[text('id','ID de criterio'),text('section','ID de sección'),text('text','Criterio verificable','textarea'),text('critical','Crítico','checkbox')]}}},
4:{fields:[text('reviewer','Revisor documental asignado','identity'),text('notes','Resultado y alcance de revisión humana','textarea')],lists:{findings:{title:'Hallazgos documentales',fields:[text('id','ID de hallazgo'),text('section','ID de sección afectada'),text('description','Descripción','textarea'),text('severity','Severidad','select',{options:['critical','high','medium','low']}),text('owner','Responsable','identity'),text('status','Estado','select',{options:['open','resolved','exception']}),text('resolution','Resolución / justificación','textarea'),text('exceptionApprover','Aprobador de excepción (si aplica)','identity')]}}},
5:{fields:[text('kind','Objeto evaluado','select',{options:['document','mockup','contract','prototype','software']}),text('reviewer','Revisor QA / plan asignado','identity'),text('plan','Plan y alcance de pruebas','textarea'),text('build','Build / commit (obligatorio para software)'),text('environment','Entorno (obligatorio para software)')],lists:{cases:{title:'Casos y ejecuciones declaradas',fields:[text('id','ID de caso'),text('criterion','ID de criterio'),text('risk','Riesgo cubierto'),text('steps','Pasos','textarea'),text('expected','Resultado esperado','textarea'),text('status','Estado','select',{options:['planned','reported','executed']}),text('result','Resultado software','select',{options:['','passed','failed','blocked']}),text('executor','Ejecutor software','identity'),text('evidence','Referencia de evidencia (no descargada)'),text('reviewer','Revisor de ejecución','identity')]},defects:{title:'Defectos y decisiones',fields:[text('id','ID de defecto'),text('case','ID de caso'),text('description','Descripción','textarea'),text('owner','Responsable','identity'),text('severity','Severidad','select',{options:['critical','high','medium','low']}),text('status','Estado','select',{options:['open','resolved','accepted']}),text('evidence','Evidencia'),text('decision','Decisión / justificación','textarea')]}}},
7:{fields:[text('recipient','Destinatario de la entrega','identity'),text('instructions','Instrucciones, objetivo y restricciones para destinatario','textarea')],lists:{}}
};
async function api(url,body){const r=await fetch(apiBase+url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok){if(r.status===401)showLogin();throw Error(data.error||'No se pudo completar la solicitud.');}return data;}
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function showLogin(){$('login').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;$('identity').textContent=modeLabel()+' · sin sesión';}
async function load(){view=await api('/api/state');dirty=false;render();}
async function act(type,extra={}){if(busy)return;busy=true;const controls=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);try{view=await api('/api/action',{type,revision:view.state.revision,...extra});dirty=false;render();message('Cambio guardado en el servidor. Revisa los bloqueos y el impacto de la nueva versión.');}catch(e){message(e.message,true);}finally{busy=false;controls.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}}
function field(f,value,path,currentView=view){const name=esc(path);const val=f.type==='csv'?(value||[]).join(', '):value;
 if(f.type==='checkbox')return `<label class="check"><input data-path="${name}" type="checkbox" ${value?'checked':''}>${esc(f.label)}</label>`;
 let input;
 if(f.type==='textarea')input=`<textarea rows="4" data-path="${name}">${esc(val)}</textarea>`;
 else if(f.type==='select'||f.type==='identity'){const opts=f.type==='identity'?['',...currentView.identities.map(u=>u.id)]:f.options; input=`<select data-path="${name}">${[...new Set([...opts,...(val&&!opts.includes(val)?[val]:[])])].map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o||'Seleccionar…')}</option>`).join('')}</select>`;}
 else input=`<input type="text" data-path="${name}" data-kind="${f.type}" value="${esc(val)}">`;
 return `<label class="${f.type==='textarea'?'wide':''}">${esc(f.label)}${input}</label>`;
}
function specIndex(){return phase===3?`<details open><summary>Índice de secciones y frentes</summary><ul>${(draft.sections||[]).map((s,i)=>`<li><a href="#record-sections-${i}">${esc(s.id||'Sin ID')} · ${esc(s.title)} · ${esc(s.front)}</a></li>`).join('')||'<li>Añade la sección shared y las secciones por frente.</li>'}</ul></details>`:'';}
function catalogSelect(label,path,value,options){
 const missing=value&&!options.some(o=>o.value===value);
 return `<label>${esc(label)}<select data-path="${esc(path)}"><option value="" ${!value?'selected':''}>Seleccionar…</option>${missing?`<option value="${esc(value)}" selected disabled>No vigente · revisar selección</option>`:''}${options.map(o=>`<option value="${esc(o.value)}" ${o.value===value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;
}
function staffingFields(item,index,currentView){
 const staffing=currentView.staffing,path=`fronts.${index}.`;
 const owners=staffingCandidates(staffing,item,'owner'),reviewers=staffingCandidates(staffing,item,'reviewer');
 const choices=(people,access)=>people.map(c=>({value:c.userId,label:`${c.name} · Candidato · ${c.level==='principal'?'Principal':'Secundario'}${!c[access]?' · requiere vínculo explícito y rol':''}`}));
 return catalogSelect('Frente del catálogo',path+'catalogFrontId',item.catalogFrontId,(staffing.fronts||[]).map(f=>({value:f.id,label:f.name})))+
 catalogSelect('Proyecto',path+'project',item.project,(staffing.projects||[]).map(p=>({value:p,label:p})))+
 catalogSelect('Responsable candidato',path+'owner',item.owner,choices(owners,'canConfirm'))+
 catalogSelect('Revisor independiente candidato',path+'reviewer',item.reviewer,choices(reviewers,'canReview'))+
 (!owners.length||!reviewers.length?'<p class="notice wide">No hay candidatos '+(!owners.length?'developer para responsable':'reviewer independiente')+' para este frente y proyecto. Revisa las clasificaciones.</p>':'');
}
function staffingNotice(data,currentView){
 const s=currentView.staffing;
 return `<div class="notice">Asignación gobernada: elegir candidatos no concede permisos ni confirma responsabilidad. Confirmar o revisar requiere vínculo explícito y rol; sin ellos, la persona puede seleccionarse pero no podrá actuar. <a href="${esc(apiBase+'/classifications')}">Revisar clasificaciones</a>.<p>Catálogo v${esc(s.catalogRevision)} · Copia de usuarios Azure: ${esc(s.directorySyncedAt||'sin fecha verificable')}. No es una consulta en vivo ni una recomendación por carga.</p>${!s.fronts?.length?'<p>No hay frentes activos en el catálogo.</p>':''}${!s.projects?.length?'<p>No hay proyectos disponibles en el catálogo.</p>':''}${s.warning?`<p>${esc(s.warning)}</p>`:''}${data.catalogToken!==s.token?'<p>El catálogo cambió desde el último guardado. Revisa las selecciones y guarda explícitamente; no se actualizan automáticamente.</p>':''}${!currentView.actor.azureIdentityKey?'<p>Falta el vínculo de identidad corporativa explícito. Solicita su configuración a administración; el nombre o correo no habilita confirmar ni aprobar frentes.</p>':''}</div>`;
}
export function renderEditor(stage=phase,data=draft,currentView=view){const phase=stage,draft=data,view=currentView;const governed=phase===2&&view.staffing?.required;const schema=schemas[phase];let html=`<div id="editorSurface">${specIndex()}${governed?staffingNotice(draft,view):''}<form id="editor"><div class="fields">${schema.fields.map(f=>field(f,draft[f.key],f.key,view)).join('')}</div>`;
 for(const [key,list] of Object.entries(schema.lists)){
 html+=`<section class="collection"><h2>${esc(list.title)}</h2>${(draft[key]||[]).map((item,i)=>`<div class="entry" id="record-${key}-${i}"><div class="entry-head"><strong>${esc(item.id||'Nuevo registro')} ${key==='fronts'?`<span class="badge">${item.confirmed?(governed&&draft.catalogToken!==view.staffing.token?'Confirmación no vigente · revisar catálogo':'Confirmado por responsable'):'Propuesto · sin confirmar'}</span>`:''}${key==='sources'?`<span class="badge">${esc(item.status||'Pendiente de guardar')}</span>`:''}</strong><button type="button" class="remove" data-remove="${key}:${i}">Eliminar registro ${i+1}</button></div><div class="fields">${list.fields.filter(f=>!governed||!['owner','reviewer','discipline'].includes(f.key)).map(f=>field(f,item[f.key],`${key}.${i}.${f.key}`,view)).join('')}${governed?staffingFields(item,i,view):''}</div>${key==='fronts'?`<button type="button" data-confirm="${esc(item.id)}">Confirmar responsabilidad de ${esc(item.id||'frente')}</button>`:''}</div>`).join('')||'<p class="muted">Sin registros. Añade información explícita; no se generan datos automáticamente.</p>'}<button type="button" data-add="${key}">Añadir ${esc(list.title.toLowerCase())}</button></section>`;
 }
 html+='<div class="notice">Guardar crea una nueva versión. Cambios de contexto, frentes o specs invalidan revisiones y aprobaciones dependientes. No se regeneran otras secciones ni se llama a IA.</div><div class="actions"><button class="primary" type="submit">Guardar borrador de esta fase</button><span class="muted" id="saveState">Sin cambios locales</span></div></form>';
 if(phase===4||phase===5)html+=`<div class="actions"><button id="review">Registrar revisión humana ${phase===4?'documental':'del plan / reporte'}</button><span class="badge">${draft[phase===4?'humanReview':'reviewed']?'Revisión vigente':'Revisión pendiente'}</span></div>`;
 if(phase===4)html+='<p class="muted">Estructura: reglas deterministas del servidor. Consistencia IA: No ejecutada (not-run). Revisión humana: identidad asignada y separada del responsable.</p>';
 if(phase===5)html+=`<p class="notice">${draft.kind==='software'?'Resultados de software declarados por personas. Se exigen build, entorno, evidencia y revisor independiente; esta app no ejecuta el software ni inspecciona enlaces.':'Preparación documental: casos planificados y revisión de diseño. No equivale a QA software ejecutado.'}</p>`;
 return html+'</div>';
}
export function renderAzureIntake(currentView){
 const enabled=currentView.integrations?.azureIntake&&currentView.actor.roles.some(r=>['editor','coordinator'].includes(r));
 const imports=currentView.state.azureIntakes||[];
 return `<section class="collection"><h2>Importar fuente Azure · solo lectura</h2><p>Propuesta documental determinista · IA no ejecutada. El original se conserva por separado; importar crea una versión y no publica en Azure.</p>${!currentView.integrations?.azureIntake?'<p class="notice">Intake no configurado en este servidor.</p>':''}<form id="azureImportForm"><label>ID permitido del work item<input id="azureId" type="number" min="1" step="1" required></label><button id="azureImport" ${enabled?'':'disabled'}>Importar y proponer versión</button></form><button disabled>Publicar en Azure · pendiente</button><p class="muted">Publicación y aprobación de versión exacta pendientes; no cambia descripción, criterios ni estado Azure. Solo TXT/MD/CSV/JSON UTF-8 extraíbles; otros formatos quedan como metadata.</p>${imports.map(i=>`<details><summary>Fuente Azure #${esc(i.snapshot.root.id)} r${esc(i.snapshot.root.rev)} → V${esc(i.version)} · documental determinista</summary><p class="hash">Fuente SHA-256 ${esc(i.sourceHash)}</p><ul>${(i.snapshot.warnings||[]).map(w=>`<li>${esc(w)}</li>`).join('')}</ul><p>Campos, comentarios con versiones/fechas, relaciones e hijos (original separado; texto de propuesta acotado). Fuentes multi-lectura, no snapshot transaccional Azure.</p><pre>${esc(pretty(i.snapshot))}</pre></details>`).join('')}</section>`;
}
function assigned(object){return object==='spec'?view.state.phases[4].reviewer:object==='tests'?view.state.phases[5].reviewer:view.state.phases[2].fronts.find(f=>`front:${f.id}`===object)?.reviewer;}
function applyPermissions(){
 const actor=view.actor,editor=actor.roles.includes('editor');
 if(!editor){document.querySelectorAll('#editor input,#editor select,#editor textarea,#editor button').forEach(e=>e.disabled=true);if($('saveState'))$('saveState').textContent='Solo lectura · se requiere rol editor para modificar';}
 document.querySelectorAll('[data-confirm]').forEach(b=>b.disabled=!canConfirmFront(actor,view.state.phases[2].fronts.find(f=>f.id===b.dataset.confirm),view.staffing,view.state.phases[2]));
 if($('review'))$('review').disabled=actor.id!==draft.reviewer||!actor.roles.includes(phase===4?'reviewer':'qa');
 document.querySelectorAll('[data-decision]').forEach(b=>{const o=view.objects[Number(b.dataset.decision.split(':')[0])];b.disabled=!canDecideObject(actor,o.object,view.state.phases,view.staffing);});
 if($('receipt'))$('receipt').disabled||=actor.id!==view.state.phases[7].recipient;
}
function approvals(){return `<h2>Objetos y decisiones vigentes</h2>${view.objects.map((o,i)=>`<section class="entry"><h3>${esc(o.object)}</h3><p class="muted">Revisor asignado: ${esc(assigned(o.object)||'sin asignar')} · Rol: ${o.object==='tests'?'qa':'reviewer'} · versión visible ${view.state.revision}</p><p><span class="badge">${o.decision?esc(o.decision.decision==='approve'?`Aprobado · ${o.decision.mode}`:'Devuelto'):'Pendiente / aprobación caducada'}</span></p><p class="hash">${o.hash}</p>${o.decision?`<p class="muted">${esc(o.decision.actor)} · v${o.decision.version} · ${esc(o.decision.reason)}</p>`:''}<label>Motivo de devolución / observación<textarea id="reason${i}" rows="2"></textarea></label><div class="actions"><button class="primary" data-decision="${i}:approve">Aprobar ${esc(o.object)}</button><button data-decision="${i}:return">Devolver con motivo</button></div></section>`).join('')}<details><summary>Historial íntegro de decisiones</summary><pre>${esc(pretty(view.state.decisions))}</pre></details>`;}
function versions(){const history=view.state.history;return `<details id="versions"><summary>Versiones e impacto (${history.length} instantáneas)</summary><p class="muted">Compara cualquier instantánea con el estado actual. Las decisiones anteriores permanecen en el historial; solo el hash vigente permite entregar.</p><label>Versión anterior<select id="compare"><option value="">Seleccionar versión…</option>${history.map((h,i)=>`<option value="${i}">v${h.revision} · ${h.hash.slice(0,12)}</option>`).join('')}</select></label><div id="diff"></div></details>`;}
function comments(){return `<details><summary>Comentarios versionados de especificación (${view.state.comments.length})</summary><form id="commentForm"><div class="fields"><label>Sección<select id="commentSection"><option value="shared">shared</option>${(view.state.phases[3].sections||[]).map(s=>`<option>${esc(s.id)}</option>`).join('')}</select></label><label class="wide">Comentario<textarea id="commentText" required></textarea></label></div><button>Publicar comentario</button></form>${view.state.comments.map(c=>`<p><strong>${esc(c.section)} · v${c.version} · ${esc(c.actor)}</strong><br>${esc(c.text)}</p>`).join('')||'<p class="muted">Sin comentarios.</p>'}</details>`;}
function render(){
 $('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('identity').textContent=`${view.actor.id} · ${view.actor.roles.join(', ')} · ${modeLabel()}`;
 const s=view.state;draft=structuredClone(s.phases[phase]);$('stageStatus').textContent=`${phase} / 7 · ${titles[phase]}`;$('ownerStatus').textContent=`Responsable de fase: ${phase===4?s.phases[4].reviewer||'sin asignar':phase===5?s.phases[5].reviewer||'sin asignar':phase===6?'revisores asignados por objeto':phase===7?s.phases[7].recipient||'sin asignar':s.phases[1].owner||'sin asignar'}`;$('revisionStatus').textContent=`Versión ${s.revision} · ${view.hash.slice(0,12)}`;
 $('steps').innerHTML=titles.slice(1).map((t,i)=>`<li><button data-phase="${i+1}" ${phase===i+1?'aria-current="step"':''}><span class="number">${i+1}</span><span>${esc(t)}</span><small>${view.blockers[i+1].length?`${view.blockers[i+1].length} pendientes`:'Preparado'}</small></button></li>`).join('');
 const pending=view.blockers[phase];const cross=[1,2,3,4,5,6,7].flatMap(p=>view.blockers[p].map(t=>({p,t})));
 $('phase').innerHTML=`<h1>${titles[phase]}</h1><p>${purpose[phase]}</p>${phase===1?renderAzureIntake(view):''}${phase===6?approvals():renderEditor()}${pending.length?`<section class="blockers"><strong>Qué falta en esta fase</strong><ul>${pending.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:'<p class="ready">Requisitos de esta fase completos según las reglas del servidor.</p>'}${phase===3?comments():''}${phase===7?`<h2>Paquete y recepción</h2><p class="muted">El paquete incluye specs, contratos, dependencias, pruebas, decisiones, aprobaciones y límites. Las decisiones locales se identifican como local-review.</p><div class="actions"><button class="primary" id="download" ${cross.length?'disabled':''}>Descargar paquete estructurado</button><button id="receipt" ${cross.length?'disabled':''}>Confirmar recepción del paquete vigente</button></div>${cross.length?`<div class="blockers"><strong>Entrega bloqueada</strong><ul>${cross.map(x=>`<li><a href="#phase" data-goto="${x.p}">Fase ${x.p}</a>: ${esc(x.t)}</li>`).join('')}</ul></div>`:''}<details><summary>Historial de recepción</summary><pre>${esc(pretty(s.receipts))}</pre></details>`:''}${versions()}<div class="actions"><button id="back" ${phase===1?'disabled':''}>Fase anterior</button><button id="next" ${phase===7?'disabled':''}>Siguiente fase</button></div>`;
 bind();applyPermissions();
}
function move(p){if(dirty&&!confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar de fase?'))return;phase=p;sessionStorage.setItem('v2-phase',String(p));dirty=false;render();$('phase').focus();}
function bind(){
 if($('azureImportForm'))$('azureImportForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  if(dirty){message('Guarda o descarta los cambios locales antes de importar.',true);return;}
  const replace=Object.keys(view.state.phases[1]).length>0;
  if(replace&&!confirm('¿Reemplazar el borrador de fase 1 por una propuesta documental? Se conservarán el original y las versiones anteriores.'))return;
  const id=Number($('azureId').value);busy=true;$('azureImport').disabled=true;
  try{view=await api('/api/azure/import',{id,revision:view.state.revision,confirmReplace:replace});dirty=false;render();message('Fuente Azure importada y propuesta documental versionada. IA no ejecutada; no se publicó en Azure.');}
  catch(error){message(error.message,true);}finally{busy=false;if($('azureImport'))$('azureImport').disabled=!view.integrations?.azureIntake||!view.actor.roles.some(r=>['editor','coordinator'].includes(r));}
 };
 document.querySelectorAll('[data-phase],[data-goto]').forEach(b=>b.onclick=e=>{e.preventDefault();move(Number(b.dataset.phase||b.dataset.goto));});
 $('back').onclick=()=>move(phase-1);$('next').onclick=()=>move(phase+1);
 const capture=()=>{document.querySelectorAll('[data-path]').forEach(el=>{const parts=el.dataset.path.split('.');let target=draft;for(const p of parts.slice(0,-1))target=target[p];target[parts.at(-1)]=el.type==='checkbox'?el.checked:el.dataset.kind==='csv'?el.value.split(',').map(s=>s.trim()).filter(Boolean):el.value;});};
 document.querySelectorAll('[data-path]').forEach(el=>el.oninput=()=>{capture();dirty=true;$('saveState').textContent='Cambios sin guardar';if(phase===2&&view.staffing?.required){const [collection,index,key]=el.dataset.path.split('.');if(collection==='fronts'&&['catalogFrontId','project','owner','reviewer'].includes(key)){const item=draft.fronts[index];if(key==='catalogFrontId'||key==='project')draft.fronts[index]=changeStaffingScope(item,key,el.value,view.staffing);else{item.confirmed=false;if(key==='owner'&&item.owner===item.reviewer)item.reviewer='';}rerenderDraft();const replacement=document.querySelector(`[data-path="${el.dataset.path}"]`);replacement?.focus();}}});
 const editor=$('editor');if(editor)editor.onsubmit=e=>{e.preventDefault();capture();act('save',{phase,data:phaseSaveData(phase,draft,view.staffing)});};
 const rerenderDraft=()=>{const saved=draft;const html=renderEditor();$('editorSurface').outerHTML=html;draft=saved;bind();dirty=true;$('saveState').textContent='Cambios sin guardar';applyPermissions();};
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{capture();const k=b.dataset.add;draft[k]||=[];const item={};schemas[phase].lists[k].fields.forEach(f=>item[f.key]=f.type==='checkbox'?false:f.type==='csv'?[]:f.type==='select'?f.options[0]:'');draft[k].push(item);rerenderDraft();});
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{capture();const [k,i]=b.dataset.remove.split(':');draft[k].splice(Number(i),1);rerenderDraft();});
 document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>{if(dirty){message('Guarda primero el frente para confirmar su versión exacta.',true);return;}act('confirm',{front:b.dataset.confirm});});
 if($('review'))$('review').onclick=()=>{if(dirty){message('Guarda el borrador antes de registrar la revisión.',true);return;}act('review',{phase});};
 document.querySelectorAll('[data-decision]').forEach(b=>b.onclick=()=>{const [i,decision]=b.dataset.decision.split(':');const o=view.objects[Number(i)];act('decide',{object:o.object,hash:o.hash,decision,reason:$(`reason${i}`).value});});
 if($('commentForm'))$('commentForm').onsubmit=e=>{e.preventDefault();if(dirty){message('Guarda tus cambios antes de comentar la versión.',true);return;}act('comment',{section:$('commentSection').value,text:$('commentText').value});};
 $('compare').onchange=e=>{if(e.target.value===''){$('diff').innerHTML='';return;}const old=view.state.history[Number(e.target.value)],current=view.state.phases;const changed=[1,2,3,4,5,6,7].filter(p=>pretty(old.phases[p])!==pretty(current[p]));$('diff').innerHTML=`<p>Impacto: ${changed.length?changed.map(p=>titles[p]).join(', '):'Sin cambios de contenido'}.</p>${changed.map(p=>`<h3>${titles[p]}</h3><details><summary>Antes · v${old.revision}</summary><pre>${esc(pretty(old.phases[p]))}</pre></details><details><summary>Ahora · v${view.state.revision}</summary><pre>${esc(pretty(current[p]))}</pre></details>`).join('')}`;};
 if($('download'))$('download').onclick=async()=>{try{const p=await api('/api/package');const url=URL.createObjectURL(new Blob([pretty(p)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='onboarding-v2-package.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`Paquete preparado · hash ${p.hash}`);}catch(e){message(e.message,true);}};
 if($('receipt'))$('receipt').onclick=async()=>{try{const p=await api('/api/package');await act('receipt',{hash:p.hash});}catch(e){message(e.message,true);}};
}
if(typeof document!=='undefined'){
$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{token:$('token').value});$('token').value='';await load();message('Sesión de revisión local iniciada. No es autenticación corporativa.');}catch(e){message(e.message,true);}};
$('logout').onclick=async()=>{try{const result=await api('/api/logout',{});if(result.logoutUrl){location.assign(result.logoutUrl);return;}showLogin();message('Sesión cerrada.');}catch(e){message(e.message,true);}};
$('reload').onclick=async()=>{if(dirty&&!confirm('¿Descartar cambios locales y recargar?'))return;try{await load();message('Versión actualizada desde el servidor.');}catch(e){message(e.message,true);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function bootstrap(){config=await api('/api/config');if(config.authMode==='sso'){
 $('loginForm').hidden=true;$('environment').textContent='Onboarding V2 independiente · sesión corporativa y roles V2. Sin autorización de producción ni cierre CP.';
 $('loginHint').innerHTML=`<a href="${esc(config.loginUrl)}">Iniciar sesión corporativa</a> · Requiere asignación RBAC V2 explícita. No hay acceso local alternativo.`;
 }await load();}
bootstrap().catch(e=>message(e.message,true));
}
