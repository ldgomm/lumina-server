#!/usr/bin/env python3
"""HTTPS and private Wallet credentials for the existing local Docker pilot."""
import argparse
import base64
import datetime
import hashlib
import html
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile

SCRIPTS = Path(__file__).resolve().parent
def sibling(name):
    spec = importlib.util.spec_from_file_location('loyalty_wallet_' + name, SCRIPTS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

staging = sibling('staging')
config = sibling('wallet_config')
NGINX_IMAGE = 'nginx:1.30.6-alpine'
TUNNEL_IMAGE = 'cloudflare/cloudflared:2026.10.7'
PRIVATE = '.local-wallet'
GATEWAY = 'loyalty-wallet-gateway'
TUNNEL = 'loyalty-wallet-tunnel'
MATERIAL = 'loyalty-wallet-files'
WALLET_NAMES = ('WALLET_DATA_KEY', 'APPLE_WALLET_ENABLED', 'APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID',
                'APPLE_P12_PASSWORD', 'GOOGLE_WALLET_ENABLED', 'GOOGLE_WALLET_ISSUER_ID')


def public_origin(value):
    try:
        u = urllib.parse.urlsplit(value)
        host = u.hostname or ''
        valid = (u.scheme == 'https' and bool(host) and u.path in ('', '/') and
                 not any((u.username, u.password, u.query, u.fragment)) and u.port in (None, 443) and
                 re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', host) and '.' in host and
                 not host.endswith(('.localhost', '.local', '.test', '.invalid', '.example')) and
                 host not in ('localhost', 'wallet.example.com', 'example.com'))
        try:
            ipaddress.ip_address(host)
            valid = False
        except ValueError:
            pass
        if not valid:
            raise ValueError()
        return 'https://' + host
    except (ValueError, TypeError):
        raise RuntimeError('Usa un origen HTTPS público sin rutas, credenciales ni puertos alternativos.') from None


def private_directory(root):
    target = root / PRIVATE
    if target.is_symlink():
        raise RuntimeError('La carpeta privada de Wallet no puede ser un enlace simbólico.')
    target.mkdir(exist_ok=True, mode=0o700)
    os.chmod(target, 0o700)
    return target


def read_wallet(path):
    values = {}
    if not path.exists():
        return values
    if path.is_symlink():
        raise RuntimeError('La configuración de Wallet no puede ser un enlace.')
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in values:
            raise RuntimeError('Formato inválido o clave duplicada en .env.wallet.')
        values[key] = value
    return values


def update_env(path, updates):
    if path.is_symlink():
        raise RuntimeError('No se modifica una configuración privada enlazada.')
    seen = set()
    result = []
    for line in path.read_text().splitlines():
        key = line.partition('=')[0]
        if not line.strip() or line.lstrip().startswith('#'):
            result.append(line)
            continue
        if key in seen:
            raise RuntimeError('Hay claves duplicadas en .env.wallet.')
        seen.add(key)
        result.append(key + '=' + updates[key] if key in updates else line)
    result.extend(k + '=' + v for k, v in updates.items() if k not in seen)
    if any('\n' in v or '\r' in v or '\0' in v for v in updates.values()):
        raise RuntimeError('Los valores de configuración deben ocupar una sola línea.')
    staging.private_write(path, '\n'.join(result) + '\n')


def initialize(root, has_stored_key=False):
    path = root / '.env.wallet'
    if path.is_symlink():
        raise RuntimeError('.env.wallet no puede ser un enlace simbólico.')
    if not path.exists():
        if has_stored_key:
            raise RuntimeError('La base ya contiene pases. Restaura el .env.wallet original; no se generará otra clave.')
        config.init_config(root)
    values = read_wallet(path)
    defaults = {'WALLET_TUNNEL_MODE': 'quick', 'WALLET_GATEWAY_PORT': '8098', 'CLOUDFLARE_TUNNEL_TOKEN_PATH': ''}
    update_env(path, {k: v for k, v in defaults.items() if k not in values})
    return read_wallet(path)


def gateway_config(nonce, upstream='loyalty-server:8080', resolver=True):
    if not re.fullmatch('[a-f0-9]{32}', nonce):
        raise RuntimeError('Identificador de comprobación inválido.')
    if not re.fullmatch(r'[a-zA-Z0-9.-]+:[0-9]+', upstream):
        raise RuntimeError('Destino del gateway inválido.')
    # Match the original request target, not a normalized path. Encoded traversal never reaches Ktor.
    rules = [
        ('GET', r'/join/[a-z0-9][a-z0-9-]{1,60}'),
        ('GET', r'/(?:app\.js|style\.css|wallet-ui\.js|scanner\.js|jsqr\.js|commercial\.js|commercial\.css|promotion-editor\.js|engagement\.js|experience\.js)'),
        ('GET', r'/api/public/[a-z0-9][a-z0-9-]{1,60}(?:/qr)?'),
        ('POST', r'/api/public/[a-z0-9][a-z0-9-]{1,60}/(?:join|restore)'),
        ('GET', r'/api/me(?:/qr|/wallet-status|/access)?'),
        ('POST', r'/api/me/(?:logout|wallet/(?:apple|google)/link)'),
        ('GET', r'/wallet/art/(?:v20|v22)/(?:SOLID|GRADIENT)/[0-9]/[a-fA-F0-9]{6}/[0-9]{1,3}/[0-9]{1,3}\.png'),
        ('GET', r'/wallet/art/v24/(?:SOLID|GRADIENT)/(?:[0-9]|[12][0-9]|3[0-2])/[a-fA-F0-9]{6}/[0-9]{1,3}/[0-9]{1,3}\.png'),
        ('GET', r'/wallet/art/v29/(?:SIGNATURE|EDITORIAL|STAMPBOOK|TICKET|MOSAIC|RIBBON|PATH)/(?:SOLID|GRADIENT|AURORA)/(?:[0-9]|[12][0-9]|3[0-2])/[a-fA-F0-9]{6}/[0-9]{1,3}/[0-9]{1,3}\.png'),
        ('GET', r'/wallet/art/v30/(?:SIGNATURE|EDITORIAL|STAMPBOOK|TICKET|MOSAIC|RIBBON|PATH|PANORAMA|PRECISION|ATELIER)/(?:SOLID|GRADIENT|AURORA)/(?:[0-9]|[12][0-9]|3[0-2])/[a-fA-F0-9]{6}/[0-9]{1,3}/[0-9]{1,3}\.png'),
        ('GET', r'/wallet/art/v27/(?:SOLID|GRADIENT|AURORA)/(?:[0-9]|[12][0-9]|3[0-2])/[a-fA-F0-9]{6}/[0-9]{1,3}/[0-9]{1,3}\.png'),
        ('GET', r'/wallet/logo\.png'),
        ('GET', r'/wallet/brand/[a-z0-9][a-z0-9-]{1,60}/logo\.png'),
        ('GET', r'/wallet/apple/download/[A-Za-z0-9_-]{43}'),
        ('POST', r'/wallet/apple/v1/log'),
        ('GET', r'/wallet/apple/v1/devices/[A-Za-z0-9._-]+/registrations/[A-Za-z0-9.-]+'),
        ('POST|DELETE', r'/wallet/apple/v1/devices/[A-Za-z0-9._-]+/registrations/[A-Za-z0-9.-]+/[A-Za-z0-9-]+'),
        ('GET', r'/wallet/apple/v1/passes/[A-Za-z0-9.-]+/[A-Za-z0-9-]+'),
    ]
    mapping = '\n'.join('    "~^(?:' + method + ') ' + path + r'(?:\?[^\s]*)?$" 1;' for method, path in rules)
    dns = 'resolver 127.0.0.11 valid=5s ipv6=off;' if resolver else ''
    return '''worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 256; }
http {
  access_log off;
  server_tokens off;
  client_body_temp_path /tmp/client-body;
  proxy_temp_path /tmp/proxy;
  fastcgi_temp_path /tmp/fastcgi;
  uwsgi_temp_path /tmp/uwsgi;
  scgi_temp_path /tmp/scgi;
  client_max_body_size 32k;
  client_header_timeout 10s;
  client_body_timeout 15s;
  map "$request_method $request_uri" $allowed {
    default 0;
__RULES__
  }
  server {
    listen 8080;
    __DNS__
    location = /health/public {
      default_type application/json;
      add_header Cache-Control "no-store" always;
      return 200 '{"service":"loyalty-wallet","probe":"__NONCE__"}';
    }
    location / {
      if ($allowed = 0) { return 404; }
      set $backend http://__UPSTREAM__;
      proxy_pass $backend;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header Connection "";
      proxy_set_header X-Forwarded-For "";
      proxy_set_header X-Forwarded-Host "";
      proxy_set_header X-Forwarded-Proto "";
      proxy_set_header Forwarded "";
      proxy_connect_timeout 5s;
      proxy_read_timeout 30s;
      proxy_send_timeout 30s;
      proxy_buffering off;
    }
  }
}
'''.replace('__RULES__', mapping).replace('__DNS__', dns).replace('__NONCE__', nonce).replace('__UPSTREAM__', upstream)


def escaped(value):
    # Compose interpolates even JSON string values; $$ preserves a literal dollar sign.
    if isinstance(value, str):
        return value.replace('$', '$$')
    if isinstance(value, dict):
        return {k: escaped(v) for k, v in value.items()}
    if isinstance(value, list):
        return [escaped(v) for v in value]
    return value


def compose_document(root, values, wallet, origin=None, mode='quick'):
    folder = root / PRIVATE
    port = int(wallet.get('WALLET_GATEWAY_PORT', '8098'))
    if not 1024 <= port <= 65535 or port == int(values['LOYALTY_HTTP_PORT']):
        raise RuntimeError('WALLET_GATEWAY_PORT debe ser un puerto libre distinto al del servidor.')
    security = {'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'read_only': True,
                'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}}}
    services = {
        GATEWAY: dict(security, image=NGINX_IMAGE, user='10001:10001', restart='unless-stopped',
                      entrypoint=['nginx'], command=['-c', '/etc/nginx/loyalty.conf', '-g', 'daemon off;'],
                      ports=['127.0.0.1:' + str(port) + ':8080'], tmpfs=['/tmp:rw,nosuid,nodev,size=32m,mode=1777'],
                      volumes=[{'type': 'bind', 'source': str(folder / 'gateway.conf'), 'target': '/etc/nginx/loyalty.conf', 'read_only': True}]),
        MATERIAL: {'image': 'loyalty-server:local-staging', 'user': '0:0', 'network_mode': 'none', 'read_only': True,
                   'entrypoint': ['/bin/sh', '-ec'], 'command': ['umask 077; mkdir -p /output; for f in /input/*; do [ -f "$f" ] || continue; name=${f##*/}; cp "$f" "/output/$name.new"; chown 10001:10001 "/output/$name.new"; chmod 400 "/output/$name.new"; mv "/output/$name.new" "/output/$name"; done; chown 10001:10001 /output; chmod 500 /output'],
                   'volumes': [{'type': 'bind', 'source': str(folder / 'material'), 'target': '/input', 'read_only': True}, 'loyalty-wallet-material:/output']},
    }
    if mode != 'external':
        command = ['tunnel', '--no-autoupdate', '--protocol', 'http2']
        command += ['run', '--token-file', '/wallet-material/tunnel.token'] if mode == 'named' else ['--url', 'http://' + GATEWAY + ':8080']
        services[TUNNEL] = dict(security, image=TUNNEL_IMAGE, user='10001:10001', restart='unless-stopped', command=command,
                                volumes=['loyalty-wallet-material:/wallet-material:ro'])
    if origin:
        env = {k: wallet[k] for k in WALLET_NAMES if k in wallet}
        env.update(PUBLIC_BASE_URL=public_origin(origin), LOYALTY_LOCAL_BROWSER_ORIGIN='http://localhost:' + values['LOYALTY_HTTP_PORT'],
                   APPLE_WALLET_ENABLED=wallet.get('APPLE_WALLET_ENABLED', 'false'), GOOGLE_WALLET_ENABLED=wallet.get('GOOGLE_WALLET_ENABLED', 'false'),
                   APPLE_P12_PATH='/wallet-material/apple.p12', APPLE_WWDR_CERT_PATH='/wallet-material/wwdr.cer',
                   GOOGLE_WALLET_SERVICE_ACCOUNT_PATH='/wallet-material/google.json', OPENSSL_BIN='openssl')
        services['loyalty-server'] = {'environment': env, 'volumes': ['loyalty-wallet-material:/wallet-material:ro']}
    return escaped({'services': services, 'volumes': {'loyalty-wallet-material': {}}})


def copy_material(root, wallet):
    # Compare canonical paths on both sides, including macOS /var -> /private/var.
    root = Path(root).expanduser().resolve()
    folder = private_directory(root) / 'material'
    folder.mkdir(exist_ok=True, mode=0o700)
    if folder.is_symlink():
        raise RuntimeError('La carpeta de material privado no puede ser un enlace.')
    inputs = []
    if wallet.get('APPLE_WALLET_ENABLED') == 'true':
        inputs += [('APPLE_P12_PATH', 'apple.p12', 4_000_000), ('APPLE_WWDR_CERT_PATH', 'wwdr.cer', 1_000_000)]
    if wallet.get('GOOGLE_WALLET_ENABLED') == 'true':
        inputs += [('GOOGLE_WALLET_SERVICE_ACCOUNT_PATH', 'google.json', 64_000)]
    if wallet.get('WALLET_TUNNEL_MODE') == 'named':
        inputs += [('CLOUDFLARE_TUNNEL_TOKEN_PATH', 'tunnel.token', 16_000)]
    prepared = []
    for key, name, maximum in inputs:
        source = Path(wallet.get(key, '')).expanduser().resolve()
        if not source.is_file() or not 0 < source.stat().st_size < maximum:
            raise RuntimeError('Revisa el archivo local de ' + key + '.')
        if root in source.parents and root / PRIVATE not in source.parents:
            raise RuntimeError('Guarda ' + key + ' fuera del código del proyecto.')
        data = source.read_bytes()
        if name == 'google.json':
            try:
                account = json.loads(data)
                if account.get('type') != 'service_account' or not all(account.get(k) for k in ('client_email', 'private_key', 'private_key_id')):
                    raise ValueError()
            except (ValueError, UnicodeError):
                raise RuntimeError('El archivo de Google debe ser el JSON de una cuenta de servicio con clave privada.') from None
        if name == 'tunnel.token' and not re.fullmatch(rb'[A-Za-z0-9_+/=-]{40,16000}', data.strip()):
            raise RuntimeError('El archivo del túnel debe contener únicamente su token.')
        prepared.append((folder / name, data))
    for target, data in prepared:
        if target.is_symlink():
            raise RuntimeError('No se sobrescribe material privado enlazado.')
        temp = target.with_name(target.name + '.new')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, method='GET', body=None, headers=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    data = json.dumps(body).encode() if body is not None else None
    hdrs = dict(headers or {})
    if data is not None:
        hdrs['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        response = opener.open(req, timeout=12)
    except urllib.error.HTTPError as e:
        response = e
    except (urllib.error.URLError, ssl.SSLError) as error:
        cause = getattr(error, 'reason', error)
        # Python.org on macOS can lack its own CA bundle. System curl still verifies TLS.
        if (sys.platform == 'darwin' and isinstance(cause, ssl.SSLCertVerificationError)
                and urllib.parse.urlsplit(url).scheme == 'https' and Path('/usr/bin/curl').is_file()):
            result = system_https_request(url, method, data, hdrs)
            event = 'PYTHON_CA_FAILED_SYSTEM_CURL_TLS_VERIFIED'
            if event not in TRANSPORT_EVENTS:
                TRANSPORT_EVENTS.append(event)
                print('HTTPS verificado con curl del sistema; Python no pudo validar la cadena de certificados.', flush=True)
            return result
        raise
    with response:
        content = response.read(2_000_000)
        return response.code, content


def probe(url, nonce, attempts=60, diagnostics=None, maximum_seconds=120):
    history = diagnostics if diagnostics is not None else []
    started = time.monotonic()
    for i in range(attempts):
        try:
            status, data = request(url + '/health/public')
            observation = {'code': 'HTTP_STATUS', 'http_status': status}
            if status == 200:
                try:
                    matches = json.loads(data) == {'service': 'loyalty-wallet', 'probe': nonce}
                    observation['code'] = 'GATEWAY_VERIFIED' if matches else 'GATEWAY_IDENTITY_MISMATCH'
                except (ValueError, UnicodeError):
                    observation['code'] = 'INVALID_JSON'
            else:
                edge = re.search(rb'(?i)error\s+code:\s*(1[0-9]{3})', data[:10000])
                if edge:
                    observation['cloudflare_error'] = edge.group(1).decode()
        except OSError as error:
            observation = connection_error(error)
        observation.update(attempt=i + 1, elapsed_seconds=round(time.monotonic() - started, 1))
        history.append(observation)
        if observation['code'] == 'GATEWAY_VERIFIED':
            return
        if observation['code'] in ('TLS_CERTIFICATE_VERIFY_FAILED', 'TLS_CA_FILE_FAILED', 'GATEWAY_IDENTITY_MISMATCH'):
            break
        remaining = maximum_seconds - (time.monotonic() - started)
        if remaining <= 0 or i + 1 == attempts:
            break
        if i % 5 == 0:
            print('Esperando acceso al gateway (' + observation['code'] + ')...', flush=True)
        time.sleep(min(2, remaining))
    last = history[-1] if history else {'code': 'NO_ATTEMPTS'}
    detail = (' HTTP ' + str(last['http_status'])) if 'http_status' in last else ''
    if last.get('cloudflare_error'):
        detail += ', Cloudflare ' + last['cloudflare_error']
    if last.get('detail'):
        detail += ': ' + last['detail']
    raise RuntimeError('No se pudo verificar el gateway: ' + last['code'] + detail + '. Consulta wallet_https.json y wallet-logs; la validación TLS se mantiene activa.')


def verify_gateway(url, slug):
    checks = [('GET', '/wallet/art/v30/PANORAMA/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v30/PANORAMA/GRADIENT/5/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v30/PANORAMA/GRADIENT/5/0b1f3a/4/5.png?layout=poster', None, 200),
              ('GET', '/wallet/art/v30/PRECISION/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v30/PRECISION/GRADIENT/5/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v30/PRECISION/GRADIENT/5/0b1f3a/4/5.png?layout=poster', None, 200),
              ('GET', '/wallet/art/v30/ATELIER/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v30/ATELIER/GRADIENT/5/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v30/ATELIER/GRADIENT/5/0b1f3a/4/5.png?layout=poster', None, 200),
              ('GET', '/wallet/art/v30/TICKET/AURORA/32/ffffff/0/0.png', None, 200),
              ('GET', '/wallet/art/v30/CUSTOM/GRADIENT/5/0b1f3a/4/5.png', None, 404),
              ('POST', '/wallet/art/v30/PANORAMA/GRADIENT/5/0b1f3a/4/5.png', {}, 404),
              ('GET', '/wallet/art/v30/ATELIER/GRADIENT/5/0b1f3a/6/5.png', None, 400),
              ('GET', '/wallet/art/v30/PRECISION/GRADIENT/5/0b1f3a/4/5.png?layout=html', None, 400),
              ('GET', '/wallet/art/v29/PANORAMA/GRADIENT/5/0b1f3a/4/5.png', None, 404),
              ('GET', '/wallet/art/v29/EDITORIAL/GRADIENT/5/0b1f3a/41/100.png', None, 200),
              ('GET', '/wallet/art/v29/STAMPBOOK/SOLID/5/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v29/TICKET/AURORA/5/0b1f3a/4/5.png?layout=poster', None, 200),
              ('GET', '/wallet/art/v29/MOSAIC/GRADIENT/5/0b1f3a/0/0.png', None, 200),
              ('GET', '/wallet/art/v29/RIBBON/GRADIENT/5/0b1f3a/0/5.png', None, 200),
              ('GET', '/wallet/art/v29/PATH/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v29/SIGNATURE/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v29/CUSTOM/GRADIENT/5/0b1f3a/4/5.png', None, 404),
              ('GET', '/wallet/art/v29/TICKET/GRADIENT/5/0b1f3a/6/5.png', None, 400),
              ('POST', '/wallet/art/v29/TICKET/GRADIENT/5/0b1f3a/4/5.png', {}, 404),
              ('GET', '/wallet/art/v29/TICKET/GRADIENT/5/0b1f3a/4/5.png?layout=html', None, 400),
              ('GET', '/wallet/art/v27/AURORA/32/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=poster', None, 200),
              ('GET', '/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v27/AURORA/32/0b1f3a/9/5.png', None, 400),
              ('GET', '/wallet/art/v27/AURORA/33/0b1f3a/4/5.png', None, 404),
              ('POST', '/wallet/art/v27/AURORA/32/0b1f3a/4/5.png', {}, 404),
              ('GET', '/wallet/art/v27/GRADIENT/5/34241f/4/5.png?layout=html', None, 400),
              ('GET', '/wallet/art/v24/GRADIENT/32/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v24/GRADIENT/32/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v24/GRADIENT/32/0b1f3a/9/5.png', None, 400),
              ('POST', '/wallet/art/v24/GRADIENT/32/0b1f3a/4/5.png', {}, 404),
              ('GET', '/wallet/art/v24/GRADIENT/33/0b1f3a/4/5.png', None, 404),
              ('GET', '/wallet/art/v22/GRADIENT/32/0b1f3a/4/5.png', None, 404),
              ('GET', '/api/staff/return-radar', None, 404),
              ('GET', '/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png?layout=apple', None, 200),
              ('GET', '/wallet/art/v22/GRADIENT/5/0b1f3a/9/5.png', None, 400),
              ('POST', '/wallet/art/v22/GRADIENT/5/0b1f3a/4/5.png', {}, 404),
              ('GET', '/wallet/art/v99/GRADIENT/5/0b1f3a/4/5.png', None, 404),
              ('GET', '/api/staff/birthday-settings', None, 404),
              ('PUT', '/api/staff/birthday-settings', {}, 404),
              ('POST', '/api/staff/business-profile/requests', {}, 404),
              ('POST', '/api/staff/promotion-setups', {}, 404),
              ('GET', '/api/staff/metrics?days=365', None, 404),
              ('GET', '/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png', None, 200),
              ('GET', '/wallet/art/v20/GRADIENT/5/0b1f3a/9/5.png', None, 400),
              ('POST', '/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png', {}, 404),
              ('GET', '/join/' + slug, None, 200), ('GET', '/api/public/' + slug, None, 200),
              ('GET', '/engagement.js', None, 200), ('GET', '/experience.js', None, 200), ('GET', '/wallet/brand/' + slug + '/logo.png', None, 200),
              ('GET', '/api/staff/customer-insights', None, 404), ('PUT', '/api/staff/wallet-design', {}, 404),
              ('POST', '/api/staff/customer-events', {}, 404), ('POST', '/api/staff/purchases/quote', {}, 404),
              ('GET', '/api/me/wallet-status', None, 401), ('GET', '/api/me/access', None, 401),
              ('POST', '/api/public/' + slug + '/join', {}, 400),
              ('GET', '/platform', None, 404), ('GET', '/preview', None, 404),
              ('GET', '/api/staging/info', None, 404), ('GET', '/api/platform/tenants', None, 404),
              ('POST', '/api/staff/wallet/restore', {}, 404), ('POST', '/api/me/redemptions', {}, 404),
              ('POST', '/api/public/' + slug + '/login', {}, 404), ('GET', '/.env.wallet', None, 404),
              ('GET', '/join/../platform', None, 404), ('GET', '/join/%2e%2e/platform', None, 404),
              ('GET', '/api/public/demo%2f..%2f..%2fplatform/tenants', None, 404)]
    for method, path, body, expected in checks:
        status, _ = request(url + path, method, body)
        if status != expected:
            raise RuntimeError('El gateway no pasó la comprobación ' + method + ' ' + path + ': HTTP ' + str(status) + '.')
    return len(checks)


class LocalWallet:
    def __init__(self, root, report=None):
        self.root = root
        self.folder = private_directory(root)
        self.values = staging.read_config(root)
        self.runner = staging.Runner(root, self.values, report)
        self.runner.logs = report.parent / 'wallet-logs' if report else self.folder / 'logs'
        self.runner.logs.mkdir(exist_ok=True, mode=0o700)
        self.overlay = self.folder / 'compose.json'
        self.state_path = self.folder / 'state.json'
        self.report = {'status': 'STARTED', 'device_test': 'PENDING', 'single_device_policy': 'PENDING'}
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}
        self.nonce = self.state.get('nonce') or secrets.token_hex(16)

    def command(self, *args):
        return staging.compose(self.root, '-f', str(self.overlay), *args)

    def run(self, label, *args, timeout=120):
        return self.runner.run(label, self.command(*args), timeout)

    def write_overlay(self, wallet, origin=None):
        text = gateway_config(self.nonce)
        path = self.folder / 'gateway.conf'
        staging.private_write(path, text)
        os.chmod(path, 0o644)  # Public routing configuration; the containing host directory stays 0700.
        (self.folder / 'material').mkdir(exist_ok=True, mode=0o700)
        doc = compose_document(self.root, self.values, wallet, origin, wallet.get('WALLET_TUNNEL_MODE', 'quick'))
        staging.private_write(self.overlay, json.dumps(doc, ensure_ascii=False, indent=2))

    def database_state(self):
        _, output = self.runner.run('wallet_database_identity', staging.compose(self.root, 'exec', '-T', 'loyalty-db', 'psql', '-U', 'loyalty', '-d', 'loyalty_staging', '-Atc',
            "SELECT json_build_object('hasKey',EXISTS(SELECT 1 FROM wallet_key_identity),'passes',(SELECT count(*) FROM wallet_passes))"), 20)
        return json.loads(output.strip())

    def gateway_check(self):
        wallet = read_wallet(self.root / '.env.wallet')
        # Recreate this service: replacing a bind-mounted file does not update nginx workers.
        # Keep the existing tunnel and database; verify the effective routes afterwards.
        self.write_overlay(wallet, self.state.get('origin'))
        self.run('gateway_start', 'up', '-d', '--no-deps', '--force-recreate', GATEWAY, timeout=300)
        base = 'http://127.0.0.1:' + wallet.get('WALLET_GATEWAY_PORT', '8098')
        self.check_probe('local_gateway', base, 40)
        count = verify_gateway(base, 'demo-cafe-' + self.values['STAGING_INSTANCE_ID'][:8])
        self.report.update(status='LOCAL_GATEWAY_PASS', checks=count)
        self.state.update(nonce=self.nonce)
        staging.private_write(self.state_path, json.dumps(self.state))
        return self.report

    def start(self, renew=False):
        self.report['phase'] = 'database_and_configuration'
        self.report['migration_requested'] = renew
        db = self.database_state()
        wallet = initialize(self.root, db['hasKey'])
        previous_origin = self.state.get('origin') or wallet.get('PUBLIC_BASE_URL')
        mode = wallet.get('WALLET_TUNNEL_MODE', 'quick')
        self.report.update(mode=mode, previous_origin=previous_origin, temporary=mode == 'quick')
        if mode not in ('quick', 'named', 'external'):
            raise RuntimeError('WALLET_TUNNEL_MODE debe ser quick, named o external.')
        try:
            if len(base64.b64decode(wallet.get('WALLET_DATA_KEY', ''), validate=True)) != 32:
                raise ValueError()
        except ValueError:
            raise RuntimeError('Restaura WALLET_DATA_KEY de tu configuración original; no se regenerará.') from None
        if any(wallet.get(k, 'false') not in ('true', 'false') for k in ('APPLE_WALLET_ENABLED', 'GOOGLE_WALLET_ENABLED')):
            raise RuntimeError('Los indicadores de Wallet deben ser true o false, en minúsculas.')
        self.runner.secrets += [wallet.get(k, '') for k in WALLET_NAMES if any(x in k for x in ('PASSWORD', 'KEY'))]
        if self.state.get('mode') and self.state['mode'] != mode and db['passes'] and not renew:
            raise RuntimeError('Cambiar el modo puede cambiar la URL de pases existentes. Para una migración consciente usa --renew-test-url y vuelve a guardar las tarjetas de prueba.')
        copy_material(self.root, wallet)
        token_fingerprint = None
        if mode == 'named':
            tunnel_token = (self.folder / 'material/tunnel.token').read_text().strip()
            self.runner.secrets.append(tunnel_token)
            token_fingerprint = hashlib.sha256(tunnel_token.encode()).hexdigest()
        self.write_overlay(wallet, self.state.get('origin'))
        self.run('wallet_material', 'run', '--rm', '--no-deps', MATERIAL, timeout=120)
        self.run('gateway_start', 'up', '-d', '--no-deps', '--force-recreate', GATEWAY, timeout=300)
        local = 'http://127.0.0.1:' + wallet.get('WALLET_GATEWAY_PORT', '8098')
        self.check_probe('local_gateway', local, 40)
        self.report['phase'] = 'tunnel_discovery'
        if mode in ('named', 'external'):
            origin = public_origin(wallet.get('PUBLIC_BASE_URL', ''))
            if mode == 'named':
                recreate = ['--force-recreate'] if self.state.get('tunnel_token_sha256') != token_fingerprint else []
                self.run('tunnel_start', 'up', '-d', '--no-deps', *recreate, TUNNEL, timeout=300)
        else:
            origin = self.start_quick_tunnel(renew, db['passes'])
        self.report['candidate_origin'] = origin
        if db['passes'] and previous_origin != origin and not renew:
            raise RuntimeError('La dirección del túnel cambió y existen pases. Usa un dominio estable o --renew-test-url para volver a guardar conscientemente esas tarjetas de prueba.')
        self.check_probe('public_https', origin)
        if db['passes'] and previous_origin != origin:
            self.state['pass_refresh_pending'] = {'previous_origin': previous_origin, 'origin': origin,
                'issued_passes': db['passes'], 'action': 'SAVE_SAME_PASS_ON_PHONE', 'device_verified': False}
            staging.private_write(self.state_path, json.dumps(self.state))
        if self.state.get('pass_refresh_pending'):
            self.report['pass_refresh'] = self.state['pass_refresh_pending']
        update_env(self.root / '.env.wallet', {'PUBLIC_BASE_URL': origin})
        wallet['PUBLIC_BASE_URL'] = origin
        self.write_overlay(wallet, origin)
        self.report['phase'] = 'wallet_server_configuration'
        self.run('wallet_server_start', 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'loyalty-server', timeout=240)
        diagnostics = self.runner.api('/api/platform/wallet/status', token=self.values['STAGING_ADMIN_TOKEN'])
        requested = {name: wallet.get(name.upper() + '_WALLET_ENABLED') == 'true' for name in ('apple', 'google')}
        # Diagnostics contain bounded issue codes and counters, never certificates or bearer tokens.
        self.report['wallet'] = diagnostics
        self.report['requested'] = requested
        for name, enabled in requested.items():
            if enabled and diagnostics.get('configuration', {}).get(name) != 'CONFIGURED_DEVICE_TEST_REQUIRED':
                raise RuntimeError('No se pudo activar ' + name + '. Revisa los códigos de diagnóstico del resultado y .env.wallet.')
        self.report['phase'] = 'public_routes'
        count = verify_gateway(origin, 'demo-cafe-' + self.values['STAGING_INSTANCE_ID'][:8])
        # An actual browser Origin from the local store must reach authentication, not be rejected by CSRF.
        status, _ = request('http://localhost:' + self.values['LOYALTY_HTTP_PORT'] + '/api/staff/counter-redemptions', 'POST', {}, {'Origin': 'http://localhost:' + self.values['LOYALTY_HTTP_PORT']})
        if status != 401:
            raise RuntimeError('El panel local no pasó la comprobación de origen del navegador.')
        self.state.update(origin=origin, mode=mode, nonce=self.nonce, active=True)
        if token_fingerprint:
            self.state['tunnel_token_sha256'] = token_fingerprint
        staging.private_write(self.state_path, json.dumps(self.state))
        self.report.update(status='HTTPS_PASS_WALLET_DEVICE_TEST_PENDING' if any(requested.values()) else 'HTTPS_PASS_WALLET_CREDENTIALS_PENDING',
                           origin=origin, temporary=mode == 'quick', public_checks=count, tls_verified=True,
                           google_remote_issuance='PENDING', apple_device_installation='PENDING')
        if self.report.get('pass_refresh'):
            self.report['status'] = 'HTTPS_PASS_WALLET_CONNECTION_REFRESH_PENDING'
        self.report['phase'] = 'complete'
        staging.write_access(self.root, dict(self.values, LOYALTY_CLIENT_ORIGIN=origin))
        guide = write_guide(self.root, self.values, self.report)
        print('Registro para el teléfono: ' + origin + '/join/demo-cafe-' + self.values['STAGING_INSTANCE_ID'][:8])
        print('Configuración privada: ' + str(self.root / '.env.wallet'))
        print('Guía: ' + str(guide))
        if self.report.get('pass_refresh'):
            print('TARJETA_PENDIENTE: actualiza la conexión de la misma tarjeta desde el panel del dueño y abre el QR temporal en el iPhone. La guía incluye los pasos. No borres la tarjeta ni te registres otra vez.')
        if sys.platform == 'darwin':
            webbrowser.open(guide.as_uri())
        return self.report

    def capture(self, label, command, timeout=15):
        """Bounded read-only diagnostics; never inspect container environment or private files."""
        try:
            result = subprocess.run(command, cwd=self.root, env=staging.environment(self.values),
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout)
            code, output = result.returncode, result.stdout
        except (OSError, subprocess.TimeoutExpired) as error:
            code, output = 124, str(error)
        output = staging.clean(output[-100000:], self.runner.secrets)
        output = re.sub(r'(/wallet/apple/download/)[A-Za-z0-9_-]+', r'\1[REDACTED]', output)
        output = re.sub(r'(?i)([?&](?:token|key|code|secret|authorization)=)[^\s&]+', r'\1[REDACTED]', output)
        staging.private_write(self.runner.logs / (label + '.log'), output)
        self.runner.report['checks'][label] = {'exit_code': code}
        return code, output

    def quick_origin(self, attempts=30):
        for i in range(attempts):
            code, output = self.capture('tunnel_container', self.command('ps', '-q', TUNNEL))
            container = output.strip()
            if not code and re.fullmatch('[a-f0-9]{12,64}', container):
                code, output = self.capture('tunnel_state', ['docker', 'inspect', '--format',
                    '{{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}', container])
                parts = output.strip().split()
                if not code and len(parts) == 3 and re.fullmatch(r'\d{4}-\d{2}-\d{2}T[0-9:.]+Z', parts[1]):
                    status, started, restarts = parts
                    self.report['tunnel'] = {'state': status, 'started_at': started, 'restarts': restarts}
                    code, output = self.capture('tunnel_runtime', self.command('logs', '--no-color',
                        '--since', started, '--tail=500', TUNNEL))
                    if not code and quick_tunnel_retired(output):
                        self.report['tunnel_issue'] = 'QUICK_TUNNEL_NOT_FOUND'
                        self.state['active'] = False
                        staging.private_write(self.state_path, json.dumps(self.state))
                        raise QuickTunnelRetired('Cloudflare informa Unauthorized: Tunnel not found para el túnel actual.')
                    matches = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com', output) if not code else []
                    cached = self.state.get('candidate', {})
                    if not matches and cached.get('container') == container and cached.get('started_at') == started:
                        matches = [cached['origin']] if cached.get('origin') else []
                    if status == 'running' and matches:
                        origin = public_origin(matches[-1])
                        if not urllib.parse.urlsplit(origin).hostname.endswith('.trycloudflare.com'):
                            raise RuntimeError('La URL temporal no pertenece a trycloudflare.com.')
                        self.state['candidate'] = {'container': container, 'started_at': started, 'origin': origin}
                        self.state['nonce'] = self.nonce
                        staging.private_write(self.state_path, json.dumps(self.state))
                        return origin
            if i % 5 == 0:
                print('Esperando la dirección HTTPS del arranque actual del túnel...', flush=True)
            if i + 1 < attempts:
                time.sleep(2)
        raise RuntimeError('Cloudflare no entregó una URL para el arranque actual. Consulta wallet-logs/tunnel_runtime.log y tunnel_state.log.')

    def diagnostics(self):
        if not self.overlay.is_file():
            return
        mode = read_wallet(self.root / '.env.wallet').get('WALLET_TUNNEL_MODE', 'quick')
        services = [GATEWAY] + ([TUNNEL] if mode != 'external' else [])
        self.capture('https_services', self.command('ps', '--all', '--format', 'json', *services))
        self.capture('gateway_runtime', self.command('logs', '--no-color', '--tail=100', GATEWAY))
        if mode != 'external':
            _, logs = self.capture('tunnel_runtime_final', self.command('logs', '--no-color', '--tail=200', TUNNEL))
            signals = []
            if re.search(r'(?i)dial tcp[^\n]*:7844[^\n]*(?:timeout|refused|unreachable)', logs):
                signals.append('TUNNEL_TCP_7844_UNREACHABLE')
            if re.search(r'(?i)(?:failed to resolve|DNS resolution failed|lookup[^\n]*(?:no such host|timeout))', logs):
                signals.append('TUNNEL_DNS_FAILED')
            if re.search(r'(?i)unable to reach the origin service', logs):
                signals.append('TUNNEL_ORIGIN_UNREACHABLE')
            if quick_tunnel_retired(logs):
                signals.append('QUICK_TUNNEL_NOT_FOUND')
            elif 'Registered tunnel connection' in logs:
                signals.append('TUNNEL_CONNECTION_REGISTERED')
            self.report['tunnel_log_signals'] = signals

    def check_probe(self, phase, url, maximum_seconds=120):
        self.report['phase'] = phase
        history = self.report.setdefault('probes', {}).setdefault(phase, [])
        probe(url, self.nonce, diagnostics=history, maximum_seconds=maximum_seconds)

    def start_quick_tunnel(self, renew, issued_passes):
        self.run('tunnel_start', 'up', '-d', '--no-deps', TUNNEL, timeout=300)
        try:
            return self.quick_origin()
        except QuickTunnelRetired:
            self.report['tunnel_issue'] = 'QUICK_TUNNEL_NOT_FOUND'
            if issued_passes and not renew:
                raise RuntimeError('Cloudflare dio de baja el túnel temporal. Las tarjetas instaladas apuntan a esa dirección. Ejecuta --renew-test-url para recuperar HTTPS y después actualiza la conexión de la misma tarjeta desde el panel del dueño.') from None
            print('Cloudflare dio de baja el túnel. Creando una nueva conexión temporal...', flush=True)
            self.run('tunnel_recreate', 'up', '-d', '--no-deps', '--force-recreate', TUNNEL, timeout=300)
            self.report['tunnel_recovery'] = {'reason': 'QUICK_TUNNEL_NOT_FOUND', 'recreate_attempts': 1}
            # Exactly one recreation. DNS errors alone never rotate a URL or disable TLS checks.
            return self.quick_origin()


def write_guide(root, values, report):
    import shlex
    origin = report.get('origin', '')
    failed = report.get('status') == 'HTTPS_SETUP_FAILED'
    retired = report.get('tunnel_issue') == 'QUICK_TUNNEL_NOT_FOUND' or 'QUICK_TUNNEL_NOT_FOUND' in report.get('tunnel_log_signals', [])
    link = origin + '/join/demo-cafe-' + values['STAGING_INSTANCE_ID'][:8]
    template = 'wallet-failure-guide.html' if failed else ('wallet-recovery-guide-v015.html' if report.get('pass_refresh') else 'wallet-guide-v015.html')
    command = 'python3 ' + shlex.quote(str(root / 'scripts/wallet_local.py')) + ' start'
    replacements = {'PROJECT': str(root), 'CLIENT_LINK': link, 'STATUS': report['status'],
                    'ORIGIN': origin, 'LOCAL': 'http://localhost:' + values['LOYALTY_HTTP_PORT'],
                    'REFRESH_HIDDEN': '' if report.get('pass_refresh') else 'hidden',
                    'RETIRED_HIDDEN': '' if retired else 'hidden', 'OTHER_HIDDEN': 'hidden' if retired else '',
                    'ERROR': report.get('error', ''), 'RETRY_COMMAND': command + (' --renew-test-url' if report.get('migration_requested') else ''),
                    'RENEW_COMMAND': command + ' --renew-test-url',
                    'STABLE_COMMAND': command + ' --configure-stable-https --renew-test-url',
                    'CONNECTION_KIND': 'Temporal: puede caducar aunque Docker siga ejecutándose.' if report.get('temporary') else 'Dominio configurado: conserva esta dirección y mantén el servidor disponible.'}
    folder = private_directory(root)
    for source, name in [(template, 'guide.html'), ('wallet-stable-guide.html', 'https-estable.html')]:
        document = (SCRIPTS / source).read_text()
        for key, value in replacements.items():
            document = document.replace('{{' + key + '}}', html.escape(value, quote=True))
        staging.private_write(folder / name, document)
    return folder / 'guide.html'


def configure(root):
    """Only runs on explicit --configure; secret input remains in the user's terminal."""
    import getpass
    if not sys.stdin.isatty():
        raise RuntimeError('--configure requiere una terminal interactiva; también puedes editar .env.wallet en IntelliJ.')
    db = LocalWallet(root).database_state()
    wallet = initialize(root, db['hasKey'])
    changes = {}
    for label, fields in [('Apple', ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_P12_PATH', 'APPLE_P12_PASSWORD', 'APPLE_WWDR_CERT_PATH']),
                          ('Google', ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT_PATH'])]:
        answer = input('¿Tienes listos los archivos de ' + label + '? [s/N]: ').strip().lower()
        if answer not in ('s', 'si', 'sí'):
            continue
        for key in fields:
            value = getpass.getpass(key + ' (no se mostrará): ') if key.endswith('PASSWORD') else input(key + ': ').strip()
            if not value:
                raise RuntimeError('Configuración incompleta. Puedes repetir --configure o editar .env.wallet.')
            changes[key] = value
        changes[label.upper() + '_WALLET_ENABLED'] = 'true'
    update_env(root / '.env.wallet', changes)


def main(argv=None):
    TRANSPORT_EVENTS.clear()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'gateway-check', 'stop', 'status'])
    parser.add_argument('--project', type=Path, default=SCRIPTS.parent)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--configure', action='store_true')
    parser.add_argument('--configure-stable-https', action='store_true')
    parser.add_argument('--renew-test-url', action='store_true')
    parser.add_argument('--origin-script', type=Path)
    parser.add_argument('--output-dir', type=Path, default=Path.home() / 'Downloads')
    args = parser.parse_args(argv)
    root = args.project.expanduser().resolve()
    report = {'status': 'HTTPS_SETUP_FAILED', 'device_test': 'PENDING'}
    lock = root / '.loyalty-wallet.lock'
    owned = False
    runner = None
    try:
        lock.mkdir(); owned = True
        runner = LocalWallet(root, args.report)
        if (args.configure or args.configure_stable_https) and args.action != 'start':
            raise RuntimeError('Los asistentes solo se usan con la acción start.')
        if args.configure:
            configure(root)
        if args.configure_stable_https:
            configure_stable_https(root, args.renew_test_url)
        if args.action == 'start':
            report = runner.start(args.renew_test_url)
        elif args.action == 'gateway-check':
            report = runner.gateway_check()
        elif args.action == 'stop':
            # Stop only the public ingress. Keep all data, keys and the local app intact.
            runner.run('public_stop', 'stop', GATEWAY, *([TUNNEL] if runner.state.get('mode', 'quick') != 'external' else []))
            runner.state['active'] = False
            staging.private_write(runner.state_path, json.dumps(runner.state))
            report = {'status': 'HTTPS_STOPPED_DATA_PRESERVED'}
        else:
            report = {'status': 'STATUS_ONLY', 'origin': runner.state.get('origin'), 'mode': runner.state.get('mode'), 'device_test': 'PENDING'}
    except Exception as error:
        report = dict(runner.report if runner else report, status='HTTPS_SETUP_FAILED', error=staging.clean(str(error), runner.runner.secrets if runner else []))
        print(report['error'], flush=True)
    finally:
        if runner:
            if args.action == 'start' or report.get('status') == 'HTTPS_SETUP_FAILED':
                try:
                    runner.diagnostics()
                    report.update({key: runner.report[key] for key in ('tunnel_log_signals',) if key in runner.report})
                except Exception as error:
                    report['diagnostics_error'] = staging.clean(str(error), runner.runner.secrets)
            report['transport_events'] = list(TRANSPORT_EVENTS)
            report['command_checks'] = runner.runner.report.get('checks', {})
            if report.get('status') == 'HTTPS_SETUP_FAILED':
                try:
                    guide = write_guide(root, runner.values, report)
                    print('Guía de recuperación: ' + str(guide))
                    if sys.platform == 'darwin':
                        webbrowser.open(guide.as_uri())
                except Exception as error:
                    report['guide_error'] = staging.clean(str(error), runner.runner.secrets)
            try:
                staging.private_write(runner.folder / 'last-result.json', json.dumps(report, ensure_ascii=False, indent=2))
            except Exception as error:
                report['local_result_error'] = staging.clean(str(error), runner.runner.secrets)
        if owned:
            lock.rmdir()
        if args.report:
            args.report.parent.mkdir(exist_ok=True, parents=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            args.output_dir.mkdir(exist_ok=True, parents=True)
            name = 'loyalty_v015_wallet_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            destination = args.output_dir / (name + '.zip')
            with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(name + '/RESULTADO.json', json.dumps(report, ensure_ascii=False, indent=2))
                archive.write(Path(__file__), name + '/wallet_local.py')
                if runner:
                    report['command_checks'] = runner.runner.report.get('checks', {})
                    for label in report['command_checks']:
                        log = runner.runner.logs/(label+'.log')
                        if log.is_file():
                            archive.writestr(name+'/logs/'+log.name, staging.clean(log.read_text(), runner.runner.secrets))
                if args.origin_script and args.origin_script.is_file():
                    archive.write(args.origin_script, name + '/' + args.origin_script.name)
                # Source snapshots use the same secret exclusions as the full checkpoint.
                checkpoint = sibling('checkpoint')
                for relative, value in checkpoint.snapshot(root).items():
                    if value['content'] is not None:
                        archive.writestr(name + '/after/' + relative, value['content'])
            print('Archivo para compartir: ' + str(destination))
        print('RESULTADO=' + report['status'], flush=True)
    return 0 if report['status'] != 'HTTPS_SETUP_FAILED' else 1




import socket

import ssl

TRANSPORT_EVENTS = []

class HttpsTransportError(OSError):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.transport_code = code

def system_https_request(url, method='GET', data=None, headers=None):
    # Ignore curlrc, retain TLS checks, refuse redirects, and preserve paths for security probes.
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or not parsed.hostname:
        raise ValueError('El cliente HTTPS requiere una URL sin credenciales.')
    command = ['/usr/bin/curl', '--disable', '--silent', '--show-error', '--globoff', '--path-as-is',
               '--noproxy', '*', '--proto', '=https', '--connect-timeout', '5', '--max-time', '12',
               '--max-filesize', '2000000', '--request', method, '--write-out', '\n%{http_code}', '--url', url]
    for key, value in (headers or {}).items():
        if any(c in key + value for c in ('\r', '\n', '\0')):
            raise ValueError('Cabecera HTTP inválida.')
        command += ['--header', key + ': ' + value]
    if data is not None:
        command += ['--data-binary', '@-']
    try:
        result = subprocess.run(command, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
    except subprocess.TimeoutExpired:
        raise HttpsTransportError('CONNECT_TIMEOUT', 'curl superó el tiempo máximo de conexión HTTPS.') from None
    if result.returncode:
        code = {6: 'DNS_RESOLUTION_FAILED', 7: 'CONNECTION_FAILED', 28: 'CONNECT_TIMEOUT',
                35: 'TLS_HANDSHAKE_FAILED', 60: 'TLS_CERTIFICATE_VERIFY_FAILED', 77: 'TLS_CA_FILE_FAILED'}.get(result.returncode, 'CURL_FAILED')
        raise HttpsTransportError(code, 'curl ' + str(result.returncode) + ': ' + result.stderr.decode('utf-8', 'replace').strip()[:600])
    content, separator, status = result.stdout.rpartition(b'\n')
    if not separator or not re.fullmatch(rb'[1-5][0-9]{2}', status) or len(content) > 2_000_000:
        raise HttpsTransportError('INVALID_HTTP_RESPONSE', 'curl no devolvió una respuesta HTTP válida y acotada.')
    return int(status), content

def connection_error(error):
    cause = getattr(error, 'reason', error)
    if isinstance(cause, HttpsTransportError):
        code = cause.transport_code
    elif isinstance(cause, ssl.SSLCertVerificationError):
        code = 'TLS_CERTIFICATE_VERIFY_FAILED'
    elif isinstance(cause, ssl.SSLError):
        code = 'TLS_HANDSHAKE_FAILED'
    elif isinstance(cause, socket.gaierror):
        code = 'DNS_RESOLUTION_FAILED'
    elif isinstance(cause, (TimeoutError, socket.timeout)):
        code = 'CONNECT_TIMEOUT'
    elif isinstance(cause, ConnectionRefusedError):
        code = 'CONNECTION_REFUSED'
    else:
        code = 'CONNECTION_FAILED'
    return {'code': code, 'detail': staging.clean(str(cause), [])[:600]}



class QuickTunnelRetired(RuntimeError):
    """Cloudflare explicitly discarded the current temporary tunnel identity."""

def quick_tunnel_retired(logs):
    failures = [m.start() for m in re.finditer(r'(?i)Unauthorized:\s*Tunnel not found', logs)]
    connected = [m.start() for m in re.finditer(r'Registered tunnel connection', logs)]
    return bool(failures) and max(failures) > max(connected, default=-1)



def configure_stable_https(root, renew=False):
    """Configure a remotely managed tunnel without placing its token in arguments or Git."""
    import getpass
    if not sys.stdin.isatty():
        raise RuntimeError('--configure-stable-https requiere una terminal interactiva.')
    connection = LocalWallet(root)
    db = connection.database_state()
    wallet = initialize(root, db['hasKey'])
    print('Primero crea en Cloudflare un túnel y una ruta pública HTTPS de tu dominio.')
    print('Servicio de la ruta: HTTP, loyalty-wallet-gateway:8080. El asistente no crea DNS ni el túnel remoto.')
    origin = public_origin(input('Dirección fija completa (https://...): ').strip())
    host = urllib.parse.urlsplit(origin).hostname
    if host == 'trycloudflare.com' or host.endswith('.trycloudflare.com'):
        raise RuntimeError('Una dirección trycloudflare.com es temporal. Usa un subdominio de tu dominio.')
    previous = connection.state.get('origin') or wallet.get('PUBLIC_BASE_URL')
    if db['passes'] and (previous != origin or wallet.get('WALLET_TUNNEL_MODE', 'quick') != 'named') and not renew:
        raise RuntimeError('Existen tarjetas instaladas. Repite con --renew-test-url para migrar su conexión y volver a guardar la misma tarjeta.')
    token = getpass.getpass('Token del túnel (solo el valor, oculto; Enter conserva el configurado): ').strip()
    if not token:
        source = Path(wallet.get('CLOUDFLARE_TUNNEL_TOKEN_PATH') or '/nonexistent').expanduser()
        if source.is_symlink() or not source.is_file() or not 0 < source.stat().st_size < 16000:
            raise RuntimeError('Falta el token del túnel. No se modificó la conexión.')
        token = source.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_+/=-]{40,15999}', token):
        raise RuntimeError('Pega únicamente el token de Cloudflare, sin el comando de instalación. No se modificó la conexión.')
    destination = private_directory(root) / 'cloudflare-token.txt'
    if destination.is_symlink():
        raise RuntimeError('El archivo privado del túnel no puede ser un enlace.')
    staging.private_write(destination, token + '\n')
    update_env(root / '.env.wallet', {'WALLET_TUNNEL_MODE': 'named', 'PUBLIC_BASE_URL': origin,
                                    'CLOUDFLARE_TUNNEL_TOKEN_PATH': str(destination)})
    print('Dominio guardado. Ahora se verificará la conexión y las rutas; aún no se declara HTTPS_PASS.')

if __name__ == '__main__':
    raise SystemExit(main())
