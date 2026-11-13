const e = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const same = (a,b) => ['id','versionId','revision','stage'].every(k=>a?.[k]===b?.[k]);
const eligible = b => b?.id && b.stage===1 && b.versionId && !b.blocked;
export function createTechnologyController({getBinding,request,applyEditor,confirm=globalThis.confirm,render=()=>{},schedule=fn=>setTimeout(fn,3000),cancel=clearTimeout,hidden=()=>globalThis.document?.hidden,now=()=>Date.now()}) {
 const state={result:null,busy:false,error:''}; let epoch=0,timer,dead=false,origin,started=0;
 const current=(token,b)=>!dead && token===epoch && eligible(getBinding()) && same(b,getBinding());
 const url=b=>`/dashboard/api/requirements/${encodeURIComponent(b.id)}/technology-suggestion`;
 const compatible=(r,b)=>r?.context?.stage===1 && r.context.versionId===b.versionId && r.context.expectedRevision===b.revision;
 const paint=()=>{if(!dead)render(state);};
 const stop=()=>{if(timer!==undefined)cancel(timer);timer=undefined;};
 function poll(token,b) {
  stop(); if(now()-started>=360000 || !['queued','running'].includes(state.result?.run?.status))return;
  timer=schedule(async()=>{
   if(!current(token,b))return;
   if(hidden()){poll(token,b);return;}
   try {const result=await request(url(b));if(current(token,b)){state.result=result;paint();poll(token,b);}}
   catch(err){if(current(token,b)){state.error=err.message;paint();}}
  });
 }
 return {
  state,
  async consult() {
   const b={...getBinding()};if(!eligible(b)||state.busy||dead)return false;
   const token=++epoch;stop();origin=b;started=now();state.busy=true;state.error='';state.result=null;paint();
   try {
    const context=await request(url(b));if(!current(token,b))return false;
    if(!compatible(context,b))throw new Error('Guarda la versión seleccionada antes de consultar a Hermes.');
    const result=await request(url(b),{versionId:b.versionId,expectedRevision:b.revision,contextHash:context.context.hash});
    if(!current(token,b))return false;
    state.result=result;poll(token,b);return true;
   }catch(err){if(current(token,b))state.error=err.message;return false;}
   finally{if(!dead && token===epoch){state.busy=false;paint();}}
  },
  async apply() {
   const b={...getBinding()},proposal=state.result,token=epoch;
   if(state.busy || !eligible(b) || !same(origin,b) || !compatible(proposal,b) || proposal?.run?.status!=='completed' || !proposal.tracks?.length)return false;
   state.busy=true;paint();
   try {
    const fresh=await request(url(b));
    if(!current(token,b) || !compatible(fresh,b) || fresh.context.hash!==proposal.context.hash || fresh.run?.id!==proposal.run.id || fresh.run.status!=='completed')throw new Error('El contexto cambió. Consulta de nuevo; tus campos siguen intactos.');
    if(!confirm('¿Reemplazar los frentes del editor por esta propuesta? QA y Negocio se conservan. No se guardará nada hasta pulsar Guardar tecnologías y responsables.'))return false;
    if(!current(token,b))return false;
    applyEditor(proposal.tracks.map(({technology,area,ownerEmail})=>({technology,area,ownerEmail})));
    return true;
   }catch(err){if(current(token,b))state.error=err.message;return false;}
   finally{if(!dead){state.busy=false;paint();}}
  },
  destroy(){dead=true;epoch++;stop();}
 };
}
export function technologyMarkup({result=null,busy=false,error=''}={}) {
 const pending=['queued','running'].includes(result?.run?.status);
 return `<h3>Propuesta de Hermes</h3><p class="hint">Consulta la versión guardada y usuarios Azure sincronizados de este proyecto. Una asignación no acredita especialidad. QA y Negocio siguen siendo decisiones manuales.</p><button type="button" class="secondary" data-tech-consult ${busy||pending?'disabled':''}>${pending?'Hermes está analizando…':'Consultar a Hermes'}</button>${error?`<p class="message error" role="alert">${e(error)}</p>`:''}<div role="status">${busy?'Consultando…':e(result?.run?.status || '')}${result?.run?.error?`<p>${e(result.run.error)}</p>`:''}</div>${result?.run?.status==='completed'?`<p class="hint">Propuesta sin guardar · Modelo: ${e(result.run.model)} · Revisa, corrige y aplica al editor.</p>${result.tracks.map(t=>`<article class="record"><strong>${e(t.technology)} · ${e(t.area)}</strong><p>Responsable: ${e(t.ownerEmail || 'Pendiente · elige un correo antes de guardar')}</p><p>Confianza: ${e(({low:'Baja',medium:'Media',high:'Alta'})[t.confidence] || t.confidence)}</p><p>${e(t.rationale)}</p><p class="hint">Evidencia de asignación: ${e(t.evidenceIds?.join(', ') || 'Sin evidencia adecuada; corrección humana requerida')}</p></article>`).join('')}<button type="button" class="secondary" data-tech-apply ${busy?'disabled':''}>Aplicar al editor</button><p class="hint">Aplicar reemplaza solo los frentes visibles; no asigna roles, no firma ni avanza de etapa. Después corrige y guarda explícitamente.</p>`:''}`;
}
export function mountTechnologySuggestion(panel,options) {
 const controller=createTechnologyController({...options,render:state=>{panel.innerHTML=technologyMarkup(state);}});
 panel.innerHTML=technologyMarkup();
 const click=event=>{
  const button=event.target.closest('button');if(!button || button.disabled)return;
  if(button.hasAttribute('data-tech-consult'))void controller.consult();
  if(button.hasAttribute('data-tech-apply'))void controller.apply();
 };
 panel.addEventListener('click',click);
 return {destroy(){controller.destroy();panel.removeEventListener('click',click);}};
}
