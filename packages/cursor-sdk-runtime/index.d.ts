export type CursorRuntimeStatus = {
  providerId: string;
  bridge: { kind: 'cursor-sdk' };
  sdkAuthConfigured: boolean;
  usageAuthConfigured: boolean;
  activeRuns: number;
  modelsSource: 'sdk' | 'fallback' | 'unavailable';
  modelCount?: number;
  lastError?: string | null;
  lastCancellation?: {
    sessionID: string;
    assistantMessageID: string;
    source: 'user_abort' | 'model_boundary' | 'provider_or_runtime';
    finalStatus: string;
    at: number;
  } | null;
};

export type CursorModelCapabilities = {
  attachment: boolean;
  input: {
    text: boolean;
    audio: boolean;
    image: boolean;
    video: boolean;
    pdf: boolean;
  };
  output: {
    text: boolean;
    audio: boolean;
    image: boolean;
    video: boolean;
    pdf: boolean;
  };
};

export type CursorModelRecord = {
  id: string;
  name: string;
  description?: string;
  options?: {
    cursorSdkModel?: {
      id: string;
      params?: Array<{ id: string; value: string }>;
    };
  };
  variants?: Record<string, {
    cursorSdkModel?: {
      id: string;
      params?: Array<{ id: string; value: string }>;
    };
  }>;
  capabilities: CursorModelCapabilities;
};

export type CursorSdkRuntime = {
  getRuntimeStatus(): CursorRuntimeStatus;
  verifyConnection(): Promise<CursorRuntimeStatus & { ok: boolean; configured: boolean }>;
  getVirtualProvider(): Promise<{ id: string; name: string; models: Record<string, CursorModelRecord> }>;
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
export function resolveCursorSdkWorkerRuntimeConfig(options?: {
  env?: Record<string, unknown>;
  hasInjectedLoadSdk?: boolean;
  isBunRuntime?: boolean;
  isElectronRuntime?: boolean;
  execPath?: string;
  resourcesPath?: string;
  nodeBinaryEnv?: string;
  requestedNodeBinary?: string;
  requestedUseNodeWorkerForPrompts?: boolean;
  requestedWorkerCwd?: string;
  requestedWorkerEnv?: Record<string, unknown>;
  workerPath?: string;
}): {
  useNodeWorkerForPrompts: boolean;
  nodeBinary: string;
  workerCwd: string;
  workerEnv: Record<string, string>;
};
export function createCursorSdkRuntime(options: Record<string, unknown>): CursorSdkRuntime;
export type CursorAuthFile = Record<string, Record<string, unknown>>;
