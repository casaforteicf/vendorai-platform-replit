-- AGENT-01 homologation: read-only verification after migration, build and
-- ACTIVE_MANAGER_CYCLES_ENABLED=true are applied by the controlled release.
-- Run this at least twice, >=15 minutes apart, before accepting the lote.
SELECT to_regclass('public.agent_manager_runs') AS runs_table,
       to_regclass('public.jarvis_cases') AS jarvis_cases_table;
SELECT domain, tenant_id, count(*) AS completed_cycles,
       min(checked_at) AS first_run, max(checked_at) AS last_run,
       sum(finding_count) AS findings
FROM public.agent_manager_runs
WHERE checked_at > now() - interval '2 hours'
GROUP BY domain, tenant_id
ORDER BY last_run DESC;
SELECT tenant_id, signal_key, status, first_detected_at,
       last_detected_at, result_summary
FROM public.jarvis_cases
WHERE source = 'active_manager'
ORDER BY last_detected_at DESC
LIMIT 30;
-- Confirm no platform change was dispatched by the manager itself:
SELECT source_ref_id, status, owner_agent, agent_status, approved_homolog_at,
       approved_production_at
FROM public.admin_improvements
WHERE source_ref_id LIKE 'manager:%'
ORDER BY created_at DESC LIMIT 30;
