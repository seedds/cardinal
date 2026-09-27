import { act, render, within } from '@testing-library/react';
import type { CSSProperties } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { subscribeIconUpdate } from '../../runtime/tauriEventRuntime';
import type { SlabIndex } from '../../types/slab';
import type { SearchResultItem } from '../../types/search';
import { VirtualList } from '../VirtualList';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../runtime/tauriEventRuntime', () => ({ subscribeIconUpdate: vi.fn(() => vi.fn()) }));

afterEach(() => vi.restoreAllMocks());

it('keeps the displayed thumbnail through repeated result refreshes and delayed row loading', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
  const row = 11 as SlabIndex;
  const node = { path: '/tmp/file', metadata: null, icon: null };
  let finishRows: ((value: (typeof node)[]) => void) | undefined;
  let delayRows = false;
  vi.mocked(invoke).mockImplementation((command) => {
    if (command !== 'get_nodes_info') return Promise.resolve(null);
    if (delayRows)
      return new Promise((resolve) => {
        finishRows = resolve;
      });
    return Promise.resolve([node]);
  });
  const renderRow = (index: number, item: SearchResultItem | undefined, style: CSSProperties) => (
    <div key={index} style={style}>
      <img alt="file icon" src={item?.icon ?? 'placeholder'} />
      {item?.path}
    </div>
  );
  const list = (version: number) => (
    <VirtualList
      results={[row]}
      dataResultsVersion={version}
      displayedResultsVersion={version}
      rowHeight={20}
      overscan={0}
      renderRow={renderRow}
      onScrollSync={() => {}}
    />
  );
  const { rerender, container } = render(list(1));
  await act(async () => {});
  const calls = vi.mocked(subscribeIconUpdate).mock.calls;
  const emit = calls[calls.length - 1][0];
  const icon = {
    slabIndex: row,
    path: node.path,
    metadata: null,
    requestId: 1,
    thumbnail: true,
    icon: 'thumbnail',
  };
  act(() => emit([icon]));
  const expectThumbnail = () => {
    const visibleLayer =
      container.querySelector('.virtual-list-overlay') ??
      container.querySelector('.virtual-list-items')!;
    for (const image of within(visibleLayer as HTMLElement).getAllByAltText('file icon'))
      expect(image).toHaveAttribute('src', 'thumbnail');
  };
  expectThumbnail();
  delayRows = true;
  for (let version = 2; version <= 4; version++) {
    rerender(list(version));
    expectThumbnail();
    act(() => emit([{ ...icon, requestId: version, thumbnail: false, icon: 'ordinary' }]));
    expectThumbnail();
    await act(async () => finishRows!([node]));
    expectThumbnail();
  }
});
