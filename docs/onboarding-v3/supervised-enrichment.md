# V3 supervised direct LLM integration

This increment is direct stateless LLM inference, **not a Hermes agent**. No tools, hooks, plugins, memory loading, shell dispatch or Azure publication. Only an explicit editor/coordinator action sends the current imported source; import itself never invokes inference. Results are documentary proposals requiring human review, not verified facts or QA.

## Supervisor boundary

- Dedicated `dashboardma-v3-broker.service`: non-root `dashboardma-v3-llm`, zero capabilities, no home/provider credential access, private network, AF_UNIX only, immutable release, writable journal0700 and shared socket directory0710 only. HMAC key is dedicated to V3, not OAuth. Journal reserves+fsync before inference; interrupted reservations remain terminal. No queues/retries or silent lock recovery.
- Dedicated socket-activated `dashboardma-v3-worker@.service`: fixed ExecStart `/usr/bin/bwrap`, fixed Python `-I -S` worker, no client-selectable executable/arguments. Only broker group can access `/run/dashboardma-v3-worker.sock`; web never mounts it. MaxConnections=1, per-call runtime47s/memory384MiB; worker limits remain tighter. Root initial helper is necessary: this host's AppArmor denies unprivileged userns (`setting up uid map: Permission denied`); narrowing the helper capability bounding set also fails. No global policy was relaxed. Root is confined to the fixed trusted sandbox launcher; capabilities are dropped ALL inside worker. This is not a claim that root supervisor is isolated from a compromised kernel/root.
- Helper `ProtectHome=tmpfs` exposes only the original auth singleton read-only for each new service invocation, never a copy. Worker uses only openai-codex singleton, no pool/refresh/fallback. Expiry fails closed. Broker/web cannot read auth. Worker hides `/usr/local` Hermes code, all host homes/workspaces/memories; fixed TLS endpoint only, but **network is shared, not kernel-enforced domain egress**.
- Signed nonce health calls audit a real namespace and singleton expiry; web advertises configured only while ready. Busy, expired, missing helper, bad audit or poisoned broker fails closed. Health is not a paid provider request or proof provider remains reachable between calls. Every call still validates namespace/credential again.
- Root-owned immutable release templates in deploy are installed with `@RELEASE@` replaced by exact clean SHA archive path. Socket unit installed as `dashboardma-v3-worker.socket`, worker template as `dashboardma-v3-worker@.service`, broker as `dashboardma-v3-broker.service`. Names intentionally omit the source template `onboarding-` prefix.

## Deployment and recovery

Use existing V3 Compose project with base+preview+new enrichment overlay, same SSO env/roles/catalog/data/router. Overlay defaults authorized=false; turn on only after synthetic real-provider and isolation verification. Dedicated private enrichment.env contains only V3_HERMES_BROKER_KEY. Never mount auth/provider files, helper socket, host home, journal or Docker socket in web.

Before recreating only V3: private0700 release directory, verified restorable data/runtime tarballs0600, exact container/env/mount baseline and V1/V2 file manifests. Build git archive of clean SHA using Dockerfile.onboarding-v3 allowlist, full SHA tag and OCI revision. Test image via ephemeral synthetic V3 backend without production SSO. Keep all production snapshots empty/unmodified.

On crash do not unlink socket/owner lock automatically. Stop dedicated broker and verify no worker owns it, back up journal, inspect JSON and recover operator-side only; existing execution IDs remain terminal. Journal cap100 requires explicit archival/key epoch plan, never transparent retry. Graceful SIGTERM releases lock/socket, bounded by 55s. tmpfiles recreates shared runtime directory on boot. Restart only these dedicated units, never Hermes gateway/profiles or V1/V2.

## Verification evidence

Automated synthetic tests cover fixed worker transport, missing socket, signed/unsigned readiness, strict output/provenance, bounded context/output, timeout, duplicate and revision/source race. Existing Chromium suites preserve seven phases, desktop/mobile manual editing and unavailable-LLM UI. An opt-in synthetic paid smoke must record actual provider usage separately from fixtures labeled `real`.

Private release readbacks, real synthetic output, exact image/container/health, service properties, public asset hashes, anonymous401/Origin403 and before/after preservation manifests are retained outside Git. Production corporate SSO and semantic approval are not fabricated by these tests. Operational snapshots are never automatically imported/enriched, and Azure writes remain disabled.
