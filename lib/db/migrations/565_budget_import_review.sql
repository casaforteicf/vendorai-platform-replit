-- Separate immutable extracted input from human-reviewed budget data.
ALTER TABLE public.budget_imports
  ADD COLUMN IF NOT EXISTS review_json jsonb,
  ADD COLUMN IF NOT EXISTS review_note text;
