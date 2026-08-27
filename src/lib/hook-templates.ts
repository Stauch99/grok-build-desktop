export type HookTemplateId = "fmt" | "test" | "notify" | "block-rm";

export type HookTemplate = {
  id: HookTemplateId;
  label: string;
  hint: string;
  filename: string;
  json: string;
};

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    id: "fmt",
    label: "Format after edit",
    hint: "PostToolUse · prettier / cargo fmt",
    filename: "fmt.json",
    json: JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              matcher: "Edit|Write",
              hooks: [{ type: "command", command: "npx prettier --write \"$GROK_FILE\" || true" }],
            },
          ],
        },
      },
      null,
      2,
    ),
  },
  {
    id: "test",
    label: "Block stop until tests pass",
    hint: "Stop · npm test",
    filename: "test.json",
    json: JSON.stringify(
      {
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "npm test --silent" }] }],
        },
      },
      null,
      2,
    ),
  },
  {
    id: "notify",
    label: "Notify on task complete",
    hint: "Notification · osascript",
    filename: "notify.json",
    json: JSON.stringify(
      {
        hooks: {
          Notification: [
            {
              hooks: [
                {
                  type: "command",
                  command: "osascript -e 'display notification \"Grok 任务完成\" with title \"Grok\"'",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  },
  {
    id: "block-rm",
    label: "Block rm -rf",
    hint: "PreToolUse · deny destructive rm",
    filename: "block-rm.json",
    json: JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command:
                    "python3 -c \"import json,sys; d=json.load(sys.stdin); c=str(d.get('tool_input',{}).get('command','')); sys.exit(2 if 'rm -rf' in c or 'rm -fr' in c else 0)\"",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  },
];

export function hookTemplateById(id: string): HookTemplate | undefined {
  return HOOK_TEMPLATES.find((t) => t.id === id);
}
