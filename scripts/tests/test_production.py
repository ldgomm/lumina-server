"""Fictional data and simulated process boundaries. Live deployment is a separate gate."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import production as p

class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='lumina-prod-test-');self.addCleanup(self.temp.cleanup)
        # macOS can expose the system temporary directory through /var → /private/var.
        self.root = Path(self.temp.name).resolve(strict=True)
        self.data = self.root/'agency'
        self.data.mkdir(mode=0o700)
        with sqlite3.connect(self.data/'agency.sqlite') as db:
            db.executescript("PRAGMA user_version=12; CREATE TABLE accounts(id TEXT,kind TEXT); INSERT INTO accounts VALUES('a','AGENCY'); CREATE TABLE companies(id TEXT,loyalty_tenant TEXT);")
        (self.data/'agency.sqlite').chmod(0o600);p.write_private(self.data/'agency.key',bytes([6])*32)
        self.n={k:'fictional-'+k for k in p.NATIVE_NAMES}
        self.n.update(DATABASE_URL='jdbc:postgresql://127.0.0.1:5432/lumina',DATABASE_USER='lumina',DATABASE_PASSWORD='fictional-db',IDENTITY_PEPPER='P'*48,PLATFORM_ADMIN_TOKEN='T'*48,WALLET_DATA_KEY=base64.b64encode(bytes([7])*32).decode(),PUBLIC_BASE_URL='https://wallet.example.com',APPLE_PASS_TYPE_ID='pass.com.example.lumina',APPLE_TEAM_ID='ABCDEFGHIJ',GOOGLE_WALLET_ISSUER_ID='123456',APPLE_WALLET_ENABLED='true',GOOGLE_WALLET_ENABLED='true',APPLE_P12_PASSWORD='fictional-p12')
        for key in p.MATERIAL:
            path=self.root/key;p.write_private(path,json.dumps({'type':'service_account','client_email':'test@example.test','private_key':'fictional'}) if key=='GOOGLE_WALLET_SERVICE_ACCOUNT_PATH' else 'fictional');self.n[key]=str(path)
        for name in ['backups','releases','runtime','identity']:(self.root/name).mkdir(mode=0o700)
        self.c={'native':self.n,'portal':{'LUMINA_ORIGIN':'https://portal.example.com','LUMINA_DATA_DIR':str(self.data),'LUMINA_LOYALTY_ADMIN_TOKEN':'T'*48},'identity_file':str(self.root/'identity/continuity.json'),'backup_dir':str(self.root/'backups'),'release_root':str(self.root/'releases'),'runtime_dir':str(self.root/'runtime')}
        self.config=self.root/'production.json';p.save_json(self.config,self.c);self.c['_path']=str(self.config)
    def pg(self,c,sql):
        if 'json_build_object' in sql:return json.dumps({'name':'lumina','created':'123','versions':list(range(1,18))})
        if 'fingerprint' in sql:return p.digest(bytes([7])*32)
        return '0'
    def sealed(self):
        with patch.object(p,'pg',self.pg):return p.seal(self.c)
    def candidate(self):
        d=self.root/'releases/candidate';d.mkdir();p.write_private(d/'app','candidate')
        files={'app':p.digest('candidate')};m={'files':files,'sha':p.digest(json.dumps(files,sort_keys=True,separators=(',',':')))};p.save_json(d/'release.json',m)
        return d,m
    def verified(self,seal):
        d=self.root/'backups/b';d.mkdir(mode=0o700);p.write_private(d/'wallet.dump','fictional')
        p.write_private(d/'agency.sqlite',(self.data/'agency.sqlite').read_bytes());m={'seal_sha':p.digest(json.dumps(seal,sort_keys=True)),'files':{'wallet.dump':p.digest('fictional'),'agency.sqlite':p.digest((d/'agency.sqlite').read_bytes())}};p.save_json(d/'backup.json',m)
        p.save_json(d/'verified.json',{'status':'RESTORE_PASS','checked':time.time(),'seal_sha':p.digest(json.dumps(seal,sort_keys=True)),'backup_manifest':p.digest((d/'backup.json').read_bytes())});return d
    def test_config_requires_explicit_private_data_and_origins(self):
        self.assertEqual(p.load_config(self.config)['native'],self.n)
    def test_public_config_is_rejected(self):
        self.config.chmod(0o644)
        with self.assertRaises(p.Blocked):p.load_config(self.config)
    def test_symlink_material_rejected(self):
        a=self.root/'link';a.symlink_to(self.data/'agency.key')
        with self.assertRaises(p.Blocked):p.private(a)
    def test_temporary_urls_rejected(self):
        for u in ['https://bad_host.example.com','https://-bad.example.com','https://wallet.example.com.','http://wallet.example.com','https://one.trycloudflare.com','https://127.0.0.1','https://x.ngrok-free.app','https://user@wallet.example.com','https://wallet.example.com/a','https://wallet.example.com?x=1']:
            self.assertFalse(p.stable_origin(u))
    def test_seal_is_explicit_and_never_overwritten(self):
        s=self.sealed();self.assertEqual(s['format'],1)
        with patch.object(p,'pg',self.pg),self.assertRaises(p.Blocked):p.seal(self.c)
    def test_seal_does_not_contain_raw_secrets(self):
        self.sealed();text=Path(self.c['identity_file']).read_text()
        for k in ('IDENTITY_PEPPER','PLATFORM_ADMIN_TOKEN','WALLET_DATA_KEY'):self.assertNotIn(self.n[k],text)
    def test_all_native_identities_are_pinned(self):
        self.sealed()
        for k in p.NATIVE_NAMES:
            c={**self.c,'native':{**self.n,k:'changed'}}
            with patch.object(p,'pg',self.pg),self.assertRaises(Exception):p.check(c)
    def test_missing_database_is_not_created(self):
        (self.data/'agency.sqlite').unlink()
        with self.assertRaises(p.Blocked):p.load_config(self.config)
        self.assertFalse((self.data/'agency.sqlite').exists())
    def test_schema_change_blocks_deployment(self):
        self.sealed()
        with patch.object(p,'pg',self.pg),patch.object(p,'sql_hashes',return_value={'new.sql':'different'}),self.assertRaises(p.Blocked):p.check(self.c)
    def test_previous_portal_schema_requires_planned_migration_without_creating_a_seal(self):
        with sqlite3.connect(self.data/'agency.sqlite') as db:db.execute('PRAGMA user_version=8')
        with patch.object(p,'pg',self.pg),self.assertRaisesRegex(p.Blocked,'PORTAL_MIGRATION_REQUIRED'):p.seal(self.c)
        self.assertFalse(Path(self.c['identity_file']).exists())
        with sqlite3.connect(self.data/'agency.sqlite') as db:self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],8)
    def test_new_certificate_with_same_identifiers_is_allowed(self):
        self.sealed();p.write_private(self.n['APPLE_P12_PATH'],'renewed certificate')
        with patch.object(p,'pg',self.pg):p.check(self.c)
    def test_existing_key_mismatch_prevents_first_seal(self):
        with patch.object(p,'pg',lambda c,sql:'wrong' if 'fingerprint' in sql else self.pg(c,sql)),self.assertRaises(p.Blocked):p.seal(self.c)
    def test_existing_pass_type_mismatch_prevents_first_seal(self):
        with patch.object(p,'pg',lambda c,sql:'1' if 'FROM wallet_passes' in sql else self.pg(c,sql)),self.assertRaises(p.Blocked):p.seal(self.c)
    def test_staging_database_cannot_be_production(self):
        self.c['native']['DATABASE_URL']='jdbc:postgresql://127.0.0.1/loyalty_staging'
        with self.assertRaises(p.Blocked):p.pg_env(self.c)
    def test_credentials_are_environment_not_psql_arguments(self):
        calls=[]
        with patch.object(p,'run',lambda argv,env=None,**kw:(calls.append((argv,env)) or b'0')):p.pg(self.c,'SELECT 1')
        self.assertNotIn(self.n['DATABASE_PASSWORD'],' '.join(calls[0][0]));self.assertEqual(calls[0][1]['PGPASSWORD'],self.n['DATABASE_PASSWORD'])
    def test_candidate_tampering_is_rejected(self):
        d,m=self.candidate();self.assertEqual(p.release_manifest(d)['sha'],m['sha']);p.write_private(d/'app','changed')
        with self.assertRaises(p.Blocked):p.release_manifest(d)
    def test_incomplete_wallet_readiness_is_rejected(self):
        with patch.object(p,'http_json',return_value={'status':'UP','wallet':{'apple':True,'google':False},'release':'s'}),self.assertRaises(p.Blocked):p.ready(self.c,'blue','s')
    def test_wrong_release_is_rejected(self):
        with patch.object(p,'http_json',return_value={'status':'UP','wallet':{'apple':True,'google':True},'release':'old'}),self.assertRaises(p.Blocked):p.ready(self.c,'blue','new')
    def test_gateway_reuses_exact_wallet_allowlist_and_loopback_only(self):
        g=p.gateway(self.c,'green','a'*64)
        self.assertIn('listen 127.0.0.1:8101;',g);self.assertIn('127.0.0.1:9201',g);self.assertIn('127.0.0.1:9299',g);self.assertIn('if ($allowed = 0) { return 404; }',g);self.assertNotIn('0.0.0.0',g);self.assertNotIn('/api/platform',g)
    def test_switch_failure_before_ready_preserves_active_configuration(self):
        s=self.sealed();d,m=self.candidate();b=self.verified(s);runtime=Path(self.c['runtime_dir']);p.write_private(runtime/'nginx.conf','active');p.save_json(runtime/'active.json',{'slot':'blue'})
        with patch.object(p,'check',return_value=s),patch.object(p,'ready',side_effect=p.Blocked('NOT_READY')),patch.object(p,'run') as run,self.assertRaises(p.Blocked):p.switch(self.c,d,'green',b)
        self.assertEqual((runtime/'nginx.conf').read_text(),'active');run.assert_not_called()
    def test_reload_failure_restores_previous_routing_without_stopping_services(self):
        s=self.sealed();d,m=self.candidate();b=self.verified(s);runtime=Path(self.c['runtime_dir']);p.write_private(runtime/'nginx.conf','active');p.save_json(runtime/'active.json',{'slot':'blue'});calls=[]
        def run(argv,**kw):
            calls.append(argv)
            if '-s' in argv and sum('-s' in v for v in calls)==1:raise p.Blocked('RELOAD_FAILED')
            return b''
        with patch.object(p,'check',return_value=s),patch.object(p,'ready'),patch.object(p,'run',run),self.assertRaises(p.Blocked):p.switch(self.c,d,'green',b)
        self.assertEqual((runtime/'nginx.conf').read_text(),'active');self.assertFalse(any('stop' in a or 'down' in a for a in calls));self.assertEqual(len([a for a in calls if '-s' in a]),2)
    def test_cannot_replace_active_slot(self):
        s=self.sealed();d,m=self.candidate();b=self.verified(s);p.save_json(Path(self.c['runtime_dir'])/'active.json',{'slot':'blue'})
        with patch.object(p,'check',return_value=s),self.assertRaises(p.Blocked):p.switch(self.c,d,'blue',b)
    def test_restore_evidence_must_be_recent(self):
        s=self.sealed();d,m=self.candidate();b=self.verified(s);v=json.loads((b/'verified.json').read_text());v['checked']=time.time()-90000;p.save_json(b/'verified.json',v)
        with patch.object(p,'check',return_value=s),self.assertRaises(p.Blocked):p.switch(self.c,d,'green',b)
    def test_changed_backup_cannot_authorize_deployment(self):
        s=self.sealed();d,m=self.candidate();b=self.verified(s);p.write_private(b/'wallet.dump','corrupt')
        with patch.object(p,'check',return_value=s),self.assertRaises(p.Blocked):p.switch(self.c,d,'green',b)
    def test_backup_uses_online_sqlite_backup_and_pg_dump(self):
        s=self.sealed();calls=[]
        def run(argv,*args,**kw):
            calls.append(argv)
            if argv[0]=='pg_dump':p.write_private(Path(argv[-1]),b'fictional dump')
            return b''
        with patch.object(p,'check',return_value=s),patch.object(p,'run',run):result=p.backup(self.c)
        d=Path(result['backup']);self.assertEqual(result['restore_test'],'PENDING');self.assertEqual((d/'agency.key').read_bytes(),(self.data/'agency.key').read_bytes());self.assertEqual((d/'wallet.dump').stat().st_mode&0o777,0o600)
        with sqlite3.connect(d/'agency.sqlite') as db:self.assertEqual(db.execute('SELECT id FROM accounts').fetchone()[0],'a')
        self.assertEqual(calls[0][0],'pg_dump');self.assertNotIn('restore',calls[0])
    def test_restore_runs_only_in_fresh_isolated_container(self):
        s=self.sealed();b=self.verified(s);calls=[]
        def run(argv,*args,**kw):
            calls.append(argv)
            if 'SELECT count(*) FROM comeback_migrations' in argv:return b'17\n'
            if any('lumina_business_registrations' in a for a in argv):return b'[]\n'
            return b'container\n'
        with patch.object(p,'check',return_value=s),patch.object(p,'run',run):result=p.verify_backup(self.c,b)
        self.assertEqual(result['status'],'RESTORE_PASS');first=calls[0];self.assertIn('--network',first);self.assertIn('none',first);self.assertIn('--tmpfs',first);self.assertNotIn('-p',first);self.assertNotIn('-v',first)
        self.assertTrue(all('loyalty-staging' not in ' '.join(a) for a in calls));self.assertEqual(calls[-1][:3],['docker','rm','-f'])
    def test_prepare_gateway_refuses_existing_configuration(self):
        s=self.sealed();d,m=self.candidate();p.write_private(Path(self.c['runtime_dir'])/'nginx.conf','live')
        with patch.object(p,'check',return_value=s),patch.object(p,'run') as run,self.assertRaises(p.Blocked):p.prepare_gateway(self.c,d,'green')
        run.assert_not_called()
    def test_prepare_gateway_checks_candidate_before_creating_routes(self):
        s=self.sealed();d,m=self.candidate()
        with patch.object(p,'check',return_value=s),patch.object(p,'ready',side_effect=p.Blocked('NOT_READY')),self.assertRaises(p.Blocked):p.prepare_gateway(self.c,d,'green')
        self.assertFalse((Path(self.c['runtime_dir'])/'nginx.conf').exists())
    def test_package_requires_complete_matching_checkpoint(self):
        report=self.root/'receipt.json';p.save_json(report,{'core_status':'FAIL'})
        with self.assertRaises(p.Blocked):p.package(self.c,report)

    def test_packaged_portal_loads_shared_business_categories_without_source_checkout(self):
        import checkpoint
        import shutil
        import subprocess
        source=self.root/'source';sql=source/'src/main/resources/com/premierdarkcoffee/loyalty'
        shutil.copytree(p.SQL_ROOT/'lumina',sql/'lumina')
        (sql/'businesses').mkdir()
        shutil.copy2(p.SQL_ROOT/'businesses/business-categories.json',sql/'businesses/business-categories.json')
        (source/'build/install/loyalty/bin').mkdir(parents=True)
        (source/'build/install/loyalty/bin/loyalty').write_text('# fictional distribution\n')
        (source/'scripts').mkdir()
        for name in ('production.py','wallet_local.py','wallet_config.py','staging.py','checkpoint.py'):
            shutil.copy2(p.ROOT/'scripts'/name,source/'scripts'/name)
        (source/'.env').write_text('PRIVATE_TEST_MARKER=not-for-release\n')
        commit='a'*40;manifest={'source':'checked'}
        receipt=self.root/'complete.json'
        p.save_json(receipt,{'core_status':'CORE_TESTS_PASS','auto_commit':{'status':'CREATED','hash':commit},'tested_manifest':manifest})
        def run(argv,**kwargs):
            if argv[0]=='git':return commit.encode()
            self.assertEqual(argv[0],str(source/'gradlew'));return b''
        with patch.object(p,'ROOT',source),patch.object(p,'SQL_ROOT',sql),patch.object(p,'run',run),patch.object(checkpoint,'snapshot',return_value={}),patch.object(checkpoint,'manifest',return_value=manifest):
            result=p.package(self.c,receipt)
        release=Path(result['release'])
        shutil.rmtree(source)
        checked=p.release_manifest(release)
        self.assertIn('businesses/business-categories.json',checked['files'])
        self.assertNotIn('.env',checked['files'])
        loaded=subprocess.run(['node','--input-type=module','-e',"const m=await import(process.argv[1]);console.log(m.businessCategory('CAFE'));",(release/'portal/businesses/categories.mjs').as_uri()],capture_output=True,text=True,timeout=15)
        self.assertEqual(loaded.returncode,0,loaded.stderr)
        self.assertEqual(loaded.stdout,'CAFE\n')

if __name__=='__main__':unittest.main()
