import test from 'node:test';import assert from 'node:assert/strict';
import * as ui from '../public/onboarding-v3/questions.js';
test('agent evidence renderer displays only observed tool/source metadata, escapes it, and labels fixture inference',()=>{
 assert.equal(ui.renderAgentEvidence(undefined),'');
 const value=ui.renderAgentEvidence({nativeRuntime:'hermes-native-sealed-v1',modelMode:'deterministic-fixture',tools:[{name:'authorized_context',toolCallId:'fixture-call-1',status:'executed',sources:[{id:'fixture-guide',project:'alpha<script>',ref:'fixture-v1',contentHash:'c'.repeat(64)}]}],coverage:'Only indexed authorized excerpts',reasoning:'NEVER_DISPLAY_THIS'});
 assert.match(value,/authorized_context/);assert.match(value,/fixture-call-1/);assert.match(value,/alpha&lt;script&gt;/);assert.match(value,/modelo sintético/);assert.doesNotMatch(value,/NEVER_DISPLAY_THIS|<script>/);
});
