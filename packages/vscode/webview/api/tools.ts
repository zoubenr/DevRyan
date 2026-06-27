import type { ToolsAPI } from '@openchamber/ui/lib/api/types';
import { buildToolManifest } from '../../../ui/src/lib/tools/manifest';

type ToolsAPIOptions = {
  getDirectory?: () => string | null | undefined;
};

const fetchAvailableTools = async (): Promise<string[]> => {
  const response = await fetch('/api/experimental/tool/ids');

  if (!response.ok) {
    throw new Error(`Tools API returned ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Tools API returned invalid data format');
  }

  return data
    .filter((tool: unknown): tool is string => typeof tool === 'string' && tool !== 'invalid')
    .sort();
};

// Use same endpoint as web - fetch interceptor handles URL rewriting
export const createVSCodeToolsAPI = (options: ToolsAPIOptions = {}): ToolsAPI => ({
  async getAvailableTools(): Promise<string[]> {
    return fetchAvailableTools();
  },

  async getToolManifest() {
    return buildToolManifest({
      toolIds: await fetchAvailableTools(),
      sourceRuntime: 'vscode',
      directory: options.getDirectory?.() ?? null,
    });
  },
});
