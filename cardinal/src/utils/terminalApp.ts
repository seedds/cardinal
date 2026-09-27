export const DEFAULT_TERMINAL_APP = '/System/Applications/Utilities/Terminal.app';

export const normalizeTerminalApp = (value: string): string => value.trim() || DEFAULT_TERMINAL_APP;

export const isTerminalAppValid = (value: string): boolean => {
  const path = normalizeTerminalApp(value);
  return path.startsWith('/') && path.endsWith('.app') && !path.includes('\0');
};
