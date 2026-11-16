"""Deployment ordering and continuity checks using isolated fixtures only."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

spec=importlib.util.spec_from_file_location('deploy',Path(__file__).resolve().parents[1]/'deploy.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class DeploymentTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve();self.addCleanup(self.temp.cleanup)
 def test_mapped_loopback_is_private(self):
  with patch.object(r,'run',return_value='LISTEN 0 4096 [::ffff:127.0.0.1]:9101 *:*\nLISTEN 0 511 127.0.0.1:8100 0.0.0.0:*'):
   r.listeners()
 def test_wildcard_exposure_is_rejected(self):
  for host in ('0.0.0.0','[::]','[::ffff:0.0.0.0]','142.93.83.35','*'):
   with self.subTest(host=host),patch.object(r,'run',return_value=f'LISTEN 0 4096 {host}:9101 *:*'):
    with self.assertRaises(r.Blocked):r.listeners()
 def test_drain_precedes_switch(self):
  p=Mock();events=[]
  with patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   r.slot_change(p,{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup',switch=lambda:events.append('switch'))
  self.assertEqual(events,[['systemctl','stop','lumina-portal@blue'],'switch'])
  p.ready.assert_called_once();p.switch.assert_not_called()
 def test_failed_promotion_resumes_previous_process_without_data_rollback(self):
  (self.root/'active.json').write_text(json.dumps({'slot':'blue','sha':'old'}));events=[]
  with patch.object(r,'STATE',self.root),patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   with self.assertRaises(r.Blocked):r.slot_change(Mock(),{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup',switch=lambda:(_ for _ in ()).throw(r.Blocked('FAIL')))
  self.assertEqual(events,[['systemctl','stop','lumina-portal@blue'],['systemctl','stop','lumina-portal@green'],['systemctl','start','lumina-portal@blue']])
 def test_successful_promotion_is_not_rolled_back_on_later_error(self):
  (self.root/'active.json').write_text(json.dumps({'slot':'green','sha':'new'}));events=[]
  with patch.object(r,'STATE',self.root),patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   with self.assertRaises(r.Blocked):r.slot_change(Mock(),{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup',switch=lambda:(_ for _ in ()).throw(r.Blocked('AFTER_SWITCH')))
  self.assertEqual(events,[['systemctl','stop','lumina-portal@blue']])
 def test_unhealthy_candidate_never_stops_previous(self):
  p=Mock();p.ready.side_effect=r.Blocked('NOT_READY')
  with patch.object(r,'run') as run:
   with self.assertRaises(r.Blocked):r.slot_change(p,{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup')
   run.assert_not_called()
 def test_candidate_portal_background_work_starts_only_after_old_portal_stops(self):
  p=Mock();events=[]
  with patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   r.slot_change(p,{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup',switch=lambda:events.append('switch'),start_candidate=lambda:events.append('start candidate'))
  self.assertEqual(events,[['systemctl','stop','lumina-portal@blue'],'start candidate','switch'])
  p.ready.assert_called_once()
 def test_failed_candidate_start_resumes_previous_process(self):
  (self.root/'active.json').write_text(json.dumps({'slot':'blue','sha':'old'}));events=[]
  with patch.object(r,'STATE',self.root),patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   with self.assertRaises(r.Blocked):r.slot_change(Mock(),{}, {'slot':'blue','sha':'old'}, {'release':'/fake','sha':'new'},'green','/backup',start_candidate=lambda:(_ for _ in ()).throw(r.Blocked('START_FAILED')))
  self.assertEqual(events,[['systemctl','stop','lumina-portal@blue'],['systemctl','stop','lumina-portal@green'],['systemctl','start','lumina-portal@blue']])
 def test_staging_cleanup_never_stops_another_checkout(self):
  responses=['container1',json.dumps([{'Config':{'Labels':{'com.docker.compose.project.working_dir':'/another/project'}}}])]
  with patch.object(r,'run',side_effect=responses) as run:
   with self.assertRaises(r.Blocked):r.stop_own_staging()
   self.assertEqual(run.call_count,2)
 def test_staging_cleanup_only_stops_verified_worktree_containers(self):
  responses=['container1',json.dumps([{'Config':{'Labels':{'com.docker.compose.project.working_dir':str(r.WORK)}}}]),'']
  with patch.object(r,'run',side_effect=responses) as run:
   r.stop_own_staging();self.assertEqual(run.call_args.args[0],['docker','stop','container1'])

 def test_inactive_slot_can_be_reused_without_stopping_the_active_slot(self):
  old={'slot':'blue','sha':'old'};(self.root/'active.json').write_text(json.dumps(old))
  path=self.root/'green.env';path.write_text('RELEASE=/old\n');events=[]
  account=Mock(pw_uid=os.getuid(),pw_gid=os.getgid())
  with patch.object(r,'STATE',self.root),patch.object(r,'EVIDENCE',self.root),patch.object(r,'run',side_effect=lambda args,**kw:events.append(args)),patch.object(r,'active_unit',return_value=False):
   r.configure_slot('green',path,'RELEASE=/new\n',account,old)
  self.assertEqual(path.read_text(),'RELEASE=/new\n')
  self.assertEqual((self.root/'green-previous.env').read_text(),'RELEASE=/old\n')
  self.assertEqual(events,[['systemctl','stop','lumina-portal@green'],['systemctl','stop','lumina-wallet@green']])
  self.assertEqual(path.stat().st_mode&0o777,0o600)

 def test_active_or_concurrently_changed_slot_is_never_overwritten(self):
  old={'slot':'blue','sha':'old'};(self.root/'active.json').write_text(json.dumps(old))
  path=self.root/'blue.env';path.write_text('RELEASE=/old\n')
  with patch.object(r,'STATE',self.root),patch.object(r,'run') as command:
   with self.assertRaisesRegex(r.Blocked,'ACTIVE_SLOT_FORBIDDEN'):r.configure_slot('blue',path,'bad',Mock(),old)
   (self.root/'active.json').write_text(json.dumps({'slot':'green','sha':'concurrent'}))
   with self.assertRaisesRegex(r.Blocked,'ACTIVE_RELEASE_CHANGED'):r.configure_slot('green',path,'bad',Mock(),old)
   command.assert_not_called()
  self.assertEqual(path.read_text(),'RELEASE=/old\n')

 def test_command_failure_keeps_exact_error_privately(self):
  with patch.object(r,'EVIDENCE',self.root),patch.object(r,'STEP','BUILD'),contextlib.redirect_stdout(io.StringIO()):
   with self.assertRaisesRegex(r.Blocked,'COMMAND_FAILED_.*_EXIT_8'):
    r.run([sys.executable,'-c','import sys;print("ORIGINAL_ERROR",file=sys.stderr);sys.exit(8)'])
  log=self.root/'build-command.log'
  self.assertIn('ORIGINAL_ERROR',log.read_text());self.assertEqual(log.stat().st_mode&0o777,0o600)

 def test_cli_does_not_disclose_private_exception_content(self):
  console=io.StringIO()
  with patch.object(r,'EVIDENCE',self.root),patch.object(r.os,'geteuid',return_value=0),patch.object(sys,'argv',['deploy.py','--commit','a'*40]),patch.object(r,'main',side_effect=ValueError('private test value')),contextlib.redirect_stdout(console):
   self.assertEqual(r.cli(),1)
  self.assertNotIn('private test value',console.getvalue())
  self.assertIn('CAUSE=ValueError',console.getvalue())
  self.assertEqual(len(console.getvalue().splitlines()),1)
  self.assertIn('private test value',(self.root/('a'*40)/'deploy.log').read_text())

 def test_checkpoint_executes_existing_revision_mode_in_project_directory(self):
  scripts=self.root/'scripts';scripts.mkdir()
  (scripts/'checkpoint.py').write_text('import os,sys,json\nprint(json.dumps({"cwd":os.getcwd(),"args":sys.argv[1:]}))\n')
  with patch.object(r,'WORK',self.root),patch.object(r,'EVIDENCE',self.root):
   self.assertEqual(r.execute_checkpoint(os.environ.copy(),self.root/'evidence',timeout=10),0)
  value=json.loads((self.root/'checkpoint.log').read_text())
  self.assertEqual(value['cwd'],str(self.root));self.assertIn('--verify-only',value['args'])

 def test_checkpoint_deadline_stops_the_process_and_preserves_its_output(self):
  scripts=self.root/'scripts';scripts.mkdir()
  (scripts/'checkpoint.py').write_text('import time\nprint("PARTIAL_CHECKPOINT",flush=True)\ntime.sleep(30)\n')
  with patch.object(r,'WORK',self.root),patch.object(r,'EVIDENCE',self.root):
   with self.assertRaises(subprocess.TimeoutExpired):r.execute_checkpoint(os.environ.copy(),self.root/'evidence',timeout=.3)
  self.assertIn('PARTIAL_CHECKPOINT',(self.root/'checkpoint.log').read_text())

 def test_full_checkpoint_failure_cannot_build_backup_or_switch_production(self):
  source=self.root/'source';source.mkdir();state=self.root/'runtime';state.mkdir()
  evidence=self.root/'evidence';evidence.mkdir()
  (state/'active.json').write_text(json.dumps({'slot':'blue','sha':'old','release':'/opt/lumina/releases/old'}))
  production=Mock();production.release_manifest.return_value={'sha':'old','commit':'b'*40}
  original_safe=r.safe
  def safe(path):
   return self.root/'cache' if str(path)=='/var/cache/lumina-gradle-v074' else original_safe(path)
  def failed_checkpoint(env,output):
   folder=output/'failed';folder.mkdir();(folder/'RESULTADO.json').write_text(json.dumps({'status':'BUILD_OR_UNIT_FAILED_NO_COMMIT'}));return 1
  with contextlib.ExitStack() as stack:
   for name,value in {'SOURCE':source,'WORK':source,'STATE':state,'EVIDENCE':evidence,'safe':safe}.items():stack.enter_context(patch.object(r,name,value))
   stack.enter_context(patch.object(r.os,'geteuid',return_value=0));stack.enter_context(patch.object(r.sys,'platform','linux'))
   stack.enter_context(patch.object(r,'git',side_effect=lambda *args,**kw:'a'*40 if args[0]=='rev-parse' else ''))
   command=stack.enter_context(patch.object(r,'run',side_effect=lambda args,**kw:'v24.0.0' if args[0]=='node' else ''))
   stack.enter_context(patch.object(r,'load_production',return_value=production))
   stack.enter_context(patch.object(r.shutil,'which',return_value='/fixture'))
   stack.enter_context(patch.object(r.shutil,'disk_usage',return_value=Mock(free=8*1024**3)))
   stack.enter_context(patch.object(r,'execute_checkpoint',side_effect=failed_checkpoint))
   stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
   with self.assertRaisesRegex(r.Blocked,'FULL_CHECKPOINT_FAILED_BUILD_OR_UNIT_FAILED'):r.main('a'*40)
  production.backup.assert_not_called();production.package.assert_not_called();production.switch.assert_not_called()
  self.assertFalse(any(call.args[0][0]=='systemctl' for call in command.call_args_list))

if __name__=='__main__':unittest.main()
