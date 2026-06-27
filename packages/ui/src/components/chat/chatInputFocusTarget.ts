export const getEditableComposerTargetKey = (
  currentSessionId: string | null | undefined,
  currentDraftId: string | null | undefined,
  newSessionDraftOpen: boolean,
): string | null => {
  if (currentSessionId) {
    return `session:${currentSessionId}`
  }

  if (currentDraftId && newSessionDraftOpen) {
    return `draft:${currentDraftId}`
  }

  return null
}
