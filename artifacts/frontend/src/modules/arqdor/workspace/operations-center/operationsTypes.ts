export type OperationsView =
  | "dashboard"
  | "tasks"
  | "workflows"
  | "notifications"
  | "activity"
  | "health"
  | "ai";

export type TaskStatus = "pending" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type OperationTask = {
  id: string;
  title: string;
  module: string;
  owner: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  progress: number;
  aiNote: string;
};

export type WorkflowStatus = "active" | "paused" | "draft" | "error";

export type WorkflowItem = {
  id: string;
  title: string;
  trigger: string;
  action: string;
  modules: string[];
  status: WorkflowStatus;
  runs: number;
  successRate: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  module: string;
  type: "info" | "warning" | "critical" | "success";
  date: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  module: string;
  actor: string;
  date: string;
};

export type HealthItem = {
  id: string;
  service: string;
  status: "online" | "warning" | "offline";
  latency: string;
  uptime: string;
};
