import { act, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import type { CSSProperties, ChangeEvent, FocusEventHandler, KeyboardEvent, Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { invoke } from '@tauri-apps/api/core';

const indexEvents = vi.hoisted(() => ({ changed: () => {} }));
vi.mock('../runtime/tauriEventRuntime', () => ({
  subscribeIndexChanged: (listener: () => void) => {
    indexEvents.changed = listener;
    return () => {};
  },
}));

const mocks = vi.hoisted(() => ({
  filesTabContentProps: vi.fn(),
  navigateSearchHistory: vi.fn(),
  selectSingleRow: vi.fn(),
  realSearch: false,
  statusUpdate: null as null | ((files: number, events: number, errors: number) => void),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en-US',
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock('../components/SearchBar', () => ({
  SearchBar: ({
    inputRef,
    value,
    onChange,
    onKeyDown,
    onFocus,
    onBlur,
  }: {
    inputRef: Ref<HTMLInputElement>;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onFocus: FocusEventHandler<HTMLInputElement>;
    onBlur: FocusEventHandler<HTMLInputElement>;
  }) => (
    <input
      data-testid="search-input"
      ref={inputRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  ),
}));

vi.mock('../components/FileRow', () => ({
  FileRow: () => <div data-testid="file-row" />,
}));

vi.mock('../components/FilesTabContent', () => ({
  FilesTabContent: ({
    currentDirectoryQuery,
    currentQuery,
    renderRow,
  }: {
    currentDirectoryQuery: string;
    currentQuery: string;
    renderRow: (
      rowIndex: number,
      item: { path: string } | undefined,
      rowStyle: CSSProperties,
    ) => React.ReactNode;
  }) => {
    mocks.filesTabContentProps({ currentDirectoryQuery, currentQuery });
    return (
      <div data-testid="files-tab-content">
        {renderRow(0, { path: '/first-result' }, {} as CSSProperties)}
      </div>
    );
  },
}));

vi.mock('../components/PermissionOverlay', () => ({
  PermissionOverlay: () => null,
}));

vi.mock('../components/PreferencesOverlay', () => ({
  default: () => null,
}));

vi.mock('../components/StatusBar', () => ({
  default: () => null,
}));

vi.mock('../components/FSEventsPanel', () => ({
  default: forwardRef(function MockFSEventsPanel(_props, _ref) {
    return null;
  }),
}));

vi.mock('../hooks/useFileSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useFileSearch')>();
  return {
    useFileSearch: () => {
      if (mocks.realSearch) {
        const search = actual.useFileSearch();
        mocks.statusUpdate = search.handleStatusUpdate;
        return search;
      }
      return {
        state: {
          results: [101, 202],
          resultsVersion: 1,
          scannedFiles: 0,
          processedEvents: 0,
          rescanErrors: 0,
          currentQuery: 'needle',
          currentDirectoryQuery: 'Work/Docs',
          highlightTerms: [],
          showLoadingUI: false,
          initialFetchCompleted: true,
          durationMs: 0,
          resultCount: 2,
          searchError: null,
          lifecycleState: 'Ready',
        },
        searchParams: {
          query: 'needle',
          directoryQuery: 'Work/Docs',
          directoryScopeOpen: true,
          caseSensitive: false,
        },
        updateSearchParams: vi.fn(),
        queueSearch: vi.fn(),
        queueDirectorySearch: vi.fn(),
        queueDirectoryScopeOpen: vi.fn(),
        handleStatusUpdate: vi.fn(),
        setLifecycleState: vi.fn(),
        requestRescan: vi.fn(),
      };
    },
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) =>
    command === 'get_app_status'
      ? 'Ready'
      : {
          results: [],
          highlights: [],
          statusCode: 0,
        },
  ),
}));

vi.mock('../hooks/useColumnResize', () => ({
  useColumnResize: () => ({
    colWidths: {
      filename: 200,
      path: 300,
      size: 100,
      modified: 120,
      created: 120,
    },
    onResizeStart: vi.fn(() => vi.fn()),
    autoFitColumns: vi.fn(),
  }),
}));

vi.mock('../hooks/useEventColumnWidths', () => ({
  useEventColumnWidths: () => ({
    eventColWidths: {
      time: 120,
      event: 180,
      name: 180,
      path: 260,
    },
    onEventResizeStart: vi.fn(),
    autoFitEventColumns: vi.fn(),
  }),
}));

vi.mock('../hooks/useRecentFSEvents', () => ({
  useRecentFSEvents: () => ({
    filteredEvents: [],
  }),
}));

vi.mock('../hooks/useRemoteSort', () => ({
  DEFAULT_SORTABLE_RESULT_THRESHOLD: 20000,
  useRemoteSort: () => ({
    sortState: null,
    displayedResults: [101, 202],
    displayedResultsVersion: 1,
    sortThreshold: 20000,
    setSortThreshold: vi.fn(),
    canSort: true,
    isSorting: false,
    sortDisabledTooltip: null,
    sortButtonsDisabled: false,
    handleSortToggle: vi.fn(),
  }),
}));

vi.mock('../hooks/useSelection', () => ({
  useSelection: () => ({
    selectedIndices: [],
    selectedIndicesRef: { current: [] },
    activeRowIndex: null,
    selectedPaths: [],
    handleRowSelect: vi.fn(),
    selectSingleRow: mocks.selectSingleRow,
    clearSelection: vi.fn(),
    moveSelection: vi.fn(),
  }),
}));

vi.mock('../hooks/useQuickLook', () => ({
  useQuickLook: () => ({
    toggleQuickLook: vi.fn(),
    updateQuickLook: vi.fn(),
    closeQuickLook: vi.fn(),
  }),
}));

vi.mock('../hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    handleInputChange: vi.fn(),
    navigate: mocks.navigateSearchHistory,
    ensureTailValue: vi.fn(),
    resetCursorToTail: vi.fn(),
  }),
}));

