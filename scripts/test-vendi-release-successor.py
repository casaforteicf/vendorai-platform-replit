"""Exercise the real release shell with fake Docker and an isolated filesystem."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('vendi04-controlled-release.sh')
CURRENT = 'vendorai-prod-api-candidate'
OLD = 'vendorai-release:vendi-3580-' + 'a' * 12
NEW = 'vendorai-release:vendi-3584-' + 'b' * 12

class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ('state', 'manifests', 'bin'):
            (self.root / name).mkdir()
        source = SCRIPT.read_text()
        for old, new in (
            ('ROOT=/var/lib/vendi-release', 'ROOT=' + str(self.root)),
            ('/run/lock/vendi-production-release.lock', str(self.root / 'release.lock')),
            ('/opt/vendorai/deploy.lock', str(self.root / 'deploy.lock')),
            ('/var/log/vendi-contabo-operator.log', str(self.root / 'audit.log')),
            ('/root/vendi-prod-env.', str(self.root / 'env.')),
        ):
            source = source.replace(old, new)
        self.script = self.root / 'release.sh'
        self.script.write_text(source)
        self.env = dict(os.environ, PATH=str(self.root / 'bin') + ':' + os.environ['PATH'], FIXTURE=str(self.root))
        fake = '''#!/usr/bin/env python3
import os,json,sys
from pathlib import Path
r=Path(os.environ['FIXTURE']); p=r/'docker.json'; d=json.loads(p.read_text()); a=sys.argv[1:]
def save(): p.write_text(json.dumps(d))
if a[:2]==['image','inspect']:
 print('id-'+a[2] if '--format' in a else '{}'); sys.exit(0)
cmd=a.pop(0)
if cmd=='inspect':
 name=a[0]
 if name not in d: sys.exit(1)
 c=d[name]
 if '--format' in a or '-f' in a:
  f=a[-1]
  print(c['image'] if f=='{{.Config.Image}}' else 'id-'+c['image'] if f=='{{.Image}}' else '0' if 'Mounts' in f else 'vendorai-prod')
 else: print(json.dumps([{'Config':{'Env':['PORT=5000']}}]))
elif cmd=='create': d[a[a.index('--name')+1]]={'image':a[-1], 'running':False}; save()
elif cmd=='rename': d[a[1]]=d.pop(a[0]); save()
elif cmd=='stop': d[a[0]]['running']=False; save()
elif cmd=='start': d[a[0]]['running']=True; save()
elif cmd=='rm': d.pop(a[-1],None); save()
else: sys.exit(2)
'''
        (self.root / 'bin/docker').write_text(fake)
        (self.root / 'bin/curl').write_text('#!/bin/sh\ntest ! -f "$FIXTURE/unhealthy"\n')
        (self.root / 'bin/sleep').write_text('#!/bin/sh\nexit 0\n')
        for p in (self.root / 'bin').iterdir(): p.chmod(0o755)
        self.back = CURRENT + '-backup-vendi-3580-' + 'a' * 12
        (self.root / 'docker.json').write_text(json.dumps({CURRENT:{'image':OLD,'running':True}, self.back:{'image':'older','running':False}}))
        self.prior = 'LOT=VENDI-3580\nSHA=' + 'a'*40 + '\nIMAGE='+OLD+'\nBACKUP='+self.back+'\nSTATUS=PUBLISHED\n'
        (self.root / 'state/VENDI-3580.prod').write_text(self.prior)
        (self.root / 'manifests/VENDI-3584.env').write_text('SHA='+'b'*40+'\nPREVIOUS_LOT=VENDI-3580\n')
        (self.root / 'state/VENDI-3584').write_text('SHA='+'b'*40+'\nIMAGE='+NEW+'\nSTATUS=BUILT_NOT_DEPLOYED\n')

    def run_release(self, action='publish'):
        return subprocess.run(['bash',str(self.script),action,'VENDI-3584'],env=self.env,capture_output=True,text=True)

    def test_publish_then_rollback_restores_both_records(self):
        result=self.run_release()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('STATUS=SUPERSEDED', (self.root/'state/VENDI-3580.prod').read_text())
        result=self.run_release('rollback')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual((self.root/'state/VENDI-3580.prod').read_text(),self.prior)
        self.assertEqual(json.loads((self.root/'docker.json').read_text())[CURRENT]['image'],OLD)

    def test_unhealthy_publish_restores_container_without_changing_prior(self):
        (self.root/'unhealthy').touch()
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual((self.root/'state/VENDI-3580.prod').read_text(),self.prior)
        self.assertFalse((self.root/'state/VENDI-3584.prod').exists())
        live=json.loads((self.root/'docker.json').read_text())[CURRENT]
        self.assertEqual(live,{'image':OLD,'running':True})

    def test_wrong_predecessor_blocks_before_swap(self):
        (self.root/'manifests/VENDI-3584.env').write_text('SHA='+'b'*40+'\nPREVIOUS_LOT=VENDI-9999\n')
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual(json.loads((self.root/'docker.json').read_text())[CURRENT]['image'],OLD)

    def test_missing_backup_blocks_before_swap(self):
        p=self.root/'docker.json'; d=json.loads(p.read_text()); del d[self.back]; p.write_text(json.dumps(d))
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual((self.root/'state/VENDI-3580.prod').read_text(),self.prior)

    def test_other_unresolved_release_still_blocks(self):
        (self.root/'state/VENDI-999.prod').write_text('STATUS=INCONSISTENT_REQUIRES_RECONCILIATION\n')
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual((self.root/'state/VENDI-3580.prod').read_text(),self.prior)

if __name__=='__main__': unittest.main()
