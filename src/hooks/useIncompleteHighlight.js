import { useCallback, useEffect, useState } from 'react';

export const INCOMPLETE_HIGHLIGHT_STORAGE_KEY = 'northgate:developer:highlight-incomplete';
const INCOMPLETE_HIGHLIGHT_EVENT = 'northgate:highlight-incomplete-change';

function readPreference() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(INCOMPLETE_HIGHLIGHT_STORAGE_KEY) === 'true';
}

export function setIncompleteHighlightPreference(enabled) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INCOMPLETE_HIGHLIGHT_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(INCOMPLETE_HIGHLIGHT_EVENT, { detail: { enabled } }));
}

export function useIncompleteHighlightPreference() {
  const [enabled, setEnabledState] = useState(readPreference);

  useEffect(() => {
    function handleChange(event) {
      if (event?.detail && typeof event.detail.enabled === 'boolean') {
        setEnabledState(event.detail.enabled);
      } else {
        setEnabledState(readPreference());
      }
    }

    window.addEventListener(INCOMPLETE_HIGHLIGHT_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(INCOMPLETE_HIGHLIGHT_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  const setEnabled = useCallback((next) => {
    setIncompleteHighlightPreference(next);
    setEnabledState(next);
  }, []);

  return [enabled, setEnabled];
}

