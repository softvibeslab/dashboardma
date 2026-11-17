import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max)fail('Texto de investigación inválido.');return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();};
const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail('Periodo de investigación inválido.');return v;};
export const REVIEW_LIMITS='Evidencia histórica, no disponibilidad, productividad ni acreditación de especialidad. Propuesta no confirmada; no concede acceso ni asigna trabajo en Azure.';
export async function importResearch(state,directory,actor,now){
 if(!directory)fail('Fuente privada de investigación no configurada.',503);
 let proposalsRaw,evidenceRaw,source,evidence;
 try{[proposalsRaw,evidenceRaw]=await Promise.all(['classification-proposals.json','evidence.json'].map(n=>readFile(join(directory,n),'utf8')));if(proposalsRaw.length>8*1024*1024||evidenceRaw.length>32*1024*1024)throw Error();source=JSON.parse(proposalsRaw);evidence=JSON.parse(evidenceRaw);}catch{fail('Fuente privada no disponible o inválida.',503);}
 if(source.schemaVersion!==1||source.mode!=='read-only-private-research'||!Array.isArray(source.users)||source.users.length>10000||!evidence||typeof evidence!=='object'||Array.isArray(evidence))fail('Esquema de investigación no admitido.');
 const window={start:date(source.window?.start),end:date(source.window?.end)};
 if(Date.parse(window.start)>Date.parse(window.end))fail('Periodo de investigación inválido.');
 const batchHash=hash(proposalsRaw+'\n'+evidenceRaw);
 state.review??={schema:1,batches:[],proposals:[]};
 if(state.review.batches.some(b=>b.hash===batchHash))return false;
 const records=[],seen=new Set();
 for(const user of source.users){
  const userId=text(user.azureIdentityKey,500);if(!userId||seen.has(userId))fail('Identidad de investigación duplicada o inválida.');seen.add(userId);
  if(!Array.isArray(user.proposedFronts)||user.proposedFronts.length>100)fail('Propuestas inválidas.');
  const fronts=user.proposedFronts.length?user.proposedFronts:[{front:'',confidence:'insuficiente',reason:user.insufficientExplanation||'Evidencia insuficiente; requiere revisión humana.',evidenceIds:[]}];
  const seenFronts=new Set();
  for(const proposal of fronts){
   const frontName=text(proposal.front,120);if(seenFronts.has(frontName))fail('Frente de investigación duplicado.');seenFronts.add(frontName);
   if(!['alta','media','baja','insuficiente'].includes(proposal.confidence)||!Array.isArray(proposal.evidenceIds)||proposal.evidenceIds.length>100)fail('Confianza o evidencia inválida.');
   const refs=proposal.evidenceIds.map(id=>{
    id=text(id,500);const e=Object.hasOwn(evidence,id)?evidence[id]:null;
    const ref={id,available:Boolean(e&&typeof e==='object'&&!Array.isArray(e))};
    if(ref.available){
     if(typeof e.type==='string')ref.type=text(e.type,40);
     const kind=['date','changedDate','createdDate'].find(k=>typeof e[k]==='string'&&Number.isFinite(Date.parse(e[k])));
     if(kind){ref.date=text(e[kind],100);ref.dateKind=kind;}
     if(typeof e.caveat==='string')ref.caveat=text(e.caveat);
     for(const key of ['withinWindow','merge','initialImport','historyPartial','pathListPartial'])if(typeof e[key]==='boolean')ref[key]=e[key];
    }
    return ref;
   });
   const id=hash(JSON.stringify([batchHash,userId,frontName]));
   records.push({id,batchHash,userId,frontName,confidence:proposal.confidence,reason:text(proposal.reason),evidence:refs,window,limits:REVIEW_LIMITS,status:'pending',history:[]});
  }
 }
 state.review.batches.push({hash:batchHash,sourceHashes:{proposals:hash(proposalsRaw),evidence:hash(evidenceRaw)},sourceDate:window.end,window,importedAt:now,importedBy:actor.id,records:records.length});
 state.review.proposals.push(...records);return true;
}
