import { describe, expect, test } from 'bun:test';
import { formatMcpServerDisplayName, sortMcpServersAlphabetically } from './McpSidebar.utils';

describe('sortMcpServersAlphabetically', () => {
  test('sorts MCP servers by name without mutating the source list', () => {
    const servers = [
      { name: 'supabase' },
      { name: 'mobbin' },
      { name: 'railway' },
      { name: 'linear' },
    ];

    expect(sortMcpServersAlphabetically(servers).map((server) => server.name)).toEqual([
      'linear',
      'mobbin',
      'railway',
      'supabase',
    ]);
    expect(servers.map((server) => server.name)).toEqual([
      'supabase',
      'mobbin',
      'railway',
      'linear',
    ]);
  });

  test('keeps equivalent names in their original order', () => {
    const servers = [
      { name: 'Alpha', id: 1 },
      { name: 'alpha', id: 2 },
      { name: 'beta', id: 3 },
    ];

    expect(sortMcpServersAlphabetically(servers).map((server) => server.id)).toEqual([1, 2, 3]);
  });
});

describe('formatMcpServerDisplayName', () => {
  test('title-cases lowercase MCP server names', () => {
    expect(formatMcpServerDisplayName('linear')).toBe('Linear');
  });

  test('formats separated server names as title-cased words', () => {
    expect(formatMcpServerDisplayName('brave_search')).toBe('Brave Search');
    expect(formatMcpServerDisplayName('mcp-server')).toBe('MCP Server');
  });

  test('keeps common service acronyms in their expected casing', () => {
    expect(formatMcpServerDisplayName('github')).toBe('GitHub');
    expect(formatMcpServerDisplayName('postgres_sql')).toBe('Postgres SQL');
  });
});
