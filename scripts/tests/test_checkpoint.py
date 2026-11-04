import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('checkpoint', Path(__file__).resolve().parents[1]/'checkpoint.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='loyalty-workflow-test-')
        self.root = Path(self.temp.name)
        self.project = self.root/'project'
        self.project.mkdir()
        self.evidence = self.root/'evidence'
        self.evidence.mkdir()
        self.write('src/main/kotlin/App.kt', 'fun main() { println("hello") }\n')
        self.write('.gitignore', '.env\n.kotlin/\n')
        self.g('init')
        self.g('config', 'user.name', 'Checkpoint Test')
        self.g('config', 'user.email', 'checkpoint-test@example.invalid')
        self.g('config', 'commit.gpgsign', 'false')
        self.g('config', 'core.hooksPath', str(self.root/'empty-hooks'))

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, value):
        p = self.project/name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(value)
        return p

    def g(self, *args, check=True):
        return c.git(self.project, *args, check=check)

    def checkpoint(self, run_id='test-run', tested=None, validation=None):
        return c.create_checkpoint(self.project, tested or c.snapshot(self.project), self.evidence, run_id, validation or {'status':'CORE_TESTS_PASS','tests':c.TOTAL_TESTS,'staging':'LOCAL_STAGING_PASS'})

    def test_initial_commit_preserves_staged_secret_without_including_it(self):
        self.write('.env', 'PRIVATE_VALUE=only-local\n')
        self.g('add', '-f', '.env')
        self.write('.kotlin/cache.salive', 'cache')
        result = self.checkpoint()
        self.assertEqual(result['hash'], self.g('rev-parse','HEAD').stdout.decode().strip())
        self.assertNotEqual(0, self.g('cat-file','-e','HEAD:.env',check=False).returncode)
        self.assertIn('.env', self.g('diff','--cached','--name-only').stdout.decode())
        self.assertNotIn('.kotlin', self.g('ls-tree','-r','--name-only','HEAD').stdout.decode())
        self.assertEqual(b'', self.g('diff','--name-only','--','src').stdout)

    def test_repeated_pass_creates_a_checkpoint_without_rewriting_history(self):
        first = self.checkpoint('first')
        second = self.checkpoint('second')
        self.assertNotEqual(first['hash'], second['hash'])
        self.assertEqual(first['hash'], second['parent'])
        self.assertEqual(first['tree'], second['tree'])

    def test_partial_or_failed_validation_never_commits(self):
        for result in ({'status':'UNIT_PASS','tests':23},{'status':'CORE_TESTS_PASS','tests':c.TOTAL_TESTS-1},{'status':'FAIL','tests':c.TOTAL_TESTS},{'status':'CORE_TESTS_PASS','tests':c.TOTAL_TESTS,'staging':'LOCAL_STAGING_FAILED'}):
            with self.assertRaises(RuntimeError):
                self.checkpoint(validation=result)
        self.assertNotEqual(0, self.g('rev-parse','--verify','HEAD',check=False).returncode)

    def test_edits_after_validation_are_not_committed(self):
        tested = c.snapshot(self.project)
        self.write('src/main/kotlin/App.kt', 'fun main() { println("different") }\n')
        with self.assertRaises(RuntimeError):
            self.checkpoint(tested=tested)
        self.assertNotEqual(0, self.g('rev-parse','--verify','HEAD',check=False).returncode)

    def test_staging_outside_scope_survives_existing_repo_commit(self):
        self.write('private-notes.txt','original\n')
        self.g('add','private-notes.txt')
        self.g('commit','-m','Existing unrelated history')
        self.write('private-notes.txt','staged change\n')
        self.g('add','private-notes.txt')
        staged = self.g('rev-parse',':private-notes.txt').stdout
        self.checkpoint()
        self.assertEqual(staged, self.g('rev-parse',':private-notes.txt').stdout)
        self.assertEqual(b'original\n',self.g('show','HEAD:private-notes.txt').stdout)

    def test_nested_project_commit_only_changes_project_scope(self):
        outer = self.project
        self.write('outer-notes.txt','outside\n')
        self.g('add','outer-notes.txt')
        self.g('commit','-m','Outer')
        self.project = outer/'apps'/'loyalty'
        self.project.mkdir(parents=True)
        self.write('src/main/kotlin/App.kt','fun main() = Unit\n')
        self.write('.gitignore','.env\n')
        result = self.checkpoint()
        names = c.git(outer,'diff-tree','--no-commit-id','--name-only','-r',result['hash']).stdout.decode().splitlines()
        self.assertTrue(names)
        self.assertTrue(all(n.startswith('apps/loyalty/') for n in names),names)
        self.assertEqual(b'',self.g('diff','--name-only').stdout)

    def test_existing_git_index_lock_is_preserved(self):
        path = self.project/'.git/index.lock'
        path.write_text('another process')
        with self.assertRaises(FileExistsError):
            self.checkpoint()
        self.assertEqual('another process',path.read_text())

    def test_detached_head_is_not_changed(self):
        self.checkpoint()
        self.g('checkout','--detach','HEAD')
        head = self.g('rev-parse','HEAD').stdout
        with self.assertRaises(RuntimeError):
            self.checkpoint('detached')
        self.assertEqual(head,self.g('rev-parse','HEAD').stdout)

    def test_kotlin_fragment_accepts_reformat_and_keeps_other_text(self):
        source='// keep me\nval checksum = Security\n    .hash(\n        sql,\n    )\n// keep this too\n'
        changed=c.replace_kotlin_fragment(source,'Security.hash(sql)','SqlFingerprint.checksum(sql)')
        self.assertEqual('// keep me\nval checksum = SqlFingerprint.checksum(sql)\n// keep this too\n',changed)
        self.assertEqual(changed,c.replace_kotlin_fragment(changed,'Security.hash(sql)','SqlFingerprint.checksum(sql)'))
        self.assertEqual('first(); newer()',c.replace_kotlin_fragment('first()\nsecond()','first(); second()','first(); newer()'))

    def test_patch_repetition_does_not_duplicate_a_nested_original_fragment(self):
        before='db.migrate();val f=fixture();earn(f)'
        after='db.migrate(); updateLegacy(); db.migrate();val f=fixture();earn(f)'
        self.assertEqual(after,c.replace_kotlin_fragment(before,before,after))
        self.assertEqual(after,c.replace_kotlin_fragment(after,before,after))

    def test_real_kotlin_change_and_new_comments_are_not_overwritten(self):
        with self.assertRaises(RuntimeError):
            c.replace_kotlin_fragment('val x = Security.hash(other)','Security.hash(sql)','SqlFingerprint.checksum(sql)')
        with self.assertRaises(RuntimeError):
            c.replace_kotlin_fragment('Security.hash(/* important */ sql)','Security.hash(sql)','SqlFingerprint.checksum(sql)')

    def test_update_preflight_prevents_partial_write(self):
        self.write('src/main/kotlin/Database.kt','fun changed() = Unit\n')
        updates={
            'docs/new.md':{'mode':'new','content':base64.b64encode(b'new').decode()},
            'src/main/kotlin/Database.kt':{'mode':'kotlin_patch','edits':[{'before':'Security.hash(sql)','after':'SqlFingerprint.checksum(sql)'}]},
        }
        with self.assertRaises(RuntimeError):
            c.apply_updates(self.project,updates,self.evidence)
        self.assertFalse((self.project/'docs/new.md').exists())

    def test_unrelated_reformat_and_editorconfig_are_preserved(self):
        original='fun main() {\n    println("hello")\n}\n'
        self.write('src/main/kotlin/App.kt',original)
        self.write('.editorconfig','root = true\n[*]\nindent_size = 2\n')
        updates={'.editorconfig':{'mode':'create_if_missing','content':base64.b64encode(b'indent_size = 4').decode()}}
        self.assertEqual([],c.apply_updates(self.project,updates,self.evidence))
        self.assertEqual(original,(self.project/'src/main/kotlin/App.kt').read_text())
        self.assertIn('indent_size = 2',(self.project/'.editorconfig').read_text())

    def test_sensitive_files_and_private_key_contents_are_blocked(self):
        for name in ('.env','.env.local','.env.wallet','.env','.local-staging/access.html','.local-staging/logs/output.log','src/card.pkpass','src/passes.pkpasses','src/certificate.pfx','.local-demo.json','src/key.pem','src/service-account.json','.kotlin/sessions/a.salive'):
            self.assertFalse(c.allowed(name),name)
        self.assertTrue(c.allowed('.env.example'))
        self.write('src/config.txt','-----BEGIN '+'PRIVATE KEY-----\ndata\n')
        with self.assertRaises(RuntimeError):
            c.snapshot(self.project)

    def test_symlinked_source_is_not_silently_omitted(self):
        external=self.root/'external'
        external.mkdir()
        (self.project/'src/linked').symlink_to(external,target_is_directory=True)
        with self.assertRaises(RuntimeError):
            c.snapshot(self.project)


if __name__ == '__main__':
    unittest.main()
