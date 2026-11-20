#!/usr/bin/env python3
"""Compile, verify an exact source snapshot, commit it locally, and retain evidence.

No full-project reference hash gate. Reformatting is ordinary current source.
The only production success path invokes all Kotlin/HTTP/PostgreSQL suites.
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import xml.etree.ElementTree as ET
import zipfile

VERSION = 'v075'
DEFAULT_PROJECT = '/Users/ldgomm/Developer/pdc/sales/loyalty'
IGNORED_DIRS = {'.git', '.gradle', '.idea', '.kotlin', 'build', 'out', '__pycache__', '.venv', 'node_modules', '.loyalty-v001.lock', '.loyalty-checkpoint.lock', '.loyalty-staging.lock', '.production', '.lumina-digital', '.local-staging', '.local-wallet', '.loyalty-wallet.lock'}
ROOT_FILES = {'README.md', 'AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig', '.env.example', 'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties', 'gradlew', 'gradlew.bat', 'compose.yaml', 'Dockerfile', '.dockerignore', 'docker-compose.staging.yml'}
SOURCE_DIRS = {'src', 'gradle', 'scripts', 'docs', 'lumina-agency'}
SUITES = {
    'test': {'com.premierdarkcoffee.loyalty.access.ContactPhoneTest': 3, 'com.premierdarkcoffee.loyalty.access.EcuadorIdentityTest': 4, 'com.premierdarkcoffee.loyalty.billing.WalletSubscriptionTest': 9, 'com.premierdarkcoffee.loyalty.infrastructure.production.ProductionGuardTest': 8,'com.premierdarkcoffee.loyalty.campaigns.BlackFridayTest': 8,'com.premierdarkcoffee.loyalty.businesses.LuminaRegistrationTest': 4,'com.premierdarkcoffee.loyalty.businesses.AdministrationTest': 4, 'com.premierdarkcoffee.loyalty.wallet.WalletHealthTest': 4, 'com.premierdarkcoffee.loyalty.analytics.OperationsReportTest': 8, 'com.premierdarkcoffee.loyalty.access.TeamManagementTest': 4, 'com.premierdarkcoffee.loyalty.fidelity.PurchaseReviewTest': 8, 'com.premierdarkcoffee.loyalty.wallet.presentation.WalletPriorityTest': 8, 'com.premierdarkcoffee.loyalty.wallet.WalletFeaturedRewardTest': 8, 'com.premierdarkcoffee.loyalty.wallet.WalletRedemptionPreviewTest': 8, 'com.premierdarkcoffee.loyalty.wallet.WalletClarityTest': 8, 'com.premierdarkcoffee.loyalty.wallet.WalletIdentityTest': 10, 'com.premierdarkcoffee.loyalty.wallet.WalletStudioTest': 2, 'com.premierdarkcoffee.loyalty.wallet.WalletCompositionTest': 10, 'com.premierdarkcoffee.loyalty.wallet.WalletSignatureTest': 10, 'com.premierdarkcoffee.loyalty.businesses.BusinessCategoriesTest': 7, 'com.premierdarkcoffee.loyalty.wallet.presentation.WalletJourneyTest': 9, 'com.premierdarkcoffee.loyalty.wallet.presentation.WalletEarningRulesTest': 9, 'com.premierdarkcoffee.loyalty.wallet.WalletVisualExperienceTest': 8, 'com.premierdarkcoffee.loyalty.businesses.OwnerExperienceTest': 6, 'com.premierdarkcoffee.loyalty.wallet.artwork.WalletArtworkTest': 9, 'com.premierdarkcoffee.loyalty.analytics.CustomerWorkspaceTest': 4, 'com.premierdarkcoffee.loyalty.businesses.BusinessProfileTest': 8, 'com.premierdarkcoffee.loyalty.shared.DomainTest': 13, 'com.premierdarkcoffee.loyalty.application.ServerTest': 1, 'com.premierdarkcoffee.loyalty.application.HttpContractTest': 2, 'com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprintTest': 8, 'com.premierdarkcoffee.loyalty.billing.CommercialDomainTest': 8, 'com.premierdarkcoffee.loyalty.wallet.WalletDomainTest': 14, 'com.premierdarkcoffee.loyalty.infrastructure.local.LocalStagingTest': 3, 'com.premierdarkcoffee.loyalty.infrastructure.local.LocalWalletTest': 4, 'com.premierdarkcoffee.loyalty.wallet.WalletFirstDomainTest': 3, 'com.premierdarkcoffee.loyalty.wallet.presentation.WalletPresentationTest': 4, 'com.premierdarkcoffee.loyalty.wallet.providers.AppleWalletExperienceTest': 16, 'com.premierdarkcoffee.loyalty.wallet.providers.GoogleWalletExperienceTest': 18, 'com.premierdarkcoffee.loyalty.marketing.EngagementDomainTest': 10, 'com.premierdarkcoffee.loyalty.marketing.EngagementGoogleTest': 4, 'com.premierdarkcoffee.loyalty.wallet.WalletDeliveryDiagnosticsTest': 3, 'com.premierdarkcoffee.loyalty.wallet.presentation.WalletRewardGuidanceTest': 6, 'com.premierdarkcoffee.loyalty.fidelity.RewardBenefitPresentationTest': 8},
    'postgresTest': {'com.premierdarkcoffee.loyalty.billing.WalletSubscriptionPostgresTest': 26, 'com.premierdarkcoffee.loyalty.infrastructure.production.ProductionGuardPostgresTest': 4,'com.premierdarkcoffee.loyalty.campaigns.BlackFridayPostgresTest': 8,'com.premierdarkcoffee.loyalty.businesses.LuminaRegistrationPostgresTest': 7,'com.premierdarkcoffee.loyalty.businesses.AdministrationPostgresTest': 16, 'com.premierdarkcoffee.loyalty.analytics.OperationsPostgresTest': 20, 'com.premierdarkcoffee.loyalty.analytics.ManagementPostgresTest': 18, 'com.premierdarkcoffee.loyalty.fidelity.PurchaseReviewPostgresTest': 11, 'com.premierdarkcoffee.loyalty.wallet.WalletFeaturedRewardPostgresTest': 6, 'com.premierdarkcoffee.loyalty.businesses.BusinessCategoriesPostgresTest': 7, 'com.premierdarkcoffee.loyalty.fidelity.RewardGoalPostgresTest': 7, 'com.premierdarkcoffee.loyalty.analytics.ReturnRadarPostgresTest': 11, 'com.premierdarkcoffee.loyalty.businesses.OwnerExperiencePostgresTest': 16, 'com.premierdarkcoffee.loyalty.analytics.CustomerWorkspacePostgresTest': 18, 'com.premierdarkcoffee.loyalty.businesses.BusinessProfilePostgresTest': 12, 'com.premierdarkcoffee.loyalty.fidelity.PostgresTest': 15, 'com.premierdarkcoffee.loyalty.billing.CommercialPostgresTest': 29, 'com.premierdarkcoffee.loyalty.wallet.WalletPostgresTest': 40, 'com.premierdarkcoffee.loyalty.infrastructure.local.LocalStagingPostgresTest': 4, 'com.premierdarkcoffee.loyalty.wallet.WalletFirstPostgresTest': 19, 'com.premierdarkcoffee.loyalty.businesses.PlatformBranchesPostgresTest': 8, 'com.premierdarkcoffee.loyalty.marketing.EngagementPostgresTest': 22, 'com.premierdarkcoffee.loyalty.fidelity.PromotionLifecyclePostgresTest': 17, 'com.premierdarkcoffee.loyalty.analytics.CustomerActivityPostgresTest': 12},
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def allowed(relative):
    p = Path(relative)
    if p.is_absolute() or '..' in p.parts or not p.parts or any(x in IGNORED_DIRS for x in p.parts):
        return False
    name = p.name.lower()
    if name != '.env.example' and (any(re.search(r'(service[-_]?account|credential|secret|private[-_]?key)', part.lower()) for part in p.parts) or name.startswith('.env') or name in {'.local-demo.json', 'credentials.json', 'production.json', 'continuity.json'} or re.search(r'(service[-_]?account|credential|secret|private[-_]?key)', name) or p.suffix.lower() in {'.pem', '.p12', '.pfx', '.pkpass', '.pkpasses', '.p8', '.key', '.jks', '.keystore', '.cer', '.crt', '.zip', '.log', '.pyc', '.salive', '.sqlite', '.db', '.dump'}):
        return False
    if name.startswith('._') or name == '.ds_store':
        return False
    return str(p) in ROOT_FILES or p.parts[0] in SOURCE_DIRS


def git(project, *args, env=None, data=None, check=True):
    process = subprocess.run(['git', '-C', str(project), *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=40)
    if check and process.returncode:
        raise RuntimeError('Git: ' + process.stderr.decode('utf-8', 'replace').strip())
    return process


def tracked(project):
    result = git(project, 'ls-files', '-z', '--', '.', check=False)
    if result.returncode:
        return []
    return [x.decode('utf-8') for x in result.stdout.split(b'\0') if x]


def snapshot(project):
    project = Path(project)
    result = {}
    for top, dirs, names in os.walk(project):
        for d in dirs:
            candidate = Path(top)/d
            relative = candidate.relative_to(project).as_posix()
            if d not in IGNORED_DIRS and candidate.is_symlink() and allowed(relative+'/source.kt'):
                raise RuntimeError('No se incluyen directorios enlazados de código: '+relative)
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not (Path(top)/d).is_symlink()]
        for name in names:
            p = Path(top)/name
            rel = p.relative_to(project).as_posix()
            if not allowed(rel):
                continue
            if p.is_symlink():
                raise RuntimeError('No se incluyen enlaces simbólicos de código: ' + rel)
            contents = p.read_bytes()
            if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', contents):
                raise RuntimeError('Se detectó una clave privada en ' + rel + '. No se archivará ni se hará commit.')
            result[rel] = {'content': contents, 'sha256': digest(contents), 'mode': '100755' if p.stat().st_mode & 0o111 else '100644'}
    for rel in tracked(project):
        if allowed(rel) and rel not in result:
            result[rel] = {'content': None, 'sha256': None, 'mode': None}
    return result


def manifest(files):
    return {k: {'sha256': v['sha256'], 'mode': v['mode']} for k, v in sorted(files.items())}


def same_snapshot(a, b):
    return manifest(a) == manifest(b)


def source_path(project, relative):
    path = project/relative
    if not allowed(relative):
        raise RuntimeError('Ruta no permitida para actualización: ' + relative)
    for candidate in [path, *path.parents]:
        if candidate == project.parent:
            break
        if candidate.is_symlink():
            raise RuntimeError('No se modifica un enlace simbólico: ' + relative)
    return path


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.loyalty-write-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(value)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(name, path.stat().st_mode & 0o777 if path.exists() else 0o644)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def apply_updates(project, updates, evidence, dry_run=False):
    """All edits are prepared before the first write. Unrelated/current code is untouched."""
    prepared = {}
    for relative, operation in updates.items():
        path = source_path(project, relative)
        actual = path.read_bytes() if path.exists() else None
        mode = operation['mode']
        if mode == 'new':
            target = base64.b64decode(operation['content'])
            if actual is not None and actual != target:
                # Re-running v002 retains user reformats/edits of installed workflow files.
                if not (project/'scripts/checkpoint.py').exists():
                    raise RuntimeError('El archivo nuevo ya existe: ' + relative)
                continue
        elif mode == 'create_if_missing':
            if actual is not None:
                continue
            target = base64.b64decode(operation['content'])
        elif mode == 'append':
            original = (actual or b'').decode('utf-8')
            if operation['marker'] in original:
                continue
            target = (original.rstrip() + '\n\n' + operation['text'].rstrip() + '\n').encode()
        elif mode == 'text_patch':
            if actual is None:
                raise RuntimeError('Falta el documento: ' + relative)
            original = actual.decode('utf-8')
            for edit in operation['edits']:
                if original.count(edit['after']) == 1 and edit['before'] not in original:
                    continue
                if original.count(edit['before']) != 1:
                    raise RuntimeError('El párrafo cambió; se conserva para revisión: ' + relative)
                original = original.replace(edit['before'], edit['after'], 1)
            if operation.get('append_marker') and operation['append_marker'] not in original:
                original = original.rstrip() + '\n\n' + operation['append_text'].rstrip() + '\n'
            target = original.encode()
        elif mode == 'javascript_patch':
            if actual is None:
                raise RuntimeError('Falta archivo JavaScript: ' + relative)
            original = actual.decode('utf-8')
            for edit in operation['edits']:
                original = replace_javascript_fragment(original, edit['before'], edit['after'])
            target = original.encode()
        elif mode == 'kotlin_patch':
            if actual is None:
                raise RuntimeError('Falta archivo para aplicar el cambio: ' + relative)
            original = actual.decode('utf-8')
            for edit in operation['edits']:
                original = replace_kotlin_fragment(original, edit['before'], edit['after'])
            for injection in operation.get('injections', []):
                original = inject_kotlin_function(original, **injection)
            target = original.encode()
        elif mode == 'loyalty_kotlin':
            if actual is None:
                raise RuntimeError('Falta el archivo Kotlin esperado: ' + relative)
            target = migrate_loyalty_kotlin(actual.decode(), operation).encode()
        elif mode == 'product_label':
            if actual is None:
                raise RuntimeError('Falta el recurso esperado: ' + relative)
            target = re.sub(rb'\bComeback\b', b'Loyalty', actual).replace(b'COME<span>BACK</span>', b'LOYALTY').replace(b'COME<b>BACK</b>', b'LOYALTY')
        elif mode == 'python_merge':
            if actual is None:
                raise RuntimeError('Falta archivo Python: ' + relative)
            target = merge_python_module(actual.decode(), base64.b64decode(operation['before']).decode(), base64.b64decode(operation['content']).decode()).encode()
        else:
            raise RuntimeError('Modo de actualización desconocido.')
        if target != actual:
            prepared[relative] = (actual, target)
    if dry_run:
        return [{'path': k, 'before_sha256': digest(v[0]) if v[0] is not None else None, 'after_sha256': digest(v[1])} for k, v in prepared.items()]
    written = []
    try:
        for relative, (before, after) in prepared.items():
            path = source_path(project, relative)
            if before is not None:
                backup = evidence/'before'/relative
                backup.parent.mkdir(parents=True, exist_ok=True)
                backup.write_bytes(before)
            atomic_write(path, after)
            written.append((path, before))
    except BaseException:
        for path, before in reversed(written):
            if before is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, before)
        raise
    return [{'path': k, 'before_sha256': digest(v[0]) if v[0] is not None else None, 'after_sha256': digest(v[1])} for k, v in prepared.items()]


def kotlin_tokens(source):
    # Only used to locate bounded migration-check expressions. No semantic equivalence claim
    # for a whole Kotlin file; newlines can be meaningful between statements.
    tokens = []
    i = 0
    while i < len(source):
        if source[i].isspace():
            i += 1
            continue
        if source.startswith('//', i):
            end = source.find('\n', i)
            i = len(source) if end == -1 else end
            continue
        if source.startswith('/*', i):
            depth, start = 1, i
            i += 2
            while i < len(source) and depth:
                if source.startswith('/*', i):
                    depth += 1
                    i += 2
                elif source.startswith('*/', i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise RuntimeError('Comentario Kotlin sin cerrar en ' + str(start))
            continue
        start = i
        if source.startswith('"""', i):
            end = source.find('"""', i + 3)
            if end < 0:
                raise RuntimeError('Texto Kotlin sin cerrar.')
            i = end + 3
        elif source[i] in '\"\'`':
            quote = source[i]
            i += 1
            while i < len(source):
                if source[i] == '\\' and quote != '`':
                    i += 2
                elif source[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            else:
                raise RuntimeError('Texto Kotlin sin cerrar.')
        elif source[i].isalnum() or source[i] == '_':
            i += 1
            while i < len(source) and (source[i].isalnum() or source[i] == '_'):
                i += 1
        else:
            i += 1
        tokens.append((source[start:i], start, i))
    return [t for n, t in enumerate(tokens) if not (t[0] == ',' and n + 1 < len(tokens) and tokens[n+1][0] in {')', ']'})]


def replace_kotlin_fragment(source, before, after):
    actual = [t for t in kotlin_tokens(source) if t[0] != ';']
    expected = [t[0] for t in kotlin_tokens(before) if t[0] != ';']
    new = [t[0] for t in kotlin_tokens(after) if t[0] != ';']
    values = [t[0] for t in actual]
    def matches(pattern):
        return [i for i in range(len(values)-len(pattern)+1) if values[i:i+len(pattern)] == pattern]
    old_matches = matches(expected)
    new_matches = matches(new)
    if len(new_matches) == 1 and all(new_matches[0] <= start and start+len(expected) <= new_matches[0]+len(new) for start in old_matches):
        return source
    if len(old_matches) != 1:
        raise RuntimeError('El fragmento de migración cambió más allá del formato. Se conserva tu código para revisión.')
    start = actual[old_matches[0]][1]
    end = actual[old_matches[0]+len(expected)-1][2]
    region = source[start:end]
    baseline_comments = kotlin_comments(before)
    if kotlin_comments(region) != baseline_comments or any(comment not in kotlin_comments(after) for comment in baseline_comments):
        raise RuntimeError('El fragmento contiene comentarios nuevos; no se reemplazan automáticamente.')
    return source[:start] + after + source[end:]


def verify_suites(project, task):
    found = []
    valid = True
    for name, expected in SUITES[task].items():
        path = project/'build'/'test-results'/task/('TEST-'+name+'.xml')
        try:
            root = ET.parse(path).getroot()
            row = {k: int(root.get(k, '0')) for k in ('tests', 'failures', 'errors', 'skipped')}
            row['name'] = name
            row['pass'] = row['tests'] == expected and not any(row[k] for k in ('failures', 'errors', 'skipped'))
        except Exception:
            row = {'name': name, 'pass': False, 'reason': 'MISSING_REPORT'}
        valid = valid and row['pass']
        found.append(row)
    return valid, found


def require_git_ready(project, allow_detached=False):
    if not shutil.which('git'):
        raise RuntimeError('Git no está disponible. El PASS no se anunciará como guardado sin commit.')
    probe = git(project, 'rev-parse', '--show-toplevel', check=False)
    if probe.returncode:
        if (project/'.git').exists():
            raise RuntimeError('No se pudo abrir el repositorio Git existente.')
        git(project, 'init')
    root = Path(git(project, 'rev-parse', '--show-toplevel').stdout.decode().strip()).resolve()
    for state in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'):
        p = Path(git(project, 'rev-parse', '--git-path', state).stdout.decode().strip())
        if not p.is_absolute():
            p = project/p
        if p.exists():
            raise RuntimeError('Git tiene una operación en curso: ' + state + '. Se conserva intacta.')
    branch = git(project, 'symbolic-ref', '--quiet', 'HEAD', check=False)
    if branch.returncode and not allow_detached:
        raise RuntimeError('HEAD está separado de una rama; no se cambia de rama automáticamente.')
    if git(project, 'ls-files', '-u').stdout:
        raise RuntimeError('Hay conflictos Git pendientes.')
    return root, branch.stdout.decode().strip()


def verify_existing_commit(project, tested, expected):
    # Verify an existing published revision; never initialise a repository.
    git(project,'rev-parse','--verify','HEAD')
    require_git_ready(project, allow_detached=True)
    commit=git(project,'rev-parse','HEAD').stdout.decode().strip()
    if commit!=expected or git(project,'status','--porcelain',env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}).stdout:
        raise RuntimeError('COMMITTED_SOURCE_CHANGED: el despliegue exige el commit exacto y limpio.')
    if not same_snapshot(tested,snapshot(project)):
        raise RuntimeError('TESTED_SOURCE_CHANGED: las fuentes cambiaron después de validarse.')
    return {'status':'VERIFIED','hash':commit,'pushed':None}


