import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,change,hash} from '../src/onboarding-v2/model.js';
import {ready} from '../test-support/v2-fixture.js';
import {objectHash,objects} from '../src/onboarding-v2/model.js';
import * as flow from '../src/onboarding-v3/continuity.js';
const editor={id:'owner',authenticated:true,roles:['editor','coordinator']};
const reviewer={id:'reviewer',authenticated:true,roles:['reviewer']};
export function fixture(){const s=initial();s.revision=1;s.phases[1]={title:'Synthetic story',owner:'owner',context:'Synthetic scope',constraints:'Synthetic limits',sources:[],questions:[{id:'Q1',question:'Which state?',owner:'owner',blocking:true,answer:'Ready',rationale:'Synthetic decision'}]};s.phases[4].reviewer='reviewer';return s;}
test('CP1 exact context review uses assigned independent reviewer, not coordinator or staffing',()=>{
 assert.equal(typeof flow.contextHash,'function','context review feature missing');
 const s=fixture(),h=flow.contextHash(s);
 assert.throws(()=>flow.continuityChange(s,{type:'review-context',revision:1,hash:h},editor),e=>e.status===403);
 const reviewed=flow.continuityChange(s,{type:'review-context',revision:1,hash:h},reviewer);
 assert.equal(flow.continuityView(reviewed).review.status,'Revisado');
 assert.equal(reviewed.contextReviews[0].hash,h);assert.equal(reviewed.contextReviews[0].version,1);
 assert.deepEqual(reviewed.decisions,[]);assert.equal(reviewed.phases[4].humanReview,undefined);
 const changed=change(reviewed,{type:'save',revision:2,phase:1,data:{...reviewed.phases[1],context:'Changed'}},editor);
 assert.equal(flow.continuityView(changed).review.status,'Pendiente');
 assert.throws(()=>flow.continuityChange(changed,{type:'review-context',revision:2,hash:h},reviewer),e=>e.status===409);
 assert.equal(s.revision,1);
});
test('CP2 explicit deterministic draft keeps manual specs/history and binds reviewed source/decisions',()=>{
 let s=fixture();s.phases[3]={sections:[{id:'manual',front:'shared',title:'Manual',body:'Keep approved text'}],criteria:[]};
 const source=structuredClone(s.azureIntakes),manual=structuredClone(s.phases[3]);
 assert.throws(()=>flow.continuityChange(s,{type:'prepare-spec',revision:1},editor),e=>e.status===409);
 s=flow.continuityChange(s,{type:'review-context',revision:1,hash:flow.contextHash(s)},reviewer);
 assert.throws(()=>flow.continuityChange(s,{type:'prepare-spec',revision:2},editor),e=>e.status===409);
 const next=flow.continuityChange(s,{type:'prepare-spec',revision:2,confirmReplace:true},editor);
 assert.equal(next.specDrafts.length,1);assert.equal(next.specDrafts[0].generation,'deterministic-template');
 assert.equal(next.specDrafts[0].contextHash,flow.contextHash(s));
 assert.deepEqual(next.history.at(-1).phases[3],manual);assert.deepEqual(next.azureIntakes,source);
 assert.equal(next.phases[3].sections.length,11);assert.match(next.phases[3].sections[0].body,/Synthetic scope/);
 assert.match(JSON.stringify(next.phases[3]),/Q1/);assert.match(JSON.stringify(next.phases[3]),/PENDIENTE/);
 assert.equal(flow.continuityView(next).spec.status,'Generado');
 assert.equal(flow.continuityView(next).handoff.ready,false);
 const edited=change(next,{type:'save',phase:1,revision:next.revision,data:{...next.phases[1],context:'Changed context'}},editor);
 assert.equal(flow.continuityView(edited).spec.current,false);
 assert.equal(flow.continuityView(edited).review.status,'Pendiente');
 assert.deepEqual(next.decisions,[]);
});
test('V3 package cannot bypass continuity gates; approved manual spec is not overwritten',()=>{
 const s=fixture();assert.equal(typeof flow.continuityPackage,'function');
 assert.throws(()=>flow.continuityPackage(s),e=>e.status===409);
 // Existing exact-object decision is authoritative; generator must never replace its approved text.
 s.decisions.push({object:'spec',hash:flow.continuityView(s).handoff.objects.find(x=>x.object==='spec').hash,decision:'approve',actor:'reviewer'});
 const reviewed=flow.continuityChange(s,{type:'review-context',revision:s.revision,hash:flow.contextHash(s)},reviewer);
 assert.equal(flow.continuityView(reviewed).spec.status,'Revisado');
 assert.throws(()=>flow.continuityChange(reviewed,{type:'prepare-spec',revision:reviewed.revision,confirmReplace:true},editor),e=>e.status===409);
});
test('CP3 existing approvals plus CP1 review produce manifest provenance and stable exact receipt',()=>{
 let s=ready();s=flow.continuityChange(s,{type:'review-context',revision:s.revision,hash:flow.contextHash(s)},reviewer);
 s.decisions=objects(s).map(object=>({object,hash:objectHash(s,object),decision:'approve',actor:'reviewer'}));
 const p=flow.continuityPackage(s);assert.equal(p.schema,'mobilityapps.onboarding.v3');assert.equal(p.files['provenance.json'].contextHash,flow.contextHash(s));
 for(const [name,h]of Object.entries(p.manifest))assert.equal(hash(p.files[name]),h);
 assert.throws(()=>flow.continuityChange(s,{type:'receipt',revision:s.revision,hash:'wrong'},reviewer),e=>e.status===409);
 const received=flow.continuityChange(s,{type:'receipt',revision:s.revision,hash:p.hash},reviewer);
 assert.equal(received.receipts.at(-1).hash,p.hash);assert.equal(flow.continuityPackage(received).hash,p.hash);
});
