import type { ConstructionContract, FacilityContract } from "./ConstructionFacilityContract";

export function validateConstructionPhase(item: ConstructionContract) {
  return {
    valid: Boolean(item.projectId && item.title && item.discipline),
    missingProjectId: !item.projectId,
    missingTitle: !item.title,
    missingDiscipline: !item.discipline,
  };
}

export function validateFacilityAsset(item: FacilityContract) {
  return {
    valid: Boolean(item.projectId && item.name && item.category && item.location),
    missingProjectId: !item.projectId,
    missingName: !item.name,
    missingCategory: !item.category,
    missingLocation: !item.location,
    missingCanonicalProductId: !item.canonicalProductId,
  };
}
