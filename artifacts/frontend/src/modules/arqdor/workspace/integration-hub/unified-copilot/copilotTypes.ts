export type CopilotView =
  | "dashboard"
  | "chat"
  | "context"
  | "agents"
  | "actions"
  | "health"
  | "memory"
  | "recommendations"
  | "playbooks"
  | "reports";

export type AgentStatus = "online" | "idle" | "learning" | "warning" | "error";
export type ActionStatus = "suggested" | "approved" | "running" | "completed" | "blocked";
export type HealthStatus = "healthy" | "warning" | "critical" | "offline";

export type CopilotAgent = {
  id: string;
  name: string;
  role: string;
  module: string;
  status: AgentStatus;
  confidence: number;
  activeTasks: number;
};

export type CopilotContextItem = {
  id: string;
  title: string;
  module: string;
  entity: string;
  confidence: number;
  lastUpdated: string;
};

export type CopilotAction = {
  id: string;
  title: string;
  module: string;
  description: string;
  status: ActionStatus;
  impact: "baixo" | "medio" | "alto" | "critico";
};

export type HealthCheck = {
  id: string;
  service: string;
  module: string;
  status: HealthStatus;
  latency: string;
  uptime: string;
  lastCheck: string;
};

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  module?: string;
  timestamp: string;
};

export type CopilotPlaybook = {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  modules: string[];
  status: "active" | "draft" | "paused";
};
