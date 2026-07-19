-- propostas payment columns + tenant proposal_style_memory + business_profiles columns
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS forma_pagamento_mensalidade TEXT;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cond_pagamento_mensalidade TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS proposal_style_memory JSONB;

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS proposal_template_url TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS proposal_template_name TEXT;
