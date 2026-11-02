'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch('/api/v1/' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export function useData<T = any>(path: string | null, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!!path);
  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api(path);
      setData(result);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    setError('');
    setLoading(!!path);
    void refresh();
    if (interval) {
      const timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, interval);
      return () => clearInterval(timer);
    }
  }, [refresh, interval, path]);
  return { data, error, loading, refresh };
}
type Store = {
  user: any;
  /** False until the first session check has finished. */
  ready: boolean;
  refreshUser: () => Promise<void>;
  toast: (text: string) => void;
};
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState('');
  const refreshUser = useCallback(async () => {
    try {
      const result = await api('auth/me');
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4200);
      return () => clearTimeout(timer);
    }
  }, [message]);
  return (
    <Context.Provider value={{ user, ready, refreshUser, toast: setMessage }}>
      {children}
      {message && (
        <div role="status" className="toast">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
