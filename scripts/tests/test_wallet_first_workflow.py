import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('checkpoint_first',Path(__file__).parents[1]/'checkpoint.py')
cp=importlib.util.module_from_spec(spec);spec.loader.exec_module(cp)

class WalletFirstWorkflowTest(unittest.TestCase):
    def test_js_format_and_reordered_functions_preserve_surrounding_code(self):
        before='function hi(x){return x + 1;}'
        actual='function user(){return 9;}\nfunction hi( x ) {\n return x+1\n}\n'
        after='function hi(x){return x + 2;}'
        got=cp.replace_javascript_fragment(actual,before,after)
        self.assertIn('function user(){return 9;}',got)
        self.assertIn(after,got)
        self.assertEqual(got,cp.replace_javascript_fragment(got,before,after))
    def test_js_templates_regex_and_division_survive_tokenization(self):
        text='function f(x){return `URL https://x/${x ? `${x / 2}` : /[\"\']/g.test(x)}`;}'
        target=text.replace('x / 2','x / 3')
        self.assertEqual(target,cp.replace_javascript_fragment(text,text,target))
    def test_real_js_change_or_new_comment_is_never_overwritten(self):
        for text in ['function f(){return 8;}','function f(){/* preserve */return 1;}']:
            with self.assertRaises(RuntimeError):cp.replace_javascript_fragment(text,'function f(){return 1;}','function f(){return 2;}')
    def test_client_access_file_contains_no_customer_passwords(self):
        import sys,tempfile
        sys.path.insert(0,str(Path(__file__).parents[1]))
        import staging
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);values,_=staging.init_config(root,8097,False)
            content=staging.write_access(root,values).read_text()
            self.assertNotIn(values['STAGING_ALICE_PASSWORD'],content)
            self.assertNotIn(values['STAGING_BOB_PASSWORD'],content)
            self.assertNotIn('DEMO10001',content)
            self.assertNotIn('Tus accesos de prueba',content)
            self.assertIn('Abrir Lúmina Digital',content)
    def test_javascript_changes_are_preflighted_before_any_write(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'src').mkdir();a=root/'src/a.js';b=root/'src/b.js'
            a.write_text('function f(){return 1;}');b.write_text('function g(){return 9;}')
            updates={'src/a.js':{'mode':'javascript_patch','edits':[{'before':a.read_text(),'after':'function f(){return 2;}'}]},'src/b.js':{'mode':'javascript_patch','edits':[{'before':'function g(){return 1;}','after':'function g(){return 2;}'}]}}
            with self.assertRaises(RuntimeError):cp.apply_updates(root,updates,root/'evidence')
            self.assertEqual('function f(){return 1;}',a.read_text())
