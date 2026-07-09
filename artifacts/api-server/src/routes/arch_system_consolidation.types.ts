export interface ReleaseGatePayload {
  gateId: string;
  status: "pending" | "passed" | "failed" | "waived";
  evidence?: string;
}
