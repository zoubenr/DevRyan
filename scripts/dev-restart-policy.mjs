/** @param {{ shuttingDown: boolean }} options */
export function shouldRestartDevChild({ shuttingDown }) {
  return !shuttingDown;
}
