import importlib.util
from pathlib import Path
import re
import unittest

SCRIPTS=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location('engagement_'+name,SCRIPTS/(name+'.py'))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

class EngagementWorkflowTests(unittest.TestCase):
    def test_kotlin_urls_are_strings_and_user_comments_are_preserved(self):
        c=module('checkpoint')
        before='fun f() { val url="https://example.com"; /* existing /* nested */ note */ use(url, 1) }'
        after=before.replace('use(url, 1)','use(url, 2)')
        self.assertEqual(after,c.replace_kotlin_fragment(before,before,after))
        self.assertEqual(after,c.replace_kotlin_fragment(after,before,after))
        with self.assertRaises(RuntimeError):c.replace_kotlin_fragment(before.replace('use(url','/* user note */ use(url'),before,after)
        with self.assertRaises(RuntimeError):c.replace_kotlin_fragment(before,before,after.replace('/* existing /* nested */ note */',''))
    def test_gateway_allows_only_public_brand_assets_and_never_staff_actions(self):
        w=module('wallet_local');config=w.gateway_config('a'*32)
        rules=re.findall(r'"~\^(.+?)\$" 1;',config)
        allowed=lambda method,path:any(re.fullmatch(rule,method+' '+path) for rule in rules)
        for path in ['/experience.js','/engagement.js','/wallet/brand/cafe-demo/logo.png','/wallet/brand/cafe-demo/logo.png?v=abc123','/wallet/brand/ab/logo.png','/wallet/brand/'+'a'*61+'/logo.png']:
            self.assertTrue(allowed('GET',path),path)
        for path in ['/api/staff/wallet-design','/api/staff/customer-events','/api/staff/purchases/quote','/wallet/brand/../../.env/logo.png']:
            self.assertFalse(allowed('GET',path),path);self.assertFalse(allowed('POST',path),path)
