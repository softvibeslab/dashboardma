import {readFile,mkdir,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const empty=()=>({revision:0,areas:[],people:[],history:[]});
export const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const only=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))fail('Campo no permitido.');};
const text=(s,max)=>{if(typeof s!=='string'||s.length>max)fail('Texto inválido.');return s.trim();};
const list=(s,allowed)=>{if(!Array.isArray(s)||s.length>100||s.some(x=>!allowed.includes(x))||new Set(s).size!==s.length)fail('Selección inválida.');return s;};
const queues=new Map();
export class PeopleStore{
 constructor(file){this.file=path.resolve(file);}
 async read(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return empty();throw e;}}
 async act(input,actor,directory){if(!actor.roles.includes('coordinator'))fail('Rol coordinator requerido.',403);only(input,['type','revision','confirm','id','data']);const run=(queues.get(this.file)||Promise.resolve()).then(async()=>{await mkdir(path.dirname(this.file),{recursive:true});let lock;try{lock=await open(this.file+'.lock','wx',0o600);}catch{fail('Almacenamiento bloqueado; solicita revisión.',503);}try{const s=await this.read();if(input.revision!==s.revision)fail('Conflicto de revisión: recarga antes de guardar.',409);if(input.confirm!==true)fail('Confirma explícitamente los cambios.');let before=null,after=null,id=input.id;const d=input.data;
 if(input.type==='area.save'){only(d,['name','active']);const name=text(d.name,120);if(!name||typeof d.active!=='boolean')fail('Nombre y estado del área requeridos.');if(s.areas.some(a=>a.id!==id&&a.name.normalize('NFKC').toLocaleLowerCase('es')===name.normalize('NFKC').toLocaleLowerCase('es')))fail('Ya existe un área con ese nombre.',409);before=s.areas.find(a=>a.id===id)||null;if(id&&!before)fail('Área no encontrada.',404);id=before?.id||randomUUID();after={id,name,active:d.active};if(before)s.areas[s.areas.indexOf(before)]=after;else s.areas.push(after);
 }else if(input.type==='area.delete'){before=s.areas.find(a=>a.id===id);if(!before)fail('Área no encontrada.',404);if(s.people.some(p=>p.areas.includes(id)))fail('Área asignada: desactívala en lugar de eliminarla.',409);s.areas=s.areas.filter(a=>a.id!==id);
 }else if(input.type==='person.save'){only(d,['areas','responsibilities','enabled','notes']);before=s.people.find(p=>p.id===id)||null;const user=directory.users.find(u=>u.id===id);if(!user&&!(before&&d.enabled===false))fail('Identidad ausente de la copia Azure actual.');if(typeof d.enabled!=='boolean')fail('Habilitación inválida.');const areas=list(d.areas,s.areas.filter(a=>a.active||before?.areas.includes(a.id)).map(a=>a.id));const responsibilities=list(d.responsibilities,['qa','product','business']);after={id,areas,responsibilities,enabled:d.enabled,notes:text(d.notes||'',2000)};if(before)s.people[s.people.indexOf(before)]=after;else s.people.push(after);
 }else fail('Acción no permitida. Las identidades solo proceden de Azure.');
 s.revision++;s.history.push({id:randomUUID(),type:input.type,recordId:id,before,after,actor:{id:actor.id,name:actor.name,email:actor.email},at:new Date().toISOString(),revision:s.revision});const tmp=this.file+'.'+randomUUID()+'.pending';await writeFile(tmp,JSON.stringify(s,null,2),{mode:0o600});await rename(tmp,this.file);return s;
 }finally{await lock.close();await unlink(this.file+'.lock');}});queues.set(this.file,run.catch(()=>{}));return run;}
}
