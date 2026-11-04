import ast
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('checkpoint_class_updates', Path(__file__).resolve().parents[1] / 'checkpoint.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class PythonClassUpdateTests(unittest.TestCase):
    def test_new_methods_stay_in_existing_class_with_user_format_and_custom_logic(self):
        baseline = 'class A:\n    def keep(self):\n        return 1\n'
        actual = '# user comment\nclass A:\n  def keep( self ):\n    return 99  # keep my logic\n\ndef outside():\n  return "outside"\n'
        desired = 'class A:\n    def added(self):\n        return 2\n    @staticmethod\n    def utility():\n        return 3\n    def keep(self):\n        return 1\n'
        result = c.merge_python_module(actual, baseline, desired)
        self.assertIn('  def keep( self ):\n    return 99  # keep my logic', result)
        self.assertIn('def outside():\n  return "outside"', result)
        namespace = {}
        exec(result, namespace)
        self.assertEqual((99, 2, 3), (namespace['A']().keep(), namespace['A']().added(), namespace['A'].utility()))
        self.assertNotIn('added', namespace)
        self.assertEqual(result, c.merge_python_module(result, baseline, desired))

    def test_new_class_methods_are_inserted_once_and_before_main(self):
        baseline = 'def main():\n    return None\nif __name__ == "__main__":\n    result = main()\n'
        desired = 'class Error(Exception):\n    def code(self):\n        return 7\ndef main():\n    return Error().code()\nif __name__ == "__main__":\n    result = main()\n'
        result = c.merge_python_module(baseline, baseline, desired)
        namespace = {'__name__': '__main__'}
        exec(result, namespace)
        self.assertEqual(7, namespace['result'])
        self.assertNotIn('code', namespace)
        self.assertEqual(1, result.count('def code('))
        self.assertEqual(result, c.merge_python_module(result, baseline, desired))

    def test_existing_decorated_method_update_preserves_single_decorator(self):
        baseline = 'class A:\n    @staticmethod\n    def get():\n        return 1\n'
        actual = 'class A:\n  @staticmethod\n  def get():\n    return (1)\n'
        desired = 'class A:\n    @staticmethod\n    def get():\n        return 2\n'
        result = c.merge_python_module(actual, baseline, desired)
        self.assertEqual(1, result.count('@staticmethod'))
        namespace = {}
        exec(result, namespace)
        self.assertEqual(2, namespace['A'].get())
        self.assertEqual(result, c.merge_python_module(result, baseline, desired))

    def test_conflicting_new_method_is_not_overwritten(self):
        baseline = 'class A:\n    pass\n'
        actual = 'class A:\n    def added(self):\n        return "user"\n'
        desired = 'class A:\n    def added(self):\n        return "new"\n'
        with self.assertRaisesRegex(RuntimeError, 'Cambió la lógica'):
            c.merge_python_module(actual, baseline, desired)
        self.assertEqual('user', ast.literal_eval(ast.parse(actual).body[0].body[0].body[0].value))


if __name__ == '__main__':
    unittest.main()
