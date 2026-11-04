import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wallet_gateway_refresh',SCRIPTS/'wallet_local.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)

class GatewayRefreshTests(unittest.TestCase):
    def configured(self,root):
        w.staging.init_config(root)
        w.initialize(root)
        folder=w.private_directory(root)
        state={'origin':'https://wallet.example.org','mode':'quick','nonce':'a'*32}
        w.staging.private_write(folder/'state.json',json.dumps(state))
        return w.LocalWallet(root),state

    def test_preflight_rebinds_current_config_without_touching_tunnel_or_private_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);local,state=self.configured(root)
            private={name:(root/name).read_bytes() for name in ['.env','.env.wallet']}
            commands=[]
            with patch.object(local.runner,'run',side_effect=lambda label,command,*a,**k:commands.append(command) or (0,'')),patch.object(local,'check_probe'),patch.object(w,'verify_gateway',return_value=22):
                result=local.gateway_check()
            self.assertEqual('LOCAL_GATEWAY_PASS',result['status'])
            self.assertEqual(1,len(commands))
            self.assertEqual(['up','-d','--no-deps','--force-recreate',w.GATEWAY],commands[0][-5:])
            self.assertNotIn(w.TUNNEL,commands[0]);self.assertNotIn('loyalty-db',commands[0])
            self.assertIn('engagement', (local.folder/'gateway.conf').read_text())
            self.assertEqual(state,json.loads(local.state_path.read_text()))
            self.assertEqual(private,{name:(root/name).read_bytes() for name in private})

    def test_https_start_refreshes_gateway_before_publishing_or_changing_existing_origin(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);local,state=self.configured(root)
            private=(root/'.env.wallet').read_bytes();calls=[]
            class StopAfterGateway(Exception):pass
            with patch.object(local,'database_state',return_value={'hasKey':True,'passes':1}),patch.object(local,'run',side_effect=lambda *a,**k:calls.append(a)),patch.object(local,'check_probe',side_effect=StopAfterGateway):
                with self.assertRaises(StopAfterGateway):local.start()
            gateway=[a for a in calls if a[0]=='gateway_start']
            self.assertEqual([('gateway_start','up','-d','--no-deps','--force-recreate',w.GATEWAY)],gateway)
            self.assertFalse(any(w.TUNNEL in a for a in calls))
            self.assertEqual(private,(root/'.env.wallet').read_bytes())
            self.assertEqual(state,json.loads(local.state_path.read_text()))
