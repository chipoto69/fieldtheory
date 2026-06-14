export type WorkbenchRunTarget = "aeon" | "hermes" | "content-os";

export function buildWorkbenchRunIdempotencyKey(target: WorkbenchRunTarget, importId: string): string {
  const cleanedImportId = importId.trim().replace(/[^A-Za-z0-9_./:@=-]+/g, "_");
  if (!cleanedImportId) return `workbench:${target}:missing-import`;
  return `workbench:${target}:${cleanedImportId}`.slice(0, 160);
}
