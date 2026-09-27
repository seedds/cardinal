import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { VirtualListHandle } from '../components/VirtualList';
import type { SlabIndex } from '../types/slab';

type RowSelectOptions = {
  isShift: boolean;
  isMeta: boolean;
  isCtrl: boolean;
};

export type SelectionController = {
  selectedIndices: number[];
  selectedIndicesRef: MutableRefObject<number[]>;
  activeRowIndex: number | null;
  shiftAnchorIndex: number | null;
  selectedPaths: string[];
  handleRowSelect: (rowIndex: number, options: RowSelectOptions) => void;
  selectSingleRow: (rowIndex: number) => void;
  clearSelection: () => void;
  moveSelection: (delta: 1 | -1, options?: { extend?: boolean }) => void;
};

/**
 * Manages virtualized row selection. Keeps indexes/anchors in sync with the rendered list,
 * exposes helpers for shift/meta selection, and remaps selections when the backing data changes.
 * The hook also tracks the concrete paths backing the selection so consumers can interact with
 * context menus, Quick Look, etc. without reimplementing bookkeeping.
 * `selectionVersion` bumps for a new search; background refreshes remap by slab identity.
 */
export const useSelection = (
  displayedResults: SlabIndex[],
  selectionVersion: number,
  virtualListRef: RefObject<VirtualListHandle | null>,
): SelectionController => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [shiftAnchorIndex, setShiftAnchorIndex] = useState<number | null>(null);
  const selectedIndicesRef = useRef<number[]>([]);
  const previousResultsRef = useRef(displayedResults);
  const previousSelectionVersionRef = useRef(selectionVersion);
  const selectedPathCacheRef = useRef(new Map<SlabIndex, string>());

  const handleRowSelect = useCallback(
    (rowIndex: number, options: RowSelectOptions) => {
      const { isShift, isMeta, isCtrl } = options;
      const isCmdOrCtrl = isMeta || isCtrl;

      if (isShift && shiftAnchorIndex !== null) {
        const start = Math.min(shiftAnchorIndex, rowIndex);
        const end = Math.max(shiftAnchorIndex, rowIndex);
        const range: number[] = [];
        for (let i = start; i <= end; i += 1) {
          range.push(i);
        }
        setSelectedIndices(range);
      } else if (isCmdOrCtrl) {
        setSelectedIndices((prevIndices) => {
          const isDeselecting = prevIndices.includes(rowIndex);
          const nextIndices = isDeselecting
            ? prevIndices.filter((index) => index !== rowIndex)
            : [...prevIndices, rowIndex];

          // Handle shift anchor updates
          if (isDeselecting) {
            // If deselecting, find the next closest selected item below it as the new anchor
            let newAnchor: number | null = null;
            for (let i = rowIndex + 1; i < displayedResults.length; i += 1) {
              if (nextIndices.includes(i)) {
                newAnchor = i;
                break;
              }
            }
            // If nothing below, look upward
            if (newAnchor === null) {
              for (let i = rowIndex - 1; i >= 0; i -= 1) {
                if (nextIndices.includes(i)) {
                  newAnchor = i;
                  break;
                }
              }
            }
            setShiftAnchorIndex(newAnchor);
          } else if (!isDeselecting) {
            // Only update anchor when adding (not removing) an item
            setShiftAnchorIndex(rowIndex);
          }
          // If deselecting a non-anchor item, keep the anchor unchanged

          return nextIndices;
        });
      } else {
        setSelectedIndices([rowIndex]);
        setShiftAnchorIndex(rowIndex);
      }

      setActiveRowIndex(rowIndex);
    },
    [shiftAnchorIndex, displayedResults.length],
  );

  const selectSingleRow = useCallback((rowIndex: number) => {
    setSelectedIndices([rowIndex]);
    setActiveRowIndex(rowIndex);
    setShiftAnchorIndex(rowIndex);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIndices((prev) => (prev.length === 0 ? prev : []));
    setActiveRowIndex((prev) => (prev === null ? prev : null));
    setShiftAnchorIndex((prev) => (prev === null ? prev : null));
  }, []);

  const moveSelection = useCallback(
    (delta: 1 | -1, options?: { extend?: boolean }) => {
      if (displayedResults.length === 0) {
        return;
      }

      const fallbackIndex = delta > 0 ? -1 : displayedResults.length;
      const baseIndex = activeRowIndex ?? fallbackIndex;
      const nextIndex = Math.min(Math.max(baseIndex + delta, 0), displayedResults.length - 1);

      if (nextIndex === activeRowIndex) {
        return;
      }

      const item = virtualListRef.current?.getItem(nextIndex);
      if (!item) {
        return;
      }

      handleRowSelect(nextIndex, {
        isShift: options?.extend ?? false,
        isMeta: false,
        isCtrl: false,
      });
    },
    [activeRowIndex, displayedResults.length, handleRowSelect],
  );

  useEffect(() => {
    selectedIndicesRef.current = selectedIndices;
  }, [selectedIndices]);

  useLayoutEffect(() => {
    const previous = previousResultsRef.current;
    previousResultsRef.current = displayedResults;
    if (previousSelectionVersionRef.current !== selectionVersion) {
      previousSelectionVersionRef.current = selectionVersion;
      clearSelection();
      return;
    }
    if (previous === displayedResults) return;
    const remap = (index: number | null): number | null => {
      if (index === null || previous[index] === undefined) return null;
      const next = displayedResults.indexOf(previous[index]);
      return next === -1 ? null : next;
    };
    const nextSelected = selectedIndices.flatMap((index) => {
      const next = remap(index);
      return next === null ? [] : [next];
    });
    if (
      nextSelected.length !== selectedIndices.length ||
      nextSelected.some((index, i) => index !== selectedIndices[i])
    ) {
      setSelectedIndices(nextSelected);
    }
    setActiveRowIndex(remap(activeRowIndex) ?? nextSelected[0] ?? null);
    setShiftAnchorIndex(remap(shiftAnchorIndex) ?? nextSelected[0] ?? null);
  }, [
    displayedResults,
    selectionVersion,
    clearSelection,
    selectedIndices,
    activeRowIndex,
    shiftAnchorIndex,
  ]);

  const selectedPaths = useMemo(() => {
    const list = virtualListRef.current;
    if (!list) {
      return [];
    }
    const paths: string[] = [];
    const nextPathCache = new Map<SlabIndex, string>();
    selectedIndices.forEach((index) => {
      const slabIndex = previousResultsRef.current[index];
      const item = displayedResults[index] === slabIndex ? list.getItem(index) : undefined;
      const path = item?.path ?? selectedPathCacheRef.current.get(slabIndex);
      if (path) {
        paths.push(path);
        nextPathCache.set(slabIndex, path);
      }
    });
    selectedPathCacheRef.current = nextPathCache;
    return paths;
  }, [selectedIndices, virtualListRef, displayedResults]);

  return {
    selectedIndices,
    selectedIndicesRef,
    activeRowIndex,
    shiftAnchorIndex,
    selectedPaths,
    handleRowSelect,
    selectSingleRow,
    clearSelection,
    moveSelection,
  };
};