def create_checkpoint(project, tested, evidence, run_id, validation):
    if validation.get('status') != 'CORE_TESTS_PASS' or validation.get('tests') != TOTAL_TESTS or validation.get('staging') != 'LOCAL_STAGING_PASS':
        raise RuntimeError('No se hace commit sin las '+str(TOTAL_TESTS)+' pruebas completas y Docker local verificado.')
    repo, _ = require_git_ready(project)
    prefix = project.resolve().relative_to(repo).as_posix()
    prefix = "" if prefix == "." else prefix+"/"
    if not same_snapshot(tested, snapshot(project)):
        raise RuntimeError('El código cambió después de las pruebas. No se crea un commit con contenido sin validar.')
    old = git(repo, 'rev-parse', '--verify', 'HEAD', check=False)
    parent = old.stdout.decode().strip() if old.returncode == 0 else None
    branch = git(repo, 'symbolic-ref', '--quiet', 'HEAD').stdout.decode().strip()
    real_index = Path(git(repo, 'rev-parse', '--git-path', 'index').stdout.decode().strip())
    if not real_index.is_absolute():
        real_index = repo/real_index
    index_lock = real_index.with_name(real_index.name+'.lock')
    # Keep the real index locked while preserving entries outside the tested scope.
    lock_fd = os.open(index_lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    advanced = None
    commit_env = os.environ.copy()
    identity = 'configured'
    if git(repo, 'var', 'GIT_AUTHOR_IDENT', check=False).returncode or git(repo, 'var', 'GIT_COMMITTER_IDENT', check=False).returncode:
        identity = 'Loyalty Checkpoint <checkpoint@loyalty.local>'
        commit_env.update(GIT_AUTHOR_NAME='Loyalty Checkpoint', GIT_AUTHOR_EMAIL='checkpoint@loyalty.local', GIT_COMMITTER_NAME='Loyalty Checkpoint', GIT_COMMITTER_EMAIL='checkpoint@loyalty.local')
    try:
        with tempfile.TemporaryDirectory(prefix='loyalty-git-') as tmp:
            prepared = Path(tmp)/'tested.index'
            kept = Path(tmp)/'preserved.index'
            staged_env = dict(commit_env, GIT_INDEX_FILE=str(prepared))
            preserve_env = dict(commit_env, GIT_INDEX_FILE=str(kept))
            git(repo, 'read-tree', parent or '--empty', env=staged_env)
            if real_index.exists():
                shutil.copyfile(real_index, kept)
            else:
                git(repo, 'read-tree', '--empty', env=preserve_env)
            for relative, value in sorted(tested.items()):
                relative = prefix+relative
                for environment in (staged_env, preserve_env):
                    if value['content'] is None:
                        git(repo, 'update-index', '--force-remove', '--', relative, env=environment)
                    else:
                        oid = git(repo, 'hash-object', '-w', '--stdin', data=value['content']).stdout.decode().strip()
                        git(repo, 'update-index', '--add', '--cacheinfo', value['mode']+','+oid+','+relative, env=environment)
            tree = git(repo, 'write-tree', env=staged_env).stdout.decode().strip()
            message = 'Loyalty '+VERSION+': PASS de '+str(TOTAL_TESTS)+' pruebas y Docker local\n\nEvidencia: '+run_id+'\nWallet: la configuración HTTPS y la validación visual en teléfonos se informan por separado.\n'
            command = ['commit-tree', tree]
            if parent:
                command += ['-p', parent]
            commit = git(repo, *command, data=message.encode(), env=commit_env).stdout.decode().strip()
            # Publish only if nobody advanced this branch during validation/commit preparation.
            object_format = git(repo, 'rev-parse', '--show-object-format').stdout.decode().strip()
            expected = parent or ('0' * (64 if object_format == 'sha256' else 40))
            if git(repo, 'symbolic-ref', '--quiet', 'HEAD').stdout.decode().strip() != branch:
                raise RuntimeError('La rama cambió durante el checkpoint.')
            git(repo, 'update-ref', '-m', 'Loyalty '+VERSION+' PASS', branch, commit, expected)
            advanced = commit
            with os.fdopen(lock_fd, 'wb') as out:
                lock_fd = None
                out.write(kept.read_bytes())
                out.flush()
                os.fsync(out.fileno())
            os.replace(index_lock, real_index)
            stat = git(repo, 'show', '--format=fuller', '--stat', '--no-renames', commit).stdout.decode('utf-8', 'replace')
            (evidence/'commit.txt').write_text(stat)
            for name, value in tested.items():
                if value['content'] is not None:
                    saved = evidence/'tested'/name
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    saved.write_bytes(value['content'])
            return {'status': 'CREATED', 'hash': commit, 'parent': parent, 'branch': branch, 'identity': identity, 'tree': tree, 'pushed': False}
    except BaseException as error:
        if advanced:
            (evidence/'commit-recovery.json').write_text(json.dumps({'commit': advanced, 'error': str(error), 'note': 'El commit existe. Revisar sincronización del índice; no se reescribió historia.'}, indent=2))
        raise
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
        index_lock.unlink(missing_ok=True)


def require_development_checkout(project, environment=None):
    env = os.environ if environment is None else environment
    if any(env.get(k) == 'production' for k in ('LUMINA_PROFILE', 'LOYALTY_PROFILE')) or env.get('PRODUCTION_IDENTITY_PATH'):
        raise RuntimeError('PRODUCTION_CHECKOUT_BLOCKED: usa una copia de desarrollo y el despliegue de producción.')
    if (project/'release.json').exists() or (project/'.production').exists():
        raise RuntimeError('PRODUCTION_CHECKOUT_BLOCKED: la versión de producción no se actualiza en el sitio.')
    for name in ('.env', '.env.wallet', '.env.staging'):
        path=project/name
        if path.is_symlink():
            raise RuntimeError('Configuración enlazada: se requiere revisión antes de ejecutar pruebas locales.')
        if path.is_file() and (path.stat().st_size > 100_000 or re.search(r'(?m)^\s*(?:export\s+)?(?:LUMINA_PROFILE|LOYALTY_PROFILE)\s*=\s*[\"\x27]?production\b|^\s*(?:export\s+)?PRODUCTION_IDENTITY_PATH\s*=\s*[^\s]', path.read_text())):
            raise RuntimeError('PRODUCTION_CHECKOUT_BLOCKED: configuración de producción en el checkout local.')


def main(arguments=None, updates=None, origin=None):
    parser = argparse.ArgumentParser(description='Validar Loyalty, guardar un commit local y generar evidencia.')
    parser.add_argument('--project', default=str(Path(__file__).resolve().parents[1]) if '__file__' in globals() else DEFAULT_PROJECT)
    parser.add_argument('--output-dir', default=str(Path.home()/'Downloads'))
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--verify-only', action='store_true', help='Ejecutar todas las pruebas sobre un commit limpio sin crear otro commit.')
    parser.add_argument('--staging-run', help='Identificador privado de Docker para validar un despliegue sin reutilizar el piloto local.')
    parser.add_argument('--https', action='store_true', help='Preparar el túnel y cargar Wallet después del checkpoint completo.')
    parser.add_argument('--renew-test-url', action='store_true', help='Permitir recuperar la URL de pruebas; las tarjetas con la dirección anterior deben volver a guardarse conservando su identidad.')
    args = parser.parse_args(arguments)
    if args.verify_only and (updates or args.https or args.renew_test_url):
        parser.error('--verify-only valida el commit existente y no admite actualizaciones ni configuración HTTPS.')
    if args.staging_run and (not args.verify_only or not re.fullmatch('[a-f0-9]{24}', args.staging_run)):
        parser.error('--staging-run requiere --verify-only y un identificador hexadecimal de 24 caracteres.')
    if args.renew_test_url:
        args.https = True
    os.umask(0o077)
    project = Path(args.project).expanduser().resolve()
    output = Path(args.output_dir).expanduser().resolve()
    if output == project or project in output.parents:
        raise RuntimeError('La evidencia debe guardarse fuera del proyecto, por ejemplo en Downloads.')
    output.mkdir(parents=True, exist_ok=True)
    run_id = 'loyalty_'+VERSION+'_resultado_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'_'+secrets.token_hex(3)
    folder = output/run_id
    folder.mkdir(mode=0o700)
    (folder/'logs').mkdir()
    report = {'version': VERSION, 'status': 'STARTED', 'checks': {}, 'pending': ['APPLE_DEVICE_VALIDATION', 'GOOGLE_DEVICE_VALIDATION', 'PUBLIC_HTTPS_AND_CREDENTIALS', 'PUBLIC_PRODUCTION_RELEASE', 'SINGLE_DEVICE_POLICY_PENDING'], 'auto_commit': {'status': 'NOT_ATTEMPTED'}, 'project': str(project)}
    secret_values = [v for k, v in os.environ.items() if any(x in k.upper() for x in ('PASSWORD','TOKEN','SECRET','PEPPER','DATA_KEY','PRIVATE_KEY')) and len(v) >= 8]
    container = None
    lock = project/'.loyalty-checkpoint.lock'
    owned_lock = False
    def clean(value):
        for secret in secret_values:
            value = value.replace(secret, '[REDACTED]')
        value = re.sub(r'(Bearer\s+)[A-Za-z0-9._-]+', r'\1[REDACTED]', value)
        value = re.sub(r'(postgres(?:ql)?://[^:\s/]+:)[^@\s]+@', r'\1[REDACTED]@', value)
        return re.sub(r'(?i)((?:password|token|secret|pepper)\s*[=:]\s*)[^\s,;]+', r'\1[REDACTED]', value)
    def run(label, command, timeout=600, environment=None):
        process = subprocess.Popen(command, cwd=project, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        stop = threading.Event()
        def heartbeat():
            began = time.monotonic()
            while not stop.wait(20):
                with (folder/'logs'/'progress.log').open('a') as progress:
                    progress.write(label+': trabajando ('+str(int(time.monotonic()-began))+' s)\n')
        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            try:
                data, _ = process.communicate(timeout=timeout)
                code = process.returncode
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    data, _ = process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    data, _ = process.communicate()
                code = 124
            log = clean(data.decode('utf-8', 'replace'))
            (folder/'logs'/(label+'.log')).write_text(log)
            report['checks'][label] = {'exit_code': code}
            return code
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
            stop.set()
            thread.join(timeout=1)
    def copy_reports():
        for task in SUITES:
            for file in (project/'build'/'test-results'/task).glob('TEST-*.xml'):
                dest = folder/'tests'/task/file.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(clean(file.read_text(errors='replace')))
    old_sigterm = signal.signal(signal.SIGTERM, lambda signum, frame: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        original = Path(origin or __file__).resolve()
        shutil.copy2(original, folder/original.name)
        if not project.is_dir() or not (project/'gradlew').is_file():
            raise RuntimeError('No se encontró el proyecto Ktor: '+str(project))
        require_development_checkout(project)
        lock.mkdir()
        owned_lock = True
        snapshot(project)
        if updates and not (project/'scripts/ui/wallet-health.spec.cjs').is_file():
            raise RuntimeError('v040 requiere v039 instalado. Comparte el ZIP anterior antes de continuar.')
        if updates:
            report['changes'] = apply_updates(project, updates, folder, dry_run=args.check_only)
        # No comparison with v001 byte hashes. Validate the actual saved working tree.
        snapshot(project)
        if args.check_only:
            report['status'] = 'PREFLIGHT_PASS_NO_COMMIT'
            return 0
        verified_head=None
        if args.verify_only:
            verified_head=git(project,'rev-parse','HEAD').stdout.decode().strip()
            verify_existing_commit(project,snapshot(project),verified_head)
        else:
            require_git_ready(project)
        env = os.environ.copy()
        if sys.platform == 'darwin' and Path('/usr/libexec/java_home').exists():
            result = subprocess.run(['/usr/libexec/java_home', '-v', '21'], capture_output=True, text=True)
            if result.returncode == 0:
                env['JAVA_HOME'] = result.stdout.strip()
                env['PATH'] = env['JAVA_HOME']+'/bin:'+env.get('PATH','')
        test_env = env.copy()
        test_env['TEST_DATABASE_POOL_SIZE'] = '10'
        postgres_ready = bool(env.get('TEST_DATABASE_URL'))
        if not postgres_ready and shutil.which('docker') and run('docker_ready', ['docker','info','--format','{{.ServerVersion}}'], 25) == 0:
            container = 'loyalty-'+VERSION+'-test-'+secrets.token_hex(5)
            password = secrets.token_urlsafe(32)
            secret_values.append(password)
            docker_env = dict(env, POSTGRES_PASSWORD=password)
            code = run('postgres_start', ['docker','run','-d','--rm','--name',container,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=loyalty_test','-p','127.0.0.1::5432','postgres:16'], 240, docker_env)
            if code == 0:
                for _ in range(40):
                    probe = subprocess.run(['docker','exec',container,'pg_isready','-U','postgres','-d','loyalty_test'], capture_output=True, timeout=5)
                    if probe.returncode == 0:
                        postgres_ready = True
                        break
                    time.sleep(1)
                port = subprocess.run(['docker','port',container,'5432/tcp'], capture_output=True, text=True, timeout=10)
                assigned = port.stdout.strip().split(':')[-1]
                if postgres_ready and port.returncode == 0 and assigned.isdigit():
                    test_env.update(TEST_DATABASE_URL='jdbc:postgresql://127.0.0.1:'+assigned+'/loyalty_test',TEST_DATABASE_USER='postgres',TEST_DATABASE_PASSWORD=password)
                else:
                    postgres_ready = False
        for attempt in (1, 2):
            before = snapshot(project)
            prefix = 'attempt_'+str(attempt)+'_'
            workflow = run(prefix+'workflow_tests', [sys.executable,'-c',"import unittest,sys; s=unittest.defaultTestLoader.discover('scripts/tests',pattern='test_*.py'); assert s.countTestCases()>=224, 'Faltan pruebas del flujo'; r=unittest.TextTestRunner(verbosity=2).run(s); sys.exit(0 if r.wasSuccessful() and not r.skipped else 1)"], 120, env)
            if workflow:
                report['status'] = 'WORKFLOW_TESTS_FAILED_NO_COMMIT'
                break
            if run(prefix+'lumina_http', [sys.executable,'scripts/test_lumina.py'],960,env):
                report['status'] = 'LUMINA_TESTS_FAILED_NO_COMMIT'
                break
            command = ['bash','gradlew','--no-daemon','--console=plain','clean','test','installDist']
            compile_code = run(prefix+'compile_unit', command, 900, env)
            unit_valid, unit_suites = verify_suites(project, 'test')
            report['unit_suites'] = unit_suites
            if compile_code or not unit_valid:
                report['status'] = 'BUILD_OR_UNIT_FAILED_NO_COMMIT'
                copy_reports()
                break
            if not postgres_ready:
                report['status'] = 'UNIT_PASS_POSTGRES_PENDING_NO_COMMIT'
                report['pending'].append('POSTGRES_INTEGRATION')
                copy_reports()
                break
            pg_code = run(prefix+'postgres', ['bash','gradlew','--no-daemon','--console=plain','postgresTest','--rerun-tasks'], 600, test_env)
            pg_valid, pg_suites = verify_suites(project, 'postgresTest')
            report['postgres_suites'] = pg_suites
            copy_reports()
            if pg_code or not pg_valid:
                report['status'] = 'POSTGRES_FAILED_NO_COMMIT'
                break
            try:
                staging_env = dict(env)
                if args.staging_run:
                    staging_env['LUMINA_STAGING_RUN'] = args.staging_run
                report['staging'] = check_staging(project, folder, run, prefix, staging_env)
                gateway_path = folder/(prefix+'gateway.json')
                gateway_code = run(prefix+'gateway', [sys.executable,str(project/'scripts/wallet_local.py'),'gateway-check','--report',str(gateway_path)],600,staging_env)
                gateway = json.loads(gateway_path.read_text()) if gateway_path.exists() else {}
                report['gateway'] = gateway
                if gateway_code or gateway.get('status') != 'LOCAL_GATEWAY_PASS' or gateway.get('checks',0) < 97:
                    raise RuntimeError('El gateway público no pasó sus comprobaciones de rutas y autenticación.')
            except Exception as error:
                if isinstance(error, StagingFailure):
                    report['staging'] = error.result
                if attempt == 1 and not same_snapshot(before, snapshot(project)):
                    report['source_revalidated_after_build'] = True
                    continue
                report['status'] = 'STAGING_FAILED_NO_COMMIT'
                report['staging_error'] = clean(str(error))
                break
            after = snapshot(project)
            if not same_snapshot(before, after):
                if attempt == 1:
                    report['source_revalidated_after_tests'] = True
                    continue
                report['status'] = 'SOURCE_CHANGED_DURING_TESTS_NO_COMMIT'
                break
            report['core_status'] = 'CORE_TESTS_PASS'
            report['tested_manifest'] = manifest(after)
            if args.verify_only:
                report['auto_commit']=verify_existing_commit(project,after,verified_head)
                report['status']='CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_VERIFIED_WALLET_DEVICE_TEST_PENDING'
            else:
                report['auto_commit'] = create_checkpoint(project, after, folder, run_id, {'status':'CORE_TESTS_PASS','tests':TOTAL_TESTS,'staging':report['staging']['status']})
                report['status'] = 'CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_CREATED_WALLET_DEVICE_TEST_PENDING'
            if args.https:
                https_path = folder/'wallet_https.json'
                https_command = [sys.executable,str(project/'scripts/wallet_local.py'),'start','--report',str(https_path)]
                if args.renew_test_url:
                    https_command.append('--renew-test-url')
                https_code = run('wallet_https_setup', https_command,900,env)
                https = json.loads(https_path.read_text()) if https_path.exists() else {'status':'HTTPS_SETUP_FAILED'}
                report['https'] = https
                if https.get('pass_refresh'):
                    report['pending'].append('EXISTING_PASS_CONNECTION_REFRESH')
                if https_code or not https.get('tls_verified'):
                    report['status'] = 'CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_CREATED_HTTPS_SETUP_FAILED'
                else:
                    suffix = ('WALLET_CONNECTION_REFRESH_PENDING' if https.get('pass_refresh') else
                              'WALLET_CREDENTIALS_PENDING' if https.get('status') == 'HTTPS_PASS_WALLET_CREDENTIALS_PENDING' else 'WALLET_DEVICE_TEST_PENDING')
                    report['status'] = 'CORE_TESTS_PASS_LOCAL_DOCKER_PASS_HTTPS_PASS_COMMIT_CREATED_'+suffix
                    if all(https.get('requested',{}).get(name) for name in ('apple','google')):
                        report['pending'] = [p for p in report['pending'] if p != 'PUBLIC_HTTPS_AND_CREDENTIALS']
            break
    except KeyboardInterrupt:
        report['status'] = 'INTERRUPTED_NO_COMMIT' if report['auto_commit']['status'] != 'CREATED' else 'INTERRUPTED_AFTER_COMMIT'
    except BaseException as error:
        report['status'] = ('COMMITTED_SOURCE_VERIFICATION_FAILED' if args.verify_only else 'PASS_COMMIT_FAILED') if report.get('core_status') == 'CORE_TESTS_PASS' else 'UPDATE_OR_CHECK_FAILED_NO_COMMIT'
        report['error'] = clean(str(error))
        (folder/'error.txt').write_text(clean(traceback.format_exc()))
    finally:
        signal.signal(signal.SIGTERM, old_sigterm)
        if container:
            try:
                subprocess.run(['docker','rm','-f',container], capture_output=True, timeout=30)
            except Exception:
                report['cleanup_warning'] = container
        if owned_lock:
            try:
                lock.rmdir()
            except OSError:
                report['lock_cleanup_warning'] = str(lock)
        try:
            current = snapshot(project) if project.exists() else {}
            (folder/'current_manifest.json').write_text(json.dumps(manifest(current), indent=2))
            for name, value in current.items():
                if value['content'] is not None:
                    dest = folder/'after'/name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(value['content'])
        except Exception as error:
            report['snapshot_error'] = clean(str(error))
        recovery = folder/'commit-recovery.json'
        if recovery.exists():
            recovered = json.loads(recovery.read_text())
            report['auto_commit'] = {'status':'CREATED_RECOVERY_REQUIRED','hash':recovered['commit']}
            report['status'] = 'COMMIT_CREATED_REVIEW_REQUIRED'
        report['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (folder/'RESULTADO.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        (folder/'LEEME.txt').write_text('Resultado: '+report['status']+'\n\nEl ZIP incluye el script ejecutado, código actual, cambios previos, pruebas, logs del servidor/Docker y datos del commit local.\nNo incluye .git, .env, .env.wallet, accesos privados, credenciales ni cachés. No hace push.\nUn PASS parcial no genera commit. La prueba de Wallet con credenciales y teléfonos reales permanece pendiente.\n')
        archive = output/(run_id+'.zip')
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in sorted(folder.rglob('*')):
                if file.is_file() and not file.is_symlink():
                    z.write(file, run_id+'/'+file.relative_to(folder).as_posix())
        with zipfile.ZipFile(archive) as z:
            if z.testzip():
                raise RuntimeError('El ZIP no pasó la verificación de integridad.')
        print('RESULTADO='+report['status'],flush=True)
        if report.get('core_status') == 'CORE_TESTS_PASS' and report['auto_commit'].get('hash'):
            try:
                show_recovery = report.get('https', {}).get('pass_refresh') or report.get('https', {}).get('status') == 'HTTPS_SETUP_FAILED'
                if show_recovery:
                    import webbrowser
                    webbrowser.open((project/'.local-wallet/guide.html').as_uri())
            except Exception:
                pass
    return 0 if report['status'] in {'CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_VERIFIED_WALLET_DEVICE_TEST_PENDING','CORE_TESTS_PASS_LOCAL_DOCKER_PASS_COMMIT_CREATED_WALLET_DEVICE_TEST_PENDING','PREFLIGHT_PASS_NO_COMMIT','CORE_TESTS_PASS_LOCAL_DOCKER_PASS_HTTPS_PASS_COMMIT_CREATED_WALLET_CONNECTION_REFRESH_PENDING','CORE_TESTS_PASS_LOCAL_DOCKER_PASS_HTTPS_PASS_COMMIT_CREATED_WALLET_CREDENTIALS_PENDING','CORE_TESTS_PASS_LOCAL_DOCKER_PASS_HTTPS_PASS_COMMIT_CREATED_WALLET_DEVICE_TEST_PENDING'} else 1




import ast

TOTAL_TESTS = sum(sum(suite.values()) for suite in SUITES.values())

def inject_kotlin_function(source, function, anchor, code):
    """Insert inside a named function without depending on declaration order or whitespace."""
    tokens = [t for t in kotlin_tokens(source) if t[0] != ';']
    values = [t[0] for t in tokens]
    starts = [i for i in range(len(values)-2) if values[i:i+3] == ['fun', function, '(']]
    if len(starts) != 1:
        raise RuntimeError('No se pudo ubicar una función única: ' + function)
    start = starts[0]
    opening = next(i for i in range(start, len(values)) if values[i] == '{')
    depth, end = 1, opening + 1
    while depth and end < len(values):
        depth += (values[end] == '{') - (values[end] == '}')
        end += 1
    if depth:
        raise RuntimeError('Función sin cierre: ' + function)
    def find(text):
        pattern = [t[0] for t in kotlin_tokens(text) if t[0] != ';']
        return [(i, i+len(pattern)) for i in range(start, end-len(pattern)+1) if values[i:i+len(pattern)] == pattern]
    if find(code):
        return source
    matches = find(anchor)
    if len(matches) != 1:
        raise RuntimeError('Conflicto real en '+function+': no se encontró el punto de inserción. Se conserva tu código.')
    pos = tokens[matches[0][1]-1][2]
    return source[:pos] + '\n        ' + code + ';\n        ' + source[pos:]

def merge_python_module(actual, baseline, desired):
    """Replace only changed top-level definitions. AST comparison accepts Python reformatting."""
    def definitions(text):
        result = {}
        nodes = [(n, '') for n in ast.parse(text).body]
        while nodes:
            n, prefix = nodes.pop(0)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                key = ('definition', prefix + n.name)
                if isinstance(n, ast.ClassDef):
                    nodes.extend((child, prefix+n.name+'.') for child in n.body)
            elif isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
                key = ('assignment', n.targets[0].id)
            elif isinstance(n, (ast.Import, ast.ImportFrom)):
                key = ('import', ast.dump(n, include_attributes=False))
            else:
                continue
            if key in result:
                raise RuntimeError('Declaración Python duplicada: ' + str(key))
            result[key] = n
        return result
    old, current, new = definitions(baseline), definitions(actual), definitions(desired)
    def same(a, b):
        return a is not None and b is not None and ast.dump(a, include_attributes=False) == ast.dump(b, include_attributes=False)
    def region(text, node):
        # ast offsets are UTF-8 byte offsets, not character positions.
        lines = text.encode().splitlines(keepends=True)
        first = min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])
        return sum(map(len, lines[:first-1])) + node.col_offset, sum(map(len, lines[:node.end_lineno-1])) + node.end_col_offset
    edits, additions, methods = [], [], {}
    whole_classes = [key[1] + '.' for key, target in new.items()
                     if isinstance(target, ast.ClassDef) and key not in old and key not in current]
    for key, target in new.items():
        # A newly inserted class already contains its methods; do not add them at module scope.
        if key[0] == 'definition' and any(key[1].startswith(prefix) for prefix in whole_classes):
            continue
        if isinstance(target, ast.ClassDef) and key in old and key in current:
            continue
        if same(old.get(key), target):
            continue
        present = current.get(key)
        if same(present, target):
            continue
        a, b = region(desired, target)
        replacement = desired.encode()[a:b]
        if present is None and key not in old:
            if key[0] == 'definition' and '.' in key[1]:
                parent = ('definition', key[1].rsplit('.', 1)[0])
                if not isinstance(current.get(parent), ast.ClassDef):
                    raise RuntimeError('No se encontró la clase para añadir ' + str(key))
                methods.setdefault(parent, []).append((target, replacement))
            else:
                additions.append(replacement)
        elif not same(present, old.get(key)):
            raise RuntimeError('Cambió la lógica de '+str(key)+'. Se conserva tu archivo para revisar el conflicto.')
        else:
            delta = present.col_offset - target.col_offset
            if delta:
                lines = replacement.splitlines(keepends=True)
                for i in range(1, len(lines)):
                    lines[i] = (b' ' * delta + lines[i]) if delta > 0 else lines[i][-delta:]
                replacement = b''.join(lines)
            a, b = region(actual, present); edits.append((a, b, replacement))
    value = actual.encode()
    for a, b, replacement in sorted(edits, reverse=True):
        value = value[:a] + replacement + value[b:]
    for parent, entries in sorted(methods.items(), key=lambda item: item[0][1].count('.'), reverse=True):
        node = definitions(value.decode())[parent]
        if node.body[0].lineno == node.lineno:
            raise RuntimeError('Se requiere una clase multilínea para añadir métodos: ' + parent[1])
        indent = node.body[0].col_offset
        pieces = []
        for target, replacement in entries:
            lines = replacement.splitlines(keepends=True)
            delta = indent - target.col_offset
            for i in range(1, len(lines)):
                lines[i] = (b' ' * delta + lines[i]) if delta >= 0 else lines[i][-delta:]
            pieces.append(b' ' * indent + b''.join(lines))
        # Insert after the complete last line so its trailing comment stays with its statement.
        pos = sum(map(len, value.splitlines(keepends=True)[:node.end_lineno]))
        value = value[:pos] + b'\n' + b'\n\n'.join(pieces) + b'\n' + value[pos:]
    if additions:
        # New imports/constants/helpers must exist before any main() invocation.
        tree = ast.parse(value.decode()); guards = [n for n in tree.body if isinstance(n, ast.If) and '__name__' in ast.unparse(n.test)]
        pos = region(value.decode(), guards[-1])[0] if guards else len(value)
        value = value[:pos] + b'\n\n' + b'\n\n'.join(additions) + b'\n\n' + value[pos:]
    merged = definitions(value.decode())
    for key, target in new.items():
        if isinstance(target, ast.ClassDef) or same(old.get(key), target):
            continue
        if not same(merged.get(key), target):
            raise RuntimeError('No se pudo preservar la estructura Python de '+str(key))
    return value.decode()



class StagingFailure(RuntimeError):
    def __init__(self, result, destination):
        self.result = result
        detail = str(result.get('error') or 'Construcción, arranque o verificación de roles incompletos.')[:1000]
        super().__init__('Docker local: '+detail+' Informe: '+str(destination))


def check_staging(project, folder, run, prefix, env):
    destination = folder/(prefix+'staging.json')
    code = run(prefix+'local_staging', [sys.executable,str(project/'scripts/staging.py'),'start','--no-browser','--report',str(destination)], 2100, env)
    try:
        result = json.loads(destination.read_text())
    except (OSError,ValueError):
        raise RuntimeError('No se recibió el informe de Docker local. Log: '+str(folder/'logs'/(prefix+'local_staging.log')))
    if code or result.get('status') != 'LOCAL_STAGING_PASS' or result.get('http_checks') != 'PASS' or not re.fullmatch('[a-f0-9]{64}', result.get('source_sha','')):
        raise StagingFailure(result, destination)
    return result



def javascript_tokens(source):
    """Tokens for scoped JS edits; understands regexes and nested template expressions."""
    result = []
    n = len(source)
    def add(start, end):
        result.append((source[start:end], start, end))
    def quoted(i, quote):
        start = i; i += 1
        while i < n:
            if source[i] == '\\': i += 2
            elif source[i] == quote:
                add(start, i+1); return i+1
            else: i += 1
        raise RuntimeError('Texto JavaScript sin cerrar.')
    def template(i):
        add(i, i+1); i += 1; start = i
        while i < n:
            if source[i] == '\\': i += 2
            elif source[i] == '`':
                if start < i: add(start, i)
                add(i, i+1); return i+1
            elif source.startswith('${', i):
                if start < i: add(start, i)
                add(i, i+2); i = scan(i+2, True); start = i
            else: i += 1
        raise RuntimeError('Plantilla JavaScript sin cerrar.')
    def scan(i, expression=False):
        depth = 0
        while i < n:
            ch = source[i]
            if ch.isspace(): i += 1; continue
            if expression and ch == '}' and depth == 0:
                add(i, i+1); return i+1
            if source.startswith('//', i):
                end = source.find('\n', i)
                end = n if end < 0 else end
                add(i, end); i = end; continue
            if source.startswith('/*', i):
                end = source.find('*/', i+2)
                if end < 0: raise RuntimeError('Comentario JavaScript sin cerrar.')
                add(i, end+2); i = end+2; continue
            if ch in "\"'": i = quoted(i, ch); continue
            if ch == '`': i = template(i); continue
            previous = result[-1][0] if result else ''
            if ch == '/' and previous in {'', '(', '=', ':', ',', '[', '!', '?', '{', 'return', '=>', '&&', '||', '${'}:
                start = i; i += 1; bracket = False
                while i < n:
                    if source[i] == '\\': i += 2; continue
                    if source[i] == '[': bracket = True
                    if source[i] == ']': bracket = False
                    if source[i] == '/' and not bracket:
                        i += 1
                        while i < n and source[i].isalpha(): i += 1
                        add(start, i); break
                    i += 1
                else: raise RuntimeError('Expresión regular JavaScript sin cerrar.')
                continue
            if ch == '{': depth += 1
            if ch == '}': depth -= 1
            if ch.isalnum() or ch in '_$':
                start = i; i += 1
                while i < n and (source[i].isalnum() or source[i] in '_$'): i += 1
                add(start, i); continue
            operator = next((op for op in ('===','!==','=>','==','!=','>=','<=','&&','||','??','?.','++','--','**') if source.startswith(op, i)), None)
            end = i + (len(operator) if operator else 1)
            add(i, end); i = end
        if expression: raise RuntimeError('Expresión de plantilla sin cerrar.')
        return i
    scan(0)
    return [t for i,t in enumerate(result) if t[0] != ';' and not (t[0] == ',' and i+1 < len(result) and result[i+1][0] in {')',']','}'})]

def replace_javascript_fragment(source, before, after):
    tokens = javascript_tokens(source)
    values = [t[0] for t in tokens]
    old = [t[0] for t in javascript_tokens(before)]
    new = [t[0] for t in javascript_tokens(after)]
    def find(pattern):
        return [i for i in range(len(values)-len(pattern)+1) if values[i:i+len(pattern)] == pattern]
    matches, ready = find(old), find(new)
    if len(ready) == 1 and all(ready[0] <= i and i+len(old) <= ready[0]+len(new) for i in matches):
        return source
    if len(matches) != 1:
        raise RuntimeError('Cambió la lógica del fragmento JavaScript; se conserva para revisión.')
    first = matches[0]
    return source[:tokens[first][1]] + after + source[tokens[first+len(old)-1][2]:]

def migrate_loyalty_kotlin(source, operation):
    """Move package/import references without rewriting user declarations or formatting."""
    names = ['com.premierdarkcoffee.sales.com.premierdarkcoffee.loyalty',
             'com.premierdarkcoffee.sales.loyalty', 'com.premierdarkcoffee.sales']
    package = 'com.premierdarkcoffee.loyalty'
    found = re.search(r'(?m)^[ \t]*package[ \t]+([A-Za-z0-9_.]+)', source)
    if not found or found.group(1) not in names + [package]:
        raise RuntimeError('El paquete Kotlin cambió; se conserva el archivo para revisión.')
    for old in names:
        pattern = r'(?m)^([ \t]*(?:package|import)[ \t]+)' + re.escape(old) + r'(?=[.\s;]|$)'
        source = re.sub(pattern, lambda m: m.group(1) + package, source)
    for edit in operation.get('edits', []):
        source = replace_kotlin_fragment(source, edit['before'], edit['after'])
    for name in operation.get('imports', []):
        if not re.search(r'(?m)^[ \t]*import[ \t]+' + re.escape(name) + r'[ \t]*;?[ \t]*$', source):
            package_line = re.search(r'(?m)^[ \t]*package[^\n]*(?:\n|$)', source)
            source = source[:package_line.end()] + '\nimport ' + name + '\n' + source[package_line.end():]
    for before, after in operation.get('comments', []):
        source = source.replace(before, after)
    return source




def kotlin_comments(source):
    # Strings remain tokens, so URL slashes cannot be mistaken for comments.
    tokens = kotlin_tokens(source)
    positions = [(0, tokens[0][1])] if tokens else [(0, len(source))]
    positions += [(a[2], b[1]) for a, b in zip(tokens, tokens[1:])]
    if tokens:
        positions.append((tokens[-1][2], len(source)))
    comments = []
    for start, end in positions:
        gap = source[start:end]
        i = 0
        while i < len(gap):
            if gap.startswith('//', i):
                stop = gap.find('\n', i)
                stop = len(gap) if stop < 0 else stop
                comments.append(gap[i:stop]); i = stop
            elif gap.startswith('/*', i):
                begin, depth = i, 1
                i += 2
                while i < len(gap) and depth:
                    if gap.startswith('/*', i): depth += 1; i += 2
                    elif gap.startswith('*/', i): depth -= 1; i += 2
                    else: i += 1
                comments.append(gap[begin:i])
            else:
                i += 1
    return comments

if __name__ == '__main__':
    sys.exit(main())
