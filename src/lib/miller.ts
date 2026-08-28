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

export type TreeNode = { name: string; path: string; children?: TreeNode[] };

type MutableNode = { name: string; path: string; children: Map<string, MutableNode> };

function toTree(nodes: Map<string, MutableNode>): TreeNode[] {
  return [...nodes.values()]
    .sort((a, b) => {
      const aDir = a.children.size > 0;
      const bDir = b.children.size > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => {
      const children = toTree(node.children);
      return children.length > 0
        ? { name: node.name, path: node.path, children }
        : { name: node.name, path: node.path };
    });
}

/** Fold a flat path list into a directory tree. Leaves have no `children`. */
export function nestPaths(paths: string[]): TreeNode[] {
  const root = new Map<string, MutableNode>();
  for (const raw of paths) {
    if (!raw) continue;
    const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) continue;
    const absolute = normalized.startsWith("/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;
    let built = "";
    for (const name of parts) {
      built = built ? `${built}/${name}` : absolute ? `/${name}` : name;
      let next = cursor.get(name);
      if (!next) {
        next = { name, path: built, children: new Map() };
        cursor.set(name, next);
      }
      cursor = next.children;
    }
  }
  return toTree(root);
}
