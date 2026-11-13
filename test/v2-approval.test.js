import test from 'node:test';
import assert from 'node:assert/strict';
import { initial,change,objectHash,packageFor,blockers } from '../src/onboarding-v2/model.js';
const owner={id:'owner',roles:['editor'],authenticated:true,mode:'local-review'};
const reviewer={id:'reviewer',roles:['reviewer','qa'],authenticated:true,mode:'local-review'};
import {ready} from '../test-support/v2-fixture.js';
const act=(s,type,extra={},actor=reviewer)=>change(s,{type,revision:s.revision,...extra},actor);
test('approvals require assigned role, exact object hash, return reason and invalidate after upstream changes',()=>{
 let s=ready();
 assert.throws(()=>act(s,'decide',{object:'spec',decision:'approve',hash:'wrong'}),/hash/);
 assert.throws(()=>act(s,'decide',{object:'spec',decision:'return',hash:objectHash(s,'spec')}),/motivo/);
 assert.throws(()=>act(s,'decide',{object:'spec',decision:'approve',hash:objectHash(s,'spec')},owner),/rol|asignad/);
 s=act(s,'decide',{object:'spec',decision:'return',reason:'Revisar flujo',hash:objectHash(s,'spec')});
 assert.ok(blockers(s,6).length);
 s=act(s,'decide',{object:'spec',decision:'approve',hash:objectHash(s,'spec')});
 s=act(s,'decide',{object:'tests',decision:'approve',hash:objectHash(s,'tests')});
 s=act(s,'decide',{object:'front:F1',decision:'approve',hash:objectHash(s,'front:F1')});
 assert.deepEqual(blockers(s,6),[]);
 const p=packageFor(s); assert.equal(p.schema,'mobilityapps.onboarding.v2'); assert.ok(p.files['specifications.json']); assert.equal(p.approvals[0].mode,'local-review');
 s=act(s,'receipt',{hash:p.hash}); assert.equal(s.receipts[0].actor,'reviewer');
 s=act(s,'save',{phase:1,data:{...s.phases[1],context:'Changed'}},owner);
 assert.ok(blockers(s,6).length); assert.equal(s.decisions.length,4); assert.equal(s.receipts.length,1);
 assert.throws(()=>packageFor(s),/bloque/);
});
test('an edit and content revert never resurrect historical approval versions',()=>{
 let s=ready();const original=structuredClone(s.phases[3]);
 s=act(s,'decide',{object:'spec',decision:'approve',hash:objectHash(s,'spec')});const oldHash=objectHash(s,'spec');
 s=act(s,'save',{phase:3,data:{...original,sections:original.sections.map(x=>({...x,body:'edit'}))}},owner);
 s=act(s,'save',{phase:3,data:original},owner);
 s=act(s,'review',{phase:4});s=act(s,'review',{phase:5});
 assert.notEqual(objectHash(s,'spec'),oldHash);
 assert.ok(blockers(s,6).some(x=>x.includes('spec')));
});
test('server rejects malformed shapes and unexpected claims rather than persisting forged metadata',()=>{
 for(const data of [{fronts:{}},{fronts:[null]},{fronts:[],verified:true}])assert.throws(()=>act(initial(),'save',{phase:2,data},owner),/estructura|campo/);
 assert.throws(()=>act(initial(),'save',{phase:4,data:{humanReview:true,reviewer:'reviewer',aiStatus:'completed'}},owner),/IA/);
});
test('assignment changes require coordinator; human review cannot be forged by an editor payload',()=>{
 let s=ready();
 assert.throws(()=>act(s,'save',{phase:2,data:{fronts:[{...s.phases[2].fronts[0],reviewer:'other'}]}},owner),/coordinador/);
 s=act(s,'save',{phase:4,data:{...s.phases[4],humanReview:true,findings:[{id:'H1',section:'S1',description:'Nuevo',owner:'owner',severity:'low',status:'resolved',resolution:'Hecho'}]}},owner);
 assert.equal(s.phases[4].humanReview,false);
 assert.throws(()=>act(s,'review',{phase:4},owner),/asignado/);
 s=act(s,'review',{phase:4});assert.equal(s.phases[4].humanReview,true);
 s=act(s,'save',{phase:3,data:{...s.phases[3],sections:s.phases[3].sections.map(x=>({...x,body:'Changed'}))}},owner);
 assert.equal(s.phases[4].humanReview,false);assert.equal(s.phases[5].reviewed,false);
});
test('front confirmation is assigned-owner action, not a client boolean; comments are version-bound',()=>{
 let s=initial();
 s=act(s,'save',{phase:2,data:{fronts:[{id:'F1',owner:'owner',reviewer:'reviewer',confirmed:true}]}},owner);
 assert.equal(s.phases[2].fronts[0].confirmed,false);
 assert.throws(()=>act(s,'confirm',{front:'F1'}),/responsable/);
 s=act(s,'confirm',{front:'F1'},owner); assert.equal(s.phases[2].fronts[0].confirmed,true);
 s=act(s,'comment',{section:'shared',text:'Revisar'}); assert.equal(s.comments[0].version,s.revision-1);
});
