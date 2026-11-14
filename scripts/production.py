#!/usr/bin/env python3
"""Production preparation and guarded rolling releases. No seeding, secret generation or automatic data restore.

All credentials live in an explicit private JSON file outside the checkout/releases.
Run --help. The CLI prints one result; operational details are retained privately.
"""
import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
NATIVE_NAMES = ('DATABASE_URL','DATABASE_USER','IDENTITY_PEPPER','PLATFORM_ADMIN_TOKEN','WALLET_DATA_KEY','PUBLIC_BASE_URL','APPLE_PASS_TYPE_ID','APPLE_TEAM_ID','GOOGLE_WALLET_ISSUER_ID')
PORTAL_NAMES = ('LUMINA_ORIGIN','LUMINA_DATA_DIR','LUMINA_LOYALTY_ADMIN_TOKEN')
MATERIAL = ('APPLE_P12_PATH','APPLE_WWDR_CERT_PATH','GOOGLE_WALLET_SERVICE_ACCOUNT_PATH')
SLOTS = {'blue':(9101,9199),'green':(9201,9299)}
SQL_ROOT = ROOT/'src/main/resources/com/premierdarkcoffee/loyalty'

class Blocked(RuntimeError): pass

def need(ok, code):
    if not ok: raise Blocked(code)

def digest(value):
    return hashlib.sha256(value if isinstance(value,bytes) else value.encode()).hexdigest()

def private(path, directory=False):
    p=Path(path)
    need(p.is_absolute(),'ABSOLUTE_PATH_REQUIRED')
    need(not any(part.is_symlink() for part in (p,*p.parents)),'SYMLINK_FORBIDDEN')
    need(p.is_dir() if directory else p.is_file(),'PRIVATE_PATH_MISSING')
    need(p.stat().st_mode & 0o077 == 0,'PRIVATE_PATH_PERMISSIONS')
    return p

def stable_origin(value):
    try:
        u=urllib.parse.urlsplit(value);host=u.hostname or ''
        if u.scheme!='https' or u.netloc!=host or u.path or u.query or u.fragment or '.' not in host:return False
        if len(host)>253 or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',label) for label in host.split('.')):return False
        try: ipaddress.ip_address(host);return False
        except ValueError: pass
        return not any(host==s or host.endswith('.'+s) for s in ('localhost','local','test','invalid','trycloudflare.com','ngrok.io','ngrok-free.app','localtunnel.me'))
    except (TypeError,ValueError):return False

def write_private(path,data,exclusive=False):
    path=Path(path)
    need(not any(p.is_symlink() for p in (path,*path.parents)),'SYMLINK_FORBIDDEN')
    mode='xb' if exclusive else 'wb'
    with path.open(mode) as f:
        os.chmod(path,0o600);f.write(data if isinstance(data,bytes) else data.encode());f.flush();os.fsync(f.fileno())

