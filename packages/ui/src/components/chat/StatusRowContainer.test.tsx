import { describe, expect, test } from 'bun:test';

import { shouldRenderStatusRowAssistantStatus } from './StatusRowContainer';

describe('shouldRenderStatusRowAssistantStatus', () => {
  test('suppresses the status row while reasoning owns the visible Thinking indicator', () => {
    expect(shouldRenderStatusRowAssistantStatus('reasoning', true)).toBe(false);
  });

  test('keeps non-reasoning working states visible in the status row', () => {
    expect(shouldRenderStatusRowAssistantStatus('text', true)).toBe(true);
    expect(shouldRenderStatusRowAssistantStatus('tool', true)).toBe(true);
    expect(shouldRenderStatusRowAssistantStatus('editing', true)).toBe(true);
  });

  test('does not render the status row assistant placeholder while idle', () => {
    expect(shouldRenderStatusRowAssistantStatus(undefined, false)).toBe(false);
    expect(shouldRenderStatusRowAssistantStatus('text', false)).toBe(false);
  });
});
