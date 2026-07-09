export type AIView =
  | "command"
  | "agents"
  | "workflow"
  | "memory"
  | "actions"
  | "integrations"
  | "governance"
  | "copilot";

export type AIAgentKey =
  | "architect"
  | "decorator"
  | "specification"
  | "budget"
  | "production"
  | "procurement"
  | "reviewer"
  | "qa"
  | "client"
  | "sales";

export type AgentStatus = "active" | "training" | "warning" | "offline";

export type AIAgent = {
  key: AIAgentKey;
  name: string;
  role: string;
  status: AgentStatus;
  autonomy: number;
  confidence: number;
  lastAction: string;
  currentFocus: string;
  module: string;
};

export type AIInsight = {
  id: string;
  title: string;
  description: string;
  module: string;
  impact: string;
  severity: "low" | "medium" | "high";
  recommendation: string;
};

export type AIAction = {
  id: string;
  title: string;
  description: string;
  owner: AIAgentKey;
  module: string;
  priority: "baixa" | "media" | "alta";
  status: "sugerida" | "aprovacao" | "executando" | "concluida";
  impact: string;
};

export type AIMemoryItem = {
  id: string;
  title: string;
  description: string;
  source: string;
  confidence: number;
  reusable: boolean;
};

export type AIWorkflowStep = {
  id: string;
  label: string;
  module: string;
  status: "complete" | "active" | "blocked" | "pending";
  agent: AIAgentKey;
  insight: string;
};

export type AIIntegration = {
  id: string;
  name: string;
  status: "connected" | "partial" | "missing";
  description: string;
  aiRole: string;
};

export type AIGovernanceRule = {
  id: string;
  title: string;
  description: string;
  mode: "manual" | "assisted" | "autonomous";
  risk: "baixo" | "medio" | "alto";
};
