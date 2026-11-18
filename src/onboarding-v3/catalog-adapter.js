import {readFile} from 'node:fs/promises';
import {ClassificationStore,CatalogError} from '../onboarding-v2/classifications.js';
// Only a server-configured, read-only projection is accepted. No research, audit,
// historical evidence, RBAC or user-provided paths cross this adapter.
export class ReadOnlyCatalogAdapter extends ClassificationStore {
 async view(){
  let s;try{const raw=await readFile(this.file,'utf8');if(raw.length>8*1024*1024)throw Error();s=JSON.parse(raw);
   if(!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.fronts)||!Array.isArray(s.participations)||s.fronts.length>1000||s.participations.length>10000)throw Error();
   if(s.fronts.some(f=>typeof f.id!=='string'||typeof f.name!=='string'||typeof f.active!=='boolean')||s.participations.some(p=>typeof p.userId!=='string'||typeof p.frontId!=='string'||!Array.isArray(p.roles)||p.roles.some(r=>!['developer','reviewer','support'].includes(r))||!Array.isArray(p.projects)||p.projects.some(x=>typeof x!=='string')||typeof p.enabled!=='boolean'))throw Error();
  }catch{throw new CatalogError('Fuente autorizada del catálogo no disponible o inválida.',503);}
  return {schema:'mobilityapps.classifications.v1',revision:s.revision,fronts:s.fronts.map(({id,name,active})=>({id,name,active})),participations:s.participations.map(({userId,frontId,roles,projects,level,enabled})=>({userId,frontId,roles,projects,level:level==='principal'?'principal':'secondary',enabled})),directory:{source:'not-imported',users:[]},audit:[],sourceMode:'read-only'};
 }
 async withSnapshot(callback){return callback(await this.view());}
 async act(){throw new CatalogError('Catálogo fuente de solo lectura. Las participaciones se gobiernan en su origen; V3 no concede permisos.',403);}
}
