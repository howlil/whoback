import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ExtensionState } from '../domain/types';
import { DEFAULT_STATE, getState, STATE_KEY } from '../lib/state';

export function useExtensionState() {
  const [state, setState] = useState<ExtensionState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setState(await getState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local' || !(STATE_KEY in changes)) return;
      void refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  return { state, loaded, refresh };
}
