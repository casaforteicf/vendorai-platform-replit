export type AIProjectContext = {
  projectId: string;
  project?: unknown;
  environments?: unknown[];
  renders?: unknown[];
  specifications?: unknown[];
  budget?: unknown;
  procurement?: unknown[];
  production?: unknown[];
  construction?: unknown[];
  facility?: unknown[];
};

export class AIContextRepository {
  async loadProjectContext(projectId: string): Promise<AIProjectContext> {
    const safeFetch = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    };

    const [
      project,
      environments,
      renders,
      specifications,
      budget,
      procurement,
      production,
      construction,
      facility,
    ] = await Promise.all([
      safeFetch(`/arch/projetos/${projectId}`),
      safeFetch(`/arch/projetos/${projectId}/ambientes`),
      safeFetch(`/arch/renders/gallery?projectId=${projectId}`),
      safeFetch(`/arch/specification?projectId=${projectId}`),
      safeFetch(`/arch/orcamento?projectId=${projectId}`),
      safeFetch(`/arch/procurement/requests?projectId=${projectId}`),
      safeFetch(`/arch/production?projectId=${projectId}`),
      safeFetch(`/arch/construction/phases?projectId=${projectId}`),
      safeFetch(`/arch/facility/assets?projectId=${projectId}`),
    ]);

    return {
      projectId,
      project,
      environments: environments ?? [],
      renders: renders ?? [],
      specifications: specifications ?? [],
      budget,
      procurement: procurement ?? [],
      production: production ?? [],
      construction: construction ?? [],
      facility: facility ?? [],
    };
  }
}
