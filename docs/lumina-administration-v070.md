# Business and team administration — Lúmina v031 / Loyalty v070

## Scope and navigation

Based on the installed v030/v069 checkpoint, commit `824e6658ec03dfcb22a792a56c32d684088dc6bd`. The agency can now manage business status and assist with its collaborators through dedicated administration routes. Every operation keeps the agency account as its real actor; it never logs in as the owner.

- **Clientes → Administrar**: activate, pause, suspend, close, delete and restore a business.
- **Equipos y roles → business → person**: add collaborators, update assigned identity/contact, issue activation codes, set service and cashier permissions, suspend, reactivate, delete and restore.
- Both business cards and business administration expose a direct **Equipo y permisos** link. A person's **Administrar acceso** shortcut opens the access controls without searching through the permissions editor.
- Owner and agency use the same team editor, with one Wallet section, branch selection and a saved-access summary. Collaborators cannot administer the team. Agency consultation of requests remains read-only; these new powers do not authorize owner purchases, approvals, orders or consent.

## Lifecycle behavior

| Operation | Result | Recovery |
| --- | --- | --- |
| Pause or suspend business | New requests, purchases and redemptions are blocked. Native Wallet receives the existing suspension operation. Existing agreements and charges continue. | Explicit activation after native confirmation. |
| Close business | Blocks services and stops future native Wallet recurring charges. Existing debt/history remain. | Explicit activation. |
| Delete business | Recoverable removal from the normal directory, local service block, session/code revocation and native CLOSED synchronization. No accounts, passes or balances are physically deleted. | Filter **Eliminados**, restore the same business/tenant. Restoration does not revive old sessions or invitations. |
| Suspend collaborator | Closes sessions, invalidates invitations and blocks all Lúmina/Wallet proxy access. Retains password, assigned tasks and branch. | Reactivate with the same password; if never activated, issue a new activation code. |
| Delete collaborator | Closes sessions, invalidates password/codes and hides the person. Blocks and withdraws cashier access. Identity/history are retained. | Filter **Eliminado**, restore, then issue a new activation code. |

Business and collaborator status changes require a reason, confirmation and the current revision. Deletion additionally requires the exact name. The activity log records the real agency/owner account. Changed or stale forms cannot overwrite a more recent decision.

Suspension preserves the collaborator's sealed native cashier credential in private server storage. It cannot be obtained or used through a suspended Lúmina account. Every proxy request revalidates active account, current session, branch, scope and company state. Deletion/desactivation also withdraws the native credential. If Wallet is unavailable, local access remains blocked and the page offers an explicit withdrawal retry. No credential is placed in the HTML or browser storage.

Business changes use the durable existing outbox. Provider failure keeps the local block and a visible pending status; retry reuses the command. Reactivation/restoration is published only after native acknowledgement. Installed cards keep their identifiers and balances. Apple/Google control refresh timing on the phone: server blocking does not promise an instant physical removal of the card.

## Assigned identity and existing accounts

Both the owner and an authorized agency administrator must assign the collaborator's validated cedula and telephone. Activation requires that same cedula and normalized phone plus the single-use invitation. A collaborator cannot replace those assignments. Existing email administrators retain `/legacy-login` and the migration to cedula on the same account. No identity is inferred from another person's RUC.

## Persistence and production

SQLite migration `012_administration.sql` adds archive/suspension metadata and the business command operation. Existing migrations are unchanged. The development migration makes a private backup and preserves existing rows, sessions, grants and closed-business states. PostgreSQL stays V017 and Wallet representation stays 34. There are no Kotlin/native Wallet source changes, certificate/key replacements, new tenant IDs, pass reissues or balance rewrites.

Production now requires SQLite12. This development installer deliberately refuses a production profile/identity. Use the established planned migration, verified backup and deployment workflow for production, and retain stable databases, provider credentials, domains and private files. Do not roll back to an unmodified schema11-only release or restore an older database over new transactions. No production deployment or physical iPhone/Android continuity verification is claimed by this update.

## Installation

Keep Docker Desktop running. Stop the old local Lúmina terminal with Control+C and run:

```bash
bash ~/Downloads/lumina_digital_administration_v031.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--project PATH` selects another development checkout; `--check` validates compatibility without installing. `--iniciar` remains a command-compatible alias.

The updater validates the exact baseline, tests the proposed portal in isolation, applies reversible source changes, then runs the native checkpoint. Only passing build/unit, PostgreSQL and Docker gates create a local commit; no push occurs. Existing source conflicts, symlinks and production profiles are blocked. A failure restores only the installer's unchanged edits, leaving unrelated concurrent work alone.

Terminal output is `RESULTADO=...` and, only after confirmed startup, `Lúmina Digital disponible en http://127.0.0.1:8099`. The ASCII shell wrapper runs Python 3 in UTF-8 and verifies its compressed payload. Source and test evidence are retained in Downloads.

## Validation

- 37 portal suites / 429 tests pass, with no skips, cancellations or todos. The 16 new contracts exercise agency operations without impersonation, assigned identity, real cashier purchase/redemption, suspend/resume/delete/restore, foreign-company and owner targets, CSRF/revisions, provider outage/retry, revoked administrative sessions and additive migration preservation.
- 185 Python workflow/production contracts pass. 27 DOM suites pass. Fixture browser review covers business controls, the shared team editor and access controls at desktop and 320/390-pixel widths.
- The installer must still pass the Mac's 312 native unit/HTTP tests, 347 PostgreSQL tests and local Docker/gateway checks before committing. Those checks are not replaced by the portal/browser tests.
- Installed pass checks on physical iPhone/Android remain pending. Follow `wallet-continuity-v068.md`; never remove/reissue an existing customer's pass to simulate continuity.
