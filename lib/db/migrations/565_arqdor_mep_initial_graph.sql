-- Arqdor MEP-01 — additive tables only; never run without isolated homologation.
CREATE TABLE IF NOT EXISTS arqdor_mep_systems (
  id text NOT NULL,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  discipline text NOT NULL CHECK (discipline IN ('electrical','cold_water','hot_water','sanitary')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, id),
  CONSTRAINT arqdor_mep_system_project_fk FOREIGN KEY (project_id, tenant_id)
    REFERENCES arqdor_workspace_projects(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arqdor_mep_system_discipline_idx ON arqdor_mep_systems(tenant_id,project_id,discipline);
CREATE TABLE IF NOT EXISTS arqdor_mep_networks (
  id text NOT NULL,
  tenant_id text NOT NULL,
  project_id text NOT NULL,
  system_id text NOT NULL,
  name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id,project_id,id),
  CONSTRAINT arqdor_mep_network_system_fk FOREIGN KEY (tenant_id,project_id,system_id)
    REFERENCES arqdor_mep_systems(tenant_id,project_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS arqdor_mep_nodes (
  id text NOT NULL,
  tenant_id text NOT NULL,
  project_id text NOT NULL,
  network_id text NOT NULL,
  floor_id text NOT NULL,
  room_id text,
  host_element_id text,
  kind text NOT NULL,
  x_mm integer NOT NULL,
  y_mm integer NOT NULL,
  z_mm integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id,project_id,network_id,id),
  CONSTRAINT arqdor_mep_node_network_fk FOREIGN KEY (tenant_id,project_id,network_id)
    REFERENCES arqdor_mep_networks(tenant_id,project_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arqdor_mep_node_host_idx ON arqdor_mep_nodes(tenant_id,project_id,host_element_id);
CREATE TABLE IF NOT EXISTS arqdor_mep_segments (
  id text NOT NULL,
  tenant_id text NOT NULL,
  project_id text NOT NULL,
  network_id text NOT NULL,
  from_node_id text NOT NULL,
  to_node_id text NOT NULL,
  material text,
  nominal_size_mm integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id,project_id,id),
  CONSTRAINT arqdor_mep_segment_network_fk FOREIGN KEY (tenant_id,project_id,network_id)
    REFERENCES arqdor_mep_networks(tenant_id,project_id,id) ON DELETE CASCADE,
  CONSTRAINT arqdor_mep_segment_from_fk FOREIGN KEY (tenant_id,project_id,network_id,from_node_id)
    REFERENCES arqdor_mep_nodes(tenant_id,project_id,network_id,id) ON DELETE CASCADE,
  CONSTRAINT arqdor_mep_segment_to_fk FOREIGN KEY (tenant_id,project_id,network_id,to_node_id)
    REFERENCES arqdor_mep_nodes(tenant_id,project_id,network_id,id) ON DELETE CASCADE,
  CONSTRAINT arqdor_mep_segment_distinct_nodes CHECK (from_node_id <> to_node_id),
  CONSTRAINT arqdor_mep_segment_positive_size CHECK (nominal_size_mm IS NULL OR nominal_size_mm > 0)
);
