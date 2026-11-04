import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('material_paths_tests', SCRIPTS / 'wallet_local.py')
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)


class MaterialPathsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name) / 'project'; self.root.mkdir()
    def tearDown(self):
        self.temp.cleanup()
    def test_project_aliases_preserve_material_boundary_and_private_exception(self):
        # Reproduce macOS /var -> /private/var on every platform without mocks.
        alias = Path(self.temp.name) / 'project-alias'; alias.symlink_to(self.root, target_is_directory=True)
        data = json.dumps({'type': 'service_account', 'private_key': 'private-sentinel', 'private_key_id': 'id', 'client_email': 'test@example.org'})
        code = self.root / 'src/google.json'; code.parent.mkdir(); code.write_text(data)
        def copy(source):
            w.copy_material(alias, {'GOOGLE_WALLET_ENABLED': 'true', 'GOOGLE_WALLET_SERVICE_ACCOUNT_PATH': str(source)})
        for source in (alias / 'src/google.json', code.resolve()):
            with self.subTest(source=str(source)):
                with self.assertRaises(RuntimeError): copy(source)
        destination = self.root / w.PRIVATE / 'material/google.json'
        self.assertFalse(destination.exists())
        private = alias / w.PRIVATE / 'input/google.json'; private.parent.mkdir(); private.write_text(data)
        copy(private)
        self.assertEqual(data, destination.read_text()); self.assertEqual(0o600, destination.stat().st_mode & 0o777)
        external = Path(self.temp.name) / 'external-google.json'; external.write_text(data)
        copy(external)
        self.assertEqual(data, destination.read_text())



if __name__ == '__main__': unittest.main()
