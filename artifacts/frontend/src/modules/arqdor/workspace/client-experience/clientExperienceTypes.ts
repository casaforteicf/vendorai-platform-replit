export type ClientView =
  | "dashboard"
  | "timeline"
  | "approvals"
  | "comments"
  | "files"
  | "financial"
  | "schedule"
  | "signature"
  | "ai";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";
export type TimelineStatus = "done" | "active" | "pending" | "blocked";
export type FileType = "render" | "pdf" | "image" | "proposal" | "contract" | "technical";

export type ClientProject = {
  id: string;
  title: string;
  clientName: string;
  phase: string;
  progress: number;
  nextAction: string;
  portalToken: string;
};

export type TimelineItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  status: TimelineStatus;
  owner: string;
};

export type ApprovalItem = {
  id: string;
  title: string;
  type: string;
  status: ApprovalStatus;
  sentAt: string;
  dueAt: string;
  value?: number;
  note: string;
};

export type CommentItem = {
  id: string;
  author: string;
  role: "client" | "architect" | "ai" | "supplier";
  message: string;
  date: string;
  linkedTo: string;
};

export type ClientFile = {
  id: string;
  name: string;
  type: FileType;
  size: string;
  version: string;
  status: "available" | "pending" | "expired";
};

export type FinancialItem = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: "paid" | "pending" | "overdue" | "scheduled";
};

export type ScheduleItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "meeting" | "site_visit" | "delivery" | "installation" | "approval";
  status: "scheduled" | "done" | "cancelled";
};
