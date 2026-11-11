import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('quiet_checkpoint',Path(__file__).resolve().parents[1]/'checkpoint.py')
checkpoint=importlib.util.module_from_spec(spec);spec.loader.exec_module(checkpoint)

class TerminalOutputTests(unittest.TestCase):
    def invoke(self, valid):
        with tempfile.TemporaryDirectory(prefix='lumina-output-test-') as folder:
            root=Path(folder);project=root/'project';project.mkdir()
            if valid:(project/'gradlew').write_text('#!/bin/sh\n')
            stdout=io.StringIO();stderr=io.StringIO()
            with contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
                code=checkpoint.main(['--project',str(project),'--output-dir',str(root/'evidence'),'--check-only'])
            reports=list((root/'evidence').glob('*/RESULTADO.json'))
            self.assertEqual(len(reports),1)
            report=json.loads(reports[0].read_text())
            self.assertEqual(stdout.getvalue(),'RESULTADO='+report['status']+'\n')
            self.assertEqual(stderr.getvalue(),'')
            self.assertNotEqual(report['auto_commit']['status'],'CREATED')
            self.assertEqual(len(list((root/'evidence').glob('*.zip'))),1)
            return code,report

    def test_preflight_prints_only_its_actual_result(self):
        code,report=self.invoke(True)
        self.assertEqual(code,0)
        self.assertEqual(report['status'],'PREFLIGHT_PASS_NO_COMMIT')

    def test_failure_prints_only_result_and_retains_error_in_evidence(self):
        code,report=self.invoke(False)
        self.assertEqual(code,1)
        self.assertIn('error',report)
        self.assertNotIn('PASS',report['status'])
