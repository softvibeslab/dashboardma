const $=id=>document.getElementById(id);
const base=new URL('.',import.meta.url).pathname.replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view,draft,dirty=false,busy=false,selected=null,config={};
const titles=['Enriquecimiento','Tecnologías y áreas','Especificaciones','Validación documental','Pruebas y preparación QA','Aprobaciones','Entrega estructurada'];
const notice=(s,error=false)=>{$('message').hidden=false;$('message').textContent=s;$('message').className='message'+(error?' error':'');};
async function api(route,data){const r=await fetch(base+route,{method:data?'POST':'GET',headers:data?{'content-type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();if(!r.ok)throw Error(body.error||`HTTP ${r.status}`);return body;}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){notice(e.message+' Recarga la versión del servidor si existe conflicto.',true);}finally{busy=false;}}
const canEdit=()=>view.actor.roles.includes('editor');
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
function questions(){
 $('questions').innerHTML='<h3>Preguntas y decisiones pendientes</h3>'+draft.questions.map((q,i)=>`<fieldset class="question"><legend>${esc(q.id)} · ${esc(q.question)}${q.blocking?' · Bloqueante':''}</legend><label>Respuesta<textarea data-answer="${i}" rows="2">${esc(q.answer)}</textarea></label><label>Motivo y fuente<input data-rationale="${i}" value="${esc(q.rationale)}"></label><span class="hint">Responsable: ${esc(q.owner)}</span></fieldset>`).join('');
 $('questions').querySelectorAll('input,textarea').forEach(e=>e.disabled=!canEdit());
}
function render(){
 dirty=false;$('workspace').hidden=false;$('login').hidden=true;
 const p=view.state.phases[1];draft=structuredClone(p);draft.questions||=[{id:'Q-ENV',question:'¿Cuál es el entorno, URL y build afectados?',owner:view.actor.id,blocking:true,answer:'',rationale:''},{id:'Q-REPRO',question:'¿Qué pasos y evidencia permiten validar el requerimiento?',owner:view.actor.id,blocking:true,answer:'',rationale:''}];draft.sources||=[];draft.owner||=view.actor.id;
 $('sessionStatus').textContent=(view.actor.mode==='sso'?'Sesión corporativa':'Revisión local sintética')+' · '+view.actor.id;
 $('requirementMeta').textContent=(draft.title||'Nuevo requerimiento manual')+' · v'+view.state.revision;
 $('intake').open=!draft.title;
 $('stageList').innerHTML=titles.map((t,i)=>`<li ${i===0?'aria-current="step"':''}><a href="${base}/${i?'advanced':''}" data-stage="${i+1}">${esc(t)}</a></li>`).join('');
 document.querySelectorAll('[data-stage]').forEach(a=>a.onclick=e=>{if(!guard())return e.preventDefault();sessionStorage.setItem('v3-phase',a.dataset.stage);});
 $('owner').innerHTML=view.identities.map(u=>`<option value="${esc(u.id)}" ${u.id===draft.owner?'selected':''}>${esc(u.id)}</option>`).join('');
 if(!view.identities.some(u=>u.id===draft.owner))$('owner').add(new Option(draft.owner,draft.owner,true,true));
 for(const k of ['title','context','constraints'])$(k).value=draft[k]||'';
 questions();
 $('saveHint').textContent='Cambios guardados · v'+view.state.revision;
 $('draftForm').querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=!canEdit());
 $('enrich').disabled=!canEdit()||!view.hermes?.configured||!view.state.azureIntakes?.length||view.hermes.execution?.status==='in-progress';
 $('aiHint').textContent=view.hermes?.configured?'Broker LLM configurado: inferencia sin herramientas, no agente Hermes. Solo snapshot importado; guarda primero. Estado: '+(view.hermes.execution?.status||'no ejecutado'):'Enriquecimiento automático deshabilitado: falta broker autorizado. Puedes responder y enriquecer manualmente. LLM no equivale a ejecución del agente Hermes.';
 const intake=view.state.azureIntakes?.at(-1);
 $('freshness').textContent=intake?`Snapshot importado ${intake.at} · revisión Azure ${intake.snapshot.root.rev} · hash ${intake.sourceHash}. Recargar esta pantalla relee V3, no Azure. Reimportar consulta Azure en vivo y requiere confirmación.`:'Sin importación Azure. Contexto manual, no leído en Azure.';
 $('original').textContent=intake?JSON.stringify(intake.snapshot,null,2):'Sin snapshot original; las fuentes manuales no implican lectura externa.';
 const history=view.state.history||[];
 $('versions').innerHTML=history.length?'<label>Comparar versión anterior<select id="compare">'+history.map(h=>`<option value="${h.revision}">v${h.revision}</option>`).reverse().join('')+'</select></label><pre id="diff"></pre>':'No hay versiones anteriores.';
 const diff=()=>{const old=history.find(h=>String(h.revision)===$('compare').value)?.phases[1]||{};const changes=[...new Set([...Object.keys(old),...Object.keys(draft)])].filter(k=>JSON.stringify(old[k])!==JSON.stringify(draft[k]));$('diff').textContent=changes.map(k=>`${k}\n− ${JSON.stringify(old[k]??null)}\n+ ${JSON.stringify(draft[k]??null)}`).join('\n\n')||'Sin diferencias en enriquecimiento.';};
 if(history.length){$('compare').onchange=diff;diff();}
 $('blockers').textContent=(view.blockers[1]||[]).join(' ');
 const s=view.staffing||{};$('directoryFreshness').textContent=`Copia Azure: ${s.directorySyncedAt||'sin fecha verificada'} · catálogo V3 v${s.catalogRevision||'0'}. Actualizar pantalla relee snapshot; no sincroniza Azure en vivo.`;
 const prior=$('projectFilter').value;$('projectFilter').innerHTML='<option value="">Todos</option>'+(s.projects||[]).map(p=>`<option>${esc(p)}</option>`).join('');$('projectFilter').value=prior;
 candidates();
}
function candidates(){const s=view.staffing||{},name=normalize($('peopleFilter').value),role=$('capability').value,project=$('projectFilter').value;
 const rows=(s.candidates||[]).filter(c=>(!name||normalize(c.name+' '+s.fronts?.find(f=>f.id===c.frontId)?.name).includes(name))&&(!role||c.roles.includes(role))&&(!project||c.project===project));
 $('candidates').innerHTML=rows.length?rows.map(c=>`<div class="candidate"><strong>${esc(c.name)}</strong> · ${esc(s.fronts?.find(f=>f.id===c.frontId)?.name)}<br>${esc(c.project)} · ${esc(c.roles.join(', '))} · ${esc(c.level)} · no confirma disponibilidad</div>`).join(''):'<p>Sin resultados. '+esc(s.warning||'No hay participaciones habilitadas para estos filtros.')+'</p>';
}
function collect(){for(const k of ['title','owner','context','constraints'])draft[k]=$(k).value;document.querySelectorAll('[data-answer]').forEach(e=>draft.questions[Number(e.dataset.answer)].answer=e.value);document.querySelectorAll('[data-rationale]').forEach(e=>draft.questions[Number(e.dataset.rationale)].rationale=e.value);return draft;}
function guard(){return !dirty||confirm('Hay cambios sin guardar. ¿Descartarlos para continuar?');}
async function load(){view=await api('/api/state');render();}
$('draftForm').oninput=()=>{dirty=true;$('saveHint').textContent='Cambios sin guardar';};
$('draftForm').onsubmit=e=>{e.preventDefault();run(async()=>{view=await api('/api/action',{type:'save',phase:1,revision:view.state.revision,data:collect()});render();notice('Nueva versión guardada. Puedes recargar o retomar más tarde.');});};
$('addQuestion').onclick=()=>{collect();const question=prompt('Pregunta o decisión pendiente:');if(!question?.trim())return;draft.questions.push({id:'Q-'+crypto.randomUUID(),question:question.trim(),owner:view.actor.id,blocking:true,answer:'',rationale:''});questions();dirty=true;$('saveHint').textContent='Cambios sin guardar';};
$('reload').onclick=()=>{if(guard())run(load);};
$('next').onclick=e=>{if(!guard())return e.preventDefault();sessionStorage.setItem('v3-phase','2');};
for(const id of ['peopleFilter','capability','projectFilter'])$(id).addEventListener(id==='peopleFilter'?'input':'change',candidates);
$('azureSearchForm').onsubmit=e=>{e.preventDefault();run(async()=>{selected=null;$('azureResults').textContent='Consultando Azure…';const result=await api('/api/azure/search?q='+encodeURIComponent($('azureQuery').value));$('azureResults').innerHTML=result.items.length?result.items.map(item=>`<p>#${item.id} · ${esc(item.title)} · ${esc(item.project)} · ${esc(item.type)} · ${esc(item.state)} <button type="button" data-select="${item.id}" ${item.importAllowed?'':'disabled'}>${item.importAllowed?'Seleccionar':'Importación no autorizada'}</button></p>`).join('')+(result.mayHaveMore?'<p>Hasta 20 resultados; precisa la búsqueda.</p>':''):'<p>Sin resultados. Prueba otro ID o título.</p>';
 document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=result.items.find(i=>i.id===Number(b.dataset.select));document.querySelector('[data-import]')?.remove();const button=document.createElement('button');button.type='button';button.dataset.import='';button.textContent=`Importar #${selected.id} · ${selected.project}`;button.onclick=()=>run(async()=>{if(!guard())return;if(!confirm(`¿Importar Azure #${selected.id} del proyecto ${selected.project}? Se conserva el original y el historial; no escribe en Azure.`))return;view=await api('/api/azure/import',{id:selected.id,revision:view.state.revision,confirmReplace:$('replace').checked});render();$('questions').scrollIntoView({block:'nearest'});notice('Original importado. Responde las preguntas y guarda tu enriquecimiento.');});$('azureResults').append(button);});
 });};
$('enrich').onclick=()=>run(async()=>{if(dirty)throw Error('Guarda los cambios antes de solicitar inferencia');if(!confirm('Enviar el snapshot importado al broker LLM autorizado (sin agente). ¿Confirmas la autorización de estos datos?'))return;await api('/api/hermes/enrich',{revision:view.state.revision,executionId:crypto.randomUUID()});await load();notice('Ejecución reservada. Revisa su estado; el resultado no supone aprobación.');const timer=setInterval(()=>{if(!dirty)run(async()=>{await load();if(view.hermes.execution?.status!=='in-progress')clearInterval(timer);});},1500);});
$('loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/api/login',{token:$('token').value});$('token').value='';await load();});};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{config=await api('/api/config');if(config.authMode==='sso'){$('sessionStatus').innerHTML=`<a href="${esc(config.loginUrl)}">Iniciar sesión corporativa</a>`;$('loginHint').textContent='Se requiere SSO corporativo y asignación RBAC por tenant + oid exactos.';}else{$('loginForm').hidden=false;$('loginHint').textContent='Solo revisión aislada con datos sintéticos. No introduzcas contraseña Microsoft.';}
 try{await load();}catch(e){$('login').hidden=false;notice(e.message,true);}
 }catch(e){notice(e.message,true);}})();
