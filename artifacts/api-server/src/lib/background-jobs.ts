export function shouldStartBackgroundJobs(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const disabled = environment["VENDORAI_DISABLE_BACKGROUND_JOBS"];
  return !["1", "true", "yes"].includes(disabled?.trim().toLowerCase() ?? "");
}
