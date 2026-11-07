import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stable_https_tests', SCRIPTS / 'wallet_local.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
OLD = 'https://old-connection.trycloudflare.com'
FIXED = 'https://wallet.mystore.org'
TOKEN = 'synthetic-test-token-' + 'a' * 70


class StableHttpsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'project'
        self.root.mkdir()
        self.values = w.staging.init_config(self.root)[0]
        w.initialize(self.root)
        w.update_env(self.root / '.env.wallet', {'PUBLIC_BASE_URL': OLD, 'APPLE_TEAM_ID': 'PRESERVE', 'GOOGLE_WALLET_ISSUER_ID': '123456'})
        self.before = (self.root / '.env.wallet').read_bytes()

    def tearDown(self):
        self.temp.cleanup()

    def configure(self, origin=FIXED, token=TOKEN, renew=True, passes=1):
        output = io.StringIO()
        with patch.object(w.sys.stdin, 'isatty', return_value=True), patch.object(w.LocalWallet, 'database_state', return_value={'hasKey': True, 'passes': passes}), patch('builtins.input', return_value=origin), patch('getpass.getpass', return_value=token), contextlib.redirect_stdout(output):
            w.configure_stable_https(self.root, renew)
        return output.getvalue()

    def test_wizard_preserves_wallet_identity_and_keeps_token_out_of_config_and_output(self):
        output = self.configure()
        before = dict(line.split('=', 1) for line in self.before.decode().splitlines() if line and not line.startswith('#'))
        after = w.read_wallet(self.root / '.env.wallet')
        self.assertEqual(FIXED, after['PUBLIC_BASE_URL'])
        self.assertEqual('named', after['WALLET_TUNNEL_MODE'])
        for key in ('WALLET_DATA_KEY', 'APPLE_TEAM_ID', 'GOOGLE_WALLET_ISSUER_ID'):
            self.assertEqual(before[key], after[key])
        token_path = Path(after['CLOUDFLARE_TUNNEL_TOKEN_PATH'])
        self.assertEqual(TOKEN, token_path.read_text().strip())
        self.assertEqual(0o600, token_path.stat().st_mode & 0o777)
        self.assertNotIn(TOKEN, output)
        self.assertNotIn(TOKEN, (self.root / '.env.wallet').read_text())

    def test_existing_cards_require_explicit_migration_before_any_token_write(self):
        with self.assertRaisesRegex(RuntimeError, '--renew-test-url'):
            self.configure(renew=False)
        self.assertEqual(self.before, (self.root / '.env.wallet').read_bytes())
        self.assertFalse((self.root / '.local-wallet/cloudflare-token.txt').exists())

    def test_brand_new_project_can_configure_fixed_domain_without_card_migration(self):
        self.configure(renew=False, passes=0)
        self.assertEqual('named', w.read_wallet(self.root / '.env.wallet')['WALLET_TUNNEL_MODE'])

    def test_same_domain_accepts_hidden_empty_input_to_reuse_private_token(self):
        self.configure()
        self.configure(token='', renew=False)
        self.assertEqual(TOKEN, (self.root / '.local-wallet/cloudflare-token.txt').read_text().strip())

    def test_invalid_origins_leave_existing_connection_untouched(self):
        for origin in (OLD, 'https://trycloudflare.com', 'http://wallet.mystore.org', 'https://user:secret@wallet.mystore.org', 'https://wallet.mystore.org/path', 'https://127.0.0.1'):
            with self.subTest(origin=origin), self.assertRaises(RuntimeError):
                self.configure(origin=origin)
            self.assertEqual(self.before, (self.root / '.env.wallet').read_bytes())

    def test_full_install_command_is_rejected_without_echoing_the_token(self):
        with self.assertRaises(RuntimeError) as error:
            self.configure(token='cloudflared tunnel run --token ' + TOKEN)
        self.assertNotIn(TOKEN, str(error.exception))
        self.assertEqual(self.before, (self.root / '.env.wallet').read_bytes())

    def test_missing_token_does_not_change_origin(self):
        with self.assertRaisesRegex(RuntimeError, 'Falta el token'):
            self.configure(token='')
        self.assertEqual(self.before, (self.root / '.env.wallet').read_bytes())

    def test_non_interactive_invocation_cannot_consume_a_token_from_logs(self):
        with patch.object(w.sys.stdin, 'isatty', return_value=False), patch('getpass.getpass') as hidden:
            with self.assertRaisesRegex(RuntimeError, 'terminal interactiva'):
                w.configure_stable_https(self.root, True)
        hidden.assert_not_called()

    def test_symlink_target_is_rejected_without_overwriting_external_file(self):
        folder = w.private_directory(self.root)
        external = Path(self.temp.name) / 'outside.txt'
        external.write_text('keep')
        (folder / 'cloudflare-token.txt').symlink_to(external)
        with self.assertRaisesRegex(RuntimeError, 'enlace'):
            self.configure()
        self.assertEqual('keep', external.read_text())
        self.assertEqual(self.before, (self.root / '.env.wallet').read_bytes())

    def test_named_tunnel_uses_private_token_file_not_command_or_environment_secret(self):
        self.configure()
        wallet = w.read_wallet(self.root / '.env.wallet')
        document = w.compose_document(self.root, self.values, wallet, FIXED, 'named')
        tunnel = document['services'][w.TUNNEL]
        self.assertIn('--token-file', tunnel['command'])
        self.assertNotIn(TOKEN, json.dumps(document))
        self.assertNotIn('--url', tunnel['command'])

    def test_failure_guide_replaces_previous_success_and_escapes_error_text(self):
        folder = w.private_directory(self.root)
        (folder / 'guide.html').write_text('CONEXIÓN RECUPERADA')
        path = w.write_guide(self.root, self.values, {'status': 'HTTPS_SETUP_FAILED', 'tunnel_issue': 'QUICK_TUNNEL_NOT_FOUND', 'error': '<script>bad</script>'})
        guide = path.read_text()
        self.assertNotIn('CONEXIÓN RECUPERADA', guide)
        self.assertIn('CONEXIÓN NO VERIFICADA', guide)
        self.assertIn('&lt;script&gt;', guide)
        self.assertNotIn('<script>', guide)
        self.assertIn('--renew-test-url', guide)
        self.assertNotIn('{{', guide)
        self.assertTrue((folder / 'https-estable.html').exists())

    def test_verified_recovery_still_reports_phone_connection_pending(self):
        runner = w.LocalWallet(self.root)
        runner.state.update(origin=OLD, mode='quick')
        with patch.object(runner, 'database_state', return_value={'hasKey': True, 'passes': 1}), patch.object(w, 'copy_material'), patch.object(runner, 'run'), patch.object(runner, 'start_quick_tunnel', return_value='https://replacement.trycloudflare.com'), patch.object(runner, 'check_probe'), patch.object(runner.runner, 'api', return_value={'configuration': {}}), patch.object(w, 'verify_gateway', return_value=23), patch.object(w, 'request', return_value=(401, b'')), patch.object(w.webbrowser, 'open'):
            result = runner.start(True)
        self.assertEqual('HTTPS_PASS_WALLET_CONNECTION_REFRESH_PENDING', result['status'])
        self.assertFalse(result['pass_refresh']['device_verified'])
        self.assertTrue(result['tls_verified'])
        self.assertEqual('quick', result['mode'])

    def test_token_rotation_restarts_named_connector_only_when_token_changes(self):
        self.configure()
        runner = w.LocalWallet(self.root)
        runner.state.update(origin=FIXED, mode='named')
        w.copy_material(self.root, w.read_wallet(self.root / '.env.wallet'))
        for changed in (True, False):
            with patch.object(runner, 'database_state', return_value={'hasKey': True, 'passes': 1}), patch.object(runner, 'run') as run, patch.object(runner, 'start_quick_tunnel') as quick, patch.object(runner, 'check_probe'), patch.object(runner.runner, 'api', return_value={'configuration': {}}), patch.object(w, 'verify_gateway', return_value=23), patch.object(w, 'request', return_value=(401, b'')), patch.object(w.webbrowser, 'open'):
                result = runner.start(False)
            command = next(call.args for call in run.call_args_list if call.args[0] == 'tunnel_start')
            self.assertEqual(changed, '--force-recreate' in command)
            quick.assert_not_called()
            self.assertEqual(FIXED, result['origin'])
            self.assertFalse(result['temporary'])
            self.assertNotIn('pass_refresh', result)
            self.assertEqual(hashlib.sha256(TOKEN.encode()).hexdigest(), runner.state['tunnel_token_sha256'])

    def test_main_failure_saves_current_guide_result_and_script_without_secrets(self):
        output = Path(self.temp.name) / 'downloads'
        script = Path(self.temp.name) / 'installer.sh'
        script.write_text('#!/bin/bash\n# test only\n')
        with patch.object(w.LocalWallet, 'start', side_effect=RuntimeError('TLS_CERTIFICATE_VERIFY_FAILED')), patch.object(w.LocalWallet, 'diagnostics'), patch.object(w.webbrowser, 'open'):
            code = w.main(['start', '--project', str(self.root), '--output-dir', str(output), '--origin-script', str(script)])
        self.assertEqual(1, code)
        folder = self.root / '.local-wallet'
        self.assertEqual('HTTPS_SETUP_FAILED', json.loads((folder / 'last-result.json').read_text())['status'])
        self.assertIn('TLS_CERTIFICATE_VERIFY_FAILED', (folder / 'guide.html').read_text())
        with zipfile.ZipFile(next(output.glob('*.zip'))) as archive:
            self.assertTrue(any(name.endswith('/installer.sh') for name in archive.namelist()))
            self.assertFalse(any('/.env' in name or '/.local-wallet/' in name for name in archive.namelist()))
        self.assertFalse((self.root / '.loyalty-wallet.lock').exists())

    def test_private_result_write_failure_still_produces_diagnostic_zip(self):
        folder = w.private_directory(self.root)
        outside = Path(self.temp.name) / 'outside.json'
        outside.write_text('keep')
        (folder / 'last-result.json').symlink_to(outside)
        output = Path(self.temp.name) / 'downloads'
        with patch.object(w.LocalWallet, 'start', side_effect=RuntimeError('DNS_RESOLUTION_FAILED')), patch.object(w.LocalWallet, 'diagnostics'), patch.object(w.webbrowser, 'open'):
            self.assertEqual(1, w.main(['start', '--project', str(self.root), '--output-dir', str(output)]))
        self.assertEqual('keep', outside.read_text())
        with zipfile.ZipFile(next(output.glob('*.zip'))) as archive:
            report = json.loads(archive.read(next(name for name in archive.namelist() if name.endswith('/RESULTADO.json'))))
            self.assertEqual('HTTPS_SETUP_FAILED', report['status'])
            self.assertIn('local_result_error', report)
