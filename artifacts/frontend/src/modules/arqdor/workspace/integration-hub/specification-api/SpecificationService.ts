import { CatalogRepository, type CatalogProduct } from "./CatalogRepository";
import { SpecificationRepository, type SpecificationObject } from "./SpecificationRepository";

export type SpecificationValidationResult = {
  valid: boolean;
  missingCanonicalIds: SpecificationObject[];
  missingMaterials: SpecificationObject[];
  missingSuppliers: SpecificationObject[];
};

export class SpecificationService {
  constructor(
    private readonly specificationRepository = new SpecificationRepository(),
    private readonly catalogRepository = new CatalogRepository()
  ) {}

  async loadProjectSpecification(projectId: string): Promise<SpecificationObject[]> {
    return this.specificationRepository.listByProject(projectId);
  }

  validate(objects: SpecificationObject[]): SpecificationValidationResult {
    return {
      valid: objects.every((item) => item.canonicalProductId && item.materialId && item.supplierId),
      missingCanonicalIds: objects.filter((item) => !item.canonicalProductId),
      missingMaterials: objects.filter((item) => !item.materialId),
      missingSuppliers: objects.filter((item) => !item.supplierId),
    };
  }

  async enrichWithCatalog(objects: SpecificationObject[]): Promise<Array<SpecificationObject & { catalogProduct?: CatalogProduct | null }>> {
    return Promise.all(
      objects.map(async (item) => ({
        ...item,
        catalogProduct: item.canonicalProductId
          ? await this.catalogRepository.findByCanonicalId(item.canonicalProductId)
          : null,
      }))
    );
  }
}
