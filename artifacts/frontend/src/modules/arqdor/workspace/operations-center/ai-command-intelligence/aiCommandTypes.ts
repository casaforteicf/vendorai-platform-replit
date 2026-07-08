export type CommandView =
  | "dashboard"
  | "agents"
  | "decisions"
  | "prompts"
  | "playbooks"
  | "memory"
  | "training"
  | "reports";

export type AgentStatus = "online" | "paused" | "learning" | "error";
export type DecisionStatus = "suggested" | "approved" | "rejected" | "executed";
export type ImpactLevel = "baixo" | "medio" | "alto" | "critico";

export type AIAgent = {
  id: string;
  name: string;
  role: string;
  module: string;
  status: AgentStatus;
  score: number;
  tasks: number;
  lastAction: string;
};

export type AIDecision = {
  id: string;
  title: string;
  module: string;
  recommendation: string;
  impact: ImpactLevel;
  status: DecisionStatus;
  confidence: number;
};

export type PromptTemplate = {
  id: string;
  name: string;
  module: string;
  purpose: string;
  version: string;
  status: "active" | "draft" | "review";
};

export type Playbook = {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  modules: string[];
  status: "active" | "draft" | "paused";
};

export type MemoryItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  confidence: number;
  lastUpdated: string;
};

export type TrainingItem = {
  id: string;
  dataset: string;
  module: string;
  samples: number;
  quality: number;
  status: "ready" | "processing" | "needs_review";
};
