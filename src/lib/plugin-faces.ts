export type PluginFace = {
  name: string;
  scope?: string;
  enabled?: boolean;
  trusted?: boolean;
  provides?: { skills?: number; mcpServers?: number; agents?: number; hooks?: boolean };
};

export function splitPluginFaces(plugins: PluginFace[]): {
  configurable: PluginFace[];
  inventory: PluginFace[];
} {
  return {
    configurable: plugins.filter((p) => p.trusted !== false),
    inventory: plugins,
  };
}
