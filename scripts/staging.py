#!/usr/bin/env python3
"""Persistent local Docker preview. Credentials never enter build context or evidence."""
import argparse
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser

PROJECT_NAME = 'loyalty-staging'
COMPOSE_FILE = 'docker-compose.staging.yml'
SECRET_NAMES = ('STAGING_DATABASE_PASSWORD','STAGING_IDENTITY_PEPPER','STAGING_ADMIN_TOKEN','STAGING_OWNER_TOKEN','STAGING_CASHIER_TOKEN','STAGING_ALICE_PASSWORD','STAGING_BOB_PASSWORD')
RUN_VARIABLE = 'LUMINA_STAGING_RUN'


def checkpoint_run(run_id=None):
    value = os.environ.get(RUN_VARIABLE, '') if run_id is None else run_id
    expect(not value or re.fullmatch('[a-f0-9]{24}', value), 'Identificador de pruebas aisladas inválido.')
    return value


def config_root(root):
    """Keep deployment test credentials separate from the persistent local pilot."""
    run_id = checkpoint_run()
    if not run_id:
        return root
    folder = root
    for name in ('.local-staging', 'checkpoints', run_id):
        folder = folder / name
        expect(not folder.is_symlink(), 'La carpeta de pruebas aisladas no puede ser un enlace.')
        folder.mkdir(mode=0o700, exist_ok=True)
        os.chmod(folder, 0o700)
    return folder


def project_name(root, run_id=None):
    value = checkpoint_run(run_id)
    if not value:
        return PROJECT_NAME
    identity = hashlib.sha256((str(root.resolve())+'\0'+value).encode()).hexdigest()[:24]
    return 'lumina-check-'+identity


def server_image(root):
    return 'loyalty-server:'+(project_name(root) if checkpoint_run() else 'local-staging')


def available_port():
    # Docker performs the final bind. A competing bind fails the gate; it never
    # causes an existing listener to be stopped or reconfigured.
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def expect(condition, message):
    if not condition:
        raise RuntimeError(message)


