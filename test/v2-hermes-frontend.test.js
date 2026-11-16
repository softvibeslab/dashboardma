import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHermesEnrichment} from '../public/onboarding-v2/app.js';
test('Hermes UI has separate action, honest states and escaped provenance; does not grant approval',()=>{
 const base={actor:{roles:['editor']},state:{azureIntakes:[{}],hermesEnrichments:[]},hermes:{configured:false,execution:null}};
 assert.match(renderHermesEnrichment(base),/not-configured/);assert.match(renderHermesEnrichment(base),/disabled/);
 for(const status of ['in-progress','failed','real']){
 const html=renderHermesEnrichment({...base,hermes:{configured:true,execution:{status,model:'<img src=x>',executionId:'test',sourceHash:'source',inputHash:'input',outputHash:'output'}}});
 assert.match(html,new RegExp(status));assert.ok(!html.includes('<img src=x>'));assert.match(html,/enriquecerHermes/);assert.match(html,/humana/);
 }
});
