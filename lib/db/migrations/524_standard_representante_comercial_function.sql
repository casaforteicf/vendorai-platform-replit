-- Adds the standard commercial representative function.
-- It behaves like a commercial seller for routing/access, while delegated
-- company representation continues to use tenant_user_functions linkage fields.

ALTER TYPE public.user_function
  ADD VALUE IF NOT EXISTS 'representante_comercial';
