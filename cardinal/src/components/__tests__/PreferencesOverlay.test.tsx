import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreferencesOverlay } from '../PreferencesOverlay';
import { DEFAULT_TERMINAL_APP } from '../../utils/terminalApp';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../ThemeSwitcher', () => ({
  __esModule: true,
  default: () => <div data-testid="theme-switcher" />,
}));

vi.mock('../LanguageSwitcher', () => ({
  __esModule: true,
  default: () => <div data-testid="language-switcher" />,
}));

const baseProps = {
  terminalApp: DEFAULT_TERMINAL_APP,
  onTerminalAppChange: vi.fn(),
  open: true,
  onClose: vi.fn(),
  sortThreshold: 200,
  defaultSortThreshold: 100,
  onSortThresholdChange: vi.fn(),
  trayIconEnabled: false,
  onTrayIconEnabledChange: vi.fn(),
  watchRoot: '/old/root',
  defaultWatchRoot: '/default/root',
  ignorePaths: ['/ignore/a', '/ignore/b'],
  defaultIgnorePaths: ['/default/ignore'],
  includePaths: ['/include/a'],
  defaultIncludePaths: [] as string[],
  onReset: vi.fn(),
  themeResetToken: 0,
  onWatchConfigChange: vi.fn(),
};

describe('PreferencesOverlay', () => {
  it('stages the terminal application until Save and resets it to Terminal', () => {
    const onTerminalAppChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onTerminalAppChange={onTerminalAppChange} />);
    const input = screen.getByLabelText('preferences.terminalApp.label');
    expect(input).toHaveValue(DEFAULT_TERMINAL_APP);
    fireEvent.change(input, { target: { value: '/Applications/iTerm.app' } });
    expect(onTerminalAppChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('preferences.save'));
    expect(onTerminalAppChange).toHaveBeenLastCalledWith('/Applications/iTerm.app');
    fireEvent.click(screen.getByText('preferences.reset'));
    expect(input).toHaveValue(DEFAULT_TERMINAL_APP);
    fireEvent.click(screen.getByText('preferences.save'));
    expect(onTerminalAppChange).toHaveBeenLastCalledWith(DEFAULT_TERMINAL_APP);
  });

  it('blocks invalid terminal paths and treats a blank field as the default', () => {
    const onTerminalAppChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onTerminalAppChange={onTerminalAppChange} />);
    const input = screen.getByLabelText('preferences.terminalApp.label');
    for (const value of ['iTerm.app', '/Applications/iTerm', '/Applications/bad\0.app']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByText('preferences.save')).toBeDisabled();
      expect(screen.getByText('preferences.terminalApp.error')).toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.click(screen.getByText('preferences.save'));
    expect(onTerminalAppChange).toHaveBeenCalledWith(DEFAULT_TERMINAL_APP);
  });

  it('discards unsaved terminal edits when reopened', () => {
    const { rerender } = render(<PreferencesOverlay {...baseProps} />);
    fireEvent.change(screen.getByLabelText('preferences.terminalApp.label'), {
      target: { value: '/Applications/iTerm.app' },
    });
    rerender(<PreferencesOverlay {...baseProps} open={false} />);
    rerender(<PreferencesOverlay {...baseProps} />);
    expect(screen.getByLabelText('preferences.terminalApp.label')).toHaveValue(
      DEFAULT_TERMINAL_APP,
    );
  });
  it('saves watch root updates via onWatchConfigChange', () => {
    const onWatchConfigChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onWatchConfigChange={onWatchConfigChange} />);

    const watchRootInput = screen.getByLabelText('watchRoot.label');
    fireEvent.change(watchRootInput, { target: { value: '/new/root' } });

    fireEvent.click(screen.getByText('preferences.save'));

    expect(onWatchConfigChange).toHaveBeenCalledWith({
      watchRoot: '/new/root',
      ignorePaths: baseProps.ignorePaths,
      includePaths: baseProps.includePaths,
    });
  });

  it('saves ignore path updates via onWatchConfigChange', () => {
    const onWatchConfigChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onWatchConfigChange={onWatchConfigChange} />);

    const ignorePathsInput = screen.getByLabelText('ignorePaths.label');
    fireEvent.change(ignorePathsInput, { target: { value: '/tmp/one\n/tmp/two' } });

    fireEvent.click(screen.getByText('preferences.save'));

    expect(onWatchConfigChange).toHaveBeenCalledWith({
      watchRoot: baseProps.watchRoot,
      ignorePaths: ['/tmp/one', '/tmp/two'],
      includePaths: baseProps.includePaths,
    });
  });

  it('saves include path updates via onWatchConfigChange', () => {
    const onWatchConfigChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onWatchConfigChange={onWatchConfigChange} />);

    const includePathsInput = screen.getByLabelText('includePaths.label');
    fireEvent.change(includePathsInput, {
      target: { value: '/Volumes/media\n/Volumes/work' },
    });

    fireEvent.click(screen.getByText('preferences.save'));

    expect(onWatchConfigChange).toHaveBeenCalledWith({
      watchRoot: baseProps.watchRoot,
      ignorePaths: baseProps.ignorePaths,
      includePaths: ['/Volumes/media', '/Volumes/work'],
    });
  });

  it('blocks save when an include path is not absolute', () => {
    const onWatchConfigChange = vi.fn();
    render(<PreferencesOverlay {...baseProps} onWatchConfigChange={onWatchConfigChange} />);

    const includePathsInput = screen.getByLabelText('includePaths.label');
    fireEvent.change(includePathsInput, { target: { value: 'relative/path' } });

    const saveButton = screen.getByText('preferences.save') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(onWatchConfigChange).not.toHaveBeenCalled();
  });

  it('resets inputs to defaults before invoking onReset', () => {
    const onReset = vi.fn();
    const onWatchConfigChange = vi.fn();
    const onSortThresholdChange = vi.fn();
    render(
      <PreferencesOverlay
        {...baseProps}
        onReset={onReset}
        onWatchConfigChange={onWatchConfigChange}
        onSortThresholdChange={onSortThresholdChange}
      />,
    );

    fireEvent.click(screen.getByText('preferences.reset'));

    expect(screen.getByLabelText('preferences.sortingLimit.label')).toHaveValue(
      String(baseProps.defaultSortThreshold),
    );
    expect(screen.getByLabelText('watchRoot.label')).toHaveValue(baseProps.defaultWatchRoot);
    expect(screen.getByLabelText('ignorePaths.label')).toHaveValue(
      baseProps.defaultIgnorePaths.join('\n'),
    );
    expect(screen.getByLabelText('includePaths.label')).toHaveValue(
      baseProps.defaultIncludePaths.join('\n'),
    );
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSortThresholdChange).not.toHaveBeenCalled();
    expect(onWatchConfigChange).not.toHaveBeenCalled();
  });

  it('applies staged reset values when saved', () => {
    const onWatchConfigChange = vi.fn();
    const onSortThresholdChange = vi.fn();
    render(
      <PreferencesOverlay
        {...baseProps}
        onWatchConfigChange={onWatchConfigChange}
        onSortThresholdChange={onSortThresholdChange}
      />,
    );

    fireEvent.click(screen.getByText('preferences.reset'));
    fireEvent.click(screen.getByText('preferences.save'));

    expect(onSortThresholdChange).toHaveBeenCalledWith(baseProps.defaultSortThreshold);
    expect(onWatchConfigChange).toHaveBeenCalledWith({
      watchRoot: baseProps.defaultWatchRoot,
      ignorePaths: baseProps.defaultIgnorePaths,
      includePaths: baseProps.defaultIncludePaths,
    });
  });

  it('closes preferences on Escape while editing a field', () => {
    const onClose = vi.fn();
    render(<PreferencesOverlay {...baseProps} onClose={onClose} />);

    const includePathsInput = screen.getByLabelText('includePaths.label');
    fireEvent.change(includePathsInput, { target: { value: '/tmp/changed' } });
    fireEvent.keyDown(includePathsInput, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
