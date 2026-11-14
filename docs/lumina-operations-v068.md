# Lúmina v029 / Loyalty v068

## Business workspace

The business account brings together current and upcoming agreements, included units, delivered/reserved/available quantities, Wallet branch pricing, upcoming charges, outstanding balances and recorded payments. Agreement totals are not added to ledger debt a second time. If Loyalty cannot supply the balance, the portal says it is unavailable instead of displaying zero.

Wallet terms are unchanged: the accepted introductory period ends on December 31, 2026; then USD 4.99 per month or USD 50 per year per billable branch, according to the accepted agreement. A ledger charge is not a bank-card debit. Automatic banking collection is not implemented by this release. Monthly marketing renewals follow their existing agreement flow.

## Private content delivery

Agency production can upload MP4, WebM, JPEG, PNG, WebP and PDF files directly into an existing deliverable. Videos and images preview in the same screen. Each asset retains its previous versions. Owners and authorized collaborators can comment on the deliverable or a specific version. New files and new versions return an approved piece to review; approval of an old revision cannot approve the replacement.

- Maximum 100 MB per file and 5 GiB of referenced files per business. Existing external links remain available for larger deliveries. No video transcoding, resumable upload or malware scanner is included.
- Files live in the persistent `LUMINA_DATA_DIR/uploads` directory, never in public static assets or a release directory. Production backups now include and verify these files against their database references and SHA-256 hashes.
- Reads require a current authorized session and the matching business/request. Downloads and video range requests recheck access. Revocation blocks later requests; bytes already downloaded to a device cannot be remotely erased.
- Uploads have body limits, signature checks, private random filenames, bounded concurrency, rate limits, CSRF validation, revision checks and idempotency. Authorization is checked again after receiving the upload. Rejected uploads are cleaned up.
- Comments are attributed to the actual actor. Agency consultation remains read-only; agency delivery actions use the operational context. No owner impersonation.
- Comments show the latest 100 entries; older records remain stored. Uploaded versions are immutable. Deletion/retention administration is not added in this release.

## Useful notices and clearer access

`/attention` groups delivery reviews, quotes, proposals, upcoming recordings and owner-only payment notices. A seen state belongs to the account and the item's meaningful revision. Reading the page does not silently mark notices. An updated delivery or changed quotation appears as new; resolved items disappear. These are portal notices, not email or push messages.

The team editor shows an **Acceso guardado** summary based on effective grants, current cashier assignment and branch. It distinguishes purchases, redemption and configuration rights without creating another Wallet permission editor. The local HTTP scenario covers assignment, purchase/redemption forwarding, wrong-branch rejection, prohibited configuration and revocation with an existing session. Its native Loyalty adapter is a test fixture; actual native transactions remain part of the Mac and device checks.

## Metrics

Comparisons use the same publications and an actual preceding measurement. Missing measurements remain unknown, not zero. Percentage changes require a nonzero baseline. Measurements seven days old or older are identified at the selected period's cutoff, and missing/stale publications are prioritized. Cross-platform totals do not claim unique people. Data entry remains manual; see [social synchronization readiness](social-sync-readiness-v068.md).

## Installation and validation

Baseline: installed v028/v067, commit `719cb09910352fdef9e36220a218476fded60902`.

```bash
bash ~/Downloads/lumina_digital_operations_v029.sh --start
```

`--check` validates compatibility and runs the isolated portal suite without installing. `--project /absolute/path/to/loyalty` selects another development checkout. The ASCII wrapper explicitly runs Python 3 with UTF-8. The installer rejects source conflicts, symbolic links and production profiles. It preserves unrelated work, never pushes and creates a local commit only after the full checkpoint passes. Terminal output is limited to `RESULTADO=...` and the availability URL after verified startup. A detailed result archive is saved in Downloads.

Prepared-package validation: 35 portal suites / 397 tests; 185 Python tests; 26 DOM suites. Real server-rendered fixture screens were inspected in the browser on desktop and at 320, 390, 768 and 1024 pixels; narrow layouts had no document overflow, video playback succeeded and previous versions remained accessible. These fixtures use fictional data. Installer validation checks conflict refusal, idempotency, restoration, production guards, non-ASCII paths under the C locale, payload integrity and check-only behavior.

The Mac checkpoint still requires 312 native unit/HTTP tests, 347 PostgreSQL tests, Docker staging and gateway validation. Those gates were not executed on the user's Mac during package preparation. Public deployment and installed Apple/Google card continuity are pending.

## Data migration and production boundary

SQLite migration `011_delivery_workspace.sql` adds private file metadata, comments and per-account notice state. Startup takes a coherent pre-migration SQLite backup. Existing migrations, native Kotlin code, PostgreSQL V001–V017, Wallet representation 34, keys, identifiers, serials, business links and balances are unchanged.

This development updater does not deploy production. An existing production identity seal includes migration hashes and must not be overwritten or bypassed to accept this migration. Rehearse the transition on a restored copy, verify persistent upload storage and backup/restore, and prepare a reviewed schema-11-compatible rollback release. An unmodified v028 portal rejects SQLite11: restoring only old binaries is not a safe rollback. Never restore an old database over new transactions. Keep native Wallet services and their public origins available while coordinating the single portal writer and migration. The production transition and traffic switch require a separate deployment procedure.

Follow [Wallet continuity](wallet-continuity-v068.md) for the read-only comparison tool and physical acceptance sequence. A passing identity comparison is not proof of device delivery and does not guarantee zero downtime.
