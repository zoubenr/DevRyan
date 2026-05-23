export type CursorAcpModelLike = {
  id?: string;
};

export type CursorAcpProviderLike<M extends CursorAcpModelLike = CursorAcpModelLike> = {
  id?: string;
  models?: readonly M[];
};

export const CURSOR_ACP_PROVIDER_ID = 'cursor-acp';
export const CURSOR_ACP_FAST_SUFFIX = '-fast';

export const isCursorAcpProvider = (
  provider: { id?: string } | undefined,
) => provider?.id === CURSOR_ACP_PROVIDER_ID;

export const getCursorAcpBaseModelId = (modelId: string) => (
  modelId.endsWith(CURSOR_ACP_FAST_SUFFIX)
    ? modelId.slice(0, -CURSOR_ACP_FAST_SUFFIX.length)
    : modelId
);

export const getCursorAcpFastModelId = (modelId: string) => (
  `${getCursorAcpBaseModelId(modelId)}${CURSOR_ACP_FAST_SUFFIX}`
);

export const findCursorAcpModel = <M extends CursorAcpModelLike>(
  provider: CursorAcpProviderLike<M> | undefined,
  modelId: string | undefined,
) => {
  if (!provider || !modelId || !Array.isArray(provider.models)) {
    return undefined;
  }
  return provider.models.find((model) => model.id === modelId);
};

export const shouldHideCursorAcpFastModel = <M extends CursorAcpModelLike>(
  provider: CursorAcpProviderLike<M> | undefined,
  modelId: string | undefined,
) => {
  if (!isCursorAcpProvider(provider) || !modelId?.endsWith(CURSOR_ACP_FAST_SUFFIX)) {
    return false;
  }
  return Boolean(findCursorAcpModel(provider, getCursorAcpBaseModelId(modelId)));
};
