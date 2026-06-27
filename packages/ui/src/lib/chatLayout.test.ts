import { describe, expect, test } from 'bun:test';

import { applyWideChatLayoutClass } from './chatLayout';

const createRoot = (): HTMLElement => {
  const classes = new Set<string>();
  return {
    classList: {
      add: (...tokens: string[]) => {
        for (const token of tokens) classes.add(token);
      },
      remove: (...tokens: string[]) => {
        for (const token of tokens) classes.delete(token);
      },
      toggle: (token: string, force?: boolean) => {
        const shouldAdd = force ?? !classes.has(token);
        if (shouldAdd) {
          classes.add(token);
          return true;
        }
        classes.delete(token);
        return false;
      },
      contains: (token: string) => classes.has(token),
    },
  } as HTMLElement;
};

describe('applyWideChatLayoutClass', () => {
  test('removes stale wide layout class when disabled', () => {
    const root = createRoot();
    root.classList.add('wide-chat-layout');

    applyWideChatLayoutClass(root, false);

    expect(root.classList.contains('wide-chat-layout')).toBe(false);
  });

  test('adds and removes wide layout class based on preference', () => {
    const root = createRoot();

    applyWideChatLayoutClass(root, true);
    expect(root.classList.contains('wide-chat-layout')).toBe(true);

    applyWideChatLayoutClass(root, false);
    expect(root.classList.contains('wide-chat-layout')).toBe(false);
  });
});
