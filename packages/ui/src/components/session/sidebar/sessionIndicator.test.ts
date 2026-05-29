import { describe, expect, test } from 'bun:test';
import { resolveLeadingIndicatorPositionClasses, resolveSidebarIndicator } from './sessionIndicator';

describe('resolveSidebarIndicator', () => {
  test('shows a success indicator for completed plans without unread notifications', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      hasCompletedStatus: false,
      pendingQuestionCount: 0,
      planState: 'completed',
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.planCompleted',
    });
  });

  test('shows a success indicator for completed normal turns', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      hasCompletedStatus: true,
      pendingQuestionCount: 0,
      planState: null,
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.completed',
    });
  });

  test('hides completion when read-state cleanup has cleared completion inputs', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      hasCompletedStatus: false,
      pendingQuestionCount: 0,
      planState: null,
    })).toBeNull();
  });

  test('keeps pending questions higher priority than completion', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      hasCompletedStatus: true,
      pendingQuestionCount: 1,
      planState: 'completed',
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });
  });

  test('hides completion while the session is working', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: true,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      hasCompletedStatus: true,
      pendingQuestionCount: 0,
      planState: 'completed',
    })).toBeNull();
  });

  test('keeps proposed plans higher priority than stale completion', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      hasCompletedStatus: true,
      pendingQuestionCount: 0,
      planState: 'proposed',
    })).toEqual({
      className: 'bg-status-warning',
      labelKey: 'sessions.sidebar.session.status.planReady',
    });
  });
});

describe('resolveLeadingIndicatorPositionClasses', () => {
  test('aligns status indicators with the child-row indicator slot even without children', () => {
    expect(resolveLeadingIndicatorPositionClasses({
      hasChildren: false,
      showLeadingStatus: true,
      isPinnedSession: false,
    })).toBe('left-[-24px] w-3.5');
  });

  test('keeps the combined pinned and status slot aligned with child rows', () => {
    expect(resolveLeadingIndicatorPositionClasses({
      hasChildren: false,
      showLeadingStatus: true,
      isPinnedSession: true,
    })).toBe('left-[-34px] w-6');
  });
});
