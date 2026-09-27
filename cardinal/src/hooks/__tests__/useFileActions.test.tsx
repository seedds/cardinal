import { act, renderHook, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useFileActions } from '../useFileActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

it('deduplicates trash targets and prevents concurrent submissions', async () => {
  let finish!: () => void;
  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useFileActions());
  act(() => {
    result.current.trash(['/a', '/a']);
    result.current.trash(['/b']);
  });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('trash_files', { paths: ['/a'] });
  await act(async () => finish());
});

it('does not offer batch rename', () => {
  const { result } = renderHook(() => useFileActions());
  act(() => result.current.rename(['/a', '/b']));
  expect(result.current.dialog).toBeNull();
});

it('passes the terminal preference to the backend and displays launch errors', async () => {
  vi.mocked(invoke).mockRejectedValueOnce('Terminal application was not found');
  const { result } = renderHook(() => useFileActions());
  await act(async () => result.current.openTerminal('/tmp/a', '/Applications/iTerm.app'));
  expect(invoke).toHaveBeenLastCalledWith('open_in_terminal', {
    path: '/tmp/a',
    terminalApp: '/Applications/iTerm.app',
  });
  render(result.current.dialog);
  expect(screen.getByRole('alert')).toHaveTextContent('Terminal application was not found');
});
