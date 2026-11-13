import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {getSession} from '../auth.js';
import {initial,change,blockers,digest,objects,objectHash,currentDecision,packageFor} from './model.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function createV2Server({dataFile=path.join(root,'data/onboarding-v2/state.json'),users=[],basePath='',authMode='local-review',sessionSecret='',publicOrigin=''}={}){
 if(basePath&&!/^\/[a-zA-Z0-9/_-]+$/.test(basePath))throw Error('V2_BASE_PATH inválido.');
 basePath=basePath.replace(/\/$/,'');
 if(!['local-review','sso'].includes(authMode))throw Error('V2_AUTH_MODE inválido.');
 if(authMode==='sso'&&!sessionSecret)throw Error('SSO requiere SESSION_SECRET; no se permite fallback local.');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw Error('V2_PUBLIC_ORIGIN debe ser un origen exacto.');
 const sessions=new Map();let queue=Promise.resolve();
 const loginUrl=`/dashboard/auth/login?returnTo=${encodeURIComponent(basePath||'/dashboard/onboarding-v2')}`;
 const read=async()=>{try{return JSON.parse(await readFile(dataFile,'utf8'));}catch(e){if(e.code==='ENOENT')return initial();throw e;}};
 const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 const body=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Solicitud demasiado grande.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');};
 const srv=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(basePath){if(url.pathname!==basePath&&!url.pathname.startsWith(basePath+'/'))return send(res,404,{error:'Fuera de la entrada V2.'});url.pathname=url.pathname.slice(basePath.length)||'/';}
  const expectedOrigin=publicOrigin||`http://${req.headers.host}`;
  if(req.method==='POST'&&req.headers.origin!==expectedOrigin)return send(res,403,{error:'Origen no permitido.'});
  if(url.pathname==='/api/config'&&req.method==='GET')return send(res,200,{authMode,basePath,loginUrl:authMode==='sso'?loginUrl:null});
  if(url.pathname==='/api/login'&&req.method==='POST'){
   if(authMode!=='local-review')return send(res,403,{error:'Login local deshabilitado en SSO.',loginUrl});
   const {token}=await body(req);const user=users.find(u=>typeof token==='string'&&typeof u.token==='string'&&token.length>=16&&Buffer.byteLength(token)===Buffer.byteLength(u.token)&&timingSafeEqual(Buffer.from(token),Buffer.from(u.token)));
   if(!user)return send(res,401,{error:'Clave de revisión inválida. No es login corporativo.'});
   const key=randomBytes(32).toString('hex');sessions.set(key,{id:user.id,roles:user.roles,authenticated:true,mode:'local-review',expires:Date.now()+4*3600000});
   res.setHeader('set-cookie',`v2_session=${key}; Path=${basePath||'/'}; HttpOnly; SameSite=Strict; Max-Age=14400${expectedOrigin.startsWith('https:')?'; Secure':''}`);return send(res,200,{ok:true});
  }
  if(url.pathname.startsWith('/api/')){
   const key=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('v2_session='))?.slice(11);let actor;
   if(authMode==='sso'){
    let session;try{session=getSession(req,{enabled:true,sessionSecret});}catch{session=null;}
    if(!session?.tid||!session?.oid)return send(res,401,{error:'Sesión corporativa requerida.',loginUrl});
    const user=users.find(u=>u.tid===session.tid&&u.oid===session.oid);
    if(url.pathname==='/api/access'&&req.method==='GET')return send(res,200,{mode:'sso',assigned:Boolean(user),identity:{tid:session.tid,oid:session.oid,name:session.name||'',email:session.email||''}});
    if(!user)return send(res,403,{error:'Identidad autenticada sin asignación RBAC V2. Solicita acceso al coordinador.'});
    actor={id:user.id,roles:user.roles,authenticated:true,mode:'sso',name:session.name||user.id};
   }else actor=sessions.get(key);
   if(!actor||actor.expires<Date.now())return send(res,401,{error:'Identificación requerida. Revisión local, no autenticación corporativa.'});
   if(url.pathname==='/api/logout'&&req.method==='POST'){
    if(authMode==='sso')return send(res,200,{logoutUrl:'/dashboard/auth/logout'});
    sessions.delete(key);res.setHeader('set-cookie',`v2_session=; Path=${basePath||'/'}; HttpOnly; SameSite=Strict; Max-Age=0`);return send(res,200,{ok:true});
   }
   const view=async()=>{const state=await read();return {state,actor,hash:digest(state),blockers:Object.fromEntries([1,2,3,4,5,6,7].map(p=>[p,blockers(state,p)])),objects:objects(state).map(object=>({object,hash:objectHash(state,object),decision:currentDecision(state,object)||null})),identities:users.map(u=>({id:u.id,roles:u.roles})),integrations:{ai:'not-run',azure:'not-connected',repositories:'not-read'}};};
   if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,await view());
   if(url.pathname==='/api/package'&&req.method==='GET'){
    const p=packageFor(await read());res.setHeader('Content-Disposition','attachment; filename="onboarding-v2-package.json"');return send(res,200,p);
   }
   if(url.pathname==='/api/action'&&req.method==='POST'){
    const action=await body(req);
    const work=queue.then(async()=>{const next=change(await read(),action,actor);await mkdir(path.dirname(dataFile),{recursive:true});const temp=dataFile+'.pending';await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,dataFile);return view();});
    queue=work.catch(()=>{});return send(res,200,await work);
   }
   return send(res,404,{error:'Ruta no disponible.'});
  }
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Método no permitido.'});
  const names={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};const name=names[url.pathname];if(!name)return send(res,404,{error:'Solo onboarding V2.'});
  let text=await readFile(path.join(root,'public/onboarding-v2',name));
  if(name==='index.html')text=Buffer.from(text.toString().replaceAll('href="/styles.css"',`href="${basePath}/styles.css"`).replaceAll('src="/app.js"',`src="${basePath}/app.js"`).replaceAll('href="/"',`href="${basePath}/"`));
  res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8','cache-control':'no-store'});res.end(text);
 }catch(e){const message=e.message||'Error';const status=/versión|hash|bloque/.test(message)?409:/autentic|Rol |rol |asignad|responsable|destinatario/.test(message)?403:400;send(res,status,{error:message});}});
 return srv;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configFile=process.env.V2_IDENTITY_ROLES_FILE||process.env.V2_REVIEW_USERS_FILE;
 const users=configFile?JSON.parse(await readFile(configFile,'utf8')):[];
 const port=Number(process.env.V2_PORT||4191),host=process.env.V2_LISTEN_HOST||'127.0.0.1',basePath=process.env.V2_BASE_PATH||'',authMode=process.env.V2_AUTH_MODE||'local-review';
 const server=createV2Server({dataFile:process.env.V2_DATA_FILE,users,basePath,authMode,sessionSecret:process.env.SESSION_SECRET,publicOrigin:process.env.V2_PUBLIC_ORIGIN});
 server.listen(port,host,()=>console.log(`Onboarding V2: http://${host}:${port}${basePath}/ (${authMode}; ${users.length} identidades configuradas)`));
}
