# Installed Wallet continuity acceptance

Status for this package: **physical iPhone and Android checks pending; public deployment pending**. Local fixture tests cannot certify an installed card. Never delete/reinstall the test card to make a failed continuity test appear successful.

## Read-only evidence helper

`scripts/wallet_continuity.py` uses the existing production configuration, a read-only PostgreSQL transaction and read-only SQLite. It never creates cards, changes balances, rotates credentials, migrates data, switches releases or edits the identity seal. The configuration must already point to stable HTTPS origins and persistent data outside the checkout. Do not send the configuration or keys in a support archive.

Use the existing private production configuration path in place of `CONFIG_PATH`, and an existing owner-only directory (mode 700) in place of `EVIDENCE_DIR`. Output files are created once with mode 600; choose new filenames for each run.

```bash
python3 scripts/wallet_continuity.py capture --config CONFIG_PATH --output EVIDENCE_DIR/before.json
# Perform the separately reviewed server update, then the device checks below.
python3 scripts/wallet_continuity.py capture --config CONFIG_PATH --output EVIDENCE_DIR/after.json
python3 scripts/wallet_continuity.py compare --before EVIDENCE_DIR/before.json --after EVIDENCE_DIR/after.json --output EVIDENCE_DIR/comparison.json
```

The comparison checks stable configuration fingerprints, business-to-tenant associations, existing pass identifiers/authentication fingerprints, Apple device registrations, nondecreasing member revisions/update tags and ledger count. It requires existing cards and a changed, matching public release. Failed outbox records or delivery errors require review. Normal newly created cards are allowed. Outputs contain fingerprints, counts and status, not document numbers, tokens or push keys.

`IDENTITY_PASS_DEVICE_TEST_PENDING` means only those comparisons passed. Ledger count is not a full accounting audit; a fingerprint does not demonstrate a provider push or an on-screen refresh. Pending queue work must be observed until it drains, and device results must be recorded separately. A legitimate customer-initiated removal during the test can require explaining a registration difference; never suppress the check to manufacture PASS.

## Physical acceptance sequence

Use a dedicated, authorized test business with an iPhone and an Android phone, each holding a card installed **before** the update. Record the actual server release, UTC timestamps, card reference, balance, promotion and receipt references in private evidence. Avoid customer identity details in screenshots.

| Stage | Required observation on both devices |
|---|---|
| Before update | Open the existing card. From an authorized cashier, record a purchase and redeem an eligible reward. Confirm receipts, expected balances and card updates. |
| Server update | Preserve original public domains, pass type/team/issuer IDs, serials, data keys, database, device registrations and persistent storage. Deploy only through the rehearsed production transition. |
| After update | Open the same installed card without reinstalling it. Repeat purchase and redemption, confirm expected balances and the updated promotion/state, then verify later refresh works too. |
| Cashier boundary | Assign a branch and purchases/redemption, use the collaborator's own login, verify forbidden design/promotion changes, revoke access, and confirm the already-open session can no longer mutate data. |
| Recovery | Exercise the rehearsed compatible release rollback on a replica. Keep transactions, files and keys intact; do not restore an obsolete database over later operations. |

Capture the second snapshot and compare. Record iPhone and Android as PASS only with actual observed refresh evidence for each. Record any delayed/failed refresh and provider delivery error as pending or failed. Do not promise that installed cards can be remotely removed from every customer device.

## Backups before production

The production backup now bundles a coherent `agency.sqlite`, the immutable uploaded files referenced by it, and the existing native database backup. `verify-backup` checks upload names, sizes and hashes as well as the existing backup checks. It does not perform a full restore rehearsal; restore a copy to an isolated environment and verify cards, history, comments and file playback there before releasing to operating businesses. A backup predating file uploads is accepted only when its database references no uploaded files.

The new portal requires SQLite11. A pre-existing SQLite10 production seal will reject the new SQL inventory until an explicit identity-preserving transition is reviewed. This updater deliberately does not bypass that protection. Native Wallet PostgreSQL V017 and representation34 are unchanged.
