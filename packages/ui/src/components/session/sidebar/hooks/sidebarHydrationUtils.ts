export const isSessionNotFoundHydrationError = (error: unknown): boolean => {
  const value = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  } | null;

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (value.name === 'NotFoundError') {
    return true;
  }

  if (value.status === 404 || value.response?.status === 404) {
    return true;
  }

  return typeof value.message === 'string' && /session not found/i.test(value.message);
};
