import { renderAzureAttachments } from '../collaboration.js';

const pending = data => ['queued', 'running'].includes(data?.status);
export function azureSourcesMarkup() {
 return `<section data-intake-azure aria-label="Fuentes de Azure DevOps"><h3>Fuentes de Azure DevOps</h3><p class="hint">Consulta los adjuntos del ticket vinculado y ábrelos con tu sesión de Azure. Ver un adjunto no significa que Hermes haya leído su contenido. No se descargan ni incorporan automáticamente al enriquecimiento.</p><button type="button" class="secondary" data-azure-sources-refresh>Consultar/Actualizar adjuntos</button><p data-azure-sources-message role="status"></p><div data-azure-sources-results aria-live="polite">Consultando vínculo con Azure…</div></section>`;
}
export function createAzureSources({id,request,render=()=>{}}) {
 const state={data:null,busy:false,error:''}; let destroyed=false,epoch=0;
 const endpoint=`/dashboard/api/requirements/${encodeURIComponent(id)}/azure-attachments`;
 const paint=()=>{if(!destroyed)render(state);};
 async function read(post=false){
  if(destroyed||state.busy)return false;
  const token=++epoch;state.busy=true;state.error='';paint();
  try{
   const data=await request(endpoint,post?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:undefined);
   if(destroyed||token!==epoch)return false;
   state.data=data;return true;
  }catch(e){if(!destroyed&&token===epoch)state.error=e.message;return false;}
  finally{if(!destroyed&&token===epoch){state.busy=false;paint();}}
 }
 return {state,load:()=>read(),refresh:()=>read(true),destroy(){destroyed=true;epoch++;}};
}
export function mountAzureSources(panel,{id,request}) {
 if(!panel)return {load:async()=>{},destroy(){}};
 const result=panel.querySelector('[data-azure-sources-results]'),message=panel.querySelector('[data-azure-sources-message]'),button=panel.querySelector('[data-azure-sources-refresh]');
 let timer,destroyed=false,started=Date.now();
 const controller=createAzureSources({id,request,render(state){
  if(destroyed)return;
  button.disabled=state.busy||(pending(state.data)&&!state.error);
  message.textContent=state.error||(state.busy?'Consultando…':'');
  if(state.data)result.innerHTML=renderAzureAttachments(state.data);
  clearTimeout(timer);
  if(!state.busy&&!state.error&&pending(state.data)&&!document.hidden){
   if(Date.now()-started<360000)timer=setTimeout(()=>controller.load(),2500);
   else{message.textContent='La consulta sigue pendiente. Pulsa Consultar/Actualizar adjuntos para revisar.';button.disabled=false;}
  }
 }});
 function click(){started=Date.now();if(pending(controller.state.data))void controller.load();else void controller.refresh();}
 function visible(){clearTimeout(timer);if(!document.hidden&&pending(controller.state.data)){started=Date.now();void controller.load();}}
 button.addEventListener('click',click);document.addEventListener('visibilitychange',visible);
 void controller.load();
 return {load:controller.load,destroy(){destroyed=true;clearTimeout(timer);controller.destroy();button.removeEventListener('click',click);document.removeEventListener('visibilitychange',visible);}};
}
