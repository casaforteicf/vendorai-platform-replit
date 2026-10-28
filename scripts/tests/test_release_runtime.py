"""Execute the release Bash state machine with isolated Docker/HTTP/Git doubles.

No real Docker socket, production path or credentials are used. This is failure
simulation, not a claim that the production image or database was homologated.
"""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'vendi04-controlled-release.sh'
CURRENT = 'vendorai-prod-api-candidate'
BASE = 'vendorai-api:main-' + '0' * 9

MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
p=pathlib.Path(os.environ['FIXTURE_STATE'])
s=json.loads(p.read_text()); a=sys.argv[1:]; command=pathlib.Path(sys.argv[0]).name
def save(): p.write_text(json.dumps(s))
def fail(): sys.exit(1)
if command=='sleep': sys.exit(0)
if command=='stat' and a[:2]==['-c','%u']: print(0); sys.exit(0)
if command=='stat': os.execv('/usr/bin/stat',['stat']+a)
if command=='git':
 if 'rev-parse' in a: print('0'*40)
 sys.exit(0)
if command=='curl':
 c=s['containers'].get('vendorai-prod-api-candidate',{})
 sys.exit(0 if c.get('running') and c.get('image') not in s.get('unhealthy',[]) else 1)
if command!='docker': fail()
s['calls'].append(a); save()
if a[:2]==['image','inspect']:
 if a[2] not in s['images']: fail()
 print(s['images'][a[2]]); sys.exit(0)
if a[0]=='inspect':
 c=s['containers'].get(a[1])
 if c is None: fail()
 if len(a)==2: print(json.dumps([{'Config':{'Env':['SYNTHETIC=true']}}])); sys.exit(0)
 fmt=a[-1]
 print({'{{.Config.Image}}':c['image'],'{{.Image}}':s['images'][c['image']], '{{.State.Running}}':str(c['running']).lower(), '{{len .Mounts}}':'0','{{.HostConfig.NetworkMode}}':'vendorai-prod'}.get(fmt,'')); sys.exit(0)
if a[0]=='create':
 name=a[a.index('--name')+1]
 if name in s['containers']: fail()
 s['containers'][name]={'image':a[-1],'running':False}
elif a[0]=='rename':
 if s.get('fail_rename')==a[1]:
  s.pop('fail_rename'); save(); fail()
 if a[1] not in s['containers'] or a[2] in s['containers']: fail()
 s['containers'][a[2]]=s['containers'].pop(a[1])
elif a[0] in ('start','stop'):
 c=s['containers'].get(a[1])
 if c is None: fail()
 if a[0]=='start' and c['image']==s.get('fail_start'):
  s.pop('fail_start'); save(); fail()
 c['running']=a[0]=='start'
