#!/usr/bin/env node
/**
 * INF-15/INF-29: read-only release-contract audit.
 * Never deploys, merges, reads secrets or changes remote resources.
 * Usage: node scripts/infra-release-contract-audit.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const paths = [
  '.github/workflows/merge-release-agent.yml',
  '.github/workflows/cloudflare-pages.yml',
  '.github/workflows/cloudflare-api-container.yml',
];
const findings = [];
for (const path of paths) {
  let body;
  try { body = readFileSync(resolve(root, path), 'utf8'); }
  catch (error) {
    findings.push({severity:'error',path,code:'MISSING_WORKFLOW',detail:String(error.code || 'read failed')});
    continue;
  }
  if (/vendorai-platform-replit-production\.up\.railway\.app/.test(body)) {
    findings.push({severity:'warning',path,code:'LEGACY_RAILWAY_HEALTH',detail:'Workflow references historical Railway API endpoint; verify canonical Contabo health endpoint before changing.'});
  }
  if (/railway_redeploy|RAILWAY_TOKEN|railway_fallback/.test(body)) {
    findings.push({severity:'warning',path,code:'LEGACY_RAILWAY_FAILOVER',detail:'Historical Railway failover remains; check current release architecture.'});
  }
  const triggers = body.split(/\n(?=permissions:|concurrency:|env:|jobs:)/)[0];
  if (/\bpush\s*:/.test(triggers)) {
    findings.push({severity:'error',path,code:'PUSH_DEPLOY_TRIGGER',detail:'Push trigger declared in release workflow; manual release policy requires review.'});
  }
  if (!/workflow_dispatch\s*:/.test(triggers)) {
    findings.push({severity:'warning',path,code:'NO_MANUAL_DISPATCH',detail:'No explicit workflow_dispatch trigger found.'});
  }
}
const result = {
  audit:'INFRA-LOTE-01 release contract',
  timestamp:new Date().toISOString(),
  inspected:paths.length,
  findings,
  summary:{
    errors:findings.filter(x=>x.severity==='error').length,
    warnings:findings.filter(x=>x.severity==='warning').length,
  },
  scope:'static repository audit; no assertion about live Contabo, Cloudflare Git configuration or homologation',
};
console.log(JSON.stringify(result,null,2));
if (result.summary.errors) process.exitCode=1;
