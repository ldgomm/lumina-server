# Lúmina v026 / Loyalty v065

## Public agency homepage

The root path `/` now presents Lúmina Digital, its five services, its working process, the customer workspace and account entry. The design uses the existing Lúmina mark, navy and blue, an editorial layout, original CSS illustrations and responsive navigation. Illustrations are explicitly labelled examples; there are no invented clients, testimonials, statistics or guaranteed results.

The service index and FAQs use native disclosures. The mobile menu also works without JavaScript; its small enhancement closes it on link selection, Escape and outside clicks. Keyboard focus, a skip link and reduced-motion preferences are supported. All assets are local and CSP remains restrictive.

| Destination | Path |
| --- | --- |
| Agency website | `/` |
| Sign in | `/login` |
| Register a business | `/register` |
| Activate a collaborator | `/activate` |
| Existing authenticated workspace | `/home` |

Visitors can explore the services before creating an account. Authenticated people can view the public website and return to their existing workspace. No names, identifiers, companies, session tokens or account balances are embedded in the homepage. Reading it never creates or activates a service. Private routes with an expired or revoked session go directly to `/login`.

## Focused service offering and route audit

The active offer is Content for Social Media, Web, Google Maps, Brand Design and Digital Loyalty. The former WhatsApp Business/AI section is removed from agency navigation, business navigation, dashboard shortcuts and page rendering. Its English endpoint returns 404 for all roles and accepts no operations. Ordinary WhatsApp business contact numbers remain supported.

Generated portal routes, query names and section anchors are English. The explicit legacy boundary preserves old bookmarks and cached form submissions; for example `/entrar` redirects to `/login`. Historical aliases are not advertised or generated. Retired-service bookmarks redirect to the retired English endpoint and receive 404. Provider paths, QR slugs and opaque identifiers retain their original bytes.

## Installation

Baseline: installed v025/v064, local commit `ed9442283aa339a347076ebdba958c8aac0498f3`.

```bash
bash ~/Downloads/lumina_digital_homepage_v026.sh --start
```

Use `--check` for a compatibility and portal-contract check without installation. English flags are canonical; previously supported Spanish flags remain compatible. The shell wrapper is ASCII and invokes Python 3 with an explicit UTF-8 payload.

The updater checks the exact affected sources, preserves unrelated work, rejects conflicting edits and refuses production profiles. It validates the portal in an isolated fixture before applying changes. The complete local checkpoint runs before a local commit; no push or production deployment is performed. Failed checks produce evidence and no success commit. Terminal output is limited to `RESULTADO=...` and, only after startup is confirmed, `Lúmina Digital disponible en http://127.0.0.1:8099`.

## Validation and continuity

- 30 portal suites / 340 tests cover public rendering, links, static assets, login errors, registration, sessions, logout, retired services and route literals, as well as existing business isolation and Wallet workflows.
- 170 Python tests validate the existing launch, installation, gateway and production guard behavior.
- 24 DOM suites include mobile-menu dismissal and keyboard-focus behavior. DOM checks do not substitute for visual inspection.
- Browser inspection uses a disposable static rendering of the actual homepage, with desktop and 320/390/768/1024-pixel frame checks. Real authentication and data behavior are separately checked over HTTP with temporary databases.
- The local checkpoint still requires 312 native unit/HTTP tests, 347 PostgreSQL tests, Docker staging and gateway validation before creating the commit. These results are not inferred from portal tests.

There are no changes to Kotlin sources, native Wallet assets, SQL migrations, Wallet representation34, identities, balances, encryption keys, issuer IDs, serials, provider objects, device registrations, domains, certificates, contracts or subscription terms. This update does not migrate an existing Wallet connection. Physical Apple/Google device receipt remains a distinct verification.
