-- Ao concluir o fechamento comercial, o processo deixa a régua comercial e
-- passa para Pipeline > Execução / Pedidos, começando em Contrato.
--
-- Importante:
-- - não faz backfill de negócios históricos;
-- - não move para trás cards operacionais que já estejam em etapas posteriores;
-- - evita duplicar o card-pai do pedido quando ele já existe.

CREATE OR REPLACE FUNCTION ensure_execution_order_card_on_deal_won()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.etapa = 'ganho' AND OLD.etapa IS DISTINCT FROM 'ganho' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM work_cards
      WHERE tenant_id = NEW.tenant_id
        AND deal_id = NEW.id
        AND pipeline = 'execucao'
        AND tipo = 'pedido'
    ) THEN
      INSERT INTO work_cards (
        id,
        tenant_id,
        codigo,
        pipeline,
        tipo,
        etapa,
        titulo,
        descricao,
        prioridade,
        lead_id,
        deal_id,
        responsavel_id,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        md5(clock_timestamp()::text || random()::text || NEW.id || ':execution-order'),
        NEW.tenant_id,
        'PED-' || upper(substr(md5(clock_timestamp()::text || random()::text || NEW.id), 1, 8)),
        'execucao',
        'pedido',
        'contrato',
        'Pedido • ' || NEW.titulo,
        'Venda concluída no comercial. Formalizar contrato para seguir com o pedido.',
        'normal',
        NEW.lead_id,
        NEW.id,
        NEW.assigned_to,
        jsonb_build_object('origem', 'fechamento_comercial'),
        now(),
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_won_execution_card ON deals;

CREATE TRIGGER trg_deal_won_execution_card
AFTER UPDATE OF etapa ON deals
FOR EACH ROW
EXECUTE FUNCTION ensure_execution_order_card_on_deal_won();
