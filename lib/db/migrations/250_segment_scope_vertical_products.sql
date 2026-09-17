-- Growth unlocks all standard products applicable to the tenant segment.
-- Horizontal products keep segment_keys=[] (global). Vertical products must
-- declare the segments where Growth should include them automatically.

UPDATE commercial_product_profiles
SET
  segment_keys = jsonb_build_array(
    'Construção & Reforma',
    'Arquitetura & Design',
    'Arquitetura',
    'Obras',
    'Gestão de Obras',
    'Construtora',
    'Marcenaria',
    'Fábrica de Móveis',
    'Móveis Planejados',
    'Móveis Sob Medida',
    'Indústria de Móveis',
    'Designer de Interiores',
    'Design de Interiores'
  ),
  updated_at = now()
WHERE commercial_key = 'arqdor.ai';

-- Praça.ai remains broadly sellable/usable for now. When its vertical policy is
-- finalized, segment_keys can be configured from Produtos & Monetização without
-- changing entitlement/provisioning code.
