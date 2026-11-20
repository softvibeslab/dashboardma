// Presentation only. Callers must resolve authorization by exact signed tid+oid.
export function displayIdentity(user={},session={}){
 const text=v=>typeof v==='string'?v.trim():'';
 const name=v=>{const s=text(v);return !s||s===user.id||/^USR-|^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s)||s.includes('@')?'':s;};
 return {name:name(session.name)||name(user.name)||'Nombre no disponible',email:text(session.email)||text(user.email)||'Correo no disponible'};
}
