-- Tenant-owned sidebar visibility preferences.
-- This is intentionally separate from tenant_nav_modules:
-- hiding a menu item must not revoke entitlement, route access or module data.

CREATE TABLE IF NOT EXISTS tenant_sidebar_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_sidebar_preferences_tenant_item_uidx
  ON tenant_sidebar_preferences (tenant_id, item_key);
