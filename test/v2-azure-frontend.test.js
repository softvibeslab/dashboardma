import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAzureIntake} from '../public/onboarding-v2/app.js';

test('phase1 intake UI is role/config gated, escapes sources and labels documentary generation and publication pending',()=>{
 const view={actor:{roles:['editor']},integrations:{azureIntake:true},state:{azureIntakes:[{version:1,generation:'documentary-deterministic-v1',sourceHash:'abc',snapshot:{root:{id:17,rev:3,fields:{'System.Title':'<script>bad</script>'}},warnings:['<img src=x>']}}]}};
 const html=renderAzureIntake(view);assert.match(html,/azureImportForm/);assert.match(html,/determinista/);assert.match(html,/IA no ejecutada/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/disabled[^>]*>Publicar en Azure/);
 assert.match(renderAzureIntake({...view,actor:{roles:[]}}),/id="azureImport"[^>]*disabled/);
 assert.match(renderAzureIntake({...view,integrations:{azureIntake:false}}),/no configurado/);
});
