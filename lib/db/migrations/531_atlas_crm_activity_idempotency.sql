-- Evita vincular a mesma tarefa Atlas mais de uma vez no mesmo tenant.
-- Origem-template inclui nicho, tarefa e lead; a chave é estável.
CREATE UNIQUE INDEX IF NOT EXISTS activities_atlas_origin_unique
ON activities (tenant_id, origem_template_key)
WHERE origem = 'atlas' AND origem_template_key IS NOT NULL;
