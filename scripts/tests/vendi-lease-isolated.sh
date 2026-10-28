#!/usr/bin/env bash
# Synthetic PostgreSQL migration/restore test; no host ports or persistent volume.
set -Eeuo pipefail
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SQL="$ROOT/lib/db/migrations/202610272240_vendi_mission_leases.sql"
test -f "$SQL"
NAME="vendi-3657-lease-test-$$"
IMAGE=pgvector/pgvector:pg17
docker image inspect "$IMAGE" >/dev/null
owned=0
cleanup(){ if [[ "$owned" == 1 ]]; then docker rm -f "$NAME" >/dev/null; fi; }
trap cleanup EXIT
docker create --name "$NAME" --network none --memory=256m --memory-swap=256m --cpus=.5 --pids-limit=96 \
 --tmpfs /var/lib/postgresql/data:rw,size=128m \
 -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" postgres -c shared_buffers=16MB -c max_connections=10 >/dev/null
owned=1
docker start "$NAME" >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
psql_test(){ docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"; }
psql_test <<'SQL'
CREATE ROLE vendorai_app;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE tenants(id text PRIMARY KEY);
CREATE TABLE vendi_missions(id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES tenants(id));
INSERT INTO tenants VALUES ('synthetic');
INSERT INTO vendi_missions VALUES ('mission','synthetic');
SQL
psql_test < "$SQL"
psql_test < "$SQL"
psql_test <<'SQL'
DO $$ BEGIN
 IF has_table_privilege('anon','vendi_mission_leases','SELECT') OR has_table_privilege('authenticated','vendi_mission_leases','INSERT') THEN RAISE EXCEPTION 'PUBLIC_ACCESS'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='vendi_mission_leases'::regclass) THEN RAISE EXCEPTION 'RLS_DISABLED'; END IF;
END $$;
SET ROLE vendorai_app;
INSERT INTO vendi_mission_leases(mission_id,tenant_id,lease_token,lease_until) VALUES ('mission','synthetic','first',now()+interval '4 hours');
DO $$ DECLARE n integer; BEGIN
 INSERT INTO vendi_mission_leases(mission_id,tenant_id,lease_token,lease_until) VALUES ('mission','synthetic','second',now()+interval '4 hours')
 ON CONFLICT(mission_id) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until WHERE vendi_mission_leases.lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'DOUBLE_ACQUIRE'; END IF;
 DELETE FROM vendi_mission_leases WHERE mission_id='mission' AND lease_token='wrong';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'WRONG_OWNER_DELETE'; END IF;
 UPDATE vendi_mission_leases SET lease_until=now()-interval '1 second';
 INSERT INTO vendi_mission_leases(mission_id,tenant_id,lease_token,lease_until) VALUES ('mission','synthetic','second',now()+interval '4 hours')
 ON CONFLICT(mission_id) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until WHERE vendi_mission_leases.lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'EXPIRED_LEASE_NOT_ACQUIRED'; END IF;
END $$;
RESET ROLE;
SQL
# Restore only this synthetic DB into another DB in the same disposable container.
docker exec "$NAME" createdb -U postgres restored
docker exec "$NAME" pg_dump -U postgres -Fc postgres | docker exec -i "$NAME" pg_restore -U postgres -d restored --exit-on-error
psql_test -d restored <<'SQL'
SET ROLE vendorai_app;
DO $$ BEGIN IF (SELECT count(*) FROM vendi_mission_leases WHERE lease_token='second')<>1 THEN RAISE EXCEPTION 'RESTORE_MISMATCH'; END IF; END $$;
RESET ROLE;
DELETE FROM vendi_missions WHERE id='mission';
DO $$ BEGIN IF EXISTS(SELECT FROM vendi_mission_leases) THEN RAISE EXCEPTION 'CASCADE_FAILED'; END IF; END $$;
SQL
echo LEASE_MIGRATION_RUNTIME_RLS_IDEMPOTENCE_RESTORE_PASSED
