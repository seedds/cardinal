import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { SlabIndex } from '../../types/slab';
import { DIRECTORY_SCOPE_OPEN_STORAGE_KEY, useFileSearch } from '../useFileSearch';
import { SearchStatusCode } from '../../types/ipc';
import { subscribeIndexChanged } from '../../runtime/tauriEventRuntime';

vi.mock('../../runtime/tauriEventRuntime', () => ({ subscribeIndexChanged: vi.fn(() => vi.fn()) }));
const indexChanged = () => {
  const calls = vi.mocked(subscribeIndexChanged).mock.calls;
  calls[calls.length - 1][0]();
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const searchResponse = (results: SlabIndex[] = []) => ({
  results,
  highlights: [],
  statusCode: SearchStatusCode.OK,
});

const mockSearchSuccess = (results: SlabIndex[] = []) => {
  mockedInvoke.mockImplementation((command: string) => {
    if (command === 'get_app_status') {
      return Promise.resolve('Ready');
    }
    if (command === 'search') {
      return Promise.resolve(searchResponse(results));
    }
    return Promise.resolve(null);
  });
};

const mockSearchCancelled = () => {
  mockedInvoke.mockImplementation((command: string) => {
    if (command === 'get_app_status') {
      return Promise.resolve('Ready');
    }
    if (command === 'search') {
      return Promise.resolve({
        results: [],
        highlights: [],
        statusCode: SearchStatusCode.CANCELLED,
      });
    }
    return Promise.resolve(null);
  });
};

const renderReadySearchHook = async () => {
  const rendered = renderHook(() => useFileSearch());
  await waitFor(() => expect(rendered.result.current.state.initialFetchCompleted).toBe(true));
  return rendered;
};

describe('useFileSearch', () => {
  it('does not restart an identical in-flight search when Enter is pressed again', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    let finish!: (value: ReturnType<typeof searchResponse>) => void;
    mockedInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockedInvoke.mockClear();
    act(() => result.current.queueSearch('needle', { immediate: true }));
    const committed = vi.fn();
    act(() =>
      result.current.queueSearch('needle', { immediate: true, onSearchCommitted: committed }),
    );
    expect(committed).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    await act(async () => finish(searchResponse([1] as SlabIndex[])));
    expect(result.current.state.currentQuery).toBe('needle');
  });

  it('updates event counts without searching when the index has not changed', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    mockedInvoke.mockClear();
    await act(async () => result.current.handleStatusUpdate(100, 1, 0));
    expect(result.current.state.processedEvents).toBe(1);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('Enter flushes the typing debounce immediately without a later duplicate', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    mockedInvoke.mockClear();
    vi.useFakeTimers();
    try {
      act(() => result.current.queueSearch('pending'));
      expect(mockedInvoke).not.toHaveBeenCalled();
      await act(async () => result.current.queueSearch('pending', { immediate: true }));
      expect(mockedInvoke).toHaveBeenCalledOnce();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mockedInvoke).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('supersedes an in-flight search when the query or active folder scope changes', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    const finishes: ((value: ReturnType<typeof searchResponse>) => void)[] = [];
    mockedInvoke.mockImplementation(() => new Promise((resolve) => finishes.push(resolve)));
    mockedInvoke.mockClear();
    act(() => result.current.queueSearch('first', { immediate: true }));
    act(() => result.current.queueSearch('second', { immediate: true }));
    act(() => result.current.queueDirectorySearch('Projects', { immediate: true }));
    expect(mockedInvoke).toHaveBeenCalledTimes(2); // Inactive scope doesn't change the request.
    act(() => result.current.queueDirectoryScopeOpen(true));
    expect(mockedInvoke).toHaveBeenCalledTimes(3);
    await act(async () => finishes[2](searchResponse([3] as SlabIndex[])));
    await act(async () => {
      finishes[0](searchResponse([1] as SlabIndex[]));
      finishes[1](searchResponse([2] as SlabIndex[]));
    });
    expect(result.current.state.results).toEqual([3]);
    expect(result.current.state.currentDirectoryQuery).toBe('Projects');
  });
  beforeEach(() => {
    window.localStorage.setItem(DIRECTORY_SCOPE_OPEN_STORAGE_KEY, 'false');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reuses backend results array without copying', async () => {
    const backendResults = [1, 2, 3] as SlabIndex[];
    mockSearchSuccess(backendResults);
    const { result } = await renderReadySearchHook();

    expect(result.current.state.results).toBe(backendResults);
    expect(result.current.state.resultCount).toBe(backendResults.length);
  });

  it('keeps results visible and coalesces events during a slow background refresh', async () => {
    mockSearchSuccess([1] as SlabIndex[]);
    const { result } = await renderReadySearchHook();
    vi.useFakeTimers();
    try {
      let finish!: (value: ReturnType<typeof searchResponse>) => void;
      mockedInvoke.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      mockedInvoke.mockClear();
      const selectionVersion = result.current.state.selectionVersion;
      act(indexChanged);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(result.current.state.results).toEqual([1]);
      expect(result.current.state.showLoadingUI).toBe(false);
      act(indexChanged);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(mockedInvoke).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish(searchResponse([2] as SlabIndex[]));
      });
      expect(result.current.state.results).toEqual([2]);
      expect(result.current.state.selectionVersion).toBe(selectionVersion);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves time for row loading and event processing under continuous filesystem activity', async () => {
    mockSearchSuccess([1] as SlabIndex[]);
    const { result } = await renderReadySearchHook();
    vi.useFakeTimers();
    mockedInvoke.mockClear();
    try {
      for (let events = 1; events <= 10; events++) {
        await act(async () => {
          result.current.handleStatusUpdate(100, events, 0);
          indexChanged();
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(90);
        });
      }
      expect(mockedInvoke.mock.calls.filter(([command]) => command === 'search')).toHaveLength(1);
      expect(result.current.state.processedEvents).toBe(10);
      expect(result.current.state.showLoadingUI).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mockedInvoke.mock.calls.filter(([command]) => command === 'search')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports skipped cloud files and clears the count on the next complete search', async () => {
    mockedInvoke.mockImplementation((command: string) =>
      Promise.resolve(
        command === 'get_app_status' ? 'Ready' : { ...searchResponse(), skippedCloudFiles: 3 },
      ),
    );
    const { result } = await renderReadySearchHook();
    expect(result.current.state.skippedCloudFiles).toBe(3);
    mockSearchSuccess();
    act(() => result.current.queueSearch('local', { immediate: true }));
    await waitFor(() => expect(result.current.state.currentQuery).toBe('local'));
    expect(result.current.state.skippedCloudFiles).toBe(0);
  });

  it('ignores results when backend returns CANCELLED status', async () => {
    const initialResults = [1, 2, 3] as SlabIndex[];
    mockSearchSuccess(initialResults);
    const { result } = await renderReadySearchHook();
    expect(result.current.state.results).toBe(initialResults);

    mockSearchCancelled();

    act(() => {
      result.current.queueSearch('new query', { immediate: true });
    });

    // Cancelled results should not overwrite state, and loading should settle.
    await waitFor(() => {
      expect(result.current.state.results).toBe(initialResults);
      expect(result.current.state.currentQuery).toBe(''); // Query doesn't update on cancelled search
      expect(result.current.state.showLoadingUI).toBe(false);
      expect(result.current.state.initialFetchCompleted).toBe(true);
    });
  });

  it('does not send directory scope while the scope input is inactive', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    mockedInvoke.mockClear();

    act(() => {
      result.current.queueDirectorySearch('Projects', { immediate: true });
    });

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('search', {
        query: null,
        directoryQuery: null,
        options: {
          caseInsensitive: true,
        },
      });
    });
  });

  it('re-runs search when directory scope is toggled and controls the directory payload', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();

    act(() => {
      result.current.queueDirectorySearch('Projects', { immediate: true });
    });
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: null,
        directoryQuery: null,
        options: {
          caseInsensitive: true,
        },
      });
    });

    mockedInvoke.mockClear();
    act(() => {
      result.current.queueDirectoryScopeOpen(true);
    });
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: null,
        directoryQuery: 'Projects',
        options: {
          caseInsensitive: true,
        },
      });
      expect(result.current.state.currentDirectoryQuery).toBe('Projects');
      expect(window.localStorage.getItem(DIRECTORY_SCOPE_OPEN_STORAGE_KEY)).toBe('true');
    });

    mockedInvoke.mockClear();
    act(() => {
      result.current.queueDirectoryScopeOpen(false);
    });
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: null,
        directoryQuery: null,
        options: {
          caseInsensitive: true,
        },
      });
      expect(result.current.state.currentDirectoryQuery).toBe('');
      expect(window.localStorage.getItem(DIRECTORY_SCOPE_OPEN_STORAGE_KEY)).toBe('false');
    });
  });

  it('hydrates persisted directory scope open state', async () => {
    window.localStorage.setItem(DIRECTORY_SCOPE_OPEN_STORAGE_KEY, 'true');
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();

    expect(result.current.searchParams.directoryScopeOpen).toBe(true);

    act(() => {
      result.current.queueDirectorySearch('Projects', { immediate: true });
    });

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: null,
        directoryQuery: 'Projects',
        options: {
          caseInsensitive: true,
        },
      });
    });
  });

  it('passes whitespace directory scope through when the scope is active', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();

    act(() => {
      result.current.queueDirectorySearch('   ', { immediate: true });
    });
    act(() => {
      result.current.queueDirectoryScopeOpen(true);
    });

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: null,
        directoryQuery: '   ',
        options: {
          caseInsensitive: true,
        },
      });
      expect(result.current.state.currentDirectoryQuery).toBe('   ');
    });
  });

  it('passes whitespace query through to search', async () => {
    mockSearchSuccess();
    const { result } = await renderReadySearchHook();
    mockedInvoke.mockClear();

    act(() => {
      result.current.queueSearch('   ', { immediate: true });
    });

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenLastCalledWith('search', {
        query: '   ',
        directoryQuery: null,
        options: {
          caseInsensitive: true,
        },
      });
      expect(result.current.state.currentQuery).toBe('   ');
    });
  });
});