def save_json(path,value,exclusive=False):write_private(path,json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n',exclusive)

def load_config(path):
    p=private(path);need(p.stat().st_size<100_000,'CONFIG_TOO_LARGE')
    c=json.loads(p.read_text());need(isinstance(c,dict),'CONFIG_INVALID')
    n=c['native'];a=c['portal'];need(isinstance(n,dict) and isinstance(a,dict),'CONFIG_INVALID')
    need(all(isinstance(v,str) for v in [*n.values(),*a.values()]),'ENVIRONMENT_STRING_REQUIRED')
    need(all(n.get(k) for k in (*NATIVE_NAMES,*MATERIAL,'DATABASE_PASSWORD','APPLE_P12_PASSWORD')),'NATIVE_CONFIGURATION_REQUIRED')
    need(all(a.get(k) for k in PORTAL_NAMES),'PORTAL_CONFIGURATION_REQUIRED')
    need(stable_origin(n['PUBLIC_BASE_URL']) and stable_origin(a['LUMINA_ORIGIN']),'STABLE_HTTPS_REQUIRED')
    need(n['PUBLIC_BASE_URL']!=a['LUMINA_ORIGIN'],'SEPARATE_PUBLIC_WALLET_ORIGIN_REQUIRED')
    need(n.get('APPLE_WALLET_ENABLED')==n.get('GOOGLE_WALLET_ENABLED')=='true','BOTH_WALLETS_REQUIRED')
    need(not any(k.startswith(('STAGING_','DEMO_')) for k in (*n,*a)),'DEMO_CONFIG_FORBIDDEN')
    need(a['LUMINA_LOYALTY_ADMIN_TOKEN']==n['PLATFORM_ADMIN_TOKEN'],'INTEGRATION_TOKEN_MISMATCH')
    need(bool(re.fullmatch('[A-Za-z0-9_-]{32,128}',n['PLATFORM_ADMIN_TOKEN'])) and len(n['IDENTITY_PEPPER'])>=32 and n['IDENTITY_PEPPER']!=n['PLATFORM_ADMIN_TOKEN'],'IDENTITY_CONFIG_INVALID')
    need(len(base64.b64decode(n['WALLET_DATA_KEY'],validate=True))==32,'WALLET_KEY_INVALID')
    need(n['DATABASE_URL'].startswith('jdbc:postgresql://'),'DATABASE_URL_INVALID')
    for k in MATERIAL:private(n[k])
    google=json.loads(Path(n['GOOGLE_WALLET_SERVICE_ACCOUNT_PATH']).read_text())
    need(google.get('type')=='service_account' and google.get('client_email') and google.get('private_key'),'GOOGLE_CONFIG_INVALID')
    folder=private(a['LUMINA_DATA_DIR'],True)
    private(folder/'agency.sqlite');need(len(private(folder/'agency.key').read_bytes())==32,'AGENCY_KEY_INVALID')
    for key in ('identity_file','backup_dir','release_root','runtime_dir'):
        value=Path(c[key]);need(value.is_absolute() and not any(p.is_symlink() for p in (value,*value.parents)),'PRODUCTION_PATH_INVALID')
        # Data must survive replacement of any release and stay outside source control.
        need(not value.is_relative_to(ROOT) and (not ROOT.is_relative_to(value) or key=='release_root' and (ROOT/'release.json').is_file()),'PRODUCTION_PATH_INSIDE_SOURCE')
    for value in (p,folder,*[Path(n[k]) for k in MATERIAL],Path(c['identity_file']),Path(c['backup_dir']),Path(c['runtime_dir'])):
        need(not value.is_relative_to(Path(c['release_root'])) and not value.is_relative_to(ROOT),'PRIVATE_MATERIAL_INSIDE_RELEASE')
    need(not folder.is_relative_to(ROOT),'DATA_INSIDE_SOURCE')
    c['_path']=str(p);return c

def run(argv,env=None,timeout=60,input=None):
    result=subprocess.run(argv,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,timeout=timeout)
    need(result.returncode==0,'COMMAND_FAILED:'+Path(argv[0]).name)
    return result.stdout

def pg_env(c):
    n=c['native'];u=urllib.parse.urlsplit(n['DATABASE_URL'][5:])
    need(u.scheme=='postgresql' and u.hostname and u.path and not u.username and not u.password,'DATABASE_URL_INVALID')
    query=dict(urllib.parse.parse_qsl(u.query));need(set(query)<= {'sslmode','sslrootcert'},'JDBC_OPTIONS_REQUIRE_REVIEW')
    need(u.hostname in ('127.0.0.1','localhost','::1') or query.get('sslmode')=='verify-full','REMOTE_DATABASE_TLS_REQUIRED')
    e={k:v for k,v in os.environ.items() if not k.startswith('PG')}
    e.update(PGHOST=u.hostname,PGPORT=str(u.port or 5432),PGDATABASE=u.path.lstrip('/'),PGUSER=n['DATABASE_USER'],PGPASSWORD=n['DATABASE_PASSWORD'],PGCONNECT_TIMEOUT='10',PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=5000')
    if query.get('sslmode'):e['PGSSLMODE']=query['sslmode']
    if query.get('sslrootcert'):e['PGSSLROOTCERT']=query['sslrootcert']
    need('staging' not in e['PGDATABASE'].lower() and 'demo' not in e['PGDATABASE'].lower(),'STAGING_DATABASE_FORBIDDEN')
    return e

def pg(c,sql):return run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],pg_env(c)).decode().strip()

