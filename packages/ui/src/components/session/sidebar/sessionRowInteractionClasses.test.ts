import { describe, expect, test } from 'bun:test';
import { resolveSessionRowInteractionClasses } from './sessionRowInteractionClasses';

describe('resolveSessionRowInteractionClasses', () => {
  test('uses compact minimal hover padding', () => {
    const classes = resolveSessionRowInteractionClasses();

    expect(classes.revealOnHoverClass).toContain('group-hover:opacity-100');
    expect(classes.revealOnHoverClass).toContain('group-hover:pointer-events-auto');
    expect(classes.revealOnHoverClass).not.toContain('group-focus-within');
    expect(classes.hideOnHoverClass).toBe('group-hover:opacity-0');
    expect(classes.revealPaddingClass).toBe('group-hover:pr-9');
    expect(classes.revealPaddingClass).not.toContain('group-focus-within');
  });
});
