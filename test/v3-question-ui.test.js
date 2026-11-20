import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('question review UI uses native disclosures and separate explicit save/review/deepen actions',async()=>{
 const text=await readFile(new URL('../public/onboarding-v3/questions.js',import.meta.url),'utf8');for(const label of ['<details','Expandir todas','Contraer todas','technical','commercial','ready-review','Profundizar','Incorporar alternativa','Devolver','data-answer','data-rationale'])assert.ok(text.includes(label),label);
});
