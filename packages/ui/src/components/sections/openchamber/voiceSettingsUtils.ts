export type VoiceInputProvider = 'browser' | 'server' | 'macos' | 'wasm';
export type SelectableVoiceInputProvider = Exclude<VoiceInputProvider, 'wasm'>;

export const getVoiceInputSourceMode = (provider: VoiceInputProvider): 'fixed-default' | 'media-device' | 'native-device' => {
  if (provider === 'browser') return 'fixed-default';
  if (provider === 'macos') return 'native-device';
  return 'media-device';
};

export const getSelectableVoiceInputProviders = (isMacosSpeechAvailable: boolean): SelectableVoiceInputProvider[] => {
  return isMacosSpeechAvailable ? ['macos', 'browser', 'server'] : ['browser', 'server'];
};

export const normalizeVoiceInputProvider = (
  provider: VoiceInputProvider,
  isMacosSpeechAvailable: boolean,
): SelectableVoiceInputProvider => {
  if (provider === 'wasm') {
    return isMacosSpeechAvailable ? 'macos' : 'browser';
  }
  if (provider === 'macos' && !isMacosSpeechAvailable) {
    return 'browser';
  }
  return provider;
};
