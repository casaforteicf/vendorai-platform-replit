ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS market_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS public_headline text;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS public_subheadline text;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS public_logo_url text;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS public_primary_color text;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS embed_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE arqdor_public_links
  ADD COLUMN IF NOT EXISTS market_button_label text NOT NULL DEFAULT 'Ver produtos e soluções';
