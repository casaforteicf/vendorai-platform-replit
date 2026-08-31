-- Leads excluídos logicamente não devem permanecer elegíveis para pipeline/dashboard.
-- Preserva histórico e usa o marcador interno já reconhecido pelos filtros comerciais existentes.

create or replace function public.sync_deleted_lead_commercial_exclusion()
returns trigger
language plpgsql
as $$
begin
  if new.excluido_em is not null and old.excluido_em is null then
    new.pipeline_exempt := true;
    if new.nao_lead_tipo is null then
      new.nao_lead_tipo := 'outro';
      new.nao_lead_notas := '__SYSTEM_SOFT_DELETED__';
      new.nao_lead_classificado_em := coalesce(new.excluido_em, now());
    end if;
  elsif new.excluido_em is null and old.excluido_em is not null then
    if old.nao_lead_tipo = 'outro' and old.nao_lead_notas = '__SYSTEM_SOFT_DELETED__' then
      new.nao_lead_tipo := null;
      new.nao_lead_notas := null;
      new.nao_lead_classificado_em := null;
      new.pipeline_exempt := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_deleted_lead_commercial_exclusion on public.leads;
create trigger trg_sync_deleted_lead_commercial_exclusion
before update of excluido_em on public.leads
for each row
execute function public.sync_deleted_lead_commercial_exclusion();

update public.leads
set pipeline_exempt = true,
    nao_lead_tipo = case when nao_lead_tipo is null then 'outro' else nao_lead_tipo end,
    nao_lead_notas = case when nao_lead_tipo is null then '__SYSTEM_SOFT_DELETED__' else nao_lead_notas end,
    nao_lead_classificado_em = case when nao_lead_tipo is null then coalesce(excluido_em, now()) else nao_lead_classificado_em end
where excluido_em is not null;
