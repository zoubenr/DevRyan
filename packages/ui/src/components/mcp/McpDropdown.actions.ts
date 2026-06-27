type McpMutationResult = {
  ok: boolean;
};

type RefreshOptions = {
  directory?: string | null;
  silent?: boolean;
};

type LoadMcpConfigOptions = {
  force?: boolean;
  directory?: string | null;
};

type ToggleMcpServerEnabledInput = {
  name: string;
  enabled: boolean;
  directory: string | null;
  isConnected: boolean;
  updateMcp: (
    name: string,
    config: { enabled: boolean },
    options?: { directory?: string | null },
  ) => Promise<McpMutationResult>;
  loadMcpConfigs: (options?: LoadMcpConfigOptions) => Promise<boolean>;
  refresh: (options?: RefreshOptions) => Promise<void>;
  connect: (name: string, directory?: string | null) => Promise<void>;
  disconnect: (name: string, directory?: string | null) => Promise<void>;
};

export const toggleMcpServerEnabled = async ({
  name,
  enabled,
  directory,
  isConnected,
  updateMcp,
  loadMcpConfigs,
  refresh,
  connect,
  disconnect,
}: ToggleMcpServerEnabledInput): Promise<void> => {
  const result = await updateMcp(name, { enabled }, { directory });
  if (!result.ok) {
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} MCP server "${name}"`);
  }

  if (enabled) {
    await loadMcpConfigs({ force: true, directory });
    await refresh({ directory, silent: true });
    try {
      await connect(name, directory);
    } finally {
      await refresh({ directory, silent: true });
    }
    return;
  }

  if (isConnected) {
    await disconnect(name, directory);
  }
  await loadMcpConfigs({ force: true, directory });
  await refresh({ directory, silent: true });
};
