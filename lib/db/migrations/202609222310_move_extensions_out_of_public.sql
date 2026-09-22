-- Move relocatable extensions out of public while preserving VendorAI runtime compatibility.
--
-- Existing columns/indexes keep their extension OIDs. The backend role keeps
-- extensions on its search_path for Drizzle-generated SQL and future DDL,
-- while application raw SQL is qualified explicitly in the same change set.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION vector SET SCHEMA extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;

ALTER ROLE vendorai_app
  SET search_path = "$user", public, extensions;

-- Keep migration/admin sessions compatible with unqualified Drizzle vector DDL.
ALTER ROLE postgres
  SET search_path = "$user", public, extensions;

COMMIT;
