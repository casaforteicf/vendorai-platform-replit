-- CENTRAL-01: read-only permissions diagnostic; execute with the SAME DB role as the API.
-- Never print connection strings, tokens or passwords.
SELECT current_user AS runtime_role, session_user AS session_role,
       current_database() AS database_name,
       has_schema_privilege(current_user,'public','USAGE') AS schema_usage;
WITH required(table_name, privilege) AS (
  VALUES ('admin_release_execution_control','SELECT'),
         ('admin_release_execution_control','UPDATE'),
         ('admin_improvement_dependencies','SELECT'),
         ('admin_improvement_dependencies','INSERT'),
         ('admin_improvement_dependencies','DELETE')
)
SELECT table_name, privilege,
       to_regclass('public.' || table_name) IS NOT NULL AS table_exists,
       CASE WHEN to_regclass('public.' || table_name) IS NULL THEN FALSE
            ELSE has_table_privilege(current_user, 'public.' || table_name, privilege) END AS permitted
FROM required ORDER BY table_name, privilege;
-- This diagnostic does not change privileges. Grant only after identifying
-- the exact runtime role (and verifying its environment is homologation).
