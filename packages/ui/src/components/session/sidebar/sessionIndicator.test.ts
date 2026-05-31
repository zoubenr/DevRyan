import { describe, expect, test } from 'bun:test';
import { resolveLeadingIndicatorPositionClasses, resolveSidebarIndicator, resolveSubtaskSidebarIndicator } from './sessionIndicator';

describe('resolveSidebarIndicator', () => {
  test('shows a success indicator for completed plans without unread notifications', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      hasCompletedStatus: false,
      hasErrorStatus: false,
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
      hasErrorStatus: false,
      pendingQuestionCount: 0,
      planState: null,
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.completed',
    });
  });

  test('does not show completion from unread notifications without a settled completion indicator', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      hasCompletedStatus: false,
      hasErrorStatus: false,
      pendingQuestionCount: 0,
      planState: null,
    })).toBeNull();
  });

  test('hides completion when read-state cleanup has cleared completion inputs', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      hasCompletedStatus: false,
      hasErrorStatus: false,
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
      hasErrorStatus: true,
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
      hasErrorStatus: false,
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
      hasErrorStatus: false,
      pendingQuestionCount: 0,
      planState: 'proposed',
    })).toEqual({
      className: 'bg-status-warning',
      labelKey: 'sessions.sidebar.session.status.planReady',
    });
  });

  test('keeps unseen errors higher priority than plan and completion indicators', () => {
    expect(resolveSidebarIndicator({
      isRootSession: true,
      isWorking: false,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      hasCompletedStatus: true,
      hasErrorStatus: true,
      pendingQuestionCount: 0,
      planState: 'proposed',
    })).toEqual({
      className: 'bg-status-error',
      labelKey: 'sessions.sidebar.session.status.error',
    });
  });
});

describe('resolveSubtaskSidebarIndicator', () => {
  test('does not show a blue info dot for generic unread subtask updates', () => {
    expect(resolveSubtaskSidebarIndicator({
      isRootSession: false,
      notifyOnSubtasks: true,
      isWorking: false,
      isActive: false,
      hasUnreadCompletion: false,
      hasUnreadError: false,
    })).toBeNull();
  });

  test('shows red for unread subtask errors and green for unread subtask completion', () => {
    expect(resolveSubtaskSidebarIndicator({
      isRootSession: false,
      notifyOnSubtasks: true,
      isWorking: false,
      isActive: false,
      hasUnreadCompletion: true,
      hasUnreadError: true,
    })).toEqual({
      className: 'bg-status-error',
      labelKey: 'sessions.sidebar.session.status.error',
    });

    expect(resolveSubtaskSidebarIndicator({
      isRootSession: false,
      notifyOnSubtasks: true,
      isWorking: false,
      isActive: false,
      hasUnreadCompletion: true,
      hasUnreadError: false,
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.completed',
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
