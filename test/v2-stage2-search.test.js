import test from 'node:test';
import assert from 'node:assert/strict';
import {nameMatches,renderEditor} from '../public/onboarding-v2/app.js';
test('name search ignores accents/case, remains literal and does not change source',()=>{
 assert.equal(nameMatches('Tecnología MÓVIL','tecnologia movil'),true);
 assert.equal(nameMatches('José Pérez','JOSE'),true);
 assert.equal(nameMatches('Android','['),false);
 assert.equal(nameMatches('Android',''),true);
});
test('stage two exposes named front and authorized candidate search controls',()=>{
 const view={actor:{id:'test',roles:['editor']},identities:[],staffing:{required:true,fronts:[{id:'C1',name:'Móvil'}],projects:['P1'],candidates:[]}};
 const data={fronts:[{id:'F1',catalogFrontId:'C1',project:'P1',owner:'old',reviewer:'old2'}]};const before=structuredClone(data);const html=renderEditor(2,data,view);
 assert.match(html,/Buscar frentes por tecnología, área o entregable/);assert.match(html,/Buscar Frente del catálogo por nombre/);assert.match(html,/Buscar Responsable candidato por nombre/);assert.match(html,/Buscar Revisor independiente candidato por nombre/);assert.deepEqual(data,before);
});
