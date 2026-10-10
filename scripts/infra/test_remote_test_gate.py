import unittest
import importlib.util
from pathlib import Path
from unittest.mock import patch
p=Path(__file__).with_name("remote-test-gate.py")
spec=importlib.util.spec_from_file_location("remote_test_gate",p)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class GateTests(unittest.TestCase):
 def test_exact_sha_required(self):
  with self.assertRaisesRegex(ValueError,"INVALID_SHA"):
   mod.validated(3428,"feat/crm","main","crm")
 def test_branch_injection_blocked(self):
  with self.assertRaisesRegex(ValueError,"INVALID_BRANCH"):
   mod.validated(3428,"feat/x;rm -rf /","a"*40,"crm")
 def test_suite_allowlist(self):
  with self.assertRaisesRegex(ValueError,"INVALID_SUITE"):
   mod.validated(3428,"feat/crm","a"*40,"deploy")
 def test_boolean_pr_rejected(self):
  with self.assertRaisesRegex(ValueError,"INVALID_PR"):
   mod.validated(True,"feat/crm","a"*40,"crm")
 def test_no_root(self):
  with patch.object(mod.os,"geteuid",return_value=0):
   with self.assertRaisesRegex(ValueError,"MUST_RUN_UNPRIVILEGED"):
    mod.run(3428,"feat/crm","a"*40,"crm")
 def test_untrusted_result_name(self):
  with self.assertRaisesRegex(ValueError,"INVALID_RUN"):
   mod.status("../../etc/passwd")
 def test_no_shell_execution(self):
  s=p.read_text()
  self.assertIn('subprocess.Popen(["bash", str(EXE), *args]',s)
  self.assertNotIn('shell=True',s)
  self.assertIn('MIN_FREE = 8 * 1024**3',s)
  self.assertIn('fcntl.LOCK_NB',s)
  self.assertIn('"VENDORAI_PREPARE_OFFLINE": "0"',s)


 def test_timeout_kills_process_group(self):
  s=p.read_text()
  self.assertIn('start_new_session=True',s)
  self.assertIn('os.killpg(proc.pid, signal.SIGTERM)',s)
  self.assertIn('os.killpg(proc.pid, signal.SIGKILL)',s)
  self.assertIn('cleanup_test_containers(EVIDENCE / run_name)',s)
 def test_disk_quota_and_no_production_cleanup(self):
  s=p.read_text()
  self.assertIn('MIN_FREE = 8 * 1024**3',s)
  self.assertIn('MAX_EVIDENCE_BYTES = 3 * 1024**3',s)
  self.assertNotIn('docker system prune',s)
  self.assertIn('re.fullmatch(r"[0-9a-f]{64}", cid)',s)

if __name__=="__main__": unittest.main()
