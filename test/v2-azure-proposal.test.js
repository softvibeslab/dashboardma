import test from 'node:test';
import assert from 'node:assert/strict';
import {initial} from '../src/onboarding-v2/model.js';
import {importProposal} from '../src/onboarding-v2/azure-proposal.js';

test('documentary proposal includes actually read comments and extracted attachments, never invents unavailable evidence',()=>{
 const snapshot={root:{id:17,rev:1,fetchedAt:'2026-01-01',fields:{'System.Title':'Issue','System.Description':'Original','Microsoft.VSTS.Common.AcceptanceCriteria':'Existing criteria'},comments:{items:[{id:1,version:2,text:'Comment evidence'}]},attachments:[{name:'evidence.txt',status:'extracted',text:'Extracted evidence'},{name:'not-read.pdf',status:'metadata-only'}]},children:[],warnings:[]};
 const next=importProposal(initial(),snapshot,{id:'editor',roles:['editor'],authenticated:true},{revision:0});
 assert.match(next.phases[1].context,/Comment evidence/);assert.match(next.phases[1].context,/Extracted evidence/);assert.match(next.phases[1].context,/Existing criteria/);assert.match(next.phases[1].context,/no se ejecutó Hermes IA/);assert.deepEqual(next.azureIntakes[0].snapshot,snapshot);
});
