#!/usr/bin/env python3
"""Run the portal contracts with fictional data, requiring every test to execute."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
files = sorted((root/'src/test/resources/com/premierdarkcoffee/loyalty/lumina').glob('*.test.mjs'))
if len(files) != 7:
    raise SystemExit('Faltan suites HTTP de Lúmina.')
result = subprocess.run(['node','--test','--test-reporter=tap',*[str(p) for p in files]], cwd=root,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=110)
print(result.stdout, end='')
counts = {key:int(value) for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',result.stdout,re.M)}
if result.returncode or counts.get('tests',0)<43 or counts.get('pass')!=counts.get('tests') or any(counts.get(k)!=0 for k in ['fail','cancelled','skipped','todo']):
    raise SystemExit('Las pruebas de Lúmina no terminaron completas.')
