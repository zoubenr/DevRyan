import React, { type JSX, type ReactNode } from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { createContentCacheFilesAPI } from './runtimeFileCache';

export function RuntimeAPIProvider({ apis, children }: { apis: RuntimeAPIs; children: ReactNode }): JSX.Element {
  const cachedApis = React.useMemo<RuntimeAPIs>(
    () => ({
      ...apis,
      files: createContentCacheFilesAPI(apis.files),
    }),
    [apis],
  );
  return <RuntimeAPIContext.Provider value={cachedApis}>{children}</RuntimeAPIContext.Provider>;
}