elif a[0]=='rm': s['containers'].pop(a[-1],None)
else: fail()
save()
'''


class ReleaseRuntime(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='vendi-release-test-')
        self.root = Path(self.tmp.name)
        for name in ['ledger/manifests', 'ledger/state', 'locks', 'bin', 'repo/.git']:
            (self.root / name).mkdir(parents=True)
        self.shared = self.root / 'deploy.lock'
        config = self.root / 'shared.path'
        config.write_text(str(self.shared)); config.chmod(0o600)
        deploy = self.root / 'deploy.sh'
        deploy.write_text('BASE="/opt/vendorai"\nLOCK="$BASE/deploy.lock"\nexec 9>"$LOCK"\nif ! flock -n 9; then exit 75; fi\n')
        script = SOURCE.read_text()
        # Relocate fixed paths in this test copy only; keep production constants
        # and validation logic unchanged in the shipped source.
        for old, new in [('/var/lib/vendi-release', str(self.root/'ledger')),
                         ('/run/lock/vendi-production-release.lock', str(self.root/'locks/release')),
                         ('/var/log/vendi-contabo-operator.log', str(self.root/'audit')),
                         ('/etc/vendorai/vendi-shared-deploy-lock.path', str(config)),
                         ('/opt/vendorai/deploy-backend.sh', str(deploy)),
                         ('/opt/vendorai/deploy.lock', str(self.shared)),
                         ('^/opt/vendorai/', '^'+str(self.root)+'/'),
                         ('/home/vendorai/vendorai-api-auth-test', str(self.root/'repo')),
                         ('/root/vendi-prod-env.', str(self.root/'env.'))]:
            script = script.replace(old, new)
        self.script = self.root / 'release.sh'; self.script.write_text(script)
        for cmd in ['docker', 'curl', 'git', 'sleep', 'stat']:
            target=self.root/'bin'/cmd; target.write_text(MOCK); target.chmod(0o755)
        self.state = self.root / 'fixture.json'
        self.write({'images':{BASE:'sha256:base'},'containers':{CURRENT:{'image':BASE,'running':True}},'calls':[]})
        self.env = {**os.environ,'PATH':str(self.root/'bin')+':'+os.environ['PATH'],'FIXTURE_STATE':str(self.state)}

    def tearDown(self): self.tmp.cleanup()
    def read(self): return json.loads(self.state.read_text())
    def write(self, state): self.state.write_text(json.dumps(state))
    def receipt(self, lot): return self.root/'ledger/state'/f'{lot}.prod'
    def prepare(self, number):
        lot=f'VENDI-{number}'; sha=str(number)*40
        image=f'vendorai-release:{lot.lower()}-{sha[:12]}'
        s=self.read(); s['images'][image]='sha256:'+sha; self.write(s)
        (self.root/'ledger/manifests'/f'{lot}.env').write_text(f'SHA={sha}\n')
        (self.root/'ledger/state'/lot).write_text(f'SHA={sha}\nIMAGE={image}\nIMAGE_ID=sha256:{sha}\nSTATUS=BUILT_NOT_DEPLOYED\n')
        tests=self.root/'ledger/state'/f'{lot}.tests'
        tests.write_text(f'LOT={lot}\nSHA={sha}\nIMAGE_ID=sha256:{sha}\nAT_EPOCH={int(time.time())}\nSTATUS=PASSED\nSUITE=api,mcp,operator,rollback,migrations\n'); tests.chmod(0o600)
        return lot,image
    def run_release(self, action, lot, expected=0):
        result=subprocess.run(['bash',str(self.script),action,lot],env=self.env,text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,expected,result.stdout+'\n'+result.stderr)
        return result.stdout

    def test_two_publishes_then_two_rollbacks_preserve_chain(self):
        a,ia=self.prepare(1); b,ib=self.prepare(2)
        self.run_release('publish',a); self.run_release('publish',b)
        self.assertIn('STATUS=SUPERSEDED',self.receipt(a).read_text())
        self.assertIn('PREVIOUS_LOT='+a,self.receipt(b).read_text())
        self.run_release('rollback',b)
        self.assertIn('STATUS=PUBLISHED',self.receipt(a).read_text())
        self.assertEqual(self.read()['containers'][CURRENT]['image'],ia)
        self.run_release('rollback',a)
        self.assertEqual(self.read()['containers'][CURRENT]['image'],BASE)

    def test_failed_publish_restores_live_predecessor_and_receipt(self):
        a,ia=self.prepare(1); b,ib=self.prepare(2)
        self.run_release('publish',a)
        s=self.read(); s['unhealthy']=[ib]; self.write(s)
        self.run_release('publish',b,1)
        self.assertEqual(self.read()['containers'][CURRENT]['image'],ia)
        self.assertIn('STATUS=PUBLISHED',self.receipt(a).read_text())
        self.assertFalse(self.receipt(b).exists())

    def test_failed_rollback_health_recovers_current_release(self):
        a,ia=self.prepare(1); self.run_release('publish',a)
        s=self.read(); s['unhealthy']=[BASE]; self.write(s)
        self.assertIn('ORIGINAL_RESTORED',self.run_release('rollback',a,1))
        self.assertEqual(self.read()['containers'][CURRENT]['image'],ia)
        self.assertIn('STATUS=PUBLISHED',self.receipt(a).read_text())

    def test_failed_rename_after_stop_restarts_original(self):
        a,ia=self.prepare(1)
        s=self.read(); s['fail_rename']=CURRENT; self.write(s)
        self.run_release('publish',a,1)
        self.assertTrue(self.read()['containers'][CURRENT]['running'])
        self.assertEqual(self.read()['containers'][CURRENT]['image'],BASE)

    def test_shared_lock_blocks_before_live_decisions(self):
        a,_=self.prepare(1)
        with self.shared.open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.assertIn('AUTOMATIC_DEPLOY_IN_PROGRESS',self.run_release('publish',a,75))
        self.assertEqual(self.read()['calls'],[])

    def test_wrong_sha_and_digest_never_stop_production(self):
        a,_=self.prepare(1)
        proof=self.root/'ledger/state'/f'{a}.tests'
        proof.write_text(proof.read_text().replace('IMAGE_ID=sha256:', 'IMAGE_ID=sha256:wrong'))
        self.run_release('publish',a,65)
        self.assertFalse(any(c[0] in ['stop','create'] for c in self.read()['calls']))

    def test_expired_tests_block_direct_publish_without_homologation(self):
        a,_=self.prepare(1)
        proof=self.root/'ledger/state'/f'{a}.tests'
        import re
        proof.write_text(re.sub(r'AT_EPOCH=\d+', 'AT_EPOCH=1000000000', proof.read_text()))
        self.assertIn('TECHNICAL_TEST_RECEIPT_EXPIRED',self.run_release('publish',a,65))
        self.assertFalse(any(c[0] in ['stop','create'] for c in self.read()['calls']))

    def test_non_api_target_never_swaps_api(self):
        a,_=self.prepare(1)
        with (self.root/'ledger/manifests'/f'{a}.env').open('a') as f: f.write('TARGET=mcp\n')
        self.assertIn('TARGET_REQUIRES_DEDICATED_DEPLOYMENT_HANDLER',self.run_release('publish',a,65))
        self.assertEqual(self.read()['calls'],[])

if __name__ == '__main__': unittest.main(verbosity=2)
