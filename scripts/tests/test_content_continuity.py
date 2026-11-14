import copy
import hashlib
import io
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import production as production
import content_backup as files
import wallet_continuity as continuity

class ContentBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve();self.db=self.root/'agency.sqlite';self.uploads=self.root/'uploads';self.uploads.mkdir(mode=0o700)
        self.key='e993d14f-ea70-4c3a-a6c1-4760b294c71e';self.payload=b'private immutable delivery';self.file=self.uploads/self.key;self.file.write_bytes(self.payload);self.file.chmod(0o600)
        with sqlite3.connect(self.db) as db:db.executescript('CREATE TABLE content_files(id TEXT,byte_size INTEGER,sha256 TEXT)');db.execute('INSERT INTO content_files VALUES(?,?,?)',(self.key,len(self.payload),hashlib.sha256(self.payload).hexdigest()))
        self.archive=self.root/'uploads.tar'
    def backup(self):files.backup_files(self.db,self.uploads,self.archive,production.need)
    def test_backup_matches_snapshot_and_ignores_uncommitted_files(self):
        (self.uploads/'.upload-interrupted').write_bytes(b'partial');self.backup();files.verify_files(self.db,self.archive,production.need)
        with tarfile.open(self.archive) as tar:self.assertEqual(tar.getnames(),[self.key]);self.assertEqual(tar.extractfile(self.key).read(),self.payload)
        self.assertEqual(self.archive.stat().st_mode&0o777,0o600)
    def test_missing_referenced_file_blocks_backup(self):
        self.file.unlink()
        with self.assertRaisesRegex(production.Blocked,'FILE_MISSING'):self.backup()
    def test_changed_file_blocks_backup(self):
        self.file.write_bytes(b'changed')
        with self.assertRaisesRegex(production.Blocked,'FILE_CORRUPT'):self.backup()
    def test_symlink_is_not_followed(self):
        self.file.unlink();self.file.symlink_to(self.db)
        with self.assertRaisesRegex(production.Blocked,'FILE_MISSING'):self.backup()
    def test_missing_archive_is_not_a_valid_restore_when_deliveries_exist(self):
        with self.assertRaisesRegex(production.Blocked,'BACKUP_MISSING'):files.verify_files(self.db,self.archive,production.need)
    def test_incomplete_and_path_traversal_archives_are_rejected_without_extraction(self):
        with tarfile.open(self.archive,'w'):pass
        with self.assertRaisesRegex(production.Blocked,'INCOMPLETE'):files.verify_files(self.db,self.archive,production.need)
        with tarfile.open(self.archive,'w') as tar:
            info=tarfile.TarInfo('../outside');info.size=1;tar.addfile(info,io.BytesIO(b'x'))
        with self.assertRaisesRegex(production.Blocked,'ARCHIVE_INVALID'):files.verify_files(self.db,self.archive,production.need)
        self.assertFalse((self.root.parent/'outside').exists())
    def test_tampered_archive_bytes_are_rejected(self):
        with tarfile.open(self.archive,'w') as tar:
            info=tarfile.TarInfo(self.key);info.size=len(self.payload);tar.addfile(info,io.BytesIO(b'x'*len(self.payload)))
        with self.assertRaisesRegex(production.Blocked,'ARCHIVE_CORRUPT'):files.verify_files(self.db,self.archive,production.need)
    def test_new_files_after_snapshot_are_not_mistaken_for_missing_backup_content(self):
        self.backup();(self.uploads/'not-in-snapshot').write_bytes(b'new');files.verify_files(self.db,self.archive,production.need)

class WalletContinuityTests(unittest.TestCase):
    def setUp(self):
        self.before={'format':1,'identities':{'origin':'stable','key':'stable'},'links':{'company':'tenant'},'passes':{'pass':{'identity':'fixed','update_tag':5}},'registrations':['device'],'members':{'member':10},'history_count':30,'queue':{'failed':0},'public_release':{'portal':'old','wallet':'old'}}
        self.after=copy.deepcopy(self.before);self.after['public_release']={'portal':'new','wallet':'new'};self.after['members']['member']=12;self.after['passes']['pass']['update_tag']=7;self.after['history_count']=32
    def test_valid_update_does_not_claim_device_validation(self):
        result=continuity.compare(self.before,self.after);self.assertEqual(result['result'],'IDENTITY_PASS_DEVICE_TEST_PENDING');self.assertEqual(result['apple_device'],'PENDING');self.assertEqual(result['google_device'],'PENDING')
    def test_rotated_identity_or_business_link_is_blocked(self):
        for key in ['identities','links']:
            after=copy.deepcopy(self.after);after[key]={};self.assertEqual(continuity.compare(self.before,after)['result'],'CONTINUITY_REVIEW_REQUIRED')
    def test_card_replacement_and_loss_of_apple_registration_are_blocked(self):
        for key in ['passes','registrations']:
            after=copy.deepcopy(self.after);after[key]=type(after[key])();self.assertEqual(continuity.compare(self.before,after)['result'],'CONTINUITY_REVIEW_REQUIRED')
    def test_regressed_history_or_updates_are_blocked(self):
        for key in ['history_count','members','passes']:
            after=copy.deepcopy(self.after)
            if key=='history_count':after[key]=1
            elif key=='members':after[key]['member']=1
            else:after[key]['pass']['update_tag']=1
            self.assertEqual(continuity.compare(self.before,after)['result'],'CONTINUITY_REVIEW_REQUIRED')
    def test_new_cards_and_devices_are_allowed_without_replacing_old_ones(self):
        self.after['passes']['new']={'identity':'new','update_tag':1};self.after['registrations'].append('new');self.assertEqual(continuity.compare(self.before,self.after)['result'],'IDENTITY_PASS_DEVICE_TEST_PENDING')
    def test_same_release_or_empty_population_does_not_count_as_upgrade_test(self):
        self.assertIn('SERVER_UPDATE_NOT_OBSERVED',continuity.compare(self.before,self.before)['issues']);self.before['passes']={};self.assertIn('NO_EXISTING_CARDS_TO_TEST',continuity.compare(self.before,self.after)['issues'])
    def test_failed_delivery_queue_requires_review(self):
        self.after['queue']['failed']=1;self.assertIn('WALLET_DELIVERY_REQUIRES_REVIEW',continuity.compare(self.before,self.after)['issues'])

if __name__=='__main__':unittest.main()
