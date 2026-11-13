# Etapa 2: Hermes technology / area / owner proposals

The existing durable filesystem worker executes a new isolated `kind: "technology-suggestion"`. No model runs from the HTTP process or when opening the UI. No deterministic fallback exists. This change needs the Node application and existing enrichment worker restarted by the deployment owner; this implementation task does not restart them or call a model.

## API

Authenticated dashboard namespace (same existing session policy):

- `GET /dashboard/api/requirements/:id/technology-suggestion`: read/reconcile only. Returns `{run, tracks, candidates, context, label}`. `run` is null or `{id,status,error?,model?,inputHash}`; status is queued/running/completed/failed/stale. Tracks appear only for a completed, current proposal. Each track has `technology`, `area`, `ownerEmail`, `confidence` (low/medium/high), `rationale`, `evidenceIds`.
- `context` is `{hash, versionId, expectedRevision, stage}`. Read it immediately before explicit consultation.
- `POST` same endpoint, body `{contextHash, versionId, expectedRevision}`. Returns 202 and the same response shape. No client candidate list is accepted as evidence. Stage must be 1 (visible Etapa 2), version must be the saved non-demo selected enrichment, and revision/hash must match. Duplicate active requests reuse one durable job. 409 means stale stage/version/context, or an older stale job still occupies the requirement's slot. 429 means capacity/quota/retention exhausted. 503 means worker disabled/unavailable. 413 means context exceeds bounded limits.
- No apply/save endpoint: applying is editor-only. Existing `/wizard` configure POST remains the only explicit configuration save; its ordinary validation, revision and human correction rules remain intact. Suggestions create no tracks, signatures, roles or stage changes in wizard flows.

Snapshots include the selected requirement, selected enriched version, matching approved answers, and server-derived project candidates with synchronized assignment evidence. They do not include private chats, unrelated project users, global memories or repository inspection. Candidate emails must be trusted synchronized users with `azureIdentityKey` and project membership. Nonempty proposed emails must cite at least one synchronized project work item assigned to that candidate. Assignment titles/types are limited metadata, not proof of expertise or availability. Empty owner is allowed only with low confidence and no evidence IDs; the UI requires human correction before ordinary save can pass. QA/Business remain manually chosen existing fields.

Source/context hashing binds the raw requirement, selected version, version questions, source metadata, candidates, stage and wizard revision. The server independently binds the exact queued request bytes and result inputHash and rejects tools/nonconforming outputs. Changed source, candidate, selection, revision or stage invalidates the proposal. All suggestions share <=5 active slots, 40/day total and 10/day per authenticated actor, separate from existing feature quotas. Stale pending jobs retain their slot until termination. Reconciliation runs before quota checks and on the existing server timer. Metadata is capped at 1000 jobs; no shared queue files are deleted by this module.

## Trust prerequisite

Generic user CRUD now refuses creating/upgrading Azure synchronization identity and changing synchronized user email/projects/team/name/identity/lastSyncAt. Manual users remain editable, and capacity editing remains available on synchronized users. Synchronized work item assignment identity/title/type/tags are protected against CRUD retargeting too. The authorized Azure synchronizer still writes its normal store directly. This is not new project RBAC; it preserves existing dashboard authentication policy and scopes evidence to the selected requirement's project.

## Verification (offline, synthetic data only)

```
npm test
python -m unittest discover -s test -p '*_test.py'
npm run check
node --check src/technology-suggestion.js
node --check public/dashboard/requirements/onboarding/technology-suggestion.js
```

API tests use real HTTP on an ephemeral port and isolated temporary stores. Python tests replace only the model boundary and never resolve a provider or credentials. Native Chromium tests exercise the actual onboarding modules with synthetic fetch responses, including poll retention, rationale/pending owner, cancel/confirm apply, preserved QA, separate corrected save, and mobile overflow. Controller tests cover selection/stage races and stale context. These tests are not evidence of real provider inference.

## Operator UI acceptance after authorized deployment

1. Select a synthetic requirement with a real enriched version; save the desired version and reach Etapa 2.
2. Edit a technology/area and QA without saving. Press **Consultar a Hermes** exactly once. Observe queued/running -> completed or explicit error. Verify edits remain intact while polling.
3. Review proposed technology/area, responsible email (or pending), confidence, assignment IDs and rationale. Do not infer specialty from a name/email or claim repository inspection.
4. Press **Aplicar al editor**, cancel, verify edits persist. Apply again and confirm: only technical fronts change. QA/Business remain untouched; server configuration, revision, roles, stage and signatures are unchanged.
5. Correct missing owners and proposed fields, then press existing **Guardar tecnologías y responsables**. Read `/wizard` back to verify only that explicit save persisted configuration.
6. Repeat consultation and switch requirement or leave Etapa 2 before completion. No late response may modify the new editor. Change source/version or delete a synchronized candidate during a run; the old result must be stale and unavailable for apply.
7. For a real-inference proof, run the actual durable worker on an isolated synthetic queue/store and verify completed kind, zero tools, exact input SHA-256, allowed candidate email/evidence and unchanged wizard flow. Do not use production records or edit model profiles/secrets for this acceptance.
