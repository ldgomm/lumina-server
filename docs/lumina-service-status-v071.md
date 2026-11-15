# Effective service status — Lúmina v032 / Loyalty v071

## Scope

This cumulative update accepts the exact installed v030/v069 source (commit `824e6658ec03dfcb22a792a56c32d684088dc6bd`) or the previously prepared v031/v070 source. It includes the v031 business/team administration update. Unknown local edits are blocked, never overwritten.

The business state governs all five Lúmina modules: Content, Wallet, Google Maps, Web and Brand Design. Their activation choices stay intact. Suspension is an operational block, not deletion of configuration or automatic cancellation of every commercial agreement.

## A clearer status for every role

**Agency: Clientes → Administrar.** The new service overview shows the effective state of all five services, alongside the last change reason. The existing lifecycle editor explains the effect of the selected action. Wallet synchronization has a separate, explicit state: observed, pending, unavailable, or requiring review. Failed retrieval never appears as a successful confirmation.

**Owner: Mis servicios.** A blocked business sees its state, reason, change date and affected services, with direct account/payment and support links. Opening an operational section while blocked shows this same explanation while retaining the HTTP423 response. The owner can review the account without bypassing the operational block.

**Collaborator: Mis servicios.** Only assigned areas appear. A cashier's saved Wallet access is included, without granting design, promotion, team, activation or billing permissions. After reactivation, the original branch and purchase/redemption abilities continue to apply.

The blocked navigation is reduced to status, help and personal account; billing remains owner-only. The screen supports desktop and narrow mobile layouts, with consistent navigation dimensions and accessible headings. User-facing text remains Spanish and all new routes, files and identifiers are English.

## State behavior

| Business state | Operations in all five Lúmina modules | Activation/configuration | Commercial effect |
| --- | --- | --- | --- |
| Active | Subject to each service's activation and the person's permissions | Previous choices apply | Existing agreements apply |
| Paused or suspended | Blocked, including cashier purchases and redemptions | Retained | Existing agreements and charges continue |
| Closed | Blocked | Retained | Future recurring Wallet charges stop; existing debt/history remain |
| Deleted | Recoverably archived and blocked | Same business, tenant and history retained | Same Wallet charge rule as closure |
| Change pending | Remains blocked until native acknowledgement | Retained | Not represented as a completed change |

Reactivation does not activate a previously inactive service, finish a pending Wallet acceptance, grant extra permissions or restart a terminated renewal without the required owner consent. Archived companies remain blocked even if an inconsistent saved state says ACTIVE.

For Wallet, Lúmina distinguishes its immediate local block from synchronization with the native server. Administrator reads may report the freshly observed native state. Owner reads show the last acknowledged change and timestamp; they do not claim current provider health. Reading a screen never retries a mutation. Explicit retry reuses the durable command.

Apple/Google control when an installed card refreshes. Blocking a program does not physically remove the card from a customer's phone. Existing pass identifiers and balances are retained. A website or social post already published outside Lúmina, and an external Google Business Profile, are not remotely shut down by changing the Lúmina business state.

## Administration and identity retained

The cumulative v031 update includes agency assistance with collaborators through dedicated `/admin/businesses/:company/team` routes. The actor remains the administrator; business orders, approvals and service consent cannot be submitted by impersonating the owner. Assigned collaborator cedula/phone, revision checks, CSRF, session revocation, recoverable deletion and explicit native withdrawal retry are preserved. See `lumina-administration-v070.md` and `lumina-identity-access-v069.md`.

## Installation

Keep Docker Desktop running. Stop the old local Lúmina terminal with Control+C, then run:

```bash
bash ~/Downloads/lumina_digital_services_v032.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--project PATH` selects another development checkout. `--check` runs compatibility and portal validation without installation. `--iniciar` remains a compatible alias.

The updater tests the proposed portal before modifying the project. It saves the actual source baseline, applies reversible changes and runs the native build/unit, PostgreSQL, Docker and gateway checkpoint. A local commit is created only when those gates pass; there is no push. Conflicts and symlinks are blocked. On a handled failure, rollback restores the actual v030 or v031 baseline and does not overwrite later unrelated edits.

The ASCII wrapper validates payload integrity and runs Python3 with UTF-8, including non-ASCII project paths. Terminal output remains `RESULTADO=...` plus `Lúmina Digital disponible en http://127.0.0.1:8099` only after confirmed startup. Source/test evidence goes to Downloads; private configuration and launch logs are not bundled.

## Persistence and production

v032 adds no migration and does not modify native Wallet source. The included v031 migration is additive SQLite012; historical migrations stay unchanged. PostgreSQL remains V017 and Wallet representation34 is unchanged. Provider keys, pass/tenant IDs, domains, balances and historic transactions are not regenerated.

This is a development-checkout installer; production profiles and identity seals remain protected. Deployment requires the existing planned schema transition, verified backups, stable provider identities and persistent data/files outside release directories. Do not restore an old database over newer transactions or roll back to an unmodified schema11-only binary.

## Validation and remaining checks

- 38 portal suites / 441 tests pass without skipped, cancelled or todo cases. Twelve new tests cover every blocked service, GET/POST/API boundaries, pending synchronization, inactive/setup preservation, tenant isolation, collaborator visibility, archived access and purchase/redemption after reactivation. The existing activation-page test now verifies collaborator read-only visibility and continues to reject activation.
- 185 Python workflow/production contracts and 28 DOM suites pass. Fixture browser review covers owner, collaborator and administration at desktop, 320px and 390px; the inspected mobile pages have no horizontal overflow.
- Installer checks cover exact v030 and v031 baselines, idempotence, restoration of each actual baseline, conflicting source, symlinks, production guard, non-ASCII paths under C locale and damaged payload detection.
- The user's Mac must still pass 312 native unit/HTTP tests, 347 PostgreSQL tests and local Docker/gateway checks before commit. Portal and simulated-native tests do not replace those checks.
- Physical iPhone/Android continuity remains pending. Follow `wallet-continuity-v068.md`: keep the same installed card, record a purchase/redemption, update the server, then repeat without reinstalling the card. No public production deployment is claimed.
