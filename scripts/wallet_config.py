#!/usr/bin/env python3
"""Prepare private local Wallet configuration. Never prints keys, passwords or tokens."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
from urllib.parse import urlsplit


def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, separator, value = line.partition('=')
            if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
                raise ValueError('Formato inválido en '+path.name)
            values[key] = value.strip()
    return values


def load_env(root):
    return {**os.environ, **read_env(root/'.env'), **read_env(root/'.env.wallet')}


def init_config(root):
    path = root/'.env.wallet'
    if path.exists():
        return False
    value = '''# Configuración privada. No compartir ni añadir a Git.
# Usa un dominio HTTPS público que apunte a este servidor.
PUBLIC_BASE_URL=https://wallet.example.com
# Conserva esta clave y sus copias privadas: los pases existentes dependen de ella.
WALLET_DATA_KEY=__KEY__
APPLE_WALLET_ENABLED=false
APPLE_PASS_TYPE_ID=pass.com.tuempresa.loyalty
APPLE_TEAM_ID=REEMPLAZAR
APPLE_P12_PATH=/ruta/privada/pass.p12
APPLE_P12_PASSWORD=REEMPLAZAR
APPLE_WWDR_CERT_PATH=/ruta/privada/AppleWWDR.cer
GOOGLE_WALLET_ENABLED=false
GOOGLE_WALLET_ISSUER_ID=REEMPLAZAR
GOOGLE_WALLET_SERVICE_ACCOUNT_PATH=/ruta/privada/google-service-account.json
'''.replace('__KEY__', base64.b64encode(secrets.token_bytes(32)).decode())
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        out.write(value)
    return True


def check(root):
    env = load_env(root)
    issues = []
    try:
        url = urlsplit(env.get('PUBLIC_BASE_URL', ''))
        valid_url = url.scheme == 'https' and bool(url.hostname) and not any((url.username,url.password,url.query,url.fragment)) and url.path in ('','/') and url.hostname not in ('localhost','127.0.0.1','::1','wallet.example.com')
    except ValueError:
        valid_url = False
    if not valid_url:
        issues.append('Configura un dominio HTTPS público real en PUBLIC_BASE_URL.')
    try:
        if len(base64.b64decode(env.get('WALLET_DATA_KEY', ''), validate=True)) != 32:
            raise ValueError()
    except ValueError:
        issues.append('WALLET_DATA_KEY debe contener 32 bytes aleatorios en base64. --init la genera sin mostrarla.')
    apple = env.get('APPLE_WALLET_ENABLED') == 'true'
    google = env.get('GOOGLE_WALLET_ENABLED') == 'true'
    if not apple and not google:
        issues.append('Ambos proveedores están desactivados. Activa uno cuando completes sus datos.')
    if apple:
        if not re.fullmatch(r'pass\.[A-Za-z0-9.-]{3,150}',env.get('APPLE_PASS_TYPE_ID','')) or not re.fullmatch(r'[A-Z0-9]{10}',env.get('APPLE_TEAM_ID','')):
            issues.append('Revisa APPLE_PASS_TYPE_ID y APPLE_TEAM_ID.')
        for name in ('APPLE_P12_PATH','APPLE_WWDR_CERT_PATH'):
            if not Path(env.get(name,'/missing')).is_file():
                issues.append('Falta el archivo indicado en '+name+'.')
        if not env.get('APPLE_P12_PASSWORD') or env['APPLE_P12_PASSWORD']=='REEMPLAZAR':
            issues.append('Configura la contraseña del archivo PKCS12.')
        try:
            result = subprocess.run([env.get('OPENSSL_BIN','openssl'),'version'], capture_output=True, timeout=5)
            if result.returncode:
                raise OSError()
        except (OSError,subprocess.TimeoutExpired):
            issues.append('OpenSSL no está disponible para firmar los pases Apple.')
    if google:
        if not re.fullmatch(r'[0-9]{3,30}',env.get('GOOGLE_WALLET_ISSUER_ID','')):
            issues.append('Revisa GOOGLE_WALLET_ISSUER_ID.')
        try:
            account = json.loads(Path(env['GOOGLE_WALLET_SERVICE_ACCOUNT_PATH']).read_text())
            if account.get('type') != 'service_account' or not all(account.get(k) for k in ('client_email','private_key','private_key_id')):
                raise ValueError()
        except (OSError,KeyError,ValueError):
            issues.append('El JSON de Google debe ser una cuenta de servicio con su clave privada.')
    return {'status':'CONFIG_INCOMPLETE' if issues else 'FILES_PRESENT_SERVER_AND_DEVICE_CHECK_REQUIRED', 'apple_enabled':apple, 'google_enabled':google, 'issues':issues,
            'note':'No se enviaron solicitudes a Apple o Google. El servidor validará certificados, identificadores y claves al iniciar.'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--init',action='store_true')
    args = parser.parse_args(argv)
    if args.init:
        created = init_config(args.project)
        print('Se creó .env.wallet con permisos privados.' if created else '.env.wallet ya existe; no se cambió ni se regeneró su clave.')
        print('Completa ese archivo en tu editor y vuelve a ejecutar este comando sin --init. No lo compartas.')
        return 0
    result = check(args.project)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if result['issues'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
