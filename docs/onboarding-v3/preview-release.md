# V3 HTTPS preview release — seven-phase adaptation

Historical initial-preview baseline. Supervised LLM was subsequently authorized/configured (not invoked on production snapshots); see [supervised-enrichment.md](supervised-enrichment.md). Current continuity increment and explicit readiness limits: [continuity-release.md](continuity-release.md). Preserve all three Compose layers.

## Scope
V1 visual shell, sidebar, numbered phase rail, phase headings and responsive panels are now shared by all seven stages. Phase 1 remains questions-first with original snapshot collapsed. Phases 2–7 retain the exact V2 model/server gates: governed front selection, navigable specs and criteria, documentary findings and independent review, test planning vs declared software execution, exact-hash decisions, structured package/receipt. Navigation to phase 1 returns to the questions-first entry, not the inherited editor.

## Evidence
- TDD: new V1-shell oracle failed before implementation; mobile resize oracle failed before the rail min-width fix. Both subsequently passed in Chromium against the actual V3 backend, not mocked browser responses.
- Real-backend synthetic browser covers search/import/answer/save/reload/diff; phases 2–7 navigation; governed candidates/confirmation/stale catalog; saving phases 3/4/5/7; desktop 1440 and mobile 390 layout, all phase screenshots; uncaught exceptions checked.
- Node regression, Python and syntax checks must be reported from the release's actual logs, not copied historical totals.
- Screenshots under `docs/onboarding-v3/evidence/` contain synthetic fixtures only, not corporate sessions or real requirements.

## Preview isolation and limits
`deploy/onboarding-v3-preview.override.yml` is the explicitly authorized HTTPS router. Use with the base recipe. Exact root plus slash-prefixed descendants, priority 12000, coolify network, no published host port. Non-root image, read-only filesystem, dropped capabilities, no-new-privileges; own data volume and private runtime.

Private runtime reuses signed corporate session verification and the existing login/callback; exact approved role records are copied without additions. The source catalog/directory are reduced read-only snapshots: preserve the original directory synchronization timestamp; refreshing V3 is not live Azure synchronization. Research, proposal evidence, audit and V2 operational backlog are not mounted. At preparation: 10 fronts, zero confirmed participations, therefore no eligible real staffing candidates. No proposals are accepted and no people assigned.

Azure connector is fixed to MobileappsAmerica/agileNestCorp with authorized project read-only intake; smoke reads must not import into live V3 state. Automatic LLM is disabled: no supervised broker was configured or invoked for this release. No Azure publication, software QA execution, corporate sign-in, human approval or CP closure is implied by publication. Real corporate login/review remains a human acceptance gate.

## Operator verification and rollback
Build only `git archive` of the clean full commit, image tag and OCI revision equal that commit. Keep private before/after V1/V2 identity/health and V2 file-content manifests, restorable config/data backups, image details and exact public hashes in the private release directory. Verify HTML after server prefix rewriting and exact JS/CSS hashes; anonymous private APIs 401, hostile Origin 403, public directory off 404.

Rollback this first preview only: `docker stop dashboardma-onboarding-v3` then `docker rm dashboardma-onboarding-v3`. This removes its labels/router without touching V1/V2; retain `dashboardma-onboarding-v3-data` and private runtime/evidence. Do not run compose down on other projects or delete the shared coolify network.
