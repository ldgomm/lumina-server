#!/usr/bin/env python3
"""Run the portal contracts with fictional data, requiring every test to execute."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SUITE_PATH = Path('src/test/resources/com/premierdarkcoffee/loyalty/lumina')
EXPECTED_SUITES = 32
EXPECTED_TESTS = 366


def main(root=ROOT):
    files = sorted((root/SUITE_PATH).glob('*.test.mjs'))
    if len(files) != EXPECTED_SUITES:
        raise SystemExit(f'Se esperaban {EXPECTED_SUITES} suites HTTP de Lúmina; se encontraron {len(files)}.')
    result = subprocess.run(['node','--test','--test-reporter=tap',*[str(p) for p in files]], cwd=root,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=110)
    print(result.stdout, end='')
    counts = {key:int(value) for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',result.stdout,re.M)}
    if result.returncode or counts.get('tests') != EXPECTED_TESTS or counts.get('pass') != EXPECTED_TESTS or any(counts.get(k) != 0 for k in ['fail','cancelled','skipped','todo']):
        raise SystemExit('Las pruebas de Lúmina no terminaron completas.')


if __name__ == '__main__':
    main()
