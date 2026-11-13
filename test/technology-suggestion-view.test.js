import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechnologyController, technologyMarkup, mountTechnologySuggestion } from '../public/dashboard/requirements/onboarding/technology-suggestion.js';
test('Etapa 2 integrates suggestion review beside the existing manual save form only',async()=>{
 const {stageMarkup}=await import('../public/dashboard/requirements/onboarding/app.js');
 const data={flow:{stage:1,tracks:[],versionId:'V1'},context:{versions:[{id:'V1',version:1}]}};
 assert.match(stageMarkup(data),/data-technology-suggestion/);
 assert.match(stageMarkup(data),/Guardar tecnologías y responsables/);
 assert.doesNotMatch(stageMarkup({...data,flow:{...data.flow,stage:0}}),/data-technology-suggestion/);
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const result={run:{id:'J',status:'completed'},context:{hash:'hash',versionId:'V1',expectedRevision:1,stage:1},tracks:[{technology:'Android',area:'Venta',ownerEmail:'',confidence:'low',rationale:'PENDIENTE de responsable con evidencia',evidenceIds:[]}],candidates:[]};
test('consult, review and explicit apply only changes editor after confirmation',async()=>{
 let binding={id:'R1',versionId:'V1',revision:1,stage:1}, applied=0, confirmed=false;const calls=[];
 const controller=createTechnologyController({getBinding:()=>binding,request:async(url,payload)=>{calls.push({url,payload});return result;},applyEditor:()=>applied++,confirm:()=>confirmed});
 await controller.consult();assert.equal(applied,0);assert.equal(calls.filter(c=>c.payload).length,1);
 assert.deepEqual(calls[1].payload,{versionId:'V1',expectedRevision:1,contextHash:'hash'});
 assert.equal(await controller.apply(),false);assert.equal(applied,0);
 confirmed=true;assert.equal(await controller.apply(),true);assert.equal(applied,1);
 assert.equal(calls.some(c=>c.payload?.action==='configure'),false);
 controller.destroy();
});
test('selection and stage races discard old results; polling never writes editor',async()=>{
 let binding={id:'R1',versionId:'V1',revision:1,stage:1}, applied=0;const pending=deferred();
 const c=createTechnologyController({getBinding:()=>binding,request:()=>pending.promise,applyEditor:()=>applied++,confirm:()=>true});
 const request=c.consult();binding={...binding,id:'R2'};pending.resolve(result);await request;
 assert.equal(c.state.result,null);assert.equal(applied,0);
 binding={...binding,id:'R1',stage:2};assert.equal(await c.apply(),false);c.destroy();
});
test('stale server context and unsaved version selection block apply',async()=>{
 let binding={id:'R1',versionId:'V1',revision:1,stage:1}, applied=0;
 const c=createTechnologyController({getBinding:()=>binding,request:async()=>result,applyEditor:()=>applied++,confirm:()=>true});
 await c.consult();binding={...binding,versionId:'V2'};
 assert.equal(await c.apply(),false);assert.equal(applied,0);c.destroy();
});
test('review markup shows owner rationale and pending correction with escaped content',()=>{
 const html=technologyMarkup({result:{...result,tracks:[{...result.tracks[0],rationale:'<script>no</script>'}]}});
 assert.match(html,/Aplicar al editor/);assert.match(html,/Pendiente/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.equal(typeof mountTechnologySuggestion,'function');
});
