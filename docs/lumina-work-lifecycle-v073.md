# Business state and work history — Lúmina v034 / Loyalty v073

## Corrected behavior

This update targets installed v033/v072, commit `b86d4d369ba71ec74a11f5d8a2054dc6b672fb0b`. Previously, business controls stopped services but operational request queues, counters and selected-business views still used the request stage alone. An archived business could therefore appear to have work in progress.

Every operational query now considers the current business state before counting, filtering and pagination. Paused, suspended, closed, archived and pending-transition businesses are excluded from active production, review, upcoming visits and pending-visit queues. Requests that were already delivered or cancelled remain historical records.

The agency can select **Negocios detenidos** in Production. Requests and recording agendas have a **Detenidas** view. Selected-business requests distinguish the effective hold from their last production stage. Counts and rows share the same business, permissions, search and status predicates.

The selected-business home becomes **Historial del negocio**, with an explicit state and read-only notice. Content uses the same historical context across all sections. Request details keep files, recorded dates, comments, measurements and audit history, without editable production, approval or scheduling forms. Historical piece and visit stages are labeled as previous states. Agency state administration remains available through its dedicated route and retains the real administrator identity.

## Restoration and existing records

The hold is derived from the current business-control record; no request, deliverable or visit is cancelled, copied or deleted. This also corrects businesses archived before installation. There is no repair migration and no need to delete the business again.

Reactivation makes previously pending work operational again only after the existing state transition is acknowledged. Its original stage, service activation choices, collaborator grants and stored content remain intact. A pending native synchronization continues to block operation, including a pending reactivation. Reading a page never retries or acknowledges a state change.

Authenticated actions and calendar downloads check business operation at the server boundary. Production domain writes check it again, so a direct URL or an old form cannot bypass the current state. The server also refreshes the actor's company and business state after form-body retrieval. Owner and collaborator operational access remains blocked; the existing status/help/account and authorized billing routes retain their established behavior.

## Installation

Keep Docker Desktop running. Stop the previous local Lúmina terminal with Control+C, then run:

```bash
bash ~/Downloads/lumina_digital_work_lifecycle_v034.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--project PATH` selects another development checkout. `--check` validates compatibility and the proposed portal without installation. `--iniciar` is an alias for `--start`.

The updater checks source compatibility and portal tests before writing. It preserves the actual baseline, applies reversible source changes, and runs the native unit/HTTP, PostgreSQL, Docker and gateway checkpoint. A local commit is created only when those checks pass. It does not push. Rollback preserves unrelated work and refuses to overwrite concurrent changes.

Terminal prints `RESULTADO=...` and, only after confirmed startup, `Lúmina Digital disponible en http://127.0.0.1:8099`. The ASCII wrapper validates its payload and explicitly uses Python3 with UTF-8. The result archive contains source/test evidence and this installer, excluding private configuration and launch logs.

## Persistence boundaries

No schema or native Wallet changes are included. SQLite12, PostgreSQLV017 and Wallet representation34 remain unchanged. Tenant/pass identities, provider credentials, keys, certificates, domains, balances, customer cards, agreements and payment history are not regenerated. Suspension and archival do not cancel contracts or erase records.

This update governs operation within Lúmina. Previously published social content and external websites do not disappear. Installed Wallet delivery and refresh still depend on the existing native/provider path and device connectivity; no new claim about automatic removal or physical-device refresh is made here.

The updater is for the development checkout and retains production-profile and identity-seal guards. Public deployment must use the established release procedure and persistent data/files outside release directories. Never restore an old database over newer transactions.

## Validation

- 40 portal suites / 478 tests pass, with no skipped, cancelled or todo cases. The 19 new tests cover pause, suspension, closure, archival, old archived records, restoration, pending transitions, all service request routes, direct mutation rejection, historical files, counters, pagination, calendar download denial and cross-business isolation.
- 185 Python workflow contracts and 30 DOM suites pass. Browser fixture review covers archived request lists, agency Production, the historical business home and request detail. Request cards fit 320px and 390px viewports without horizontal page overflow.
- Installer checks cover the exact v033 baseline, check-only without source changes, idempotence, rollback, preservation of concurrent edits, unknown-source conflicts, symlinks, production guard, non-ASCII paths under C locale and payload tampering.
- The Mac installation must separately pass 312 native unit/HTTP tests, 347 PostgreSQL tests and Docker/gateway before a local commit is created. Portal fixtures do not substitute for these checks.
- Physical iPhone/Android continuity and public deployment remain separately pending. Use `wallet-continuity-v068.md` with the same installed card before and after a server update, without reinstalling it.
