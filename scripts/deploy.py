"""Deploy an exact, clean Git revision. Never patch source or create server commits."""
import argparse
import contextlib
import traceback
import fcntl
import hashlib
import http.client
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import signal
import ssl
import subprocess
import sys
import time

SOURCE = Path(__file__).resolve().parents[1]
WORK = SOURCE
STATE = Path('/var/lib/lumina/runtime')
CONFIG = Path('/etc/lumina/production.json')
EVIDENCE = Path('/root/lumina-deploy')
STEP = 'PREFLIGHT'

class Blocked(RuntimeError): pass
def need(value, code):
    if not value: raise Blocked(code)
def digest(value): return hashlib.sha256(value).hexdigest()
def safe(path):
    path = Path(path)
    need(path.is_absolute() and not any(p.is_symlink() for p in (path, *path.parents)), 'SYMLINK_OR_PATH_CONFLICT')
    return path
def write_json(path, value):
    safe(path); temporary = path.with_suffix(path.suffix+'.writing')
    safe(temporary)
    with temporary.open('w', encoding='utf-8') as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)
def run(args, timeout=90, **kwargs):
    process = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, **kwargs)
    if process.returncode:
        path=safe(EVIDENCE/(STEP.lower()+'-command.log'))
        with path.open('wb') as log:
            os.chmod(path,0o600);log.write(process.stdout)
        print('COMMAND_LOG='+str(path),flush=True)
        raise Blocked('COMMAND_FAILED_'+Path(args[0]).name.upper()+'_EXIT_'+str(process.returncode))
    return process.stdout.decode('utf-8', 'replace').strip()
def git(*args, project=SOURCE): return run(['git', '-C', str(project), *args])
# Published releases whose author headers were corrected. Each mapped object has
# the same tree, message and dates. The normal path remains a fast-forward.
AUTHOR_CORRECTIONS = {
    'bc133327b313e36712ac0730470016d9bfa03438': '71619060a062af961bf502c01291ac038eaac6dc',
    '9be695fe3f25fcfdb6e4d83b9281b6c53bee600e': '9c72ce9713cfec5a301bcf34ee0db020b68838e5',
    'bb9e41bfbb6e3953e847ca70f2ad99b18434173f': '40e582cf7c2c7b5c8c04fda1917e6c22ab0815ac',
    '81517e31f25b07c8aded360e0c723453e1a5ed9b': 'b7ee975aab5b7c405aa9d5f31c4367adc3b41831',
}

def require_release_ancestor(live, candidate, project=SOURCE):
    need(all(re.fullmatch('[a-f0-9]{40}',oid) for oid in (live,candidate)), 'RELEASE_COMMIT_INVALID')
    cmd=['git','--no-replace-objects','-C',str(project)]
    result=subprocess.run([*cmd,'merge-base','--is-ancestor',live,candidate],capture_output=True)
    if result.returncode==0:
        return
    need(result.returncode==1,'RELEASE_ANCESTRY_UNAVAILABLE')
    mapped=AUTHOR_CORRECTIONS.get(live)
    if not mapped:
        # If the subscriptions release was deployed first, only its parent
        # header may differ. Hash all other original commit bytes unchanged.
        raw=subprocess.check_output([*cmd,'cat-file','commit',live])
        headers,separator,message=raw.partition(b'\n\n')
        parents=re.findall(rb'^parent ([0-9a-f]{40})$',headers,re.M)
        need(len(parents)==1 and parents[0].decode() in AUTHOR_CORRECTIONS,'UNRELATED_RELEASE_HISTORY')
        parent=parents[0]
        corrected=AUTHOR_CORRECTIONS[parent.decode()].encode()
        headers=headers.replace(b'parent '+parent+b'\n',b'parent '+corrected+b'\n',1)
        mapped=subprocess.check_output([*cmd,'hash-object','-t','commit','--stdin'],input=headers+separator+message).decode().strip()
    need(git('--no-replace-objects','rev-parse',live+'^{tree}',project=project)==git('--no-replace-objects','rev-parse',mapped+'^{tree}',project=project),'RELEASE_TREE_CHANGED')
    git('--no-replace-objects','merge-base','--is-ancestor',mapped,candidate,project=project)

