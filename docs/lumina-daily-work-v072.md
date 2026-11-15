# Daily workflow — Lúmina v033 / Loyalty v072

## Scope

This update targets the installed v032/v071 source, confirmed by commit `d249eea6f2d74222582d517d0caf8a29bb43a88c`. It improves daily notices and recording appointments while preserving business lifecycle, team, identity, subscription and Wallet behavior. Unknown local changes are blocked instead of overwritten.

## Notices that keep your place

Marking a notice seen retains its category, search and seen-state filter. If the last item on a page disappears, the next view returns to the last valid page. Each person can mark a current notice new again without changing anyone else's seen state or resolving the underlying task.

Search now includes the visit location. Category totals respect the current search and seen-state filter. A search with no matches offers a clear way back; it does not imply every task is complete. Labels, actions and touch targets remain readable on narrow screens.

Seen/new writes require the current item fingerprint, CSRF and current permissions. After asynchronous account retrieval the server rechecks the account, session, company, grants and business lifecycle. Suspension or revocation during that lookup blocks the result and any write. Financial notices remain owner-only.

## A recording agenda you can scan

The shared agenda groups visits by day in Ecuador continental time. It highlights the hour and location, identifies today and tomorrow, and links directly to the recording section of the request. Content keeps its own navigation; administration keeps the real agency actor and company scope.

Upcoming, pending-update and history counts use the same search and access rules as their rows. A past scheduled visit remains pending an explicit update; time passing never marks it completed. The Content sidebar also removes excessive nested spacing around the business identity without changing the shared sidebar dimensions.

## Save an appointment to a calendar

An upcoming scheduled visit offers **Guardar en calendario**. It downloads a private `.ics` snapshot; it does not send invitations, create external calendar accounts or grant public access.

The endpoint checks the authenticated actor and current request permissions on every download. Company boundaries, collaborator grants, service activation and business suspension apply. Cancelled/completed visits and cancelled requests cannot produce a new appointment download. Agency consultation is read-only and retains the real administrator identity.

The file includes the request title, business name, confirmed date/time and location. It excludes private notes, contact numbers, account information and session credentials. Dates use UTC for accurate calendar conversion; identifiers stay stable across downloads and the visit revision becomes the event sequence. Text is escaped and UTF-8 lines are folded according to [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

No end time, duration or reminder is fabricated. This is a copy, not a live subscription: later changes in Lúmina do not update the imported event automatically. The interface explains that limitation. Calendar applications control how they import or merge repeated files; no iPhone/Android calendar import has been claimed as verified.

## Installation

Keep Docker Desktop running. Stop the old local Lúmina terminal with Control+C, then run:

```bash
bash ~/Downloads/lumina_digital_workday_v033.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--project PATH` selects a different development checkout. `--check` validates compatibility and the proposed portal without installation. `--iniciar` remains a compatible alias.

The updater validates source compatibility and portal tests before modifying the project. It saves the actual baseline, applies reversible source changes, then runs the native build/unit, PostgreSQL, Docker and gateway checkpoint. A local commit is created only after those gates pass; there is no push. On a handled failure, rollback restores the original files without overwriting later concurrent edits.

The ASCII wrapper verifies its embedded payload and runs Python3 with UTF-8, including non-ASCII project paths. Terminal prints `RESULTADO=...` and, only after confirmed startup, `Lúmina Digital disponible en http://127.0.0.1:8099`. The result archive contains source/test evidence and the same installer; private configuration and launch logs are excluded.

## Persistence and production

No database migration or native Wallet source is included. SQLite remains schema12, PostgreSQL remains V017 and Wallet representation34 is unchanged. Provider keys, tenant/pass IDs, serials, domains, balances, customer cards, agreements and permissions are not regenerated.

This is a development-checkout update. Production profiles and identity seals remain protected. Public deployment still requires the existing controlled release procedure, verified backups and persistent data/files outside release directories. Never restore an older database over newer transactions.

## Validation

- 39 portal suites / 459 tests pass, without skipped, cancelled or todo cases. Eighteen new tests cover notice filter preservation, per-person undo, stale fingerprints, CSRF, asynchronous suspension/revocation, agenda search and timezone boundaries, authenticated calendar scope, read-only behavior, text injection protection and stable event identity.
- 185 Python workflow/production contracts and 29 DOM suites pass. Native form checks cover owner, Content and agency context without browser storage or JavaScript dependence. Fixture browser review covers the agenda and notices at desktop, 320px and 390px; inspected mobile pages have no horizontal overflow.
- Installer validation covers the exact v032 baseline, check-only without source changes, idempotence, actual-baseline rollback, concurrent edits, source conflicts, symlinks, production guard, non-ASCII paths under C locale and damaged payload detection.
- The user's Mac must pass 312 native unit/HTTP tests, 347 PostgreSQL tests and Docker/gateway before commit. These checks are not replaced by portal fixtures.
- Installed Wallet continuity on physical iPhone and Android remains a separate pending verification. Follow `wallet-continuity-v068.md` using the same card before and after a server update, without reinstalling it. No production deployment is claimed by this update.
