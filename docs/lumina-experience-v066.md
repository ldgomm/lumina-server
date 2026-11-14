# Lúmina v027 / Loyalty v066

## Visitor-to-workspace experience

Login, business registration, invitation activation, legacy sign-in and first agency setup now share the public site's navy, blue and cream identity. The desktop layout pairs an editorial introduction with the form; mobile prioritizes the form. The brand mark returns to the public homepage. No third-party fonts, scripts, trackers or new dependencies are added.

Business registration groups the existing fields into business information and personal access. Required identifiers, category, WhatsApp contact and consent are unchanged. Visible labels, password autocomplete, numeric keyboards, identity feedback and native form submission remain available. Invalid registration preserves safe values; passwords and invitation/setup codes are never echoed. Invalid invitation codes now keep the activation form with the same 403 status, allowing a retry without a detour through a generic error page. Origin, rate-limit and authorization checks are unchanged.

The password control is shared between public and account forms. Previously, identity.js could add a second reveal button around fields already managed by lumina.js. It now respects the existing control, and fallback controls also conceal passwords on submission, page return and tab hiding. Nothing is saved in browser storage.

## Services and commercial clarity

The public homepage explains three ways to work: one project, a monthly plan, or a combination. It uses no invented prices, customers, results or recurring commitments. Prices and proposals remain inside the existing authenticated catalog. The contact link uses the supplied Lúmina Instagram account.

The owner service screen groups actual persisted states:

| State | What the owner sees | Action |
| --- | --- | --- |
| ACTIVE | Ready to work | Open the existing module |
| SETUP | Configuration to finish | Continue the existing Wallet terms flow |
| INACTIVE | Available service | Explicit owner activation |

Activating Content, Web, Maps or Brand opens its workspace; ordering work and accepting a proposal remain separate. Wallet remains pending until its existing conditions are accepted. Merely reading the page never provisions, contracts, bills or activates anything. The agency and collaborators cannot use owner activation controls. Business isolation, team permissions, catalog prices, billing cycles and Wallet operational access remain unchanged.

## Installation

Baseline: installed v026/v065, local commit `a9c7c5c21973e7f4d0ecc0a02e736cf8c6ea3200`.

```bash
bash ~/Downloads/lumina_digital_experience_v027.sh --start
```

Use `--check` for compatibility and isolated portal tests without installation. English flags are canonical; previously supported aliases remain compatible. The ASCII shell wrapper explicitly invokes Python 3 and decodes its payload as UTF-8. No package installation is added.

The updater validates exact affected sources, preserves unrelated work, refuses conflicting changes and blocks production profiles. The local checkpoint must pass before a local commit is created. No push or deployment is performed. Terminal output is limited to `RESULTADO=...` and, after verified startup, `Lúmina Digital disponible en http://127.0.0.1:8099`.

## Validation boundaries

- 31 portal suites / 352 tests include recovery forms, secret exclusion, public assets, role restrictions, tenant isolation, grouped service states and opt-in activation, alongside the existing workflows.
- 170 Python tests cover launch, installation, gateway, checkpoint and production protection.
- 25 DOM suites include running both public scripts together, single password controls, visibility reset, identifier feedback and real service-form destinations.
- Browser QA uses static renderings from the real templates with fictional accounts, checking desktop and narrow widths. HTTP tests separately exercise live portal requests with temporary databases.
- The installer still requires 312 native unit/HTTP tests, 347 PostgreSQL tests, Docker staging and gateway checks before committing. Portal or browser results cannot substitute for these local checks.

There are no changes to Kotlin sources, native Wallet assets, SQL migrations, Wallet representation34, provider identifiers, encryption keys, serials, balances, device registrations, public domains, certificates or subscription terms. Physical Apple/Google delivery remains a separate verification; this UI update does not migrate existing Wallet connections.
