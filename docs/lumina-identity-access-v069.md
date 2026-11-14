# Identity access — Lúmina v030 / Loyalty v069

## Scope

This update uses the installed v029/v068 snapshot at commit `1bd85376daf54a23f418cd431503451f9d764b38`. It changes collaborator activation and makes the existing email-to-cedula migration visible. It does not create a replacement administrator or infer anyone's identity from a business RUC.

## Collaborators

1. The owner enters a name, validated cedula and telephone in **Equipo y permisos → Añadir persona**. Both identity and phone are required.
2. The person activates using the invitation code, that same cedula and telephone, and a new password.
3. Phone formatting is normalized before comparison: `099 123 4567` and `+593991234567` refer to the same Ecuadorian number. A different number or cedula is rejected without consuming the code or overwriting assigned data.
4. Activation sets the password on the existing collaborator account. Company, role, assigned grants, Wallet branch and balances are preserved. The invitation is single-use; concurrent activation, revocation or changed assignments cannot revive stale access.
5. The owner corrects identity/contact under **Equipo y permisos → Persona → Datos y acceso**. Collaborators see their assigned phone in **Mi cuenta**, with no self-edit action. Direct server requests enforce the same policy.

Historical pending invitations with no assigned cedula or phone require the owner to complete the data and share a current code. Changing cedula invalidates previous codes and sessions; generate a new code after that correction. Existing active accounts retain access even if a historical contact is missing. Owners can complete it without re-creating the person. A collaborator with no cedula cannot self-assign one through the administrator migration endpoint.

This validates document format/checksum and matches the owner's assignment. It is not government identity verification or an SMS possession check.

## Existing administrator with email

- If signed in, open **Mi cuenta → Ingresa con tu cédula**.
- If signed out, select **Ya tenía una cuenta con correo** on `/login`, or open `/legacy-login`.
- Authenticate with the existing email and password. Enter the administrator's own cedula and confirm the current password on `/account/identity`.
- The same account keeps its ID, password, role and business/Wallet associations. No new agency setup is needed.
- Other sessions and old activation codes for that account close after the successful identity update; the current browser receives a new session. Future login uses cedula and the same password. Legacy email login is then disabled for that account.
- Agency login opens `/dashboard`, including historical accounts with an incomplete business welcome flag. Owners and collaborators retain their own welcome flow.

Email migration also remains available to an existing business owner, including their business RUC and WhatsApp. Never use a client's RUC as the administrator's identity.

## Installation

Download `lumina_digital_identity_v030.sh`. Stop the old local Lúmina terminal with Control+C, keep Docker Desktop running, then execute:

```bash
bash ~/Downloads/lumina_digital_identity_v030.sh --start
```

The default project is `/Users/ldgomm/Developer/pdc/sales/loyalty`. `--project PATH` selects another development checkout; `--check` tests compatibility without installing. Historical Spanish flags remain accepted only for command compatibility.

The installer validates exact changed source files, tests the proposed portal in isolation, then runs the native checkpoint and Docker gates. Only a passing checkpoint creates a local commit. It never pushes. It retains evidence in Downloads and blocks a production checkout, source conflicts and symlinks. A failed build/test restores only this installer's unchanged edits; it does not overwrite unrelated concurrent work.

Terminal output remains `RESULTADO=...`, followed by `Lúmina Digital disponible en http://127.0.0.1:8099` only after verified startup. The ASCII wrapper selects Python 3 with UTF-8 and verifies the compressed payload.

## Validation and continuity

- Portal: 36 suites, 413 tests, zero skipped/cancelled/todo. The 16 new contracts cover assigned cedula/phone, invalid and conflicting inputs, old invitations, owner correction, races, duplicate activation, cross-business access and administrator migration preserving linked records.
- Python: 185 workflow/production contracts. Browser DOM: 26 suites. The entry suite checks required fields, accessible controls, a visible legacy entry and administrator identity fields.
- On the Mac, the installer still requires 312 native unit/HTTP tests, 347 PostgreSQL tests, Docker staging and the gateway before committing. These gates are not replaced by portal/DOM results.
- No native Wallet code, SQL migration, pass serial, tenant mapping, certificate, provider key, balance, membership or payment behavior is changed. SQLite11, PostgreSQLV017 and Wallet representation34 remain unchanged.
- This release does not claim physical iPhone/Android continuity verification or a public deployment. Retain the installed pass device checks described in `wallet-continuity-v068.md`.