def private_write(path, text, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise RuntimeError('No se escribe sobre un enlace simbólico privado.')
    if exclusive:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:
            f.write(text)
    else:
        temp=path.with_name(path.name+'.tmp-'+secrets.token_hex(4))
        try:
            private_write(temp,text,True)
            os.replace(temp,path)
        finally:
            temp.unlink(missing_ok=True)
    os.chmod(path,0o600)


def read_config(root):
    path=config_root(root)/'.env'
    if path.is_symlink():
        raise RuntimeError('.env no puede ser un enlace simbólico.')
    if not path.is_file():
        raise RuntimeError('Falta .env. Ejecuta python3 scripts/staging.py init.')
    values={}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key,sep,value=line.partition('=')
        if not sep or not re.fullmatch('[A-Z][A-Z0-9_]*',key) or key in values:
            raise RuntimeError('Formato inválido o clave duplicada en .env. Usa NOMBRE=valor, sin export ni comillas.')
        values[key]=value
    if set(values) != set(SECRET_NAMES)|{'LOYALTY_HTTP_PORT','STAGING_INSTANCE_ID'}:
        raise RuntimeError('Revisa los nombres de configuración de .env; no se cambió el archivo.')
    try:
        valid=str(uuid.UUID(values['STAGING_INSTANCE_ID']))==values['STAGING_INSTANCE_ID'] and 1024<=int(values['LOYALTY_HTTP_PORT'])<=65535
    except (ValueError,KeyError):
        valid=False
    if not valid or not all(re.fullmatch('[A-Za-z0-9_-]{32,128}',values[k]) for k in SECRET_NAMES) or len({values[k] for k in SECRET_NAMES})!=len(SECRET_NAMES):
        raise RuntimeError('Revisa puerto, identificador y claves privadas de .env. Conserva los valores originales si ya hay datos.')
    os.chmod(path,0o600)
    return values


def init_config(root, port=8097, existing_resources=False):
    path=config_root(root)/'.env'
    if path.exists() or path.is_symlink():
        return read_config(root),False
    if existing_resources:
        raise RuntimeError('Existe un entorno Docker de Loyalty sin .env. Restaura ese archivo privado; no se regenerarán las claves ni se borrará la base.')
    if checkpoint_run():
        port=available_port()
    if not 1024<=port<=65535:
        raise RuntimeError('El puerto local debe estar entre 1024 y 65535.')
    values={'LOYALTY_HTTP_PORT':str(port),'STAGING_INSTANCE_ID':str(uuid.uuid4())}
    values.update({k:secrets.token_urlsafe(36) for k in SECRET_NAMES})
    private_write(path,'# Privado. Conservar junto con el respaldo de la base local. No compartir.\n'+'\n'.join(k+'='+v for k,v in values.items())+'\n',True)
    return values,True


def source_fingerprint(root):
    spec=importlib.util.spec_from_file_location('loyalty_checkpoint_source',root/'scripts/checkpoint.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    manifest=module.manifest({name:value for name,value in module.snapshot(root).items() if value['content'] is not None})
    return hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def clean(text, values):
    for value in sorted(set(values),key=len,reverse=True):
        if len(value)>=8:
            text=text.replace(value,'[REDACTED]')
    text=re.sub(r'(Bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]',text)
    return re.sub(r'(?i)((?:password|token|secret|pepper)\s*[=:]\s*)[^\s,;]+',r'\1[REDACTED]',text)


def environment(values, source=None, root=None):
    env={k:v for k,v in os.environ.items() if not k.startswith(('STAGING_','COMPOSE_','LOYALTY_','COMEBACK_'))}
    env.update(values)
    if source:
        env['LOYALTY_SOURCE_SHA']=source
    env['LOYALTY_STAGING_IMAGE']=server_image(root or Path(__file__).resolve().parents[1])
    env['COMPOSE_ANSI']='never';env['BUILDKIT_PROGRESS']='plain'
    return env


def compose(root, *args):
    return ['docker','compose','--project-name',project_name(root),'--env-file',str(config_root(root)/'.env'),'-f',str(root/COMPOSE_FILE),*args]


def urls(values):
    base='http://localhost:'+values['LOYALTY_HTTP_PORT']
    return {'preview':base+'/preview','admin':base+'/platform','store':base+'/','clients':(values.get('LOYALTY_CLIENT_ORIGIN') or base)+'/join/demo-cafe-'+values['STAGING_INSTANCE_ID'][:8]}


def write_access(root, values):
    port=os.environ.get('LUMINA_PORT','8099')
    expect(port.isdigit() and 1024<=int(port)<=65535,'Puerto de Lúmina inválido.')
    link='http://127.0.0.1:'+port+'/'
    page='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lúmina Digital</title><style>body{font:18px system-ui;background:#f3f6fa;color:#0b1f3a;max-width:720px;margin:12vh auto;padding:24px}a{display:inline-block;padding:16px 24px;background:#0b1f3a;color:white;border-radius:12px;text-decoration:none}</style><h1>Tu negocio, en Lúmina Digital.</h1><p>Accede con tu cuenta para gestionar contenido, fidelización y equipo. Wallet se prepara al registrar tu negocio.</p><a href="'+html.escape(link,quote=True)+'">Abrir Lúmina Digital</a></html>'
    destination=config_root(root)/'.local-staging/access.html';private_write(destination,page)
    return destination



class Runner:
    def __init__(self,root,values=None,report=None):
        self.root=root;self.values=values or {};self.secrets=[self.values[k] for k in SECRET_NAMES if k in self.values]
        self.logs=(report.parent/'staging-logs') if report else config_root(root)/'.local-staging/logs'
        self.logs.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.report={'status':'STARTED','checks':{},'wallet_device_test':'PENDING','compose_project':project_name(root),'config_path':str(config_root(root)/'.env')}
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def run(self,label,command,timeout=60,check=True,env=None):
        stop=threading.Event()
        def heartbeat():
            start=time.monotonic()
            while not stop.wait(20):
                print(label+': trabajando ('+str(int(time.monotonic()-start))+' s)...',flush=True)
        thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
        try:
            result=subprocess.run(command,cwd=self.root,env=env or environment(self.values,root=self.root),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
            output=clean(result.stdout.decode('utf-8','replace'),self.secrets)
            private_write(self.logs/(label+'.log'),output)
            self.report['checks'][label]={'exit_code':result.returncode}
            print(label+': '+('OK' if result.returncode==0 else 'ERROR'),flush=True)
            if check and result.returncode:
                print('\n'.join(output.splitlines()[-12:]),flush=True)
                raise RuntimeError(label+' falló. Consulta el log de esta ejecución.')
            return result.returncode,output
        except subprocess.TimeoutExpired as error:
            self.report['checks'][label]={'exit_code':124}
            partial=error.stdout or b''
            output=clean(partial.decode('utf-8','replace') if isinstance(partial,bytes) else partial,self.secrets)
            private_write(self.logs/(label+'.log'),output+'\nTiempo máximo agotado; el estado de Docker se conserva para revisión.\n')
            raise RuntimeError(label+' superó el tiempo máximo. No se borraron datos.')
        finally:
            stop.set();thread.join(timeout=1)
    def api(self,path,body=None,token=None,expected=200):
        headers={};data=None
        if body is not None:
            headers['Content-Type']='application/json';data=json.dumps(body).encode()
        if token:
            headers['Authorization']='Bearer '+token
        request=urllib.request.Request('http://localhost:'+self.values['LOYALTY_HTTP_PORT']+path,data=data,headers=headers)
        try:
            with self.opener.open(request,timeout=12) as response:
                status=response.status;content=response.read();kind=response.headers.get('Content-Type','')
        except urllib.error.HTTPError as error:
            status=error.code;content=error.read();kind=error.headers.get('Content-Type','')
        if status!=expected:
            raise RuntimeError('La comprobación HTTP '+path.split('?')[0]+' esperaba '+str(expected)+' y recibió '+str(status)+'. No se imprimieron las credenciales.')
        return json.loads(content) if 'json' in kind else content
    def verify(self,source):
        info=self.api('/api/staging/info')
        if info.get('instance')!=self.values['STAGING_INSTANCE_ID'] or info.get('profile')!='local-staging' or info.get('sourceSha')!=source:
            raise RuntimeError('El servidor no corresponde a esta configuración y versión del código.')
        expect(self.api('/health/ready')['status']=='UP', 'El servidor no está listo.')
        slug='demo-cafe-'+self.values['STAGING_INSTANCE_ID'][:8]
        tenants=self.api('/api/platform/tenants?q='+slug,token=self.values['STAGING_ADMIN_TOKEN'])['items']
        tenant=next((x for x in tenants if x['slug']==slug),None)
        if not tenant:
            raise RuntimeError('Falta el negocio de demostración.')
        owner=self.api('/api/staff/dashboard',token=self.values['STAGING_OWNER_TOKEN'])
        cashier=self.api('/api/staff/dashboard',token=self.values['STAGING_CASHIER_TOKEN'])
        expect(owner['role']=='OWNER' and cashier['role']=='CASHIER' and owner['business']['id']==tenant['id'], 'Los accesos del negocio no corresponden a los roles esperados.')
        self.api('/api/staff/account',token=self.values['STAGING_OWNER_TOKEN'])
        self.api('/api/staff/account',token=self.values['STAGING_CASHIER_TOKEN'],expected=403)
        self.api('/api/platform/tenants',token=self.values['STAGING_OWNER_TOKEN'],expected=401)
        for document,name in [('DEMO10001','STAGING_ALICE_PASSWORD'),('DEMO10002','STAGING_BOB_PASSWORD')]:
            login=self.api('/api/public/'+slug+'/login',{'document':document,'password':self.values[name]})
            token=login['token'];self.secrets.append(token)
            try:
                card=self.api('/api/me',token=token)
                expect(bool(card['member']['id']) and isinstance(card['balances'],list), 'La tarjeta del cliente está incompleta.')
                self.api('/api/staff/dashboard',token=token,expected=401)
                expect(self.api('/api/me/wallet-status',token=token)=={'apple':False,'google':False}, 'El entorno local debe mantener Wallet externo desactivado.')
            finally:
                self.api('/api/me/logout',{},token)
        expect(b'Explora Loyalty' in self.api('/preview'), 'No se cargó la vista local.')
        expect(b'/commercial.js' in self.api('/platform'), 'No se cargó el panel de administrador.')
        expect(b'/app.js' in self.api('/join/'+slug), 'No se cargó el registro del cliente.')
        expect(b'/scanner.js' in self.api('/join/'+slug), 'No se cargó el lector de Wallet.')
        app_js=self.api('/app.js')
        expect(b'counter-redemptions' in app_js and b'Crea tu contrase' not in app_js and b'loginPassword' not in app_js, 'El cliente conserva el flujo anterior.')
        expect(b'startComebackScanner' in self.api('/scanner.js'), 'Falta el lector QR.')
        expect(b'/engagement.js' in self.api('/'), 'Falta la interfaz nueva de promociones.')
        expect(b'/experience.js' in self.api('/') and b'workspace-nav' in self.api('/experience.js'), 'Falta la nueva interfaz de Loyalty.')
        expect(b'promotion-templates' in self.api('/engagement.js'), 'Falta el archivo de promociones en el servidor local.')
        expect(b'fixContrast' in self.api('/engagement.js'), 'Falta el editor guiado de colores en el servidor local.')
        expect(b'loyalty-wallet-design-colors' in self.api('/style.css'), 'Faltan los estilos del editor de colores.')
        expect(b'deletion-preview' in self.api('/promotion-editor.js') and b'loyalty-promotion-removal' in self.api('/style.css'), 'Falta la eliminación de promociones con aviso de impacto.')
        expect(self.api('/wallet/brand/'+slug+'/logo.png').startswith(bytes.fromhex('89504e470d0a1a0a')), 'El logo público no es un PNG válido.')
        self.api('/api/staff/counter-redemptions',{},expected=401)
        self.api('/api/public/'+slug+'/join',{'name':'Prueba','document':'DEMO10001','acceptedTerms':True,'password':'not-accepted'},expected=400)
        self.report.update(status='LOCAL_STAGING_PASS',source_sha=source,instance=self.values['STAGING_INSTANCE_ID'],urls=urls(self.values),roles=['ADMIN','OWNER','CASHIER','CLIENT_ANA','CLIENT_LUIS'],http_checks='PASS',purchase_or_redemption_mutations=False)
    def diagnostics(self):
        for label,args in [('compose_status',['ps','--format','json']),('compose_recent_logs',['logs','--no-color','--tail=150','loyalty-server','loyalty-db'])]:
            try:
                self.run(label,compose(self.root,*args),30,check=False)
            except Exception:
                self.report['checks'][label]={'status':'UNAVAILABLE'}


def require_docker(runner):
    if not shutil.which('docker'):
        raise RuntimeError('Instala o abre Docker Desktop para construir y ejecutar el servidor local.')
    runner.run('docker_ready',['docker','info','--format','{{.ServerVersion}}'],25)
    runner.run('compose_version',['docker','compose','version','--short'],20)


def resources_exist(runner):
    name=project_name(runner.root)
    commands=[['docker','volume','ls','--filter','label=com.docker.compose.project='+name,'-q'],['docker','ps','-aq','--filter','label=com.docker.compose.project='+name]]
    return any(bool(runner.run('existing_'+str(i),command,20)[1].strip()) for i,command in enumerate(commands))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['init','start','verify','credentials','status','logs','stop'])
    parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--port',type=int,default=8097)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--open',action='store_true',dest='open_browser')
    parser.add_argument('--quiet',action='store_true')
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args(argv);root=args.project.expanduser().resolve();report=args.report.resolve() if args.report else None
    if args.action=='credentials':
        values=read_config(root);path=write_access(root,values)
        print('Lúmina Digital: '+str(path))
        if args.open_browser:
            webbrowser.open(path.as_uri())
        return 0
    runner=Runner(root,report=report);lock=root/'.loyalty-staging.lock';owned=False
    try:
        lock.mkdir();owned=True;require_docker(runner)
        if args.action in ('init','start'):
            values,created=init_config(root,args.port,False if (config_root(root)/'.env').exists() else resources_exist(runner))
            print('.env creado con claves privadas.' if created else '.env existente conservado.')
        else:
            values=read_config(root)
        runner.values=values;runner.secrets=[values[k] for k in SECRET_NAMES]
        if args.action=='init':
            write_access(root,values);runner.report['status']='LOCAL_STAGING_CONFIG_READY';return 0
        if args.action in ('status','logs','stop'):
            commands={'status':['ps'],'logs':['logs','--no-color','--tail=150','loyalty-server'],'stop':['stop','loyalty-server']}
            print(runner.run(args.action,compose(root,*commands[args.action]),90)[1]);return 0
        source=source_fingerprint(root)
        if args.action=='start':
            runner.run('compose_config',compose(root,'config','--quiet'),30)
            _,services=runner.run('compose_services',compose(root,'config','--services'),30)
            if set(services.split())!={'loyalty-server','loyalty-db'}:
                raise RuntimeError('El Compose no contiene los servicios locales esperados.')
            runner.run('docker_build_start',compose(root,'up','-d','--build','--wait','--wait-timeout','180'),1800,env=environment(values,source,root))
            runner.run('demo_seed',compose(root,'exec','-T','loyalty-server','java','-Djava.awt.headless=true','-cp','/app/lib/*','com.premierdarkcoffee.loyalty.LocalStagingKt'),90)
        _,image_id=runner.run('running_image',compose(root,'images','-q','loyalty-server'),30)
        runner.report['image_id']=image_id.strip()
        runner.verify(source)
        if source_fingerprint(root)!=source:
            raise RuntimeError('El código cambió mientras se construía la imagen. Ejecuta de nuevo para validar y levantar esa versión.')
        path=write_access(root,values)
        print('Acceso a Lúmina Digital: '+str(path))
        if not args.no_browser:
            webbrowser.open(path.as_uri())
        return 0
    except Exception as error:
        runner.report.update(status='LOCAL_STAGING_FAILED',error=clean(str(error),runner.secrets))
        print(runner.report['error'],file=sys.stderr)
        return 1
    finally:
        if runner.values and args.action in ('start','verify'):
            runner.diagnostics()
        if report:
            private_write(report,json.dumps(runner.report,ensure_ascii=False,indent=2))
        if owned:
            lock.rmdir()


if __name__=='__main__':
    try:
        sys.exit(main())
    except Exception:
        print('No se pudo completar el comando de staging. Revisa la configuración privada sin compartirla.',file=sys.stderr)
        sys.exit(1)
