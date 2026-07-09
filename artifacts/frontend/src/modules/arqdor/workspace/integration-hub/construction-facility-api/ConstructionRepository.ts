export type ConstructionPhase = {
  id?: string;
  projectId: string;
  productionOrderId?: string;
  environmentId?: string;
  title: string;
  discipline: string;
  progress: number;
  status: "planned" | "in_progress" | "blocked" | "done" | "delayed";
};

export type ConstructionDiaryEntry = {
  id?: string;
  projectId: string;
  date: string;
  team: string;
  activities: string[];
  blockers: string[];
  notes?: string;
};

export class ConstructionRepository {
  constructor(private readonly baseUrl = "/arch/construction") {}

  async listPhases(projectId: string): Promise<ConstructionPhase[]> {
    const response = await fetch(`${this.baseUrl}/phases?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar fases de obra");
    return response.json();
  }

  async createPhase(payload: ConstructionPhase): Promise<ConstructionPhase> {
    const response = await fetch(`${this.baseUrl}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Falha ao criar fase de obra");
    return response.json();
  }

  async listDiary(projectId: string): Promise<ConstructionDiaryEntry[]> {
    const response = await fetch(`${this.baseUrl}/diary?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar diário de obra");
    return response.json();
  }

  async createDiaryEntry(payload: ConstructionDiaryEntry): Promise<ConstructionDiaryEntry> {
    const response = await fetch(`${this.baseUrl}/diary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Falha ao criar diário de obra");
    return response.json();
  }
}
