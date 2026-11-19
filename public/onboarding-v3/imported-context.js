import {azureLink} from './azure-links.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clip=v=>{const s=typeof v==='string'?v:JSON.stringify(v);return esc(s?.slice(0,1200)||'Sin contenido')+(s?.length>1200?'… [vista acotada; original conservado]':'');};
// Presentation only: never write this projection back to the snapshot or LLM payload.
// Pure text conversion; source markup is never inserted into a DOM or fetched.
export function azureText(value){
 if(typeof value!=='string')return '';
 let text=value;
 const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',bull:'•',hellip:'…'};
 for(let i=0;i<3;i++)text=text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(all,key)=>{
  if(key[0]!=='#')return entities[key.toLowerCase()]??all;
  const code=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
 });
 return text.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<(script|style|iframe|object|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'')
  .replace(/<li\b[^>]*>/gi,'\n• ').replace(/<\/?(?:p|div|ul|ol|h[1-6]|br|tr|blockquote)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'')
  .replace(/[\t \r\f]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
const fieldText=v=>typeof v==='string'?v.trim():'';
function sourceText(label,value){
 const text=azureText(value)||'No registrados en la fuente',limit=label==='Descripción'?320:240;
 const shortened=text.length>limit,preview=shortened?text.slice(0,limit).replace(/\s+\S*$/,''):text;
 return `<section class="azure-source-text"><h5>${label}</h5><p>${esc(preview)}${shortened?'…':''}</p>${shortened?`<details class="azure-full-text"><summary>${label==='Descripción'?'Ver descripción completa':'Ver criterios completos'}</summary><p>${esc(text)}</p></details>`:''}</section>`;
}
export function renderImportedContext(intake,serverUrl){
 if(!intake)return {summary:'Sin snapshot importado. Busca, selecciona e importa un requerimiento antes de enriquecer.',resources:'No hay recursos Azure leídos ni enviados al modelo.'};
 const s=intake.snapshot,r=s.root,items=[r,...(s.children||[])],read=items.filter(x=>x.fields),attachments=read.flatMap(x=>(x.attachments||[]).map(a=>({...a,itemId:x.id})));
 const comments=read.reduce((n,x)=>n+(x.comments?.items?.length||0),0);
 const link=s.organization==='https://dev.azure.com/MobileappsAmerica'&&s.project==='agileNestCorp'?azureLink({id:r.id,project:r.fields?.['System.TeamProject'],webUrl:serverUrl??r.webUrl}):'';
 const f=r.fields||{},assigned=f['System.AssignedTo'];
 const meta=[['Asignado a',typeof assigned==='object'&&assigned?fieldText(assigned.displayName):fieldText(assigned)],['Área',fieldText(f['System.AreaPath'])],['Iteración',fieldText(f['System.IterationPath'])],['Actualizado en Azure',fieldText(f['System.ChangedDate'])]].filter(([,value])=>value);
 const summary=`<h4>Resumen del requerimiento en Azure</h4><p class="azure-source-title">${esc(fieldText(f['System.Title'])||`Azure #${r.id} · título no registrado`)}</p><p class="azure-source-meta">Azure #${esc(r.id)} · ${esc(fieldText(f['System.WorkItemType'])||'tipo no registrado')} · Estado: ${esc(fieldText(f['System.State'])||'no registrado')} · proyecto ${esc(f['System.TeamProject']||s.project||'no informado')} · revisión ${esc(r.rev)}</p>${sourceText('Descripción',f['System.Description'])}${sourceText('Criterios de aceptación',f['Microsoft.VSTS.Common.AcceptanceCriteria'])}${meta.length?`<dl class="azure-source-data">${meta.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}<p class="hint">Lectura del snapshot, vista extractiva sin análisis IA. Original de solo lectura; no se modifica Azure.${link?`<br><strong>Fuente vinculada al expediente</strong> · ${link} · importación v${esc(intake.version)}`:''}</p>`;
 const resources=`<details><summary>Detalle de recursos y lectura</summary><p>Contexto LLM: título, descripción, criterios, comentarios leídos e hijos leídos; solo texto de adjuntos extraídos. Otros campos se conservan en el original, no se envían. Repositorios no leídos; URLs referenciadas no descargadas.</p><ul><li>Campos raíz: ${Object.keys(r.fields||{}).length} leídos</li><li>Comentarios: ${comments} leídos · ${read.some(x=>x.comments?.status==='partial')?'lectura parcial':'ver límites por fuente'}</li><li>Hijos: ${read.length-1} leídos / ${(s.children||[]).length} inventariados</li><li>Adjuntos: ${attachments.filter(a=>a.status==='extracted').length} con texto extraído / ${attachments.length} inventariados</li></ul><details><summary>Revisar campos y recursos usados como contexto</summary>${items.map(x=>`<h4>#${esc(x.id)}${fieldText(x.fields?.['System.Title'])?' · '+esc(x.fields['System.Title']):''} · ${x.fields?'leído · rev '+esc(x.rev):'lectura fallida / no usado'}</h4>${x.fields?`<dl>${Object.entries(x.fields).map(([k,v])=>`<dt>${esc(k)}${['System.Title','System.Description','Microsoft.VSTS.Common.AcceptanceCriteria'].includes(k)?' · contexto LLM':' · solo original'}</dt><dd>${clip(v)}</dd>`).join('')}</dl><h5>Comentarios · ${esc(x.comments?.status||'estado no informado')}</h5>${(x.comments?.items||[]).map(c=>`<p>#${c.id} v${c.version}: ${clip(c.text)}</p>`).join('')||'<p>Sin comentarios leídos</p>'}`:''}`).join('')}<h4>Adjuntos y recursos</h4>${attachments.map(a=>`<p>#${a.itemId} · ${esc(a.name)} · ${a.status==='extracted'?'leído: texto extraído':a.status==='metadata-only'?'solo metadata; no enviado como texto':'no soportado / lectura fallida; no usado'}${a.warning?' · '+esc(a.warning):''}</p>`).join('')||'<p>Sin adjuntos inventariados</p>'}<p>${(s.warnings||[]).map(esc).join(' · ')}</p></details></details>`;
 return {summary,resources};
}
