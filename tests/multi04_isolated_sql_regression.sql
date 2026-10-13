-- MULTI-04.6 isolated regression harness, run ONLY against a disposable PostgreSQL DB.
-- Uses temporary tables to avoid touching arch_concept_projects or any tenant records.
BEGIN;
CREATE TEMP TABLE multi04_project (
 id text PRIMARY KEY, revision integer NOT NULL, rooms jsonb NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE multi04_audit (
 operation_id text PRIMARY KEY, fingerprint text NOT NULL,
 previous_rooms jsonb NOT NULL, base_revision integer NOT NULL
) ON COMMIT DROP;
INSERT INTO multi04_project VALUES ('sandbox-project',1,'[{"id":"room-old"}]');
DO $$
DECLARE original jsonb; changed int; stored text;
BEGIN
 SELECT rooms INTO original FROM multi04_project WHERE id='sandbox-project' FOR UPDATE;
 INSERT INTO multi04_audit VALUES ('op1','fingerprint-A',original,1);
 UPDATE multi04_project SET rooms='[{"id":"room-new"}]',revision=2
 WHERE id='sandbox-project' AND revision=1;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Initial CAS must update exactly one row'; END IF;
 UPDATE multi04_project SET rooms='[{"id":"stale"}]',revision=3
 WHERE id='sandbox-project' AND revision=1;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Stale revision unexpectedly modified the project'; END IF;
 SELECT fingerprint INTO stored FROM multi04_audit WHERE operation_id='op1';
 IF stored <> 'fingerprint-A' THEN RAISE EXCEPTION 'Audit fingerprint lost'; END IF;
 IF stored = 'fingerprint-B' THEN RAISE EXCEPTION 'A reused key with changed payload was accepted'; END IF;
 IF (SELECT rooms FROM multi04_project WHERE id='sandbox-project') <>
   '[{"id":"room-new"}]'::jsonb THEN RAISE EXCEPTION 'Project content changed unexpectedly'; END IF;
 IF (SELECT previous_rooms FROM multi04_audit WHERE operation_id='op1') <>
   '[{"id":"room-old"}]'::jsonb THEN RAISE EXCEPTION 'Preimage snapshot was not preserved'; END IF;
END $$;
ROLLBACK;
-- This harness does NOT exercise the actual Drizzle transaction, row-lock contention
-- across two DB connections, role isolation, HTTP endpoint or real migration.
