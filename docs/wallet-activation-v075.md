# Wallet activation v075 / v075r1

## v075r1 checkpoint retry

The production failure was an internal Python subprocess timeout after 110 seconds; increasing only the outer checkpoint timeout did not change it. All 42 Node suites now run sequentially with a 900-second deadline and 960 seconds in the outer checkpoint. Timeout/interruption preserves partial TAP output and terminates the isolated Node process group. Exact 510-test totals and zero failures/cancellations/skips/todos are still mandatory. Python regression checks total 189, including real timeout and process cleanup exercises.

The retry accepts the original c821 baseline and the exact previously delivered v075 file hashes. It reuses the existing isolated worktree without discarding unknown edits. The failing checkpoint stage and report location are recorded explicitly. Production is only promoted after the original native, PostgreSQL, Docker, backup, readiness and HTTPS checks pass.

## Behaviour

The owner selects an agency-published Wallet offer in `/plans` or `/plans/wallet`, reviews the exact price and period, then explicitly accepts. Priced monthly Wallet orders activate immediately, including monthly combinations with other services. No agency approval or company verification is required for this owner action. Orders without a price or a defined one-off delivery period continue through quotation.

`/wallet` opens the operating workspace when active; otherwise it leads to the catalogue. `/services` uses the same activation entry point. Existing selections can be completed from the Wallet catalogue. A previously accepted current agreement can resume an interrupted service activation with an explicit POST.

The old fixed-price subscription chooser is retired. New catalogue purchases do not add the former $4.99/$50 subscription or a second Wallet fee. Previously accepted subscriptions retain their exact terms, history and cancellation control. Catalogue monthly periods continue to require an explicit renewal; this change does not silently opt an owner into recurring billing or debit a bank card. Catalogue contracts are distinct from recorded invoices/payments.

## Integrity

Activation is owner-only, CSRF-protected, lifecycle-gated and serialized per business. The reviewed offer hash and order revision are checked before and after provider preparation. Native provisioning retains the stable company identity across lost responses. Consent, contracts and service activation commit in one SQLite transaction. Duplicate clicks do not create duplicate agreements; overlapping Wallet periods are rejected. No account, tenant, card, balance, key, certificate, domain or SQL migration is replaced. SQLite12, PostgreSQL V017 and Wallet representation34 are unchanged.

## Evidence

v075r1 local checks: all 42 portal files / 510 tests passed sequentially in 289.4 seconds, with zero failed, cancelled, skipped or todo tests. All 189 Python workflow checks and 29 installer checks passed, including applying the retry to both the c821 baseline and exact failed v075 worktree, preserving concurrent edits and repeating the installer idempotently. The original v075 revision also passed 31 DOM suites; no UI code changes were added by r1.

The new Chromium journey is included in `scripts/ui/wallet-checkout.spec.mjs`; this environment prevented Chromium from opening its local socket, so a rendered-browser PASS is not claimed. Native compilation, PostgreSQL and Docker gates must pass in the deployment environment. Physical Apple/Google Wallet continuity is still pending. Local results do not mean production has been updated.

## Git delivery and deployment

Current local validation: all 510 portal tests passed across 42 files in 290.1 seconds, with no failures, cancellations, skips or todo tests. All 213 Python workflow checks and all 31 DOM suites passed. The Python checks exercise a real Gradle-wrapper subprocess from an unrelated working directory, private build diagnostics, exact-commit verification, failed-gate isolation and portal handover recovery. Native/PostgreSQL/Docker checks and public deployment remain separate server gates.

Publish the source to GitHub as an ordinary commit based on c821c03257b3c6003ca350157aab42bba1d2d327. Production consumes this exact commit; it does not patch files, generate an installer payload, create another commit or push anything. The old downloadable v075/v075r1 installers are no longer the deployment entry point.

Run `python3 /opt/lumina/source/scripts/deploy.py --commit <full-sha>` after a clean fast-forward of `/opt/lumina/source` to the published commit. This command uses the existing `/etc/lumina/production.json`, `/var/lib/lumina/runtime/active.json` and continuity seal. It is an update of an initialized installation, not a server bootstrap. Logs are private under `/root/lumina-deploy/<full-sha>/`.

The full checkpoint uses `--verify-only`: it runs the same portal, Python, native, PostgreSQL, Docker and gateway checks, then records the verified existing commit and tested source manifest. It cannot create or stage a commit. Failed gates leave the current release serving traffic. Backups and an isolated restoration test are mandatory before promotion. Source publication and partial local checks do not mean those server gates passed.

Packaging now executes Gradle with the source checkout as its working directory. Invoking an absolute wrapper from `/root` previously left Gradle looking for a project in `/root`. Packaging preserves build stdout/stderr in `/var/lib/lumina/runtime/package-build.log`, mode 600, while allowing only build-related environment variables. The deployment calls packaging directly, so its traceback and precise stage are retained instead of a generic `COMMAND_FAILED_PYTHON3` wrapper error.

An inactive slot can be reused while preserving its previous environment file privately. The candidate native server must be healthy first. The former portal is drained before the candidate portal starts, including its background lifecycle retries. Readiness must then pass before the gateway switches. This can cause a brief portal interruption; native public Wallet remains available during the portal drain. A failed candidate startup resumes the previous portal process without restoring data. No database rollback, resealing or deletion is performed. Re-running an already promoted exact commit verifies public HTTPS rather than creating another release.

Deployment success is reported only after public TLS, release identity and private-route checks pass. It continues to report physical Wallet device verification as pending.
