export type QuotaProviderId =
  | 'openai'
  | 'codex'
  | 'cursor-acp'
  | 'claude'
  | 'github-copilot'
  | 'github-copilot-addon'
  | 'google'
  | 'antigravity'
  | 'kimi-for-coding'
  | 'nano-gpt'
  | 'openrouter'
  | 'zai-coding-plan'
  | 'zhipuai-coding-plan'
  | 'minimax-coding-plan'
  | 'minimax-cn-coding-plan'
  | 'ollama-cloud';

export interface UsageWindow {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
  valueLabel?: string | null;
  description?: string | null;
}

export interface UsageWindows {
  windows: Record<string, UsageWindow>;
  displayName?: string;
  contextLabel?: string;
  sortOrder?: number;
}

export interface ProviderUsage extends UsageWindows {
  models?: Record<string, UsageWindows>;
}

export interface ProviderResult {
  providerId: QuotaProviderId;
  providerName: string;
  ok: boolean;
  configured: boolean;
  error?: string;
  errorCode?: string;
  usage: ProviderUsage | null;
  fetchedAt: number;
}
