import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('loyalty_migration', Path(__file__).resolve().parents[1] / 'checkpoint.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
PACKAGE = 'com.premierdarkcoffee.loyalty'
OLD = 'com.premierdarkcoffee.sales.com.premierdarkcoffee.loyalty'


class LoyaltyMigrationTests(unittest.TestCase):
    def test_reordered_imports_and_declarations_survive_namespace_migration(self):
        source = f'package {OLD}\n\nimport z.Z\nimport {OLD}.Thing\nimport a.A\n\nfun second( ) = 99\n// keep my comment\nfun first() = 42\n'
        result = c.migrate_loyalty_kotlin(source, {})
        self.assertEqual(source.replace(OLD, PACKAGE), result)
        self.assertEqual(result, c.migrate_loyalty_kotlin(result, {}))

    def test_package_replacement_does_not_change_sql_comments_or_literal_identifiers(self):
        source = f'package {OLD}\nval sql = "SELECT * FROM comeback_migrations"\nval text = "{OLD}"\n// import {OLD}.Thing\n'
        result = c.migrate_loyalty_kotlin(source, {})
        self.assertEqual(source.replace('package '+OLD, 'package '+PACKAGE, 1), result)

    def test_already_correct_package_accepts_old_imports_and_adds_missing_import_once(self):
        source = f'package {PACKAGE}\nimport {OLD}.Thing\nfun localChange() = 123\n'
        operation = {'imports': ['kotlinx.serialization.encodeToString']}
        result = c.migrate_loyalty_kotlin(source, operation)
        self.assertIn('import '+PACKAGE+'.Thing', result)
        self.assertIn('fun localChange() = 123', result)
        self.assertEqual(result, c.migrate_loyalty_kotlin(result, operation))
        self.assertEqual(1, result.count('import kotlinx.serialization.encodeToString'))

    def test_changed_environment_expression_is_preserved_outside_bounded_edit(self):
        source = f'package {OLD}\nfun second() = "custom"\nval profile = env [\n "COMEBACK_PROFILE"\n ]\n'
        operation = {'edits': [{'before':'"COMEBACK_PROFILE"', 'after':'"LOYALTY_PROFILE"'}]}
        result = c.migrate_loyalty_kotlin(source, operation)
        self.assertIn('fun second() = "custom"', result)
        self.assertIn('env [\n "LOYALTY_PROFILE"\n ]', result)
        self.assertEqual(result, c.migrate_loyalty_kotlin(result, operation))

    def test_foreign_namespace_aborts_all_changes_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'src').mkdir(); evidence = root/'evidence'
            a = root/'src/A.kt'; b = root/'src/B.kt'
            a.write_text('package '+OLD+'\n'); b.write_text('package my.custom.domain\n')
            updates = {name:{'mode':'loyalty_kotlin'} for name in ['src/A.kt','src/B.kt']}
            with self.assertRaises(RuntimeError): c.apply_updates(root, updates, evidence)
            self.assertEqual('package '+OLD+'\n', a.read_text())
            self.assertEqual('package my.custom.domain\n', b.read_text())

    def test_brand_change_preserves_scanner_api_storage_keys_and_custom_ui(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'src').mkdir()
            p = root/'src/app.js'; p.write_text('const title="Comeback"; startComebackScanner(); const key="comeback_session";\n// custom\n')
            operation = {'src/app.js':{'mode':'product_label'}}
            c.apply_updates(root, operation, root/'evidence')
            self.assertEqual('const title="Loyalty"; startComebackScanner(); const key="comeback_session";\n// custom\n',p.read_text())
            self.assertEqual([],c.apply_updates(root, operation, root/'evidence'))

    def test_gradle_plugin_addition_survives_formatting_and_preserves_custom_dependencies(self):
        original = 'plugins {\n alias ( libs.plugins.kotlin.jvm )\n alias(ktorLibs.plugins.ktor)\n}\n// my dependency\ndependencies { implementation("my:custom:1.0") }\n'
        before = 'alias(libs.plugins.kotlin.jvm)'
        after = before+'\n    alias(libs.plugins.kotlin.serialization)'
        result = c.replace_kotlin_fragment(original,before,after)
        self.assertIn('implementation("my:custom:1.0")',result)
        self.assertIn('// my dependency',result)
        self.assertEqual(result,c.replace_kotlin_fragment(result,before,after))


if __name__ == '__main__':
    unittest.main()
