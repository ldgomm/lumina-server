import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
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
        values = dict(tests=218, passed=218, fail=0, cancelled=0, skipped=0, todo=0)
        values.update(changes)
        return ''.join(f'# {"pass" if key == "passed" else key} {value}\n' for key, value in values.items())

    def invoke(self, *, output=None, returncode=0, root=None):
        log = self.output() if output is None else output
        result = subprocess.CompletedProcess(['node'], returncode, log)
        with patch.object(runner.subprocess, 'run', return_value=result) as run, contextlib.redirect_stdout(io.StringIO()) as printed:
            runner.main(root or self.root)
        return run.call_args, printed.getvalue()

    def test_current_suite_catalog_executes_all_218_contracts(self):
        files = sorted((runner.ROOT/runner.SUITE_PATH).glob('*.test.mjs'))
        self.assertEqual(len(files), runner.EXPECTED_SUITES)
        self.assertIn('subscription.test.mjs', [p.name for p in files])
        call, printed = self.invoke(root=runner.ROOT)
        self.assertEqual(call.args[0], ['node', '--test', '--test-reporter=tap', *map(str, files)])
        self.assertEqual(call.kwargs['cwd'], runner.ROOT)
        self.assertEqual(printed, self.output())

    def test_missing_suite_blocks_before_running_node(self):
        next(self.suites.glob('*.test.mjs')).unlink()
        with patch.object(runner.subprocess, 'run') as run, self.assertRaisesRegex(SystemExit, '22.*21'):
            runner.main(self.root)
        run.assert_not_called()

    def test_unexpected_suite_requires_review(self):
        (self.suites/'extra.test.mjs').write_text('// unexpected\n')
        with patch.object(runner.subprocess, 'run') as run, self.assertRaisesRegex(SystemExit, '22.*23'):
            runner.main(self.root)
        run.assert_not_called()

    def test_process_failure_cannot_pass_using_successful_counts(self):
        with self.assertRaises(SystemExit):
            self.invoke(returncode=1)

    def test_missing_test_or_extra_test_cannot_pass(self):
        for count in [217, 219]:
            with self.subTest(count=count), self.assertRaises(SystemExit):
                self.invoke(output=self.output(tests=count, passed=count))

    def test_success_count_must_match_the_complete_run(self):
        with self.assertRaises(SystemExit):
            self.invoke(output=self.output(passed=217))
        with self.assertRaises(SystemExit):
            self.invoke(output='# tests 218\n# pass 218\n')

    def test_failed_cancelled_skipped_or_todo_tests_block_success(self):
        for key in ['fail', 'cancelled', 'skipped', 'todo']:
            with self.subTest(key=key), self.assertRaises(SystemExit):
                self.invoke(output=self.output(**{key: 1}))

    def test_timeout_is_a_failure(self):
        with patch.object(runner.subprocess, 'run', side_effect=subprocess.TimeoutExpired('node', 110)), self.assertRaises(subprocess.TimeoutExpired):
            runner.main(self.root)
