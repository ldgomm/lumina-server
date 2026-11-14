# Lúmina v028 / Loyalty v067

## Requests, production and delivery

Home, Requests and Content now use the same request progress cards. Each card shows the next step, the request date and, for multi-piece work, the delivered count. Review links open the exact piece inside its existing request. Final deliveries open the deliverables section; scheduled visits open the visit section; owner quotes open their existing review form.

Content has separate, compact cards for production, review and completed delivery. Cards show the piece title, parent request, actual evidence count and recording date when available. Agency views retain the business name. Approved production pieces link to the existing agency completion form. All actions use native links and the existing server authorization; the lists do not approve, publish or modify work.

The general Requests page prioritizes the list and the New request action. Search remains visible, while service and status filters are grouped in an expandable section that opens automatically when a filter is active. Existing form fields and server-side validations remain unchanged.

## Accurate search and navigation

- Open requests excludes delivered and cancelled work. Closed requests remains available as a separate filter.
- Searching a piece title finds its parent request; piece lists do not include unrelated siblings merely because another piece matched.
- Production and review queues exclude closed parent requests. Completed deliveries remain available as history.
- Pagination uses the actual filtered total and clamps an out-of-range page to the last available page.
- Delivered counts are correlated to both business and request, so multiple platform publications do not multiply production totals.
- Content search, view, business and read-only mode are preserved in navigation links.

## Roles and data boundaries

Approval prompts require the existing request-level APPROVE permission, including historical platform scopes. Read-only collaborators receive neutral links, and revocation takes effect immediately. An agency member consulting a business receives no business approval controls. Agency production links stay in the operational context. The existing server still rejects unauthorized changes independently of what the interface displays.

Reading the updated pages does not change requests, deliverables, evidence, audit records, grants, contracts or activated services. No database migrations or new dependencies are introduced.

## Installation

Baseline: the verified installed v027/v066 source snapshot, local commit `5c98f4a6aa878141226c4b4a220d3ea1f6cb7f33`.

```bash
bash ~/Downloads/lumina_digital_workspace_v028.sh --start
```

Use `--check` to validate compatibility and run isolated portal tests without installing. Use `--project /absolute/path/to/loyalty` for another development checkout. English flags are canonical; existing command aliases remain compatible. The wrapper is ASCII and explicitly uses Python 3 with a UTF-8 payload.

The updater checks the expected source bytes, preserves unrelated work, rejects source conflicts and symbolic links, and blocks production profiles. It creates a local commit only after the full checkpoint passes. It never pushes or deploys. Terminal output is limited to `RESULTADO=...` and, after verified startup, `Lúmina Digital disponible en http://127.0.0.1:8099`.

## Validation

- 32 portal suites / 366 tests, including 14 new HTTP and rendering cases for progress, deep links, queue boundaries, search, pagination, tenant isolation and permission revocation.
- 170 Python tests for the existing launch, gateway, checkpoint and installation flows.
- 26 DOM suites, including native piece links, focus at the destination, accessible progress, preserved filters and absence of unauthorized approval actions.
- Browser inspection of real server-rendered templates with fictional data on desktop and at 320, 390 and 768 pixel widths. Review links open and focus the exact delivery; expanded filters fit narrow screens without horizontal overflow. These static previews complement the live HTTP tests and do not replace them.
- Installer validation covers check-only operation, idempotency, rollback, conflicts, symbolic links, production guards, a non-ASCII project path under the C locale, and payload integrity.

The Mac checkpoint still requires 312 native unit/HTTP tests, 347 PostgreSQL tests, Docker staging and gateway checks before committing. Those native checks run on the user's development machine; this package's local portal and browser checks are not a claim that they already ran for v028 on the Mac.

## Wallet continuity

Kotlin sources, native Wallet resources, SQL migrations, provider identifiers, encryption keys, card serials, balances, device registrations, domains, certificates and subscription terms are unchanged. This release improves the portal's work views and does not migrate Wallet connections. Physical Apple and Google Wallet delivery remains a separate device check.
