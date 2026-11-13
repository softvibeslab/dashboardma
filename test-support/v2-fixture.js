import {initial} from '../src/onboarding-v2/model.js';
// Synthetic fixtures only. Never represent production requirements, execution or approvals.
export function ready(){const s=initial();s.phases={
1:{title:'TEST ONLY',owner:'owner',context:'Ejemplo sintético',questions:[],sources:[]},
2:{fronts:[{id:'F1',deliverable:'AAR',repository:'repo',owner:'owner',reviewer:'reviewer',discipline:'Android',area:'Ventas',confirmed:true,dependencies:[]}]},
3:{sections:[{id:'S1',front:'shared',title:'Funcional',body:'Flujo'},{id:'S2',front:'F1',title:'Frente',body:'Contrato'}],criteria:[{id:'AC1',section:'S1',text:'Funciona',critical:true}]},
4:{humanReview:true,reviewer:'reviewer',findings:[],aiStatus:'not-run'},
5:{kind:'document',plan:'Revisión',reviewed:true,reviewer:'reviewer',cases:[{id:'TC1',criterion:'AC1',risk:'R1',steps:'Leer',expected:'Coherente',status:'planned'}],defects:[]},6:{},7:{recipient:'reviewer',instructions:'Preparar desarrollo; no desplegar'}};return s;}
