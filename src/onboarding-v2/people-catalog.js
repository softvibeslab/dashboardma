import {readFile} from 'node:fs/promises';
const pick=(value,keys)=>value?Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]])):null;
const frontKeys=['id','name','description','active','createdAt','updatedAt'];
const participationKeys=['id','userId','frontId','level','roles','projects','enabled','notes','confirmedBy','createdAt','updatedAt'];
export async function peopleCatalogView(s,{actor,users,projectionFile}){
 let provenance=null;if(projectionFile)provenance=JSON.parse(await readFile(projectionFile,'utf8')).provenance;
 const audit=s.audit.filter(a=>/^(front|participation)\.(create|update|delete)$/.test(a.type)).map(a=>{const u=users.find(u=>u.id===a.actor),keys=a.type.startsWith('front.')?frontKeys:participationKeys;return {id:a.id,type:a.type,recordId:a.recordId,actor:a.actor,actorName:u?.name||'Nombre de autor no disponible',actorEmail:u?.email||'',at:a.at,revision:a.revision,before:pick(a.before,keys),after:pick(a.after,keys)};});
 return {catalog:{schema:s.schema,revision:s.revision,fronts:s.fronts.map(f=>pick(f,frontKeys)),participations:s.participations.map(p=>pick(p,participationKeys)),directory:{source:s.directory.source,syncedAt:s.directory.syncedAt,users:[]},audit},canManage:Boolean(projectionFile)&&actor.roles.includes('coordinator'),sourceConfigured:Boolean(s.directory.syncedAt),actor:{id:actor.id,mode:actor.mode},projection:{status:provenance?'published':'not-configured',...provenance}};
}
export function peopleCatalogAction(input){
 if(!input||input.confirm!==true)throw Object.assign(Error('Confirma explícitamente el cambio de catálogo.'),{status:400});
 if(!['front.create','front.update','front.delete','participation.create','participation.update','participation.delete'].includes(input.type))throw Object.assign(Error('Esta ruta solo administra frentes y participaciones; no importa investigación ni identidades.'),{status:400});
 const {confirm,...action}=input;return action;
}
