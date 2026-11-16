import contextlib
import importlib.util
import io
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('lumina_runner', Path(__file__).resolve().parents[1]/'test_lumina.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class LuminaRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lumina-runner-test-')
        self.root = Path(self.temp.name).resolve()
        self.suites = self.root/runner.SUITE_PATH
        self.suites.mkdir(parents=True)
        for number in range(runner.EXPECTED_SUITES):
            (self.suites/f'{number:02}.test.mjs').write_text('// fictional runner fixture\n')

    def tearDown(self):
        self.temp.cleanup()

    def output(self, **changes):
        values = dict(tests=runner.EXPECTED_TESTS, passed=runner.EXPECTED_TESTS, fail=0, cancelled=0, skipped=0, todo=0)
        values.update(changes)
        return ''.join(f'# {"pass" if key == "passed" else key} {value}\n' for key, value in values.items())

    def invoke(self, *, output=None, returncode=0, root=None):
        log = self.output() if output is None else output
        result = subprocess.CompletedProcess(['node'], returncode, log)
        with patch.object(runner, 'run_node', return_value=result) as run, contextlib.redirect_stdout(io.StringIO()) as printed:
            runner.main(root or self.root)
        return run.call_args, printed.getvalue()

    def test_current_suite_catalog_executes_all_declared_contracts(self):
        files = sorted((runner.ROOT/runner.SUITE_PATH).glob('*.test.mjs'))
        self.assertEqual(len(files), runner.EXPECTED_SUITES)
        self.assertIn('subscription.test.mjs', [p.name for p in files])
        call, printed = self.invoke(root=runner.ROOT)
        self.assertEqual(call.args[0], ['node', '--test', '--test-reporter=tap', '--test-concurrency=1', *map(str, files)])
        self.assertEqual(call.kwargs['cwd'], runner.ROOT)
        self.assertEqual(call.kwargs['timeout'], 900)
        self.assertEqual(printed, self.output())

    def test_missing_suite_blocks_before_running_node(self):
        next(self.suites.glob('*.test.mjs')).unlink()
        with patch.object(runner, 'run_node') as run, self.assertRaisesRegex(SystemExit, rf'{runner.EXPECTED_SUITES}.*{runner.EXPECTED_SUITES-1}'):
            runner.main(self.root)
        run.assert_not_called()

    def test_unexpected_suite_requires_review(self):
        (self.suites/'extra.test.mjs').write_text('// unexpected\n')
        with patch.object(runner, 'run_node') as run, self.assertRaisesRegex(SystemExit, rf'{runner.EXPECTED_SUITES}.*{runner.EXPECTED_SUITES+1}'):
            runner.main(self.root)
        run.assert_not_called()

    def test_process_failure_cannot_pass_using_successful_counts(self):
        with self.assertRaises(SystemExit):
            self.invoke(returncode=1)

    def test_missing_test_or_extra_test_cannot_pass(self):
        for count in [runner.EXPECTED_TESTS-1, runner.EXPECTED_TESTS+1]:
            with self.subTest(count=count), self.assertRaises(SystemExit):
                self.invoke(output=self.output(tests=count, passed=count))

    def test_success_count_must_match_the_complete_run(self):
        with self.assertRaises(SystemExit):
            self.invoke(output=self.output(passed=runner.EXPECTED_TESTS-1))
        with self.assertRaises(SystemExit):
            self.invoke(output=f'# tests {runner.EXPECTED_TESTS}\n# pass {runner.EXPECTED_TESTS}\n')

    def test_failed_cancelled_skipped_or_todo_tests_block_success(self):
        for key in ['fail', 'cancelled', 'skipped', 'todo']:
            with self.subTest(key=key), self.assertRaises(SystemExit):
                self.invoke(output=self.output(**{key: 1}))

    def test_timeout_is_a_failure(self):
        with self.assertRaises(SystemExit):
            self.invoke(output=self.output()+'LUMINA_TEST_TIMEOUT seconds=900\n', returncode=124)

    def test_real_timeout_preserves_partial_tap_and_stops_child_servers(self):
        pid_file = self.root/'child.pid'
        fixture = self.root/'hang.py'
        fixture.write_text('''import os, signal, subprocess, sys, time
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
def stop(*_):
    child.wait(timeout=3)
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
open(sys.argv[1], 'w').write(str(child.pid))
print('ok 1 - finished before timeout', flush=True)
time.sleep(60)
''')
        old_handler = signal.getsignal(signal.SIGTERM)
        result = runner.run_node([sys.executable, str(fixture), str(pid_file)], cwd=self.root, timeout=1)
        self.assertEqual(result.returncode, 124)
        self.assertIn('ok 1 - finished before timeout', result.stdout)
        self.assertIn('LUMINA_TEST_TIMEOUT seconds=1', result.stdout)
        self.assertIs(signal.getsignal(signal.SIGTERM), old_handler)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)

    def test_completed_process_with_open_child_output_cannot_hold_runner(self):
        fixture = self.root/'leaked.py'
        fixture.write_text("import subprocess, sys\nsubprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\nprint('ok 1 - complete', flush=True)\n")
        started = time.monotonic()
        result = runner.run_node([sys.executable, str(fixture)], cwd=self.root, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertIn('ok 1 - complete', result.stdout)
        self.assertLess(time.monotonic()-started, 5)

    def test_outer_termination_cleans_node_group_and_preserves_output(self):
        fixture = self.root/'interrupt.py'
        pid_file = self.root/'node.pid'
        fixture.write_text(f'''import importlib.util, pathlib, sys
spec=importlib.util.spec_from_file_location('runner', {str(Path(runner.__file__))!r})
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
r.run_node([sys.executable, '-c', "import os, pathlib, time; pathlib.Path({str(pid_file)!r}).write_text(str(os.getpid())); print('ok 1 - saved', flush=True); time.sleep(60)"], cwd=pathlib.Path('.'), timeout=30)
''')
        process = subprocess.Popen([sys.executable, str(fixture)], cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.addCleanup(lambda: process.poll() is None and process.kill())
        deadline = time.monotonic()+5
        while not pid_file.exists() and time.monotonic()<deadline:
            time.sleep(0.02)
        self.assertTrue(pid_file.exists(), 'Child did not start')
        process.terminate()
        output, _ = process.communicate(timeout=5)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn('ok 1 - saved', output)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)

    def test_checkpoint_deadline_allows_internal_timeout_and_cleanup(self):
        import ast
        tree = ast.parse((runner.ROOT/'scripts/checkpoint.py').read_text())
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id=='run' and any(isinstance(value, ast.Constant) and value.value=='lumina_http' for value in ast.walk(node.args[0]))]
        self.assertEqual(len(calls), 1)
        self.assertGreaterEqual(ast.literal_eval(calls[0].args[2]), runner.TEST_TIMEOUT_SECONDS+2*runner.CLEANUP_TIMEOUT_SECONDS+10)
