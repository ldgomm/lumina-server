import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('checkpoint_text',Path(__file__).resolve().parents[1]/'checkpoint.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class TextPatchTests(unittest.TestCase):
    def test_document_patch_preserves_other_text_and_repeats_safely(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);project=root/'project';project.mkdir();evidence=root/'evidence';evidence.mkdir()
            file=project/'README.md';file.write_text('My notes\nOld paragraph.\n')
            operation={'README.md':{'mode':'text_patch','edits':[{'before':'Old paragraph.','after':'Updated paragraph.'}]}}
            c.apply_updates(project,operation,evidence)
            self.assertEqual('My notes\nUpdated paragraph.\n',file.read_text())
            self.assertEqual([],c.apply_updates(project,operation,evidence))
            file.write_text('My other paragraph.\n')
            with self.assertRaises(RuntimeError):
                c.apply_updates(project,operation,evidence)
