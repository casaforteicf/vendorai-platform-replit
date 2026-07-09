export type AIRealDataContract = {
  projectId: string;
  loadedAt: string;
  sources: {
    project: boolean;
    environments: boolean;
    renders: boolean;
    specifications: boolean;
    budget: boolean;
    procurement: boolean;
    production: boolean;
    construction: boolean;
    facility: boolean;
  };
  safeToAutomate: boolean;
  blockers: string[];
};
