import ast
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('checkpoint_v003', Path(__file__).resolve().parents[1]/'checkpoint.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class FormatUpdateTests(unittest.TestCase):
    def test_named_kotlin_insertion_ignores_method_and_import_order(self):
        source = 'import z.Z\nimport a.A\nfun second() = Unit\nfun purchase(\n s: Staff,\n) = db.tx { c ->\n // preserve this comment\n once(c) { work() }\n}\n'
        result = c.inject_kotlin_function(source, 'purchase', 'db.tx { c ->', 'checkAccess(c)')
        self.assertIn('checkAccess(c);', result)
        self.assertIn('// preserve this comment', result)
        self.assertTrue(result.startswith('import z.Z\nimport a.A\nfun second() = Unit'))
        self.assertEqual(result, c.inject_kotlin_function(result, 'purchase', 'db.tx { c ->', 'checkAccess(c)'))

    def test_insertion_is_scoped_to_one_named_function(self):
        source = 'fun read() = db.tx { c -> read(c) }\nfun write() = db.tx { c -> write(c) }'
        result = c.inject_kotlin_function(source, 'write', 'db.tx { c ->', 'guard(c)')
        self.assertIn('fun read() = db.tx { c -> read(c) }', result)
        self.assertEqual(1, result.count('guard(c)'))

    def test_migration_insertion_follows_v001_conditional(self):
        source = 'fun migrate() = tx { c -> if (new) { insert(1,\n); /* preserve SQL comment */ } }'
        result = c.inject_kotlin_function(source, 'migrate', 'insert(1) }', 'applyV002(c)')
        self.assertTrue(result.index('applyV002') > result.index('/* preserve'))
        self.assertEqual(1, result[:result.index('applyV002')].count('}'))

    def test_real_kotlin_change_is_not_guessed(self):
        with self.assertRaises(RuntimeError):
            c.inject_kotlin_function('fun write() = otherDb.tx { c -> work(c) }', 'write', 'db.tx { c ->', 'guard(c)')

    def test_python_merge_accepts_reformat_and_preserves_unrelated_custom_code(self):
        baseline = 'VERSION="v002"\ndef change(x):\n return x+1\ndef keep():\n return 1\n'
        actual = '# comment\nVERSION = \'v002\'\ndef keep():\n    return 99\ndef change( x ):\n    return (x + 1)\n'
        desired = 'VERSION="v003"\ndef change(x):\n return x+2\ndef keep():\n return 1\n'
        result = c.merge_python_module(actual, baseline, desired)
        self.assertIn('# comment', result)
        self.assertIn('return 99', result)
        self.assertEqual(result, c.merge_python_module(result, baseline, desired))
        self.assertIn('x + 2', ast.unparse(ast.parse(result)))

    def test_python_additions_exist_before_main_and_are_repeatable(self):
        baseline = 'def main():\n return 1\nif __name__ == "__main__":\n main()\n'
        desired = 'import ast\nTOTAL=2\ndef main():\n return helper()\ndef helper():\n return TOTAL\nif __name__ == "__main__":\n main()\n'
        result = c.merge_python_module(baseline, baseline, desired)
        namespace = {'__name__': '__main__'}
        exec(result, namespace)
        self.assertEqual(2, namespace['main']())
        self.assertEqual(result, c.merge_python_module(result, baseline, desired))

    def test_real_python_changes_in_replaced_definition_are_preserved_for_review(self):
        with self.assertRaises(RuntimeError):
            c.merge_python_module('def f():\n return 3\n', 'def f():\n return 1\n', 'def f():\n return 2\n')

    def test_python_method_order_and_other_method_format_remain_intact(self):
        baseline = 'class A:\n def a(self):\n  return 1\n def b(self):\n  return 4\n'
        actual = 'class A:\n    def b( self ):\n        return 4\n    def a(self):\n        return (1)\n'
        desired = 'class A:\n def a(self):\n  return 2\n def b(self):\n  return 4\n'
        result = c.merge_python_module(actual, baseline, desired)
        self.assertIn('def b( self ):', result)
        ast.parse(result)


if __name__ == '__main__':
    unittest.main()
