import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('wallet_config',Path(__file__).resolve().parents[1]/'wallet_config.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)


class WalletConfigTests(unittest.TestCase):
    def test_initialization_never_replaces_existing_key_and_uses_private_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.assertTrue(w.init_config(root));first=(root/'.env.wallet').read_bytes()
            self.assertFalse(w.init_config(root));self.assertEqual(first,(root/'.env.wallet').read_bytes())
            self.assertEqual(0o600,(root/'.env.wallet').stat().st_mode & 0o777)

    def test_diagnostics_do_not_print_secret_values_or_service_account_contents(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);w.init_config(root)
            result=json.dumps(w.check(root));self.assertNotIn(w.read_env(root/'.env.wallet')['WALLET_DATA_KEY'],result)
            self.assertIn('CONFIG_INCOMPLETE',result)


if __name__=='__main__':
    unittest.main()
