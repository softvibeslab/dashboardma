// Read-only connector. No browser-supplied URLs or Azure write credentials in DTOs.
const ORG='https://dev.azure.com/MobileappsAmerica';
const PROJECT='agileNestCorp';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const now=()=>new Date().toISOString();
export class AzureIntake {
 constructor({token='',allowedIds=[],fetcher=fetch}={}){this.token=token;this.allowedIds=new Set(allowedIds);this.fetcher=fetcher;}
 configured(){return Boolean(this.token&&this.allowedIds.size);}
 safeUrl(value){
  try{const u=new URL(value);if(u.origin!==new URL(ORG).origin||u.username||u.password||u.hash||u.port)return null;
   const parts=u.pathname.split('/').slice(1).map(decodeURIComponent);
   if(parts[0]!=='MobileappsAmerica'||parts.some(p=>p==='.'||p==='..'||p.includes('/')||p.includes('\\')))return null;
   if(!/^\/MobileappsAmerica\/(?:agileNestCorp\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)?_apis\/wit\/(?:attachments\/[a-zA-Z0-9-]+|workitems\/\d+)$/i.test(u.pathname))return null;
   return u;
  }catch{return null;}
 }
 async search(query){
  if(typeof query!=='string'||(query.trim().length<2&&!/^[1-9]\d*$/.test(query.trim()))||query.trim().length>120||/[\x00-\x1f\x7f]/.test(query))throw fail(400,'Busca por ID o título de 2 a 120 caracteres.');
  if(!this.configured())throw fail(503,'Intake Azure no configurado.');
  query=query.trim();const numeric=/^[1-9]\d*$/.test(query);
  if(numeric&&!Number.isSafeInteger(Number(query)))throw fail(400,'ID Azure inválido.');
  const clause=numeric?`[System.Id] = ${Number(query)}`:`[System.Title] CONTAINS '${query.replace(/'/g,"''")}'`;
  const url=new URL(`${ORG}/${PROJECT}/_apis/wit/wiql?api-version=7.1`);url.searchParams.set('$top','20');
  const found=await this.get(url,{query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' AND ${clause} ORDER BY [System.ChangedDate] DESC, [System.Id] DESC`});
  if(!Array.isArray(found.workItems)||found.workItems.length>20||found.workItems.some(i=>!Number.isSafeInteger(i.id)||i.id<=0))throw fail(502,'Azure: resultados de búsqueda inválidos.');
  const ids=[...new Set(found.workItems.map(i=>i.id))];
  if(!ids.length)return {items:[],limit:20,mayHaveMore:false};
  const fields=['System.Title','System.WorkItemType','System.State','System.TeamProject'];
  const detail=new URL(`${ORG}/${PROJECT}/_apis/wit/workitems?api-version=7.1`);detail.searchParams.set('ids',ids.join(','));detail.searchParams.set('fields',fields.join(','));
  const data=await this.get(detail);
  if(!Array.isArray(data.value)||data.value.length>20||data.value.some(i=>!ids.includes(i.id)||i.fields?.['System.TeamProject']!==PROJECT||fields.some(f=>typeof i.fields[f]!=='string'||i.fields[f].length>1024)))throw fail(502,'Azure: metadatos de búsqueda inválidos.');
  const items=ids.map(id=>data.value.find(i=>i.id===id)).filter(Boolean).map(i=>({id:i.id,title:i.fields['System.Title'],type:i.fields['System.WorkItemType'],state:i.fields['System.State'],project:PROJECT,importAllowed:this.allowedIds.has(i.id)}));
  return {items,limit:20,mayHaveMore:found.workItems.length===20};
 }
 async get(url,{bytes=1024*1024,json=true,query}={}){
  let response;
  try{response=await this.fetcher(url,{method:query?'POST':'GET',...(query?{body:JSON.stringify({query})}:{}),headers:{...(query?{'content-type':'application/json'}:{}),authorization:`Basic ${Buffer.from(':'+this.token).toString('base64')}`,accept:json?'application/json':'application/octet-stream'},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw fail(502,'Azure: conexión fallida o redirección rechazada.');}
  if(!response.ok){await response.body?.cancel();throw fail(502,`Azure: respuesta HTTP ${response.status}.`);}
  const chunks=[];let size=0;
  try{for await(const chunk of response.body){size+=chunk.length;if(size>bytes)throw Error('limit');chunks.push(chunk);}}
  catch{await response.body?.cancel().catch(()=>{});throw fail(502,'Azure: fuente excede límite o lectura incompleta.');}
  const text=Buffer.concat(chunks).toString('utf8');
  if(!json)return text;
  try{return JSON.parse(text);}catch{throw fail(502,'Azure: JSON inválido.');}
 }
 async comments(id){
  const items=[],warnings=[],seen=new Set();let token;
  for(let page=0;page<10;page++){
   const url=new URL(`${ORG}/${PROJECT}/_apis/wit/workitems/${id}/comments`);url.searchParams.set('api-version','7.1-preview.4');url.searchParams.set('$top','100');if(token)url.searchParams.set('continuationToken',token);
   try{const data=await this.get(url);if(!Array.isArray(data.comments))throw Error();items.push(...data.comments);token=data.continuationToken;
    if(!token)return {items,fetchedAt:now(),status:'read',warnings};
    if(typeof token!=='string'||token.length>2048||seen.has(token))throw Error();seen.add(token);
   }catch{warnings.push('Comentarios incompletos: fuente fallida o paginación inválida.');return {items,fetchedAt:now(),status:'partial',warnings};}
  }
  return {items,fetchedAt:now(),status:'partial',warnings:['Comentarios truncados: límite de 10 páginas.']};
 }
 async item(id){
  const url=`${ORG}/${PROJECT}/_apis/wit/workitems/${id}?$expand=all&api-version=7.1`;
  const item=await this.get(url);
  if(item.id!==id||!Number.isSafeInteger(item.rev)||item.fields?.['System.TeamProject']!==PROJECT||!Array.isArray(item.relations||[]))throw fail(502,'Azure: identidad/proyecto o estructura de fuente inválida.');
  const attachments=[];const relations=item.relations||[];
  const warnings=[];
  for(const relation of relations.filter(r=>r.rel==='AttachedFile').slice(0,20)){
   const a={name:String(relation.attributes?.name||''),url:relation.url,sourceRevision:item.rev,fetchedAt:now(),status:'metadata-only'};attachments.push(a);
   const safe=this.safeUrl(a.url);
   if(!safe||!safe.pathname.toLowerCase().includes('/attachments/')){a.warning='URL no aprobada; no descargada.';continue;}
   if(!/\.(txt|md|csv|json)$/i.test(a.name)){a.warning='Formato no soportado: solo TXT/MD/CSV/JSON UTF-8; sin OCR/IA.';continue;}
   // Rebuild URL to discard all untrusted query parameters.
   safe.search='?api-version=7.1';
   try{const text=await this.get(safe,{json:false,bytes:256*1024});if(text.includes('\0')||text.includes('\uFFFD')||text.length>100000)throw Error();a.text=text;a.status='extracted';a.extractor='utf8-text-v1';}
   catch{a.status='failed';a.warning='Descarga/extracción fallida o límite de 256 KiB / 100000 caracteres.';}
  }
  if(relations.filter(r=>r.rel==='AttachedFile').length>20)warnings.push('Adjuntos restantes solo inventariados en relaciones: límite de 20.');
  const comments=await this.comments(id);comments.sourceRevision=item.rev;comments.url=`${ORG}/${PROJECT}/_apis/wit/workitems/${id}/comments?api-version=7.1-preview.4`;warnings.push(...comments.warnings);
  return {...item,url,fetchedAt:now(),comments,attachments,warnings};
 }
 async read(id){
  if(!Number.isSafeInteger(id)||id<=0)throw fail(400,'ID Azure inválido.');
  if(!this.allowedIds.has(id))throw fail(403,'Work item no permitido para intake.');
  if(!this.configured())throw fail(503,'Intake Azure no configurado.');
  const root=await this.item(id),children=[],warnings=[...root.warnings];
  const links=(root.relations||[]).filter(r=>r.rel==='System.LinkTypes.Hierarchy-Forward');
  for(const link of links.slice(0,10)){
   const u=this.safeUrl(link.url),childId=u&&Number(u.pathname.split('/').at(-1));
   if(!childId){warnings.push('Relación hijo no aprobada; no consultada.');continue;}
   try{children.push(await this.item(childId));}catch{children.push({id:childId,status:'failed',fetchedAt:now(),warning:'No se pudo leer el hijo.'});warnings.push(`Hijo ${childId}: lectura fallida.`);}
  }
  if(links.length>10)warnings.push('Hijos truncados: máximo 10 de primer nivel; sin recursión.');
  warnings.push('URLs embebidas inventariadas en campos/comentarios; no descargadas. No se ejecutó IA ni se verificaron causas o entorno.');
  const snapshot={schema:'azure-intake.v1',organization:ORG,project:PROJECT,root,children,fetchedAt:now(),warnings};
  if(Buffer.byteLength(JSON.stringify(snapshot))>8*1024*1024)throw fail(502,'Azure: snapshot excede límite de 8 MiB.');
  return snapshot;
 }
}
