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
            if '/wallet/art/v29/PANORAMA/' in path:return 404,b''
            if '/ffffff00/' in path or '/GRADIENT/33/' in path or '/v30/ATELIER/GRADIENT/5/0b1f3a/ffbb55/' in path:return 404,b''
            if '/wallet/art/v29/' in path or '/wallet/art/v30/' in path or '/wallet/art/v32/' in path:
                if method != 'GET' or '/CUSTOM/' in path:return 404,b''
                if '/6/5.png' in path or '?layout=html' in path:return 400,b''
                return 200,b''
            if path in ['/wallet/art/v27/AURORA/32/0b1f3a/4/5.png','/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=poster','/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=apple','/wallet/art/v24/GRADIENT/32/0b1f3a/4/5.png','/wallet/art/v24/GRADIENT/32/0b1f3a/4/5.png?layout=apple','/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png?layout=apple']:return (200 if method=='GET' else 404),b''
            if path in ['/wallet/art/v27/AURORA/32/0b1f3a/9/5.png','/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=html','/wallet/art/v24/GRADIENT/32/0b1f3a/9/5.png','/wallet/art/v20/GRADIENT/5/0b1f3a/9/5.png','/wallet/art/v22/GRADIENT/5/0b1f3a/9/5.png']:return 400,b''
            if path in ['/join/demo','/api/public/demo','/engagement.js','/experience.js','/wallet/brand/demo/logo.png']:return 200,b''
            if path in ['/api/me/wallet-status','/api/me/access']:return 401,b''
            if path=='/api/public/demo/join':return 400,b''
            return 404,b''
        with patch.object(w,'request',side_effect=respond):self.assertEqual(116,w.verify_gateway('http://local','demo'))
        self.assertEqual(116,len(calls))
        self.assertIn(('http://local/api/platform/lumina/businesses','POST'),calls)
        for endpoint,methods in [('/api/staff/administration',['GET']),('/api/staff/branch-directory',['GET','POST']),('/api/staff/branch-directory/example',['PUT']),('/api/platform/tenants/example/administration',['GET']),('/api/platform/tenants/example/branch-directory',['GET','POST']),('/api/platform/tenants/example/branch-directory/example',['PUT'])]:
            for method in methods:self.assertIn(('http://local'+endpoint,method),calls)
        with patch.object(w,'request',return_value=(503,b'')):
            with self.assertRaises(RuntimeError):w.verify_gateway('http://local','demo')

    def test_owner_experience_routes_never_enter_public_tunnel(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        for path in ['/api/staff/administration','/api/staff/branch-directory','/api/staff/branch-directory/example','/api/platform/tenants/example/administration','/api/platform/tenants/example/branch-directory','/api/platform/tenants/example/branch-directory/example','/api/staff/birthday-settings','/api/staff/business-profile/requests','/api/staff/promotion-setups','/api/staff/metrics?days=365','/api/platform/tenants/example/profile-requests/example']:
            for method in ['GET','POST','PUT','DELETE']:
                self.assertFalse(any(re.fullmatch(rule,method+' '+path) for rule in rules),(method,path))

    def test_new_business_symbols_are_bounded_without_expanding_legacy_routes(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda path:any(re.fullmatch(rule,'GET '+path) for rule in rules)
        for symbol in range(33):
            self.assertTrue(allowed('/wallet/art/v24/GRADIENT/'+str(symbol)+'/0b1f3a/4/5.png'))
        for symbol in ['33','999','-1','00','032','%32']:
            self.assertFalse(allowed('/wallet/art/v24/GRADIENT/'+symbol+'/0b1f3a/4/5.png'))
        for version in ['v20','v22']:
            self.assertFalse(allowed('/wallet/art/'+version+'/GRADIENT/32/0b1f3a/4/5.png'))

    def test_signature_routes_are_bounded_get_only_and_preserve_legacy(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        path='/wallet/art/v27/AURORA/32/0b1f3a/4/5.png'
        self.assertTrue(allowed('GET',path))
        self.assertTrue(allowed('GET',path+'?layout=poster'))
        for method in ['POST','PUT','DELETE']:
            self.assertFalse(allowed(method,path))
        for bad in [path.replace('/32/','/33/'),path.replace('/v27/','/v24/'),path.replace('0b1f3a','%2e%2e'),path+'/../../.env']:
            self.assertFalse(allowed('GET',bad))

    def test_composition_gateway_restricts_ids_and_methods(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        for composition in ['SIGNATURE','EDITORIAL','STAMPBOOK','TICKET','MOSAIC','RIBBON','PATH']:
            path='/wallet/art/v29/'+composition+'/GRADIENT/5/0b1f3a/4/5.png'
            self.assertTrue(allowed('GET',path))
            self.assertTrue(allowed('GET',path+'?layout=poster'))
            for method in ['POST','PUT','DELETE']:self.assertFalse(allowed(method,path))
        for c in ['CUSTOM','../','%2E%2E','editorial','SIGNATURE%00']:
            self.assertFalse(allowed('GET','/wallet/art/v29/'+c+'/GRADIENT/5/0b1f3a/4/5.png'))

    def test_studio_compositions_are_bounded_without_broadening_v29(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        for c in ['PANORAMA','PRECISION','ATELIER']:
            path='/wallet/art/v30/'+c+'/GRADIENT/5/0b1f3a/4/5.png'
            for suffix in ['', '?layout=apple', '?layout=poster']:self.assertTrue(allowed('GET',path+suffix))
            self.assertFalse(allowed('GET',path.replace('/v30/','/v29/')))
            for method in ['POST','PUT','DELETE']:self.assertFalse(allowed(method,path))
        for c in ['CUSTOM','../','%2e%2e','panorama']:
            self.assertFalse(allowed('GET','/wallet/art/v30/'+c+'/GRADIENT/5/0b1f3a/4/5.png'))

    def test_accent_routes_are_bounded_and_legacy_urls_do_not_accept_custom_color(self):
        rules=re.findall(r'"~\^(.+?)\$" 1;',w.gateway_config('a'*32))
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        for accent in ['auto','ffbb55','000000','FFFFFF']:
            path='/wallet/art/v32/ATELIER/GRADIENT/5/0b1f3a/'+accent+'/4/5.png'
            for suffix in ['', '?layout=apple', '?layout=poster']:self.assertTrue(allowed('GET',path+suffix))
            self.assertFalse(allowed('GET',path.replace('/v32/','/v30/')))
            for method in ['POST','PUT','DELETE']:self.assertFalse(allowed(method,path))
        for bad in ['red','AUTO','fff','ffffff00','%23ffffff','%2e%2e','../.env']:
            self.assertFalse(allowed('GET','/wallet/art/v32/ATELIER/GRADIENT/5/0b1f3a/'+bad+'/4/5.png'))
