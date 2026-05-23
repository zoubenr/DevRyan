import { describe, expect, test } from 'bun:test';
import { resolveSessionRowInteractionClasses } from './sessionRowInteractionClasses';

describe('resolveSessionRowInteractionClasses', () => {
  test('reveals archive actions on hover only outside VS Code', () => {
    const classes = resolveSessionRowInteractionClasses({
      isMinimalMode: false,
      showQuickArchiveAction: true,
    });

    expect(classes.revealOnHoverClass).toContain('group-hover:opacity-100');
    expect(classes.revealOnHoverClass).toContain('group-hover:pointer-events-auto');
    expect(classes.revealOnHoverClass).not.toContain('group-focus-within');
    expect(classes.hideOnHoverClass).toBe('group-hover:opacity-0');
    expect(classes.revealPaddingClass).toBe('group-hover:pr-7');
  });

  test('keeps compact non-archive padding hover-only', () => {
    const classes = resolveSessionRowInteractionClasses({
      isMinimalMode: true,
      showQuickArchiveAction: false,
    });

    expect(classes.revealPaddingClass).toBe('group-hover:pr-2');
    expect(classes.revealPaddingClass).not.toContain('group-focus-within');
  });
});
