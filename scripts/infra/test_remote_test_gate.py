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
    mod.run(3428,"feat/crm","a"*40,"crm","LOT-02")
 def test_untrusted_result_name(self):
  with self.assertRaisesRegex(ValueError,"INVALID_RUN"):
   mod.status("../../etc/passwd","LOT-02")
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
  self.assertIn('time.monotonic() - started >= 1800',s)
 def test_disk_quota_and_no_production_cleanup(self):
  s=p.read_text()
  self.assertIn('MIN_FREE = 8 * 1024**3',s)
  self.assertIn('MAX_EVIDENCE_BYTES = 3 * 1024**3',s)
  self.assertIn('MAX_TOTAL_BYTES = 6 * 1024**3',s)
  self.assertIn('evidence_bytes(EVIDENCE)',s)
  self.assertIn('elif evidence_bytes(EVIDENCE) >= MAX_TOTAL_BYTES:',s)
  self.assertNotIn('docker system prune',s)
  self.assertIn('re.fullmatch(r"[0-9a-f]{64}", cid)',s)

 def test_result_bound_to_lot(self):
  s=p.read_text()
  self.assertIn('authorized-lot.txt',s)
  self.assertIn('RUN_NOT_AUTHORIZED',s)
  self.assertIn('def status(run, lot):',s)
 def test_invalid_lot(self):
  with self.assertRaisesRegex(ValueError,"INVALID_LOT"):
   mod.run(3428,"feat/crm","a"*40,"crm","LOT-99")

 def test_lot_result_authorization_real_fixture(self):
  import tempfile
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp)
   runid="pr-3428-abcdefgh"
   folder=base/runid
   folder.mkdir()
   (folder/"authorized-lot.txt").write_text("LOT-02\n")
   (folder/"manifest.txt").write_text("sha="+"a"*40+"\n")
   (folder/"results.txt").write_text("crm-vitest exit=0\n")
   with patch.object(mod,"EVIDENCE",base):
    self.assertIn("manifest.txt",mod.status(runid,"LOT-02"))
    with self.assertRaisesRegex(ValueError,"RUN_NOT_AUTHORIZED"):
     mod.status(runid,"LOT-03")
 def test_symlinked_log_directory_not_traversed(self):
  import tempfile
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   evidence=root/"evidence"
   folder=evidence/"pr-3428-abcdefgh"
   folder.mkdir(parents=True)
   (folder/"authorized-lot.txt").write_text("LOT-02\n")
   external=root/"private"
   external.mkdir()
   (external/"secret.log").write_text("private data")
   (folder/"logs").symlink_to(external, target_is_directory=True)
   with patch.object(mod,"EVIDENCE",evidence):
    self.assertEqual(mod.status("pr-3428-abcdefgh","LOT-02")["logs"],[])

 def test_quota_counts_store_and_work(self):
  import tempfile
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp)
   (d/"store").mkdir()
   (d/"work").mkdir()
   (d/"store"/"package.bin").write_bytes(b"x"*1024)
   (d/"work"/"src.txt").write_text("abc")
   self.assertEqual(mod.evidence_bytes(d),1027)

if __name__=="__main__": unittest.main()
