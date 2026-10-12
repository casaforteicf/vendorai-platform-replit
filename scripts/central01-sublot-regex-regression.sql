-- CENTRAL-01 regex regression test, safe in ephemeral PostgreSQL.
-- No production writes and no dependency on application tables.
DO $test$
DECLARE
  valid text[] := ARRAY['LOTE-01.02','06.04','sublote: 12.30','ref/03.09/item'];
  invalid text[] := ARRAY['0102','01x02','100.02','01.002'];
  value text;
  extracted text;
BEGIN
  FOREACH value IN ARRAY valid LOOP
    extracted := (regexp_match(value,'(^|[^0-9])([0-9]{2}[.][0-9]{2})($|[^0-9])'))[2];
    IF extracted IS NULL THEN RAISE EXCEPTION 'Expected sublot not found: %',value; END IF;
  END LOOP;
  FOREACH value IN ARRAY invalid LOOP
    extracted := (regexp_match(value,'(^|[^0-9])([0-9]{2}[.][0-9]{2})($|[^0-9])'))[2];
    IF extracted IS NOT NULL THEN RAISE EXCEPTION 'Invalid source ref accepted: % -> %',value,extracted; END IF;
  END LOOP;
  RAISE NOTICE 'CENTRAL01_SUBLOT_REGEX_OK';
END
$test$;
