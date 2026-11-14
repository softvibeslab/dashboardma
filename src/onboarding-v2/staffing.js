import {readFile} from 'node:fs/promises';
import {CatalogError} from './classifications.js';
import {hash} from './model.js';

export const candidatesFor=(options,{frontId,project,role})=>options.candidates.filter(c=>c.frontId===frontId&&c.project===project&&c.roles.includes(role));
export class StaffingService {
 constructor(catalog,{directoryFile='',identities=[]}={}){
  this.catalog=catalog;this.directoryFile=directoryFile;this.identities=identities;
  const links=identities.map(u=>u.azureIdentityKey).filter(Boolean);
  if(new Set(links).size!==links.length)throw new CatalogError('Cada identidad Azure debe tener una sola vinculación de acceso V2.');
 }
 resolve(data,options){
  if(!data||typeof data!=='object'||!Array.isArray(data.fronts)||data.fronts.length>200)throw new CatalogError('La Etapa 2 requiere una lista de frentes válida.');
  if(data.fronts.length&&(!options.token||data.catalogToken!==options.token))throw new CatalogError('El catálogo o la copia Azure cambió. Recarga y revisa las selecciones antes de guardar.',409);
  const fronts=data.fronts.map(f=>{
   if(!f||typeof f!=='object'||Array.isArray(f))throw new CatalogError('Frente inválido.');
   const front=options.fronts.find(x=>x.id===f.catalogFrontId);if(!front)throw new CatalogError('Selecciona un frente activo del catálogo.');
   if(f.owner===f.reviewer)throw new CatalogError('El revisor debe ser independiente del responsable.');
   const owner=candidatesFor(options,{frontId:front.id,project:f.project,role:'developer'}).find(c=>c.userId===f.owner);
   const reviewer=candidatesFor(options,{frontId:front.id,project:f.project,role:'reviewer'}).find(c=>c.userId===f.reviewer);
   if(!owner||!reviewer)throw new CatalogError('Selecciona responsable y revisor habilitados para el frente, proyecto y función requeridos.');
   return {...f,discipline:front.name,ownerName:owner.name,reviewerName:reviewer.name,selectionToken:options.token};
  });
  return {...data,fronts,catalogToken:options.token,catalogRevision:options.catalogRevision,directorySyncedAt:options.directorySyncedAt};
 }
 assertCurrent(data,options){
  this.resolve(data,options);
  if(data.fronts.some(f=>f.selectionToken!==options.token))throw new CatalogError('Vincula y guarda los frentes con la versión vigente del catálogo antes de confirmar o aprobar.',409);
 }
 async current(snapshot){
  const s=snapshot||await this.catalog.view();
  const base={required:true,catalogRevision:String(s.revision),directorySyncedAt:'',token:'',fronts:[],projects:[],candidates:[],warning:null};
  if(!this.directoryFile)return {...base,warning:'La fuente de usuarios Azure no está configurada. Solicita su configuración al coordinador.'};
  let directory;
  try{
   const raw=await readFile(this.directoryFile,'utf8');if(raw.length>8*1024*1024)throw Error('size');directory=JSON.parse(raw);
   if(directory.source!=='azure-devops-snapshot'||!directory.syncedAt||Number.isNaN(Date.parse(directory.syncedAt))||!Array.isArray(directory.users)||directory.users.length>10000)throw Error('source');
   if(directory.users.some(u=>typeof u?.id!=='string'||typeof u?.name!=='string'||!Array.isArray(u?.projects)||u.projects.some(p=>typeof p!=='string')))throw Error('identity');
   if(new Set(directory.users.map(u=>u.id)).size!==directory.users.length)throw Error('duplicate');
  }catch{return {...base,warning:'No se pudo verificar la copia de usuarios Azure. No se proponen responsables.'};}
  const fronts=s.fronts.filter(f=>f.active).map(f=>({id:f.id,name:f.name}));
  const candidates=[];
  for(const participation of s.participations){
   if(!participation.enabled||!fronts.some(f=>f.id===participation.frontId))continue;
   const user=directory.users.find(u=>u.id===participation.userId);if(!user)continue;
   const linked=this.identities.find(i=>i.azureIdentityKey===user.id);
   for(const project of participation.projects.filter(p=>user.projects.includes(p))){
    candidates.push({userId:user.id,name:user.name,frontId:participation.frontId,project,roles:[...participation.roles],level:participation.level||'secondary',canConfirm:Boolean(linked?.roles.includes('editor')),canReview:Boolean(linked?.roles.includes('reviewer'))});
   }
  }
  candidates.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.project.localeCompare(b.project,'es'));
  const options={...base,fronts,projects:[...new Set(directory.users.flatMap(u=>u.projects))].sort(),candidates,directorySyncedAt:directory.syncedAt};
  options.token=hash({catalogRevision:options.catalogRevision,directorySyncedAt:options.directorySyncedAt,fronts:options.fronts,projects:options.projects,candidates:options.candidates});
  if(!fronts.length)options.warning='No hay frentes activos. Un coordinador debe crearlos y clasificar participantes en el catálogo.';
  else if(!candidates.length)options.warning='No hay participantes habilitados para los frentes y proyectos. Configura participaciones en el catálogo.';
  return options;
 }
}
