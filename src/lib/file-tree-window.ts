export const FILE_TREE_WINDOW = 200;

export function windowedList<T>(items: T[], limit = FILE_TREE_WINDOW): { shown: T[]; hidden: number } {
  if (items.length <= limit) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}
