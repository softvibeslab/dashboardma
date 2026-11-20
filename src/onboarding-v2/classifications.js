import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {publishCatalog} from './catalog-projection.js';
import {importResearch} from './classification-review.js';

export class CatalogError extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
const fail=(message,status)=>{throw new CatalogError(message,status);};
const empty=()=>({schema:'mobilityapps.classifications.v1',revision:0,fronts:[],participations:[],directory:{source:'not-connected',syncedAt:null,users:[]},audit:[]});
const text=(value,max=2000)=>{if(typeof value!=='string'||value.length>max)fail('Texto inválido o demasiado largo.');return value.trim();};
const object=(value)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail('Se esperaba un objeto.');return value;};
const only=(value,keys)=>{object(value);if(Object.keys(value).some(k=>!keys.includes(k)))fail('Campo no permitido.');};
const label=name=>text(name,120).normalize('NFKC').toLocaleLowerCase('es');
export function projectAzureDirectory(snapshot){
 const syncedAt=snapshot?.meta?.azureSync?.syncedAt;
 if(!syncedAt||Number.isNaN(Date.parse(syncedAt)))fail('La copia Azure requiere fecha de sincronización verificable.');
 if(!Array.isArray(snapshot.users))fail('La copia no contiene una colección de usuarios.');
 const byId=new Map();
 for(const u of snapshot.users){
  if(u.syncSource!=='azure-devops'||!u.azureIdentityKey)continue;
  const id=text(u.azureIdentityKey,500);
  const previous=byId.get(id);
  const projects=Array.isArray(u.projects)?u.projects.filter(p=>typeof p==='string'&&p.length<=200):[];
  byId.set(id,{id,name:text(u.name||u.email||id,300),email:text(u.email||'',300),projects:[...new Set([...(previous?.projects||[]),...projects])]});
 }
 return {source:'azure-devops-snapshot',syncedAt,users:[...byId.values()]};
}
const queues=new Map();
export class ClassificationStore {
 constructor(file,{directoryFile='',researchDirectory='',projectionFile=''}={}){this.file=resolve(file);this.directoryFile=directoryFile;this.researchDirectory=researchDirectory;this.projectionFile=projectionFile; if(projectionFile&&resolve(projectionFile)===this.file)throw Error('La proyección debe estar separada del catálogo canónico.');}
 get queue(){return queues.get(this.file)||Promise.resolve();}
 set queue(value){queues.set(this.file,value);}
 async view(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return empty();throw e;}}
 async publicView(){
  if(!this.directoryFile)fail('Listado público pendiente de configuración de la fuente Azure.',503);
  let source;try{const raw=await readFile(this.directoryFile,'utf8');if(raw.length>8*1024*1024)throw Error('size');source=JSON.parse(raw);}catch{fail('La copia de usuarios no está disponible. Inténtalo más tarde.',503);}
  if(source.source!=='azure-devops-snapshot'||!source.syncedAt||Number.isNaN(Date.parse(source.syncedAt))||!Array.isArray(source.users)||source.users.length>10000)fail('La copia de usuarios no es válida.',503);
  const state=await this.view();
  const users=source.users.map(u=>{
   const raw=typeof u?.name==='string'?u.name.slice(0,300):'';
   const cleaned=raw.replace(/[^\s<>]+@[^\s<>]+/g,'').replace(/[<>]/g,'').trim();
   const name=cleaned&&cleaned!==u?.id&&!/^[0-9a-f-]{20,}$/i.test(cleaned)?cleaned:'Nombre no disponible';
   const fronts=[...new Set(state.participations.filter(p=>p.userId===u?.id&&p.enabled).map(p=>state.fronts.find(f=>f.id===p.frontId&&f.active)?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
   return {name,fronts};
  }).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return {source:'azure-devops-snapshot',syncedAt:source.syncedAt,users};
 }
 async exclusive(callback){
  await mkdir(dirname(this.file),{recursive:true});let lock;
  try{lock=await open(this.file+'.lock','wx',0o600);}catch(e){if(e.code==='EEXIST')fail('Catálogo bloqueado por otro escritor; solicita revisión al operador.',503);throw e;}
  try{return await callback();}finally{await lock.close();await unlink(this.file+'.lock');}
 }
 async withSnapshot(callback){
  const work=this.queue.then(()=>this.exclusive(async()=>{const state=await this.view();await publishCatalog(state,this.projectionFile);return callback(state);}));
  this.queue=work.catch(()=>{});return work;
 }
 async act(action,actor){
  if(!actor?.authenticated||!actor.roles?.includes('coordinator'))fail('Rol coordinator requerido para administrar clasificaciones.',403);
  only(action,['type','revision','id','data']);
  return this.withSnapshot(async s=>{
   if(action.revision!==s.revision)fail('Conflicto de revisión: recarga antes de guardar.',409);
   const now=new Date().toISOString();let data=action.data;
   let recordId=action.id,before=null,after=null,reviewRecord=null,decision=null;
   if(action.type==='review.decide'){
    only(data,['outcome','reason','batchHash','participation']);
    reviewRecord=s.review?.proposals.find(p=>p.id===action.id);
    if(!reviewRecord)fail('Propuesta no encontrada.',404);
    if(reviewRecord.status!=='pending')fail('Propuesta ya decidida; conserva su historial.',409);
    if(data.batchHash!==reviewRecord.batchHash)fail('Versión exacta de propuesta requerida.',409);
    const reason=text(data.reason);if(!reason)fail('Motivo de revisión obligatorio.');
    if(!['accept','correct','reject'].includes(data.outcome))fail('Decisión inválida.');
    decision={outcome:data.outcome,reason,batchHash:reviewRecord.batchHash,actor:actor.id,at:now,revision:s.revision+1};
    if(data.outcome==='reject'){
     if(data.participation!==undefined)fail('Rechazar no crea participación.');
    }else{
     if(!['alta','media'].includes(reviewRecord.confidence)||!reviewRecord.evidence.length||reviewRecord.evidence.some(e=>!e.available))fail('Evidencia insuficiente: mantener pendiente o rechazar.');
     only(data.participation,['frontId','level','roles','projects','enabled']);
     const front=s.fronts.find(f=>f.id===data.participation.frontId&&f.active);
     if(!front)fail('Selecciona un frente actual activo.');
     if(data.outcome==='accept'&&front.name!==reviewRecord.frontName)fail('El frente cambió; usa corregir explícitamente.');
     let current;try{current=JSON.parse(await readFile(this.directoryFile,'utf8'));}catch{fail('Copia actual de identidades no disponible.',503);}
     const user=current.users?.find(u=>u.id===reviewRecord.userId);
     if(current.source!=='azure-devops-snapshot'||current.syncedAt!==s.directory.syncedAt)fail('Copia actual cambió: sincroniza y revisa de nuevo.',409);
     if(!user||!Array.isArray(user.projects)||!Array.isArray(data.participation.projects)||data.participation.projects.some(p=>!user.projects.includes(p)))fail('Identidad o proyectos ausentes de la copia actual; mantener pendiente.');
     data={...data.participation,userId:reviewRecord.userId};
    }
   }
   if(action.type==='review.import'){
    if(action.data!==undefined||action.id!==undefined)fail('El cliente no puede suministrar investigación.');
    if(!await importResearch(s,this.researchDirectory,actor,now))return s;
    recordId=s.review.batches.at(-1).hash;after={batch:s.review.batches.at(-1)};
   }else if(action.type==='directory.sync'){
    if(action.data!==undefined)fail('El cliente no puede suministrar identidades para sincronización.');
    if(!this.directoryFile)fail('Fuente Azure no configurada. Solicita al operador la copia sincronizada.',503);
    let source;try{const raw=await readFile(this.directoryFile,'utf8');if(raw.length>8*1024*1024)fail('Directorio demasiado grande.');source=JSON.parse(raw);}catch(e){if(e instanceof CatalogError)throw e;fail('No se pudo leer la fuente Azure configurada.',503);}
    if(source.source!=='azure-devops-snapshot'||!source.syncedAt||Number.isNaN(Date.parse(source.syncedAt))||!Array.isArray(source.users)||source.users.length>10000)fail('Fuente Azure inválida o sin fecha de sincronización.');
    const users=source.users.map(u=>{
     object(u);const id=text(u.id,500),name=text(u.name||u.email||u.id,300),email=text(u.email||'',300);
     if(!id||!Array.isArray(u.projects)||u.projects.some(p=>typeof p!=='string'||p.length>200))fail('Identidad de Azure inválida.');
     return {id,name,email,projects:[...new Set(u.projects)]};
    });
    if(new Set(users.map(u=>u.id)).size!==users.length)fail('Identidades Azure duplicadas.');
    before={source:s.directory.source,syncedAt:s.directory.syncedAt,count:s.directory.users.length};
    s.directory={source:source.source,syncedAt:source.syncedAt,importedAt:now,users};
    after={source:source.source,syncedAt:source.syncedAt,count:users.length};
   }else if(decision?.outcome==='reject'){
    before={status:reviewRecord.status};after={status:'rejected'};
   }else if(action.type==='participation.create'||action.type==='participation.update'||decision){
    only(data,['userId','frontId','level','roles','projects','enabled','notes']);
    const previous=action.type==='participation.update'?s.participations.find(p=>p.id===action.id):null;
    if(action.type==='participation.update'&&!previous)fail('Participación no encontrada.',404);
    const user=s.directory.users.find(u=>u.id===data.userId);
    const retiringMissing=Boolean(previous&&previous.userId===data.userId&&data.enabled===false&&!user);
    if(!user&&!retiringMissing)fail('Selecciona una identidad sincronizada desde Azure.');
    const identity=user||{id:previous.userId,projects:previous.projects};
    const front=s.fronts.find(f=>f.id===data.frontId);if(!front)fail('Frente no encontrado.');
    if(typeof data.enabled!=='boolean'||!['principal','secondary'].includes(data.level))fail('Nivel o habilitación inválidos.');
    if(data.enabled&&!front.active)fail('Activa el frente antes de habilitar la participación.');
    if(!Array.isArray(data.roles)||!data.roles.length||data.roles.some(r=>!['developer','reviewer','support'].includes(r)))fail('Participación: selecciona desarrollar, revisar o apoyar.');
    if(!Array.isArray(data.projects)||!data.projects.length||data.projects.some(p=>!identity.projects.includes(p)))fail('Selecciona proyectos registrados para esa identidad en Azure.');
    if(s.participations.some(p=>p.id!==action.id&&p.userId===identity.id&&p.frontId===front.id))fail('Ya existe una participación para esta persona y frente.',409);
    if(data.level==='principal'&&data.enabled&&s.participations.some(p=>p.id!==action.id&&p.userId===identity.id&&p.level==='principal'&&p.enabled))fail('La persona ya tiene un frente principal habilitado.',409);
    const next={id:previous?.id||randomUUID(),userId:identity.id,frontId:front.id,level:data.level,roles:[...new Set(data.roles)],projects:[...new Set(data.projects)],enabled:data.enabled,notes:text(data.notes||''),confirmedBy:actor.id,createdAt:previous?.createdAt||now,updatedAt:now};
    before=previous;after=next;recordId=next.id;
    if(previous)s.participations[s.participations.indexOf(previous)]=next;else s.participations.push(next);
   }else if(action.type==='participation.delete'){
    const i=s.participations.findIndex(p=>p.id===action.id);if(i<0)fail('Participación no encontrada.',404);
    before=s.participations[i];s.participations.splice(i,1);
   }else if(action.type==='front.create'||action.type==='front.update'){
    only(data,['name','description','active']);
    const name=text(data.name,120);if(!name)fail('El nombre del frente es obligatorio.');
    if(s.fronts.some(f=>f.id!==action.id&&label(f.name)===label(name)))fail('Ya existe un frente con ese nombre.',409);
    if(data.active!==undefined&&typeof data.active!=='boolean')fail('Estado inválido.');
    const previous=action.type==='front.update'?s.fronts.find(f=>f.id===action.id):null;
    if(action.type==='front.update'&&!previous)fail('Frente no encontrado.',404);
    const next={id:previous?.id||randomUUID(),name,description:text(data.description||''),active:data.active??true,createdAt:previous?.createdAt||now,updatedAt:now};
    before=previous;after=next;
    if(previous)s.fronts[s.fronts.indexOf(previous)]=next;else s.fronts.push(next);
    recordId=next.id;
   }else if(action.type==='front.delete'){
    const i=s.fronts.findIndex(f=>f.id===action.id);if(i<0)fail('Frente no encontrado.',404);
    if(s.participations.some(p=>p.frontId===action.id))fail('El frente tiene participaciones; desactívalo o retira sus relaciones antes de eliminar.',409);
    before=s.fronts[i];s.fronts.splice(i,1);
   }else fail('Acción de catálogo no disponible.');
   if(decision){
    if(decision.outcome!=='reject'){decision.participationId=after.id;decision.participation=structuredClone(after);}
    reviewRecord.status={accept:'accepted',correct:'corrected',reject:'rejected'}[decision.outcome];
    reviewRecord.history.push(decision);recordId=reviewRecord.id;
    after={decision,participation:decision.participation||null};
   }
   s.revision++;
   s.audit.push({id:randomUUID(),type:action.type,recordId,actor:actor.id,at:now,revision:s.revision,before,after});
   await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.pending';
   await writeFile(tmp,JSON.stringify(s,null,2),{mode:0o600});await rename(tmp,this.file);try{await publishCatalog(s,this.projectionFile);}catch(e){e.committedRevision=s.revision;e.message='El catálogo quedó guardado en revisión '+s.revision+'; la proyección está pendiente. Recarga antes de reintentar.';throw e;}return s;
  });
 }
}
