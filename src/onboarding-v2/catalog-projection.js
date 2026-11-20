import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const failure=message=>Object.assign(Error(message),{status:503});
// Only the canonical writer publishes. Consumers mount the parent read-only and
// re-open this atomically replaced file; never bind a single replaceable inode.
export function catalogProjection(s){
 const content={schema:'mobilityapps.classifications.v1',revision:s.revision,fronts:s.fronts.map(({id,name,active})=>({id,name,active})),participations:s.participations.map(({userId,frontId,roles,projects,level,enabled})=>({userId,frontId,roles:[...roles],projects:[...projects],level:level==='principal'?'principal':'secondary',enabled}))};
 return {...content,provenance:{source:'onboarding-v2-canonical',catalogRevision:s.revision,directorySyncedAt:s.directory.syncedAt||null,committedAt:s.audit.at(-1)?.at||null,contentHash:createHash('sha256').update(JSON.stringify(content)).digest('hex')}};
}
export async function publishCatalog(s,file){
 if(!file)return null;
 const next=catalogProjection(s);let previous;
 try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw failure('La proyección del catálogo no es legible; solicita revisión.');}
 if(previous&&(!Number.isSafeInteger(previous.revision)||previous.revision>s.revision))throw failure('La proyección tiene una revisión superior o inválida; no se permite retroceder.');
 if(previous?.provenance){const content=Object.fromEntries(['schema','revision','fronts','participations'].map(k=>[k,previous[k]]));if(createHash('sha256').update(JSON.stringify(content)).digest('hex')!==previous.provenance.contentHash)throw failure('La proyección no supera la comprobación de integridad.');}
 if(previous?.provenance?.contentHash===next.provenance.contentHash&&previous.provenance.directorySyncedAt===next.provenance.directorySyncedAt)return previous.provenance;
 next.provenance.publishedAt=new Date().toISOString();
 await mkdir(dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.pending';
 try{await writeFile(temporary,JSON.stringify(next,null,2),{mode:0o600});await rename(temporary,file);}catch{await unlink(temporary).catch(()=>{});throw failure('No se pudo publicar la proyección del catálogo. Recarga para verificar la propagación.');}
 const verified=JSON.parse(await readFile(file,'utf8'));if(verified.provenance?.contentHash!==next.provenance.contentHash)throw failure('No se pudo verificar la proyección publicada.');return verified.provenance;
}
