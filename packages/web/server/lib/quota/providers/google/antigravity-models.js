const normalizeModelKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^antigravity[/-]/, '')
    .replace(/\bthinking\b/g, 'thinking')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const ANTIGRAVITY_USAGE_MODELS = [
  {
    id: 'claude-opus-4-6-thinking',
    displayName: 'Claude Opus 4.6 Thinking',
    contextLabel: '200K',
    aliases: [
      'claude-opus-4-6-thinking',
      'claude-opus-4.6-thinking',
      'claude-opus-46-thinking',
    ],
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextLabel: '200K',
    aliases: [
      'claude-sonnet-4-6',
      'claude-sonnet-4.6',
      'claude-sonnet-46',
    ],
  },
  {
    id: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    contextLabel: '1M',
    aliases: ['gemini-3-flash'],
  },
  {
    id: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    contextLabel: '1M',
    aliases: ['gemini-3-pro'],
  },
  {
    id: 'gemini-3-1-pro',
    displayName: 'Gemini 3.1 Pro',
    contextLabel: '1M',
    aliases: [
      'gemini-3-1-pro',
      'gemini-3.1-pro',
      'gemini-31-pro',
      'gemini-3-1-pro-high',
      'gemini-3-1-pro-low',
      'gemini-3.1-pro-high',
      'gemini-3.1-pro-low',
      'gemini-31-pro-high',
      'gemini-31-pro-low',
      'gemini-pro-agent',
      'Gemini 3.1 Pro (High)',
      'Gemini 3.1 Pro (Low)',
    ],
  },
].map((model, index) => ({
  ...model,
  sortOrder: index,
  normalizedAliases: new Set([model.id, model.displayName, ...model.aliases].map(normalizeModelKey)),
}));

export const resolveAntigravityUsageModel = (modelName, modelData) => {
  const candidateKeys = [
    modelName,
    modelData?.name,
    modelData?.displayName,
    modelData?.id,
    modelData?.modelId,
    modelData?.modelID,
  ].map(normalizeModelKey).filter(Boolean);

  return ANTIGRAVITY_USAGE_MODELS.find((catalogModel) => (
    candidateKeys.some((candidate) => catalogModel.normalizedAliases.has(candidate))
  )) ?? null;
};
