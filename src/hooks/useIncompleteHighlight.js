import { useCallback, useEffect, useState } from 'react';

export const INCOMPLETE_HIGHLIGHT_STORAGE_KEY = 'northgate:developer:highlight-incomplete';
export const DEVELOPMENT_HIGHLIGHT_STORAGE_KEY = 'northgate:developer:highlight-development';
export const DEVELOPMENT_HIDE_STORAGE_KEY = 'northgate:developer:hide-development';
export const UI_TERMINOLOGY_STORAGE_KEY = 'northgate:developer:show-ui-terminology';
export const UNDEFINED_UI_STORAGE_KEY = 'northgate:developer:highlight-undefined-ui';
const INCOMPLETE_HIGHLIGHT_EVENT = 'northgate:highlight-incomplete-change';
const DEVELOPMENT_DISPLAY_EVENT = 'northgate:development-display-change';

function readBooleanPreference(key) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === 'true';
}

export function setIncompleteHighlightPreference(enabled) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INCOMPLETE_HIGHLIGHT_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(INCOMPLETE_HIGHLIGHT_EVENT, { detail: { enabled } }));
}

export function useIncompleteHighlightPreference() {
  const [enabled, setEnabledState] = useState(() => readBooleanPreference(INCOMPLETE_HIGHLIGHT_STORAGE_KEY));

  useEffect(() => {
    function handleChange(event) {
      if (event?.detail && typeof event.detail.enabled === 'boolean') {
        setEnabledState(event.detail.enabled);
      } else {
        setEnabledState(readBooleanPreference(INCOMPLETE_HIGHLIGHT_STORAGE_KEY));
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

function readDevelopmentPreferences() {
  return {
    highlightDevelopment: readBooleanPreference(DEVELOPMENT_HIGHLIGHT_STORAGE_KEY),
    hideDevelopment: readBooleanPreference(DEVELOPMENT_HIDE_STORAGE_KEY),
    showUiTerminology: readBooleanPreference(UI_TERMINOLOGY_STORAGE_KEY),
    highlightUndefinedUi: readBooleanPreference(UNDEFINED_UI_STORAGE_KEY),
  };
}

export function setDevelopmentDisplayPreference(key, enabled) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(DEVELOPMENT_DISPLAY_EVENT, { detail: readDevelopmentPreferences() }));
}

export function useDevelopmentDisplayPreferences() {
  const [preferences, setPreferences] = useState(readDevelopmentPreferences);

  useEffect(() => {
    function handleChange(event) {
      if (event?.detail) {
        setPreferences({
          highlightDevelopment: Boolean(event.detail.highlightDevelopment),
          hideDevelopment: Boolean(event.detail.hideDevelopment),
          showUiTerminology: Boolean(event.detail.showUiTerminology),
          highlightUndefinedUi: Boolean(event.detail.highlightUndefinedUi),
        });
      } else {
        setPreferences(readDevelopmentPreferences());
      }
    }

    window.addEventListener(DEVELOPMENT_DISPLAY_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(DEVELOPMENT_DISPLAY_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  const setHighlightDevelopment = useCallback((enabled) => {
    setDevelopmentDisplayPreference(DEVELOPMENT_HIGHLIGHT_STORAGE_KEY, enabled);
    setPreferences(readDevelopmentPreferences());
  }, []);

  const setHideDevelopment = useCallback((enabled) => {
    setDevelopmentDisplayPreference(DEVELOPMENT_HIDE_STORAGE_KEY, enabled);
    setPreferences(readDevelopmentPreferences());
  }, []);

  const setShowUiTerminology = useCallback((enabled) => {
    setDevelopmentDisplayPreference(UI_TERMINOLOGY_STORAGE_KEY, enabled);
    setPreferences(readDevelopmentPreferences());
  }, []);

  const setHighlightUndefinedUi = useCallback((enabled) => {
    setDevelopmentDisplayPreference(UNDEFINED_UI_STORAGE_KEY, enabled);
    setPreferences(readDevelopmentPreferences());
  }, []);

  return {
    ...preferences,
    setHighlightDevelopment,
    setHideDevelopment,
    setShowUiTerminology,
    setHighlightUndefinedUi,
  };
}
