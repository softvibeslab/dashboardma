import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {getSession} from '../auth.js';
import {ClassificationStore} from '../onboarding-v2/classifications.js';
import {ReadOnlyCatalogAdapter} from './catalog-adapter.js';
import {continuityView,continuityChange,continuityPackage} from './continuity.js';
import {StaffingService} from '../onboarding-v2/staffing.js';
import {AzureIntake,azureIntakeFromEnv} from '../onboarding-v2/azure-intake.js';
import {v3AzureLinks,snapshotUrl,importLinkedProposal} from './azure-links.js';
import {HermesEnrichment,assertGeneration,applyEnrichment,failure} from '../onboarding-v2/hermes-enrichment.js';
import {brokerTransport} from '../onboarding-v2/hermes-broker.js';
import {DocumentaryAI,currentSeed,currentSummary,saveSeed,reviewSummary,applyDocumentary,derivatives} from './documentary-ai.js';
import {initial,change,blockers,digest,objects,objectHash,currentDecision} from '../onboarding-v2/model.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function createV3Server({dataFile=path.join(root,'data/onboarding-v3/state.json'),users=[],basePath='/dashboard/onboarding-v3',authMode='sso',sessionSecret='',publicOrigin='',classificationFile,catalogSourceFile='',directoryFile='',researchDirectory='',publicDirectory=false,staffingRequired=true,azureIntake=new AzureIntake(),hermesEnrichment=new HermesEnrichment(),documentaryAI=null}={}){
 azureIntake=v3AzureLinks(azureIntake);
 const catalog=catalogSourceFile?new ReadOnlyCatalogAdapter(catalogSourceFile,{directoryFile}):new ClassificationStore(classificationFile||path.join(path.dirname(dataFile),'classifications.json'),{directoryFile,researchDirectory});
 const staffing=new StaffingService(catalog,{directoryFile,identities:users});
 if(basePath&&!/^\/[a-zA-Z0-9/_-]+$/.test(basePath))throw Error('V3_BASE_PATH inválido.');
 basePath=basePath.replace(/\/$/,'');
 if(!['local-review','sso'].includes(authMode))throw Error('V3_AUTH_MODE inválido.');
 if(authMode==='sso'&&!sessionSecret)throw Error('SSO requiere SESSION_SECRET; no se permite fallback local.');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw Error('V3_PUBLIC_ORIGIN debe ser un origen exacto.');
 const sessions=new Map();let queue=Promise.resolve();
 const loginUrl=`/dashboard/auth/login?returnTo=${encodeURIComponent(basePath||'/dashboard/onboarding-v3')}`;
 const read=async()=>{try{return JSON.parse(await readFile(dataFile,'utf8'));}catch(e){if(e.code==='ENOENT')return initial();throw e;}};
 const running=new Set();
 const persist=async state=>{await mkdir(path.dirname(dataFile),{recursive:true});const temp=dataFile+'.pending';await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await rename(temp,dataFile);};
 const serial=run=>{const work=queue.then(run);queue=work.catch(()=>{});return work;};
 const executionView=e=>e?.status==='in-progress'&&!running.has(e.executionId)?{...e,status:'failed',code:'interrupted-no-retry'}:e;
 const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 const body=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Solicitud demasiado grande.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');};
 const srv=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(basePath){if(url.pathname!==basePath&&!url.pathname.startsWith(basePath+'/'))return send(res,404,{error:'Fuera de la entrada V3.'});url.pathname=url.pathname.slice(basePath.length)||'/';}
  const expectedOrigin=publicOrigin||`http://${req.headers.host}`;
  if(req.method==='POST'&&req.headers.origin!==expectedOrigin)return send(res,403,{error:'Origen no permitido.'});
  if(url.pathname==='/api/directory'){
   res.setHeader('X-Robots-Tag','noindex, nofollow');
   if(!publicDirectory)return send(res,404,{error:'Listado público no habilitado.'});
   if(req.method!=='GET')return send(res,405,{error:'Solo consulta pública; las modificaciones requieren acceso autorizado.'});
   try{return send(res,200,await catalog.publicView());}
   catch{return send(res,503,{error:'El listado público no está disponible. Inténtalo más tarde.'});}
  }
  if(url.pathname==='/api/config'&&req.method==='GET')return send(res,200,{authMode,basePath,loginUrl:authMode==='sso'?loginUrl:null});
  if(url.pathname==='/api/login'&&req.method==='POST'){
   if(authMode!=='local-review')return send(res,403,{error:'Login local deshabilitado en SSO.',loginUrl});
   const {token}=await body(req);const user=users.find(u=>typeof token==='string'&&typeof u.token==='string'&&token.length>=16&&Buffer.byteLength(token)===Buffer.byteLength(u.token)&&timingSafeEqual(Buffer.from(token),Buffer.from(u.token)));
   if(!user)return send(res,401,{error:'Clave de revisión inválida. No es login corporativo.'});
   const key=randomBytes(32).toString('hex');sessions.set(key,{id:user.id,roles:user.roles,...(user.azureIdentityKey?{azureIdentityKey:user.azureIdentityKey}:{}),authenticated:true,mode:'local-review',expires:Date.now()+4*3600000});
   res.setHeader('set-cookie',`v3_session=${key}; Path=${basePath||'/'}; HttpOnly; SameSite=Strict; Max-Age=14400${expectedOrigin.startsWith('https:')?'; Secure':''}`);return send(res,200,{ok:true});
  }
  if(url.pathname.startsWith('/api/')){
   const key=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('v3_session='))?.slice(11);let actor;
   if(authMode==='sso'){
    let session;try{session=getSession(req,{enabled:true,sessionSecret});}catch{session=null;}
    if(!session?.tid||!session?.oid)return send(res,401,{error:'Sesión corporativa requerida.',loginUrl});
    const user=users.find(u=>u.tid===session.tid&&u.oid===session.oid);
    if(url.pathname==='/api/access'&&req.method==='GET')return send(res,200,{mode:'sso',assigned:Boolean(user),identity:{tid:session.tid,oid:session.oid,name:session.name||'',email:session.email||''}});
    if(!user)return send(res,403,{error:'Identidad autenticada sin asignación RBAC V3. Solicita acceso al coordinador.'});
    actor={id:user.id,roles:user.roles,...(user.azureIdentityKey?{azureIdentityKey:user.azureIdentityKey}:{}),authenticated:true,mode:'sso',name:session.name||user.id};
   }else actor=sessions.get(key);
   if(!actor||actor.expires<Date.now())return send(res,401,{error:'Identificación requerida. Revisión local, no autenticación corporativa.'});
   if(url.pathname==='/api/logout'&&req.method==='POST'){
    if(authMode==='sso')return send(res,200,{logoutUrl:'/dashboard/auth/logout'});
    sessions.delete(key);res.setHeader('set-cookie',`v3_session=; Path=${basePath||'/'}; HttpOnly; SameSite=Strict; Max-Age=0`);return send(res,200,{ok:true});
   }
   const view=async()=>{
    const state=await read();const pending=Object.fromEntries([1,2,3,4,5,6,7].map(p=>[p,blockers(state,p)]));
    const options=staffingRequired?await staffing.current():undefined;
    if(options){
     if(options.warning)pending[2].push(options.warning);
     try{staffing.assertCurrent(state.phases[2],options);}catch(e){pending[2].push(e.message);}
    }
    const continuity=continuityView(state);
    for(const text of pending[2])if(!continuity.handoff.pending.some(p=>p.phase===2&&p.text===text))continuity.handoff.pending.push({phase:2,text});
    continuity.handoff.ready=continuity.handoff.pending.length===0;
    return {state,documentary:{enabled:Boolean(documentaryAI),seed:currentSeed(state),summary:currentSummary(state)||null,reviews:state.summaryReviews||[]},azureLinks:Object.fromEntries((state.azureIntakes||[]).map(i=>[i.sourceHash,snapshotUrl(i.snapshot)])),actor,continuity,hash:digest(state),blockers:pending,objects:objects(state).map(object=>({object,hash:objectHash(state,object),decision:currentDecision(state,object)||null})),identities:users.map(u=>({id:u.id,roles:u.roles})),staffing:options,hermes:{configured:await (documentaryAI||hermesEnrichment).available(),execution:executionView(state.aiExecutions?.at(-1))||null},integrations:{ai:state.hermesEnrichments?.length?'real':'not-run',azure:azureIntake.configured()?'read-only-intake':staffingRequired?'snapshot-classification-candidates':'not-connected',azureIntake:azureIntake.configured(),azurePublication:'pending-disabled',repositories:'not-read'}};
   };
   if(url.pathname==='/api/staffing'){
    if(req.method!=='GET')return send(res,405,{error:'Método no permitido.'});
    return send(res,200,staffingRequired?await staffing.current():{required:false});
   }
   if(url.pathname==='/api/classifications'){
    try{
     const response=catalogState=>({catalog:catalogState,canManage:!catalogSourceFile&&actor.roles.includes('coordinator'),sourceConfigured:Boolean(directoryFile),researchConfigured:Boolean(researchDirectory),actor:{id:actor.id,mode:actor.mode}});
     if(req.method==='GET')return send(res,200,response(await catalog.view()));
     if(req.method==='POST')return send(res,200,response(await catalog.act(await body(req),actor)));
     return send(res,405,{error:'Método no permitido.'});
    }catch(e){if(e.status)throw e;return send(res,503,{error:'Catálogo privado no disponible. Recarga o solicita revisión al operador.'});}
   }
   if(url.pathname==='/api/azure/search'){
    if(req.method!=='GET')return send(res,405,{error:'Método no permitido.'});
    if(!actor.roles.some(r=>['editor','coordinator'].includes(r)))return send(res,403,{error:'Rol editor o coordinator requerido.'});
    if([...url.searchParams.keys()].some(k=>k!=='q')||url.searchParams.getAll('q').length!==1)return send(res,400,{error:'Solo se admite una búsqueda por ID o título.'});
    return send(res,200,await azureIntake.search(url.searchParams.get('q')));
   }
   if(url.pathname==='/api/azure/import'){
    if(req.method!=='POST')return send(res,405,{error:'Método no permitido.'});
    if(!actor.roles.some(r=>['editor','coordinator'].includes(r)))return send(res,403,{error:'Rol editor o coordinator requerido.'});
    const input=await body(req);
    if(!Number.isSafeInteger(input.id)||input.id<=0)return send(res,400,{error:'ID Azure inválido.'});
    const run=async()=>{
     const before=await read();
     if(input.revision!==before.revision)throw Object.assign(Error('Conflicto de versión: recarga antes de importar.'),{status:409});
     if(Object.keys(before.phases[1]).length&&input.confirmReplace!==true)throw Object.assign(Error('Confirma reemplazar el borrador; se preserva la versión anterior.'),{status:409});
     const snapshot=await azureIntake.read(input.id);
     const next=importLinkedProposal(before,snapshot,actor,input);
     await mkdir(path.dirname(dataFile),{recursive:true});const temp=dataFile+'.pending';await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,dataFile);return view();
    };
    const work=queue.then(run);queue=work.catch(()=>{});return send(res,200,await work);
   }
   if(url.pathname==='/api/ai/preview'&&req.method==='GET'){
    if(!documentaryAI)throw failure(503,'not-configured');
    if([...url.searchParams.keys()].some(k=>!['purpose','includeSummary'].includes(k)))throw failure(400,'input-fields');
    return send(res,200,documentaryAI.preview(await read(),{purpose:url.searchParams.get('purpose')||'enrich',includeSummary:url.searchParams.get('includeSummary')==='true'}));
   }
   if(['/api/ai/seed','/api/ai/review-summary'].includes(url.pathname)){
    if(req.method!=='POST')return send(res,405,{error:'Método no permitido.'});
    const input=await body(req);await serial(async()=>{const state=await read();await persist(url.pathname.endsWith('/seed')?saveSeed(state,actor,input):reviewSummary(state,actor,input));});return send(res,200,await view());
   }
   if(['/api/hermes/enrich','/api/ai/summary'].includes(url.pathname)){
    if(req.method!=='POST')return send(res,405,{error:'Método no permitido.'});
    if(!actor.roles.some(r=>['editor','coordinator'].includes(r)))throw failure(403,'forbidden');
    const input=await body(req);
    const purpose=url.pathname.endsWith('/summary')?'summary':'enrich',service=purpose==='summary'?documentaryAI:(documentaryAI||hermesEnrichment);
    if(!service)throw failure(503,'not-configured');
    if(Object.keys(input).some(k=>!['revision','executionId',...(documentaryAI&&purpose==='enrich'?['includeSummary']:[])].includes(k))||(input.includeSummary!==undefined&&typeof input.includeSummary!=='boolean'))throw failure(400,'input-fields');
    if(documentaryAI){input.purpose=purpose;input.includeSummary=input.includeSummary===true;}
    let launch;
    const execution=await serial(async()=>{
     const before=await read();
     const existing=before.aiExecutions?.find(e=>e.executionId===input.executionId);
     if(existing){if(existing.revision!==input.revision||existing.actor!==actor.id||(existing.purpose||'enrich')!==purpose||Boolean(existing.includeSummary)!==Boolean(input.includeSummary))throw failure(409,'idempotency-conflict');return executionView(existing);}
     const source=assertGeneration(before,actor,input);
     if(!await service.available())throw failure(503,'not-configured');
     const derived=documentaryAI?derivatives(before,input.includeSummary):null;
     if(running.size)throw failure(429,'busy');
     if((before.aiExecutions?.length||0)>=100)throw failure(409,'execution-ledger-full');
     const entry={executionId:input.executionId,actor:actor.id,revision:input.revision,sourceHash:source.sourceHash,purpose,includeSummary:Boolean(input.includeSummary),...(derived?{seedVersion:derived.seed.version,seedHash:derived.seed.hash,summaryVersion:derived.reviewedSummary?.version||null}:{}),model:service.model,at:new Date().toISOString(),status:'in-progress'};
     before.aiExecutions||=[];before.aiExecutions.push(entry);await persist(before);running.add(input.executionId);
     launch=async()=>{
      let result,error;
      try{result=await service.generate(before,actor,input);}catch(e){error=e;}
      await serial(async()=>{
       let current=await read();let record=current.aiExecutions.find(e=>e.executionId===input.executionId);
       try{if(error)throw error;current=documentaryAI?applyDocumentary(current,result,actor):applyEnrichment(current,result,actor);record=current.aiExecutions.find(e=>e.executionId===input.executionId);Object.assign(record,{status:'real',inputHash:result.inputHash,outputHash:result.outputHash,version:current.revision});}
       catch(e){Object.assign(record,{status:'failed',code:['stale-revision','source-integrity','timeout','invalid-output'].includes(e.code)?e.code:'generation-failed'});}
       record.finishedAt=new Date().toISOString();await persist(current);
      });
     };
     return entry;
    });
    if(launch)void launch().catch(()=>{}).finally(()=>running.delete(input.executionId));
    return send(res,execution.status==='in-progress'?202:200,{execution});
   }
   if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,await view());
   if(url.pathname==='/api/package'&&req.method==='GET'){
    const exportPackage=async snapshot=>{const state=await read();if(staffingRequired)staffing.assertCurrent(state.phases[2],await staffing.current(snapshot));const p=continuityPackage(state);res.setHeader('Content-Disposition','attachment; filename="onboarding-v3-package.json"');return send(res,200,p);};
    return staffingRequired?await catalog.withSnapshot(exportPackage):await exportPackage();
   }
   if(url.pathname==='/api/action'&&req.method==='POST'){
    const action=await body(req);
    const run=async snapshot=>{
     const before=await read();
     if(staffingRequired){
      const options=await staffing.current(snapshot);
      if(action.type==='save'&&action.phase===2)action.data=staffing.resolve(action.data,options);
      else if(['confirm','review','decide','receipt'].includes(action.type))staffing.assertCurrent(before.phases[2],options);
     }
     const next=['review-context','prepare-spec','receipt'].includes(action.type)?continuityChange(before,action,actor):change(before,action,actor);await mkdir(path.dirname(dataFile),{recursive:true});const temp=dataFile+'.pending';await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,dataFile);return view();
    };
    const work=queue.then(()=>staffingRequired?catalog.withSnapshot(run):run());
    queue=work.catch(()=>{});return send(res,200,await work);
   }
   return send(res,404,{error:'Ruta no disponible.'});
  }
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Método no permitido.'});
  const names={'/documentary-ai.js':'documentary-ai.js','/azure-links.js':'azure-links.js','/continuity.js':'continuity.js','/':'index.html','/app.js':'app.js','/imported-context.js':'imported-context.js','/advanced':'advanced.html','/advanced.js':'advanced.js','/advanced.css':'advanced.css','/base.css':'base.css','/wizard.css':'wizard.css','/styles.css':'styles.css','/classifications':'classifications.html','/classifications/':'classifications.html','/classifications.js':'classifications.js','/classification-review.js':'classification-review.js','/classifications.css':'classifications.css'};const name=names[url.pathname];if(!name)return send(res,404,{error:'Solo onboarding V3.'});
  let text=await readFile(path.join(root,'public/onboarding-v3',name));
  if(name.endsWith('.html'))text=Buffer.from(text.toString().replace(/(href|src)="\/(styles\.css|app\.js|advanced\.js|advanced\.css|base\.css|wizard\.css|classifications(?:\.css|\.js)?|)"/g,(_,attr,asset)=>`${attr}="${basePath}/${asset}"`));
  res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8','cache-control':'no-store'});res.end(text);
 }catch(e){if((req.url||'').split('?')[0].endsWith('/api/hermes/enrich')&&!e.status)return send(res,503,{error:'Enriquecimiento LLM no disponible; no se modificó el borrador.'});const message=e.message||'Error';const status=e.status||(/versión|hash|bloque/.test(message)?409:/autentic|Rol |rol |asignad|responsable|destinatario/.test(message)?403:400);send(res,status,{error:message});}});
 return srv;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configFile=process.env.V3_IDENTITY_ROLES_FILE||process.env.V3_REVIEW_USERS_FILE;
 const users=configFile?JSON.parse(await readFile(configFile,'utf8')):[];
 const hermesEnrichment=new HermesEnrichment({model:process.env.V3_HERMES_MODEL||'',transport:brokerTransport({socketPath:process.env.V3_HERMES_BROKER_SOCKET||'',key:process.env.V3_HERMES_BROKER_KEY||'',approved:process.env.V3_HERMES_AUTHORIZED==='true'})});
 const port=Number(process.env.V3_PORT||4193),host=process.env.V3_LISTEN_HOST||'127.0.0.1',basePath=process.env.V3_BASE_PATH||'/dashboard/onboarding-v3',authMode=process.env.V3_AUTH_MODE||'sso';
 const server=createV3Server({hermesEnrichment,documentaryAI:new DocumentaryAI({model:hermesEnrichment.model,transport:hermesEnrichment.transport}),dataFile:process.env.V3_DATA_FILE,users,basePath,authMode,sessionSecret:process.env.SESSION_SECRET,publicOrigin:process.env.V3_PUBLIC_ORIGIN,classificationFile:process.env.V3_CLASSIFICATION_FILE,catalogSourceFile:process.env.V3_CATALOG_SOURCE_FILE,directoryFile:process.env.V3_AZURE_DIRECTORY_FILE,researchDirectory:process.env.V3_CLASSIFICATION_RESEARCH_DIRECTORY,publicDirectory:process.env.V3_PUBLIC_DIRECTORY==='true',staffingRequired:true,azureIntake:azureIntakeFromEnv(Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('V3_AZURE_')).map(([k,v])=>[k.replace('V3_','V2_'),v])))});
 server.listen(port,host,()=>console.log(`Onboarding V3: http://${host}:${port}${basePath}/ (${authMode}; ${users.length} identidades configuradas)`));
}
