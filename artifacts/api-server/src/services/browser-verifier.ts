import type { BrowserAgentCheckpoint } from "./browser-agent.js";

export type VerificationResult = {
  changed: boolean;
  urlChanged: boolean;
  titleChanged: boolean;
  signatureChanged: boolean;
  interactiveChanged: boolean;
};

export function verifyCheckpointTransition(
  before: BrowserAgentCheckpoint,
  after: BrowserAgentCheckpoint,
): VerificationResult {
  const urlChanged = before.url !== after.url;
  const titleChanged = before.title !== after.title;
  const signatureChanged = before.textSignature !== after.textSignature;
  const interactiveChanged = before.interactiveCount !== after.interactiveCount;
  return {
    changed: urlChanged || titleChanged || signatureChanged || interactiveChanged,
    urlChanged,
    titleChanged,
    signatureChanged,
    interactiveChanged,
  };
}

export function actionShouldChangePage(action: string) {
  return ["navigate", "click", "type", "select", "secret"].includes(action);
}