def active_unit(name):
    return subprocess.run(['systemctl','is-active','--quiet',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
def wait_for(work, seconds=120):
    deadline=time.monotonic()+seconds
    while True:
        try: return work()
        except Exception:
            if time.monotonic()>=deadline: raise
            time.sleep(1)
def load_production(root):
    sys.path.insert(0,str(root/'scripts'))
    spec=importlib.util.spec_from_file_location('production_'+digest(str(root).encode())[:10],root/'scripts/production.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
def listeners():
    for line in run(['ss','-H','-ltn']).splitlines():
        fields=line.split();need(len(fields)>=5,'LISTENER_INVALID')
        host,separator,port=fields[3].rpartition(':')
        if port in {'2019','5432','8100','8101','9101','9199','9201','9299','8097'}:
            need(separator,'LISTENER_INVALID')
            try: address=ipaddress.ip_address(host.strip('[]'))
            except ValueError: raise Blocked('INTERNAL_PORT_EXPOSED')
            if address.version==6 and address.ipv4_mapped:address=address.ipv4_mapped
            need(address.is_loopback,'INTERNAL_PORT_EXPOSED')
def public_checks(production, config, sha):
    def get(host,path,expected):
        conn=http.client.HTTPSConnection(host,timeout=20,context=ssl.create_default_context())
        try:
            conn.request('GET',path);response=conn.getresponse();body=response.read(2_000_001)
            need(response.status==expected and len(body)<=2_000_000,'PUBLIC_HTTP_CHECK_FAILED')
            return body
        finally:conn.close()
    portal='lumina.premierdarkcoffee.com';wallet='wallet.premierdarkcoffee.com'
    need(config['portal']['LUMINA_ORIGIN']=='https://'+portal and config['native']['PUBLIC_BASE_URL']=='https://'+wallet,'PUBLIC_ORIGIN_CHANGED')
    health=json.loads(get(portal,'/health/ready',200));probe=json.loads(get(wallet,'/health/public',200))
    need(health.get('status')=='UP' and health.get('release')==sha,'PUBLIC_RELEASE_MISMATCH')
    need(probe.get('probe')==sha[:32],'PUBLIC_WALLET_MISMATCH')
    get(portal,'/',200);get(portal,'/login',200);get(portal,'/setup',404)
    get(wallet,'/style.css',200)
    for path in ('/','/admin','/store','/api/platform/tenants','/health/ready','/%61dmin'):
        get(wallet,path,404)
    listeners();production.check(config)
def own_tree(root, account):
    for path in (root,*root.rglob('*')):
        safe(path);os.chown(path,account.pw_uid,account.pw_gid)
def staging_module():
    spec=importlib.util.spec_from_file_location('lumina_deploy_staging',Path(__file__).with_name('staging.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def prepare_staging(expected_commit):
    # Reuse only this revision's private test identity on retries. Never adopt
    # the global loyalty-staging project, its volumes or its missing .env.
    path=safe(EVIDENCE/'staging-run.json')
    if path.exists():
        value=json.loads(path.read_text())
        need(value.get('source')==str(WORK) and value.get('commit')==expected_commit and
            re.fullmatch('[a-f0-9]{24}',value.get('run_id','')),'STAGING_RUN_CONFLICT')
        return value['run_id']
    value={'source':str(WORK),'commit':expected_commit,'run_id':secrets.token_hex(12)}
    write_json(path,value)
    return value['run_id']

def stop_own_staging(run_id):
    # Never stop another checkout's containers or any production database.
    need(re.fullmatch('[a-f0-9]{24}',run_id),'STAGING_RUN_REQUIRED')
    project=staging_module().project_name(WORK,run_id)
    ids=run(['docker','ps','-q','--filter','label=com.docker.compose.project='+project]).split()
    for container in ids:
        details=json.loads(run(['docker','inspect',container]))[0]
        labels=details['Config']['Labels']
        need(labels.get('com.docker.compose.project')==project and labels.get('com.docker.compose.project.working_dir')==str(WORK),'STAGING_OWNER_CONFLICT')
    # Validate every owner before stopping even the first container.
    for container in ids:
        run(['docker','stop',container],timeout=90)
def slot_change(production,config,old,candidate,slot,backup,switch=None,start_candidate=None):
    """Drain the old portal before sending writes to the candidate. Never restore data."""
    previous_portal='lumina-portal@'+old['slot']
    candidate_portal='lumina-portal@'+slot
    if start_candidate is None:production.ready(config,slot,candidate['sha'])
    try:
        run(['systemctl','stop',previous_portal],timeout=65)
        need(not active_unit(previous_portal),'PREVIOUS_PORTAL_DID_NOT_DRAIN')
        if start_candidate:
            start_candidate()
            wait_for(lambda:production.ready(config,slot,candidate['sha']))
        if switch is None:production.switch(config,candidate['release'],slot,backup)
        else:switch()
    except BaseException:
        current=json.loads((STATE/'active.json').read_text())
        # If promotion did not happen, resume the same previous process. Do not
        # roll application data back or undo an already promoted candidate.
        if current['sha']==old['sha']:
            run(['systemctl','stop',candidate_portal],timeout=65)
            run(['systemctl','start',previous_portal],timeout=65)
        raise


def stage(name):
    global STEP
    STEP=name
    print('STEP='+name,flush=True)

def execute_checkpoint(environment, evidence, timeout=5400, staging_run=None):
    log_path=safe(EVIDENCE/'checkpoint.log')
    with log_path.open('w') as log:
        os.chmod(log_path,0o600)
        command=[sys.executable,str(WORK/'scripts/checkpoint.py'),
            '--project',str(WORK),'--output-dir',str(evidence),'--verify-only']
        if staging_run:
            command.extend(['--staging-run',staging_run])
        process=subprocess.Popen(command,
            cwd=WORK,env=environment,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            return process.wait(timeout=timeout)
        finally:
            if process.poll() is None:
                # Checkpoint handles SIGTERM and cleans up its own process groups
                # and disposable PostgreSQL container before it exits.
                process.terminate()
                try:process.wait(timeout=45)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=10)

def configure_slot(slot,path,content,account,old):
    need(slot in ('blue','green') and slot!=old['slot'],'ACTIVE_SLOT_FORBIDDEN')
    need(json.loads((STATE/'active.json').read_text())==old,'ACTIVE_RELEASE_CHANGED')
    if path.exists() and path.read_text()!=content:
        # A slot can contain an older immutable release. It is no longer routed.
        run(['systemctl','stop','lumina-portal@'+slot],timeout=65)
        run(['systemctl','stop','lumina-wallet@'+slot],timeout=65)
        need(not active_unit('lumina-portal@'+slot) and not active_unit('lumina-wallet@'+slot),'INACTIVE_SLOT_STILL_RUNNING')
        saved=EVIDENCE/(slot+'-previous.env')
        if not saved.exists():
            with saved.open('x') as stream:
                os.chmod(saved,0o600);stream.write(path.read_text())
    temporary=safe(path.with_suffix('.env.new'))
    with temporary.open('w') as stream:
        os.chmod(temporary,0o600);stream.write(content);stream.flush();os.fsync(stream.fileno())
    os.chown(temporary,account.pw_uid,account.pw_gid)
    os.replace(temporary,path)

def main(expected_commit):
    os.umask(0o077)
    need(os.geteuid()==0 and sys.platform=='linux','LINUX_ROOT_REQUIRED')
    need(re.fullmatch('[a-f0-9]{40}',expected_commit),'FULL_COMMIT_REQUIRED')
    for folder in (SOURCE,STATE,CONFIG,EVIDENCE):safe(folder)
    need(git('rev-parse','HEAD')==expected_commit and not git('status','--porcelain'),'CLEAN_EXACT_COMMIT_REQUIRED')
    EVIDENCE.mkdir(mode=0o700,exist_ok=True)
    with (STATE/'startup.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return deploy_locked(expected_commit)

def deploy_locked(expected_commit):
    old=json.loads((STATE/'active.json').read_text());release=safe(old['release'])
    need(release.parent==Path('/opt/lumina/releases'),'RELEASE_LOCATION_INVALID')
    prod=load_production(SOURCE);config=prod.load_config(CONFIG);prod.check(config)
    manifest=prod.release_manifest(release);need(manifest['sha']==old['sha'],'ACTIVE_RELEASE_CHANGED')
    stamp=EVIDENCE/'deployment.json'
    deployment=json.loads(stamp.read_text()) if stamp.exists() else {}
    if manifest['commit']==expected_commit:
        run(['systemctl','enable','lumina-wallet@'+old['slot'],'lumina-portal@'+old['slot']])
        previous=deployment.get('previous',{})
        if previous.get('slot') in ('blue','green') and previous['slot']!=old['slot']:
            run(['systemctl','stop','lumina-portal@'+previous['slot']],timeout=65)
            run(['systemctl','disable','lumina-wallet@'+previous['slot'],'lumina-portal@'+previous['slot']])
        public_checks(prod,config,old['sha'])
        return 'PRODUCTION_HTTPS_PASS_WALLET_DEVICE_TEST_PENDING'
    require_release_ancestor(manifest['commit'],expected_commit)
    prod.ready(config,old['slot'],old['sha']);listeners()
    need(run(['node','--version']).startswith('v24.'),'NODE_24_REQUIRED')
    for executable in ('git','docker','java','javac','node','psql','pg_dump','nginx','systemctl','runuser'):
        need(shutil.which(executable),executable.upper()+'_MISSING')
    run(['docker','info','--format','{{.ServerVersion}}'])
    need(shutil.disk_usage('/opt/lumina').free>=7*1024**3,'BUILD_DISK_SPACE_REQUIRED')
    # The checkpoint uses disposable databases and its own source tree. No
    # production configuration or secret is passed as an environment variable.
    environment={k:v for k,v in os.environ.items() if k in ('PATH','LANG','LC_ALL','JAVA_HOME','TZ')}
    environment.update(PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LANG='C.UTF-8',
        JAVA_HOME='/usr/lib/jvm/java-21-openjdk-amd64',GRADLE_USER_HOME='/var/cache/lumina-gradle-v074',PYTHONDONTWRITEBYTECODE='1')
    cache=safe(environment['GRADLE_USER_HOME']);cache.mkdir(mode=0o700,exist_ok=True)
    properties=safe(cache/'gradle.properties')
    if not properties.exists():
        properties.write_text('org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=1 -Dfile.encoding=UTF-8\norg.gradle.workers.max=1\norg.gradle.parallel=false\norg.gradle.daemon=false\norg.gradle.vfs.watch=false\nkotlin.compiler.execution.strategy=in-process\n')
    sys.path.insert(0,str(WORK/'scripts'));import checkpoint
    evidence=EVIDENCE/'tests';evidence.mkdir(mode=0o700,exist_ok=True)
    staging_run=prepare_staging(expected_commit)
    receipt=None
    for path in sorted(evidence.glob('*/RESULTADO.json'),reverse=True):
        report=json.loads(path.read_text())
        if report.get('core_status')=='CORE_TESTS_PASS' and report.get('auto_commit',{}).get('status')=='VERIFIED' and report['auto_commit']['hash']==git('rev-parse','HEAD',project=WORK) and report.get('tested_manifest')==checkpoint.manifest(checkpoint.snapshot(WORK)):
            receipt=path;break
    if receipt is None:
        stage('FULL_CHECKPOINT')
        checkpoint_error=None
        try:
            result=execute_checkpoint(environment,evidence,staging_run=staging_run)
        except BaseException as error:
            checkpoint_error=error
            raise
        finally:
            try:
                stop_own_staging(staging_run)
            except BaseException:
                if checkpoint_error is None:
                    raise
                traceback.print_exc()
        reports=sorted(evidence.glob('*/RESULTADO.json'),reverse=True)
        need(reports,'CHECKPOINT_REPORT_MISSING')
        receipt=reports[0];report=json.loads(receipt.read_text())
        print('CHECKPOINT_REPORT='+str(receipt),flush=True)
        print('CHECKPOINT_LOG='+str(EVIDENCE/'checkpoint.log'),flush=True)
        if report.get('staging_error'):
            print('STAGING_ERROR='+str(report['staging_error']),flush=True)
        for label,check in report.get('checks',{}).items():
            if check.get('exit_code') and re.fullmatch('[a-zA-Z0-9_-]+',label):
                failed_log=receipt.parent/'logs'/(label+'.log')
                if failed_log.is_file():print('FAILED_CHECK_LOG='+str(failed_log),flush=True)
        status=report.get('status','')
        cause=status if isinstance(status,str) and re.fullmatch('[A-Z][A-Z0-9_]{1,95}',status) else 'UNSPECIFIED'
        need(result==0 and report.get('core_status')=='CORE_TESTS_PASS' and report.get('auto_commit',{}).get('status')=='VERIFIED','FULL_CHECKPOINT_FAILED_'+cause)
    # Stop only the disposable staging containers belonging to this worktree.
    stop_own_staging(staging_run)
    need(json.loads((STATE/'active.json').read_text())==old,'ACTIVE_RELEASE_CHANGED')
    prod.check(config)
    stage('VERIFIED_BACKUP')
    backup=Path(prod.backup(config)['backup'])
    need(prod.verify_backup(config,backup)['status']=='RESTORE_PASS','BACKUP_RESTORE_FAILED')
    stage('IMMUTABLE_CANDIDATE')
    candidate_file=EVIDENCE/'candidate.json'
    if candidate_file.exists():
        candidate=json.loads(candidate_file.read_text());candidate_manifest=prod.release_manifest(candidate['release'])
        need(candidate_manifest['commit']==git('rev-parse','HEAD',project=WORK) and candidate_manifest['sha']==candidate['sha'],'CANDIDATE_CHANGED')
    else:
        # Package in this process so the original exception and build log survive.
        build_environment=os.environ.copy()
        try:
            os.environ.clear();os.environ.update(environment)
            candidate=prod.package(config,receipt)
        finally:
            os.environ.clear();os.environ.update(build_environment)
        write_json(candidate_file,candidate)
    account=pwd.getpwnam('lumina');own_tree(Path(candidate['release']),account);own_tree(backup,account)
    slot='green' if old['slot']=='blue' else 'blue'
    slot_path=safe(Path('/etc/lumina/slots')/(slot+'.env'))
    slot_content='RELEASE='+candidate['release']+'\n'
    configure_slot(slot,slot_path,slot_content,account,old)
    stage('MEMBERSHIP_SCHEMA')
    run(['runuser','-u','lumina','--','/usr/bin/python3',str(Path(candidate['release'])/'scripts/production.py'),
         'migrate-calendar','--config',str(CONFIG),'--backup',str(backup)],timeout=180)
    stage('CANDIDATE_READINESS')
    run(['systemctl','start','lumina-wallet@'+slot],timeout=90)
    def wallet_ready():
        health=prod.http_json(prod.SLOTS[slot][0],'/health/ready')
        need(health.get('status')=='UP' and health.get('release')==candidate['sha'] and health.get('wallet')=={'apple':True,'google':True},'CANDIDATE_WALLET_NOT_READY')
    wait_for(wallet_ready)
    # The portal has background lifecycle retries. Start it only after draining
    # the previous portal, even though the candidate is not publicly routed yet.
    run(['systemctl','stop','lumina-portal@'+slot],timeout=65)
    # Preserve the baseline and candidate metadata before the one traffic change.
    write_json(stamp,{'previous':old,**candidate,'slot':slot,'receipt':str(receipt),'backup':str(backup),'state':'PREPARED'})
    stage('PORTAL_DRAIN_AND_SWITCH')
    def switch_as_service():
        # The running gateway reads its config as lumina, so replacement files
        # must be written by that same account, not root.
        run(['runuser','-u','lumina','--','/usr/bin/python3',str(Path(candidate['release'])/'scripts/production.py'),
             'switch','--config',str(CONFIG),'--release',candidate['release'],'--slot',slot,'--backup',str(backup)],timeout=90)
        current=json.loads((STATE/'active.json').read_text())
        need(current['sha']==candidate['sha'] and current['slot']==slot,'SWITCH_NOT_COMMITTED')
    slot_change(prod,config,old,candidate,slot,backup,switch=switch_as_service,
        start_candidate=lambda:run(['systemctl','start','lumina-portal@'+slot],timeout=90))
    run(['systemctl','enable','lumina-wallet@'+slot,'lumina-portal@'+slot])
    run(['systemctl','disable','lumina-wallet@'+old['slot'],'lumina-portal@'+old['slot']])
    # Keep the old native process alive to drain existing public requests.
    # Its immutable files remain available; it is not restarted on reboot.
    stage('PUBLIC_HTTPS')
    public_checks(prod,config,candidate['sha'])
    write_json(stamp,{'previous':old,**candidate,'slot':slot,'receipt':str(receipt),'backup':str(backup),'state':'HTTPS_PASS','physical_wallet':'PENDING'})
    return 'PRODUCTION_HTTPS_PASS_WALLET_DEVICE_TEST_PENDING'

def cli():
    global EVIDENCE
    parser=argparse.ArgumentParser(description='Publish one exact Git commit after full isolated validation.')
    parser.add_argument('--commit',required=True)
    args=parser.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{40}',args.commit):
        print('RESULTADO=PRODUCTION_DEPLOY_BLOCKED CAUSE=ROOT_AND_FULL_COMMIT_REQUIRED')
        return 1
    os.umask(0o077)
    EVIDENCE=safe(EVIDENCE/args.commit)
    EVIDENCE.mkdir(mode=0o700,parents=True,exist_ok=True)
    log_path=safe(EVIDENCE/'deploy.log')
    with log_path.open('a') as log:
        os.chmod(log_path,0o600)
        try:
            with contextlib.redirect_stdout(log),contextlib.redirect_stderr(log):
                result=main(args.commit)
        except BaseException as error:
            traceback.print_exc(file=log)
            build_log=STATE/'package-build.log'
            if STEP=='IMMUTABLE_CANDIDATE' and build_log.is_file():
                log.write('BUILD_LOG='+str(build_log)+'\n')
            cause=str(error) if isinstance(error,Blocked) or type(error).__name__=='Blocked' else type(error).__name__
            cause=re.sub('[^A-Za-z0-9_=.-]','_',cause)[:150]
            print('RESULTADO=PRODUCTION_DEPLOY_BLOCKED STEP='+STEP+' CAUSE='+cause+' LOG='+str(log_path))
            return 1
    print('RESULTADO='+result)
    print('Lúmina Digital disponible en https://lumina.premierdarkcoffee.com')
    return 0

if __name__=='__main__':
    raise SystemExit(cli())
