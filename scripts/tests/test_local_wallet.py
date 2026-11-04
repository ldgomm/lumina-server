import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wallet_local_tests', SCRIPTS / 'wallet_local.py')
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)


class LocalWalletTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name) / 'project'; self.root.mkdir()
        self.values = w.staging.init_config(self.root)[0]
    def tearDown(self):
        self.temp.cleanup()
    def test_https_origin_rejects_loopback_credentials_query_and_paths(self):
        self.assertEqual('https://wallet.example.org', w.public_origin('https://wallet.example.org/'))
        for value in ('http://example.org', 'https://localhost', 'https://127.0.0.1', 'https://192.168.1.5', 'https://[::1]', 'https://example.org/x', 'https://a:b@example.org', 'https://example.org?key=x', 'https://example.org#x', 'https://wallet.example.com', 'https://example.org:1234', 'https://test.local'):
            with self.assertRaises(RuntimeError, msg=value): w.public_origin(value)
    def test_initialization_preserves_existing_encryption_key_and_manual_values(self):
        first = w.initialize(self.root); w.update_env(self.root / '.env.wallet', {'APPLE_PASS_TYPE_ID': 'pass.com.user.card'})
        again = w.initialize(self.root, True)
        self.assertEqual(first['WALLET_DATA_KEY'], again['WALLET_DATA_KEY']); self.assertEqual('pass.com.user.card', again['APPLE_PASS_TYPE_ID'])
        self.assertEqual(0o600, (self.root / '.env.wallet').stat().st_mode & 0o777)
    def test_lost_configuration_with_stored_wallet_key_is_not_recreated(self):
        with self.assertRaises(RuntimeError): w.initialize(self.root, True)
        self.assertFalse((self.root / '.env.wallet').exists())
    def test_env_updates_preserve_comments_other_values_and_reject_duplicate_keys(self):
        file = self.root / '.env.wallet'; file.write_text('# Mine\nOTHER=keep\nPUBLIC_BASE_URL=old\n')
        w.update_env(file, {'PUBLIC_BASE_URL': 'new'})
        self.assertEqual('# Mine\nOTHER=keep\nPUBLIC_BASE_URL=new\n', file.read_text())
        file.write_text('A=1\nA=2\n')
        with self.assertRaises(RuntimeError): w.update_env(file, {'A': '3'})
    def test_compose_preserves_dollars_and_uses_private_volume_and_loopback_gateway(self):
        wallet = dict(w.initialize(self.root), APPLE_P12_PASSWORD=' a$word${text} ', PUBLIC_BASE_URL='https://wallet.example.org')
        w.update_env(self.root / '.env.wallet', {'APPLE_P12_PASSWORD': wallet['APPLE_P12_PASSWORD']})
        self.assertEqual(wallet['APPLE_P12_PASSWORD'], w.read_wallet(self.root / '.env.wallet')['APPLE_P12_PASSWORD'])
        doc = w.compose_document(self.root, self.values, wallet, wallet['PUBLIC_BASE_URL'])
        server = doc['services']['loyalty-server']
        self.assertEqual(' a$$word$${text} ', server['environment']['APPLE_P12_PASSWORD'])
        self.assertEqual(['loyalty-wallet-material:/wallet-material:ro'], server['volumes'])
        self.assertEqual(['127.0.0.1:8098:8080'], doc['services'][w.GATEWAY]['ports'])
        self.assertNotIn('ports', doc['services'][w.TUNNEL]); self.assertNotIn('DATABASE_URL', server['environment'])
        self.assertEqual('http://localhost:8097', server['environment']['LOYALTY_LOCAL_BROWSER_ORIGIN'])
    def test_gateway_port_cannot_replace_the_local_server_port(self):
        with self.assertRaises(RuntimeError): w.compose_document(self.root, self.values, {'WALLET_GATEWAY_PORT': '8097'})
    def test_named_tunnel_passes_only_token_file_and_external_mode_has_no_tunnel(self):
        named = w.compose_document(self.root, self.values, {}, mode='named')
        cmd = named['services'][w.TUNNEL]['command']; self.assertIn('--token-file', cmd); self.assertNotIn('--token', cmd)
        self.assertNotIn(w.TUNNEL, w.compose_document(self.root, self.values, {}, mode='external')['services'])
    def test_invalid_google_material_is_rejected_before_any_copy(self):
        external = Path(self.temp.name) / 'google.json'; external.write_text('{"type":"authorized_user"}')
        with self.assertRaises(RuntimeError): w.copy_material(self.root, {'GOOGLE_WALLET_ENABLED': 'true', 'GOOGLE_WALLET_SERVICE_ACCOUNT_PATH': str(external)})
        self.assertFalse((self.root / w.PRIVATE / 'material/google.json').exists())
    def test_private_google_material_is_copied_without_entering_code_and_remains_private(self):
        external = Path(self.temp.name) / 'google.json'; external.write_text(json.dumps({'type': 'service_account', 'private_key': 'private-sentinel', 'private_key_id': 'id', 'client_email': 'test@example.org'}))
        wallet = {'GOOGLE_WALLET_ENABLED': 'true', 'GOOGLE_WALLET_SERVICE_ACCOUNT_PATH': str(external)}
        w.copy_material(self.root, wallet)
        copy = self.root / w.PRIVATE / 'material/google.json'; self.assertEqual(external.read_bytes(), copy.read_bytes()); self.assertEqual(0o600, copy.stat().st_mode & 0o777)
        code = self.root / 'src/google.json'; code.parent.mkdir(); shutil.copy2(external, code)
        with self.assertRaises(RuntimeError): w.copy_material(self.root, dict(wallet, GOOGLE_WALLET_SERVICE_ACCOUNT_PATH=str(code)))
    def test_private_runtime_and_guide_never_enter_evidence(self):
        c = w.sibling('checkpoint')
        for file in ('.env.wallet', '.local-wallet/compose.json', '.local-wallet/material/google.json', '.local-wallet/guide.html', '.local-wallet/state.json'):
            self.assertFalse(c.allowed(file), file)
    def test_guide_contains_no_credentials_or_seed_passwords(self):
        file = w.write_guide(self.root, self.values, {'status': 'HTTPS_PASS_WALLET_CREDENTIALS_PENDING', 'origin': 'https://wallet.example.org'})
        data = file.read_text()
        for key in w.staging.SECRET_NAMES: self.assertNotIn(self.values[key], data)
        self.assertNotIn('{{', data); self.assertIn('--wallet-only --configure', data)
    def test_redirects_are_not_followed_when_probing_a_public_origin(self):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.path); self.send_response(302); self.send_header('Location', '/elsewhere'); self.end_headers()
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            status, _ = w.request('http://127.0.0.1:' + str(server.server_port) + '/probe')
            self.assertEqual(302, status); self.assertEqual(['/probe'], calls)
        finally: server.shutdown(); server.server_close(); thread.join()
    def test_public_probe_never_accepts_an_unrelated_https_site(self):
        with patch.object(w, 'request', return_value=(200, b'{"service":"another"}')):
            with self.assertRaises(RuntimeError): w.probe('https://wallet.example.org', 'a' * 32, attempts=1)
        with patch.object(w, 'request', return_value=(200, json.dumps({'service': 'loyalty-wallet', 'probe': 'a' * 32}).encode())):
            w.probe('https://wallet.example.org', 'a' * 32, attempts=1)
    def test_bad_material_symlinks_are_rejected(self):
        folder = self.root / w.PRIVATE; folder.symlink_to(Path(self.temp.name))
        with self.assertRaises(RuntimeError): w.private_directory(self.root)


if __name__ == '__main__': unittest.main()
