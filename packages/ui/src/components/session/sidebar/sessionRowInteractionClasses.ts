type SessionRowInteractionClassOptions = {
  isMinimalMode: boolean;
  showQuickArchiveAction: boolean;
};

type SessionRowInteractionClasses = {
  revealOnHoverClass: string;
  hideOnHoverClass: string;
  revealPaddingClass: string;
};

export function resolveSessionRowInteractionClasses({
  isMinimalMode,
  showQuickArchiveAction,
}: SessionRowInteractionClassOptions): SessionRowInteractionClasses {
  const revealOnHoverClass = 'group-hover:opacity-100 group-hover:pointer-events-auto';
  const hideOnHoverClass = 'group-hover:opacity-0';

  if (isMinimalMode) {
    return {
      revealOnHoverClass,
      hideOnHoverClass,
      revealPaddingClass: 'group-hover:pr-2',
    };
  }

  const revealPaddingClass = showQuickArchiveAction
    ? 'group-hover:pr-7'
    : 'group-hover:pr-5';

  return {
    revealOnHoverClass,
    hideOnHoverClass,
    revealPaddingClass,
  };
}
