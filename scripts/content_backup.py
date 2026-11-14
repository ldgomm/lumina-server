"""Immutable private deliverables: back up the exact rows in a SQLite snapshot."""
import hashlib
from pathlib import Path
import re
import sqlite3
import tarfile

def file_digest(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()

def expected_files(database):
    with sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro',uri=True) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='content_files'").fetchone():return {}
        return {row[0]:(row[1],row[2]) for row in db.execute('SELECT id,byte_size,sha256 FROM content_files')}

def backup_files(database,directory,archive,need):
    files=expected_files(database);directory=Path(directory);archive=Path(archive)
    if directory.exists():need(not directory.is_symlink() and directory.is_dir() and directory.stat().st_mode&0o077==0,'CONTENT_DIRECTORY_INVALID')
    with archive.open('xb') as raw:
        archive.chmod(0o600)
        with tarfile.open(fileobj=raw,mode='w') as tar:
            for key,(size,sha) in files.items():
                need(bool(re.fullmatch(r'[a-f0-9-]{36}',key)),'CONTENT_IDENTIFIER_INVALID')
                path=directory/key
                need(path.is_file() and not path.is_symlink() and path.stat().st_mode&0o077==0,'CONTENT_FILE_MISSING')
                need(path.stat().st_size==size and file_digest(path)==sha,'CONTENT_FILE_CORRUPT')
                info=tarfile.TarInfo(key);info.size=size;info.mode=0o600
                with path.open('rb') as source:tar.addfile(info,source)
    verify_files(database,archive,need)

def verify_files(database,archive,need):
    expected=expected_files(database);archive=Path(archive)
    if not archive.exists():need(not expected,'CONTENT_BACKUP_MISSING');return
    seen=set()
    with tarfile.open(archive,'r|') as tar:
        for info in tar:
            need(info.isfile() and info.name in expected and info.name not in seen,'CONTENT_ARCHIVE_INVALID')
            size,sha=expected[info.name];need(info.size==size,'CONTENT_ARCHIVE_INVALID')
            digest=hashlib.sha256()
            with tar.extractfile(info) as source:
                for chunk in iter(lambda:source.read(1024*1024),b''):digest.update(chunk)
            need(digest.hexdigest()==sha,'CONTENT_ARCHIVE_CORRUPT');seen.add(info.name)
    need(seen==set(expected),'CONTENT_BACKUP_INCOMPLETE')
