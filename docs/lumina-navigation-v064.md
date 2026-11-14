# Lúmina v025 / Loyalty v064 — English navigation and clear access

Baseline: installed v024r1 / v063, commit a4d70e146ca785dcd73e6f9e9a37348112af3c20.
The supplied src.zip matches all 321 source files present in that archive.

## Navigation contract

Canonical portal paths, filters, form actions and page anchors use English.
User-facing labels, instructions, validation errors and dialogs remain Spanish.

| Area | Canonical route |
| --- | --- |
| Sign in | /login |
| Business registration | /register |
| Collaborator activation | /activate |
| First welcome | /welcome |
| Agency overview | /dashboard |
| Business home | /home |
| Agency business directory | /businesses |
| Agency team consultation | /teams |
| Owner team editor | /team |
| Content module | /content |
| Service requests | /requests |
| Plans and service packages | /plans |
| Calendar | /calendar |
| Pending decisions | /attention |
| Personal account and sign out | /account |
| Business billing | /billing |
| Wallet | /wallet |
| Wallet cashier | /cashier |
| Management | /management |
| Health and readiness | /health and /health/ready |

Filters use company, view, period, page, state, from and to. For example:
/content?view=calendar&period=upcoming. No platform is required when requesting content.

Old bookmarks such as /entrar and /planes redirect to canonical English URLs.
Cached POST forms are normalized internally, retaining their body, CSRF validation,
actor and idempotency keys. Conflicting old/new company or filter parameters fail
before selecting a tenant. Provider URLs, public QR slugs, API identifiers and tokens
remain opaque. Old health probes and asset URLs retain their response types.
The small legacy dictionary and fragment adapter are compatibility boundaries, not
new navigation. Historical audit codes remain unchanged to preserve existing records.

## Access and usability

- Login has a focused form, separate business registration and collaborator activation.
- Password fields have explicit accessible labels and optional visibility buttons.
  Visibility resets when leaving the tab, submitting or returning to the page.
  No password or personal details are written to browser storage.
- Authorized navigation can be searched, focused with Arrow Down and opened with Enter.
  Escape clears the search. Unknown searches do not navigate.
- Errors provide a route back to the current account's workspace and help.
- Team and content permissions remain enforced on the server. Agency consultation
  cannot create requests or accept proposals as a business.
- Existing delivery bookmarks open the correct English anchor, including collapsed panels.

## Continuity

No change to Kotlin, native Wallet assets, SQL migrations, SQLite schema 10,
PostgreSQL V017, Wallet representation 34, Apple serials and authentication tokens,
Google objects/classes, device registrations, signing materials, domains, balances,
contracts, prices or subscription terms. Wallet access retains its session and grants.
Database records are not renamed or recreated. This updater does not deploy production.

## Validation and installation

Verified in an isolated source copy: 326 HTTP/domain tests across 29 suites,
170 Python tests and 23 DOM suites. Browser screenshots could not be verified in
this environment because Chromium could not create its required local socket.
Physical Apple/Google testing, real HTTPS and production remain separate checks.

The installer runs portal checks before changing project files. It then requires the
complete existing checkpoint: Python, portal, 312 Kotlin/unit/HTTP tests, 347 PostgreSQL
tests, local staging and gateway. A local commit is created only if all gates pass;
there is no push. Production profiles are blocked. Changes to conflicting files are
not overwritten; compatible IntelliJ formatting is handled by the existing patcher.

From Downloads, with Docker Desktop running and the old portal stopped using Control+C:

```bash
bash ~/Downloads/lumina_digital_navigation_v025.sh --start
```

Optional check without installation:

```bash
bash ~/Downloads/lumina_digital_navigation_v025.sh --check
```

Canonical installer flags: --start, --check, --project and --evidence.
Previous flags remain accepted for existing shortcuts.
The terminal prints RESULTADO and, only after a successful startup health check:

```
Lúmina Digital disponible en http://127.0.0.1:8099
```

The result archive contains before/after source and redacted validation evidence.
It excludes private configuration, credentials, databases, certificates and passes.
No claim of a new installation or commit is made until that local checkpoint runs.
