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
