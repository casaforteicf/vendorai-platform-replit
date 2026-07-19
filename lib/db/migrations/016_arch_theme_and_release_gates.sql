-- Sprint 035/036 — Scout bot detection + Theme System + Release Gates
ALTER TABLE scout_oportunidades ADD COLUMN IF NOT EXISTS sinais_bot INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS arch_theme_preferences (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NULL,
  user_id                   UUID        NULL,
  mode                      TEXT        NOT NULL DEFAULT 'light',
  accent                    TEXT        NOT NULL DEFAULT 'violet',
  use_dark_render_workspace BOOLEAN     NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS arch_release_gates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NULL,
  gate_id    TEXT        NOT NULL UNIQUE,
  status     TEXT        NOT NULL DEFAULT 'pending',
  evidence   TEXT        NULL,
  owner      TEXT        NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arch_theme_prefs_tenant  ON arch_theme_preferences (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_theme_prefs_user    ON arch_theme_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_arch_release_gates_tenant ON arch_release_gates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_release_gates_status ON arch_release_gates (status);
