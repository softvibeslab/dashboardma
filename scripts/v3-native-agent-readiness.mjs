// Readiness-only command: no model request, no global Hermes configuration changes.
import {documentaryAIFromEnvironment} from '../src/onboarding-v3/native-agent-startup.js';
const result=await documentaryAIFromEnvironment({model:'existing-controlled-engine'});
const ready=result.selection==='native-ready';
const description=ready?await result.documentaryAI.transport.describe():null;
console.log(JSON.stringify({ready,selection:result.selection,engine:result.documentaryAI.engine||{kind:'controlled-llm',label:'Motor actual conservado'},...(description?{runtime:description.runtime,hermesCommit:description.hermesCommit,schemas:description.schemas,purposes:description.purposes,allowedTools:description.allowedTools,coverage:description.coverage,contextPolicy:description.contextPolicy}:{}),providerRequests:0},null,2));
process.exitCode=ready?0:3;
