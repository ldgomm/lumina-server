#!/usr/bin/env python3
"""Read-only release evidence. Never reissues cards or labels device checks as passed."""
import argparse
import datetime as dt
import json
from pathlib import Path
import sqlite3
import urllib.request
import production as p

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'))
def hashed(value):return p.digest(canonical(value))

def read_native(c):
    sql="""SELECT json_build_object(
      'passes',(SELECT coalesce(json_agg(json_build_array(serial,tenant_id,member_id,auth_hash,apple_type,google_id,google_class,update_tag) ORDER BY serial),'[]'::json) FROM wallet_passes),
      'registrations',(SELECT coalesce(json_agg(json_build_array(device_hash,serial) ORDER BY device_hash,serial),'[]'::json) FROM wallet_apple_registrations),
      'members',(SELECT coalesce(json_agg(json_build_array(tenant_id,id,revision) ORDER BY tenant_id,id),'[]'::json) FROM members),
      'key',(SELECT fingerprint FROM wallet_key_identity WHERE singleton=true),
      'history',(SELECT count(*) FROM ledger),
      'queue',(SELECT json_build_object('pending',count(*) FILTER(WHERE state='PENDING'),'failed',count(*) FILTER(WHERE state='FAILED'),'delivery_errors',(SELECT count(*) FROM wallet_delivery WHERE last_error IS NOT NULL)) FROM wallet_outbox)
    )"""
    env=p.pg_env(c);env['PGOPTIONS']=env.get('PGOPTIONS','')+' -c default_transaction_read_only=on'
    return json.loads(p.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],env).decode())

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def public_health(c):
    result={}
    for name,url in [('wallet',c['native']['PUBLIC_BASE_URL']+'/health/public'),('portal',c['portal']['LUMINA_ORIGIN']+'/health/ready')]:
        with urllib.request.build_opener(NoRedirect()).open(url,timeout=15) as response:
            raw=response.read(65537);p.need(response.status==200 and len(raw)<=65536,'PUBLIC_HEALTH_FAILED');body=json.loads(raw)
        p.need(body.get('service')=='loyalty-wallet' if name=='wallet' else body.get('status')=='UP','PUBLIC_HEALTH_FAILED')
        result[name]=body.get('probe') if name=='wallet' else body.get('release')
    p.need(isinstance(result['portal'],str) and len(result['portal'])==64 and result['wallet']==result['portal'][:32],'PUBLIC_RELEASE_MISMATCH')
    return result

def snapshot(c):
    native=read_native(c);data=Path(c['portal']['LUMINA_DATA_DIR'])
    with sqlite3.connect((data/'agency.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        links={hashed(row[0]):hashed(row[1]) for row in db.execute('SELECT id,loyalty_tenant FROM companies WHERE loyalty_tenant IS NOT NULL')}
    identities={**{'native:'+k:p.digest(c['native'][k]) for k in p.NATIVE_NAMES},**{'portal:'+k:p.digest(c['portal'][k]) for k in p.PORTAL_NAMES},'agency_key':p.digest(p.private(data/'agency.key').read_bytes()),'wallet_key':native['key']}
    # Only fingerprints leave the process. No documents, card codes, tokens or push keys.
    return {'format':1,'recorded_at':dt.datetime.now(dt.timezone.utc).isoformat(),'identities':identities,'links':links,
      'passes':{hashed(row[0]):{'identity':hashed(row[:7]),'update_tag':row[7]} for row in native['passes']},
      'registrations':sorted(hashed(row) for row in native['registrations']),
      'members':{hashed(row[:2]):row[2] for row in native['members']},'history_count':native['history'],'queue':native['queue'],
      'public_release':public_health(c),'device_validation':'PENDING'}

def compare(before,after):
    p.need(before.get('format')==after.get('format')==1,'CONTINUITY_EVIDENCE_INVALID')
    failures=[]
    if before['identities']!=after['identities']:failures.append('STABLE_IDENTITY_CHANGED')
    for key,value in before['links'].items():
        if after['links'].get(key)!=value:failures.append('BUSINESS_LINK_CHANGED');break
    for key,value in before['passes'].items():
        current=after['passes'].get(key)
        if not current or current['identity']!=value['identity'] or current['update_tag']<value['update_tag']:failures.append('EXISTING_PASS_CHANGED');break
    if not set(before['registrations']).issubset(after['registrations']):failures.append('APPLE_REGISTRATION_REMOVED')
    if any(key not in after['members'] or after['members'][key]<value for key,value in before['members'].items()):failures.append('MEMBER_HISTORY_REGRESSED')
    if after['history_count']<before['history_count']:failures.append('LEDGER_HISTORY_REGRESSED')
    if before['public_release']==after['public_release']:failures.append('SERVER_UPDATE_NOT_OBSERVED')
    if not before['passes']:failures.append('NO_EXISTING_CARDS_TO_TEST')
    if after['queue'].get('failed',0) or after['queue'].get('delivery_errors',0):failures.append('WALLET_DELIVERY_REQUIRES_REVIEW')
    return {'format':1,'result':'CONTINUITY_REVIEW_REQUIRED' if failures else 'IDENTITY_PASS_DEVICE_TEST_PENDING',
      'issues':failures,'cards_checked':len(before['passes']),'before_digest':hashed(before),'after_digest':hashed(after),
      'apple_device':'PENDING','google_device':'PENDING','note':'Identity and monotonic-history checks only. Installed-card purchase, redemption and refresh must be observed on both devices.'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['capture','compare']);parser.add_argument('--config');parser.add_argument('--before');parser.add_argument('--after');parser.add_argument('--output',required=True)
    args=parser.parse_args()
    try:
        output=Path(args.output).expanduser().resolve();p.private(output.parent,True)
        if args.action=='capture':
            p.need(args.config,'CONFIG_REQUIRED');result=snapshot(p.load_config(Path(args.config).expanduser().resolve()));status='CONTINUITY_CAPTURED_DEVICE_TEST_PENDING'
        else:
            p.need(args.before and args.after,'BOTH_CAPTURES_REQUIRED')
            result=compare(json.loads(p.private(Path(args.before).expanduser().resolve()).read_text()),json.loads(p.private(Path(args.after).expanduser().resolve()).read_text()));status=result['result']
        p.save_json(output,result,exclusive=True);print('RESULTADO='+status);return int(status=='CONTINUITY_REVIEW_REQUIRED')
    except Exception:
        print('RESULTADO=CONTINUITY_CHECK_FAILED_NO_CHANGES');return 1

if __name__=='__main__':raise SystemExit(main())
