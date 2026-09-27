import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { subscribeIconUpdate } from '../../runtime/tauriEventRuntime';
import type { SlabIndex } from '../../types/slab';
import { useDataLoader } from '../useDataLoader';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../runtime/tauriEventRuntime', () => ({
  subscribeIconUpdate: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedSubscribeIconUpdate = vi.mocked(subscribeIconUpdate);
type HookProps = { results: SlabIndex[]; version: number };

const buildNodeInfo = (slabIndex: SlabIndex) => ({
  path: `/tmp/file-${slabIndex}`,
  icon: null,
  metadata: null,
  size: null,
  mtime: null,
  ctime: null,
});
type BuiltNodeInfo = ReturnType<typeof buildNodeInfo>;

const renderDataLoader = (initialProps: HookProps) =>
  renderHook(({ results, version }: HookProps) => useDataLoader(results, version), {
    initialProps,
  });

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('useDataLoader', () => {
  it('retains a thumbnail across refreshes and does not downgrade it to an ordinary icon', async () => {
    const row = 11 as SlabIndex;
    const { result, rerender } = renderDataLoader({ results: [row], version: 1 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    const calls = mockedSubscribeIconUpdate.mock.calls;
    const emitIcons = calls[calls.length - 1][0];
    const update = {
      slabIndex: row,
      path: '/tmp/file-11',
      metadata: null,
      requestId: 1,
      thumbnail: true,
      icon: 'thumbnail',
    };
    act(() => emitIcons([update]));
    rerender({ results: [row], version: 2 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    expect(result.current.cache.get(row)?.icon).toBe('thumbnail');
    act(() => emitIcons([{ ...update, requestId: 2, thumbnail: false, icon: 'ordinary' }]));
    expect(result.current.cache.get(row)?.icon).toBe('thumbnail');
    act(() => emitIcons([{ ...update, requestId: 3, icon: 'new-thumbnail' }]));
    act(() => emitIcons([{ ...update, requestId: 1, icon: 'late-thumbnail' }]));
    expect(result.current.cache.get(row)?.icon).toBe('new-thumbnail');
  });

  it('rejects icons for a reused slab slot or changed file metadata', async () => {
    const row = 11 as SlabIndex;
    const { result, rerender } = renderDataLoader({ results: [row], version: 1 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    const calls = mockedSubscribeIconUpdate.mock.calls;
    const emitIcons = calls[calls.length - 1][0];
    const update = {
      slabIndex: row,
      path: '/tmp/file-11',
      metadata: null,
      requestId: 1,
      thumbnail: true,
      icon: 'old-thumbnail',
    };
    act(() => emitIcons([update]));
    mockedInvoke.mockResolvedValue([{ ...buildNodeInfo(row), path: '/tmp/replacement' }]);
    rerender({ results: [row], version: 2 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    act(() => emitIcons([update]));
    expect(result.current.cache.get(row)?.icon).toBeUndefined();
    mockedInvoke.mockResolvedValue([
      { ...buildNodeInfo(row), metadata: { type: 1, size: 10, mtime: 20, ctime: 30 } },
    ]);
    rerender({ results: [row], version: 3 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    act(() => emitIcons([update]));
    expect(result.current.cache.get(row)?.icon).toBeUndefined();
  });
  it('requests row text without waiting for icon extraction', async () => {
    const { result } = renderDataLoader({ results: [1] as SlabIndex[], version: 1 });
    await act(async () => result.current.ensureRangeLoaded(0, 0));
    expect(mockedInvoke).toHaveBeenCalledWith('get_nodes_info', {
      results: [1],
      includeIcons: false,
    });
    expect(result.current.cache.get(1 as SlabIndex)?.path).toBe('/tmp/file-1');
  });
  const iconUpdateUnlisten = vi.fn();

  beforeEach(() => {
    mockedSubscribeIconUpdate.mockImplementation(() => iconUpdateUnlisten);
    mockedInvoke.mockImplementation((command: string, payload?: unknown) => {
      if (command !== 'get_nodes_info') {
        return Promise.resolve(null);
      }

      const slabIndices = (payload as { results: SlabIndex[] }).results;
      return Promise.resolve(slabIndices.map((slabIndex) => buildNodeInfo(slabIndex)));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not clear cache when only results reference changes', async () => {
    const slab11 = 11 as SlabIndex;
    const slab22 = 22 as SlabIndex;
    const first = [slab11, slab22];
    const { result, rerender } = renderDataLoader({ results: first, version: 1 });

    await act(async () => {
      await result.current.ensureRangeLoaded(0, 1);
    });

    await waitFor(() => {
      expect(result.current.cache.get(slab11)?.path).toBe('/tmp/file-11');
      expect(result.current.cache.get(slab22)?.path).toBe('/tmp/file-22');
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    rerender({ results: [...first], version: 1 });

    await act(async () => {
      await result.current.ensureRangeLoaded(0, 1);
    });

    expect(result.current.cache.get(slab11)?.path).toBe('/tmp/file-11');
    expect(result.current.cache.get(slab22)?.path).toBe('/tmp/file-22');
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it('resets cache when results version changes', async () => {
    const first = [33 as SlabIndex, 44 as SlabIndex];
    const { result, rerender } = renderDataLoader({ results: first, version: 1 });

    await act(async () => {
      await result.current.ensureRangeLoaded(0, 1);
    });

    await waitFor(() => expect(result.current.cache.size).toBe(2));
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    rerender({ results: first, version: 2 });

    await waitFor(() => expect(result.current.cache.size).toBe(0));

    await act(async () => {
      await result.current.ensureRangeLoaded(0, 1);
    });

    await waitFor(() => expect(result.current.cache.size).toBe(2));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it('ignores stale node info responses after the results version changes', async () => {
    const slab11 = 11 as SlabIndex;
    const slab22 = 22 as SlabIndex;
    const deferred = createDeferred<BuiltNodeInfo[]>();
    let getNodesInfoCalls = 0;

    mockedInvoke.mockImplementation((command: string, payload?: unknown) => {
      if (command !== 'get_nodes_info') {
        return Promise.resolve(null);
      }

      getNodesInfoCalls += 1;
      const slabIndices = (payload as { results: SlabIndex[] }).results;
      if (getNodesInfoCalls === 1) {
        return deferred.promise;
      }
      return Promise.resolve(slabIndices.map((slabIndex) => buildNodeInfo(slabIndex)));
    });

    const { result, rerender } = renderDataLoader({ results: [slab11], version: 1 });

    act(() => {
      void result.current.ensureRangeLoaded(0, 0);
    });

    rerender({ results: [slab22], version: 2 });

    await act(async () => {
      await result.current.ensureRangeLoaded(0, 0);
    });

    await waitFor(() => {
      expect(result.current.cache.get(slab22)?.path).toBe('/tmp/file-22');
    });

    await act(async () => {
      deferred.resolve([buildNodeInfo(slab11)]);
      await deferred.promise;
    });

    expect(result.current.cache.get(slab11)).toBeUndefined();
    expect(result.current.cache.get(slab22)?.path).toBe('/tmp/file-22');
  });

  it('cleans up icon update subscription on unmount', async () => {
    const { unmount } = renderDataLoader({ results: [11 as SlabIndex], version: 1 });
    unmount();

    expect(iconUpdateUnlisten).toHaveBeenCalled();
  });

  it.each([true, false])(
    'merges deferred icons when they arrive before row text: %s',
    async (iconFirst) => {
      const row = 11 as SlabIndex;
      const deferred = createDeferred<BuiltNodeInfo[]>();
      mockedInvoke.mockReturnValue(deferred.promise);
      const { result } = renderDataLoader({ results: [row], version: 1 });
      const calls = mockedSubscribeIconUpdate.mock.calls;
      const emitIcons = calls[calls.length - 1][0];
      act(() => {
        void result.current.ensureRangeLoaded(0, 0);
      });
      const icon = {
        slabIndex: row,
        path: '/tmp/file-11',
        metadata: null,
        requestId: 1,
        thumbnail: false,
        icon: 'icon-data',
      };
      if (iconFirst) act(() => emitIcons([icon]));
      await act(async () => deferred.resolve([buildNodeInfo(row)]));
      expect(result.current.cache.get(row)?.path).toBe('/tmp/file-11');
      if (!iconFirst) {
        expect(result.current.cache.get(row)?.icon).toBeUndefined();
        act(() => emitIcons([icon]));
      }
      expect(result.current.cache.get(row)?.icon).toBe('icon-data');
    },
  );
});
