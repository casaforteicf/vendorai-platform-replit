export type ConstructionView =
  | "dashboard"
  | "diary"
  | "schedule"
  | "financial"
  | "teams"
  | "measurements"
  | "checklists"
  | "nonconformities"
  | "photos"
  | "approvals"
  | "ai";

export type WorkStatus = "planned" | "in_progress" | "blocked" | "done" | "delayed";
export type Severity = "baixo" | "medio" | "alto" | "critico";

export type ConstructionPhase = {
  id: string;
  title: string;
  discipline: string;
  status: WorkStatus;
  startDate: string;
  endDate: string;
  progress: number;
  responsible: string;
};

export type DiaryEntry = {
  id: string;
  date: string;
  weather: string;
  team: string;
  activities: string[];
  blockers: string[];
  notes: string;
};

export type TeamItem = {
  id: string;
  name: string;
  role: string;
  company: string;
  allocated: number;
  status: "available" | "busy" | "blocked";
};

export type MeasurementItem = {
  id: string;
  title: string;
  discipline: string;
  planned: number;
  executed: number;
  unit: string;
  value: number;
  status: WorkStatus;
};

export type ChecklistItem = {
  id: string;
  title: string;
  category: string;
  checked: boolean;
  owner: string;
};

export type NonConformity = {
  id: string;
  title: string;
  discipline: string;
  severity: Severity;
  status: "open" | "review" | "resolved";
  owner: string;
  recommendation: string;
};

export type ConstructionPhoto = {
  id: string;
  title: string;
  area: string;
  date: string;
  status: "registered" | "review" | "approved";
};

export type SiteApproval = {
  id: string;
  title: string;
  type: string;
  status: "pending" | "approved" | "changes_requested";
  dueDate: string;
  owner: string;
};
