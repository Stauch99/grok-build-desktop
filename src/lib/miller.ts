export type MillerColumn = { path: string; name: string };

export function millerRoot(cwd: string): MillerColumn[] {
  const trimmed = cwd.replace(/\/+$/, "");
  const name = trimmed.split("/").filter(Boolean).pop() || trimmed || "/";
  return [{ path: trimmed || "/", name }];
}

export function millerPush(stack: MillerColumn[], next: MillerColumn): MillerColumn[] {
  return [...stack, next];
}

export function millerPath(stack: MillerColumn[]): string {
  return stack[stack.length - 1]?.path ?? "";
}
