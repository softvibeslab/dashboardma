import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,actor} from '../test-support/documentary-fixture.js';
import * as ai from '../src/onboarding-v3/documentary-ai.js';

test('seed is bounded, source/version bound, immutable history, no credentials; output stale after seed change',async()=>{
 let s=fixture();const original=structuredClone(s.azureIntakes);s=ai.saveSeed(s,actor,{revision:1,text:'Priorizar accesibilidad sintética'});assert.equal(s.revision,2);assert.equal(s.seedVersions[0].actor,actor.id);assert.equal(s.seedVersions[0].sourceHash,s.azureIntakes[0].sourceHash);assert.throws(()=>ai.saveSeed(s,actor,{revision:1,text:'stale'}),/stale/);assert.throws(()=>ai.saveSeed(s,actor,{revision:2,text:'api_key=abcdefghijklmnopqrstuvwxyz'}),/sensitive/);
 const next=ai.saveSeed(s,actor,{revision:2,text:'Revisar teclado'});assert.equal(next.seedVersions.length,2);assert.equal(s.seedVersions[0].text,'Priorizar accesibilidad sintética');assert.deepEqual(next.azureIntakes,original);
});
test('summary request is purpose allowlisted, citations validated, no metadata-only attachment text or stale application',async()=>{
 const s=fixture(),refs=ai.sourceRefs(s.azureIntakes[0].snapshot),ref=Object.keys(refs)[0],cite=text=>({text,sourceRefs:[ref]});let request;
 const output={businessNeed:cite('Consulta propuesta'),scope:[cite('Filtrar')],criteria:[cite('Limpiar')],ambiguities:[cite('Mayúsculas sin definir')],questions:[cite('¿Ignorar mayúsculas?')],attachments:[],instruction:'Revisar accesibilidad sin inventar entorno.'};
 const service=new ai.DocumentaryAI({model:'fixture',transport:async r=>{request=r;return output;}});
 const result=await service.generate(s,actor,{revision:1,executionId:'synthetic-summary-0001',purpose:'summary'});assert.equal(request.purpose,'summary');assert.equal(request.derivatives.seed.text,'');assert.equal(request.snapshot.items[0].attachments[1].text,undefined);assert.equal(request.sourceHash,s.azureIntakes[0].sourceHash);
 const next=ai.applyDocumentary(s,result,actor);assert.equal(next.revision,2);assert.deepEqual(next.phases,s.phases);assert.equal(next.aiSummaries[0].status,'generated-pending-review');assert.deepEqual(next.azureIntakes,s.azureIntakes);assert.throws(()=>ai.applyDocumentary(ai.saveSeed(s,actor,{revision:1,text:'Changed'}),result,actor),/stale/);
 await assert.rejects(service.generate(s,actor,{revision:1,executionId:'synthetic-summary-0002',purpose:'arbitrary'}),/purpose/);
 const invalid=new ai.DocumentaryAI({model:'fixture',transport:async()=>({...output,businessNeed:{text:'Unsupported',sourceRefs:['invented']}})});await assert.rejects(invalid.generate(s,actor,{revision:1,executionId:'synthetic-summary-0003',purpose:'summary'}),/output/);
 const extracted=Object.keys(refs).find(k=>refs[k].kind==='extracted-attachment');
 const contribution={sourceRef:extracted,contribution:'Datos de título y autor',usage:'Referencia para revisión humana',limitations:'Solo texto extraído; no QA'};
 const attachments=new ai.DocumentaryAI({model:'fixture',transport:async()=>({...output,attachments:[contribution]})});assert.equal((await attachments.generate(s,actor,{revision:1,executionId:'synthetic-summary-0004',purpose:'summary'})).output.attachments.length,1);
 attachments.transport=async()=>({...output,attachments:[{...contribution,sourceRef:extracted.replace('attachment-0','attachment-1')}]});await assert.rejects(attachments.generate(s,actor,{revision:1,executionId:'synthetic-summary-0005',purpose:'summary'}),/output/);
});
