export const sortMcpServersAlphabetically = <T extends { name: string }>(servers: readonly T[]): T[] => {
  return servers
    .map((server, index) => ({ server, index }))
    .sort((a, b) => {
      const nameOrder = a.server.name.localeCompare(b.server.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return nameOrder || a.index - b.index;
    })
    .map(({ server }) => server);
};

const MCP_SERVER_DISPLAY_OVERRIDES: Record<string, string> = {
  api: 'API',
  aws: 'AWS',
  github: 'GitHub',
  mcp: 'MCP',
  sql: 'SQL',
  url: 'URL',
};

export const formatMcpServerDisplayName = (name: string): string => {
  const normalized = name.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return name;

  return normalized
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      return MCP_SERVER_DISPLAY_OVERRIDES[lower] ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
};
