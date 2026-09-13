export type SkillImportAction = "linked" | "offer-import" | "absent";

export function firstOpenSkillAction(input: {
  destExists: boolean;
  destIsSymlink: boolean;
  destReadlink?: string;
  canonicalDir: string;
}): SkillImportAction {
  if (!input.destExists) return "absent";
  if (input.destIsSymlink && input.destReadlink === input.canonicalDir) return "linked";
  return "offer-import";
}
