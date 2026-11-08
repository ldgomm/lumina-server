import importlib.util
from pathlib import Path
import re
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wallet_artwork_gateway', SCRIPTS/'wallet_local.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)

class WalletArtworkGatewayTests(unittest.TestCase):
    def test_artwork_is_get_only_and_keeps_encoded_paths_private(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        path='/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png'
        self.assertTrue(allowed('GET',path));self.assertTrue(allowed('GET',path+'?layout=apple'))
        self.assertTrue(allowed('GET',path.replace('/v20/','/v22/')))
        self.assertFalse(allowed('GET',path.replace('/v20/','/v99/')))
        for bad in [path.replace('/5/0b','/999/0b'),path.replace('/4/5','/4/9999'),path.replace('0b1f3a','%2e%2e'),path+'/../../.env','/api/staff/wallet-design']:
            self.assertFalse(allowed('GET',bad),bad)
        for method in ['POST','PUT','DELETE']:
            self.assertFalse(allowed(method,path))

    def test_gateway_gate_includes_artwork_and_rejects_rendering_errors(self):
        calls=[]
        def respond(url,method,body):
            calls.append((url,method))
            path=url.removeprefix('http://local')
            if path in ['/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png?layout=apple']:return (200 if method=='GET' else 404),b''
            if path in ['/wallet/art/v20/GRADIENT/5/0b1f3a/9/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/9/5.png']:return 400,b''
            if path in ['/join/demo','/api/public/demo','/engagement.js','/experience.js','/wallet/brand/demo/logo.png']:return 200,b''
            if path in ['/api/me/wallet-status','/api/me/access']:return 401,b''
            if path=='/api/public/demo/join':return 400,b''
            return 404,b''
        with patch.object(w,'request',side_effect=respond):self.assertEqual(36,w.verify_gateway('http://local','demo'))
        self.assertEqual(36,len(calls))
        with patch.object(w,'request',return_value=(503,b'')):
            with self.assertRaises(RuntimeError):w.verify_gateway('http://local','demo')

    def test_owner_experience_routes_never_enter_public_tunnel(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        for path in ['/api/staff/birthday-settings','/api/staff/business-profile/requests','/api/staff/promotion-setups','/api/staff/metrics?days=365','/api/platform/tenants/example/profile-requests/example']:
            for method in ['GET','POST','PUT','DELETE']:
                self.assertFalse(any(re.fullmatch(rule,method+' '+path) for rule in rules),(method,path))
