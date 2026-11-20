#!/usr/bin/env python3
"""Run the portal contracts with fictional data, requiring every test to execute."""
from pathlib import Path
import os
import re
import signal
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SUITE_PATH = Path('src/test/resources/com/premierdarkcoffee/loyalty/lumina')
EXPECTED_SUITES = 42
EXPECTED_TESTS = 522
TEST_TIMEOUT_SECONDS = 900
CLEANUP_TIMEOUT_SECONDS = 10


def stop_process_group(process):
    """Clean up this test run, including servers started by child suites."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=CLEANUP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        pass
    finally:
        # The parent can exit before a child that ignores SIGTERM.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=CLEANUP_TIMEOUT_SECONDS)


def run_node(command, *, cwd, timeout=TEST_TIMEOUT_SECONDS):
    """Keep partial TAP output without waiting on inherited child pipe handles."""
    with tempfile.TemporaryFile(mode='w+', encoding='utf-8', errors='replace') as log:
        old_sigterm = signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        process = None
        interrupted = False
        timed_out = False
        try:
            process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                code = 124
            except BaseException:
                interrupted = True
                raise
        finally:
            # The outer checkpoint may also stop us. Forward that shutdown to
            # the isolated Node process group before restoring its signal policy.
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            try:
                if process is not None:
                    stop_process_group(process)
                if interrupted:
                    log.seek(0)
                    print(log.read(), end='', flush=True)
            finally:
                signal.signal(signal.SIGTERM, old_sigterm)
        log.seek(0)
        output = log.read()
        if timed_out:
            output += f'\nLUMINA_TEST_TIMEOUT seconds={timeout}\n'
        return subprocess.CompletedProcess(command, code, output)


def main(root=ROOT):
    files = sorted((root/SUITE_PATH).glob('*.test.mjs'))
    if len(files) != EXPECTED_SUITES:
        raise SystemExit(f'Se esperaban {EXPECTED_SUITES} suites HTTP de Lúmina; se encontraron {len(files)}.')
    result = run_node(['node','--test','--test-reporter=tap','--test-concurrency=1',*[str(p) for p in files]],
                      cwd=root, timeout=TEST_TIMEOUT_SECONDS)
    print(result.stdout, end='')
    counts = {key:int(value) for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',result.stdout,re.M)}
    if result.returncode or counts.get('tests') != EXPECTED_TESTS or counts.get('pass') != EXPECTED_TESTS or any(counts.get(k) != 0 for k in ['fail','cancelled','skipped','todo']):
        raise SystemExit('Las pruebas de Lúmina no terminaron completas.')


if __name__ == '__main__':
    main()
