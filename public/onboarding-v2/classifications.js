const $=id=>document.getElementById(id);
const base=new URL('.',import.meta.url).pathname.replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roleNames={developer:'Desarrollador',reviewer:'Revisor',support:'Apoyo'};
let view,busy=false,dirty=false;
const notice=(text,error=false)=>{$('catalogMessage').textContent=text;$('catalogMessage').classList.toggle('error',error);};
async function request(payload){
 const response=await fetch(base+'/api/classifications',{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',...(payload?{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});
 const data=await response.json();
 if(!response.ok){if([401,403].includes(response.status))$('accessHelp').hidden=false;throw Object.assign(new Error(data.error||'No se pudo completar la operación.'),{status:response.status});}return data;
}
function options(id,items,empty='Todos'){
 const previous=$(id).value;$(id).innerHTML=`<option value="">${empty}</option>`+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
 if([...$(id).options].some(o=>o.value===previous))$(id).value=previous;
}
function render(){
 const s=view.catalog;$('catalogWorkspace').hidden=false;$('accessHelp').hidden=true;
 $('catalogIdentity').textContent=`${view.actor.id} · ${view.actor.mode==='sso'?'Sesión corporativa':'Revisión local de prueba'}`;
 $('catalogRevision').textContent=`Versión del catálogo: ${s.revision}`;
 $('readOnly').hidden=view.canManage;
 for(const id of ['newFront','newParticipation','syncDirectory'])$(id).hidden=!view.canManage;
 $('syncDirectory').disabled=!view.sourceConfigured;
 $('newParticipation').disabled=!s.directory.users.length||!s.fronts.some(f=>f.active);
 $('directoryStatus').textContent=s.directory.syncedAt?`Copia de Azure: ${s.directory.syncedAt} · ${s.directory.users.length} identidades. Importación al catálogo: ${s.directory.importedAt||'sin fecha'}.`:'No hay usuarios importados. El operador debe configurar una copia autorizada de identidades Azure antes de asignar participaciones.';
 if(!view.sourceConfigured)$('directoryStatus').textContent+=' Fuente del servidor pendiente de configuración.';
 $('frontList').innerHTML=s.fronts.length?`<table><caption class="sr-only">Catálogo de frentes</caption><thead><tr><th scope="col">Frente</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${s.fronts.map(f=>`<tr><td><strong>${esc(f.name)}</strong><small>${esc(f.description)}</small></td><td>${f.active?'Activo':'Inactivo'}</td><td>${view.canManage?`<div class="row-actions"><button data-front-edit="${esc(f.id)}">Editar</button><button class="danger" data-front-delete="${esc(f.id)}">Eliminar</button></div>`:'Solo lectura'}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aún no hay frentes. Crea uno, por ejemplo Android, Backend o QA, antes de asignar personas.</p>';
 options('filterFront',s.fronts);options('filterProject',[...new Set(s.directory.users.flatMap(u=>u.projects))].sort().map(p=>({id:p,name:p})));
 renderParticipations();
 const audit=s.audit.slice(-50).reverse();
 $('catalogHistory').innerHTML=`<p class="muted">${s.audit.length} cambios registrados. Se muestran los últimos ${audit.length}.</p>`+audit.map(a=>`<details><summary>${esc(a.type)} · ${esc(a.actor)} · ${esc(a.at)} · v${a.revision}</summary><h3>Antes</h3><pre>${esc(JSON.stringify(a.before,null,2))}</pre><h3>Después</h3><pre>${esc(JSON.stringify(a.after,null,2))}</pre></details>`).join('');
 $('frontList').querySelectorAll('[data-front-edit]').forEach(b=>b.onclick=()=>openFront(s.fronts.find(f=>f.id===b.dataset.frontEdit)));
 $('frontList').querySelectorAll('[data-front-delete]').forEach(b=>b.onclick=()=>remove('front',b.dataset.frontDelete));
}
function renderParticipations(){
 const s=view.catalog,q=$('filterQuery').value.toLocaleLowerCase('es').trim();
 const enabled=p=>{const u=s.directory.users.find(u=>u.id===p.userId);return Boolean(p.enabled&&s.fronts.find(f=>f.id===p.frontId)?.active&&u&&p.projects.every(project=>u.projects.includes(project)));};
 const records=s.participations.filter(p=>{
  const u=s.directory.users.find(u=>u.id===p.userId);return (!q||`${u?.name||p.userId} ${u?.email||''}`.toLocaleLowerCase('es').includes(q))&&(!$('filterFront').value||p.frontId===$('filterFront').value)&&(!$('filterProject').value||p.projects.includes($('filterProject').value))&&(!$('filterRole').value||p.roles.includes($('filterRole').value))&&(!$('filterEnabled').value||String(enabled(p))===$('filterEnabled').value);
 });
 $('resultCount').textContent=`${records.length} de ${s.participations.length} participaciones`;
 $('participationList').innerHTML=records.length?`<table><caption class="sr-only">Participaciones filtradas</caption><thead><tr><th scope="col">Persona</th><th scope="col">Frente y participación</th><th scope="col">Proyectos</th><th scope="col">Habilitación</th><th scope="col">Acciones</th></tr></thead><tbody>${records.map(p=>{
  const u=s.directory.users.find(u=>u.id===p.userId),f=s.fronts.find(f=>f.id===p.frontId);return `<tr><td><strong>${esc(u?.name||p.userId)}</strong><small>${esc(u?.email||'Identidad ausente de la última copia de Azure')}</small></td><td>${esc(f?.name||'Frente eliminado')} · ${p.level==='principal'?'Principal':'Secundario'}<small>${p.roles.map(r=>roleNames[r]).join(', ')}</small></td><td>${p.projects.map(esc).join('<br>')}</td><td>${enabled(p)?'Habilitada':'No habilitada o sin vigencia en origen'}<small>Confirmó: ${esc(p.confirmedBy)}</small></td><td>${view.canManage?`<div class="row-actions"><button data-part-edit="${esc(p.id)}">Editar</button><button class="danger" data-part-delete="${esc(p.id)}">Eliminar</button></div>`:'Solo lectura'}</td></tr>`;
 }).join('')}</tbody></table>`:'<p class="empty">No hay participaciones que coincidan. Ajusta los filtros o asigna una persona de Azure a un frente.</p>';
 $('participationList').querySelectorAll('[data-part-edit]').forEach(b=>b.onclick=()=>openParticipation(s.participations.find(p=>p.id===b.dataset.partEdit)));
 $('participationList').querySelectorAll('[data-part-delete]').forEach(b=>b.onclick=()=>remove('participation',b.dataset.partDelete));
}
function discard(){return !dirty||confirm('Hay cambios sin guardar. ¿Descartarlos?');}
function closeForms(){$('frontForm').hidden=true;$('participationForm').hidden=true;dirty=false;}
function openFront(front){
 if(!discard())return;closeForms();$('frontForm').reset();$('frontId').value=front?.id||'';$('frontName').value=front?.name||'';$('frontDescription').value=front?.description||'';$('frontActive').checked=front?.active??true;$('frontFormTitle').textContent=front?'Editar frente':'Crear frente';$('frontForm').hidden=false;$('frontName').focus();
}
function projects(selected=[]){
 const known=view.catalog.directory.users.find(u=>u.id===$('participationUser').value);
 const historical=view.catalog.participations.find(p=>p.id===$('participationId').value&&p.userId===$('participationUser').value);
 const u=known||(historical?{projects:historical.projects}:null);
 $('participationProjects').innerHTML=u?.projects.length?u.projects.map(p=>`<label class="check"><input type="checkbox" name="participationProject" value="${esc(p)}" ${selected.includes(p)?'checked':''}>${esc(p)}</label>`).join(''):'<p>No hay proyectos sincronizados para esta identidad. Actualiza la fuente de Azure.</p>';
}
function openParticipation(p){
 if(!discard())return;closeForms();$('participationForm').reset();
 const identities=[...view.catalog.directory.users];if(p&&!identities.some(u=>u.id===p.userId))identities.push({id:p.userId,name:p.userId+' · Ausente de la última copia (solo retirar)'});
 options('participationUser',identities,'Selecciona una persona');options('participationFront',view.catalog.fronts,'Selecciona un frente');
 $('participationId').value=p?.id||'';$('participationUser').value=p?.userId||'';$('participationFront').value=p?.frontId||'';$('participationLevel').value=p?.level||'principal';$('participationEnabled').checked=p?.enabled??true;$('participationNotes').value=p?.notes||'';
 document.querySelectorAll('[name=participationRole]').forEach(e=>e.checked=p?.roles.includes(e.value)||false);projects(p?.projects||[]);
 $('participationFormTitle').textContent=p?'Editar participación':'Asignar participación';$('participationForm').hidden=false;$('participationUser').focus();
}
async function action(type,extra={}){
 if(busy)return;busy=true;const buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
 try{view=await request({type,revision:view.catalog.revision,...extra});closeForms();render();notice('Cambio guardado y registrado en el historial. No se modificó Azure DevOps.');}
 catch(e){notice(e.message+' Tus campos se conservan; si existe un conflicto, revisa y recarga el catálogo.',true);}
 finally{busy=false;buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});if(view){$('newParticipation').disabled=!view.catalog.directory.users.length||!view.catalog.fronts.some(f=>f.active);$('syncDirectory').disabled=!view.sourceConfigured;}}
}
async function remove(entity,id){if(!discard())return;if(confirm('¿Eliminar este registro? El historial conservará los valores anteriores.'))await action(entity+'.delete',{id});}
$('frontForm').onsubmit=e=>{e.preventDefault();const id=$('frontId').value;action(id?'front.update':'front.create',{...(id?{id}:{}),data:{name:$('frontName').value,description:$('frontDescription').value,active:$('frontActive').checked}});};
$('participationForm').onsubmit=e=>{e.preventDefault();const id=$('participationId').value;action(id?'participation.update':'participation.create',{...(id?{id}:{}),data:{userId:$('participationUser').value,frontId:$('participationFront').value,level:$('participationLevel').value,roles:[...document.querySelectorAll('[name=participationRole]:checked')].map(e=>e.value),projects:[...document.querySelectorAll('[name=participationProject]:checked')].map(e=>e.value),enabled:$('participationEnabled').checked,notes:$('participationNotes').value}});};
$('participationUser').onchange=()=>projects();
$('newFront').onclick=()=>openFront();$('newParticipation').onclick=()=>openParticipation();
for(const id of ['cancelFront','cancelParticipation'])$(id).onclick=()=>{if(discard())closeForms();};
for(const form of ['frontForm','participationForm'])$(form).addEventListener('input',()=>{dirty=true;});
for(const id of ['filterQuery','filterFront','filterProject','filterRole','filterEnabled'])$(id).addEventListener('input',renderParticipations);
$('syncDirectory').onclick=()=>{if(discard())action('directory.sync');};
$('catalogReload').onclick=async()=>{if(!discard())return;try{view=await request();closeForms();render();notice('Catálogo actualizado desde el servidor.');}catch(e){notice(e.message,true);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
let directory;
function renderPublicDirectory(){
 if(!directory)return;
 const query=$('publicDirectoryQuery').value.trim().toLocaleLowerCase('es'),front=$('publicDirectoryFront').value;
 const users=directory.users.filter(u=>(!query||u.name.toLocaleLowerCase('es').includes(query))&&(!front||(front==='__unclassified'?!u.fronts.length:u.fronts.includes(front))));
 $('publicDirectoryCount').textContent=`${users.length} de ${directory.users.length} usuarios sincronizados`;
 $('publicDirectoryList').innerHTML=users.length?`<table class="public-directory-table"><caption>Consulta pública de usuarios</caption><thead><tr><th scope="col">Nombre</th><th scope="col">Frentes clasificados</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.name)}</td><td>${u.fronts.length?u.fronts.map(esc).join(', '):'Sin clasificar'}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">No hay usuarios que coincidan. Prueba otro nombre o frente.</p>';
}
async function loadPublicDirectory(){
 const button=$('publicDirectoryReload');button.disabled=true;
 try{
  const response=await fetch(base+'/api/directory',{credentials:'omit',cache:'no-store'});
  if(response.status===404){$('publicDirectorySection').hidden=true;return;}
  const data=await response.json();$('publicDirectorySection').hidden=false;
  if(!response.ok)throw new Error(data.error||'No se pudo cargar el listado público.');
  directory=data;
  $('publicDirectorySource').textContent=`Copia de Azure · Última sincronización de origen: ${directory.syncedAt}. No es una consulta en vivo.`;
  const selected=$('publicDirectoryFront').value;
  $('publicDirectoryFront').innerHTML='<option value="">Todos los frentes</option><option value="__unclassified">Sin clasificar</option>'+[...new Set(directory.users.flatMap(u=>u.fronts))].sort().map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if([...$('publicDirectoryFront').options].some(o=>o.value===selected))$('publicDirectoryFront').value=selected;
  renderPublicDirectory();
 }catch(e){directory=null;$('publicDirectoryList').innerHTML='';$('publicDirectoryCount').textContent='';$('publicDirectorySource').textContent=e.message;}
 finally{button.disabled=false;}
}
$('publicDirectoryReload').onclick=loadPublicDirectory;
for(const id of ['publicDirectoryQuery','publicDirectoryFront'])$(id).addEventListener('input',renderPublicDirectory);
loadPublicDirectory();
request().then(v=>{view=v;render();notice('Catálogo listo. Las modificaciones requieren el rol de coordinador.');}).catch(e=>{
 if([401,403].includes(e.status)){
  $('catalogIdentity').textContent='Consulta pública · sin acceso de administración';
  notice('Para crear o modificar clasificaciones, inicia sesión con una identidad autorizada.');
 }else notice(e.message,true);
});
