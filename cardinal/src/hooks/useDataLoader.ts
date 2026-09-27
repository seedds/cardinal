import { useCallback, useRef, useEffect, useLayoutEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { subscribeIconUpdate } from '../runtime/tauriEventRuntime';
import type { NodeInfoResponse, SearchResultItem } from '../types/search';
import type { SlabIndex } from '../types/slab';
import type { IconUpdatePayload } from '../types/ipc';

export type DataLoaderCache = Map<SlabIndex, SearchResultItem>;
type CachedIcon = { icon: string; thumbnail: boolean; requestId: number };
const ICON_CACHE_LIMIT = 512;
const iconKey = (item: Pick<SearchResultItem, 'path' | 'metadata'>): string => {
  const metadata = item.metadata;
  return JSON.stringify([
    item.path,
    metadata?.type,
    metadata?.size,
    metadata?.mtime,
    metadata?.ctime,
  ]);
};

const fromNodeInfo = (node: NodeInfoResponse): SearchResultItem => ({
  path: node.path,
  metadata: node.metadata ?? undefined,
  size: node.size ?? node.metadata?.size,
  mtime: node.mtime ?? node.metadata?.mtime,
  ctime: node.ctime ?? node.metadata?.ctime,
  icon: node.icon ?? undefined,
});

// Data-only loader for visible rows. It owns row metadata caching and stale-request rejection;
// VirtualList handles any temporary frozen-view rendering during result-set swaps.
export function useDataLoader(results: SlabIndex[], dataResultsVersion: number) {
  const loadingRef = useRef<Set<SlabIndex>>(new Set());
  // Monotonic epoch for range-load requests. A new search result-set bumps this value so
  // late `get_nodes_info` responses from the previous result-set can be ignored safely.
  const versionRef = useRef(0);
  const cacheRef = useRef<DataLoaderCache>(new Map());
  // File identity survives search refreshes; slab slots can be reused for other files.
  const iconsRef = useRef(new Map<string, CachedIcon>());
  const [cache, setCache] = useState<DataLoaderCache>(() => {
    const initial = new Map<SlabIndex, SearchResultItem>();
    cacheRef.current = initial;
    return initial;
  });
  const resultsRef = useRef<SlabIndex[]>([]);
  resultsRef.current = results;

  // Reset cache state whenever the backing result-set changes so slab-index reuse in the
  // backend cannot surface stale row data for a newer search result-set.
  useLayoutEffect(() => {
    versionRef.current += 1;
    loadingRef.current.clear();
    const nextCache = new Map<SlabIndex, SearchResultItem>();
    cacheRef.current = nextCache;
    setCache(nextCache);
  }, [dataResultsVersion]);

  useEffect(() => {
    const unlistenIconUpdate = subscribeIconUpdate((updates: readonly IconUpdatePayload[]) => {
      if (updates.length === 0) {
        return;
      }

      setCache((prev) => {
        let nextCache: DataLoaderCache | null = null;

        updates.forEach((update) => {
          const slabIndex = update.slabIndex;
          const key = iconKey({ path: update.path, metadata: update.metadata ?? undefined });
          const cached = iconsRef.current.get(key);
          if (cached && update.requestId < cached.requestId) return;
          // A refresh's ordinary icon must not replace an existing thumbnail.
          const next =
            cached?.thumbnail && !update.thumbnail
              ? { ...cached, requestId: update.requestId }
              : { icon: update.icon, thumbnail: update.thumbnail, requestId: update.requestId };
          iconsRef.current.delete(key);
          iconsRef.current.set(key, next);
          if (iconsRef.current.size > ICON_CACHE_LIMIT) {
            iconsRef.current.delete(iconsRef.current.keys().next().value!);
          }

          const current = prev.get(slabIndex);
          if (!current || iconKey(current) !== key || current.icon === next.icon) {
            return;
          }

          if (nextCache === null) {
            nextCache = new Map(prev);
          }

          nextCache.set(slabIndex, { ...current, icon: next.icon });
        });

        if (nextCache === null) {
          return prev;
        }

        cacheRef.current = nextCache;
        return nextCache;
      });
    });
    return unlistenIconUpdate;
  }, []);

  const releaseLoadingBatch = useCallback((slabIndices: readonly SlabIndex[]) => {
    slabIndices.forEach((slabIndex) => loadingRef.current.delete(slabIndex));
  }, []);

  const ensureRangeLoaded = useCallback(
    async (start: number, end: number) => {
      const list = resultsRef.current;
      const total = list.length;
      if (start < 0 || end < start || total === 0) return;
      const needLoading: SlabIndex[] = [];
      for (let i = start; i <= end && i < total; i++) {
        const slabIndex = list[i];
        // Request only cache misses in the active window.
        if (!cacheRef.current.has(slabIndex) && !loadingRef.current.has(slabIndex)) {
          needLoading.push(slabIndex);
          loadingRef.current.add(slabIndex);
        }
      }
      if (needLoading.length === 0) return;
      const versionAtRequest = versionRef.current;
      const fetched = await invoke<NodeInfoResponse[]>('get_nodes_info', {
        results: needLoading,
        includeIcons: false,
      });
      if (versionRef.current !== versionAtRequest) {
        // The result-set changed while this request was in flight. Drop the payload instead of
        // merging stale rows into the cache for the new query.
        releaseLoadingBatch(needLoading);
        return;
      }
      setCache((prev) => {
        if (versionRef.current !== versionAtRequest) return prev;
        let nextCache: DataLoaderCache | null = null;

        needLoading.forEach((slabIndex, idx) => {
          const fetchedItem = fetched[idx];
          loadingRef.current.delete(slabIndex);
          if (!fetchedItem) {
            return;
          }

          const normalizedItem = fromNodeInfo(fetchedItem);
          // Reattach before publishing fresh rows, so the frozen viewport transitions
          // directly to rows with their existing icons rather than blank placeholders.
          const preferredIcon =
            iconsRef.current.get(iconKey(normalizedItem))?.icon ?? normalizedItem.icon;

          const mergedItem =
            preferredIcon === normalizedItem.icon
              ? normalizedItem
              : { ...normalizedItem, icon: preferredIcon };

          if (nextCache === null) {
            nextCache = new Map(prev);
          }

          nextCache.set(slabIndex, mergedItem);
        });

        if (nextCache === null) {
          return prev;
        }

        cacheRef.current = nextCache;
        return nextCache;
      });
    },
    [releaseLoadingBatch],
  );

  return { cache, ensureRangeLoaded };
}
