# Independent People dashboard

URL: `/dashboard/people/`. Start: `node src/people/server.js` with `SESSION_SECRET`, `PEOPLE_ROLES_FILE`, `PEOPLE_DIRECTORY_FILE` and `PEOPLE_DATA_FILE` configured privately. Optional `PEOPLE_HOST`, `PEOPLE_PORT`, `PEOPLE_PUBLIC_ORIGIN` (an exact origin). Production uses Dockerfile.people and deploy/people.compose.yml; no host port is published.

## Source and ownership
- Azure identities are read-only from the private sanitized `azure-devops-snapshot`; preserve its original `syncedAt`. All snapshot identities are listed, including people without RBAC or classification. This coverage is not a claim of all tenant users or live sync.
- People owns only a separate JSON document containing business areas, organizational responsibilities (`qa`, `product`, `business`), enabled/notes and append-only revisions/history linked to the stable Azure key. No identity creation, name/email edits, Azure writes, AI calls or access-role grants.
- Existing onboarding fronts and developer/reviewer/support participation remain exclusively owned by `/dashboard/onboarding-v3/api/classifications`. The browser calls that exact authenticated same-origin API using its legitimate cookie. People never writes a V3/V2 file or proxies an invented authenticated identity.
- Critical current compatibility limit: production V3 uses `ReadOnlyCatalogAdapter` with a reduced catalog projection. Its API reports `canManage:false`. The dashboard disables front/participation changes and explains why. Organizational metadata is still writable by coordinators. The integration test uses actual `createV3Server` with a writable fixture `ClassificationStore`, demonstrating direct canonical save → staffing without duplicate participation storage. It does NOT prove production propagation. Enabling the canonical V3 write service is a separately coordinated integration; this release does not alter V3 code/runtime/mounts or broker.
- The private full directory endpoint is not an expansion of the pre-existing public reduced directory. People has no anonymous personnel endpoint. HTML/assets contain no personnel values.

## Security and audit
- Shared signed `ma_ct_session` Path=/dashboard; exact tid+oid mapping from current private roles. Login goes through `/dashboard/auth/login?returnTo=%2Fdashboard%2Fpeople%2F`. No login implementation or Entra client secret/PAT is copied. Invalid/expired session →401; unassigned identity →403.
- Existing assigned-role readers can inspect the same configured organizational scope; coordinator is mandatory on every write, server-side. No email-based authorization. Explicit azureIdentityKey links are the only permission-display mapping; duplicates display unmapped. A QA/reviewer responsibility is not an approval permission.
- Every mutation requires exact Origin, current global revision and `confirm:true`. Unknown fields, arbitrary roles, unknown identities/areas and duplicate area names are rejected. Assigned areas cannot be deleted; deactivate them. A source-absent person cannot get a new enabled assignment; existing metadata/history survive and can be retired via API.
- Serial queue + exclusive lock protects People-owned JSON; write/rename atomically replaces the document. Never share this file with uncooperating writers. Locks fail closed; recover only with all People writers stopped after verifying a private backup. No cross-service ACID or power-loss durability is claimed. Organization and participation require separate explicit commits, never a pretend combined transaction.
- Text rendering escapes names, email, notes and catalogue labels. CSP, no-store, noindex and no-sniff supplement authorization.

## Verification matrix
| Requirement | Evidence |
|---|---|
| Full snapshot directory and original date | real HTTP fixture tests; no RBAC filtering |
| Area create/update/delete and organization audit | HTTP store tests; forbidden assigned-area delete |
| Roles, origins, revision conflict, confirmation | HTTP negative tests |
| Actual catalogue/staffing integration | Chromium against actual People + createV3Server, no route interception |
| Name/email search, edit/save/reload, XSS, conflict draft retention | Chromium synthetic fixture |
| Desktop/mobile | 1440px and 390px screenshots; exact width/scrollWidth assertions |
| Live human login and real assignment | pending coordinator's own corporate session; no production cookie fabrication |
| Production staffing propagation | blocked by existing V3 read-only projection, not declared complete |

Commands: `node --test test/people*.test.js`; `npm run check`; `npm run check:v3`; `node --test --test-concurrency=1`; `python3 -m unittest discover -s test -p '*_test.py'`.

## Publication and rollback
Build a clean `git archive` of the reviewed full SHA using Dockerfile.people. Mount only SESSION_SECRET, current reduced roles and sanitized directory; a separate private writable named volume belongs to uid 1000. Back up the People volume and private runtime before updates; pin full OCI revision/image and retain hashes privately. Verify health, exact HTTPS assets, anonymous state 401 and invalid-Origin POST 403. Verify node readability and write/delete a non-personnel permission probe only. Never seed real organization assignments as deployment tests.

Traefik priority 13000 matches only exact `/dashboard/people` or slash descendants. Independent service port 4195 exists only on the internal coolify network. Remove/roll back only the People service/image; never restore old personnel state over newer human decisions. No V1/V2/V3 restart or broker/systemd change is part of this deployment.