vi.mock('../hooks/useFullDiskAccessPermission', () => ({
  useFullDiskAccessPermission: () => ({
    status: 'granted',
    isChecking: false,
    requestPermission: vi.fn(),
  }),
}));

vi.mock('../hooks/useAppPreferences', () => ({
  useAppPreferences: () => ({
    isPreferencesOpen: false,
    closePreferences: vi.fn(),
    trayIconEnabled: false,
    setTrayIconEnabled: vi.fn(),
    watchRoot: '/',
    defaultWatchRoot: '/',
    ignorePaths: ['/Volumes'],
    defaultIgnorePaths: ['/Volumes'],
    preferencesResetToken: 0,
    handleWatchConfigChange: vi.fn(),
    handleResetPreferences: vi.fn(),
  }),
}));

vi.mock('../hooks/useAppWindowListeners', () => ({
  useAppWindowListeners: () => ({ isWindowFocused: true }),
}));

vi.mock('../hooks/useAppHotkeys', () => ({
  useAppHotkeys: () => undefined,
}));

vi.mock('../hooks/useContextMenu', () => ({
  useContextMenu: () => ({
    showContextMenu: vi.fn(),
    showHeaderContextMenu: vi.fn(),
  }),
}));

vi.mock('../hooks/useStableEvent', () => ({
  useStableEvent: <T extends (...args: any[]) => any>(handler: T): T => handler,
}));

describe('App search result keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realSearch = false;
    mocks.navigateSearchHistory.mockReturnValue(null);
  });

  it('preserves typing and clearing when filesystem updates arrive', async () => {
    mocks.realSearch = true;
    render(<App />);
    await act(async () => {});
    const input = screen.getByTestId('search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new query' } });
    await act(async () => {
      mocks.statusUpdate?.(100, 1, 0);
      indexEvents.changed();
    });
    expect(input.value).toBe('new query');
    fireEvent.change(input, { target: { value: 'new quer' } });
    await act(async () => {
      mocks.statusUpdate?.(100, 2, 0);
      indexEvents.changed();
    });
    expect(input.value).toBe('new quer');
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      mocks.statusUpdate?.(100, 3, 0);
      indexEvents.changed();
    });
    expect(input.value).toBe('');
  });

  it('passes main query and folder scope separately to the files tab content', () => {
    render(<App />);

    expect(mocks.filesTabContentProps).toHaveBeenLastCalledWith({
      currentDirectoryQuery: 'Work/Docs',
      currentQuery: 'needle',
    });
  });

  it('submits pending typing on Enter and reuses that request on a repeated Enter', async () => {
    mocks.realSearch = true;
    render(<App />);
    await act(async () => {});
    const input = screen.getByTestId('search-input');
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(invoke).mockClear();
    fireEvent.change(input, { target: { value: 'needle' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => finish({ results: [], highlights: [], statusCode: 0 }));
    expect(mocks.filesTabContentProps).toHaveBeenLastCalledWith({
      currentQuery: 'needle',
      currentDirectoryQuery: '',
    });
  });

  it('selects the first result and blurs the search input when ArrowDown reaches the history tail', () => {
    render(<App />);

    const input = screen.getByTestId('search-input');
    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);

    act(() => {
      fireEvent.keyDown(input, {
        key: 'ArrowDown',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      });
    });

    expect(mocks.navigateSearchHistory).toHaveBeenCalledWith('newer');
    expect(mocks.selectSingleRow).toHaveBeenCalledWith(0);
    expect(document.activeElement).not.toBe(input);
  });
});
