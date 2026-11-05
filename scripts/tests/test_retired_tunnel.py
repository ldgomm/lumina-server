import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('retired_tunnel_tests', SCRIPTS / 'wallet_local.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

OLD = 'https://old-connection.trycloudflare.com'
NEW = 'https://new-connection.trycloudflare.com'


class RetiredTunnelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'project'
        self.root.mkdir()
        w.staging.init_config(self.root)
        self.wallet = w.initialize(self.root)
        w.update_env(self.root / '.env.wallet', {'PUBLIC_BASE_URL': OLD})
        self.runner = w.LocalWallet(self.root)
        self.runner.state.update(origin=OLD, mode='quick', active=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_latest_connection_event_controls_retired_detection(self):
        connected = 'INF Registered tunnel connection connIndex=0'
        gone = 'ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"'
        self.assertTrue(w.quick_tunnel_retired(connected + '\n' + gone))
        self.assertFalse(w.quick_tunnel_retired(gone + '\n' + connected))
        self.assertTrue(w.quick_tunnel_retired(gone))
        self.assertFalse(w.quick_tunnel_retired('DNS resolution failed\nconnection timeout'))

    def test_running_container_with_old_url_is_rejected_when_identity_was_discarded(self):
        def capture(label, command, timeout=15):
            if label == 'tunnel_container': return 0, 'a' * 64
            if label == 'tunnel_state': return 0, 'running 2026-11-04T20:38:25.729248293Z 0'
            if label == 'tunnel_runtime': return 0, OLD + '\nRegistered tunnel connection\nUnauthorized: Tunnel not found'
            raise AssertionError(label)
        with patch.object(self.runner, 'capture', side_effect=capture):
            with self.assertRaises(w.QuickTunnelRetired): self.runner.quick_origin(attempts=1)
        self.assertFalse(json.loads(self.runner.state_path.read_text())['active'])
        self.assertEqual('QUICK_TUNNEL_NOT_FOUND', self.runner.report['tunnel_issue'])

    def test_recovery_preserves_a_healthy_tunnel_even_with_renewal_requested(self):
        with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', return_value=OLD):
            self.assertEqual(OLD, self.runner.start_quick_tunnel(True, 1))
        self.assertEqual(1, run.call_count)
        self.assertNotIn('--force-recreate', run.call_args.args)

    def test_issued_cards_require_explicit_url_migration_before_recreation(self):
        with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', side_effect=w.QuickTunnelRetired('retired')):
            with self.assertRaisesRegex(RuntimeError, '--renew-test-url'):
                self.runner.start_quick_tunnel(False, 1)
        self.assertEqual(1, run.call_count)
        self.assertNotIn('--force-recreate', run.call_args.args)

    def test_explicit_recovery_only_recreates_tunnel_once(self):
        with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', side_effect=[w.QuickTunnelRetired('retired'), NEW]):
            self.assertEqual(NEW, self.runner.start_quick_tunnel(True, 1))
        self.assertEqual(2, run.call_count)
        args = run.call_args.args
        self.assertEqual(('tunnel_recreate', 'up', '-d', '--no-deps', '--force-recreate', w.TUNNEL), args)
        self.assertEqual(1, self.runner.report['tunnel_recovery']['recreate_attempts'])
        self.assertNotIn('loyalty-db', args)
        self.assertNotIn('loyalty-server', args)

    def test_no_issued_cards_allow_replacing_discarded_tunnel_without_migration(self):
        with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', side_effect=[w.QuickTunnelRetired('retired'), NEW]):
            self.assertEqual(NEW, self.runner.start_quick_tunnel(False, 0))
        self.assertEqual(2, run.call_count)

    def test_second_failed_tunnel_does_not_cause_recreation_loop(self):
        with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', side_effect=w.QuickTunnelRetired('retired')) as origin:
            with self.assertRaises(w.QuickTunnelRetired): self.runner.start_quick_tunnel(True, 1)
        self.assertEqual(2, run.call_count)
        self.assertEqual(2, origin.call_count)

    def test_dns_or_tls_failure_never_recreates_a_tunnel(self):
        for message in ('DNS_RESOLUTION_FAILED', 'TLS_CERTIFICATE_VERIFY_FAILED', 'CONNECTION_FAILED'):
            with patch.object(self.runner, 'run') as run, patch.object(self.runner, 'quick_origin', side_effect=RuntimeError(message)):
                with self.assertRaisesRegex(RuntimeError, message): self.runner.start_quick_tunnel(True, 1)
            self.assertEqual(1, run.call_count)

    def start(self, renew=True, origin=NEW, probe_failure=False, mode='quick'):
        w.update_env(self.root / '.env.wallet', {'WALLET_TUNNEL_MODE': mode})
        if mode != 'quick': self.runner.state['mode'] = mode
        def probe(phase, url, maximum_seconds=120):
            if probe_failure and phase == 'public_https': raise RuntimeError('DNS_RESOLUTION_FAILED')
        with patch.object(self.runner, 'database_state', return_value={'hasKey': True, 'passes': 1}), patch.object(w, 'copy_material'), patch.object(self.runner, 'run') as run, patch.object(self.runner, 'start_quick_tunnel', return_value=origin) as quick, patch.object(self.runner, 'check_probe', side_effect=probe), patch.object(self.runner.runner, 'api', return_value={'configuration': {}}), patch.object(w, 'verify_gateway', return_value=22), patch.object(w, 'request', return_value=(401, b'')), patch.object(w.webbrowser, 'open'):
            result = self.runner.start(renew)
        return result, run, quick

    def test_verified_new_url_keeps_keys_and_records_phone_step_pending(self):
        result, run, _ = self.start()
        wallet = w.read_wallet(self.root / '.env.wallet')
        self.assertEqual(self.wallet['WALLET_DATA_KEY'], wallet['WALLET_DATA_KEY'])
        self.assertEqual(NEW, wallet['PUBLIC_BASE_URL'])
        self.assertTrue(result['tls_verified'])
        self.assertEqual('SAVE_SAME_PASS_ON_PHONE', result['pass_refresh']['action'])
        self.assertFalse(result['pass_refresh']['device_verified'])
        self.assertEqual(OLD, result['pass_refresh']['previous_origin'])
        self.assertIn('wallet_server_start', [x.args[0] for x in run.call_args_list])
        self.assertEqual(result['pass_refresh'], json.loads(self.runner.state_path.read_text())['pass_refresh_pending'])

    def test_unverified_new_url_does_not_replace_configuration_or_activate_server(self):
        with self.assertRaisesRegex(RuntimeError, 'DNS_RESOLUTION_FAILED'): self.start(probe_failure=True)
        self.assertEqual(OLD, w.read_wallet(self.root / '.env.wallet')['PUBLIC_BASE_URL'])
        self.assertNotIn('pass_refresh', self.runner.report)
        self.assertNotIn('tls_verified', self.runner.report)

    def test_repeated_success_does_not_claim_phone_already_updated(self):
        first, _, _ = self.start()
        second, _, _ = self.start()
        self.assertEqual(first['pass_refresh'], second['pass_refresh'])
        self.assertFalse(second['pass_refresh']['device_verified'])

    def test_unknown_previous_url_with_issued_cards_requires_migration(self):
        self.runner.state.pop('origin')
        w.update_env(self.root / '.env.wallet', {'PUBLIC_BASE_URL': ''})
        with self.assertRaisesRegex(RuntimeError, '--renew-test-url'): self.start(renew=False)
        self.assertEqual('', w.read_wallet(self.root / '.env.wallet')['PUBLIC_BASE_URL'])

    def test_named_and_external_modes_do_not_recreate_quick_tunnel(self):
        for mode in ('named', 'external'):
            material = self.runner.folder / 'material'
            material.mkdir(exist_ok=True)
            (material / 'tunnel.token').write_text('x' * 60)
            result, run, quick = self.start(mode=mode, origin=OLD)
            quick.assert_not_called()
            self.assertEqual(OLD, result['origin'])
            self.assertNotIn('tunnel_recreate', [x.args[0] for x in run.call_args_list])

    def test_retired_diagnostic_does_not_report_historical_connection_as_live(self):
        self.runner.write_overlay(w.read_wallet(self.root / '.env.wallet'))
        with patch.object(self.runner, 'capture', return_value=(0, 'Registered tunnel connection\nUnauthorized: Tunnel not found')):
            self.runner.diagnostics()
        self.assertIn('QUICK_TUNNEL_NOT_FOUND', self.runner.report['tunnel_log_signals'])
        self.assertNotIn('TUNNEL_CONNECTION_REGISTERED', self.runner.report['tunnel_log_signals'])

    def test_private_guide_has_connection_steps_and_no_secrets(self):
        result, _, _ = self.start()
        guide = (self.runner.folder / 'guide.html').read_text()
        self.assertIn('<section  class="connection-repair">', guide)
        self.assertIn('La tarjeta no actualiza: reparar conexión', guide)
        self.assertIn('Crear enlace temporal', guide)
        self.assertNotIn(self.wallet['WALLET_DATA_KEY'], guide)
        self.assertNotIn('{{', guide)
        self.assertFalse(result['pass_refresh']['device_verified'])
