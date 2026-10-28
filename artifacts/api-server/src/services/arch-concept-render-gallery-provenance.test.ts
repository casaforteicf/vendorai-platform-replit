import { describe, expect, it } from 'vitest';
import { REGENERATE_SQL } from './arch-concept-render-gallery.js';

describe('ARQDOR LOT-07 render variation provenance', () => {
  it('copies the parent geometry revision into a regenerated version', () => {
    expect(REGENERATE_SQL).toMatch(/project_revision, scene_id, scene_name, camera_snapshot, source_model_version/);
    expect(REGENERATE_SQL).toMatch(/project_revision, scene_id, scene_name, camera_snapshot, source_model_version\s+FROM arch_ai_renders/i);
  });
  it('still limits the source render to its tenant', () => {
    expect(REGENERATE_SQL).toMatch(/WHERE id = \$1 AND tenant_id = \$2/);
  });
  it('keeps the durable regeneration idempotency key', () => {
    expect(REGENERATE_SQL).toContain("jsonb_build_object('regenerationKey', $4::text)");
  });
});
