import { describe, expect, test } from 'bun:test';
import { buildPlanSendPromptVariables, getPlanSendPlanMode } from './planSend';

describe('plan send helpers', () => {
  test('implement sends the inline plan body and disables plan mode', () => {
    expect(buildPlanSendPromptVariables({
      action: 'implement',
      title: 'Fix onboarding',
      path: '/repo/.opencode/plans/fix-onboarding.md',
      body: '# Fix onboarding\n\n- Do the work',
    })).toEqual({
      plan_title: 'Fix onboarding',
      plan_path: '/repo/.opencode/plans/fix-onboarding.md',
      plan_body: '# Fix onboarding\n\n- Do the work',
    });

    expect(getPlanSendPlanMode('implement')).toBe(false);
  });

  test('improve does not send an implementation body or override plan mode', () => {
    expect(buildPlanSendPromptVariables({
      action: 'improve',
      title: 'Fix onboarding',
      path: '/repo/.opencode/plans/fix-onboarding.md',
      body: '# Fix onboarding\n\n- Do the work',
    })).toEqual({
      plan_title: 'Fix onboarding',
      plan_path: '/repo/.opencode/plans/fix-onboarding.md',
    });

    expect(getPlanSendPlanMode('improve')).toBe(undefined);
  });
});
