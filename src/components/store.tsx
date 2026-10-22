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
export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  modifierOptionIds: string[];
  modifierNames: string[];
  specialInstructions: string;
};
type Store = {
  cart: CartLine[];
  add: (item: CartLine) => void;
  quantity: (key: string, n: number) => void;
  clear: () => void;
  user: any;
  refreshUser: () => Promise<void>;
  toast: (text: string) => void;
  locale: 'so' | 'en';
  toggleLocale: () => void;
  tr: (so: string, en: string) => string;
};
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]),
    [ready, setReady] = useState(false),
    [user, setUser] = useState<any>(null),
    [message, setMessage] = useState(''),
    [locale, setLocale] = useState<'so' | 'en'>('so');
  const refreshUser = useCallback(async () => {
    try {
      const result = await api('auth/me');
      setUser(result.user);
    } catch {
      setUser(null);
    }
  }, []);
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem('botan-cart') || '[]'));
      setLocale(localStorage.getItem('botan-locale') === 'en' ? 'en' : 'so');
    } catch {}
    setReady(true);
    void refreshUser();
  }, [refreshUser]);
  useEffect(() => {
    if (ready) localStorage.setItem('botan-cart', JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4200);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const add = (item: CartLine) => {
    setCart((old) => {
      const existing = old.find((i) => i.key === item.key);
      return existing
        ? old.map((i) =>
            i.key === item.key ? { ...i, quantity: Math.min(30, i.quantity + item.quantity) } : i,
          )
        : [...old, item];
    });
    setMessage(`${item.name} · ${locale === 'so' ? 'Waa lagu daray' : 'Added to your bag'}`);
  };
  return (
    <Context.Provider
      value={{
        cart,
        add,
        quantity: (key, n) =>
          setCart((old) =>
            old
              .map((i) => (i.key === key ? { ...i, quantity: Math.min(30, n) } : i))
              .filter((i) => i.quantity > 0),
          ),
        clear: () => setCart([]),
        user,
        refreshUser,
        toast: setMessage,
        locale,
        toggleLocale: () =>
          setLocale((old) => {
            const next = old === 'so' ? 'en' : 'so';
            localStorage.setItem('botan-locale', next);
            return next;
          }),
        tr: (so, en) => (locale === 'so' ? so : en),
      }}
    >
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
