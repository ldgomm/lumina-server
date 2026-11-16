import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
s=module('staging');c=module('checkpoint')

class StagingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):
        self.temp.cleanup()
    def config(self):
        return s.init_config(self.root)[0]
    def test_config_is_private_and_repeat_does_not_change_any_key_or_port(self):
        values,created=s.init_config(self.root,8097);self.assertTrue(created)
        raw=(self.root/'.env').read_bytes()
        again,created=s.init_config(self.root,8098);self.assertFalse(created);self.assertEqual(values,again)
        self.assertEqual(raw,(self.root/'.env').read_bytes());self.assertEqual(0o600,(self.root/'.env').stat().st_mode&0o777)
        self.assertEqual(len(s.SECRET_NAMES),len({values[k] for k in s.SECRET_NAMES}))
    def test_missing_config_with_existing_docker_data_is_not_regenerated(self):
        with self.assertRaises(RuntimeError):s.init_config(self.root,existing_resources=True)
        self.assertFalse((self.root/'.env').exists())
    def test_invalid_values_duplicate_keys_and_symlink_are_rejected(self):
        self.config();p=self.root/'.env';raw=p.read_text()
        p.write_text(raw+'LOYALTY_HTTP_PORT=8097\n')
        with self.assertRaises(RuntimeError):s.read_config(self.root)
        p.write_text(raw.replace('LOYALTY_HTTP_PORT=8097','LOYALTY_HTTP_PORT=80'))
        with self.assertRaises(RuntimeError):s.read_config(self.root)
        p.unlink();p.symlink_to(self.root/'external')
        with self.assertRaises(RuntimeError):s.init_config(self.root)
    def test_explicit_compose_environment_wins_over_ambient_staging_and_project_values(self):
        values=self.config()
        with patch.dict(os.environ,{'STAGING_ADMIN_TOKEN':'unrelated','COMPOSE_FILE':'unrelated.yml','COMPOSE_PROJECT_NAME':'nexo','LOYALTY_SOURCE_SHA':'stale'}):
            env=s.environment(values,'f'*64)
        self.assertEqual(values['STAGING_ADMIN_TOKEN'],env['STAGING_ADMIN_TOKEN']);self.assertNotIn('COMPOSE_FILE',env);self.assertNotIn('COMPOSE_PROJECT_NAME',env);self.assertEqual('f'*64,env['LOYALTY_SOURCE_SHA'])
        command=s.compose(self.root,'up','-d');self.assertIn('loyalty-staging',command);self.assertIn(str(self.root/'docker-compose.staging.yml'),command)
    def test_private_access_page_is_excluded_from_evidence_and_logs_redact_credentials(self):
        values=self.config();file=s.write_access(self.root,values)
        self.assertEqual(0o600,file.stat().st_mode&0o777);self.assertTrue(all(value not in file.read_text() for value in [values[k] for k in s.SECRET_NAMES]));self.assertIn('Abrir Lúmina Digital',file.read_text());self.assertNotIn('Demo',file.read_text())
        self.assertFalse(c.allowed('.env'));self.assertFalse(c.allowed('.local-staging/access.html'))
        raw=' '.join(values[k] for k in s.SECRET_NAMES)+' Bearer abcdef123456 token=abcdef123456'
        cleaned=s.clean(raw,[values[k] for k in s.SECRET_NAMES]);self.assertTrue(all(values[k] not in cleaned for k in s.SECRET_NAMES));self.assertNotIn('abcdef123456',cleaned)
        runner=s.Runner(self.root,values)
        with patch.object(s.subprocess,'run',side_effect=subprocess.TimeoutExpired(['docker'],1,output=('partial '+values['STAGING_ADMIN_TOKEN']).encode())):
            with self.assertRaises(RuntimeError):runner.run('build_timeout',['docker'],1)
        log=(runner.logs/'build_timeout.log').read_text();self.assertIn('partial',log);self.assertNotIn(values['STAGING_ADMIN_TOKEN'],log)
    def test_source_fingerprint_tracks_docker_inputs_and_ignores_private_runtime_files(self):
        (self.root/'scripts').mkdir();shutil.copy2(SCRIPTS/'checkpoint.py',self.root/'scripts/checkpoint.py')
        p=self.root/'Dockerfile';p.write_text('FROM example\n');first=s.source_fingerprint(self.root)
        self.config();s.write_access(self.root,s.read_config(self.root));self.assertEqual(first,s.source_fingerprint(self.root))
        p.write_text('FROM different\n');self.assertNotEqual(first,s.source_fingerprint(self.root))
        self.assertTrue(c.allowed('docker-compose.staging.yml'));self.assertTrue(c.allowed('.dockerignore'))
        c.git(self.root,'init');obsolete=self.root/'README.md';obsolete.write_text('Old source');c.git(self.root,'add','README.md');obsolete.unlink()
        missing=s.source_fingerprint(self.root);c.git(self.root,'rm','--cached','README.md');self.assertEqual(missing,s.source_fingerprint(self.root))
    def test_staging_checkpoint_gate_rejects_absent_failed_or_incomplete_report(self):
        folder=self.root/'evidence';folder.mkdir()
        for code,result in [(0,None),(0,{'status':'LOCAL_STAGING_FAILED'}),(1,{'status':'LOCAL_STAGING_PASS','http_checks':'PASS','source_sha':'f'*64}),(0,{'status':'LOCAL_STAGING_PASS','http_checks':'FAIL','source_sha':'f'*64})]:
            destination=folder/'attempt_staging.json';destination.unlink(missing_ok=True)
            def run(*args):
                if result is not None:destination.write_text(json.dumps(result))
                return code
            with self.assertRaises(RuntimeError):c.check_staging(self.root,folder,run,'attempt_',{})
        result={'status':'LOCAL_STAGING_PASS','http_checks':'PASS','source_sha':'f'*64}
        def passing(*args):
            (folder/'attempt_staging.json').write_text(json.dumps(result));return 0
        self.assertEqual(result,c.check_staging(self.root,folder,passing,'attempt_',{}))
    def test_verify_rejects_wrong_running_instance_before_using_any_credentials(self):
        values=self.config();r=s.Runner(self.root,values)
        with patch.object(r,'api',return_value={'instance':'another','profile':'local-staging','sourceSha':'f'*64}) as api:
            with self.assertRaises(RuntimeError):r.verify('f'*64)
            api.assert_called_once_with('/api/staging/info')

    def test_old_staging_volume_without_env_blocks_pilot_but_not_isolated_deployment(self):
        commands=[]
        def docker(command,**kwargs):
            commands.append((command,kwargs.get('env',{})))
            output=''
            if 'label=com.docker.compose.project=loyalty-staging' in command:
                output='loyalty-staging_loyalty-staging-data\n'
            elif '--services' in command:
                output='loyalty-db\nloyalty-server\n'
            elif 'images' in command:
                output='sha256:test\n'
            return subprocess.CompletedProcess(command,0,output.encode())
        report=self.root/'report.json'
        def verify(runner,source):
            self.assertEqual(runner.values,s.read_config(self.root))
            runner.report.update(status='LOCAL_STAGING_PASS',source_sha=source,http_checks='PASS')
        args=['start','--project',str(self.root),'--no-browser','--report',str(report)]
        with patch.object(s.shutil,'which',return_value='/fixture/docker'),patch.object(s.subprocess,'run',side_effect=docker),patch.object(s,'source_fingerprint',return_value='f'*64),patch.object(s.Runner,'verify',verify),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(s.main(args),1)
            self.assertFalse((self.root/'.env').exists())
            self.assertIn('sin .env',json.loads(report.read_text())['error'])
            commands.clear()
            with patch.dict(os.environ,{s.RUN_VARIABLE:'a'*24}):
                self.assertEqual(s.main(args),0)
                name=s.project_name(self.root);config=s.config_root(self.root)/'.env'
                raw=config.read_bytes();values=s.read_config(self.root)
                self.assertNotEqual(values['LOYALTY_HTTP_PORT'],'8097')
                self.assertEqual(config.stat().st_mode&0o777,0o600)
                self.assertEqual(s.main(args),0)
                self.assertEqual(raw,config.read_bytes())
                self.assertFalse((self.root/'.env').exists())
                self.assertFalse(c.allowed(str(config.relative_to(self.root))))
                for command,env in commands:
                    self.assertNotIn('label=com.docker.compose.project=loyalty-staging',command)
                    self.assertNotIn('rm',command);self.assertNotIn('down',command)
                    if command[:2]==['docker','compose'] and '--project-name' in command:
                        self.assertIn(name,command);self.assertIn(str(config),command)
                        self.assertEqual(env['LOYALTY_STAGING_IMAGE'],s.server_image(self.root))

    def test_isolated_data_without_its_own_env_still_refuses_new_secrets(self):
        with patch.dict(os.environ,{s.RUN_VARIABLE:'a'*24}):
            runner=s.Runner(self.root)
            with patch.object(runner,'run',return_value=(0,'existing-private-volume')):
                with self.assertRaisesRegex(RuntimeError,'sin .env'):
                    s.init_config(self.root,existing_resources=s.resources_exist(runner))
            self.assertFalse((s.config_root(self.root)/'.env').exists())

    def test_isolation_preserves_local_config_and_separates_source_trees_runs_and_images(self):
        original=self.config();raw=(self.root/'.env').read_bytes()
        names=set();images=set()
        for run_id in ('a'*24,'b'*24):
            with patch.dict(os.environ,{s.RUN_VARIABLE:run_id,'LOYALTY_STAGING_IMAGE':'foreign-image'}):
                values=s.init_config(self.root)[0]
                self.assertNotEqual(values['STAGING_IDENTITY_PEPPER'],original['STAGING_IDENTITY_PEPPER'])
                names.add(s.project_name(self.root));images.add(s.environment(values,root=self.root)['LOYALTY_STAGING_IMAGE'])
                self.assertNotEqual(s.project_name(self.root),s.project_name(self.root/'other'))
        self.assertEqual(len(names),2);self.assertEqual(len(images),2)
        self.assertEqual((self.root/'.env').read_bytes(),raw)
        self.assertEqual(s.project_name(self.root),'loyalty-staging')

    def test_isolation_rejects_path_injection_and_symlinked_private_parent(self):
        for invalid in ('../escape','loyalty-staging','A'*24,'a'*23):
            with patch.dict(os.environ,{s.RUN_VARIABLE:invalid}):
                with self.assertRaises(RuntimeError):s.init_config(self.root)
        external=self.root/'external';external.mkdir();(self.root/'.local-staging').symlink_to(external)
        with patch.dict(os.environ,{s.RUN_VARIABLE:'a'*24}):
            with self.assertRaisesRegex(RuntimeError,'enlace'):s.init_config(self.root)
        self.assertEqual(list(external.iterdir()),[])

    def test_checkpoint_keeps_original_staging_error_and_failed_report(self):
        result={'status':'LOCAL_STAGING_FAILED','error':'Existing private configuration is missing','checks':{'existing_0':{'exit_code':0}}}
        def failed(*args):
            (self.root/'attempt_staging.json').write_text(json.dumps(result));return 1
        with self.assertRaisesRegex(c.StagingFailure,'Existing private configuration is missing') as error:
            c.check_staging(self.root,self.root,failed,'attempt_',{})
        self.assertEqual(error.exception.result,result)
