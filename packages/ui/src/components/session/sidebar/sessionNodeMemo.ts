import type { SessionNode } from './types';

export const hasTreeExpansionStateChange = (
  prevNode: SessionNode,
  nextNode: SessionNode,
  prevExpandedParents: Set<string>,
  nextExpandedParents: Set<string>,
): boolean => {
  if (prevExpandedParents.has(prevNode.session.id) !== nextExpandedParents.has(prevNode.session.id)) {
    return true;
  }

  const childCount = Math.max(prevNode.children.length, nextNode.children.length);
  for (let index = 0; index < childCount; index += 1) {
    const prevChild = prevNode.children[index];
    const nextChild = nextNode.children[index];
    if (!prevChild || !nextChild) {
      return true;
    }
    if (hasTreeExpansionStateChange(prevChild, nextChild, prevExpandedParents, nextExpandedParents)) {
      return true;
    }
  }

  return false;
};
