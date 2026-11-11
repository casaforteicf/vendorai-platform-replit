import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('wave01_gate', Path(__file__).with_name('remote-test-gate.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

def manifest(suite='api'):
    return 'pr=3463\nbranch=feat/wave01\nsha=' + 'a' * 40 + '\nsuite=' + suite + '\nstarted=2026-10-11T00:00:00Z\nfinished=2026-10-11T00:01:00Z\n'

def results():
    return ''.join(name + ' exit=0\n' for name in ['install', 'api-launch-ts', 'api-ts', 'api-vitest', 'api-build'])

class EvidenceTests(unittest.TestCase):
    def test_complete_api_is_technical_only(self):
        summary = gate.summarize_gates(manifest(), results())
        self.assertTrue(summary['technicalPassed'])
        self.assertFalse(summary['homologated'])
        self.assertFalse(summary['published'])
        self.assertEqual(summary['sha'], 'a' * 40)

    def test_targeted_crm_cannot_approve_full_build(self):
        summary = gate.summarize_gates(manifest('crm'), 'install exit=0\ncrm-vitest exit=0\n')
        self.assertEqual(summary['status'], 'targeted_passed')
        self.assertFalse(summary['technicalPassed'])

    def test_old_api_without_launch_gate_is_incomplete(self):
        summary = gate.summarize_gates(manifest(), results().replace('api-launch-ts exit=0\n', ''))
        self.assertEqual(summary['missing'], ['api-launch-ts'])
        self.assertFalse(summary['technicalPassed'])

    def test_build_failure_not_masked(self):
        summary = gate.summarize_gates(manifest(), results().replace('api-build exit=0', 'api-build exit=2'))
        self.assertEqual(summary['status'], 'failed')
        self.assertEqual(summary['failed'], ['api-build'])

    def test_missing_finished_is_not_success(self):
        summary = gate.summarize_gates(manifest().replace('finished=2026-10-11T00:01:00Z\n', ''), results())
        self.assertEqual(summary['status'], 'invalid_evidence')

    def test_duplicate_failure_cannot_be_overwritten(self):
        summary = gate.summarize_gates(manifest(), results() + 'api-build exit=2\n')
        self.assertEqual(summary['status'], 'invalid_evidence')

    def test_sha_and_manifest_duplicates_rejected(self):
        for value in [manifest().replace('a' * 40, 'main'), manifest() + 'suite=crm\n']:
            self.assertFalse(gate.summarize_gates(value, results())['technicalPassed'])

    def test_unknown_suite_rejected(self):
        self.assertFalse(gate.summarize_gates(manifest('deploy'), results())['technicalPassed'])

    def test_malformed_or_impossible_exit_rejected(self):
        for line in ['api-build exit=abc\n', 'api-build exit=-1\n', 'api-build exit=999\n']:
            summary = gate.summarize_gates(manifest(), results().replace('api-build exit=0\n', line))
            self.assertEqual(summary['status'], 'invalid_evidence')

    def test_full_requires_frontend(self):
        summary = gate.summarize_gates(manifest('full'), results())
        self.assertEqual(summary['missing'], ['frontend-ts', 'frontend-build'])
        self.assertFalse(summary['technicalPassed'])

    def test_mcp_requires_contract_and_types(self):
        summary = gate.summarize_gates(manifest('mcp'), 'install exit=0\nmcp-ts exit=0\n')
        self.assertEqual(summary['missing'], ['mcp-contract'])

    def test_invalid_dates_and_time_order_rejected(self):
        for value in [manifest().replace('2026-10-11T00:01:00Z', '2026-99-11T00:01:00Z'), manifest().replace('2026-10-11T00:01:00Z', '2026-10-10T00:01:00Z')]:
            self.assertFalse(gate.summarize_gates(value, results())['technicalPassed'])

if __name__ == '__main__':
    unittest.main()
