-- Botão "Projete sua casa" no site do tenant: opcional, desligado por padrão.
ALTER TABLE arqdor_public_links ADD COLUMN IF NOT EXISTS show_on_site boolean NOT NULL DEFAULT false;
ALTER TABLE arqdor_public_links ADD COLUMN IF NOT EXISTS site_button_label text NOT NULL DEFAULT 'Projete sua casa';
ALTER TABLE arqdor_public_links ADD COLUMN IF NOT EXISTS site_button_color text NOT NULL DEFAULT '#f97316';
