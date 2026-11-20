# Independent People dashboard

URL: `/dashboard/people/`. Start: `node src/people/server.js` with `SESSION_SECRET`, `PEOPLE_ROLES_FILE`, `PEOPLE_DIRECTORY_FILE` and `PEOPLE_DATA_FILE` configured privately. Optional `PEOPLE_HOST`, `PEOPLE_PORT`, `PEOPLE_PUBLIC_ORIGIN` (an exact origin). Production uses Dockerfile.people and deploy/people.compose.yml; no host port is published.

## Source and ownership
- Azure identities are read-only from the private sanitized `azure-devops-snapshot`; preserve its original `syncedAt`. All snapshot identities are listed, including people without RBAC or classification. This coverage is not a claim of all tenant users or live sync.
- People owns only a separate JSON document containing business areas, organizational responsibilities (`qa`, `product`, `business`), enabled/notes and append-only revisions/history linked to the stable Azure key. No identity creation, name/email edits, Azure writes, AI calls or access-role grants.
- Existing onboarding fronts and developer/reviewer/support participation remain exclusively owned by the V2 ClassificationStore. The browser calls the bounded authenticated `/dashboard/onboarding-v2/api/people-catalog` using its legitimate same-origin cookie. The endpoint reuses the existing writer, validators, revision and audit; it cannot import identities/research or return raw research. People never writes V3/V2 files or proxies an invented identity.
- V3 remains a read-only consumer. The canonical writer automatically exports a reduced staffing projection under the same catalog lock on startup/snapshot access and after every mutation. V3's unchanged ReadOnlyCatalogAdapter reopens the existing read-only directory mount, so no V3 restart is needed. Only the V2 writer receives the explicit export mount; source history/research/notes never enter the V3 projection. See docs/onboarding-v2/people-canonical-catalog.md for crash recovery, integrity and deployment boundaries.
- After save, the browser rereads the writer, compares the exact reduced content/revision with V3 and verifies V3 staffing's revision/source date. It reports propagation as pending rather than claiming success if either consumer check fails. Revision conflict preserves the editor draft and requires explicit reload, which refreshes catalogue filters too.
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
| Actual catalogue/staffing integration | Chromium against actual People → createV2Server canonical writer → reduced persisted export → unchanged createV3Server read-only adapter/staffing; no route interception |
| Name/email search, edit/save/reload, XSS, conflict draft retention | Chromium synthetic fixture |
| Desktop/mobile | 1440px and 390px screenshots; exact width/scrollWidth assertions |
| Live human login and real assignment | pending coordinator's own corporate session; no production cookie fabrication |
| Canonical propagation and stale selection | real writer/export/actual V3 adapter; stale token rejected after canonical update, reload and filters verified |

Commands: `node --test test/people*.test.js`; `npm run check`; `npm run check:v3`; `node --test --test-concurrency=1`; `python3 -m unittest discover -s test -p '*_test.py'`.

## Publication and rollback
Build a clean `git archive` of the reviewed full SHA using Dockerfile.people. Mount only SESSION_SECRET, current reduced roles and sanitized directory; a separate private writable named volume belongs to uid 1000. Back up the People volume and private runtime before updates; pin full OCI revision/image and retain hashes privately. Verify health, exact HTTPS assets, anonymous state 401 and invalid-Origin POST 403. Verify node readability and write/delete a non-personnel permission probe only. Never seed real organization assignments as deployment tests.

Traefik priority 13000 matches only exact `/dashboard/people` or slash descendants. Independent service port 4195 exists only on the internal coolify network. Remove/roll back only the People service/image; never restore old personnel state over newer human decisions. The companion minimal V2 catalogue increment is built from the exact incumbent V2 release, preserving all six existing overlays and adding the explicit export overlay. V3, V1 and broker/systemd are not restarted or modified. People-owned metadata is preserved.
