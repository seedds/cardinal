import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useFileActions() {
  const busy = useRef(false);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (command: string, args: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await invoke(command, args);
      setRenamePath(null);
    } catch (err) {
      setError(String(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const trash = (paths: string[]) => {
    if (paths.length) void run('trash_files', { paths: [...new Set(paths)] });
  };
  const rename = (paths: string[]) => {
    if (paths.length !== 1 || busy.current) return;
    setName(paths[0].split('/').pop() ?? '');
    setError(null);
    setRenamePath(paths[0]);
  };
  const openTerminal = (path: string, terminalApp: string) => {
    void run('open_in_terminal', { path, terminalApp });
  };
  const dialog =
    renamePath || error ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={renamePath ? 'Rename' : 'File operation failed'}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: '#0008',
          display: 'grid',
          placeItems: 'center',
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !pending) {
            setRenamePath(null);
            setError(null);
          }
        }}
      >
        <form
          style={{
            background: 'Canvas',
            color: 'CanvasText',
            padding: 24,
            borderRadius: 12,
            minWidth: 320,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (renamePath) void run('rename_file', { path: renamePath, name });
          }}
        >
          <h3>{renamePath ? 'Rename' : 'File operation failed'}</h3>
          {renamePath && (
            <input
              aria-label="New filename"
              autoFocus
              value={name}
              disabled={pending}
              ref={(input) => {
                if (input && document.activeElement !== input) {
                  input.focus();
                  const dot = name.lastIndexOf('.');
                  input.setSelectionRange(0, dot > 0 ? dot : name.length);
                }
              }}
              onChange={(event) => setName(event.target.value)}
            />
          )}
          {error && <p role="alert">{error}</p>}
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setRenamePath(null);
                setError(null);
              }}
            >
              Cancel
            </button>
            {renamePath && (
              <button type="submit" disabled={pending || !name}>
                Rename
              </button>
            )}
          </div>
        </form>
      </div>
    ) : null;
  return { trash, rename, openTerminal, dialog };
}
