-- Recupera cards comerciais antigos criados sem lead vinculado.
-- IDs determinísticos tornam a operação idempotente e auditável.
insert into public.leads (
  id, tenant_id, nome, empresa, status, source, tipo, tipo_pessoa,
  metadata, created_at, updated_at
)
select
  'recovered-deal-' || d.id,
  d.tenant_id,
  coalesce(nullif(btrim(d.titulo), ''), 'Negócio recuperado ' || left(d.id, 8)),
  nullif(btrim(d.titulo), ''),
  'novo',
  'pipeline_recovery',
  'cliente',
  'juridica',
  jsonb_build_object(
    'recovered_from_deal_id', d.id,
    'recovered_at', now(),
    'reason', 'deal_without_lead'
  ),
  coalesce(d.created_at, now()),
  now()
from public.deals d
where d.lead_id is null
on conflict (id) do nothing;

update public.deals d
set lead_id = 'recovered-deal-' || d.id,
    updated_at = now()
where d.lead_id is null
  and exists (
    select 1 from public.leads l
    where l.id = 'recovered-deal-' || d.id
      and l.tenant_id = d.tenant_id
  );