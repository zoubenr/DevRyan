export type CursorRuntimeStatus = {
  providerId: string;
  bridge: { kind: 'cursor-sdk' };
  sdkAuthConfigured: boolean;
  usageAuthConfigured: boolean;
  activeRuns: number;
  modelsSource: 'sdk' | 'fallback' | 'unavailable';
  modelCount?: number;
  lastError?: string | null;
};

export type CursorSdkRuntime = {
  getRuntimeStatus(): CursorRuntimeStatus;
  verifyConnection(): Promise<CursorRuntimeStatus & { ok: boolean; configured: boolean }>;
  getVirtualProvider(): Promise<{ id: string; name: string; models: Record<string, { id: string; name: string }> }>;
  handlePromptAsync(input: {
    sessionID: string;
    body: Record<string, unknown>;
    directory?: string | null;
  }): Promise<{ handled: boolean; status?: number; body?: Record<string, unknown> }>;
  abortSession(sessionID: string): Promise<boolean>;
  getSessionMessages(sessionID: string): Promise<Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }>>;
};

export const CURSOR_PROVIDER_ID: 'cursor-acp';
export function getCursorSdkApiKey(options?: { env?: Record<string, unknown>; readAuth?: () => CursorAuthFile }): string | null;
export function isCursorUsageAuthConfigured(auth: CursorAuthFile): boolean;
export function saveCursorSdkAuth(options: {
  readAuth: () => CursorAuthFile;
  writeAuth: (auth: CursorAuthFile) => void;
  key: string;
  type?: string;
}): void;
export function clearCursorSdkAuth(options: {
  readAuth: () => CursorAuthFile;
  writeAuth: (auth: CursorAuthFile) => void;
}): boolean;
export function createCursorSdkRuntime(options: Record<string, unknown>): CursorSdkRuntime;
export type CursorAuthFile = Record<string, Record<string, unknown>>;
