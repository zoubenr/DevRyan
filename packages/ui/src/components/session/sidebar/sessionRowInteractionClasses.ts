type SessionRowInteractionClasses = {
  revealOnHoverClass: string;
  hideOnHoverClass: string;
  revealPaddingClass: string;
};

export function resolveSessionRowInteractionClasses(): SessionRowInteractionClasses {
  return {
    revealOnHoverClass: 'group-hover:opacity-100 group-hover:pointer-events-auto',
    hideOnHoverClass: 'group-hover:opacity-0',
    revealPaddingClass: 'group-hover:pr-9',
  };
}
