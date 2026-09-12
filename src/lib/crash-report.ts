export function crashReportText(error: Error, componentStack = ""): string {
  return [error.stack || `${error.name}: ${error.message}`, componentStack.trim()]
    .filter(Boolean)
    .join("\n");
}
