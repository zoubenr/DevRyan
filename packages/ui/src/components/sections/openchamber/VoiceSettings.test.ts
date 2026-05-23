import { describe, expect, test } from 'bun:test';
import {
  getSelectableVoiceInputProviders,
  getVoiceInputSourceMode,
  normalizeVoiceInputProvider,
} from './voiceSettingsUtils';

describe('VoiceSettings input source behavior', () => {
  test('uses provider-specific input source modes', () => {
    expect(getVoiceInputSourceMode('browser')).toBe('fixed-default');
    expect(getVoiceInputSourceMode('server')).toBe('media-device');
    expect(getVoiceInputSourceMode('macos')).toBe('native-device');
  });

  test('does not expose the local input provider in selectable settings options', () => {
    expect(getSelectableVoiceInputProviders(true)).toEqual(['macos', 'browser', 'server']);
    expect(getSelectableVoiceInputProviders(false)).toEqual(['browser', 'server']);
  });

  test('normalizes legacy local input provider to macos when available', () => {
    expect(normalizeVoiceInputProvider('wasm', true)).toBe('macos');
    expect(normalizeVoiceInputProvider('wasm', false)).toBe('browser');
    expect(normalizeVoiceInputProvider('server', true)).toBe('server');
  });
});
