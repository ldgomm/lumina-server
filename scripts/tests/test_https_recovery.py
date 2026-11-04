import importlib.util
import json
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('https_recovery_tests', SCRIPTS / 'wallet_local.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class HttpsRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'project'
        self.root.mkdir()
        self.values = w.staging.init_config(self.root)[0]
        self.runner = w.LocalWallet(self.root)
        w.TRANSPORT_EVENTS.clear()

    def tearDown(self):
        self.temp.cleanup()

    def test_mac_python_certificate_failure_uses_verified_system_client(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError(ssl.SSLCertVerificationError('missing CA'))
        with patch.object(w.urllib.request, 'build_opener', return_value=opener), patch.object(w.sys, 'platform', 'darwin'), patch.object(w.Path, 'is_file', return_value=True), patch.object(w, 'system_https_request', return_value=(200, b'ok')) as fallback:
            self.assertEqual((200, b'ok'), w.request('https://wallet.example.org/check', 'POST', {'test': True}, {'Origin': 'https://wallet.example.org'}))
        args = fallback.call_args.args
        self.assertEqual('POST', args[1])
        self.assertEqual({'test': True}, json.loads(args[2]))
        self.assertEqual('application/json', args[3]['Content-Type'])
        self.assertEqual(['PYTHON_CA_FAILED_SYSTEM_CURL_TLS_VERIFIED'], w.TRANSPORT_EVENTS)

    def test_connection_failures_do_not_trigger_a_different_tls_client(self):
        for cause in (socket.gaierror(-2, 'name missing'), ConnectionRefusedError('refused'), ssl.SSLError('handshake failure')):
            opener = Mock()
            opener.open.side_effect = urllib.error.URLError(cause)
            with patch.object(w.urllib.request, 'build_opener', return_value=opener), patch.object(w.sys, 'platform', 'darwin'), patch.object(w, 'system_https_request') as fallback:
                with self.assertRaises(urllib.error.URLError):
                    w.request('https://wallet.example.org/check')
                fallback.assert_not_called()

    def test_linux_and_http_do_not_use_mac_tls_fallback(self):
        for platform, url in [('linux', 'https://wallet.example.org/check'), ('darwin', 'http://localhost:8098/check')]:
            opener = Mock()
            opener.open.side_effect = urllib.error.URLError(ssl.SSLCertVerificationError('missing CA'))
            with patch.object(w.urllib.request, 'build_opener', return_value=opener), patch.object(w.sys, 'platform', platform), patch.object(w, 'system_https_request') as fallback:
                with self.assertRaises(urllib.error.URLError):
                    w.request(url)
                fallback.assert_not_called()

    def test_curl_disables_configuration_preserves_paths_and_never_bypasses_tls(self):
        result = subprocess.CompletedProcess([], 0, b'{"ok":true}\n200', b'')
        with patch.object(w.subprocess, 'run', return_value=result) as run:
            self.assertEqual((200, b'{"ok":true}'), w.system_https_request('https://wallet.example.org/join/../platform', 'POST', b'{}', {'Content-Type': 'application/json'}))
        command = run.call_args.args[0]
        self.assertEqual(['/usr/bin/curl', '--disable'], command[:2])
        for flag in ('--path-as-is', '--noproxy', '--proto', '--max-time', '--max-filesize'):
            self.assertIn(flag, command)
        for flag in ('-k', '--insecure', '-L', '--location', '--location-trusted', '--netrc'):
            self.assertNotIn(flag, command)
        self.assertEqual('=https', command[command.index('--proto') + 1])
        self.assertEqual('*', command[command.index('--noproxy') + 1])
        self.assertEqual(b'{}', run.call_args.kwargs['input'])
        self.assertEqual('@-', command[command.index('--data-binary') + 1])

    def test_curl_errors_retain_dns_tls_and_timeout_distinctions(self):
        for value, code in [(6, 'DNS_RESOLUTION_FAILED'), (7, 'CONNECTION_FAILED'), (28, 'CONNECT_TIMEOUT'), (35, 'TLS_HANDSHAKE_FAILED'), (60, 'TLS_CERTIFICATE_VERIFY_FAILED'), (77, 'TLS_CA_FILE_FAILED')]:
            result = subprocess.CompletedProcess([], value, b'\n000', b'specific error')
            with patch.object(w.subprocess, 'run', return_value=result):
                with self.assertRaises(w.HttpsTransportError) as error:
                    w.system_https_request('https://wallet.example.org/')
            self.assertEqual(code, error.exception.transport_code)
            self.assertIn('specific error', str(error.exception))

    def test_curl_timeout_is_bounded_and_a_failed_response_cannot_become_success(self):
        with patch.object(w.subprocess, 'run', side_effect=subprocess.TimeoutExpired('curl', 15)):
            with self.assertRaises(w.HttpsTransportError) as error:
                w.system_https_request('https://wallet.example.org/')
        self.assertEqual('CONNECT_TIMEOUT', error.exception.transport_code)
        for output in (b'200', b'body\n000', b'body\nHTTP 200', b'a' * 2_000_001 + b'\n200'):
            with patch.object(w.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output, b'')):
                with self.assertRaises(w.HttpsTransportError):
                    w.system_https_request('https://wallet.example.org/')

    def test_curl_rejects_injected_headers_credentials_and_non_https(self):
        with patch.object(w.subprocess, 'run') as run:
            for url in ('http://wallet.example.org/', 'https://user:secret@wallet.example.org/'):
                with self.assertRaises(ValueError):
                    w.system_https_request(url)
            with self.assertRaises(ValueError):
                w.system_https_request('https://wallet.example.org/', headers={'Origin': 'https://good\r\nX-Fake: true'})
            run.assert_not_called()

    def test_probe_reports_dns_error_instead_of_discarding_it(self):
        history = []
        with patch.object(w, 'request', side_effect=urllib.error.URLError(socket.gaierror(-2, 'name missing'))):
            with self.assertRaisesRegex(RuntimeError, 'DNS_RESOLUTION_FAILED.*name missing'):
                w.probe('https://wallet.example.org', 'a' * 32, attempts=1, diagnostics=history)
        self.assertEqual('DNS_RESOLUTION_FAILED', history[0]['code'])

    def test_probe_does_not_retry_invalid_certificates(self):
        history = []
        with patch.object(w, 'request', side_effect=urllib.error.URLError(ssl.SSLCertVerificationError('unknown issuer'))) as request, patch.object(w.time, 'sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError, 'TLS_CERTIFICATE_VERIFY_FAILED'):
                w.probe('https://wallet.example.org', 'a' * 32, diagnostics=history)
        self.assertEqual(1, request.call_count)
        sleep.assert_not_called()

    def test_probe_retries_temporary_edge_response_until_nonce_matches(self):
        history = []
        good = json.dumps({'service': 'loyalty-wallet', 'probe': 'a' * 32}).encode()
        with patch.object(w, 'request', side_effect=[(503, b'waiting'), (200, good)]), patch.object(w.time, 'sleep'):
            w.probe('https://wallet.example.org', 'a' * 32, diagnostics=history)
        self.assertEqual(['HTTP_STATUS', 'GATEWAY_VERIFIED'], [x['code'] for x in history])

    def test_probe_retains_cloudflare_error_code_without_storing_page_body(self):
        history = []
        with patch.object(w, 'request', return_value=(530, b'<p>error code: 1033</p><p>private-body-sentinel</p>')):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 530, Cloudflare 1033'):
                w.probe('https://wallet.example.org', 'a' * 32, attempts=1, diagnostics=history)
        self.assertEqual('1033', history[0]['cloudflare_error'])
        self.assertNotIn('private-body-sentinel', json.dumps(history))

    def test_probe_deadline_does_not_turn_into_an_unbounded_wait(self):
        with patch.object(w, 'request', return_value=(503, b'')) as request, patch.object(w.time, 'monotonic', side_effect=[0, 0, 121]), patch.object(w.time, 'sleep') as sleep:
            with self.assertRaises(RuntimeError):
                w.probe('https://wallet.example.org', 'a' * 32, maximum_seconds=120)
        self.assertEqual(1, request.call_count)
        sleep.assert_not_called()

    def test_probe_rejects_another_nonce_and_records_invalid_json(self):
        for body, code in [(b'{"service":"loyalty-wallet","probe":"other"}', 'GATEWAY_IDENTITY_MISMATCH'), (b'not json', 'INVALID_JSON')]:
            history = []
            with patch.object(w, 'request', return_value=(200, body)):
                with self.assertRaisesRegex(RuntimeError, code):
                    w.probe('https://wallet.example.org', 'a' * 32, attempts=1, diagnostics=history)

    def quick_capture(self, logs, started='2026-11-03T23:00:00.000000000Z'):
        calls = []
        def capture(label, command, timeout=15):
            calls.append(command)
            if label == 'tunnel_container': return 0, 'c' * 64
            if label == 'tunnel_state': return 0, 'running ' + started + ' 1'
            if label == 'tunnel_runtime': return 0, logs
            raise AssertionError(label)
        return capture, calls

    def test_quick_tunnel_reads_logs_only_since_current_container_start(self):
        capture, calls = self.quick_capture('Visit https://current-url.trycloudflare.com')
        with patch.object(self.runner, 'capture', side_effect=capture):
            self.assertEqual('https://current-url.trycloudflare.com', self.runner.quick_origin(attempts=1))
        logs = next(c for c in calls if '--since' in c)
        self.assertEqual('2026-11-03T23:00:00.000000000Z', logs[logs.index('--since') + 1])
        saved = json.loads(self.runner.state_path.read_text())
        self.assertEqual('https://current-url.trycloudflare.com', saved['candidate']['origin'])
        self.assertNotIn('active', saved)
        self.assertNotIn('origin', saved)

    def test_a_restarted_container_cannot_reuse_a_cached_old_url(self):
        self.runner.state['candidate'] = {'container': 'c' * 64, 'started_at': '2026-11-02T23:00:00Z', 'origin': 'https://old-url.trycloudflare.com'}
        capture, _ = self.quick_capture('starting but no address yet')
        with patch.object(self.runner, 'capture', side_effect=capture):
            with self.assertRaisesRegex(RuntimeError, 'arranque actual'):
                self.runner.quick_origin(attempts=1)

    def test_active_container_can_reuse_saved_candidate_after_log_rotation(self):
        self.runner.state['candidate'] = {'container': 'c' * 64, 'started_at': '2026-11-03T23:00:00.000000000Z', 'origin': 'https://current-url.trycloudflare.com'}
        capture, _ = self.quick_capture('later log lines')
        with patch.object(self.runner, 'capture', side_effect=capture):
            self.assertEqual('https://current-url.trycloudflare.com', self.runner.quick_origin(attempts=1))

    def test_missing_container_does_not_inspect_arbitrary_docker_resources(self):
        with patch.object(self.runner, 'capture', return_value=(0, 'invalid id')) as capture:
            with self.assertRaises(RuntimeError):
                self.runner.quick_origin(attempts=1)
        self.assertEqual(1, capture.call_count)

    def test_diagnostic_capture_redacts_tokens_and_download_links(self):
        secret = 'private-sentinel-' + 'x' * 40
        self.runner.runner.secrets.append(secret)
        text = secret + '\nBearer abc.def\n/wallet/apple/download/' + 'z' * 43 + '\n?code=temporary-sensitive&ok=yes'
        with patch.object(w.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, text)):
            _, output = self.runner.capture('tunnel_runtime', ['docker', 'logs', 'example'])
        self.assertNotIn(secret, output)
        self.assertNotIn('abc.def', output)
        self.assertNotIn('z' * 43, output)
        self.assertNotIn('temporary-sensitive', output)
        self.assertEqual(output, (self.runner.runner.logs / 'tunnel_runtime.log').read_text())

    def test_diagnostic_timeout_is_recorded_without_hiding_original_failure(self):
        with patch.object(w.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker logs', 15)):
            code, _ = self.runner.capture('tunnel_runtime', ['docker', 'logs', 'example'])
        self.assertEqual(124, code)
        self.assertEqual(124, self.runner.runner.report['checks']['tunnel_runtime']['exit_code'])

    def test_diagnostics_separates_cloudflare_connectivity_signals(self):
        w.initialize(self.root)
        self.runner.write_overlay(w.read_wallet(self.root / '.env.wallet'))
        logs = 'ERR dial tcp 198.41.192.1:7844: i/o timeout\nlookup example: no such host\nUnable to reach the origin service\nRegistered tunnel connection'
        with patch.object(self.runner, 'capture', return_value=(0, logs)) as capture:
            self.runner.diagnostics()
        self.assertEqual({'TUNNEL_TCP_7844_UNREACHABLE', 'TUNNEL_DNS_FAILED', 'TUNNEL_ORIGIN_UNREACHABLE', 'TUNNEL_CONNECTION_REGISTERED'}, set(self.runner.report['tunnel_log_signals']))
        for call in capture.call_args_list:
            self.assertNotIn('loyalty-server', call.args[1])
            self.assertNotIn('loyalty-db', call.args[1])
            self.assertNotIn('inspect', call.args[1])

    def test_failed_standalone_run_zips_exact_script_and_redacted_runtime_logs(self):
        origin = Path(self.temp.name) / 'repair.sh'
        origin.write_text('#!/bin/bash\n# exact test artifact\n')
        output = Path(self.temp.name) / 'output'
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/wallet_local.py').write_text('# test snapshot')
        def fail(runner, renew):
            runner.report.update(phase='public_https', probes={'public_https': [{'code': 'DNS_RESOLUTION_FAILED'}]})
            raise RuntimeError('DNS_RESOLUTION_FAILED')
        def collect(runner):
            w.staging.private_write(runner.runner.logs / 'tunnel_runtime_final.log', 'connection timeout')
            runner.runner.report['checks']['tunnel_runtime_final'] = {'exit_code': 0}
            runner.report['tunnel_log_signals'] = ['TUNNEL_TCP_7844_UNREACHABLE']
        with patch.object(w.LocalWallet, 'start', fail), patch.object(w.LocalWallet, 'diagnostics', collect):
            code = w.main(['start', '--project', str(self.root), '--origin-script', str(origin), '--output-dir', str(output)])
        self.assertEqual(1, code)
        with zipfile.ZipFile(next(output.glob('*.zip'))) as archive:
            prefix = archive.namelist()[0].split('/')[0] + '/'
            report = json.loads(archive.read(prefix + 'RESULTADO.json'))
            self.assertEqual('HTTPS_SETUP_FAILED', report['status'])
            self.assertEqual('public_https', report['phase'])
            self.assertEqual('DNS_RESOLUTION_FAILED', report['probes']['public_https'][0]['code'])
            self.assertEqual(['TUNNEL_TCP_7844_UNREACHABLE'], report['tunnel_log_signals'])
            self.assertEqual(origin.read_bytes(), archive.read(prefix + 'repair.sh'))
            self.assertEqual(b'connection timeout', archive.read(prefix + 'logs/tunnel_runtime_final.log'))
            self.assertFalse(any('.env' in name or '.local-wallet/' in name for name in archive.namelist()))


if __name__ == '__main__':
    unittest.main()