def sql_hashes(root=SQL_ROOT):
    return {p.relative_to(root).as_posix():digest(p.read_bytes()) for p in sorted(root.rglob('*.sql'))}

def observe(c):
    n=c['native'];a=c['portal'];folder=Path(a['LUMINA_DATA_DIR'])
    with sqlite3.connect((folder/'agency.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        need(db.execute('PRAGMA user_version').fetchone()[0]==9,'PORTAL_MIGRATION_REQUIRED')
        agency=db.execute("SELECT id FROM accounts WHERE kind='AGENCY' ORDER BY id LIMIT 1").fetchone()
        need(agency,'AGENCY_SETUP_REQUIRED')
        need(db.execute('PRAGMA quick_check').fetchone()[0]=='ok','PORTAL_DATABASE_CHECK_FAILED')
    database=json.loads(pg(c,"SELECT json_build_object('name',current_database(),'created',(SELECT floor(extract(epoch FROM applied_at)*1000)::bigint::text FROM comeback_migrations WHERE version=1),'versions',(SELECT array_agg(version ORDER BY version) FROM comeback_migrations))"))
    need(database.pop('versions')==list(range(1,17)) and database['created'],'WALLET_MIGRATION_REQUIRED')
    key=pg(c,'SELECT fingerprint FROM wallet_key_identity WHERE singleton=true')
    need(not key or key==digest(base64.b64decode(n['WALLET_DATA_KEY'])),'WALLET_KEY_CHANGED')
    # Validate identifiers against existing passes before pinning the first production configuration.
    pass_type=n['APPLE_PASS_TYPE_ID'];issuer=n['GOOGLE_WALLET_ISSUER_ID']
    need(bool(re.fullmatch(r'[A-Za-z0-9.-]+',pass_type)) and bool(re.fullmatch(r'[0-9]+',issuer)),'WALLET_BINDING_INVALID')
    mismatch=pg(c,"SELECT count(*) FROM wallet_passes WHERE (apple_type IS NOT NULL AND apple_type<>'"+pass_type+"') OR (google_id IS NOT NULL AND google_id NOT LIKE '"+issuer+".%')")
    need(mismatch=='0','EXISTING_PASS_BINDING_MISMATCH')
    return {'format':1,'native':{k:digest(n[k]) for k in NATIVE_NAMES},'portal':{**{k:digest(a[k]) for k in PORTAL_NAMES},'agency_key':digest((folder/'agency.key').read_bytes()),'agency_id':digest(agency[0])},'database':database,'sql':sql_hashes()}

def check(c):
    sealed=json.loads(private(c['identity_file']).read_text());current=observe(c)
    need(sealed==current,'CONTINUITY_CHANGED_NO_DEPLOY')
    return sealed

def seal(c):
    # Explicit one-time enrollment after the databases and domains have been prepared.
    # Never overwrite an established identity; changing one needs a separate reviewed migration.
    target=Path(c['identity_file']);private(target.parent,True)
    need(not target.exists(),'IDENTITY_ALREADY_SEALED')
    value=observe(c);save_json(target,value,True);return value

def safe_environment(values):
    env={k:v for k,v in os.environ.items() if k in ('PATH','LANG','LC_ALL','JAVA_HOME','TZ')}
    env.update(values);return env

def release_manifest(release):
    release=Path(release);need(release.is_dir() and not release.is_symlink(),'RELEASE_MISSING')
    m=json.loads((release/'release.json').read_text());need(re.fullmatch('[a-f0-9]{64}',m.get('sha','')),'RELEASE_INVALID')
    need(m['sha']==digest(json.dumps(m['files'],sort_keys=True,separators=(',',':'))),'RELEASE_MANIFEST_CHANGED')
    for relative,expected in m['files'].items():
        p=release/relative;need(not Path(relative).is_absolute() and '..' not in Path(relative).parts and not any(q.is_symlink() for q in (p,*p.parents)),'RELEASE_PATH_INVALID')
        need(p.is_file() and digest(p.read_bytes())==expected,'RELEASE_FILE_CHANGED')
    return m

def package(c,receipt):
    import checkpoint
    report=json.loads(Path(receipt).read_text())
    need(report.get('core_status')=='CORE_TESTS_PASS' and report.get('auto_commit',{}).get('status')=='CREATED','FULL_CHECKPOINT_REQUIRED')
    tested=report.get('tested_manifest',{});need(tested and tested==checkpoint.manifest(checkpoint.snapshot(ROOT)),'CHECKPOINT_SOURCE_CHANGED')
    commit=run(['git','-C',str(ROOT),'rev-parse','HEAD']).decode().strip()
    need(commit==report['auto_commit']['hash'],'CHECKPOINT_COMMIT_CHANGED')
    private(c['release_root'],True)
    # Build only the already-validated revision; never mutate the active release.
    run([str(ROOT/'gradlew'),'installDist','--no-daemon'],timeout=900)
    need(tested==checkpoint.manifest(checkpoint.snapshot(ROOT)),'SOURCE_CHANGED_DURING_PACKAGE')
    target=Path(c['release_root'])/(commit+'-'+uuid.uuid4().hex[:8]);target.mkdir(mode=0o700)
    try:
        shutil.copytree(ROOT/'build/install/loyalty',target/'wallet')
        shutil.copytree(SQL_ROOT/'lumina',target/'portal')
        # The portal shares this public catalog with native Wallet onboarding.
        # Preserve its relative location when moving the portal outside src/.
        (target/'businesses').mkdir()
        shutil.copy2(SQL_ROOT/'businesses/business-categories.json',target/'businesses/business-categories.json')
        (target/'scripts').mkdir()
        for name in ('production.py','wallet_local.py','wallet_config.py','staging.py','checkpoint.py'):
            shutil.copy2(ROOT/'scripts'/name,target/'scripts'/name)
        for p in SQL_ROOT.rglob('*.sql'):
            dest=target/'src/main/resources/com/premierdarkcoffee/loyalty'/p.relative_to(SQL_ROOT)
            dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
        files={p.relative_to(target).as_posix():digest(p.read_bytes()) for p in target.rglob('*') if p.is_file()}
        m={'format':1,'commit':commit,'files':files,'sha':digest(json.dumps(files,sort_keys=True,separators=(',',':')))}
        save_json(target/'release.json',m,True)
        return {'release':str(target),'sha':m['sha']}
    except BaseException:
        # A failed, unused candidate is retained privately for diagnosis, never promoted.
        raise

def serve(c,release,slot,component):
    check(c);m=release_manifest(release);native_port,portal_port=SLOTS[slot]
    seal_path=c['identity_file'];release=Path(release)
    if component=='wallet':
        env=safe_environment({**c['native'],'LOYALTY_PROFILE':'production','PRODUCTION_IDENTITY_PATH':seal_path,'SOURCE_SHA':m['sha']})
        argv=[str(release/'wallet/bin/loyalty'),'-host=127.0.0.1','-port='+str(native_port),'-P:ktor.deployment.shutdownGracePeriod=5000','-P:ktor.deployment.shutdownTimeout=30000']
    else:
        env=safe_environment({**c['portal'],'LUMINA_PROFILE':'production','PRODUCTION_IDENTITY_PATH':seal_path,'SOURCE_SHA':m['sha'],'LUMINA_PORT':str(portal_port),'LUMINA_LOYALTY_URL':'http://127.0.0.1:'+str(native_port)})
        argv=['node',str(release/'portal/application/server.mjs')]
    os.execvpe(argv[0],argv,env)

def http_json(port,path,host=None):
    conn=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
    try:
        conn.request('GET',path,headers={'Host':host} if host else {});res=conn.getresponse();raw=res.read(100_001)
        need(res.status==200 and len(raw)<=100_000,'READINESS_FAILED');return json.loads(raw)
    finally:conn.close()

def ready(c,slot,sha):
    native_port,portal_port=SLOTS[slot]
    n=http_json(native_port,'/health/ready')
    need(n.get('status')=='UP' and n.get('wallet')=={'apple':True,'google':True} and n.get('release')==sha,'WALLET_NOT_READY')
    p=http_json(portal_port,'/salud/listo',urllib.parse.urlsplit(c['portal']['LUMINA_ORIGIN']).netloc)
    need(p.get('status')=='UP' and p.get('release')==sha,'PORTAL_NOT_READY')

def backup(c):
    sealed=check(c);folder=private(c['backup_dir'],True)/('backup-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]);folder.mkdir(mode=0o700)
    manifest={'format':1,'created':time.time(),'seal_sha':digest(json.dumps(sealed,sort_keys=True)),'scope':'PostgreSQL and SQLite consistent individually; cross-store reconciliation required on recovery'}
    a=Path(c['portal']['LUMINA_DATA_DIR'])
    with sqlite3.connect((a/'agency.sqlite').as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(folder/'agency.sqlite') as target:
        source.backup(target);need(target.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_BACKUP_FAILED')
    os.chmod(folder/'agency.sqlite',0o600)
    env=pg_env(c);env.pop('PGOPTIONS',None)
    run(['pg_dump','--format=custom','--no-owner','--no-acl','--file',str(folder/'wallet.dump')],env,timeout=1800)
    os.chmod(folder/'wallet.dump',0o600)
    originals={'agency.key':a/'agency.key','production.json':Path(c['_path']),'continuity.json':Path(c['identity_file'])}
    originals.update({k:Path(c['native'][k]) for k in MATERIAL})
    for name,path in originals.items():write_private(folder/name,private(path).read_bytes(),True)
    manifest['files']={p.name:digest(p.read_bytes()) for p in folder.iterdir() if p.is_file()}
    save_json(folder/'backup.json',manifest,True)
    return {'backup':str(folder),'restore_test':'PENDING'}

def verify_backup(c,folder):
    folder=private(folder,True);m=json.loads(private(folder/'backup.json').read_text());sealed=check(c)
    need(m['seal_sha']==digest(json.dumps(sealed,sort_keys=True)),'BACKUP_IDENTITY_MISMATCH')
    for name,sha in m['files'].items():
        need(Path(name).name==name and digest(private(folder/name).read_bytes())==sha,'BACKUP_CORRUPT')
    with sqlite3.connect((folder/'agency.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        need(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_BACKUP_CORRUPT')
    # Restore only into a fresh, network-isolated container with no host ports or live volume.
    container='lumina-restore-'+uuid.uuid4().hex
    image=c.get('postgres_image','postgres:16')
    need(bool(re.fullmatch(r'postgres:16(?:\.[0-9]+)?(?:@sha256:[a-f0-9]{64})?',image)),'RESTORE_IMAGE_INVALID')
    run(['docker','run','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],timeout=120)
    try:
        for i in range(30):
            try:run(['docker','exec',container,'pg_isready','-U','postgres'],timeout=5);break
            except Blocked:
                if i==29:raise
                time.sleep(1)
        run(['docker','cp',str(folder/'wallet.dump'),container+':/tmp/wallet.dump'],timeout=300)
        run(['docker','exec',container,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','postgres','/tmp/wallet.dump'],timeout=900)
        count=run(['docker','exec',container,'psql','-X','-qAt','-U','postgres','-c','SELECT count(*) FROM comeback_migrations']).decode().strip()
        need(count=='16','RESTORE_SCHEMA_MISMATCH')
        rows=json.loads(run(['docker','exec',container,'psql','-X','-qAt','-U','postgres','-c',"SELECT COALESCE(json_agg(json_build_array(company_id,tenant_id)),'[]'::json) FROM lumina_business_registrations"]).decode())
        links=dict(rows)
        with sqlite3.connect((folder/'agency.sqlite').as_uri()+'?mode=ro',uri=True) as db:
            need(not db.execute('PRAGMA foreign_key_check').fetchall(),'PORTAL_FOREIGN_KEYS_FAILED')
            companies=dict(db.execute('SELECT id,loyalty_tenant FROM companies'))
        need(all(company in companies and (companies[company] is None or companies[company]==tenant) for company,tenant in links.items()),'CROSS_STORE_RECONCILIATION_REQUIRED')
        need(all(not tenant or links.get(company)==tenant for company,tenant in companies.items()),'CROSS_STORE_RECONCILIATION_REQUIRED')
        result={'format':1,'status':'RESTORE_PASS','checked':time.time(),'backup_manifest':digest((folder/'backup.json').read_bytes()),'seal_sha':m['seal_sha']}
        save_json(folder/'verified.json',result);return result
    finally:run(['docker','rm','-f',container],timeout=30)

def gateway(c,slot,sha):
    import wallet_local
    native_port,portal_port=SLOTS[slot]
    conf=wallet_local.gateway_config(sha[:32],'127.0.0.1:'+str(native_port),False)
    runtime=Path(c['runtime_dir']);need(bool(re.fullmatch(r'/[A-Za-z0-9_./-]+',str(runtime))),'RUNTIME_PATH_INVALID')
    conf=conf.replace('pid /tmp/nginx.pid;','pid '+str(runtime/'gateway.pid')+';').replace('listen 8080;','listen 127.0.0.1:8101;')
    for name in ('client-body','proxy','fastcgi','uwsgi','scgi'):
        conf=conf.replace('/tmp/'+name+';',str(runtime/('nginx-'+name))+';')
    conf=conf.replace('http {','http {\n  server {\n    listen 127.0.0.1:8100;\n    location / {\n      proxy_pass http://127.0.0.1:'+str(portal_port)+';\n      proxy_set_header Host $http_host;\n      proxy_set_header Connection "";\n      proxy_http_version 1.1;\n      proxy_connect_timeout 5s;\n      proxy_read_timeout 45s;\n    }\n  }',1)
    return conf

def prepare_gateway(c,release,slot):
    check(c);m=release_manifest(release);runtime=private(c['runtime_dir'],True)
    need(not (runtime/'nginx.conf').exists() and not (runtime/'active.json').exists(),'GATEWAY_ALREADY_PREPARED')
    ready(c,slot,m['sha']);conf=runtime/('initial-'+uuid.uuid4().hex+'.conf')
    write_private(conf,gateway(c,slot,m['sha']),True)
    try:
        run(['nginx','-t','-c',str(conf)])
        # Exclusive creation prevents accidentally replacing a live gateway.
        write_private(runtime/'nginx.conf',conf.read_bytes(),True)
    finally:conf.unlink(missing_ok=True)
    return {'status':'GATEWAY_PREPARED','service_start':'PENDING'}

def switch(c,release,slot,backup_folder):
    sealed=check(c);m=release_manifest(release);runtime=private(c['runtime_dir'],True)
    verified=json.loads(private(Path(backup_folder)/'verified.json').read_text())
    need(verified.get('status')=='RESTORE_PASS' and 0<=time.time()-verified['checked']<=86400 and verified['seal_sha']==digest(json.dumps(sealed,sort_keys=True)),'RECENT_RESTORE_TEST_REQUIRED')
    need(verified['backup_manifest']==digest(private(Path(backup_folder)/'backup.json').read_bytes()),'BACKUP_MANIFEST_CHANGED')
    backup_manifest=json.loads(private(Path(backup_folder)/'backup.json').read_text())
    for name,sha in backup_manifest['files'].items():
        need(Path(name).name==name and digest(private(Path(backup_folder)/name).read_bytes())==sha,'BACKUP_CORRUPT')
    lock=runtime/'release.lock'
    with lock.open('a') as f:
        import fcntl
        fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        active=runtime/'active.json';old=json.loads(active.read_text()) if active.exists() else None
        need(not old or old['slot']!=slot,'ACTIVE_SLOT_CANNOT_BE_REPLACED')
        ready(c,slot,m['sha'])
        candidate=runtime/'candidate.conf';destination=runtime/'nginx.conf';previous=destination.read_bytes() if destination.exists() else None
        write_private(candidate,gateway(c,slot,m['sha']))
        run(['nginx','-t','-c',str(candidate)])
        os.replace(candidate,destination)
        try:
            run(['nginx','-s','reload','-c',str(destination)])
            deadline=time.monotonic()+15
            while True:
                try:
                    probe=http_json(8101,'/health/public')
                    need(probe.get('probe')==m['sha'][:32],'GATEWAY_NOT_SWITCHED')
                    p=http_json(8100,'/salud/listo',urllib.parse.urlsplit(c['portal']['LUMINA_ORIGIN']).netloc)
                    need(p.get('release')==m['sha'] and p.get('status')=='UP','PORTAL_NOT_SWITCHED');break
                except Exception:
                    if time.monotonic()>=deadline:raise
                    time.sleep(.5)
            state={'slot':slot,'release':str(release),'sha':m['sha'],'previous':{k:old[k] for k in ('slot','release','sha','changed') if k in old} if old else None,'changed':time.time()}
            save_json(runtime/'next-active.json',state);os.replace(runtime/'next-active.json',active)
            return {'status':'RELEASE_SWITCHED','sha':m['sha'],'previous_kept_running':bool(old),'public_tls_and_devices':'PENDING'}
        except BaseException:
            if previous is not None:
                write_private(runtime/'rollback.conf',previous);os.replace(runtime/'rollback.conf',destination)
                run(['nginx','-s','reload','-c',str(destination)])
            # Never restore databases or stop the previous version to roll back application code.
            raise

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['check','seal','backup','verify-backup','package','serve','ready','prepare-gateway','switch'])
    parser.add_argument('--config',required=True);parser.add_argument('--receipt');parser.add_argument('--release');parser.add_argument('--slot',choices=list(SLOTS));parser.add_argument('--component',choices=['wallet','portal']);parser.add_argument('--backup')
    args=parser.parse_args();os.umask(0o077)
    try:
        c=load_config(args.config)
        if args.action=='check':check(c);result={'status':'CONTINUITY_PASS'}
        elif args.action=='seal':seal(c);result={'status':'IDENTITY_SEALED'}
        elif args.action=='backup':result=backup(c)
        elif args.action=='verify-backup':need(args.backup,'BACKUP_REQUIRED');result=verify_backup(c,args.backup)
        elif args.action=='package':need(args.receipt,'CHECKPOINT_REQUIRED');result=package(c,args.receipt)
        elif args.action=='serve':need(args.release and args.slot and args.component,'RELEASE_SLOT_COMPONENT_REQUIRED');serve(c,args.release,args.slot,args.component);return 0
        elif args.action=='prepare-gateway':need(args.release and args.slot,'RELEASE_SLOT_REQUIRED');result=prepare_gateway(c,args.release,args.slot)
        elif args.action=='ready':need(args.release and args.slot,'RELEASE_SLOT_REQUIRED');check(c);m=release_manifest(args.release);ready(c,args.slot,m['sha']);result={'status':'CANDIDATE_READY','public_tls_and_devices':'PENDING'}
        else:need(args.release and args.slot and args.backup,'RELEASE_SLOT_BACKUP_REQUIRED');result=switch(c,args.release,args.slot,args.backup)
        runtime=private(c['runtime_dir'],True);save_json(runtime/'last-result.json',result)
        print('RESULTADO='+result.get('status',args.action.upper()+'_PASS'));return 0
    except Exception as e:
        # Never print credential values or subprocess output. Full config remains private.
        code=str(e) if isinstance(e,Blocked) else type(e).__name__.upper()
        print('RESULTADO=PRODUCTION_BLOCKED_'+re.sub('[^A-Z0-9_]+','_',code));return 1

if __name__=='__main__':raise SystemExit(main())
