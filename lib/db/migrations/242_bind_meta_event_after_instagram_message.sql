CREATE OR REPLACE FUNCTION recycle_stale_native_meta_event()
RETURNS TRIGGER AS $$
DECLARE
  existing RECORD;
BEGIN
  SELECT id, lead_id, created_at
    INTO existing
    FROM meta_engagement_events
   WHERE tenant_id = NEW.tenant_id
     AND external_event_id = NEW.external_event_id
   LIMIT 1;

  IF existing.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Evento já chegou ao CRM: mantém a linha para que o UNIQUE faça o novo
  -- INSERT cair em ON CONFLICT DO NOTHING, preservando idempotência definitiva.
  IF existing.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Evento ainda sem vínculo pode estar em processamento. Uma janela curta
  -- evita duas execuções simultâneas; depois dela, tratamos como tentativa
  -- incompleta e liberamos a Meta para reprocessar o mesmo provider event ID.
  IF existing.created_at >= NOW() - INTERVAL '15 seconds' THEN
    RETURN NEW;
  END IF;

  DELETE FROM meta_engagement_events
   WHERE id = existing.id
     AND lead_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recycle_stale_native_meta_event ON meta_engagement_events;
CREATE TRIGGER trg_recycle_stale_native_meta_event
BEFORE INSERT ON meta_engagement_events
FOR EACH ROW
EXECUTE FUNCTION recycle_stale_native_meta_event();

CREATE OR REPLACE FUNCTION bind_native_meta_event_after_instagram_message()
RETURNS TRIGGER AS $$
DECLARE
  scoped_id TEXT;
BEGIN
  IF NEW.canal <> 'instagram' OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT instagram_scoped_id
    INTO scoped_id
    FROM leads
   WHERE id = NEW.lead_id
     AND tenant_id = NEW.tenant_id
   LIMIT 1;

  IF scoped_id IS NULL OR scoped_id = '' THEN
    RETURN NEW;
  END IF;

  UPDATE meta_engagement_events e
     SET lead_id = NEW.lead_id,
         metadata = e.metadata || jsonb_build_object(
           'processed', true,
           'processedAt', NOW(),
           'messageId', NEW.id
         )
   WHERE e.id = (
     SELECT candidate.id
       FROM meta_engagement_events candidate
      WHERE candidate.tenant_id = NEW.tenant_id
        AND candidate.instagram_scoped_id = scoped_id
        AND candidate.lead_id IS NULL
        AND candidate.created_at >= NOW() - INTERVAL '10 minutes'
        AND (
          candidate.text_content IS NULL
          OR candidate.text_content = ''
          OR NEW.conteudo = candidate.text_content
          OR NEW.conteudo LIKE '%' || candidate.text_content || '%'
        )
      ORDER BY candidate.created_at DESC
      LIMIT 1
   );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bind_native_meta_event_after_instagram_message ON messages;
CREATE TRIGGER trg_bind_native_meta_event_after_instagram_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION bind_native_meta_event_after_instagram_message();
