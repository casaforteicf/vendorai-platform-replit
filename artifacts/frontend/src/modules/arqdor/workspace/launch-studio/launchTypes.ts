export type LaunchView =
  | "overview"
  | "offer"
  | "segments"
  | "demo"
  | "content"
  | "campaigns"
  | "sales"
  | "onboarding"
  | "analytics";

export type LaunchStatus = "ready" | "attention" | "pending" | "blocked";
export type Priority = "baixa" | "media" | "alta";

export type OfferPackage = {
  id: string;
  name: string;
  target: string;
  price: string;
  setup: string;
  promise: string;
  included: string[];
  status: LaunchStatus;
};

export type MarketSegment = {
  id: string;
  name: string;
  profile: string;
  pain: string;
  pitch: string;
  offer: string;
  priority: Priority;
  readiness: number;
};

export type DemoStep = {
  id: string;
  title: string;
  module: string;
  duration: string;
  objective: string;
  talkingPoint: string;
  status: LaunchStatus;
};

export type ContentAsset = {
  id: string;
  title: string;
  channel: string;
  format: string;
  objective: string;
  status: LaunchStatus;
  owner: string;
};

export type CampaignItem = {
  id: string;
  name: string;
  audience: string;
  channel: string;
  message: string;
  status: LaunchStatus;
  kpi: string;
};

export type SalesPlay = {
  id: string;
  title: string;
  trigger: string;
  script: string;
  objection: string;
  close: string;
};

export type OnboardingStep = {
  id: string;
  title: string;
  owner: string;
  duration: string;
  output: string;
  status: LaunchStatus;
};

export type LaunchMetric = {
  id: string;
  label: string;
  value: string;
  target: string;
  status: LaunchStatus;
};
