#!/usr/bin/env node
/** INF-09: read-only static runner preflight; not a live runner health check. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function inspectWorkflows(dir) {
  const findings = [];
  const files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort();
  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines.slice(i+1).find(s => s.trim() && !/^\s*#/.test(s)) ?? '';\n      if (/^\s*runs-on\s*:\s*$/.test(line) && !/^\s+(?:-\s*\S+|[A-Za-z_-]+\s*:\s*\S+)/.test(next)) {
        findings.push({ file, line:i+1, code:'EMPTY_RUNNER_SELECTOR', severity:'error' });
      }
      if (/^\s*runs-on\s*:\s*\$\{\{/.test(line)) findings.push({ file, line:i+1, code:'DYNAMIC_RUNNER_SELECTOR', severity:'info' });
      if (/^\s*runs-on\s*:\s*(?:\[\s*\]|null|''|"")\s*(?:#.*)?$/.test(line)) findings.push({ file, line:i+1, code:'EMPTY_RUNNER_SELECTOR', severity:'error' });
      if (/^\s*runs-on\s*:\s*\[.*self-hosted.*\]/.test(line) || /^\s*runs-on\s*:\s*self-hosted(?:\s|$)/.test(line)) findings.push({ file, line:i+1, code:'SELF_HOSTED_REQUIRES_LIVE_CHECK', severity:'warning' });
    }
  }
  return { inspected:files.length, findings, limitations:'Static hints only; runner online status, labels, queue, permissions, and outcomes require authenticated GitHub checks.' };
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result=inspectWorkflows(process.argv[2] ?? '.github/workflows');
    console.log(JSON.stringify(result,null,2));
    if (result.findings.some(f=>f.severity==='error')) process.exitCode=1;
  } catch(error) {
    console.error(JSON.stringify({code:'PREFLIGHT_FAILED',detail:error.code||error.name}));
    process.exitCode=2;
  }
}
