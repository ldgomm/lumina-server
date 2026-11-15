# Business workspace — Lúmina v035 / Loyalty v074

## Scope

This update builds on the installed v034/v073 source, commit `388357b383aeae22b299cfca22ed74b0a8146c26`. It improves agency client administration without modifying business identities, credentials, permissions, service activation choices, agreements or customer cards.

The client directory has one primary search and four lifecycle views. Search includes business and owner names, cedula, RUC and telephone. Facet counts use the same search and verification scope; the archived view retains recoverable deleted businesses. A pending transition cannot appear as operational. State links preserve search and ordering, reset pagination, and keep archived history separate from current work.

Each business row links directly to unfinished requests, its team and its profile or history. Valid telephone numbers offer a call link. The business administration page shows unfinished requests, upcoming and overdue visits, and enabled collaborator accounts. Blocked businesses label preserved collaborator access without implying that those accounts can operate. Counts are independent, tenant-scoped reads; completed or cancelled work is excluded. Local work summaries remain available if native Wallet account retrieval fails.

State changes use native, mutually exclusive choices with their consequences beside the label. No action is selected on a fresh form. Required reasons, explicit confirmation, CSRF, revision checks, idempotency and server authorization remain enforced. Recoverable errors preserve safe input but require confirmation again. Delete and restore retain their existing controls.

## Validation

- Portal: 41 files, 492 tests, no skipped or cancelled tests.
- Python contracts: 185 tests.
- DOM: 31 suites, including client directory and business state forms.
- Browser fixtures: desktop and narrow viewport review of the directory, work summary, paused and archived states, and native state choices. Static fixtures contain fictional data and do not perform live operations.
- Installer: exact v034 source compatibility, check-only with real portal tests, idempotence, rollback, concurrent-edit preservation, conflict rejection, symlink rejection, production profile guard, ASCII shell wrapper, UTF-8 Python payload and payload integrity.

The installer must additionally pass the existing 312 native unit/HTTP tests, 347 PostgreSQL checks and Docker/gateway validation on the Mac before creating a local commit. Container preparation and browser fixtures do not establish those results. Physical update of an already installed Apple/Google card remains a separate pending device check.

## Install

Save `lumina_digital_business_workspace_v035.sh` in Downloads, then run:

```sh
bash ~/Downloads/lumina_digital_business_workspace_v035.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--iniciar` is accepted as an alias. `--check` runs compatibility and portal checks without applying the changes. Terminal output is one `RESULTADO=...` line plus the local URL only after startup is confirmed. Detailed diagnostics remain in the result archive in Downloads. There is no push or production deployment.

## Continuity

No migration is added. SQLite12, PostgreSQLV017 and Wallet representation34 remain unchanged. Native Kotlin, Wallet assets, provider keys, persistent domains, tenant/pass identifiers, balances, customer registrations, files and existing SQL migrations are outside the changed source set. Existing work-lifecycle enforcement remains authoritative. Read operations never retry a state transition or activate a service.

Production profiles and incompatible local edits remain blocked by the installer. Never copy test databases or rotate provider credentials to deploy this change. Retain the separate production procedure and installed-device continuity evidence.
